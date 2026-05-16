import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead
} from "../../services/notificationService";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { PriorityBadge, CategoryBadge, NotificationPreferences } from "../../components/NotificationWidgets";
import { useAuth } from "../../hooks/useAuth";
import { useOperationalNotifications } from "./hooks/useOperationalNotifications";
import { useOperationalUnreadCounts } from "./hooks/useOperationalUnreadCounts";
import {
  markAllOperationalNotificationsRead,
  markOperationalNotificationRead
} from "./services/operationalNotificationService";
import {
  OPERATIONAL_CATEGORY_OPTIONS,
  OPERATIONAL_SEVERITY_OPTIONS,
  getOperationalLocationLabel,
  getOperationalMetricSummary,
  groupOperationalNotifications,
  resolveOperationalDeepLink,
  timeAgo
} from "./operationalNotifications.shared";

const CATEGORY_OPTIONS = [
  { value: "", label: "All Categories" },
  { value: "RISK", label: "Risk & Safety" },
  { value: "FINANCE", label: "Financial" },
  { value: "OPERATIONS", label: "Operations" },
  { value: "WORKFLOW", label: "Workflow" },
  { value: "ACADEMIC", label: "Academic" },
  { value: "SYSTEM", label: "System" }
];

const PRIORITY_OPTIONS = [
  { value: "", label: "All Priorities" },
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "NORMAL", label: "Normal" },
  { value: "LOW", label: "Low" }
];

