/**
 * 세부 기능: 방문일정, 협약·착수 서류, 검수 체크리스트, 만족도 설문, 교육과정, 수당 정산,
 * 배정 추천, 월간 실적, 공지·자료실, 문의 게시판, 기업 진행조회, 문자(솔라피)
 */

var DEFAULT_FEE_RULES = [
  ['중간보고 검수완료', '중간', '', '균등', '금액을 입력하면 해당 보고서가 검수완료될 때 정산 내역이 생깁니다'],
  ['최종보고 검수완료', '최종', '', '균등', ''],
  ['사후관리 검수완료', '사후', '', '균등', '']
];

/* ============================== 공통 ============================== */

function lines_(key) {
  return String(setting_(key) || '').split(/\r?\n/).map(function (x) { return x.trim(); }).filter(String);
}
function docTypes_() { return String(setting_('DOC_TYPES') || '').split(',').map(function (x) { return x.trim(); }).filter(String); }
function checklist_(kind) { return lines_('CHECKLIST_' + kind); }
function ym_(d) { return String(d || '').slice(0, 7); }
function num_(v) { var n = parseFloat(String(v === undefined ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; }

function companyOf_(p) { return (p && p['신청ID'] && find_('신청', p['신청ID'])) || {}; }

function adminBadges_() {
  return {
    문의: all_('문의').filter(function (q) { return q['상태'] !== '완료'; }).length,
    서류: all_('서류').filter(function (d) { return d['확인'] === '대기'; }).length,
    교육신청: all_('교육신청').filter(function (r) { return r['상태'] === '신청'; }).length,
    정산: all_('정산').filter(function (f) { return f['상태'] === '미지급' || f['상태'] === '지급예정'; }).length
  };
}

function consultantBadges_(s) {
  var c = find_('컨설턴트', s.consultantId);
  var read = {};
  all_('공지읽음').forEach(function (r) { if (r['컨설턴트ID'] === s.consultantId) read[r['공지ID']] = 1; });
  return {
    공지: visibleNotices_(c).filter(function (n) { return !read[n.ID]; }).length,
    문의: all_('문의').filter(function (q) { return q['컨설턴트ID'] === s.consultantId && q['상태'] !== '완료'; }).length,
    교육: all_('교육').filter(function (t) { return trainingOpen_(t); }).length
  };
}

/** 사업장 상세의 추가 정보 */
function projectExtras_(id, s) {
  var admin = s.role === 'admin';
  var p = find_('사업장', id) || {};
  var rawDocs = all_('서류').filter(function (d) { return d['사업장ID'] === id; });
  var docs = rawDocs.map(strip_).sort(function (a, b) { return a['제출일'] < b['제출일'] ? 1 : -1; });
  var visits = all_('일정').filter(function (v) { return v['사업장ID'] === id; }).map(strip_)
    .sort(function (a, b) { return (a['일자'] + a['시작']) < (b['일자'] + b['시작']) ? -1 : 1; });
  var out = { docs: docs, docTypes: docTypes_(), docSummary: docSummary_(rawDocs), visits: visits };
  if (admin) {
    out.surveys = all_('만족도').filter(function (x) { return x['사업장ID'] === id; }).map(function (x) { var o = strip_(x); delete o['토큰']; return o; });
    out.settlements = all_('정산').filter(function (f) { return f['사업장ID'] === id; }).map(function (f) { var o = strip_(f); o._컨설턴트명 = consultantNames_(f['컨설턴트ID']); return o; });
    out.recommend = null;
  } else {
    out.settlements = all_('정산').filter(function (f) { return f['사업장ID'] === id && f['컨설턴트ID'] === s.consultantId; }).map(strip_);
  }
  var a = companyOf_(p);
  out.contactPhone = !!a['담당자연락처'];
  return out;
}

/* ============================== 문자 (솔라피) ============================== */

function smsReady_() {
  var pr = PropertiesService.getScriptProperties();
  return setting_('SMS_ENABLED') === 'Y' && !!pr.getProperty('SMS_API_KEY') && !!pr.getProperty('SMS_API_SECRET') && !!String(setting_('SMS_SENDER')).replace(/\D/g, '');
}

/** 문자 1건 발송. 설정이 꺼져 있으면 조용히 건너뜀 */
function sendSms_(to, text, kind, relId) {
  var phone = String(to || '').replace(/\D/g, '');
  if (!phone || !smsReady_()) return false;
  var pr = PropertiesService.getScriptProperties();
  var result = 'OK';
  try {
    var key = pr.getProperty('SMS_API_KEY'), secret = pr.getProperty('SMS_API_SECRET');
    var date = new Date().toISOString(), salt = Utilities.getUuid().replace(/-/g, '');
    var sig = Utilities.computeHmacSha256Signature(date + salt, secret).map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
    var res = UrlFetchApp.fetch('https://api.solapi.com/messages/v4/send', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'HMAC-SHA256 apiKey=' + key + ', date=' + date + ', salt=' + salt + ', signature=' + sig },
      payload: JSON.stringify({ message: { to: phone, from: String(setting_('SMS_SENDER')).replace(/\D/g, ''), text: String(text).slice(0, 1000) } })
    });
    var code = res.getResponseCode();
    if (code < 200 || code >= 300) throw new Error('HTTP ' + code + ' ' + res.getContentText().slice(0, 150));
  } catch (e) { result = '실패: ' + e.message; }
  try { sheet_('메일이력').appendRow([now_(), phone, String(text).slice(0, 60), 'SMS:' + (kind || ''), relId || '', result]); } catch (e2) {}
  return result === 'OK';
}

function adminSaveSmsKeys(token, apiKey, apiSecret) {
  var s = session_(token, 'admin');
  var pr = PropertiesService.getScriptProperties();
  if (apiKey) pr.setProperty('SMS_API_KEY', String(apiKey).trim());
  if (apiSecret) pr.setProperty('SMS_API_SECRET', String(apiSecret).trim());
  audit_(s.email, '문자 키 저장', '', '', '', '', '');
  return { ready: smsReady_(), hasKey: !!pr.getProperty('SMS_API_KEY') };
}

function adminSmsTest(token, phone) {
  session_(token, 'admin');
  if (!smsReady_()) throw new Error('문자 설정이 완료되지 않았습니다(SMS_ENABLED=Y, 발신번호, API 키 확인).');
  if (!sendSms_(phone, '[컨설팅 관리] 문자 발송 테스트입니다.', '테스트', '')) throw new Error('발송 실패 — 메일 탭 발송 이력에서 오류를 확인하세요.');
  return true;
}

