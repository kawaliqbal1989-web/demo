import { prisma } from "../lib/prisma.js";

const ASSESSMENT_PAPER_SELECT = {
  id: true,
  tenantId: true,
  assessmentVersionId: true,
  worksheetId: true,
  paperType: true,
  sourceMode: true,
  levelId: true,
  sourceListId: true,
  sourceLevelId: true,
  sourceStudentId: true,
  sourceWorksheetId: true,
  generationSeedMirror: true,
  isPrimaryPaper: true,
  createdAt: true,
  updatedAt: true
};

function getDb(dbClient) {
  return dbClient || prisma;
}

async function listAssessmentPapersByVersion({ tenantId, assessmentVersionId }, dbClient) {
  const db = getDb(dbClient);
  return db.assessmentPaper.findMany({
    where: {
      tenantId,
      assessmentVersionId
    },
    select: ASSESSMENT_PAPER_SELECT,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
}

async function createAssessmentPaper(data, dbClient) {
  const db = getDb(dbClient);
  return db.assessmentPaper.create({
    data,
    select: ASSESSMENT_PAPER_SELECT
  });
}

async function createAssessmentPapers(records, dbClient) {
  if (!Array.isArray(records) || !records.length) {
    return { count: 0 };
  }

  const db = getDb(dbClient);
  return db.assessmentPaper.createMany({
    data: records,
    skipDuplicates: true
  });
}

async function deleteAssessmentPapersByVersion({ tenantId, assessmentVersionId }, dbClient) {
  const db = getDb(dbClient);
  return db.assessmentPaper.deleteMany({
    where: {
      tenantId,
      assessmentVersionId
    }
  });
}

export {
  ASSESSMENT_PAPER_SELECT,
  listAssessmentPapersByVersion,
  createAssessmentPaper,
  createAssessmentPapers,
  deleteAssessmentPapersByVersion
};
