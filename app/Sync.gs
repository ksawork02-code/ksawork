/**
 * Lark → 앱 동기화 엔진 (최초 이관 + 전환기간 자동 동기화 공용)
 * - 새 Lark 레코드: 추가
 * - 기존 레코드: 지난 동기화 이후 'Lark에서 바뀐 필드'만 앱에 반영 (앱에서만 고친 값은 유지)
 * - 같은 필드를 양쪽에서 고친 경우 Lark 값 우선 (변경이력에 이전 값 기록)
 * - 앱 → Lark 방향은 없음
 * 스냅샷(지난번 Lark 값)은 숨김 시트 '_Lark동기화'에 저장
 */

var SNAP_SHEET = '_Lark동기화';
var SYNC_USER = 'Lark동기화';
var FILE_KEYS = ['이력서', '신청서', '사업자등록증', '중소기업확인서', '장려금접수증', '우수사례첨부'];

/* ---------- 매핑 (Lark 필드 → 앱 필드) ---------- */

function mapConsultant_(f) {
  return {
    성명: lt_(f['성명']), 구매처코드: lt_(f['구매처코드']), 연락처: lt_(f['연락처']), 이메일: lt_(f['이메일주소']).toLowerCase(),
    주요활동지역: lt_(f['주요 활동 지역']), 이력서: latt_(f['이력서']), 보완요청: lt_(f['보완요청']), 평가: lt_(f['컨설턴트 평가']), 비고: lt_(f['비고'])
  };
}

function mapApply_(f) {
  return {
    사업장명: lt_(f['사업장명']), 사업자등록번호: lt_(f['사업자등록번호']), 업태: lt_(f['업태']), 종목: lt_(f['종목']), 근로자수: lt_(f['인원']),
    사업장주소: lt_(f['사업장 주소']), 사업장지역: region_(lt_(f['사업장 주소'])) || lt_(f['사업장 지역']), 담당부서: lt_(f['부서명']),
    담당자명: lt_(f['담당자명']), 담당자직책: lt_(f['담당자 직책']), 담당자연락처: lt_(f['담당자 연락처']), 담당자이메일: lt_(f['담당자 이메일']),
    희망컨설턴트: lt_(f['담당 컨설턴트']), 승인여부: lt_(f['승인여부']) || '대기', 연락여부: lt_(f['연락여부']) || '미확인',
    연락담당자: lt_(f['연락 담당자']), 지역본부: lt_(f['지역본부']), 특이사항: lt_(f['특이사항']), 비고: lt_(f['비고']),
    변동사항: f['변동사항 있음⭕'] ? '있음' : (f['변동사항 없음❌'] ? '없음' : ''),
    신청서: latt_(f['신청서']), 사업자등록증: latt_(f['사업자등록증']), 중소기업확인서: latt_(f['중소기업 확인서'])
  };
}

function mapPre_(f) {
  return {
    사업장명: lt_(f['사업장명']), 사업자등록번호: lt_(f['사업자등록번호']), 업태: lt_(f['업태']), 종목: lt_(f['종목']), 근로자수: lt_(f['근로자 수']),
    사업장주소: lt_(f['사업장 주소']), 사업장지역: region_(lt_(f['사업장 주소'])), 담당부서: lt_(f['담당부서']), 담당자명: lt_(f['담당자명']),
    담당자직책: lt_(f['담당자 직책']), 담당자연락처: lt_(f['담당자 연락처']), 담당자이메일: lt_(f['담당자 이메일']), 비고: lt_(f['비고'])
  };
}

