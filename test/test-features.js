const assert = require('assert'), fs = require('fs');
const { makeEnv } = require('./gas-mock');
const env = makeEnv({ quiet: true }); const G = env.ctx;
const ok = m => console.log('  ✓', m);
const throws = (fn, re, m) => { try { fn(); } catch (e) { assert(re.test(e.message), m + ' → ' + e.message); return ok(m + ' (' + e.message.slice(0, 45) + ')'); } assert.fail(m + ' should throw'); };
const sheet = n => { G._cache = {}; return G.all_(n); };
G.setup();
JSON.parse(fs.readFileSync(__dirname + '/state.json')).sheets.forEach(([n, d]) => { const sh = env.active.getSheetByName(n) || env.active.insertSheet(n); sh.data = d; });
G._cache = {}; G.setup(); G._cache = {};
const login = email => { env.outbox.length = 0; G._cache = {}; G.requestOtp(email); const code = env.outbox[0].subject.match(/(\d{6})/)[1]; return G.verifyOtp(email, code).token; };
const hwpx = { name: 'r.hwpx', mime: '', b64: Buffer.from('PK\x03\x04x').toString('base64') };
const pdf = { name: 'd.pdf', mime: '', b64: Buffer.from('%PDF').toString('base64') };

console.log('0) 설치');
assert(sheet('수당기준').length === 3); assert(G.options_().서류종류.length === 4); assert(G.options_().체크리스트.최종.length >= 5);
['일정', '서류', '만족도', '교육신청', '정산', '공지', '공지읽음', '문의'].forEach(n => assert(env.active.getSheetByName(n), n));
assert(G.headers_('교육').includes('정원') && G.headers_('보고서').includes('체크리스트')); ok('새 시트 8개, 기존 시트 열 추가, 수당기준 기본 3행');
const AT = login('ksawork02@gmail.com');
const cons = sheet('컨설턴트'), projs = sheet('사업장');
const cnt = {}; projs.forEach(p => String(p['컨설턴트ID']).split(',').forEach(i => cnt[i] = (cnt[i] || 0) + 1));
const c1 = cons.filter(c => c['상태'] === '활동' && c['이메일'] && c['구분'] === '외부').sort((a, b) => (cnt[b.ID] || 0) - (cnt[a.ID] || 0))[0];
const c2 = cons.filter(c => c['상태'] === '활동' && c['이메일'] && c['구분'] === '외부' && c.ID !== c1.ID)[0];
const P = projs.find(p => p['컨설턴트ID'] === c1.ID && p['신청ID']);
const CT = login(c1['이메일']), CT2 = login(c2['이메일']);
const A = G.find_('신청', P['신청ID']);

console.log('1) 방문 일정');
let d = G.saveVisit(CT, { 사업장ID: P.ID, 일자: '2026-11-20', 시작: '14:00', 종료: '16:00', 방식: '방문', 장소: '본사', 내용: '현장 진단' });
const V = d.extra.visits[0]; assert(V && V['캘린더ID']); ok('일정 등록 + 구글 캘린더 이벤트 ' + V['캘린더ID']);
env.outbox.length = 0; d = G.notifyVisit(CT, V.ID);
assert(env.outbox.some(m => m.to === A['담당자이메일'] && /14:00~16:00/.test(m.htmlBody))); assert(d.extra.visits[0]['안내발송']); ok('사업장 담당자 안내 메일');
throws(() => G.saveVisit(CT2, { 사업장ID: P.ID, 일자: '2026-11-21' }), /담당/, '타인 사업장 일정 차단');
d = G.saveLog(CT, { 사업장ID: P.ID, 일자: '2026-11-20', 내용: '진단 완료' }, []);
assert.strictEqual(d.extra.visits[0]['상태'], '완료'); ok('같은 날 수행일지 → 일정 완료');
assert(G.listVisits(AT, '2026-11-01', '2026-11-30').some(v => v.ID === V.ID && v._사업장명)); assert(G.listVisits(CT2, '2026-11-01', '2026-11-30').every(v => v.ID !== V.ID)); ok('달력 조회(관리자 전체 / 컨설턴트 본인)');
d = G.saveVisit(CT, { ID: V.ID, 사업장ID: P.ID, 일자: '2026-11-20', 상태: '취소' }); assert(!d.extra.visits[0]['캘린더ID']); ok('취소 → 캘린더 이벤트 삭제');

