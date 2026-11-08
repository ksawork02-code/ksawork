// 운영 안정성: 요청 간 캐시, 이력 보관, 로그인 토큰 제한, 메일 한도 계산 (Lark 불필요)
const assert = require('assert');
const { makeEnv } = require('./gas-mock');
const ok = m => console.log('  ✓ ' + m);
const env = makeEnv({ quiet: true }); const G = env.ctx; G.setup();
const req = () => { G._cache = {}; };   // 새 요청 = 실행 단위 캐시 초기화 (CacheService는 유지)
const sh = n => env.active.getSheetByName(n);

console.log('1) 요청 간 캐시');
const a = G.insert_('교육', { 교육명: '캐시 시험', 일시: '2026-11-01' });
req(); G.all_('교육');
assert(Object.keys(env.cache).some(k => k.startsWith('d:교육:')), '캐시 저장');
// 시트를 몰래 바꾸면(버전 변경 없음) 캐시 값이 나온다 = 캐시를 실제로 쓴다
const row = G.find_('교육', a.ID)._row, col = G.headers_('교육').indexOf('교육명');
sh('교육').data[row - 1][col] = '몰래 수정';
req(); assert.strictEqual(G.find_('교육', a.ID)['교육명'], '캐시 시험'); ok('두 번째 요청은 캐시에서 읽음');
// 시트 직접 편집 → onEdit가 무효화
G.onEdit({ range: { getSheet: () => sh('교육') } });
req(); assert.strictEqual(G.find_('교육', a.ID)['교육명'], '몰래 수정'); ok('시트 직접 편집(onEdit) 후 바로 반영');
// 앱 쓰기 → 무효화
G.update_('교육', a.ID, { 교육명: '앱 수정' }, 'tester');
req(); assert.strictEqual(G.find_('교육', a.ID)['교육명'], '앱 수정');
G.insert_('교육', { 교육명: '추가' }); req(); assert(G.all_('교육').some(r => r['교육명'] === '추가'));
G.remove_('교육', a.ID); req(); assert(!G.find_('교육', a.ID)); ok('추가·수정·삭제 후 다음 요청에 반영');
// 락 안(쓰기)에서는 캐시를 쓰지 않음: 몰래 바꾼 값을 update_가 덮어쓰지 않아야 함
const b = G.insert_('교육', { 교육명: 'B', 비고: '원래' }); req(); G.all_('교육');
const rb = G.find_('교육', b.ID)._row; sh('교육').data[rb - 1][G.headers_('교육').indexOf('비고')] = '시트값';
req(); G.update_('교육', b.ID, { 교육명: 'B2' });
assert.strictEqual(sh('교육').data[rb - 1][G.headers_('교육').indexOf('비고')], '시트값'); ok('쓰기는 항상 시트 최신값 기준');
// 큰 시트 조각 저장 + 이모지
const big = []; for (let i = 0; i < 400; i++) big.push({ 교육명: '긴 교육명 '.repeat(20) + i + ' 😀', 비고: '가'.repeat(200) });
G.insertMany_('교육', big); req(); const n1 = G.all_('교육').length; req();
const chunks = Object.keys(env.cache).filter(k => /^d:교육:[^:]+:\d+$/.test(k)).length;
const again = G.all_('교육');
assert(chunks > 1, 'chunks ' + chunks); assert.strictEqual(again.length, n1); assert(again.some(r => /😀$/.test(r['교육명'])));
ok('큰 시트 ' + chunks + '조각 저장·복원 (이모지 보존)');
// 캐시 비우기 메뉴
G.clearDataCache_(); req(); assert.strictEqual(G.all_('교육').length, n1); ok('앱 캐시 비우기');
// 로그성 시트는 요청 간 캐시 제외
req(); G.all_('변경이력'); assert(!Object.keys(env.cache).some(k => k.startsWith('d:변경이력'))); ok('변경이력·메일이력은 캐시 안 함');

console.log('2) 이력 보관');
const lh = sh('변경이력');
const keep = lh.data.slice(1);
const old = [['2026-05-03 10:00:00', 'u', '수정', '사업장', 'P1', 'f', 'a', 'b'], ['2026-05-20 10:00:00', 'u', '수정', '사업장', 'P1', 'f', 'b', 'c'],
  ['2026-07-31 23:59:59', 'u', '수정', '사업장', 'P2', 'f', 'a', 'b'], ['2026-08-31 23:59:59', 'u', '수정', '사업장', 'P3', 'f', 'a', 'b']];