function mapProject_(f, aByLark, cByLark) {
  return {
    신청ID: llinks_(f['사업장 담당자 정보확인']).map(function (x) { return aByLark[x]; }).filter(Boolean)[0] || '',
    사업장명: lt_(f['사업장명']), 차수: lt_(f['차수']),
    컨설턴트ID: llinks_(f['컨설턴트']).map(function (x) { return cByLark[x]; }).filter(Boolean).join(','),
    착수현황: lt_(f['사업장착수현황']), 착수일: ld_(f['컨설팅 착수일']), 종료일: ld_(f['컨설팅 종료일']),
    중간기한: ld_(f['중간보고서 제출일']), 중간검수: lt_(f['중간보고서 검수 현황']) || '미제출',
    최종기한: ld_(f['최종보고서 제출일']), 최종검수: lt_(f['최종보고 검수 현황']) || '미제출',
    사후기한: ld_(f['사후관리 보고서 제출일']), 사후검수: lt_(f['사후증빙 검수 현황']) || '미제출',
    수행일지_이관: lt_(f['수행일지 작성회차']), 정책연계여부: lt_(f['정책연계 가능여부']), 정책연계사업: lt_(f['정책연계 사업']),
    기타사업: lt_(f['기타사업(텍스트입력)']), 정책연계시기: lt_(f['실제 정책연계 시기']), 장려금접수증: latt_(f['장려금접수 시(접수증) 첨부']),
    우수사례여부: lt_(f['우수사례 제출 가능 여부']), 우수사례첨부: latt_(f['우수사례 제출 시 첨부'])
  };
}

/* ---------- 스냅샷 ---------- */

function snapSheet_() {
  var ss = ss_(), sh = ss.getSheetByName(SNAP_SHEET);
  if (!sh) {
    sh = ss.insertSheet(SNAP_SHEET);
    sh.getRange(1, 1, 1, 4).setValues([['LarkID', '시트', '연결ID', '값']]);
    try { sh.hideSheet(); } catch (e) {}
  }
  return sh;
}

function loadSnaps_() {
  var sh = snapSheet_(), lr = sh.getLastRow(), m = {};
  if (lr < 2) return m;
  sh.getRange(2, 1, lr - 1, 4).getDisplayValues().forEach(function (r) {
    if (!r[0]) return;
    try { m[r[0]] = { s: r[1], cid: r[2], v: JSON.parse(r[3]) }; } catch (e) {}
  });
  return m;
}

function saveSnaps_(m) {
  var sh = snapSheet_();
  var rows = Object.keys(m).map(function (k) { return [k, m[k].s || '', m[k].cid || '', JSON.stringify(m[k].v)]; });
  var old = Math.max(0, sh.getLastRow() - 1);
  while (rows.length < old) rows.push(['', '', '', '']);
  if (rows.length) sh.getRange(2, 1, rows.length, 4).setNumberFormat('@').setValues(rows);
}

/** 비교용 값: 첨부는 파일 토큰 목록으로 */
function snapVal_(k, v) {
  if (FILE_KEYS.indexOf(k) >= 0) return (v || []).map(function (f) { return f.token; }).sort().join('|');
  return v === undefined || v === null ? '' : String(v);
}

function snapOf_(mapped) {
  var o = {};
  Object.keys(mapped).forEach(function (k) { o[k] = snapVal_(k, mapped[k]); });
  return o;
}

/** 앱 첨부 목록 + Lark 새 첨부 병합: 앱 업로드는 유지, Lark에서 빠진 파일은 목록에서 제외, 새 파일은 이관 대기로 추가 */
function mergeFiles_(cell, larkList) {
  var cur = parseFiles_(cell), tokens = larkList.map(function (f) { return f.token; });
  var keep = cur.filter(function (f) { return !f.token || tokens.indexOf(f.token) >= 0; });
  var have = keep.map(function (f) { return f.token; });
  return keep.concat(larkList.filter(function (f) { return have.indexOf(f.token) < 0; }));
}

/* ---------- 동기화 엔진 ---------- */