console.log('2) 협약·착수 서류');
d = G.uploadDoc(CT, P.ID, '협약서', [pdf]); assert.strictEqual(d.extra.docSummary.대기, 1); assert.strictEqual(d.extra.docSummary.누락, 3);
env.outbox.length = 0; d = G.adminReviewDoc(AT, d.extra.docs[0].ID, '반려', '서명 누락');
assert(env.outbox.some(m => /서류 반려/.test(m.subject))); d = G.uploadDoc(CT, P.ID, '협약서', [pdf]); d = G.adminReviewDoc(AT, d.extra.docs[0].ID, '확인', '');
assert.strictEqual(d.extra.docSummary.확인, 1); ok('업로드 → 반려(메일) → 재업로드 → 확인, 요약 ' + JSON.stringify(d.extra.docSummary));
assert(G.adminListProjects_().find(p => p.ID === P.ID)._서류.확인 === 1); assert(G.downloadFile(CT, G.parseFiles_(d.extra.docs[0]['파일'])[0].id).b64); ok('목록 요약·다운로드 권한');
throws(() => G.uploadDoc(CT, P.ID, '없는서류', [pdf]), /종류/, '정의되지 않은 서류 거부');

console.log('3) 검수 체크리스트 + 4) 수당 정산');
G.adminSaveFeeRules(AT, [{ 항목: '중간보고 검수완료', 보고서: '중간', 금액: '500,000', 분배: '균등' }, { 항목: '최종보고 검수완료', 보고서: '최종', 금액: '', 분배: '균등' }]);
assert.strictEqual(sheet('수당기준').filter(r => r['항목']).length, 2);
G.update_('사업장', P.ID, { 중간검수: '미제출' }); G._cache = {};
d = G.submitReport(CT, P.ID, '중간', [hwpx], '');
const items = G.options_().체크리스트.중간;
env.outbox.length = 0;
d = G.adminReviewSubmission(AT, d.submissions[0].ID, '보완요청', '전반적으로 양호', items.map((t, i) => ({ 항목: t, 결과: i === 1 ? '부적합' : '적합', 메모: i === 1 ? '영향 진단 보강' : '' })));
const sub = d.submissions[0]; assert(/\[부적합 항목\]/.test(sub['검수의견']) && /영향 진단 보강/.test(sub['검수의견'])); assert(G.parseFiles_(sub['체크리스트']).length === items.length);
assert(env.outbox.some(m => /부적합 항목/.test(m.htmlBody))); ok('체크리스트 저장, 부적합 항목이 의견·메일에 자동 정리');
assert.strictEqual(sheet('정산').length, 0); ok('보완요청 상태에서는 정산 없음');
d = G.submitReport(CT, P.ID, '중간', [hwpx], '보완'); d = G.adminReviewSubmission(AT, d.submissions[0].ID, '검수완료', '', null);
let fees = sheet('정산'); const nC = G.splitIds_(P['컨설턴트ID']).length;
assert.strictEqual(fees.length, nC); assert.strictEqual(fees[0]['금액'], String(Math.round(500000 / nC))); ok('검수완료 → 정산 ' + fees.length + '건 생성, 금액 ' + fees[0]['금액']);
G.adminUpdateProject(AT, P.ID, { 비고: 'x' }); G.adminRebuildSettlements(AT); assert.strictEqual(sheet('정산').length, nC); ok('재계산해도 중복 없음');
let L = G.adminUpdateSettlements(AT, [fees[0].ID], { 상태: '지급완료' }); assert(L.list.find(f => f.ID === fees[0].ID)['지급일']); ok('지급완료 처리(지급일 자동)');
assert(G.getProjectDetail(CT, P.ID).extra.settlements.length >= 1); ok('컨설턴트 본인 정산 조회');