/** 일괄 문자: list = [{phone, id, vars}] */
function adminSendSmsBulk(token, list, text) {
  var s = session_(token, 'admin');
  if (!smsReady_()) throw new Error('문자 설정이 완료되지 않았습니다.');
  var ok = 0;
  (list || []).forEach(function (t) {
    var vars = Object.assign({ 앱URL: appUrl_(), 기관명: setting_('ORG_NAME') }, t.vars || {});
    if (sendSms_(t.phone, fill_(text, vars), '일괄문자', t.id || '')) ok++;
  });
  audit_(s.email, '문자발송', '', '', '', '', ok + '건');
  return { sent: ok };
}

/* ============================== 방문 일정 ============================== */

function calendar_() {
  var id = setting_('CALENDAR_ID');
  var cal = id ? CalendarApp.getCalendarById(id) : null;
  return cal || CalendarApp.getDefaultCalendar();
}

function visitTimes_(v) {
  var d = String(v['일자']).slice(0, 10), st = /^\d{1,2}:\d{2}$/.test(v['시작']) ? v['시작'] : '10:00';
  var en = /^\d{1,2}:\d{2}$/.test(v['종료']) ? v['종료'] : '';
  var start = new Date(d + 'T' + ('0' + st).slice(-5) + ':00+09:00');
  var end = en ? new Date(d + 'T' + ('0' + en).slice(-5) + ':00+09:00') : new Date(start.getTime() + 2 * 3600000);
  if (end <= start) end = new Date(start.getTime() + 3600000);
  return { start: start, end: end };
}

function syncVisitCalendar_(v, p) {
  if (setting_('CALENDAR_SYNC') !== 'Y') return v['캘린더ID'] || '';
  try {
    var cal = calendar_(), ev = null;
    if (v['캘린더ID']) { try { ev = cal.getEventById(v['캘린더ID']); } catch (e) {} }
    if (v['상태'] === '취소') { if (ev) ev.deleteEvent(); return ''; }
    var t = visitTimes_(v);
    var title = '[' + (v['방식'] || '방문') + '] ' + p['사업장명'] + ' · ' + consultantNames_(v['컨설턴트ID'] || p['컨설턴트ID']);
    var desc = '차수: ' + p['차수'] + '\n내용: ' + (v['내용'] || '') + '\n앱: ' + appUrl_();
    if (ev) { ev.setTitle(title); ev.setTime(t.start, t.end); ev.setLocation(v['장소'] || ''); ev.setDescription(desc); return ev.getId(); }
    return cal.createEvent(title, t.start, t.end, { location: v['장소'] || '', description: desc }).getId();
  } catch (e) { Logger.log('캘린더 등록 실패: ' + e.message); return v['캘린더ID'] || ''; }
}

function saveVisit(token, visit) {
  var s = session_(token);
  var p = ownProject_(s, visit['사업장ID']);
  var d = clean_(visit, ['일자', '시작', '종료', '방식', '장소', '내용', '상태']);
  req_(d, ['일자']);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d['일자'])) throw new Error('일자를 확인해 주세요.');
  d['상태'] = d['상태'] || '예정';
  var row;
  if (visit.ID) {
    var ex = find_('일정', visit.ID);
    if (!ex || ex['사업장ID'] !== p.ID) throw new Error('일정 없음');
    row = update_('일정', visit.ID, d, s.email);
  } else {
    d['사업장ID'] = p.ID; d['컨설턴트ID'] = s.consultantId || splitIds_(p['컨설턴트ID'])[0] || '';
    d['작성자'] = s.email; d['작성일'] = now_();
    row = insert_('일정', d, s.email);
    row = find_('일정', row.ID);
  }
  var evId = syncVisitCalendar_(row, p);
  if (evId !== row['캘린더ID']) update_('일정', row.ID, { 캘린더ID: evId });
  return getProjectDetail(token, p.ID);
}

function deleteVisit(token, id) {
  var s = session_(token);
  var v = find_('일정', id);
  if (!v) throw new Error('일정 없음');
  var p = ownProject_(s, v['사업장ID']);
  if (v['캘린더ID']) { try { var ev = calendar_().getEventById(v['캘린더ID']); if (ev) ev.deleteEvent(); } catch (e) {} }
  remove_('일정', id, s.email);
  return getProjectDetail(token, p.ID);
}

/** 사업장 담당자에게 방문 안내(메일 + 문자) */
function notifyVisit(token, id) {
  var s = session_(token);
  var v = find_('일정', id);
  if (!v) throw new Error('일정 없음');
  var p = ownProject_(s, v['사업장ID']), a = companyOf_(p);
  if (!a['담당자이메일'] && !a['담당자연락처']) throw new Error('사업장 담당자 연락처가 없습니다.');
  var cname = consultantNames_(v['컨설턴트ID'] || p['컨설턴트ID']);
  var when = v['일자'] + ' ' + (v['시작'] || '') + (v['종료'] ? '~' + v['종료'] : '');
  var sent = 0;
  if (a['담당자이메일'] && sendMail_(a['담당자이메일'], '[산업일자리전환 컨설팅] ' + p['사업장명'] + ' 컨설팅 ' + (v['방식'] || '방문') + ' 일정 안내',
    (a['담당자명'] || '') + '님, 안녕하세요.\n\n산업일자리전환 컨설팅 일정을 안내드립니다.\n\n■ 일시: ' + when + '\n■ 방식: ' + (v['방식'] || '방문') +
    '\n■ 장소: ' + (v['장소'] || '-') + '\n■ 컨설턴트: ' + cname + '\n■ 내용: ' + (v['내용'] || '-') +
    '\n\n일정 변경이 필요하시면 담당 컨설턴트에게 연락 주세요.\n\n' + setting_('ORG_NAME'), '방문안내', id)) sent++;
  if (setting_('SMS_ON_VISIT') === 'Y' && sendSms_(a['담당자연락처'], '[산업일자리전환 컨설팅] ' + p['사업장명'] + ' ' + (v['방식'] || '방문') + ' 일정: ' + when + (v['장소'] ? ' / ' + v['장소'] : '') + ' / 컨설턴트 ' + cname, '방문안내', id)) sent++;
  if (!sent) throw new Error('안내를 보내지 못했습니다.');
  update_('일정', id, { 안내발송: now_() }, s.email);
  return getProjectDetail(token, p.ID);
}

function markVisitDone_(projectId, date, user) {
  all_('일정').filter(function (v) { return v['사업장ID'] === projectId && v['일자'] === date && v['상태'] === '예정'; })
    .forEach(function (v) { update_('일정', v.ID, { 상태: '완료' }, user); });
}