function larkSync_() {
  _cache = {};
  var snaps = loadSnaps_();
  var st = { 추가: {}, 수정: {}, 필드: 0, 중복의심: 0 };
  var add = function (sheet) { st.추가[sheet] = (st.추가[sheet] || 0) + 1; };
  var pend = { '컨설턴트': [], '교육': [], '신청': [], '사업장': [], '교육이수': [] };
  var updates = []; // [sheet, id, patch]
  var byLark = {}, rows = {};
  ['컨설턴트', '신청', '사업장'].forEach(function (s) {
    byLark[s] = {}; rows[s] = all_(s);
    rows[s].forEach(function (r) { if (r.LarkID) byLark[s][r.LarkID] = r; });
  });

  /** 레코드 1건 반영. 반환: 앱 행(또는 추가 대기 객체) */
  function upsert(sheet, lid, mapped, onInsert, createdTime) {
    var row = byLark[sheet][lid], snap = snapOf_(mapped);
    var prev = snaps[lid] && snaps[lid].v;
    snaps[lid] = { s: sheet, cid: '', v: snap };
    if (!row) {
      var o = Object.assign({ ID: migId_(sheet), LarkID: lid }, mapped, onInsert || {});
      pend[sheet].push(o); byLark[sheet][lid] = o; add(sheet);
      return o;
    }
    if (!prev) return row; // 스냅샷 없음 → 기준값만 저장
    var patch = {};
    Object.keys(snap).forEach(function (k) {
      if (snap[k] === prev[k]) return;
      patch[k] = FILE_KEYS.indexOf(k) >= 0 ? mergeFiles_(row[k], mapped[k]) : mapped[k];
    });
    if (Object.keys(patch).length) { updates.push([sheet, row.ID, patch]); st.수정[sheet] = (st.수정[sheet] || 0) + 1; st.필드 += Object.keys(patch).length; }
    return row;
  }

  var L = {};
  Object.keys(LARK.T).forEach(function (k) { L[k] = larkRecords_(LARK.T[k]); });

  /* 1. 컨설턴트 명단 */
  L.CONS.forEach(function (r) {
    upsert('컨설턴트', r.record_id, mapConsultant_(r.fields), { 구분: '외부', 상태: '활동', 등록일: ldt_(r.fields['등록일자'] || r.created_time) });
  });

  /* 2. 개인별 안내 + 교육 이수 */
  var byName = {};
  rows['컨설턴트'].concat(pend['컨설턴트']).forEach(function (c) { var n = String(c['성명']).trim(); if (n && !byName[n]) byName[n] = c; });
  var cById = {};
  rows['컨설턴트'].concat(pend['컨설턴트']).forEach(function (c) { cById[c.ID] = c; });
  var trainCols = [];
  L.GUIDE.forEach(function (g) { Object.keys(g.fields).forEach(function (k) { if (/^\d{1,2}\.\d{1,2}\s/.test(k) && trainCols.indexOf(k) < 0) trainCols.push(k); }); });
  var tByCol = {};
  all_('교육').forEach(function (t) { tByCol[t['비고'] || t['교육명']] = t; });
  trainCols.forEach(function (col) {
    if (tByCol[col]) return;
    var m = col.match(/^(\d{1,2})\.(\d{1,2})\s+(.*)$/);
    var t = { ID: migId_('교육'), 교육명: m[3], 일자: LARK.TRAINING_YEAR + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2), 시간: '', 비고: col, 상태: '종료' };
    pend['교육'].push(t); tByCol[col] = t;
  });
  var recs = all_('교육이수'), recByKey = {};
  recs.forEach(function (r) { recByKey[r['컨설턴트ID'] + '|' + r['교육ID']] = r; });
  var setTraining = function (cid, tid, val) {
    var key = cid + '|' + tid, ex = recByKey[key], hours = val.replace(/[^0-9.]/g, '') || val;
    if (ex && ex.ID && !ex._pending) {
      if (!val) updates.push(['__삭제_교육이수', ex.ID, null]);
      else if (ex['이수시간'] !== hours) updates.push(['교육이수', ex.ID, { 이수시간: hours, 비고: val }]);
    } else if (val) {
      var o = { ID: migId_('교육이수'), 컨설턴트ID: cid, 교육ID: tid, 이수시간: hours, 비고: val, _pending: 1 };
      pend['교육이수'].push(o); recByKey[key] = o;
    }
  };
  var guide = function (g, internal) {
    var f = g.fields, name = lt_(f['성함']);
    if (!name) return;
    var v = { 개인별안내: lt_(f['개인별 안내']) };
    trainCols.forEach(function (col) { v['T:' + col] = lt_(f[col]); });
    var prev = snaps[g.record_id], c = prev && prev.cid && cById[prev.cid];
    if (!c) c = byName[name];
    if (!c) {
      c = { ID: migId_('컨설턴트'), 성명: name, 구분: internal ? '내부' : '외부', 상태: '활동', 등록일: ldt_(g.created_time), LarkID: g.record_id, 비고: '개인별안내에서 생성' };
      pend['컨설턴트'].push(c); byName[name] = c; cById[c.ID] = c; add('컨설턴트');
    }
    var first = !prev || prev.cid !== c.ID;
    snaps[g.record_id] = { s: internal ? '내부안내' : '안내', cid: c.ID, v: v };
    var patch = {};
    if (first) {
      if (internal && c['구분'] !== '내부') patch['구분'] = '내부';
      if (v['개인별안내']) patch['개인별안내'] = v['개인별안내'];
    } else if (v['개인별안내'] !== prev.v['개인별안내']) patch['개인별안내'] = v['개인별안내'];
    trainCols.forEach(function (col) {
      var nv = v['T:' + col];
      if (first ? nv : nv !== (prev.v['T:' + col] || '')) setTraining(c.ID, tByCol[col].ID, nv);
    });
    if (Object.keys(patch).length) {
      if (c._row) { updates.push(['컨설턴트', c.ID, patch]); st.필드 += Object.keys(patch).length; }
      else Object.assign(c, patch); // 아직 추가 전인 행
    }
  };
  L.GUIDE.forEach(function (g) { guide(g, false); });
  L.GUIDE_IN.forEach(function (g) { guide(g, true); });

  /* 3. 신청 + 사전접수 */
  var appRows = rows['신청'];
  var dupCheck = function (o) {
    var brn = normBrn_(o['사업자등록번호']);
    if (!brn) return;
    var d = appRows.filter(function (a) { return !a.LarkID && normBrn_(a['사업자등록번호']) === brn && a['연도'] === o['연도'] && a['구분'] === o['구분']; })[0];
    if (d) { o['비고'] = (o['비고'] ? o['비고'] + '\n' : '') + '[동기화 중복의심: 앱 접수 ' + d.ID + ']'; st.중복의심++; }
  };
  L.APPLY.forEach(function (r) {
    var isNew = !byLark['신청'][r.record_id];
    var o = upsert('신청', r.record_id, mapApply_(r.fields), { 구분: '본신청', 연도: LARK.APPLY_YEAR, 신청일: ldt_(r.fields['생성 날짜'] || r.created_time), 신청자: lt_(r.fields['생성한 사람']) || 'Lark' });
    if (isNew) dupCheck(o);
  });
  L.PRE.forEach(function (r) {
    var isNew = !byLark['신청'][r.record_id];
    var o = upsert('신청', r.record_id, mapPre_(r.fields), { 구분: '사전접수', 연도: LARK.PRE_YEAR, 승인여부: '대기', 연락여부: '미확인', 신청일: ldt_(r.fields['생성 날짜'] || r.created_time), 신청자: lt_(r.fields['생성한 사람']) || 'Lark' });
    if (isNew) dupCheck(o);
  });

  /* 4. 사업장 */
  var aByLark = {}, cByLark = {};
  Object.keys(byLark['신청']).forEach(function (k) { aByLark[k] = byLark['신청'][k].ID; });
  Object.keys(byLark['컨설턴트']).forEach(function (k) { cByLark[k] = byLark['컨설턴트'][k].ID; });
  var nameOf = function (ids) { return splitIds_(ids).map(function (id) { return cById[id] ? cById[id]['성명'] : id; }).join(', '); };
  var appLinks = {};
  L.PROJ.forEach(function (r) {
    var mapped = mapProject_(r.fields, aByLark, cByLark);
    var before = updates.length;
    var o = upsert('사업장', r.record_id, mapped, { 연도: LARK.APPLY_YEAR, 수행일지수: '0', 생성일: ldt_(r.created_time), 컨설턴트명: nameOf(mapped['컨설턴트ID']) });
    if (updates.length > before && updates[updates.length - 1][2]['컨설턴트ID'] !== undefined) updates[updates.length - 1][2]['컨설턴트명'] = nameOf(mapped['컨설턴트ID']);
    var aid = o['신청ID'] || mapped['신청ID'];
    if (aid && !appLinks[aid]) appLinks[aid] = o.ID;
  });
  // 신청 → 사업장ID 역연결 (비어 있을 때만)
  var pendApp = {};
  pend['신청'].forEach(function (a) { pendApp[a.ID] = a; });
  Object.keys(appLinks).forEach(function (aid) {
    if (pendApp[aid]) { if (!pendApp[aid]['사업장ID']) pendApp[aid]['사업장ID'] = appLinks[aid]; return; }
    var a = appRows.filter(function (x) { return x.ID === aid; })[0];
    if (a && !a['사업장ID']) updates.push(['신청', aid, { 사업장ID: appLinks[aid] }]);
  });

  /* 5. 쓰기 */
  pend['교육이수'].forEach(function (o) { delete o._pending; });
  ['컨설턴트', '교육', '신청', '사업장', '교육이수'].forEach(function (s) { insertMany_(s, pend[s], null); });
  updates.forEach(function (u) {
    try {
      if (u[0] === '__삭제_교육이수') remove_('교육이수', u[1], SYNC_USER);
      else update_(u[0], u[1], u[2], SYNC_USER);
    } catch (e) { Logger.log('동기화 수정 실패 ' + u[0] + ' ' + u[1] + ': ' + e.message); }
  });

  /* 6. 새 차수 → 차수일정 */
  _cache = {};
  var sch = {};
  all_('차수일정').forEach(function (s) { sch[s['차수']] = true; });
  var newSch = [];
  all_('사업장').slice().sort(function (a, b) { return (parseInt(a['차수'], 10) || 999) - (parseInt(b['차수'], 10) || 999); }).forEach(function (p) {
    var c = p['차수'];
    if (!c || c === '취소' || sch[c]) return;
    sch[c] = true;
    newSch.push({ 차수: c, 연도: p['연도'], 착수일: p['착수일'], 종료일: p['종료일'], 중간기한: p['중간기한'], 최종기한: p['최종기한'], 사후기한: p['사후기한'], 비고: 'Lark' });
  });
  insertMany_('차수일정', newSch, null);

  /* 7. 완료된 설문 보관 (최초 1회) */
  var ss = ss_(), arch = '보관_설명회설문';
  if (!ss.getSheetByName(arch) && L.SURVEY.length) {
    var sh = ss.insertSheet(arch);
    var out = [['성명', '참석 불가능한 날짜', '제출일시', 'LarkID']].concat(L.SURVEY.map(function (r) {
      return [lt_(r.fields['텍스트']), lt_(r.fields['여러 옵션']), ldt_(r.fields['제출 일시'] || r.created_time), r.record_id];
    }));
    sh.getRange(1, 1, out.length, 4).setNumberFormat('@').setValues(out);
  }

  saveSnaps_(snaps);
  _cache = {};
  var fmt = function (o) { return Object.keys(o).map(function (k) { return k + ' ' + o[k]; }).join(', ') || '없음'; };
  st.summary = '추가: ' + fmt(st.추가) + ' / 수정: ' + fmt(st.수정) + ' (' + st.필드 + '개 필드)' + (st.중복의심 ? ' / 중복의심 ' + st.중복의심 + '건' : '') + (newSch.length ? ' / 새 차수 ' + newSch.length : '');
  return st;
}

