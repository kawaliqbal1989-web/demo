import { useEffect, useState, useCallback, useRef } from "react";
import { MetricCard } from "../../components/MetricCard";
import { ErrorState } from "../../components/ErrorState";
import {
  getHierarchyTree, getHierarchyDashboard, getSystemHealth,
  saCreateFranchise, saSetFranchiseStatus, saGetFranchiseDetail,
  saCreateCenter, saSetCenterStatus, saGetCenterDetail
} from "../../services/superadminService";

function formatNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  return new Intl.NumberFormat(undefined).format(num);
}

function formatCurrencyInr(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "₹0";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(num);
}

function formatPct(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0%";
  return `${num.toFixed(1)}%`;
}

function getApiErrorMessage(error) {
  const status = error?.response?.status;
  const message = error?.response?.data?.message || error?.message;
  if (status) return `(${status}) ${message || "Request failed"}`;
  return message || "Request failed";
}

/* ─── Health Score Bar ─── */
function HealthBar({ score, label }) {
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#eab308" : "#ef4444";
  return (
    <div style={{ display: "grid", gap: 4 }}>
      {label && <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{label}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, height: 8, background: "var(--color-border, #e5e7eb)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${Math.max(0, Math.min(100, score))}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.4s" }} />
        </div>
        <span style={{ fontWeight: 700, fontSize: 14, color, minWidth: 40, textAlign: "right" }}>{score}/100</span>
      </div>
    </div>
  );
}

/* ─── Insight Badge ─── */
function InsightBadge({ insight }) {
  const sev = insight.severity || insight.level || "info";
  const colors = { critical: "var(--color-danger)", warning: "var(--color-warning)", info: "var(--color-info)" };
  const bg = { critical: "var(--color-bg-danger-light)", warning: "var(--color-bg-warn-light)", info: "var(--color-bg-info-light)" };
  const borderColor = { critical: "var(--color-border-danger)", warning: "var(--color-border-warning)", info: "var(--color-border)" };
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px", borderRadius: 6, background: bg[sev] || bg.info, border: `1px solid ${borderColor[sev] || borderColor.info}` }}>
      <span style={{ color: colors[sev] || colors.info, fontWeight: 700, fontSize: 14 }}>
        {sev === "critical" ? "⛔" : sev === "warning" ? "⚠️" : "ℹ️"}
      </span>
      <span style={{ fontSize: 13, color: "var(--color-text-primary)" }}>{insight.title || insight.message}{insight.detail ? ` — ${insight.detail}` : ""}</span>
    </div>
  );
}

