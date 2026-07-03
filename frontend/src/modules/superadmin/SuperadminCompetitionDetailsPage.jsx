import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { CompetitionModuleNav } from "./CompetitionModuleNav";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { CompetitionWorkflowTimeline } from "../../components/CompetitionWorkflowTimeline";
import { getCompetitionDetail, getLeaderboard, finalizeCompetitionAwards, listCompetitionCertificates, generateCompetitionCertificates, publishCompetitionCertificates } from "../../services/competitionsService";
import { listBusinessPartners } from "../../services/businessPartnersService";
import { listCompetitionQuestionBank, createCompetitionQuestionBankEntry, updateCompetitionQuestionBankEntry, deleteCompetitionQuestionBankEntry, exportCompetitionQuestionBankCsv, importCompetitionQuestionBank } from "../../services/competitionQuestionBankService";
import {
  assignCompetitionBusinessPartners,
  cancelCompetitionWorksheetAssignment,
  createCompetitionWorksheetAssignments,
  listCompetitionBusinessPartners,
  publishCompetitionWorksheetResults,
  removeCompetitionBusinessPartner
} from "../../services/competitionsService";
import { generateCertificatePdf, generateQrDataUrl, preloadTemplateImages } from "../../utils/pdfExport";

function formatDateValue(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.remove();
  URL.revokeObjectURL(url);
}

function renderExpression(question) {
  if (!question) return "—";
  const operands = question.operands || {};
  const terms = Array.isArray(operands.terms) ? operands.terms : [operands.a ?? operands.x ?? "", operands.b ?? operands.y ?? ""];
  const values = terms.map((item) => item ?? "");
  const op = String(question.operation || "ADD").toUpperCase();
  if (op === "MIX") {
    const operators = Array.isArray(operands.operators) ? operands.operators : [];
    const pieces = values.map((value, index) => {
      const prefix = index === 0 ? "" : ` ${operators[index - 1] || "+"} `;
      return `${prefix}${value}`;
    });
    return pieces.join("");
  }
  return `${values.join(` ${op === "SUB" ? "-" : op === "MUL" ? "×" : op === "DIV" ? "÷" : "+"} `)}`;
}

function getCompetitionStatusBucket(row) {
  const now = Date.now();
  const registrationStart = row?.registrationStartsAt ? new Date(row.registrationStartsAt).getTime() : null;
  const registrationEnd = row?.registrationEndsAt ? new Date(row.registrationEndsAt).getTime() : null;
  const competitionStart = row?.startsAt ? new Date(row.startsAt).getTime() : null;
  const competitionEnd = row?.endsAt ? new Date(row.endsAt).getTime() : null;

  if (row?.status === "ARCHIVED" || row?.isArchived) {
    return "ARCHIVED";
  }
  if (row?.status === "DRAFT") {
    return "DRAFT";
  }
  if (registrationStart && registrationEnd && now >= registrationStart && now <= registrationEnd) {
    return "ENROLLMENT_OPEN";
  }
  if (competitionStart && competitionEnd && now >= competitionStart && now <= competitionEnd) {
    return "RUNNING";
  }
  if (competitionEnd && now > competitionEnd) {
    return "COMPLETED";
  }
  if (row?.status === "SCHEDULED" || row?.workflowStage === "APPROVED" || row?.status === "ACTIVE") {
    return "PUBLISHED";
  }
  return "PUBLISHED";
}

function getCompetitionCourseLevelForRank(competition, rankValue) {
  const rank = Number(rankValue);
  if (!competition?.competitionCourse?.levels?.length || !Number.isFinite(rank)) {
    return null;
  }
  return competition.competitionCourse.levels.find((level) => Number(level.levelNumber) === rank) || null;
}

function buildCompetitionCertificateDetails({ competition, leaderboardRow, certificate }) {
  const courseLevel = getCompetitionCourseLevelForRank(competition, leaderboardRow?.level?.rank ?? leaderboardRow?.levelRank);
  const competitionSnapshot = certificate?.competitionSnapshot || certificate?.metadata?.competition || null;
  const completionDate = competitionSnapshot?.completionDate || leaderboardRow?.submittedAt || certificate?.issuedAt || null;
  const score = competitionSnapshot?.score ?? leaderboardRow?.earnedMarks ?? null;
  const percentage = competitionSnapshot?.percentage ?? leaderboardRow?.percentage ?? null;
  const awardType = certificate?.awardType || competitionSnapshot?.awardType || leaderboardRow?.awardType || "PARTICIPATION";
  const rank = competitionSnapshot?.rank ?? leaderboardRow?.rank ?? null;

  return [
    { label: "Competition", value: `${competition?.title || "—"}${competition?.code ? ` (${competition.code})` : ""}` },
    { label: "Course / Level", value: `${competition?.competitionCourse?.name || "—"}${competition?.competitionCourse?.code ? ` (${competition.competitionCourse.code})` : ""} · ${courseLevel?.title || leaderboardRow?.level?.name || leaderboardRow?.levelName || "—"}` },
    { label: "Rank / Award", value: `${rank ?? "—"} / ${awardType}` },
    { label: "Score / Completed", value: `${score ?? "—"}${percentage !== null && percentage !== undefined ? ` (${percentage}%)` : ""} · ${completionDate ? new Date(completionDate).toLocaleDateString() : "—"}` }
  ];
}

function canManageCompetitionCertificates(competition) {
  if (!competition) return false;
  if (competition.legacyResultStatus) return true;
  return String(competition.resultStatus || "").toUpperCase() === "PUBLISHED";
}

function SuperadminCompetitionDetailsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { competitionId } = useParams();
  const [competition, setCompetition] = useState(null);
  const [businessPartners, setBusinessPartners] = useState([]);
  const [allPartners, setAllPartners] = useState([]);
  const [partnerSearch, setPartnerSearch] = useState("");
  const [selectedPartnerIds, setSelectedPartnerIds] = useState([]);
  const [assigning, setAssigning] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState(location.pathname.endsWith("/worksheets") ? "worksheets" : location.pathname.endsWith("/question-bank") ? "questionBank" : "overview");
  const isQuestionBankRoute = location.pathname.endsWith("/question-bank");
  const [competitionLevels, setCompetitionLevels] = useState([]);
  const [competitionEnrollmentsDetailed, setCompetitionEnrollmentsDetailed] = useState([]);
  const [competitionWorksheetsDetailed, setCompetitionWorksheetsDetailed] = useState([]);
  const [competitionWorksheetAssignments, setCompetitionWorksheetAssignments] = useState([]);
  const [competitionLeaderboard, setCompetitionLeaderboard] = useState([]);
  const [competitionLevelLeaderboards, setCompetitionLevelLeaderboards] = useState([]);
  const [competitionCertificates, setCompetitionCertificates] = useState([]);
  const [certificateSelectedKeys, setCertificateSelectedKeys] = useState([]);
  const [certificateSubmitting, setCertificateSubmitting] = useState(false);
  const [awardsFinalizing, setAwardsFinalizing] = useState(false);
  const [archivedLevelIds, setArchivedLevelIds] = useState([]);
  const [levelFormOpen, setLevelFormOpen] = useState(false);
  const [editingLevelId, setEditingLevelId] = useState(null);
  const [levelForm, setLevelForm] = useState({ name: "", code: "", description: "", isActive: true });
  const [savingLevel, setSavingLevel] = useState(false);
  const [bankItems, setBankItems] = useState([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankError, setBankError] = useState("");
  const [bankQ, setBankQ] = useState("");
  const [pageLimit, setPageLimit] = useState(10);
  const [pageOffset, setPageOffset] = useState(0);
  const [selectedLevelId, setSelectedLevelId] = useState("");
  const [bankCreateForm, setBankCreateForm] = useState({ prompt: "", operation: "ADD", numbers: ["", ""], operators: ["", "+"] });
  const [bankCreating, setBankCreating] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [deleteQuestionTarget, setDeleteQuestionTarget] = useState(null);
  const [previewQuestionId, setPreviewQuestionId] = useState(null);
  const [assignmentWorksheetId, setAssignmentWorksheetId] = useState("");
  const [assignmentDueAt, setAssignmentDueAt] = useState("");
  const [assignmentSelectedStudentIds, setAssignmentSelectedStudentIds] = useState([]);
  const [assignmentSelectionMode, setAssignmentSelectionMode] = useState("selected");
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState("ALL");
  const [assignmentWorksheetFilter, setAssignmentWorksheetFilter] = useState("ALL");
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [assignmentSubmitting, setAssignmentSubmitting] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");
  const [selectedEvaluationAssignmentId, setSelectedEvaluationAssignmentId] = useState("");
  const [publicationSelectedAssignmentIds, setPublicationSelectedAssignmentIds] = useState([]);

  useEffect(() => {
    let ignore = false;

    async function loadCompetition() {
      setLoading(true);
      setError("");
      try {
        const [response, leaderboardResponse] = await Promise.all([
          getCompetitionDetail(competitionId),
          getLeaderboard(competitionId).catch(() => null)
        ]);
        if (!ignore) {
          const item = response?.data || null;
          setCompetition(item);
          setCompetitionLevels(item?.competitionCourse?.levels || []);
          setCompetitionEnrollmentsDetailed(item?.competitionEnrollmentsDetailed || []);
          setCompetitionWorksheetsDetailed(item?.competitionWorksheetsDetailed || []);
          setCompetitionWorksheetAssignments(item?.competitionWorksheetAssignments || []);
          setCompetitionLeaderboard(Array.isArray(leaderboardResponse?.data?.leaderboard) ? leaderboardResponse.data.leaderboard : []);
          setCompetitionLevelLeaderboards(Array.isArray(leaderboardResponse?.data?.levelLeaderboards) ? leaderboardResponse.data.levelLeaderboards : []);
        }
        const certificatesResponse = canManageCompetitionCertificates(item)
          ? await listCompetitionCertificates(competitionId).catch(() => null)
          : null;
        if (!ignore) {
          setCompetitionCertificates(Array.isArray(certificatesResponse?.data?.data?.items) ? certificatesResponse.data.data.items : []);
        }
      } catch (err) {
        if (!ignore) {
          setError(err?.message || "Failed to load competition details.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    async function loadBusinessPartners() {
      try {
        const response = await listCompetitionBusinessPartners(competitionId);
        if (!ignore) {
          setBusinessPartners(response?.data || []);
        }
      } catch (err) {
        if (!ignore) {
          setBusinessPartners([]);
        }
      }
    }

    async function loadAllPartners() {
      try {
        const response = await listBusinessPartners({ limit: 100, offset: 0 });
        const items = Array.isArray(response?.data?.items)
          ? response.data.items
          : Array.isArray(response?.data)
            ? response.data
            : Array.isArray(response?.items)
              ? response.items
              : [];
        if (!ignore) {
          setAllPartners(items);
        }
      } catch (err) {
        if (!ignore) {
          setAllPartners([]);
        }
      }
    }

    if (competitionId) {
      void loadCompetition();
      void loadBusinessPartners();
      void loadAllPartners();
    }

    return () => {
      ignore = true;
    };
  }, [competitionId]);

  const filteredPartners = useMemo(() => {
    const query = partnerSearch.trim().toLowerCase();
    if (!query) return allPartners;
    return allPartners.filter((partner) => `${partner?.name || ""} ${partner?.code || ""}`.toLowerCase().includes(query));
  }, [allPartners, partnerSearch]);

  const overviewItems = useMemo(() => [
    { label: "Competition Name", value: competition?.title || "—" },
    { label: "Competition Code", value: competition?.code || "—" },
    { label: "Foundation Template", value: competition?.template?.name || competition?.templateName || "—" },
    { label: "Description", value: competition?.description || "—" },
    { label: "Enrollment Window", value: `${competition?.registrationStartsAt ? formatDateValue(competition.registrationStartsAt) : "—"} → ${competition?.registrationEndsAt ? formatDateValue(competition.registrationEndsAt) : "—"}` },
    { label: "Practice Window", value: "—" },
    { label: "Competition Window", value: `${competition?.startsAt ? formatDateValue(competition.startsAt) : "—"} → ${competition?.endsAt ? formatDateValue(competition.endsAt) : "—"}` },
    { label: "Attempt Limit", value: competition?.attemptLimit ?? "—" },
    // Status is shown via centralized CompetitionWorkflowTimeline in the header
    { label: "Total Business Partners", value: competition?.businessPartnerMappings?.length ?? 0 }
  ], [competition]);

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "competitionLevels", label: "Competition Course Levels" },
    { key: "worksheets", label: "Worksheets" },
    { key: "rankings", label: "Rankings" },
    { key: "schedule", label: "Schedule" },
    { key: "businessPartners", label: "Business Partners" },
    { key: "registrations", label: "Registrations" }
  ];

  const summaryCards = [
    { label: "Business Partners Assigned", value: businessPartners.length },
    { label: "Franchises", value: 0 },
    { label: "Centers", value: 0 },
    { label: "Teachers", value: 0 },
    { label: "Students", value: 0 }
  ];

  const visibleCompetitionLevels = useMemo(() => competitionLevels.filter((level) => !archivedLevelIds.includes(level.id)), [competitionLevels, archivedLevelIds]);
  const publishedCompetitionWorksheets = useMemo(() => {
    return competitionWorksheetsDetailed.filter((row) => {
      const status = String(row?.status || "").toUpperCase();
      return status === "PUBLISHED" && row?.isActive !== false && row?.worksheet?.isPublished !== false;
    });
  }, [competitionWorksheetsDetailed]);
  const competitionWorksheetMetaById = useMemo(() => new Map(competitionWorksheetsDetailed.map((row) => [row.worksheetId, row])), [competitionWorksheetsDetailed]);
  const selectedAssignmentWorksheet = useMemo(() => {
    return publishedCompetitionWorksheets.find((row) => row.worksheetId === assignmentWorksheetId) || publishedCompetitionWorksheets[0] || null;
  }, [assignmentWorksheetId, publishedCompetitionWorksheets]);
  const eligibleWorksheetStudents = useMemo(() => {
    if (!selectedAssignmentWorksheet?.levelId) return [];
    return competitionEnrollmentsDetailed.filter((row) => row?.levelId === selectedAssignmentWorksheet.levelId);
  }, [competitionEnrollmentsDetailed, selectedAssignmentWorksheet]);
  const filteredWorksheetAssignments = useMemo(() => {
    const query = assignmentSearch.trim().toLowerCase();
    return competitionWorksheetAssignments.filter((row) => {
      if (assignmentStatusFilter !== "ALL" && String(row?.status || "").toUpperCase() !== assignmentStatusFilter) {
        return false;
      }
      if (assignmentWorksheetFilter !== "ALL" && row?.worksheetId !== assignmentWorksheetFilter) {
        return false;
      }
      if (!query) return true;
      const studentName = `${row?.student?.firstName || ""} ${row?.student?.lastName || ""} ${row?.student?.admissionNo || ""}`.toLowerCase();
      const worksheetTitle = String(row?.worksheet?.title || "").toLowerCase();
      return studentName.includes(query) || worksheetTitle.includes(query) || String(row?.studentId || "").toLowerCase().includes(query);
    });
  }, [assignmentSearch, assignmentStatusFilter, assignmentWorksheetFilter, competitionWorksheetAssignments]);
  const selectedEvaluationAssignment = useMemo(() => {
    const selected = filteredWorksheetAssignments.find((row) => row.id === selectedEvaluationAssignmentId) || null;
    if (selected) return selected;
    return filteredWorksheetAssignments.find((row) => row?.submission?.evaluationSnapshot) || null;
  }, [filteredWorksheetAssignments, selectedEvaluationAssignmentId]);
  const publishableWorksheetAssignments = useMemo(() => {
    return filteredWorksheetAssignments.filter((row) => String(row?.submission?.status || "").toUpperCase() === "REVIEWED" && !row?.submission?.publishedAt);
  }, [filteredWorksheetAssignments]);
  const leaderboardDisplayRows = competitionLeaderboard;
  const competitionCertificateByKey = useMemo(() => {
    const map = new Map();
    for (const cert of competitionCertificates) {
      const key = `${cert?.studentId || ""}:${cert?.competitionCourseLevelId || ""}`;
      map.set(key, cert);
    }
    return map;
  }, [competitionCertificates]);

  useEffect(() => {
    if (isQuestionBankRoute) {
      navigate(`/superadmin/competition/${competitionId}`, { replace: true });
    }
  }, [competitionId, isQuestionBankRoute, navigate]);

  useEffect(() => {
    if (location.pathname.endsWith("/worksheets")) {
      setActiveTab("worksheets");
    } else if (location.pathname.endsWith("/question-bank")) {
      setActiveTab("questionBank");
    }
  }, [location.pathname]);

  useEffect(() => {
    if (!assignmentWorksheetId && publishedCompetitionWorksheets.length) {
      setAssignmentWorksheetId(publishedCompetitionWorksheets[0].worksheetId);
    }
  }, [assignmentWorksheetId, publishedCompetitionWorksheets]);

  useEffect(() => {
    setAssignmentSelectedStudentIds([]);
    setAssignmentSelectionMode("selected");
    setAssignmentError("");
  }, [assignmentWorksheetId]);

  useEffect(() => {
    setPublicationSelectedAssignmentIds((current) =>
      current.filter((assignmentId) => publishableWorksheetAssignments.some((row) => row.id === assignmentId))
    );
  }, [publishableWorksheetAssignments]);

  const visibleBankItems = useMemo(() => bankItems.slice(pageOffset, pageOffset + pageLimit), [bankItems, pageOffset, pageLimit]);

  const previewQuestion = useMemo(() => {
    return visibleBankItems.find((item) => item.id === previewQuestionId) || visibleBankItems[0] || null;
  }, [visibleBankItems, previewQuestionId]);

  const resetLevelForm = () => {
    setLevelFormOpen(false);
    setEditingLevelId(null);
    setLevelForm({ name: "", code: "", description: "", isActive: true });
  };

  const handleOpenCreateLevel = () => {
    setEditingLevelId(null);
    setLevelForm({ name: "", code: "", description: "", isActive: true });
    setLevelFormOpen(true);
  };

  const handleOpenEditLevel = (level) => {
    setEditingLevelId(level.id);
    setLevelForm({
      name: level?.name || "",
      code: level?.rank ? String(level.rank) : "",
      description: level?.description || "",
      isActive: true
    });
    setLevelFormOpen(true);
  };

  const handleArchiveLevel = (levelId) => {
    setArchivedLevelIds((current) => (current.includes(levelId) ? current : [...current, levelId]));
    toast.success("Level archived.");
  };

  const handleToggleWorksheetStudent = (studentId) => {
    setAssignmentSelectedStudentIds((current) => (
      current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId]
    ));
    setAssignmentSelectionMode("selected");
  };

  const refreshCompetitionWorksheetState = async () => {
    const response = await getCompetitionDetail(competitionId);
    const item = response?.data || null;
    setCompetitionEnrollmentsDetailed(item?.competitionEnrollmentsDetailed || []);
    setCompetitionWorksheetsDetailed(item?.competitionWorksheetsDetailed || []);
    setCompetitionWorksheetAssignments(item?.competitionWorksheetAssignments || []);
  };

  const handleSubmitWorksheetAssignments = async (event) => {
    event.preventDefault();
    setAssignmentError("");

    if (!selectedAssignmentWorksheet?.worksheetId) {
      toast.error("Select a published worksheet first.");
      return;
    }

    const assignAllEligible = assignmentSelectionMode === "all";
    const selectedStudentIds = [...new Set(assignmentSelectedStudentIds.filter(Boolean))];

    if (!assignAllEligible && !selectedStudentIds.length) {
      toast.error("Select at least one student.");
      return;
    }

    setAssignmentSubmitting(true);
    try {
      const payload = {
        worksheetId: selectedAssignmentWorksheet.worksheetId,
        dueAt: assignmentDueAt || null,
        assignAllEligible
      };

      if (!assignAllEligible) {
        if (selectedStudentIds.length === 1) {
          payload.studentId = selectedStudentIds[0];
        } else {
          payload.studentIds = selectedStudentIds;
        }
      }

      const response = await createCompetitionWorksheetAssignments(competitionId, payload);
      const result = response?.data || response;
      const created = Array.isArray(result?.data?.created) ? result.data.created : [];
      const skippedDuplicateCount = result?.data?.skippedDuplicateCount ?? 0;
      if (created.length) {
        setCompetitionWorksheetAssignments((current) => [...created, ...current]);
      }
      setAssignmentSelectedStudentIds([]);
      setAssignmentSelectionMode("selected");
      await refreshCompetitionWorksheetState();
      if (assignAllEligible && skippedDuplicateCount) {
        toast.success(`Assigned ${created.length} worksheet(s). ${skippedDuplicateCount} already had active assignments.`);
      } else {
        toast.success(`Assigned ${created.length} worksheet(s).`);
      }
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || "Failed to assign worksheet.";
      setAssignmentError(message);
      toast.error(message);
    } finally {
      setAssignmentSubmitting(false);
    }
  };

  const handleCancelWorksheetAssignment = async (assignmentId) => {
    try {
      const response = await cancelCompetitionWorksheetAssignment(competitionId, assignmentId);
      const result = response?.data || response;
      const updatedAssignment = result?.data || result;
      setCompetitionWorksheetAssignments((current) => current.map((row) => (row.id === assignmentId ? { ...row, ...updatedAssignment } : row)));
      await refreshCompetitionWorksheetState();
      toast.success("Worksheet assignment cancelled.");
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || "Failed to cancel worksheet assignment.";
      setAssignmentError(message);
      toast.error(message);
    }
  };

  const handleTogglePublicationAssignment = (assignmentId) => {
    setPublicationSelectedAssignmentIds((current) => (
      current.includes(assignmentId)
        ? current.filter((id) => id !== assignmentId)
        : [...current, assignmentId]
    ));
  };

  const handlePublishWorksheetResults = async (assignmentIds = []) => {
    const targetIds = [...new Set(assignmentIds.filter(Boolean))];
    if (!targetIds.length) {
      toast.error("Select at least one reviewed result to publish.");
      return;
    }

    setAssignmentSubmitting(true);
    try {
      const response = await publishCompetitionWorksheetResults(competitionId, { assignmentIds: targetIds });
      const result = response?.data || response;
      const publishedCount = result?.data?.publishedCount ?? 0;
      const alreadyPublishedCount = result?.data?.alreadyPublishedCount ?? 0;
      setPublicationSelectedAssignmentIds([]);
      await refreshCompetitionWorksheetState();
      toast.success(`Published ${publishedCount} result(s).${alreadyPublishedCount ? ` ${alreadyPublishedCount} already published.` : ""}`);
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || "Failed to publish results.";
      setAssignmentError(message);
      toast.error(message);
    } finally {
      setAssignmentSubmitting(false);
    }
  };

  const handleFinalizeAwards = async () => {
    setAwardsFinalizing(true);
    try {
      const response = await finalizeCompetitionAwards(competitionId);
      const result = response?.data || response;
      const leaderboardResponse = await getLeaderboard(competitionId);
      setCompetitionLeaderboard(Array.isArray(leaderboardResponse?.data?.leaderboard) ? leaderboardResponse.data.leaderboard : []);
      setCompetitionLevelLeaderboards(Array.isArray(leaderboardResponse?.data?.levelLeaderboards) ? leaderboardResponse.data.levelLeaderboards : []);
      toast.success(`Finalized awards for ${result?.data?.finalizedCount ?? 0} ranking row(s).`);
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || "Failed to finalize awards.";
      toast.error(message);
    } finally {
      setAwardsFinalizing(false);
    }
  };

  const refreshCompetitionCertificates = async () => {
    if (!canManageCompetitionCertificates(competition)) {
      setCompetitionCertificates([]);
      return;
    }
    const response = await listCompetitionCertificates(competitionId).catch(() => null);
    setCompetitionCertificates(Array.isArray(response?.data?.data?.items) ? response.data.data.items : []);
  };

  const handleGenerateCompetitionCertificates = async (payload = {}) => {
    setCertificateSubmitting(true);
    try {
      const response = await generateCompetitionCertificates(competitionId, payload);
      const result = response?.data || response;
      const generatedCount = result?.data?.generatedCount ?? 0;
      setCertificateSelectedKeys([]);
      await refreshCompetitionCertificates();
      toast.success(`Generated ${generatedCount} certificate(s).`);
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || "Failed to generate certificates.";
      toast.error(message);
    } finally {
      setCertificateSubmitting(false);
    }
  };

  const handlePublishCompetitionCertificates = async (payload = {}) => {
    setCertificateSubmitting(true);
    try {
      const response = await publishCompetitionCertificates(competitionId, payload);
      const result = response?.data || response;
      const publishedCount = result?.data?.publishedCount ?? 0;
      setCertificateSelectedKeys([]);
      await refreshCompetitionCertificates();
      toast.success(`Published ${publishedCount} certificate(s).`);
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || "Failed to publish certificates.";
      toast.error(message);
    } finally {
      setCertificateSubmitting(false);
    }
  };

  const handlePreviewCompetitionCertificate = async (row) => {
    const leaderboardRow = competitionLeaderboard.find((entry) => entry.studentId === row.studentId && String(entry.levelId || "") === String(row.levelId || "")) || null;
    const template = row.brandingSnapshot?.certificateTemplate
      ? await preloadTemplateImages(row.brandingSnapshot.certificateTemplate).catch(() => row.brandingSnapshot.certificateTemplate)
      : null;
    const qrDataUrl = row.verificationToken
      ? await generateQrDataUrl(`${window.location.origin}/verify/${row.verificationToken}`).catch(() => null)
      : null;
    const doc = generateCertificatePdf({
      studentName: `${row.student?.firstName || ""} ${row.student?.lastName || ""}`.trim() || row.studentId,
      levelName: row.competitionCourseLevel?.title || leaderboardRow?.level?.name || row.levelSnapshot?.title || row.levelSnapshot?.name || "—",
      certificateNumber: row.certificateNumber,
      issuedAt: row.publishedAt || row.issuedAt,
      details: buildCompetitionCertificateDetails({
        competition,
        leaderboardRow,
        certificate: row
      }),
      template,
      qrDataUrl
    });
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const handleToggleCertificateSelection = (key) => {
    setCertificateSelectedKeys((current) => (
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    ));
  };

  const handleSubmitLevel = async (event) => {
    event.preventDefault();

    const normalizedName = levelForm.name.trim();
    const normalizedCode = Number(levelForm.code);
    if (!normalizedName) {
      toast.error("Level name is required.");
      return;
    }
    if (!Number.isInteger(normalizedCode) || normalizedCode <= 0) {
      toast.error("Level code must be a positive number.");
      return;
    }

    setSavingLevel(true);
    try {
      if (editingLevelId) {
        const response = await updateLevel(editingLevelId, {
          name: normalizedName,
          rank: normalizedCode,
          description: levelForm.description.trim()
        });
        const updatedLevel = response?.data || response;
        setCompetitionLevels((current) => current.map((level) => (level.id === editingLevelId ? { ...level, ...updatedLevel, name: normalizedName, rank: normalizedCode, description: levelForm.description.trim() } : level)));
        toast.success("Level updated.");
      } else {
        const response = await createLevel({
          name: normalizedName,
          rank: normalizedCode,
          description: levelForm.description.trim()
        });
        const createdLevel = response?.data || response;
        setCompetitionLevels((current) => [createdLevel, ...current]);
        toast.success("Level created.");
      }
      resetLevelForm();
    } catch (err) {
      toast.error(err?.message || "Failed to save level.");
    } finally {
      setSavingLevel(false);
    }
  };

  const handleTogglePartner = (partnerId) => {
    setSelectedPartnerIds((current) => current.includes(partnerId)
      ? current.filter((value) => value !== partnerId)
      : [...current, partnerId]);
  };

  const handleSelectAll = () => {
    const partnerIds = filteredPartners.map((partner) => partner.id).filter(Boolean);
    setSelectedPartnerIds((current) => {
      const next = new Set(current);
      partnerIds.forEach((partnerId) => next.add(partnerId));
      return Array.from(next);
    });
  };

  const loadCompetitionQuestionBank = async (levelId) => {
    if (!competitionId || !levelId) return;
    setBankLoading(true);
    setBankError("");
    try {
      const response = await listCompetitionQuestionBank({ competitionId, levelId, q: bankQ || undefined });
      setBankItems(response?.data?.items || []);
      setPageOffset(0);
      setPreviewQuestionId(null);
    } catch (err) {
      setBankError(err?.message || "Failed to load competition question bank.");
    } finally {
      setBankLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedPartnerIds.length) {
      toast.error("Select at least one business partner.");
      return;
    }

    setAssigning(true);
    try {
      await assignCompetitionBusinessPartners(competitionId, { businessPartnerIds: selectedPartnerIds });
      const response = await listCompetitionBusinessPartners(competitionId);
      setBusinessPartners(response?.data || []);
      setSelectedPartnerIds([]);
      toast.success("Business partners assigned.");
    } catch (err) {
      toast.error(err?.message || "Failed to assign business partners.");
    } finally {
      setAssigning(false);
    }
  };

  const handleRemove = async (businessPartnerId) => {
    setRemoving(true);
    try {
      await removeCompetitionBusinessPartner(competitionId, businessPartnerId);
      const response = await listCompetitionBusinessPartners(competitionId);
      setBusinessPartners(response?.data || []);
      toast.success("Business partner removed.");
    } catch (err) {
      toast.error(err?.message || "Failed to remove business partner.");
    } finally {
      setRemoving(false);
    }
  };

  useEffect(() => {
    if (!competitionId || !selectedLevelId) return;
    void loadCompetitionQuestionBank(selectedLevelId);
  }, [competitionId, selectedLevelId, bankQ]);

  useEffect(() => {
    if (visibleCompetitionLevels.length && !selectedLevelId) {
      setSelectedLevelId(visibleCompetitionLevels[0].id || "");
    }
  }, [selectedLevelId, visibleCompetitionLevels]);

  const normalizeBankNumbers = (values) => values.map((item) => Number(item));
  const computeBankAnswer = (operation, terms, operators) => {
    if (!Array.isArray(terms) || terms.length < 2) return null;
    const normalized = terms.map((item) => Number(item));
    if (!normalized.every((value) => Number.isFinite(value))) return null;
    if (operation === "MIX") {
      if (!Array.isArray(operators) || operators.length < terms.length) return null;
      let total = normalized[0];
      for (let index = 1; index < normalized.length; index += 1) {
        const operator = operators[index];
        if (operator === "ADD") total += normalized[index];
        else if (operator === "SUB") total -= normalized[index];
        else if (operator === "MUL") total *= normalized[index];
        else if (operator === "DIV") {
          if (normalized[index] === 0) return null;
          total /= normalized[index];
        } else return null;
      }
      return Number(total.toFixed(10));
    }
    if (operation === "ADD") return Number(normalized.reduce((sum, value) => sum + value, 0).toFixed(10));
    if (operation === "SUB") return Number(normalized.slice(1).reduce((total, value) => total - value, normalized[0]).toFixed(10));
    if (operation === "MUL") return Number(normalized.slice(1).reduce((total, value) => total * value, normalized[0]).toFixed(10));
    if (operation === "DIV") {
      let current = normalized[0];
      for (let index = 1; index < normalized.length; index += 1) {
        const next = normalized[index];
        if (next === 0) return null;
        current /= next;
      }
      return Number(current.toFixed(10));
    }
    return null;
  };

  const bankNumbersParsed = useMemo(() => normalizeBankNumbers(bankCreateForm.numbers), [bankCreateForm.numbers]);
  const bankCalculatedAnswer = useMemo(() => computeBankAnswer(bankCreateForm.operation, bankNumbersParsed, bankCreateForm.operators), [bankCreateForm.operation, bankNumbersParsed, bankCreateForm.operators]);
  const certificatesEnabled = useMemo(() => canManageCompetitionCertificates(competition), [competition]);

  const onCreateBankQuestion = async (event) => {
    event.preventDefault();
    setBankCreating(true);
    setBankError("");
    try {
      const prompt = String(bankCreateForm.prompt || "").trim();
      if (!prompt) {
        setBankError("Prompt is required.");
        return;
      }
      if (bankCreateForm.numbers.length < 2 || !bankNumbersParsed.every((value) => Number.isFinite(value))) {
        setBankError("Please provide at least two valid numbers.");
        return;
      }
      if (bankCalculatedAnswer === null) {
        setBankError("Invalid operation result.");
        return;
      }
      const payload = {
        competitionId,
        levelId: selectedLevelId,
        difficulty: "EASY",
        prompt,
        operation: bankCreateForm.operation,
        correctAnswer: bankCalculatedAnswer,
        operands: {
          a: bankNumbersParsed[0],
          b: bankNumbersParsed[1],
          terms: bankNumbersParsed,
          ...(bankCreateForm.operation === "MIX" ? { operators: bankCreateForm.operators } : {})
        }
      };
      if (editingQuestionId) {
        await updateCompetitionQuestionBankEntry(editingQuestionId, payload);
        setEditingQuestionId(null);
      } else {
        await createCompetitionQuestionBankEntry(payload);
      }
      setBankCreateForm({ prompt: "", operation: "ADD", numbers: ["", ""], operators: ["", "+"] });
      await loadCompetitionQuestionBank(selectedLevelId);
    } catch (err) {
      setBankError(err?.message || "Failed to create question.");
    } finally {
      setBankCreating(false);
    }
  };

  const onExportBank = async () => {
    try {
      const blob = await exportCompetitionQuestionBankCsv({ competitionId, levelId: selectedLevelId });
      downloadBlob(blob, `competition-question-bank-${competitionId}-${selectedLevelId}.csv`);
    } catch (err) {
      setBankError(err?.message || "Failed to export CSV.");
    }
  };

  const onImportBankJson = async (file) => {
    setBankError("");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const raw = Array.isArray(parsed) ? parsed : parsed?.items || [];
      if (!raw.length) throw new Error("Import file contains no questions.");
      const items = raw.map((item) => ({
        prompt: item.prompt,
        difficulty: item.difficulty || "EASY",
        operation: item.operation || "ADD",
        correctAnswer: item.correctAnswer ?? 0,
        operands: item.operands || { terms: [1, 1], operators: ["+"] }
      }));
      await importCompetitionQuestionBank({ competitionId, levelId: selectedLevelId, items });
      await loadCompetitionQuestionBank(selectedLevelId);
    } catch (err) {
      setBankError(err?.message || "Failed to import questions.");
    }
  };

  const onEditQuestion = (row) => {
    const operands = row?.operands || {};
    const terms = Array.isArray(operands?.terms)
      ? operands.terms.map((t) => (t === null || t === undefined ? "" : String(t)))
      : [operands?.a ?? operands?.x ?? "", operands?.b ?? operands?.y ?? ""].map((t) => (t === null || t === undefined ? "" : String(t)));
    const rowOperators = Array.isArray(operands?.operators) ? operands.operators : terms.map((_, i) => (i === 0 ? "" : "+"));
    setBankCreateForm({ prompt: row?.prompt || "", operation: String(row?.operation || "ADD"), numbers: terms, operators: rowOperators });
    setEditingQuestionId(row.id || null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CompetitionModuleNav />

      <div className="card" style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>Competition Workspace</div>
            <h2 style={{ margin: "4px 0 0" }}>{competition?.title || "Competition Details"}</h2>
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{competition?.code || "—"}</div>
              <div style={{ marginTop: 8 }}>
                <CompetitionWorkflowTimeline competition={competition} />
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="button secondary" style={{ width: "auto" }} type="button" onClick={() => navigate(-1)}>
              Back
            </button>
            <button className="button secondary" style={{ width: "auto" }} type="button" onClick={() => toast.success("Edit flow is coming soon.") }>
              Edit
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`button ${activeTab === tab.key ? "" : "secondary"}`}
              style={{ width: "auto", minWidth: 120 }}
              type="button"
              onClick={() => {
                navigate(tab.key === "worksheets" ? `/superadmin/competition/${competitionId}/worksheets` : `/superadmin/competition/${competitionId}`);
                setActiveTab(tab.key);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <LoadingState label="Loading competition details..." />
        ) : error ? (
          <EmptyState icon="⚠️" title="Unable to load competition" description={error} />
        ) : null}

        {!loading && !error && activeTab === "overview" ? (
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            {overviewItems.map((item) => (
              <div key={item.label} className="card" style={{ padding: 16, display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--color-text-muted)" }}>{item.label}</div>
                <div style={{ fontSize: 14, color: "var(--color-text-primary)" }}>{typeof item.value === "string" ? item.value : item.value}</div>
              </div>
            ))}
          </div>
        ) : null}

        {!loading && !error && activeTab === "competitionLevels" ? (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <h3 style={{ margin: 0 }}>Competition Course Levels</h3>
                <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>Levels come from the assigned reusable Competition Course.</div>
              </div>
            </div>

            {false && levelFormOpen ? (
              <form className="card" onSubmit={handleSubmitLevel} style={{ padding: 16, display: "grid", gap: 12, maxWidth: 720 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{editingLevelId ? "Edit Level" : "Create Competition Level"}</div>
                  <button className="button secondary" style={{ width: "auto" }} type="button" onClick={resetLevelForm}>
                    Cancel
                  </button>
                </div>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Level Name</span>
                  <input className="input" value={levelForm.name} onChange={(event) => setLevelForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Level 1" />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Level Code</span>
                  <input className="input" value={levelForm.code} onChange={(event) => setLevelForm((current) => ({ ...current, code: event.target.value }))} placeholder="e.g. 1" />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Description</span>
                  <textarea className="input" rows={4} value={levelForm.description} onChange={(event) => setLevelForm((current) => ({ ...current, description: event.target.value }))} placeholder="Add a short description" />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={levelForm.isActive} onChange={(event) => setLevelForm((current) => ({ ...current, isActive: event.target.checked }))} />
                  <span>Active</span>
                </label>
                <button className="button" style={{ width: "auto" }} type="submit" disabled={savingLevel}>
                  {savingLevel ? "Saving..." : editingLevelId ? "Save Changes" : "Create Level"}
                </button>
              </form>
            ) : null}

            {competition?.competitionCourse ? (
              <div className="card" style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>Assigned Competition Course</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{competition.competitionCourse.name}</div>
                <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
                  {competition.competitionCourse.code || "No code"} {competition.competitionCourse.isActive === false ? "| Archived" : "| Active"}
                </div>
              </div>
            ) : (
              <div className="card" style={{ padding: 24, display: "grid", gap: 12, justifyItems: "center", textAlign: "center" }}>
                <div>No Competition Course is assigned to this competition.</div>
                <button className="button secondary" style={{ width: "auto" }} type="button" onClick={() => navigate("/superadmin/competition/courses")}>
                  Open Competition Courses
                </button>
              </div>
            )}

            {visibleCompetitionLevels.length ? (
              <div className="card" style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                      <th style={{ padding: 10 }}>Level</th>
                      <th style={{ padding: 10 }}>Title</th>
                      <th style={{ padding: 10 }}>Sort</th>
                      <th style={{ padding: 10 }}>Status</th>
                      <th style={{ padding: 10 }}>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCompetitionLevels.map((level) => (
                      <tr key={level.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td style={{ padding: 10 }}>{level.levelNumber || "-"}</td>
                        <td style={{ padding: 10 }}>{level.title || "-"}</td>
                        <td style={{ padding: 10 }}>{level.sortOrder ?? "-"}</td>
                        <td style={{ padding: 10 }}>{level.isActive === false ? "Inactive" : "Active"}</td>
                        <td style={{ padding: 10 }}>{level.description || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="card" style={{ padding: 24, display: "grid", gap: 12, justifyItems: "center", textAlign: "center" }}>
                <div>{competition?.competitionCourse ? "No levels exist for the assigned Competition Course." : "Assign a Competition Course to show levels here."}</div>
              </div>
            )}
          </div>
        ) : null}

        {!loading && !error && activeTab === "worksheets" ? (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <h3 style={{ margin: 0 }}>Competition Worksheets</h3>
                <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>Assign published competition worksheets to enrolled students from the same level.</div>
              </div>
            </div>

            {assignmentError ? <div className="error">{assignmentError}</div> : null}

            {publishedCompetitionWorksheets.length ? (
              <form className="card" onSubmit={handleSubmitWorksheetAssignments} style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Published Worksheet</span>
                    <select
                      className="select"
                      value={assignmentWorksheetId}
                      onChange={(event) => setAssignmentWorksheetId(event.target.value)}
                    >
                      {publishedCompetitionWorksheets.map((row) => (
                        <option key={row.worksheetId} value={row.worksheetId}>
                          {row.worksheet?.title || row.title || row.worksheetId}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Due At</span>
                    <input className="input" type="datetime-local" value={assignmentDueAt} onChange={(event) => setAssignmentDueAt(event.target.value)} />
                  </label>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    className={`button ${assignmentSelectionMode === "selected" ? "" : "secondary"}`}
                    type="button"
                    style={{ width: "auto" }}
                    onClick={() => setAssignmentSelectionMode("selected")}
                  >
                    Selected Students
                  </button>
                  <button
                    className={`button ${assignmentSelectionMode === "all" ? "" : "secondary"}`}
                    type="button"
                    style={{ width: "auto" }}
                    onClick={() => setAssignmentSelectionMode("all")}
                  >
                    All Eligible
                  </button>
                  <button className="button" style={{ width: "auto" }} type="submit" disabled={assignmentSubmitting}>
                    {assignmentSubmitting ? "Assigning..." : "Assign Worksheet"}
                  </button>
                </div>

                <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                  {selectedAssignmentWorksheet ? (
                    <>
                      {selectedAssignmentWorksheet.worksheet?.title || selectedAssignmentWorksheet.title || "Selected worksheet"} · Level {selectedAssignmentWorksheet.levelId || "—"} · {eligibleWorksheetStudents.length} eligible student(s)
                    </>
                  ) : (
                    "Select a published worksheet to see eligible students."
                  )}
                </div>
              </form>
            ) : (
              <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--color-text-muted)" }}>
                No published competition worksheets are available for assignment yet.
              </div>
            )}

            {selectedAssignmentWorksheet ? (
              <div className="card" style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>Eligible Students</div>
                    <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>Only enrolled students from the worksheet level are shown here.</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="button secondary" style={{ width: "auto" }} type="button" onClick={() => setAssignmentSelectedStudentIds(eligibleWorksheetStudents.map((row) => row.studentId))}>
                      Select All Eligible
                    </button>
                    <button className="button secondary" style={{ width: "auto" }} type="button" onClick={() => setAssignmentSelectedStudentIds([])}>
                      Clear
                    </button>
                  </div>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                        <th style={{ padding: 10 }}>Select</th>
                        <th style={{ padding: 10 }}>Student</th>
                        <th style={{ padding: 10 }}>Admission No</th>
                        <th style={{ padding: 10 }}>Level</th>
                        <th style={{ padding: 10 }}>Hierarchy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eligibleWorksheetStudents.length ? eligibleWorksheetStudents.map((row) => (
                        <tr key={row.studentId} style={{ borderBottom: "1px solid var(--color-border)" }}>
                          <td style={{ padding: 10 }}>
                            <input
                              type="checkbox"
                              checked={assignmentSelectedStudentIds.includes(row.studentId)}
                              onChange={() => handleToggleWorksheetStudent(row.studentId)}
                              disabled={assignmentSelectionMode === "all"}
                            />
                          </td>
                          <td style={{ padding: 10 }}>{`${row.student?.firstName || ""} ${row.student?.lastName || ""}`.trim() || row.studentId}</td>
                          <td style={{ padding: 10 }}>{row.student?.admissionNo || "—"}</td>
                          <td style={{ padding: 10 }}>{row.level?.name || row.levelId || "—"}</td>
                          <td style={{ padding: 10 }}>{row.student?.hierarchyNodeId || "—"}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td style={{ padding: 10 }} colSpan={5}>No enrolled students match this worksheet level.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className="card" style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Status</span>
                  <select className="select" value={assignmentStatusFilter} onChange={(event) => setAssignmentStatusFilter(event.target.value)}>
                    <option value="ALL">All</option>
                    <option value="ASSIGNED">Assigned</option>
                    <option value="STARTED">Started</option>
                    <option value="SUBMITTED">Submitted</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Worksheet</span>
                  <select className="select" value={assignmentWorksheetFilter} onChange={(event) => setAssignmentWorksheetFilter(event.target.value)}>
                    <option value="ALL">All Worksheets</option>
                    {competitionWorksheetsDetailed.map((row) => (
                      <option key={row.worksheetId} value={row.worksheetId}>
                        {row.worksheet?.title || row.title || row.worksheetId}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Search</span>
                  <input className="input" value={assignmentSearch} onChange={(event) => setAssignmentSearch(event.target.value)} placeholder="Search student or worksheet" />
                </label>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                  {publicationSelectedAssignmentIds.length} reviewed result(s) selected for publication.
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="button secondary"
                    style={{ width: "auto" }}
                    type="button"
                    onClick={() => setPublicationSelectedAssignmentIds(publishableWorksheetAssignments.map((row) => row.id))}
                    disabled={!publishableWorksheetAssignments.length}
                  >
                    Select Publishable
                  </button>
                  <button
                    className="button secondary"
                    style={{ width: "auto" }}
                    type="button"
                    onClick={() => setPublicationSelectedAssignmentIds([])}
                    disabled={!publicationSelectedAssignmentIds.length}
                  >
                    Clear
                  </button>
                  <button
                    className="button"
                    style={{ width: "auto" }}
                    type="button"
                    onClick={() => void handlePublishWorksheetResults(publicationSelectedAssignmentIds)}
                    disabled={!publicationSelectedAssignmentIds.length || assignmentSubmitting}
                  >
                    {assignmentSubmitting ? "Publishing..." : "Publish Selected"}
                  </button>
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                      <th style={{ padding: 10 }}>Select</th>
                      <th style={{ padding: 10 }}>Worksheet</th>
                      <th style={{ padding: 10 }}>Student</th>
                      <th style={{ padding: 10 }}>Level</th>
                      <th style={{ padding: 10 }}>Paper</th>
                      <th style={{ padding: 10 }}>Status</th>
                      <th style={{ padding: 10 }}>Score</th>
                      <th style={{ padding: 10 }}>%</th>
                      <th style={{ padding: 10 }}>Evaluated</th>
                      <th style={{ padding: 10 }}>Assigned At</th>
                      <th style={{ padding: 10 }}>Started At</th>
                      <th style={{ padding: 10 }}>Submitted At</th>
                      <th style={{ padding: 10 }}>Due At</th>
                      <th style={{ padding: 10 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWorksheetAssignments.length ? filteredWorksheetAssignments.map((row) => (
                      <tr key={row.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        {(() => {
                          const worksheetMeta = competitionWorksheetMetaById.get(row.worksheetId) || null;
                          return (
                            <>
                        <td style={{ padding: 10 }}>
                          <input
                            type="checkbox"
                            checked={publicationSelectedAssignmentIds.includes(row.id)}
                            onChange={() => handleTogglePublicationAssignment(row.id)}
                            disabled={String(row?.submission?.status || "").toUpperCase() !== "REVIEWED" || Boolean(row?.submission?.publishedAt)}
                          />
                        </td>
                        <td style={{ padding: 10 }}>{row.worksheet?.title || row.worksheetId}</td>
                        <td style={{ padding: 10 }}>{`${row.student?.firstName || ""} ${row.student?.lastName || ""}`.trim() || row.studentId}</td>
                        <td style={{ padding: 10 }}>{row.student?.level?.name || row.student?.levelId || "—"}</td>
                        <td style={{ padding: 10 }}>{worksheetMeta?.competitionPaper?.title || worksheetMeta?.competitionPaperId || "—"}</td>
                        <td style={{ padding: 10 }}>{row.status || "ASSIGNED"}</td>
                        <td style={{ padding: 10 }}>{row?.submission?.score ?? "—"}</td>
                        <td style={{ padding: 10 }}>{row?.submission?.percentage ?? "—"}</td>
                        <td style={{ padding: 10 }}>{formatDateValue(row?.submission?.evaluatedAt)}</td>
                        <td style={{ padding: 10 }}>{formatDateValue(row.assignedAt)}</td>
                        <td style={{ padding: 10 }}>{formatDateValue(row.startedAt)}</td>
                        <td style={{ padding: 10 }}>{formatDateValue(row.submittedAt)}</td>
                        <td style={{ padding: 10 }}>{formatDateValue(row.dueAt)}</td>
                        <td style={{ padding: 10 }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {row?.submission?.evaluationSnapshot ? (
                              <button
                                className="button secondary"
                                style={{ width: "auto" }}
                                type="button"
                                onClick={() => setSelectedEvaluationAssignmentId(row.id)}
                              >
                                Review
                              </button>
                            ) : null}
                            <button
                              className="button secondary"
                              style={{ width: "auto" }}
                              type="button"
                              onClick={() => void handlePublishWorksheetResults([row.id])}
                              disabled={String(row?.submission?.status || "").toUpperCase() !== "REVIEWED" || Boolean(row?.submission?.publishedAt) || assignmentSubmitting}
                            >
                              {row?.submission?.publishedAt ? "Published" : "Publish"}
                            </button>
                            <button
                              className="button secondary"
                              style={{ width: "auto" }}
                              type="button"
                              onClick={() => handleCancelWorksheetAssignment(row.id)}
                              disabled={String(row.status || "").toUpperCase() === "SUBMITTED" || String(row.status || "").toUpperCase() === "CANCELLED"}
                              >
                              Cancel
                            </button>
                          </div>
                        </td>
                            </>
                          );
                        })()}
                      </tr>
                    )) : (
                      <tr>
                        <td style={{ padding: 10 }} colSpan={13}>No worksheet assignments found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {selectedEvaluationAssignment?.submission?.evaluationSnapshot ? (
                <div className="card" style={{ display: "grid", gap: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>Superadmin Evaluation</div>
                      <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                        {selectedEvaluationAssignment.worksheet?.title || selectedEvaluationAssignment.worksheetId} · {`${selectedEvaluationAssignment.student?.firstName || ""} ${selectedEvaluationAssignment.student?.lastName || ""}`.trim() || selectedEvaluationAssignment.studentId}
                      </div>
                    </div>
                    <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                      <div><strong>Level:</strong> {selectedEvaluationAssignment.student?.level?.name || selectedEvaluationAssignment.student?.levelId || "—"}</div>
                      <div><strong>Paper:</strong> {competitionWorksheetMetaById.get(selectedEvaluationAssignment.worksheetId)?.competitionPaper?.title || competitionWorksheetMetaById.get(selectedEvaluationAssignment.worksheetId)?.competitionPaperId || "—"}</div>
                      <div><strong>Worksheet:</strong> {selectedEvaluationAssignment.worksheet?.title || selectedEvaluationAssignment.worksheetId}</div>
                      <div><strong>Status:</strong> {selectedEvaluationAssignment.submission.status || "—"}</div>
                      <div><strong>Evaluated At:</strong> {formatDateValue(selectedEvaluationAssignment.submission.evaluatedAt)}</div>
                      <div><strong>Published At:</strong> {formatDateValue(selectedEvaluationAssignment.submission.publishedAt)}</div>
                      <div><strong>Published By:</strong> {selectedEvaluationAssignment.submission.publishedBy?.email || selectedEvaluationAssignment.submission.publishedByUserId || "—"}</div>
                      <div><strong>Score:</strong> {selectedEvaluationAssignment.submission.score ?? "—"}</div>
                      <div><strong>Percentage:</strong> {selectedEvaluationAssignment.submission.percentage ?? "—"}</div>
                      <div><strong>Correct:</strong> {selectedEvaluationAssignment.submission.correctCount ?? "—"}</div>
                      <div><strong>Wrong:</strong> {selectedEvaluationAssignment.submission.wrongCount ?? "—"}</div>
                      <div><strong>Unanswered:</strong> {selectedEvaluationAssignment.submission.unansweredCount ?? "—"}</div>
                    </div>
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                          <th style={{ padding: 10 }}>#</th>
                          <th style={{ padding: 10 }}>Prompt</th>
                          <th style={{ padding: 10 }}>Student Answer</th>
                          <th style={{ padding: 10 }}>Correct Answer</th>
                          <th style={{ padding: 10 }}>Marks</th>
                          <th style={{ padding: 10 }}>Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedEvaluationAssignment.submission.evaluationSnapshot?.questionEvaluations || []).map((question) => (
                          <tr key={question.questionId} style={{ borderBottom: "1px solid var(--color-border)" }}>
                            <td style={{ padding: 10 }}>{question.questionNumber}</td>
                            <td style={{ padding: 10 }}>{question.prompt || "—"}</td>
                            <td style={{ padding: 10 }}>{question.submittedAnswer ?? "—"}</td>
                            <td style={{ padding: 10 }}>{question.correctAnswer ?? "—"}</td>
                            <td style={{ padding: 10 }}>
                              {question.earnedMarks ?? "—"} / {question.marks ?? "—"}
                            </td>
                            <td style={{ padding: 10 }}>{question.isCorrect ? "Correct" : question.submittedAnswer == null ? "Unanswered" : "Wrong"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {!loading && !error && activeTab === "rankings" ? (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <h3 style={{ margin: 0 }}>Competition Leaderboard</h3>
                <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>
                  Published results only. Rank is based on earned marks, percentage, correct answers, wrong answers, duration, then submission time.
                </div>
              </div>
              <button className="button" style={{ width: "auto" }} type="button" onClick={() => void handleFinalizeAwards()} disabled={awardsFinalizing || !leaderboardDisplayRows.length}>
                {awardsFinalizing ? "Finalizing..." : "Finalize Awards"}
              </button>
            </div>

            <div className="card" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                    <th style={{ padding: 10 }}>Rank</th>
                    <th style={{ padding: 10 }}>Student</th>
                    <th style={{ padding: 10 }}>Center</th>
                    <th style={{ padding: 10 }}>Level</th>
                    <th style={{ padding: 10 }}>Score</th>
                    <th style={{ padding: 10 }}>%</th>
                    <th style={{ padding: 10 }}>Award</th>
                    <th style={{ padding: 10 }}>Duration</th>
                    <th style={{ padding: 10 }}>Submitted At</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboardDisplayRows.length ? leaderboardDisplayRows.map((row) => (
                    <tr key={`${row.studentId}:${row.levelId}`} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={{ padding: 10, fontWeight: 700 }}>{row.rank}</td>
                      <td style={{ padding: 10 }}>{row.studentName || row.studentId}</td>
                      <td style={{ padding: 10 }}>{row.centerName || row.centerCode || "—"}</td>
                      <td style={{ padding: 10 }}>{row.level?.name || row.levelName || row.levelId || "—"}</td>
                      <td style={{ padding: 10 }}>{row.earnedMarks ?? "—"} / {row.totalMarks ?? "—"}</td>
                      <td style={{ padding: 10 }}>{row.percentage ?? "—"}</td>
                      <td style={{ padding: 10, fontWeight: 700 }}>{row.awardType || row.previewAwardType || "—"}</td>
                      <td style={{ padding: 10 }}>{Number.isFinite(Number(row.durationSeconds)) ? `${Number(row.durationSeconds)}s` : "—"}</td>
                      <td style={{ padding: 10 }}>{formatDateValue(row.submittedAt)}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td style={{ padding: 10 }} colSpan={9}>No published competition results yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {competitionLevelLeaderboards.length ? competitionLevelLeaderboards.map((levelBoard) => (
              <div key={levelBoard.levelId} className="card" style={{ display: "grid", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--color-text-muted)" }}>Level Leaderboard</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{levelBoard.levelName || levelBoard.levelId}</div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                        <th style={{ padding: 10 }}>Rank</th>
                        <th style={{ padding: 10 }}>Student</th>
                        <th style={{ padding: 10 }}>Center</th>
                        <th style={{ padding: 10 }}>Score</th>
                        <th style={{ padding: 10 }}>%</th>
                        <th style={{ padding: 10 }}>Award</th>
                        <th style={{ padding: 10 }}>Duration</th>
                        <th style={{ padding: 10 }}>Submitted At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {levelBoard.leaderboard?.length ? levelBoard.leaderboard.map((row) => (
                        <tr key={`${levelBoard.levelId}:${row.studentId}`} style={{ borderBottom: "1px solid var(--color-border)" }}>
                          <td style={{ padding: 10, fontWeight: 700 }}>{row.rank}</td>
                           <td style={{ padding: 10 }}>{row.studentName || row.studentId}</td>
                           <td style={{ padding: 10 }}>{row.centerName || row.centerCode || "—"}</td>
                           <td style={{ padding: 10 }}>{row.earnedMarks ?? "—"} / {row.totalMarks ?? "—"}</td>
                           <td style={{ padding: 10 }}>{row.percentage ?? "—"}</td>
                           <td style={{ padding: 10, fontWeight: 700 }}>{row.awardType || row.previewAwardType || "—"}</td>
                           <td style={{ padding: 10 }}>{Number.isFinite(Number(row.durationSeconds)) ? `${Number(row.durationSeconds)}s` : "—"}</td>
                           <td style={{ padding: 10 }}>{formatDateValue(row.submittedAt)}</td>
                         </tr>
                       )) : (
                         <tr>
                          <td style={{ padding: 10 }} colSpan={8}>No published results for this level.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )) : null}

            <div className="card" style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <h3 style={{ margin: 0 }}>Competition Certificates</h3>
                  <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>
                    {certificatesEnabled
                      ? "Generate drafts from finalized awards, preview them here, and publish only when ready."
                      : "Certificates unlock after results are published."}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="button secondary" type="button" style={{ width: "auto" }} onClick={() => void handleGenerateCompetitionCertificates()} disabled={!certificatesEnabled || certificateSubmitting || !leaderboardDisplayRows.filter((row) => row?.awardFinalizedAt).length}>
                    {certificateSubmitting ? "Working..." : "Generate All"}
                  </button>
                  <button className="button" type="button" style={{ width: "auto" }} onClick={() => void handlePublishCompetitionCertificates({ certificateIds: certificateSelectedKeys })} disabled={!certificatesEnabled || certificateSubmitting || !certificateSelectedKeys.length}>
                    Publish Selected
                  </button>
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                      <th style={{ padding: 10 }}>Select</th>
                      <th style={{ padding: 10 }}>Student</th>
                      <th style={{ padding: 10 }}>Level</th>
                      <th style={{ padding: 10 }}>Rank</th>
                      <th style={{ padding: 10 }}>Award</th>
                      <th style={{ padding: 10 }}>Status</th>
                      <th style={{ padding: 10 }}>Published At</th>
                      <th style={{ padding: 10 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboardDisplayRows.filter((row) => row?.awardFinalizedAt).map((row) => {
                      const competitionCourseLevel = getCompetitionCourseLevelForRank(competition, row?.level?.rank ?? row?.levelRank);
                      const key = `${row.studentId}:${competitionCourseLevel?.id || row.levelId || ""}`;
                      const cert = competitionCertificateByKey.get(key) || null;
                      const status = cert?.publishedAt ? "PUBLISHED" : cert ? "DRAFT" : "NOT GENERATED";
                      return (
                        <tr key={key || `${row.studentId}:${row.levelId}`} style={{ borderBottom: "1px solid var(--color-border)" }}>
                          <td style={{ padding: 10 }}>
                            <input
                              type="checkbox"
                              checked={certificateSelectedKeys.includes(key)}
                              onChange={() => handleToggleCertificateSelection(key)}
                              disabled={!certificatesEnabled || !cert || Boolean(cert.publishedAt)}
                            />
                          </td>
                          <td style={{ padding: 10 }}>{row.studentName || row.studentId}</td>
                          <td style={{ padding: 10 }}>{competitionCourseLevel?.title || row.level?.name || row.levelName || "—"}</td>
                          <td style={{ padding: 10 }}>{row.rank}</td>
                          <td style={{ padding: 10 }}>{cert?.awardType || row.awardType || row.previewAwardType || "—"}</td>
                          <td style={{ padding: 10 }}>{status}</td>
                          <td style={{ padding: 10 }}>{formatDateValue(cert?.publishedAt)}</td>
                          <td style={{ padding: 10 }}>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button className="button secondary" type="button" style={{ width: "auto" }} onClick={() => void handlePreviewCompetitionCertificate(cert)} disabled={!cert}>
                                Preview
                              </button>
                              {!cert ? (
                                <button className="button secondary" type="button" style={{ width: "auto" }} onClick={() => void handleGenerateCompetitionCertificates({ certificateIds: [key] })} disabled={!certificatesEnabled || certificateSubmitting}>
                                  Generate
                                </button>
                              ) : cert.publishedAt ? null : (
                                <button className="button" type="button" style={{ width: "auto" }} onClick={() => void handlePublishCompetitionCertificates({ certificateIds: [key] })} disabled={!certificatesEnabled || certificateSubmitting}>
                                  Publish
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!leaderboardDisplayRows.filter((row) => row?.awardFinalizedAt).length ? (
                      <tr>
                        <td style={{ padding: 10 }} colSpan={8}>No finalized awards are available yet.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {!loading && !error && activeTab === "questionBank" ? (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <h3 style={{ margin: 0 }}>Competition Question Bank</h3>
                <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>Manage questions scoped to this competition and selected level.</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="button secondary" style={{ width: "auto" }} type="button" onClick={onExportBank}>Export CSV</button>
                <label className="button secondary" style={{ width: "auto", cursor: "pointer" }}>
                  Import JSON
                  <input
                    type="file"
                    accept="application/json"
                    style={{ display: "none" }}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void onImportBankJson(file);
                      }
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Competition Level</span>
                <select className="select" value={selectedLevelId} onChange={(event) => setSelectedLevelId(event.target.value)} style={{ minWidth: 180 }}>
                  {visibleCompetitionLevels.map((level) => (
                    <option key={level.id} value={level.id}>{level.name || level.rank || level.code || level.id}</option>
                  ))}
                </select>
              </label>
              <input className="input" placeholder="Search prompt" value={bankQ} onChange={(event) => setBankQ(event.target.value)} style={{ width: 260 }} />
              <button className="button secondary" style={{ width: "auto" }} type="button" onClick={() => void loadCompetitionQuestionBank(selectedLevelId)} disabled={bankLoading}>
                {bankLoading ? "Loading..." : "Refresh"}
              </button>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Questions per page</span>
                <select className="select" value={String(pageLimit)} onChange={(event) => { setPageLimit(Number(event.target.value)); setPageOffset(0); }} style={{ width: 120 }}>
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="30">30</option>
                  <option value="40">40</option>
                  <option value="50">50</option>
                </select>
              </label>
            </div>

            {bankError ? <div className="error">{bankError}</div> : null}

            <div className="card" style={{ display: "grid", gap: 12 }}>
              <form onSubmit={onCreateBankQuestion} style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Prompt / Name</span>
                    <input className="input" value={bankCreateForm.prompt} onChange={(event) => setBankCreateForm((current) => ({ ...current, prompt: event.target.value }))} placeholder="Enter question prompt" />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Operation</span>
                    <select className="select" value={bankCreateForm.operation} onChange={(event) => setBankCreateForm((current) => ({ ...current, operation: event.target.value }))}>
                      <option value="ADD">Add</option>
                      <option value="SUB">Subtract</option>
                      <option value="MUL">Multiply</option>
                      <option value="DIV">Divide</option>
                      <option value="MIX">Mix</option>
                    </select>
                  </label>
                </div>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Numbers</span>
                  <div style={{ display: "grid", gap: 8 }}>
                    {bankCreateForm.numbers.map((value, index) => (
                      <div key={`${value}-${index}`} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {bankCreateForm.operation === "MIX" && index > 0 ? (
                          <select className="select" value={bankCreateForm.operators[index] || "+"} onChange={(event) => { const nextOps = [...bankCreateForm.operators]; nextOps[index] = event.target.value; setBankCreateForm((current) => ({ ...current, operators: nextOps })); }}>
                            <option value="ADD">+</option>
                            <option value="SUB">−</option>
                            <option value="MUL">×</option>
                            <option value="DIV">÷</option>
                          </select>
                        ) : null}
                        <input className="input" inputMode="numeric" value={value} onChange={(event) => { const next = [...bankCreateForm.numbers]; next[index] = event.target.value; setBankCreateForm((current) => ({ ...current, numbers: next })); }} placeholder={`Number ${index + 1}`} />
                      </div>
                    ))}
                    <button className="button secondary" type="button" style={{ width: "auto" }} onClick={() => setBankCreateForm((current) => ({ ...current, numbers: [...current.numbers, ""], operators: [...current.operators, "+"] }))}>Add Number</button>
                  </div>
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Correct Answer</span>
                  <input className="input" readOnly value={bankCalculatedAnswer === null ? "" : String(bankCalculatedAnswer)} />
                </label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="button" style={{ width: "auto" }} type="submit" disabled={bankCreating}>{bankCreating ? (editingQuestionId ? "Saving..." : "Creating...") : (editingQuestionId ? "Save Changes" : "Add Question")}</button>
                  {editingQuestionId ? <button className="button secondary" style={{ width: "auto" }} type="button" onClick={() => { setEditingQuestionId(null); setBankCreateForm({ prompt: "", operation: "ADD", numbers: ["", ""], operators: ["", "+"] }); setBankError(""); }}>Cancel</button> : null}
                </div>
              </form>
            </div>

            <div className="card" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                    <th style={{ padding: 10 }}>Prompt</th>
                    <th style={{ padding: 10 }}>Operation</th>
                    <th style={{ padding: 10 }}>Answer</th>
                    <th style={{ padding: 10 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleBankItems.map((row) => (
                    <tr key={row.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={{ padding: 10 }}>{row.prompt || "—"}</td>
                      <td style={{ padding: 10 }}>{String(row.operation || "").toUpperCase()}</td>
                      <td style={{ padding: 10 }}>{row.correctAnswer ?? "—"}</td>
                      <td style={{ padding: 10 }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button className="button secondary" style={{ width: "auto" }} type="button" onClick={() => setPreviewQuestionId(row.id)}>Preview</button>
                          <button className="button secondary" style={{ width: "auto" }} type="button" onClick={() => onEditQuestion(row)}>Edit</button>
                          <button className="button secondary" style={{ width: "auto" }} type="button" onClick={() => setDeleteQuestionTarget(row)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card" style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 700 }}>Question Preview</div>
              {!previewQuestion ? <div style={{ fontSize: 13, opacity: 0.75 }}>No question available on this page.</div> : (
                <>
                  <div style={{ fontSize: 13 }}><strong>Prompt:</strong> {previewQuestion.prompt || "—"}</div>
                  <div style={{ fontSize: 13 }}><strong>Expression:</strong> {renderExpression(previewQuestion)}</div>
                  <div style={{ fontSize: 13 }}><strong>Operation:</strong> {String(previewQuestion.operation || "").toUpperCase() || "—"}</div>
                  <div style={{ fontSize: 13 }}><strong>Correct Answer:</strong> {previewQuestion.correctAnswer ?? "—"}</div>
                  <div style={{ fontSize: 13 }}><strong>Operands:</strong><pre style={{ margin: "6px 0 0", padding: 8, borderRadius: 8, overflowX: "auto", border: "1px solid var(--color-border)" }}>{JSON.stringify(previewQuestion.operands || {}, null, 2)}</pre></div>
                </>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{bankItems.length} question(s)</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="button secondary" style={{ width: "auto" }} type="button" onClick={() => setPageOffset((current) => Math.max(0, current - pageLimit))} disabled={pageOffset === 0}>Previous</button>
                <button className="button secondary" style={{ width: "auto" }} type="button" onClick={() => setPageOffset((current) => current + pageLimit)} disabled={pageOffset + pageLimit >= bankItems.length}>Next</button>
              </div>
            </div>
          </div>
        ) : null}

        {!loading && !error && activeTab === "businessPartners" ? (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <h3 style={{ margin: 0 }}>Business Partners</h3>
                <button className="button" style={{ width: "auto" }} type="button" onClick={() => setActiveTab("businessPartners")}>
                  Add Business Partner
                </button>
              </div>

              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                {summaryCards.map((card) => (
                  <div key={card.label} className="card" style={{ padding: 16, display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--color-text-muted)" }}>{card.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{card.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "grid", gap: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Add Business Partner</div>
                  <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Search Business Partner</div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="button secondary" style={{ width: "auto" }} type="button" onClick={handleSelectAll}>
                    Select All
                  </button>
                  <button className="button" style={{ width: "auto" }} type="button" onClick={handleAssign} disabled={assigning || !selectedPartnerIds.length}>
                    {assigning ? "Assigning..." : "Assign"}
                  </button>
                </div>
              </div>
              <input className="input" value={partnerSearch} onChange={(event) => setPartnerSearch(event.target.value)} placeholder="Search Business Partner" />

              <div style={{ display: "grid", gap: 8 }}>
                {filteredPartners.length ? filteredPartners.map((partner) => (
                  <label key={partner.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: 8, border: "1px solid var(--color-border)", borderRadius: 8 }}>
                    <input
                      type="checkbox"
                      checked={selectedPartnerIds.includes(partner.id)}
                      onChange={() => handleTogglePartner(partner.id)}
                    />
                    <span>{partner.name || partner.code || partner.id}</span>
                  </label>
                )) : <div style={{ color: "var(--color-text-muted)" }}>No matching business partners.</div>}
              </div>
            </div>

            {businessPartners.length ? (
              <div className="card" style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                      <th style={{ padding: 10 }}>Business Partner</th>
                      <th style={{ padding: 10 }}>Status</th>
                      <th style={{ padding: 10 }}>Franchises</th>
                      <th style={{ padding: 10 }}>Centers</th>
                      <th style={{ padding: 10 }}>Teachers</th>
                      <th style={{ padding: 10 }}>Students</th>
                      <th style={{ padding: 10 }}>Competition Registrations</th>
                      <th style={{ padding: 10 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {businessPartners.map((mapping) => (
                      <tr key={mapping.businessPartnerId} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td style={{ padding: 10 }}>{mapping.businessPartner?.name || mapping.businessPartner?.code || mapping.businessPartnerId}</td>
                        <td style={{ padding: 10 }}>{mapping.status || "PENDING"}</td>
                        <td style={{ padding: 10 }}>0</td>
                        <td style={{ padding: 10 }}>0</td>
                        <td style={{ padding: 10 }}>0</td>
                        <td style={{ padding: 10 }}>0</td>
                        <td style={{ padding: 10 }}>0</td>
                        <td style={{ padding: 10 }}>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button className="button secondary" style={{ width: "auto" }} type="button" onClick={() => toast.success("View flow is coming soon.")}>
                              View
                            </button>
                            <button className="button secondary" style={{ width: "auto" }} type="button" onClick={() => handleRemove(mapping.businessPartnerId)} disabled={removing}>
                              {removing ? "Removing..." : "Remove"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="card" style={{ padding: 24, display: "grid", gap: 12, justifyItems: "center", textAlign: "center" }}>
                <div>No Business Partners assigned yet.</div>
                <button className="button" style={{ width: "auto" }} type="button" onClick={() => setActiveTab("businessPartners")}>
                  Assign Business Partner
                </button>
              </div>
            )}
          </div>
        ) : null}

        {!loading && !error && !["overview", "competitionLevels", "worksheets", "questionBank", "businessPartners"].includes(activeTab) ? (
          <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--color-text-muted)" }}>
            Coming Soon
          </div>
        ) : null}
      </div>
    </div>
  );
}

export { SuperadminCompetitionDetailsPage };
