import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getDailyMission } from "../../services/studentCoachService";
import { createStudentPracticeWorksheet, getStudentMe } from "../../services/studentPortalService";
import {
  getStudentDashboardAchievements,
  getStudentDashboardPracticeTrends,
  getStudentDashboardStreaks
} from "../../services/studentDashboardService";

const TRAINING = [
  [
    "Flash Cards",
    "🎴",
    "Manual and automatic visual abacus cards.",
    "Visual memory",
    "2–5 min",
    "/student/virtual-abacus/arena/flash-cards",
    "violet",
    false
  ],
  [
    "Display Dictation",
    "👁️",
    "Watch numbers one by one, calculate, then answer.",
    "Visual calculation",
    "3–7 min",
    "/student/virtual-abacus/arena/flash-anzan",
    "amber",
    false
  ],
  [
    "Audio Dictation",
    "🔊",
    "Listen with your preferred available voice and calculate.",
    "Listening",
    "3–7 min",
    "/student/virtual-abacus/arena/audio-anzan",
    "blue",
    false
  ],
  [
    "Smart Coach",
    "🤖",
    "Guided solving, Mistake Replay, corrective practice and focused improvement.",
    "Coach & improve",
    "Recommended",
    "/student/virtual-abacus/arena/smart-coach",
    "purple",
    true
  ]
].map(([title, icon, description, skill, duration, path, tone, featured]) => ({
  title,
  icon,
  description,
  skill,
  duration,
  path,
  tone,
  featured
}));

function unwrapNestedData(response) {
  let value = response?.data ?? response ?? null;

  if (value && typeof value === "object" && !Array.isArray(value) && "data" in value) {
    value = value.data;
  }

  if (value && typeof value === "object" && !Array.isArray(value) && "data" in value) {
    value = value.data;
  }

  return value;
}

