const { chromium } = require('playwright');
const fs = require('fs');
const OUT = require('path').join(__dirname, '..', 'docs', 'manual-shots'); fs.mkdirSync(OUT, { recursive: true });
const B = 'http://localhost:8788';
const rpc = (fn, ...args) => fetch(B + '/rpc', { method: 'POST', body: JSON.stringify({ fn, args }) }).then(r => r.json()).then(j => { if (j.error) throw new Error(fn + ': ' + j.error); return j.result; });
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const mk = async (w, h) => { const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 }); p.on('pageerror', e => errors.push(e.message)); return p; };
  const hideToast = p => p.addStyleTag({ content: '#toast{display:none!important}' });
  const login = async (p, email, shotName) => {
    await p.goto(B + '/'); await p.evaluate(() => localStorage.clear()); await p.goto(B + '/');
    await p.fill('#email', email);
    if (shotName) { await p.screenshot({ path: `${OUT}/${shotName}.png` }); }
    await p.click('#sendBtn'); await p.waitForSelector('#step2:not(.hidden)');
    const code = await (await fetch(B + '/otp')).text();
    await p.fill('#code', code); await p.click('#verifyBtn');
    await p.waitForSelector('#view', { timeout: 20000 }); await p.waitForTimeout(800); await hideToast(p);
    return p.evaluate(() => localStorage.getItem('ccm_token'));
  };
  const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });
  // 데모 데이터 준비
  const cons = await rpc('all_', '컨설턴트'), projs = await rpc('all_', '사업장');
  const cnt = {}; projs.forEach(p => String(p['컨설턴트ID']).split(',').forEach(i => cnt[i] = (cnt[i] || 0) + 1));
  const c = cons.filter(x => x['상태'] === '활동' && x['이메일'] && x['구분'] === '외부').sort((a, b) => (cnt[b.ID] || 0) - (cnt[a.ID] || 0))[0];
  const myP = projs.filter(p => String(p['컨설턴트ID']).split(',').includes(c.ID)).sort((a, b) => (parseInt(b['차수']) || 0) - (parseInt(a['차수']) || 0))[0];
  await rpc('__seedSecret');
  // 관리자
  const A = await mk(1280, 800);
  const AT = await login(A, 'admin@example.org', 'a01-login');
  // 컨설턴트 토큰으로 데모 일지/보고서
  const Cp = await mk(1280, 800);
  const CT = await login(Cp, c['이메일'], 'c01-login');
  const hwpx = Buffer.from('PK\x03\x04demo').toString('base64');
  await rpc('saveLog', CT, { 사업장ID: myP.ID, 일자: '2026-09-18', 시간: '14:00~17:00', 방식: '방문', 장소: '사업장 회의실', 참석자: '대표이사, 생산팀장', 내용: '착수 미팅. 사업 현황과 산업전환 추진 방향 청취, 진단 일정 협의', 향후계획: '2회차에 생산공정 현장 진단' }, []);
  await rpc('saveLog', CT, { 사업장ID: myP.ID, 일자: '2026-10-02', 시간: '10:00~16:00', 방식: '방문', 장소: '생산 현장', 참석자: '생산팀장, 인사담당', 내용: '공정별 인력 구조 진단, 직무 전환 대상 직무 도출', 향후계획: '교육훈련 연계 방안 검토' }, [{ name: '현장사진.jpg', mime: 'image/jpeg', b64: 'AA==' }]);
  await rpc('saveLog', CT, { 사업장ID: myP.ID, 일자: '2026-10-21', 시간: '15:00~16:30', 방식: '비대면', 장소: 'Zoom', 참석자: '인사담당', 내용: '산업일자리전환장려금 요건 안내 및 신청 서류 점검', 향후계획: '중간보고서 작성' }, []);
  const d = await rpc('submitReport', CT, myP.ID, '중간', [{ name: '중간보고서.hwpx', mime: '', b64: hwpx }], '중간보고서 제출합니다.');
  await rpc('adminReviewSubmission', AT, d.submissions[0].ID, '보완요청', '3장 직무 전환 계획에 교육훈련 일정(월별)을 추가해 주세요.');
  await rpc('updateMyProject', CT, myP.ID, { 정책연계여부: 'Y', 정책연계사업: '산업일자리전환장려금, 인재키움프리미엄교육', 정책연계시기: '2026. 12' }, {});
  // 대기 신청 하나 (사업장 미생성)
  const pend = (await rpc('all_', '신청')).find(a => a['승인여부'] === '대기' && a['구분'] === '본신청' && !a['사업장ID']);
  await A.reload(); await A.waitForSelector('#view'); await A.waitForTimeout(800); await hideToast(A);
  await shot(A, 'a02-dashboard');
  await A.click('[data-tab=apps]'); await A.waitForTimeout(500); await shot(A, 'a03-apps');
  await A.selectOption('[data-f=승인여부]', '대기'); await A.waitForTimeout(300);
  await A.fill('[data-f=q]', pend['사업장명']); await A.waitForTimeout(300);
  await A.click('table.t tbody tr'); await A.waitForSelector('.drawer'); await A.waitForTimeout(300);
  await A.evaluate(() => document.querySelector('#mkProj').scrollIntoView({ block: 'center' }));
  await A.waitForTimeout(300); await shot(A, 'a04-app-assign');
  await A.click('[data-close]');
  await A.click('[data-tab=projects]'); await A.waitForTimeout(400);
  await A.selectOption('[data-f=상태]', '기한 초과'); await A.waitForTimeout(300); await shot(A, 'a05-projects');
  await A.selectOption('[data-f=상태]', ''); await A.fill('[data-f=q]', myP['사업장명']); await A.waitForTimeout(300);
  await A.click('table.t tbody tr'); await A.waitForSelector('.drawer #subBody'); await A.waitForTimeout(400); await shot(A, 'a06-project-info');
  await A.click('[data-sub=reports]'); await A.waitForTimeout(400); await shot(A, 'a07-project-review');
  await A.click('[data-close]');
  await A.click('[data-tab=cons]'); await A.waitForTimeout(400);
  await A.fill('[data-f=q]', c['성명']); await A.waitForTimeout(300);
  await A.click('table.t tbody tr'); await A.waitForSelector('.drawer'); await A.waitForTimeout(400); await shot(A, 'a08-consultant');
  await A.evaluate(() => document.querySelector('#saveTr').scrollIntoView({ block: 'center' })); await A.waitForTimeout(200); await shot(A, 'a09-training');
  await A.click('[data-close]');
  await A.click('[data-tab=sched]'); await A.waitForTimeout(400); await shot(A, 'a10-schedule');
  await A.click('[data-tab=mail]'); await A.waitForTimeout(300);
  await A.fill('#mSubj', '[산업일자리전환 컨설팅] 관리 앱 접속 안내');
  await A.fill('#mBody', '{{성명}} 컨설턴트님, 안녕하세요.\n\n이제 사업장 정보·수행일지·보고서 제출을 아래 앱에서 합니다.\n{{앱URL}}\n\n명단에 등록된 이메일로 인증코드를 받아 로그인해 주세요.\n\n{{기관명}}');
  await A.waitForTimeout(300); await shot(A, 'a11-mail');
  await A.click('[data-tab=settings]'); await A.waitForTimeout(1000); await shot(A, 'a12-settings-links');
  await A.evaluate(() => (document.querySelector('#larkBox').scrollIntoView({ block: 'start' }), window.scrollBy(0, -70))); await A.waitForTimeout(200); await shot(A, 'a13-settings-lark');
  // 컨설턴트
  await Cp.reload(); await Cp.waitForSelector('.pcard'); await Cp.waitForTimeout(500); await hideToast(Cp);
  await shot(Cp, 'c02-home');
  await Cp.locator('.pcard', { hasText: myP['사업장명'] }).first().click(); await Cp.waitForSelector('.drawer #subBody'); await Cp.waitForTimeout(400); await shot(Cp, 'c03-project-info');
  await Cp.click('[data-sub=logs]'); await Cp.waitForTimeout(400); await shot(Cp, 'c04-logs');
  await Cp.click('[data-sub=reports]'); await Cp.waitForTimeout(400); await shot(Cp, 'c05-reports');
  await Cp.click('[data-sub=company]'); await Cp.waitForTimeout(300); await shot(Cp, 'c06-company');
  await Cp.click('[data-close]'); await Cp.click('[data-tab=profile]'); await Cp.waitForTimeout(400); await shot(Cp, 'c07-profile');
  // 휴대폰
  const M = await browser.newPage({ ...require('playwright').devices['iPhone 13'] });
  await M.goto(B + '/'); await M.evaluate(t => localStorage.setItem('ccm_token', t), CT); await M.goto(B + '/');
  await M.waitForSelector('.pcard'); await M.waitForTimeout(500); await M.screenshot({ path: OUT + '/c08-mobile.png' });
  await M.goto(B + '/?page=apply'); await M.waitForSelector('#f'); await M.screenshot({ path: OUT + '/a14-form-apply.png' });
  console.log('consultant', c['성명'], myP['사업장명'], 'errors:', errors.length ? errors : 'none');
  await browser.close();
})();