/** 일정 목록 (달력용): from~to (yyyy-MM-dd) */
function listVisits(token, from, to) {
  var s = session_(token);
  var mine = s.role === 'admin' ? null : all_('사업장').filter(function (p) { return splitIds_(p['컨설턴트ID']).indexOf(s.consultantId) >= 0; }).map(function (p) { return p.ID; });
  var pm = {};
  all_('사업장').forEach(function (p) { pm[p.ID] = p; });
  return all_('일정').filter(function (v) {
    return (!from || v['일자'] >= from) && (!to || v['일자'] <= to) && (!mine || mine.indexOf(v['사업장ID']) >= 0);
  }).map(function (v) {
    var o = strip_(v), p = pm[v['사업장ID']] || {};
    o._사업장명 = p['사업장명'] || ''; o._차수 = p['차수'] || ''; o._컨설턴트명 = consultantNames_(v['컨설턴트ID']);
    return o;
  });
}

/* ============================== 협약·착수 서류 ============================== */

function docSummaryEmpty_() { return { 확인: 0, 대기: 0, 반려: 0, 누락: docTypes_().length, 전체: docTypes_().length }; }

function docSummary_(docs) {
  var types = docTypes_(), latest = {};
  docs.forEach(function (d) {
    var cur = latest[d['종류']];
    if (!cur || cur['제출일'] < d['제출일'] || (cur['제출일'] === d['제출일'] && (cur._row || 0) <= (d._row || 0))) latest[d['종류']] = d;
  });
  var o = { 확인: 0, 대기: 0, 반려: 0, 누락: 0, 전체: types.length };
  types.forEach(function (t) { var d = latest[t]; if (!d) o.누락++; else o[d['확인'] || '대기']++; });
  return o;
}

function docSummaryMap_() {
  var by = {};
  all_('서류').forEach(function (d) { (by[d['사업장ID']] = by[d['사업장ID']] || []).push(d); });
  var out = {};
  Object.keys(by).forEach(function (k) { out[k] = docSummary_(by[k]); });
  return out;
}

function uploadDoc(token, projectId, kind, files) {
  var s = session_(token);
  var p = ownProject_(s, projectId);
  if (docTypes_().indexOf(kind) < 0) throw new Error('서류 종류를 선택해 주세요.');
  if (!files || !files.length) throw new Error('파일을 첨부해 주세요.');
  var saved = saveFiles_(['사업장', p['연도'] || '기타', p['차수'] || '미정', p['사업장명'], '서류'], files);
  insert_('서류', { 사업장ID: p.ID, 종류: kind, 파일: saved, 제출자: s.email, 제출일: now_(), 확인: s.role === 'admin' ? '확인' : '대기', 확인자: s.role === 'admin' ? s.email : '', 확인일: s.role === 'admin' ? now_() : '' }, s.email);
  return getProjectDetail(token, p.ID);
}

function adminReviewDoc(token, docId, result, comment) {
  var s = session_(token, 'admin');
  if (['확인', '반려', '대기'].indexOf(result) < 0) throw new Error('결과를 선택해 주세요.');
  var d = find_('서류', docId);
  if (!d) throw new Error('서류 없음');
  update_('서류', docId, { 확인: result, 의견: comment || '', 확인자: s.email, 확인일: now_() }, s.email);
  if (result === '반려') {
    var p = find_('사업장', d['사업장ID']);
    splitIds_(p['컨설턴트ID']).forEach(function (cid) {
      var c = find_('컨설턴트', cid);
      if (c && c['이메일']) sendMail_(c['이메일'], '[서류 반려] ' + p['사업장명'] + ' ' + d['종류'],
        c['성명'] + ' 컨설턴트님,\n\n' + p['사업장명'] + '의 ' + d['종류'] + '가 반려되었습니다.' + (comment ? '\n\n사유: ' + comment : '') + '\n\n다시 올려 주세요: ' + appUrl_(), '서류반려', docId);
    });
  }
  return getProjectDetail(token, d['사업장ID']);
}

/* ============================== 만족도 설문 ============================== */

function surveyUrl_(t) {
  var u = appUrl_();
  return /script\.google(usercontent)?\.com/.test(u) ? u + '?page=survey&t=' + t : u + '/survey?t=' + t;
}

function surveyMap_() {
  var bp = {}, bc = {};
  all_('만족도').forEach(function (x) {
    if (!x['응답일']) return;
    var v = num_(x['종합']);
    (bp[x['사업장ID']] = bp[x['사업장ID']] || []).push(v);
    splitIds_(x['컨설턴트ID']).forEach(function (c) { (bc[c] = bc[c] || []).push(v); });
  });
  var avg = function (m) { var o = {}; Object.keys(m).forEach(function (k) { var a = m[k]; o[k] = { 평균: Math.round(a.reduce(function (s, x) { return s + x; }, 0) / a.length * 10) / 10, 응답: a.length }; }); return o; };
  return { byProject: avg(bp), byConsultant: avg(bc) };
}

/** 설문 발송 (사업장 여러 곳) */
function adminSendSurvey(token, projectIds, resend) {
  var s = session_(token, 'admin');
  var sent = 0, skipped = [];
  (projectIds || []).forEach(function (pid) {
    var p = find_('사업장', pid);
    if (!p) return;
    var a = companyOf_(p);
    if (!a['담당자이메일']) { skipped.push(p['사업장명'] + '(이메일 없음)'); return; }
    var ex = all_('만족도').filter(function (x) { return x['사업장ID'] === pid; });
    if (ex.some(function (x) { return x['응답일']; })) { skipped.push(p['사업장명'] + '(응답 완료)'); return; }
    var row = ex[0];
    if (row && !resend) { skipped.push(p['사업장명'] + '(이미 발송)'); return; }
    if (!row) row = insert_('만족도', { 사업장ID: pid, 컨설턴트ID: p['컨설턴트ID'], 토큰: Utilities.getUuid().replace(/-/g, ''), 발송일: now_() }, s.email);
    else update_('만족도', row.ID, { 발송일: now_() }, s.email);
    var vars = { 사업장명: p['사업장명'], 담당자명: a['담당자명'] || '', 기관명: setting_('ORG_NAME'), 설문URL: surveyUrl_(row['토큰']), 컨설턴트명: consultantNames_(p['컨설턴트ID']) };
    if (sendMail_(a['담당자이메일'], fill_(setting_('SURVEY_SUBJECT'), vars), fill_(setting_('SURVEY_BODY'), vars), '만족도설문', pid)) sent++;
  });
  return { sent: sent, skipped: skipped };
}

