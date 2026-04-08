function normalizeLevelLabel(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function resolveAcademicLevelForCourseLevel({ courseLevel, academicLevels, levelNumber }) {
  if (!courseLevel || !Array.isArray(academicLevels) || !academicLevels.length) {
    return null;
  }

  const numericLevel = Number(levelNumber);
  const candidates = academicLevels.filter((item) => Number(item?.rank) === numericLevel);
  if (!candidates.length) {
    return null;
  }

  const courseTitle = normalizeLevelLabel(courseLevel.title);
  const exactTitleMatch = candidates.find((item) => normalizeLevelLabel(item?.name) === courseTitle);
  if (exactTitleMatch) {
    return exactTitleMatch;
  }

  const genericTitle = normalizeLevelLabel(`Level ${numericLevel}`);
  const genericMatch = candidates.find((item) => normalizeLevelLabel(item?.name) === genericTitle);
  if (genericMatch) {
    return genericMatch;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  const partialTitleMatch = candidates.find((item) => normalizeLevelLabel(item?.name).includes(courseTitle));
  if (partialTitleMatch) {
    return partialTitleMatch;
  }

  return candidates[0];
}

export { resolveAcademicLevelForCourseLevel };