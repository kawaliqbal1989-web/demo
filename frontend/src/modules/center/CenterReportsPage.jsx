import { useEffect, useState } from "react";
import { LoadingState } from "../../components/LoadingState";
import { DataTable, PaginationBar } from "../../components/DataTable";
import {
  getFeesMonthlyDues,
  getFeesPendingInstallments,
  getFeesReminders,
  getFeesStudentWise,
  getMonthlyRevenue,
  getRevenueByType,
  getRevenueSummary
} from "../../services/reportsService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { Link } from "react-router-dom";

function toDateInputValue(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  try {
    return value.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function getDefaultFromTo() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  return { from: toDateInputValue(from), to: toDateInputValue(to) };
}

function formatMoney(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function CenterReportsPage() {
  const defaults = getDefaultFromTo();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const [monthly, setMonthly] = useState([]);
  const [monthlyDues, setMonthlyDues] = useState([]);

  const [studentWise, setStudentWise] = useState([]);
  const [studentTotal, setStudentTotal] = useState(0);
  const [studentLimit, setStudentLimit] = useState(20);
  const [studentOffset, setStudentOffset] = useState(0);

  const [pendingInst, setPendingInst] = useState([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [pendingLimit, setPendingLimit] = useState(20);
  const [pendingOffset, setPendingOffset] = useState(0);

  const [reminders, setReminders] = useState([]);
  const [remindersTotal, setRemindersTotal] = useState(0);
  const [remindersLimit, setRemindersLimit] = useState(20);
  const [remindersOffset, setRemindersOffset] = useState(0);

  const [revenueByType, setRevenueByType] = useState([]);

  const buildParams = (extra = {}) => ({
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...extra
  });

  const load = async (opts = {}) => {
    const nextStudentOffset = typeof opts.studentOffset === "number" ? opts.studentOffset : studentOffset;
    const nextPendingOffset = typeof opts.pendingOffset === "number" ? opts.pendingOffset : pendingOffset;
    const nextRemindersOffset = typeof opts.remindersOffset === "number" ? opts.remindersOffset : remindersOffset;

    setLoading(true);
    setError("");
    try {
      const [s, m, md, sw, pi, r, rbt] = await Promise.all([
        getRevenueSummary(buildParams()),
        getMonthlyRevenue(buildParams()),
        getFeesMonthlyDues(buildParams()),
        getFeesStudentWise(buildParams({ limit: studentLimit, offset: nextStudentOffset })),
        getFeesPendingInstallments(buildParams({ limit: pendingLimit, offset: nextPendingOffset })),
        getFeesReminders(buildParams({ limit: remindersLimit, offset: nextRemindersOffset })),
        getRevenueByType(buildParams()).catch(() => ({ data: { items: [] } }))
      ]);

      setSummary(s.data);
      setMonthly(m.data?.items || []);
      setMonthlyDues(md.data?.items || []);
      setRevenueByType(rbt.data?.items || []);

      setStudentWise(sw.data?.items || []);
      setStudentTotal(Number(sw.data?.total || 0));
      setStudentOffset(Number(sw.data?.offset || 0));

      setPendingInst(pi.data?.items || []);
      setPendingTotal(Number(pi.data?.total || 0));
      setPendingOffset(Number(pi.data?.offset || 0));

      setReminders(r.data?.items || []);
      setRemindersTotal(Number(r.data?.total || 0));
      setRemindersOffset(Number(r.data?.offset || 0));
    } catch (e) {
      setError(getFriendlyErrorMessage(e) || "Failed to load reports.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load({ studentOffset: 0, pendingOffset: 0, remindersOffset: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return <LoadingState label="Loading reports..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0 }}>Reports</h2>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Collections + dues summary for your center</div>
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>From (YYYY-MM-DD)</div>
            <input className="input" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="2026-02-01" />
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>To (YYYY-MM-DD)</div>
            <input className="input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="2026-02-24" />
          </div>
        </div>

        <button
          className="button"
          style={{ width: "auto" }}
          onClick={() => load({ studentOffset: 0, pendingOffset: 0, remindersOffset: 0 })}
          disabled={loading}
        >
          {loading ? "Loading..." : "Apply"}
        </button>
      </div>

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Total Gross Amount</div>
        <div style={{ fontSize: 28, fontWeight: 800 }}>{formatMoney(summary?.totalGrossAmount)}</div>
      </div>

      {revenueByType.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          <h3 style={{ margin: 0 }}>Revenue by Type</h3>
          <DataTable
            keyField={(row) => row.type || row.feeType || row.label}
            columns={[
              { key: "type", header: "Fee Type", render: (r) => r.type || r.feeType || r.label || "—" },
              { key: "grossAmount", header: "Gross", render: (r) => formatMoney(r.grossAmount) },
              { key: "paidAmount", header: "Collected", render: (r) => formatMoney(r.paidAmount || r.collected) },
              { key: "pendingAmount", header: "Pending", render: (r) => formatMoney(r.pendingAmount || r.pending) }
            ]}
            rows={revenueByType}
          />
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Month-wise</h3>
        <DataTable
          keyField={(row) => `${row.year}-${row.month}`}
          columns={[
            { key: "month", header: "Month" },
            { key: "collections", header: "Collections", render: (r) => formatMoney(r.collections) },
            { key: "dues", header: "Dues (Pending)", render: (r) => formatMoney(r.dues) },
            { key: "overdue", header: "Overdue", render: (r) => formatMoney(r.overdue) }
          ]}
          rows={(() => {
            const byKey = new Map();

            for (const row of monthly) {
              const key = `${row.year}-${row.month}`;
              const entry = byKey.get(key) || {
                year: row.year,
                month: row.month,
                collections: 0,
                dues: 0,
                overdue: 0
              };
              entry.collections = Number(row.grossAmount || 0);
              byKey.set(key, entry);
            }

            for (const row of monthlyDues) {
              const key = `${row.year}-${row.month}`;
              const entry = byKey.get(key) || {
                year: row.year,
                month: row.month,
                collections: 0,
                dues: 0,
                overdue: 0
              };
              entry.dues = Number(row.pendingAmount || 0);
              entry.overdue = Number(row.overduePendingAmount || 0);
              byKey.set(key, entry);
            }

            return Array.from(byKey.values())
              .sort((a, b) => (a.year - b.year) || (a.month - b.month))
              .map((r) => ({
                ...r,
                month: `${r.year}-${String(r.month).padStart(2, "0")}`
              }));
          })()}
        />
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Student-wise</h3>
        <DataTable
          keyField={(row) => row.studentId}
          columns={[
            {
              key: "student",
              header: "Student",
              wrap: true,
              render: (row) => (
                <div style={{ display: "grid", gap: 2 }}>
                  <div style={{ fontWeight: 700 }}>{row.studentName || "(no name)"}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{row.admissionNo || ""}</div>
                  <div>
                    <Link to={`/center/students/${row.studentId}/fees`} style={{ fontSize: 12 }}>
                      View fees
                    </Link>
                  </div>
                </div>
              )
            },
            { key: "paidInRange", header: "Collections", render: (r) => formatMoney(r.paidInRange) },
            { key: "duePending", header: "Dues", render: (r) => formatMoney(r.duePending) },
            { key: "overduePending", header: "Overdue", render: (r) => formatMoney(r.overduePending) },
            { key: "overdueCount", header: "Overdue#" }
          ]}
          rows={studentWise}
        />
        <PaginationBar
          limit={studentLimit}
          offset={studentOffset}
          count={studentWise.length}
          total={studentTotal}
          onChange={({ limit, offset }) => {
            setStudentLimit(limit);
            void load({ studentOffset: offset });
          }}
        />
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Pending / Overdue (Installments)</h3>
        <DataTable
          keyField={(row) => row.id}
          columns={[
            {
              key: "dueDate",
              header: "Due Date",
              render: (row) => (row.dueDate ? String(row.dueDate).slice(0, 10) : "")
            },
            {
              key: "student",
              header: "Student",
              wrap: true,
              render: (row) => (
                <div style={{ display: "grid", gap: 2 }}>
                  <div style={{ fontWeight: 700 }}>{row.studentName || "(no name)"}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{row.admissionNo || ""}</div>
                </div>
              )
            },
            { key: "amount", header: "Amount", render: (r) => formatMoney(r.amount) },
            { key: "paidAmount", header: "Paid", render: (r) => formatMoney(r.paidAmount) },
            { key: "pending", header: "Pending", render: (r) => formatMoney(r.pending) },
            { key: "status", header: "Status" }
          ]}
          rows={pendingInst}
        />
        <PaginationBar
          limit={pendingLimit}
          offset={pendingOffset}
          count={pendingInst.length}
          total={pendingTotal}
          onChange={({ limit, offset }) => {
            setPendingLimit(limit);
            void load({ pendingOffset: offset });
          }}
        />
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Reminders (Report)</h3>
        <DataTable
          keyField={(row) => row.studentId}
          columns={[
            {
              key: "student",
              header: "Student",
              wrap: true,
              render: (row) => (
                <div style={{ display: "grid", gap: 2 }}>
                  <div style={{ fontWeight: 700 }}>{row.studentName || "(no name)"}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{row.admissionNo || ""}</div>
                </div>
              )
            },
            { key: "pendingAmount", header: "Pending", render: (r) => formatMoney(r.pendingAmount) },
            { key: "overdueAmount", header: "Overdue", render: (r) => formatMoney(r.overdueAmount) },
            { key: "overdueCount", header: "Overdue#" },
            {
              key: "nextDueDate",
              header: "Next Due",
              render: (row) => (row.nextDueDate ? String(row.nextDueDate).slice(0, 10) : "")
            }
          ]}
          rows={reminders}
        />
        <PaginationBar
          limit={remindersLimit}
          offset={remindersOffset}
          count={reminders.length}
          total={remindersTotal}
          onChange={({ limit, offset }) => {
            setRemindersLimit(limit);
            void load({ remindersOffset: offset });
          }}
        />
      </div>
    </section>
  );
}

export { CenterReportsPage };
