import { apiClient } from "./apiClient";

async function recordStudentArenaSession(payload) {
  const response = await apiClient.post(
    "/student/arena/sessions",
    payload,
    {
      _skipGlobalLoading: true
    }
  );

  return response.data;
}


function unwrapStudentArenaResponse(response) {
  return response?.data?.data ?? response?.data ?? null;
}

async function listStudentArenaSessions({
  activityKeys = [],
  limit = 20
} = {}) {
  const response = await apiClient.get(
    "/student/arena/sessions",
    {
      params: {
        activityKeys: activityKeys.join(","),
        limit
      },
      _skipGlobalLoading: true
    }
  );

  const data = unwrapStudentArenaResponse(response);
  return Array.isArray(data) ? data : [];
}

async function createStudentArenaMobileTask(payload) {
  const response = await apiClient.post(
    "/student/arena/mobile-tasks",
    payload,
    {
      _skipGlobalLoading: true
    }
  );

  return unwrapStudentArenaResponse(response);
}

async function getStudentArenaMobileTaskStatus(taskId) {
  const response = await apiClient.get(
    `/student/arena/mobile-tasks/${encodeURIComponent(taskId)}/status`,
    {
      _skipGlobalLoading: true
    }
  );

  return unwrapStudentArenaResponse(response);
}

export {
  createStudentArenaMobileTask,
  getStudentArenaMobileTaskStatus,
  listStudentArenaSessions,
  recordStudentArenaSession
};
