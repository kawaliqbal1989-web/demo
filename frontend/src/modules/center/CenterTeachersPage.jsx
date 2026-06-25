import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { CapacityInlineNotice, buildCapacityRequestHref } from "../../components/CapacityGovernance";
import { DataTable } from "../../components/DataTable";
import { SkeletonLoader } from "../../components/SkeletonLoader";
import { PageHeader } from "../../components/PageHeader";
import { useCenterCapacitySnapshot } from "../../hooks/useCenterCapacitySnapshot";
import { createTeacher, listTeachers, resetTeacherPassword, shiftTeacherStudents, updateTeacher, uploadTeacherPhoto } from "../../services/teachersService";
import { listStudents } from "../../services/studentsService";
import { getAnalyticsAttendance, getAnalyticsWorksheets, getCenterBatchHealthDashboard, getCenterTeacherOperationsDashboard, getStudent360 } from "../../services/centerService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { resolveAssetUrl } from "../../utils/assetUrls";
import { buildCapacityLimitMessage, shouldDisableCapacityAction } from "../../utils/capacityGovernance";
import { downloadBlob } from "../../utils/downloadBlob";
import { generateLeaderboardPdf } from "../../utils/pdfExport";

const photoFrameStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 8,
  background: "linear-gradient(180deg, var(--color-bg-subtle), var(--color-bg-muted))",
  border: "1px solid var(--color-border-strong)",
  borderRadius: 12,
  boxShadow: "0 8px 24px rgba(0,0,0,0.12)"
};

const buildPhotoStyle = (size, objectFit = "cover") => ({
  width: size,
  height: size,
  objectFit,
  borderRadius: 10,
  border: "1px solid var(--color-border)",
  background: "var(--color-bg-card)"
});

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clampPercent(value) {
  const n = toNumberOrNull(value);
  if (n === null) return null;
  return Math.max(0, Math.min(100, n));
}

function asPercentText(value) {
  const n = toNumberOrNull(value);
  return n === null ? "--" : `${n.toFixed(1)}%`;
}

