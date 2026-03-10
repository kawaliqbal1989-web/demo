import { useEffect, useState } from "react";
import { PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import {
  getCenterPracticeFeatures,
  listStudentsWithPracticeFeatures,
  assignStudentFeature,
  unassignStudentFeature
} from "../../services/centerPracticeFeaturesService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import toast from "react-hot-toast";

function CenterPracticeAssignmentsPage() {
  const [centerFeatures, setCenterFeatures] = useState(null);
  const [students, setStudents] = useState([]);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [featureFilter, setFeatureFilter] = useState(""); // "" | "PRACTICE" | "ABACUS_PRACTICE"
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(null); // studentId-featureKey being processed

  const load = async (next = { limit, offset }) => {
    setLoading(true);
    setError("");
    try {
      const [featuresRes, studentsRes] = await Promise.all([
        getCenterPracticeFeatures(),
        listStudentsWithPracticeFeatures({
          featureKey: featureFilter || undefined,
          query: searchQuery || undefined,
          limit: next.limit,
          offset: next.offset
        })
      ]);
      setCenterFeatures(featuresRes?.data || null);
      setStudents(studentsRes?.data?.students || []);
      setLimit(studentsRes?.data?.pagination?.limit ?? next.limit);
      setOffset(studentsRes?.data?.pagination?.offset ?? next.offset);
      setTotal(studentsRes?.data?.pagination?.total ?? 0);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load practice data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setOffset(0);
    void load({ limit, offset: 0 });
  }, [featureFilter, searchQuery]);

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    const nextQuery = searchInput.trim();
    setOffset(0);
    setSearchQuery(nextQuery);
  };

  const handleSearchClear = () => {
    setSearchInput("");
    setOffset(0);
    setSearchQuery("");
  };

  const handleToggle = async (student, featureKey, currently) => {
    const key = `${student.id}-${featureKey}`;
    setSaving(key);
    try {
      if (currently) {
        await unassignStudentFeature({ studentId: student.id, featureKey });
        toast.success(`${featureKey} removed from ${student.name}`);
      } else {
        await assignStudentFeature({ studentId: student.id, featureKey });
        toast.success(`${featureKey} assigned to ${student.name}`);
      }
      await load({ limit, offset });
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to update assignment");
    } finally {
      setSaving(null);
    }
  };

  if (loading && !students.length) {
    return <LoadingState label="Loading practice assignments..." />;
  }

  const renderFeatureCard = (featureKey, label) => {
    const info = centerFeatures?.[featureKey];
    if (!info) {
      return (
        <div style={{ padding: 12, background: "var(--color-bg-subtle)", borderRadius: 8, fontSize: 13, color: "var(--color-text-muted)" }}>
          <strong>{label}</strong>
          <div>Not allocated to your center.</div>
        </div>
      );
    }

    const color = info.isEnabled ? "var(--color-bg-success-light)" : "var(--color-bg-danger-light)";
    return (
      <div style={{ padding: 12, background: color, borderRadius: 8, fontSize: 13 }}>
        <strong>{label}</strong>
        <div>Status: {info.isEnabled ? "✅ Enabled" : "❌ Disabled"}</div>
        <div>Allocated Seats: {info.allocatedSeats || 0}</div>
        <div>Assigned Students: {info.assignedStudents || 0}</div>
        <div>Available: {Math.max(0, (info.allocatedSeats || 0) - (info.assignedStudents || 0))}</div>
      </div>
    );
  };

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <h2 style={{ margin: 0 }}>Practice Feature Assignments</h2>

      {error && (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      )}

      {/* Center allocation summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {renderFeatureCard("PRACTICE", "Practice")}
        {renderFeatureCard("ABACUS_PRACTICE", "Abacus Practice")}
      </div>

      {/* Filter */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 13 }}>Filter by Feature:</label>
        <select
          className="input"
          style={{ width: "auto" }}
          value={featureFilter}
          onChange={(e) => setFeatureFilter(e.target.value)}
        >
          <option value="">All</option>
          <option value="PRACTICE">Practice</option>
          <option value="ABACUS_PRACTICE">Abacus Practice</option>
        </select>
        <select
          className="input"
          style={{ width: "auto" }}
          value={limit}
          onChange={(e) => {
            const nextLimit = parseInt(e.target.value, 10) || 20;
            setLimit(nextLimit);
            setOffset(0);
            void load({ limit: nextLimit, offset: 0 });
          }}
        >
          <option value={10}>10 / page</option>
          <option value={20}>20 / page</option>
          <option value={50}>50 / page</option>
          <option value={100}>100 / page</option>
        </select>
        <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto", flexWrap: "wrap" }}>
          <input
            className="input"
            style={{ minWidth: 240 }}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search student name or code"
          />
          <button className="button secondary" type="submit">
            Search
          </button>
          {(searchInput || searchQuery) && (
            <button className="button secondary" type="button" onClick={handleSearchClear}>
              Clear
            </button>
          )}
        </form>
        <button className="button secondary" onClick={() => load()}>
          Refresh
        </button>
      </div>

      {students.length === 0 ? (
        <div className="card" style={{ color: "var(--color-text-muted)" }}>
          {searchQuery ? "No students matched your search." : "No active students in your center."}
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--color-border)", textAlign: "left" }}>
              <th style={{ padding: 8 }}>Student</th>
              <th style={{ padding: 8 }}>Code</th>
              <th style={{ padding: 8 }}>Practice</th>
              <th style={{ padding: 8 }}>Abacus Practice</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => {
              const hasPractice = Boolean(student.hasPractice);
              const hasAbacus = Boolean(student.hasAbacusPractice);
              const practiceCanEnable = centerFeatures?.PRACTICE?.isEnabled &&
                ((centerFeatures?.PRACTICE?.allocatedSeats || 0) - (centerFeatures?.PRACTICE?.assignedStudents || 0)) > 0;
              const abacusCanEnable = centerFeatures?.ABACUS_PRACTICE?.isEnabled &&
                ((centerFeatures?.ABACUS_PRACTICE?.allocatedSeats || 0) - (centerFeatures?.ABACUS_PRACTICE?.assignedStudents || 0)) > 0;

              return (
                <tr key={student.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: 8 }}>
                    {student.name}
                  </td>
                  <td style={{ padding: 8 }}>{student.admissionNo || "—"}</td>
                  <td style={{ padding: 8 }}>
                    <input
                      type="checkbox"
                      checked={hasPractice}
                      disabled={
                        saving === `${student.id}-PRACTICE` ||
                        (!hasPractice && !practiceCanEnable)
                      }
                      onChange={() => handleToggle(student, "PRACTICE", hasPractice)}
                    />
                    {!hasPractice && !practiceCanEnable && !centerFeatures?.PRACTICE?.isEnabled && (
                      <span style={{ marginLeft: 4, fontSize: 11, color: "var(--color-text-faint)" }}>Not enabled</span>
                    )}
                    {!hasPractice && !practiceCanEnable && centerFeatures?.PRACTICE?.isEnabled && (
                      <span style={{ marginLeft: 4, fontSize: 11, color: "#f59e0b" }}>No seats</span>
                    )}
                  </td>
                  <td style={{ padding: 8 }}>
                    <input
                      type="checkbox"
                      checked={hasAbacus}
                      disabled={
                        saving === `${student.id}-ABACUS_PRACTICE` ||
                        (!hasAbacus && !abacusCanEnable)
                      }
                      onChange={() => handleToggle(student, "ABACUS_PRACTICE", hasAbacus)}
                    />
                    {!hasAbacus && !abacusCanEnable && !centerFeatures?.ABACUS_PRACTICE?.isEnabled && (
                      <span style={{ marginLeft: 4, fontSize: 11, color: "var(--color-text-faint)" }}>Not enabled</span>
                    )}
                    {!hasAbacus && !abacusCanEnable && centerFeatures?.ABACUS_PRACTICE?.isEnabled && (
                      <span style={{ marginLeft: 4, fontSize: 11, color: "#f59e0b" }}>No seats</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <PaginationBar
        limit={limit}
        offset={offset}
        count={students.length}
        total={total}
        onChange={(next) => {
          setLimit(next.limit);
          setOffset(next.offset);
          void load(next);
        }}
      />
    </section>
  );
}

export { CenterPracticeAssignmentsPage };
