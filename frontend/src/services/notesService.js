import { apiClient } from "./apiClient";

async function listStudentNotes(studentId, { limit = 50, offset = 0, q = "", from = "", to = "" } = {}) {
  const resp = await apiClient.get(`/students/${studentId}/notes`, {
    params: {
      limit,
      offset,
      q: q || undefined,
      from: from || undefined,
      to: to || undefined
    }
  });
  return resp.data;
}

async function createStudentNote(studentId, payload) {
  const resp = await apiClient.post(`/students/${studentId}/notes`, payload);
  return resp.data;
}

async function updateStudentNote(noteId, payload) {
  const resp = await apiClient.put(`/students/notes/${noteId}`, payload);
  return resp.data;
}

async function deleteStudentNote(noteId) {
  const resp = await apiClient.delete(`/students/notes/${noteId}`);
  return resp.data;
}

async function exportStudentNotesCsv(studentId, { q = "", from = "", to = "" } = {}) {
  const resp = await apiClient.get(`/students/${studentId}/notes/export.csv`, {
    params: { q: q || undefined, from: from || undefined, to: to || undefined },
    responseType: "blob"
  });

  const blob = resp.data;
  const url = window.URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = "notes.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    window.URL.revokeObjectURL(url);
  }
}

export {
  listStudentNotes,
  createStudentNote,
  updateStudentNote,
  deleteStudentNote,
  exportStudentNotesCsv
};
