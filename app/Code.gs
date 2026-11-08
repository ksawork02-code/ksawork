/**
 * 산업일자리전환 컨설팅 관리 앱 (Google Apps Script)
 * - DB: 이 스크립트가 연결된 구글 시트
 * - 파일: 구글 드라이브 폴더 (설정 DRIVE_ROOT_ID)
 * - 화면: Index.html(로그인 포털), Form.html(외부 신청폼), Styles.html
 * 최초 1회: setup() 실행 → 웹앱 배포(실행: 나, 액세스: 모든 사용자)
 */

/* ============================== 스키마 ============================== */

var SCHEMA = {
  '신청': ['ID', '구분', '연도', '사업장명', '사업자등록번호', '업태', '종목', '근로자수', '사업장주소', '사업장지역',
    '담당부서', '담당자명', '담당자직책', '담당자연락처', '담당자이메일', '희망컨설턴트', '승인여부', '연락여부',
    '연락담당자', '지역본부', '특이사항', '비고', '변동사항', '신청서', '사업자등록증', '중소기업확인서', '사업장ID',
    '신청일', '신청자', '수정일', 'LarkID'],
  '사업장': ['ID', '신청ID', '사업장명', '연도', '차수', '컨설턴트ID', '컨설턴트명', '착수현황', '착수일', '종료일',
    '중간기한', '중간검수', '중간제출일', '최종기한', '최종검수', '최종제출일', '사후기한', '사후검수', '사후제출일',
    '수행일지수', '수행일지_이관', '정책연계여부', '정책연계사업', '기타사업', '정책연계시기', '장려금접수증',
    '우수사례여부', '우수사례첨부', '착수메일발송일', '비고', '생성일', '수정일', 'LarkID'],
  '컨설턴트': ['ID', '성명', '구분', '상태', '구매처코드', '연락처', '이메일', '주요활동지역', '이력서', '보완요청',
    '평가', '개인별안내', '비고', '등록일', '수정일', 'LarkID'],
  '차수일정': ['차수', '연도', '착수일', '종료일', '중간기한', '최종기한', '사후기한', '비고'],
  '수행일지': ['ID', '사업장ID', '회차', '일자', '시간', '방식', '장소', '참석자', '내용', '향후계획', '첨부', '작성자',
    '작성일', '수정일'],
  '보고서': ['ID', '사업장ID', '종류', '파일', '메모', '제출자', '제출일', '검수결과', '검수의견', '검수자', '검수일', '체크리스트'],
  '교육': ['ID', '교육명', '일자', '시간', '비고', '방식', '장소', '정원', '신청시작', '신청마감', '상태', '필수', '설명'],
  '교육이수': ['ID', '컨설턴트ID', '교육ID', '이수시간', '비고'],
  '일정': ['ID', '사업장ID', '컨설턴트ID', '일자', '시작', '종료', '방식', '장소', '내용', '상태', '캘린더ID', '안내발송', '작성자', '작성일', '수정일'],
  '서류': ['ID', '사업장ID', '종류', '파일', '제출자', '제출일', '확인', '확인자', '확인일', '의견'],
  '만족도': ['ID', '사업장ID', '컨설턴트ID', '토큰', '발송일', '응답일', '응답자', '점수', '종합', '의견'],
  '교육신청': ['ID', '교육ID', '컨설턴트ID', '신청일', '상태', '비고'],
  '수당기준': ['항목', '보고서', '금액', '분배', '비고'],
  '정산': ['ID', '사업장ID', '컨설턴트ID', '항목', '금액', '발생일', '상태', '지급일', '비고', '작성일', '수정일'],
  '공지': ['ID', '구분', '제목', '내용', '첨부', '대상', '고정', '게시일', '작성자', '수정일'],
  '공지읽음': ['공지ID', '컨설턴트ID', '일시'],
  '문의': ['ID', '사업장ID', '컨설턴트ID', '유형', '제목', '내용', '첨부', '상태', '작성일', '답변', '답변자', '답변일', '수정일'],
  '변경이력': ['일시', '사용자', '작업', '시트', 'ID', '필드', '이전값', '변경값'],
  '메일이력': ['일시', '받는사람', '제목', '종류', '관련ID', '결과'],
  '설정': ['키', '값', '설명']
};

var ID_PREFIX = { '신청': 'A', '사업장': 'P', '컨설턴트': 'C', '수행일지': 'L', '보고서': 'R', '교육': 'T', '교육이수': 'E',
  '일정': 'V', '서류': 'D', '만족도': 'S', '교육신청': 'Q', '정산': 'F', '공지': 'N', '문의': 'H' };

var OPTIONS = {
  승인여부: ['대기', '확정', '반려', '취소'],
  연락여부: ['미확인', '1 컨설턴트 연락완료', '1.5 컨설 확인필요', '2 사업장 연락완료'],
  착수현황: ['착수준비', '착수메일 발송', '협약서명필요', '협약완료', '문서협약진행', '문서협약완료'],
  검수: ['미제출', '제출', '검수 중', '보완요청', '검수완료', '내부'],
  검수결과: ['검수 중', '보완요청', '검수완료'],
  보고서종류: ['중간', '최종', '사후'],
  구분: ['본신청', '사전접수'],
  컨설턴트구분: ['외부', '내부'],
  컨설턴트상태: ['신청', '활동', '보완요청', '제외'],
  YN: ['Y', 'N'],
  변동사항: ['', '있음', '없음'],
  수행방식: ['방문', '비대면', '전화', '기타'],
  정책연계사업: ['산업일자리전환장려금', '산업일자리전환채용장려금', '인재키움프리미엄교육', '산업전환공동훈련센터 참여',
    '고용촉진장려금', '일가정양립고용환경개선지원', '지역산업맞춤형인력양성사업', '지역산업맞춤형일자리창출지원사업',
    'S-OJT', 'KDT', '무역보험금', '산업재편', '사업전환자금', '스마트공장구축', 'R&D지원', '제조혁신바우처', '기타', '없음'],
  정책연계시기: ['2026. 9', '2026. 10', '2026. 11', '2026. 12', '2027'],
  일정상태: ['예정', '완료', '취소'],
  서류확인: ['대기', '확인', '반려'],
  정산상태: ['미지급', '지급예정', '지급완료', '보류'],
  문의유형: ['질문', '일정변경', '서류', '보고서', '기타'],
  문의상태: ['접수', '처리중', '완료'],
  공지구분: ['공지', '자료'],
  공지대상: ['전체', '외부', '내부'],
  교육상태: ['모집', '마감', '종료'],
  교육신청상태: ['신청', '취소', '수료', '불참'],
  체크결과: ['적합', '부적합', '해당없음']
};

var REPORT_COLS = {
  '중간': { due: '중간기한', status: '중간검수', date: '중간제출일' },
  '최종': { due: '최종기한', status: '최종검수', date: '최종제출일' },
  '사후': { due: '사후기한', status: '사후검수', date: '사후제출일' }
};

var DEFAULT_SETTINGS = [
  ['APP_NAME', '산업일자리전환 컨설팅 관리', '앱 이름(화면·메일 제목에 표시)'],
  ['ORG_NAME', '한국표준협회 산업일자리전환 전담기관 일터혁신센터', '기관명'],
  ['ADMIN_EMAILS', 'ksawork02@gmail.com, ksawork02@ksa.or.kr', '관리자 이메일(쉼표로 구분). 이 주소로 로그인하면 관리자 화면'],
  ['CONTACT_EMAIL', 'ksawork02@ksa.or.kr', '폼·메일에 표시할 문의 이메일'],
  ['APPLY_OPEN', 'Y', '기업 컨설팅 신청폼 열림(Y/N)'],
  ['APPLY_YEAR', '2026', '기업 컨설팅 신청 연도'],
  ['APPLY_NOTICE', '한국표준협회 산업일자리전환 전담기관 일터혁신센터 내부에서만 공유되는 폼입니다.', '신청폼 상단 안내문'],
  ['PRE_OPEN', 'Y', '사전접수 폼 열림(Y/N)'],
  ['PRE_YEAR', '2027', '사전접수 대상 연도'],
  ['PRE_NOTICE', '해당 접수는 27년 한국표준협회 산업일자리전환 컨설팅 진행을 희망하는 사업장 대상 사전 신청 절차입니다.\n실제 컨설팅 신청 절차는 추후에 안내드릴 예정으로, 안내 받을 시에 필요 서류와 함께 신청해주시기를 바랍니다.', '사전접수 폼 안내문'],
  ['CONSULTANT_OPEN', 'Y', '컨설턴트 신청폼 열림(Y/N)'],
  ['CONSULTANT_NOTICE', '컨설턴트 이력서 양식을 다운로드 후 작성하여 첨부해 제출해 주세요.', '컨설턴트 신청폼 안내문'],
  ['RESUME_TEMPLATE_URL', '', '컨설턴트 이력서 양식 다운로드 링크(구글 드라이브 공유 링크 등)'],
  ['APPLY_TEMPLATE_URL', '', '기업 신청서·체크리스트 양식 다운로드 링크'],
  ['MAX_FILE_MB', '20', '파일 1개 최대 크기(MB)'],
  ['FILE_EXT_신청서', 'hwpx', '기업 신청서·체크리스트 허용 확장자(쉼표 구분, 비우면 제한 없음)'],
  ['FILE_EXT_보고서', 'hwpx', '중간·최종·사후 보고서 허용 확장자(쉼표 구분, 비우면 제한 없음)'],
  ['FILE_BLOCK_EXT', 'hwp', '모든 업로드에서 막을 확장자(쉼표 구분)'],
  ['NOTIFY_ADMIN_ON_SUBMIT', 'Y', '신청·보고서 제출 시 관리자에게 메일 알림(Y/N)'],
  ['SEND_RECEIPT', 'Y', '기업 신청 시 담당자에게 접수 확인 메일(Y/N)'],
  ['REMIND_DAYS', '7,3,0', '보고서 기한 알림 일수(기한 N일 전, 쉼표 구분)'],
  ['DAILY_DIGEST', 'Y', '매일 아침 관리자에게 현황 요약 메일(Y/N)'],
  ['KICKOFF_SUBJECT', '[산업일자리전환 컨설팅] {{사업장명}} 컨설팅 착수 안내', '착수메일 제목'],
  ['KICKOFF_BODY', '{{컨설턴트명}} 컨설턴트님, 안녕하세요.\n\n{{차수}} 산업일자리전환 컨설팅 대상 사업장이 배정되어 안내드립니다.\n\n■ 사업장: {{사업장명}}\n■ 주소: {{사업장주소}}\n■ 담당자: {{담당자명}} {{담당자직책}} / {{담당자연락처}} / {{담당자이메일}}\n■ 컨설팅 기간: {{착수일}} ~ {{종료일}}\n■ 중간보고서 기한: {{중간기한}}\n■ 최종보고서 기한: {{최종기한}}\n■ 사후관리 보고서 기한: {{사후기한}}\n\n사업장 담당자와 연락 후 착수해 주시고, 수행일지와 보고서는 아래 앱에서 작성·제출해 주세요.\n{{앱URL}}\n\n감사합니다.\n{{기관명}}', '착수메일 본문 ({{필드명}} 치환)'],
  ['LARK_SYNC', 'N', 'Lark → 앱 자동 동기화(Y/N). 설정 탭 [Lark 연동]에서 켜고 끔'],
  ['LARK_SYNC_MINUTES', '30', 'Lark 동기화 간격(분: 5, 10, 15, 30)'],
  ['LARK_SYNC_LAST', '', '마지막 동기화 결과'],
  ['DOC_TYPES', '협약서, 착수계획서, 개인정보 수집·이용 동의서, 비밀유지서약서', '사업장별 필수 서류 종류(쉼표 구분)'],
  ['CHECKLIST_중간', '사업장 현황(업종·인력·공정) 분석이 구체적인가\n산업전환 이슈와 사업장 영향 진단이 있는가\n직무·인력 변화 분석이 있는가\n개선과제가 진단 결과와 연결되는가\n보고서 양식·분량을 지켰는가\n오탈자·개인정보 노출이 없는가', '중간보고서 검수 항목(한 줄에 하나)'],
  ['CHECKLIST_최종', '진단 결과 요약이 명확한가\n개선과제별 실행계획(일정·담당)이 있는가\n직무전환·교육훈련 계획이 구체적인가\n정책연계(장려금 등) 방안이 제시되었는가\n기대효과가 제시되었는가\n보고서 양식·분량·첨부를 지켰는가\n오탈자·개인정보 노출이 없는가', '최종보고서 검수 항목(한 줄에 하나)'],
  ['CHECKLIST_사후', '개선과제 실행 결과를 점검했는가\n정책연계 실적과 증빙이 있는가\n후속 지원 필요사항을 정리했는가\n증빙자료가 첨부되었는가', '사후관리 보고서 검수 항목(한 줄에 하나)'],
  ['SURVEY_QUESTIONS', '컨설턴트의 전문성에 만족하십니까?\n컨설팅 일정과 소통에 만족하십니까?\n진단 결과와 개선과제가 사업장에 도움이 되었습니까?\n정책연계(장려금·교육 등) 안내가 유익했습니까?\n전반적으로 이번 컨설팅에 만족하십니까?', '만족도 설문 문항(한 줄에 하나, 5점 척도)'],
  ['SURVEY_SUBJECT', '[산업일자리전환 컨설팅] {{사업장명}} 만족도 조사 요청', '만족도 설문 메일 제목'],
  ['SURVEY_BODY', '{{담당자명}}님, 안녕하세요.\n\n{{사업장명}}의 산업일자리전환 컨설팅에 참여해 주셔서 감사합니다.\n더 나은 컨설팅을 위해 1분 만족도 조사에 참여해 주세요.\n\n{{설문URL}}\n\n{{기관명}}', '만족도 설문 메일 본문'],
  ['CALENDAR_SYNC', 'Y', '방문 일정을 구글 캘린더에 등록(Y/N)'],
  ['CALENDAR_ID', '', '등록할 캘린더 ID(비우면 운영 계정 기본 캘린더)'],
  ['STATUS_LOOKUP_OPEN', 'Y', '기업 신청 진행조회 페이지 열림(Y/N)'],
  ['MONTHLY_REPORT_MAIL', 'Y', '매월 1일 관리자에게 전월 실적 요약 메일(Y/N)'],
  ['NOTICE_MAIL_DEFAULT', 'N', '공지 게시 시 메일 알림 기본값(Y/N)'],
  ['SMS_ENABLED', 'N', '문자 발송 사용(Y/N). 솔라피 API 키는 설정 탭 [문자 설정]에서 입력'],
  ['SMS_SENDER', '', '문자 발신번호(솔라피에 사전 등록한 번호, 숫자만)'],
  ['SMS_ON_REMIND', 'Y', '보고서 기한 알림을 문자로도 발송(Y/N)'],
  ['SMS_ON_SUPPLEMENT', 'Y', '보완요청을 문자로도 발송(Y/N)'],
  ['SMS_ON_VISIT', 'Y', '방문 일정 안내를 사업장 담당자에게 문자로도 발송(Y/N)'],
  ['DRIVE_ROOT_ID', '', '파일 저장 루트 폴더 ID (setup이 자동 생성)'],
  ['APP_URL', '', '웹앱 주소(배포 후 자동 기록)'],
  ['LOG_KEEP_MONTHS', '3', '변경이력·메일이력 시트에 남길 개월 수. 더 오래된 행은 매일 점검 때 월별 보관 시트(보관_변경이력_yyyy-MM)로 옮김'],
  ['PUBLIC_URL', '', '외부에 안내할 주소(넷리파이 등, 예: https://ksa-consulting.netlify.app). 비우면 웹앱 주소 사용. 메일 링크·배포 링크에 쓰임']
];