/* ---------- 자동 동기화 (전환 기간) ---------- */

/** 트리거가 주기적으로 호출 */
function syncFromLark() {
  if (setting_('LARK_SYNC') !== 'Y') { clearSyncTriggers_(); return '꺼짐'; }
  if (!larkMutex_(true)) return '다른 Lark 작업 진행 중';
  var msg;
  try {
    var r = larkSync_();
    try { all_('사업장').forEach(function (p) { syncSettlements_(p.ID); }); } catch (e2) { Logger.log('정산 갱신 실패: ' + e2.message); }
    var left = migrateFiles_();
    msg = now_() + ' 완료 · ' + r.summary + (left ? ' · 첨부 대기 ' + left + '개' : '');
  } catch (e) {
    msg = now_() + ' 오류 · ' + e.message;
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty('SYNC_ERR_MAILED') !== today_()) {
      props.setProperty('SYNC_ERR_MAILED', today_());
      sendMail_(adminEmails_()[0], '[Lark 동기화 오류] ' + e.message.slice(0, 60), 'Lark → 앱 동기화 중 오류가 발생했습니다.\n\n' + e.message + '\n\nApp Secret 변경·Lark 권한을 확인해 주세요.\n' + appUrl_(), '동기화오류', '');
    }
  } finally { larkMutex_(false); }
  setSetting_('LARK_SYNC_LAST', msg);
  return msg;
}

