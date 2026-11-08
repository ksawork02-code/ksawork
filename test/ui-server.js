// 모의 서버로 실제 HTML을 띄워 브라우저 테스트
const http = require('http'), fs = require('fs'), path = require('path');
const { makeEnv } = require('./gas-mock');
const env = makeEnv({ quiet: true }); const G = env.ctx;
G.setup();
const st = JSON.parse(fs.readFileSync(__dirname + '/' + (process.env.STATE || 'state.json')));
st.sheets.forEach(([n, data]) => { const sh = env.active.getSheetByName(n) || env.active.insertSheet(n); sh.data = data; });
G._cache = {};
const APP = path.join(__dirname, '../app');
const shim = `<script>window.google={script:{run:(function mk(s,f){return new Proxy({},{get:function(_,k){
 if(k==='withSuccessHandler')return function(fn){return mk(fn,f)};if(k==='withFailureHandler')return function(fn){return mk(s,fn)};
 return function(){var a=[].slice.call(arguments);fetch('/rpc',{method:'POST',body:JSON.stringify({fn:k,args:a})}).then(function(r){return r.json()}).then(function(j){
  setTimeout(function(){ if(j.error){f&&f(new Error(j.error))}else{s&&s(j.result)} },0)})}}})})()}};</script>`;
function render(file, vars) {
  let s = fs.readFileSync(path.join(APP, file + '.html'), 'utf8');
  s = s.replace(/<\?!= include\('(\w+)'\) \?>/g, (m, n) => fs.readFileSync(path.join(APP, n + '.html'), 'utf8'));
  s = s.replace(/<\?= (\w+) \?>/g, (m, k) => (k === 'page' || k === 'token') ? JSON.stringify(vars[k] || '') : vars[k]);
  return s.replace('<head>', '<head><meta name="viewport" content="width=device-width, initial-scale=1">' + shim);
}
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'POST' && u.pathname === '/rpc') {
    let b = ''; req.on('data', c => b += c); req.on('end', () => {
      const { fn, args } = JSON.parse(b);
      if (fn === '__seedSecret') { env.props.LARK_APP_SECRET = 'demo'; return res.end('{"result":true}'); }
      let out; try { G._cache = {}; out = { result: JSON.parse(JSON.stringify(G[fn].apply(null, args) ?? null)) }; } catch (e) { out = { error: e.message }; }
      res.end(JSON.stringify(out));
    }); return;
  }
  if (u.pathname === '/otp') { const m = env.outbox.filter(x => /인증코드/.test(x.subject)).pop(); return res.end(m ? m.subject.match(/(\d{6})/)[1] : ''); }
  const page = u.searchParams.get('page') || '';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(render(['apply', 'pre', 'consultant', 'status', 'survey'].includes(page) ? 'Form' : 'Index', { page, token: (u.searchParams.get('t') || ''), appName: '산업일자리전환 컨설팅 관리' }));
}).listen(Number(process.env.PORT || 8787), () => console.log('ui on 8787'));