function getSurvey(t) {
  t = String(t || '').replace(/[^0-9a-f]/gi, '');
  var x = t && find_('만족도', t, '토큰');
  if (!x) throw new Error('유효하지 않은 설문 링크입니다.');
  var p = find_('사업장', x['사업장ID']) || {};
  return { 사업장명: p['사업장명'], 컨설턴트명: consultantNames_(x['컨설턴트ID']), questions: lines_('SURVEY_QUESTIONS'), answered: !!x['응답일'], org: setting_('ORG_NAME') };
}

function submitSurvey(t, scores, comment, name) {
  t = String(t || '').replace(/[^0-9a-f]/gi, '');
  var x = t && find_('만족도', t, '토큰');
  if (!x) throw new Error('유효하지 않은 설문 링크입니다.');
  if (x['응답일']) throw new Error('이미 응답하셨습니다. 감사합니다.');
  var q = lines_('SURVEY_QUESTIONS');
  if (!Array.isArray(scores) || scores.length !== q.length) throw new Error('모든 문항에 응답해 주세요.');
  var sc = scores.map(function (v) { var n = Number(v); if (!(n >= 1 && n <= 5)) throw new Error('모든 문항에 응답해 주세요.'); return n; });
  var avg = Math.round(sc.reduce(function (a, b) { return a + b; }, 0) / sc.length * 100) / 100;
  update_('만족도', x.ID, { 점수: q.map(function (qq, i) { return { 문항: qq, 점수: sc[i] }; }), 종합: String(avg), 의견: String(comment || '').slice(0, 2000), 응답자: String(name || '').slice(0, 50), 응답일: now_() }, '설문응답');
  return { ok: true };
}

/* ============================== 교육과정 ============================== */

var EDIT_TRAINING = ['교육명', '일자', '시간', '비고', '방식', '장소', '정원', '신청시작', '신청마감', '상태', '필수', '설명'];

function adminSaveTrainingFull(token, t) {
  var s = session_(token, 'admin');
  var d = clean_(t, EDIT_TRAINING);
  req_(d, ['교육명']);
  d['상태'] = d['상태'] || '모집';
  if (t.ID) update_('교육', t.ID, d, s.email); else insert_('교육', d, s.email);
  return trainingList_(s);
}

function trainingList_(s) {
  var apps = all_('교육신청'), recs = all_('교육이수');
  return all_('교육').map(function (t) {
    var o = strip_(t);
    var a = apps.filter(function (r) { return r['교육ID'] === t.ID && r['상태'] !== '취소'; });
    o._신청 = a.length;
    o._수료 = recs.filter(function (r) { return r['교육ID'] === t.ID; }).length;
    if (s.role !== 'admin' || s.consultantId) {
      var mine = apps.filter(function (r) { return r['교육ID'] === t.ID && r['컨설턴트ID'] === s.consultantId; })[0];
      o._내신청 = mine ? mine['상태'] : '';
      var rec = recs.filter(function (r) { return r['교육ID'] === t.ID && r['컨설턴트ID'] === s.consultantId; })[0];
      o._내이수 = rec ? rec['이수시간'] : '';
    }
    o._신청가능 = trainingOpen_(t);
    return o;
  }).sort(function (a, b) { return a['일자'] < b['일자'] ? 1 : -1; });
}

function trainingOpen_(t) {
  var today = today_();
  if ((t['상태'] || '모집') !== '모집') return false;
  if (t['일자'] && t['일자'] < today) return false;
  if (t['신청시작'] && today < t['신청시작']) return false;
  if (t['신청마감'] && today > t['신청마감']) return false;
  return true;
}

function listTrainings(token) { return trainingList_(session_(token)); }

function applyTraining(token, trainingId, cancel) {
  var s = session_(token);
  if (!s.consultantId) throw new Error('컨설턴트 계정만 신청할 수 있습니다.');
  var t = find_('교육', trainingId);
  if (!t) throw new Error('교육 없음');
  var ex = all_('교육신청').filter(function (r) { return r['교육ID'] === trainingId && r['컨설턴트ID'] === s.consultantId; })[0];
  if (cancel) {
    if (!ex || ex['상태'] !== '신청') throw new Error('취소할 신청이 없습니다.');
    update_('교육신청', ex.ID, { 상태: '취소' }, s.email);
  } else {
    if (!trainingOpen_(t)) throw new Error('신청 기간이 아닙니다.');
    if (ex && ex['상태'] === '신청') throw new Error('이미 신청했습니다.');
    var cap = num_(t['정원']);
    var cnt = all_('교육신청').filter(function (r) { return r['교육ID'] === trainingId && r['상태'] === '신청'; }).length;
    if (cap && cnt >= cap) throw new Error('정원(' + cap + '명)이 찼습니다.');
    if (ex) update_('교육신청', ex.ID, { 상태: '신청', 신청일: now_() }, s.email);
    else insert_('교육신청', { 교육ID: trainingId, 컨설턴트ID: s.consultantId, 신청일: now_(), 상태: '신청' }, s.email);
  }
  return trainingList_(s);
}

function adminTrainingDetail(token, trainingId) {
  session_(token, 'admin');
  var t = find_('교육', trainingId);
  if (!t) throw new Error('교육 없음');
  var recs = {};
  all_('교육이수').forEach(function (r) { if (r['교육ID'] === trainingId) recs[r['컨설턴트ID']] = r['이수시간']; });
  var apps = all_('교육신청').filter(function (r) { return r['교육ID'] === trainingId; }).map(function (r) {
    var c = find_('컨설턴트', r['컨설턴트ID']) || {};
    return { ID: r.ID, 컨설턴트ID: r['컨설턴트ID'], 성명: c['성명'] || '', 이메일: c['이메일'] || '', 상태: r['상태'], 신청일: r['신청일'], 이수시간: recs[r['컨설턴트ID']] || '' };
  });
  Object.keys(recs).forEach(function (cid) {
    if (apps.some(function (a) { return a['컨설턴트ID'] === cid; })) return;
    var c = find_('컨설턴트', cid) || {};
    apps.push({ ID: '', 컨설턴트ID: cid, 성명: c['성명'] || '', 이메일: c['이메일'] || '', 상태: '(신청 없음)', 신청일: '', 이수시간: recs[cid] });
  });
  return { training: strip_(t), applicants: apps };
}

