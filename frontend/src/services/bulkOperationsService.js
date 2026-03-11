import { apiClient } from './apiClient';

async function bulkStatusChange(studentIds, isActive) {
  const { data } = await apiClient.post('/bulk/status', { studentIds, isActive });
  return data;
}

async function bulkPromote(studentIds, newLevelId) {
  const { data } = await apiClient.post('/bulk/promote', { studentIds, newLevelId });
  return data;
}

async function bulkTransfer(studentIds, targetBatchId, targetTeacherUserId) {
  const { data } = await apiClient.post('/bulk/transfer', { studentIds, targetBatchId, targetTeacherUserId });
  return data;
}

async function bulkFeeUpdate(studentIds, fees) {
  const { data } = await apiClient.post('/bulk/fees', { studentIds, ...fees });
  return data;
}

async function bulkAssignTeacher(studentIds, teacherUserId) {
  const { data } = await apiClient.post('/bulk/assign-teacher', { studentIds, teacherUserId });
  return data;
}

async function getApprovalQueue() {
  const { data } = await apiClient.get('/insights/approval-queue');
  return data;
}

export {
  bulkStatusChange,
  bulkPromote,
  bulkTransfer,
  bulkFeeUpdate,
  bulkAssignTeacher,
  getApprovalQueue,
};
