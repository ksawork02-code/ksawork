// 전체 테스트를 node:test로 한 번에 실행: npm test
//  - 기본: Lark 없이 도는 테스트(고정 픽스처 test/fixture.js)
//  - LARK_APP_SECRET이 있으면 실제 Lark 이관·동기화 테스트도 실행
//  - SKIP_UI=1 이면 브라우저 테스트 생략
// 각 테스트는 별도 프로세스로 돌리고, 실패한 것만 출력을 보여 준다.
const { test } = require('node:test');
const assert = require('assert');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const DIR = __dirname;
const LARK = !!process.env.LARK_APP_SECRET;
const UI = process.env.SKIP_UI !== '1';

function run(file, env, timeoutMs) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(DIR, file)], { env: Object.assign({}, process.env, env || {}), cwd: path.join(DIR, '..') });
    let out = '';
    p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
    const t = setTimeout(() => { out += '\n[시간 초과]'; p.kill('SIGKILL'); }, timeoutMs || 600000);
    p.on('close', code => { clearTimeout(t); resolve({ code, out }); });
  });
}

async function expectPass(file, env, timeoutMs) {
  const r = await run(file, env, timeoutMs);
  assert.strictEqual(r.code, 0, file + ' 실패\n' + r.out.slice(-4000));
}

/** ui-server를 띄워 fn을 실행하고 끈다 */
async function withUiServer(state, fn) {
  const p = spawn(process.execPath, [path.join(DIR, 'ui-server.js')], { env: Object.assign({}, process.env, { STATE: state }), stdio: 'ignore' });
  try {
    for (let i = 0; i < 100; i++) {
      const up = await new Promise(r => http.get('http://localhost:8787/', res => { res.resume(); r(true); }).on('error', () => r(false)));
      if (up) break;
      await new Promise(r => setTimeout(r, 200));
    }
    await fn();
  } finally { p.kill(); await new Promise(r => setTimeout(r, 300)); }
}

test('업로드 규칙 (test-ext)', () => expectPass('test-ext.js'));
test('운영 안정성 (test-ops)', () => expectPass('test-ops.js'));
test('고정 픽스처 생성', () => expectPass('fixture.js'));
test('관리자 권한 세분화 — 픽스처 (test-roles)', () => expectPass('test-roles.js'));
test('세부 기능 — 픽스처 (test-features)', () => expectPass('test-features.js', { STATE: 'state-fixture.json', STATE_OUT: 'state2-fixture.json' }));
test('기본 화면 E2E + 넷리파이 — 픽스처', { skip: !UI && 'SKIP_UI=1' }, () => withUiServer('state-fixture.json', async () => {
  await expectPass('ui-test.js');
  await expectPass('netlify-test.js');
}));
test('세부 기능 E2E — 픽스처', { skip: !UI && 'SKIP_UI=1' }, () => withUiServer('state2-fixture.json', () => expectPass('ui-test2.js')));

test('Lark 이관·업무 흐름 (test-server)', { skip: !LARK && 'LARK_APP_SECRET 없음' }, () => expectPass('test-server.js', null, 1200000));
test('Lark 동기화 (test-sync)', { skip: !LARK && 'LARK_APP_SECRET 없음' }, () => expectPass('test-sync.js', null, 1200000));
test('세부 기능 — 실데이터 (test-features)', { skip: !LARK && 'LARK_APP_SECRET 없음' }, () => expectPass('test-features.js'));