/* ─── Tree Node ─── */
function TreeNode({ node, level, selected, onSelect, onAction }) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const isBp = level === 0;
  const isFranchise = level === 1;
  const isCenter = level === 2;
  const isSelected =
    (isBp && selected?.type === "bp" && selected?.id === node.id) ||
    (isFranchise && selected?.type === "franchise" && selected?.id === node.id) ||
    (isCenter && selected?.type === "center" && selected?.id === node.id);
  const hasChildren = (isBp && node.franchises?.length) || (isFranchise && node.centers?.length);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const healthDot = (score) => {
    const c = score >= 80 ? "#22c55e" : score >= 60 ? "#eab308" : "#ef4444";
    return <span title={`Health: ${score}/100`} style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: c, flexShrink: 0, boxShadow: `0 0 4px ${c}60` }} />;
  };

  const statusDot = (status) => {
    const c = status === "ACTIVE" ? "#22c55e" : status === "INACTIVE" ? "#ef4444" : "#9ca3af";
    return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: c, flexShrink: 0 }} />;
  };

  const handleSelect = () => {
    if (isBp) onSelect({ type: "bp", id: node.id });
    else if (isFranchise) onSelect({ type: "franchise", id: node.id, parentBpId: node.businessPartnerId });
    else if (isCenter) onSelect({ type: "center", id: node.id, parentFranchiseId: node.franchiseProfileId });
    if (hasChildren) setExpanded((e) => !e);
  };

  const menuItems = [];
  if (isBp) {
    menuItems.push({ label: "View Dashboard", action: () => onSelect({ type: "bp", id: node.id }) });
    menuItems.push({ label: "+ Add Franchise", action: () => onAction("createFranchise", { businessPartnerId: node.id, bpName: node.name }) });
  }
  if (isFranchise) {
    menuItems.push({ label: "View Details", action: () => onSelect({ type: "franchise", id: node.id, parentBpId: node.businessPartnerId }) });
    menuItems.push({ label: node.status === "ACTIVE" ? "Deactivate" : "Activate", action: () => onAction("toggleFranchiseStatus", { id: node.id, name: node.name, currentStatus: node.status }) });
    menuItems.push({ label: "+ Add Center", action: () => onAction("createCenter", { franchiseProfileId: node.id, franchiseName: node.name }) });
  }
  if (isCenter) {
    menuItems.push({ label: "View Details", action: () => onSelect({ type: "center", id: node.id, parentFranchiseId: node.franchiseProfileId }) });
    menuItems.push({ label: node.status === "ACTIVE" ? "Deactivate" : "Activate", action: () => onAction("toggleCenterStatus", { id: node.id, name: node.name, currentStatus: node.status }) });
  }

  return (
    <div style={{ marginLeft: level * 14 }}>
      <div
        role="button"
        tabIndex={0}
        onClick={handleSelect}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSelect(); } }}
        className="hierarchy-tree-node"
        style={{
          display: "flex", alignItems: "center", gap: 5, padding: "5px 8px", borderRadius: 6,
          cursor: "pointer",
          background: isSelected ? "var(--color-primary-bg, #eff6ff)" : "transparent",
          border: isSelected ? "1px solid var(--color-primary, #3b82f6)" : "1px solid transparent",
          fontSize: isBp ? 13 : 12, fontWeight: isBp ? 600 : 400,
          transition: "background 0.15s, border-color 0.15s"
        }}
      >
        {hasChildren ? (
          <span style={{ fontSize: 9, color: "var(--color-text-muted)", width: 12, flexShrink: 0, transition: "transform 0.2s", transform: expanded ? "rotate(90deg)" : "rotate(0deg)", display: "inline-block" }}>▶</span>
        ) : <span style={{ width: 12, flexShrink: 0 }} />}

        {isBp ? healthDot(node.healthScore ?? 100) : statusDot(node.status)}

        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.name}</span>

        {/* Alert badge for BPs */}
        {isBp && node.alertCount > 0 && (
          <span title={`${node.alertCount} alert(s)`} style={{
            background: "#ef4444", color: "#fff", borderRadius: 10, fontSize: 10, fontWeight: 700,
            minWidth: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center",
            padding: "0 5px", lineHeight: 1, flexShrink: 0
          }}>{node.alertCount}</span>
        )}

        {/* Student / Teacher counts */}
        <span style={{ fontSize: 10, color: "var(--color-text-muted)", flexShrink: 0, whiteSpace: "nowrap" }}>
          {isBp && `${node.students || 0}S · ${node.teachers || 0}T`}
          {isFranchise && `${node.students || 0}S · ${node.teachers || 0}T`}
          {level === 2 && node.students > 0 && `${node.students}S`}
        </span>

        {isBp && <span style={{ fontSize: 10, color: "var(--color-text-muted)", flexShrink: 0 }}>({node.franchiseCount}F)</span>}
        {isFranchise && <span style={{ fontSize: 10, color: "var(--color-text-muted)", flexShrink: 0 }}>({node.centerCount}C)</span>}

        {/* 3-dot action menu */}
        <span ref={menuRef} style={{ position: "relative", flexShrink: 0 }}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: "2px 4px",
              fontSize: 14, lineHeight: 1, color: "var(--color-text-muted)", borderRadius: 4
            }}
            title="Actions"
          >⋯</button>
          {menuOpen && (
            <div style={{
              position: "absolute", right: 0, top: "100%", zIndex: 50,
              background: "var(--color-bg-primary, #fff)", border: "1px solid var(--color-border, #e5e7eb)",
              borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,.12)", minWidth: 160, padding: 4
            }}>
              {menuItems.map((item, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); item.action(); }}
                  style={{
                    display: "block", width: "100%", textAlign: "left", padding: "6px 10px",
                    fontSize: 12, background: "none", border: "none", cursor: "pointer",
                    borderRadius: 4, color: "var(--color-text-primary)"
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-secondary, #f3f4f6)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                >{item.label}</button>
              ))}
            </div>
          )}
        </span>
      </div>

      {expanded && (
        <div style={{ transition: "opacity 0.2s", opacity: 1 }}>
          {isBp && node.franchises?.map((f) => <TreeNode key={f.id} node={f} level={1} selected={selected} onSelect={onSelect} onAction={onAction} />)}
          {isFranchise && node.centers?.map((c) => <TreeNode key={c.id} node={c} level={2} selected={selected} onSelect={onSelect} onAction={onAction} />)}
        </div>
      )}
    </div>
  );
}

/* ─── Skeleton ─── */
function SkeletonCard() {
  return (
    <div className="card dash-skeleton" aria-hidden="true">
      <div className="dash-skeleton__line" style={{ width: "55%" }} />
      <div className="dash-skeleton__line" style={{ width: "35%", height: 24 }} />
      <div className="dash-skeleton__line" style={{ width: "70%" }} />
    </div>
  );
}

/* ─── SVG Sparkline ─── */
function Sparkline({ data = [], width = 140, height = 40, color = "#3b82f6", label, labels }) {
  if (!data.length || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pad = 2;
  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  const areaPoints = `${pad},${height - pad} ${points} ${width - pad},${height - pad}`;
  const lastVal = data[data.length - 1];
  const fmtLast = typeof lastVal === "number" && lastVal > 999 ? `${(lastVal / 1000).toFixed(1)}k` : lastVal;
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
      {label && <div style={{ fontSize: 10, color: "var(--color-text-muted)", fontWeight: 600 }}>{label}</div>}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
        <polygon fill={`${color}15`} points={areaPoints} />
        <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--color-text-muted)" }}>
        {labels ? (
          <>
            <span>{labels[0]}</span>
            <span style={{ fontWeight: 600, color }}>{fmtLast}</span>
            <span>{labels[labels.length - 1]}</span>
          </>
        ) : (
          <span style={{ fontWeight: 600, color }}>{fmtLast}</span>
        )}
      </div>
    </div>
  );
}

