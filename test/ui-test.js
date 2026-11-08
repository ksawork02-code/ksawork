const { chromium } = require('playwright');
const fs = require('fs');
const OUT = require('path').join(__dirname, 'shots'); fs.mkdirSync(OUT, { recursive: true });
const B = 'http://localhost:8787';
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const verdict = (name, cond, extra) => { console.log(name + ':', cond ? 'OK' : 'FAIL ' + (extra || '')); if (!cond) process.exitCode = 1; };
  const ADMIN = (await (await fetch(B + '/rpc', { method: 'POST', body: JSON.stringify({ fn: 'adminEmails_', args: [] }) })).json()).result[0];
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const shot = n => page.screenshot({ path: `${OUT}/${n}.png` });
  const login = async (email) => {
    await page.goto(B + '/'); await page.evaluate(() => localStorage.clear()); await page.goto(B + '/');
    await page.fill('#email', email); await page.click('#sendBtn');
    await page.waitForSelector('#step2:not(.hidden)');
    const code = await (await fetch(B + '/otp')).text();
    await page.fill('#code', code); await page.click('#verifyBtn');
    await page.waitForSelector('#view', { timeout: 20000 }); await page.waitForTimeout(800);
  };
  // 관리자
  await login(ADMIN); await shot('01-dashboard');
  await page.click('[data-tab=apps]'); await page.waitForTimeout(500); await shot('02-apps');
  await page.click('table.t tbody tr'); await page.waitForSelector('.drawer'); await page.waitForTimeout(400); await shot('03-app-drawer');
  await page.click('[data-close]');
  await page.selectOption('#viewSel', 'k연락여부'); await page.waitForTimeout(400); await shot('04-apps-kanban');
  await page.click('[data-tab=projects]'); await page.waitForTimeout(500);
  await page.selectOption('[data-f=상태]', '기한 초과'); await page.waitForTimeout(300); await shot('05-projects');
  await page.click('table.t tbody tr'); await page.waitForSelector('.drawer #subBody'); await page.waitForTimeout(400); await shot('06-project-info');
  await page.click('[data-sub=reports]'); await page.waitForTimeout(300); await shot('07-project-reports');
  await page.click('[data-close]');
  await page.click('[data-tab=cons]'); await page.waitForTimeout(400);
  await page.click('table.t tbody tr'); await page.waitForSelector('.drawer'); await page.waitForTimeout(400); await shot('08-consultant');
  await page.click('[data-close]');
  await page.click('[data-tab=sched]'); await page.waitForTimeout(400); await shot('09-schedule');
  await page.click('[data-tab=mail]'); await page.waitForTimeout(300); await shot('10-mail');
  await page.click('[data-tab=settings]'); await page.waitForTimeout(800); await shot('11-settings');
  // 앱 신청 저장 후 반영 확인
  await page.click('[data-tab=apps]'); await page.waitForTimeout(300); await page.selectOption('#viewSel', 'table'); await page.waitForTimeout(300);
  await page.click('table.t tbody tr'); await page.waitForSelector('#appForm');
  await page.fill('#appForm [data-k=비고]', 'UI테스트 비고'); await page.click('#saveApp'); await page.waitForTimeout(1200);
  const saved = await page.inputValue('#appForm [data-k=비고]').catch(() => '');
  verdict('저장 반영', saved === 'UI테스트 비고', saved);
  // 컨설턴트
  const email = await (await fetch(B + '/rpc', { method: 'POST', body: JSON.stringify({ fn: 'all_', args: ['컨설턴트'] }) })).json()
    .then(j => { const ps = []; return j.result; });
  const projs = (await (await fetch(B + '/rpc', { method: 'POST', body: JSON.stringify({ fn: 'all_', args: ['사업장'] }) })).json()).result;
  const cnt = {}; projs.forEach(p => String(p['컨설턴트ID']).split(',').forEach(i => cnt[i] = (cnt[i] || 0) + 1));
  const c = email.filter(x => x['상태'] === '활동' && x['이메일'] && x['구분'] === '외부').sort((a, b) => (cnt[b.ID] || 0) - (cnt[a.ID] || 0))[0];
  console.log('컨설턴트 로그인:', c['성명'], cnt[c.ID] + '곳');
  await login(c['이메일']); await shot('12-cons-home');
  await page.click('.pcard'); await page.waitForSelector('.drawer #subBody'); await page.waitForTimeout(400); await shot('13-cons-project');
  await page.click('[data-sub=logs]'); await page.waitForTimeout(300);
  await page.fill('#logForm [data-k=내용]', 'UI 테스트 방문 진단'); await page.click('#saveLog'); await page.waitForTimeout(1500);
  const logOk = await page.locator('.timeline .item').count(); verdict('일지 작성', logOk >= 1);
  await shot('14-cons-logs');
  await page.click('[data-sub=reports]'); await page.waitForTimeout(300);
  fs.writeFileSync(require('path').join(require('os').tmpdir(), 'x.hwp'), Buffer.from([0xD0, 0xCF, 0x11, 0xE0]));
  await page.setInputFiles('#rFiles', require('path').join(require('os').tmpdir(), 'x.hwp')); await page.waitForTimeout(300);
  const t = await page.locator('#toast').textContent().catch(() => ''); verdict('hwp 선택 차단', /hwpx/i.test(t), t);
  await shot('15-cons-hwp-blocked');
  await page.click('[data-close]'); await page.click('[data-tab=profile]'); await page.waitForTimeout(400); await shot('16-cons-profile');
  // 모바일 + 외부 폼
  const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
  m.on('pageerror', e => errors.push('m pageerror: ' + e.message));
  await m.goto(B + '/?page=apply'); await m.waitForSelector('#f'); await m.screenshot({ path: OUT + '/17-form-apply-mobile.png', fullPage: true });
  await m.fill('[name=사업장명]', 'UI폼(주)'); await m.fill('[name=사업자등록번호]', '1234567890'); await m.click('button[type=submit]'); await m.waitForTimeout(300);
  verdict('폼 검증 메시지', await m.locator('.err').filter({ hasText: '사업자등록번호' }).count() > 0);
  await m.goto(B + '/?page=consultant'); await m.waitForSelector('#f'); await m.screenshot({ path: OUT + '/18-form-consultant.png', fullPage: true });
  console.log('오류:', errors.length ? errors : '없음');
  if (errors.length) process.exitCode = 1;
  await browser.close();
})();
