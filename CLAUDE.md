# 산업일자리전환 컨설팅 관리 앱 — 프로젝트 안내 (Claude Code용)

한국표준협회 산업일자리전환 전담기관 일터혁신센터가 쓰던 **Lark Base("사업장 DB")를 대체하는 Google Apps Script 웹앱**이다.
구글 시트가 DB, 구글 드라이브가 파일 저장소, 웹앱 하나가 외부 신청폼·관리자 화면·컨설턴트 화면을 모두 제공한다.
작업 지시는 `작업지시서.md`, 설계 근거는 `docs/결정사항.md`를 먼저 읽는다.

## 폴더
| 경로 | 내용 |
|---|---|
| `app/` | 앱스크립트 소스. clasp `rootDir`. 이 폴더만 배포된다 |
| `app/Code.gs` | 스키마(`SCHEMA`), DB 레이어(`all_`/`find_`/`insert_`/`update_`/`remove_`), 인증(OTP), 외부폼, 관리자·컨설턴트 API, 일일 점검, `setup()` |
| `app/Features.gs` | 세부 기능: 일정·서류·검수 체크리스트·만족도·교육·정산·추천·월간실적·공지·문의·진행조회·문자(솔라피) |
| `app/Sync.gs` | Lark → 앱 동기화 엔진(최초 이관 겸용). 필드 매핑 `map*_`, 스냅샷 시트 `_Lark동기화` |
| `app/Migrate.gs` | Lark API 호출, 값 변환, 첨부파일 이관(5분 단위 자동 이어하기) |
| `app/Index.html` `App.html` `App2.html` | 로그인 후 SPA (App=기본, App2=세부 기능, 일부 함수는 App2가 감싸서 확장) |
| `app/Form.html` | 로그인 없는 공개 페이지: `?page=apply|pre|consultant|status|survey` |
| `app/Common.html` `Styles.html` | 공통 JS 유틸(`call`, `run`, `readFiles`, `extError`…)과 CSS |
| `netlify/` | 웹앱을 iframe으로 감싸는 짧은 주소 사이트(`/apply` 등). `config.js`의 `WEBAPP_URL`만 설정 |
| `test/` | Node 모의 Apps Script(`gas-mock.js`) + 서버 테스트 + Playwright UI 테스트 |
| `docs/` | 설치가이드, Lark 구조, 결정사항, 매뉴얼 링크, `lark-schema.json`(Lark 필드 정의) |

## 핵심 규칙
- **시트 = 스키마**: 열을 추가하려면 `Code.gs`의 `SCHEMA`에 넣고 `setup()`을 다시 실행한다(누락 열만 뒤에 추가, 기존 데이터 보존). 1행 헤더 이름이 곧 필드 키(한글).
- 모든 셀은 문자열(`@` 서식). 날짜는 `yyyy-MM-dd`, 일시는 `yyyy-MM-dd HH:mm:ss`(Asia/Seoul). 파일 필드는 `[{id,name,size,at,token?}]` JSON.
- 새 ID는 `newId_(시트)` → `접두사+yyMMdd-6자리`. 접두사는 `ID_PREFIX`.
- 쓰기는 반드시 `insert_/insertMany_/update_/remove_`로 한다(락 + 변경이력 + 캐시 무효화). 시트를 직접 고치는 코드는 끝에 `bumpVersion_(시트)`를 불러 요청 간 캐시를 무효화한다. `update_`는 바뀐 필드만 `변경이력`에 남긴다.
- 서버 공개 함수(이름 끝에 `_` 없음)는 클라이언트에서 호출 가능하다 → 첫 줄에서 `session_(token[, 'admin'])`로 권한을 확인한다. 컨설턴트는 `ownProject_()`로 담당 사업장만 접근. 공개 페이지 함수(`submit*`, `getSurvey`, `lookupApplication`)는 입력 검증과 횟수 제한을 둔다.
- 앱 전역 코드가 파일 간 순서에 의존하지 않게 한다(최상위에서 다른 파일의 변수 참조 금지, 함수 안에서만 참조).
- 설정값은 시트 `설정`(키/값/설명)과 `DEFAULT_SETTINGS`. 비밀값(Lark App Secret, 솔라피 키, 로그인 토큰)은 **스크립트 속성**에만 둔다. 코드·문서·커밋에 비밀값을 넣지 않는다.
- 메일은 `sendMail_`, 문자는 `sendSms_`만 쓴다(한도 예약·이력 기록 포함).
- UI 문구는 한국어, 클라이언트 JS는 HtmlService에서 그대로 도는 ES5 스타일(`var`, `function`)을 유지한다. 출력 HTML은 반드시 `esc()`로 이스케이프.
- 업로드 규칙: `.hwp` 차단, 신청서·보고서는 `.hwpx`만(`FILE_EXT_*`, `FILE_BLOCK_EXT` 설정). 서버 `checkFile_`가 최종 판정.

## 테스트
```
npm install                      # playwright, clasp
npx playwright install chromium  # 최초 1회
export LARK_APP_SECRET=...        # Lark 실데이터 이관 테스트에 필요 (커밋 금지)
node test/test-ext.js            # 업로드 규칙 (Lark 불필요)
node test/test-ops.js            # 요청 간 캐시·이력 보관·토큰 제한·메일 한도 (Lark 불필요)
node test/test-server.js         # 실제 Lark → 이관 → 전체 업무 흐름. test/state.json 생성
node test/test-sync.js           # 전환기간 동기화 (Lark 응답을 캐시해 변조)
node test/test-features.js       # 세부 기능 13종. test/state2.json 생성 (state.json 필요)
node test/ui-server.js &         # 모의 서버 :8787 (STATE=state2.json 으로 데이터 선택)
node test/ui-test.js             # 기본 화면 E2E
STATE=state2.json node test/ui-server.js & node test/ui-test2.js   # 세부 기능 E2E (서버 새로 띄운 뒤 1회)
node test/netlify-test.js        # 넷리파이 래퍼 (ui-server 필요)
```
- `test/state*.json`, 스크린샷은 실제 개인정보가 들어가므로 커밋하지 않는다(.gitignore).
- `gas-mock.js`는 SpreadsheetApp/DriveApp/CacheService/PropertiesService/LockService/MailApp/UrlFetchApp/CalendarApp/Utilities를 흉내 낸다. 새 Apps Script API를 쓰면 여기에도 추가한다.
- 모의 환경은 실환경과 다르다(6분 실행 제한, 쿼터, 권한 승인, 실제 메일 없음). 실환경 확인 목록은 `docs/결정사항.md` 하단.

## 배포
- clasp: `.clasp.json.example`을 `.clasp.json`으로 복사해 `scriptId`를 넣고 `npx clasp login` → `npx clasp push`. 컨테이너(구글 시트)에 바인딩된 스크립트여야 한다(`setup()`이 활성 스프레드시트 사용).
- 웹앱: 배포 → 새 배포 → 웹 앱(실행: 나, 액세스: 모든 사용자). 코드 수정 후에는 "배포 관리 → 새 버전"으로 같은 URL에 반영(`clasp deploy -i <deploymentId>`).
- 운영 절차는 `docs/설치가이드.md`.