/* ============================== 웹앱 진입 ============================== */

function doGet(e) {
  var page = (e && e.parameter && e.parameter.page) || '';
  try { saveAppUrl_(); } catch (err) {}
  var tpl;
  if (page === 'apply' || page === 'pre' || page === 'consultant' || page === 'status' || page === 'survey') {
    tpl = HtmlService.createTemplateFromFile('Form');
    tpl.page = page;
    tpl.token = String((e.parameter && e.parameter.t) || '').replace(/[^0-9a-f]/gi, '').slice(0, 64);
  } else {
    tpl = HtmlService.createTemplateFromFile('Index');
    // 넷리파이 래퍼 출처: 로그인 토큰을 래퍼에 맡겨 iframe 저장소가 막혀도 로그인 유지
    var po = String(setting_('PUBLIC_URL') || '').trim().match(/^https:\/\/[^\/?#\s]+/i);
    tpl.parentOrigin = po ? po[0].toLowerCase() : '';
  }
  tpl.appName = setting_('APP_NAME') || '산업일자리전환 컨설팅 관리';
  return tpl.evaluate()
    .setTitle(tpl.appName)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function saveAppUrl_() {
  var url = ScriptApp.getService().getUrl();
  if (url && setting_('APP_URL') !== url) setSetting_('APP_URL', url);
}

function appUrl_() {
  return String(setting_('PUBLIC_URL') || '').replace(/\/+$/, '') || setting_('APP_URL') || ScriptApp.getService().getUrl() || '';
}

/** 신청폼 주소: 넷리파이 주소면 /apply, 웹앱 주소면 ?page=apply */
function pageUrl_(page) {
  var u = appUrl_();
  if (!page) return u;
  return /script\.google(usercontent)?\.com/.test(u) ? u + '?page=' + page : u + '/' + page;
}

/* ============================== DB 레이어 ============================== */

var _cache = {};

function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty('SS_ID');
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('스프레드시트를 찾을 수 없습니다. setup()을 먼저 실행하세요.');
  return ss;
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('시트 없음: ' + name + ' (setup()을 실행하세요)');
  return sh;
}

function headers_(name) {
  var sh = sheet_(name);
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
}

/** 시트 전체를 객체 배열로 읽음 (모든 값 문자열). _row = 시트 행번호
 *  1) 실행 단위 캐시 _cache → 2) 요청 간 캐시(CacheService, 시트 버전 키) → 3) 시트 읽기 */
function all_(name) {
  if (_cache[name]) return _cache[name];
  var shared = sharedGet_(name);
  if (shared && shared.rows) { _cache[name] = shared.rows; return shared.rows; }
  var sh = sheet_(name);
  var lr = sh.getLastRow(), lc = sh.getLastColumn();
  var out = [];
  if (lr >= 2) {
    var h = sh.getRange(1, 1, 1, lc).getDisplayValues()[0];
    var vals = sh.getRange(2, 1, lr - 1, lc).getDisplayValues();
    for (var i = 0; i < vals.length; i++) {
      if (vals[i].join('') === '') continue;
      var o = { _row: i + 2 };
      for (var j = 0; j < h.length; j++) if (h[j]) o[h[j]] = vals[i][j];
      out.push(o);
    }
  }
  _cache[name] = out;
  if (shared && shared.ver) sharedPut_(name, shared.ver, out);
  return out;
}

/* ---------- 요청 간 캐시 ----------
 * 시트마다 버전 키 'v:시트'를 두고, 데이터는 'd:시트:버전:n' 조각으로 저장한다(값 하나 100KB 제한).
 * 쓰기(insert_/update_/remove_)는 락 안에서 시트를 고친 뒤 버전을 바꾼다 → 옛 버전 데이터는 다시 읽히지 않는다.
 * 락 안(쓰기 중)에서는 항상 시트를 직접 읽는다. 시트를 손으로 고치면 onEdit가 버전을 바꾼다.
 * 행 삭제·정렬처럼 onEdit가 잡지 못하는 수동 변경은 SHEET_CACHE_SECONDS 뒤 반영(또는 메뉴 > 앱 캐시 비우기). */
var SHEET_CACHE_SECONDS = 600;
var CACHE_CHUNK = 30000;        // 조각당 문자 수 (한글 3바이트 기준 100KB 이내)
var CACHE_MAX_CHUNKS = 100;     // 약 3MB 넘는 시트는 요청 간 캐시 안 함
var NO_SHARED_CACHE = { '변경이력': 1, '메일이력': 1 };
var _lockDepth = 0;

function newVer_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 10); }

/** 시트 버전. 없으면(만료) 락을 잡고 새로 만든다. 락을 못 잡으면 null → 이번엔 캐시 안 씀 */
function dataVersion_(name) {
  var cache = CacheService.getScriptCache(), k = 'v:' + name, v = cache.get(k);
  if (v) return v;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) return null;
  try {
    v = cache.get(k);
    if (!v) { v = newVer_(); cache.put(k, v, 21600); }
    return v;
  } finally { lock.releaseLock(); }
}

/** 시트 내용이 바뀌었음을 알림 (쓰기 후 락 안에서 호출) */
function bumpVersion_(name) {
  try { CacheService.getScriptCache().put('v:' + name, newVer_(), 21600); } catch (e) {}
}

/** 모든 시트의 요청 간 캐시 무효화 */
function clearDataCache_() {
  _cache = {};
  Object.keys(SCHEMA).forEach(bumpVersion_);
}

function sharedGet_(name) {
  if (_lockDepth > 0 || NO_SHARED_CACHE[name]) return null;
  try {
    var v = dataVersion_(name);
    if (!v) return null;
    var cache = CacheService.getScriptCache(), base = 'd:' + name + ':' + v;
    var n = Number(cache.get(base) || 0);
    if (!n) return { ver: v };
    var keys = [];
    for (var i = 0; i < n; i++) keys.push(base + ':' + i);
    var got = cache.getAll(keys), parts = [];
    for (i = 0; i < n; i++) {
      if (got[keys[i]] === undefined || got[keys[i]] === null) return { ver: v };
      parts.push(got[keys[i]]);
    }
    return { ver: v, rows: JSON.parse(parts.join('')) };
  } catch (e) { return null; }
}

function sharedPut_(name, ver, rows) {
  try {
    var s = JSON.stringify(rows), o = {}, n = 0, base = 'd:' + name + ':' + ver;
    for (var p = 0; p < s.length; n++) {
      var e = Math.min(s.length, p + CACHE_CHUNK), c = s.charCodeAt(e - 1);
      if (e < s.length && c >= 0xD800 && c <= 0xDBFF) e--;   // 이모지(서로게이트 쌍)를 자르지 않음
      if (n >= CACHE_MAX_CHUNKS) return;
      o[base + ':' + n] = s.slice(p, e);
      p = e;
    }
    var cache = CacheService.getScriptCache();
    cache.putAll(o, SHEET_CACHE_SECONDS);
    cache.put(base, String(n), SHEET_CACHE_SECONDS);
  } catch (e) {}
}

/** 시트를 직접 고쳤을 때(단순 트리거) 해당 시트 캐시 무효화 */
function onEdit(e) {
  try { bumpVersion_(e.range.getSheet().getName()); } catch (err) {}
}

function find_(name, id, key) {
  key = key || 'ID';
  var rows = all_(name);
  for (var i = 0; i < rows.length; i++) if (rows[i][key] === String(id)) return rows[i];
  return null;
}

