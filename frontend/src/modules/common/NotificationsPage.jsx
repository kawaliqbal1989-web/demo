import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead
} from "../../services/notificationService";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

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

function NotificationsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [filterUnread, setFilterUnread] = useState(false);
  const limit = 25;

  const fetchPage = useCallback(
    async (pageOffset, append = false) => {
      try {
        setLoading(true);
        setError("");
        const res = await listNotifications({
          limit,
          offset: pageOffset,
          unread: filterUnread || undefined
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
    [filterUnread]
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
    <div style={{ display: "grid", gap: 16, maxWidth: 720 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Notifications</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={filterUnread}
              onChange={(e) => setFilterUnread(e.target.checked)}
            />
            Unread only
          </label>
          <button
            className="button secondary"
            style={{ width: "auto", fontSize: 13, padding: "6px 12px" }}
            onClick={handleMarkAllRead}
          >
            Mark all read
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {loading && items.length === 0 && <LoadingState />}

      {!loading && items.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 32, color: "var(--color-text-muted)" }}>
          No notifications to show.
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {items.map((n) => (
          <div
            key={n.id}
            className="card"
            style={{
              display: "grid",
              gap: 4,
              padding: "12px 16px",
              borderLeft: n.isRead ? "3px solid transparent" : "3px solid #2563eb",
              cursor: n.isRead ? "default" : "pointer",
              opacity: n.isRead ? 0.7 : 1
            }}
            onClick={() => !n.isRead && handleMarkRead(n.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && !n.isRead && handleMarkRead(n.id)}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 14 }}>{n.title || n.type}</strong>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>{timeAgo(n.createdAt)}</span>
            </div>
            <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{n.message}</div>
            {n.entityType && (
              <div style={{ fontSize: 11, color: "var(--color-text-faint)" }}>
                {n.entityType}{n.entityId ? `: ${n.entityId}` : ""}
              </div>
            )}
          </div>
        ))}
      </div>

      {hasMore && items.length > 0 && (
        <div style={{ textAlign: "center" }}>
          <button
            className="button secondary"
            style={{ width: "auto" }}
            onClick={loadMore}
            disabled={loading}
          >
            {loading ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

export { NotificationsPage };
