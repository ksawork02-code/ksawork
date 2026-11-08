# LARK BASE 연결 정보 및 구조 (2026-11-07 기준)

## 연결
- 서비스: Lark 국제판, API 도메인 `open.larksuite.com`
- 앱 ID: `cli_aa60c02163f8de27` (App Secret은 문서·코드에 넣지 않음. 테스트·이관 때 환경변수 `LARK_APP_SECRET`로만 전달)
- Base: "사업장 DB" — app_token `AtEObMCf7awP7tsuXBfjCQGip1e`
- URL: https://bjpuqz1k85ih.jp.larksuite.com/base/AtEObMCf7awP7tsuXBfjCQGip1e
- 고급 권한(Advanced Permissions)이 켜져 있어 앱을 "관리 가능" 협업자로 추가해 해결
- 권한 범위: `bitable:app` (첨부 다운로드는 레코드의 `url` 필드 — `extra` 파라미터 포함 — 로 받아야 성공. `/drive/v1/medias/{token}/download` 단독은 400)
- 사용자 필드(인원, 컨설턴트계정)는 연락처 권한이 없어 `사용자441399`처럼 익명으로 내려옴 → 이관하지 않음

## 테이블
| 테이블 | table_id | 레코드 | 앱 시트 |
|---|---|---|---|
| 기업 컨설팅 신청 | tblsbBKo46rQtpLM | 224 | 신청 (구분=본신청) |
| 27년 컨설팅 사전 접수 | tbllusMn4MDTnf69 | 1 | 신청 (구분=사전접수) |
| 사업장 관리 | tbl9IrX9vRy3SunG | 215 | 사업장 |
| 컨설턴트 명단 | tblltQnU8Dfj39AZ | 95 | 컨설턴트 (구분=외부) |
| 컨설턴트 개인별 안내 | tblY7hzuaSvyqIyU | 84 | 컨설턴트.개인별안내 + 교육 + 교육이수 |
| 내부 컨설턴트 개인별 안내 | tbl1McgbZJH1Xbq4 | 11 | 컨설턴트 (구분=내부) |
| <완료>비대면 설명회 설문 | tblKCyLrzIr6pywc | 12 | 보관_설명회설문 (보관용) |

필드 전체 정의(타입, 선택지, 수식, 폼 문항)는 `lark-schema.json` 참고. 필드 매핑은 `app/Sync.gs`의 `map*_` 함수가 기준.

## 데이터 특이사항
- 사업장 관리의 착수일·종료일·보고서 "제출일"은 실제로는 **차수별 공통 기한**(같은 차수면 같은 날짜) → 앱에서는 `차수일정` 시트로 분리, 사업장은 `중간기한`/`최종기한`/`사후기한`.
- 검수 현황 선택지에 "검수완료"가 없음(제출/보완요청/미제출/검수 중/내부) → 앱에서 `검수완료` 추가.
- 2026-11-07 기준 기한 초과·미제출 보고서 71건(데이터 갱신 누락 가능성 → 운영자 확인 필요).
- 이메일 없는 컨설턴트 5명: 손정란(S), 김일터, 손정란, 김표준, 표일터(테스트 계정 추정).