function newId_(name) {
  var p = ID_PREFIX[name] || 'X';
  var d = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyMMdd');
  var r = Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
  return p + d + '-' + r;
}

function cell_(v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) {
    if (v.length && typeof v[0] === 'object') return JSON.stringify(v);
    return v.join(', ');
  }
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 'Y' : '';
  return String(v);
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  _lockDepth++;
  try { return fn(); } finally { _lockDepth--; lock.releaseLock(); }
}

/** 여러 행 추가. objs: 객체 배열. ID 없으면 생성 */
function insertMany_(name, objs, user) {
  if (!objs.length) return [];
  return withLock_(function () {
    var sh = sheet_(name), h = headers_(name);
    var now = now_();
    var used = {};
    if (h.indexOf('ID') >= 0) { delete _cache[name]; all_(name).forEach(function (r) { used[r.ID] = 1; }); }
    var rows = objs.map(function (o) {
      if (h.indexOf('ID') >= 0) {
        while (!o.ID || used[o.ID]) o.ID = newId_(name);
        used[o.ID] = 1;
      }
      if (h.indexOf('수정일') >= 0 && !o['수정일']) o['수정일'] = now;
      return h.map(function (k) { return cell_(o[k]); });
    });
    var start = sh.getLastRow() + 1;
    sh.getRange(start, 1, rows.length, h.length).setNumberFormat('@').setValues(rows);
    delete _cache[name];
    bumpVersion_(name);
    if (user && objs.length <= 5) objs.forEach(function (o) { audit_(user, '추가', name, o.ID || '', '', '', ''); });
    return objs;
  });
}

function insert_(name, obj, user) { return insertMany_(name, [obj], user)[0]; }

/** 한 행 수정. 변경된 필드만 기록 */
function update_(name, id, patch, user, key) {
  return withLock_(function () {
    delete _cache[name];
    var row = find_(name, id, key);
    if (!row) throw new Error(name + '에서 ' + id + '를 찾을 수 없습니다.');
    var h = headers_(name), changed = [];
    var vals = h.map(function (k) { return row[k] === undefined ? '' : row[k]; });
    Object.keys(patch).forEach(function (k) {
      var idx = h.indexOf(k);
      if (idx < 0 || k === 'ID' || k === 'LarkID') return;
      var nv = cell_(patch[k]);
      if (nv !== vals[idx]) { changed.push([k, vals[idx], nv]); vals[idx] = nv; }
    });
    if (!changed.length) return row;
    var mi = h.indexOf('수정일');
    if (mi >= 0) vals[mi] = now_();
    sheet_(name).getRange(row._row, 1, 1, h.length).setNumberFormat('@').setValues([vals]);
    bumpVersion_(name);
    if (user) changed.forEach(function (c) { audit_(user, '수정', name, id, c[0], c[1], c[2]); });
    delete _cache[name];
    var out = { _row: row._row };
    h.forEach(function (k, i) { out[k] = vals[i]; });
    return out;
  });
}

function remove_(name, id, user) {
  return withLock_(function () {
    delete _cache[name];
    var row = find_(name, id);
    if (!row) return false;
    sheet_(name).deleteRow(row._row);
    delete _cache[name];
    bumpVersion_(name);
    if (user) audit_(user, '삭제', name, id, '', JSON.stringify(strip_(row)).slice(0, 1000), '');
    return true;
  });
}

function audit_(user, action, sheet, id, field, oldV, newV) {
  try {
    sheet_('변경이력').appendRow([now_(), user, action, sheet, id, field,
      String(oldV || '').slice(0, 2000), String(newV || '').slice(0, 2000)]);
  } catch (e) {}
}

function strip_(o) {
  if (!o) return o;
  var c = {};
  Object.keys(o).forEach(function (k) { if (k.charAt(0) !== '_') c[k] = o[k]; });
  return c;
}

