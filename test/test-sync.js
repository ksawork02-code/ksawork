const assert = require('assert'), fs = require('fs');
const { makeEnv } = require('./gas-mock');
const env = makeEnv({ quiet: true }); const G = env.ctx;
const secret = process.env.LARK_APP_SECRET;
if (!secret) { console.error('환경변수 LARK_APP_SECRET 이 필요합니다 (Lark 실데이터 이관 테스트).'); process.exit(1); }
const ok = m => console.log('  ✓', m);
const sheet = n => { G._cache = {}; return G.all_(n); };
G.setup(); env.props.LARK_APP_SECRET = secret;

// Lark 응답 캐시 + 변조
const real = G.larkRecords_, cache = {};
G.larkRecords_ = id => { if (!cache[id]) cache[id] = JSON.parse(JSON.stringify(real(id))); return JSON.parse(JSON.stringify(cache[id])); };
const T = G.LARK.T;

console.log('1) 최초 이관 = 첫 동기화');
G.setSetting_('LARK_SYNC', 'Y'); G._cache = {};
G.migrateFromLark();
let loops = 0; while (G.countLarkFiles_(false) > 0 && loops++ < 20) G.migrateFromLark();
assert.strictEqual(sheet('신청').length, 225); assert.strictEqual(sheet('사업장').length, 215);
const consN = sheet('컨설턴트').length, eduN = sheet('교육이수').length;
ok(`신청 225, 사업장 215, 컨설턴트 ${consN}, 교육이수 ${eduN}, 스냅샷 ${sheet('_Lark동기화').length}`);
assert(env.props.LARK_APP_SECRET, '동기화 켜짐 → secret 유지'); ok('동기화 켜져 있어 Secret 유지');
const projLinked = sheet('사업장').filter(p => p['신청ID']).length; assert(projLinked >= 214);

console.log('2) 변경 없음');
let r = G.larkSync_(); assert(/추가: 없음 \/ 수정: 없음/.test(r.summary), r.summary); ok(r.summary);

console.log('3) 변경 반영');
const apps = cache[T.APPLY];
const A0 = apps[0], A1 = apps[1];
const appRow = lid => sheet('신청').find(a => a.LarkID === lid);
// 앱에서만 수정 (유지되어야 함)
G.update_('신청', appRow(A0.record_id).ID, { 지역본부: '앱에서입력', 특이사항: '앱에서 고침' }, 'tester');
// Lark에서 수정
A0.fields['승인여부'] = '반려';
A0.fields['특이사항'] = 'Lark에서 고침';
A1.fields['연락여부'] = '미확인';
// 첨부 추가
const newAtt = { file_token: 'NEWTOKEN1', name: '추가서류.pdf', size: 10, url: 'https://open.larksuite.com/open-apis/drive/v1/medias/NEWTOKEN1/download' };
A0.fields['신청서'] = (A0.fields['신청서'] || []).concat([newAtt]);
// 새 신청 (앱 접수와 사업자번호 중복)
const appSub = G.submitApplication({ 사업장명: '중복테스트(주)', 사업자등록번호: '220-81-62517', 업태: 'a', 종목: 'b', 근로자수: '3', 사업장주소: '서울특별시', 담당부서: 'x', 담당자명: 'y', 담당자직책: 'z', 담당자연락처: '010-1111-2222', 담당자이메일: 'a@b.co' },
  { 신청서: [{ name: 'a.hwpx', mime: '', b64: Buffer.from('PK\x03\x04').toString('base64') }], 사업자등록증: [{ name: 'b.pdf', mime: '', b64: 'AA==' }] });
apps.push({ record_id: 'recNEWAPP1', created_time: Date.now(), fields: { 사업장명: '중복테스트(주) Lark', 사업자등록번호: '2208162517', 업태: 'a', 종목: 'b', 인원: 3, '사업장 주소': '서울특별시', 승인여부: '대기' } });
// 새 사업장 (새 신청 + 기존 컨설턴트 연결)
const cons0 = cache[T.CONS][0];
cache[T.PROJ].push({ record_id: 'recNEWPROJ1', created_time: Date.now(), fields: { 사업장명: '중복테스트(주) Lark', 차수: '11차',
  '사업장 담당자 정보확인': [{ record_ids: ['recNEWAPP1'] }], 컨설턴트: [{ record_ids: [cons0.record_id] }], '컨설팅 착수일': Date.parse('2026-12-01T00:00:00+09:00') } });
