import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "../modules/auth/LoginPage";
import { ChangePasswordPage } from "../modules/auth/ChangePasswordPage";
import { UnauthorizedPage } from "../modules/common/UnauthorizedPage";
import { SubscriptionBlockedPage } from "../modules/common/SubscriptionBlockedPage";
import { VirtualAbacusPage } from "../modules/common/VirtualAbacusPage";
import { ProtectedRoute } from "./ProtectedRoute";
import { RoleRoute } from "./RoleRoute";
import { MainLayout } from "../layout/MainLayout";
import { ROLES } from "../types/auth";

import { IndexRedirect } from "./IndexRedirect";

import { SuperadminBusinessPartnersPage } from "../modules/superadmin/SuperadminBusinessPartnersPage";
import { SuperadminRevenuePage } from "../modules/superadmin/SuperadminRevenuePage";
import { SuperadminSubscriptionsPage } from "../modules/superadmin/SuperadminSubscriptionsPage";
import { SuperadminAuditPage } from "../modules/superadmin/SuperadminAuditPage";
import { SuperadminFranchisesPage } from "../modules/superadmin/SuperadminFranchisesPage";
import { SuperadminCentersPage } from "../modules/superadmin/SuperadminCentersPage";
import { SuperadminBusinessPartnerProfilePage } from "../modules/superadmin/SuperadminBusinessPartnerProfilePage";
import { SuperadminPracticeFeaturesPage } from "../modules/superadmin/SuperadminPracticeFeaturesPage";
import { SuperadminCoursesPage } from "../modules/superadmin/SuperadminCoursesPage";
import { SuperadminCourseLevelsPage } from "../modules/superadmin/SuperadminCourseLevelsPage";
import { SuperadminCourseLevelEnginePage } from "../modules/superadmin/SuperadminCourseLevelEnginePage";
import { SuperadminCourseLevelQuestionBankPage } from "../modules/superadmin/SuperadminCourseLevelQuestionBankPage";
import { SuperadminCourseLevelWorksheetsPage } from "../modules/superadmin/SuperadminCourseLevelWorksheetsPage";
import { SuperadminDashboard } from "../modules/superadmin/SuperadminDashboard";
import { AnalyticsDashboard } from "../modules/superadmin/AnalyticsDashboard";
import { ReportsPage } from "../modules/superadmin/ReportsPage";
import { AbuseFlagsPage } from "../modules/superadmin/AbuseFlagsPage";
import { SuperadminExamCyclesPage } from "../modules/superadmin/SuperadminExamCyclesPage";
import { SuperadminCreateExamCyclePage } from "../modules/superadmin/SuperadminCreateExamCyclePage";
import { SuperadminExamPendingListsPage } from "../modules/superadmin/SuperadminExamPendingListsPage";
import { SuperadminExamResultsPage } from "../modules/superadmin/SuperadminExamResultsPage";
import { SuperadminMarginsPage } from "../modules/superadmin/SuperadminMarginsPage";
import { SuperadminSettlementsPage } from "../modules/superadmin/SuperadminSettlementsPage";
import { SuperadminLedgerPage } from "../modules/superadmin/SuperadminLedgerPage";
import { SuperadminUsersPage } from "../modules/superadmin/SuperadminUsersPage";
import { SuperadminCertificatesPage } from "../modules/superadmin/SuperadminCertificatesPage";
import { SuperadminHierarchyPage } from "../modules/superadmin/SuperadminHierarchyPage";
import { SuperadminCompetitionPage } from "../modules/superadmin/SuperadminCompetitionPage";
import { SuperadminCompetitionPendingPage } from "../modules/superadmin/SuperadminCompetitionPendingPage";
import { SuperadminCompetitionResultsPage } from "../modules/superadmin/SuperadminCompetitionResultsPage";

