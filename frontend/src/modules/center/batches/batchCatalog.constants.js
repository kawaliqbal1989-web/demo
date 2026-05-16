const BATCH_STATUS_OPTIONS = ["ACTIVE", "UPCOMING", "PAUSED", "TRIAL", "COMPLETED", "ARCHIVED"];
const BATCH_MODALITY_OPTIONS = ["ONLINE", "OFFLINE", "HYBRID"];
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const TABLE_SORT_OPTIONS = {
  name: "name",
  teacherName: "teacherName",
  levelRank: "levelRank",
  studentCount: "studentCount",
  modality: "modality",
  status: "status",
  occupancyPercentage: "occupancyPercentage"
};

export {
  BATCH_MODALITY_OPTIONS,
  BATCH_STATUS_OPTIONS,
  PAGE_SIZE_OPTIONS,
  TABLE_SORT_OPTIONS
};