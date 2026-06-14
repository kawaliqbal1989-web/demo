import { useEffect, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { SkeletonLoader } from "../../components/SkeletonLoader";
import { PageHeader } from "../../components/PageHeader";
import { LogoUploadField } from "../../components/LogoUploadField";
import { getBpCenterCapacitySummary, updateBpCenterCapacity } from "../../services/capacityService";
import { listUsersByRole } from "../../services/usersService";
import {
  saDeleteCenterLogo,
  saGetCenterDetail,
  saUpdateCenterBranding,
  saUpdateCenterCurriculumAccess,
  saUploadCenterLogo
} from "../../services/superadminService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { StatusBadge } from "../../components/StatusBadge";
import { formatCapacityUsage } from "../../utils/capacityGovernance";

const initialBrandingForm = {
  brandingMode: "INHERIT_FRANCHISE",
  customBrandName: "",
  customLogoUrl: "",
  commercializationTier: "STANDARD_CENTER",
  brandingActive: true,
  brandingLocked: false,
  brandingNotes: ""
};

const initialCapacityForm = {
  maxStudents: "",
  maxTeachers: ""
};

const initialCurriculumAccessForm = {
  maxLicensedLevelRank: "1",
  licenseStartDate: "",
  licenseExpiryDate: "",
  licenseNotes: ""
};

function parseCapacityField(value, label) {
  const text = String(value ?? "").trim();
  if (!text) {
    return {
      parsed: null,
      error: `${label} is required.`
    };
  }

  if (!/^\d+$/.test(text)) {
    return {
      parsed: null,
      error: `${label} must be a non-negative integer.`
    };
  }

  return {
    parsed: Number(text),
    error: ""
  };
}

function buildFallbackCapacitySummary(detail) {
  const centerName = detail?.displayName || detail?.name || detail?.authUser?.username || "Center";
  const studentsUsed = Number(detail?.metrics?.studentsCount || 0);
  const teachersUsed = Number(detail?.metrics?.teachersCount || 0);

  return {
    centerId: detail?.id || null,
    centerName,
    usage: {
      students: {
        configured: false,
        used: studentsUsed,
        limit: null,
        remaining: null,
        utilizationPercent: null,
        state: "unmanaged"
      },
      teachers: {
        configured: false,
        used: teachersUsed,
        limit: null,
        remaining: null,
        utilizationPercent: null,
        state: "unmanaged"
      }
    }
  };
}

function CapacityManagementModal({
  open,
  loading,
  saving,
  centerName,
  capacitySummary,
  form,
  errors,
  requestError,
  onChange,
  onClose,
  onSubmit
}) {
  const titleId = useId();

  if (!open) {
    return null;
  }

  const studentUsage = capacitySummary?.usage?.students || null;
  const teacherUsage = capacitySummary?.usage?.teachers || null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={onClose}>
      <div className="modal-panel" style={{ maxWidth: 560 }} onClick={(event) => event.stopPropagation()}>
        <div className="modal-panel__header">
          <h3 className="modal-panel__title" id={titleId}>Manage Capacity</h3>
          <button className="modal-panel__close" type="button" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="modal-panel__body" style={{ display: "grid", gap: 16 }}>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
            Update student and teacher limits for <strong>{centerName || "selected center"}</strong>.
          </div>

          {loading ? (
            <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Loading current capacity...</div>
          ) : (
            <>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                <div className="capacity-card capacity-card--healthy" style={{ gap: 8 }}>
                  <div className="capacity-card__eyebrow">Students</div>
                  <div className="capacity-card__value">{formatCapacityUsage(studentUsage)}</div>
                  <div className="capacity-card__subtitle">Current usage</div>
                </div>
                <div className="capacity-card capacity-card--healthy" style={{ gap: 8 }}>
                  <div className="capacity-card__eyebrow">Teachers</div>
                  <div className="capacity-card__value">{formatCapacityUsage(teacherUsage)}</div>
                  <div className="capacity-card__subtitle">Current usage</div>
                </div>
              </div>

              <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>Max Students</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={form.maxStudents}
                    onChange={(event) => onChange("maxStudents", event.target.value)}
                    aria-invalid={Boolean(errors.maxStudents)}
                  />
                  {errors.maxStudents ? <span className="error">{errors.maxStudents}</span> : null}
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>Max Teachers</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={form.maxTeachers}
                    onChange={(event) => onChange("maxTeachers", event.target.value)}
                    aria-invalid={Boolean(errors.maxTeachers)}
                  />
                  {errors.maxTeachers ? <span className="error">{errors.maxTeachers}</span> : null}
                </label>

                {requestError ? <div className="error">{requestError}</div> : null}

                <div className="modal-panel__footer" style={{ padding: 0 }}>
                  <button className="button secondary" type="button" style={{ width: "auto" }} onClick={onClose} disabled={saving}>
                    Cancel
                  </button>
                  <button className="button" type="submit" style={{ width: "auto" }} disabled={saving || loading || Boolean(errors.maxStudents) || Boolean(errors.maxTeachers)}>
                    {saving ? "Saving..." : "Save Capacity"}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SuperadminCentersPage() {
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [franchises, setFranchises] = useState([]);
  const [franchiseId, setFranchiseId] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [selectedCenterId, setSelectedCenterId] = useState("");
  const [selectedCenterDetail, setSelectedCenterDetail] = useState(null);
  const [brandingForm, setBrandingForm] = useState(initialBrandingForm);
  const [brandingLoading, setBrandingLoading] = useState(false);
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandingMessage, setBrandingMessage] = useState("");
  const [curriculumAccessForm, setCurriculumAccessForm] = useState(initialCurriculumAccessForm);
  const [curriculumAccessSaving, setCurriculumAccessSaving] = useState(false);
  const [curriculumAccessMessage, setCurriculumAccessMessage] = useState("");
  const [capacityModalOpen, setCapacityModalOpen] = useState(false);
  const [capacityLoading, setCapacityLoading] = useState(false);
  const [capacitySaving, setCapacitySaving] = useState(false);
  const [capacityError, setCapacityError] = useState("");
  const [capacityCenter, setCapacityCenter] = useState(null);
  const [capacitySummary, setCapacitySummary] = useState(null);
  const [capacityForm, setCapacityForm] = useState(initialCapacityForm);

  const applyBrandingForm = (detail) => {
    setBrandingForm({
      brandingMode: detail?.brandingMode || "INHERIT_FRANCHISE",
      customBrandName: detail?.customBrandName || "",
      customLogoUrl: detail?.customLogoUrl || "",
      commercializationTier: detail?.commercializationTier || "STANDARD_CENTER",
      brandingActive: detail?.brandingActive ?? true,
      brandingLocked: detail?.brandingLocked ?? false,
      brandingNotes: detail?.brandingNotes || ""
    });
  };

  const applyCurriculumAccessForm = (detail) => {
    const rank = Number(detail?.maxLicensedLevelRank || 1);
    setCurriculumAccessForm({
      maxLicensedLevelRank: String(Math.min(8, Math.max(1, Number.isFinite(rank) ? Math.floor(rank) : 1))),
      licenseStartDate: detail?.licenseStartDate ? new Date(detail.licenseStartDate).toISOString().slice(0, 10) : "",
      licenseExpiryDate: detail?.licenseExpiryDate ? new Date(detail.licenseExpiryDate).toISOString().slice(0, 10) : "",
      licenseNotes: detail?.licenseNotes || ""
    });
  };

  const load = async (next = { limit, offset, q, status, parentId: franchiseId }) => {
    setLoading(true);
    setError("");
    try {
      const data = await listUsersByRole("CENTER", next);
      setRows(data.data.items || []);
      setLimit(data.data.limit);
      setOffset(data.data.offset);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load centers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function loadFranchises() {
      try {
        const data = await listUsersByRole("FRANCHISE", { limit: 200, offset: 0, status: "ACTIVE" });
        const items = data?.data?.items || [];
        if (!cancelled) {
          setFranchises(items);
        }
      } catch {
        if (!cancelled) {
          setFranchises([]);
        }
      }
    }

    void loadFranchises();
    // Load centers initially (no franchise filter) so superadmins can view/search all centers
    void load({ limit, offset, q, status });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSearch = (event) => {
    event.preventDefault();
    setOffset(0);
    void load({ limit, offset: 0, q, status, parentId: franchiseId || undefined });
  };

  const handleRefresh = () => {
    void load({ limit, offset, q, status, parentId: franchiseId || undefined });
  };

  const closeCapacityModal = ({ force = false } = {}) => {
    if (capacitySaving && !force) {
      return;
    }

    setCapacityModalOpen(false);
    setCapacityLoading(false);
    setCapacitySaving(false);
    setCapacityError("");
    setCapacityCenter(null);
    setCapacitySummary(null);
    setCapacityForm(initialCapacityForm);
  };

  const capacityValidationErrors = useMemo(() => {
    const studentField = parseCapacityField(capacityForm.maxStudents, "Max Students");
    const teacherField = parseCapacityField(capacityForm.maxTeachers, "Max Teachers");
    const currentStudentsUsed = Number(capacitySummary?.usage?.students?.used || 0);
    const currentTeachersUsed = Number(capacitySummary?.usage?.teachers?.used || 0);

    return {
      maxStudents: studentField.error
        || (studentField.parsed != null && studentField.parsed < currentStudentsUsed
          ? `Max Students cannot be below current usage (${currentStudentsUsed}).`
          : ""),
      maxTeachers: teacherField.error
        || (teacherField.parsed != null && teacherField.parsed < currentTeachersUsed
          ? `Max Teachers cannot be below current usage (${currentTeachersUsed}).`
          : "")
    };
  }, [capacityForm, capacitySummary]);

  const handleCapacityFieldChange = (field, value) => {
    setCapacityForm((current) => ({
      ...current,
      [field]: value
    }));
    setCapacityError("");
  };

  const handleOpenCapacity = async (centerUserId) => {
    setCapacityModalOpen(true);
    setCapacityLoading(true);
    setCapacitySaving(false);
    setCapacityError("");
    setCapacitySummary(null);
    setCapacityCenter({ userId: centerUserId, profileId: "", name: "" });
    setCapacityForm(initialCapacityForm);

    try {
      const detailResponse = await saGetCenterDetail(centerUserId);
      const detail = detailResponse?.data || null;
      const centerProfileId = detail?.id || "";
      const centerName = detail?.displayName || detail?.name || detail?.authUser?.username || "Center";

      const summaryResponse = centerProfileId
        ? await getBpCenterCapacitySummary({ centerId: centerProfileId, limit: 1, offset: 0 })
        : null;

      const snapshot = summaryResponse?.data?.items?.[0] || buildFallbackCapacitySummary(detail);
      setCapacityCenter({
        userId: centerUserId,
        profileId: centerProfileId,
        name: centerName
      });
      setCapacitySummary(snapshot);
      setCapacityForm({
        maxStudents: String(snapshot?.studentLimit ?? snapshot?.usage?.students?.limit ?? snapshot?.studentsUsed ?? detail?.metrics?.studentsCount ?? 0),
        maxTeachers: String(snapshot?.teacherLimit ?? snapshot?.usage?.teachers?.limit ?? snapshot?.teachersUsed ?? detail?.metrics?.teachersCount ?? 0)
      });
    } catch (err) {
      setCapacityError(getFriendlyErrorMessage(err) || "Failed to load center capacity.");
    } finally {
      setCapacityLoading(false);
    }
  };

  const handleSaveCapacity = async (event) => {
    event.preventDefault();

    if (!capacityCenter?.profileId || capacityValidationErrors.maxStudents || capacityValidationErrors.maxTeachers) {
      return;
    }

    setCapacitySaving(true);
    setCapacityError("");
    try {
      await updateBpCenterCapacity(capacityCenter.profileId, {
        maxStudents: Number(capacityForm.maxStudents),
        maxTeachers: Number(capacityForm.maxTeachers)
      });
      toast.success("Center capacity updated.");
      closeCapacityModal({ force: true });
    } catch (err) {
      const message = getFriendlyErrorMessage(err) || "Failed to update center capacity.";
      setCapacityError(message);
      toast.error(message);
    } finally {
      setCapacitySaving(false);
    }
  };

  const refreshSelectedCenterDetail = async (centerUserId) => {
    const result = await saGetCenterDetail(centerUserId);
    const detail = result?.data || null;
    setSelectedCenterDetail(detail);
    applyBrandingForm(detail);
    applyCurriculumAccessForm(detail);
    return detail;
  };

  const handleOpenBranding = async (centerUserId) => {
    setSelectedCenterId(centerUserId);
    setBrandingLoading(true);
    setBrandingMessage("");
    try {
      await refreshSelectedCenterDetail(centerUserId);
    } catch (err) {
      setBrandingMessage(getFriendlyErrorMessage(err) || "Failed to load center branding.");
      setSelectedCenterDetail(null);
      setBrandingForm(initialBrandingForm);
      setCurriculumAccessForm(initialCurriculumAccessForm);
    } finally {
      setBrandingLoading(false);
    }
  };

  const handleBrandingFieldChange = (field, value) => {
    setBrandingForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  const handleSaveBranding = async (event) => {
    event.preventDefault();
    if (!selectedCenterId) {
      return;
    }

    setBrandingSaving(true);
    setBrandingMessage("");
    try {
      const result = await saUpdateCenterBranding(selectedCenterId, {
        ...brandingForm,
        customBrandName: brandingForm.customBrandName.trim(),
        customLogoUrl: brandingForm.customLogoUrl.trim(),
        brandingNotes: brandingForm.brandingNotes.trim()
      });
      const detail = result?.data || null;
      setSelectedCenterDetail(detail);
      applyBrandingForm(detail);
      setBrandingMessage("Center branding updated.");
    } catch (err) {
      setBrandingMessage(getFriendlyErrorMessage(err) || "Failed to save center branding.");
    } finally {
      setBrandingSaving(false);
    }
  };

  const handleCurriculumAccessFieldChange = (field, value) => {
    setCurriculumAccessForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  const handleSaveCurriculumAccess = async (event) => {
    event.preventDefault();
    if (!selectedCenterId) {
      return;
    }

    const rankNumber = Number(curriculumAccessForm.maxLicensedLevelRank);
    if (!Number.isInteger(rankNumber) || rankNumber < 1 || rankNumber > 8) {
      setCurriculumAccessMessage("Licensed max level must be an integer between 1 and 8.");
      return;
    }

    setCurriculumAccessSaving(true);
    setCurriculumAccessMessage("");
    try {
      const result = await saUpdateCenterCurriculumAccess(selectedCenterId, {
        maxLicensedLevelRank: rankNumber,
        licenseStartDate: curriculumAccessForm.licenseStartDate || null,
        licenseExpiryDate: curriculumAccessForm.licenseExpiryDate || null,
        licenseNotes: curriculumAccessForm.licenseNotes.trim() || null
      });
      const detail = result?.data || null;
      setSelectedCenterDetail(detail);
      applyCurriculumAccessForm(detail);
      setCurriculumAccessMessage("Curriculum access updated.");
    } catch (err) {
      setCurriculumAccessMessage(getFriendlyErrorMessage(err) || "Failed to save curriculum access.");
    } finally {
      setCurriculumAccessSaving(false);
    }
  };

  const handleCenterLogoUpload = async (file, onProgress) => {
    if (!selectedCenterId) {
      return null;
    }

    setBrandingMessage("");
    await saUploadCenterLogo(selectedCenterId, file, { onProgress });
    await refreshSelectedCenterDetail(selectedCenterId);
    setBrandingMessage("Center logo updated.");
    return true;
  };

  const handleCenterLogoRemove = async () => {
    if (!selectedCenterId) {
      return null;
    }

    setBrandingMessage("");
    await saDeleteCenterLogo(selectedCenterId);
    await refreshSelectedCenterDetail(selectedCenterId);
    setBrandingMessage("Center logo removed.");
    return true;
  };

  const canRemoveCenterLogo = Boolean(selectedCenterDetail?.customLogoUrl || selectedCenterDetail?.logoFilePath);
  const effectiveCenterLogoPreviewUrl = selectedCenterDetail?.customLogoUrl
    || selectedCenterDetail?.effectiveBranding?.logoUrl
    || selectedCenterDetail?.logoUrl
    || "";

  if (loading && !rows.length) {
    return <SkeletonLoader variant="table" rows={6} />;
  }

  const handleSelectFranchise = (nextId) => {
    setFranchiseId(nextId);
    setOffset(0);
    setRows([]);
    setError("");
    if (nextId) {
      void load({ limit, offset: 0, q, status, parentId: nextId });
    }
  };

  const handleStatusChange = (nextStatus) => {
    setStatus(nextStatus);
    setOffset(0);
    if (!franchiseId) {
      return;
    }
    void load({ limit, offset: 0, q, status: nextStatus, parentId: franchiseId });
  };

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <PageHeader title="Center / School List" subtitle="Review centers under your franchise." />
      {error ? <div className="card"><p className="error">{error}</p></div> : null}

      <div className="card" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="input"
            placeholder="Search code or name"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 280 }}
          />

          <select
            className="select"
            value={status}
            onChange={(e) => handleStatusChange(e.target.value)}
            style={{ width: 160 }}
          >
            <option value="">All Status</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
          </select>

          <select
            className="select"
            value={franchiseId}
            onChange={(e) => handleSelectFranchise(e.target.value)}
            style={{ width: 220 }}
          >
            <option value="">Select Franchise</option>
            {franchises.map((f) => (
              <option key={f.id} value={f.hierarchyNodeId || ""}>
                {(f.hierarchyNode?.code || f.username || "").trim()} {f.hierarchyNode?.name ? `- ${f.hierarchyNode.name}` : ""}
              </option>
            ))}
          </select>

          <button className="button secondary" type="submit" style={{ width: "auto" }} disabled={!franchiseId}>
            Search
          </button>
        </form>

        <div style={{ flex: 1 }} />
        <button className="button secondary" type="button" onClick={handleRefresh} style={{ width: "auto" }} disabled={!franchiseId}>
          Refresh
        </button>
      </div>

      <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
        {franchiseId ? (
          <span>Viewing centers for selected franchise.</span>
        ) : (
          <span>Viewing all centers. Select a franchise to filter results.</span>
        )}
      </div>

      <DataTable
        columns={[
          {
            key: "code",
            header: "Code",
            render: (r) => r?.hierarchyNode?.code || r?.username || ""
          },
          { key: "username", header: "Username" },
          {
            key: "name",
            header: "Name",
            render: (r) => r?.hierarchyNode?.name || ""
          },
          {
            key: "franchise",
            header: "Franchise",
            render: (r) => {
              const parent = r?.hierarchyNode?.parent;
              const code = parent?.code ? String(parent.code) : "";
              const name = parent?.name ? String(parent.name) : "";
              if (code && name) return `${code} / ${name}`;
              return name || code || "";
            }
          },
          {
            key: "partner",
            header: "Partner",
            render: (r) => {
              const partner = r?.hierarchyNode?.parent?.parent;
              const code = partner?.code ? String(partner.code) : "";
              const name = partner?.name ? String(partner.name) : "";
              if (code && name) return `${code} / ${name}`;
              return name || code || "";
            }
          },
          {
            key: "status",
            header: "Status",
            render: (r) => {
              const active = r?.hierarchyNode?.isActive;
              return <StatusBadge value={active === false ? "INACTIVE" : "ACTIVE"} />;
            }
          },
          {
            key: "actions",
            header: "Actions",
            render: (r) => {
              const bpNode = r?.hierarchyNode?.parent?.parent;
              const bpId = bpNode?.businessPartner?.id;
              return (
                <div style={{ display: "flex", gap: 6 }}>
                  {bpId ? (
                    <Link to={`/superadmin/business-partners/${bpId}`} className="button secondary" style={{ width: "auto", fontSize: 12, padding: "2px 8px", textDecoration: "none" }}>
                      View BP
                    </Link>
                  ) : null}
                  <button
                    className="button secondary"
                    type="button"
                    style={{ width: "auto", fontSize: 12, padding: "2px 8px" }}
                    onClick={() => handleOpenBranding(r.id)}
                  >
                    Branding
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    style={{ width: "auto", fontSize: 12, padding: "2px 8px" }}
                    onClick={() => {
                      void handleOpenCapacity(r.id);
                    }}
                  >
                    Manage Capacity
                  </button>
                </div>
              );
            }
          }
        ]}
        rows={rows}
        keyField="id"
      />

      <PaginationBar
        limit={limit}
        offset={offset}
        count={rows.length}
        onChange={(next) => {
          setLimit(next.limit);
          setOffset(next.offset);
          void load({ ...next, q, status, parentId: franchiseId || undefined });
        }}
      />

      {selectedCenterId ? (
        <section className="card" style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>Center Branding</div>
              <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>
                Superadmin-only controls for mini-center commercialization and branding inheritance.
              </div>
            </div>
            {selectedCenterDetail?.effectiveBranding ? (
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", textAlign: "right" }}>
                <div>Effective brand: {selectedCenterDetail.effectiveBranding.displayName || "-"}</div>
                <div>Source: {selectedCenterDetail.effectiveBranding.brandingSource || "-"}</div>
              </div>
            ) : null}
          </div>

          {brandingMessage ? <div style={{ color: brandingMessage === "Center branding updated." ? "#166534" : "#b91c1c", fontSize: 13 }}>{brandingMessage}</div> : null}

          {brandingLoading ? (
            <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Loading branding detail...</div>
          ) : selectedCenterDetail ? (
            <form onSubmit={handleSaveBranding} style={{ display: "grid", gap: 12 }}>
              <LogoUploadField
                title="Center Logo"
                description="Upload a logo from this PC for the selected center, or remove it to fall back to inherited branding."
                currentLogoUrl={selectedCenterDetail.customLogoUrl || ""}
                previewLogoUrl={effectiveCenterLogoPreviewUrl}
                canRemove={canRemoveCenterLogo}
                onUpload={handleCenterLogoUpload}
                onRemove={handleCenterLogoRemove}
                disabled={brandingSaving || brandingLoading}
              />

              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>Branding Mode</span>
                  <select className="select" value={brandingForm.brandingMode} onChange={(e) => handleBrandingFieldChange("brandingMode", e.target.value)}>
                    <option value="INHERIT_FRANCHISE">Inherit Franchise</option>
                    <option value="CUSTOM_CENTER">Custom Center</option>
                  </select>
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>Commercialization Tier</span>
                  <select className="select" value={brandingForm.commercializationTier} onChange={(e) => handleBrandingFieldChange("commercializationTier", e.target.value)}>
                    <option value="STANDARD_CENTER">Standard Center</option>
                    <option value="MINI_CENTER">Mini Center</option>
                    <option value="PREMIUM_CENTER">Premium Center</option>
                  </select>
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>Brand Name</span>
                  <input className="input" value={brandingForm.customBrandName} onChange={(e) => handleBrandingFieldChange("customBrandName", e.target.value)} placeholder="Mini Center Brand" />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>Logo URL</span>
                  <input className="input" value={brandingForm.customLogoUrl} onChange={(e) => handleBrandingFieldChange("customLogoUrl", e.target.value)} placeholder="/uploads/logos/... or https://..." />
                </label>
              </div>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Branding Notes</span>
                <textarea className="input" rows={4} value={brandingForm.brandingNotes} onChange={(e) => handleBrandingFieldChange("brandingNotes", e.target.value)} placeholder="Approval or commercialization notes" />
              </label>

              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                  <input type="checkbox" checked={brandingForm.brandingActive} onChange={(e) => handleBrandingFieldChange("brandingActive", e.target.checked)} />
                  Branding active
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                  <input type="checkbox" checked={brandingForm.brandingLocked} onChange={(e) => handleBrandingFieldChange("brandingLocked", e.target.checked)} />
                  Branding locked
                </label>
              </div>

              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", fontSize: 13, color: "var(--color-text-muted)" }}>
                <div>Center: {selectedCenterDetail.displayName || selectedCenterDetail.name || "-"}</div>
                <div>Approved at: {selectedCenterDetail.brandingApprovedAt ? new Date(selectedCenterDetail.brandingApprovedAt).toLocaleString() : "-"}</div>
                <div>Approved by: {selectedCenterDetail.brandingApprovedBy?.username || selectedCenterDetail.brandingApprovedBy?.email || "-"}</div>
                <div>Effective logo: {selectedCenterDetail.effectiveBranding?.logoUrl || "-"}</div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="button secondary" type="submit" style={{ width: "auto" }} disabled={brandingSaving}>
                  {brandingSaving ? "Saving..." : "Save Branding"}
                </button>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}

      {selectedCenterId ? (
        <section className="card" style={{ display: "grid", gap: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>Curriculum Access Licensing</div>
            <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>
              Permanent authority for worksheet and catalog visibility. Enrollment-derived visibility is disabled.
            </div>
          </div>

          {curriculumAccessMessage ? (
            <div style={{ color: curriculumAccessMessage === "Curriculum access updated." ? "#166534" : "#b91c1c", fontSize: 13 }}>
              {curriculumAccessMessage}
            </div>
          ) : null}

          {brandingLoading ? (
            <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Loading curriculum access detail...</div>
          ) : selectedCenterDetail ? (
            <form onSubmit={handleSaveCurriculumAccess} style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>Licensed Max Level Rank</span>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    max="8"
                    step="1"
                    value={curriculumAccessForm.maxLicensedLevelRank}
                    onChange={(e) => handleCurriculumAccessFieldChange("maxLicensedLevelRank", e.target.value)}
                  />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>License Start Date</span>
                  <input
                    className="input"
                    type="date"
                    value={curriculumAccessForm.licenseStartDate}
                    onChange={(e) => handleCurriculumAccessFieldChange("licenseStartDate", e.target.value)}
                  />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>License Expiry Date</span>
                  <input
                    className="input"
                    type="date"
                    value={curriculumAccessForm.licenseExpiryDate}
                    onChange={(e) => handleCurriculumAccessFieldChange("licenseExpiryDate", e.target.value)}
                  />
                </label>
              </div>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>License Notes</span>
                <textarea
                  className="input"
                  rows={3}
                  value={curriculumAccessForm.licenseNotes}
                  onChange={(e) => handleCurriculumAccessFieldChange("licenseNotes", e.target.value)}
                  placeholder="Contract, renewal, or policy notes"
                />
              </label>

              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", fontSize: 13, color: "var(--color-text-muted)" }}>
                <div>Current licensed max rank: {selectedCenterDetail?.maxLicensedLevelRank || 1}</div>
                <div>Start: {selectedCenterDetail?.licenseStartDate ? new Date(selectedCenterDetail.licenseStartDate).toLocaleDateString() : "-"}</div>
                <div>Expiry: {selectedCenterDetail?.licenseExpiryDate ? new Date(selectedCenterDetail.licenseExpiryDate).toLocaleDateString() : "-"}</div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="button secondary" type="submit" style={{ width: "auto" }} disabled={curriculumAccessSaving}>
                  {curriculumAccessSaving ? "Saving..." : "Save Curriculum Access"}
                </button>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}

      <CapacityManagementModal
        open={capacityModalOpen}
        loading={capacityLoading}
        saving={capacitySaving}
        centerName={capacityCenter?.name}
        capacitySummary={capacitySummary}
        form={capacityForm}
        errors={capacityValidationErrors}
        requestError={capacityError}
        onChange={handleCapacityFieldChange}
        onClose={closeCapacityModal}
        onSubmit={handleSaveCapacity}
      />
    </section>
  );
}

export { SuperadminCentersPage };