console.log('5) 만족도 설문');
env.outbox.length = 0; let sv = G.adminSendSurvey(AT, [P.ID]); assert.strictEqual(sv.sent, 1);
const tok = env.outbox[0].htmlBody.match(/t=([0-9a-f]{32})/)[1]; ok('설문 메일 발송 (링크 토큰)');
assert.strictEqual(G.adminSendSurvey(AT, [P.ID]).sent, 0); ok('중복 발송 방지');
const q = G.getSurvey(tok); assert(q.questions.length === 5 && q.사업장명 === P['사업장명']);
throws(() => G.submitSurvey(tok, [5, 5], ''), /모든 문항/, '미응답 문항 거부');
G.submitSurvey(tok, [5, 4, 5, 4, 5], '좋았습니다', '홍길동'); throws(() => G.submitSurvey(tok, [5, 5, 5, 5, 5], ''), /이미/, '중복 응답 거부');
const sm = G.surveyMap_(); assert.strictEqual(sm.byProject[P.ID].평균, 4.6); assert(G.adminListConsultants_().find(c => c.ID === c1.ID)._만족도.평균 === 4.6); ok('평균 4.6 → 사업장·컨설턴트 반영');
throws(() => G.getSurvey('deadbeef'), /유효하지/, '잘못된 링크');

console.log('6) 교육과정');
let T = G.adminSaveTrainingFull(AT, { 교육명: '보고서 심화 교육', 일자: '2026-12-05', 시간: '3', 정원: '1', 신청마감: '2026-12-01', 방식: '대면', 장소: '본원' });
const TR = T.find(t => t['교육명'] === '보고서 심화 교육'); assert(TR._신청가능);
T = G.applyTraining(CT, TR.ID); assert.strictEqual(T.find(t => t.ID === TR.ID)._내신청, '신청');
throws(() => G.applyTraining(CT2, TR.ID), /정원/, '정원 초과 거부');
G.applyTraining(CT, TR.ID, true); G.applyTraining(CT2, TR.ID); ok('신청·취소·정원 관리');
const det = G.adminSetAttendance(AT, TR.ID, [c2.ID], true, ''); assert.strictEqual(det.applicants.find(a => a['컨설턴트ID'] === c2.ID)['상태'], '수료');
assert(sheet('교육이수').some(r => r['교육ID'] === TR.ID && r['컨설턴트ID'] === c2.ID && r['이수시간'] === '3')); ok('출석 처리 → 이수 3시간 자동 기록');
G.adminSetAttendance(AT, TR.ID, [c2.ID], false); assert(!sheet('교육이수').some(r => r['교육ID'] === TR.ID)); ok('불참 처리 → 이수 삭제');

console.log('7) 배정 추천');
const pendApp = sheet('신청').find(a => a['사업장지역']);
const rec = G.adminRecommend(AT, pendApp.ID); assert(rec.list.length === 8 && rec.list[0].점수 >= rec.list[7].점수);
ok('추천 ' + rec.region + ': ' + rec.list.slice(0, 3).map(x => x.성명 + '(' + x.점수 + ': ' + x.근거 + ')').join(' / '));

console.log('8) 월간 실적');
const st = G.adminMonthlyReport(AT, '2026-11'); assert(st.rows.length >= 15 && st.byChasu.length >= 10);
console.log('   ', st.rows.slice(0, 4).map(r => r.join(':')).join(' | '), '| 만족도', st.만족도평균, '| 지급', st.정산지급);
assert(G.adminMonthlyReportXlsx(AT, '2026-11').name.endsWith('.xlsx')); ok('집계 + 엑셀');
env.outbox.length = 0; G.sendMonthlyReportMail_(); assert(env.outbox.some(m => /월간 실적/.test(m.subject))); ok('월간 실적 메일');

