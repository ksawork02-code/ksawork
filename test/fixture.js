// Lark 없이 쓰는 고정 픽스처: 가상의 사업장·컨설턴트 데이터 (개인정보 없음, 시드 고정)
// 사용: node test/fixture.js  → test/state-fixture.json
//       STATE=state-fixture.json STATE_OUT=state2-fixture.json node test/test-features.js
const fs = require('fs');
const { makeEnv } = require('./gas-mock');
const OUT = process.env.FIXTURE_OUT || 'state-fixture.json';

let seed = 20261108;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = a => a[Math.floor(rnd() * a.length)];
const pad = (n, w) => String(n).padStart(w, '0');

const env = makeEnv({ quiet: true }); const G = env.ctx;
G.setup();
G.setSetting_('ADMIN_EMAILS', 'admin@example.org');
G.setSetting_('CONTACT_EMAIL', 'support@example.org');

/** 체크섬이 맞는 가상 사업자등록번호 */
const brn = n => {
  const d = (pad(100 + (n % 800), 3) + pad(81, 2) + pad(10000 + n * 7, 4).slice(-4)).split('').map(Number);
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let s = 0; for (let i = 0; i < 9; i++) s += d[i] * w[i];
  s += Math.floor((d[8] * 5) / 10);
  const c = (10 - (s % 10)) % 10;
  const t = d.join('') + c;
  return t.slice(0, 3) + '-' + t.slice(3, 5) + '-' + t.slice(5);
};

const REGIONS = [['서울', '서울특별시 중구 세종대로 1'], ['경기', '경기도 수원시 팔달구 효원로 1'], ['인천', '인천광역시 남동구 정각로 29'],
  ['부산', '부산광역시 연제구 중앙대로 1001'], ['대구', '대구광역시 북구 연암로 40'], ['광주', '광주광역시 서구 내방로 111'],
  ['대전', '대전광역시 서구 둔산로 100'], ['울산', '울산광역시 남구 중앙로 201'], ['경남', '경상남도 창원시 의창구 중앙대로 300'],
  ['충남', '충청남도 홍성군 홍북읍 충남대로 21']];
const SUR = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임'];
const GIV = ['가람', '나래', '다솜', '라온', '마루', '바다', '사랑', '아라', '자람', '하늘'];
const name = i => SUR[i % SUR.length] + GIV[Math.floor(i / SUR.length) % GIV.length];

// 차수일정 12개 (2026년)
const sched = [];
for (let k = 1; k <= 12; k++) {
  const m = Math.min(12, 2 + Math.floor(k / 2)), d = k % 2 ? '05' : '20';
  const start = `2026-${pad(m, 2)}-${d}`, at = (off) => { const x = new Date(start + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + off); return x.toISOString().slice(0, 10); };
  sched.push({ 차수: k + '차', 연도: '2026', 착수일: start, 종료일: at(120), 중간기한: at(45), 최종기한: at(100), 사후기한: at(160), 비고: '' });
}
G.insertMany_('차수일정', sched);

// 컨설턴트 32명: 외부 활동 24, 내부 4, 신청 2, 제외 2
const cons = [];
for (let i = 0; i < 32; i++) {
  const 구분 = i >= 24 && i < 28 ? '내부' : '외부';
  const 상태 = i >= 28 ? (i < 30 ? '신청' : '제외') : '활동';
  cons.push({ 성명: name(i), 구분, 상태, 구매처코드: 구분 === '외부' ? String(500000 + i) : '', 연락처: '010-2000-' + pad(1000 + i, 4),
    이메일: 'consultant' + (i + 1) + '@example.com', 주요활동지역: i % 7 === 0 ? '전국' : REGIONS[i % REGIONS.length][0] + ', ' + REGIONS[(i + 3) % REGIONS.length][0],
    이력서: '', 등록일: '2026-01-' + pad(1 + (i % 28), 2) });
}
G.insertMany_('컨설턴트', cons);
const active = cons.filter(c => c.상태 === '활동');

// 교육 2건 + 이수
const tr = G.insertMany_('교육', [{ 교육명: '컨설턴트 기본 교육', 일자: '2026-02-10', 시간: '4', 상태: '종료' }, { 교육명: '보고서 작성 교육', 일자: '2026-05-15', 시간: '2', 상태: '종료' }]);
G.insertMany_('교육이수', active.filter((c, i) => i % 3 !== 2).map((c, i) => ({ 컨설턴트ID: c.ID, 교육ID: tr[i % 2].ID, 이수시간: tr[i % 2].시간 })));

