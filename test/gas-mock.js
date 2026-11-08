// Apps Script 서비스 모의 구현 (테스트용)
const fs = require('fs'), vm = require('vm'), crypto = require('crypto'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const BODY = path.join(os.tmpdir(), '_gas_body');

function makeEnv(opts = {}) {
  const outbox = [], triggers = [], props = {}, cache = {}, files = {}, folders = {}, sheetsById = {};
  let idc = 0; const nid = p => p + (++idc).toString(36) + crypto.randomBytes(3).toString('hex');
  let realDownloads = opts.realDownloads || 0, fileFetches = 0;

  class Range {
    constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr: nr || 1, nc: nc || 1 }); }
    getDisplayValues() { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) { const v = (this.sh.data[this.r - 1 + i] || [])[this.c - 1 + j]; row.push(v === undefined || v === null ? '' : String(v)); } out.push(row); } return out; }
    getValues() { return this.getDisplayValues(); }
    setValues(v) { if (v.length !== this.nr || v[0].length !== this.nc) throw new Error(`setValues dims ${v.length}x${v[0].length} vs ${this.nr}x${this.nc}`); v.forEach((row, i) => row.forEach((x, j) => { const R = this.r - 1 + i; this.sh.data[R] = this.sh.data[R] || []; if (typeof x === 'object' && x !== null) throw new Error('object in cell'); this.sh.data[R][this.c - 1 + j] = x; })); this.sh.cols = Math.max(this.sh.cols, this.c - 1 + this.nc); return this; }
    setValue(x) { return this.setValues([[x]]); }
    setNumberFormat() { return this; } setFontWeight() { return this; } setBackground() { return this; } setFontColor() { return this; }
  }
  class Sheet {
    constructor(name, ss) { this.name = name; this.data = []; this.cols = 0; this.ss = ss; this.maxRows = 1000; }
    getName() { return this.name; } setName(n) { this.name = n; return this; }
    getLastRow() { let n = this.data.length; while (n > 0 && !(this.data[n - 1] || []).some(v => v !== '' && v !== undefined && v !== null)) n--; return n; }
    getLastColumn() { let m = 0; this.data.forEach(r => { for (let j = r.length; j > 0; j--) if (r[j - 1] !== '' && r[j - 1] !== undefined) { m = Math.max(m, j); break; } }); return m; }
    getRange(r, c, nr, nc) { if (typeof r === 'string') throw new Error('A1 not supported'); return new Range(this, r, c, nr, nc); }
    appendRow(row) { this.data[this.getLastRow()] = row.map(String); return this; }
    deleteRow(r) { this.data.splice(r - 1, 1); }
    deleteRows(r, n) { this.data.splice(r - 1, n); }
    getMaxColumns() { return Math.max(26, this.cols); } deleteColumns() { this.cols = this.getLastColumn(); }
    getMaxRows() { return this.maxRows; } setFrozenRows() {} hideSheet() {}
  }
  class SS {
    constructor(name) { this.id = nid('ss'); this.name = name; this.sheets = [new Sheet('Sheet1', this)]; sheetsById[this.id] = this; files[this.id] = { setTrashed() {}, getSize: () => 0 }; }
    getId() { return this.id; } getSheets() { return this.sheets; }
    getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
    insertSheet(n) { const s = new Sheet(n, this); this.sheets.push(s); return s; }
    deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); }
    toast() {}
  }
  const active = new SS('DB');

  class Blob { constructor(bytes, mime, name) { this.bytes = Buffer.from(bytes || []); this.mime = mime; this.name = name; } getBytes() { return this.bytes; } getContentType() { return this.mime; } setName(n) { this.name = n; return this; } getName() { return this.name; } }
  class File { constructor(blob, parent) { this.id = nid('f'); this.blob = blob; this.parent = parent; this.trashed = false; files[this.id] = this; } getId() { return this.id; } getName() { return this.blob.name; } getSize() { return this.blob.bytes.length; } getBlob() { return this.blob; } getUrl() { return 'https://drive/' + this.id; } setTrashed(t) { this.trashed = t; } }
  class Folder {
    constructor(name, parent) { this.id = nid('d'); this.name = name; this.parent = parent; this.children = []; this.files = []; folders[this.id] = this; }
    getId() { return this.id; } getName() { return this.name; }
    getFoldersByName(n) { const l = this.children.filter(c => c.name === n); let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; }
    createFolder(n) { const f = new Folder(n, this); this.children.push(f); return f; }
    createFile(b) { const f = new File(b, this); this.files.push(f); return f; }
    path() { return (this.parent ? this.parent.path() + '/' : '') + this.name; }
  }
  const driveRoot = new Folder('MyDrive', null);
  const fmt = (d, tz, f) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]));
    return f.replace('yyyy', p.year).replace('yy', p.year.slice(2)).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second);
  };
  const ctx = {
    console, JSON, Math, Date, Object, Array, String, Number, Error, RegExp, parseInt, parseFloat, isNaN, Promise,
    Logger: { log: (...a) => opts.quiet || console.log('[Logger]', ...a) },
    SpreadsheetApp: { getActiveSpreadsheet: () => active, openById: id => sheetsById[id], create: n => new SS(n), flush() {}, getUi() { throw new Error('no ui'); } },
    DriveApp: { createFolder: n => driveRoot.createFolder(n), getFolderById: id => { if (!folders[id]) throw new Error('no folder'); return folders[id]; }, getFileById: id => { if (!files[id]) throw new Error('no file ' + id); return files[id]; } },
    Utilities: {
      formatDate: fmt, getUuid: () => crypto.randomUUID(),
      base64Decode: s => Array.from(Buffer.from(s, 'base64')), base64Encode: b => Buffer.from(b).toString('base64'),
      newBlob: (bytes, mime, name) => new Blob(bytes, mime, name),
      computeHmacSha256Signature: (v, k) => Array.from(crypto.createHmac('sha256', k).update(v).digest()).map(b => b > 127 ? b - 256 : b)
    },
    UrlFetchApp: {
      fetch(url, o = {}) {
        if (/drive\/v1\/medias/.test(url)) {
          fileFetches++;
          if (realDownloads <= 0) return { getResponseCode: () => 200, getBlob: () => new Blob(Buffer.from('stub'), 'application/pdf', 'x') };
          realDownloads--;
        }
        if (/api\.solapi\.com/.test(url)) { (ctx.__sms = ctx.__sms || []).push({ url, headers: o.headers, body: JSON.parse(o.payload) }); const rp = ctx.__smsReply ? ctx.__smsReply() : [200, '{"statusCode":"2000","statusMessage":"정상 접수"}']; return { getResponseCode: () => rp[0], getContentText: () => rp[1] }; }
        if (/docs\.google\.com\/spreadsheets/.test(url)) return { getResponseCode: () => 200, getBlob: () => new Blob(Buffer.from('PK-xlsx'), 'application/xlsx', 'x.xlsx') };
        const args = ['-sS', '-m', '60', '-o', BODY, '-w', '%{http_code}', '-X', (o.method || 'get').toUpperCase()];
        Object.entries(o.headers || {}).forEach(([k, v]) => args.push('-H', k + ': ' + v));
        if (o.contentType) args.push('-H', 'Content-Type: ' + o.contentType);
        if (o.payload) args.push('--data-binary', o.payload);
        args.push(url);
        const code = Number(execFileSync('curl', args).toString());
        const body = fs.readFileSync(BODY);
        return { getResponseCode: () => code, getContentText: () => body.toString('utf8'), getBlob: () => new Blob(body, 'application/octet-stream', 'dl') };
      }
    },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] === undefined ? null : cache[k], put: (k, v) => { if (String(v).length > 100000) throw new Error('cache value too large'); cache[k] = String(v); }, remove: k => { delete cache[k]; },
      getAll: ks => { const o = {}; ks.forEach(k => { if (cache[k] !== undefined) o[k] = cache[k]; }); return o; },
      putAll: o => { Object.keys(o).forEach(k => { if (String(o[k]).length > 100000) throw new Error('cache value too large'); cache[k] = String(o[k]); }); } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] === undefined ? null : props[k], setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; }, getProperties: () => Object.assign({}, props) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock() { return true; }, releaseLock() {} }) },
    MailApp: { sendEmail: o => outbox.push(o), getRemainingDailyQuota: () => opts.quota === undefined ? 100 : opts.quota },
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(), deleteTrigger: t => triggers.splice(triggers.indexOf(t), 1),
      newTrigger: fn => { const t = { fn, getHandlerFunction: () => fn }; const b = { timeBased: () => b, after: () => b, everyMinutes: () => b, everyDays: () => b, atHour: () => b, inTimezone: () => b, create: () => { triggers.push(t); return t; } }; return b; },
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TEST/exec' }), getOAuthToken: () => 'tok'
    },
    HtmlService: {},
    CalendarApp: (() => { const evs = {}; let n = 0; const mk = (t, s, e, o) => { const id = 'ev' + (++n); const ev = { id, t, s, e, o, getId: () => id, setTitle(x) { ev.t = x; }, setTime(a, b) { ev.s = a; ev.e = b; }, setLocation() {}, setDescription() {}, deleteEvent() { delete evs[id]; } }; evs[id] = ev; return ev; };
      const cal = { createEvent: mk, getEventById: id => evs[id] || null }; return { getDefaultCalendar: () => cal, getCalendarById: () => null, _evs: evs }; })()
  };
  vm.createContext(ctx);
  fs.readdirSync(path.join(__dirname, '..', 'app')).filter(f => f.endsWith('.gs')).sort((a, b) => (a === 'Code.gs' ? -1 : b === 'Code.gs' ? 1 : a.localeCompare(b))).forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app', f), 'utf8'), ctx, { filename: f }));
  return { ctx, outbox, triggers, props, cache, files, folders, active, driveRoot, stats: () => ({ fileFetches }) };
}
module.exports = { makeEnv };