function enableLarkSync(minutes) {
  larkSecret_();
  minutes = [5, 10, 15, 30].indexOf(Number(minutes)) >= 0 ? Number(minutes) : Number(setting_('LARK_SYNC_MINUTES')) || 30;
  if ([5, 10, 15, 30].indexOf(minutes) < 0) minutes = 30;
  setSetting_('LARK_SYNC', 'Y');
  setSetting_('LARK_SYNC_MINUTES', String(minutes));
  clearSyncTriggers_();
  ScriptApp.newTrigger('syncFromLark').timeBased().everyMinutes(minutes).create();
  try { SpreadsheetApp.getActiveSpreadsheet().toast(minutes + '분마다 Lark 데이터를 가져옵니다.', 'Lark 동기화 켬', 8); } catch (e) {}
  return syncFromLark();
}

function disableLarkSync() {
  setSetting_('LARK_SYNC', 'N');
  clearSyncTriggers_();
  PropertiesService.getScriptProperties().deleteProperty('LARK_APP_SECRET');
  setSetting_('LARK_SYNC_LAST', now_() + ' 동기화 종료 (App Secret 삭제)');
  try { SpreadsheetApp.getActiveSpreadsheet().toast('동기화를 끄고 저장된 App Secret을 삭제했습니다.', 'Lark 동기화 끔', 8); } catch (e) {}
  return true;
}

function clearSyncTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'syncFromLark') ScriptApp.deleteTrigger(t); });
}

/** 관리자 화면에서 호출 */
function adminLarkSync(token, action, minutes) {
  var s = session_(token, 'admin');
  if (action === 'now') { audit_(s.email, 'Lark 동기화(수동)', '', '', '', '', ''); return syncNow_(); }
  if (action === 'on') { audit_(s.email, 'Lark 동기화 켬', '', '', '', '', String(minutes)); enableLarkSync(minutes); }
  if (action === 'off') { audit_(s.email, 'Lark 동기화 끔', '', '', '', '', ''); disableLarkSync(); }
  return larkSyncStatus_();
}

function syncNow_() {
  if (!PropertiesService.getScriptProperties().getProperty('LARK_APP_SECRET')) throw new Error('저장된 Lark App Secret이 없습니다. 시트 메뉴 [컨설팅 관리 > Lark 동기화 켜기]에서 입력해 주세요.');
  if (!larkMutex_(true)) throw new Error('다른 Lark 작업(이관·동기화)이 진행 중입니다. 잠시 후 다시 시도해 주세요.');
  try {
    var r = larkSync_(), left = migrateFiles_();
    setSetting_('LARK_SYNC_LAST', now_() + ' 완료(수동) · ' + r.summary + (left ? ' · 첨부 대기 ' + left + '개' : ''));
  } finally { larkMutex_(false); }
  return larkSyncStatus_();
}

function larkSyncStatus_() {
  delete _cache['__settings'];
  return {
    on: setting_('LARK_SYNC') === 'Y', minutes: setting_('LARK_SYNC_MINUTES') || '30', last: setting_('LARK_SYNC_LAST'),
    hasSecret: !!PropertiesService.getScriptProperties().getProperty('LARK_APP_SECRET'),
    trigger: ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'syncFromLark'; })
  };
}

function adminLarkSyncStatus(token) { session_(token, 'admin'); return larkSyncStatus_(); }

/** 시트 메뉴용 */
function menuEnableSync() {
  var m = 30;
  try {
    var ui = SpreadsheetApp.getUi();
    var r = ui.prompt('Lark 자동 동기화', '몇 분마다 가져올까요? (5, 10, 15, 30 중 입력, 기본 30)', ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK) return;
    m = Number(r.getResponseText()) || 30;
  } catch (e) {}
  var msg = enableLarkSync(m);
  try { SpreadsheetApp.getUi().alert('동기화를 켰습니다.\n\n' + msg); } catch (e) {}
}

function menuSyncNow() {
  var msg = syncNow_().last;
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
}

/** Lark 작업(이관·동기화) 동시 실행 방지. 6분 지난 표시는 무시 */
function larkMutex_(acquire) {
  var props = PropertiesService.getScriptProperties();
  if (!acquire) { props.deleteProperty('LARK_BUSY'); return true; }
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var t = Number(props.getProperty('LARK_BUSY') || 0);
    if (t && Date.now() - t < 6 * 60 * 1000) return false;
    props.setProperty('LARK_BUSY', String(Date.now()));
    return true;
  } finally { lock.releaseLock(); }
}