/** 출석 처리: 수료 → 이수시간 기록, 불참 → 이수 삭제 */
function adminSetAttendance(token, trainingId, consultantIds, attended, hours) {
  var s = session_(token, 'admin');
  var t = find_('교육', trainingId);
  if (!t) throw new Error('교육 없음');
  var h = String(hours || t['시간'] || '').replace(/[^0-9.]/g, '');
  if (attended && !h) throw new Error('교육 시간을 입력해 주세요(교육 정보의 시간 또는 직접 입력).');
  (consultantIds || []).forEach(function (cid) {
    var ap = all_('교육신청').filter(function (r) { return r['교육ID'] === trainingId && r['컨설턴트ID'] === cid; })[0];
    if (ap) update_('교육신청', ap.ID, { 상태: attended ? '수료' : '불참' }, s.email);
    var ex = all_('교육이수').filter(function (r) { return r['교육ID'] === trainingId && r['컨설턴트ID'] === cid; })[0];
    if (attended) { if (ex) update_('교육이수', ex.ID, { 이수시간: h }, s.email); else insert_('교육이수', { 컨설턴트ID: cid, 교육ID: trainingId, 이수시간: h, 비고: '출석' }, s.email); }
    else if (ex) remove_('교육이수', ex.ID, s.email);
  });
  return adminTrainingDetail(token, trainingId);
}

/* ============================== 수당 정산 ============================== */

function feeRules_() {
  return all_('수당기준').map(strip_).filter(function (r) { return r['항목'] && num_(r['금액']) > 0; });
}

/** 사업장의 검수완료 상태를 보고 정산 내역 생성 (중복 없이) */
function syncSettlements_(projectId) {
  var p = find_('사업장', projectId);
  if (!p || p['차수'] === '취소') return 0;
  var rules = feeRules_(), made = 0;
  if (!rules.length) return 0;
  var cids = splitIds_(p['컨설턴트ID']);
  if (!cids.length) return 0;
  var ex = all_('정산').filter(function (f) { return f['사업장ID'] === projectId; });
  var rows = [];
  rules.forEach(function (rule) {
    var col = REPORT_COLS[rule['보고서']];
    if (!col || p[col.status] !== '검수완료') return;
    var amt = num_(rule['금액']);
    cids.forEach(function (cid) {
      if (ex.some(function (f) { return f['컨설턴트ID'] === cid && f['항목'] === rule['항목']; })) return;
      var share = rule['분배'] === '전액' ? amt : Math.round(amt / cids.length);
      rows.push({ 사업장ID: projectId, 컨설턴트ID: cid, 항목: rule['항목'], 금액: String(share), 발생일: today_(), 상태: '미지급', 작성일: now_() });
    });
  });
  if (rows.length) { insertMany_('정산', rows, null); made = rows.length; }
  return made;
}

function adminRebuildSettlements(token) {
  session_(token, 'admin');
  var n = 0;
  all_('사업장').forEach(function (p) { n += syncSettlements_(p.ID); _cache = {}; });
  return { created: n, list: adminListSettlements(token).list };
}

function adminFeeRules(token) { session_(token, 'admin'); return all_('수당기준').map(strip_); }

function adminSaveFeeRules(token, rules) {
  var s = session_(token, 'admin');
  var sh = sheet_('수당기준'), h = headers_('수당기준');
  var rows = (rules || []).filter(function (r) { return String(r['항목'] || '').trim(); }).map(function (r) {
    if (['중간', '최종', '사후'].indexOf(r['보고서']) < 0) throw new Error('보고서는 중간·최종·사후 중 하나여야 합니다: ' + r['항목']);
    return h.map(function (k) { return k === '금액' ? String(num_(r[k]) || '') : String(r[k] || '').trim() || (k === '분배' ? '균등' : ''); });
  });
  var lr = sh.getLastRow();
  if (lr > 1) sh.getRange(2, 1, lr - 1, h.length).setValues(new Array(lr - 1).fill(0).map(function () { return h.map(function () { return ''; }); }));
  if (rows.length) sh.getRange(2, 1, rows.length, h.length).setNumberFormat('@').setValues(rows);
  delete _cache['수당기준'];
  audit_(s.email, '수당기준 저장', '수당기준', '', '', '', rows.length + '개');
  return all_('수당기준').map(strip_).filter(function (r) { return r['항목']; });
}

function adminListSettlements(token) {
  session_(token, 'admin');
  var pm = {}, cm = {};
  all_('사업장').forEach(function (p) { pm[p.ID] = p; });
  all_('컨설턴트').forEach(function (c) { cm[c.ID] = c; });
  return {
    list: all_('정산').map(function (f) {
      var o = strip_(f), p = pm[f['사업장ID']] || {}, c = cm[f['컨설턴트ID']] || {};
      o._사업장명 = p['사업장명'] || ''; o._차수 = p['차수'] || ''; o._연도 = p['연도'] || '';
      o._컨설턴트명 = c['성명'] || ''; o._구매처코드 = c['구매처코드'] || '';
      return o;
    }),
    rules: all_('수당기준').map(strip_).filter(function (r) { return r['항목']; })
  };
}

function adminUpdateSettlements(token, ids, patch) {
  var s = session_(token, 'admin');
  var d = clean_(patch, ['상태', '지급일', '금액', '비고']);
  if (d['상태'] === '지급완료' && !d['지급일']) d['지급일'] = today_();
  (ids || []).forEach(function (id) { update_('정산', id, d, s.email); });
  return adminListSettlements(token);
}

function adminAddSettlement(token, f) {
  var s = session_(token, 'admin');
  var d = clean_(f, ['사업장ID', '컨설턴트ID', '항목', '금액', '발생일', '비고']);
  req_(d, ['사업장ID', '컨설턴트ID', '항목', '금액']);
  d['상태'] = '미지급'; d['작성일'] = now_(); d['발생일'] = d['발생일'] || today_();
  insert_('정산', d, s.email);
  return adminListSettlements(token);
}

/* ============================== 배정 추천 ============================== */