console.log('9) 공지·자료실');
env.outbox.length = 0; let N = G.adminSaveNotice(AT, { 제목: '12월 일정 안내', 내용: '보고서 마감 12/1', 대상: '외부', 고정: 'Y' }, [pdf], true);
assert(N.sent > 10); const NID = N.list[0].ID; ok('외부 대상 게시 + 알림 메일 ' + N.sent + '통');
assert.strictEqual(G.consultantBootstrap(CT).badges.공지, 1);
let CL = G.listNotices(CT); assert(CL[0].ID === NID && !CL[0]._읽음); G.markNoticeRead(CT, NID); G.markNoticeRead(CT, NID);
assert.strictEqual(G.consultantBootstrap(CT).badges.공지, 0); assert.strictEqual(G.listNotices(AT).find(n => n.ID === NID)._읽음, 1); ok('읽음 확인 (중복 없음, 관리자 1명 읽음 표시)');
const nf = G.parseFiles_(G.find_('공지', NID)['첨부'])[0].id; assert(G.downloadFile(CT, nf).b64); ok('첨부 다운로드 권한');
G.adminSaveNotice(AT, { 제목: '내부용', 대상: '내부' }, [], false); assert(!G.listNotices(CT).some(n => n['제목'] === '내부용')); ok('대상 외 공지 숨김');

console.log('10) 문의·요청');
env.outbox.length = 0; let QL = G.createInquiry(CT, { 사업장ID: P.ID, 유형: '일정변경', 제목: '방문일 변경 요청', 내용: '11/20 → 11/27' }, []);
assert(env.outbox.some(m => /문의·일정변경/.test(m.subject))); assert.strictEqual(G.adminBadges_().문의, 1);
throws(() => G.createInquiry(CT2, { 사업장ID: P.ID, 제목: 'x', 내용: 'y' }, []), /담당/, '타인 사업장 문의 차단');
env.outbox.length = 0; QL = G.adminAnswerInquiry(AT, QL[0].ID, '변경 승인합니다.', '완료');
assert(env.outbox.some(m => m.to === c1['이메일'] && /변경 승인/.test(m.htmlBody))); assert.strictEqual(G.listInquiries(CT2).length, 0); ok('문의 → 관리자 알림 → 답변 메일, 본인 것만 조회');

console.log('11) 진행조회');
const lk = G.lookupApplication(A.ID.toLowerCase(), A['사업자등록번호']);
assert(lk.steps.length >= 3 && lk.사업장명 === A['사업장명']); assert(!JSON.stringify(lk).includes(A['담당자연락처'] || '@@')); ok('조회: ' + lk.steps.map(s => s.단계 + (s.완료 ? '✓' : '')).join(' > '));
throws(() => G.lookupApplication(A.ID, '1234567890'), /일치/, '사업자번호 불일치');
for (let i = 0; i < 10; i++) { try { G.lookupApplication(A.ID, '2208162517'); } catch (e) {} }
throws(() => G.lookupApplication(A.ID, '2208162517'), /많습니다/, '반복 조회 제한');

console.log('12) 문자(솔라피)');
assert.strictEqual(G.sendSms_('01012345678', 'x', 't', ''), false); ok('설정 전에는 발송 안 함');
G.adminSaveSmsKeys(AT, 'KEY123', 'SECRET456'); G.setSetting_('SMS_ENABLED', 'Y'); G.setSetting_('SMS_SENDER', '02-1234-5678'); G._cache = {};
assert(G.smsReady_()); G.adminSmsTest(AT, '010-1111-2222');
const sms = G.__sms.pop(); assert.strictEqual(sms.body.message.to, '01011112222'); assert.strictEqual(sms.body.message.from, '0212345678');
assert(/^HMAC-SHA256 apiKey=KEY123, date=.+, salt=[0-9a-f]{32}, signature=[0-9a-f]{64}$/.test(sms.headers.Authorization)); ok('솔라피 요청 형식(HMAC 서명·번호 정규화)');
const before = (G.__sms || []).length;
d = G.submitReport(CT, P.ID, '최종', [hwpx], ''); G.adminReviewSubmission(AT, d.submissions[0].ID, '보완요청', '수정', null);
assert((G.__sms || []).length > before); ok('보완요청 문자 자동 발송');
assert(G.adminBadges_() && G.adminBootstrap(AT).sms === true); ok('관리자 부트스트랩 배지·문자 상태');
console.log('\n세부기능 테스트 통과');
fs.writeFileSync(__dirname + '/state2.json', JSON.stringify({ sheets: env.active.getSheets().map(s => [s.getName(), s.data]) }));
