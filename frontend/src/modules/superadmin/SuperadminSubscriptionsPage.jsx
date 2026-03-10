import { useEffect, useState } from "react";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { listBusinessPartners, renewBusinessPartner } from "../../services/businessPartnersService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

function SuperadminSubscriptionsPage() {
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [renewId, setRenewId] = useState(null);
  const [extendDays, setExtendDays] = useState(30);

  const load = async (next = { limit, offset }) => {
    setLoading(true);
    setError("");
    try {
      const data = await listBusinessPartners(next);
      setRows(data.data.items || []);
      setLimit(data.data.limit);
      setOffset(data.data.offset);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load subscriptions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load({ limit, offset });
  }, []);

  const doRenew = async () => {
    if (!renewId) {
      return;
    }

    try {
      await renewBusinessPartner({ id: renewId, extendDays });
      setRenewId(null);
      void load({ limit, offset });
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Renewal failed.");
      setRenewId(null);
    }
  };

  if (loading && !rows.length) {
    return <LoadingState label="Loading subscriptions..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Subscription Monitor</h2>

      <div className="card" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Renew extension days</div>
        <input
          className="input"
          style={{ width: 140 }}
          value={extendDays}
          onChange={(e) => setExtendDays(Number(e.target.value) || 30)}
        />
      </div>

      {error ? <div className="card"><p className="error">{error}</p></div> : null}

      <DataTable
        columns={[
          { key: "code", header: "Code" },
          { key: "name", header: "Name" },
          { key: "subscriptionStatus", header: "Status", render: (r) => <StatusBadge value={r.subscriptionStatus} /> },
          { key: "subscriptionExpiresAt", header: "Expires" },
          {
            key: "actions",
            header: "Actions",
            render: (r) => (
              <button className="button" style={{ width: "auto" }} onClick={() => setRenewId(r.id)}>
                Renew
              </button>
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
          void load(next);
        }}
      />

      <ConfirmDialog
        open={Boolean(renewId)}
        title="Renew subscription"
        message={`Extend subscription by ${extendDays} days?`}
        confirmLabel="Renew"
        onCancel={() => setRenewId(null)}
        onConfirm={doRenew}
      />
    </section>
  );
}

export { SuperadminSubscriptionsPage };