function NotificationsPage() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [filterUnread, setFilterUnread] = useState(false);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [tab, setTab] = useState("inbox");
  const [opFilterUnread, setOpFilterUnread] = useState(true);
  const [opFilterCategory, setOpFilterCategory] = useState("");
  const [opFilterSeverity, setOpFilterSeverity] = useState("");
  const [opFilterFranchiseId, setOpFilterFranchiseId] = useState("");
  const [opFilterCenterId, setOpFilterCenterId] = useState("");
  const [opOffset, setOpOffset] = useState(0);
  const [opRefreshTick, setOpRefreshTick] = useState(0);
  const limit = 25;

  const operationalFilters = useMemo(
    () => ({
      limit,
      offset: opOffset,
      unread: opFilterUnread,
      severity: opFilterSeverity || undefined,
      category: opFilterCategory || undefined,
      franchiseId: opFilterFranchiseId || undefined,
      centerId: opFilterCenterId || undefined
    }),
    [limit, opOffset, opFilterUnread, opFilterSeverity, opFilterCategory, opFilterFranchiseId, opFilterCenterId]
  );

  const operationalResource = useOperationalNotifications(operationalFilters, {
    enabled: role === "BP" && tab === "operational",
    refreshTick: opRefreshTick
  });
  const operationalUnread = useOperationalUnreadCounts({}, {
    enabled: role === "BP",
    pollIntervalMs: role === "BP" ? 60000 : 0
  });

  const operationalGroups = useMemo(
    () => groupOperationalNotifications(operationalResource.items),
    [operationalResource.items]
  );
  const operationalFranchiseOptions = useMemo(() => {
    const byId = new Map();
    for (const item of operationalResource.items) {
      if (item.franchiseId && item.franchiseLabel) {
        byId.set(item.franchiseId, item.franchiseLabel);
      }
    }
    return Array.from(byId.entries()).map(([value, label]) => ({ value, label }));
  }, [operationalResource.items]);
  const operationalCenterOptions = useMemo(() => {
    const byId = new Map();
    for (const item of operationalResource.items) {
      if (item.centerId && item.centerLabel) {
        byId.set(item.centerId, item.centerLabel);
      }
    }
    return Array.from(byId.entries()).map(([value, label]) => ({ value, label }));
  }, [operationalResource.items]);

  const fetchPage = useCallback(
    async (pageOffset, append = false) => {
      try {
        setLoading(true);
        setError("");
        const res = await listNotifications({
          limit,
          offset: pageOffset,
          unread: filterUnread || undefined,
          category: filterCategory || undefined,
          priority: filterPriority || undefined
        });
        const data = res?.data?.data;
        const list = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
        const total = typeof data?.total === "number" ? data.total : null;
        setItems((prev) => (append ? [...prev, ...list] : list));
        setHasMore(total === null ? list.length >= limit : pageOffset + list.length < total);
      } catch (err) {
        setError(getFriendlyErrorMessage(err) || "Failed to load notifications");
      } finally {
        setLoading(false);
      }
    },
    [filterUnread, filterCategory, filterPriority]
  );

  useEffect(() => {
    setOffset(0);
    fetchPage(0);
  }, [fetchPage]);

  useEffect(() => {
    setOpOffset(0);
  }, [opFilterUnread, opFilterSeverity, opFilterCategory, opFilterFranchiseId, opFilterCenterId]);

  const loadMore = () => {
    const next = offset + limit;
    setOffset(next);
    fetchPage(next, true);
  };

  const handleMarkRead = async (id) => {
    try {
      await markNotificationRead(id);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to mark notification as read.");
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to mark all notifications as read.");
    }
  };

  const handleOperationalMarkRead = async (notificationId, nextPath = null) => {
    try {
      await markOperationalNotificationRead(notificationId);
      setOpRefreshTick((tick) => tick + 1);
      operationalUnread.refresh();

      if (nextPath) {
        navigate(nextPath);
      }
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to mark operational notification as read.");
    }
  };

  const handleOperationalMarkAllRead = async () => {
    try {
      await markAllOperationalNotificationsRead(operationalFilters);
      setOpRefreshTick((tick) => tick + 1);
      operationalUnread.refresh();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to mark operational notifications as read.");
    }
  };

  return (
    <div className="notif-page">
      <div className="notif-page__header">
        <h2>Notifications</h2>
        <div className="notif-page__tabs">
          <button className={`notif-tab ${tab === "inbox" ? "notif-tab--active" : ""}`} onClick={() => setTab("inbox")}>Inbox</button>
          {role === "BP" && (
            <button className={`notif-tab ${tab === "operational" ? "notif-tab--active" : ""}`} onClick={() => setTab("operational")}>
              Operational
              {operationalUnread.counts.totalUnread > 0 ? ` (${operationalUnread.counts.totalUnread})` : ""}
            </button>
          )}
          <button className={`notif-tab ${tab === "preferences" ? "notif-tab--active" : ""}`} onClick={() => setTab("preferences")}>Preferences</button>
        </div>
      </div>

      {tab === "preferences" ? (
        <NotificationPreferences />
      ) : tab === "operational" && role === "BP" ? (
        <>
          <div className="notif-page__filters">
            <label className="notif-filter-check">
              <input type="checkbox" checked={opFilterUnread} onChange={(e) => setOpFilterUnread(e.target.checked)} />
              Unread only
            </label>
            <select className="notif-filter-select" value={opFilterSeverity} onChange={(e) => setOpFilterSeverity(e.target.value)}>
              {OPERATIONAL_SEVERITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <select className="notif-filter-select" value={opFilterCategory} onChange={(e) => setOpFilterCategory(e.target.value)}>
              {OPERATIONAL_CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <select className="notif-filter-select" value={opFilterFranchiseId} onChange={(e) => setOpFilterFranchiseId(e.target.value)}>
              <option value="">All Franchises</option>
              {operationalFranchiseOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <select className="notif-filter-select" value={opFilterCenterId} onChange={(e) => setOpFilterCenterId(e.target.value)}>
              <option value="">All Centers</option>
              {operationalCenterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <button className="button secondary notif-mark-all-btn" onClick={handleOperationalMarkAllRead}>
              Mark all read
            </button>
          </div>

          <div className="notif-page__ops-summary card">
            <div>
              <strong>{operationalUnread.counts.totalUnread}</strong>
              <span> unread operational alerts</span>
            </div>
            <div className="notif-page__ops-summary-meta">
              <span className="notif-priority notif-priority--critical">Critical {operationalUnread.counts.criticalUnread}</span>
              <span className="notif-priority notif-priority--high">High {operationalUnread.counts.highUnread}</span>
            </div>
          </div>

          {operationalResource.error && (
            <div className="card notif-page__empty">
              <p>{getFriendlyErrorMessage(operationalResource.error) || "Failed to load operational notifications."}</p>
              <button className="button secondary" onClick={operationalResource.retry}>Retry</button>
            </div>
          )}

          {operationalResource.loading && operationalResource.items.length === 0 && <LoadingState />}

          {!operationalResource.loading && !operationalResource.error && operationalResource.items.length === 0 && (
            <div className="card notif-page__empty">No operational notifications match the current filters.</div>
          )}

          <div className="notif-page__ops-groups">
            {operationalGroups.map((group) => (
              <section key={group.severity} className="notif-page__ops-group">
                <div className="notif-page__ops-group-header">
                  <h3>{group.severity}</h3>
                  <span>{group.items.length}</span>
                </div>
                <div className="notif-page__list">
                  {group.items.map((item) => {
                    const locationLabel = getOperationalLocationLabel(item);
                    const metricSummary = getOperationalMetricSummary(item);
                    const nextPath = resolveOperationalDeepLink(item);

                    return (
                      <div
                        key={item.notificationId}
                        className={`notif-page-item notif-page-item--operational card ${item.isUnread ? "notif-page-item--unread" : "notif-page-item--read"} ${item.severity === "CRITICAL" ? "notif-page-item--critical" : item.severity === "HIGH" ? "notif-page-item--high" : ""}`}
                      >
                        <div className="notif-page-item__header">
                          <strong className="notif-page-item__title">{item.title}</strong>
                          <div className="notif-page-item__badges">
                            <span className={`notif-priority notif-priority--${item.severity.toLowerCase()}`}>{item.severity}</span>
                            <CategoryBadge category={item.category} />
                          </div>
                        </div>
                        <div className="notif-page-item__message">{item.message}</div>
                        <div className="notif-page-item__footer">
                          <span className="notif-page-item__time">{timeAgo(item.timestamp)}</span>
                          {locationLabel && <span className="notif-page-item__entity">{locationLabel}</span>}
                          {metricSummary && <span className="notif-page-item__entity">{metricSummary}</span>}
                          {item.occurrenceCount > 1 && <span className="notif-page-item__entity">Escalated ×{item.occurrenceCount}</span>}
                          <button
                            className="notif-page-item__action"
                            onClick={() => handleOperationalMarkRead(item.notificationId, nextPath)}
                          >
                            Open alert →
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          {operationalResource.hasMore && operationalResource.items.length > 0 && (
            <div style={{ textAlign: "center", marginTop: 12 }}>
              <button className="button secondary" onClick={() => setOpOffset((current) => current + limit)} disabled={operationalResource.loading}>
                {operationalResource.loading ? "Loading..." : "Load more"}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="notif-page__filters">
            <label className="notif-filter-check">
              <input type="checkbox" checked={filterUnread} onChange={(e) => setFilterUnread(e.target.checked)} />
              Unread only
            </label>
            <select className="notif-filter-select" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
              {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select className="notif-filter-select" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
              {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button className="button secondary notif-mark-all-btn" onClick={handleMarkAllRead}>
              Mark all read
            </button>
          </div>

          {error && <div className="error">{error}</div>}
          {loading && items.length === 0 && <LoadingState />}

          {!loading && items.length === 0 && (
            <div className="card notif-page__empty">No notifications to show.</div>
          )}

          <div className="notif-page__list">
            {items.map((n) => (
              <div
                key={n.id}
                className={`notif-page-item card ${n.isRead ? "notif-page-item--read" : "notif-page-item--unread"} ${n.priority === "CRITICAL" ? "notif-page-item--critical" : n.priority === "HIGH" ? "notif-page-item--high" : ""}`}
                onClick={() => !n.isRead && handleMarkRead(n.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && !n.isRead && handleMarkRead(n.id)}
              >
                <div className="notif-page-item__header">
                  <strong className="notif-page-item__title">{n.title || n.type}</strong>
                  <div className="notif-page-item__badges">
                    <PriorityBadge priority={n.priority} />
                    <CategoryBadge category={n.category} />
                  </div>
                </div>
                <div className="notif-page-item__message">{n.message}</div>
                <div className="notif-page-item__footer">
                  <span className="notif-page-item__time">{timeAgo(n.createdAt)}</span>
                  {n.entityType && (
                    <span className="notif-page-item__entity">
                      {n.entityType}{n.entityId ? `: ${n.entityId.slice(0, 8)}…` : ""}
                    </span>
                  )}
                  {n.actionUrl && (
                    <a href={n.actionUrl} className="notif-page-item__action" onClick={e => e.stopPropagation()}>
                      View Details →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          {hasMore && items.length > 0 && (
            <div style={{ textAlign: "center", marginTop: 12 }}>
              <button className="button secondary" onClick={loadMore} disabled={loading}>
                {loading ? "Loading..." : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export { NotificationsPage };
