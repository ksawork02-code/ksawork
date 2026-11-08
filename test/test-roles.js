// 관리자 권한 세분화: 총괄 / 지역 / 검수 / 조회 (픽스처 사용, Lark 불필요)
// 먼저 node test/fixture.js 로 state-fixture.json 생성
const assert = require('assert'), fs = require('fs');
const { makeEnv } = require('./gas-mock');
const ok = m => console.log('  ✓ ' + m);
const env = makeEnv({ quiet: true }); const G = env.ctx;
G.setup();
JSON.parse(fs.readFileSync(__dirname + '/' + (process.env.STATE || 'state-fixture.json'))).sheets.forEach(([n, d]) => { const sh = env.active.getSheetByName(n) || env.active.insertSheet(n); sh.data = d; });
G.clearDataCache_(); G.setup();
const req = () => { G._cache = {}; };
const throws = (fn, re, m) => { try { fn(); } catch (e) { assert(re.test(e.message), m + ' → ' + e.message); return ok(m + ' (' + e.message + ')'); } assert.fail(m + ' 차단되지 않음'); };

G.setSetting_('ADMIN_EMAILS', 'admin@example.org, busan@example.org, review@example.org, view@example.org');
G.setSetting_('ADMIN_ROLES', '# 이메일, 역할, 지역\nbusan@example.org, 지역, 부산 울산 경상남도\nREVIEW@example.org, 검수\nview@example.org, 조회\nnobody@example.org, 지역, 서울');
const login = email => { req(); env.outbox.length = 0; G.requestOtp(email); const code = env.outbox[0].subject.match(/(\d{6})/)[1]; req(); return G.verifyOtp(email, code).token; };
const AT = login('admin@example.org'), BT = login('busan@example.org'), RT = login('review@example.org'), VT = login('view@example.org');

console.log('1) 역할 판정');
req(); assert.strictEqual(G.me(AT).adminRole, '총괄'); assert.strictEqual(G.me(RT).adminRole, '검수'); assert.strictEqual(G.me(VT).adminRole, '조회');
const bme = G.me(BT); assert.strictEqual(bme.adminRole, '지역'); assert.strictEqual(bme.regions.join(' '), '부산 울산 경남');
ok('ADMIN_ROLES 해석 (대소문자 무시, 지역명 정규화 "경상남도"→경남, 목록에 없으면 총괄)');

console.log('2) 지역 관리자');
req(); const all = G.adminBootstrap(AT), mine = G.adminBootstrap(BT);
const regionOf = a => a['사업장지역'];
assert(mine.apps.length > 0 && mine.apps.length < all.apps.length); assert(mine.apps.every(a => ['부산', '울산', '경남'].includes(regionOf(a))));
const appById = {}; all.apps.forEach(a => { appById[a.ID] = a; });
assert(mine.projects.length > 0 && mine.projects.every(p => ['부산', '울산', '경남'].includes(regionOf(appById[p['신청ID']]))));
ok(`목록: 신청 ${mine.apps.length}/${all.apps.length}, 사업장 ${mine.projects.length}/${all.projects.length} (담당 지역만)`);
const inP = mine.projects[0], outP = all.projects.find(p => !mine.projects.some(x => x.ID === p.ID));
req(); G.adminUpdateProject(BT, inP.ID, { 비고: '지역 수정' }); req(); assert.strictEqual(G.find_('사업장', inP.ID)['비고'], '지역 수정'); ok('담당 지역 사업장 수정');
throws(() => G.adminUpdateProject(BT, outP.ID, { 비고: 'x' }), /담당 지역/, '다른 지역 사업장 수정 차단');
throws(() => G.getProjectDetail(BT, outP.ID), /담당 지역/, '다른 지역 사업장 상세 차단');
throws(() => G.saveVisit(BT, { 사업장ID: outP.ID, 일자: '2026-12-01' }), /담당 지역/, '다른 지역 일정 등록 차단');
throws(() => G.adminSaveSettings(BT, { APP_NAME: 'x' }), /총괄 관리 권한/, '설정 변경 차단');
throws(() => G.adminDeleteProject(BT, inP.ID), /총괄 관리 권한/, '사업장 삭제 차단');
req(); const visits = G.listVisits(BT, '', ''); assert(visits.every(v => mine.projects.some(p => p.ID === v['사업장ID']))); ok('일정 조회도 담당 지역만');
// 첨부 다운로드
const inApp = mine.apps[0], outApp = all.apps.find(a => !mine.apps.some(x => x.ID === a.ID));
const pdf = [{ name: 'd.pdf', mime: '', b64: Buffer.from('%PDF').toString('base64') }];
req(); const fi = G.parseFiles_(G.adminAddFiles(AT, '신청', inApp.ID, '사업자등록증', pdf)['사업자등록증'])[0].id;
req(); const fo = G.parseFiles_(G.adminAddFiles(AT, '신청', outApp.ID, '사업자등록증', pdf)['사업자등록증'])[0].id;
req(); assert(G.downloadFile(BT, fi).b64); throws(() => G.downloadFile(BT, fo), /접근 권한/, '다른 지역 첨부 다운로드 차단');
req(); assert(G.downloadFile(AT, fo).b64); ok('총괄은 모든 첨부 다운로드');

console.log('3) 검수자');
req(); const sub = G.all_('보고서').find(r => r['검수결과'] === '검수 중');
const d = G.adminReviewSubmission(RT, sub.ID, '보완요청', '검수자 의견', null);
assert.strictEqual(d.submissions.find(x => x.ID === sub.ID)['검수결과'], '보완요청'); ok('보고서 검수 가능');
throws(() => G.adminUpdateProject(RT, inP.ID, { 비고: 'x' }), /수정 권한/, '사업장 수정 차단');
throws(() => G.adminSendMail(RT, [{ email: 'a@example.com' }], 's', 'b'), /수정 권한/, '메일 발송 차단');
req(); assert(G.adminBootstrap(RT).projects.length === all.projects.length); ok('목록은 전체 조회');

console.log('4) 조회 전용');
req(); assert(G.adminBootstrap(VT).apps.length === all.apps.length); G.adminMonthlyReport(VT, '2026-11'); ok('목록·실적 조회 가능');
throws(() => G.adminReviewSubmission(VT, sub.ID, '검수완료', '', null), /검수 권한/, '검수 차단');
throws(() => G.adminUpdateApplication(VT, inApp.ID, { 비고: 'x' }), /수정 권한/, '신청 수정 차단');
throws(() => G.saveLog(VT, { 사업장ID: inP.ID, 일자: '2026-11-20', 내용: 'x' }, []), /수정 권한/, '수행일지 작성 차단');
throws(() => G.adminSaveNotice(VT, { 제목: 'x' }, [], false), /총괄 관리 권한/, '공지 게시 차단');

console.log('5) 총괄');
req(); G.adminSaveSettings(AT, { APP_NAME: '총괄 수정' }); req(); assert.strictEqual(G.setting_('APP_NAME'), '총괄 수정');
G.adminUpdateProject(AT, outP.ID, { 비고: '총괄' }); ok('모든 기능 (ADMIN_ROLES에 없으면 총괄 — 기존 동작 유지)');

console.log('\n권한 테스트 통과');
