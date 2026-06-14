import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { listCatalogCourseLevels, listCatalogCourses } from "../../services/catalogService";
import { getWorksheet, listWorksheets } from "../../services/worksheetsService";
import { WorksheetPreviewModal } from "./components/WorksheetPreviewModal";

function extractItems(resp) {
  if (!resp) return [];
  if (Array.isArray(resp)) return resp;
  if (Array.isArray(resp?.data?.items)) return resp.data.items;
  if (Array.isArray(resp?.data)) return resp.data;
  if (Array.isArray(resp?.items)) return resp.items;
  return [];
}

function TeacherWorksheetsPage() {
  const navigate = useNavigate();
  const [pageLoading, setPageLoading] = useState(true);

  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);

  const [levelsLoading, setLevelsLoading] = useState(false);
  const [levels, setLevels] = useState([]);
  const [selectedLevel, setSelectedLevel] = useState(null);

  const [worksheetsLoading, setWorksheetsLoading] = useState(false);
  const [worksheets, setWorksheets] = useState([]);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewWorksheet, setPreviewWorksheet] = useState(null);

  const openWorksheetPreview = async (worksheet) => {
    const nextWorksheetId = String(worksheet?.id || "").trim();
    if (!nextWorksheetId) return;

    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError("");
    setPreviewWorksheet(null);

    try {
      const response = await getWorksheet(nextWorksheetId);
      const payload = response?.data || response;
      setPreviewWorksheet({
        ...payload,
        __courseLabel: selectedCourse ? `${selectedCourse.code} - ${selectedCourse.name}` : "N/A",
        __levelLabel: selectedLevel?.level?.name || selectedLevel?.title || payload?.level?.name || "N/A",
        __statusLabel: payload?.isPublished ? "PUBLISHED" : "DRAFT"
      });
    } catch (err) {
      setPreviewError(getFriendlyErrorMessage(err) || "Failed to load worksheet preview.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const openBatchAssignment = (worksheet) => {
    const nextWorksheetId = String(worksheet?.id || "").trim();
    const params = new URLSearchParams();
    if (nextWorksheetId) {
      params.set("worksheetId", nextWorksheetId);
    }
    const suffix = params.toString();
    navigate(`/teacher/batches${suffix ? `?${suffix}` : ""}`);
  };

  const loadPage = async () => {
    setPageLoading(true);
    setError("");
    try {
      const courseResp = await listCatalogCourses({ limit: 100, offset: 0, status: "ACTIVE" });
      const courseItems = extractItems(courseResp);
      setCourses(courseItems);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load worksheets workspace.");
      setCourses([]);
    } finally {
      setPageLoading(false);
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
    void loadPage();
  }, []);

  if (pageLoading) {
    return <LoadingState label="Loading worksheets..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0 }}>Worksheets</h2>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Discover worksheets, preview content, and assign from the batch workspace.</div>
      </div>

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      {success ? (
        <div className="card" style={{ color: "var(--color-text-success)" }}>
          {success}
        </div>
      ) : null}

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div>
          <h3 style={{ margin: 0 }}>Assign in Batch Workspace</h3>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Assignment controls are centralized in My Batches to keep policy checks and workflows in one place.
          </div>
        </div>
        <button className="button" style={{ width: "fit-content" }} onClick={() => openBatchAssignment(null)}>
          Open Batch Assignment
        </button>
      </div>

      <div>
        <h3 style={{ margin: 0 }}>Catalog Courses</h3>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Read-only worksheet explorer by course and level.</div>
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
                  { key: "questionCount", header: "Questions", render: (r) => r.questionCount ?? 0 },
                  { key: "status", header: "Status", render: (r) => (r.isPublished ? "PUBLISHED" : "DRAFT") },
                  {
                    key: "actions",
                    header: "Actions",
                    render: (r) => (
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                        <button
                          className="button secondary"
                          style={{ width: "auto" }}
                          onClick={() => void openWorksheetPreview(r)}
                          title="Preview worksheet details"
                        >
                          👁 Preview
                        </button>
                        <button
                          className="button"
                          style={{ width: "auto" }}
                          onClick={() => openBatchAssignment(r)}
                          title="Open My Batches with this worksheet preselected"
                        >
                          Open Batch Assignment
                        </button>
                      </div>
                    )
                  }
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

      <WorksheetPreviewModal
        open={previewOpen}
        loading={previewLoading}
        error={previewError}
        worksheet={previewWorksheet}
        onClose={() => setPreviewOpen(false)}
      />
    </section>
  );
}

export { TeacherWorksheetsPage };
