function getRoleCapabilities(role) {
  if (role === "SUPERADMIN") {
    return {
      canViewDashboard: true,
      canViewReports: true,
      canViewStudentsOverview: true,

      canManagePartnerProfile: true,
      canCreateBusinessPartner: true,
      canManageBusinessPartners: true,

      canManageCourses: true,
      canManageExams: true,
      canManageCompetitions: true,
      canManageCompetitionRequests: true,
      canViewCatalog: true,
      canViewHierarchy: true,

      canCreateFranchise: false,
      canCreateCenter: false,
      canManageTeachers: false,
      canManageStudents: false,
      canEnrollStudents: false,
      canViewAssignedStudents: false,
      canWriteNotes: false,
      canViewMyCourses: false,
      canViewMyWorksheets: false,
      canAttemptWorksheets: false,
      canSeeResults: false,
      canViewPartnerCourses: false
    };
  }

  if (role === "BP") {
    return {
      canViewDashboard: true,
      canManagePartnerProfile: true,
      canCreateFranchise: true,
      canViewFranchises: true,
      canViewCatalog: true,
      canViewPartnerCourses: true,
      canViewHierarchy: true,
      canViewPartnerStudents: true,
      canViewReports: true,
      canManageCompetitionRequests: true,

      canCreateBusinessPartner: false,
      canManageBusinessPartners: false,

      canManageCourses: false,
      canManageExams: false,
      canManageCompetitions: true,
      canViewStudentsOverview: false,

      canCreateCenter: false,
      canManageTeachers: false,
      canManageStudents: false,
      canEnrollStudents: false,
      canViewAssignedStudents: false,
      canWriteNotes: false,
      canViewMyCourses: false,
      canViewMyWorksheets: false,
      canAttemptWorksheets: false,
      canSeeResults: false
    };
  }

  if (role === "FRANCHISE") {
    return {
      canViewDashboard: true,
      canViewReports: true,
      canViewCatalog: true,
      canViewHierarchy: true,

      canCreateCenter: true,
      canManageTeachers: false,
      canManageStudents: true,
      canEnrollStudents: true,
      canManageAttendance: false,
      canManageBatches: false,

      canManagePartnerProfile: false,
      canCreateBusinessPartner: false,
      canManageBusinessPartners: false,
      canCreateFranchise: false,
      canManageCourses: false,
      canManageExams: false,
      canManageCompetitions: false,
      canManageCompetitionRequests: true,
      canViewStudentsOverview: true,
      canViewAssignedStudents: false,
      canWriteNotes: false,
      canViewMyCourses: false,
      canViewMyWorksheets: false,
      canAttemptWorksheets: false,
      canSeeResults: false,
      canViewPartnerCourses: false
    };
  }

  if (role === "CENTER") {
    return {
      canViewDashboard: true,
      canViewReports: true,
      canViewHierarchy: false,
      canViewCatalog: false,

      canManageTeachers: true,
      canManageStudents: true,
      canEnrollStudents: true,
      canManageBatches: true,
      canManageAttendance: true,

      canManagePartnerProfile: false,
      canCreateBusinessPartner: false,
      canManageBusinessPartners: false,
      canCreateFranchise: false,
      canCreateCenter: false,
      canManageCourses: false,
      canManageExams: false,
      canManageCompetitions: true,
      canManageCompetitionRequests: false,
      canViewStudentsOverview: true,
      canViewAssignedStudents: true,
      canWriteNotes: true,
      canViewMyCourses: false,
      canViewMyWorksheets: false,
      canAttemptWorksheets: false,
      canSeeResults: true,
      canViewPartnerCourses: false
    };
  }

  if (role === "TEACHER") {
    return {
      canViewDashboard: true,
      canViewReports: true,
      canViewHierarchy: false,
      canViewCatalog: false,

      canManageTeachers: false,
      canManageStudents: false,
      canEnrollStudents: false,
      canManageBatches: false,
      canManageAttendance: true,

      canViewAssignedStudents: true,
      canWriteNotes: true,
      canSeeResults: true,

      canManagePartnerProfile: false,
      canCreateBusinessPartner: false,
      canManageBusinessPartners: false,
      canCreateFranchise: false,
      canCreateCenter: false,
      canManageCourses: false,
      canManageExams: false,
      canManageCompetitions: false,
      canManageCompetitionRequests: false,
      canViewStudentsOverview: false,
      canViewMyCourses: false,
      canViewMyWorksheets: false,
      canAttemptWorksheets: false,
      canViewPartnerCourses: false
    };
  }

  if (role === "STUDENT") {
    return {
      canViewDashboard: true,
      canViewReports: false,
      canViewHierarchy: false,
      canViewCatalog: false,
      canManageTeachers: false,
      canManageStudents: false,
      canEnrollStudents: false,
      canManageBatches: false,
      canManageAttendance: false,
      canViewAssignedStudents: false,
      canWriteNotes: false,
      canViewMyCourses: true,
      canViewMyWorksheets: true,
      canAttemptWorksheets: true,
      canSeeResults: true,
      canViewStudentsOverview: false,
      canManagePartnerProfile: false,
      canCreateBusinessPartner: false,
      canManageBusinessPartners: false,
      canCreateFranchise: false,
      canCreateCenter: false,
      canManageCourses: false,
      canManageExams: false,
      canManageCompetitions: false,
      canManageCompetitionRequests: false,
      canViewPartnerCourses: false
    };
  }

  return {};
}

export { getRoleCapabilities };
