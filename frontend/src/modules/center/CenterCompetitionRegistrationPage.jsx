import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { useAuth } from "../../hooks/useAuth";
import { getCompetitionDetail, getCompetitionRegistrations, updateCompetitionRegistrationLevel, updateCompetitionRegistrationTeacher, removeCompetitionRegistration, createCompetitionTemporaryStudent, lockCompetitionCenterRegistration, forwardCompetitionRequest, submitCenterUnlockRequest } from "../../services/competitionsService";
import { CompetitionWorkflowTimeline } from "../../components/CompetitionWorkflowTimeline";
import { listLevels } from "../../services/levelsService";
import { listTeachers } from "../../services/teachersService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

function createIdempotencyKey() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function CenterCompetitionRegistrationPage() {
  const navigate = useNavigate();
  const { competitionId } = useParams();

  const [competition, setCompetition] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [summary, setSummary] = useState(null);
  const [levels, setLevels] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tempFirstName, setTempFirstName] = useState("");
  const [tempLastName, setTempLastName] = useState("");
  const [tempLevelId, setTempLevelId] = useState("");
  const [tempPassword, setTempPassword] = useState("Pass@123");
  const [createdTemp, setCreatedTemp] = useState(null);
  const tempCreateIdempotencyKeyRef = useRef(null);
  const { user } = useAuth();
  const [unlockRequest, setUnlockRequest] = useState(null);

  const resetTempCreateIdempotencyKey = () => {
    tempCreateIdempotencyKeyRef.current = null;
  };

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [competitionResponse, registrationsResponse, levelsResponse, teachersResponse] = await Promise.all([
        getCompetitionDetail(competitionId),
        getCompetitionRegistrations(competitionId),
        listLevels({ limit: 100, offset: 0 }),
        listTeachers({ limit: 500, offset: 0, status: "ACTIVE" })
      ]);

      setCompetition(competitionResponse?.data || null);
      const registrationsPayload = Array.isArray(registrationsResponse?.data?.registrations)
        ? registrationsResponse.data.registrations
        : [];
      setRegistrations(registrationsPayload);
      setSummary(registrationsResponse?.data?.summary || null);
      setLevels(Array.isArray(levelsResponse?.data?.items) ? levelsResponse.data.items : []);
      setTeachers(Array.isArray(teachersResponse?.data?.items) ? teachersResponse.data.items : []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load competition registrations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [competitionId]);

  const isEnrollmentClosed = useMemo(() => {
    const now = new Date();
    const end = competition?.registrationEndsAt ? new Date(competition.registrationEndsAt) : null;
    return Boolean(end && now > end);
  }, [competition]);

  // Only allow center edits while competition is in CENTER_REVIEW and enrollment open
  const centerStageEditable = competition?.workflowStage === "CENTER_REVIEW";
  const canEdit = centerStageEditable && !isEnrollmentClosed;

  const filteredRegistrations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return registrations.filter((row) => {
      const studentName = `${row?.student?.firstName || ""} ${row?.student?.lastName || ""}`.toLowerCase();
      const teacherName = `${row?.student?.currentTeacher?.teacherProfile?.fullName || ""} ${row?.student?.currentTeacher?.username || ""}`.toLowerCase();
      const matchesSearch = !query || studentName.includes(query) || row?.student?.admissionNo?.toLowerCase().includes(query);
      const matchesTeacher = teacherFilter === "all" || teacherName.includes(teacherFilter.toLowerCase());
      const matchesLevel = levelFilter === "all" || row?.competitionLevel?.id === levelFilter;
      const matchesStatus = statusFilter === "all" || String(row?.registrationStatus || "").toLowerCase() === statusFilter.toLowerCase();
      return matchesSearch && matchesTeacher && matchesLevel && matchesStatus;
    });
  }, [registrations, search, teacherFilter, levelFilter, statusFilter]);

  const teacherOptions = useMemo(() => {
    const seen = new Set();
    return registrations.reduce((acc, row) => {
      const name = row?.student?.currentTeacher?.teacherProfile?.fullName || row?.student?.currentTeacher?.username || "Unknown";
      if (!seen.has(name)) {
        seen.add(name);
        acc.push(name);
      }
      return acc;
    }, []);
  }, [registrations]);

  useEffect(() => {
    if (competition?.id) loadUnlockRequestFromLocal();
  }, [competition?.id]);

  const handleLevelChange = async (registrationId, levelId) => {
    if (!canEdit || saving) return;
    setSaving(true);
    setError("");
    try {
      await updateCompetitionRegistrationLevel(competitionId, registrationId, { levelId });
      toast.success("Competition level updated.");
      await loadData();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to update competition level.");
    } finally {
      setSaving(false);
    }
  };

  const handleTeacherChange = async (registrationId, teacherUserId) => {
    if (!canEdit || saving) return;
    setSaving(true);
    setError("");
    try {
      await updateCompetitionRegistrationTeacher(competitionId, registrationId, { teacherUserId: teacherUserId || null });
      toast.success("Teacher updated.");
      await loadData();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to update teacher.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (registrationId) => {
    if (!canEdit || saving) return;
    setSaving(true);
    setError("");
    try {
      await removeCompetitionRegistration(competitionId, registrationId);
      toast.success("Student removed from competition.");
      await loadData();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to remove registration.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTemporary = async () => {
    if (!canEdit || saving) return;
    if (!tempCreateIdempotencyKeyRef.current) {
      tempCreateIdempotencyKeyRef.current = createIdempotencyKey();
    }
    setSaving(true);
    setError("");
    try {
      const response = await createCompetitionTemporaryStudent(competitionId, {
        firstName: tempFirstName,
        lastName: tempLastName,
        levelId: tempLevelId,
        password: tempPassword,
        idempotencyKey: tempCreateIdempotencyKeyRef.current
      });
      setCreatedTemp(response?.data || null);
      toast.success("Temporary student created.");
      setTempFirstName("");
      setTempLastName("");
      setTempPassword("Pass@123");
      resetTempCreateIdempotencyKey();
      await loadData();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to create temporary student.");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitToFranchise = async () => {
    if (saving) return;
    setError("");

    if (isEnrollmentClosed) {
      setError("Enrollment window has closed. Cannot submit.");
      return;
    }
    if (!registrations.length) {
      setError("At least one student must be registered before submission.");
      return;
    }
    const missingLevel = registrations.find((r) => !r?.competitionLevel?.id);
    if (missingLevel) {
      setError("All registrations must have a competition level selected.");
      return;
    }

    setSaving(true);
    try {
      await forwardCompetitionRequest(competitionId);
      toast.success("Submitted to franchise.");
      await loadData();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to submit to franchise.");
    } finally {
      setSaving(false);
    }
  };

  const loadUnlockRequestFromLocal = () => {
    try {
      const key = `unlockRequest:${competitionId}`;
      const v = localStorage.getItem(key);
      if (v) setUnlockRequest(JSON.parse(v));
      else setUnlockRequest(null);
    } catch (e) {
      setUnlockRequest(null);
    }
  };

  const handleRequestUnlock = async (reason = "Requesting center unlock") => {
    if (saving) return;
    setError("");
    setSaving(true);
    try {
      // Try server endpoint first (may not exist)
      await submitCenterUnlockRequest(competitionId, { reason });
      toast.success("Unlock request submitted to server.");
      await loadData();
    } catch (err) {
      // Fallback: store unlock request locally
      const request = {
        competitionId,
        reason,
        createdAt: new Date().toISOString(),
        createdBy: user?.email || user?.username || (user && user.id) || "unknown"
      };
      try {
        localStorage.setItem(`unlockRequest:${competitionId}`, JSON.stringify(request));
        setUnlockRequest(request);
        toast.success("Unlock request recorded locally.");
      } catch (e) {
        setError("Failed to record unlock request.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleLock = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await lockCompetitionCenterRegistration(competitionId);
      toast.success("Center registration locked.");
      await loadData();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to lock center registration.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingState label="Loading competition registrations..." />;
  }

  if (!competition) {
    return <EmptyState icon="⚠️" title="Competition not found" description={error || "The selected competition could not be loaded."} />;
  }

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div className="card" style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>Center Competition Workspace</div>
            <h2 style={{ margin: "4px 0 0" }}>Center Competition Registration Workspace</h2>
            <div style={{ color: "var(--color-text-muted)", marginTop: 4 }}>{competition.title || "—"}</div>
            <div style={{ marginTop: 8 }}>
              <CompetitionWorkflowTimeline competition={competition} />
            </div>
          </div>
          <button className="button secondary" type="button" onClick={() => navigate(-1)} style={{ width: "auto" }}>
            Back
          </button>
        </div>

        {error ? <div className="error">{error}</div> : null}

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--color-text-muted)" }}>Competition Name</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6 }}>{competition.title || "—"}</div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--color-text-muted)" }}>Competition Code</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6 }}>{competition.code || "—"}</div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--color-text-muted)" }}>Enrollment Window</div>
            <div style={{ fontSize: 14, marginTop: 6 }}>{competition.registrationStartsAt ? new Date(competition.registrationStartsAt).toLocaleString() : "—"} → {competition.registrationEndsAt ? new Date(competition.registrationEndsAt).toLocaleString() : "—"}</div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--color-text-muted)" }}>Competition Window</div>
            <div style={{ fontSize: 14, marginTop: 6 }}>{competition.startsAt ? new Date(competition.startsAt).toLocaleString() : "—"} → {competition.endsAt ? new Date(competition.endsAt).toLocaleString() : "—"}</div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--color-text-muted)" }}>Total Teachers</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>{summary?.totalTeachers ?? registrations.length}</div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--color-text-muted)" }}>Total Registered Students</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>{summary?.totalStudents ?? registrations.length}</div>
          </div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Competition Level Summary</div>
          {summary?.levelSummary?.length ? (
            <div style={{ display: "grid", gap: 8 }}>
              {summary.levelSummary.map((item) => (
                <div key={item.levelId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{item.levelName || item.levelId}</span>
                  <span style={{ fontWeight: 700 }}>{item.studentCount ?? 0}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: "var(--color-text-muted)" }}>No level summary available.</div>
          )}
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Registration Summary</div>
            <div style={{ display: "flex", gap: 8 }}>
              {competition?.workflowStage === "CENTER_REVIEW" && !isEnrollmentClosed ? (
                <button className="button primary" type="button" onClick={handleSubmitToFranchise} disabled={saving}>
                  {saving ? "Submitting..." : "Submit to Franchise"}
                </button>
              ) : null}
              {competition?.workflowStage !== "CENTER_REVIEW" ? (
                <button className="button secondary" type="button" onClick={() => void handleRequestUnlock()} disabled={saving || Boolean(unlockRequest)}>
                  {unlockRequest ? "Unlock Requested" : "Request Unlock"}
                </button>
              ) : null}
            </div>
          </div>

          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Teachers</div>
                <div style={{ fontWeight: 700 }}>{(summary?.totalTeachers ?? registrations.reduce((s, r) => { s.add(r?.student?.currentTeacher?.teacherProfile?.fullName || r?.student?.currentTeacher?.username || "Unknown"); return s; }, new Set()).size) || 0}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Registered Students</div>
                <div style={{ fontWeight: 700 }}>{summary?.totalStudents ?? registrations.length}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Temporary Students</div>
                <div style={{ fontWeight: 700 }}>{(registrations || []).filter(r => r?.student?.isTemporary).length}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Total Registrations</div>
                <div style={{ fontWeight: 700 }}>{registrations.length}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Draft Registrations</div>
                <div style={{ fontWeight: 700 }}>{(registrations || []).filter(r => (r.registrationStatus || "").toUpperCase() === "PENDING").length}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Submitted Registrations</div>
                <div style={{ fontWeight: 700 }}>{(registrations || []).filter(r => (r.registrationStatus || "").toUpperCase() === "ACTIVE").length}</div>
              </div>
            </div>



            {unlockRequest ? (
              <div style={{ marginTop: 8, padding: 8, background: "var(--color-bg-warning-light)", borderRadius: 6 }}>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Unlock Request</div>
                <div style={{ fontWeight: 700 }}>{unlockRequest.reason}</div>
                <div style={{ fontSize: 13, marginTop: 6 }}>Requested At: {new Date(unlockRequest.createdAt).toLocaleString()}</div>
                <div style={{ fontSize: 13 }}>Requested By: {unlockRequest.createdBy}</div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="card" style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 700 }}>Registration Table</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {!isEnrollmentClosed ? (
                <button className="button" type="button" onClick={handleLock} disabled={saving} style={{ width: "auto" }}>
                  {saving ? "Locking..." : "Lock Center Registration"}
                </button>
              ) : null}
            </div>
          </div>

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <input className="input" placeholder="Search Student" value={search} onChange={(event) => setSearch(event.target.value)} />
            <select className="input" value={teacherFilter} onChange={(event) => setTeacherFilter(event.target.value)}>
              <option value="all">Filter by Teacher</option>
              {teacherOptions.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <select className="input" value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)}>
              <option value="all">Filter by Competition Level</option>
              {levels.map((level) => <option key={level.id} value={level.id}>{level.name} / {level.rank}</option>)}
            </select>
            <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Filter by Registration Status</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="PENDING">PENDING</option>
              <option value="REMOVED">REMOVED</option>
            </select>
          </div>

          <div className="card" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                  <th style={{ padding: 10 }}>Teacher</th>
                  <th style={{ padding: 10 }}>Student</th>
                  <th style={{ padding: 10 }}>Student ID</th>
                  <th style={{ padding: 10 }}>Academic Level</th>
                  <th style={{ padding: 10 }}>Competition Level</th>
                  <th style={{ padding: 10 }}>Registration Status</th>
                  <th style={{ padding: 10 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRegistrations.map((row) => (
                  <tr key={row.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: 10 }}>
                      <select
                        className="input"
                        value={row?.student?.currentTeacher?.id || ""}
                        onChange={(event) => void handleTeacherChange(row.id, event.target.value)}
                        disabled={!canEdit || saving}
                      >
                        <option value="">Unassigned</option>
                        {teachers.map((teacher) => (
                          <option key={teacher.id} value={teacher.id}>
                            {teacher?.teacherProfile?.fullName || teacher.username || teacher.email}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: 10 }}>{`${row?.student?.firstName || ""} ${row?.student?.lastName || ""}`.trim() || "—"}</td>
                    <td style={{ padding: 10 }}>{row?.student?.admissionNo || "—"}</td>
                    <td style={{ padding: 10 }}>{row?.academicLevel?.name || row?.level?.name || "—"}</td>
                    <td style={{ padding: 10 }}>
                      <select
                        className="input"
                        value={row?.competitionLevel?.id || ""}
                        onChange={(event) => void handleLevelChange(row.id, event.target.value)}
                        disabled={!canEdit || saving}
                      >
                        {levels.map((level) => <option key={level.id} value={level.id}>{level.name} / {level.rank}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: 10 }}>{row?.registrationStatus || "—"}</td>
                    <td style={{ padding: 10 }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="button secondary" type="button" onClick={() => void handleRemove(row.id)} disabled={!canEdit || saving} style={{ width: "auto", fontSize: 12 }}>
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 700 }}>Add Temporary Student</div>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", alignItems: "end" }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--color-text-muted)", marginBottom: 6 }}>First Name</label>
              <input className="input" value={tempFirstName} onChange={(event) => { resetTempCreateIdempotencyKey(); setTempFirstName(event.target.value); }} disabled={!canEdit || saving} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--color-text-muted)", marginBottom: 6 }}>Last Name</label>
              <input className="input" value={tempLastName} onChange={(event) => { resetTempCreateIdempotencyKey(); setTempLastName(event.target.value); }} disabled={!canEdit || saving} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--color-text-muted)", marginBottom: 6 }}>Level</label>
              <select className="input" value={tempLevelId} onChange={(event) => { resetTempCreateIdempotencyKey(); setTempLevelId(event.target.value); }} disabled={!canEdit || saving}>
                <option value="">Select level</option>
                {levels.map((level) => <option key={level.id} value={level.id}>{level.name} / {level.rank}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--color-text-muted)", marginBottom: 6 }}>Password</label>
              <input className="input" value={tempPassword} onChange={(event) => { resetTempCreateIdempotencyKey(); setTempPassword(event.target.value); }} disabled={!canEdit || saving} />
            </div>
            <button className="button" type="button" onClick={() => void handleCreateTemporary()} disabled={!canEdit || saving} style={{ width: "auto" }}>
              {saving ? "Creating..." : "Create Temporary Student"}
            </button>
          </div>
          {createdTemp ? (
            <div className="card" style={{ padding: 12, background: "var(--color-bg-info-light)" }}>
              <div style={{ fontWeight: 700 }}>Temporary Student Credentials</div>
              <div style={{ marginTop: 6 }}>Username: {createdTemp?.user?.username || "—"}</div>
              <div>Password: {createdTemp?.password || "—"}</div>
            </div>
          ) : null}
        </div>


      </div>
    </section>
  );
}

export { CenterCompetitionRegistrationPage };