function adminRecommend(token, appId) {
  session_(token, 'admin');
  var a = find_('신청', appId);
  if (!a) throw new Error('신청 없음');
  var region = a['사업장지역'] || region_(a['사업장주소']);
  var year = a['연도'], hrs = trainingHours_(), sm = surveyMap_().byConsultant;
  var load = {};
  all_('사업장').forEach(function (p) {
    if (p['차수'] === '취소' || p['연도'] !== year || p['사후검수'] === '검수완료') return;
    splitIds_(p['컨설턴트ID']).forEach(function (c) { load[c] = (load[c] || 0) + 1; });
  });
  var wish = String(a['희망컨설턴트'] || '').split(/[,\/\s]+/).filter(String);
  var fullName = { 서울: '서울', 경기: '경기', 인천: '인천', 강원: '강원', 충북: '충청북', 충남: '충청남', 대전: '대전', 세종: '세종', 전북: '전라북', 전남: '전라남', 광주: '광주', 경북: '경상북', 경남: '경상남', 대구: '대구', 울산: '울산', 부산: '부산', 제주: '제주' };
  var list = all_('컨설턴트').filter(function (c) { return c['상태'] === '활동' || c['상태'] === '보완요청'; }).map(function (c) {
    var score = 0, why = [];
    var area = String(c['주요활동지역'] || '');
    if (wish.indexOf(c['성명']) >= 0) { score += 100; why.push('희망 컨설턴트'); }
    if (region && (area.indexOf(region) >= 0 || (fullName[region] && area.indexOf(fullName[region]) >= 0) || /전국/.test(area))) { score += 40; why.push('활동지역 ' + region); }
    var l = load[c.ID] || 0;
    score -= Math.min(l, 10) * 4; why.push('진행 ' + l + '곳');
    var h = hrs[c.ID] || 0;
    score += Math.min(h, 20); if (h) why.push('교육 ' + h + 'h');
    if (sm[c.ID]) { score += (sm[c.ID].평균 - 3) * 10; why.push('만족도 ' + sm[c.ID].평균); }
    if (c['구분'] === '내부') score -= 5;
    return { ID: c.ID, 성명: c['성명'], 구분: c['구분'], 지역: area, 점수: Math.round(score), 근거: why.join(' · ') };
  }).sort(function (x, y) { return y.점수 - x.점수; });
  return { region: region, list: list.slice(0, 8) };
}

/* ============================== 월간 실적 ============================== */

function monthlyStats_(ym) {
  if (!/^\d{4}-\d{2}$/.test(ym)) throw new Error('월을 선택해 주세요.');
  var year = ym.slice(0, 4), inM = function (d) { return ym_(d) === ym; }, upTo = function (d) { return String(d || '').slice(0, 7) <= ym && String(d || '').slice(0, 4) === year; };
  var apps = all_('신청'), projs = all_('사업장').filter(function (p) { return p['차수'] !== '취소'; }), subs = all_('보고서');
  var pm = {}; projs.forEach(function (p) { pm[p.ID] = p; });
  var label = Number(ym.slice(5)) + '월';
  var polKey = year + '. ' + Number(ym.slice(5));
  var surveys = all_('만족도').filter(function (x) { return inM(x['응답일']); });
  var fees = all_('정산');
  var cnt = function (arr, f) { return arr.filter(f).length; };
  var rows = [
    ['기업 신청 접수', cnt(apps, function (a) { return a['구분'] === '본신청' && inM(a['신청일']); }), cnt(apps, function (a) { return a['구분'] === '본신청' && upTo(a['신청일']); })],
    ['차년도 사전접수', cnt(apps, function (a) { return a['구분'] === '사전접수' && inM(a['신청일']); }), cnt(apps, function (a) { return a['구분'] === '사전접수' && upTo(a['신청일']); })],
    ['사업장 배정(생성)', cnt(projs, function (p) { return inM(p['생성일']); }), cnt(projs, function (p) { return upTo(p['생성일']); })],
    ['컨설팅 착수', cnt(projs, function (p) { return inM(p['착수일']); }), cnt(projs, function (p) { return upTo(p['착수일']); })],
    ['컨설팅 종료', cnt(projs, function (p) { return inM(p['종료일']); }), cnt(projs, function (p) { return upTo(p['종료일']); })]
  ];
  ['중간', '최종', '사후'].forEach(function (t) {
    rows.push([t + '보고서 제출', cnt(subs, function (r) { return r['종류'] === t && inM(r['제출일']); }), cnt(subs, function (r) { return r['종류'] === t && upTo(r['제출일']); })]);
    rows.push([t + '보고서 검수완료', cnt(subs, function (r) { return r['종류'] === t && r['검수결과'] === '검수완료' && inM(r['검수일']); }), cnt(projs, function (p) { return p['연도'] === year && p[t + '검수'] === '검수완료'; })]);
  });
  rows.push(['수행일지 작성', cnt(all_('수행일지'), function (l) { return inM(l['일자']); }), cnt(all_('수행일지'), function (l) { return upTo(l['일자']); })]);
  rows.push(['방문·상담 일정(완료)', cnt(all_('일정'), function (v) { return v['상태'] === '완료' && inM(v['일자']); }), cnt(all_('일정'), function (v) { return v['상태'] === '완료' && upTo(v['일자']); })]);
  rows.push(['정책연계 실현(해당 월)', cnt(projs, function (p) { return String(p['정책연계시기'] || '').split(',').map(function (x) { return x.trim(); }).indexOf(polKey) >= 0; }), cnt(projs, function (p) { return p['연도'] === year && p['정책연계여부'] === 'Y'; })]);
  rows.push(['만족도 응답', surveys.length, cnt(all_('만족도'), function (x) { return upTo(x['응답일']); })]);
  var avg = surveys.length ? Math.round(surveys.reduce(function (s, x) { return s + num_(x['종합']); }, 0) / surveys.length * 100) / 100 : '';
  var feeM = fees.filter(function (f) { return inM(f['발생일']); }).reduce(function (s, f) { return s + num_(f['금액']); }, 0);
  var paidM = fees.filter(function (f) { return f['상태'] === '지급완료' && inM(f['지급일']); }).reduce(function (s, f) { return s + num_(f['금액']); }, 0);
  var byChasu = {};
  projs.filter(function (p) { return p['연도'] === year; }).forEach(function (p) {
    var k = p['차수'] || '미정', o = byChasu[k] = byChasu[k] || { 차수: k, 사업장: 0, 중간완료: 0, 최종완료: 0, 사후완료: 0, 정책연계: 0 };
    o.사업장++; if (p['중간검수'] === '검수완료') o.중간완료++; if (p['최종검수'] === '검수완료') o.최종완료++; if (p['사후검수'] === '검수완료') o.사후완료++; if (p['정책연계여부'] === 'Y') o.정책연계++;
  });
  var byRegion = {};
  projs.filter(function (p) { return p['연도'] === year; }).forEach(function (p) {
    var a = find_('신청', p['신청ID']) || {}, k = a['사업장지역'] || '미상';
    byRegion[k] = (byRegion[k] || 0) + 1;
  });
  var polBiz = {};
  projs.filter(function (p) { return p['연도'] === year; }).forEach(function (p) {
    String(p['정책연계사업'] || '').split(',').map(function (x) { return x.trim(); }).filter(function (x) { return x && x !== '없음'; }).forEach(function (x) { polBiz[x] = (polBiz[x] || 0) + 1; });
  });
  return {
    ym: ym, label: year + '년 ' + label, rows: rows, 만족도평균: avg, 정산발생: feeM, 정산지급: paidM,
    byChasu: Object.keys(byChasu).map(function (k) { return byChasu[k]; }).sort(function (a, b) { return (parseInt(a.차수, 10) || 999) - (parseInt(b.차수, 10) || 999); }),
    byRegion: Object.keys(byRegion).map(function (k) { return [k, byRegion[k]]; }).sort(function (a, b) { return b[1] - a[1]; }),
    polBiz: Object.keys(polBiz).map(function (k) { return [k, polBiz[k]]; }).sort(function (a, b) { return b[1] - a[1]; }),
    generated: now_()
  };
}

