import { useEffect, useState } from "react";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { listCatalogCourseLevels, listCatalogCourses } from "../../services/catalogService";
import { listWorksheets } from "../../services/worksheetsService";

function FranchiseWorksheetsPage() {
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);

  const [levelsLoading, setLevelsLoading] = useState(false);
  const [levels, setLevels] = useState([]);
  const [selectedLevel, setSelectedLevel] = useState(null);

  const [worksheetsLoading, setWorksheetsLoading] = useState(false);
  const [worksheets, setWorksheets] = useState([]);

  const [error, setError] = useState("");

  const loadCourses = async () => {
    setCoursesLoading(true);
    setError("");
    try {
      const resp = await listCatalogCourses({ limit: 100, offset: 0, status: "ACTIVE" });
      setCourses(resp?.data?.items || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load courses.");
      setCourses([]);
    } finally {
      setCoursesLoading(false);
    }
  };

  const loadLevels = async (course) => {
    if (!course?.id) return;
    setLevelsLoading(true);
    setError("");
    try {
      const resp = await listCatalogCourseLevels({ courseId: course.id, limit: 100, offset: 0, status: "ACTIVE" });
      setLevels(resp?.data?.items || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load levels.");
      setLevels([]);
    } finally {
      setLevelsLoading(false);
    }
  };

  const loadWorksheets = async (levelRow) => {
    const levelId = levelRow?.level?.id;
    if (!levelId) {
      setWorksheets([]);
      return;
    }
    setWorksheetsLoading(true);
    setError("");
    try {
      const resp = await listWorksheets({ levelId, limit: 100, offset: 0 });
      setWorksheets(resp?.data || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load worksheets.");
      setWorksheets([]);
    } finally {
      setWorksheetsLoading(false);
    }
  };

  useEffect(() => {
    void loadCourses();
  }, []);

  if (coursesLoading) {
    return <LoadingState label="Loading course catalog..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0 }}>Course Catalog</h2>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Browse course structures (read-only).</div>
      </div>

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      <div>
        <h3 style={{ margin: 0 }}>Courses</h3>
      </div>
      <DataTable
        columns={[
          { key: "code", header: "Code", render: (r) => r.code },
          { key: "name", header: "Name", render: (r) => r.name },
          { key: "status", header: "Status", render: (r) => r.status || (r.isActive ? "ACTIVE" : "ARCHIVED") },
          {
            key: "actions",
            header: "Actions",
            render: (r) => (
              <button
                className={selectedCourse?.id === r.id ? "button" : "button secondary"}
                style={{ width: "auto" }}
                onClick={() => {
                  setSelectedCourse(r);
                  setSelectedLevel(null);
                  setWorksheets([]);
                  void loadLevels(r);
                }}
              >
                Levels
              </button>
            )
          }
        ]}
        rows={courses}
        keyField="id"
      />

      {selectedCourse ? (
        <>
          <div style={{ marginTop: 4 }}>
            <h3 style={{ margin: 0 }}>Levels for {selectedCourse.code} - {selectedCourse.name}</h3>
          </div>
          {levelsLoading ? (
            <LoadingState label="Loading levels..." />
          ) : (
            <DataTable
              columns={[
                { key: "levelNumber", header: "Level", render: (r) => r.levelNumber },
                { key: "title", header: "Title", render: (r) => r.level?.name || r.title },
                { key: "status", header: "Status", render: (r) => r.status || (r.isActive ? "ACTIVE" : "ARCHIVED") },
                {
                  key: "actions",
                  header: "Actions",
                  render: (r) => (
                    <button
                      className={selectedLevel?.id === r.id ? "button" : "button secondary"}
                      style={{ width: "auto" }}
                      onClick={() => {
                        setSelectedLevel(r);
                        void loadWorksheets(r);
                      }}
                      disabled={!r.level?.id}
                      title={!r.level?.id ? "No matching Level record for this course level." : ""}
                    >
                      Worksheets
                    </button>
                  )
                }
              ]}
              rows={levels}
              keyField="id"
            />
          )}
        </>
      ) : null}

      {selectedCourse && selectedLevel ? (
        <>
          <div style={{ marginTop: 4 }}>
            <h3 style={{ margin: 0 }}>
              Worksheets for Level {selectedLevel.levelNumber} - {selectedLevel.level?.name || selectedLevel.title}
            </h3>
          </div>

          {worksheetsLoading ? (
            <LoadingState label="Loading worksheets..." />
          ) : (
            <>
              <DataTable
                columns={[
                  { key: "number", header: "Number", render: (r) => r.number },
                  { key: "title", header: "Title", render: (r) => r.title },
                  { key: "status", header: "Status", render: (r) => (r.isPublished ? "PUBLISHED" : "DRAFT") },
                  { key: "actions", header: "Actions", render: () => "-" }
                ]}
                rows={worksheets.map((w, i) => ({ ...w, number: i + 1 }))}
                keyField="id"
              />
              {!worksheets.length ? (
                <div className="card" style={{ color: "var(--color-text-muted)" }}>
                  No worksheets available.
                </div>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </section>
  );
}

export { FranchiseWorksheetsPage };