function now_() { return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'); }
function today_() { return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd'); }

function setting_(key) {
  var c = _cache['__settings'];
  if (!c) {
    c = {};
    try { all_('설정').forEach(function (r) { c[r['키']] = r['값']; }); } catch (e) {}
    _cache['__settings'] = c;
  }
  return c[key] === undefined ? '' : c[key];
}

function setSetting_(key, value) {
  delete _cache['__settings'];
  var row = find_('설정', key, '키');
  if (row) update_('설정', key, { '값': value }, null, '키');
  else insert_('설정', { '키': key, '값': value, '설명': '' });
  delete _cache['__settings'];
}

function parseFiles_(s) {
  if (!s) return [];
  try { var a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}

function splitIds_(s) {
  return String(s || '').split(',').map(function (x) { return x.trim(); }).filter(String);
}

/* ============================== 검증 유틸 ============================== */

function normBrn_(s) { return String(s || '').replace(/[^0-9]/g, ''); }

function fmtBrn_(s) {
  var d = normBrn_(s);
  return d.length === 10 ? d.slice(0, 3) + '-' + d.slice(3, 5) + '-' + d.slice(5) : String(s || '');
}

/** 사업자등록번호 체크섬 검증 */
function validBrn_(s) {
  var d = normBrn_(s);
  if (d.length !== 10) return false;
  var w = [1, 3, 7, 1, 3, 7, 1, 3, 5], sum = 0;
  for (var i = 0; i < 9; i++) sum += Number(d[i]) * w[i];
  sum += Math.floor(Number(d[8]) * 5 / 10);
  return (10 - (sum % 10)) % 10 === Number(d[9]);
}

function validEmail_(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim()); }
function validPhone_(s) { var d = String(s || '').replace(/[^0-9]/g, ''); return d.length >= 9 && d.length <= 12; }

function fmtPhone_(s) {
  var d = String(s || '').replace(/[^0-9]/g, '');
  if (/^02/.test(d)) return d.length === 9 ? d.replace(/(\d{2})(\d{3})(\d{4})/, '$1-$2-$3') : d.replace(/(\d{2})(\d{4})(\d{4})/, '$1-$2-$3');
  if (d.length === 11) return d.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  if (d.length === 10) return d.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
  return String(s || '');
}

var REGION_MAP = [['서울', '서울'], ['부산', '부산'], ['대구', '대구'], ['인천', '인천'], ['광주', '광주'], ['대전', '대전'],
  ['울산', '울산'], ['세종', '세종'], ['경기', '경기'], ['강원', '강원'], ['충청북', '충북'], ['충북', '충북'],
  ['충청남', '충남'], ['충남', '충남'], ['전라북', '전북'], ['전북', '전북'], ['전라남', '전남'], ['전남', '전남'],
  ['경상북', '경북'], ['경북', '경북'], ['경상남', '경남'], ['경남', '경남'], ['제주', '제주']];

function region_(addr) {
  var a = String(addr || '').replace(/^\s*(\(\d+\)|\d{5})?\s*/, '').trim();
  for (var i = 0; i < REGION_MAP.length; i++) if (a.indexOf(REGION_MAP[i][0]) === 0) return REGION_MAP[i][1];
  return '';
}

function req_(data, keys) {
  var miss = keys.filter(function (k) { return !String(data[k] || '').trim(); });
  if (miss.length) throw new Error('필수 항목을 입력해 주세요: ' + miss.join(', '));
}

function clean_(data, keys) {
  var o = {};
  keys.forEach(function (k) { if (data[k] !== undefined) o[k] = String(data[k] === null ? '' : data[k]).trim(); });
  return o;
}

/* ============================== 파일(드라이브) ============================== */

function rootFolder_() {
  var id = setting_('DRIVE_ROOT_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var f = DriveApp.createFolder('산업일자리전환 컨설팅 앱 파일');
  setSetting_('DRIVE_ROOT_ID', f.getId());
  return f;
}

function folderPath_(parts) {
  var f = rootFolder_();
  parts.forEach(function (p) {
    p = String(p || '기타').replace(/[\\\/:*?"<>|]/g, '_').trim() || '기타';
    var it = f.getFoldersByName(p);
    f = it.hasNext() ? it.next() : f.createFolder(p);
  });
  return f;
}

function extList_(key) {
  return String(setting_(key) || '').split(/[,\s]+/).map(function (x) { return x.replace(/^\./, '').trim().toLowerCase(); }).filter(String);
}

/** 업로드 확장자 규칙: rule = '신청서' | '보고서' | '' */
function fileRule_(rule) {
  return { allow: rule ? extList_('FILE_EXT_' + rule) : [], block: extList_('FILE_BLOCK_EXT') };
}

function fileRules_() { return { 신청서: fileRule_('신청서'), 보고서: fileRule_('보고서'), 기본: fileRule_('') }; }

/** 확장자 + 실제 파일 내용 확인 (확장자만 바꾼 HWP 차단) */
function checkFile_(name, bytes, rule) {
  var r = fileRule_(rule), ext = String(name).indexOf('.') >= 0 ? String(name).split('.').pop().toLowerCase() : '';
  var hwpHelp = ' 한글에서 [파일 > 다른 이름으로 저장 > 파일 형식: HWPX]로 저장한 뒤 올려 주세요.';
  if (r.block.indexOf(ext) >= 0) throw new Error('.' + ext + ' 파일은 업로드할 수 없습니다: ' + name + (ext === 'hwp' ? '.' + hwpHelp : ''));
  if (r.allow.length && r.allow.indexOf(ext) < 0) throw new Error((rule || '') + ' 파일은 ' + r.allow.map(function (x) { return '.' + x; }).join(', ') + ' 형식만 올릴 수 있습니다: ' + name + (r.allow.indexOf('hwpx') >= 0 ? '.' + hwpHelp : ''));
  // HWPX는 ZIP(PK..) 구조. 구형 HWP(OLE: D0 CF 11 E0)를 이름만 바꾼 경우 차단
  if (ext === 'hwpx' && !(bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4B)) {
    throw new Error('올바른 HWPX 파일이 아닙니다(확장자만 바꾼 HWP일 수 있습니다): ' + name + '.' + hwpHelp);
  }
}

/** files: [{name, mime, b64}] → [{id,name,size}] */
function saveFiles_(parts, files, rule) {
  if (!files || !files.length) return [];
  var maxMb = Number(setting_('MAX_FILE_MB') || 20);
  // 저장 전에 모든 파일을 먼저 검사 (일부만 저장되는 일 방지)
  var decoded = files.map(function (f) {
    var bytes = Utilities.base64Decode(f.b64);
    if (bytes.length > maxMb * 1024 * 1024) throw new Error('파일이 너무 큽니다(최대 ' + maxMb + 'MB): ' + f.name);
    checkFile_(f.name, bytes, rule);
    return bytes;
  });
  var folder = folderPath_(parts);
  return files.map(function (f, i) {
    var bytes = decoded[i];
    var file = folder.createFile(Utilities.newBlob(bytes, f.mime || 'application/octet-stream', f.name));
    return { id: file.getId(), name: f.name, size: bytes.length, at: now_() };
  });
}

/* ============================== 메일 ============================== */

var MAIL_RESERVE = 15;

function sendMail_(to, subject, body, kind, relId, opt) {
  to = String(to || '').trim();
  if (!to) return false;
  var result = 'OK';
  try {
    // 한도는 메일 수가 아니라 받는 사람 수(to+cc)만큼 줄어든다
    var q = MailApp.getRemainingDailyQuota(), need = recipientCount_(to, opt && opt.cc);
    if (q < need) throw new Error('일일 메일 한도 초과 (남은 ' + q + '명, 필요 ' + need + '명)');
    // 로그인 코드용으로 마지막 MAIL_RESERVE건은 남겨 둠
    if (kind !== '로그인' && q - need < MAIL_RESERVE) throw new Error('보류: 남은 한도 ' + q + '건 중 ' + MAIL_RESERVE + '건은 로그인 코드용');
    var html = String(body).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
    var o = { to: to, subject: subject, htmlBody: '<div style="font-family:sans-serif;font-size:14px;line-height:1.6">' + html + '</div>', name: setting_('APP_NAME') || '산업일자리전환 컨설팅' };
    if (opt && opt.cc) o.cc = opt.cc;
    var re = setting_('CONTACT_EMAIL');
    if (re) o.replyTo = re;
    MailApp.sendEmail(o);
  } catch (e) { result = '실패: ' + e.message; }
  try { sheet_('메일이력').appendRow([now_(), to, subject, kind || '', relId || '', result]); } catch (e2) {}
  return result === 'OK';
}

/** 받는 사람 수 (쉼표·세미콜론 구분) */
function recipientCount_(to, cc) {
  return (String(to || '') + ',' + String(cc || '')).split(/[,;]/).filter(function (x) { return x.trim(); }).length;
}

function adminEmails_() {
  return String(setting_('ADMIN_EMAILS') || '').split(/[,;\s]+/).map(function (s) { return s.trim().toLowerCase(); }).filter(String);
}

function notifyAdmins_(subject, body, kind, relId) {
  if (setting_('NOTIFY_ADMIN_ON_SUBMIT') !== 'Y') return;
  var to = adminEmails_().join(',');
  if (to) sendMail_(to, subject, body, kind, relId);
}

function fill_(tpl, vars) {
  return String(tpl || '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, function (m, k) { return vars[k] !== undefined ? vars[k] : ''; });
}

/* ============================== 인증 (이메일 OTP) ============================== */

function whoIs_(email) {
  email = String(email || '').trim().toLowerCase();
  if (!email) return null;
  if (adminEmails_().indexOf(email) >= 0) {
    var c0 = consultantByEmail_(email);
    return { email: email, role: 'admin', name: c0 ? c0['성명'] : '관리자', consultantId: c0 ? c0.ID : '' };
  }
  var c = consultantByEmail_(email);
  if (c && c['상태'] !== '제외' && c['상태'] !== '신청') return { email: email, role: 'consultant', name: c['성명'], consultantId: c.ID };
  return null;
}

function consultantByEmail_(email) {
  var rows = all_('컨설턴트');
  for (var i = 0; i < rows.length; i++) if (String(rows[i]['이메일']).trim().toLowerCase() === email) return rows[i];
  return null;
}

function requestOtp(email) {
  email = String(email || '').trim().toLowerCase();
  if (!validEmail_(email)) throw new Error('이메일 형식을 확인해 주세요.');
  var who = whoIs_(email);
  if (!who) throw new Error('등록된 관리자 또는 활동 중인 컨설턴트 이메일이 아닙니다. 담당자에게 문의해 주세요.');
  var cache = CacheService.getScriptCache();
  var cnt = Number(cache.get('otpcnt:' + email) || 0);
  if (cnt >= 5) throw new Error('인증코드 요청이 너무 많습니다. 10분 후 다시 시도해 주세요.');
  cache.put('otpcnt:' + email, String(cnt + 1), 600);
  var code = String(Math.floor(100000 + Math.random() * 900000));
  cache.put('otp:' + email, JSON.stringify({ code: code, tries: 0 }), 600);
  var ok = sendMail_(email, '[' + (setting_('APP_NAME') || '컨설팅 관리') + '] 로그인 인증코드 ' + code,
    '로그인 인증코드: ' + code + '\n\n10분 동안 유효합니다. 본인이 요청하지 않았다면 이 메일을 무시해 주세요.', '로그인', '');
  if (!ok) throw new Error('메일 발송에 실패했습니다. 관리자에게 문의해 주세요.');
  return true;
}

function verifyOtp(email, code) {
  email = String(email || '').trim().toLowerCase();
  var cache = CacheService.getScriptCache();
  var raw = cache.get('otp:' + email);
  if (!raw) throw new Error('인증코드가 만료되었습니다. 다시 요청해 주세요.');
  var o = JSON.parse(raw);
  if (o.tries >= 5) { cache.remove('otp:' + email); throw new Error('시도 횟수를 초과했습니다. 다시 요청해 주세요.'); }
  if (String(code).trim() !== o.code) {
    o.tries++; cache.put('otp:' + email, JSON.stringify(o), 600);
    throw new Error('인증코드가 올바르지 않습니다.');
  }
  cache.remove('otp:' + email);
  var who = whoIs_(email);
  if (!who) throw new Error('권한이 없습니다.');
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  var exp = Date.now() + SESSION_DAYS * 86400000;
  PropertiesService.getScriptProperties().setProperty('S_' + token, JSON.stringify({ email: email, exp: exp }));
  pruneSessions_(email);
  audit_(email, '로그인', '', '', '', '', who.role);
  return { token: token, user: who };
}

/** 로그인 유지 기간(일). 기기별 토큰은 스크립트 속성에 저장 */
var SESSION_DAYS = 30;

function logout(token) {
  try { PropertiesService.getScriptProperties().deleteProperty('S_' + token); } catch (e) {}
  CacheService.getScriptCache().remove('who:' + token);
  return true;
}

/** 토큰 → 사용자. 권한은 매번(10분 캐시) 시트 기준으로 다시 판단 → 제외 처리 즉시 반영 */
function session_(token, role) {
  if (!token || !/^[0-9a-f]{40}$/.test(token)) throw new Error('SESSION_EXPIRED');
  var cache = CacheService.getScriptCache();
  var raw = cache.get('who:' + token), s;
  if (raw) s = JSON.parse(raw);
  else {
    var p = PropertiesService.getScriptProperties().getProperty('S_' + token);
    if (!p) throw new Error('SESSION_EXPIRED');
    var t = JSON.parse(p);
    if (t.exp < Date.now()) { logout(token); throw new Error('SESSION_EXPIRED'); }
    s = whoIs_(t.email);
    if (!s) { logout(token); throw new Error('SESSION_EXPIRED'); }
    cache.put('who:' + token, JSON.stringify(s), 600);
  }
  if (role === 'admin' && s.role !== 'admin') throw new Error('관리자 권한이 필요합니다.');
  return s;
}

/** 한 사람의 로그인 토큰은 최근 MAX_SESSIONS_PER_USER개(기기)만 유지 → 스크립트 속성(500KB) 보호 */
var MAX_SESSIONS_PER_USER = 5;

function pruneSessions_(email) {
  var props = PropertiesService.getScriptProperties(), all = props.getProperties(), mine = [];
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('S_') !== 0) return;
    try { var t = JSON.parse(all[k]); if (t.email === email) mine.push({ k: k, exp: t.exp }); } catch (e) {}
  });
  mine.sort(function (a, b) { return b.exp - a.exp; });
  mine.slice(MAX_SESSIONS_PER_USER).forEach(function (x) {
    props.deleteProperty(x.k);
    CacheService.getScriptCache().remove('who:' + x.k.slice(2));
  });
}

/** 스크립트 속성 사용량(바이트, 한도 500KB)과 로그인 토큰 수 */
function propsUsage_() {
  var all = PropertiesService.getScriptProperties().getProperties(), bytes = 0, sessions = 0;
  Object.keys(all).forEach(function (k) {
    bytes += utf8Len_(k) + utf8Len_(all[k]);
    if (k.indexOf('S_') === 0) sessions++;
  });
  return { bytes: bytes, sessions: sessions };
}

function utf8Len_(s) {
  s = String(s); var n = 0;
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : (c >= 0xD800 && c <= 0xDBFF) ? (i++, 4) : 3;
  }
  return n;
}

var PROPS_WARN_BYTES = 400 * 1024;

/** 만료된 로그인 토큰 정리 (dailyCheck에서 호출) */
function cleanupSessions_() {
  var props = PropertiesService.getScriptProperties(), all = props.getProperties(), now = Date.now();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('S_') !== 0) return;
    try { if (JSON.parse(all[k]).exp < now) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); }
  });
}

function me(token) { return session_(token); }

/* ============================== 외부 폼 (로그인 없음) ============================== */

function getFormConfig(page) {
  var map = { apply: ['APPLY_OPEN', 'APPLY_YEAR', 'APPLY_NOTICE', 'APPLY_TEMPLATE_URL'],
    pre: ['PRE_OPEN', 'PRE_YEAR', 'PRE_NOTICE', ''], consultant: ['CONSULTANT_OPEN', '', 'CONSULTANT_NOTICE', 'RESUME_TEMPLATE_URL'],
    status: ['STATUS_LOOKUP_OPEN', '', '', ''], survey: ['', '', '', ''] };
  var k = map[page];
  if (!k) throw new Error('잘못된 페이지');
  return {
    open: k[0] ? setting_(k[0]) === 'Y' : true, year: k[1] ? setting_(k[1]) : '', notice: setting_(k[2]),
    templateUrl: k[3] ? setting_(k[3]) : '', contact: setting_('CONTACT_EMAIL'), org: setting_('ORG_NAME'),
    appName: setting_('APP_NAME'), maxMb: Number(setting_('MAX_FILE_MB') || 20), fileRules: fileRules_()
  };
}

var APPLY_FIELDS = ['사업장명', '사업자등록번호', '업태', '종목', '근로자수', '사업장주소', '담당부서', '담당자명',
  '담당자직책', '담당자연락처', '담당자이메일', '희망컨설턴트'];

function checkCompany_(d, year, kind) {
  req_(d, ['사업장명', '사업자등록번호', '업태', '종목', '근로자수', '사업장주소', '담당부서', '담당자명', '담당자직책', '담당자연락처', '담당자이메일']);
  if (!validBrn_(d['사업자등록번호'])) throw new Error('사업자등록번호가 올바르지 않습니다. 10자리 번호를 다시 확인해 주세요.');
  if (!validEmail_(d['담당자이메일'])) throw new Error('담당자 이메일 형식을 확인해 주세요.');
  if (!validPhone_(d['담당자연락처'])) throw new Error('담당자 연락처를 확인해 주세요.');
  if (!/^\d+$/.test(String(d['근로자수']).replace(/,/g, ''))) throw new Error('근로자 수는 숫자로 입력해 주세요.');
  var brn = normBrn_(d['사업자등록번호']);
  var dup = all_('신청').filter(function (r) {
    return normBrn_(r['사업자등록번호']) === brn && String(r['연도']) === String(year) && r['구분'] === kind && r['승인여부'] !== '취소';
  });
  if (dup.length) throw new Error('이미 ' + year + '년 ' + kind + ' 접수된 사업자등록번호입니다(접수번호 ' + dup[0].ID + '). 변경이 필요하면 ' + setting_('CONTACT_EMAIL') + '로 문의해 주세요.');
  d['사업자등록번호'] = fmtBrn_(d['사업자등록번호']);
  d['담당자연락처'] = fmtPhone_(d['담당자연락처']);
  d['근로자수'] = String(d['근로자수']).replace(/,/g, '');
  d['담당자이메일'] = d['담당자이메일'].toLowerCase();
}

