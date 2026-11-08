/**
 * Lark Base → 구글 시트/드라이브 이관
 * 1) 시트 메뉴 [컨설팅 관리 > Lark 데이터 이관] 실행 (처음 1회 Lark App Secret 입력)
 * 2) 데이터는 즉시 이관, 첨부파일은 5분 단위로 자동 이어서 진행 (트리거)
 * 3) [이관 진행상황 보기]로 남은 파일 수 확인. 완료 시 관리자에게 메일
 * 여러 번 실행해도 이미 옮긴 레코드(LarkID 기준)는 건너뜀
 */

var LARK = {
  DOMAIN: 'https://open.larksuite.com/open-apis',
  APP_ID: 'cli_aa60c02163f8de27',
  BASE: 'AtEObMCf7awP7tsuXBfjCQGip1e',
  T: {
    APPLY: 'tblsbBKo46rQtpLM', PROJ: 'tbl9IrX9vRy3SunG', GUIDE: 'tblY7hzuaSvyqIyU', GUIDE_IN: 'tbl1McgbZJH1Xbq4',
    CONS: 'tblltQnU8Dfj39AZ', SURVEY: 'tblKCyLrzIr6pywc', PRE: 'tbllusMn4MDTnf69'
  },
  APPLY_YEAR: '2026', PRE_YEAR: '2027', TRAINING_YEAR: '2026'
};

var MIG_TIME_LIMIT_MS = 4.5 * 60 * 1000;

/* ---------- Lark API ---------- */

function larkSecret_() {
  var props = PropertiesService.getScriptProperties();
  var sec = props.getProperty('LARK_APP_SECRET');
  if (sec) return sec;
  try {
    var ui = SpreadsheetApp.getUi();
    var r = ui.prompt('Lark App Secret 입력', 'Lark 개발자 콘솔의 App Secret을 입력하세요 (이관 완료 후 자동 삭제됩니다).', ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() === ui.Button.OK && r.getResponseText().trim()) {
      props.setProperty('LARK_APP_SECRET', r.getResponseText().trim());
      return r.getResponseText().trim();
    }
  } catch (e) {}
  throw new Error('스크립트 속성에 LARK_APP_SECRET이 없습니다. [프로젝트 설정 > 스크립트 속성]에 추가하거나 시트 메뉴에서 실행하세요.');
}

var _larkTok = null;
function larkToken_() {
  if (_larkTok) return _larkTok;
  var res = UrlFetchApp.fetch(LARK.DOMAIN + '/auth/v3/tenant_access_token/internal', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ app_id: PropertiesService.getScriptProperties().getProperty('LARK_APP_ID') || LARK.APP_ID, app_secret: larkSecret_() })
  });
  var j = JSON.parse(res.getContentText());
  if (j.code !== 0) throw new Error('Lark 인증 실패: ' + j.msg);
  _larkTok = j.tenant_access_token;
  return _larkTok;
}

function larkRecords_(tableId) {
  var out = [], pt = '';
  do {
    var url = LARK.DOMAIN + '/bitable/v1/apps/' + LARK.BASE + '/tables/' + tableId + '/records?page_size=500&automatic_fields=true' + (pt ? '&page_token=' + pt : '');
    var j = JSON.parse(UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + larkToken_() }, muteHttpExceptions: true }).getContentText());
    if (j.code !== 0) throw new Error('Lark 조회 실패(' + tableId + '): ' + j.msg);
    out = out.concat(j.data.items || []);
    pt = j.data.has_more ? j.data.page_token : '';
  } while (pt);
  return out;
}

/* ---------- 값 변환 ---------- */

function lt_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    if (!v.length) return '';
    if (typeof v[0] === 'string') return v.join(', ');
    if (v[0] && v[0].type === 'text' && v[0].text !== undefined && !v[0].record_ids) return v.map(function (x) { return x.text || ''; }).join('').trim();
    return v.map(function (x) { return x.text || x.name || x.full_address || ''; }).filter(String).join(', ');
  }
  if (typeof v === 'object') return String(v.text || v.name || v.full_address || v.link || '');
  return String(v);
}
function ld_(v) { return typeof v === 'number' ? Utilities.formatDate(new Date(v), 'Asia/Seoul', 'yyyy-MM-dd') : lt_(v); }
function ldt_(v) { return typeof v === 'number' ? Utilities.formatDate(new Date(v), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss') : lt_(v); }
function llinks_(v) {
  if (!v) return [];
  if (v.link_record_ids) return v.link_record_ids;
  if (Array.isArray(v)) return v.reduce(function (a, x) { return a.concat(x.record_ids || []); }, []);
  return [];
}
function latt_(v) {
  if (!Array.isArray(v)) return [];
  return v.map(function (a) { return { lark: 1, name: a.name, size: a.size, url: a.url, token: a.file_token }; });
}

function existingLarkIds_(sheetName) {
  var m = {};
  all_(sheetName).forEach(function (r) { if (r.LarkID) m[r.LarkID] = r; });
  return m;
}

/* ---------- 이관 진입점 ---------- */

function migrateFromLark() {
  larkSecret_();
  if (!larkMutex_(true)) { scheduleMigration_(); return; }
  try { migrateRun_(); } finally { larkMutex_(false); }
}

function migrateRun_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('MIG_DATA_DONE') !== 'Y') {
    migrateData_();
    props.setProperty('MIG_DATA_DONE', 'Y');
  }
  var left = migrateFiles_();
  if (left > 0) scheduleMigration_();
  else finishMigration_();
  try { SpreadsheetApp.getActiveSpreadsheet().toast(left > 0 ? '데이터 이관 완료. 첨부파일 ' + left + '개 남음 — 자동으로 이어서 진행합니다.' : '이관이 모두 완료되었습니다.', 'Lark 이관', 10); } catch (e) {}
}