import { CenterStudentsPage } from "../modules/center/CenterStudentsPage";
import { CenterStudentViewPage } from "../modules/center/CenterStudentViewPage";
import { CenterStudentFeesPage } from "../modules/center/CenterStudentFeesPage";
import { CenterStudentNotesPage } from "../modules/center/CenterStudentNotesPage";
import { CenterStudentChangeTeacherPage } from "../modules/center/CenterStudentChangeTeacherPage";
import { CenterCompetitionEnrollmentPage } from "../modules/center/CenterCompetitionEnrollmentPage";
import { CenterDashboardPage } from "../modules/center/CenterDashboardPage";
import { CenterTeachersPage } from "../modules/center/CenterTeachersPage";
import { CenterBatchesPage } from "../modules/center/CenterBatchesPage";
import { CenterEnrollmentsPage } from "../modules/center/CenterEnrollmentsPage";
import { CenterAttendanceSessionsPage } from "../modules/center/CenterAttendanceSessionsPage";
import { CenterWorksheetsPage } from "../modules/center/CenterWorksheetsPage";
import { CenterReportsPage } from "../modules/center/CenterReportsPage";
import { CenterSettlementsPage } from "../modules/center/CenterSettlementsPage";
import { CenterAssignWorksheetsPage } from "../modules/center/CenterAssignWorksheetsPage";
import { WorksheetPage } from "../modules/center/WorksheetPage";
import { CenterExamCyclesPage } from "../modules/center/CenterExamCyclesPage";
import { CenterExamEnrollmentPage } from "../modules/center/CenterExamEnrollmentPage";

import { CenterAnalyticsPage } from "../modules/center/CenterAnalyticsPage";
import { CenterReassignmentQueuePage } from "../modules/center/CenterReassignmentQueuePage";
import { CenterPracticeAssignmentsPage } from "../modules/center/CenterPracticeAssignmentsPage";
import { CenterAttendanceHistoryPage } from "../modules/center/CenterAttendanceHistoryPage";
import { Student360Page } from "../modules/common/Student360Page";

import { AttendanceSessionRollPage } from "../modules/attendance/AttendanceSessionRollPage";
import { StudentAttendanceHistoryPage } from "../modules/attendance/StudentAttendanceHistoryPage";

import { TeacherAttendancePage } from "../modules/teacher/TeacherAttendancePage";
import { TeacherDashboardPage } from "../modules/teacher/TeacherDashboardPage";
import { TeacherBatchesPage } from "../modules/teacher/TeacherBatchesPage";
import { TeacherStudentsPage } from "../modules/teacher/TeacherStudentsPage";
import { TeacherResultsPage } from "../modules/teacher/TeacherResultsPage";
import { TeacherStudentViewPage } from "../modules/teacher/TeacherStudentViewPage";
import { TeacherStudentAttemptsPage } from "../modules/teacher/TeacherStudentAttemptsPage";
import { TeacherStudentMaterialsPage } from "../modules/teacher/TeacherStudentMaterialsPage";
import { TeacherStudentPracticeReportPage } from "../modules/teacher/TeacherStudentPracticeReportPage";
import { TeacherAssignWorksheetsPage } from "../modules/teacher/TeacherAssignWorksheetsPage";
import { TeacherNotesPage } from "../modules/teacher/TeacherNotesPage";
import { TeacherProfilePage } from "../modules/teacher/TeacherProfilePage";
import { TeacherWorksheetsPage } from "../modules/teacher/TeacherWorksheetsPage";
import { TeacherExamCyclesPage } from "../modules/teacher/TeacherExamCyclesPage";
import { TeacherExamEnrollmentPage } from "../modules/teacher/TeacherExamEnrollmentPage";
import { TeacherAnalyticsPage } from "../modules/teacher/TeacherAnalyticsPage";
import { TeacherReassignmentQueuePage } from "../modules/teacher/TeacherReassignmentQueuePage";

