const WARNING_UTILIZATION_PERCENT = 80;
const CRITICAL_UTILIZATION_PERCENT = 95;

function roundPercent(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function computeUtilizationPercent({ configured, used, limit }) {
  if (!configured) {
    return null;
  }

  if (limit <= 0) {
    return used > 0 ? 100 : 0;
  }

  return roundPercent((used / limit) * 100, 1);
}

function classifyUsageState({ configured, limit, used }) {
  if (!configured) {
    return "unmanaged";
  }

  if (used > limit) {
    return "over";
  }

  if (limit <= 0) {
    return "critical";
  }

  const utilizationPercent = computeUtilizationPercent({ configured, used, limit });
  if (utilizationPercent >= CRITICAL_UTILIZATION_PERCENT) {
    return "critical";
  }
  if (utilizationPercent >= WARNING_UTILIZATION_PERCENT) {
    return "warning";
  }
  return "healthy";
}

function statePriority(state) {
  switch (state) {
    case "over":
      return 4;
    case "critical":
      return 3;
    case "warning":
      return 2;
    case "healthy":
      return 1;
    default:
      return 0;
  }
}

function buildUsageMetric({ label, configured, limit, used, allowOverAllocation }) {
  const normalizedLimit = configured ? Number(limit || 0) : null;
  const normalizedUsed = Number(used || 0);
  const utilizationPercent = computeUtilizationPercent({
    configured,
    limit: normalizedLimit || 0,
    used: normalizedUsed
  });
  const state = classifyUsageState({
    configured,
    limit: normalizedLimit || 0,
    used: normalizedUsed
  });
  const overBy = configured ? Math.max(normalizedUsed - (normalizedLimit || 0), 0) : 0;

  return {
    label,
    configured,
    used: normalizedUsed,
    limit: configured ? normalizedLimit || 0 : null,
    remaining: configured ? Math.max((normalizedLimit || 0) - normalizedUsed, 0) : null,
    utilizationPercent,
    overBy,
    state,
    isWarning: state === "warning",
    isCritical: state === "critical" || state === "over",
    isOverAllocated: overBy > 0,
    allowOverAllocation: Boolean(allowOverAllocation)
  };
}

function deriveRecommendedAction({ configured, teacherUsage, studentUsage }) {
  if (!configured) {
    return "Configure capacity";
  }

  if (studentUsage.isOverAllocated) {
    return "Raise student capacity";
  }

  if (teacherUsage.isOverAllocated) {
    return "Raise teacher capacity";
  }

  if (studentUsage.state === "critical") {
    return "Review student seats";
  }

  if (teacherUsage.state === "critical") {
    return "Review teacher seats";
  }

  if (studentUsage.state === "warning") {
    return "Plan student upgrade";
  }

  if (teacherUsage.state === "warning") {
    return "Plan teacher upgrade";
  }

  return "Capacity healthy";
}

function deriveOverallState(teacherUsage, studentUsage) {
  return statePriority(teacherUsage.state) >= statePriority(studentUsage.state)
    ? teacherUsage.state
    : studentUsage.state;
}

function buildCenterCapacitySnapshot({ center, capacity, teacherCount, studentCount, auditHistory = [] }) {
  const configured = Boolean(capacity);
  const allowOverAllocation = Boolean(capacity?.allowOverAllocation);
  const teacherUsage = buildUsageMetric({
    label: "Teachers",
    configured,
    limit: capacity?.maxTeachers,
    used: teacherCount,
    allowOverAllocation
  });
  const studentUsage = buildUsageMetric({
    label: "Students",
    configured,
    limit: capacity?.maxStudents,
    used: studentCount,
    allowOverAllocation
  });
  const overallState = deriveOverallState(teacherUsage, studentUsage);

  return {
    center: {
      id: center.id,
      code: center.code,
      name: center.displayName || center.name,
      franchiseId: center.franchiseProfile?.id || null,
      franchiseName: center.franchiseProfile?.displayName || center.franchiseProfile?.name || null,
      hierarchyNodeId: center.authUser?.hierarchyNodeId || null
    },
    configured,
    allowOverAllocation,
    capacity: configured
      ? {
          id: capacity.id,
          maxTeachers: capacity.maxTeachers,
          maxStudents: capacity.maxStudents,
          allowOverAllocation,
          createdAt: capacity.createdAt,
          updatedAt: capacity.updatedAt
        }
      : null,
    usage: {
      teachers: teacherUsage,
      students: studentUsage
    },
    summary: {
      overallState,
      maxUtilizationPercent: Math.max(
        teacherUsage.utilizationPercent ?? 0,
        studentUsage.utilizationPercent ?? 0
      ),
      warningCount: Number(teacherUsage.isWarning) + Number(studentUsage.isWarning),
      criticalCount: Number(teacherUsage.isCritical) + Number(studentUsage.isCritical),
      overAllocated: teacherUsage.isOverAllocated || studentUsage.isOverAllocated,
      recommendedAction: deriveRecommendedAction({ configured, teacherUsage, studentUsage })
    },
    auditHistory
  };
}

function summarizeCapacityCollection(items = []) {
  return items.reduce(
    (summary, item) => {
      const state = item?.summary?.overallState || "unmanaged";
      summary.totalCenters += 1;
      if (item.configured) {
        summary.configuredCount += 1;
      } else {
        summary.unmanagedCount += 1;
      }

      if (state === "warning") {
        summary.warningCount += 1;
      }
      if (state === "critical") {
        summary.criticalCount += 1;
      }
      if (state === "over") {
        summary.criticalCount += 1;
        summary.overAllocatedCount += 1;
      }

      return summary;
    },
    {
      totalCenters: 0,
      configuredCount: 0,
      unmanagedCount: 0,
      warningCount: 0,
      criticalCount: 0,
      overAllocatedCount: 0,
      thresholds: {
        warningUtilizationPercent: WARNING_UTILIZATION_PERCENT,
        criticalUtilizationPercent: CRITICAL_UTILIZATION_PERCENT
      }
    }
  );
}

export {
  CRITICAL_UTILIZATION_PERCENT,
  WARNING_UTILIZATION_PERCENT,
  buildCenterCapacitySnapshot,
  buildUsageMetric,
  summarizeCapacityCollection
};