import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { SkeletonLoader } from "../../components/SkeletonLoader";
import { PageHeader } from "../../components/PageHeader";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { generateLeaderboardPdf } from "../../utils/pdfExport";
import { getStudent360, getTeacherStudentPracticeReport, listMyBatches, listMyStudents } from "../../services/teacherPortalService";

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function formatCourseLevel(row) {
  const courseCode = row?.course?.code || "—";
  const levelRank = row?.level?.rank || row?.level?.name || "—";
  return `${courseCode} / ${levelRank}`;
}

function renderFeatureStatus(enabled, label) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: enabled ? "var(--color-bg-success-light)" : "var(--color-bg-muted)",
        color: enabled ? "var(--color-text-success)" : "var(--color-text-muted)"
      }}
    >
      {enabled ? `${label} assigned` : `${label} not assigned`}
    </span>
  );
}

function renderCompactBadge(text, tone = "neutral") {
  const styles = {
    neutral: { background: "var(--color-bg-muted)", color: "var(--color-text-muted)" },
    good: { background: "var(--color-bg-success-light)", color: "var(--color-text-success)" },
    warn: { background: "#fff7ed", color: "#b45309" },
    risk: { background: "#fef2f2", color: "#dc2626" }
  };
  const style = styles[tone] || styles.neutral;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 56,
        padding: "2px 6px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1.3,
        ...style
      }}
    >
      {text}
    </span>
  );
}

function formatPercent(value) {
  if (value === null || value === undefined || value === "") return "--";
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  return `${n.toFixed(1)}%`;
}

function summaryValue(value) {
  if (value === null || value === undefined) return "--";
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  return `${n.toFixed(1)}%`;
}

function formatRelativeTime(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  const now = Date.now();
  const diffMs = now - date.getTime();
  const absMs = Math.abs(diffMs);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (absMs < minute) return "just now";
  if (absMs < hour) {
    const v = Math.round(absMs / minute);
    return `${v} min${v === 1 ? "" : "s"} ago`;
  }
  if (absMs < day) {
    const v = Math.round(absMs / hour);
    return `${v} hour${v === 1 ? "" : "s"} ago`;
  }
  const v = Math.round(absMs / day);
  return `${v} day${v === 1 ? "" : "s"} ago`;
}

function normalizeTimelineEventType(activity) {
  const rawType = String(activity?.type || "").toUpperCase();
  const text = `${activity?.title || ""} ${activity?.detail || ""}`.toUpperCase();

  if (rawType === "WORKSHEET_ASSIGNED" || /WORKSHEET ASSIGNED/.test(text)) return "WORKSHEET_ASSIGNED";
  if (rawType === "WORKSHEET" || rawType === "WORKSHEET_SUBMITTED" || /WORKSHEET/.test(rawType)) return "WORKSHEET_SUBMITTED";
  if (rawType === "MOCK_TEST" || /MOCK/.test(text)) return "MOCK_TEST_COMPLETED";
  if (rawType === "EXAM" || rawType === "EXAM_RESULT" || /EXAM/.test(text)) return "EXAM_COMPLETED";
  if (rawType === "NOTE" || /NOTE/.test(text)) return "TEACHER_NOTE_ADDED";
  if (rawType === "PROMOTION" || /PROMOTION/.test(text)) return "PROMOTION";
  if (rawType === "BATCH_TRANSFER" || /TRANSFER/.test(text)) return "BATCH_TRANSFER";

  if (rawType === "ATTENDANCE" || /ATTENDANCE/.test(text)) {
    const status = String(activity?.detail || "").toUpperCase();
    if (status.includes("ABSENT")) return "ATTENDANCE_ABSENT";
    return "ATTENDANCE_PRESENT";
  }

  return "UNKNOWN";
}

function getTimelineMeta(type) {
  const map = {
    WORKSHEET_ASSIGNED: { icon: "📗", title: "Worksheet Assigned" },
    WORKSHEET_SUBMITTED: { icon: "📘", title: "Worksheet Submitted" },
    MOCK_TEST_COMPLETED: { icon: "🧪", title: "Mock Test Completed" },
    EXAM_COMPLETED: { icon: "🎯", title: "Exam Completed" },
    ATTENDANCE_PRESENT: { icon: "✅", title: "Attendance Present" },
    ATTENDANCE_ABSENT: { icon: "❌", title: "Attendance Absent" },
    TEACHER_NOTE_ADDED: { icon: "📝", title: "Teacher Note Added" },
    PROMOTION: { icon: "🚀", title: "Promotion" },
    BATCH_TRANSFER: { icon: "🔁", title: "Batch Transfer" },
    UNKNOWN: { icon: "ℹ️", title: "Activity" }
  };
  return map[type] || map.UNKNOWN;
}

function buildTimelineEvents(student360) {
  const activities = Array.isArray(student360?.recentActivity) ? student360.recentActivity : [];

  return activities
    .map((activity, index) => {
      const type = normalizeTimelineEventType(activity);
      const meta = getTimelineMeta(type);
      const date = activity?.date || null;
      const scoreMatch = String(activity?.detail || "").match(/(\d+(?:\.\d+)?)\s*%/);

      return {
        id: `${type}-${date || "nodate"}-${index}`,
        sortTs: date ? new Date(date).getTime() : 0,
        icon: meta.icon,
        title: meta.title,
        dateText: formatDateTime(date),
        relativeText: formatRelativeTime(date),
        description: activity?.title || "",
        subDescription: scoreMatch?.[1] ? `${scoreMatch[1]}%` : (activity?.detail || "")
      };
    })
    .sort((a, b) => b.sortTs - a.sortTs);
}

function inferTopicFromText(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  const map = [
    { key: "division", label: "Division" },
    { key: "multiply", label: "Multiplication" },
    { key: "multiplication", label: "Multiplication" },
    { key: "subtract", label: "Subtraction" },
    { key: "subtraction", label: "Subtraction" },
    { key: "add", label: "Addition" },
    { key: "addition", label: "Addition" },
    { key: "fraction", label: "Fractions" },
    { key: "decimal", label: "Decimals" },
    { key: "percentage", label: "Percentages" },
    { key: "algebra", label: "Algebra" },
    { key: "geometry", label: "Geometry" }
  ];

  const hit = map.find((item) => lower.includes(item.key));
  if (hit) return hit.label;

  // If no known topic is found, use title text as a worksheet-level topic bucket.
  return text.length > 42 ? `${text.slice(0, 39)}...` : text;
}

function parseAccuracy(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Number(n.toFixed(2))));
}

function extractAccuracyFromText(value) {
  const m = String(value || "").match(/(\d+(?:\.\d+)?)\s*%/);
  if (!m) return null;
  return parseAccuracy(m[1]);
}

function collectTopicRecordsFromStudent360(student360) {
  const recent = Array.isArray(student360?.recentActivity) ? student360.recentActivity : [];
  const records = [];

  for (const item of recent) {
    const type = String(item?.type || "").toUpperCase();
    const title = String(item?.title || "");
    const detail = String(item?.detail || "");

    if (!(type.includes("WORKSHEET") || type.includes("EXAM") || type.includes("MOCK"))) continue;

    const topic = inferTopicFromText(title);
    if (!topic) continue;

    records.push({
      topic,
      accuracy: extractAccuracyFromText(detail)
    });
  }

  return records;
}

