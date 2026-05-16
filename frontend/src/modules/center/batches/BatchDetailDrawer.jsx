import { useEffect, useMemo, useState } from "react";
import { BATCH_MODALITY_OPTIONS, BATCH_STATUS_OPTIONS } from "./batchCatalog.constants";
import { BatchCapacityBadge } from "./BatchCapacityBadge";
import { BatchScheduleCell } from "./BatchScheduleCell";
import { BatchStatusBadge } from "./BatchStatusBadge";
import { getTeacherName, toBatchFormState } from "./batchCatalog.helpers";

function BatchDetailDrawer({ open, mode = "view", batch, teachers = [], levels = [], saving = false, onClose, onSubmit, onEditMode }) {
  const [formState, setFormState] = useState(() => toBatchFormState(batch));

  useEffect(() => {
    if (!open) return;
    setFormState(toBatchFormState(batch));
  }, [open, batch, mode]);

  const teacherOnly = mode === "assign-teacher";
  const readOnly = mode === "view";
  const selectedTeachers = useMemo(() => new Set(formState.teacherUserIds || []), [formState.teacherUserIds]);

  function patchForm(partial) {
    setFormState((current) => ({ ...current, ...partial }));
  }

  function toggleTeacher(teacherId) {
    const current = new Set(formState.teacherUserIds || []);
    if (current.has(teacherId)) {
      current.delete(teacherId);
    } else {
      current.add(teacherId);
    }

    const nextTeacherUserIds = Array.from(current);
    const nextPrimaryTeacherUserId = nextTeacherUserIds.includes(formState.primaryTeacherUserId)
      ? formState.primaryTeacherUserId
      : (nextTeacherUserIds[0] || "");

    patchForm({ teacherUserIds: nextTeacherUserIds, primaryTeacherUserId: nextPrimaryTeacherUserId });
  }

  if (!open) return null;

  return (
    <div className="batch-drawer" role="dialog" aria-modal="true">
      <button type="button" className="batch-drawer__backdrop" aria-label="Close batch drawer" onClick={onClose} />
      <aside className="batch-drawer__panel">
        <div className="batch-drawer__header">
          <div>
            <span className="batch-drawer__eyebrow">{mode === "create" ? "New Batch" : mode === "assign-teacher" ? "Assign Teachers" : mode === "edit" ? "Edit Batch" : "Batch Detail"}</span>
            <h3>{mode === "create" ? "Create operational batch" : (batch?.name || "Batch detail")}</h3>
          </div>
          <button className="button secondary" type="button" onClick={onClose}>Close</button>
        </div>

        {batch && mode !== "create" ? (
          <div className="batch-drawer__hero card">
            <div className="batch-drawer__hero-main">
              <BatchStatusBadge status={batch.status} />
              <div>
                <strong>{batch.level?.name || "No level linked"}</strong>
                <span>{batch.modality || "Modality not set"}</span>
              </div>
            </div>
            <BatchCapacityBadge currentStudents={batch.currentStudents} maxStudents={batch.maxStudents} occupancyPercentage={batch.occupancyPercentage} />
            <BatchScheduleCell batch={batch} />
          </div>
        ) : null}

        <div className="batch-drawer__body">
          {!teacherOnly ? (
            <div className="batch-drawer__section card">
              <div className="batch-drawer__section-header">
                <h4>Batch profile</h4>
                {readOnly ? <button className="button secondary" type="button" onClick={onEditMode}>Edit</button> : null}
              </div>

              <div className="batch-form-grid">
                <label className="batch-field">
                  <span>Name</span>
                  <input className="input" value={formState.name} disabled={readOnly} onChange={(event) => patchForm({ name: event.target.value })} />
                </label>

                <label className="batch-field">
                  <span>Status</span>
                  <select className="select" value={formState.status} disabled={readOnly} onChange={(event) => patchForm({ status: event.target.value })}>
                    {BATCH_STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>

                <label className="batch-field">
                  <span>Modality</span>
                  <select className="select" value={formState.modality} disabled={readOnly} onChange={(event) => patchForm({ modality: event.target.value })}>
                    <option value="">Select modality</option>
                    {BATCH_MODALITY_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>

                <label className="batch-field">
                  <span>Level</span>
                  <select className="select" value={formState.levelId} disabled={readOnly} onChange={(event) => patchForm({ levelId: event.target.value })}>
                    <option value="">Select level</option>
                    {levels.map((level) => (
                      <option key={level.id} value={level.id}>{level.label}</option>
                    ))}
                  </select>
                </label>

                <label className="batch-field">
                  <span>Max students</span>
                  <input className="input" type="number" min="0" value={formState.maxStudents} disabled={readOnly} onChange={(event) => patchForm({ maxStudents: event.target.value })} />
                </label>

                <label className="batch-field">
                  <span>Duration (mins)</span>
                  <input className="input" type="number" min="0" value={formState.durationMinutes} disabled={readOnly} onChange={(event) => patchForm({ durationMinutes: event.target.value })} />
                </label>
              </div>
            </div>
          ) : null}

          <div className="batch-drawer__section card">
            <div className="batch-drawer__section-header">
              <h4>Teacher assignment</h4>
              <span>{selectedTeachers.size ? `${selectedTeachers.size} selected` : "No teachers assigned"}</span>
            </div>

            <label className="batch-field">
              <span>Primary teacher</span>
              <select
                className="select"
                value={formState.primaryTeacherUserId}
                disabled={readOnly}
                onChange={(event) => patchForm({ primaryTeacherUserId: event.target.value })}
              >
                <option value="">Choose primary teacher</option>
                {teachers
                  .filter((teacher) => selectedTeachers.has(teacher.id) || !selectedTeachers.size)
                  .map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>{teacher.label}</option>
                  ))}
              </select>
            </label>

            <div className="batch-drawer__teacher-list">
              {teachers.map((teacher) => (
                <label key={teacher.id} className={`batch-drawer__teacher-item${selectedTeachers.has(teacher.id) ? " is-selected" : ""}`}>
                  <input
                    type="checkbox"
                    checked={selectedTeachers.has(teacher.id)}
                    disabled={readOnly}
                    onChange={() => toggleTeacher(teacher.id)}
                  />
                  <span>
                    <strong>{teacher.label}</strong>
                    <small>{teacher.email || getTeacherName(teacher.data)}</small>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {readOnly ? null : (
          <div className="batch-drawer__footer">
            <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
            <button
              className="button"
              type="button"
              disabled={saving || !String(formState.name || "").trim()}
              onClick={() => onSubmit(formState)}
            >
              {saving ? "Saving..." : mode === "create" ? "Create batch" : teacherOnly ? "Update teachers" : "Save changes"}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

export { BatchDetailDrawer };