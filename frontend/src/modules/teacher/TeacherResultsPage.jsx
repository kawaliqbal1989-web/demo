import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { downloadBlob } from "../../utils/downloadBlob";
import { generateLeaderboardPdf } from "../../utils/pdfExport";
import { createStudentNote, getStudent360, listMyStudents, listStudentNotes, updateNote } from "../../services/teacherPortalService";

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function formatCourseLevel(row) {
  const courseCode = row?.course?.code || "-";
  const levelRank = row?.level?.rank || row?.level?.name || "-";
  return `${courseCode} / ${levelRank}`;
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getDaysSince(dateValue) {
  if (!dateValue) return null;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

function normalizeReasonBadge(reason) {
  const text = String(reason || "").toLowerCase();
  if (!text) return null;
  if (text.includes("attendance")) return "Attendance Below Threshold";
  if (text.includes("score") || text.includes("accuracy") || text.includes("average")) return "Average Score Too Low";
  if (text.includes("worksheet") || text.includes("completion")) return "Worksheet Completion Pending";
  if (text.includes("practice")) return "Insufficient Practice";
  if (text.includes("exam") || text.includes("test")) return "Exam Requirement Pending";
  return reason;
}

function buildPromotionRow(row, student360) {
  const promotion = student360?.promotion || null;
  const metrics = promotion?.metrics || {};

  const averageScore = toNumberOrNull(row?.averageScore);
  const attendance = toNumberOrNull(row?.attendancePercent) ?? toNumberOrNull(student360?.attendance?.last30?.rate);
  const completion = toNumberOrNull(row?.worksheetCompletionPercent);
  const daysSinceActivity = toNumberOrNull(student360?.engagement?.daysSinceLastActivity) ?? getDaysSince(row?.latestAttemptAt);

  const reasons = Array.isArray(promotion?.reasons) ? promotion.reasons : [];
  const missingRequirements = reasons
    .map((reason) => normalizeReasonBadge(reason))
    .filter((v) => Boolean(v));

  const readinessComponents = [];
  if (averageScore !== null) readinessComponents.push(Math.max(0, Math.min(100, averageScore)));
  if (attendance !== null) readinessComponents.push(Math.max(0, Math.min(100, attendance)));
  if (completion !== null) readinessComponents.push(Math.max(0, Math.min(100, completion)));
  if (toNumberOrNull(metrics?.consistencyScore) !== null) readinessComponents.push(Math.max(0, Math.min(100, toNumberOrNull(metrics.consistencyScore))));

  const readinessPercent = readinessComponents.length
    ? Number((readinessComponents.reduce((sum, n) => sum + n, 0) / readinessComponents.length).toFixed(1))
    : 0;

  const eligible = promotion?.eligible === true;
  const status = eligible
    ? "Ready"
    : (readinessPercent >= 75 && missingRequirements.length <= 2 ? "Almost Ready" : "Not Ready");

  const blocked = status === "Not Ready" && missingRequirements.length >= 3;
  const expectedNextWeek = status === "Almost Ready" && missingRequirements.length <= 2;

  return {
    studentId: row.studentId,
    studentName: row.fullName || row.admissionNo || "Student",
    batchName: student360?.student?.batch?.name || row?.batchName || "-",
    currentLevel: row?.level?.name || row?.level?.rank || student360?.student?.level?.name || "-",
    averageScore,
    attendance,
    worksheetCompletion: completion,
    status,
    readinessPercent,
    missingRequirements,
    reasons,
    promotion,
    daysSinceActivity,
    blocked,
    expectedNextWeek
  };
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function buildDashboardText(summaryCards, rows) {
  const lines = [
    "Promotion Readiness Dashboard",
    "",
    `Total Students: ${summaryCards.totalStudents}`,
    `Ready for Promotion: ${summaryCards.readyCount}`,
    `Almost Ready: ${summaryCards.almostReadyCount}`,
    `Not Ready: ${summaryCards.notReadyCount}`,
    `Average Readiness %: ${summaryCards.avgReadiness.toFixed(1)}%`,
    `Missing Attendance: ${summaryCards.missingAttendanceCount}`,
    `Missing Score: ${summaryCards.missingScoreCount}`,
    `Missing Worksheet Completion: ${summaryCards.missingCompletionCount}`,
    "",
    "Students:",
    ...rows.map((r) => `${r.studentName} | ${r.status} | ${r.readinessPercent.toFixed(1)}% | ${r.missingRequirements.join(", ") || "No missing requirements"}`)
  ];
  return lines.join("\n");
}

const PARENT_MEETING_NOTE_PREFIX = "[PARENT_MEETING_V1]";

function toIsoDateOnly(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function parseParentMeetingNote(note) {
  const text = String(note || "");
  if (!text.startsWith(PARENT_MEETING_NOTE_PREFIX)) return null;

  const json = text.slice(PARENT_MEETING_NOTE_PREFIX.length).trim();
  if (!json) return null;

  try {
    const payload = JSON.parse(json);
    if (!payload || typeof payload !== "object") return null;
    return payload;
  } catch (_err) {
    return null;
  }
}

function formatParentMeetingNote(payload) {
  return `${PARENT_MEETING_NOTE_PREFIX} ${JSON.stringify(payload)}`;
}

function getFollowUpStatus(meeting) {
  const completedAt = meeting?.followUpCompletedAt;
  const followUpDate = meeting?.followUpDate;

  if (completedAt) return { label: "Completed", color: "#16a34a" };
  if (!followUpDate) return { label: "No Follow-up", color: "#6b7280" };

  const due = new Date(`${followUpDate}T23:59:59.999`);
  if (Number.isNaN(due.getTime())) return { label: "No Follow-up", color: "#6b7280" };

  if (Date.now() > due.getTime()) return { label: "Overdue", color: "#dc2626" };
  return { label: "Upcoming", color: "#ca8a04" };
}

function buildMeetingHistory(noteItems) {
  const items = [];

  for (const note of Array.isArray(noteItems) ? noteItems : []) {
    const payload = parseParentMeetingNote(note?.note);
    if (!payload) continue;

    const meetingDate = payload.meetingDate || toIsoDateOnly(note?.createdAt);
    const followUpDate = payload.followUpDate || "";
    const followUpCompletedAt = payload.followUpCompletedAt || "";
    const status = getFollowUpStatus({ followUpDate, followUpCompletedAt });

    items.push({
      id: note.id,
      noteId: note.id,
      meetingDate,
      meetingType: payload.meetingType || "Phone",
      summary: payload.meetingNotes || "",
      discussedIssues: payload.topicsDiscussed || "",
      agreedActions: payload.agreedActions || "",
      followUpDate,
      followUpCompletedAt,
      status,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      raw: payload
    });
  }

  const toSortTs = (value) => {
    const d = new Date(`${String(value || "")}T00:00:00`);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  };

  return items.sort((a, b) => toSortTs(b.meetingDate) - toSortTs(a.meetingDate));
}

function buildMeetingTimelineEvents(meetings) {
  const events = [];
  for (const m of meetings) {
    if (m.meetingDate) {
      events.push({
        id: `meeting-${m.id}`,
        date: m.meetingDate,
        title: "Parent Meeting",
        detail: `${m.meetingType} • ${m.summary || "Summary unavailable"}`
      });
    }
    if (m.followUpCompletedAt) {
      events.push({
        id: `meeting-followup-${m.id}`,
        date: m.followUpCompletedAt,
        title: "Follow-up Completed",
        detail: `${m.meetingType} follow-up closed`
      });
    }
  }

  return events;
}

function formatMeetingHistoryText(studentName, meetings) {
  const lines = [
    `Parent Meeting History - ${studentName}`,
    ""
  ];

  for (const m of meetings) {
    lines.push(`Date: ${m.meetingDate || "-"}`);
    lines.push(`Type: ${m.meetingType || "-"}`);
    lines.push(`Summary: ${m.summary || "-"}`);
    lines.push(`Discussed Issues: ${m.discussedIssues || "-"}`);
    lines.push(`Agreed Actions: ${m.agreedActions || "-"}`);
    lines.push(`Next Follow-up Date: ${m.followUpDate || "-"}`);
    lines.push(`Status: ${m.status?.label || "No Follow-up"}`);
    lines.push("");
  }

  if (!meetings.length) {
    lines.push("No parent meetings recorded.");
  }

  return lines.join("\n");
}

function TeacherResultsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [limit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [student360ById, setStudent360ById] = useState({});
  const [student360LoadingById, setStudent360LoadingById] = useState({});
  const [expandedByStudentId, setExpandedByStudentId] = useState({});
  const [notesByStudentId, setNotesByStudentId] = useState({});
  const [notesLoadingByStudentId, setNotesLoadingByStudentId] = useState({});
  const [meetingFilterByStudentId, setMeetingFilterByStudentId] = useState({});
  const [meetingDraftByStudentId, setMeetingDraftByStudentId] = useState({});
  const [meetingEditIdByStudentId, setMeetingEditIdByStudentId] = useState({});
  const [meetingSavingByStudentId, setMeetingSavingByStudentId] = useState({});
  const [statusFilter, setStatusFilter] = useState("all");
  const [copyState, setCopyState] = useState("");

  const load = async (query = "") => {
    setLoading(true);
    setError("");
    try {
      const data = await listMyStudents({ q: query });
      setRows(Array.isArray(data?.data) ? data.data : []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load student results.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setOffset(0);
    const timeout = setTimeout(() => {
      void load(search);
    }, 250);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const ensureStudent360 = async (studentId) => {
    if (!studentId || student360ById[studentId] || student360LoadingById[studentId]) return;

    setStudent360LoadingById((prev) => ({ ...prev, [studentId]: true }));
    try {
      const result = await getStudent360(studentId);
      const payload = result?.data ?? result ?? null;
      setStudent360ById((prev) => ({ ...prev, [studentId]: payload }));
    } catch (err) {
      setStudent360ById((prev) => ({ ...prev, [studentId]: { __error: getFriendlyErrorMessage(err) || "Failed to load Student 360" } }));
    } finally {
      setStudent360LoadingById((prev) => ({ ...prev, [studentId]: false }));
    }
  };

  const ensureMeetingNotes = async (studentId) => {
    if (!studentId || notesByStudentId[studentId] || notesLoadingByStudentId[studentId]) return;

    setNotesLoadingByStudentId((prev) => ({ ...prev, [studentId]: true }));
    try {
      const result = await listStudentNotes(studentId, { limit: 200, offset: 0 });
      const items = result?.data?.items || [];
      setNotesByStudentId((prev) => ({ ...prev, [studentId]: items }));
    } catch (_err) {
      setNotesByStudentId((prev) => ({ ...prev, [studentId]: [] }));
    } finally {
      setNotesLoadingByStudentId((prev) => ({ ...prev, [studentId]: false }));
    }
  };

  const refreshMeetingNotes = async (studentId) => {
    if (!studentId) return;
    setNotesLoadingByStudentId((prev) => ({ ...prev, [studentId]: true }));
    try {
      const result = await listStudentNotes(studentId, { limit: 200, offset: 0 });
      const items = result?.data?.items || [];
      setNotesByStudentId((prev) => ({ ...prev, [studentId]: items }));
    } catch (_err) {
      // Keep previous cache if refresh fails.
    } finally {
      setNotesLoadingByStudentId((prev) => ({ ...prev, [studentId]: false }));
    }
  };

  const promotionRows = useMemo(
    () => rows.map((row) => buildPromotionRow(row, student360ById[row.studentId] || null)),
    [rows, student360ById]
  );

  const filteredRows = useMemo(() => {
    if (statusFilter === "all") return promotionRows;
    if (statusFilter === "ready") return promotionRows.filter((r) => r.status === "Ready");
    if (statusFilter === "almost") return promotionRows.filter((r) => r.status === "Almost Ready");
    if (statusFilter === "not-ready") return promotionRows.filter((r) => r.status === "Not Ready");
    if (statusFilter === "low-attendance") return promotionRows.filter((r) => r.missingRequirements.includes("Attendance Below Threshold"));
    if (statusFilter === "low-score") return promotionRows.filter((r) => r.missingRequirements.includes("Average Score Too Low"));
    if (statusFilter === "low-completion") return promotionRows.filter((r) => r.missingRequirements.includes("Worksheet Completion Pending"));
    return promotionRows;
  }, [promotionRows, statusFilter]);

  const total = filteredRows.length;
  const pageRows = filteredRows.slice(offset, offset + limit);

  const summaryCards = useMemo(() => {
    const totalStudents = promotionRows.length;
    const readyCount = promotionRows.filter((r) => r.status === "Ready").length;
    const almostReadyCount = promotionRows.filter((r) => r.status === "Almost Ready").length;
    const notReadyCount = promotionRows.filter((r) => r.status === "Not Ready").length;
    const avgReadiness = totalStudents
      ? Number((promotionRows.reduce((sum, r) => sum + r.readinessPercent, 0) / totalStudents).toFixed(1))
      : 0;

    const missingAttendanceCount = promotionRows.filter((r) => r.missingRequirements.includes("Attendance Below Threshold")).length;
    const missingScoreCount = promotionRows.filter((r) => r.missingRequirements.includes("Average Score Too Low")).length;
    const missingCompletionCount = promotionRows.filter((r) => r.missingRequirements.includes("Worksheet Completion Pending")).length;

    return {
      totalStudents,
      readyCount,
      almostReadyCount,
      notReadyCount,
      avgReadiness,
      missingAttendanceCount,
      missingScoreCount,
      missingCompletionCount
    };
  }, [promotionRows]);

  const bulkView = useMemo(() => {
    const readyToday = promotionRows.filter((r) => r.status === "Ready").length;
    const expectedNextWeek = promotionRows.filter((r) => r.expectedNextWeek).length;
    const blocked = promotionRows.filter((r) => r.blocked).length;
    return { readyToday, expectedNextWeek, blocked };
  }, [promotionRows]);

  const exportRows = filteredRows;

  if (loading) {
    return <LoadingState label="Loading student results..." />;
  }

  const handleCopy = async () => {
    const text = buildDashboardText(summaryCards, exportRows);
    let ok = false;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch (_err) {
      ok = false;
    }
    if (!ok) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        ok = document.execCommand("copy");
      } catch (_err) {
        ok = false;
      }
      document.body.removeChild(ta);
    }
    setCopyState(ok ? "Copied" : "Copy failed");
    setTimeout(() => setCopyState(""), 1500);
  };

  const handlePrint = () => {
    const text = buildDashboardText(summaryCards, exportRows)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const popup = window.open("", "_blank", "noopener,noreferrer,width=1000,height=700");
    if (!popup) return;
    popup.document.write(`<!doctype html><html><head><title>Promotion Readiness Dashboard</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#111827}pre{white-space:pre-wrap;line-height:1.45;font-size:13px}</style></head><body><pre>${text}</pre></body></html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const handleExportPdf = () => {
    const doc = generateLeaderboardPdf({
      title: "Promotion Readiness Dashboard",
      rows: exportRows.map((row, idx) => ({
        rank: idx + 1,
        studentName: row.studentName,
        avgScore: row.readinessPercent,
        totalWorksheets: row.status
      }))
    });
    doc.save("Promotion_Readiness_Dashboard.pdf");
  };

  const handleExportCsv = () => {
    const headers = [
      "Student",
      "Batch",
      "Current Level",
      "Average Score",
      "Attendance",
      "Worksheet Completion",
      "Promotion Status",
      "Readiness %",
      "Missing Requirements"
    ];

    const lines = [headers.map(csvEscape).join(",")];
    for (const row of exportRows) {
      lines.push([
        row.studentName,
        row.batchName,
        row.currentLevel,
        row.averageScore === null ? "" : row.averageScore,
        row.attendance === null ? "" : row.attendance,
        row.worksheetCompletion === null ? "" : row.worksheetCompletion,
        row.status,
        row.readinessPercent,
        row.missingRequirements.join("; ")
      ].map(csvEscape).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, "promotion_readiness_dashboard.csv");
  };

  const toggleExpand = (studentId) => {
    setExpandedByStudentId((prev) => ({ ...prev, [studentId]: !prev[studentId] }));
    void ensureStudent360(studentId);
    void ensureMeetingNotes(studentId);
  };

  const updateMeetingDraft = (studentId, patch) => {
    setMeetingDraftByStudentId((prev) => ({
      ...prev,
      [studentId]: {
        meetingDate: toIsoDateOnly(new Date().toISOString()),
        meetingType: "Phone",
        meetingNotes: "",
        topicsDiscussed: "",
        agreedActions: "",
        followUpDate: "",
        ...prev[studentId],
        ...patch
      }
    }));
  };

  const beginEditMeeting = (studentId, meeting) => {
    setMeetingEditIdByStudentId((prev) => ({ ...prev, [studentId]: meeting.noteId }));
    updateMeetingDraft(studentId, {
      meetingDate: meeting.meetingDate || toIsoDateOnly(new Date().toISOString()),
      meetingType: meeting.meetingType || "Phone",
      meetingNotes: meeting.summary || "",
      topicsDiscussed: meeting.discussedIssues || "",
      agreedActions: meeting.agreedActions || "",
      followUpDate: meeting.followUpDate || ""
    });
  };

  const resetDraft = (studentId) => {
    setMeetingEditIdByStudentId((prev) => ({ ...prev, [studentId]: null }));
    setMeetingDraftByStudentId((prev) => ({
      ...prev,
      [studentId]: {
        meetingDate: toIsoDateOnly(new Date().toISOString()),
        meetingType: "Phone",
        meetingNotes: "",
        topicsDiscussed: "",
        agreedActions: "",
        followUpDate: ""
      }
    }));
  };

  const saveMeeting = async (studentId) => {
    const draft = meetingDraftByStudentId[studentId] || {};
    if (!String(draft.meetingNotes || "").trim()) return;

    setMeetingSavingByStudentId((prev) => ({ ...prev, [studentId]: true }));
    try {
      const payload = {
        meetingDate: draft.meetingDate || toIsoDateOnly(new Date().toISOString()),
        meetingType: draft.meetingType || "Phone",
        meetingNotes: String(draft.meetingNotes || "").trim(),
        topicsDiscussed: String(draft.topicsDiscussed || "").trim(),
        agreedActions: String(draft.agreedActions || "").trim(),
        followUpDate: draft.followUpDate || "",
        followUpCompletedAt: ""
      };

      const editId = meetingEditIdByStudentId[studentId];
      if (editId) {
        await updateNote(editId, { note: formatParentMeetingNote(payload) });
      } else {
        await createStudentNote(studentId, { note: formatParentMeetingNote(payload) });
      }

      resetDraft(studentId);
      await refreshMeetingNotes(studentId);
    } catch (_err) {
      // Keep draft and fail silently in section-level UX.
    } finally {
      setMeetingSavingByStudentId((prev) => ({ ...prev, [studentId]: false }));
    }
  };

  const markFollowUpComplete = async (studentId, meeting) => {
    if (!meeting?.noteId) return;
    setMeetingSavingByStudentId((prev) => ({ ...prev, [studentId]: true }));
    try {
      const nextPayload = {
        ...(meeting.raw || {}),
        followUpCompletedAt: new Date().toISOString()
      };
      await updateNote(meeting.noteId, { note: formatParentMeetingNote(nextPayload) });
      await refreshMeetingNotes(studentId);
    } catch (_err) {
      // Ignore and keep current state.
    } finally {
      setMeetingSavingByStudentId((prev) => ({ ...prev, [studentId]: false }));
    }
  };

  const copyMeetingSummary = async (studentName, meetings) => {
    const text = formatMeetingHistoryText(studentName, meetings);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch (_err) {
      // Fallback below.
    }

    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  };

  const printMeetingSummary = (studentName, meetings) => {
    const escaped = formatMeetingHistoryText(studentName, meetings)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const popup = window.open("", "_blank", "noopener,noreferrer,width=920,height=700");
    if (!popup) return;
    popup.document.write(`<!doctype html><html><head><title>Parent Meeting History</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#111827}h2{margin:0 0 10px 0}pre{white-space:pre-wrap;line-height:1.45;font-size:13px}</style></head><body><h2>Parent Meeting History - ${studentName}</h2><pre>${escaped}</pre></body></html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Promotion Readiness Dashboard</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Promotion planning view for students assigned to you.
          </div>
        </div>
        <Link className="button secondary" style={{ width: "auto" }} to="/teacher/students">
          Open Assigned Students
        </Link>
      </div>

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Search student code or name</div>
        <input
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search student code or name"
        />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            { key: "all", label: "All" },
            { key: "ready", label: "Ready" },
            { key: "almost", label: "Almost Ready" },
            { key: "not-ready", label: "Not Ready" },
            { key: "low-attendance", label: "Low Attendance" },
            { key: "low-score", label: "Low Score" },
            { key: "low-completion", label: "Low Completion" }
          ].map((f) => (
            <button
              key={f.key}
              className="button secondary"
              style={{ width: "auto" }}
              onClick={() => {
                setStatusFilter(f.key);
                setOffset(0);
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
          {[
            { label: "Total Students", value: String(summaryCards.totalStudents) },
            { label: "Ready for Promotion", value: String(summaryCards.readyCount) },
            { label: "Almost Ready", value: String(summaryCards.almostReadyCount) },
            { label: "Not Ready", value: String(summaryCards.notReadyCount) },
            { label: "Average Promotion Readiness %", value: `${summaryCards.avgReadiness.toFixed(1)}%` },
            { label: "Students Missing Attendance", value: String(summaryCards.missingAttendanceCount) },
            { label: "Students Missing Score", value: String(summaryCards.missingScoreCount) },
            { label: "Students Missing Worksheet Completion", value: String(summaryCards.missingCompletionCount) }
          ].map((card) => (
            <div key={card.label} style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase" }}>{card.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{card.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
          {[
            { label: "Students Ready Today", value: bulkView.readyToday },
            { label: "Students Expected Next Week", value: bulkView.expectedNextWeek },
            { label: "Students Blocked", value: bulkView.blocked }
          ].map((item) => (
            <div key={item.label} style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{item.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button className="button secondary" style={{ width: "auto" }} onClick={() => void handleCopy()}>Copy</button>
        <button className="button secondary" style={{ width: "auto" }} onClick={handlePrint}>Print</button>
        <button className="button secondary" style={{ width: "auto" }} onClick={handleExportPdf}>PDF</button>
        <button className="button secondary" style={{ width: "auto" }} onClick={handleExportCsv}>CSV</button>
        {copyState ? <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{copyState}</span> : null}
      </div>

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      {pageRows.length === 0 ? (
        <div className="card" style={{ textAlign: "center", fontSize: 12, color: "var(--color-text-muted)" }}>
          No students found for the selected filter.
        </div>
      ) : (
        <DataTable
          columns={[
            { key: "student", header: "Student", render: (r) => r.studentName || "" },
            { key: "batch", header: "Batch", render: (r) => r.batchName || "" },
            { key: "level", header: "Current Level", render: (r) => r.currentLevel || "" },
            { key: "score", header: "Average Score", render: (r) => (r.averageScore === null ? "--" : `${r.averageScore.toFixed(1)}%`) },
            { key: "attendance", header: "Attendance", render: (r) => (r.attendance === null ? "--" : `${r.attendance.toFixed(1)}%`) },
            { key: "completion", header: "Worksheet Completion", render: (r) => (r.worksheetCompletion === null ? "--" : `${r.worksheetCompletion.toFixed(1)}%`) },
            {
              key: "status",
              header: "Promotion Status",
              render: (r) => {
                const color = r.status === "Ready" ? "#16a34a" : r.status === "Almost Ready" ? "#ca8a04" : "#dc2626";
                return (
                  <span style={{ padding: "2px 8px", borderRadius: 999, background: `${color}22`, color, fontSize: 12, fontWeight: 700 }}>
                    {r.status}
                  </span>
                );
              }
            },
            { key: "readiness", header: "Readiness %", render: (r) => `${r.readinessPercent.toFixed(1)}%` },
            {
              key: "missing",
              header: "Missing Requirements",
              render: (r) => (
                r.missingRequirements.length ? (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxWidth: 260 }}>
                    {r.missingRequirements.slice(0, 4).map((m) => (
                      <span key={`${r.studentId}-${m}`} style={{ fontSize: 11, padding: "2px 6px", borderRadius: 999, background: "var(--color-bg-muted)", color: "var(--color-text-muted)" }}>
                        {m}
                      </span>
                    ))}
                  </div>
                ) : <span style={{ fontSize: 12, color: "#16a34a" }}>No missing requirements</span>
              )
            },
            {
              key: "actions",
              header: "Actions",
              render: (r) => (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="button secondary" style={{ width: "auto" }} onClick={() => toggleExpand(r.studentId)}>
                    {expandedByStudentId[r.studentId] ? "Hide" : "Expand"}
                  </button>
                  <Link className="button secondary" style={{ width: "auto" }} to={`/teacher/students/${encodeURIComponent(r.studentId)}/360`}>
                    Open 360
                  </Link>
                </div>
              )
            }
          ]}
          rows={pageRows}
          keyField="studentId"
        />
      )}

      {pageRows.filter((row) => expandedByStudentId[row.studentId]).map((row) => {
        const detail = student360ById[row.studentId] || null;
        const noteItems = notesByStudentId[row.studentId] || [];
        const meetingItems = buildMeetingHistory(noteItems);
        const meetingFilter = meetingFilterByStudentId[row.studentId] || "all";
        const filteredMeetings = meetingItems.filter((item) => {
          if (meetingFilter === "all") return true;
          if (meetingFilter === "pending") return item.status.label === "Upcoming";
          if (meetingFilter === "completed") return item.status.label === "Completed";
          if (meetingFilter === "overdue") return item.status.label === "Overdue";
          return true;
        });

        const activityEvents = Array.isArray(detail?.recentActivity)
          ? detail.recentActivity.map((a, idx) => ({
            id: `activity-${row.studentId}-${idx}`,
            date: a?.date || "",
            title: a?.title || "Activity",
            detail: a?.detail || ""
          }))
          : [];
        const meetingEvents = buildMeetingTimelineEvents(meetingItems);
        const combinedTimeline = [...activityEvents, ...meetingEvents]
          .filter((e) => e.date)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const meetingDraft = meetingDraftByStudentId[row.studentId] || {
          meetingDate: toIsoDateOnly(new Date().toISOString()),
          meetingType: "Phone",
          meetingNotes: "",
          topicsDiscussed: "",
          agreedActions: "",
          followUpDate: ""
        };
        const isEditingMeeting = Boolean(meetingEditIdByStudentId[row.studentId]);
        const isSavingMeeting = Boolean(meetingSavingByStudentId[row.studentId]);

        return (
          <div key={`expanded-${row.studentId}`} className="card" style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{row.studentName}</div>
            {student360LoadingById[row.studentId] ? (
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Loading promotion details...</div>
            ) : detail?.__error ? (
              <div className="error" style={{ fontSize: 12 }}>{detail.__error}</div>
            ) : (
              <>
                <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 10, display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>Promotion Checklist</div>
                  <div style={{ fontSize: 12 }}>Eligible: <strong>{detail?.promotion?.eligible ? "Yes" : "No"}</strong></div>
                  <div style={{ fontSize: 12 }}>Readiness: <strong>{row.readinessPercent.toFixed(1)}%</strong></div>
                  <div style={{ fontSize: 12 }}>Current Progress: Score {row.averageScore === null ? "--" : `${row.averageScore.toFixed(1)}%`} • Attendance {row.attendance === null ? "--" : `${row.attendance.toFixed(1)}%`} • Completion {row.worksheetCompletion === null ? "--" : `${row.worksheetCompletion.toFixed(1)}%`}</div>
                </div>

                <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 10, display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>Eligibility Reasons</div>
                  {Array.isArray(detail?.promotion?.reasons) && detail.promotion.reasons.length ? (
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                      {detail.promotion.reasons.map((reason, idx) => (
                        <li key={`reason-${row.studentId}-${idx}`}>{reason}</li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>No eligibility blockers reported.</div>
                  )}
                </div>

                <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 10, display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>Recommended Next Steps</div>
                  {row.missingRequirements.length ? (
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                      {row.missingRequirements.map((step) => (
                        <li key={`step-${row.studentId}-${step}`}>{step}</li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ fontSize: 12, color: "#16a34a" }}>Ready for promotion workflow confirmation.</div>
                  )}
                </div>

                <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 10, display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>Student Timeline</div>
                  {combinedTimeline.length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>No timeline events yet.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 6 }}>
                      {combinedTimeline.slice(0, 12).map((evt) => (
                        <div key={evt.id} style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 8, borderBottom: "1px dashed var(--color-border)", paddingBottom: 6 }}>
                          <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{toIsoDateOnly(evt.date)}</div>
                          <div style={{ display: "grid", gap: 2 }}>
                            <div style={{ fontSize: 12, fontWeight: 700 }}>{evt.title}</div>
                            {evt.detail ? <div style={{ fontSize: 12 }}>{evt.detail}</div> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 10, display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>Parent Meeting History</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button className="button secondary" style={{ width: "auto" }} onClick={() => copyMeetingSummary(row.studentName, filteredMeetings)}>Copy Summary</button>
                      <button className="button secondary" style={{ width: "auto" }} onClick={() => printMeetingSummary(row.studentName, filteredMeetings)}>Print</button>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {[
                      { key: "all", label: "All Meetings" },
                      { key: "pending", label: "Pending Follow-ups" },
                      { key: "completed", label: "Completed" },
                      { key: "overdue", label: "Overdue" }
                    ].map((f) => (
                      <button
                        key={`${row.studentId}-${f.key}`}
                        className="button secondary"
                        style={{
                          width: "auto",
                          background: meetingFilter === f.key ? "var(--color-bg-muted)" : "transparent",
                          borderColor: meetingFilter === f.key ? "var(--color-border-strong)" : "var(--color-border)"
                        }}
                        onClick={() => setMeetingFilterByStudentId((prev) => ({ ...prev, [row.studentId]: f.key }))}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 10, display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{isEditingMeeting ? "Edit Meeting" : "Add Meeting"}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
                      <label style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Meeting Date</span>
                        <input className="input" type="date" value={meetingDraft.meetingDate} onChange={(e) => updateMeetingDraft(row.studentId, { meetingDate: e.target.value })} />
                      </label>
                      <label style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Meeting Type</span>
                        <select className="select" value={meetingDraft.meetingType} onChange={(e) => updateMeetingDraft(row.studentId, { meetingType: e.target.value })}>
                          <option value="Phone">Phone</option>
                          <option value="In Person">In Person</option>
                          <option value="Online">Online</option>
                        </select>
                      </label>
                      <label style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Follow-up Date</span>
                        <input className="input" type="date" value={meetingDraft.followUpDate} onChange={(e) => updateMeetingDraft(row.studentId, { followUpDate: e.target.value })} />
                      </label>
                    </div>

                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Meeting Notes</span>
                      <textarea className="input" style={{ minHeight: 70 }} value={meetingDraft.meetingNotes} onChange={(e) => updateMeetingDraft(row.studentId, { meetingNotes: e.target.value })} />
                    </label>

                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Topics Discussed</span>
                      <textarea className="input" style={{ minHeight: 60 }} value={meetingDraft.topicsDiscussed} onChange={(e) => updateMeetingDraft(row.studentId, { topicsDiscussed: e.target.value })} />
                    </label>

                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Agreed Actions</span>
                      <textarea className="input" style={{ minHeight: 60 }} value={meetingDraft.agreedActions} onChange={(e) => updateMeetingDraft(row.studentId, { agreedActions: e.target.value })} />
                    </label>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="button" style={{ width: "auto" }} onClick={() => void saveMeeting(row.studentId)} disabled={isSavingMeeting || !String(meetingDraft.meetingNotes || "").trim()}>
                        {isSavingMeeting ? "Saving..." : "Save"}
                      </button>
                      {isEditingMeeting ? (
                        <button className="button secondary" style={{ width: "auto" }} onClick={() => resetDraft(row.studentId)}>
                          Cancel Edit
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {notesLoadingByStudentId[row.studentId] ? (
                    <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Loading meeting history...</div>
                  ) : filteredMeetings.length === 0 ? (
                    <div style={{ border: "1px dashed var(--color-border)", borderRadius: 8, padding: 10, textAlign: "center", fontSize: 12, color: "var(--color-text-muted)" }}>
                      No parent meetings found for this filter.
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 8 }}>
                      {filteredMeetings.map((meeting) => (
                        <div key={`meeting-${meeting.id}`} style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 10, display: "grid", gap: 6 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <div style={{ fontSize: 12, fontWeight: 700 }}>{meeting.meetingDate || "-"} • {meeting.meetingType}</div>
                            <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: `${meeting.status.color}22`, color: meeting.status.color }}>
                              {meeting.status.label}
                            </span>
                          </div>

                          <div style={{ fontSize: 12 }}><strong>Summary:</strong> {meeting.summary || "-"}</div>
                          <div style={{ fontSize: 12 }}><strong>Discussed Issues:</strong> {meeting.discussedIssues || "-"}</div>
                          <div style={{ fontSize: 12 }}><strong>Agreed Actions:</strong> {meeting.agreedActions || "-"}</div>
                          <div style={{ fontSize: 12 }}><strong>Next Follow-up Date:</strong> {meeting.followUpDate || "-"}</div>

                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button className="button secondary" style={{ width: "auto" }} onClick={() => beginEditMeeting(row.studentId, meeting)}>
                              Edit
                            </button>
                            {meeting.status.label !== "Completed" ? (
                              <button className="button secondary" style={{ width: "auto" }} onClick={() => void markFollowUpComplete(row.studentId, meeting)}>
                                Mark Follow-up Complete
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}

      <PaginationBar
        limit={limit}
        offset={offset}
        count={pageRows.length}
        total={total}
        onChange={(next) => {
          setOffset(next.offset);
        }}
      />
    </section>
  );
}

export { TeacherResultsPage };
