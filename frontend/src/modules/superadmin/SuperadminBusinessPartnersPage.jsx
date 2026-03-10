import { useEffect, useState } from "react";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { InputDialog } from "../../components/InputDialog";
import {
  listBusinessPartners,
  resetBusinessPartnerPassword,
  setBusinessPartnerStatus
} from "../../services/businessPartnersService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { useAuth } from "../../hooks/useAuth";
import { ROLES } from "../../types/auth";
import { useNavigate } from "react-router-dom";

function SuperadminBusinessPartnersPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  const [statusChange, setStatusChange] = useState(null);
  const [resetPwId, setResetPwId] = useState(null);

  const formatDateTime = (value) => {
    if (!value) {
      return "-";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    return date.toLocaleString();
  };

  const load = async (next = { limit, offset, q, status }) => {
    setLoading(true);
    setError("");
    try {
      const data = await listBusinessPartners(next);
      setRows(data.data.items || []);
      setLimit(data.data.limit);
      setOffset(data.data.offset);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load business partners.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load({ limit, offset, q, status });
  }, []);

  if (loading && !rows.length) {
    return <LoadingState label="Loading business partners..." />;
  }

  const handleRefresh = () => {
    void load({ limit, offset, q, status });
  };

  const handleSearch = (event) => {
    event.preventDefault();
    setOffset(0);
    void load({ limit, offset: 0, q, status });
  };

  const handleStatusChange = (nextStatus) => {
    setStatus(nextStatus);
    setOffset(0);
    void load({ limit, offset: 0, q, status: nextStatus });
  };

  const handleSetStatus = async ({ partnerId, nextStatus }) => {
    try {
      await setBusinessPartnerStatus({ id: partnerId, status: nextStatus });
      setStatusChange(null);
      await load({ limit, offset, q, status });
    } catch (err) {
      setStatusChange(null);
      setError(getFriendlyErrorMessage(err) || "Failed to update business partner status.");
    }
  };

  const handleResetPassword = async (partnerId, nextPassword) => {
    try {
      await resetBusinessPartnerPassword({ id: partnerId, password: nextPassword });
      setResetPwId(null);
      setError("");
    } catch (err) {
      setResetPwId(null);
      setError(getFriendlyErrorMessage(err) || "Failed to reset password.");
    }
  };

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Business Partners</h2>
        {role === ROLES.SUPERADMIN && (
          <button
            className="button"
            type="button"
            onClick={() => navigate("/superadmin/business-partners/new")}
            style={{ width: "auto" }}
          >
            Create Business Partner
          </button>
        )}
      </div>

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
            <option value="SUSPENDED">SUSPENDED</option>
          </select>

          <button className="button secondary" type="submit" style={{ width: "auto" }}>
            Search
          </button>
        </form>

        <div style={{ flex: 1 }} />
        <button className="button secondary" type="button" onClick={handleRefresh} style={{ width: "auto" }}>
          Refresh
        </button>
      </div>

      {error ? <div className="card"><p className="error">{error}</p></div> : null}

      <DataTable
        columns={[
          { key: "code", header: "Code" },
          { key: "name", header: "Name" },
          { key: "displayName", header: "Display Name" },
          { key: "status", header: "Status", render: (r) => <StatusBadge value={r.status} /> },
          { key: "accessMode", header: "Access" },
          { key: "contactEmail", header: "Contact Email" },
          { key: "supportEmail", header: "Support Email" },
          { key: "primaryPhone", header: "Primary Phone" },
          {
            key: "whatsappEnabled",
            header: "WhatsApp",
            render: (r) => (r.whatsappEnabled ? "Enabled" : "Disabled")
          },
          { key: "subscriptionStatus", header: "Subscription" },
          {
            key: "subscriptionExpiresAt",
            header: "Expires At",
            render: (r) => formatDateTime(r.subscriptionExpiresAt)
          },
          {
            key: "gracePeriodUntil",
            header: "Grace Until",
            render: (r) => formatDateTime(r.gracePeriodUntil)
          },
          {
            key: "createdAt",
            header: "Created At",
            render: (r) => formatDateTime(r.createdAt)
          },
          {
            key: "actions",
            header: "Actions",
            render: (r) => (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="button secondary"
                  type="button"
                  style={{ width: "auto" }}
                  onClick={() => navigate(`/superadmin/business-partners/${r.id}?mode=view`)}
                >
                  View
                </button>
                <button
                  className="button secondary"
                  type="button"
                  style={{ width: "auto" }}
                  onClick={() => navigate(`/superadmin/business-partners/${r.id}?mode=edit`)}
                >
                  Edit
                </button>
                <button
                  className="button secondary"
                  type="button"
                  style={{ width: "auto" }}
                  onClick={() => void setResetPwId(r.id)}
                >
                  Reset Password
                </button>
                <button
                  className="button secondary"
                  type="button"
                  style={{ width: "auto" }}
                  onClick={() => {
                    const current = String(r.status || "").toUpperCase();
                    const nextStatus = current === "INACTIVE" ? "ACTIVE" : "INACTIVE";
                    setStatusChange({ id: r.id, nextStatus });
                  }}
                >
                  {String(r.status).toUpperCase() === "INACTIVE" ? "Activate" : "Deactivate"}
                </button>
              </div>
            )
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
          void load({ ...next, q, status });
        }}
      />

      <ConfirmDialog
        open={!!statusChange}
        title={statusChange?.nextStatus === "ACTIVE" ? "Activate Business Partner" : "Deactivate Business Partner"}
        message={
          statusChange?.nextStatus === "ACTIVE"
            ? "Are you sure you want to activate this business partner?"
            : "Are you sure you want to deactivate this business partner?"
        }
        confirmLabel={statusChange?.nextStatus === "ACTIVE" ? "Activate" : "Deactivate"}
        onCancel={() => setStatusChange(null)}
        onConfirm={() => void handleSetStatus({ partnerId: statusChange?.id, nextStatus: statusChange?.nextStatus })}
      />

      <InputDialog
        open={!!resetPwId}
        title="Reset Password"
        message="Enter a new password for this business partner's admin account."
        inputLabel="New Password"
        inputPlaceholder="Min 8 characters"
        inputType="text"
        required
        confirmLabel="Reset Password"
        onCancel={() => setResetPwId(null)}
        onConfirm={(val) => void handleResetPassword(resetPwId, val)}
      />
    </section>
  );
}

export { SuperadminBusinessPartnersPage };