function collectTopicRecordsFromPracticeReport(practiceReport) {
  const recent = Array.isArray(practiceReport?.recent) ? practiceReport.recent : [];
  const records = [];

  for (const attempt of recent) {
    const topic = inferTopicFromText(attempt?.worksheetTitle || "");
    if (!topic) continue;
    records.push({
      topic,
      accuracy: parseAccuracy(attempt?.score)
    });
  }

  return records;
}

function getTopicStatus(accuracy) {
  if (accuracy === null || accuracy === undefined) {
    return { label: "No data", color: "#6b7280", track: "#e5e7eb", tone: "gray" };
  }
  if (accuracy >= 85) {
    return { label: "Good", color: "#16a34a", track: "#dcfce7", tone: "green" };
  }
  if (accuracy >= 60) {
    return { label: "Watch", color: "#ca8a04", track: "#fef9c3", tone: "yellow" };
  }
  return { label: "Risk", color: "#dc2626", track: "#fee2e2", tone: "red" };
}

function buildWeakTopicAnalysis({ student360, practiceReport }) {
  const records360 = collectTopicRecordsFromStudent360(student360);
  const recordsFallback = records360.length > 0 ? [] : collectTopicRecordsFromPracticeReport(practiceReport);
  const records = [...records360, ...recordsFallback];

  const byTopic = new Map();
  for (const rec of records) {
    if (!byTopic.has(rec.topic)) {
      byTopic.set(rec.topic, {
        topic: rec.topic,
        accuracies: [],
        hasAny: false
      });
    }

    const bucket = byTopic.get(rec.topic);
    if (rec.accuracy !== null && rec.accuracy !== undefined) {
      bucket.accuracies.push(rec.accuracy);
      bucket.hasAny = true;
    }
  }

  const topics = Array.from(byTopic.values())
    .map((row) => {
      const accuracy = row.accuracies.length
        ? Number((row.accuracies.reduce((sum, n) => sum + n, 0) / row.accuracies.length).toFixed(1))
        : null;

      return {
        topic: row.topic,
        accuracy,
        status: getTopicStatus(accuracy)
      };
    })
    .sort((a, b) => {
      const av = a.accuracy;
      const bv = b.accuracy;
      if (av === null && bv === null) return a.topic.localeCompare(b.topic);
      if (av === null) return 1;
      if (bv === null) return -1;
      return av - bv;
    });

  const immediateAttention = topics.filter((t) => t.accuracy !== null && t.accuracy < 60).slice(0, 3);

  return {
    topics,
    immediateAttention
  };
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getDaysSince(dateValue) {
  if (!dateValue) return null;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

function normalizeRiskLevel(row, student360) {
  const direct = String(student360?.risk?.level || row?.riskLevel || "").toUpperCase();
  if (["HIGH", "CRITICAL", "SEVERE"].includes(direct)) return "HIGH";
  if (["AT_RISK", "ATTENTION"].includes(direct)) return "HIGH";
  return direct || "UNKNOWN";
}

function deriveStudentSignals({ row, student360, weakTopic }) {
  const riskLevel = normalizeRiskLevel(row, student360);
  const riskScore = toNumberOrNull(student360?.risk?.score) ?? (riskLevel === "HIGH" ? 100 : 0);
  const daysSinceLastActivity = toNumberOrNull(student360?.engagement?.daysSinceLastActivity) ?? getDaysSince(row?.latestAttemptAt);
  const attendancePercent = toNumberOrNull(row?.attendancePercent) ?? toNumberOrNull(student360?.attendance?.last30?.rate);
  const weakTopicAccuracies = Array.isArray(weakTopic?.topics)
    ? weakTopic.topics.map((t) => toNumberOrNull(t?.accuracy)).filter((n) => n !== null)
    : [];
  const minWeakAccuracy = weakTopicAccuracies.length ? Math.min(...weakTopicAccuracies) : null;

  return {
    riskLevel,
    riskScore,
    daysSinceLastActivity,
    attendancePercent,
    minWeakAccuracy,
    hasWeakTopics: weakTopicAccuracies.some((n) => n < 60),
    promotionReady: Boolean(student360?.promotion?.eligible === true || row?.promotionReady === true)
  };
}

function getHealthStatus({ highRiskRate, attendanceRate }) {
  if (highRiskRate < 10 && attendanceRate > 85) {
    return { label: "Green", color: "#16a34a", reason: "High Risk <10% and Attendance >85%" };
  }
  if ((highRiskRate >= 10 && highRiskRate <= 25) || (attendanceRate >= 70 && attendanceRate <= 85)) {
    return { label: "Yellow", color: "#ca8a04", reason: "High Risk 10-25% or Attendance 70-85%" };
  }
  return { label: "Red", color: "#dc2626", reason: "High Risk >25% or Attendance <70%" };
}

function buildActionQueueItems({ rows, student360ById, weakTopicAnalysisById }) {
  const items = [];

  for (const row of rows) {
    const student360 = student360ById[row.studentId] || null;
    if (student360?.__error) continue;

    const weak = weakTopicAnalysisById[row.studentId] || { topics: [], immediateAttention: [] };
    const signals = deriveStudentSignals({ row, student360, weakTopic: weak });
    const batchName = student360?.student?.batch?.name || row?.batchName || "—";

    let item = null;

    if (signals.riskLevel === "HIGH") {
      item = {
        queueType: "high-risk",
        priorityRank: 1,
        severity: signals.riskScore,
        priorityBadge: "Critical",
        badgeColor: "#dc2626",
        reason: `Risk level: ${student360?.risk?.level || row?.riskLevel || "HIGH"}`,
        actionLabel: "Open Student",
        actionType: "link",
        actionTo: `/teacher/students/${row.studentId}/360`
      };
    } else if (signals.daysSinceLastActivity !== null && signals.daysSinceLastActivity >= 7) {
      item = {
        queueType: "inactive",
        priorityRank: 2,
        severity: signals.daysSinceLastActivity,
        priorityBadge: "Needs Attention",
        badgeColor: "#ea580c",
        reason: `No activity for ${signals.daysSinceLastActivity} day${signals.daysSinceLastActivity === 1 ? "" : "s"}`,
        actionLabel: "Open Timeline",
        actionType: "timeline"
      };
    } else if (signals.attendancePercent !== null && signals.attendancePercent < 75) {
      item = {
        queueType: "attendance",
        priorityRank: 3,
        severity: 100 - signals.attendancePercent,
        priorityBadge: "Needs Attention",
        badgeColor: "#ea580c",
        reason: `Attendance ${signals.attendancePercent.toFixed(1)}%`,
        actionLabel: "Open Attendance",
        actionType: "link",
        actionTo: `/teacher/students/${row.studentId}/attendance`
      };
    } else if (signals.hasWeakTopics) {
      item = {
        queueType: "weak-topics",
        priorityRank: 4,
        severity: signals.minWeakAccuracy === null ? 0 : 100 - signals.minWeakAccuracy,
        priorityBadge: "Review",
        badgeColor: "#ca8a04",
        reason: `${weak.immediateAttention?.length || 1} weak topic(s) below 60%`,
        actionLabel: "Assign Practice",
        actionType: "link",
        actionTo: `/teacher/students/${row.studentId}/practice-report`
      };
    } else if (signals.promotionReady) {
      item = {
        queueType: "promotion",
        priorityRank: 5,
        severity: 1,
        priorityBadge: "Ready",
        badgeColor: "#16a34a",
        reason: "Promotion criteria met",
        actionLabel: "Review Promotion",
        actionType: "link",
        actionTo: `/teacher/students/${row.studentId}/360`
      };
    }

    if (item) {
      items.push({
        id: `queue-${item.queueType}-${row.studentId}`,
        studentId: row.studentId,
        studentName: row.fullName || row.admissionNo || "Student",
        admissionNo: row.admissionNo || "",
        batchName,
        ...item
      });
    }
  }

  return items.sort((a, b) => {
    if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
    if (a.severity !== b.severity) return b.severity - a.severity;
    return String(a.studentName).localeCompare(String(b.studentName));
  });
}

function buildInterventionItems({ rows, student360ById, weakTopicAnalysisById }) {
  const items = [];

  for (const row of rows) {
    const student360 = student360ById[row.studentId] || null;
    if (student360?.__error) continue;

    const weak = weakTopicAnalysisById[row.studentId] || { topics: [], immediateAttention: [] };
    const signals = deriveStudentSignals({ row, student360, weakTopic: weak });
    const studentName = row.fullName || row.admissionNo || "Student";

    if (signals.attendancePercent !== null && signals.attendancePercent < 75) {
      items.push({
        id: `intervention-attendance-${row.studentId}`,
        studentId: row.studentId,
        studentName,
        reason: `Attendance ${signals.attendancePercent.toFixed(1)}%`,
        priority: "High",
        priorityRank: 2,
        recommendedAction: "Review Attendance",
        filterType: "attendance",
        actionTo: `/teacher/students/${row.studentId}/attendance`
      });
    }

    if (signals.hasWeakTopics) {
      const weakestTopic = Array.isArray(weak?.topics)
        ? weak.topics
          .filter((topic) => toNumberOrNull(topic?.accuracy) !== null)
          .sort((a, b) => (toNumberOrNull(a?.accuracy) ?? 100) - (toNumberOrNull(b?.accuracy) ?? 100))[0]
        : null;

      const weakestAccuracy = toNumberOrNull(weakestTopic?.accuracy);
      const weakReason = weakestTopic?.topic
        ? `${weakestTopic.topic}${weakestAccuracy === null ? "" : ` ${weakestAccuracy.toFixed(1)}%`}`
        : "Weak Topic detected";

      items.push({
        id: `intervention-practice-${row.studentId}`,
        studentId: row.studentId,
        studentName,
        reason: weakReason,
        priority: "Medium",
        priorityRank: 4,
        recommendedAction: "Assign Practice",
        filterType: "practice",
        actionTo: `/teacher/students/${row.studentId}/practice-report`
      });
    }

    if (signals.riskLevel === "HIGH") {
      items.push({
        id: `intervention-review-${row.studentId}`,
        studentId: row.studentId,
        studentName,
        reason: "High Risk",
        priority: "Critical",
        priorityRank: 1,
        recommendedAction: "Schedule Review",
        filterType: "practice",
        actionTo: `/teacher/students/${row.studentId}/360`
      });
    }

    if (signals.promotionReady) {
      items.push({
        id: `intervention-promotion-${row.studentId}`,
        studentId: row.studentId,
        studentName,
        reason: "Promotion Ready",
        priority: "Low",
        priorityRank: 5,
        recommendedAction: "Promotion Review",
        filterType: "promotion",
        actionTo: `/teacher/students/${row.studentId}/360`
      });
    }

    if (signals.daysSinceLastActivity !== null && signals.daysSinceLastActivity > 7) {
      items.push({
        id: `intervention-parent-${row.studentId}`,
        studentId: row.studentId,
        studentName,
        reason: `Inactive ${signals.daysSinceLastActivity} days`,
        priority: "High",
        priorityRank: 3,
        recommendedAction: "Contact Parent",
        filterType: "parent-contact",
        actionTo: `/teacher/notes?studentId=${encodeURIComponent(row.studentId)}`
      });
    }
  }

  return items.sort((a, b) => {
    if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
    const nameCompare = String(a.studentName).localeCompare(String(b.studentName));
    if (nameCompare !== 0) return nameCompare;
    return String(a.recommendedAction).localeCompare(String(b.recommendedAction));
  });
}

function toSafeFilename(value) {
  return String(value || "student")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "") || "student";
}

function buildParentCommunicationSummary({ row, student360, weakTopic, timelineEvents }) {
  const signals = deriveStudentSignals({ row, student360, weakTopic });
  const averageScore = toNumberOrNull(row?.averageScore) ?? toNumberOrNull(student360?.performance?.accuracyLast5);
  const trend = String(row?.trend || student360?.performance?.trend || "STABLE").toUpperCase();

  const overallProgress = (() => {
    if (signals.riskLevel === "HIGH") return "Needs Attention";
    if (signals.attendancePercent !== null && signals.attendancePercent < 75) return "Needs Attention";
    if (signals.hasWeakTopics) return "Needs Attention";
    if (averageScore !== null && averageScore >= 85 && trend === "UP") return "Excellent";
    if (averageScore !== null && averageScore >= 70) return "Good";
    if (averageScore !== null && averageScore >= 55) return "Average";
    return "Average";
  })();

  const attendanceComment = (() => {
    if (signals.attendancePercent === null) return "Attendance data is limited this period.";
    if (signals.attendancePercent >= 90) return "Excellent attendance consistency.";
    if (signals.attendancePercent >= 75) return "Good attendance; maintain regularity.";
    if (signals.attendancePercent >= 60) return "Attendance needs improvement through regular follow-up.";
    return "Attendance is low and needs immediate attention.";
  })();

  const topics = Array.isArray(weakTopic?.topics) ? weakTopic.topics : [];

  const strongAreas = topics
    .filter((t) => toNumberOrNull(t?.accuracy) !== null && toNumberOrNull(t?.accuracy) >= 85)
    .sort((a, b) => (toNumberOrNull(b?.accuracy) ?? 0) - (toNumberOrNull(a?.accuracy) ?? 0))
    .map((t) => t.topic)
    .slice(0, 3);

  if (strongAreas.length === 0 && trend === "UP") strongAreas.push("Improving performance trend");
  if (strongAreas.length === 0 && signals.attendancePercent !== null && signals.attendancePercent >= 85) strongAreas.push("Consistent attendance");
  if (strongAreas.length === 0 && Array.isArray(timelineEvents) && timelineEvents.length >= 3) strongAreas.push("Regular participation");

  const needsImprovement = topics
    .filter((t) => toNumberOrNull(t?.accuracy) !== null && toNumberOrNull(t?.accuracy) < 60)
    .sort((a, b) => (toNumberOrNull(a?.accuracy) ?? 100) - (toNumberOrNull(b?.accuracy) ?? 100))
    .map((t) => t.topic)
    .slice(0, 3);

  if (needsImprovement.length === 0 && signals.attendancePercent !== null && signals.attendancePercent < 75) {
    needsImprovement.push("Attendance consistency");
  }

  const promotionStatus = (() => {
    if (signals.promotionReady) {
      return { label: "Ready", reason: "Promotion criteria currently met." };
    }
    if (signals.riskLevel !== "HIGH" && (signals.attendancePercent === null || signals.attendancePercent >= 75) && !signals.hasWeakTopics) {
      return { label: "Almost Ready", reason: "Needs sustained consistency before final review." };
    }
    if (signals.riskLevel === "HIGH") {
      return { label: "Not Ready", reason: "High risk indicators require intervention first." };
    }
    if (signals.hasWeakTopics) {
      return { label: "Not Ready", reason: "Weak topics should improve before promotion review." };
    }
    if (signals.attendancePercent !== null && signals.attendancePercent < 75) {
      return { label: "Not Ready", reason: "Attendance below expected threshold." };
    }
    return { label: "Almost Ready", reason: "Continue progress monitoring." };
  })();

  const recommendations = [];
  if (signals.attendancePercent !== null && signals.attendancePercent < 75) recommendations.push("Improve attendance.");
  if (signals.hasWeakTopics) recommendations.push("Practice weakest topics.");
  if (signals.riskLevel === "HIGH") recommendations.push("Schedule additional review.");
  if (signals.promotionReady) recommendations.push("Prepare for promotion assessment.");
  if (signals.daysSinceLastActivity !== null && signals.daysSinceLastActivity >= 7) recommendations.push("Encourage regular participation.");

  return {
    studentName: row?.fullName || row?.admissionNo || "Student",
    batchName: student360?.student?.batch?.name || row?.batchName || "—",
    levelLabel: row?.level?.name || row?.level?.rank || student360?.student?.level?.name || "—",
    overallProgress,
    attendancePercent: signals.attendancePercent,
    attendanceComment,
    averageScore,
    trend,
    strongAreas,
    needsImprovement,
    promotionStatus,
    recommendations: recommendations.slice(0, 4),
    hasData: Boolean(student360)
  };
}

function buildParentSummaryText(summary) {
  const lines = [
    "Parent Communication Summary",
    "",
    `Student: ${summary.studentName}`,
    `Batch: ${summary.batchName}`,
    `Level: ${summary.levelLabel}`,
    "",
    `Overall Progress: ${summary.overallProgress}`,
    "",
    "Attendance",
    `Current %: ${summary.attendancePercent === null ? "--" : `${summary.attendancePercent.toFixed(1)}%`}`,
    `Teacher comment: ${summary.attendanceComment}`,
    "",
    "Academic Performance",
    `Average Score: ${summary.averageScore === null ? "--" : `${summary.averageScore.toFixed(1)}%`}`,
    `Trend: ${summary.trend}`,
    "",
    "Strong Areas",
    ...(summary.strongAreas.length ? summary.strongAreas.map((item) => `- ${item}`) : ["- None identified yet"]),
    "",
    "Needs Improvement",
    ...(summary.needsImprovement.length ? summary.needsImprovement.map((item) => `- ${item}`) : ["- No major gaps currently"]),
    "",
    `Promotion Status: ${summary.promotionStatus.label}`,
    `Reason: ${summary.promotionStatus.reason}`,
    "",
    "Teacher Recommendation",
    ...(summary.recommendations.length ? summary.recommendations.map((item) => `- ${item}`) : ["- Continue current plan and monitor progress."])
  ];

  return lines.join("\n");
}

function TeacherStudentsPage() {
  const [loading, setLoading] = useState(true);
  const [batchesLoading, setBatchesLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [batchSummary, setBatchSummary] = useState(null);
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [expandedByStudentId, setExpandedByStudentId] = useState({});
  const [student360ById, setStudent360ById] = useState({});
  const [student360LoadingById, setStudent360LoadingById] = useState({});
  const [weakTopicAnalysisById, setWeakTopicAnalysisById] = useState({});
  const [weakTopicLoadingById, setWeakTopicLoadingById] = useState({});
  const [batchHealthSnapshotByBatchId, setBatchHealthSnapshotByBatchId] = useState({});
  const [queueTab, setQueueTab] = useState("all");
  const [queueShowAll, setQueueShowAll] = useState(false);
  const [interventionFilter, setInterventionFilter] = useState("all");
  const [copiedParentSummaryByStudentId, setCopiedParentSummaryByStudentId] = useState({});

  const loadStudents = async ({ query = "", batchId = "" } = {}) => {
    setLoading(true);
    setError("");
    try {
      const data = await listMyStudents({ q: query, batchId });
      const items = Array.isArray(data?.data) ? data.data : [];
      const activeItems = items.filter((item) => item?.isActive !== false);
      setRows(activeItems);
      setBatchSummary(data?.batchSummary || null);

      const snapshotKey = batchId || "__all__";
      if (!String(query || "").trim()) {
        setBatchHealthSnapshotByBatchId((prev) => ({
          ...prev,
          [snapshotKey]: {
            rows: activeItems,
            batchSummary: data?.batchSummary || null,
            capturedAt: new Date().toISOString()
          }
        }));
      }
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load students.");
    } finally {
      setLoading(false);
    }
  };

  const loadBatches = async () => {
    setBatchesLoading(true);
    try {
      const data = await listMyBatches();
      const items = Array.isArray(data?.data) ? data.data : [];
      setBatches(items);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load batches.");
    } finally {
      setBatchesLoading(false);
    }
  };

  useEffect(() => {
    void loadBatches();
  }, []);

  useEffect(() => {
    setOffset(0);
    const timeout = setTimeout(() => {
      void loadStudents({ query: search, batchId: selectedBatchId });
    }, 250);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, selectedBatchId]);

  const activeBatchLabel = useMemo(() => {
    if (!selectedBatchId) return "All Batches";
    const hit = batches.find((b) => b.batchId === selectedBatchId || b.id === selectedBatchId);
    return hit?.name || "Selected Batch";
  }, [selectedBatchId, batches]);

  if (loading && batchesLoading) {
    return <SkeletonLoader variant="table" rows={6} />;
  }

  const total = rows.length;
  const pageRows = rows.slice(offset, offset + limit);

  const summaryCards = [
    { label: "Total Students", value: String(batchSummary?.totalStudents ?? total) },
    { label: "Average Score %", value: summaryValue(batchSummary?.averageScorePercent) },
    { label: "Attendance %", value: summaryValue(batchSummary?.attendancePercent) },
    { label: "Worksheet Completion %", value: summaryValue(batchSummary?.worksheetCompletionPercent) },
    { label: "At Risk Count", value: String(batchSummary?.atRiskCount ?? 0) },
    { label: "Inactive Count", value: String(batchSummary?.inactiveCount ?? 0) }
  ];

  const actionQueueItems = useMemo(
    () => buildActionQueueItems({ rows, student360ById, weakTopicAnalysisById }),
    [rows, student360ById, weakTopicAnalysisById]
  );

  const queueFilteredItems = useMemo(() => {
    if (queueTab === "all") return actionQueueItems;
    return actionQueueItems.filter((item) => item.queueType === queueTab);
  }, [actionQueueItems, queueTab]);

  const visibleQueueItems = queueShowAll ? queueFilteredItems : queueFilteredItems.slice(0, 10);

  const queueTabs = [
    { key: "all", label: "All" },
    { key: "high-risk", label: "High Risk" },
    { key: "inactive", label: "Inactive" },
    { key: "attendance", label: "Attendance" },
    { key: "weak-topics", label: "Weak Topics" },
    { key: "promotion", label: "Promotion" }
  ];

  const interventionItems = useMemo(
    () => buildInterventionItems({ rows, student360ById, weakTopicAnalysisById }),
    [rows, student360ById, weakTopicAnalysisById]
  );

  const interventionFilters = [
    { key: "all", label: "All" },
    { key: "attendance", label: "Attendance" },
    { key: "practice", label: "Practice" },
    { key: "promotion", label: "Promotion" },
    { key: "parent-contact", label: "Parent Contact" }
  ];

  const filteredInterventions = useMemo(() => {
    if (interventionFilter === "all") return interventionItems;
    return interventionItems.filter((item) => item.filterType === interventionFilter);
  }, [interventionItems, interventionFilter]);

  const parentSummaryByStudentId = useMemo(() => {
    const map = {};
    for (const row of rows) {
      const student360 = student360ById[row.studentId] || null;
      if (!student360 || student360.__error) continue;
      const weak = weakTopicAnalysisById[row.studentId] || { topics: [], immediateAttention: [] };
      const timelineEvents = buildTimelineEvents(student360);
      map[row.studentId] = buildParentCommunicationSummary({
        row,
        student360,
        weakTopic: weak,
        timelineEvents
      });
    }
    return map;
  }, [rows, student360ById, weakTopicAnalysisById]);

  const handleCopyParentSummary = async (studentId, summary) => {
    const text = buildParentSummaryText(summary);
    let copied = false;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch (_err) {
      copied = false;
    }

    if (!copied) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        copied = document.execCommand("copy");
      } catch (_err) {
        copied = false;
      }
      document.body.removeChild(textarea);
    }

    setCopiedParentSummaryByStudentId((prev) => ({ ...prev, [studentId]: copied ? "Copied" : "Copy failed" }));
    setTimeout(() => {
      setCopiedParentSummaryByStudentId((prev) => ({ ...prev, [studentId]: "" }));
    }, 1600);
  };

  const handlePrintParentSummary = (summary) => {
    const text = buildParentSummaryText(summary);
    const popup = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
    if (!popup) return;
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    popup.document.write(`<!doctype html><html><head><title>Parent Communication Summary</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111827}pre{white-space:pre-wrap;line-height:1.45;font-size:13px;margin:0}</style></head><body><pre>${escaped}</pre></body></html>`);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const handleExportParentSummaryPdf = (summary) => {
    const rowsForPdf = [
      { label: "Student", value: summary.studentName },
      { label: "Batch", value: summary.batchName },
      { label: "Level", value: summary.levelLabel },
      { label: "Overall Progress", value: summary.overallProgress },
      { label: "Attendance", value: summary.attendancePercent === null ? "--" : `${summary.attendancePercent.toFixed(1)}%` },
      { label: "Attendance Comment", value: summary.attendanceComment },
      { label: "Average Score", value: summary.averageScore === null ? "--" : `${summary.averageScore.toFixed(1)}%` },
      { label: "Trend", value: summary.trend },
      { label: "Strong Areas", value: summary.strongAreas.length ? summary.strongAreas.join(", ") : "None identified yet" },
      { label: "Needs Improvement", value: summary.needsImprovement.length ? summary.needsImprovement.join(", ") : "No major gaps currently" },
      { label: "Promotion Status", value: `${summary.promotionStatus.label} - ${summary.promotionStatus.reason}` },
      { label: "Teacher Recommendation", value: summary.recommendations.length ? summary.recommendations.join(" ") : "Continue current plan and monitor progress." }
    ];

    const doc = generateLeaderboardPdf({
      title: `Parent Communication Summary - ${summary.studentName}`,
      rows: rowsForPdf.map((row, index) => ({
        rank: index + 1,
        studentName: `${row.label}: ${row.value}`,
        avgScore: "",
        totalWorksheets: ""
      }))
    });

    doc.save(`Parent_Communication_Summary_${toSafeFilename(summary.studentName)}.pdf`);
  };

  const batchHealthSource = useMemo(() => {
    const key = selectedBatchId || "__all__";
    const snapshot = batchHealthSnapshotByBatchId[key] || null;
    if (snapshot) return snapshot;
    return {
      rows,
      batchSummary,
      capturedAt: null
    };
  }, [selectedBatchId, batchHealthSnapshotByBatchId, rows, batchSummary]);

  const batchHealthData = useMemo(() => {
    const sourceRows = Array.isArray(batchHealthSource?.rows) ? batchHealthSource.rows : [];
    const sourceSummary = batchHealthSource?.batchSummary || null;
    const totalStudents = Number(sourceSummary?.totalStudents ?? sourceRows.length ?? 0);

    let highRiskCount = 0;
    let inactiveCount = 0;
    let promotionReadyCount = 0;
    let attendanceTotal = 0;
    let attendanceSamples = 0;

    const topicAcc = new Map();

    for (const row of sourceRows) {
      const student360 = student360ById[row.studentId] || null;
      const weak = weakTopicAnalysisById[row.studentId] || { topics: [] };
      const signals = deriveStudentSignals({ row, student360, weakTopic: weak });

      if (signals.riskLevel === "HIGH") highRiskCount += 1;
      if (signals.daysSinceLastActivity !== null && signals.daysSinceLastActivity >= 7) inactiveCount += 1;
      if (signals.promotionReady) promotionReadyCount += 1;

      if (signals.attendancePercent !== null) {
        attendanceTotal += signals.attendancePercent;
        attendanceSamples += 1;
      }

      if (Array.isArray(weak?.topics)) {
        for (const topic of weak.topics) {
          const val = toNumberOrNull(topic?.accuracy);
          if (val === null) continue;
          if (!topicAcc.has(topic.topic)) topicAcc.set(topic.topic, []);
          topicAcc.get(topic.topic).push(val);
        }
      }
    }

    const attendanceRate = Number(
      (attendanceSamples > 0
        ? attendanceTotal / attendanceSamples
        : toNumberOrNull(sourceSummary?.attendancePercent) ?? 0).toFixed(1)
    );

    const avgScore = Number(
      (toNumberOrNull(sourceSummary?.averageScorePercent)
        ?? (sourceRows.length
          ? sourceRows.reduce((sum, row) => sum + (toNumberOrNull(row?.averageScore) || 0), 0) / sourceRows.length
          : 0)).toFixed(1)
    );

    const highRiskRate = totalStudents > 0 ? Number(((highRiskCount / totalStudents) * 100).toFixed(1)) : 0;
    const status = getHealthStatus({ highRiskRate, attendanceRate });

    const topWeakTopics = Array.from(topicAcc.entries())
      .map(([topic, values]) => ({
        topic,
        avgAccuracy: Number((values.reduce((s, n) => s + n, 0) / values.length).toFixed(1))
      }))
      .sort((a, b) => a.avgAccuracy - b.avgAccuracy)
      .slice(0, 3);

    return {
      totalStudents,
      attendanceRate,
      avgScore,
      promotionReadyCount,
      highRiskCount,
      inactiveCount,
      highRiskRate,
      status,
      topWeakTopics,
      suggestedFocus: topWeakTopics.slice(0, 2).map((t) => `${t.topic} Revision`),
      isEmpty: totalStudents === 0
    };
  }, [batchHealthSource, student360ById, weakTopicAnalysisById]);

  const ensureWeakTopicAnalysis = async (studentId, student360Payload) => {
    if (weakTopicAnalysisById[studentId] || weakTopicLoadingById[studentId]) return;

    const from360 = buildWeakTopicAnalysis({ student360: student360Payload, practiceReport: null });
    if (from360.topics.length > 0) {
      setWeakTopicAnalysisById((prev) => ({ ...prev, [studentId]: from360 }));
      return;
    }

    setWeakTopicLoadingById((prev) => ({ ...prev, [studentId]: true }));
    try {
      const report = await getTeacherStudentPracticeReport(studentId, { limit: 100 });
      const reportPayload = report?.data ?? report ?? null;
      const merged = buildWeakTopicAnalysis({ student360: student360Payload, practiceReport: reportPayload });
      setWeakTopicAnalysisById((prev) => ({ ...prev, [studentId]: merged }));
    } catch (_err) {
      setWeakTopicAnalysisById((prev) => ({
        ...prev,
        [studentId]: { topics: [], immediateAttention: [] }
      }));
    } finally {
      setWeakTopicLoadingById((prev) => ({ ...prev, [studentId]: false }));
    }
  };

  const toggleExpand = async (studentId) => {
    const nextExpanded = !expandedByStudentId[studentId];
    setExpandedByStudentId((prev) => ({ ...prev, [studentId]: nextExpanded }));

    if (nextExpanded && student360ById[studentId] && !student360ById[studentId]?.__error) {
      void ensureWeakTopicAnalysis(studentId, student360ById[studentId]);
    }

    if (!nextExpanded || student360ById[studentId] || student360LoadingById[studentId]) {
      return;
    }

    setStudent360LoadingById((prev) => ({ ...prev, [studentId]: true }));
    try {
      const result = await getStudent360(studentId);
      const payload = result?.data ?? result ?? null;
      setStudent360ById((prev) => ({ ...prev, [studentId]: payload }));
      if (payload) {
        void ensureWeakTopicAnalysis(studentId, payload);
      }
    } catch (err) {
      setStudent360ById((prev) => ({ ...prev, [studentId]: { __error: getFriendlyErrorMessage(err) || "Failed to load Student 360" } }));
    } finally {
      setStudent360LoadingById((prev) => ({ ...prev, [studentId]: false }));
    }
  };

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <PageHeader
        title="Assigned Students"
        subtitle="Students assigned to you through active enrollments."
        actions={
          <Link className="button secondary" style={{ width: "auto" }} to="/teacher/results">
            Open Results
          </Link>
        }
      />

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
          <label style={{ display: "grid", gap: 6, width: 220 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Batch</span>
            <select
              className="select"
              value={selectedBatchId}
              onChange={(e) => {
                setSelectedBatchId(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">All Batches</option>
              {batches.map((b) => (
                <option key={b.batchId || b.id} value={b.batchId || b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6, flex: "1 1 280px" }}>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Search student code or name</span>
            <input
              className="input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student code or name"
            />
          </label>

          <label style={{ display: "grid", gap: 6, width: 160 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Rows per page</span>
            <select
              className="select"
              value={limit}
              onChange={(e) => {
                setLimit(parseInt(e.target.value, 10) || 20);
                setOffset(0);
              }}
            >
              <option value={10}>10 / page</option>
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
          </label>
        </div>

        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          {activeBatchLabel} • Showing {pageRows.length} of {total} students
        </div>
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
          {summaryCards.map((card) => (
            <div key={card.label} style={{ border: "1px solid var(--color-border)", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: 0.2 }}>
                {card.label}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{card.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Batch Health Dashboard</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Health snapshot for {activeBatchLabel}.</div>
          </div>
          {batchHealthSource?.capturedAt ? (
            <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Snapshot: {formatDateTime(batchHealthSource.capturedAt)}</div>
          ) : null}
        </div>

        {batchHealthData.isEmpty ? (
          <div style={{ border: "1px dashed var(--color-border)", borderRadius: 10, padding: 14, textAlign: "center", fontSize: 12, color: "var(--color-text-muted)" }}>
            No students found in this batch.
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
              {[
                { label: "Students", value: String(batchHealthData.totalStudents) },
                { label: "Attendance", value: `${batchHealthData.attendanceRate.toFixed(1)}%` },
                { label: "Average Score", value: `${batchHealthData.avgScore.toFixed(1)}%` },
                { label: "Promotion Ready", value: String(batchHealthData.promotionReadyCount) },
                { label: "High Risk", value: String(batchHealthData.highRiskCount) },
                { label: "Inactive", value: String(batchHealthData.inactiveCount) }
              ].map((card) => (
                <div key={card.label} style={{ border: "1px solid var(--color-border)", borderRadius: 10, padding: "8px 10px" }}>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: 0.2 }}>{card.label}</div>
                  <div style={{ marginTop: 2, fontSize: 18, fontWeight: 700 }}>{card.value}</div>
                </div>
              ))}
            </div>

            <div style={{ border: "1px solid var(--color-border)", borderRadius: 10, padding: 10, display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>Overall Health</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    borderRadius: 999,
                    padding: "2px 8px",
                    fontSize: 12,
                    fontWeight: 700,
                    background: `${batchHealthData.status.color}22`,
                    color: batchHealthData.status.color
                  }}
                >
                  {batchHealthData.status.label}
                </span>
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{batchHealthData.status.reason}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                High Risk Rate: {batchHealthData.highRiskRate.toFixed(1)}% • Attendance: {batchHealthData.attendanceRate.toFixed(1)}%
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
              <div style={{ border: "1px solid var(--color-border)", borderRadius: 10, padding: 10, display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>Common Weak Topics</div>
                {batchHealthData.topWeakTopics.length ? (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                    {batchHealthData.topWeakTopics.map((topic) => (
                      <li key={`weak-topic-${topic.topic}`}>{topic.topic}</li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>No weak topic signals yet.</div>
                )}
              </div>

              <div style={{ border: "1px solid var(--color-border)", borderRadius: 10, padding: 10, display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>Today's Suggested Teaching</div>
                {batchHealthData.suggestedFocus.length ? (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                    {batchHealthData.suggestedFocus.map((item) => (
                      <li key={`focus-${item}`}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>No specific focus recommendation available.</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Teacher Action Queue</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Students needing teacher attention today.</div>
          </div>
          {queueFilteredItems.length > 10 ? (
            <button
              className="button secondary"
              style={{ width: "auto" }}
              onClick={() => setQueueShowAll((prev) => !prev)}
            >
              {queueShowAll ? "Show Top 10" : "View All"}
            </button>
          ) : null}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {queueTabs.map((tab) => {
            const count = tab.key === "all"
              ? actionQueueItems.length
              : actionQueueItems.filter((item) => item.queueType === tab.key).length;
            const active = queueTab === tab.key;

            return (
              <button
                key={tab.key}
                className="button secondary"
                style={{
                  width: "auto",
                  background: active ? "var(--color-bg-muted)" : "transparent",
                  borderColor: active ? "var(--color-border-strong)" : "var(--color-border)"
                }}
                onClick={() => {
                  setQueueTab(tab.key);
                  setQueueShowAll(false);
                }}
              >
                {tab.label} ({count})
              </button>
            );
          })}
        </div>

        {visibleQueueItems.length === 0 ? (
          <div style={{ border: "1px dashed var(--color-border)", borderRadius: 10, padding: 14, textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Great job!</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>No students currently require attention.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {visibleQueueItems.map((item) => (
              <div
                key={item.id}
                style={{
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                  padding: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap"
                }}
              >
                <div style={{ display: "grid", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{item.studentName}</div>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        borderRadius: 999,
                        padding: "2px 8px",
                        fontSize: 11,
                        fontWeight: 700,
                        background: `${item.badgeColor}22`,
                        color: item.badgeColor
                      }}
                    >
                      {item.priorityBadge}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Batch: {item.batchName}</div>
                  <div style={{ fontSize: 12 }}>{item.reason}</div>
                </div>

                {item.actionType === "timeline" ? (
                  <button
                    className="button secondary"
                    style={{ width: "auto" }}
                    onClick={() => void toggleExpand(item.studentId)}
                  >
                    {item.actionLabel}
                  </button>
                ) : (
                  <Link className="button secondary" style={{ width: "auto" }} to={item.actionTo}>
                    {item.actionLabel}
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Smart Intervention Center</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Deterministic recommendations using attendance, weak topics, risk, promotion, and inactivity signals.</div>
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{filteredInterventions.length} recommendation(s)</div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {interventionFilters.map((tab) => {
            const count = tab.key === "all"
              ? interventionItems.length
              : interventionItems.filter((item) => item.filterType === tab.key).length;
            const active = interventionFilter === tab.key;

            return (
              <button
                key={tab.key}
                className="button secondary"
                style={{
                  width: "auto",
                  background: active ? "var(--color-bg-muted)" : "transparent",
                  borderColor: active ? "var(--color-border-strong)" : "var(--color-border)"
                }}
                onClick={() => setInterventionFilter(tab.key)}
              >
                {tab.label} ({count})
              </button>
            );
          })}
        </div>

        {filteredInterventions.length === 0 ? (
          <div style={{ border: "1px dashed var(--color-border)", borderRadius: 10, padding: 14, textAlign: "center", fontSize: 12, color: "var(--color-text-muted)" }}>
            No recommendations available for this filter.
          </div>
        ) : (
          <div style={{ border: "1px solid var(--color-border)", borderRadius: 10, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead>
                <tr style={{ background: "var(--color-bg-muted)" }}>
                  <th style={{ textAlign: "left", fontSize: 12, padding: "10px 12px", borderBottom: "1px solid var(--color-border)" }}>Student</th>
                  <th style={{ textAlign: "left", fontSize: 12, padding: "10px 12px", borderBottom: "1px solid var(--color-border)" }}>Reason</th>
                  <th style={{ textAlign: "left", fontSize: 12, padding: "10px 12px", borderBottom: "1px solid var(--color-border)" }}>Priority</th>
                  <th style={{ textAlign: "left", fontSize: 12, padding: "10px 12px", borderBottom: "1px solid var(--color-border)" }}>Recommended Action</th>
                  <th style={{ textAlign: "left", fontSize: 12, padding: "10px 12px", borderBottom: "1px solid var(--color-border)" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredInterventions.map((item) => {
                  const priorityColor = item.priority === "Critical"
                    ? "#dc2626"
                    : item.priority === "High"
                      ? "#ea580c"
                      : item.priority === "Medium"
                        ? "#ca8a04"
                        : "#16a34a";

                  return (
                    <tr key={item.id}>
                      <td style={{ fontSize: 12, padding: "10px 12px", borderBottom: "1px solid var(--color-border)" }}>{item.studentName}</td>
                      <td style={{ fontSize: 12, padding: "10px 12px", borderBottom: "1px solid var(--color-border)" }}>{item.reason}</td>
                      <td style={{ fontSize: 12, padding: "10px 12px", borderBottom: "1px solid var(--color-border)" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            borderRadius: 999,
                            padding: "2px 8px",
                            fontWeight: 700,
                            background: `${priorityColor}22`,
                            color: priorityColor
                          }}
                        >
                          {item.priority}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, padding: "10px 12px", borderBottom: "1px solid var(--color-border)" }}>{item.recommendedAction}</td>
                      <td style={{ fontSize: 12, padding: "10px 12px", borderBottom: "1px solid var(--color-border)" }}>
                        <Link className="button secondary" style={{ width: "auto" }} to={item.actionTo}>
                          Do Action
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      <DataTable
        columns={[
          { key: "admissionNo", header: "Student Code", render: (r) => r.admissionNo || "" },
          { key: "name", header: "Name", render: (r) => r.fullName || "" },
          { key: "courseLevel", header: "Course/Level", render: (r) => formatCourseLevel(r) },
          {
            key: "practiceFeature",
            header: "Practice",
            render: (r) => renderFeatureStatus(Boolean(r.hasPractice), "Practice")
          },
          {
            key: "abacusPracticeFeature",
            header: "Abacus Practice",
            render: (r) => renderFeatureStatus(Boolean(r.hasAbacusPractice), "Abacus")
          },
          { key: "status", header: "Status", render: (r) => r.status || "" },
          { key: "assigned", header: "Assigned", render: (r) => Number(r.assignedWorksheetCount || 0) },
          { key: "latestAttempt", header: "Latest Attempt", render: (r) => formatDateTime(r.latestAttemptAt) },
          {
            key: "actions",
            header: "Actions",
            render: (r) => (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  className="button secondary"
                  style={{ width: "auto" }}
                  onClick={() => void toggleExpand(r.studentId)}
                >
                  {expandedByStudentId[r.studentId] ? "Hide" : "Expand"}
                </button>
                <Link className="button" style={{ width: "auto", background: "#7c3aed" }} to={`/teacher/students/${r.studentId}/360`}>
                  360°
                </Link>
                <details>
                  <summary style={{ cursor: "pointer" }}>Actions</summary>
                  <div style={{ display: "grid", gap: 6, paddingTop: 8 }}>
                    <Link className="button secondary" style={{ width: "auto" }} to={`/teacher/notes?studentId=${encodeURIComponent(r.studentId)}`}>
                      Notes
                    </Link>
                    <Link className="button secondary" style={{ width: "auto" }} to={`/teacher/students/${r.studentId}/materials`}>
                      Materials
                    </Link>
                    <Link className="button secondary" style={{ width: "auto" }} to={`/teacher/students/${r.studentId}/attempts`}>
                      Attempts
                    </Link>
                    <Link className="button secondary" style={{ width: "auto" }} to={`/teacher/students/${r.studentId}/practice-report`}>
                      Practice Report
                    </Link>
                    <Link className="button secondary" style={{ width: "auto" }} to={`/teacher/students/${r.studentId}/attendance`}>
                      Attendance
                    </Link>
                  </div>
                </details>
              </div>
            )
          },
          {
            key: "quickPerformance",
            header: "Quick Performance",
            render: (r) => {
              const trendTone = r.trend === "UP" ? "good" : r.trend === "DOWN" ? "warn" : "neutral";
              const riskTone = r.riskLevel === "AT_RISK" ? "risk" : "good";

              return (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxWidth: 250 }}>
                  {renderCompactBadge(`Score ${formatPercent(r.averageScore)}`, "neutral")}
                  {renderCompactBadge(`Trend ${r.trend || "--"}`, trendTone)}
                  {renderCompactBadge(`Att ${formatPercent(r.attendancePercent)}`, "neutral")}
                  {renderCompactBadge(`Wk ${formatPercent(r.worksheetCompletionPercent)}`, "neutral")}
                  {renderCompactBadge(r.riskLevel === "AT_RISK" ? "At Risk" : "Healthy", riskTone)}
                </div>
              );
            }
          }
        ]}
        rows={pageRows}
        keyField="studentId"
      />

      {pageRows.filter((row) => expandedByStudentId[row.studentId]).map((row) => {
        const student360Data = student360ById[row.studentId];
        const timelineEvents = buildTimelineEvents(student360Data);
        const weakTopicData = weakTopicAnalysisById[row.studentId] || { topics: [], immediateAttention: [] };
        const parentSummary = student360Data && !student360Data.__error
          ? (parentSummaryByStudentId[row.studentId] || buildParentCommunicationSummary({
            row,
            student360: student360Data,
            weakTopic: weakTopicData,
            timelineEvents
          }))
          : null;

        return <div key={`expanded-${row.studentId}`} className="card" style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            {row.fullName} ({row.admissionNo || "--"})
          </div>
          {student360LoadingById[row.studentId] ? (
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Loading Student 360...</div>
          ) : student360Data?.__error ? (
            <div className="error" style={{ fontSize: 12 }}>{student360Data.__error}</div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase" }}>Risk Level</div>
                  <div style={{ fontWeight: 700 }}>{student360Data?.risk?.level || "--"}</div>
                </div>
                <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase" }}>Accuracy (Last 5)</div>
                  <div style={{ fontWeight: 700 }}>
                    {student360Data?.performance?.accuracyLast5 !== undefined && student360Data?.performance?.accuracyLast5 !== null
                      ? `${Math.round(Number(student360Data?.performance?.accuracyLast5 || 0))}%`
                      : "--"}
                  </div>
                </div>
                <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase" }}>Attendance (30d)</div>
                  <div style={{ fontWeight: 700 }}>
                    {student360Data?.attendance?.last30?.rate !== undefined && student360Data?.attendance?.last30?.rate !== null
                      ? `${student360Data?.attendance?.last30?.rate}%`
                      : "--"}
                  </div>
                </div>
                <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase" }}>Overdue Fees</div>
                  <div style={{ fontWeight: 700 }}>
                    {student360Data?.fees?.overdueAmount !== undefined && student360Data?.fees?.overdueAmount !== null
                      ? `INR ${student360Data?.fees?.overdueAmount}`
                      : "--"}
                  </div>
                </div>
              </div>

              <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 10, display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>Student Timeline</div>
                {timelineEvents.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>No timeline activity yet.</div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {timelineEvents.map((event) => (
                      <div
                        key={event.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "22px 1fr auto",
                          gap: 8,
                          alignItems: "start",
                          borderBottom: "1px dashed var(--color-border)",
                          paddingBottom: 8
                        }}
                      >
                        <div aria-hidden="true" style={{ fontSize: 15, lineHeight: "20px" }}>{event.icon}</div>
                        <div style={{ display: "grid", gap: 2 }}>
                          <div style={{ fontSize: 12, fontWeight: 700 }}>{event.title}</div>
                          {event.description ? <div style={{ fontSize: 12 }}>{event.description}</div> : null}
                          {event.subDescription ? <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{event.subDescription}</div> : null}
                        </div>
                        <div style={{ display: "grid", justifyItems: "end", gap: 2 }}>
                          <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{event.dateText}</div>
                          <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{event.relativeText}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 10, display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>Weak Topic Analysis</div>

                {weakTopicLoadingById[row.studentId] ? (
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Loading weak topic analysis...</div>
                ) : (
                  <>
                    <div style={{ border: "1px solid #fecaca", borderRadius: 8, padding: 8, background: "#fff7f7" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#991b1b", marginBottom: 4 }}>Needs Immediate Attention</div>
                      {weakTopicData.immediateAttention.length > 0 ? (
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                          {weakTopicData.immediateAttention.map((item) => (
                            <li key={`attention-${row.studentId}-${item.topic}`}>{item.topic}</li>
                          ))}
                        </ul>
                      ) : (
                        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>No topics under 60% right now.</div>
                      )}
                    </div>

                    {weakTopicData.topics.length === 0 ? (
                      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>No topic performance data available yet.</div>
                    ) : (
                      <div style={{ display: "grid", gap: 8 }}>
                        {weakTopicData.topics.map((topicItem) => (
                          <div key={`${row.studentId}-${topicItem.topic}`} style={{ display: "grid", gap: 4 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                              <div style={{ fontSize: 12, fontWeight: 600 }}>{topicItem.topic}</div>
                              <div style={{ fontSize: 12, color: topicItem.status.color, fontWeight: 700 }}>
                                {topicItem.accuracy === null ? "No data" : `${topicItem.accuracy.toFixed(1)}%`}
                              </div>
                            </div>
                            <div
                              role="progressbar"
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={topicItem.accuracy === null ? 0 : Math.round(topicItem.accuracy)}
                              style={{
                                width: "100%",
                                height: 10,
                                borderRadius: 999,
                                background: topicItem.status.track,
                                overflow: "hidden"
                              }}
                            >
                              <div
                                style={{
                                  width: `${topicItem.accuracy === null ? 0 : topicItem.accuracy}%`,
                                  height: "100%",
                                  borderRadius: 999,
                                  background: topicItem.status.color,
                                  transition: "width 120ms ease-out"
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 10, display: "grid", gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>Parent Communication Summary</div>

                {!parentSummary?.hasData ? (
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Summary is unavailable until Student 360 data is loaded.</div>
                ) : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
                      <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 8, fontSize: 12 }}>
                        <div><strong>Student:</strong> {parentSummary.studentName}</div>
                        <div><strong>Batch:</strong> {parentSummary.batchName}</div>
                        <div><strong>Level:</strong> {parentSummary.levelLabel}</div>
                      </div>
                      <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 8, fontSize: 12 }}>
                        <div><strong>Overall Progress:</strong> {parentSummary.overallProgress}</div>
                        <div><strong>Attendance:</strong> {parentSummary.attendancePercent === null ? "--" : `${parentSummary.attendancePercent.toFixed(1)}%`}</div>
                        <div style={{ color: "var(--color-text-muted)" }}>{parentSummary.attendanceComment}</div>
                      </div>
                      <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 8, fontSize: 12 }}>
                        <div><strong>Average Score:</strong> {parentSummary.averageScore === null ? "--" : `${parentSummary.averageScore.toFixed(1)}%`}</div>
                        <div><strong>Trend:</strong> {parentSummary.trend}</div>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
                      <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Strong Areas</div>
                        {parentSummary.strongAreas.length ? (
                          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                            {parentSummary.strongAreas.slice(0, 3).map((item) => (
                              <li key={`strong-${row.studentId}-${item}`}>{item}</li>
                            ))}
                          </ul>
                        ) : (
                          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>No clear strong area signals yet.</div>
                        )}
                      </div>

                      <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Needs Improvement</div>
                        {parentSummary.needsImprovement.length ? (
                          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                            {parentSummary.needsImprovement.slice(0, 3).map((item) => (
                              <li key={`improve-${row.studentId}-${item}`}>{item}</li>
                            ))}
                          </ul>
                        ) : (
                          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>No major academic gaps currently.</div>
                        )}
                      </div>
                    </div>

                    <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 8, fontSize: 12, display: "grid", gap: 4 }}>
                      <div><strong>Promotion Status:</strong> {parentSummary.promotionStatus.label}</div>
                      <div style={{ color: "var(--color-text-muted)" }}>{parentSummary.promotionStatus.reason}</div>
                    </div>

                    <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Teacher Recommendation</div>
                      {parentSummary.recommendations.length ? (
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                          {parentSummary.recommendations.slice(0, 4).map((item) => (
                            <li key={`recommend-${row.studentId}-${item}`}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Continue current plan and monitor progress.</div>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <button
                        className="button secondary"
                        style={{ width: "auto" }}
                        type="button"
                        onClick={() => void handleCopyParentSummary(row.studentId, parentSummary)}
                      >
                        Copy Summary
                      </button>
                      <button
                        className="button secondary"
                        style={{ width: "auto" }}
                        type="button"
                        onClick={() => handlePrintParentSummary(parentSummary)}
                      >
                        Print Summary
                      </button>
                      <button
                        className="button secondary"
                        style={{ width: "auto" }}
                        type="button"
                        onClick={() => handleExportParentSummaryPdf(parentSummary)}
                      >
                        Export PDF
                      </button>
                      {copiedParentSummaryByStudentId[row.studentId] ? (
                        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{copiedParentSummaryByStudentId[row.studentId]}</span>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      })}

      <PaginationBar
        limit={limit}
        offset={offset}
        count={pageRows.length}
        total={total}
        onChange={(next) => {
          setOffset(next.offset);
        }}
      />
    </section>
  );
}

export { TeacherStudentsPage };