/** 기업 컨설팅 신청 */
function submitApplication(data, files) {
  var cfg = getFormConfig('apply');
  if (!cfg.open) throw new Error('현재 신청 기간이 아닙니다.');
  var d = clean_(data, APPLY_FIELDS);
  checkCompany_(d, cfg.year, '본신청');
  files = files || {};
  if (!files['신청서'] || !files['신청서'].length) throw new Error('신청서 및 체크리스트 파일을 첨부해 주세요.');
  if (!files['사업자등록증'] || !files['사업자등록증'].length) throw new Error('사업자등록증 파일을 첨부해 주세요.');
  var parts = ['신청서류', cfg.year, d['사업장명'] + '_' + normBrn_(d['사업자등록번호'])];
  // 저장 전 전체 파일 사전 검사
  [['신청서', '신청서'], ['사업자등록증', ''], ['중소기업확인서', '']].forEach(function (x) {
    (files[x[0]] || []).forEach(function (f) { checkFile_(f.name, Utilities.base64Decode(f.b64), x[1]); });
  });
  var rec = Object.assign(d, {
    구분: '본신청', 연도: cfg.year, 사업장지역: region_(d['사업장주소']), 승인여부: '대기', 연락여부: '미확인',
    신청서: saveFiles_(parts, files['신청서'], '신청서'), 사업자등록증: saveFiles_(parts, files['사업자등록증']),
    중소기업확인서: saveFiles_(parts, files['중소기업확인서'] || []), 신청일: now_(), 신청자: '외부폼'
  });
  rec = insert_('신청', rec, '외부폼');
  afterCompanySubmit_(rec);
  return { id: rec.ID };
}

/** 사전 접수 */
function submitPreRegistration(data) {
  var cfg = getFormConfig('pre');
  if (!cfg.open) throw new Error('현재 사전접수 기간이 아닙니다.');
  var d = clean_(data, APPLY_FIELDS);
  checkCompany_(d, cfg.year, '사전접수');
  var rec = Object.assign(d, { 구분: '사전접수', 연도: cfg.year, 사업장지역: region_(d['사업장주소']), 승인여부: '대기', 연락여부: '미확인', 신청일: now_(), 신청자: '외부폼' });
  rec = insert_('신청', rec, '외부폼');
  afterCompanySubmit_(rec);
  return { id: rec.ID };
}

function afterCompanySubmit_(rec) {
  var title = rec['연도'] + '년 산업일자리전환 컨설팅 ' + (rec['구분'] === '사전접수' ? '사전접수' : '신청');
  if (setting_('SEND_RECEIPT') === 'Y') {
    sendMail_(rec['담당자이메일'], '[' + title + '] 접수 확인 (' + rec['사업장명'] + ')',
      rec['담당자명'] + '님, 안녕하세요.\n\n' + rec['사업장명'] + '의 ' + title + '이 정상 접수되었습니다.\n접수번호: ' + rec.ID +
      '\n\n검토 후 담당자가 연락드리겠습니다.\n문의: ' + setting_('CONTACT_EMAIL') + '\n\n' + setting_('ORG_NAME'), '접수확인', rec.ID);
  }
  notifyAdmins_('[신규 ' + rec['구분'] + '] ' + rec['사업장명'], title + ' 신규 접수\n\n사업장: ' + rec['사업장명'] +
    '\n지역: ' + rec['사업장지역'] + '\n담당자: ' + rec['담당자명'] + ' (' + rec['담당자연락처'] + ')\n희망컨설턴트: ' +
    (rec['희망컨설턴트'] || '-') + '\n\n' + appUrl_(), '관리자알림', rec.ID);
}

/** 컨설턴트 신청 */
function submitConsultantApplication(data, files) {
  var cfg = getFormConfig('consultant');
  if (!cfg.open) throw new Error('현재 컨설턴트 모집 기간이 아닙니다.');
  var d = clean_(data, ['성명', '연락처', '이메일', '주요활동지역']);
  req_(d, ['성명', '연락처', '이메일', '주요활동지역']);
  if (!validEmail_(d['이메일'])) throw new Error('이메일 형식을 확인해 주세요.');
  if (!validPhone_(d['연락처'])) throw new Error('연락처를 확인해 주세요.');
  d['이메일'] = d['이메일'].toLowerCase();
  if (consultantByEmail_(d['이메일'])) throw new Error('이미 등록된 이메일입니다. 이력서 변경은 ' + setting_('CONTACT_EMAIL') + '로 문의해 주세요.');
  if (!files || !files['이력서'] || !files['이력서'].length) throw new Error('이력서를 첨부해 주세요.');
  var rec = Object.assign(d, { 연락처: fmtPhone_(d['연락처']), 구분: '외부', 상태: '신청', 이력서: saveFiles_(['이력서', d['성명']], files['이력서']), 등록일: now_() });
  rec = insert_('컨설턴트', rec, '외부폼');
  notifyAdmins_('[컨설턴트 신청] ' + rec['성명'], '컨설턴트 신청 접수\n\n성명: ' + rec['성명'] + '\n연락처: ' + rec['연락처'] +
    '\n이메일: ' + rec['이메일'] + '\n활동지역: ' + rec['주요활동지역'] + '\n\n' + appUrl_(), '관리자알림', rec.ID);
  return { id: rec.ID };
}

/* ============================== 공통 조회 ============================== */

function consultantNames_(ids) {
  return splitIds_(ids).map(function (id) { var c = find_('컨설턴트', id); return c ? c['성명'] : id; }).join(', ');
}

/** 사업장 행에 계산 필드 추가 */
function enrichProject_(p) {
  var o = strip_(p), today = today_();
  o['컨설턴트명'] = consultantNames_(p['컨설턴트ID']) || p['컨설턴트명'];
  var next = null;
  if (p['차수'] !== '취소') {
    ['중간', '최종', '사후'].some(function (t) {
      var c = REPORT_COLS[t], st = p[c.status] || '미제출';
      if (st === '미제출' || st === '보완요청') {
        next = { 종류: t, 기한: p[c.due], 상태: st, dday: p[c.due] ? dayDiff_(today, p[c.due]) : null };
        return true;
      }
      return false;
    });
  }
  o._next = next;
  o._단계 = p['차수'] === '취소' ? '취소' : next ? (next.종류 + (next.상태 === '보완요청' ? ' 보완' : ' 작성')) :
    (p['사후검수'] === '검수완료' ? '완료' : '검수 대기');
  return o;
}

function dayDiff_(a, b) {
  var da = new Date(a.slice(0, 10) + 'T00:00:00'), db = new Date(String(b).slice(0, 10) + 'T00:00:00');
  if (isNaN(db)) return null;
  return Math.round((db - da) / 86400000);
}

function logCounts_() {
  var m = {};
  all_('수행일지').forEach(function (l) { m[l['사업장ID']] = (m[l['사업장ID']] || 0) + 1; });
  return m;
}

function trainingHours_() {
  var m = {};
  all_('교육이수').forEach(function (r) {
    var h = parseFloat(String(r['이수시간']).replace(/[^0-9.]/g, '')) || 0;
    m[r['컨설턴트ID']] = (m[r['컨설턴트ID']] || 0) + h;
  });
  return m;
}

function options_() {
  var o = JSON.parse(JSON.stringify(OPTIONS));
  o.차수 = all_('차수일정').map(function (r) { return r['차수']; }).concat(['취소']);
  o.서류종류 = docTypes_();
  o.체크리스트 = { 중간: checklist_('중간'), 최종: checklist_('최종'), 사후: checklist_('사후') };
  return o;
}

/* ============================== 관리자 API ============================== */

function adminBootstrap(token) {
  var s = session_(token, 'admin');
  return {
    me: s, options: options_(), appUrl: appUrl_(), fileRules: fileRules_(), maxMb: Number(setting_('MAX_FILE_MB') || 20),
    apps: adminListApplications_(), projects: adminListProjects_(), consultants: adminListConsultants_(),
    schedule: all_('차수일정').map(strip_), trainings: all_('교육').map(strip_),
    badges: adminBadges_(), sms: smsReady_()
  };
}

function adminListApplications_() {
  return all_('신청').map(strip_);
}

function adminListProjects_() {
  var lc = logCounts_(), dm = docSummaryMap_(), sm = surveyMap_();
  return all_('사업장').map(function (p) {
    var o = enrichProject_(p);
    o['수행일지수'] = String(lc[p.ID] || 0);
    o._서류 = dm[p.ID] || docSummaryEmpty_();
    o._만족도 = sm.byProject[p.ID] || null;
    return o;
  });
}

function adminListConsultants_() {
  var cnt = {}, pol = {}, hrs = trainingHours_(), sm = surveyMap_();
  all_('사업장').forEach(function (p) {
    if (p['차수'] === '취소') return;
    splitIds_(p['컨설턴트ID']).forEach(function (id) {
      cnt[id] = (cnt[id] || 0) + 1;
      if (p['정책연계사업'] && p['정책연계사업'] !== '없음') pol[id] = (pol[id] || 0) + 1;
    });
  });
  return all_('컨설턴트').map(function (c) {
    var o = strip_(c);
    o._수행건수 = cnt[c.ID] || 0; o._정책연계 = pol[c.ID] || 0; o._교육시간 = hrs[c.ID] || 0;
    o._만족도 = sm.byConsultant[c.ID] || null;
    return o;
  });
}

function adminReload(token, what) {
  session_(token, 'admin');
  if (what === 'apps') return adminListApplications_();
  if (what === 'projects') return adminListProjects_();
  if (what === 'consultants') return adminListConsultants_();
  if (what === 'schedule') return all_('차수일정').map(strip_);
  if (what === 'trainings') return all_('교육').map(strip_);
  throw new Error('unknown');
}

var EDIT_APP = ['구분', '연도', '사업장명', '사업자등록번호', '업태', '종목', '근로자수', '사업장주소', '사업장지역', '담당부서',
  '담당자명', '담당자직책', '담당자연락처', '담당자이메일', '희망컨설턴트', '승인여부', '연락여부', '연락담당자', '지역본부',
  '특이사항', '비고', '변동사항'];

function adminUpdateApplication(token, id, patch) {
  var s = session_(token, 'admin');
  var p = clean_(patch, EDIT_APP);
  if (p['사업장주소'] !== undefined && patch['사업장지역'] === undefined) p['사업장지역'] = region_(p['사업장주소']);
  var r = update_('신청', id, p, s.email);
  // 사업장명 동기화
  if (p['사업장명'] && r['사업장ID']) update_('사업장', r['사업장ID'], { 사업장명: p['사업장명'] }, s.email);
  return strip_(r);
}

/** 신청 → 사업장 생성 (Lark '사업장관리추가' 버튼 대체) */
function adminCreateProject(token, appId, opts) {
  var s = session_(token, 'admin');
  var a = find_('신청', appId);
  if (!a) throw new Error('신청을 찾을 수 없습니다.');
  if (a['사업장ID'] && find_('사업장', a['사업장ID'])) throw new Error('이미 사업장이 생성된 신청입니다.');
  if (!opts || !opts['차수']) throw new Error('차수를 선택해 주세요.');
  var sch = find_('차수일정', opts['차수'], '차수') || {};
  var ids = (opts['컨설턴트ID'] || []).join(',');
  var p = insert_('사업장', {
    신청ID: a.ID, 사업장명: a['사업장명'], 연도: a['연도'], 차수: opts['차수'], 컨설턴트ID: ids, 컨설턴트명: consultantNames_(ids),
    착수현황: '착수준비', 착수일: sch['착수일'] || '', 종료일: sch['종료일'] || '', 중간기한: sch['중간기한'] || '', 최종기한: sch['최종기한'] || '',
    사후기한: sch['사후기한'] || '', 중간검수: '미제출', 최종검수: '미제출', 사후검수: '미제출', 수행일지수: '0', 생성일: now_()
  }, s.email);
  update_('신청', a.ID, { 사업장ID: p.ID, 승인여부: '확정' }, s.email);
  if (opts.sendKickoff) adminSendKickoff(token, p.ID);
  return enrichProject_(find_('사업장', p.ID));
}

