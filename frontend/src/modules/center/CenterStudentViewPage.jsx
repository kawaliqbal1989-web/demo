import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { getStudent, getStudentPerformanceSummary, getStudentPromotionStatus, confirmStudentPromotion, assignStudentCourse } from "../../services/studentsService";
import { listCenterAvailableCourses } from "../../services/centerService";
import { resolveAssetUrl } from "../../utils/assetUrls";

const photoFrameStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 10,
  background: "linear-gradient(180deg, var(--color-bg-subtle), var(--color-bg-muted))",
  border: "1px solid var(--color-border-strong)",
  borderRadius: 16,
  boxShadow: "0 8px 24px rgba(0,0,0,0.12)"
};

const studentPhotoStyle = {
  width: 128,
  height: 128,
  objectFit: "contain",
  borderRadius: 12,
  border: "1px solid var(--color-border)",
  background: "var(--color-bg-card)"
};

function CenterStudentViewPage() {
  const { studentId } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [perf, setPerf] = useState(null);
  const [promotion, setPromotion] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [availableCourses, setAvailableCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [assigningCourse, setAssigningCourse] = useState(false);
  const [courseMsg, setCourseMsg] = useState("");

  const resolvePhotoUrl = (value) => {
    return resolveAssetUrl(value);
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [studentRes, perfRes, promoRes] = await Promise.allSettled([
        getStudent(studentId),
        getStudentPerformanceSummary(studentId),
        getStudentPromotionStatus(studentId)
      ]);
      if (studentRes.status === "fulfilled") setData(studentRes.value?.data || null);
      else setError(getFriendlyErrorMessage(studentRes.reason) || "Failed to load student.");
      if (perfRes.status === "fulfilled") setPerf(perfRes.value?.data || null);
      if (promoRes.status === "fulfilled") setPromotion(promoRes.value?.data || null);

      // Load available courses for the center
      try {
        const coursesRes = await listCenterAvailableCourses();
        setAvailableCourses(coursesRes?.data || []);
      } catch (_) { /* non-critical */ }

      // Pre-select the student's current course
      const s = studentRes.status === "fulfilled" ? (studentRes.value?.data?.student || studentRes.value?.data) : null;
      setSelectedCourseId(s?.courseId || s?.course?.id || "");
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load student.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const onConfirmPromotion = async () => {
    setConfirming(true);
    try {
      await confirmStudentPromotion(studentId);
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Promotion failed.");
    } finally {
      setConfirming(false);
    }
  };

  const onAssignCourse = async () => {
    setAssigningCourse(true);
    setCourseMsg("");
    try {
      await assignStudentCourse(studentId, selectedCourseId || null);
      setCourseMsg(selectedCourseId ? "Course assigned successfully." : "Course unassigned.");
      await load();
    } catch (err) {
      setCourseMsg(getFriendlyErrorMessage(err) || "Failed to assign course.");
    } finally {
      setAssigningCourse(false);
    }
  };

  if (loading) return <LoadingState label="Loading student..." />;
  if (!data) return (
    <div className="card">
      <p className="error">{error || "Student not found"}</p>
      <div style={{ marginTop: 8 }}>
        <Link className="button secondary" to="/center/students">Back to Students</Link>
      </div>
    </div>
  );

  const student = data.student || data;
  const perfData = perf?.performance || perf;
  const studentPhotoSrc = resolvePhotoUrl(student?.photoUrl);

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>{(student?.firstName || "") + " " + (student?.lastName || "")}</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{student?.admissionNo || ""}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="button" style={{ width: "auto" }} to={`/center/students/${studentId}/360`}>
            View Full Profile →
          </Link>
          <Link className="button secondary" style={{ width: "auto" }} to="/center/students">
            Back to Students
          </Link>
        </div>
      </div>

      {error ? <div className="card"><p className="error">{error}</p></div> : null}

      <div className="card" style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        {studentPhotoSrc ? (
          <div style={photoFrameStyle}>
            <img src={studentPhotoSrc} alt="Student" style={studentPhotoStyle} />
          </div>
        ) : (
          <div style={{ ...photoFrameStyle, width: 148, height: 148, padding: 0 }}>
            <div style={{ width: 128, height: 128, borderRadius: 12, background: "var(--color-primary)", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 48 }}>
            {(student?.firstName || "?")[0]?.toUpperCase()}
            </div>
          </div>
        )}

        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{(student?.firstName || "") + " " + (student?.lastName || "")}</div>
          <div style={{ color: "var(--color-text-muted)" }}>Admission: {student?.admissionNo || "—"}</div>
          <div style={{ color: "var(--color-text-muted)" }}>Email: {student?.email || "—"}</div>
          <div style={{ color: "var(--color-text-muted)" }}>Phone: {student?.phonePrimary || "—"}</div>
          <div style={{ color: "var(--color-text-muted)" }}>Guardian: {student?.guardianName || "—"} {student?.guardianPhone ? `• ${student.guardianPhone}` : ""}</div>
        </div>
      </div>

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div style={{ fontWeight: 700 }}>Academic Information</div>
        <div className="info-grid">
          <div className="info-grid__label">Center</div>
          <div className="info-grid__value">{student?.centerName || student?.center?.name || "—"}</div>

          <div className="info-grid__label">Level</div>
          <div className="info-grid__value">{student?.level ? `${student.level.name} / ${student.level.rank}` : "—"}</div>

          <div className="info-grid__label">Course</div>
          <div className="info-grid__value">{student?.course ? `${student.course.name} (${student.course.code})` : "—"}</div>

          <div className="info-grid__label">Status</div>
          <div className="info-grid__value">{student?.isActive ? "ACTIVE" : "INACTIVE"}</div>

          <div className="info-grid__label">Enrollments</div>
          <div className="info-grid__value">{(student?.batchEnrollments || []).length}</div>
        </div>
      </div>

      {/* Performance Summary */}
      {perfData && (
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 700 }}>📈 Performance Summary</div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div style={{ textAlign: "center", minWidth: 100, padding: "8px 16px", border: "1px solid var(--color-border)", borderRadius: 8 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#2563eb" }}>
                {perfData.averageAccuracyLast5 != null ? `${perfData.averageAccuracyLast5}%` : "—"}
              </div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Avg Accuracy (Last 5)</div>
            </div>
            <div style={{ textAlign: "center", minWidth: 100, padding: "8px 16px", border: "1px solid var(--color-border)", borderRadius: 8 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#8b5cf6" }}>
                {perfData.bestScore != null ? perfData.bestScore : "—"}
              </div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Best Score</div>
            </div>
            <div style={{ textAlign: "center", minWidth: 100, padding: "8px 16px", border: "1px solid var(--color-border)", borderRadius: 8 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#22c55e" }}>
                {perfData.totalAttempts ?? 0}
              </div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Total Attempts</div>
            </div>
            <div style={{ textAlign: "center", minWidth: 100, padding: "8px 16px", border: "1px solid var(--color-border)", borderRadius: 8 }}>
              <div style={{
                fontSize: 24, fontWeight: 700,
                color: perfData.improvementTrendPercentage > 0 ? "#16a34a" : perfData.improvementTrendPercentage < 0 ? "#dc2626" : "var(--color-text-muted)"
              }}>
                {perfData.improvementTrendPercentage != null
                  ? `${perfData.improvementTrendPercentage > 0 ? "▲" : perfData.improvementTrendPercentage < 0 ? "▼" : "—"} ${Math.abs(perfData.improvementTrendPercentage)}%`
                  : "—"}
              </div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Improvement Trend</div>
            </div>
            {perfData.averageTimePerWorksheet != null && (
              <div style={{ textAlign: "center", minWidth: 100, padding: "8px 16px", border: "1px solid var(--color-border)", borderRadius: 8 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#f59e0b" }}>
                  {perfData.averageTimePerWorksheet} min
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Avg Time / Worksheet</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Promotion Status */}
      {promotion && (
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 700 }}>🎓 Promotion Status</div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ fontSize: 13 }}>
              <span style={{ color: "var(--color-text-muted)" }}>Current Level: </span>
              <span style={{ fontWeight: 600 }}>{promotion.currentLevelName || promotion.currentLevel || "—"}</span>
            </div>
            {promotion.nextLevelName && (
              <div style={{ fontSize: 13 }}>
                <span style={{ color: "var(--color-text-muted)" }}>Next Level: </span>
                <span style={{ fontWeight: 600 }}>{promotion.nextLevelName}</span>
              </div>
            )}
            <div style={{ fontSize: 13 }}>
              <span style={{ color: "var(--color-text-muted)" }}>Eligible: </span>
              <span style={{
                fontWeight: 700,
                color: promotion.eligible || promotion.isEligible ? "#16a34a" : "#dc2626"
              }}>
                {promotion.eligible || promotion.isEligible ? "Yes ✓" : "Not yet"}
              </span>
            </div>
            {(promotion.eligible || promotion.isEligible) && (
              <button
                className="button"
                style={{ width: "auto" }}
                disabled={confirming}
                onClick={onConfirmPromotion}
              >
                {confirming ? "Promoting..." : "Confirm Promotion"}
              </button>
            )}
          </div>
          {promotion.reason && (
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{promotion.reason}</div>
          )}
        </div>
      )}

      {/* Assign Course */}
      {availableCourses.length > 0 && (
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 700 }}>📚 Assign Course</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <select
              className="select"
              style={{ maxWidth: 280 }}
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
            >
              <option value="">— No Course —</option>
              {availableCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
            <button
              className="button"
              style={{ width: "auto" }}
              disabled={assigningCourse}
              onClick={onAssignCourse}
            >
              {assigningCourse ? "Saving…" : "Save Course"}
            </button>
          </div>
          {courseMsg ? <div style={{ fontSize: 12, color: courseMsg.includes("Failed") ? "#dc2626" : "#16a34a" }}>{courseMsg}</div> : null}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link className="button secondary" to={`/center/students/${studentId}/fees`}>💰 Fees</Link>
        <Link className="button secondary" to={`/center/students/${studentId}/notes`}>📝 Notes</Link>
        <Link className="button secondary" to={`/center/students/${studentId}/assign-worksheets`}>📝 Assign Worksheets</Link>
        <Link className="button secondary" to={`/center/students/${studentId}/attendance`}>📅 Attendance</Link>
        <Link className="button" to={`/center/students/${studentId}/change-teacher`}>👩‍🏫 Change Teacher</Link>
      </div>
    </section>
  );
}

export { CenterStudentViewPage };