import { BusinessPartnerDashboardPage } from "../modules/businessPartner/BusinessPartnerDashboardPage";
import { BusinessPartnerCentersPage } from "../modules/businessPartner/BusinessPartnerCentersPage";
import { BusinessPartnerRevenuePage } from "../modules/businessPartner/BusinessPartnerRevenuePage";
import { BusinessPartnerRevenueSplitPage } from "../modules/businessPartner/BusinessPartnerRevenueSplitPage";
import { BusinessPartnerProfilePage } from "../modules/businessPartner/BusinessPartnerProfilePage";
import { BusinessPartnerFranchisesPage } from "../modules/businessPartner/BusinessPartnerFranchisesPage";
import { BusinessPartnerCoursesPage } from "../modules/businessPartner/BusinessPartnerCoursesPage";
import { BusinessPartnerWorksheetsPage } from "../modules/businessPartner/BusinessPartnerWorksheetsPage";
import { BusinessPartnerStudentsPage } from "../modules/businessPartner/BusinessPartnerStudentsPage";
import { BusinessPartnerCertificatesPage } from "../modules/businessPartner/BusinessPartnerCertificatesPage";
import { BusinessPartnerCertificateTemplatePage } from "../modules/businessPartner/BusinessPartnerCertificateTemplatePage";
import { BusinessPartnerCompetitionRequestsPage } from "../modules/businessPartner/BusinessPartnerCompetitionRequestsPage";
import { BusinessPartnerExamCyclesPage } from "../modules/businessPartner/BusinessPartnerExamCyclesPage";
import { BusinessPartnerExamPendingListsPage } from "../modules/businessPartner/BusinessPartnerExamPendingListsPage";
import { BusinessPartnerExamResultsPage } from "../modules/businessPartner/BusinessPartnerExamResultsPage";
import { BusinessPartnerSettlementsPage } from "../modules/businessPartner/BusinessPartnerSettlementsPage";
import { BusinessPartnerLedgerPage } from "../modules/businessPartner/BusinessPartnerLedgerPage";
import { BusinessPartnerPracticeAllocationsPage } from "../modules/businessPartner/BusinessPartnerPracticeAllocationsPage";
import { FranchiseDashboard } from "../modules/franchise/FranchiseDashboard";
import { FranchiseCentersPage } from "../modules/franchise/FranchiseCentersPage";
import { FranchiseStudentsPage } from "../modules/franchise/FranchiseStudentsPage";
import { FranchiseCompetitionRequestsPage } from "../modules/franchise/FranchiseCompetitionRequestsPage";
import { FranchiseReportsPage } from "../modules/franchise/FranchiseReportsPage";
import { FranchiseProfilePage } from "../modules/franchise/FranchiseProfilePage";
import { FranchiseWorksheetsPage } from "../modules/franchise/FranchiseWorksheetsPage";
import { FranchiseMarginsPage } from "../modules/franchise/FranchiseMarginsPage";
import { FranchiseSettlementsPage } from "../modules/franchise/FranchiseSettlementsPage";
import { FranchiseExamCyclesPage } from "../modules/franchise/FranchiseExamCyclesPage";
import { FranchiseExamPendingListsPage } from "../modules/franchise/FranchiseExamPendingListsPage";
import { FranchiseExamResultsPage } from "../modules/franchise/FranchiseExamResultsPage";
import { FranchiseCoursesPage } from "../modules/franchise/FranchiseCoursesPage";
import { StudentDashboardPage } from "../modules/student/StudentDashboardPage";
import { StudentEnrollmentsPage } from "../modules/student/StudentEnrollmentsPage";
import { StudentWorksheetsPage } from "../modules/student/StudentWorksheetsPage";
import { StudentWorksheetAttemptPage } from "../modules/student/StudentWorksheetAttemptPage";
import { StudentPracticeWorksheetPage } from "../modules/student/StudentPracticeWorksheetPage";
import { StudentAbacusPracticeWorksheetPage } from "../modules/student/StudentAbacusPracticeWorksheetPage";
import { StudentMaterialsPage } from "../modules/student/StudentMaterialsPage";
import { StudentMyCoursePage } from "../modules/student/StudentMyCoursePage";
import { StudentResultsPage } from "../modules/student/StudentResultsPage";
import { StudentMockTestsPage } from "../modules/student/StudentMockTestsPage";
import { StudentMockTestAttemptPage } from "../modules/student/StudentMockTestAttemptPage";
import { StudentExamsPage } from "../modules/student/StudentExamsPage";
import { StudentExamResultPage } from "../modules/student/StudentExamResultPage";
import { StudentProfilePage } from "../modules/student/StudentProfilePage";
import { StudentAiPlaygroundPage } from "../modules/student/StudentAiPlaygroundPage";
import { StudentProgressPage } from "../modules/student/StudentProgressPage";
import { StudentLeaderboardPage } from "../modules/student/StudentLeaderboardPage";
import { StudentCertificatesPage } from "../modules/student/StudentCertificatesPage";
import { StudentAttendancePage } from "../modules/student/StudentAttendancePage";
import { StudentFeesPage } from "../modules/student/StudentFeesPage";
import { StudentWeakTopicsPage } from "../modules/student/StudentWeakTopicsPage";
import { NotificationsPage } from "../modules/common/NotificationsPage";
import { CertificateVerifyPage } from "../modules/public/CertificateVerifyPage";