function asNumberText(value) {
  const n = toNumberOrNull(value);
  return n === null ? "--" : n.toFixed(1);
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function getRatingLabel(score) {
  const s = toNumberOrNull(score) ?? 0;
  if (s >= 85) return { label: "Excellent", color: "#16a34a" };
  if (s >= 70) return { label: "Good", color: "#ca8a04" };
  if (s >= 55) return { label: "Needs Improvement", color: "#ea580c" };
  return { label: "Critical", color: "#dc2626" };
}

function buildTeacherRating({ attendance, avgScore, worksheetCompletion, promotionReady, highRisk, students }) {
  const att = clampPercent(attendance) ?? 0;
  const score = clampPercent(avgScore) ?? 0;
  const completion = clampPercent(worksheetCompletion) ?? 0;
  const studentCount = Math.max(1, Number(students || 0));
  const promotionRate = clampPercent((Number(promotionReady || 0) / studentCount) * 100) ?? 0;
  const riskRate = clampPercent((Number(highRisk || 0) / studentCount) * 100) ?? 0;

  const weighted = (att * 0.32) + (score * 0.32) + (completion * 0.2) + (promotionRate * 0.16) - (riskRate * 0.2);
  return Math.max(0, Math.min(100, Number(weighted.toFixed(1))));
}

function buildTeacherDashboardText(summary, rows) {
  const lines = [
    "Teacher Performance Dashboard",
    "",
    `Total Teachers: ${summary.totalTeachers}`,
    `Active Teachers: ${summary.activeTeachers}`,
    `Average Student Score: ${summary.avgStudentScore.toFixed(1)}%`,
    `Average Attendance: ${summary.avgAttendance.toFixed(1)}%`,
    `Promotion Ready Students: ${summary.promotionReadyStudents}`,
    `High Risk Students: ${summary.highRiskStudents}`,
    "",
    "Teacher Metrics:",
    ...rows.map((row) => [
      row.teacherName,
      `Batches ${row.assignedBatches}`,
      `Students ${row.students}`,
      `Attendance ${asPercentText(row.attendancePercent)}`,
      `Avg Score ${asPercentText(row.averageScore)}`,
      `Worksheet ${asPercentText(row.worksheetCompletionPercent)}`,
      `Promotion Ready ${row.promotionReady}`,
      `High Risk ${row.highRisk}`,
      `Inactive ${row.inactiveStudents}`,
      `Rating ${row.rating.label}`
    ].join(" | "))
  ];

  return lines.join("\n");
}

function CenterTeachersPage() {
  const {
    data: capacitySnapshot,
    error: capacityError,
    loading: capacityLoading,
    retry: retryCapacity
  } = useCenterCapacitySnapshot();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [fullName, setFullName] = useState("");
  const [phonePrimary, setPhonePrimary] = useState("");
  const [email, setEmail] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [qualification, setQualification] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [phoneAlternate, setPhoneAlternate] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateName, setStateName] = useState("");
  const [pincode, setPincode] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [relation, setRelation] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("");
  const [employmentType, setEmploymentType] = useState("FULL_TIME");
  const [salaryType, setSalaryType] = useState("FIXED");
  const [isProbation, setIsProbation] = useState(false);
  const [status, setStatus] = useState("ACTIVE");
  const [createLoginAccount, setCreateLoginAccount] = useState(true);
  const [creating, setCreating] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [tempPasswordDialog, setTempPasswordDialog] = useState(null);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [assignedStudents, setAssignedStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [assignedStudentsPage, setAssignedStudentsPage] = useState(0);
  const [assignedStudentsTotal, setAssignedStudentsTotal] = useState(0);
  const ASSIGNED_STUDENTS_PAGE_SIZE = 100;

  const [editingTeacher, setEditingTeacher] = useState(null);
  const [viewTeacher, setViewTeacher] = useState(null);
  const [editPhotoFile, setEditPhotoFile] = useState(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [shiftSourceTeacher, setShiftSourceTeacher] = useState(null);
  const [shiftTargetTeacherId, setShiftTargetTeacherId] = useState("");
  const [shiftSaving, setShiftSaving] = useState(false);
  const [shiftError, setShiftError] = useState("");

  const [teacherOpsItems, setTeacherOpsItems] = useState([]);
  const [batchHealthItems, setBatchHealthItems] = useState([]);
  const [attendanceItems, setAttendanceItems] = useState([]);
  const [worksheetItems, setWorksheetItems] = useState([]);
  const [student360Cache, setStudent360Cache] = useState({});
  const [detailsLoadingByTeacherId, setDetailsLoadingByTeacherId] = useState({});
  const [expandedByTeacherId, setExpandedByTeacherId] = useState({});
  const [performanceFilter, setPerformanceFilter] = useState("all");
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [copyState, setCopyState] = useState("");

  const toDateInputValue = (value) => {
    if (!value) return "";
    const asString = String(value);
    return asString.length >= 10 ? asString.slice(0, 10) : asString;
  };

  const mapTeacherToForm = (row) => {
    const profile = row?.teacherProfile || {};
    return {
      id: row?.id,
      username: row?.username || "",
      fullName: profile?.fullName || "",
      phonePrimary: profile?.phonePrimary || "",
      email: row?.email || "",
      joiningDate: toDateInputValue(profile?.joiningDate),
      qualification: profile?.qualification || "",
      experienceYears: profile?.experienceYears ?? "",
      specialization: profile?.specialization || "",
      phoneAlternate: profile?.phoneAlternate || "",
      whatsappNumber: profile?.whatsappNumber || "",
      address: profile?.address || "",
      city: profile?.city || "",
      state: profile?.state || "",
      pincode: profile?.pincode || "",
      emergencyContactName: profile?.emergencyContactName || "",
      emergencyContactPhone: profile?.emergencyContactPhone || "",
      relation: profile?.emergencyContactRelation || "",
      photoUrl: profile?.photoUrl || "",
      notes: profile?.notes || "",
      preferredLanguage: profile?.preferredLanguage || "",
      employmentType: profile?.employmentType || "FULL_TIME",
      salaryType: profile?.salaryType || "FIXED",
      isProbation: Boolean(profile?.isProbation),
      status: profile?.status || (row?.isActive ? "ACTIVE" : "INACTIVE")
    };
  };

  const resolvePhotoUrl = (value) => {
    return resolveAssetUrl(value);
  };

  const load = async ({ q: nextQ = q, status: nextStatus = statusFilter } = {}) => {
    setLoading(true);
    setError("");
    try {
      const data = await listTeachers({ limit: 100, offset: 0, q: nextQ, status: nextStatus });
      setRows(data?.data?.items || data?.data || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load teachers.");
    } finally {
      setLoading(false);
    }
  };

  const loadPerformanceAnalytics = async () => {
    setDashboardLoading(true);
    setDashboardError("");
    try {
      const [teacherOpsRes, batchHealthRes, attendanceRes, worksheetRes, allStudentsRes] = await Promise.all([
        getCenterTeacherOperationsDashboard({ limit: 500, offset: 0 }),
        getCenterBatchHealthDashboard({ limit: 500, offset: 0 }),
        getAnalyticsAttendance({ limit: 5000, offset: 0 }),
        getAnalyticsWorksheets({ limit: 5000, offset: 0 }),
        listStudents({ limit: 5000, offset: 0 })
      ]);

      setTeacherOpsItems(Array.isArray(teacherOpsRes?.data?.items) ? teacherOpsRes.data.items : []);

      setBatchHealthItems(Array.isArray(batchHealthRes?.data?.items) ? batchHealthRes.data.items : []);
      setAttendanceItems(Array.isArray(attendanceRes?.data?.items) ? attendanceRes.data.items : []);
      setWorksheetItems(Array.isArray(worksheetRes?.data?.items) ? worksheetRes.data.items : []);

      const studentItems = Array.isArray(allStudentsRes?.data?.items)
        ? allStudentsRes.data.items
        : Array.isArray(allStudentsRes?.data)
          ? allStudentsRes.data
          : [];

      const nextCache = {};
      for (const student of studentItems) {
        if (!student?.id) continue;
        const teacherUserId = student?.currentTeacher?.id || student?.currentTeacherUserId || student?.batchEnrollments?.[0]?.assignedTeacher?.id || null;
        const batchIds = Array.from(
          new Set(
            (Array.isArray(student?.batchEnrollments) ? student.batchEnrollments : [])
              .filter((enrollment) => {
                const assignedTeacherId = enrollment?.assignedTeacher?.id || enrollment?.assignedTeacherId || null;
                return String(assignedTeacherId || "") === String(teacherUserId || "");
              })
              .map((enrollment) => enrollment?.batchId || enrollment?.batch?.id || null)
              .filter(Boolean)
              .map((id) => String(id))
          )
        );
        nextCache[student.id] = {
          studentId: student.id,
          teacherUserId,
          teacherName: student?.currentTeacher?.teacherProfile?.fullName || student?.currentTeacher?.username || student?.batchEnrollments?.[0]?.assignedTeacher?.teacherProfile?.fullName || "",
          fullName: `${student?.firstName || ""} ${student?.lastName || ""}`.trim(),
          admissionNo: student?.admissionNo || "",
          levelName: student?.effectiveLevel?.name || student?.level?.name || "",
          riskLevel: String(student?.riskLevel || "").toUpperCase(),
          isActive: Boolean(student?.isActive),
          batchIds
        };
      }
      setStudent360Cache(nextCache);
    } catch (err) {
      setDashboardError(getFriendlyErrorMessage(err) || "Failed to load teacher performance dashboard.");
      setTeacherOpsItems([]);
      setBatchHealthItems([]);
      setAttendanceItems([]);
      setWorksheetItems([]);
    } finally {
      setDashboardLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    void loadPerformanceAnalytics();
  }, []);

  const studentByTeacher = useMemo(() => {
    const map = new Map();
    for (const item of Object.values(student360Cache)) {
      const teacherUserId = item?.teacherUserId;
      if (!teacherUserId) continue;
      if (!map.has(teacherUserId)) map.set(teacherUserId, []);
      map.get(teacherUserId).push(item);
    }
    return map;
  }, [student360Cache]);

  const teacherBatchIdsByTeacher = useMemo(() => {
    const map = new Map();
    for (const item of Object.values(student360Cache)) {
      const teacherUserId = item?.teacherUserId;
      if (!teacherUserId) continue;
      if (!map.has(teacherUserId)) map.set(teacherUserId, new Set());
      const set = map.get(teacherUserId);
      for (const batchId of Array.isArray(item?.batchIds) ? item.batchIds : []) {
        if (batchId) set.add(String(batchId));
      }
    }
    return map;
  }, [student360Cache]);

  const attendanceByAdmissionNo = useMemo(() => {
    const map = new Map();
    for (const item of attendanceItems) {
      if (item?.admissionNo) map.set(String(item.admissionNo), item);
    }
    return map;
  }, [attendanceItems]);

  const worksheetByAdmissionNo = useMemo(() => {
    const map = new Map();
    for (const item of worksheetItems) {
      if (item?.admissionNo) map.set(String(item.admissionNo), item);
    }
    return map;
  }, [worksheetItems]);

  const teacherPerformanceRows = useMemo(() => {
    return rows.map((teacherRow) => {
      const teacherUserId = String(teacherRow?.id || "");
      const teacherName = teacherRow?.teacherProfile?.fullName || teacherRow?.username || "Teacher";
      const teacherOps = teacherOpsItems.find((x) => String(x?.teacherUserId || "") === teacherUserId) || null;
      const students = studentByTeacher.get(teacherUserId) || [];

      let totalAttendance = 0;
      let attendanceCount = 0;
      let totalScore = 0;
      let scoreCount = 0;
      let totalWorksheetCompletion = 0;
      let completionCount = 0;
      let promotionReady = 0;
      let highRisk = 0;
      let inactiveStudents = 0;

      for (const student of students) {
        const attendance = attendanceByAdmissionNo.get(String(student?.admissionNo || ""));
        const worksheet = worksheetByAdmissionNo.get(String(student?.admissionNo || ""));

        const attendanceRate = clampPercent(attendance?.attendanceRate);
        if (attendanceRate !== null) {
          totalAttendance += attendanceRate;
          attendanceCount += 1;
        }

        const avgScore = clampPercent(worksheet?.avgScore);
        if (avgScore !== null) {
          totalScore += avgScore;
          scoreCount += 1;
        }

        const assignedCount = Number(worksheet?.assignedCount || 0);
        const completedCount = Number(worksheet?.completedCount || 0);
        if (assignedCount > 0) {
          totalWorksheetCompletion += (completedCount / assignedCount) * 100;
          completionCount += 1;
        }

        if (student?.riskLevel === "HIGH" || student?.riskLevel === "CRITICAL") highRisk += 1;
        if (!student?.isActive) inactiveStudents += 1;

        if (
          (attendanceRate !== null && attendanceRate >= 75)
          && (avgScore !== null && avgScore >= 75)
          && (assignedCount === 0 || completedCount / Math.max(1, assignedCount) >= 0.8)
        ) {
          promotionReady += 1;
        }
      }

      const averageAttendance = attendanceCount ? Number((totalAttendance / attendanceCount).toFixed(1)) : null;
      const averageScore = scoreCount ? Number((totalScore / scoreCount).toFixed(1)) : null;
      const worksheetCompletionPercent = completionCount ? Number((totalWorksheetCompletion / completionCount).toFixed(1)) : null;

      const ratingScore = buildTeacherRating({
        attendance: averageAttendance,
        avgScore: averageScore,
        worksheetCompletion: worksheetCompletionPercent,
        promotionReady,
        highRisk,
        students: students.length
      });
      const rating = getRatingLabel(ratingScore);

      const assignedBatches = Number(teacherOps?.assignedBatches || 0);

      return {
        teacherUserId,
        teacherName,
        assignedBatches,
        students: students.length,
        attendancePercent: averageAttendance,
        averageScore,
        worksheetCompletionPercent,
        promotionReady,
        highRisk,
        inactiveStudents,
        ratingScore,
        rating,
        teacherOps,
        studentsList: students
      };
    });
  }, [rows, teacherOpsItems, studentByTeacher, attendanceByAdmissionNo, worksheetByAdmissionNo]);


  const filteredPerformanceRows = useMemo(() => {
    if (performanceFilter === "all") return teacherPerformanceRows;
    if (performanceFilter === "excellent") return teacherPerformanceRows.filter((row) => row.rating.label === "Excellent");
    if (performanceFilter === "good") return teacherPerformanceRows.filter((row) => row.rating.label === "Good");
    if (performanceFilter === "needs-improvement") return teacherPerformanceRows.filter((row) => row.rating.label === "Needs Improvement");
    if (performanceFilter === "critical") return teacherPerformanceRows.filter((row) => row.rating.label === "Critical");
    if (performanceFilter === "low-attendance") return teacherPerformanceRows.filter((row) => (toNumberOrNull(row.attendancePercent) ?? 0) < 75);
    if (performanceFilter === "low-score") return teacherPerformanceRows.filter((row) => (toNumberOrNull(row.averageScore) ?? 0) < 75);
    if (performanceFilter === "high-risk") return teacherPerformanceRows.filter((row) => Number(row.highRisk || 0) > 0);
    if (performanceFilter === "promotion-ready") return teacherPerformanceRows.filter((row) => Number(row.promotionReady || 0) > 0);
    if (performanceFilter === "needs-review") return teacherPerformanceRows.filter((row) => Number(row.highRisk || 0) > 0 || (toNumberOrNull(row.attendancePercent) ?? 0) < 75 || (toNumberOrNull(row.averageScore) ?? 0) < 75 || Number(row.promotionReady || 0) === 0);
    return teacherPerformanceRows;
  }, [teacherPerformanceRows, performanceFilter]);

  const dashboardSummary = useMemo(() => {
    const totalTeachers = teacherPerformanceRows.length;
    const activeTeachers = rows.filter((row) => Boolean(row?.isActive)).length;

    const avgStudentScoreValues = teacherPerformanceRows
      .map((row) => toNumberOrNull(row.averageScore))
      .filter((value) => value !== null);
    const avgAttendanceValues = teacherPerformanceRows
      .map((row) => toNumberOrNull(row.attendancePercent))
      .filter((value) => value !== null);

    const avgStudentScore = avgStudentScoreValues.length
      ? Number((avgStudentScoreValues.reduce((sum, v) => sum + v, 0) / avgStudentScoreValues.length).toFixed(1))
      : 0;
    const avgAttendance = avgAttendanceValues.length
      ? Number((avgAttendanceValues.reduce((sum, v) => sum + v, 0) / avgAttendanceValues.length).toFixed(1))
      : 0;

    const promotionReadyStudents = teacherPerformanceRows.reduce((sum, row) => sum + Number(row.promotionReady || 0), 0);
    const highRiskStudents = teacherPerformanceRows.reduce((sum, row) => sum + Number(row.highRisk || 0), 0);

    return {
      totalTeachers,
      activeTeachers,
      avgStudentScore,
      avgAttendance,
      promotionReadyStudents,
      highRiskStudents
    };
  }, [teacherPerformanceRows, rows]);

  const rankingData = useMemo(
    () => [...filteredPerformanceRows].sort((a, b) => b.ratingScore - a.ratingScore || a.teacherName.localeCompare(b.teacherName)),
    [filteredPerformanceRows]
  );

  const handleCopyPerformance = async () => {
    const text = buildTeacherDashboardText(dashboardSummary, filteredPerformanceRows);
    let copied = false;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch (_err) {
      copied = false;
    }
    if (!copied) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      copied = document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopyState(copied ? "Copied" : "Copy failed");
    setTimeout(() => setCopyState(""), 1400);
  };

  const handlePrintPerformance = () => {
    const escaped = buildTeacherDashboardText(dashboardSummary, filteredPerformanceRows)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const popup = window.open("", "_blank", "noopener,noreferrer,width=1100,height=760");
    if (!popup) return;
    popup.document.write(`<!doctype html><html><head><title>Teacher Performance Dashboard</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#111827}pre{white-space:pre-wrap;line-height:1.45;font-size:13px}</style></head><body><pre>${escaped}</pre></body></html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const handleExportPerformanceCsv = () => {
    const headers = [
      "Teacher",
      "Assigned Batches",
      "Students",
      "Attendance %",
      "Average Score",
      "Worksheet Completion %",
      "Promotion Ready",
      "High Risk",
      "Inactive Students",
      "Overall Rating"
    ];
    const lines = [headers.map(csvEscape).join(",")];
    for (const row of filteredPerformanceRows) {
      lines.push([
        row.teacherName,
        row.assignedBatches,
        row.students,
        row.attendancePercent === null ? "" : row.attendancePercent,
        row.averageScore === null ? "" : row.averageScore,
        row.worksheetCompletionPercent === null ? "" : row.worksheetCompletionPercent,
        row.promotionReady,
        row.highRisk,
        row.inactiveStudents,
        row.rating.label
      ].map(csvEscape).join(","));
    }
    downloadBlob(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }), "teacher_performance_dashboard.csv");
  };

  const handleExportPerformancePdf = () => {
    const doc = generateLeaderboardPdf({
      title: "Teacher Performance Dashboard",
      rows: rankingData.map((row, idx) => ({
        rank: idx + 1,
        studentName: row.teacherName,
        avgScore: row.ratingScore,
        totalWorksheets: row.rating.label
      }))
    });
    doc.save("teacher_performance_dashboard.pdf");
  };

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview("");
      return undefined;
    }
    const objectUrl = URL.createObjectURL(photoFile);
    setPhotoPreview(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [photoFile]);

  useEffect(() => {
    if (!editPhotoFile) {
      setEditPhotoPreview("");
      return undefined;
    }
    const objectUrl = URL.createObjectURL(editPhotoFile);
    setEditPhotoPreview(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [editPhotoFile]);

  const resetForm = () => {
    setFullName("");
    setPhonePrimary("");
    setEmail("");
    setJoiningDate("");
    setQualification("");
    setExperienceYears("");
    setSpecialization("");
    setPhoneAlternate("");
    setWhatsappNumber("");
    setAddress("");
    setCity("");
    setStateName("");
    setPincode("");
    setEmergencyContactName("");
    setEmergencyContactPhone("");
    setRelation("");
    setPhotoUrl("");
    setNotes("");
    setPreferredLanguage("");
    setEmploymentType("FULL_TIME");
    setSalaryType("FIXED");
    setIsProbation(false);
    setStatus("ACTIVE");
    setCreateLoginAccount(true);
    setPhotoFile(null);
    setPhotoPreview("");
  };

  const getTeacherInitials = (row) => {
    const label = row?.teacherProfile?.fullName || row?.username || "Teacher";
    const parts = String(label)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);
    return (parts.map((part) => part[0]).join("") || "T").toUpperCase();
  };

  const loadAssignedStudents = async (teacher, page = 0) => {
    const targetTeacher = teacher || selectedTeacher;
    setSelectedTeacher(targetTeacher || null);
    if (!targetTeacher?.id) {
      setAssignedStudents([]);
      setAssignedStudentsPage(0);
      setAssignedStudentsTotal(0);
      return;
    }

    setLoadingStudents(true);
    try {
      const res = await listStudents({
        limit: ASSIGNED_STUDENTS_PAGE_SIZE,
        offset: page * ASSIGNED_STUDENTS_PAGE_SIZE,
        teacherUserId: targetTeacher.id
      });
      const data = res?.data;
      const items = data?.items || data || [];
      const total = data?.total ?? items.length;
      setAssignedStudents(items);
      setAssignedStudentsPage(page);
      setAssignedStudentsTotal(total);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to load assigned students");
      setAssignedStudents([]);
      setAssignedStudentsPage(0);
      setAssignedStudentsTotal(0);
    } finally {
      setLoadingStudents(false);
    }
  };

  const onCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      const res = await createTeacher({
        fullName,
        email,
        phonePrimary,
        joiningDate,
        qualification,
        experienceYears: experienceYears === "" ? null : Number(experienceYears),
        specialization,
        phoneAlternate,
        whatsappNumber,
        address,
        city,
        state: stateName,
        pincode,
        emergencyContactName,
        emergencyContactPhone,
        relation,
        photoUrl,
        notes,
        preferredLanguage,
        employmentType,
        salaryType,
        isProbation,
        status,
        createLoginAccount
      });

      const tempPassword = res?.data?.tempPassword;
      const createdTeacherId = res?.data?.user?.id;
      if (createdTeacherId && photoFile) {
        try {
          const up = await uploadTeacherPhoto(createdTeacherId, photoFile);
          const newPhotoUrl = up?.data?.photoUrl || up?.photoUrl || null;
          if (newPhotoUrl) {
            toast.success("Teacher created and photo uploaded.");
          }
        } catch (uploadErr) {
          toast.error(getFriendlyErrorMessage(uploadErr) || "Teacher created, but photo upload failed");
        }
      }
      if (tempPassword) {
        setTempPasswordDialog({ username: res?.data?.user?.username || fullName, tempPassword });
      } else if (!photoFile) {
        toast.success("Teacher created!");
      }

      resetForm();
      await load({ q, status: statusFilter });
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to create teacher.");
    } finally {
      setCreating(false);
    }
  };

  const onToggleActive = async (row) => {
    try {
      const nextActive = !row.isActive;
      await updateTeacher(row.id, {
        isActive: nextActive,
        status: nextActive ? "ACTIVE" : "INACTIVE"
      });
      await load({ q, status: statusFilter });
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Update failed");
    }
  };

  const onOpenShiftStudents = async (row) => {
    setShiftSourceTeacher(row);
    setShiftTargetTeacherId("");
    setShiftError("");
    await loadAssignedStudents(row, 0);
  };

  const onSaveShiftStudents = async (e) => {
    e.preventDefault();
    if (!shiftSourceTeacher?.id || !shiftTargetTeacherId) {
      setShiftError("Please select a target teacher.");
      return;
    }

    setShiftSaving(true);
    setShiftError("");
    try {
      const res = await shiftTeacherStudents(shiftSourceTeacher.id, { targetTeacherId: shiftTargetTeacherId });
      toast.success(`Shifted ${res?.data?.shiftedCount ?? 0} students.`);
      setShiftSourceTeacher(null);
      setShiftTargetTeacherId("");
      await load({ q, status: statusFilter });
      setSelectedTeacher(null);
      setAssignedStudents([]);
      setAssignedStudentsPage(0);
      setAssignedStudentsTotal(0);
    } catch (err) {
      setShiftError(getFriendlyErrorMessage(err) || "Failed to shift students.");
    } finally {
      setShiftSaving(false);
    }
  };

  const onEdit = (row) => {
    setEditingTeacher(mapTeacherToForm(row));
  };

  const onCancelEdit = () => {
    setEditingTeacher(null);
    setEditPhotoFile(null);
  };

  const onView = (row) => {
    setViewTeacher(mapTeacherToForm(row));
  };

  const onSaveEdit = async (row) => {
    if (!editingTeacher) return;
    setEditSaving(true);
    try {
      await updateTeacher(row.id, {
        fullName: editingTeacher.fullName,
        phonePrimary: editingTeacher.phonePrimary,
        email: editingTeacher.email,
        joiningDate: editingTeacher.joiningDate,
        qualification: editingTeacher.qualification,
        experienceYears: editingTeacher.experienceYears === "" ? null : Number(editingTeacher.experienceYears),
        specialization: editingTeacher.specialization,
        phoneAlternate: editingTeacher.phoneAlternate,
        whatsappNumber: editingTeacher.whatsappNumber,
        address: editingTeacher.address,
        city: editingTeacher.city,
        state: editingTeacher.state,
        pincode: editingTeacher.pincode,
        emergencyContactName: editingTeacher.emergencyContactName,
        emergencyContactPhone: editingTeacher.emergencyContactPhone,
        relation: editingTeacher.relation,
        photoUrl: editingTeacher.photoUrl,
        notes: editingTeacher.notes,
        preferredLanguage: editingTeacher.preferredLanguage,
        employmentType: editingTeacher.employmentType,
        salaryType: editingTeacher.salaryType,
        isProbation: editingTeacher.isProbation,
        status: editingTeacher.status
      });

      if (editPhotoFile) {
        const up = await uploadTeacherPhoto(row.id, editPhotoFile);
        const newPhotoUrl = up?.data?.photoUrl || up?.photoUrl || null;
        if (newPhotoUrl) {
          setEditingTeacher((prev) => (prev ? { ...prev, photoUrl: newPhotoUrl } : prev));
        }
      }

      setEditingTeacher(null);
      setEditPhotoFile(null);
      await load({ q, status: statusFilter });
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Update failed");
    } finally {
      setEditSaving(false);
    }
  };

  const onResetPassword = async (row) => {
    try {
      const res = await resetTeacherPassword(row.id, { mustChangePassword: true });
      const username = res?.data?.username || row?.username || "";
      const tempPassword = res?.data?.tempPassword;
      if (tempPassword) {
        setTempPasswordDialog({ username, tempPassword });
      } else {
        toast.success("Password reset successful.");
      }
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Password reset failed");
    }
  };

  const columns = [
    {
      key: "photo",
      header: "Photo",
      render: (r) => {
        const src = resolvePhotoUrl(r?.teacherProfile?.photoUrl);
        const label = r?.teacherProfile?.fullName || r?.username || "Teacher";
        return src ? (
          <div style={photoFrameStyle}>
            <img src={src} alt={label} style={buildPhotoStyle(52)} />
          </div>
        ) : (
          <div
            style={{
              ...photoFrameStyle,
              width: 68,
              height: 68,
              padding: 0,
              color: "var(--color-text-secondary)",
              fontSize: 14,
              fontWeight: 800
            }}
          >
            {getTeacherInitials(r)}
          </div>
        );
      }
    },
    {
      key: "username",
      header: "Code",
      render: (r) => (r?.username || "")
    },
    {
      key: "name",
      header: "Name",
      render: (r) => (r?.teacherProfile?.fullName || "")
    },
    {
      key: "phone",
      header: "Phone",
      render: (r) => (r?.teacherProfile?.phonePrimary || "")
    },
    {
      key: "email",
      header: "Email",
      render: (r) => (r?.email || "")
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (r?.teacherProfile?.status ? String(r.teacherProfile.status) : (r?.isActive ? "ACTIVE" : "INACTIVE"))
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) => (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="button secondary" style={{ width: "auto" }} onClick={() => onView(r)}>
            View
          </button>
          <button className="button secondary" style={{ width: "auto" }} onClick={() => onEdit(r)}>
            Edit
          </button>
          <button className="button secondary" style={{ width: "auto" }} onClick={() => onToggleActive(r)}>
            {r?.isActive ? "Suspend" : "Activate"}
          </button>
          <button className="button secondary" style={{ width: "auto" }} onClick={() => void loadAssignedStudents(r)}>
            View Students
          </button>
          <button className="button secondary" style={{ width: "auto" }} onClick={() => void onOpenShiftStudents(r)}>
            Shift Students
          </button>
          <button className="button secondary" style={{ width: "auto" }} onClick={() => onResetPassword(r)}>
            Reset Password
          </button>
        </div>
      )
    }
  ];

  const selectedTeacherLabel = selectedTeacher
    ? `${selectedTeacher?.teacherProfile?.fullName || selectedTeacher?.username || "Teacher"} (${selectedTeacher?.username || ""})`.trim()
    : "";
  const createPhotoPreviewSrc = photoPreview || resolvePhotoUrl(photoUrl);
  const createPhotoPreviewLabel = photoPreview ? "Selected Photo" : "Photo Preview";
  const teacherActionsLocked = shouldDisableCapacityAction(capacitySnapshot, "teachers");
  const teacherLimitMessage = buildCapacityLimitMessage(capacitySnapshot?.usage?.teachers, "Teacher");

  if (loading && !rows.length) {
    return <SkeletonLoader variant="table" rows={6} />;
  }

  const teacherPerformanceColumns = [
    { key: "teacher", header: "Teacher", render: (r) => r.teacherName },
    { key: "assignedBatches", header: "Assigned Batches", render: (r) => String(r.assignedBatches) },
    { key: "students", header: "Students", render: (r) => String(r.students) },
    { key: "attendance", header: "Attendance %", render: (r) => asPercentText(r.attendancePercent) },
    { key: "avgScore", header: "Average Score", render: (r) => asPercentText(r.averageScore) },
    { key: "worksheetCompletion", header: "Worksheet Completion %", render: (r) => asPercentText(r.worksheetCompletionPercent) },
    { key: "promotionReady", header: "Promotion Ready", render: (r) => String(r.promotionReady) },
    { key: "highRisk", header: "High Risk", render: (r) => String(r.highRisk) },
    { key: "inactiveStudents", header: "Inactive Students", render: (r) => String(r.inactiveStudents) },
    {
      key: "overallRating",
      header: "Overall Rating",
      render: (r) => (
        <span style={{ padding: "2px 8px", borderRadius: 999, background: `${r.rating.color}22`, color: r.rating.color, fontSize: 12, fontWeight: 700 }}>
          {r.rating.label}
        </span>
      )
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) => (
        <button
          className="button secondary"
          style={{ width: "auto" }}
          onClick={() => {
            const teacherId = String(r.teacherUserId);
            setExpandedByTeacherId((prev) => ({ ...prev, [teacherId]: !prev[teacherId] }));
            if (!detailsLoadingByTeacherId[teacherId]) {
              setDetailsLoadingByTeacherId((prev) => ({ ...prev, [teacherId]: true }));
              const firstStudentId = r.studentsList?.[0]?.studentId;
              if (firstStudentId && !student360Cache[firstStudentId]?.recentActivity) {
                void getStudent360(firstStudentId)
                  .then((resp) => {
                    const data = resp?.data || resp || {};
                    setStudent360Cache((prev) => ({
                      ...prev,
                      [firstStudentId]: {
                        ...(prev[firstStudentId] || {}),
                        recentActivity: Array.isArray(data?.recentActivity) ? data.recentActivity : [],
                        weakTopics: Array.isArray(data?.engagement?.weakTopics?.items)
                          ? data.engagement.weakTopics.items
                          : Array.isArray(data?.weakTopics)
                            ? data.weakTopics
                            : []
                      }
                    }));
                  })
                  .catch(() => {})
                  .finally(() => setDetailsLoadingByTeacherId((prev) => ({ ...prev, [teacherId]: false })));
              } else {
                setDetailsLoadingByTeacherId((prev) => ({ ...prev, [teacherId]: false }));
              }
            }
          }}
        >
          {expandedByTeacherId[String(r.teacherUserId)] ? "Hide" : "Expand"}
        </button>
      )
    }
  ];

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Teacher Performance Dashboard</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              Center-wide performance overview using existing attendance, worksheet, promotion, and batch-health analytics.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="button secondary" style={{ width: "auto" }} onClick={() => void handleCopyPerformance()}>Copy</button>
            <button className="button secondary" style={{ width: "auto" }} onClick={handlePrintPerformance}>Print</button>
            <button className="button secondary" style={{ width: "auto" }} onClick={handleExportPerformanceCsv}>CSV</button>
            <button className="button secondary" style={{ width: "auto" }} onClick={handleExportPerformancePdf}>PDF</button>
            <button className="button secondary" style={{ width: "auto" }} onClick={() => void loadPerformanceAnalytics()} disabled={dashboardLoading}>Refresh</button>
          </div>
        </div>

        {copyState ? <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{copyState}</div> : null}
        {dashboardError ? <div className="error" style={{ fontSize: 12 }}>{dashboardError}</div> : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
          {[
            { label: "Total Teachers", value: dashboardSummary.totalTeachers },
            { label: "Active Teachers", value: dashboardSummary.activeTeachers },
            { label: "Average Student Score", value: `${dashboardSummary.avgStudentScore.toFixed(1)}%` },
            { label: "Average Attendance", value: `${dashboardSummary.avgAttendance.toFixed(1)}%` },
            { label: "Promotion Ready Students", value: dashboardSummary.promotionReadyStudents },
            { label: "High Risk Students", value: dashboardSummary.highRiskStudents }
          ].map((item) => (
            <div key={item.label} style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 10 }}>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase" }}>{item.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{item.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            { key: "all", label: "All Teachers" },
            { key: "excellent", label: "Excellent" },
            { key: "good", label: "Good" },
            { key: "needs-improvement", label: "Needs Improvement" },
            { key: "critical", label: "Critical" },
            { key: "low-attendance", label: "Low Attendance" },
            { key: "low-score", label: "Low Score" },
            { key: "high-risk", label: "High Risk" }
          ].map((f) => (
            <button
              key={f.key}
              className="button secondary"
              style={{
                width: "auto",
                background: performanceFilter === f.key ? "var(--color-bg-muted)" : "transparent",
                borderColor: performanceFilter === f.key ? "var(--color-border-strong)" : "var(--color-border)"
              }}
              onClick={() => setPerformanceFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
          <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 10, display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Teacher Ranking</div>
            {rankingData.slice(0, 5).length ? rankingData.slice(0, 5).map((row, idx) => (
              <div key={`rank-${row.teacherUserId}`} style={{ display: "grid", gridTemplateColumns: "24px 1fr auto", gap: 8, fontSize: 12 }}>
                <div>#{idx + 1}</div>
                <div>{row.teacherName}</div>
                <div>{asNumberText(row.ratingScore)}</div>
              </div>
            )) : <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>No teacher ranking data.</div>}
          </div>

          <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 10, display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Promotion Readiness</div>
            {rankingData.slice(0, 6).map((row) => {
              const pct = row.students > 0 ? Number(((row.promotionReady / row.students) * 100).toFixed(1)) : 0;
              return (
                <div key={`promo-${row.teacherUserId}`} style={{ display: "grid", gap: 2 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span>{row.teacherName}</span><span>{pct.toFixed(1)}%</span></div>
                  <div style={{ height: 6, background: "var(--color-bg-muted)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "#16a34a" }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 10, display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Attendance Comparison</div>
            {rankingData.slice(0, 6).map((row) => {
              const pct = clampPercent(row.attendancePercent) ?? 0;
              return (
                <div key={`att-${row.teacherUserId}`} style={{ display: "grid", gap: 2 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span>{row.teacherName}</span><span>{pct.toFixed(1)}%</span></div>
                  <div style={{ height: 6, background: "var(--color-bg-muted)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "#0ea5e9" }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 10, display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Average Score Comparison</div>
            {rankingData.slice(0, 6).map((row) => {
              const pct = clampPercent(row.averageScore) ?? 0;
              return (
                <div key={`score-${row.teacherUserId}`} style={{ display: "grid", gap: 2 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}><span>{row.teacherName}</span><span>{pct.toFixed(1)}%</span></div>
                  <div style={{ height: 6, background: "var(--color-bg-muted)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "#a855f7" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase" }}>Teacher Quick Filter</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { key: "all", label: "All" },
              { key: "high-risk", label: "High Risk Students" },
              { key: "low-attendance", label: "Low Attendance" },
              { key: "low-score", label: "Low Average Score" },
              { key: "promotion-ready", label: "Promotion Ready" },
              { key: "needs-review", label: "Needs Review" }
            ].map((f) => (
              <button
                key={`quick-${f.key}`}
                className="button secondary"
                style={{
                  width: "auto",
                  background: performanceFilter === f.key ? "var(--color-bg-muted)" : "transparent",
                  borderColor: performanceFilter === f.key ? "var(--color-border-strong)" : "var(--color-border)"
                }}
                onClick={() => setPerformanceFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {dashboardLoading ? (
          <SkeletonLoader variant="table" rows={3} />
        ) : filteredPerformanceRows.length === 0 ? (
          <div style={{ border: "1px dashed var(--color-border)", borderRadius: 8, padding: 14, textAlign: "center", fontSize: 12, color: "var(--color-text-muted)" }}>
            No teachers found for the selected filter.
          </div>
        ) : (
          <DataTable columns={teacherPerformanceColumns} rows={filteredPerformanceRows} keyField="teacherUserId" />
        )}

        {filteredPerformanceRows.filter((row) => expandedByTeacherId[String(row.teacherUserId)]).map((row) => {
          const teacherId = String(row.teacherUserId);
          const teacherBatchIds = teacherBatchIdsByTeacher.get(teacherId) || new Set();
          const teacherBatchRows = batchHealthItems.filter((batch) => teacherBatchIds.has(String(batch?.batchId || batch?.id || "")));

          const weakTopicCounter = new Map();
          const riskDistribution = { critical: 0, high: 0, normal: 0 };
          const recentActivity = [];

          for (const student of row.studentsList || []) {
            const cached = student360Cache[student.studentId] || {};
            const weakTopics = Array.isArray(cached?.weakTopics) ? cached.weakTopics : [];
            for (const topic of weakTopics) {
              const key = String(topic?.topic || topic?.name || topic || "").trim();
              if (!key) continue;
              weakTopicCounter.set(key, (weakTopicCounter.get(key) || 0) + 1);
            }

            const risk = String(student?.riskLevel || "").toUpperCase();
            if (risk === "CRITICAL") riskDistribution.critical += 1;
            else if (risk === "HIGH") riskDistribution.high += 1;
            else riskDistribution.normal += 1;

            const acts = Array.isArray(cached?.recentActivity) ? cached.recentActivity : [];
            for (const act of acts.slice(0, 3)) {
              recentActivity.push({
                studentName: student.fullName,
                date: act?.date || "",
                title: act?.title || "Activity",
                detail: act?.detail || ""
              });
            }
          }

          const topWeakTopics = Array.from(weakTopicCounter.entries())
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 6);

          recentActivity.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

          return (
            <div key={`expanded-dashboard-${teacherId}`} style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 10, display: "grid", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{row.teacherName}</div>
              {detailsLoadingByTeacherId[teacherId] ? (
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Loading expanded details...</div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
                    <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 10, display: "grid", gap: 4 }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>Batch Health Summary</div>
                      <div style={{ fontSize: 12 }}>Batches: <strong>{row.assignedBatches}</strong></div>
                      <div style={{ fontSize: 12 }}>Avg Attendance: <strong>{asPercentText(row.attendancePercent)}</strong></div>
                      <div style={{ fontSize: 12 }}>Worksheet Completion: <strong>{asPercentText(row.worksheetCompletionPercent)}</strong></div>
                      <div style={{ fontSize: 12 }}>At-risk Batches: <strong>{teacherBatchRows.filter((b) => Number(b?.operationalHealthScore || 0) < 65).length}</strong></div>
                    </div>

                    <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 10, display: "grid", gap: 4 }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>Promotion Summary</div>
                      <div style={{ fontSize: 12 }}>Promotion Ready: <strong>{row.promotionReady}</strong></div>
                      <div style={{ fontSize: 12 }}>Students: <strong>{row.students}</strong></div>
                      <div style={{ fontSize: 12 }}>Readiness Rate: <strong>{row.students ? ((row.promotionReady / row.students) * 100).toFixed(1) : "0.0"}%</strong></div>
                    </div>

                    <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 10, display: "grid", gap: 4 }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>Student Risk Distribution</div>
                      <div style={{ fontSize: 12 }}>Critical: <strong>{riskDistribution.critical}</strong></div>
                      <div style={{ fontSize: 12 }}>High: <strong>{riskDistribution.high}</strong></div>
                      <div style={{ fontSize: 12 }}>Normal: <strong>{riskDistribution.normal}</strong></div>
                    </div>
                  </div>

                  <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 10, display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>Weak Topics Across Batches</div>
                    {topWeakTopics.length ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {topWeakTopics.map(([topic, count]) => (
                          <span key={`${teacherId}-${topic}`} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "var(--color-bg-muted)", color: "var(--color-text-muted)" }}>
                            {topic} ({count})
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>No weak topic data available yet.</div>
                    )}
                  </div>

                  <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 10, display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>Recent Activity</div>
                    {recentActivity.length ? recentActivity.slice(0, 8).map((item, idx) => (
                      <div key={`${teacherId}-activity-${idx}`} style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 8, borderBottom: "1px dashed var(--color-border)", paddingBottom: 6 }}>
                        <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{item.date ? String(item.date).slice(0, 10) : "-"}</div>
                        <div style={{ display: "grid", gap: 2 }}>
                          <div style={{ fontSize: 12, fontWeight: 700 }}>{item.title} • {item.studentName}</div>
                          {item.detail ? <div style={{ fontSize: 12 }}>{item.detail}</div> : null}
                        </div>
                      </div>
                    )) : (
                      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>No recent activity captured.</div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <PageHeader title="Teachers" subtitle="Create and manage teachers for this center." />

      <CapacityInlineNotice
        title="Teacher seats"
        metric={capacitySnapshot?.usage?.teachers}
        loading={capacityLoading}
        error={capacityError}
        onRetry={retryCapacity}
        requestHref={capacitySnapshot ? buildCapacityRequestHref(capacitySnapshot, "teachers") : "#"}
      />

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      {tempPasswordDialog ? (
        <div className="card" style={{ display: "grid", gap: 10, maxWidth: 560 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 800 }}>Temporary Password</div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Save this now. It will not be shown again.</div>
            </div>
            <button className="button secondary" style={{ width: "auto" }} onClick={() => setTempPasswordDialog(null)}>
              Close
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 8, alignItems: "center" }}>
            <div style={{ color: "var(--color-text-muted)" }}>Username</div>
            <div style={{ fontWeight: 700 }}>{tempPasswordDialog.username}</div>

            <div style={{ color: "var(--color-text-muted)" }}>Temporary Password</div>
            <div style={{ fontWeight: 700 }}>{tempPasswordDialog.tempPassword}</div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className="button secondary"
              style={{ width: "auto" }}
              onClick={async () => {
                const text = tempPasswordDialog.tempPassword;
                try {
                  await navigator.clipboard.writeText(text);
                  toast.success("Copied!");
                } catch {
                  toast("Could not copy to clipboard");
                }
              }}
            >
              Copy
            </button>
          </div>
        </div>
      ) : null}

      <form className="card" onSubmit={onCreate} style={{ display: "grid", gap: 10, maxWidth: 920 }}>
        <h3 style={{ marginTop: 0 }}>Teachers</h3>

        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase" }}>Basic</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <label>
            Teacher Code
            <input className="input" value="Auto-generated" readOnly disabled />
          </label>
          <label>
            Full Name
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Teacher name" required />
          </label>
          <label>
            Phone
            <input className="input" value={phonePrimary} onChange={(e) => setPhonePrimary(e.target.value)} placeholder="9999999999" />
          </label>
          <label>
            Email (optional)
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </label>
          <label>
            Joining Date
            <input className="input" type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} />
          </label>
          <label>
            Qualification
            <input className="input" value={qualification} onChange={(e) => setQualification(e.target.value)} placeholder="B.Ed / M.Sc" />
          </label>
          <label>
            Experience (years)
            <input className="input" type="number" min="0" value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)} placeholder="2" />
          </label>
          <label>
            Specialization
            <input className="input" value={specialization} onChange={(e) => setSpecialization(e.target.value)} placeholder="Mental Math" />
          </label>
          <label>
            Preferred Language
            <input className="input" value={preferredLanguage} onChange={(e) => setPreferredLanguage(e.target.value)} placeholder="English" />
          </label>
          <label>
            Status
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
          </label>
          <label>
            Employment Type
            <select className="select" value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
              <option value="FULL_TIME">Full-time</option>
              <option value="PART_TIME">Part-time</option>
            </select>
          </label>
          <label>
            Salary Type
            <select className="select" value={salaryType} onChange={(e) => setSalaryType(e.target.value)}>
              <option value="FIXED">Fixed</option>
              <option value="HOURLY">Hourly</option>
            </select>
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 22 }}>
            <input type="checkbox" checked={isProbation} onChange={(e) => setIsProbation(e.target.checked)} />
            Is probation
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 22 }}>
            <input type="checkbox" checked={createLoginAccount} onChange={(e) => setCreateLoginAccount(e.target.checked)} />
            Create login account
          </label>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", marginTop: 6 }}>Contact</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <label>
            Alternate Phone
            <input className="input" value={phoneAlternate} onChange={(e) => setPhoneAlternate(e.target.value)} placeholder="9876543210" />
          </label>
          <label>
            WhatsApp Number
            <input className="input" value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} placeholder="9876543210" />
          </label>
          <label>
            Address
            <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street / Area" />
          </label>
          <label>
            City
            <input className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
          </label>
          <label>
            State
            <input className="input" value={stateName} onChange={(e) => setStateName(e.target.value)} placeholder="State" />
          </label>
          <label>
            Pincode
            <input className="input" value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="400001" />
          </label>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", marginTop: 6 }}>Emergency</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <label>
            Emergency Contact Name
            <input className="input" value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} placeholder="Contact person" />
          </label>
          <label>
            Emergency Contact Phone
            <input className="input" value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} placeholder="9999999999" />
          </label>
          <label>
            Relation
            <input className="input" value={relation} onChange={(e) => setRelation(e.target.value)} placeholder="Spouse / Parent" />
          </label>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", marginTop: 6 }}>Profile</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <label>
            Photo URL
            <input className="input" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://..." />
          </label>
          <label>
            Photo Upload
            <input
              className="input"
              type="file"
              accept="image/png,image/jpg,image/jpeg"
              onChange={(e) => setPhotoFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
            />
          </label>
          {createPhotoPreviewSrc ? (
            <div style={{ gridColumn: "1 / -1", display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{createPhotoPreviewLabel}</div>
              <div style={photoFrameStyle}>
                <img src={createPhotoPreviewSrc} alt="Teacher selected" style={buildPhotoStyle(160, "contain")} />
              </div>
            </div>
          ) : null}
          <label style={{ gridColumn: "1 / -1" }}>
            Notes
            <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes" rows={3} />
          </label>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="button" style={{ width: "auto" }} disabled={creating || teacherActionsLocked} title={teacherLimitMessage}>
            {creating ? "Creating..." : "Create Teacher"}
          </button>
          <button type="button" className="button secondary" style={{ width: "auto" }} onClick={resetForm} disabled={creating}>
            Reset
          </button>
        </div>
      </form>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div>
          <h3 style={{ margin: 0 }}>Teacher List</h3>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Search and filter teachers.</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, alignItems: "end" }}>
          <label>
            Search name or phone
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone" />
          </label>
          <label>
            All Status
            <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
          </label>
          <button
            type="button"
            className="button secondary"
            style={{ width: "auto" }}
            onClick={() => void load({ q, status: statusFilter })}
          >
            Refresh
          </button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        keyField="id"
      />

      {viewTeacher ? (
        <div className="card" style={{ display: "grid", gap: 10, maxWidth: 920 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ margin: 0 }}>View Teacher</h3>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Read-only teacher details.</div>
            </div>
            <button className="button secondary" style={{ width: "auto" }} onClick={() => setViewTeacher(null)}>
              Close
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <label>Teacher Code<input className="input" value={viewTeacher.username || ""} readOnly /></label>
            <label>Full Name<input className="input" value={viewTeacher.fullName || ""} readOnly /></label>
            <label>Phone<input className="input" value={viewTeacher.phonePrimary || ""} readOnly /></label>
            <label>Email<input className="input" value={viewTeacher.email || ""} readOnly /></label>
            <label>Joining Date<input className="input" value={viewTeacher.joiningDate || ""} readOnly /></label>
            <label>Qualification<input className="input" value={viewTeacher.qualification || ""} readOnly /></label>
            <label>Experience Years<input className="input" value={viewTeacher.experienceYears === "" ? "" : String(viewTeacher.experienceYears)} readOnly /></label>
            <label>Specialization<input className="input" value={viewTeacher.specialization || ""} readOnly /></label>
            <label>Preferred Language<input className="input" value={viewTeacher.preferredLanguage || ""} readOnly /></label>
            <label>Status<input className="input" value={viewTeacher.status || ""} readOnly /></label>
            <label>Employment Type<input className="input" value={viewTeacher.employmentType || ""} readOnly /></label>
            <label>Salary Type<input className="input" value={viewTeacher.salaryType || ""} readOnly /></label>
            <label>Alternate Phone<input className="input" value={viewTeacher.phoneAlternate || ""} readOnly /></label>
            <label>WhatsApp Number<input className="input" value={viewTeacher.whatsappNumber || ""} readOnly /></label>
            <label>Address<input className="input" value={viewTeacher.address || ""} readOnly /></label>
            <label>City<input className="input" value={viewTeacher.city || ""} readOnly /></label>
            <label>State<input className="input" value={viewTeacher.state || ""} readOnly /></label>
            <label>Pincode<input className="input" value={viewTeacher.pincode || ""} readOnly /></label>
            <label>Emergency Contact Name<input className="input" value={viewTeacher.emergencyContactName || ""} readOnly /></label>
            <label>Emergency Contact Phone<input className="input" value={viewTeacher.emergencyContactPhone || ""} readOnly /></label>
            <label>Relation<input className="input" value={viewTeacher.relation || ""} readOnly /></label>
            <label>Photo URL<input className="input" value={viewTeacher.photoUrl || ""} readOnly /></label>
            <label>Is Probation<input className="input" value={viewTeacher.isProbation ? "Yes" : "No"} readOnly /></label>
            <label style={{ gridColumn: "1 / -1" }}>Notes<textarea className="input" value={viewTeacher.notes || ""} readOnly rows={3} /></label>
            {resolvePhotoUrl(viewTeacher.photoUrl) ? (
              <div style={{ gridColumn: "1 / -1", display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Photo Preview</div>
                <div style={photoFrameStyle}>
                  <img
                    src={resolvePhotoUrl(viewTeacher.photoUrl)}
                    alt="Teacher"
                    style={buildPhotoStyle(160, "contain")}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {editingTeacher ? (
        <form className="card" onSubmit={(e) => { e.preventDefault(); void onSaveEdit(editingTeacher); }} style={{ display: "grid", gap: 10, maxWidth: 920 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ margin: 0 }}>Edit Teacher</h3>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Update all teacher details.</div>
            </div>
            <button type="button" className="button secondary" style={{ width: "auto" }} onClick={onCancelEdit}>
              Close
            </button>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase" }}>Basic</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <label>
              Teacher Code
              <input className="input" value={editingTeacher.username || ""} readOnly disabled />
            </label>
            <label>
              Full Name
              <input className="input" value={editingTeacher.fullName} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, fullName: e.target.value }))} required />
            </label>
            <label>
              Phone
              <input className="input" value={editingTeacher.phonePrimary} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, phonePrimary: e.target.value }))} />
            </label>
            <label>
              Email
              <input className="input" value={editingTeacher.email} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, email: e.target.value }))} />
            </label>
            <label>
              Joining Date
              <input className="input" type="date" value={editingTeacher.joiningDate} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, joiningDate: e.target.value }))} />
            </label>
            <label>
              Qualification
              <input className="input" value={editingTeacher.qualification} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, qualification: e.target.value }))} />
            </label>
            <label>
              Experience (years)
              <input className="input" type="number" min="0" value={editingTeacher.experienceYears} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, experienceYears: e.target.value }))} />
            </label>
            <label>
              Specialization
              <input className="input" value={editingTeacher.specialization} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, specialization: e.target.value }))} />
            </label>
            <label>
              Preferred Language
              <input className="input" value={editingTeacher.preferredLanguage} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, preferredLanguage: e.target.value }))} />
            </label>
            <label>
              Status
              <select className="select" value={editingTeacher.status} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, status: e.target.value }))}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            </label>
            <label>
              Employment Type
              <select className="select" value={editingTeacher.employmentType} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, employmentType: e.target.value }))}>
                <option value="FULL_TIME">Full-time</option>
                <option value="PART_TIME">Part-time</option>
              </select>
            </label>
            <label>
              Salary Type
              <select className="select" value={editingTeacher.salaryType} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, salaryType: e.target.value }))}>
                <option value="FIXED">Fixed</option>
                <option value="HOURLY">Hourly</option>
              </select>
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 22 }}>
              <input type="checkbox" checked={editingTeacher.isProbation} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, isProbation: e.target.checked }))} />
              Is probation
            </label>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", marginTop: 6 }}>Contact</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <label>
              Alternate Phone
              <input className="input" value={editingTeacher.phoneAlternate} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, phoneAlternate: e.target.value }))} />
            </label>
            <label>
              WhatsApp Number
              <input className="input" value={editingTeacher.whatsappNumber} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, whatsappNumber: e.target.value }))} />
            </label>
            <label>
              Address
              <input className="input" value={editingTeacher.address} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, address: e.target.value }))} />
            </label>
            <label>
              City
              <input className="input" value={editingTeacher.city} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, city: e.target.value }))} />
            </label>
            <label>
              State
              <input className="input" value={editingTeacher.state} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, state: e.target.value }))} />
            </label>
            <label>
              Pincode
              <input className="input" value={editingTeacher.pincode} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, pincode: e.target.value }))} />
            </label>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", marginTop: 6 }}>Emergency</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <label>
              Emergency Contact Name
              <input className="input" value={editingTeacher.emergencyContactName} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, emergencyContactName: e.target.value }))} />
            </label>
            <label>
              Emergency Contact Phone
              <input className="input" value={editingTeacher.emergencyContactPhone} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, emergencyContactPhone: e.target.value }))} />
            </label>
            <label>
              Relation
              <input className="input" value={editingTeacher.relation} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, relation: e.target.value }))} />
            </label>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", marginTop: 6 }}>Profile</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <label>
              Photo URL
              <input className="input" value={editingTeacher.photoUrl} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, photoUrl: e.target.value }))} />
            </label>
            <label>
              Photo Upload
              <input
                className="input"
                type="file"
                accept="image/png,image/jpg,image/jpeg"
                onChange={(e) => setEditPhotoFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
              />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              Notes
              <textarea className="input" value={editingTeacher.notes} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, notes: e.target.value }))} rows={3} />
            </label>
            {resolvePhotoUrl(editingTeacher.photoUrl) ? (
              <div style={{ gridColumn: "1 / -1", display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Current Photo</div>
                <div style={photoFrameStyle}>
                  <img
                    src={resolvePhotoUrl(editingTeacher.photoUrl)}
                    alt="Teacher"
                    style={buildPhotoStyle(160, "contain")}
                  />
                </div>
              </div>
            ) : null}
            {editPhotoFile ? (
              <div style={{ gridColumn: "1 / -1", display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Selected New Photo</div>
                <div style={photoFrameStyle}>
                  <img
                    src={editPhotoPreview}
                    alt="Teacher new"
                    style={buildPhotoStyle(160, "contain")}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button type="submit" className="button" style={{ width: "auto" }} disabled={editSaving}>
              {editSaving ? "Saving..." : "Save Changes"}
            </button>
            <button type="button" className="button secondary" style={{ width: "auto" }} disabled={editSaving} onClick={onCancelEdit}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {selectedTeacher ? (
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <div>
            <h3 style={{ margin: 0 }}>Students Assigned to Teacher</h3>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Active enrollments for this teacher.</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>{selectedTeacherLabel}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 6 }}>
              Showing {assignedStudents.length} of {assignedStudentsTotal} students
            </div>
          </div>

          {loadingStudents ? <SkeletonLoader variant="list" rows={3} /> : null}

          <DataTable
            columns={[
              { key: "admissionNo", header: "Student Code", render: (r) => r?.admissionNo || "" },
              {
                key: "studentName",
                header: "Student Name",
                render: (r) => `${r?.firstName || ""} ${r?.lastName || ""}`.trim()
              },
              {
                key: "course",
                header: "Course",
                render: (r) => {
                  const assignedCourseNames = Array.isArray(r?.assignedCourses)
                    ? r.assignedCourses
                      .map((item) => item?.course?.name || "")
                      .filter(Boolean)
                    : [];

                  if (assignedCourseNames.length) {
                    return assignedCourseNames.join(", ");
                  }

                  return r?.course?.name || "";
                }
              },
              {
                key: "level",
                header: "Level",
                render: (r) => {
                  const displayLevel = r?.effectiveLevel || r?.level || null;
                  if (!displayLevel) return "";
                  return displayLevel.rank != null
                    ? `${displayLevel.name} / ${displayLevel.rank}`
                    : displayLevel.name || "";
                }
              }
            ]}
            rows={assignedStudents}
            keyField="id"
          />

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              className="button secondary"
              style={{ width: "auto" }}
              disabled={loadingStudents || assignedStudentsPage === 0}
              onClick={() => void loadAssignedStudents(selectedTeacher, assignedStudentsPage - 1)}
            >
              Prev
            </button>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              Page {assignedStudentsPage + 1} of {Math.max(1, Math.ceil(assignedStudentsTotal / ASSIGNED_STUDENTS_PAGE_SIZE))}
            </div>
            <button
              className="button secondary"
              style={{ width: "auto" }}
              disabled={loadingStudents || (assignedStudentsPage + 1) * ASSIGNED_STUDENTS_PAGE_SIZE >= assignedStudentsTotal}
              onClick={() => void loadAssignedStudents(selectedTeacher, assignedStudentsPage + 1)}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {shiftSourceTeacher ? (
        <form className="card" onSubmit={onSaveShiftStudents} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <h3 style={{ margin: 0 }}>Shift Students To Another Teacher</h3>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Source: {shiftSourceTeacher?.teacherProfile?.fullName || shiftSourceTeacher?.username || "Teacher"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="button secondary"
                style={{ width: "auto" }}
                onClick={() => {
                  setShiftSourceTeacher(null);
                  setShiftTargetTeacherId("");
                  setShiftError("");
                }}
                disabled={shiftSaving}
              >
                Cancel
              </button>
              <button className="button" style={{ width: "auto" }} disabled={shiftSaving || !shiftTargetTeacherId}>
                {shiftSaving ? "Shifting..." : "Shift Now"}
              </button>
            </div>
          </div>

          {shiftError ? <p className="error">{shiftError}</p> : null}

          <label>
            Target Teacher
            <select className="select" value={shiftTargetTeacherId} onChange={(e) => setShiftTargetTeacherId(e.target.value)}>
              <option value="">Select</option>
              {rows
                .filter((t) => t?.id !== shiftSourceTeacher?.id && t?.isActive)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t?.teacherProfile?.fullName || t?.username || t?.email}
                  </option>
                ))}
            </select>
          </label>
        </form>
      ) : null}
    </section>
  );
}

export { CenterTeachersPage };