var EDIT_PROJECT = ['사업장명', '차수', '착수현황', '착수일', '종료일', '중간기한', '중간검수', '중간제출일', '최종기한', '최종검수',
  '최종제출일', '사후기한', '사후검수', '사후제출일', '정책연계여부', '정책연계사업', '기타사업', '정책연계시기', '우수사례여부', '비고', '연도'];

function adminUpdateProject(token, id, patch) {
  var s = session_(token, 'admin');
  var p = clean_(patch, EDIT_PROJECT);
  if (patch['컨설턴트ID'] !== undefined) {
    var ids = Array.isArray(patch['컨설턴트ID']) ? patch['컨설턴트ID'].join(',') : String(patch['컨설턴트ID']);
    p['컨설턴트ID'] = ids; p['컨설턴트명'] = consultantNames_(ids);
  }
  if (p['차수'] && patch.applySchedule) {
    var sch = find_('차수일정', p['차수'], '차수');
    if (sch) ['착수일', '종료일', '중간기한', '최종기한', '사후기한'].forEach(function (k) { if (sch[k]) p[k] = sch[k]; });
  }
  var up = update_('사업장', id, p, s.email);
  try { syncSettlements_(id); } catch (e) { Logger.log('정산 갱신 실패: ' + e.message); }
  return enrichProject_(up);
}

function adminDeleteProject(token, id) {
  var s = session_(token, 'admin');
  var p = find_('사업장', id);
  if (!p) return false;
  if (p['신청ID']) { try { update_('신청', p['신청ID'], { 사업장ID: '' }, s.email); } catch (e) {} }
  return remove_('사업장', id, s.email);
}

function adminSendKickoff(token, projectId) {
  var s = session_(token, 'admin');
  var p = find_('사업장', projectId);
  if (!p) throw new Error('사업장 없음');
  var a = find_('신청', p['신청ID']) || {};
  var cons = splitIds_(p['컨설턴트ID']).map(function (id) { return find_('컨설턴트', id); }).filter(Boolean);
  if (!cons.length) throw new Error('배정된 컨설턴트가 없습니다.');
  var sent = 0;
  cons.forEach(function (c) {
    if (!c['이메일']) return;
    var vars = Object.assign({}, strip_(a), strip_(p), { 컨설턴트명: c['성명'], 앱URL: appUrl_(), 기관명: setting_('ORG_NAME') });
    if (sendMail_(c['이메일'], fill_(setting_('KICKOFF_SUBJECT'), vars), fill_(setting_('KICKOFF_BODY'), vars), '착수메일', p.ID)) sent++;
  });
  if (!sent) throw new Error('메일을 보내지 못했습니다(컨설턴트 이메일 확인).');
  var patch = { 착수메일발송일: now_() };
  if (!p['착수현황'] || p['착수현황'] === '착수준비') patch['착수현황'] = '착수메일 발송';
  return enrichProject_(update_('사업장', p.ID, patch, s.email));
}

/** 사업장 상세: 신청정보·수행일지·보고서·변경이력 (관리자/담당 컨설턴트) */
function getProjectDetail(token, id) {
  var s = session_(token);
  var p = find_('사업장', id);
  if (!p) throw new Error('사업장 없음');
  if (s.role !== 'admin' && splitIds_(p['컨설턴트ID']).indexOf(s.consultantId) < 0) throw new Error('담당 사업장이 아닙니다.');
  var a = find_('신청', p['신청ID']);
  var logs = all_('수행일지').filter(function (l) { return l['사업장ID'] === id; }).map(strip_)
    .sort(function (x, y) { return Number(x['회차']) - Number(y['회차']); });
  var subs = all_('보고서').filter(function (r) { return r['사업장ID'] === id; }).map(strip_)
    .sort(function (x, y) { return x['제출일'] < y['제출일'] ? 1 : -1; });
  var o = enrichProject_(p);
  o['수행일지수'] = String(logs.length);
  return {
    project: o, application: a ? (s.role === 'admin' ? strip_(a) : pick_(a, ['사업장명', '사업자등록번호', '업태', '종목', '근로자수', '사업장주소', '담당부서', '담당자명', '담당자직책', '담당자연락처', '담당자이메일', '특이사항'])) : null,
    logs: logs, submissions: subs, history: s.role === 'admin' ? historyOf_(id) : [],
    extra: projectExtras_(id, s)
  };
}

function pick_(o, keys) { var r = {}; keys.forEach(function (k) { r[k] = o[k]; }); return r; }

function historyOf_(id) {
  var sh = sheet_('변경이력'), lr = sh.getLastRow();
  if (lr < 2) return [];
  var start = Math.max(2, lr - 3000);
  return sh.getRange(start, 1, lr - start + 1, 8).getDisplayValues()
    .filter(function (r) { return r[4] === id; }).reverse().slice(0, 100)
    .map(function (r) { return { 일시: r[0], 사용자: r[1], 작업: r[2], 필드: r[5], 이전값: r[6], 변경값: r[7] }; });
}

function adminHistory(token, id) { session_(token, 'admin'); return historyOf_(id); }

/** 보고서 검수 */
function adminReviewSubmission(token, subId, result, comment, checklist) {
  var s = session_(token, 'admin');
  if (OPTIONS.검수결과.indexOf(result) < 0) throw new Error('검수 결과를 선택해 주세요.');
  var r = find_('보고서', subId);
  if (!r) throw new Error('제출 내역 없음');
  var cl = Array.isArray(checklist) ? checklist.filter(function (x) { return x && x['항목']; }).map(function (x) {
    return { 항목: String(x['항목']), 결과: OPTIONS.체크결과.indexOf(x['결과']) >= 0 ? x['결과'] : '', 메모: String(x['메모'] || '') };
  }) : null;
  var bad = (cl || []).filter(function (x) { return x['결과'] === '부적합'; });
  if (bad.length) {
    comment = (comment ? comment + '\n\n' : '') + '[부적합 항목]\n' + bad.map(function (x, i) { return (i + 1) + '. ' + x['항목'] + (x['메모'] ? ' — ' + x['메모'] : ''); }).join('\n');
  }
  var subPatch = { 검수결과: result, 검수의견: comment || '', 검수자: s.email, 검수일: now_() };
  if (cl) subPatch['체크리스트'] = cl;
  update_('보고서', subId, subPatch, s.email);
  var col = REPORT_COLS[r['종류']];
  var p = update_('사업장', r['사업장ID'], (function () { var o = {}; o[col.status] = result; return o; })(), s.email);
  if (result === '보완요청' || result === '검수완료') {
    splitIds_(p['컨설턴트ID']).forEach(function (cid) {
      var c = find_('컨설턴트', cid);
      if (c && c['이메일']) sendMail_(c['이메일'], '[' + r['종류'] + '보고서 ' + result + '] ' + p['사업장명'],
        c['성명'] + ' 컨설턴트님,\n\n' + p['사업장명'] + ' ' + r['종류'] + '보고서 검수 결과: ' + result +
        (comment ? '\n\n검수 의견:\n' + comment : '') + '\n\n' + appUrl_(), '검수결과', subId);
      if (c && result === '보완요청' && setting_('SMS_ON_SUPPLEMENT') === 'Y') sendSms_(c['연락처'], '[컨설팅] ' + p['사업장명'] + ' ' + r['종류'] + '보고서 보완요청이 있습니다. 앱에서 검수 의견을 확인해 주세요.', '보완요청', subId);
    });
  }
  try { syncSettlements_(r['사업장ID']); } catch (e) { Logger.log('정산 갱신 실패: ' + e.message); }
  return getProjectDetail(token, r['사업장ID']);
}

var EDIT_CONSULTANT = ['성명', '구분', '상태', '구매처코드', '연락처', '이메일', '주요활동지역', '보완요청', '평가', '개인별안내', '비고'];

function adminSaveConsultant(token, id, patch) {
  var s = session_(token, 'admin');
  var p = clean_(patch, EDIT_CONSULTANT);
  if (p['이메일']) {
    p['이메일'] = p['이메일'].toLowerCase();
    var dup = consultantByEmail_(p['이메일']);
    if (dup && dup.ID !== id) throw new Error('같은 이메일의 컨설턴트가 있습니다: ' + dup['성명']);
  }
  if (p['연락처']) p['연락처'] = fmtPhone_(p['연락처']);
  if (!id) { req_(p, ['성명']); p['등록일'] = now_(); p['구분'] = p['구분'] || '외부'; p['상태'] = p['상태'] || '활동'; return strip_(insert_('컨설턴트', p, s.email)); }
  var r = update_('컨설턴트', id, p, s.email);
  if (p['성명']) all_('사업장').forEach(function (pr) {
    if (splitIds_(pr['컨설턴트ID']).indexOf(id) >= 0) update_('사업장', pr.ID, { 컨설턴트명: consultantNames_(pr['컨설턴트ID']) });
  });
  return strip_(r);
}

function getConsultantDetail(token, id) {
  var s = session_(token);
  if (s.role !== 'admin') id = s.consultantId;
  var c = find_('컨설턴트', id);
  if (!c) throw new Error('컨설턴트 없음');
  var tr = {};
  all_('교육').forEach(function (t) { tr[t.ID] = t; });
  var recs = all_('교육이수').filter(function (r) { return r['컨설턴트ID'] === id; }).map(function (r) {
    var t = tr[r['교육ID']] || {};
    return { ID: r.ID, 교육ID: r['교육ID'], 교육명: t['교육명'] || '', 일자: t['일자'] || '', 이수시간: r['이수시간'], 비고: r['비고'] };
  });
  var projects = all_('사업장').filter(function (p) { return splitIds_(p['컨설턴트ID']).indexOf(id) >= 0; }).map(enrichProject_);
  var total = recs.reduce(function (a, r) { return a + (parseFloat(String(r['이수시간']).replace(/[^0-9.]/g, '')) || 0); }, 0);
  return { consultant: strip_(c), trainings: recs, totalHours: total, projects: projects, history: s.role === 'admin' ? historyOf_(id) : [] };
}

function adminSetTraining(token, consultantId, trainingId, hours, note) {
  var s = session_(token, 'admin');
  var ex = all_('교육이수').filter(function (r) { return r['컨설턴트ID'] === consultantId && r['교육ID'] === trainingId; })[0];
  if (ex && !String(hours).trim()) remove_('교육이수', ex.ID, s.email);
  else if (ex) update_('교육이수', ex.ID, { 이수시간: hours, 비고: note || '' }, s.email);
  else if (String(hours).trim()) insert_('교육이수', { 컨설턴트ID: consultantId, 교육ID: trainingId, 이수시간: hours, 비고: note || '' }, s.email);
  return getConsultantDetail(token, consultantId);
}

function adminSaveSchedule(token, row, applyToProjects) {
  var s = session_(token, 'admin');
  var d = clean_(row, SCHEMA['차수일정']);
  req_(d, ['차수']);
  if (find_('차수일정', d['차수'], '차수')) update_('차수일정', d['차수'], d, s.email, '차수');
  else insert_('차수일정', d, s.email);
  var n = 0;
  if (applyToProjects) {
    all_('사업장').filter(function (p) { return p['차수'] === d['차수']; }).forEach(function (p) {
      update_('사업장', p.ID, pick_(d, ['착수일', '종료일', '중간기한', '최종기한', '사후기한']), s.email); n++;
    });
  }
  return { schedule: all_('차수일정').map(strip_), applied: n };
}

