import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { EmptyState } from "../../components/EmptyState";
import { LoadingState } from "../../components/LoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import { InputDialog } from "../../components/InputDialog";
import { StepWizard } from "../../components/StepWizard";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import {
  listCompetitions,
  createCompetition,
  forwardCompetitionRequest,
  rejectCompetitionRequest,
  exportCompetitionResultsCsv
} from "../../services/competitionsService";
import { listBusinessPartners } from "../../services/businessPartnersService";
import { listCompetitionFoundationTemplates } from "../../services/competitionFoundationService";
import { CompetitionModuleNav } from "./CompetitionModuleNav";

function normalizeArrayResponse(payload) {
  if (Array.isArray(payload?.data?.items)) {
    return payload.data.items;
  }
  if (Array.isArray(payload?.data)) {
    return payload.data;
  }
  if (Array.isArray(payload?.items)) {
    return payload.items;
  }
  if (Array.isArray(payload)) {
    return payload;
  }
  return [];
}

function formatDateValue(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString();
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

function getTemplateName(row, templates) {
  if (row?.template?.name) return row.template.name;
  if (row?.templateName) return row.templateName;
  if (row?.templateId) {
    const match = templates.find((template) => template.id === row.templateId);
    if (match?.name) return match.name;
  }
  return "—";
}

function normalizeBusinessPartnerIds(ids) {
  if (!Array.isArray(ids)) {
    return [];
  }

  return [...new Set(ids.map((value) => String(value || "").trim()).filter(Boolean))];
}

function CompetitionWizardModal({ open, templates, businessPartners, onClose, onCreated, loading }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("Abacus Competition");
  const [code, setCode] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [description, setDescription] = useState("");
  const [registrationStartsAt, setRegistrationStartsAt] = useState("");
  const [registrationEndsAt, setRegistrationEndsAt] = useState("");
  const [practiceEnabled, setPracticeEnabled] = useState(true);
  const [practiceStartsAt, setPracticeStartsAt] = useState("");
  const [practiceEndsAt, setPracticeEndsAt] = useState("");
  const [competitionStartsAt, setCompetitionStartsAt] = useState("");
  const [competitionEndsAt, setCompetitionEndsAt] = useState("");
  const [resultPublishDate, setResultPublishDate] = useState("");
  const [certificatePublishDate, setCertificatePublishDate] = useState("");
  const [attemptLimit, setAttemptLimit] = useState("1");
  const [selectedPartnerIds, setSelectedPartnerIds] = useState([]);
  const [partnerSearch, setPartnerSearch] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep(0);
      setName("Abacus Competition");
      setCode("");
      setTemplateId("");
      setDescription("");
      setRegistrationStartsAt("");
      setRegistrationEndsAt("");
      setPracticeEnabled(true);
      setPracticeStartsAt("");
      setPracticeEndsAt("");
      setCompetitionStartsAt("");
      setCompetitionEndsAt("");
      setResultPublishDate("");
      setCertificatePublishDate("");
      setAttemptLimit("1");
      setSelectedPartnerIds([]);
      setPartnerSearch("");
      setCreating(false);
    }
  }, [open]);

  const filteredPartners = useMemo(() => {
    const query = partnerSearch.trim().toLowerCase();
    return businessPartners.filter((partner) => {
      if (!query) return true;
      return `${partner.name || ""} ${partner.code || ""}`.toLowerCase().includes(query);
    });
  }, [businessPartners, partnerSearch]);
  const allowedPartnerIdSet = useMemo(() => new Set(businessPartners.map((partner) => String(partner?.id || "").trim()).filter(Boolean)), [businessPartners]);

  const selectedTemplate = templates.find((template) => template.id === templateId);

  const resetSelection = () => {
    setSelectedPartnerIds([]);
  };

  const handleCreate = async (publish = false) => {
    if (!name.trim() || !templateId || !competitionStartsAt || !competitionEndsAt) {
      toast.error("Competition name, template, start date, and end date are required.");
      return;
    }

    if (creating) {
      return;
    }

    setCreating(true);
    try {
      const submitPartnerIds = normalizeBusinessPartnerIds(selectedPartnerIds).filter((id) => allowedPartnerIdSet.has(id));
      await onCreated({
        title: name.trim(),
        code: code.trim(),
        description: description.trim(),
        templateId,
        businessPartnerIds: submitPartnerIds,
        registrationStartsAt,
        registrationEndsAt,
        startsAt: competitionStartsAt,
        endsAt: competitionEndsAt,
        practiceEnabled,
        practiceStartsAt,
        practiceEndsAt,
        resultPublishDate,
        certificatePublishDate,
        attemptLimit: Number(attemptLimit) || 1,
        publish
      });
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.45)", zIndex: 1200, display: "flex", justifyContent: "flex-end" }}>
      <div className="card" style={{ width: "min(860px, 100%)", maxHeight: "100vh", overflowY: "auto", borderRadius: 0, margin: 0, padding: 24, display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>Create Competition</div>
            <h3 style={{ margin: "4px 0 0" }}>Competition Wizard</h3>
          </div>
          <button className="button secondary" style={{ width: "auto" }} type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <StepWizard steps={["Basic", "Schedule", "Partners", "Review"]} current={step} />

        {step === 0 ? (
          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Competition Name</span>
              <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter competition name" />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Competition Code</span>
              <input className="input" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Auto-generated or custom" />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Foundation Template</span>
              <select className="input" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                <option value="">Select template</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Description</span>
              <textarea className="input" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the competition purpose and scope" />
            </label>
            <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
              Competition levels are selected later during teacher registration. This page manages the global competition event only.
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Enrollment Start</span>
              <input className="input" type="datetime-local" value={registrationStartsAt} onChange={(event) => setRegistrationStartsAt(event.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Enrollment End</span>
              <input className="input" type="datetime-local" value={registrationEndsAt} onChange={(event) => setRegistrationEndsAt(event.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Practice Enabled</span>
              <select className="input" value={practiceEnabled ? "yes" : "no"} onChange={(event) => setPracticeEnabled(event.target.value === "yes")}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Practice Start</span>
              <input className="input" type="datetime-local" value={practiceStartsAt} onChange={(event) => setPracticeStartsAt(event.target.value)} disabled={!practiceEnabled} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Practice End</span>
              <input className="input" type="datetime-local" value={practiceEndsAt} onChange={(event) => setPracticeEndsAt(event.target.value)} disabled={!practiceEnabled} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Competition Start</span>
              <input className="input" type="datetime-local" value={competitionStartsAt} onChange={(event) => setCompetitionStartsAt(event.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Competition End</span>
              <input className="input" type="datetime-local" value={competitionEndsAt} onChange={(event) => setCompetitionEndsAt(event.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Result Publish Date</span>
              <input className="input" type="datetime-local" value={resultPublishDate} onChange={(event) => setResultPublishDate(event.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Certificate Publish Date</span>
              <input className="input" type="datetime-local" value={certificatePublishDate} onChange={(event) => setCertificatePublishDate(event.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Attempt Limit</span>
              <input className="input" type="number" min="1" value={attemptLimit} onChange={(event) => setAttemptLimit(event.target.value)} />
            </label>
          </div>
        ) : null}

        {step === 2 ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 600 }}>Business Partners</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="button secondary" style={{ width: "auto", fontSize: 12 }} onClick={() => setSelectedPartnerIds(filteredPartners.map((partner) => partner.id))}>Select All</button>
                <button type="button" className="button secondary" style={{ width: "auto", fontSize: 12 }} onClick={resetSelection}>Clear All</button>
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{selectedPartnerIds.length} selected</span>
              </div>
            </div>
            <input className="input" value={partnerSearch} onChange={(event) => setPartnerSearch(event.target.value)} placeholder="Search business partners" />
            <div style={{ display: "grid", gap: 8, maxHeight: 280, overflowY: "auto" }}>
              {filteredPartners.map((partner) => (
                <label key={partner.id} style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--color-border)", borderRadius: 8, padding: "10px 12px" }}>
                  <input type="checkbox" checked={selectedPartnerIds.includes(partner.id)} onChange={() => setSelectedPartnerIds((prev) => prev.includes(partner.id) ? prev.filter((item) => item !== partner.id) : [...prev, partner.id])} />
                  <div>
                    <div style={{ fontWeight: 600 }}>{partner.name || partner.displayName || partner.code}</div>
                    {partner.code ? <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{partner.code}</div> : null}
                  </div>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div className="card" style={{ padding: 16, display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 700 }}>Competition Summary</div>
              <div style={{ fontSize: 13, color: "var(--color-text-muted)", display: "grid", gap: 6 }}>
                <div><strong>Name:</strong> {name || "—"}</div>
                <div><strong>Template:</strong> {selectedTemplate?.name || "—"}</div>
                <div><strong>Enrollment Window:</strong> {registrationStartsAt && registrationEndsAt ? `${formatDateValue(registrationStartsAt)} → ${formatDateValue(registrationEndsAt)}` : "—"}</div>
                <div><strong>Practice Window:</strong> {practiceEnabled ? `${practiceStartsAt ? formatDateValue(practiceStartsAt) : "—"} → ${practiceEndsAt ? formatDateValue(practiceEndsAt) : "—"}` : "Disabled"}</div>
                <div><strong>Competition Window:</strong> {competitionStartsAt && competitionEndsAt ? `${formatDateValue(competitionStartsAt)} → ${formatDateValue(competitionEndsAt)}` : "—"}</div>
                <div><strong>Result Date:</strong> {resultPublishDate ? formatDateValue(resultPublishDate) : "—"}</div>
                <div><strong>Certificate Date:</strong> {certificatePublishDate ? formatDateValue(certificatePublishDate) : "—"}</div>
                <div><strong>Business Partners:</strong> {selectedPartnerIds.length}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="button secondary" style={{ width: "auto" }} type="button" onClick={() => handleCreate(false)} disabled={creating || loading}>
                {creating ? "Saving..." : "Save Draft"}
              </button>
              <button className="button" style={{ width: "auto" }} type="button" onClick={() => handleCreate(true)} disabled={creating || loading}>
                {creating ? "Publishing..." : "Publish"}
              </button>
            </div>
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <button className="button secondary" style={{ width: "auto" }} type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0}>
            Back
          </button>
          <button className="button" style={{ width: "auto" }} type="button" onClick={() => setStep((current) => Math.min(3, current + 1))} disabled={step === 3}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function SuperadminCompetitionPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [businessPartners, setBusinessPartners] = useState([]);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rejectTarget, setRejectTarget] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [templateFilter, setTemplateFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [selectedMetric, setSelectedMetric] = useState("all");
  const [total, setTotal] = useState(0);

  const load = async (next = { limit, offset }) => {
    setLoading(true);
    setError("");
    try {
      const data = await listCompetitions(next);
      const nextRows = data?.data?.items || data?.data || [];
      setRows(nextRows);
      setTotal(data?.data?.total ?? nextRows.length);
      setLimit(next.limit);
      setOffset(next.offset);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load competitions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load({ limit, offset });
    void (async () => {
      try {
        const [tmpls, bps] = await Promise.all([
          listCompetitionFoundationTemplates({ includeInactive: true }),
          listBusinessPartners({ limit: 100, offset: 0 })
        ]);
        setTemplates(normalizeArrayResponse(tmpls));
        setBusinessPartners(normalizeArrayResponse(bps));
      } catch {
        setTemplates([]);
        setBusinessPartners([]);
      }
    })();
  }, []);

  const dashboardCards = useMemo(() => {
    const counts = {
      all: rows.length,
      draft: 0,
      published: 0,
      enrollmentOpen: 0,
      running: 0,
      completed: 0,
      archived: 0
    };

    rows.forEach((row) => {
      const bucket = getCompetitionStatusBucket(row);
      if (bucket === "DRAFT") counts.draft += 1;
      if (bucket === "PUBLISHED") counts.published += 1;
      if (bucket === "ENROLLMENT_OPEN") counts.enrollmentOpen += 1;
      if (bucket === "RUNNING") counts.running += 1;
      if (bucket === "COMPLETED") counts.completed += 1;
      if (bucket === "ARCHIVED") counts.archived += 1;
    });

    return [
      { key: "all", label: "Total Competitions", value: counts.all, tone: "#2563eb" },
      { key: "draft", label: "Draft", value: counts.draft, tone: "#8b5cf6" },
      { key: "published", label: "Published", value: counts.published, tone: "#16a34a" },
      { key: "enrollmentOpen", label: "Enrollment Open", value: counts.enrollmentOpen, tone: "#f59e0b" },
      { key: "running", label: "Competition Running", value: counts.running, tone: "#0f766e" },
      { key: "completed", label: "Completed", value: counts.completed, tone: "#6366f1" },
      { key: "archived", label: "Archived", value: counts.archived, tone: "#ef4444" }
    ];
  }, [rows]);

  const visibleRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return rows.filter((row) => {
      const bucket = getCompetitionStatusBucket(row);
      if (selectedMetric !== "all" && bucket !== selectedMetric) {
        return false;
      }
      if (statusFilter && bucket !== statusFilter) {
        return false;
      }
      if (templateFilter) {
        const templateName = getTemplateName(row, templates).toLowerCase();
        if (templateName !== templateFilter.toLowerCase()) {
          return false;
        }
      }
      if (dateFilter) {
        const dateValue = row?.startsAt || row?.registrationStartsAt || "";
        if (!String(dateValue).startsWith(dateFilter)) {
          return false;
        }
      }
      if (!normalizedSearch) {
        return true;
      }
      return [row?.title, row?.code, getTemplateName(row, templates), row?.createdBy?.email].some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
    });
  }, [rows, search, statusFilter, templateFilter, dateFilter, selectedMetric, templates]);

  const handleApprove = async (row) => {
    const workflowStage = String(row?.workflowStage || "").toUpperCase();

    if (workflowStage === "APPROVED") {
      toast.success("Competition is already approved.");
      return;
    }

    try {
      await forwardCompetitionRequest(row.id);
      toast.success("Competition approved.");
      await load({ limit, offset });
    } catch (err) {
      const errorCode = err?.response?.data?.error_code || err?.errorCode;
      if (errorCode === "WORKFLOW_STAGE_CONFLICT") {
        toast.success("Competition is already in a non-forwardable stage.");
        return;
      }

      toast.error(getFriendlyErrorMessage(err) || "Failed to approve.");
    }
  };

  const handleReject = (row) => {
    setRejectTarget(row);
  };

  const executeReject = async (reason) => {
    const row = rejectTarget;
    const normalizedReason = String(reason || "").trim();
    if (!normalizedReason) {
      toast.error("Rejection reason is required.");
      return;
    }
    setRejectTarget(null);
    try {
      await rejectCompetitionRequest(row.id, normalizedReason);
      toast.success("Competition rejected.");
      await load({ limit, offset });
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to reject.");
    }
  };

  const handleCreate = async (payload) => {
    setError("");
    try {
      await createCompetition(payload);
      toast.success(payload.publish ? "Competition published." : "Competition saved as draft.");
      setWizardOpen(false);
      await load({ limit, offset });
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to create.");
    }
  };

  const handleView = (event, row) => {
    event.preventDefault();
    event.stopPropagation();

    const competitionId = row?.id || row?.competitionId;
    if (competitionId) {
      navigate(`/superadmin/competition/${competitionId}`);
      return;
    }
    toast.success(`Viewing ${row?.title || "competition"}.`);
  };

  const handleEdit = (row) => {
    toast.success(`Editing ${row?.title || "competition"}.`);
  };

  const handleDuplicate = (row) => {
    toast.success(`Duplicate flow for ${row?.title || "competition"} is ready for a follow-up enhancement.`);
  };

  const handleArchive = (row) => {
    toast.success(`Archive workflow for ${row?.title || "competition"} is ready for a follow-up enhancement.`);
  };

  const handleDelete = (row) => {
    toast.success(`Delete workflow for ${row?.title || "competition"} is ready for a follow-up enhancement.`);
  };

  const handleExportCsv = async (row) => {
    try {
      const blob = await exportCompetitionResultsCsv(row.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `competition-${row.id}-results.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to export.");
    }
  };

  const columns = [
    { key: "title", header: "Competition Name", render: (row) => row?.title || "Untitled Competition" },
    { key: "code", header: "Competition Code", render: (row) => row?.code || "—" },
    { key: "template", header: "Template", render: (row) => getTemplateName(row, templates) },
    { key: "status", header: "Status", render: (row) => <StatusBadge status={getCompetitionStatusBucket(row)} /> },
    { key: "enrollmentWindow", header: "Enrollment Window", render: (row) => `${row?.registrationStartsAt ? formatDateValue(row.registrationStartsAt) : "—"} → ${row?.registrationEndsAt ? formatDateValue(row.registrationEndsAt) : "—"}` },
    { key: "competitionWindow", header: "Competition Window", render: (row) => `${row?.startsAt ? formatDateValue(row.startsAt) : "—"} → ${row?.endsAt ? formatDateValue(row.endsAt) : "—"}` },
    { key: "partners", header: "Business Partners", render: (row) => row?.businessPartnerMappings?.length ? row.businessPartnerMappings.length : "—" },
    { key: "registered", header: "Registered Students", render: (row) => row?.enrollments?.length ?? 0 },
    { key: "createdBy", header: "Created By", render: (row) => row?.createdBy?.email || row?.createdBy?.name || "System" },
    { key: "updatedAt", header: "Last Updated", render: (row) => formatDateValue(row?.updatedAt) },
    {
      key: "actions",
      header: "Actions",
      render: (row) => {
        const isApprovalStage = row?.workflowStage === "SUPERADMIN_APPROVAL";
        const isPublished = getCompetitionStatusBucket(row) === "PUBLISHED" || getCompetitionStatusBucket(row) === "RUNNING" || getCompetitionStatusBucket(row) === "COMPLETED";
        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, max-content)", gap: 6, justifyContent: "start" }}>
            <button className="button secondary" style={{ width: "auto", fontSize: 12, padding: "6px 10px" }} type="button" onClick={(event) => handleView(event, row)}>View</button>
            <button className="button secondary" style={{ width: "auto", fontSize: 12, padding: "6px 10px" }} type="button" onClick={() => handleEdit(row)}>Edit</button>
            <button className="button secondary" style={{ width: "auto", fontSize: 12, padding: "6px 10px" }} type="button" onClick={() => handleDuplicate(row)}>Duplicate</button>
            {isApprovalStage ? (
              <button className="button" style={{ width: "auto", fontSize: 12, padding: "6px 10px" }} type="button" onClick={() => handleApprove(row)}>Approve</button>
            ) : (
              <button className="button" style={{ width: "auto", fontSize: 12, padding: "6px 10px" }} type="button" onClick={() => handleApprove(row)} disabled={isPublished}>Publish</button>
            )}
            <button className="button secondary" style={{ width: "auto", fontSize: 12, padding: "6px 10px" }} type="button" onClick={() => handleArchive(row)}>Archive</button>
            <button className="button secondary" style={{ width: "auto", fontSize: 12, padding: "6px 10px" }} type="button" onClick={() => handleDelete(row)}>Delete</button>
            {isApprovalStage ? (
              <button className="button secondary" style={{ width: "auto", fontSize: 12, padding: "6px 10px" }} type="button" onClick={() => handleReject(row)}>Reject</button>
            ) : null}
            {isPublished ? (
              <button className="button secondary" style={{ width: "auto", fontSize: 12, padding: "6px 10px" }} type="button" onClick={() => handleExportCsv(row)}>Export</button>
            ) : null}
          </div>
        );
      }
    }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CompetitionModuleNav />

      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ margin: 0 }}>Competition</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Competition Dashboard</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="button secondary" style={{ width: "auto" }} onClick={() => void load({ limit, offset })}>Refresh</button>
          <button className="button" style={{ width: "auto" }} onClick={() => setWizardOpen(true)}>+ Create Competition</button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        {dashboardCards.map((card) => (
          <button key={card.key} className={`card ${selectedMetric === card.key ? "" : ""}`} onClick={() => setSelectedMetric(card.key)} style={{ border: selectedMetric === card.key ? `2px solid ${card.tone}` : "1px solid var(--color-border)", background: selectedMetric === card.key ? `${card.tone}10` : "var(--color-surface)", textAlign: "left", cursor: "pointer", padding: 16 }}>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 8 }}>{card.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: card.tone }}>{card.value}</div>
          </button>
        ))}
      </div>

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h3 style={{ margin: 0 }}>Competition List</h3>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Monitor the competition lifecycle and manage approvals.</div>
          </div>
        </div>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search competitions" />
          <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="ENROLLMENT_OPEN">Enrollment Open</option>
            <option value="RUNNING">Running</option>
            <option value="COMPLETED">Completed</option>
            <option value="ARCHIVED">Archived</option>
          </select>
          <select className="input" value={templateFilter} onChange={(event) => setTemplateFilter(event.target.value)}>
            <option value="">All Templates</option>
            {templates.map((template) => (
              <option key={template.id} value={template.name}>{template.name}</option>
            ))}
          </select>
          <input className="input" type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
        </div>

        {loading && !rows.length ? (
          <LoadingState label="Loading competitions..." />
        ) : visibleRows.length ? (
          <>
            <DataTable columns={columns} rows={visibleRows} keyField="id" emptyMessage="No competitions match the current filters." />
            <PaginationBar
              limit={limit}
              offset={offset}
              count={visibleRows.length}
              total={total}
              onChange={(next) => {
                setLimit(next.limit);
                setOffset(next.offset);
                void load({ limit: next.limit, offset: next.offset });
              }}
            />
          </>
        ) : (
          <EmptyState icon="📋" title="No competitions found" description="Create a new competition or adjust your filters to view the list." action={{ label: "Create competition", onClick: () => setWizardOpen(true) }} />
        )}
      </div>

      <CompetitionWizardModal
        open={wizardOpen}
        templates={templates}
        businessPartners={businessPartners}
        onClose={() => setWizardOpen(false)}
        loading={loading}
        onCreated={(payload) => void handleCreate(payload)}
      />

      <InputDialog
        open={!!rejectTarget}
        title="Reject Competition"
        message={`Reject "${rejectTarget?.title || ""}"?`}
        inputLabel="Reason"
        inputPlaceholder="Enter reason..."
        inputType="text"
        required
        confirmLabel="Reject"
        onCancel={() => setRejectTarget(null)}
        onConfirm={(val) => void executeReject(val)}
      />
    </div>
  );
}

export { SuperadminCompetitionPage };
