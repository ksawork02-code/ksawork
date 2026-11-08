const { chromium } = require('playwright');
const fs = require('fs');
const OUT = require('path').join(__dirname, 'shots2'); fs.mkdirSync(OUT, { recursive: true });
const B = 'http://localhost:8787';
const rpc = (fn, ...args) => fetch(B + '/rpc', { method: 'POST', body: JSON.stringify({ fn, args }) }).then(r => r.json()).then(j => { if (j.error) throw new Error(fn + ': ' + j.error); return j.result; });
(async () => {
  const browser = await chromium.launch(); const errors = [];
  const mk = async () => { const p = await browser.newPage({ viewport: { width: 1360, height: 860 } }); p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept(d.type() === 'prompt' ? '테스트 사유' : undefined)); return p; };
  const login = async (p, email) => {
    await p.goto(B + '/'); await p.evaluate(() => localStorage.clear()); await p.goto(B + '/');
    await p.fill('#email', email); await p.click('#sendBtn'); await p.waitForSelector('#step2:not(.hidden)');
    await p.fill('#code', await (await fetch(B + '/otp')).text()); await p.click('#verifyBtn');
    await p.waitForSelector('#view'); await p.waitForTimeout(700); await p.addStyleTag({ content: '#toast{display:none!important}' });
    return p.evaluate(() => localStorage.getItem('ccm_token'));
  };
  const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });
  const tab = async (p, t) => { await p.click(`[data-tab=${t}]`); await p.waitForTimeout(700); };
  const check = (name, cond) => console.log((cond ? '  ✓ ' : '  ✗ ') + name);
  const A = await mk(); const AT = await login(A, 'ksawork02@gmail.com');
  const tabs = await A.$$eval('.tabs button', b => b.map(x => x.textContent)); console.log('관리자 탭:', tabs.join(' | '));
  await tab(A, 'visits'); check('일정 달력', await A.locator('.cal-cell').count() > 27); await shot(A, 'a-visits');
  await A.click('[data-ym="2026-11"]').catch(() => {}); await A.waitForTimeout(500);
  check('11월 일정 표시', await A.locator('.cal-ev').count() >= 1);
  await tab(A, 'edu'); check('교육 목록', await A.locator('#eList tbody tr').count() >= 1); await shot(A, 'a-edu');
  await A.locator('#eList tbody tr', { hasText: '보고서 심화' }).click(); await A.waitForSelector('.drawer'); await A.waitForTimeout(300); await shot(A, 'a-edu-detail'); await A.click('[data-close]');
  await tab(A, 'fee'); check('정산 목록', await A.locator('#feeList tbody tr').count() >= 1); await shot(A, 'a-fee');
  await tab(A, 'report'); check('월간 실적', await A.locator('.section table.t').count() >= 2); await shot(A, 'a-report');
  await tab(A, 'board'); check('문의 목록', await A.locator('#bList').count() === 1); await A.selectOption('#iSt', ''); await A.waitForTimeout(300); await shot(A, 'a-inq');
  await A.click('[data-bs=notice]'); await A.waitForTimeout(600); check('공지 목록', await A.locator('#bList tbody tr').count() >= 2); await shot(A, 'a-notice');
  await A.click('#nNew'); await A.waitForSelector('#nForm2'); await A.fill('#nForm2 [data-k=제목]', 'UI 공지 테스트'); await A.fill('#nForm2 [data-k=내용]', '본문'); await A.uncheck('#nMail'); await A.click('#nSave'); await A.waitForTimeout(1000);
  check('공지 게시', await A.locator('#bList tbody tr', { hasText: 'UI 공지 테스트' }).count() === 1);
  await tab(A, 'mail'); await shot(A, 'a-mail');
  await tab(A, 'settings'); await A.waitForTimeout(800); check('문자 설정 박스', await A.locator('#smsBox h3').count() === 1);
  await A.evaluate(() => { document.querySelector('#smsBox').scrollIntoView(); window.scrollBy(0, -70); }); await shot(A, 'a-sms');
  // 사업장 상세 새 탭
  await tab(A, 'projects'); check('서류·만족도 열', (await A.$$eval('table.t th', t => t.map(x => x.textContent))).some(t => t.startsWith('서류')));
  {
    const cnt = async () => parseInt(await A.textContent('#cnt'), 10);
    const all = await cnt(), n = {};
    for (const o of ['누락·반려', '확인 대기', '완료']) { await A.selectOption('[data-f=서류]', o); await A.waitForTimeout(200); n[o] = await cnt(); }
    await A.selectOption('[data-f=서류]', ''); await A.waitForTimeout(200);
    check('서류 필터·설문 일괄 발송 버튼 (' + JSON.stringify(n) + ' / ' + all + ')', Object.values(n).some(x => x < all) && await cnt() === all && await A.locator('#svBulk').count() === 1);
  }
  const visits = await rpc('all_', '일정'); const pid = visits[0]['사업장ID']; const P = (await rpc('all_', '사업장')).find(p => p.ID === pid);
  await A.fill('[data-f=q]', P['사업장명']); await A.waitForTimeout(300); await A.click('table.t tbody tr'); await A.waitForSelector('#subBody');
  for (const s of ['visits', 'docs', 'reports', 'survey']) { await A.click(`[data-sub=${s}]`); await A.waitForTimeout(400); await shot(A, 'a-proj-' + s); }
  await A.click('[data-sub=reports]'); await A.waitForTimeout(300);
  check('체크리스트 표시', await A.locator('[data-cl] .cl-row').count() >= 4);
  await A.click('[data-sub=docs]'); await A.waitForTimeout(300); check('서류 4종 표시', await A.locator('[data-dup]').count() === 4);
  await A.click('[data-close]');
  // 신청 → 추천
  await tab(A, 'apps'); await A.selectOption('[data-f=사업장]', '미생성'); await A.waitForTimeout(300);
  if (await A.locator('table.t tbody tr[data-i]').count()) { await A.click('table.t tbody tr[data-i]'); await A.waitForSelector('#recBtn'); await A.click('#recBtn'); await A.waitForTimeout(800);
    check('배정 추천 목록', await A.locator('[data-rec]').count() >= 5); await A.locator('[data-rec]').first().click(); check('추천 → 컨설턴트 추가', await A.locator('.cpick .chip.on').count() >= 1);
    await A.evaluate(() => document.querySelector('#recBox').scrollIntoView({ block: 'center' })); await shot(A, 'a-recommend'); await A.click('[data-close]'); }
  // 컨설턴트
  const cons = await rpc('all_', '컨설턴트'); const cid = String(P['컨설턴트ID']).split(',')[0]; const c = cons.find(x => x.ID === cid);
  const C = await mk(); await login(C, c['이메일']);
  console.log('컨설턴트 탭:', (await C.$$eval('.tabs button', b => b.map(x => x.textContent))).join(' | '));
  await tab(C, 'cvisits'); await C.click('[data-ym="2026-11"]'); await C.waitForTimeout(600); check('내 일정 달력', await C.locator('.cal-ev').count() >= 1); await shot(C, 'c-visits');
  await tab(C, 'cedu'); await shot(C, 'c-edu');
  const applyBtn = C.locator('[data-eap]').first(); if (await applyBtn.count()) { await applyBtn.click(); await C.waitForTimeout(800); check('교육 신청', await C.locator('[data-ecx]').count() >= 1); }
  await tab(C, 'cnotice'); const unread = await C.locator('.nitem.unread').count(); await C.locator('.nitem.unread').first().click(); await C.waitForTimeout(400);
  check('공지 펼치기·읽음 (' + unread + '→' + await C.locator('.nitem.unread').count() + ')', await C.locator('.nitem.open').count() === 1 && await C.locator('.nitem.unread').count() === unread - 1); await shot(C, 'c-notice');
  await tab(C, 'cinq'); await C.fill('#qForm [data-k=제목]', 'UI 문의'); await C.fill('#qForm [data-k=내용]', '질문 내용'); await C.click('#qSend'); await C.waitForTimeout(1000);
  check('문의 등록', await C.locator('.card', { hasText: 'UI 문의' }).count() === 1); await shot(C, 'c-inq');
  await tab(C, 'cfee'); await shot(C, 'c-fee');
  await tab(C, 'mine'); await C.locator('.pcard', { hasText: P['사업장명'] }).first().click(); await C.waitForSelector('#subBody');
  await C.click('[data-sub=visits]'); await C.waitForTimeout(300);
  await C.fill('#vForm [data-k=일자]', '2026-11-25'); await C.fill('#vForm [data-k=시작]', '10:00'); await C.fill('#vForm [data-k=내용]', 'UI 일정'); await C.click('#vSave'); await C.waitForTimeout(1200);
  check('일정 등록(컨설턴트)', await C.locator('#subBody td', { hasText: 'UI 일정' }).count() === 1); await shot(C, 'c-proj-visits');
  await C.click('[data-sub=docs]'); await C.waitForTimeout(300);
  fs.writeFileSync(require('path').join(require('os').tmpdir(), 'doc.pdf'), '%PDF-1.4 test');
  await C.setInputFiles('[data-dfile="착수계획서"]', require('path').join(require('os').tmpdir(), 'doc.pdf')); await C.click('[data-dup="착수계획서"]'); await C.waitForTimeout(1200);
  check('서류 업로드(컨설턴트)', await C.locator('tr', { hasText: '착수계획서' }).locator('.badge', { hasText: '대기' }).count() === 1); await shot(C, 'c-proj-docs');
  // 공개 페이지
  const apps = await rpc('all_', '신청'); const a = apps.find(x => x['사업장ID'] && String(x['사업자등록번호']).replace(/\D/g, '').length === 10);
  const M = await mk(); await M.setViewportSize({ width: 420, height: 900 });
  await M.goto(B + '/?page=status'); await M.fill('#sNo', a.ID); await M.fill('#sBrn', a['사업자등록번호']); await M.click('#sGo'); await M.waitForTimeout(800);
  check('진행조회', await M.locator('.stepper div').count() >= 3); await M.screenshot({ path: OUT + '/p-status.png', fullPage: true });
  const AT2 = AT; const other = (await rpc('all_', '사업장')).find(p => p.ID !== pid && p['신청ID']);
  await rpc('adminSendSurvey', AT2, [other.ID], false); const sv = (await rpc('all_', '만족도')).find(x => x['사업장ID'] === other.ID);
  await M.goto(B + '/?page=survey&t=' + sv['토큰']); await M.waitForSelector('#svGo');
  for (let i = 0; i < 5; i++) await M.locator(`input[name=q${i}][value="${4 + (i % 2)}"]`).check();
  await M.screenshot({ path: OUT + '/p-survey.png', fullPage: true });
  await M.click('#svGo'); await M.waitForTimeout(800); check('설문 제출', /감사합니다/.test(await M.textContent('#app')));
  console.log('오류:', errors.length ? errors : '없음');
  await browser.close();
})();