const recent = ['2026-09-01 00:00:00', 'u', '수정', '사업장', 'P9', 'f', 'a', 'b'];
lh.data = [lh.data[0]].concat(old, [recent], keep);
G.setSetting_('LOG_KEEP_MONTHS', '3');
const today = G.today_();
const res = G.archiveLogs_();
if (today.slice(0, 7) === '2026-11') {
  assert.strictEqual(res['변경이력'], 4);
  assert.strictEqual(env.active.getSheetByName('보관_변경이력_2026-05').getLastRow(), 3);
  assert.strictEqual(env.active.getSheetByName('보관_변경이력_2026-08').data[1][4], 'P3');
  assert.strictEqual(lh.data[1][4], 'P9');
  ok('3개월 이전 4행 → 월별 보관 시트(2026-05·07·08), 최근 행 유지');
} else ok('오늘 날짜가 2026-11이 아니라 보관 결과 ' + JSON.stringify(res) + ' (값 검증 생략)');
assert.strictEqual(JSON.stringify(G.archiveLogs_()), '{"변경이력":0,"메일이력":0}'); ok('다시 실행해도 변경 없음');

console.log('3) 로그인 토큰');
const admin = 'ops-admin@example.com';
G.setSetting_('ADMIN_EMAILS', admin); req();
const login = () => { env.outbox.length = 0; G._cache = {}; G.requestOtp(admin); const code = env.outbox[0].subject.match(/(\d{6})/)[1]; return G.verifyOtp(admin, code).token; };
const toks = []; for (let i = 0; i < 7; i++) { toks.push(login()); if (i === 3) Object.keys(env.cache).filter(k => k.startsWith('otpcnt:')).forEach(k => delete env.cache[k]); }
const mine = Object.keys(env.props).filter(k => k.startsWith('S_') && JSON.parse(env.props[k]).email === admin);
assert.strictEqual(mine.length, G.MAX_SESSIONS_PER_USER);
assert.throws(() => G.session_(toks[0]), /SESSION_EXPIRED/); G.session_(toks[6]);
ok('한 사람당 최근 ' + G.MAX_SESSIONS_PER_USER + '개 토큰만 유지, 오래된 기기 로그아웃');
const pu = G.propsUsage_(); assert(pu.sessions >= 5 && pu.bytes > 0); ok('속성 사용량 ' + pu.bytes + 'B, 토큰 ' + pu.sessions + '개');
assert.strictEqual(G.utf8Len_('가a😀'), 3 + 1 + 4);

console.log('4) 메일 한도');
const env2 = makeEnv({ quiet: true, quota: 17 }); const H = env2.ctx; H.setup();
assert.strictEqual(H.recipientCount_('a@x.com, b@x.com;c@x.com', 'd@x.com'), 4);
assert(H.sendMail_('a@x.com', 's', 'b', '알림')); // 17-1=16 ≥ 15
assert(!H.sendMail_('a@x.com, b@x.com, c@x.com', 's', 'b', '알림')); // 17-3=14 < 15 → 보류
const last = env2.active.getSheetByName('메일이력').data.slice(-1)[0];
assert(/보류/.test(last[5]), last[5]); ok('받는 사람 수만큼 한도 계산, 로그인용 15건 예약 (' + last[5] + ')');
assert(H.sendMail_('a@x.com, b@x.com', 's', 'b', '로그인')); ok('로그인 코드는 예약분 사용');
const env3 = makeEnv({ quiet: true, quota: 20 }); const K = env3.ctx; K.setup();
K.setSetting_('ADMIN_EMAILS', admin); K._cache = {};
env3.outbox.length = 0; K.requestOtp(admin); const tk = K.verifyOtp(admin, env3.outbox[0].subject.match(/(\d{6})/)[1]).token;
assert.throws(() => K.adminSendMail(tk, new Array(6).fill(0).map((_, i) => ({ email: i + '@x.com' })), 's', 'b'), /보낼 수 있는 메일은 5건/);
ok('일괄 메일: 예약분을 뺀 한도로 사전 차단');

console.log('\n운영 안정성 테스트 통과');