/** 데이터 다시 이관하려면: 데이터 시트 비우고 이 함수 실행 후 migrateFromLark */
function resetMigrationFlag() { PropertiesService.getScriptProperties().deleteProperty('MIG_DATA_DONE'); }

/** 최초 이관 = 첫 번째 동기화 (Sync.gs의 larkSync_ 사용) */
function migrateData_() {
  var r = larkSync_();
  Logger.log('데이터 이관: ' + r.summary);
  return r;
}

/* ---------- 첨부파일 ---------- */

/** 남은 Lark 첨부를 내려받아 드라이브에 저장. 반환: 남은 파일 수 */
function migrateFiles_() {
  var start = Date.now(), left = 0;
  Object.keys(FILE_FIELDS).forEach(function (sheetName) {
    _cache = {};
    var sh = sheet_(sheetName), h = headers_(sheetName);
    all_(sheetName).forEach(function (r) {
      FILE_FIELDS[sheetName].forEach(function (field) {
        var files = parseFiles_(r[field]);
        var pending = files.filter(function (f) { return f.lark && (f.fail || 0) < 3; });
        if (!pending.length) return;
        if (Date.now() - start > MIG_TIME_LIMIT_MS) { left += pending.length; return; }
        var folder = null, changed = false;
        files = files.map(function (f) {
          if (!f.lark || (f.fail || 0) >= 3) return f;
          if (Date.now() - start > MIG_TIME_LIMIT_MS) { left++; return f; }
          try {
            folder = folder || folderPath_(filePath_(sheetName, r));
            var res = UrlFetchApp.fetch(f.url, { headers: { Authorization: 'Bearer ' + larkToken_() }, muteHttpExceptions: true });
            if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode());
            var file = folder.createFile(res.getBlob().setName(f.name));
            changed = true;
            return { id: file.getId(), name: f.name, size: f.size, at: now_(), from: 'lark', token: f.token };
          } catch (e) {
            changed = true; f.fail = (f.fail || 0) + 1; f.err = String(e.message).slice(0, 100);
            if (f.fail < 3) left++;
            return f;
          }
        });
        if (changed) sh.getRange(r._row, h.indexOf(field) + 1).setNumberFormat('@').setValue(JSON.stringify(files));
      });
    });
    bumpVersion_(sheetName);
  });
  _cache = {};
  return left;
}

function scheduleMigration_() {
  clearMigrationTriggers_();
  ScriptApp.newTrigger('migrateFromLark').timeBased().after(60 * 1000).create();
}

function clearMigrationTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'migrateFromLark') ScriptApp.deleteTrigger(t); });
}

function finishMigration_() {
  clearMigrationTriggers_();
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('MIG_FINISHED') === 'Y') return;
  props.setProperty('MIG_FINISHED', 'Y');
  var failed = countLarkFiles_(true);
  var syncOn = setting_('LARK_SYNC') === 'Y';
  if (!syncOn) props.deleteProperty('LARK_APP_SECRET');
  sendMail_(adminEmails_()[0], '[Lark 이관 완료] 데이터·첨부파일 이관이 끝났습니다',
    'Lark Base 이관이 완료되었습니다.\n실패한 첨부파일: ' + failed + '개' + (failed ? ' (시트에서 "lark":1 로 남은 항목은 수동으로 옮겨 주세요)' : '') +
    (syncOn ? '\n\nLark 자동 동기화가 켜져 있어 App Secret을 유지합니다. 전환이 끝나면 [설정 > Lark 연동 끄기]를 누르세요.' :
      '\n\n보안을 위해 저장된 Lark App Secret은 삭제했습니다. Lark 개발자 콘솔에서 Secret 재발급도 권장합니다.'), '이관', '');
}

function countLarkFiles_(failedOnly) {
  var n = 0;
  _cache = {};
  Object.keys(FILE_FIELDS).forEach(function (sheetName) {
    all_(sheetName).forEach(function (r) {
      FILE_FIELDS[sheetName].forEach(function (field) {
        parseFiles_(r[field]).forEach(function (f) { if (f.lark && (failedOnly ? (f.fail || 0) >= 3 : (f.fail || 0) < 3)) n++; });
      });
    });
  });
  return n;
}

function migrationStatus() {
  var msg = '데이터 이관: ' + (PropertiesService.getScriptProperties().getProperty('MIG_DATA_DONE') === 'Y' ? '완료' : '미실행') +
    '\n남은 첨부파일: ' + countLarkFiles_(false) + '개\n실패한 첨부파일: ' + countLarkFiles_(true) + '개' +
    '\n자동 이어하기 예약: ' + (ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'migrateFromLark'; }) ? '있음' : '없음');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/** 이관 중 생성하는 ID (실행 내 중복 방지 → 상호 참조가 깨지지 않도록) */
var _migUsed = null;
function migId_(name) {
  if (!_migUsed) {
    _migUsed = {};
    ['컨설턴트', '신청', '사업장', '교육', '교육이수'].forEach(function (s) { all_(s).forEach(function (r) { _migUsed[r.ID] = 1; }); });
  }
  var id;
  do { id = newId_(name); } while (_migUsed[id]);
  _migUsed[id] = 1;
  return id;
}
