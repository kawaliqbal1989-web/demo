import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { InputDialog } from "../../components/InputDialog";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import {
  createFranchiseCenter,
  listFranchiseCenters,
  resetFranchiseCenterPassword,
  updateFranchiseCenter
} from "../../services/franchiseService";

function FranchiseCentersPage() {
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  const [resetPwTarget, setResetPwTarget] = useState(null);

  const [createOpen, setCreateOpen] = useState(true);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");

  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [centerStatus, setCenterStatus] = useState("ACTIVE");
  const [phonePrimary, setPhonePrimary] = useState("");
  const [emailOfficial, setEmailOfficial] = useState("");
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [headPrincipalName, setHeadPrincipalName] = useState("");
  const [affiliationCode, setAffiliationCode] = useState("");
  const [password, setPassword] = useState("");

  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [stateValue, setStateValue] = useState("");
  const [country, setCountry] = useState("India");
  const [pincode, setPincode] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editMode, setEditMode] = useState("edit");
  const [editTarget, setEditTarget] = useState(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [editSuccess, setEditSuccess] = useState("");

  const [editName, setEditName] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editStatus, setEditStatus] = useState("ACTIVE");
  const [editPhonePrimary, setEditPhonePrimary] = useState("");
  const [editEmailOfficial, setEditEmailOfficial] = useState("");
  const [editWhatsappEnabled, setEditWhatsappEnabled] = useState(false);
  const [editHeadPrincipalName, setEditHeadPrincipalName] = useState("");
  const [editAffiliationCode, setEditAffiliationCode] = useState("");

  const [editAddressLine1, setEditAddressLine1] = useState("");
  const [editAddressLine2, setEditAddressLine2] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editDistrict, setEditDistrict] = useState("");
  const [editStateValue, setEditStateValue] = useState("");
  const [editCountry, setEditCountry] = useState("India");
  const [editPincode, setEditPincode] = useState("");

  const load = async (next = { limit, offset, q, status }) => {
    setLoading(true);
    setError("");
    try {
      const data = await listFranchiseCenters(next);
      setRows(data.data.items || []);
      setLimit(data.data.limit);
      setOffset(data.data.offset);
      setTotal(data.data.total || 0);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load centers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load({ limit, offset, q, status });
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    setOffset(0);
    void load({ limit, offset: 0, q, status });
  };

  const openEditForm = (row, mode = "edit") => {
    setEditError("");
    setEditSuccess("");
    setEditTarget(row);
    setEditMode(mode === "view" ? "view" : "edit");
    setEditOpen(true);

    setEditName(row?.name || "");
    setEditDisplayName(row?.displayName || "");
    setEditStatus(row?.status || (row?.isActive ? "ACTIVE" : "INACTIVE"));
    setEditPhonePrimary(row?.phonePrimary || "");
    setEditEmailOfficial(row?.emailOfficial || row?.authUser?.email || "");
    setEditWhatsappEnabled(Boolean(row?.whatsappEnabled));
    setEditHeadPrincipalName(row?.headPrincipalName || "");
    setEditAffiliationCode(row?.affiliationCode || "");

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

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setCreateError("");
    setCreateSuccess("");

    const missing = [];
    if (!name.trim()) missing.push("name");
    if (!displayName.trim()) missing.push("displayName");
    if (!emailOfficial.trim()) missing.push("emailOfficial");
    if (!phonePrimary.trim()) missing.push("phonePrimary");
    if (!password.trim()) missing.push("password");

    if (missing.length) {
      setCreateError(`Missing required fields: ${missing.join(", ")}`);
      return;
    }

    setCreateLoading(true);
    try {
      await createFranchiseCenter({
        name,
        displayName,
        status: centerStatus,
        phonePrimary,
        emailOfficial,
        whatsappEnabled,
        headPrincipalName,
        affiliationCode,
        password,
        addressLine1: addressLine1 || undefined,
        addressLine2: addressLine2 || undefined,
        city: city || undefined,
        district: district || undefined,
        state: stateValue || undefined,
        country: country || undefined,
        pincode: pincode || undefined
      });

      setCreateSuccess("Center created");
      setName("");
      setDisplayName("");
      setCenterStatus("ACTIVE");
      setPhonePrimary("");
      setEmailOfficial("");
      setWhatsappEnabled(false);
      setHeadPrincipalName("");
      setAffiliationCode("");
      setPassword("");

      setAddressLine1("");
      setAddressLine2("");
      setCity("");
      setDistrict("");
      setStateValue("");
      setCountry("India");
      setPincode("");

      await load({ limit, offset, q, status });
    } catch (err) {
      setCreateError(getFriendlyErrorMessage(err) || "Failed to create center.");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();

    if (editMode === "view") {
      closeEditForm();
      return;
    }

    setEditError("");
    setEditSuccess("");

    const id = editTarget?.id;
    if (!id) {
      setEditError("Missing center id.");
      return;
    }

    setEditLoading(true);
    try {
      await updateFranchiseCenter({
        id,
        name: editName,
        displayName: editDisplayName,
        status: editStatus,
        phonePrimary: editPhonePrimary,
        emailOfficial: editEmailOfficial,
        whatsappEnabled: editWhatsappEnabled,
        headPrincipalName: editHeadPrincipalName,
        affiliationCode: editAffiliationCode,
        addressLine1: editAddressLine1 || undefined,
        addressLine2: editAddressLine2 || undefined,
        city: editCity || undefined,
        district: editDistrict || undefined,
        state: editStateValue || undefined,
        country: editCountry || undefined,
        pincode: editPincode || undefined
      });

      setEditSuccess("Center updated");
      await load({ limit, offset, q, status });
    } catch (err) {
      setEditError(getFriendlyErrorMessage(err) || "Failed to update center.");
    } finally {
      setEditLoading(false);
    }
  };

  const [statusChangeTarget, setStatusChangeTarget] = useState(null);

  const handleStatusToggle = async () => {
    const row = statusChangeTarget;
    setStatusChangeTarget(null);
    if (!row) return;

    try {
      const isInactive = String(row?.status || "").toUpperCase() !== "ACTIVE" || row?.isActive === false;
      await updateFranchiseCenter({
        id: row.id,
        status: isInactive ? "ACTIVE" : "INACTIVE"
      });
      await load({ limit, offset, q, status });
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to update center status.");
    }
  };

  const handleResetPassword = (row) => {
    const targetUserId = row?.authUser?.id;
    if (!targetUserId) {
      setError("Missing center auth user id.");
      return;
    }
    setResetPwTarget(row);
  };

  const executeResetPassword = async (nextPassword) => {
    const row = resetPwTarget;
    setResetPwTarget(null);
    try {
      await resetFranchiseCenterPassword({ id: row.id, newPassword: nextPassword, mustChangePassword: true });
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to reset password.");
    }
  };

  if (loading && !rows.length) {
    return <LoadingState label="Loading centers..." />;
  }

  const columns = [
    { key: "code", header: "Code" },
    { key: "username", header: "Username", render: (r) => r?.authUser?.username || "" },
    { key: "name", header: "Name" },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusBadge status={r?.status || (r?.isActive ? "ACTIVE" : "INACTIVE")} />
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) => (
        <div style={{ display: "flex", gap: 8 }}>
          <button className="button secondary" style={{ width: "auto" }} onClick={() => openEditForm(r, "view")}>
            View
          </button>
          <button className="button secondary" style={{ width: "auto" }} onClick={() => openEditForm(r, "edit")}>
            Edit
          </button>
          <button className="button secondary" style={{ width: "auto" }} onClick={() => setStatusChangeTarget(r)}>
            {String(r?.status || "").toUpperCase() === "ACTIVE" && r?.isActive !== false ? "Deactivate" : "Activate"}
          </button>
          <button className="button secondary" style={{ width: "auto" }} onClick={() => handleResetPassword(r)}>
            Reset Password
          </button>
        </div>
      )
    }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>Centers</h2>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Create and manage your centers</div>
          </div>
          <button className="button secondary" style={{ width: "auto" }} onClick={() => setCreateOpen((v) => !v)}>
            {createOpen ? "Hide Create" : "Show Create"}
          </button>
        </div>
      </div>

      {createOpen ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Center / School Profile</h3>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 8 }}>Review center profiles under your franchise.</div>
          {createError ? <div style={{ color: "var(--color-text-danger)", marginBottom: 8 }}>{createError}</div> : null}
          {createSuccess ? <div style={{ color: "var(--color-text-success)", marginBottom: 8 }}>{createSuccess}</div> : null}

          <form onSubmit={handleCreateSubmit} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "1 / span 2", fontSize: 12, fontWeight: 700 }}>1) Center Identity</div>
            <label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Center Code (auto-generated)</div>
              <input className="input" value="(auto)" disabled />
            </label>
            <label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Name *</div>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Display Name *</div>
              <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </label>
            <label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Status *</div>
              <select className="input" value={centerStatus} onChange={(e) => setCenterStatus(e.target.value)}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
                <option value="SUSPENDED">SUSPENDED</option>
              </select>
            </label>

            <div style={{ gridColumn: "1 / span 2", fontSize: 12, fontWeight: 700, marginTop: 6 }}>2) Contact</div>
            <label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Phone *</div>
              <input className="input" value={phonePrimary} onChange={(e) => setPhonePrimary(e.target.value)} />
            </label>
            <label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Email *</div>
              <input className="input" value={emailOfficial} onChange={(e) => setEmailOfficial(e.target.value)} />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18 }}>
              <input
                type="checkbox"
                checked={whatsappEnabled}
                onChange={(e) => setWhatsappEnabled(e.target.checked)}
              />
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>WhatsApp Enabled</span>
            </label>
            <label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Temp Password *</div>
              <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>

            <div style={{ gridColumn: "1 / span 2", fontSize: 12, fontWeight: 700, marginTop: 6 }}>3) Address</div>

            <label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Address Line 1</div>
              <input className="input" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
            </label>
            <label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Address Line 2</div>
              <input className="input" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />
            </label>
            <label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>City</div>
              <input className="input" value={city} onChange={(e) => setCity(e.target.value)} />
            </label>
            <label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>District</div>
              <input className="input" value={district} onChange={(e) => setDistrict(e.target.value)} />
            </label>
            <label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>State</div>
              <input className="input" value={stateValue} onChange={(e) => setStateValue(e.target.value)} />
            </label>
            <label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Country</div>
              <input className="input" value={country} onChange={(e) => setCountry(e.target.value)} />
            </label>
            <label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Pincode</div>
              <input className="input" value={pincode} onChange={(e) => setPincode(e.target.value)} />
            </label>

            <div style={{ gridColumn: "1 / span 2", fontSize: 12, fontWeight: 700, marginTop: 6 }}>4) Administration</div>
            <label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Head / Principal Name</div>
              <input
                className="input"
                value={headPrincipalName}
                onChange={(e) => setHeadPrincipalName(e.target.value)}
              />
            </label>
            <label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Affiliation Code</div>
              <input
                className="input"
                value={affiliationCode}
                onChange={(e) => setAffiliationCode(e.target.value)}
              />
            </label>

            <div style={{ gridColumn: "1 / span 2", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                className="button secondary"
                type="button"
                style={{ width: "auto" }}
                onClick={() => {
                  setName("");
                  setDisplayName("");
                  setCenterStatus("ACTIVE");
                  setPhonePrimary("");
                  setEmailOfficial("");
                  setWhatsappEnabled(false);
                  setHeadPrincipalName("");
                  setAffiliationCode("");
                  setPassword("");
                  setAddressLine1("");
                  setAddressLine2("");
                  setCity("");
                  setDistrict("");
                  setStateValue("");
                  setCountry("India");
                  setPincode("");
                }}
              >
                Reset
              </button>
              <button className="button" style={{ width: "auto" }} disabled={createLoading}>
                {createLoading ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {editOpen ? (
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <h3 style={{ marginTop: 0, marginBottom: 0 }}>{editMode === "view" ? "View Center" : "Edit Center"}</h3>
            <button className="button secondary" style={{ width: "auto" }} onClick={closeEditForm}>
              Close
            </button>
          </div>
          {editError ? <div style={{ color: "var(--color-text-danger)", marginBottom: 8 }}>{editError}</div> : null}
          {editSuccess ? <div style={{ color: "var(--color-text-success)", marginBottom: 8 }}>{editSuccess}</div> : null}

          <form onSubmit={handleEditSubmit} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Name</div>
              <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} disabled={editMode === "view"} />
            </label>
            <label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Display Name</div>
              <input
                className="input"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                disabled={editMode === "view"}
              />
            </label>
            <label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Status</div>
              <select className="input" value={editStatus} onChange={(e) => setEditStatus(e.target.value)} disabled={editMode === "view"}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
                <option value="SUSPENDED">SUSPENDED</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            </label>
            <label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Phone</div>
              <input
                className="input"
                value={editPhonePrimary}
                onChange={(e) => setEditPhonePrimary(e.target.value)}
                disabled={editMode === "view"}
              />
            </label>
            <label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Email</div>
              <input
                className="input"
                value={editEmailOfficial}
                onChange={(e) => setEditEmailOfficial(e.target.value)}
                disabled={editMode === "view"}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18 }}>
              <input
                type="checkbox"
                checked={editWhatsappEnabled}
                onChange={(e) => setEditWhatsappEnabled(e.target.checked)}
                disabled={editMode === "view"}
              />
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>WhatsApp Enabled</span>
            </label>

            <div style={{ gridColumn: "1 / span 2", marginTop: 8, fontSize: 12, fontWeight: 700 }}>Administration</div>
            <label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Head / Principal Name</div>
              <input
                className="input"
                value={editHeadPrincipalName}
                onChange={(e) => setEditHeadPrincipalName(e.target.value)}
                disabled={editMode === "view"}
              />
            </label>
            <label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Affiliation Code</div>
              <input
                className="input"
                value={editAffiliationCode}
                onChange={(e) => setEditAffiliationCode(e.target.value)}
                disabled={editMode === "view"}
              />
            </label>

            <div style={{ gridColumn: "1 / span 2", marginTop: 8, fontSize: 12, color: "var(--color-text-muted)" }}>Address</div>

            <label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Address Line 1</div>
              <input
                className="input"
                value={editAddressLine1}
                onChange={(e) => setEditAddressLine1(e.target.value)}
                disabled={editMode === "view"}
              />
            </label>
            <label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Address Line 2</div>
              <input
                className="input"
                value={editAddressLine2}
                onChange={(e) => setEditAddressLine2(e.target.value)}
                disabled={editMode === "view"}
              />
            </label>
            <label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>City</div>
              <input className="input" value={editCity} onChange={(e) => setEditCity(e.target.value)} disabled={editMode === "view"} />
            </label>
            <label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>District</div>
              <input
                className="input"
                value={editDistrict}
                onChange={(e) => setEditDistrict(e.target.value)}
                disabled={editMode === "view"}
              />
            </label>
            <label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>State</div>
              <input
                className="input"
                value={editStateValue}
                onChange={(e) => setEditStateValue(e.target.value)}
                disabled={editMode === "view"}
              />
            </label>
            <label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Country</div>
              <input
                className="input"
                value={editCountry}
                onChange={(e) => setEditCountry(e.target.value)}
                disabled={editMode === "view"}
              />
            </label>
            <label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Pincode</div>
              <input
                className="input"
                value={editPincode}
                onChange={(e) => setEditPincode(e.target.value)}
                disabled={editMode === "view"}
              />
            </label>

            {editMode === "edit" ? (
              <div style={{ gridColumn: "1 / span 2", display: "flex", justifyContent: "flex-end" }}>
                <button className="button" style={{ width: "auto" }} disabled={editLoading}>
                  {editLoading ? "Saving..." : "Save"}
                </button>
              </div>
            ) : null}
          </form>
        </div>
      ) : null}

      <div className="card">
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            className="input"
            placeholder="Search code or name"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 200 }}>
            <option value="">All Status</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
            <option value="SUSPENDED">SUSPENDED</option>
            <option value="ARCHIVED">ARCHIVED</option>
          </select>
          <button className="button" style={{ width: "auto" }}>
            Search
          </button>
          <button
            className="button secondary"
            type="button"
            style={{ width: "auto" }}
            onClick={() => load({ limit, offset, q, status })}
          >
            Refresh
          </button>
        </form>
        {error ? <div style={{ color: "var(--color-text-danger)", marginTop: 8 }}>{error}</div> : null}
      </div>

      <DataTable columns={columns} rows={rows} keyField="id" />
      <PaginationBar
        limit={limit}
        offset={offset}
        count={rows.length}
        total={total}
        onChange={(next) => {
          setLimit(next.limit);
          setOffset(next.offset);
          void load({ limit: next.limit, offset: next.offset, q, status });
        }}
      />

      <ConfirmDialog
        open={!!statusChangeTarget}
        title={String(statusChangeTarget?.status || "").toUpperCase() === "ACTIVE" && statusChangeTarget?.isActive !== false ? "Deactivate Center" : "Activate Center"}
        message={String(statusChangeTarget?.status || "").toUpperCase() === "ACTIVE" && statusChangeTarget?.isActive !== false
          ? `Deactivate center ${statusChangeTarget?.code || ""}? Franchise access for this center will be put on hold.`
          : `Activate center ${statusChangeTarget?.code || ""}? Franchise access for this center will be restored.`}
        confirmLabel={String(statusChangeTarget?.status || "").toUpperCase() === "ACTIVE" && statusChangeTarget?.isActive !== false ? "Deactivate" : "Activate"}
        onConfirm={handleStatusToggle}
        onCancel={() => setStatusChangeTarget(null)}
      />

      <InputDialog
        open={!!resetPwTarget}
        title="Reset Center Password"
        message={`Enter new password for ${resetPwTarget?.authUser?.username || resetPwTarget?.code || "center"}.`}
        inputLabel="New Password"
        inputPlaceholder="Min 8 characters"
        inputType="text"
        required
        confirmLabel="Reset Password"
        onCancel={() => setResetPwTarget(null)}
        onConfirm={(val) => void executeResetPassword(val)}
      />
    </div>
  );
}

export { FranchiseCentersPage };