function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/change-password" element={<ChangePasswordPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      <Route path="/subscription-blocked" element={<SubscriptionBlockedPage />} />
      <Route path="/verify/:token" element={<CertificateVerifyPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout />}>
          <Route index element={<IndexRedirect />} />

          <Route element={<RoleRoute allowedRoles={[ROLES.SUPERADMIN]} />}>
            <Route path="/superadmin/dashboard" element={<SuperadminDashboard />} />
            <Route path="/superadmin/analytics" element={<AnalyticsDashboard />} />
            <Route path="/superadmin/reports" element={<ReportsPage />} />
            <Route path="/superadmin/overview" element={<Navigate to="/superadmin/dashboard" replace />} />
            <Route path="/superadmin/business-partners" element={<SuperadminBusinessPartnersPage />} />
            <Route path="/superadmin/business-partners/new" element={<SuperadminBusinessPartnerProfilePage />} />
            <Route path="/superadmin/business-partners/:id" element={<SuperadminBusinessPartnerProfilePage />} />
            <Route path="/superadmin/franchises" element={<SuperadminFranchisesPage />} />
            <Route path="/superadmin/centers" element={<SuperadminCentersPage />} />
            <Route path="/superadmin/courses" element={<SuperadminCoursesPage />} />
            <Route path="/superadmin/practice-features" element={<SuperadminPracticeFeaturesPage />} />
            <Route path="/superadmin/courses/:id/levels" element={<SuperadminCourseLevelsPage />} />
            <Route path="/superadmin/courses/:courseId/levels/:levelNumber" element={<SuperadminCourseLevelEnginePage />} />
            <Route path="/superadmin/courses/:courseId/levels/:levelNumber/question-bank" element={<SuperadminCourseLevelQuestionBankPage />} />
            <Route path="/superadmin/courses/:courseId/levels/:levelNumber/worksheets" element={<SuperadminCourseLevelWorksheetsPage />} />
            <Route path="/superadmin/exam-cycles" element={<SuperadminExamCyclesPage />} />
            <Route path="/superadmin/exam-cycles/new" element={<SuperadminCreateExamCyclePage />} />
            <Route path="/superadmin/exam-cycles/:examCycleId/pending" element={<SuperadminExamPendingListsPage />} />
            <Route path="/superadmin/exam-cycles/:examCycleId/results" element={<SuperadminExamResultsPage />} />
            <Route path="/superadmin/abuse-flags" element={<AbuseFlagsPage />} />
            <Route path="/superadmin/audit-logs" element={<SuperadminAuditPage />} />
            <Route path="/superadmin/revenue" element={<SuperadminRevenuePage />} />
            <Route path="/superadmin/subscriptions" element={<SuperadminSubscriptionsPage />} />
            <Route path="/superadmin/margins" element={<SuperadminMarginsPage />} />
            <Route path="/superadmin/settlements" element={<SuperadminSettlementsPage />} />
            <Route path="/superadmin/ledger" element={<SuperadminLedgerPage />} />
            <Route path="/superadmin/users" element={<SuperadminUsersPage />} />
            <Route path="/superadmin/certificates" element={<SuperadminCertificatesPage />} />
            <Route path="/superadmin/hierarchy" element={<SuperadminHierarchyPage />} />
            <Route path="/superadmin/competition" element={<SuperadminCompetitionPage />} />
            <Route path="/superadmin/competition/:competitionId/pending" element={<SuperadminCompetitionPendingPage />} />
            <Route path="/superadmin/competition/:competitionId/results" element={<SuperadminCompetitionResultsPage />} />
          </Route>

          <Route element={<RoleRoute allowedRoles={[ROLES.CENTER]} />}>
            <Route path="/center/dashboard" element={<CenterDashboardPage />} />
            <Route path="/center/students" element={<CenterStudentsPage />} />
            <Route path="/center/students/:studentId" element={<CenterStudentViewPage />} />
            <Route path="/center/students/:studentId/fees" element={<CenterStudentFeesPage />} />
            <Route path="/center/students/:studentId/notes" element={<CenterStudentNotesPage />} />
            <Route path="/center/students/:studentId/change-teacher" element={<CenterStudentChangeTeacherPage />} />
            <Route path="/center/students/:studentId/assign-worksheets" element={<CenterAssignWorksheetsPage />} />
            <Route path="/center/students/:studentId/attendance" element={<StudentAttendanceHistoryPage />} />
            <Route path="/center/students/:studentId/360" element={<Student360Page />} />
            <Route path="/center/teachers" element={<CenterTeachersPage />} />
            <Route path="/center/batches" element={<CenterBatchesPage />} />
            <Route path="/center/enrollments" element={<CenterEnrollmentsPage />} />
            <Route path="/center/attendance" element={<CenterAttendanceSessionsPage />} />
            <Route path="/center/attendance-history" element={<CenterAttendanceHistoryPage />} />
            <Route path="/center/competition-enrollment" element={<CenterCompetitionEnrollmentPage />} />
            <Route path="/center/worksheets" element={<CenterWorksheetsPage />} />
            <Route path="/center/worksheets/:id" element={<WorksheetPage />} />
            <Route path="/center/exam-cycles" element={<CenterExamCyclesPage />} />
            <Route path="/center/exam-cycles/:examCycleId" element={<CenterExamEnrollmentPage />} />
            <Route path="/center/courses" element={<Navigate to="/center/worksheets" replace />} />
            <Route path="/center/reports" element={<CenterReportsPage />} />
            <Route path="/center/settlements" element={<CenterSettlementsPage />} />
            <Route path="/center/analytics" element={<CenterAnalyticsPage />} />
            <Route path="/center/reassignment-requests" element={<CenterReassignmentQueuePage />} />
            <Route path="/center/practice-assignments" element={<CenterPracticeAssignmentsPage />} />
          </Route>

          <Route element={<RoleRoute allowedRoles={[ROLES.TEACHER]} />}>
            <Route path="/teacher/dashboard" element={<TeacherDashboardPage />} />
            <Route path="/teacher/profile" element={<TeacherProfilePage />} />
            <Route path="/teacher/batches" element={<TeacherBatchesPage />} />
            <Route path="/teacher/students" element={<TeacherStudentsPage />} />
            <Route path="/teacher/results" element={<TeacherResultsPage />} />
            <Route path="/teacher/students/:studentId" element={<TeacherStudentViewPage />} />
            <Route path="/teacher/students/:studentId/attempts" element={<TeacherStudentAttemptsPage />} />
            <Route path="/teacher/students/:studentId/materials" element={<TeacherStudentMaterialsPage />} />
            <Route path="/teacher/students/:studentId/practice-report" element={<TeacherStudentPracticeReportPage />} />
            <Route path="/teacher/students/:studentId/assign-worksheets" element={<TeacherAssignWorksheetsPage />} />
            <Route path="/teacher/students/:studentId/attendance" element={<StudentAttendanceHistoryPage />} />
            <Route path="/teacher/students/:studentId/360" element={<Student360Page />} />
            <Route path="/teacher/attendance" element={<TeacherAttendancePage />} />
            <Route path="/teacher/notes" element={<TeacherNotesPage />} />
            <Route path="/teacher/worksheets" element={<TeacherWorksheetsPage />} />
            <Route path="/teacher/virtual-abacus" element={<VirtualAbacusPage />} />
            <Route path="/teacher/exam-cycles" element={<TeacherExamCyclesPage />} />
            <Route path="/teacher/exam-cycles/:examCycleId" element={<TeacherExamEnrollmentPage />} />
            <Route path="/teacher/analytics" element={<TeacherAnalyticsPage />} />
            <Route path="/teacher/reassignment-requests" element={<TeacherReassignmentQueuePage />} />
          </Route>

          <Route element={<RoleRoute allowedRoles={[ROLES.CENTER, ROLES.TEACHER, ROLES.SUPERADMIN]} />}>
            <Route path="/attendance/sessions/:id" element={<AttendanceSessionRollPage />} />
          </Route>

          {/* Notifications — accessible to all authenticated roles */}
          <Route path="/notifications" element={<NotificationsPage />} />

          <Route element={<RoleRoute allowedRoles={[ROLES.BP]} />}>
            <Route path="/bp/overview" element={<Navigate to="/bp/dashboard" replace />} />
            <Route path="/bp/dashboard" element={<BusinessPartnerDashboardPage />} />
            <Route path="/bp/profile" element={<BusinessPartnerProfilePage />} />
            <Route path="/bp/franchises" element={<BusinessPartnerFranchisesPage />} />
            <Route path="/bp/courses" element={<BusinessPartnerCoursesPage />} />
            <Route path="/bp/worksheets" element={<BusinessPartnerWorksheetsPage />} />
            <Route path="/bp/students" element={<BusinessPartnerStudentsPage />} />
            <Route path="/bp/certificates" element={<BusinessPartnerCertificatesPage />} />
            <Route path="/bp/certificate-template" element={<BusinessPartnerCertificateTemplatePage />} />
            <Route path="/bp/competition-requests" element={<BusinessPartnerCompetitionRequestsPage />} />
            <Route path="/bp/exam-cycles" element={<BusinessPartnerExamCyclesPage />} />
            <Route path="/bp/exam-cycles/:examCycleId/pending" element={<BusinessPartnerExamPendingListsPage />} />
            <Route path="/bp/exam-cycles/:examCycleId/results" element={<BusinessPartnerExamResultsPage />} />
            <Route path="/bp/settlements" element={<BusinessPartnerSettlementsPage />} />
            <Route path="/bp/ledger" element={<BusinessPartnerLedgerPage />} />
            <Route path="/bp/centers" element={<BusinessPartnerCentersPage />} />
            <Route path="/bp/revenue" element={<BusinessPartnerRevenuePage />} />
            <Route path="/bp/revenue-split" element={<BusinessPartnerRevenueSplitPage />} />
            <Route path="/bp/practice-allocations" element={<BusinessPartnerPracticeAllocationsPage />} />
          </Route>

          <Route element={<RoleRoute allowedRoles={[ROLES.FRANCHISE]} />}>
            <Route path="/franchise/overview" element={<Navigate to="/franchise/dashboard" replace />} />
            <Route path="/franchise/profile" element={<FranchiseProfilePage />} />
            <Route path="/franchise/dashboard" element={<FranchiseDashboard />} />
            <Route path="/franchise/exam-cycles" element={<FranchiseExamCyclesPage />} />
            <Route path="/franchise/exam-cycles/:examCycleId/pending" element={<FranchiseExamPendingListsPage />} />
            <Route path="/franchise/exam-cycles/:examCycleId/results" element={<FranchiseExamResultsPage />} />
            <Route path="/franchise/centers" element={<FranchiseCentersPage />} />
            <Route path="/franchise/courses" element={<FranchiseCoursesPage />} />
            <Route path="/franchise/students" element={<FranchiseStudentsPage />} />
            <Route path="/franchise/competition-requests" element={<FranchiseCompetitionRequestsPage />} />
            <Route path="/franchise/worksheets" element={<FranchiseWorksheetsPage />} />
            <Route path="/franchise/reports" element={<FranchiseReportsPage />} />
            <Route path="/franchise/margins" element={<FranchiseMarginsPage />} />
            <Route path="/franchise/settlements" element={<FranchiseSettlementsPage />} />
            <Route path="/franchise/practice-allocations" element={<BusinessPartnerPracticeAllocationsPage />} />
          </Route>

          <Route element={<RoleRoute allowedRoles={[ROLES.STUDENT]} />}>
            <Route path="/student/dashboard" element={<StudentDashboardPage />} />
            <Route path="/student/overview" element={<Navigate to="/student/dashboard" replace />} />
            <Route path="/student/profile" element={<StudentProfilePage />} />
            <Route path="/student/my-course" element={<StudentMyCoursePage />} />
            <Route path="/student/exams" element={<StudentExamsPage />} />
            <Route path="/student/mock-tests" element={<StudentMockTestsPage />} />
            <Route path="/student/mock-tests/:mockTestId/attempt" element={<StudentMockTestAttemptPage />} />
            <Route path="/student/exams/:examCycleId/result" element={<StudentExamResultPage />} />
            <Route path="/student/results" element={<StudentResultsPage />} />
            <Route path="/student/enrollments" element={<StudentEnrollmentsPage />} />
            <Route path="/student/practice" element={<StudentPracticeWorksheetPage />} />
            <Route path="/student/abacus-practice" element={<StudentAbacusPracticeWorksheetPage />} />
            <Route path="/student/virtual-abacus" element={<VirtualAbacusPage />} />
            <Route path="/student/worksheets" element={<StudentWorksheetsPage />} />
            <Route path="/student/worksheets/:worksheetId" element={<StudentWorksheetAttemptPage />} />
            <Route path="/student/materials" element={<StudentMaterialsPage />} />
            <Route path="/student/ai-playground" element={<StudentAiPlaygroundPage />} />
            <Route path="/student/progress" element={<StudentProgressPage />} />
            <Route path="/student/leaderboard" element={<StudentLeaderboardPage />} />
            <Route path="/student/certificates" element={<StudentCertificatesPage />} />
            <Route path="/student/attendance" element={<StudentAttendancePage />} />
            <Route path="/student/fees" element={<StudentFeesPage />} />
            <Route path="/student/weak-topics" element={<StudentWeakTopicsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/unauthorized" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}

export { AppRouter };