function adminGetSettings(token) {
  session_(token, 'admin');
  return all_('설정').map(strip_);
}

function adminSaveSettings(token, pairs) {
  var s = session_(token, 'admin');
  Object.keys(pairs).forEach(function (k) {
    var r = find_('설정', k, '키');
    if (r && r['값'] !== pairs[k]) update_('설정', k, { 값: pairs[k] }, s.email, '키');
  });
  delete _cache['__settings'];
  return all_('설정').map(strip_);
}

function adminMailLog(token) {
  session_(token, 'admin');
  var sh = sheet_('메일이력'), lr = sh.getLastRow();
  if (lr < 2) return [];
  var start = Math.max(2, lr - 300);
  return sh.getRange(start, 1, lr - start + 1, 6).getDisplayValues().reverse();
}

/** 임의 메일 발송 (선택 컨설턴트/사업장 담당자에게) */
function adminSendMail(token, toList, subject, body) {
  var s = session_(token, 'admin');
  if (!toList || !toList.length) throw new Error('받는 사람이 없습니다.');
  var room = MailApp.getRemainingDailyQuota() - MAIL_RESERVE;
  if (toList.length > room) throw new Error('오늘 보낼 수 있는 메일은 ' + Math.max(0, room) + '건입니다(로그인 코드용 ' + MAIL_RESERVE + '건 제외). 받는 사람을 줄이거나 내일 보내 주세요.');
  var ok = 0;
  toList.forEach(function (t) {
    var vars = Object.assign({ 앱URL: appUrl_(), 기관명: setting_('ORG_NAME') }, t.vars || {});
    if (sendMail_(t.email, fill_(subject, vars), fill_(body, vars), '일괄메일', t.id || '')) ok++;
  });
  audit_(s.email, '메일발송', '', '', '', '', ok + '건: ' + subject);
  return { sent: ok, quota: MailApp.getRemainingDailyQuota() };
}

/** 표 데이터를 xlsx로 변환 (base64 반환) */
function adminExportXlsx(token, title, headers, rows) {
  session_(token, 'admin');
  var name = (title || '내보내기') + '_' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd_HHmm');
  var tmp = SpreadsheetApp.create(name);
  try {
    var sh = tmp.getSheets()[0];
    var data = [headers].concat(rows).map(function (r) { return r.map(function (v) { return v === null || v === undefined ? '' : String(v); }); });
    var rg = sh.getRange(1, 1, data.length, headers.length);
    rg.setNumberFormat('@').setValues(data);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#eef2f7');
    sh.setFrozenRows(1);
    SpreadsheetApp.flush();
    var blob = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + tmp.getId() + '/export?format=xlsx',
      { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } }).getBlob();
    return { name: name + '.xlsx', b64: Utilities.base64Encode(blob.getBytes()) };
  } finally {
    DriveApp.getFileById(tmp.getId()).setTrashed(true);
  }
}

/** 관리자: 첨부파일 추가/삭제 (신청·사업장·컨설턴트 파일 필드) */
var FILE_FIELDS = { '신청': ['신청서', '사업자등록증', '중소기업확인서'], '사업장': ['장려금접수증', '우수사례첨부'], '컨설턴트': ['이력서'] };

function adminAddFiles(token, sheetName, id, field, files) {
  var s = session_(token, 'admin');
  if ((FILE_FIELDS[sheetName] || []).indexOf(field) < 0) throw new Error('파일 필드가 아닙니다.');
  var r = find_(sheetName, id);
  var saved = saveFiles_(filePath_(sheetName, r), files, field === '신청서' ? '신청서' : '');
  var patch = {}; patch[field] = parseFiles_(r[field]).concat(saved);
  return strip_(update_(sheetName, id, patch, s.email));
}

function adminRemoveFile(token, sheetName, id, field, fileId) {
  var s = session_(token, 'admin');
  if ((FILE_FIELDS[sheetName] || []).indexOf(field) < 0) throw new Error('파일 필드가 아닙니다.');
  var r = find_(sheetName, id);
  var patch = {}; patch[field] = parseFiles_(r[field]).filter(function (f) { return f.id !== fileId; });
  try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) {}
  return strip_(update_(sheetName, id, patch, s.email));
}

function filePath_(sheetName, r) {
  if (sheetName === '신청') return ['신청서류', r['연도'], r['사업장명'] + '_' + normBrn_(r['사업자등록번호'])];
  if (sheetName === '컨설턴트') return ['이력서', r['성명']];
  return ['사업장', r['연도'] || '기타', r['차수'] || '미정', r['사업장명']];
}

/* ============================== 컨설턴트 API ============================== */

function consultantBootstrap(token) {
  var s = session_(token);
  if (!s.consultantId) throw new Error('컨설턴트 정보가 연결되지 않은 계정입니다.');
  var lc = logCounts_();
  var projects = all_('사업장').filter(function (p) { return splitIds_(p['컨설턴트ID']).indexOf(s.consultantId) >= 0; })
    .map(function (p) { var o = enrichProject_(p); o['수행일지수'] = String(lc[p.ID] || 0); return o; });
  var d = getConsultantDetail(token, s.consultantId);
  return { me: s, options: options_(), fileRules: fileRules_(), maxMb: Number(setting_('MAX_FILE_MB') || 20), projects: projects, profile: d.consultant, trainings: d.trainings, totalHours: d.totalHours, contact: setting_('CONTACT_EMAIL'),
    badges: consultantBadges_(s) };
}

function ownProject_(s, projectId) {
  var p = find_('사업장', projectId);
  if (!p) throw new Error('사업장 없음');
  if (s.role !== 'admin' && splitIds_(p['컨설턴트ID']).indexOf(s.consultantId) < 0) throw new Error('담당 사업장이 아닙니다.');
  return p;
}

/** 수행일지 저장 (신규/수정) */
function saveLog(token, log, files) {
  var s = session_(token);
  var p = ownProject_(s, log['사업장ID']);
  var d = clean_(log, ['일자', '시간', '방식', '장소', '참석자', '내용', '향후계획', '회차']);
  req_(d, ['일자', '내용']);
  var saved = saveFiles_(['사업장', p['연도'] || '기타', p['차수'] || '미정', p['사업장명'], '수행일지'], files || []);
  if (log.ID) {
    var ex = find_('수행일지', log.ID);
    if (!ex || ex['사업장ID'] !== p.ID) throw new Error('수행일지 없음');
    if (s.role !== 'admin' && ex['작성자'] !== s.email) throw new Error('본인이 작성한 일지만 수정할 수 있습니다.');
    d['첨부'] = parseFiles_(ex['첨부']).concat(saved);
    update_('수행일지', log.ID, d, s.email);
  } else {
    var n = all_('수행일지').filter(function (l) { return l['사업장ID'] === p.ID; })
      .reduce(function (m, l) { return Math.max(m, Number(l['회차']) || 0); }, 0);
    d['회차'] = d['회차'] || String(n + 1);
    d['사업장ID'] = p.ID; d['첨부'] = saved; d['작성자'] = s.email; d['작성일'] = now_();
    insert_('수행일지', d, s.email);
  }
  update_('사업장', p.ID, { 수행일지수: String(all_('수행일지').filter(function (l) { return l['사업장ID'] === p.ID; }).length) });
  try { markVisitDone_(p.ID, d['일자'], s.email); } catch (e) {}
  return getProjectDetail(token, p.ID);
}

function deleteLog(token, logId) {
  var s = session_(token);
  var l = find_('수행일지', logId);
  if (!l) throw new Error('수행일지 없음');
  ownProject_(s, l['사업장ID']);
  if (s.role !== 'admin' && l['작성자'] !== s.email) throw new Error('본인이 작성한 일지만 삭제할 수 있습니다.');
  remove_('수행일지', logId, s.email);
  update_('사업장', l['사업장ID'], { 수행일지수: String(all_('수행일지').filter(function (x) { return x['사업장ID'] === l['사업장ID']; }).length) });
  return getProjectDetail(token, l['사업장ID']);
}

/** 보고서 제출 */
function submitReport(token, projectId, kind, files, memo) {
  var s = session_(token);
  var p = ownProject_(s, projectId);
  var col = REPORT_COLS[kind];
  if (!col) throw new Error('보고서 종류를 선택해 주세요.');
  if (!files || !files.length) throw new Error('파일을 첨부해 주세요.');
  if (p[col.status] === '검수완료') throw new Error('이미 검수가 완료된 보고서입니다. 수정이 필요하면 관리자에게 문의해 주세요.');
  var saved = saveFiles_(['보고서', p['연도'] || '기타', kind + '보고서', p['차수'] || '미정', p['사업장명']], files, '보고서');
  insert_('보고서', { 사업장ID: p.ID, 종류: kind, 파일: saved, 메모: memo || '', 제출자: s.email, 제출일: now_(), 검수결과: '검수 중' }, s.email);
  var patch = {}; patch[col.status] = '검수 중'; patch[col.date] = today_();
  update_('사업장', p.ID, patch, s.email);
  notifyAdmins_('[' + kind + '보고서 제출] ' + p['사업장명'], s.name + ' 컨설턴트가 ' + p['사업장명'] + '(' + p['차수'] + ') ' + kind +
    '보고서를 제출했습니다.\n파일: ' + saved.map(function (f) { return f.name; }).join(', ') + (memo ? '\n메모: ' + memo : '') + '\n\n' + appUrl_(), '관리자알림', p.ID);
  return getProjectDetail(token, p.ID);
}

/** 컨설턴트: 정책연계·우수사례 입력 + 첨부 */
function updateMyProject(token, projectId, patch, files) {
  var s = session_(token);
  var p = ownProject_(s, projectId);
  var d = clean_(patch, ['정책연계여부', '정책연계사업', '기타사업', '정책연계시기', '우수사례여부', '착수현황']);
  files = files || {};
  ['장려금접수증', '우수사례첨부'].forEach(function (f) {
    if (files[f] && files[f].length) d[f] = parseFiles_(p[f]).concat(saveFiles_(filePath_('사업장', p), files[f]));
  });
  update_('사업장', p.ID, d, s.email);
  return getProjectDetail(token, p.ID);
}

function updateMyProfile(token, patch, files) {
  var s = session_(token);
  var c = find_('컨설턴트', s.consultantId);
  if (!c) throw new Error('컨설턴트 정보 없음');
  var d = clean_(patch, ['연락처', '주요활동지역']);
  if (d['연락처']) { if (!validPhone_(d['연락처'])) throw new Error('연락처를 확인해 주세요.'); d['연락처'] = fmtPhone_(d['연락처']); }
  if (files && files.length) d['이력서'] = parseFiles_(c['이력서']).concat(saveFiles_(['이력서', c['성명']], files));
  update_('컨설턴트', c.ID, d, s.email);
  return consultantBootstrap(token);
}

/* ============================== 파일 다운로드 (권한 확인) ============================== */

function downloadFile(token, fileId) {
  var s = session_(token);
  if (s.role !== 'admin' && allowedFileIds_(s).indexOf(fileId) < 0) throw new Error('파일 접근 권한이 없습니다.');
  var f = DriveApp.getFileById(fileId);
  if (f.getSize() > 40 * 1024 * 1024) return { url: f.getUrl(), name: f.getName(), tooLarge: true };
  var b = f.getBlob();
  return { name: f.getName(), mime: b.getContentType(), b64: Utilities.base64Encode(b.getBytes()) };
}

