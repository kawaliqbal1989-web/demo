import { useEffect, useState, useCallback } from "react";
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

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

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
  const limit = 25;

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

  return (
    <div className="notif-page">
      <div className="notif-page__header">
        <h2>Notifications</h2>
        <div className="notif-page__tabs">
          <button className={`notif-tab ${tab === "inbox" ? "notif-tab--active" : ""}`} onClick={() => setTab("inbox")}>Inbox</button>
          <button className={`notif-tab ${tab === "preferences" ? "notif-tab--active" : ""}`} onClick={() => setTab("preferences")}>Preferences</button>
        </div>
      </div>

      {tab === "preferences" ? (
        <NotificationPreferences />
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
