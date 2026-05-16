import { asyncHandler } from "../utils/async-handler.js";
import {
  getUserNotifications,
  markAllAsRead,
  markAsRead
} from "../services/notification.service.js";
import {
  getOperationalUnreadCounts,
  listOperationalNotifications,
  markAllOperationalNotificationsRead,
  markOperationalNotificationRead
} from "../services/operational-notification.service.js";
import {
  runAllAutomationRules,
  cleanupExpiredNotifications,
  getUserPreferences,
  updateUserPreferencesBulk
} from "../services/notification-automation.service.js";
import {
  assertBusinessPartnerFranchiseAccess,
  validateCenterAccess
} from "../services/bp-scope.service.js";

function parseBooleanQuery(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.floor(parsed));
}

function normalizeOperationalFilterValue(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return normalized || null;
}

function normalizeOperationalSortBy(value) {
  return value === "createdAt" ? "createdAt" : "lastTriggeredAt";
}

function normalizeOperationalSortOrder(value) {
  return String(value || "").trim().toLowerCase() === "asc" ? "asc" : "desc";
}

async function normalizeOperationalFilters(req) {
  const filters = {
    limit: Math.min(100, Math.max(1, parsePositiveInteger(req.query.limit, 20) || 20)),
    offset: parsePositiveInteger(req.query.offset, 0),
    page: Math.max(1, parsePositiveInteger(req.query.page, 1) || 1),
    unread: parseBooleanQuery(req.query.unread),
    severity: normalizeOperationalFilterValue(req.query.severity),
    category: normalizeOperationalFilterValue(req.query.category),
    sortBy: normalizeOperationalSortBy(req.query.sortBy),
    sortOrder: normalizeOperationalSortOrder(req.query.sortOrder),
    status: req.query.status ? normalizeOperationalFilterValue(req.query.status) : undefined,
    businessPartnerId: req.bpScope.businessPartner.id
  };

  if (req.query.franchiseId) {
    filters.franchiseId = assertBusinessPartnerFranchiseAccess({
      tenantId: req.auth.tenantId,
      bpScope: req.bpScope,
      franchiseId: req.query.franchiseId
    });
  }

  if (req.query.centerId) {
    const centerId = String(req.query.centerId).trim();
    const hasCenterAccess = await validateCenterAccess({
      tenantId: req.auth.tenantId,
      businessPartnerId: req.bpScope.businessPartner.id,
      centerId,
      bpScope: req.bpScope
    });

    if (!hasCenterAccess) {
      const error = new Error("Center not found");
      error.statusCode = 404;
      error.errorCode = "CENTER_NOT_FOUND";
      throw error;
    }

    filters.centerId = centerId;
  }

  if (filters.offset > 0) {
    filters.page = Math.floor(filters.offset / filters.limit) + 1;
  }

  return filters;
}

const listNotifications = asyncHandler(async (req, res) => {
  const data = await getUserNotifications(req.auth.userId, req.auth.tenantId, {
    page: req.query.page,
    offset: req.query.offset,
    limit: req.query.limit,
    unread: req.query.unread,
    category: req.query.category,
    priority: req.query.priority
  });

  return res.apiSuccess("Notifications fetched", data);
});

const markNotificationRead = asyncHandler(async (req, res) => {
  const updated = await markAsRead(String(req.params.id || "").trim(), req.auth.userId, req.auth.tenantId);

  return res.apiSuccess("Notification marked as read", updated);
});

const markAllNotificationsRead = asyncHandler(async (req, res) => {
  const result = await markAllAsRead(req.auth.userId, req.auth.tenantId);

  return res.apiSuccess("All notifications marked as read", {
    updatedCount: result.count
  });
});

const getNotificationPreferences = asyncHandler(async (req, res) => {
  const prefs = await getUserPreferences(req.auth.userId, req.auth.tenantId);
  return res.apiSuccess("Notification preferences fetched", prefs);
});

const updateNotificationPreferences = asyncHandler(async (req, res) => {
  const { preferences } = req.body;
  if (!Array.isArray(preferences)) {
    return res.status(400).json({ success: false, message: "preferences must be an array" });
  }
  const results = await updateUserPreferencesBulk(req.auth.userId, req.auth.tenantId, preferences);
  return res.apiSuccess("Notification preferences updated", { updated: results.length });
});

const triggerAutomation = asyncHandler(async (req, res) => {
  const results = await runAllAutomationRules(req.auth.tenantId);
  return res.apiSuccess("Automation rules executed", results);
});

const triggerCleanup = asyncHandler(async (req, res) => {
  const result = await cleanupExpiredNotifications(req.auth.tenantId);
  return res.apiSuccess("Expired notifications cleaned up", result);
});

const listOperationalPartnerNotifications = asyncHandler(async (req, res) => {
  const filters = await normalizeOperationalFilters(req);
  const data = await listOperationalNotifications({
    tenantId: req.auth.tenantId,
    recipientUserId: req.auth.userId,
    filters
  });

  return res.apiSuccess("Operational notifications fetched", data);
});

const getOperationalPartnerUnreadCount = asyncHandler(async (req, res) => {
  const filters = await normalizeOperationalFilters(req);
  const data = await getOperationalUnreadCounts({
    tenantId: req.auth.tenantId,
    recipientUserId: req.auth.userId,
    filters,
    includeGroups: true
  });

  return res.apiSuccess("Operational unread counts fetched", data);
});

const markOperationalPartnerNotificationRead = asyncHandler(async (req, res) => {
  const notificationId = String(req.params.id || "").trim();
  if (!notificationId) {
    return res.apiError(400, "notification id is required", "VALIDATION_ERROR");
  }

  const updated = await markOperationalNotificationRead({
    tenantId: req.auth.tenantId,
    notificationId,
    recipientUserId: req.auth.userId
  });

  return res.apiSuccess("Operational notification marked as read", updated);
});

const markAllOperationalPartnerNotificationsRead = asyncHandler(async (req, res) => {
  const filters = await normalizeOperationalFilters(req);
  const result = await markAllOperationalNotificationsRead({
    tenantId: req.auth.tenantId,
    recipientUserId: req.auth.userId,
    filters
  });

  return res.apiSuccess("Operational notifications marked as read", result);
});

export {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getNotificationPreferences,
  updateNotificationPreferences,
  triggerAutomation,
  triggerCleanup,
  listOperationalPartnerNotifications,
  getOperationalPartnerUnreadCount,
  markOperationalPartnerNotificationRead,
  markAllOperationalPartnerNotificationsRead
};
