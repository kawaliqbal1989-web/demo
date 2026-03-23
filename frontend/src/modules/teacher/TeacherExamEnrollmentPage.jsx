import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { listMyStudents } from "../../services/teacherPortalService";
import {
  enrollTeacherStudents,
  getTeacherExamEnrollmentList,
  submitTeacherExamEnrollmentList
} from "../../services/examCyclesService";

function TeacherExamEnrollmentPage() {
  const { examCycleId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [list, setList] = useState(null);
  const [myStudents, setMyStudents] = useState([]);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [enrolling, setEnrolling] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);

  const enrolledStudentIds = useMemo(() => {
    const ids = new Set();
    const items = Array.isArray(list?.items) ? list.items : [];
    for (const item of items) {
      const sid = item?.entry?.student?.id || item?.entry?.studentId;
      if (sid) ids.add(sid);
    }
    return ids;
  }, [list]);

  const selectableStudents = useMemo(() => {
    const rows = Array.isArray(myStudents) ? myStudents : [];
    return rows
      .filter((r) => r?.studentId)
      .filter((r) => !enrolledStudentIds.has(r.studentId));
  }, [myStudents, enrolledStudentIds]);

  const canEdit = useMemo(() => {
    const status = String(list?.status || "");
    const locked = Boolean(list?.locked);
    if (status === "REJECTED") return true;
    if (status === "DRAFT") return true;
    if (status === "SUBMITTED_TO_CENTER" && locked) return false;
    return status === "DRAFT";
  }, [list]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [listRes, studentsRes] = await Promise.all([
        getTeacherExamEnrollmentList(examCycleId),
        listMyStudents()
      ]);

      setList(listRes?.data || null);
      setMyStudents(studentsRes?.data || []);
      setSelectedIds(new Set());
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load exam enrollment.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examCycleId]);

  if (loading) {
    return <LoadingState label="Loading exam enrollment..." />;
  }

  const items = Array.isArray(list?.items) ? list.items : [];

  const toggleSelect = (studentId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  const enrollSelected = async () => {
    if (!canEdit || enrolling) return;
    const ids = Array.from(selectedIds);
    if (!ids.length) return;

    setEnrolling(true);
    setError("");
    try {
      await enrollTeacherStudents(examCycleId, { studentIds: ids });
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to enroll students.");
    } finally {
      setEnrolling(false);
    }
  };

  const submitToCenter = async () => {
    if (submitting) return;
    setSubmitConfirmOpen(false);

    setSubmitting(true);
    setError("");
    try {
      await submitTeacherExamEnrollmentList(examCycleId);
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to submit list.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>Exam Enrollment</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Status: <b>{list?.status || ""}</b> {list?.locked ? "(Locked)" : ""}
          </div>
        </div>
        <button className="button secondary" type="button" onClick={() => navigate(-1)} style={{ width: "auto" }}>
          Back
        </button>
      </div>

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 600 }}>Enroll Students</div>
          <div style={{ flex: 1 }} />
          <button
            className="button"
            type="button"
            onClick={() => void enrollSelected()}
            disabled={!canEdit || enrolling || selectedIds.size === 0}
            style={{ width: "auto" }}
          >
            {enrolling ? "Enrolling..." : `Enroll Selected (${selectedIds.size})`}
          </button>
        </div>

        {!canEdit ? (
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Editing is locked (submitted). If higher authority rejects, you can edit again.
          </div>
        ) : null}

        <DataTable
          columns={[
            {
              key: "select",
              header: "",
              render: (r) => (
                <input
                  type="checkbox"
                  checked={selectedIds.has(r.studentId)}
                  onChange={() => toggleSelect(r.studentId)}
                  disabled={!canEdit}
                />
              )
            },
            { key: "admissionNo", header: "Student Code", render: (r) => r.admissionNo || "" },
            { key: "name", header: "Student Name", render: (r) => r.fullName || "" },
            { key: "level", header: "Level", render: (r) => (r.level ? `${r.level.name} / ${r.level.rank}` : "") }
          ]}
          rows={selectableStudents}
          keyField="studentId"
        />
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 600 }}>Enrolled Students</div>
          <div style={{ flex: 1 }} />
          <button
            className="button"
            type="button"
            onClick={() => setSubmitConfirmOpen(true)}
            disabled={submitting || items.length === 0 || String(list?.status || "") === "SUBMITTED_TO_CENTER"}
            style={{ width: "auto" }}
          >
            {submitting ? "Submitting..." : "Submit to Center"}
          </button>
        </div>

        <ConfirmDialog
          open={submitConfirmOpen}
          title="Submit to Center"
          message="Submit this enrollment list to Center? After submission, editing will be locked unless rejected."
          confirmLabel="Submit"
          onConfirm={submitToCenter}
          onCancel={() => setSubmitConfirmOpen(false)}
        />

        <DataTable
          columns={[
            { key: "code", header: "Student Code", render: (r) => r?.entry?.student?.admissionNo || "" },
            {
              key: "student",
              header: "Student Name",
              render: (r) => {
                const s = r?.entry?.student;
                return s ? `${s.firstName} ${s.lastName}`.trim() : "";
              }
            },
            {
              key: "level",
              header: "Level",
              render: (r) => {
                const lvl = r?.entry?.enrolledLevel;
                return lvl ? `${lvl.name} / ${lvl.rank}` : "";
              }
            }
          ]}
          rows={items}
          keyField={(row) => row?.entry?.student?.id || row?.entryId || row?.createdAt}
        />
      </div>
    </section>
  );
}

export { TeacherExamEnrollmentPage };