// 기존 사업장 컨설턴트 변경
const P0 = cache[T.PROJ][0]; const cons1 = cache[T.CONS][1];
P0.fields['컨설턴트'] = [{ record_ids: [cons1.record_id] }]; P0.fields['중간보고서 검수 현황'] = '검수완료';
// 컨설턴트 이름 변경 + 교육 시간 변경
cons1.fields['비고'] = 'Lark 비고 변경';
const g0 = cache[T.GUIDE].find(g => g.fields['4.29 보고서 작성 교육']);
g0.fields['4.29 보고서 작성 교육'] = '5시간'; g0.fields['개인별 안내'] = '새 안내문';

G._cache = {};
const msg = G.syncFromLark();
console.log('  결과:', msg);
const a0 = appRow(A0.record_id);
assert.strictEqual(a0['승인여부'], '반려'); ok('Lark 변경 반영 (승인여부 → 반려)');
assert.strictEqual(a0['특이사항'], 'Lark에서 고침'); ok('양쪽 수정 → Lark 우선 (특이사항)');
assert.strictEqual(a0['지역본부'], '앱에서입력'); ok('앱에서만 고친 값 유지 (지역본부)');
assert(G.historyOf_(a0.ID).some(h => h['사용자'] === 'Lark동기화' && h['이전값'] === '앱에서 고침')); ok('덮어쓴 이전 값은 변경이력에 기록');
const files = G.parseFiles_(a0['신청서']);
assert(files.some(f => f.token === 'NEWTOKEN1' && !f.lark) || files.some(f => f.token === 'NEWTOKEN1'));
assert(files.filter(f => !f.lark).length >= 1); ok(`첨부 병합: ${files.length}개 (새 파일 ${files.find(f => f.token === 'NEWTOKEN1').lark ? '대기' : '저장됨'})`);
const na = appRow('recNEWAPP1');
assert(na && /중복의심/.test(na['비고'])); ok('새 Lark 신청 추가 + 앱 접수와 중복의심 표시: ' + na['비고'].replace(/\n/g, ' '));
const np = sheet('사업장').find(p => p.LarkID === 'recNEWPROJ1');
assert.strictEqual(np['신청ID'], na.ID); assert(np['컨설턴트ID']); assert.strictEqual(appRow('recNEWAPP1')['사업장ID'], np.ID);
assert(sheet('차수일정').some(s => s['차수'] === '11차')); ok('새 사업장 추가·신청/컨설턴트 연결·새 차수 11차 일정 생성');
const p0 = sheet('사업장').find(p => p.LarkID === P0.record_id);
const c1 = sheet('컨설턴트').find(c => c.LarkID === cons1.record_id);
assert.strictEqual(p0['컨설턴트ID'], c1.ID); assert.strictEqual(p0['컨설턴트명'], c1['성명']); assert.strictEqual(p0['중간검수'], '검수완료');
ok('사업장 컨설턴트 변경 (이름 동기화) + 검수 상태');
assert.strictEqual(c1['비고'], 'Lark 비고 변경'); ok('컨설턴트 정보 변경');
const gc = sheet('컨설턴트').find(c => c['성명'] === g0.fields['성함']);
assert.strictEqual(gc['개인별안내'], '새 안내문');
const t = sheet('교육').find(x => x['비고'] === '4.29 보고서 작성 교육');
assert.strictEqual(sheet('교육이수').find(e => e['컨설턴트ID'] === gc.ID && e['교육ID'] === t.ID)['이수시간'], '5'); ok('개인별안내·교육 시간 변경 반영');
assert.strictEqual(sheet('교육이수').length, eduN); ok('교육이수 중복 없음');

console.log('4) 재실행 멱등 + 켜기/끄기');
r = G.larkSync_(); assert(/추가: 없음 \/ 수정: 없음/.test(r.summary), r.summary); ok('다시 실행해도 변경 없음');
G.enableLarkSync(15); assert(env.triggers.some(x => x.fn === 'syncFromLark')); ok('켜기 → 15분 트리거');
env.props.LARK_BUSY = String(Date.now()); assert.strictEqual(G.syncFromLark(), '다른 Lark 작업 진행 중'); delete env.props.LARK_BUSY; ok('동시 실행 방지');
G.disableLarkSync(); assert(!env.triggers.some(x => x.fn === 'syncFromLark')); assert(!env.props.LARK_APP_SECRET); ok('끄기 → 트리거·Secret 삭제');
assert.strictEqual(G.syncFromLark(), '꺼짐');
console.log('\n동기화 테스트 통과');
