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
  await pg.goto('http://localhost:8899/nope'); console.log('/nope          →', await pg.locator('.card h1').textContent());
  console.log('errors:', errs.length ? errs : 'none');
  await b.close(); srv.close();
});
