// 넷리파이 페이지를 로컬에서 흉내: 경로 리라이트 + 웹앱(모의 서버, 포트 8787)을 iframe으로
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const DIR = path.join(__dirname, '../netlify');
const REWRITE = ['/login', '/apply', '/pre', '/consultant'];
const srv = http.createServer((req, res) => {
  let p = new URL(req.url, 'http://x').pathname;
  if (p === '/' || REWRITE.includes(p)) p = '/index.html';
  const f = path.join(DIR, p);
  if (!fs.existsSync(f)) { res.statusCode = 404; p = '/index.html'; }
  let body = fs.readFileSync(path.join(DIR, p), 'utf8');
  if (p === '/config.js') body = body.replace(/WEBAPP_URL: '[^']*'/, "WEBAPP_URL: 'http://localhost:8787/macros/s/TEST/exec'");
  if (p === '/index.html') body = body.replace("/^https:\\/\\/script\\.google\\.com\\/(a\\/[^/]+\\/)?macros\\/s\\/[A-Za-z0-9_-]+\\/exec$/", "/\\/exec$/");
  res.setHeader('Content-Type', p.endsWith('.js') ? 'text/javascript' : p.endsWith('.svg') ? 'image/svg+xml' : 'text/html; charset=utf-8');
  res.end(body);
}).listen(8899, async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  for (const [route, sel] of [['/apply', '#f'], ['/pre', '#f'], ['/consultant', '#f'], ['/', '#email'], ['/?page=apply', '#f']]) {
    await pg.goto('http://localhost:8899' + route);
    const fr = pg.frameLocator('#app');
    await fr.locator(sel).first().waitFor({ timeout: 15000 });
    const h1 = await fr.locator('h1, h2').first().textContent();
    console.log(route.padEnd(14), '→', (await pg.title()).padEnd(28), '| iframe:', h1.trim());
  }
  await pg.goto('http://localhost:8899/apply'); await pg.frameLocator('#app').locator('#f').waitFor();
  await pg.screenshot({ path: __dirname + '/shots/netlify-apply.png' });
  // 로그인 유지: iframe 저장소가 지워져도(사파리 제3자 저장소 차단) 래퍼가 토큰을 돌려준다
  await pg.goto('http://localhost:8899/');
  const fr = pg.frameLocator('#app');
  await fr.locator('#email').fill('ksawork02@gmail.com'); await fr.locator('#sendBtn').click();
  await fr.locator('#step2:not(.hidden)').waitFor();
  const code = await (await fetch('http://localhost:8787/otp')).text();
  await fr.locator('#code').fill(code); await fr.locator('#verifyBtn').click();
  await fr.locator('#view').waitFor({ timeout: 20000 });
  const wtok = await pg.evaluate(() => localStorage.getItem('ccm_token'));
  if (!/^[0-9a-f]{40}$/.test(wtok || '')) throw new Error('래퍼에 토큰이 저장되지 않음');
  const appFrame = () => pg.frames().find(f => f.url().startsWith('http://localhost:8787'));
  await appFrame().evaluate(() => localStorage.clear());
  await pg.reload();
  await pg.frameLocator('#app').locator('#view').waitFor({ timeout: 20000 });
  console.log('iframe 저장소 삭제 후 로그인 유지: OK');
  // 우리 iframe 밖의 창이 요청하면 토큰을 주지 않는다
  const leaked = await pg.evaluate(() => new Promise(r => {
    window.addEventListener('message', e => { if (e.data && e.data.ccm === 'token') r(e.data.t); });
    window.postMessage({ ccm: 'need' }, '*'); setTimeout(() => r('none'), 800);
  }));
  if (leaked !== 'none') throw new Error('외부 요청에 토큰 응답');
  console.log('외부 창 토큰 요청 거부: OK');
  await pg.frameLocator('#app').locator('#logoutBtn').click();
  await pg.frameLocator('#app').locator('#email').waitFor({ timeout: 15000 });
  if (await pg.evaluate(() => localStorage.getItem('ccm_token'))) throw new Error('로그아웃 후 래퍼 토큰 남음');
  console.log('로그아웃 시 래퍼 토큰 삭제: OK');

  await pg.goto('http://localhost:8899/nope'); console.log('/nope          →', await pg.locator('.card h1').textContent());
  console.log('errors:', errs.length ? errs : 'none');
  await b.close(); srv.close();
});