function allowedFileIds_(s) {
  var ids = [];
  var add = function (str) { parseFiles_(str).forEach(function (f) { ids.push(f.id); }); };
  var mine = all_('사업장').filter(function (p) { return splitIds_(p['컨설턴트ID']).indexOf(s.consultantId) >= 0; });
  var pids = mine.map(function (p) { return p.ID; });
  mine.forEach(function (p) { add(p['장려금접수증']); add(p['우수사례첨부']); });
  all_('수행일지').forEach(function (l) { if (pids.indexOf(l['사업장ID']) >= 0) add(l['첨부']); });
  all_('보고서').forEach(function (r) { if (pids.indexOf(r['사업장ID']) >= 0) add(r['파일']); });
  var c = find_('컨설턴트', s.consultantId);
  if (c) add(c['이력서']);
  all_('서류').forEach(function (r) { if (pids.indexOf(r['사업장ID']) >= 0) add(r['파일']); });
  all_('문의').forEach(function (r) { if (r['컨설턴트ID'] === s.consultantId) add(r['첨부']); });
  visibleNotices_(c).forEach(function (n) { add(n['첨부']); });
  return ids;
}

/* ============================== 매일 점검 (트리거) ============================== */

function dailyCheck() {
  try { cleanupSessions_(); } catch (e) {}
  try {
    var pu = propsUsage_();
    if (pu.bytes > PROPS_WARN_BYTES) sendMail_(adminEmails_().join(','), '[점검] 스크립트 속성 사용량 ' + Math.round(pu.bytes / 1024) + 'KB / 500KB',
      '스크립트 속성 사용량이 한도(500KB)에 가깝습니다. 한도를 넘으면 새 로그인이 실패합니다.\n로그인 토큰 ' + pu.sessions + '개\n\n' +
      '[프로젝트 설정 > 스크립트 속성]에서 불필요한 항목을 확인해 주세요.', '점검', '');
  } catch (e) { Logger.log('속성 점검 실패: ' + e.message); }
  try { archiveLogs_(); } catch (e) { Logger.log('이력 보관 실패: ' + e.message); }
  var today = today_();
  var remind = String(setting_('REMIND_DAYS') || '7,3,0').split(',').map(function (x) { return Number(x.trim()); });
  var overdue = [], soon = [];
  var byConsultant = {};
  all_('사업장').forEach(function (p) {
    if (p['차수'] === '취소') return;
    ['중간', '최종', '사후'].forEach(function (t) {
      var c = REPORT_COLS[t], st = p[c.status] || '미제출';
      if (!(st === '미제출' || st === '보완요청') || !p[c.due]) return;
      var dd = dayDiff_(today, p[c.due]);
      if (dd === null) return;
      var item = { p: p, t: t, due: p[c.due], dd: dd, st: st };
      if (dd < 0) overdue.push(item);
      if (dd >= 0 && dd <= 7) soon.push(item);
      if (remind.indexOf(dd) >= 0) splitIds_(p['컨설턴트ID']).forEach(function (cid) { (byConsultant[cid] = byConsultant[cid] || []).push(item); });
    });
  });
  Object.keys(byConsultant).forEach(function (cid) {
    var c = find_('컨설턴트', cid);
    if (!c || !c['이메일'] || c['구분'] === '내부') return;
    var items = byConsultant[cid];
    sendMail_(c['이메일'], '[보고서 기한 안내] ' + items.map(function (i) { return i.p['사업장명']; }).slice(0, 2).join(', ') + (items.length > 2 ? ' 외' : ''),
      c['성명'] + ' 컨설턴트님,\n\n다가오는 보고서 제출 기한을 안내드립니다.\n\n' + items.map(function (i) {
        return '· ' + i.p['사업장명'] + ' (' + i.p['차수'] + ') ' + i.t + '보고서 — 기한 ' + i.due + ' (' + (i.dd === 0 ? '오늘' : 'D-' + i.dd) + ')' + (i.st === '보완요청' ? ' [보완요청]' : '');
      }).join('\n') + '\n\n앱에서 제출: ' + appUrl_(), '기한알림', cid);
    if (setting_('SMS_ON_REMIND') === 'Y') sendSms_(c['연락처'], '[컨설팅] 보고서 기한 안내: ' + items.map(function (i) {
      return i.p['사업장명'] + ' ' + i.t + '(' + (i.dd === 0 ? '오늘' : 'D-' + i.dd) + ')'; }).slice(0, 3).join(', ') + (items.length > 3 ? ' 외 ' + (items.length - 3) + '건' : ''), '기한알림', cid);
  });
  try { if (today.slice(8) === '01' && setting_('MONTHLY_REPORT_MAIL') === 'Y') sendMonthlyReportMail_(); } catch (e) { Logger.log('월간 실적 메일 실패: ' + e.message); }
  if (setting_('DAILY_DIGEST') === 'Y') {
    var pending = all_('신청').filter(function (a) { return a['승인여부'] === '대기'; }).length;
    var review = all_('사업장').filter(function (p) { return ['중간검수', '최종검수', '사후검수'].some(function (k) { return p[k] === '검수 중'; }); }).length;
    var newCons = all_('컨설턴트').filter(function (c) { return c['상태'] === '신청'; }).length;
    if (overdue.length || pending || newCons || soon.length) {
      var line = function (i) { return '· ' + i.p['사업장명'] + ' (' + i.p['차수'] + ', ' + (i.p['컨설턴트명'] || '-') + ') ' + i.t + ' — ' + i.due + (i.dd < 0 ? ' (' + (-i.dd) + '일 초과)' : ' (D-' + i.dd + ')'); };
      sendMail_(adminEmails_().join(','), '[일일 현황] ' + today + ' 기한초과 ' + overdue.length + '건 · 승인대기 ' + pending + '건',
        '■ 신청 승인 대기: ' + pending + '건\n■ 컨설턴트 신청 대기: ' + newCons + '건\n■ 보고서 검수 중: ' + review + '개 사업장\n\n■ 기한 초과 (' + overdue.length + '건)\n' +
        (overdue.sort(function (a, b) { return a.dd - b.dd; }).slice(0, 60).map(line).join('\n') || '없음') +
        '\n\n■ 7일 이내 기한 (' + soon.length + '건)\n' + (soon.sort(function (a, b) { return a.dd - b.dd; }).slice(0, 60).map(line).join('\n') || '없음') +
        '\n\n' + appUrl_(), '일일현황', '');
    }
  }
}

/* ============================== 이력 시트 보관 ============================== */

var LOG_SHEETS = ['변경이력', '메일이력'];
var ARCHIVE_MAX_ROWS = 20000;   // 한 번에 옮기는 최대 행 수 (6분 제한 대비, 남으면 다음 날 이어서)

/** LOG_KEEP_MONTHS개월(이번 달 포함)보다 오래된 이력 행을 월별 보관 시트로 옮김. 반환: {시트: 옮긴 행 수} */
function archiveLogs_() {
  var keep = Math.max(1, Math.floor(Number(setting_('LOG_KEEP_MONTHS'))) || 3);
  var ym = today_().split('-'), y = Number(ym[0]), m = Number(ym[1]) - (keep - 1);
  while (m < 1) { m += 12; y--; }
  var cutoff = y + '-' + ('0' + m).slice(-2) + '-01', out = {};
  LOG_SHEETS.forEach(function (name) {
    out[name] = withLock_(function () {
      var ss = ss_(), sh = sheet_(name), lr = sh.getLastRow();
      if (lr < 2) return 0;
      var lc = sh.getLastColumn(), head = sh.getRange(1, 1, 1, lc).getDisplayValues()[0];
      var vals = sh.getRange(2, 1, Math.min(lr - 1, ARCHIVE_MAX_ROWS), lc).getDisplayValues();
      var k = 0;
      while (k < vals.length && String(vals[k][0]).slice(0, 10) < cutoff) k++;   // 시간순으로 쌓이므로 앞에서부터
      if (!k) return 0;
      var groups = {};
      vals.slice(0, k).forEach(function (r) {
        var g = /^\d{4}-\d{2}/.test(r[0]) ? String(r[0]).slice(0, 7) : '날짜없음';
        (groups[g] = groups[g] || []).push(r);
      });
      Object.keys(groups).sort().forEach(function (g) {
        var an = '보관_' + name + '_' + g, ash = ss.getSheetByName(an);
        if (!ash) {
          ash = ss.insertSheet(an);
          ash.getRange(1, 1, 1, lc).setValues([head]).setFontWeight('bold');
          ash.setFrozenRows(1);
        }
        var rows = groups[g];
        ash.getRange(ash.getLastRow() + 1, 1, rows.length, lc).setNumberFormat('@').setValues(rows);
      });
      sh.deleteRows(2, k);
      return k;
    });
  });
  return out;
}

/* ============================== 설치 ============================== */

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('구글 시트의 [확장 프로그램 > Apps Script]에서 실행해 주세요.');
  PropertiesService.getScriptProperties().setProperty('SS_ID', ss.getId());
  Object.keys(SCHEMA).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var h = SCHEMA[name];
    var cur = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0] : [];
    // 기존 헤더 보존 + 누락 컬럼 추가
    var missing = h.filter(function (k) { return cur.indexOf(k) < 0; });
    if (!cur.join('')) { sh.getRange(1, 1, 1, h.length).setValues([h]); }
    else if (missing.length) { sh.getRange(1, cur.length + 1, 1, missing.length).setValues([missing]); }
    var n = sh.getLastColumn();
    if (sh.getMaxColumns() > n) sh.deleteColumns(n + 1, sh.getMaxColumns() - n);
    sh.getRange(1, 1, 1, n).setFontWeight('bold').setBackground('#1f3a5f').setFontColor('#ffffff');
    sh.getRange(1, 1, sh.getMaxRows(), n).setNumberFormat('@');
    sh.setFrozenRows(1);
  });
  var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('시트1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
  clearDataCache_();
  var have = all_('설정').map(function (r) { return r['키']; });
  var add = DEFAULT_SETTINGS.filter(function (r) { return have.indexOf(r[0]) < 0; });
  if (add.length) insertMany_('설정', add.map(function (r) { return { 키: r[0], 값: r[1], 설명: r[2] }; }));
  _cache = {};
  if (!all_('수당기준').length) insertMany_('수당기준', DEFAULT_FEE_RULES.map(function (r) { return { 항목: r[0], 보고서: r[1], 금액: r[2], 분배: r[3], 비고: r[4] }; }));
  _cache = {};
  rootFolder_();
  installTriggers();
  Logger.log('설치 완료. 다음: 데이터 이관이 필요하면 Migrate.gs의 migrateFromLark() 실행 → [배포 > 새 배포 > 웹 앱]');
}

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'dailyCheck') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('dailyCheck').timeBased().everyDays(1).atHour(8).inTimezone('Asia/Seoul').create();
}

/** 시트 메뉴 */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('컨설팅 관리')
    .addItem('초기 설정(setup)', 'setup')
    .addItem('Lark 데이터 이관', 'migrateFromLark')
    .addItem('이관 진행상황 보기', 'migrationStatus')
    .addSeparator()
    .addItem('Lark 자동 동기화 켜기', 'menuEnableSync')
    .addItem('Lark 지금 동기화', 'menuSyncNow')
    .addItem('Lark 자동 동기화 끄기', 'disableLarkSync')
    .addSeparator()
    .addItem('기한 점검 지금 실행', 'dailyCheck')
    .addItem('앱 캐시 비우기(시트를 직접 고친 뒤)', 'menuClearCache')
    .addToUi();
}

function menuClearCache() {
  clearDataCache_();
  try { SpreadsheetApp.getActiveSpreadsheet().toast('앱 캐시를 비웠습니다. 시트 내용이 바로 반영됩니다.'); } catch (e) {}
}