function adminMonthlyReport(token, ym) { session_(token, 'admin'); return monthlyStats_(ym); }

function adminMonthlyReportXlsx(token, ym) {
  session_(token, 'admin');
  var st = monthlyStats_(ym);
  var name = '월간실적_' + ym;
  var tmp = SpreadsheetApp.create(name);
  try {
    var put = function (sh, data) { sh.getRange(1, 1, data.length, data[0].length).setNumberFormat('@').setValues(data.map(function (r) { return r.map(String); })); sh.getRange(1, 1, 1, data[0].length).setFontWeight('bold').setBackground('#eef2f7'); sh.setFrozenRows(1); };
    var s1 = tmp.getSheets()[0]; s1.setName('요약');
    put(s1, [['항목', st.label, st.ym.slice(0, 4) + '년 누계']].concat(st.rows).concat([['만족도 평균(해당 월)', st.만족도평균, ''], ['정산 발생액(원)', st.정산발생, ''], ['정산 지급액(원)', st.정산지급, '']]));
    put(tmp.insertSheet('차수별'), [['차수', '사업장', '중간 완료', '최종 완료', '사후 완료', '정책연계 Y']].concat(st.byChasu.map(function (o) { return [o.차수, o.사업장, o.중간완료, o.최종완료, o.사후완료, o.정책연계]; })).concat(st.byChasu.length ? [] : [['', '', '', '', '', '']]));
    put(tmp.insertSheet('지역별'), [['지역', '사업장']].concat(st.byRegion.length ? st.byRegion : [['', '']]));
    put(tmp.insertSheet('정책연계사업'), [['사업', '사업장']].concat(st.polBiz.length ? st.polBiz : [['', '']]));
    SpreadsheetApp.flush();
    var blob = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + tmp.getId() + '/export?format=xlsx', { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } }).getBlob();
    return { name: name + '.xlsx', b64: Utilities.base64Encode(blob.getBytes()) };
  } finally { DriveApp.getFileById(tmp.getId()).setTrashed(true); }
}

function sendMonthlyReportMail_() {
  var d = new Date(); d.setDate(0);
  var ym = Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM');
  var st = monthlyStats_(ym);
  var body = '■ ' + st.label + ' 실적 (해당 월 / 연 누계)\n\n' + st.rows.map(function (r) { return '· ' + r[0] + ': ' + r[1] + ' / ' + r[2]; }).join('\n') +
    '\n· 만족도 평균: ' + (st.만족도평균 || '-') + '\n· 정산 발생액: ' + st.정산발생.toLocaleString() + '원 / 지급액: ' + st.정산지급.toLocaleString() + '원' +
    '\n\n■ 차수별\n' + st.byChasu.map(function (o) { return '· ' + o.차수 + ': ' + o.사업장 + '곳 (중간 ' + o.중간완료 + ' · 최종 ' + o.최종완료 + ' · 사후 ' + o.사후완료 + ')'; }).join('\n') +
    '\n\n자세한 내용과 엑셀: ' + appUrl_();
  sendMail_(adminEmails_().join(','), '[월간 실적] ' + st.label, body, '월간실적', ym);
}

/* ============================== 공지·자료실 ============================== */

function visibleNotices_(c) {
  var now = now_(), kind = c ? c['구분'] : '';
  return all_('공지').filter(function (n) {
    if (n['게시일'] && n['게시일'] > now) return false;
    return !n['대상'] || n['대상'] === '전체' || n['대상'] === kind;
  });
}

function listNotices(token) {
  var s = session_(token);
  var reads = all_('공지읽음');
  if (s.role === 'admin' && !(arguments[1] === 'consultant')) {
    var cons = all_('컨설턴트').filter(function (c) { return c['상태'] === '활동'; });
    return all_('공지').map(function (n) {
      var o = strip_(n);
      var target = cons.filter(function (c) { return !n['대상'] || n['대상'] === '전체' || n['대상'] === c['구분']; }).length;
      o._읽음 = uniqCount_(reads.filter(function (r) { return r['공지ID'] === n.ID; }).map(function (r) { return r['컨설턴트ID']; }));
      o._대상수 = target;
      return o;
    }).sort(noticeSort_);
  }
  var c = find_('컨설턴트', s.consultantId);
  var mine = {}; reads.forEach(function (r) { if (r['컨설턴트ID'] === s.consultantId) mine[r['공지ID']] = 1; });
  return visibleNotices_(c).map(function (n) { var o = strip_(n); o._읽음 = !!mine[n.ID]; return o; }).sort(noticeSort_);
}

function uniqCount_(arr) { var m = {}; arr.forEach(function (x) { m[x] = 1; }); return Object.keys(m).length; }
function noticeSort_(a, b) { if ((a['고정'] === 'Y') !== (b['고정'] === 'Y')) return a['고정'] === 'Y' ? -1 : 1; return a['게시일'] < b['게시일'] ? 1 : -1; }

function markNoticeRead(token, id) {
  var s = session_(token);
  if (!s.consultantId) return true;
  if (!all_('공지읽음').some(function (r) { return r['공지ID'] === id && r['컨설턴트ID'] === s.consultantId; })) insert_('공지읽음', { 공지ID: id, 컨설턴트ID: s.consultantId, 일시: now_() });
  return true;
}

function adminSaveNotice(token, n, files, notify) {
  var s = session_(token, 'admin');
  var d = clean_(n, ['구분', '제목', '내용', '대상', '고정', '게시일']);
  req_(d, ['제목']);
  d['구분'] = d['구분'] || '공지'; d['대상'] = d['대상'] || '전체'; d['게시일'] = d['게시일'] || now_(); d['작성자'] = s.email;
  var saved = saveFiles_(['공지·자료', d['구분']], files || []);
  var id = n.ID;
  if (id) { var ex = find_('공지', id); d['첨부'] = parseFiles_(ex['첨부']).concat(saved); update_('공지', id, d, s.email); }
  else { d['첨부'] = saved; id = insert_('공지', d, s.email).ID; }
  var sent = 0;
  if (notify) {
    var targets = all_('컨설턴트').filter(function (c) { return c['상태'] === '활동' && c['이메일'] && (d['대상'] === '전체' || d['대상'] === c['구분']); });
    if (targets.length > MailApp.getRemainingDailyQuota() - MAIL_RESERVE) throw new Error('게시는 완료했지만 오늘 남은 메일 한도가 부족해 알림을 보내지 못했습니다.');
    targets.forEach(function (c) {
      if (sendMail_(c['이메일'], '[' + d['구분'] + '] ' + d['제목'], c['성명'] + ' 컨설턴트님,\n\n새 ' + d['구분'] + '가 게시되었습니다.\n\n' + d['제목'] + '\n\n' + String(d['내용'] || '').slice(0, 1500) + '\n\n앱에서 보기: ' + appUrl_(), '공지알림', id)) sent++;
    });
  }
  return { list: listNotices(token), sent: sent };
}