function ProgressMeter({ value, target }) {
  const safeTarget = Math.max(1, Number(target) || 1);
  const safeValue = Math.max(0, Number(value) || 0);
  const percent = Math.min(100, Math.round((safeValue / safeTarget) * 100));

  return (
    <div className="arena-lobby__meter" aria-hidden="true">
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}

function StudentAbacusArenaLobby() {
  const navigate = useNavigate();
  const [missions, setMissions] = useState([]);
  const [streaks, setStreaks] = useState({});
  const [achievements, setAchievements] = useState({
    items: [],
    newlyEarned: [],
    summary: {}
  });
  const [practiceTrends, setPracticeTrends] = useState({
    items: [],
    summary: {}
  });
  const [studentProfile, setStudentProfile] = useState(null);
  const [startingMastery, setStartingMastery] = useState(false);
  const [masteryError, setMasteryError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pulseReloadKey, setPulseReloadKey] = useState(0);
  const [pulseErrors, setPulseErrors] = useState({
    missions: false,
    streaks: false,
    achievements: false,
    practiceTrends: false,
    studentProfile: false
  });

  useEffect(() => {
    let cancelled = false;

    async function loadArenaPulse() {
      setLoading(true);

      const results = await Promise.allSettled([
        getDailyMission(),
        getStudentDashboardStreaks(),
        getStudentDashboardAchievements(),
        getStudentDashboardPracticeTrends(),
        getStudentMe()
      ]);

      if (cancelled) return;

      const nextErrors = {
        missions: results[0].status === "rejected",
        streaks: results[1].status === "rejected",
        achievements: results[2].status === "rejected",
        practiceTrends: results[3].status === "rejected",
        studentProfile: results[4].status === "rejected"
      };

      setPulseErrors(nextErrors);

      if (results[0].status === "fulfilled") {
        const missionPayload = unwrapNestedData(results[0].value);
        setMissions(
          Array.isArray(missionPayload)
            ? missionPayload
            : Array.isArray(missionPayload?.missions)
              ? missionPayload.missions
              : []
        );
      }

      if (results[1].status === "fulfilled") {
        const streakPayload = unwrapNestedData(results[1].value);
        setStreaks(
          streakPayload && typeof streakPayload === "object"
            ? streakPayload
            : {}
        );
      }

      if (results[2].status === "fulfilled") {
        const achievementPayload = unwrapNestedData(results[2].value);
        setAchievements(
          achievementPayload && typeof achievementPayload === "object"
            ? achievementPayload
            : { items: [], newlyEarned: [], summary: {} }
        );
      }

      if (results[3].status === "fulfilled") {
        const practiceTrendPayload = unwrapNestedData(results[3].value);
        setPracticeTrends(
          practiceTrendPayload && typeof practiceTrendPayload === "object"
            ? practiceTrendPayload
            : { items: [], summary: {} }
        );
      }

      if (results[4].status === "fulfilled") {
        const studentProfilePayload = unwrapNestedData(results[4].value);
        setStudentProfile(
          studentProfilePayload && typeof studentProfilePayload === "object"
            ? studentProfilePayload
            : null
        );
      }

      setLoading(false);
    }

    loadArenaPulse();

    return () => {
      cancelled = true;
    };
  }, [pulseReloadKey]);

  const retryArenaPulse = () => {
    setPulseReloadKey((current) => current + 1);
  };

  const missionSummary = useMemo(() => {
    const completed = missions.filter((item) => item?.completed).length;
    const openMission =
      missions.find((item) => item?.type === "PRIMARY" && !item?.completed) ||
      missions.find((item) => !item?.completed) ||
      missions[0] ||
      null;

    return {
      completed,
      total: missions.length,
      openMission
    };
  }, [missions]);

  const practice = streaks?.practice || {};
  const attendance = streaks?.attendance || {};
  const hasPulseErrors = Object.values(pulseErrors).some(Boolean);
  const failedPulseLabels = [
    pulseErrors.missions ? "daily missions" : null,
    pulseErrors.streaks ? "streaks" : null,
    pulseErrors.achievements ? "achievements" : null,
    pulseErrors.practiceTrends ? "practice progress" : null,
    pulseErrors.studentProfile ? "student progress" : null
  ].filter(Boolean);
  const achievementItems = Array.isArray(achievements?.items)
    ? achievements.items.slice(0, 4)
    : [];
  const achievementTotal =
    achievements?.summary?.total ?? achievementItems.length ?? 0;
  const practiceSummary = practiceTrends?.summary || {};
  const averagePracticeScore = Number.isFinite(Number(practiceSummary.averageScore))
    ? Math.round(Number(practiceSummary.averageScore))
    : null;

  const completedLevels = Array.isArray(studentProfile?.completedLevels)
    ? studentProfile.completedLevels
    : [];
  const progressionHistory = Array.isArray(studentProfile?.progressionHistory)
    ? studentProfile.progressionHistory
    : [];
  const latestProgression = progressionHistory.length
    ? progressionHistory[progressionHistory.length - 1]
    : null;
  const currentLevelLabel =
    studentProfile?.levelTitle ||
    (Number.isFinite(Number(studentProfile?.levelRank))
      ? `Level ${studentProfile.levelRank}`
      : "Current level");

  const arenaXp =
    studentProfile?.arenaXp &&
    typeof studentProfile.arenaXp === "object"
      ? studentProfile.arenaXp
      : null;
  const arenaTotalXp = Math.max(0, Number(arenaXp?.totalXp) || 0);
  const arenaLevel = Math.max(1, Number(arenaXp?.arenaLevel) || 1);
  const arenaXpIntoLevel = Math.max(0, Number(arenaXp?.xpIntoLevel) || 0);
  const arenaXpPerLevel = Math.max(1, Number(arenaXp?.xpPerLevel) || 100);
  const arenaXpToNextLevel = Math.max(
    0,
    Number(arenaXp?.xpToNextLevel) || arenaXpPerLevel
  );

  const primaryAction = missionSummary.openMission?.actionUrl
    ? {
        path: missionSummary.openMission.actionUrl,
        label: missionSummary.openMission.actionLabel || "Continue Mission"
      }
    : {
        path: "/student/virtual-abacus/arena/daily-missions",
        label: "Open Today's Mission"
      };

  async function startMasteryChallenge() {
    if (startingMastery) {
      return;
    }

    setMasteryError(null);
    setStartingMastery(true);

    try {
      const response = await createStudentPracticeWorksheet({
        masteryChallenge: true
      });
      const worksheetId = response?.data?.data?.worksheetId;

      if (!worksheetId) {
        throw new Error("Mastery challenge created but worksheetId is missing");
      }

      navigate(`/student/worksheets/${worksheetId}`);
    } catch (error) {
      setMasteryError(
        error?.response?.data?.message ||
        error?.message ||
        "Unable to start Mastery Challenge."
      );
    } finally {
      setStartingMastery(false);
    }
  }

  return (
    <div className="container arena-lobby">
      <style>{`
        .arena-lobby {
          --arena-ink: #182033;
          --arena-soft: #667085;
          --arena-line: #e6e9f2;
          --arena-panel: #ffffff;
          --arena-soft-panel: #f8f9fd;
          padding-bottom: 42px;
        }
        .arena-lobby * { box-sizing: border-box; }
        .arena-lobby__topbar {
          display: flex; justify-content: space-between; align-items: center;
          gap: 16px; margin-bottom: 16px;
        }
        .arena-lobby__back { width: auto; white-space: nowrap; }
        .arena-lobby__pulse-warning {
          display: flex; align-items: center; justify-content: space-between;
          gap: 14px; margin: 0 0 16px; padding: 12px 14px;
          border-radius: 14px; border: 1px solid #f0c36a;
          background: #fff8e7; color: #7a4b00;
        }
        .arena-lobby__pulse-warning span {
          font-size: 13px; line-height: 1.45; font-weight: 700;
        }
        .arena-lobby__pulse-retry {
          width: auto; min-height: 36px; flex: 0 0 auto;
        }

        .arena-lobby__hero {
          position: relative; overflow: hidden; border-radius: 28px;
          padding: clamp(24px, 4vw, 44px); color: #fff; margin-bottom: 22px;
          background:
            radial-gradient(circle at 90% 10%, rgba(255,255,255,.22), transparent 25%),
            radial-gradient(circle at 72% 90%, rgba(255,193,7,.28), transparent 30%),
            linear-gradient(135deg, #4f46e5 0%, #7c3aed 48%, #db2777 100%);
          box-shadow: 0 22px 50px rgba(79,70,229,.24);
        }
        .arena-lobby__hero::after {
          content: ""; position: absolute; right: -70px; bottom: -110px;
          width: 280px; height: 280px; border-radius: 50%;
          border: 34px solid rgba(255,255,255,.09); pointer-events: none;
        }
        .arena-lobby__hero-grid {
          position: relative; z-index: 1; display: grid;
          grid-template-columns: minmax(0, 1.4fr) minmax(250px, .75fr);
          gap: 28px; align-items: end;
        }
        .arena-lobby__eyebrow {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 7px 11px; border-radius: 999px; margin-bottom: 14px;
          background: rgba(255,255,255,.16); border: 1px solid rgba(255,255,255,.24);
          font-size: 12px; font-weight: 900; letter-spacing: .08em;
        }
        .arena-lobby__hero h1 {
          margin: 0; max-width: 760px; color: #fff;
          font-size: clamp(32px, 5vw, 58px); line-height: 1.02; letter-spacing: -.035em;
        }
        .arena-lobby__hero-copy {
          max-width: 680px; margin: 14px 0 0; color: rgba(255,255,255,.86);
          font-size: 16px; line-height: 1.65;
        }
        .arena-lobby__hero-actions {
          display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px;
        }
        .arena-lobby__hero-action {
          min-height: 46px; display: inline-flex; align-items: center; justify-content: center;
          gap: 8px; padding: 0 17px; border-radius: 14px; text-decoration: none;
          font-weight: 900; border: 1px solid rgba(255,255,255,.24);
        }
        .arena-lobby__hero-action--primary { background: #fff; color: #4f46e5; }
        .arena-lobby__hero-action--secondary { background: rgba(255,255,255,.13); color: #fff; }

        .arena-lobby__hero-stats { display: grid; gap: 10px; }
        .arena-lobby__hero-stat {
          min-height: 68px; display: flex; align-items: center; justify-content: space-between;
          gap: 16px; padding: 13px 15px; border-radius: 18px;
          background: rgba(17,24,39,.18); border: 1px solid rgba(255,255,255,.19);
          backdrop-filter: blur(8px);
        }
        .arena-lobby__hero-stat span {
          color: rgba(255,255,255,.72); font-size: 12px; font-weight: 800;
        }
        .arena-lobby__hero-stat strong { color: #fff; font-size: 22px; }

        .arena-lobby__nav {
          position: sticky;
          top: 66px;
          z-index: 20;
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding: 9px;
          margin: 0 0 18px;
          border: 1px solid var(--arena-line);
          border-radius: 17px;
          background: rgba(255,255,255,.92);
          box-shadow: 0 10px 30px rgba(17,24,39,.07);
          backdrop-filter: blur(12px);
          scrollbar-width: none;
        }
        .arena-lobby__nav::-webkit-scrollbar { display: none; }
        .arena-lobby__nav a {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          min-height: 34px;
          padding: 0 12px;
          border-radius: 11px;
          color: var(--arena-ink);
          text-decoration: none;
          font-size: 12px;
          font-weight: 900;
        }
        .arena-lobby__nav a:hover {
          background: #f0efff;
          color: #4f46e5;
        }

        .arena-lobby__section {
          margin-top: 24px;
          scroll-margin-top: 125px;
        }
        .arena-lobby__section-head {
          display: flex; justify-content: space-between; align-items: end;
          gap: 14px; margin-bottom: 12px;
        }
        .arena-lobby__section-head h2 { margin: 0; color: var(--arena-ink); font-size: 22px; }
        .arena-lobby__section-head p { margin: 4px 0 0; color: var(--arena-soft); font-size: 13px; }
        .arena-lobby__text-link {
          color: #4f46e5; font-weight: 900; text-decoration: none; white-space: nowrap;
        }

        .arena-lobby__mission {
          display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 18px;
          align-items: center; padding: 20px; border-radius: 22px;
          border: 1px solid #dddffd;
          background: linear-gradient(110deg, rgba(99,102,241,.10), rgba(236,72,153,.07)), var(--arena-panel);
        }
        .arena-lobby__mission-main { display: flex; gap: 14px; align-items: flex-start; min-width: 0; }
        .arena-lobby__mission-icon {
          width: 52px; height: 52px; display: grid; place-items: center;
          flex: 0 0 auto; border-radius: 17px; background: #fff;
          box-shadow: 0 8px 25px rgba(79,70,229,.12); font-size: 25px;
        }
        .arena-lobby__mission-title { margin: 0 0 5px; color: var(--arena-ink); font-size: 18px; }
        .arena-lobby__mission-copy { margin: 0; color: var(--arena-soft); line-height: 1.55; }
        .arena-lobby__mission-progress {
          margin-top: 8px; color: #6558d7; font-size: 12px; font-weight: 900;
        }
        .arena-lobby__mission-button {
          min-height: 42px; display: inline-flex; align-items: center; justify-content: center;
          padding: 0 15px; border-radius: 13px; background: #4f46e5; color: #fff;
          text-decoration: none; font-weight: 900; white-space: nowrap;
        }

        .arena-lobby__quick-grid {
          display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px;
        }
        .arena-lobby__activity {
          min-height: 180px; display: flex; flex-direction: column; padding: 17px;
          border-radius: 22px; border: 1px solid var(--arena-line);
          text-decoration: none; color: var(--arena-ink); background: var(--arena-panel);
          box-shadow: 0 9px 26px rgba(17,24,39,.055);
          transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease;
        }
        .arena-lobby__activity:hover {
          transform: translateY(-4px); border-color: #cfd3ff;
          box-shadow: 0 16px 34px rgba(17,24,39,.10);
        }
        .arena-lobby__activity-icon {
          width: 48px; height: 48px; display: grid; place-items: center;
          border-radius: 16px; margin-bottom: 20px; font-size: 24px;
        }
        .arena-lobby__activity--violet .arena-lobby__activity-icon { background: #eeeafe; }
        .arena-lobby__activity--amber .arena-lobby__activity-icon { background: #fff4cf; }
        .arena-lobby__activity--blue .arena-lobby__activity-icon { background: #e5f3ff; }
        .arena-lobby__activity--rose .arena-lobby__activity-icon { background: #ffe8ef; }
        .arena-lobby__activity--green .arena-lobby__activity-icon { background: #e5f8ed; }
        .arena-lobby__activity strong { font-size: 16px; }
        .arena-lobby__activity p {
          margin: 6px 0 12px; color: var(--arena-soft); line-height: 1.45; font-size: 13px;
        }
        .arena-lobby__activity-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 15px;
        }
        .arena-lobby__activity-meta span {
          display: inline-flex;
          padding: 5px 8px;
          border-radius: 999px;
          background: var(--arena-soft-panel);
          border: 1px solid var(--arena-line);
          color: var(--arena-soft);
          font-size: 10px;
          font-weight: 800;
        }
        .arena-lobby__play-label {
          margin-top: auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 34px;
          border-radius: 11px;
          background: #f1f0ff;
          color: #4f46e5;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: .04em;
        }

        .arena-lobby__two-column {
          display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(280px, .7fr); gap: 16px;
        }
        .arena-lobby__panel {
          overflow: hidden; border-radius: 22px; border: 1px solid var(--arena-line);
          background: var(--arena-panel); box-shadow: 0 9px 26px rgba(17,24,39,.05);
        }
        .arena-lobby__panel-head { padding: 18px 18px 0; }
        .arena-lobby__panel-head h3 { margin: 0; color: var(--arena-ink); font-size: 18px; }
        .arena-lobby__panel-head p { margin: 5px 0 0; color: var(--arena-soft); font-size: 13px; }

        .arena-lobby__improve-grid {
          display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px; padding: 16px 18px 18px;
        }
        .arena-lobby__improve {
          display: flex; gap: 11px; align-items: center; padding: 13px;
          border-radius: 16px; background: var(--arena-soft-panel);
          border: 1px solid #eceef7; text-decoration: none; color: var(--arena-ink);
        }
        .arena-lobby__improve:hover {
          transform: translateY(-2px);
          border-color: #cfd3ff;
          box-shadow: 0 10px 24px rgba(17,24,39,.07);
        }
        .arena-lobby__improve--purple { background: linear-gradient(135deg, #f4f1ff, #fbfaff); }
        .arena-lobby__improve--blue { background: linear-gradient(135deg, #eef7ff, #fbfdff); }
        .arena-lobby__improve--rose { background: linear-gradient(135deg, #fff0f5, #fffafb); }
        .arena-lobby__improve--green { background: linear-gradient(135deg, #edf9f1, #fbfffc); }
        .arena-lobby__improve-icon {
          width: 40px; height: 40px; display: grid; place-items: center;
          flex: 0 0 auto; border-radius: 13px; background: #fff; font-size: 20px;
        }
        .arena-lobby__improve strong { display: block; font-size: 14px; }
        .arena-lobby__improve small {
          display: block; margin-top: 2px; color: var(--arena-soft); line-height: 1.35;
        }
        .arena-lobby__improve-action {
          display: inline-block;
          margin-top: 7px;
          color: #4f46e5;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: .03em;
          text-transform: uppercase;
        }

        .arena-lobby__progress-wrap { padding: 16px 18px 18px; display: grid; gap: 11px; }
        .arena-lobby__progress-card {
          padding: 13px; border-radius: 16px; background: var(--arena-soft-panel);
          border: 1px solid #eceef7;
        }
        .arena-lobby__progress-top {
          display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--arena-ink);
        }
        .arena-lobby__progress-top span { font-size: 13px; font-weight: 900; }
        .arena-lobby__progress-top strong { font-size: 17px; }
        .arena-lobby__meter {
          height: 8px; margin-top: 9px; overflow: hidden; border-radius: 999px; background: #e8eaf2;
        }
        .arena-lobby__meter span {
          display: block; height: 100%; border-radius: inherit;
          background: linear-gradient(90deg, #7c3aed, #ec4899);
        }
        .arena-lobby__progress-detail {
          margin-top: 7px; color: var(--arena-soft); font-size: 11px; line-height: 1.4;
        }
        .arena-lobby__progress-pulse {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .arena-lobby__pulse-card {
          padding: 11px;
          border-radius: 14px;
          background: #171f33;
          color: #fff;
        }
        .arena-lobby__pulse-card span {
          display: block;
          color: rgba(255,255,255,.65);
          font-size: 10px;
          font-weight: 800;
        }
        .arena-lobby__pulse-card strong {
          display: block;
          margin-top: 4px;
          color: #fff;
          font-size: 18px;
        }
        .arena-lobby__badge-row { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 9px; }
        .arena-lobby__badge {
          width: 34px; height: 34px; display: grid; place-items: center;
          border-radius: 11px; background: #fff; border: 1px solid #e8eaf2; font-size: 18px;
        }

        .arena-lobby__challenge-grid {
          display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px;
        }
        .arena-lobby__challenge {
          min-height: 148px; padding: 16px; border-radius: 20px;
          border: 1px dashed #d5d8e7; background: linear-gradient(145deg, #fbfbfe, #f4f5fa);
        }
        .arena-lobby__challenge-icon { font-size: 25px; }
        .arena-lobby__challenge strong { display: block; margin-top: 10px; color: var(--arena-ink); }
        .arena-lobby__challenge p {
          margin: 5px 0 0; color: var(--arena-soft); font-size: 12px; line-height: 1.45;
        }
        .arena-lobby__status {
          display: inline-flex; margin-top: 11px; padding: 5px 8px; border-radius: 999px;
          background: #eaecf4; color: #667085; font-size: 10px; font-weight: 900;
          letter-spacing: .04em; text-transform: uppercase;
        }

        .arena-lobby__leaderboard {
          display: flex; justify-content: space-between; align-items: center; gap: 14px;
          margin-top: 12px; padding: 16px 18px; border-radius: 20px;
          background: linear-gradient(120deg, #171f33, #273255); color: #fff;
        }
        .arena-lobby__leaderboard strong { color: #fff; }
        .arena-lobby__leaderboard p {
          margin: 3px 0 0; color: rgba(255,255,255,.70); font-size: 12px;
        }
        .arena-lobby__leaderboard-link {
          min-height: 38px; display: inline-flex; align-items: center;
          padding: 0 13px; border-radius: 12px; background: #fff; color: #273255;
          text-decoration: none; font-weight: 900; white-space: nowrap;
        }

        html[data-theme="dark"] .arena-lobby {
          --arena-ink: #f3f4f6; --arena-soft: #aab2c3;
          --arena-line: #30384a; --arena-panel: #151b29; --arena-soft-panel: #1c2434;
        }
        html[data-theme="dark"] .arena-lobby__nav {
          background: rgba(21,27,41,.92);
        }
        html[data-theme="dark"] .arena-lobby__pulse-warning {
          background: #2b2416; border-color: #6b572c; color: #f5d78e;
        }
        html[data-theme="dark"] .arena-lobby__nav a:hover {
          background: #252d42;
        }
        html[data-theme="dark"] .arena-lobby__mission-icon,
        html[data-theme="dark"] .arena-lobby__improve-icon,
        html[data-theme="dark"] .arena-lobby__badge { background: #232c3e; }
        html[data-theme="dark"] .arena-lobby__improve,
        html[data-theme="dark"] .arena-lobby__progress-card { border-color: #30384a; }
        html[data-theme="dark"] .arena-lobby__challenge {
          background: linear-gradient(145deg, #151b29, #1a2232); border-color: #3b455a;
        }
        html[data-theme="dark"] .arena-lobby__meter { background: #30384a; }

        @media (max-width: 1050px) {
          .arena-lobby__quick-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .arena-lobby__challenge-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 820px) {
          .arena-lobby__hero-grid, .arena-lobby__two-column { grid-template-columns: 1fr; }
          .arena-lobby__hero-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .arena-lobby__hero-stat { display: block; }
          .arena-lobby__hero-stat strong { display: block; margin-top: 4px; }
        }
        @media (max-width: 680px) {
          .arena-lobby__topbar { align-items: flex-start; flex-direction: column; }
          .arena-lobby__pulse-warning { align-items: flex-start; flex-direction: column; }
          .arena-lobby__pulse-retry { width: 100%; }
          .arena-lobby__hero { border-radius: 22px; }
          .arena-lobby__hero-stats, .arena-lobby__quick-grid,
          .arena-lobby__challenge-grid, .arena-lobby__improve-grid {
            grid-template-columns: 1fr 1fr;
          }
          .arena-lobby__mission { grid-template-columns: 1fr; }
          .arena-lobby__mission-button { width: 100%; }
          .arena-lobby__leaderboard { align-items: flex-start; flex-direction: column; }
        }
        @media (max-width: 460px) {
          .arena-lobby__hero-stats, .arena-lobby__quick-grid,
          .arena-lobby__challenge-grid, .arena-lobby__improve-grid {
            grid-template-columns: 1fr;
          }
          .arena-lobby__activity { min-height: 150px; }
          .arena-lobby__hero-actions { flex-direction: column; }
          .arena-lobby__hero-action { width: 100%; }
        }

        /* Focused Arena V2: four real training choices + compact progress. */
        .arena-lobby__quick-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }
        .arena-lobby__activity {
          min-height: 218px;
          padding: 20px;
        }
        .arena-lobby__activity-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .arena-lobby__activity--purple .arena-lobby__activity-icon {
          background: #f0eaff;
        }
        .arena-lobby__activity.is-featured {
          border-color: #c9b9ff;
          background:
            linear-gradient(145deg, rgba(124,58,237,.10), rgba(236,72,153,.05)),
            var(--arena-panel);
          box-shadow: 0 16px 36px rgba(124,58,237,.12);
        }
        .arena-lobby__featured-badge {
          display: inline-flex;
          align-items: center;
          min-height: 26px;
          padding: 0 9px;
          border-radius: 999px;
          background: #ede9fe;
          color: #6d28d9;
          font-size: 9px;
          font-weight: 950;
          letter-spacing: .07em;
        }
        .arena-lobby__coach-features {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px 10px;
          margin: 0 0 14px;
          color: #5b4ab4;
          font-size: 11px;
          font-weight: 800;
        }
        .arena-lobby__compact-progress {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }
        .arena-lobby__mini-stat {
          min-height: 126px;
          padding: 16px;
          border-radius: 20px;
          border: 1px solid var(--arena-line);
          background: var(--arena-panel);
          box-shadow: 0 8px 22px rgba(17,24,39,.045);
        }
        .arena-lobby__mini-stat > span {
          display: block;
          color: var(--arena-soft);
          font-size: 11px;
          font-weight: 900;
        }
        .arena-lobby__mini-stat > strong {
          display: block;
          margin-top: 8px;
          color: var(--arena-ink);
          font-size: 22px;
        }
        .arena-lobby__mini-stat > small {
          display: block;
          margin-top: 7px;
          color: var(--arena-soft);
          font-size: 11px;
          line-height: 1.4;
        }
        .arena-lobby__mastery-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 20px;
          border-radius: 22px;
          border: 1px solid #dddffd;
          background:
            linear-gradient(120deg, rgba(99,102,241,.08), rgba(255,255,255,0)),
            var(--arena-panel);
        }
        .arena-lobby__mastery-copy {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          min-width: 0;
        }
        .arena-lobby__mastery-icon {
          width: 48px;
          height: 48px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          border-radius: 15px;
          background: #eef2ff;
          font-size: 23px;
        }
        .arena-lobby__mastery-copy strong {
          display: block;
          color: var(--arena-ink);
          font-size: 17px;
        }
        .arena-lobby__mastery-copy span {
          display: inline-block;
          margin-top: 3px;
          color: #6558d7;
          font-size: 11px;
          font-weight: 900;
        }
        .arena-lobby__mastery-copy p {
          max-width: 760px;
          margin: 7px 0 0;
          color: var(--arena-soft);
          font-size: 12px;
          line-height: 1.5;
        }
        .arena-lobby__mastery-error {
          margin-top: 8px;
          color: #b42318;
          font-size: 12px;
          font-weight: 700;
        }
        html[data-theme="dark"] .arena-lobby__activity.is-featured {
          border-color: #5b4d89;
        }
        html[data-theme="dark"] .arena-lobby__featured-badge {
          background: #31265a;
          color: #ddd6fe;
        }
        html[data-theme="dark"] .arena-lobby__coach-features {
          color: #c4b5fd;
        }
        html[data-theme="dark"] .arena-lobby__mastery-icon {
          background: #252d42;
        }

        @media (max-width: 920px) {
          .arena-lobby__compact-progress {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 680px) {
          .arena-lobby__quick-grid {
            grid-template-columns: 1fr;
          }
          .arena-lobby__activity {
            min-height: 0;
          }
          .arena-lobby__mastery-card {
            align-items: stretch;
            flex-direction: column;
          }
          .arena-lobby__mastery-card .button {
            width: 100% !important;
          }
        }
        @media (max-width: 460px) {
          .arena-lobby__compact-progress {
            grid-template-columns: 1fr;
          }
          .arena-lobby__coach-features {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="arena-lobby__topbar">
        <div>
          <div className="muted">Virtual Abacus</div>
          <strong>Choose a training activity and start practising.</strong>
        </div>
        <Link className="button secondary arena-lobby__back" to="/student/virtual-abacus">
          Back to Virtual Abacus
        </Link>
      </div>

      {hasPulseErrors ? (
        <div className="arena-lobby__pulse-warning" role="alert">
          <span>
            Some Arena progress data could not be refreshed
            {failedPulseLabels.length ? ` (${failedPulseLabels.join(", ")})` : ""}.
            Successful sections are still available.
          </span>
          <button
            className="button secondary arena-lobby__pulse-retry"
            type="button"
            disabled={loading}
            onClick={retryArenaPulse}
          >
            {loading ? "Refreshing…" : "Retry"}
          </button>
        </div>
      ) : null}

      <section className="arena-lobby__hero">
        <div className="arena-lobby__hero-grid">
          <div>
            <div className="arena-lobby__eyebrow">⚡ ABACUS ARENA</div>
            <h1>Train smarter. Build speed and accuracy.</h1>
            <p className="arena-lobby__hero-copy">
              Flash Cards, Dictation and Smart Coach in one focused practice space.
              Start quickly, learn from mistakes and keep your progress moving.
            </p>

            <div className="arena-lobby__hero-actions">
              <Link
                className="arena-lobby__hero-action arena-lobby__hero-action--primary"
                to={primaryAction.path}
              >
                ▶ {primaryAction.label}
              </Link>
              <a
                className="arena-lobby__hero-action arena-lobby__hero-action--secondary"
                href="#training"
              >
                🎯 Choose Training
              </a>
            </div>
          </div>

          <div className="arena-lobby__hero-stats">
            <div className="arena-lobby__hero-stat">
              <span>Practice streak</span>
              <strong>
                {loading ? "…" : pulseErrors.streaks ? "—" : `${practice.current ?? 0}d 🔥`}
              </strong>
            </div>
            <div className="arena-lobby__hero-stat">
              <span>Best run</span>
              <strong>
                {loading ? "…" : pulseErrors.streaks ? "—" : `${practice.best ?? 0}d`}
              </strong>
            </div>
            <div className="arena-lobby__hero-stat">
              <span>Achievements</span>
              <strong>
                {loading ? "…" : pulseErrors.achievements ? "—" : `${achievementTotal} 🏆`}
              </strong>
            </div>
          </div>
        </div>
      </section>

      <section className="arena-lobby__section" id="training">
        <div className="arena-lobby__section-head">
          <div>
            <h2>Choose Your Training</h2>
            <p>Four focused activities. Pick one and start practising.</p>
          </div>
        </div>

        <div className="arena-lobby__quick-grid">
          {TRAINING.map((item) => (
            <Link
              key={item.title}
              className={`arena-lobby__activity arena-lobby__activity--${item.tone}${
                item.featured ? " is-featured" : ""
              }`}
              to={item.path}
            >
              <div className="arena-lobby__activity-top">
                <div className="arena-lobby__activity-icon">{item.icon}</div>
                {item.featured ? (
                  <span className="arena-lobby__featured-badge">RECOMMENDED</span>
                ) : null}
              </div>

              <strong>{item.title}</strong>
              <p>{item.description}</p>

              {item.featured ? (
                <div className="arena-lobby__coach-features">
                  <span>✓ Guided Practice</span>
                  <span>✓ Mistake Replay</span>
                  <span>✓ Fix My Mistakes</span>
                  <span>✓ Focus Practice</span>
                </div>
              ) : null}

              <div className="arena-lobby__activity-meta">
                <span>{item.skill}</span>
                <span>⏱ {item.duration}</span>
              </div>

              <span className="arena-lobby__play-label">
                {item.featured ? "START COACHING →" : "START →"}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="arena-lobby__section" id="today">
        <div className="arena-lobby__section-head">
          <div>
            <h2>Today&apos;s Practice</h2>
            <p>One clear goal so the next useful activity is always easy to find.</p>
          </div>
          <Link
            className="arena-lobby__text-link"
            to="/student/virtual-abacus/arena/daily-missions"
          >
            View all →
          </Link>
        </div>

        <div className="arena-lobby__mission">
          <div className="arena-lobby__mission-main">
            <div className="arena-lobby__mission-icon">
              {missionSummary.openMission?.icon || "🎯"}
            </div>

            <div>
              <h3 className="arena-lobby__mission-title">
                {loading
                  ? "Loading today's mission…"
                  : pulseErrors.missions
                    ? "Daily missions unavailable"
                    : missionSummary.openMission?.title || "Choose a practice round"}
              </h3>

              <p className="arena-lobby__mission-copy">
                {pulseErrors.missions
                  ? "Today's mission could not be refreshed. Retry above without leaving the Arena."
                  : missionSummary.openMission?.description ||
                    "Daily Missions will guide the next useful activity from your current work."}
              </p>

              <div className="arena-lobby__mission-progress">
                {pulseErrors.missions
                  ? "Mission status unavailable"
                  : missionSummary.total > 0
                    ? `${missionSummary.completed} of ${missionSummary.total} missions completed`
                    : "Build today's practice rhythm"}
              </div>
            </div>
          </div>

          <Link className="arena-lobby__mission-button" to={primaryAction.path}>
            {primaryAction.label} →
          </Link>
        </div>
      </section>

      <section className="arena-lobby__section" id="progress">
        <div className="arena-lobby__section-head">
          <div>
            <h2>My Progress</h2>
            <p>A compact snapshot. Open full Progress when you want the details.</p>
          </div>
          <Link className="arena-lobby__text-link" to="/student/progress">
            View Progress →
          </Link>
        </div>

        <div className="arena-lobby__compact-progress">
          <div className="arena-lobby__mini-stat">
            <span>🔥 Practice Streak</span>
            <strong>
              {loading || pulseErrors.streaks ? "—" : `${practice.current ?? 0} days`}
            </strong>
            <small>
              {pulseErrors.streaks ? "Unavailable" : `Best ${practice.best ?? 0} days`}
            </small>
          </div>

          <div className="arena-lobby__mini-stat">
            <span>⭐ Arena Level</span>
            <strong>
              {pulseErrors.studentProfile ? "—" : `Level ${arenaLevel}`}
            </strong>
            {pulseErrors.studentProfile ? (
              <small>XP unavailable</small>
            ) : (
              <>
                <ProgressMeter value={arenaXpIntoLevel} target={arenaXpPerLevel} />
                <small>{arenaXpToNextLevel} XP to next level</small>
              </>
            )}
          </div>

          <div className="arena-lobby__mini-stat">
            <span>🎯 Practice Average</span>
            <strong>
              {pulseErrors.practiceTrends || averagePracticeScore === null
                ? "—"
                : `${averagePracticeScore}%`}
            </strong>
            <small>
              {pulseErrors.practiceTrends
                ? "Unavailable"
                : `${practiceSummary.totalCompleted ?? 0} completed practice`}
            </small>
          </div>

          <div className="arena-lobby__mini-stat">
            <span>🏆 Achievements</span>
            <strong>
              {pulseErrors.achievements ? "—" : achievementTotal}
            </strong>
            <small>
              {pulseErrors.studentProfile
                ? "Academic level unavailable"
                : `${currentLevelLabel} · ${completedLevels.length} completed`}
            </small>
          </div>
        </div>
      </section>

      <section className="arena-lobby__section" id="challenge">
        <div className="arena-lobby__section-head">
          <div>
            <h2>Level Challenge</h2>
            <p>Use the existing Mastery Challenge when you are ready to test your current level.</p>
          </div>
        </div>

        <div className="arena-lobby__mastery-card">
          <div className="arena-lobby__mastery-copy">
            <div className="arena-lobby__mastery-icon">🎯</div>
            <div>
              <strong>Mastery Challenge</strong>
              <span>{currentLevelLabel}</span>
              <p>
                Formal level challenge using the configured question mix, time limit
                and pass threshold. The result becomes academic evidence but does not
                promote your level automatically.
              </p>
              {masteryError ? (
                <div className="arena-lobby__mastery-error" role="alert">
                  {masteryError}
                </div>
              ) : null}
            </div>
          </div>

          <button
            className="button"
            type="button"
            disabled={startingMastery}
            onClick={startMasteryChallenge}
            style={{ width: "auto" }}
          >
            {startingMastery ? "Preparing Challenge…" : "Start Challenge →"}
          </button>
        </div>
      </section>
    </div>
  );
}

export { StudentAbacusArenaLobby };
