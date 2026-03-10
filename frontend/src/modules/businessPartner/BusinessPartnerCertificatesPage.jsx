import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import { InputDialog } from "../../components/InputDialog";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import {
  exportPartnerCertificatesCsv,
  issuePartnerCertificate,
  listPartnerCertificates,
  revokePartnerCertificate,
  listPartnerStudents,
  bulkIssuePartnerCertificates,
  listEligibleStudentsForCertificate,
  listPartnerHierarchy
} from "../../services/partnerService";
import { listLevels } from "../../services/levelsService";

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

function BusinessPartnerCertificatesPage() {
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [filterLevelId, setFilterLevelId] = useState("");
  const [filterCenterId, setFilterCenterId] = useState("");
  const [issuedFrom, setIssuedFrom] = useState("");
  const [issuedTo, setIssuedTo] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [issueStudentId, setIssueStudentId] = useState("");
  const [issueLevelId, setIssueLevelId] = useState("");
  const [students, setStudents] = useState([]);
  const [levels, setLevels] = useState([]);
  const [centers, setCenters] = useState([]);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const getFilters = () => ({ limit, offset, q, status, levelId: filterLevelId, centerId: filterCenterId, issuedFrom, issuedTo });

  const load = async (next) => {
    const params = next || getFilters();
    setLoading(true);
    setError("");
    try {
      const data = await listPartnerCertificates(params);
      setRows(data.data.items || []);
      setLimit(data.data.limit);
      setOffset(data.data.offset);
      setTotal(data.data.total || 0);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load certificates.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(getFilters());
    void (async () => {
      try {
        const stu = await listPartnerStudents({ limit: 100, offset: 0 });
        setStudents(stu.data.items || []);
      } catch {
        setStudents([]);
      }

      try {
        const lv = await listLevels({ limit: 50, offset: 0 });
        setLevels(lv.data || []);
      } catch {
        setLevels([]);
      }

      try {
        const hRes = await listPartnerHierarchy();
        const nodes = hRes.data || [];
        setCenters(nodes.filter((n) => n.type === "CENTER"));
      } catch {
        setCenters([]);
      }
    })();
  }, []);

  if (loading && !rows.length) {
    return <LoadingState label="Loading certificates..." />;
  }

  const handleSearch = (e) => {
    e.preventDefault();
    setOffset(0);
    void load({ ...getFilters(), offset: 0 });
  };

  const handleStatusChange = (next) => {
    setStatus(next);
    setOffset(0);
    void load({ ...getFilters(), status: next, offset: 0 });
  };

  const handleExportCsv = async () => {
    try {
      const resp = await exportPartnerCertificatesCsv({ q, status, levelId: filterLevelId, centerId: filterCenterId, issuedFrom, issuedTo });
      downloadBlob(resp.data, `partner_certificates_${Date.now()}.csv`);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to export CSV.");
    }
  };

  const handleIssue = async (e) => {
    e.preventDefault();
    if (!issueStudentId || !issueLevelId) {
      toast.error("Select student and level.");
      return;
    }
    try {
      await issuePartnerCertificate({ studentId: issueStudentId, levelId: issueLevelId });
      setIssueStudentId("");
      setIssueLevelId("");
      await load(getFilters());
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to issue certificate.");
    }
  };

  const handleRevoke = async (row) => {
    setRevokeTarget(row);
  };

  const executeRevoke = async (reason) => {
    const row = revokeTarget;
    setRevokeTarget(null);
    if (!reason) return;
    try {
      await revokePartnerCertificate({ id: row.id, reason });
      await load(getFilters());
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to revoke certificate.");
    }
  };

  const columns = [
    { key: "certificateNumber", header: "Certificate #", render: (r) => r.certificateNumber },
    {
      key: "student",
      header: "Student",
      render: (r) => `${r.student?.admissionNo || ""} - ${r.student?.firstName || ""} ${r.student?.lastName || ""}`.trim()
    },
    { key: "level", header: "Level", render: (r) => `L${r.level?.rank ?? ""} ${r.level?.name || ""}`.trim() },
    { key: "issuedAt", header: "Issued", render: (r) => new Date(r.issuedAt).toLocaleString() },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusBadge status={r.status} />
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) => (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {r.status === "ISSUED" ? (
            <button className="button secondary" style={{ width: "auto" }} type="button" onClick={() => handleRevoke(r)}>
              Revoke
            </button>
          ) : null}
        </div>
      )
    }
  ];

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Certificates</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="button" type="button" onClick={() => setBulkOpen(true)} style={{ width: "auto" }}>
            📦 Bulk Issue
          </button>
          <button className="button secondary" type="button" onClick={handleExportCsv} style={{ width: "auto" }}>
            Export CSV
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Issue Certificate</h3>
        <form onSubmit={handleIssue} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select className="input" value={issueStudentId} onChange={(e) => setIssueStudentId(e.target.value)} style={{ width: 320 }}>
            <option value="">Select student</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.admissionNo} - {s.firstName} {s.lastName}
              </option>
            ))}
          </select>

          <select className="input" value={issueLevelId} onChange={(e) => setIssueLevelId(e.target.value)} style={{ width: 220 }}>
            <option value="">Select level</option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                L{l.rank} - {l.name}
              </option>
            ))}
          </select>

          <button className="button" type="submit" style={{ width: "auto" }}>
            Issue
          </button>
        </form>
      </div>

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="input"
            placeholder="Search certificate # / student"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 280 }}
          />

          <select className="input" value={status} onChange={(e) => handleStatusChange(e.target.value)} style={{ width: 160 }}>
            <option value="">All Status</option>
            <option value="ISSUED">Issued</option>
            <option value="REVOKED">Revoked</option>
          </select>

          <button className="button secondary" type="submit" style={{ width: "auto" }}>
            Search
          </button>

          <button className="button secondary" type="button" style={{ width: "auto" }} onClick={() => load(getFilters())}>
            Refresh
          </button>

          <button
            className="button secondary"
            type="button"
            style={{ width: "auto", fontSize: 12 }}
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? "▲ Less Filters" : "▼ More Filters"}
          </button>
        </form>

        {showAdvanced && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", paddingTop: 4, borderTop: "1px solid #e5e7eb" }}>
            <div>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Level</label>
              <select className="input" value={filterLevelId} onChange={(e) => { setFilterLevelId(e.target.value); setOffset(0); void load({ ...getFilters(), levelId: e.target.value, offset: 0 }); }} style={{ width: 180 }}>
                <option value="">All Levels</option>
                {levels.map((l) => (
                  <option key={l.id} value={l.id}>L{l.rank} - {l.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Center</label>
              <select className="input" value={filterCenterId} onChange={(e) => { setFilterCenterId(e.target.value); setOffset(0); void load({ ...getFilters(), centerId: e.target.value, offset: 0 }); }} style={{ width: 200 }}>
                <option value="">All Centers</option>
                {centers.map((c) => (
                  <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Issued From</label>
              <input type="date" className="input" value={issuedFrom} onChange={(e) => { setIssuedFrom(e.target.value); setOffset(0); void load({ ...getFilters(), issuedFrom: e.target.value, offset: 0 }); }} style={{ width: 150 }} />
            </div>

            <div>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Issued To</label>
              <input type="date" className="input" value={issuedTo} onChange={(e) => { setIssuedTo(e.target.value); setOffset(0); void load({ ...getFilters(), issuedTo: e.target.value, offset: 0 }); }} style={{ width: 150 }} />
            </div>

            <div style={{ alignSelf: "flex-end" }}>
              <button
                className="button secondary"
                type="button"
                style={{ width: "auto", fontSize: 12 }}
                onClick={() => {
                  setFilterLevelId(""); setFilterCenterId(""); setIssuedFrom(""); setIssuedTo(""); setQ(""); setStatus(""); setOffset(0);
                  void load({ limit, offset: 0, q: "", status: "", levelId: "", centerId: "", issuedFrom: "", issuedTo: "" });
                }}
              >
                Clear Filters
              </button>
            </div>
          </div>
        )}
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
            void load({ ...getFilters(), ...next });
          }}
          total={total}
        />
      </div>

      <InputDialog
        open={!!revokeTarget}
        title="Revoke Certificate"
        message={`Revoke certificate ${revokeTarget?.certificateNumber || ""}?`}
        inputLabel="Reason"
        inputPlaceholder="Revoke reason"
        required
        confirmLabel="Revoke"
        onCancel={() => setRevokeTarget(null)}
        onConfirm={(val) => void executeRevoke(val)}
      />

      {bulkOpen && (
        <BulkIssueModal
          levels={levels}
          onClose={() => setBulkOpen(false)}
          onDone={() => {
            setBulkOpen(false);
            void load(getFilters());
          }}
        />
      )}
    </section>
  );
}

function BulkIssueModal({ levels, onClose, onDone }) {
  const [levelId, setLevelId] = useState("");
  const [eligible, setEligible] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loadingEligible, setLoadingEligible] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [result, setResult] = useState(null);

  const fetchEligible = async (lid) => {
    if (!lid) { setEligible([]); setSelected(new Set()); return; }
    setLoadingEligible(true);
    try {
      const res = await listEligibleStudentsForCertificate(lid);
      const list = res.data || [];
      setEligible(list);
      setSelected(new Set(list.map((s) => s.id)));
    } catch {
      toast.error("Failed to load eligible students.");
      setEligible([]);
    } finally {
      setLoadingEligible(false);
    }
  };

  const handleLevelChange = (e) => {
    const v = e.target.value;
    setLevelId(v);
    setResult(null);
    void fetchEligible(v);
  };

  const toggleStudent = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === eligible.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(eligible.map((s) => s.id)));
    }
  };

  const handleIssue = async () => {
    if (!selected.size) { toast.error("Select at least one student."); return; }
    setIssuing(true);
    try {
      const res = await bulkIssuePartnerCertificates({ studentIds: [...selected], levelId });
      setResult(res.data);
      toast.success(`${res.data?.issued || 0} certificates issued!`);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Bulk issue failed.");
    } finally {
      setIssuing(false);
    }
  };

  const overlayStyle = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
    display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000
  };

  const modalStyle = {
    background: "var(--color-bg-card)", borderRadius: 12, padding: 24,
    width: "90%", maxWidth: 600, maxHeight: "80vh", overflow: "auto",
    boxShadow: "0 8px 32px rgba(0,0,0,0.15)"
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>📦 Bulk Issue Certificates</h3>
          <button onClick={result ? onDone : onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        {result ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div className="card" style={{ background: "var(--color-bg-success-light)", border: "1px solid var(--color-border-success-light)", textAlign: "center", padding: 20 }}>
              <div style={{ fontSize: 36 }}>✅</div>
              <div style={{ fontWeight: 700, fontSize: 18, marginTop: 8 }}>{result.issued} Certificates Issued</div>
              {result.skipped > 0 && <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>{result.skipped} skipped (already issued)</div>}
              {result.invalidStudents > 0 && <div style={{ fontSize: 13, color: "#ef4444", marginTop: 4 }}>{result.invalidStudents} invalid student(s)</div>}
            </div>
            <button className="button" onClick={onDone} style={{ width: "100%" }}>Done</button>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Select Level</label>
              <select className="input" value={levelId} onChange={handleLevelChange} style={{ width: "100%" }}>
                <option value="">— Choose a level —</option>
                {levels.map((l) => (
                  <option key={l.id} value={l.id}>L{l.rank} - {l.name}</option>
                ))}
              </select>
            </div>

            {loadingEligible && <div style={{ textAlign: "center", padding: 20, color: "#6b7280" }}>Loading eligible students...</div>}

            {!loadingEligible && levelId && !eligible.length && (
              <div style={{ textAlign: "center", padding: 20, color: "#6b7280" }}>
                <div style={{ fontSize: 32
                }}>🎓</div>
                <div style={{ marginTop: 8, fontWeight: 600 }}>No eligible students</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>All students who completed this level already have certificates, or none have completed it yet.</div>
              </div>
            )}

            {!loadingEligible && eligible.length > 0 && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: "#6b7280" }}>{eligible.length} eligible student(s) — {selected.size} selected</span>
                  <button className="button secondary" type="button" onClick={toggleAll} style={{ width: "auto", fontSize: 12 }}>
                    {selected.size === eligible.length ? "Deselect All" : "Select All"}
                  </button>
                </div>

                <div style={{ maxHeight: 280, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 8 }}>
                  {eligible.map((s) => (
                    <label
                      key={s.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                        borderBottom: "1px solid #f3f4f6", cursor: "pointer",
                        background: selected.has(s.id) ? "#eff6ff" : "transparent"
                      }}
                    >
                      <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleStudent(s.id)} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{s.fullName}</div>
                        <div style={{ fontSize: 11, color: "#6b7280" }}>
                          {s.admissionNo} · Completed: {new Date(s.completedAt).toLocaleDateString()}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                <button
                  className="button"
                  onClick={handleIssue}
                  disabled={issuing || !selected.size}
                  style={{ width: "100%", marginTop: 16 }}
                >
                  {issuing ? "Issuing..." : `Issue ${selected.size} Certificate${selected.size !== 1 ? "s" : ""}`}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export { BusinessPartnerCertificatesPage };
