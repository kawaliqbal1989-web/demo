import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

import { getCourse } from "../../services/coursesService";
import { listLevels } from "../../services/levelsService";

function SuperadminCourseLevelEnginePage() {
  const navigate = useNavigate();
  const { courseId, levelNumber } = useParams();
  const levelNumberInt = Number(levelNumber);

  const [course, setCourse] = useState(null);
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const level = useMemo(() => {
    return levels.find((l) => Number(l.rank) === levelNumberInt) || null;
  }, [levels, levelNumberInt]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [courseResp, levelsResp] = await Promise.all([getCourse(courseId), listLevels()]);
      setCourse(courseResp?.data || null);
      setLevels(levelsResp?.data || []);
    } catch (e) {
      setError(getFriendlyErrorMessage(e) || "Failed to load course engine.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [courseId, levelNumber]);

  if (loading) {
    return <LoadingState label="Loading course engine..." />;
  }

  if (error) {
    return <ErrorState title="Failed to load" message={error} onRetry={load} />;
  }

  if (!course) {
    return <ErrorState title="Course not found" message="The course could not be loaded." />;
  }

  if (!Number.isInteger(levelNumberInt) || levelNumberInt < 1 || levelNumberInt > 15) {
    return <ErrorState title="Invalid level" message="Level number must be between 1 and 15." />;
  }

  if (!level) {
    return <ErrorState title="Level mapping missing" message="No academic level exists for this level number." />;
  }

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <div>
        <h2 style={{ margin: 0 }}>
          Course Engine: {course.name} · Level {levelNumberInt}
        </h2>
        <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)", fontSize: 13 }}>
          Choose one module to manage this level.
        </p>
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Level Modules</h3>
        <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)", fontSize: 13 }}>
          Question bank and worksheet management now open on separate pages.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            className="button"
            type="button"
            style={{ width: "auto" }}
            onClick={() => navigate(`/superadmin/courses/${courseId}/levels/${levelNumber}/question-bank`)}
          >
            Question Bank
          </button>
          <button
            className="button"
            type="button"
            style={{ width: "auto" }}
            onClick={() => navigate(`/superadmin/courses/${courseId}/levels/${levelNumber}/worksheets`)}
          >
            Worksheets
          </button>
          <button
            className="button secondary"
            type="button"
            style={{ width: "auto" }}
            onClick={() => navigate(`/superadmin/courses/${courseId}/levels`)}
          >
            Back to Levels
          </button>
        </div>
      </div>
    </section>
  );
}

export { SuperadminCourseLevelEnginePage };