/* ─── Dashboard Detail Panel ─── */
function DashboardPanel({ bpId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getHierarchyDashboard(bpId);
      setData(result.data);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [bpId]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <div className="dash-kpi-grid" role="list">{Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}</div>
      </div>
    );
  }

  if (error && !data) {
    return <ErrorState title="Failed to load dashboard" message={error} onRetry={load} retryLabel="Retry" />;
  }

  if (!data) return null;

  const { bp, franchiseCount, centerCount, overview, operations, performance, finance, workflow, alerts, rankings, franchiseComparison } = data;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* BP Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>{bp?.name}</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Code: {bp?.code} · Status: {bp?.status} · {franchiseCount} Franchise(s) · {centerCount} Center(s)</div>
        </div>
        <button type="button" className="button secondary" style={{ width: "auto" }} onClick={load} disabled={loading}>{loading ? "Refreshing..." : "Refresh"}</button>
      </div>

      {/* Overview */}
      <section aria-label="Overview">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>📊 Overview</h3>
        <div className="dash-kpi-grid" role="list">
          <MetricCard label="Total Centers" value={formatNumber(overview?.centersCount)} sublabel={`Active: ${formatNumber(overview?.activeCentersCount)}`} />
          <MetricCard label="Total Students" value={formatNumber(overview?.studentsCount)} sublabel={`Active: ${formatNumber(overview?.activeStudentsCount)}`} />
          <MetricCard label="Teachers" value={formatNumber(overview?.teachersCount)} />
          <MetricCard label="Active Batches" value={formatNumber(overview?.activeBatchesCount)} sublabel={`Enrollments: ${formatNumber(overview?.activeEnrollments)}`} />
        </div>
      </section>

      {/* Operations */}
      {operations && (
        <section aria-label="Operations">
          <h3 style={{ marginTop: 0, fontSize: 15 }}>⚙️ Operations</h3>
          <div className="dash-kpi-grid" role="list">
            <MetricCard label="Attendance Rate (30d)" value={formatPct(operations?.attendanceRate30d)} />
            <MetricCard label="Teacher Coverage" value={formatPct(operations?.teacherCoverageRate)} />
            <MetricCard label="Sessions Finalized (30d)" value={formatNumber(operations?.sessionsFinalized30d)} />
            <MetricCard label="Recent Admissions (30d)" value={formatNumber(operations?.recentAdmissions30d)} />
            <MetricCard label="Low Attendance Centers" value={formatNumber(operations?.lowAttendanceCenters)} />
            <MetricCard label="Centers Without Teachers" value={formatNumber(operations?.centersWithoutTeachers)} />
          </div>
        </section>
      )}

      {/* Performance */}
      {performance && (
        <section aria-label="Performance">
          <h3 style={{ marginTop: 0, fontSize: 15 }}>📈 Performance</h3>
          <div className="dash-kpi-grid" role="list">
            <MetricCard label="Worksheet Submissions (30d)" value={formatNumber(performance?.worksheetSubmissions30d)} sublabel={`${formatNumber(performance?.studentsPracticing30d)} students practicing`} />
            <MetricCard label="Avg Worksheet Score" value={formatPct(performance?.worksheetAverageScore30d)} />
            <MetricCard label="Mock Test Attempts (30d)" value={formatNumber(performance?.mockTestAttempts30d)} />
            <MetricCard label="Avg Mock Score" value={formatPct(performance?.mockTestAveragePercentage30d)} />
            <MetricCard label="Competition Enrollments" value={formatNumber(performance?.activeCompetitionEnrollments)} />
            <MetricCard label="Level Completions (30d)" value={formatNumber(performance?.levelCompletions30d)} />
          </div>
        </section>
      )}

      {/* Finance */}
      {finance && (
        <section aria-label="Finance">
          <h3 style={{ marginTop: 0, fontSize: 15 }}>💰 Finance</h3>
          <div className="dash-kpi-grid" role="list">
            <MetricCard label="Collections (30d)" value={formatCurrencyInr(finance?.collections30d)} />
            <MetricCard label="Overdue Amount" value={formatCurrencyInr(finance?.overdueAmount)} sublabel={`${formatNumber(finance?.overdueInstallmentsCount)} overdue installments`} />
            <MetricCard label="Pending Settlements" value={formatNumber(finance?.pendingSettlementsCount)} sublabel={formatCurrencyInr(finance?.pendingSettlementAmount)} />
          </div>
        </section>
      )}

      {/* Workflow */}
      {workflow && (
        <section aria-label="Workflow">
          <h3 style={{ marginTop: 0, fontSize: 15 }}>📋 Workflow</h3>
          <div className="dash-kpi-grid" role="list">
            <MetricCard label="Pending Competition Requests" value={formatNumber(workflow?.pendingCompetitionRequests)} />
            <MetricCard label="Certificates Issued (30d)" value={formatNumber(workflow?.certificatesIssued30d)} />
            <MetricCard label="Certificates Revoked (30d)" value={formatNumber(workflow?.certificatesRevoked30d)} />
          </div>
        </section>
      )}

      {/* Alerts */}
      {alerts?.length > 0 && (
        <section aria-label="Alerts">
          <h3 style={{ marginTop: 0, fontSize: 15 }}>🚨 Alerts</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {alerts.map((a, i) => <InsightBadge key={a.id || i} insight={a} />)}
          </div>
        </section>
      )}

      {/* Rankings */}
      {rankings && (
        <section aria-label="Rankings">
          <h3 style={{ marginTop: 0, fontSize: 15 }}>🏆 Center Rankings</h3>
          <div className="hierarchy-rankings-grid">
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13, color: "#22c55e" }}>Top by Students</div>
              {rankings.topCentersByStudents?.length ? rankings.topCentersByStudents.map((c, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderBottom: "1px solid var(--color-border, #f0f0f0)" }}>
                  <span>{c.centerName}</span>
                  <span style={{ fontWeight: 600 }}>{formatNumber(c.activeStudentsCount)} students</span>
                </div>
              )) : <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>No data</div>}
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13, color: "#ef4444" }}>Needs Attention</div>
              {rankings.attentionCenters?.length ? rankings.attentionCenters.map((c, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderBottom: "1px solid var(--color-border, #f0f0f0)" }}>
                  <span>{c.centerName}</span>
                  <span style={{ fontWeight: 600, color: "#ef4444" }}>Score: {c.attentionScore}</span>
                </div>
              )) : <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>No data</div>}
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13, color: "#3b82f6" }}>Collection Leaders</div>
              {rankings.collectionLeaders?.length ? rankings.collectionLeaders.map((c, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderBottom: "1px solid var(--color-border, #f0f0f0)" }}>
                  <span>{c.centerName}</span>
                  <span style={{ fontWeight: 600 }}>{formatCurrencyInr(c.collections30d)}</span>
                </div>
              )) : <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>No data</div>}
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13, color: "#eab308" }}>Low Attendance</div>
              {rankings.lowAttendanceCenters?.length ? rankings.lowAttendanceCenters.map((c, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderBottom: "1px solid var(--color-border, #f0f0f0)" }}>
                  <span>{c.centerName}</span>
                  <span style={{ fontWeight: 600 }}>{formatPct(c.attendanceRate30d)}</span>
                </div>
              )) : <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>No data</div>}
            </div>
          </div>
        </section>
      )}

      {/* Franchise Comparison */}
      {franchiseComparison?.length > 0 && (
        <section aria-label="Franchise Comparison">
          <h3 style={{ marginTop: 0, fontSize: 15 }}>🔄 Franchise Comparison</h3>
          <div className="card" style={{ padding: 0, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--color-bg-secondary, #f9fafb)", textAlign: "left" }}>
                  <th style={{ padding: "8px 12px", fontWeight: 600 }}>Franchise</th>
                  <th style={{ padding: "8px 12px", fontWeight: 600, textAlign: "right" }}>Centers</th>
                  <th style={{ padding: "8px 12px", fontWeight: 600, textAlign: "right" }}>Students</th>
                  <th style={{ padding: "8px 12px", fontWeight: 600, textAlign: "right" }}>Attendance</th>
                  <th style={{ padding: "8px 12px", fontWeight: 600, textAlign: "right" }}>Collections</th>
                  <th style={{ padding: "8px 12px", fontWeight: 600, textAlign: "right" }}>Overdue</th>
                </tr>
              </thead>
              <tbody>
                {franchiseComparison.map((f) => (
                  <tr key={f.franchiseProfileId} style={{ borderTop: "1px solid var(--color-border, #f0f0f0)" }}>
                    <td style={{ padding: "8px 12px" }}>{f.franchiseName} <span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>({f.franchiseCode})</span></td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{formatNumber(f.centersCount)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{formatNumber(f.activeStudentsCount)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{formatPct(f.attendanceRate30d)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>{formatCurrencyInr(f.collections30d)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", color: f.overdueAmount > 0 ? "#ef4444" : undefined }}>{formatCurrencyInr(f.overdueAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

/* ─── Franchise Detail Panel ─── */
function FranchiseDetailPanel({ franchiseId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await saGetFranchiseDetail(franchiseId);
      setData(result.data);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [franchiseId]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return <div className="card" style={{ padding: 16 }}><div className="dash-kpi-grid" role="list">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div></div>;
  }
  if (error && !data) return <ErrorState title="Failed to load franchise" message={error} onRetry={load} retryLabel="Retry" />;
  if (!data) return null;

  const statusColor = data.status === "ACTIVE" ? "#22c55e" : data.status === "INACTIVE" ? "#ef4444" : "#9ca3af";

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>🏬 {data.name}</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Code: {data.code} · <span style={{ color: statusColor, fontWeight: 600 }}>{data.status}</span>
            {data.businessPartner && <span> · BP: {data.businessPartner.name}</span>}
          </div>
        </div>
        <button type="button" className="button secondary" style={{ width: "auto" }} onClick={load} disabled={loading}>{loading ? "Refreshing..." : "Refresh"}</button>
      </div>

      <section aria-label="Metrics">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>📊 Metrics</h3>
        <div className="dash-kpi-grid" role="list">
          <MetricCard label="Centers" value={formatNumber(data.metrics?.centersCount)} />
          <MetricCard label="Students" value={formatNumber(data.metrics?.studentsCount)} />
          <MetricCard label="Teachers" value={formatNumber(data.metrics?.teachersCount)} />
        </div>
      </section>

      {data.authUser && (
        <section aria-label="Auth Info">
          <h3 style={{ marginTop: 0, fontSize: 15 }}>🔑 Login Info</h3>
          <div className="card" style={{ padding: 16, fontSize: 13 }}>
            <div><strong>Username:</strong> {data.authUser.username}</div>
            <div><strong>Email:</strong> {data.authUser.email}</div>
            <div><strong>Active:</strong> {data.authUser.isActive ? "Yes" : "No"}</div>
          </div>
        </section>
      )}

      {(data.emailOfficial || data.phonePrimary) && (
        <section aria-label="Contact">
          <h3 style={{ marginTop: 0, fontSize: 15 }}>📞 Contact</h3>
          <div className="card" style={{ padding: 16, fontSize: 13 }}>
            {data.emailOfficial && <div><strong>Email:</strong> {data.emailOfficial}</div>}
            {data.phonePrimary && <div><strong>Phone:</strong> {data.phonePrimary}</div>}
            {data.phoneAlternate && <div><strong>Alt Phone:</strong> {data.phoneAlternate}</div>}
            {data.websiteUrl && <div><strong>Website:</strong> {data.websiteUrl}</div>}
          </div>
        </section>
      )}

      {data.address && (
        <section aria-label="Address">
          <h3 style={{ marginTop: 0, fontSize: 15 }}>📍 Address</h3>
          <div className="card" style={{ padding: 16, fontSize: 13 }}>
            {data.address.addressLine1 && <div>{data.address.addressLine1}</div>}
            {data.address.addressLine2 && <div>{data.address.addressLine2}</div>}
            <div>{[data.address.city, data.address.district, data.address.state].filter(Boolean).join(", ")}</div>
            {data.address.pincode && <div>PIN: {data.address.pincode}</div>}
          </div>
        </section>
      )}

      <div style={{ fontSize: 12, color: "var(--color-text-muted)", textAlign: "right" }}>
        <a href={`/superadmin/franchises`} style={{ color: "var(--color-primary)" }}>Open full Franchise management →</a>
      </div>
    </div>
  );
}

/* ─── Center Detail Panel ─── */
function CenterDetailPanel({ centerId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await saGetCenterDetail(centerId);
      setData(result.data);
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [centerId]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return <div className="card" style={{ padding: 16 }}><div className="dash-kpi-grid" role="list">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div></div>;
  }
  if (error && !data) return <ErrorState title="Failed to load center" message={error} onRetry={load} retryLabel="Retry" />;
  if (!data) return null;

  const statusColor = data.status === "ACTIVE" ? "#22c55e" : data.status === "INACTIVE" ? "#ef4444" : data.status === "SUSPENDED" ? "#eab308" : "#9ca3af";

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>🏫 {data.name}</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Code: {data.code} · <span style={{ color: statusColor, fontWeight: 600 }}>{data.status}</span>
            {data.displayName && <span> · {data.displayName}</span>}
            {data.franchiseProfile && <span> · Franchise: {data.franchiseProfile.name}</span>}
          </div>
        </div>
        <button type="button" className="button secondary" style={{ width: "auto" }} onClick={load} disabled={loading}>{loading ? "Refreshing..." : "Refresh"}</button>
      </div>

      <section aria-label="Metrics">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>📊 Metrics</h3>
        <div className="dash-kpi-grid" role="list">
          <MetricCard label="Students" value={formatNumber(data.metrics?.studentsCount)} />
          <MetricCard label="Teachers" value={formatNumber(data.metrics?.teachersCount)} />
          <MetricCard label="Batches" value={formatNumber(data.metrics?.batchesCount)} />
        </div>
      </section>

      {data.authUser && (
        <section aria-label="Auth Info">
          <h3 style={{ marginTop: 0, fontSize: 15 }}>🔑 Login Info</h3>
          <div className="card" style={{ padding: 16, fontSize: 13 }}>
            <div><strong>Username:</strong> {data.authUser.username}</div>
            <div><strong>Email:</strong> {data.authUser.email}</div>
            <div><strong>Active:</strong> {data.authUser.isActive ? "Yes" : "No"}</div>
          </div>
        </section>
      )}

      {(data.emailOfficial || data.phonePrimary) && (
        <section aria-label="Contact">
          <h3 style={{ marginTop: 0, fontSize: 15 }}>📞 Contact</h3>
          <div className="card" style={{ padding: 16, fontSize: 13 }}>
            {data.emailOfficial && <div><strong>Email:</strong> {data.emailOfficial}</div>}
            {data.phonePrimary && <div><strong>Phone:</strong> {data.phonePrimary}</div>}
            {data.headPrincipalName && <div><strong>Head/Principal:</strong> {data.headPrincipalName}</div>}
            {data.affiliationCode && <div><strong>Affiliation Code:</strong> {data.affiliationCode}</div>}
            {data.websiteUrl && <div><strong>Website:</strong> {data.websiteUrl}</div>}
          </div>
        </section>
      )}

      {data.address && (
        <section aria-label="Address">
          <h3 style={{ marginTop: 0, fontSize: 15 }}>📍 Address</h3>
          <div className="card" style={{ padding: 16, fontSize: 13 }}>
            {data.address.addressLine1 && <div>{data.address.addressLine1}</div>}
            {data.address.addressLine2 && <div>{data.address.addressLine2}</div>}
            <div>{[data.address.city, data.address.district, data.address.state].filter(Boolean).join(", ")}</div>
            {data.address.pincode && <div>PIN: {data.address.pincode}</div>}
          </div>
        </section>
      )}

      <div style={{ fontSize: 12, color: "var(--color-text-muted)", textAlign: "right" }}>
        <a href={`/superadmin/centers`} style={{ color: "var(--color-primary)" }}>Open full Center management →</a>
      </div>
    </div>
  );
}

/* ─── Create Franchise Modal ─── */
function CreateFranchiseModal({ businessPartnerId, bpName, onClose, onCreated }) {
  const [form, setForm] = useState({ name: "", emailOfficial: "", password: "", phonePrimary: "", displayName: "", city: "", state: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.emailOfficial || !form.password) return;
    setSaving(true);
    setError(null);
    try {
      await saCreateFranchise({ businessPartnerId, ...form });
      onCreated();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.4)" }} onClick={onClose} />
      <div className="card" style={{ position: "relative", padding: 24, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
        <h3 style={{ marginTop: 0, fontSize: 16 }}>+ Create Franchise</h3>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 16 }}>Under BP: {bpName}</div>
        {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12, padding: 8, background: "var(--color-bg-danger-light)", borderRadius: 4 }}>{error}</div>}
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          <label style={{ fontSize: 13 }}>Name *<input className="input" required value={form.name} onChange={set("name")} /></label>
          <label style={{ fontSize: 13 }}>Display Name<input className="input" value={form.displayName} onChange={set("displayName")} /></label>
          <label style={{ fontSize: 13 }}>Email *<input className="input" type="email" required value={form.emailOfficial} onChange={set("emailOfficial")} /></label>
          <label style={{ fontSize: 13 }}>Password *<input className="input" type="password" required minLength={6} value={form.password} onChange={set("password")} /></label>
          <label style={{ fontSize: 13 }}>Phone<input className="input" value={form.phonePrimary} onChange={set("phonePrimary")} /></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ fontSize: 13 }}>City<input className="input" value={form.city} onChange={set("city")} /></label>
            <label style={{ fontSize: 13 }}>State<input className="input" value={form.state} onChange={set("state")} /></label>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button type="button" className="button secondary" style={{ width: "auto" }} onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="button primary" style={{ width: "auto" }} disabled={saving}>{saving ? "Creating..." : "Create Franchise"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Create Center Modal ─── */
function CreateCenterModal({ franchiseProfileId, franchiseName, onClose, onCreated }) {
  const [form, setForm] = useState({ name: "", displayName: "", emailOfficial: "", password: "", phonePrimary: "", city: "", state: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.displayName || !form.emailOfficial || !form.phonePrimary || !form.password) return;
    setSaving(true);
    setError(null);
    try {
      await saCreateCenter({ franchiseProfileId, ...form });
      onCreated();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.4)" }} onClick={onClose} />
      <div className="card" style={{ position: "relative", padding: 24, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
        <h3 style={{ marginTop: 0, fontSize: 16 }}>+ Create Center</h3>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 16 }}>Under Franchise: {franchiseName}</div>
        {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12, padding: 8, background: "var(--color-bg-danger-light)", borderRadius: 4 }}>{error}</div>}
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          <label style={{ fontSize: 13 }}>Name *<input className="input" required value={form.name} onChange={set("name")} /></label>
          <label style={{ fontSize: 13 }}>Display Name *<input className="input" required value={form.displayName} onChange={set("displayName")} /></label>
          <label style={{ fontSize: 13 }}>Email *<input className="input" type="email" required value={form.emailOfficial} onChange={set("emailOfficial")} /></label>
          <label style={{ fontSize: 13 }}>Password *<input className="input" type="password" required minLength={6} value={form.password} onChange={set("password")} /></label>
          <label style={{ fontSize: 13 }}>Phone *<input className="input" required value={form.phonePrimary} onChange={set("phonePrimary")} /></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ fontSize: 13 }}>City<input className="input" value={form.city} onChange={set("city")} /></label>
            <label style={{ fontSize: 13 }}>State<input className="input" value={form.state} onChange={set("state")} /></label>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button type="button" className="button secondary" style={{ width: "auto" }} onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="button primary" style={{ width: "auto" }} disabled={saving}>{saving ? "Creating..." : "Create Center"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Status Toggle Confirm Dialog ─── */
function StatusConfirmDialog({ entityType, entityName, currentStatus, onConfirm, onClose }) {
  const [saving, setSaving] = useState(false);
  const nextStatus = currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  const isDeactivate = currentStatus === "ACTIVE";

  const handleConfirm = async () => {
    setSaving(true);
    await onConfirm(nextStatus);
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.4)" }} onClick={onClose} />
      <div className="card" style={{ position: "relative", padding: 24, width: "100%", maxWidth: 400 }}>
        <h3 style={{ marginTop: 0, fontSize: 16 }}>{isDeactivate ? "⚠️ Deactivate" : "✅ Activate"} {entityType}</h3>
        <p style={{ fontSize: 13, color: "var(--color-text-primary)" }}>
          {isDeactivate
            ? `Are you sure you want to deactivate "${entityName}"? ${entityType === "Franchise" ? "This will also deactivate all child centers." : ""}`
            : `Activate "${entityName}"?`
          }
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" className="button secondary" style={{ width: "auto" }} onClick={onClose} disabled={saving}>Cancel</button>
          <button
            type="button"
            className={`button ${isDeactivate ? "danger" : "primary"}`}
            style={{ width: "auto" }}
            onClick={handleConfirm}
            disabled={saving}
          >{saving ? "Saving..." : `${isDeactivate ? "Deactivate" : "Activate"}`}</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
function SuperadminHierarchyPage() {
  const [tree, setTree] = useState([]);
  const [totals, setTotals] = useState(null);
  const [treeLoading, setTreeLoading] = useState(true);
  const [treeError, setTreeError] = useState(null);
  const [selected, setSelected] = useState(null); // { type: 'bp'|'franchise'|'center', id, ... }
  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [treeFilter, setTreeFilter] = useState("");
  const [modal, setModal] = useState(null); // { type, ...props }
  const [lastRefresh, setLastRefresh] = useState(null);

  const loadTree = useCallback(async () => {
    setTreeLoading(true);
    setTreeError(null);
    try {
      const result = await getHierarchyTree();
      setTree(result.data?.tree || []);
      setTotals(result.data?.totals || null);
    } catch (e) {
      setTreeError(getApiErrorMessage(e));
    } finally {
      setTreeLoading(false);
      setLastRefresh(new Date());
    }
  }, []);

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const result = await getSystemHealth();
      setHealth(result.data);
    } catch (_) {
      /* health is non-critical, silently fail */
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => { loadTree(); loadHealth(); }, [loadTree, loadHealth]);

  // Auto-refresh every 60 seconds
  const refreshRef = useRef(null);
  useEffect(() => {
    refreshRef.current = setInterval(() => { loadTree(); loadHealth(); }, 60000);
    return () => clearInterval(refreshRef.current);
  }, [loadTree, loadHealth]);

  // Tree action handler (from context menu)
  const handleTreeAction = useCallback((action, payload) => {
    if (action === "createFranchise") {
      setModal({ type: "createFranchise", businessPartnerId: payload.businessPartnerId, bpName: payload.bpName });
    } else if (action === "createCenter") {
      setModal({ type: "createCenter", franchiseProfileId: payload.franchiseProfileId, franchiseName: payload.franchiseName });
    } else if (action === "toggleFranchiseStatus") {
      setModal({ type: "statusToggle", entityType: "Franchise", entityId: payload.id, entityName: payload.name, currentStatus: payload.currentStatus, apiCall: saSetFranchiseStatus });
    } else if (action === "toggleCenterStatus") {
      setModal({ type: "statusToggle", entityType: "Center", entityId: payload.id, entityName: payload.name, currentStatus: payload.currentStatus, apiCall: saSetCenterStatus });
    }
  }, []);

  const handleModalCreated = useCallback(() => {
    setModal(null);
    loadTree();
  }, [loadTree]);

  const handleStatusConfirm = useCallback(async (nextStatus) => {
    if (!modal || modal.type !== "statusToggle") return;
    try {
      await modal.apiCall(modal.entityId, nextStatus);
      setModal(null);
      loadTree();
    } catch (err) {
      // Error will be shown by the dialog if needed; for now just close + reload
      setModal(null);
      loadTree();
    }
  }, [modal, loadTree]);

  const filteredTree = treeFilter.trim()
    ? tree.filter((bp) => {
        const q = treeFilter.toLowerCase();
        if (bp.name.toLowerCase().includes(q) || bp.code.toLowerCase().includes(q)) return true;
        return bp.franchises?.some((f) =>
          f.name.toLowerCase().includes(q) || f.code.toLowerCase().includes(q) ||
          f.centers?.some((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
        );
      })
    : tree;

  return (
    <div style={{ display: "grid", gap: 20, padding: 0 }}>
      {/* Responsive styles */}
      <style>{`
        .hierarchy-layout { display: grid; grid-template-columns: 300px 1fr; gap: 20px; align-items: start; }
        .hierarchy-tree-node:hover { background: var(--color-bg-secondary, #f9fafb) !important; }
        .hierarchy-sidebar { transition: max-height 0.3s ease; }
        .hierarchy-rankings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 900px) {
          .hierarchy-layout { grid-template-columns: 1fr; }
          .hierarchy-rankings-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* Page Header */}
      <div className="dash-header">
        <div>
          <h1 style={{ margin: 0 }}>🔍 Hierarchy Monitor</h1>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>
            Drill down into any Business Partner to see operational & performance summaries.
            {lastRefresh && <span style={{ marginLeft: 8 }}>· Last refreshed: {lastRefresh.toLocaleTimeString()}</span>}
          </div>
        </div>
        <div className="dash-header__actions">
          <button type="button" className="button secondary" style={{ width: "auto" }} onClick={() => { loadTree(); loadHealth(); }} disabled={treeLoading}>
            {treeLoading ? "Refreshing..." : "Refresh All"}
          </button>
        </div>
      </div>

      {/* System Pulse */}
      {health && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>🫀 System Pulse</h2>
            {totals && (
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                {totals.bps} BPs · {totals.franchises} Franchises · {totals.centers} Centers
              </div>
            )}
          </div>
          <HealthBar score={health.healthScore} label="Platform Health Score" />
          {health.trends && (health.trends.admissions?.length > 1 || health.trends.revenue?.length > 1) && (
            <div style={{ display: "flex", gap: 32, marginTop: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
              {health.trends.admissions?.length > 1 && (
                <Sparkline data={health.trends.admissions} color="#3b82f6" label="Admissions (6 months)" width={150} height={40} labels={health.trends.monthLabels} />
              )}
              {health.trends.revenue?.length > 1 && (
                <Sparkline data={health.trends.revenue} color="#22c55e" label="Revenue (6 months)" width={150} height={40} labels={health.trends.monthLabels} />
              )}
            </div>
          )}
          <div className="dash-kpi-grid" role="list" style={{ marginTop: 12 }}>
            <MetricCard label="Active Students" value={formatNumber(health.overview?.studentsActive)} sublabel={`Total: ${formatNumber(health.overview?.studentsTotal)}`} />
            <MetricCard label="Active Centers" value={formatNumber(health.overview?.centerCount)} />
            <MetricCard label="Teachers" value={formatNumber(health.overview?.teacherCount)} />
            <MetricCard label="Subscriptions Active" value={formatNumber(health.subscriptions?.active)} sublabel={health.subscriptions?.expired ? `${health.subscriptions.expired} expired` : undefined} />
            <MetricCard label="Pending Approvals" value={formatNumber(health.pendingApprovals)} />
            <MetricCard label="Audit Events (24h)" value={formatNumber(health.recentAuditEvents)} />
          </div>
          {health.insights?.length > 0 && (
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {health.insights.map((ins, i) => <InsightBadge key={i} insight={ins} />)}
            </div>
          )}
        </div>
      )}
      {healthLoading && !health && (
        <div className="card" style={{ padding: 16 }}>
          <div className="dash-kpi-grid" role="list">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        </div>
      )}

      {/* Main Layout: Tree + Detail */}
      <div className="hierarchy-layout">
        {/* Sidebar Tree */}
        <div className="card hierarchy-sidebar" style={{ padding: 12, maxHeight: "70vh", overflowY: "auto" }}>
          <div style={{ marginBottom: 8 }}>
            <input
              className="input"
              placeholder="Filter BPs / Franchises / Centers..."
              value={treeFilter}
              onChange={(e) => setTreeFilter(e.target.value)}
              style={{ fontSize: 13 }}
            />
          </div>
          {treeLoading && tree.length === 0 ? (
            <div style={{ padding: 12, textAlign: "center", color: "var(--color-text-muted)", fontSize: 13 }}>Loading hierarchy...</div>
          ) : treeError ? (
            <ErrorState title="Failed to load" message={treeError} onRetry={loadTree} retryLabel="Retry" />
          ) : filteredTree.length === 0 ? (
            <div style={{ padding: 12, textAlign: "center", color: "var(--color-text-muted)", fontSize: 13 }}>
              {treeFilter ? "No matches found" : "No Business Partners found"}
            </div>
          ) : (
            <div style={{ display: "grid", gap: 2 }}>
              {filteredTree.map((bp) => <TreeNode key={bp.id} node={bp} level={0} selected={selected} onSelect={setSelected} onAction={handleTreeAction} />)}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div>
          {selected?.type === "bp" ? (
            <DashboardPanel bpId={selected.id} key={`bp-${selected.id}`} />
          ) : selected?.type === "franchise" ? (
            <FranchiseDetailPanel franchiseId={selected.id} key={`f-${selected.id}`} />
          ) : selected?.type === "center" ? (
            <CenterDetailPanel centerId={selected.id} key={`c-${selected.id}`} />
          ) : (
            <div className="card" style={{ padding: 32, textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🏢</div>
              <h3 style={{ margin: "0 0 8px" }}>Select an Entity</h3>
              <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                Click on any Business Partner, Franchise, or Center in the tree to view details. Use the ⋯ menu for quick actions like creating or toggling status.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {modal?.type === "createFranchise" && (
        <CreateFranchiseModal
          businessPartnerId={modal.businessPartnerId}
          bpName={modal.bpName}
          onClose={() => setModal(null)}
          onCreated={handleModalCreated}
        />
      )}
      {modal?.type === "createCenter" && (
        <CreateCenterModal
          franchiseProfileId={modal.franchiseProfileId}
          franchiseName={modal.franchiseName}
          onClose={() => setModal(null)}
          onCreated={handleModalCreated}
        />
      )}
      {modal?.type === "statusToggle" && (
        <StatusConfirmDialog
          entityType={modal.entityType}
          entityName={modal.entityName}
          currentStatus={modal.currentStatus}
          onConfirm={handleStatusConfirm}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

export { SuperadminHierarchyPage };
