import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead
} from "../services/notificationService";
import { useAuth } from "../hooks/useAuth";
import { getFriendlyErrorMessage } from "../utils/apiErrors";
import { isTokenExpiringSoon } from "../utils/jwt";

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

function NotificationBell() {
  const { accessToken, isAuthenticated, mustChangePassword, refreshSession } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);
  const unauthorizedRef = useRef(false);
  const refreshInFlightRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated || mustChangePassword || unauthorizedRef.current) {
      return;
    }

    try {
      if (isTokenExpiringSoon(accessToken, 60000)) {
        refreshInFlightRef.current = refreshInFlightRef.current || refreshSession();
        await refreshInFlightRef.current;
        refreshInFlightRef.current = null;
      }

      setLoading(true);
      const res = await listNotifications({ limit: 10 });
      const data = res?.data?.data;
      const list = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      setItems(list);
      const count =
        typeof data?.unreadCount === "number"
          ? data.unreadCount
          : list.filter((n) => !n.isRead).length;
      setUnreadCount(count);
    } catch (error) {
      refreshInFlightRef.current = null;
      if (error?.response?.status === 401) {
        unauthorizedRef.current = true;
        setOpen(false);
        setItems([]);
        setUnreadCount(0);
      }
      // silent
    } finally {
      setLoading(false);
    }
  }, [accessToken, isAuthenticated, mustChangePassword, refreshSession]);

  useEffect(() => {
    if (isAuthenticated && !mustChangePassword) {
      unauthorizedRef.current = false;
      return;
    }

    setOpen(false);
    setItems([]);
    setUnreadCount(0);
  }, [isAuthenticated, mustChangePassword]);

  // Poll unread count every 60s
  useEffect(() => {
    if (!isAuthenticated || mustChangePassword) {
      return;
    }

    fetchNotifications();
    const id = setInterval(fetchNotifications, 60000);
    return () => clearInterval(id);
  }, [fetchNotifications, isAuthenticated, mustChangePassword]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function onClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", onClickOutside);
    }
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const handleToggle = () => {
    if (!isAuthenticated || mustChangePassword) {
      return;
    }

    if (!open) {
      fetchNotifications();
    }
    setOpen((v) => !v);
  };

  const handleMarkRead = async (id) => {
    try {
      await markNotificationRead(id);
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to mark notification as read.");
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to mark all notifications as read.");
    }
  };

  return (
    <div className="notif-bell-wrap" ref={dropdownRef}>
      <button
        className="notif-bell-btn"
        onClick={handleToggle}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        title="Notifications"
      >
        {/* Bell SVG icon */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="notif-bell-badge">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown__header">
            <strong>Notifications</strong>
            {unreadCount > 0 && (
              <button
                className="notif-mark-all"
                onClick={handleMarkAllRead}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="notif-dropdown__list">
            {loading && items.length === 0 && (
              <div className="notif-empty">Loading...</div>
            )}
            {!loading && items.length === 0 && (
              <div className="notif-empty">No notifications</div>
            )}
            {items.map((n) => (
              <div
                key={n.id}
                className={`notif-item ${n.isRead ? "" : "notif-item--unread"}`}
                onClick={() => !n.isRead && handleMarkRead(n.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && !n.isRead && handleMarkRead(n.id)}
              >
                <div className="notif-item__title">{n.title || n.type}</div>
                <div className="notif-item__msg">{n.message}</div>
                <div className="notif-item__time">{timeAgo(n.createdAt)}</div>
              </div>
            ))}
          </div>

          <Link
            to="/notifications"
            className="notif-dropdown__footer"
            onClick={() => setOpen(false)}
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}

export { NotificationBell };