function adminDeleteNotice(token, id) {
  var s = session_(token, 'admin');
  remove_('공지', id, s.email);
  return listNotices(token);
}

/* ============================== 문의·요청 ============================== */

function listInquiries(token) {
  var s = session_(token);
  var pm = {}; all_('사업장').forEach(function (p) { pm[p.ID] = p['사업장명']; });
  return all_('문의').filter(function (q) { return s.role === 'admin' || q['컨설턴트ID'] === s.consultantId; }).map(function (q) {
    var o = strip_(q); o._사업장명 = pm[q['사업장ID']] || ''; o._컨설턴트명 = consultantNames_(q['컨설턴트ID']); return o;
  }).sort(function (a, b) { return a['작성일'] < b['작성일'] ? 1 : -1; });
}

function createInquiry(token, q, files) {
  var s = session_(token);
  if (!s.consultantId) throw new Error('컨설턴트 계정만 문의를 등록할 수 있습니다.');
  var d = clean_(q, ['사업장ID', '유형', '제목', '내용']);
  req_(d, ['제목', '내용']);
  if (d['사업장ID']) ownProject_(s, d['사업장ID']);
  d['유형'] = OPTIONS.문의유형.indexOf(d['유형']) >= 0 ? d['유형'] : '기타';
  d['컨설턴트ID'] = s.consultantId; d['상태'] = '접수'; d['작성일'] = now_();
  d['첨부'] = saveFiles_(['문의', s.name], files || []);
  var row = insert_('문의', d, s.email);
  notifyAdmins_('[문의·' + d['유형'] + '] ' + d['제목'], s.name + ' 컨설턴트 문의\n\n' + d['내용'] + '\n\n답변: ' + appUrl_(), '문의알림', row.ID);
  return listInquiries(token);
}

function adminAnswerInquiry(token, id, answer, status) {
  var s = session_(token, 'admin');
  var q = find_('문의', id);
  if (!q) throw new Error('문의 없음');
  var st = OPTIONS.문의상태.indexOf(status) >= 0 ? status : '완료';
  update_('문의', id, { 답변: answer || '', 상태: st, 답변자: s.email, 답변일: now_() }, s.email);
  var c = find_('컨설턴트', q['컨설턴트ID']);
  if (c && c['이메일'] && answer) sendMail_(c['이메일'], '[문의 답변] ' + q['제목'], c['성명'] + ' 컨설턴트님,\n\n문의하신 내용에 답변이 등록되었습니다.\n\n[문의] ' + q['제목'] + '\n\n[답변]\n' + answer + '\n\n' + appUrl_(), '문의답변', id);
  return listInquiries(token);
}

/* ============================== 기업 진행조회 (공개) ============================== */

function lookupApplication(receiptNo, brn) {
  if (setting_('STATUS_LOOKUP_OPEN') !== 'Y') throw new Error('현재 진행조회를 이용할 수 없습니다.');
  var id = String(receiptNo || '').trim().toUpperCase(), b = normBrn_(brn);
  if (!id || b.length !== 10) throw new Error('접수번호와 사업자등록번호(10자리)를 입력해 주세요.');
  var cache = CacheService.getScriptCache(), key = 'lookup:' + b, n = Number(cache.get(key) || 0);
  if (n >= 10) throw new Error('조회 시도가 많습니다. 10분 후 다시 시도해 주세요.');
  cache.put(key, String(n + 1), 600);
  var a = find_('신청', id);
  if (!a || normBrn_(a['사업자등록번호']) !== b) throw new Error('일치하는 접수 내역이 없습니다. 접수번호와 사업자등록번호를 확인해 주세요.');
  var p = a['사업장ID'] && find_('사업장', a['사업장ID']);
  var steps = [{ 단계: '접수', 완료: true, 일자: String(a['신청일']).slice(0, 10) }, { 단계: '검토·승인', 완료: a['승인여부'] === '확정', 상태: a['승인여부'] }];
  var out = { 접수번호: a.ID, 사업장명: a['사업장명'], 구분: a['구분'], 연도: a['연도'], 신청일: String(a['신청일']).slice(0, 10), 승인여부: a['승인여부'], contact: setting_('CONTACT_EMAIL') };
  if (p && a['승인여부'] === '확정') {
    out.차수 = p['차수']; out.컨설턴트 = consultantNames_(p['컨설턴트ID']); out.기간 = (p['착수일'] || '') + ' ~ ' + (p['종료일'] || '');
    steps.push({ 단계: '컨설턴트 배정', 완료: !!p['컨설턴트ID'] });
    steps.push({ 단계: '착수', 완료: /협약완료|문서협약완료|착수메일/.test(p['착수현황'] || ''), 상태: p['착수현황'] });
    steps.push({ 단계: '중간보고', 완료: p['중간검수'] === '검수완료' });
    steps.push({ 단계: '최종보고', 완료: p['최종검수'] === '검수완료' });
    steps.push({ 단계: '사후관리', 완료: p['사후검수'] === '검수완료' });
  }
  out.steps = steps;
  return out;
}

/** 컨설턴트 본인 정산 내역 */
function listMySettlements(token) {
  var s = session_(token);
  var pm = {}; all_('사업장').forEach(function (p) { pm[p.ID] = p; });
  return all_('정산').filter(function (f) { return f['컨설턴트ID'] === s.consultantId; }).map(function (f) {
    var o = strip_(f), p = pm[f['사업장ID']] || {}; o._사업장명 = p['사업장명'] || ''; o._차수 = p['차수'] || ''; return o;
  }).sort(function (a, b) { return a['발생일'] < b['발생일'] ? 1 : -1; });
}

function adminSmsStatus(token) {
  session_(token, 'admin');
  var pr = PropertiesService.getScriptProperties();
  return { ready: smsReady_(), hasKey: !!pr.getProperty('SMS_API_KEY'), enabled: setting_('SMS_ENABLED') === 'Y', sender: setting_('SMS_SENDER') };
}