// 신청 70건: 본신청 60(확정 54 → 사업장, 대기 6) + 사전접수 4 + 반려 6
const apps = [];
for (let i = 0; i < 70; i++) {
  const r = REGIONS[i % REGIONS.length];
  const 구분 = i >= 66 ? '사전접수' : '본신청';
  const 승인 = 구분 === '사전접수' ? '대기' : i < 54 ? '확정' : i < 60 ? '대기' : '반려';
  apps.push({ 구분, 연도: 구분 === '사전접수' ? '2027' : '2026', 사업장명: '가상기업' + pad(i + 1, 3) + '(주)', 사업자등록번호: brn(i + 1),
    업태: pick(['제조업', '도매업', '서비스업']), 종목: pick(['자동차부품', '금속가공', '전자부품', '플라스틱제품', '식품']), 근로자수: String(10 + Math.floor(rnd() * 280)),
    사업장주소: r[1], 사업장지역: r[0], 담당부서: '경영지원팀', 담당자명: name(100 + i), 담당자직책: '과장', 담당자연락처: '010-3000-' + pad(1000 + i, 4),
    담당자이메일: 'company' + (i + 1) + '@example.com', 희망컨설턴트: i % 9 === 0 ? active[i % active.length].성명 : '', 승인여부: 승인,
    연락여부: 승인 === '확정' ? '2 사업장 연락완료' : '미확인', 신청일: `2026-${pad(1 + (i % 11), 2)}-${pad(1 + (i % 27), 2)}`, 신청자: '' });
}
G.insertMany_('신청', apps);

// 사업장 54곳: 차수 12개에 분산, 진행 단계 다양화
const extern = active.filter(c => c.구분 === '외부');
const projs = [], appPatch = [];
for (let i = 0; i < 54; i++) {
  const a = apps[i], s = sched[i % 12];
  const c1 = extern[i % extern.length], c2 = i % 4 === 0 ? extern[(i + 7) % extern.length] : null;
  const stage = i % 6;   // 0: 착수 전, 1: 중간 작성, 2: 중간 검수 중, 3: 중간 보완, 4: 최종 완료, 5: 사후 완료
  const done = t => (t === '중간' && stage >= 4) || (t === '최종' && stage >= 4) || (t === '사후' && stage === 5);
  const p = { 신청ID: a.ID, 사업장명: a.사업장명, 연도: '2026', 차수: s.차수, 컨설턴트ID: [c1.ID].concat(c2 ? [c2.ID] : []).join(','),
    컨설턴트명: [c1.성명].concat(c2 ? [c2.성명] : []).join(', '), 착수현황: stage === 0 ? '착수준비' : pick(['협약완료', '문서협약완료']),
    착수일: s.착수일, 종료일: s.종료일, 중간기한: s.중간기한, 최종기한: s.최종기한, 사후기한: s.사후기한,
    중간검수: done('중간') ? '검수완료' : stage === 2 ? '검수 중' : stage === 3 ? '보완요청' : '미제출',
    최종검수: done('최종') ? '검수완료' : '미제출', 사후검수: done('사후') ? '검수완료' : '미제출',
    정책연계여부: stage >= 4 ? (i % 2 ? 'Y' : 'N') : '', 정책연계사업: stage >= 4 && i % 2 ? pick(['산업일자리전환장려금', 'S-OJT', '스마트공장구축']) : '',
    우수사례여부: '', 생성일: s.착수일, 비고: '' };
  ['중간', '최종', '사후'].forEach(t => { if (done(t)) p[t + '제출일'] = p[t + '기한']; });
  if (stage === 2 || stage === 3) p['중간제출일'] = s.중간기한;
  projs.push(p);
}
G.insertMany_('사업장', projs);
projs.forEach((p, i) => G.update_('신청', apps[i].ID, { 사업장ID: p.ID }));

// 수행일지·보고서
const logs = [], reps = [];
projs.forEach((p, i) => {
  const stage = i % 6; if (stage === 0) return;
  const n = 1 + stage;
  for (let k = 1; k <= n; k++) logs.push({ 사업장ID: p.ID, 회차: String(k), 일자: p.착수일, 시간: '2', 방식: pick(['방문', '비대면']), 장소: '사업장', 내용: k + '회차 진단', 작성자: 'consultant@example.com', 작성일: p.착수일 + ' 10:00:00' });
  const sub = (t, res) => reps.push({ 사업장ID: p.ID, 종류: t, 파일: '[]', 제출자: 'consultant@example.com', 제출일: p[t + '기한'] + ' 09:00:00',
    검수결과: res, 검수의견: res === '보완요청' ? '분석 보강 필요' : '', 검수자: res === '검수 중' ? '' : 'admin@example.org', 검수일: res === '검수 중' ? '' : p[t + '기한'] });
  if (stage === 2) sub('중간', '검수 중');
  if (stage === 3) sub('중간', '보완요청');
  if (stage >= 4) { sub('중간', '검수완료'); sub('최종', '검수완료'); }
  if (stage === 5) sub('사후', '검수완료');
});
G.insertMany_('수행일지', logs);
G.insertMany_('보고서', reps);

// 변경이력·메일이력은 비움 (setup 기록 제외)
['변경이력', '메일이력'].forEach(n => { const sh = env.active.getSheetByName(n); sh.data = [sh.data[0]]; });
fs.writeFileSync(__dirname + '/' + OUT, JSON.stringify({ sheets: env.active.getSheets().map(s => [s.getName(), s.data]) }));
console.log(`픽스처 ${OUT}: 신청 ${apps.length}, 사업장 ${projs.length}, 컨설턴트 ${cons.length}, 수행일지 ${logs.length}, 보고서 ${reps.length}`);
