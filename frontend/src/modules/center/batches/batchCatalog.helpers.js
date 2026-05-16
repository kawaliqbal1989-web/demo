function extractApiPayload(response) {
  if (response && typeof response === "object" && "data" in response) {
    return response.data;
  }
  return response || null;
}

function extractApiItems(response) {
  const payload = extractApiPayload(response);
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  return [];
}

function extractApiMeta(response) {
  const payload = extractApiPayload(response) || {};
  const source = payload?.items ? payload : (payload?.data || payload);

  return {
    total: Number(source?.total || 0),
    page: Number(source?.page || 1),
    pageSize: Number(source?.pageSize || source?.limit || 20),
    limit: Number(source?.limit || source?.pageSize || 20),
    offset: Number(source?.offset || 0)
  };
}

function getTeacherName(teacher) {
  if (!teacher) return "Unassigned";
  return teacher?.teacherProfile?.fullName || teacher?.fullName || teacher?.username || teacher?.email || "Teacher";
}

function getTeacherNames(batch) {
  const labels = (batch?.teacherAssignments || [])
    .map((assignment) => getTeacherName(assignment?.teacher || assignment))
    .filter(Boolean);

  if (!labels.length && batch?.primaryTeacherName) {
    return [String(batch.primaryTeacherName)];
  }

  return Array.from(new Set(labels));
}

function getBatchHealthMeta(value) {
  const health = String(value || "HEALTHY").toUpperCase();
  if (health === "FULL") {
    return { tone: "danger", label: "Full" };
  }
  if (health === "WARNING") {
    return { tone: "warning", label: "Attention" };
  }
  return { tone: "success", label: "Healthy" };
}

function toBatchFormState(batch) {
  const teacherUserIds = (batch?.teacherAssignments || [])
    .map((assignment) => assignment?.teacher?.id)
    .filter(Boolean);
  const primaryTeacherUserId = batch?.primaryTeacherUserId || teacherUserIds[0] || "";

  return {
    name: batch?.name || "",
    status: batch?.status || "ACTIVE",
    modality: batch?.modality || "",
    levelId: batch?.levelId || "",
    primaryTeacherUserId,
    teacherUserIds,
    maxStudents: batch?.maxStudents ?? "",
    durationMinutes: batch?.durationMinutes ?? "",
    notes: batch?.notes || ""
  };
}

function buildBatchPayload(formState) {
  const teacherUserIds = Array.from(new Set((formState.teacherUserIds || []).filter(Boolean)));
  const primaryTeacherUserId = formState.primaryTeacherUserId || teacherUserIds[0] || null;

  return {
    name: String(formState.name || "").trim(),
    status: formState.status || "ACTIVE",
    modality: formState.modality || undefined,
    levelId: formState.levelId || undefined,
    primaryTeacherUserId: primaryTeacherUserId || undefined,
    maxStudents: formState.maxStudents === "" || formState.maxStudents === null || formState.maxStudents === undefined
      ? undefined
      : Number(formState.maxStudents),
    durationMinutes: formState.durationMinutes === "" || formState.durationMinutes === null || formState.durationMinutes === undefined
      ? undefined
      : Number(formState.durationMinutes),
    notes: formState.notes ? String(formState.notes) : undefined
  };
}

function buildDuplicatePayload(batch) {
  const nextName = batch?.name ? `${batch.name} Copy` : "New Batch Copy";

  return {
    name: nextName,
    status: batch?.status === "ARCHIVED" ? "ACTIVE" : (batch?.status || "ACTIVE"),
    modality: batch?.modality || undefined,
    levelId: batch?.levelId || undefined,
    primaryTeacherUserId: batch?.primaryTeacherUserId || undefined,
    maxStudents: batch?.maxStudents ?? undefined,
    durationMinutes: batch?.durationMinutes ?? undefined,
    notes: batch?.notes || undefined,
    teacherUserIds: (batch?.teacherAssignments || []).map((assignment) => assignment?.teacher?.id).filter(Boolean)
  };
}

function formatResultRange(page, pageSize, total, count) {
  if (!count) return "0 results";
  const from = (page - 1) * pageSize + 1;
  const to = from + count - 1;
  return `${from}-${to} of ${total}`;
}

export {
  buildBatchPayload,
  buildDuplicatePayload,
  extractApiItems,
  extractApiMeta,
  formatResultRange,
  getBatchHealthMeta,
  getTeacherName,
  getTeacherNames,
  toBatchFormState
};