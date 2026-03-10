import { useEffect, useState } from "react";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { InputDialog } from "../../components/InputDialog";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { createFranchise, deleteFranchise, listFranchises, updateFranchise } from "../../services/franchisesService";
import { resetPasswordRequest } from "../../services/authService";

function BusinessPartnerFranchisesPage() {
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [createOpen, setCreateOpen] = useState(true);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");
  const [createdCredentials, setCreatedCredentials] = useState(null);

  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [resetPwTarget, setResetPwTarget] = useState(null);

  // Franchise Creation Fields
  const [franchiseName, setFranchiseName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [statusCreate, setStatusCreate] = useState("ACTIVE");
  const [phonePrimary, setPhonePrimary] = useState("");
  const [emailOfficial, setEmailOfficial] = useState("");

  const [phoneAlternate, setPhoneAlternate] = useState("");
  const [emailSupport, setEmailSupport] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [stateValue, setStateValue] = useState("");
  const [country, setCountry] = useState("India");
  const [pincode, setPincode] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [socialMediaLinks, setSocialMediaLinks] = useState("");
  const [operationalAreas, setOperationalAreas] = useState("");
  const [brandColors, setBrandColors] = useState("");
  const [onboardingDate, setOnboardingDate] = useState("");

  const [tempPassword, setTempPassword] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editMode, setEditMode] = useState("edit");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [editSuccess, setEditSuccess] = useState("");
  const [editTarget, setEditTarget] = useState(null);

  // Franchise Edit Fields (backend-supported)
  const [editFranchiseName, setEditFranchiseName] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editStatus, setEditStatus] = useState("ACTIVE");
  const [editPhonePrimary, setEditPhonePrimary] = useState("");
  const [editEmailOfficial, setEditEmailOfficial] = useState("");
  const [editPhoneAlternate, setEditPhoneAlternate] = useState("");
  const [editEmailSupport, setEditEmailSupport] = useState("");
  const [editWebsiteUrl, setEditWebsiteUrl] = useState("");
  const [editOnboardingDate, setEditOnboardingDate] = useState("");
  const [editSocialMediaLinks, setEditSocialMediaLinks] = useState("");
  const [editOperationalAreas, setEditOperationalAreas] = useState("");
  const [editBrandColors, setEditBrandColors] = useState("");
  const [editAddressLine1, setEditAddressLine1] = useState("");
  const [editAddressLine2, setEditAddressLine2] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editDistrict, setEditDistrict] = useState("");
  const [editStateValue, setEditStateValue] = useState("");
  const [editCountry, setEditCountry] = useState("India");
  const [editPincode, setEditPincode] = useState("");

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  const load = async (next = { limit, offset, q, status }) => {
    setLoading(true);
    setError("");
    try {
      const data = await listFranchises(next);
      setRows(data.data.items || []);
      setLimit(data.data.limit);
      setOffset(data.data.offset);
      setTotal(data.data.total || 0);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load franchises.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load({ limit, offset, q, status });
  }, []);

  if (loading && !rows.length) {
    return <LoadingState label="Loading franchises..." />;
  }

  const handleSearch = (e) => {
    e.preventDefault();
    setOffset(0);
    void load({ limit, offset: 0, q, status });
  };

  const handleStatusChange = (next) => {
    setStatus(next);
    setOffset(0);
    void load({ limit, offset: 0, q, status: next });
  };

  const generateTempPassword = () => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const symbols = "@#$%";
    let next = "";
    for (let i = 0; i < 10; i += 1) {
      next += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    next += symbols[Math.floor(Math.random() * symbols.length)];
    next += String(Math.floor(Math.random() * 90) + 10);
    setTempPassword(next);
    return next;
  };

  const normalizeStatusForBackend = (s) => {
    const v = String(s || "").trim().toUpperCase();
    // Backend supports ACTIVE/INACTIVE/ARCHIVED. Map SUSPENDED -> INACTIVE.
    if (v === "SUSPENDED") {
      return "INACTIVE";
    }
    return v;
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setCreateError("");
    setCreateSuccess("");
    setCreatedCredentials(null);

    const requiredMissing = [];
    if (!franchiseName.trim()) requiredMissing.push("franchise_name");
    if (!displayName.trim()) requiredMissing.push("display_name");
    if (!statusCreate) requiredMissing.push("status");
    if (!phonePrimary.trim()) requiredMissing.push("phone_primary");
    if (!emailOfficial.trim()) requiredMissing.push("email_official");

    if (requiredMissing.length) {
      setCreateError(`Missing required fields: ${requiredMissing.join(", ")}`);
      return;
    }

    const passwordToUse = tempPassword || generateTempPassword();
    if (passwordToUse.length < 8) {
      setCreateError("temp_password must be at least 8 characters");
      return;
    }

    setCreateLoading(true);
    try {
      const res = await createFranchise({
        name: franchiseName,
        displayName,
        status: statusCreate,
        phonePrimary,
        phoneAlternate,
        emailOfficial,
        emailSupport,
        websiteUrl,
        onboardingDate: onboardingDate || undefined,
        inheritBranding: true,
        // Optional fields the backend currently supports
        addressLine1,
        addressLine2,
        city,
        district,
        state: stateValue,
        country,
        pincode,
        password: passwordToUse
      });

      // Backend sets ACTIVE on create; apply non-ACTIVE status via update.
      const desired = normalizeStatusForBackend(statusCreate);
      const createdProfile = res?.data?.profile || null;
      const createdUserId = createdProfile?.authUserId || res?.data?.profile?.authUserId || res?.data?.profile?.authUser?.id;

      if (createdUserId && desired && desired !== "ACTIVE") {
        await updateFranchise({ id: createdUserId, status: desired });
      }

      setCreatedCredentials({
        franchise_code: res?.data?.code || res?.data?.profile?.code || "",
        username: res?.data?.username || res?.data?.profile?.code || "",
        temp_password: passwordToUse
      });
      setCreateSuccess("Franchise created");

      // Clear form (keep open)
      setFranchiseName("");
      setDisplayName("");
      setStatusCreate("ACTIVE");
      setPhonePrimary("");
      setEmailOfficial("");
      setPhoneAlternate("");
      setEmailSupport("");
      setAddressLine1("");
      setAddressLine2("");
      setCity("");
      setDistrict("");
      setStateValue("");
      setCountry("India");
      setPincode("");
      setWebsiteUrl("");
      setSocialMediaLinks("");
      setOperationalAreas("");
      setBrandColors("");
      setOnboardingDate("");
      setTempPassword("");

      await load({ limit, offset, q, status });
    } catch (err) {
      setCreateError(getFriendlyErrorMessage(err) || "Failed to create franchise.");
    } finally {
      setCreateLoading(false);
    }
  };

  const openEditForm = (row, mode = "edit") => {
    setEditError("");
    setEditSuccess("");
    setEditTarget(row);
    setEditMode(mode === "view" ? "view" : "edit");
    setEditOpen(true);

    setEditFranchiseName(row?.name || "");
    setEditDisplayName(row?.displayName || "");
    setEditStatus(row?.status || (row?.isActive ? "ACTIVE" : "INACTIVE"));
    setEditPhonePrimary(row?.phonePrimary || "");
    setEditEmailOfficial(row?.emailOfficial || row?.authUser?.email || "");
    setEditPhoneAlternate(row?.phoneAlternate || "");
    setEditEmailSupport(row?.emailSupport || "");
    setEditWebsiteUrl(row?.websiteUrl || "");
    setEditOnboardingDate(row?.onboardingDate ? String(row.onboardingDate).slice(0, 10) : "");
    setEditSocialMediaLinks(
      row?.socialMediaLinks && typeof row.socialMediaLinks === "object"
        ? JSON.stringify(row.socialMediaLinks)
        : ""
    );
    setEditOperationalAreas(
      Array.isArray(row?.operationalAreas)
        ? JSON.stringify(row.operationalAreas)
        : ""
    );
    setEditBrandColors(
      row?.brandColors && typeof row.brandColors === "object"
        ? JSON.stringify(row.brandColors)
        : ""
    );

    setEditAddressLine1(row?.address?.addressLine1 || "");
    setEditAddressLine2(row?.address?.addressLine2 || "");
    setEditCity(row?.address?.city || "");
    setEditDistrict(row?.address?.district || "");
    setEditStateValue(row?.address?.state || "");
    setEditCountry(row?.address?.country || "India");
    setEditPincode(row?.address?.pincode || "");
  };

  const closeEditForm = () => {
    setEditOpen(false);
    setEditMode("edit");
    setEditTarget(null);
    setEditError("");
    setEditSuccess("");
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();

    if (editMode === "view") {
      closeEditForm();
      return;
    }

    setEditError("");
    setEditSuccess("");

    const targetUserId = editTarget?.authUser?.id;
    if (!targetUserId) {
      setEditError("Missing franchise authUser id.");
      return;
    }

    const requiredMissing = [];
    if (!editFranchiseName.trim()) requiredMissing.push("franchise_name");
    if (!editDisplayName.trim()) requiredMissing.push("display_name");
    if (!editStatus) requiredMissing.push("status");
    if (!editPhonePrimary.trim()) requiredMissing.push("phone_primary");
    if (!editEmailOfficial.trim()) requiredMissing.push("email_official");

    if (requiredMissing.length) {
      setEditError(`Missing required fields: ${requiredMissing.join(", ")}`);
      return;
    }

    setEditLoading(true);
    try {
      await updateFranchise({
        id: targetUserId,
        name: editFranchiseName,
        displayName: editDisplayName,
        status: normalizeStatusForBackend(editStatus),
        phonePrimary: editPhonePrimary,
        emailOfficial: editEmailOfficial,
        phoneAlternate: editPhoneAlternate,
        emailSupport: editEmailSupport,
        websiteUrl: editWebsiteUrl,
        onboardingDate: editOnboardingDate || undefined,
        socialMediaLinks: editSocialMediaLinks || undefined,
        operationalAreas: editOperationalAreas || undefined,
        brandColors: editBrandColors || undefined,
        addressLine1: editAddressLine1,
        addressLine2: editAddressLine2,
        city: editCity,
        district: editDistrict,
        state: editStateValue,
        country: editCountry,
        pincode: editPincode
      });

      setEditSuccess("Saved");
      await load({ limit, offset, q, status });
      closeEditForm();
    } catch (err) {
      setEditError(getFriendlyErrorMessage(err) || "Failed to update franchise.");
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeactivate = async (row) => {
    setDeactivateTarget(row);
  };

  const executeDeactivate = async () => {
    const row = deactivateTarget;
    setDeactivateTarget(null);
    try {
      await deleteFranchise(row.authUser?.id);
      await load({ limit, offset, q, status });
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to deactivate franchise.");
    }
  };

  const handleResetPassword = async (row) => {
    setResetPwTarget(row);
  };

  const executeResetPassword = async (nextPassword) => {
    const row = resetPwTarget;
    setResetPwTarget(null);
    try {
      await resetPasswordRequest({ targetUserId: row.authUser?.id, newPassword: nextPassword, mustChangePassword: true });
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to reset password.");
    }
  };

  const columns = [
    { key: "code", header: "Franchise Code", render: (r) => r.code || "" },
    { key: "name", header: "Franchise Name", render: (r) => r.name || "" },
    { key: "username", header: "Username", render: (r) => r.authUser?.username || "" },
    { key: "email", header: "Email", render: (r) => r.authUser?.email || "" },
    { key: "phone", header: "Phone", render: (r) => r.phonePrimary || "" },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusBadge value={r.status || (r.isActive ? "ACTIVE" : "INACTIVE")} />
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) => (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="button secondary"
            style={{ width: "auto" }}
            type="button"
            onClick={() => openEditForm(r, "view")}
          >
            View
          </button>
          <button
            className="button secondary"
            style={{ width: "auto" }}
            type="button"
            onClick={() => openEditForm(r, "edit")}
            disabled={!r?.authUser?.id}
          >
            Edit
          </button>
          <button className="button secondary" style={{ width: "auto" }} type="button" onClick={() => handleResetPassword(r)}>
            Reset Password
          </button>
          <button className="button secondary" style={{ width: "auto" }} type="button" onClick={() => handleDeactivate(r)}>
            Deactivate
          </button>
        </div>
      )
    }
  ];

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Franchises</h2>
        <button className="button secondary" type="button" onClick={() => setCreateOpen((v) => !v)} style={{ width: "auto" }}>
          {createOpen ? "Hide Create Form" : "Show Create Form"}
        </button>
      </div>

      {createOpen ? (
        <form className="card" onSubmit={handleCreateSubmit} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 800 }}>Create Franchise</div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                `franchise_code` and `temp_password` are system-generated.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="button secondary" type="button" style={{ width: "auto" }} onClick={generateTempPassword}>
                Generate Temp Password
              </button>
              <button className="button" disabled={createLoading} style={{ width: "auto" }}>
                {createLoading ? "Creating..." : "Create"}
              </button>
            </div>
          </div>

          {createError ? (
            <div className="card" style={{ padding: 12 }}>
              <p className="error" style={{ margin: 0 }}>
                {createError}
              </p>
            </div>
          ) : null}

          {createSuccess ? (
            <div className="card" style={{ padding: 12 }}>
              <div style={{ color: "var(--color-text-success)", fontWeight: 800 }}>{createSuccess}</div>
              {createdCredentials ? (
                <div style={{ marginTop: 8, display: "grid", gap: 6, fontSize: 13 }}>
                  <div>
                    <b>franchise_code:</b> {createdCredentials.franchise_code}
                  </div>
                  <div>
                    <b>username:</b> {createdCredentials.username}
                  </div>
                  <div>
                    <b>temp_password:</b> {createdCredentials.temp_password}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <label>
              franchise_name *
              <input className="input" value={franchiseName} onChange={(e) => setFranchiseName(e.target.value)} />
            </label>

            <label>
              display_name *
              <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </label>

            <label>
              status *
              <select className="input" value={statusCreate} onChange={(e) => setStatusCreate(e.target.value)}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
                <option value="SUSPENDED">SUSPENDED</option>
              </select>
            </label>

            <label>
              phone_primary *
              <input className="input" value={phonePrimary} onChange={(e) => setPhonePrimary(e.target.value)} />
            </label>

            <label>
              email_official *
              <input className="input" type="email" value={emailOfficial} onChange={(e) => setEmailOfficial(e.target.value)} />
            </label>

            <label>
              temp_password (auto)
              <input className="input" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} placeholder="Generate or enter" />
            </label>
          </div>

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <label>
              phone_alternate
              <input className="input" value={phoneAlternate} onChange={(e) => setPhoneAlternate(e.target.value)} />
            </label>

            <label>
              email_support
              <input className="input" type="email" value={emailSupport} onChange={(e) => setEmailSupport(e.target.value)} />
            </label>

            <label>
              website_url
              <input className="input" type="url" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} />
            </label>

            <label>
              onboarding_date
              <input className="input" type="date" value={onboardingDate} onChange={(e) => setOnboardingDate(e.target.value)} />
            </label>
          </div>

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <label>
              address_line1
              <input className="input" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
            </label>

            <label>
              address_line2
              <input className="input" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />
            </label>

            <label>
              city
              <input className="input" value={city} onChange={(e) => setCity(e.target.value)} />
            </label>

            <label>
              district
              <input className="input" value={district} onChange={(e) => setDistrict(e.target.value)} />
            </label>

            <label>
              state
              <input className="input" value={stateValue} onChange={(e) => setStateValue(e.target.value)} />
            </label>

            <label>
              country
              <input className="input" value={country} onChange={(e) => setCountry(e.target.value)} />
            </label>

            <label>
              pincode
              <input className="input" value={pincode} onChange={(e) => setPincode(e.target.value)} />
            </label>
          </div>

          {/* removed social_media_links, operational_areas, brand_colors - not needed */}
        </form>
      ) : null}

      {editOpen ? (
        <form className="card" onSubmit={handleEditSubmit} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 800 }}>{editMode === "view" ? "View Franchise" : "Edit Franchise"}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Code: {editTarget?.code || ""} • Username: {editTarget?.authUser?.username || ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="button secondary" type="button" style={{ width: "auto" }} onClick={closeEditForm}>
                {editMode === "view" ? "Close" : "Cancel"}
              </button>
              {editMode === "edit" ? (
                <button className="button" disabled={editLoading} style={{ width: "auto" }}>
                  {editLoading ? "Saving..." : "Save"}
                </button>
              ) : null}
            </div>
          </div>

          {editError ? (
            <div className="card" style={{ padding: 12 }}>
              <p className="error" style={{ margin: 0 }}>
                {editError}
              </p>
            </div>
          ) : null}

          {editSuccess ? (
            <div className="card" style={{ padding: 12 }}>
              <div style={{ color: "var(--color-text-success)", fontWeight: 800 }}>{editSuccess}</div>
            </div>
          ) : null}

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <label>
              franchise_name *
              <input className="input" value={editFranchiseName} onChange={(e) => setEditFranchiseName(e.target.value)} disabled={editMode === "view"} />
            </label>

            <label>
              display_name *
              <input className="input" value={editDisplayName} onChange={(e) => setEditDisplayName(e.target.value)} disabled={editMode === "view"} />
            </label>

            <label>
              status *
              <select className="input" value={editStatus} onChange={(e) => setEditStatus(e.target.value)} disabled={editMode === "view"}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
                <option value="SUSPENDED">SUSPENDED</option>
              </select>
            </label>

            <label>
              phone_primary *
              <input className="input" value={editPhonePrimary} onChange={(e) => setEditPhonePrimary(e.target.value)} disabled={editMode === "view"} />
            </label>

            <label>
              email_official *
              <input className="input" type="email" value={editEmailOfficial} onChange={(e) => setEditEmailOfficial(e.target.value)} disabled={editMode === "view"} />
            </label>

            <label>
              phone_alternate
              <input className="input" value={editPhoneAlternate} onChange={(e) => setEditPhoneAlternate(e.target.value)} disabled={editMode === "view"} />
            </label>

            <label>
              email_support
              <input className="input" type="email" value={editEmailSupport} onChange={(e) => setEditEmailSupport(e.target.value)} disabled={editMode === "view"} />
            </label>

            <label>
              website_url
              <input className="input" type="url" value={editWebsiteUrl} onChange={(e) => setEditWebsiteUrl(e.target.value)} disabled={editMode === "view"} />
            </label>

            <label>
              onboarding_date
              <input className="input" type="date" value={editOnboardingDate} onChange={(e) => setEditOnboardingDate(e.target.value)} disabled={editMode === "view"} />
            </label>
          </div>

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <label>
              address_line1
              <input className="input" value={editAddressLine1} onChange={(e) => setEditAddressLine1(e.target.value)} disabled={editMode === "view"} />
            </label>

            <label>
              address_line2
              <input className="input" value={editAddressLine2} onChange={(e) => setEditAddressLine2(e.target.value)} disabled={editMode === "view"} />
            </label>

            <label>
              city
              <input className="input" value={editCity} onChange={(e) => setEditCity(e.target.value)} disabled={editMode === "view"} />
            </label>

            <label>
              district
              <input className="input" value={editDistrict} onChange={(e) => setEditDistrict(e.target.value)} disabled={editMode === "view"} />
            </label>

            <label>
              state
              <input className="input" value={editStateValue} onChange={(e) => setEditStateValue(e.target.value)} disabled={editMode === "view"} />
            </label>

            <label>
              country
              <input className="input" value={editCountry} onChange={(e) => setEditCountry(e.target.value)} disabled={editMode === "view"} />
            </label>

            <label>
              pincode
              <input className="input" value={editPincode} onChange={(e) => setEditPincode(e.target.value)} disabled={editMode === "view"} />
            </label>
          </div>

          {/* removed social_media_links, operational_areas, brand_colors from edit form */}
        </form>
      ) : null}

      <div className="card" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="input"
            placeholder="Search username/email/franchise"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 280 }}
          />

          <select className="input" value={status} onChange={(e) => handleStatusChange(e.target.value)} style={{ width: 180 }}>
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>

          <button className="button secondary" type="submit" style={{ width: "auto" }}>
            Search
          </button>

          <button className="button secondary" type="button" style={{ width: "auto" }} onClick={() => load({ limit, offset, q, status })}>
            Refresh
          </button>
        </form>
      </div>

      {error ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>
            {error}
          </p>
        </div>
      ) : null}

      <div className="card">
        <DataTable columns={columns} rows={rows} keyField="id" />
        <PaginationBar
          limit={limit}
          offset={offset}
          onChange={(next) => {
            setLimit(next.limit);
            setOffset(next.offset);
            void load({ ...next, q, status });
          }}
          total={total}
        />
      </div>

      <ConfirmDialog
        open={!!deactivateTarget}
        title="Deactivate Franchise"
        message={`Deactivate franchise "${deactivateTarget?.name || ""}"?`}
        confirmLabel="Deactivate"
        onCancel={() => setDeactivateTarget(null)}
        onConfirm={() => void executeDeactivate()}
      />

      <InputDialog
        open={!!resetPwTarget}
        title="Reset Franchise Password"
        message={`Enter new password for ${resetPwTarget?.authUser?.username || "franchise"}.`}
        inputLabel="New Password"
        inputPlaceholder="Min 8 characters"
        inputType="text"
        required
        confirmLabel="Reset Password"
        onCancel={() => setResetPwTarget(null)}
        onConfirm={(val) => void executeResetPassword(val)}
      />
    </section>
  );
}

export { BusinessPartnerFranchisesPage };
