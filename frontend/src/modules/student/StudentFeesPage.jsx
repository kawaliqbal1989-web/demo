import { useEffect, useState } from "react";
import { getStudentFees } from "../../services/studentPortalService";

function StudentFeesPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    getStudentFees()
      .then((res) => {
        if (cancelled) return;
        setData(res.data?.data || null);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Failed to load fee details.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const payments = Array.isArray(data?.payments) ? data.payments : Array.isArray(data) ? data : [];
  const summary = data?.summary || null;

  return (
    <div>
      <div className="card">
        <h2 style={{ margin: 0 }}>💰 My Fees</h2>
        <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)" }}>Fee history and payment status</p>
      </div>

      {loading && <div className="card" style={{ marginTop: 12 }}><p style={{ color: "var(--color-text-muted)" }}>Loading…</p></div>}
      {error && <div className="card" style={{ marginTop: 12 }}><p style={{ color: "#dc2626" }}>{error}</p></div>}

      {!loading && !error && summary && (
        <div className="card" style={{ marginTop: 12, display: "flex", gap: 24, flexWrap: "wrap" }}>
          {summary.totalPaid != null && (
            <div style={{ textAlign: "center", minWidth: 100 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#16a34a" }}>₹{Number(summary.totalPaid).toLocaleString()}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Total Paid</div>
            </div>
          )}
          {summary.totalDue != null && (
            <div style={{ textAlign: "center", minWidth: 100 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: summary.totalDue > 0 ? "#dc2626" : "#16a34a" }}>₹{Number(summary.totalDue).toLocaleString()}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Balance Due</div>
            </div>
          )}
          {summary.nextDueDate && (
            <div style={{ textAlign: "center", minWidth: 120 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#3b82f6" }}>{new Date(summary.nextDueDate).toLocaleDateString()}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Next Due Date</div>
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: 12 }}>
        {!loading && !error && payments.length === 0 && (
          <p style={{ color: "var(--color-text-muted)" }}>No fee records found.</p>
        )}
        {!loading && !error && payments.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Date</th>
                  <th>Description</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th>Status</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, i) => {
                  const isPaid = (p.status || "").toUpperCase() === "PAID";
                  return (
                    <tr key={p.id || i}>
                      <td>{i + 1}</td>
                      <td>{p.date ? new Date(p.date).toLocaleDateString() : p.paidAt ? new Date(p.paidAt).toLocaleDateString() : "—"}</td>
                      <td>{p.description || p.label || p.feeType || "Tuition Fee"}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>₹{Number(p.amount || 0).toLocaleString()}</td>
                      <td>
                        <span
                          style={{
                            background: isPaid ? "var(--color-bg-success-light)" : "var(--color-bg-warning)",
                            color: isPaid ? "var(--color-text-success)" : "var(--color-text-warning)",
                            padding: "2px 8px",
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 600
                          }}
                        >
                          {p.status || "—"}
                        </span>
                      </td>
                      <td style={{ color: "var(--color-text-muted)", fontSize: 13 }}>{p.receiptNo || p.receiptNumber || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export { StudentFeesPage };
