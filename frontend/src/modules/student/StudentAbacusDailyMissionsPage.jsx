import {
  useCallback,
  useEffect,
  useState
} from "react";
import { Link } from "react-router-dom";
import {
  getDailyMission
} from "../../services/studentCoachService";
import {
  DailyMission
} from "../../components/StudentCoach";

function StudentAbacusDailyMissionsPage() {
  const [missions, setMissions] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const loadMissions = useCallback(
    async () => {
      setLoading(true);
      setError("");

      try {
        const response =
          await getDailyMission();

        const payload =
          response?.data?.data;

        setMissions(
          Array.isArray(payload)
            ? payload
            : []
        );
      } catch (requestError) {
        setError(
          requestError?.response?.data
            ?.message ||
            "Failed to load daily missions."
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadMissions();
  }, [loadMissions]);

  const completedCount =
    missions.filter(
      (mission) =>
        Boolean(mission?.completed)
    ).length;


  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>Daily Missions</h1>

          <div className="muted">
            Your existing student
            missions, goals and learning
            actions for today.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8
          }}
        >
          <button
            className="button secondary"
            type="button"
            onClick={loadMissions}
            disabled={loading}
            style={{ width: "auto" }}
          >
            {loading
              ? "Refreshing..."
              : "Refresh"}
          </button>

          <Link
            className="button secondary"
            to="/student/virtual-abacus/arena"
            style={{ width: "auto" }}
          >
            Back to Arena
          </Link>
        </div>
      </div>

      {!loading &&
      !error &&
      missions.length > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
            marginBottom: 16
          }}
        >
          <div className="card">
            <div className="muted">
              Today's missions
            </div>

            <h2>
              {missions.length}
            </h2>
          </div>

          <div className="card">
            <div className="muted">
              Completed
            </div>

            <h2>
              {completedCount}/
              {missions.length}
            </h2>
          </div>

        </div>
      ) : null}

      {error ? (
        <div className="card">
          <strong>
            Daily missions unavailable
          </strong>

          <div
            className="muted"
            style={{ marginTop: 6 }}
          >
            {error}
          </div>

          <button
            className="button secondary"
            type="button"
            onClick={loadMissions}
            style={{
              width: "auto",
              marginTop: 12
            }}
          >
            Try Again
          </button>
        </div>
      ) : (
        <DailyMission
          missions={missions}
          loading={loading}
        />
      )}
    </div>
  );
}

export {
  StudentAbacusDailyMissionsPage
};
