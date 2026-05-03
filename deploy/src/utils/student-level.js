function getActiveStudentEnrollment(student) {
  const enrollments = Array.isArray(student?.batchEnrollments) ? student.batchEnrollments.filter(Boolean) : [];
  return enrollments[0] || null;
}

function resolveEffectiveStudentLevel(student, enrollment = null) {
  const activeEnrollment = enrollment || getActiveStudentEnrollment(student);
  const effectiveLevel = activeEnrollment?.level || student?.effectiveLevel || student?.level || null;
  const effectiveLevelId =
    activeEnrollment?.levelId || effectiveLevel?.id || student?.effectiveLevelId || student?.levelId || null;

  return {
    activeEnrollment,
    effectiveLevel,
    effectiveLevelId
  };
}

function withEffectiveStudentLevel(student, enrollment = null) {
  if (!student || typeof student !== "object") {
    return student;
  }

  const { activeEnrollment, effectiveLevel, effectiveLevelId } = resolveEffectiveStudentLevel(student, enrollment);

  return {
    ...student,
    activeEnrollment: student.activeEnrollment || activeEnrollment || null,
    effectiveLevel,
    effectiveLevelId
  };
}

export { getActiveStudentEnrollment, resolveEffectiveStudentLevel, withEffectiveStudentLevel };