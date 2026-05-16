import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead
} from "../services/notificationService";
import { useAuth } from "../hooks/useAuth";
import { getFriendlyErrorMessage } from "../utils/apiErrors";
import { isTokenExpiringSoon } from "../utils/jwt";
import {
  getOperationalNotifications,
  getOperationalUnreadCounts,
  markAllOperationalNotificationsRead,
  markOperationalNotificationRead
} from "../modules/common/services/operationalNotificationService";
import {
  getOperationalLocationLabel,
  resolveOperationalDeepLink,
  timeAgo
} from "../modules/common/operationalNotifications.shared";

function NotificationBell() {
  const navigate = useNavigate();
  const { accessToken, isAuthenticated, mustChangePassword, refreshSession, authBootstrapPending, role } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [operationalItems, setOperationalItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasCriticalUnread, setHasCriticalUnread] = useState(false);
  const [hasOperationalUnread, setHasOperationalUnread] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);
  const unauthorizedRef = useRef(false);
  const refreshInFlightRef = useRef(null);
  const canUseOperationalNotifications = role === "BP";

  const fetchNotifications = useCallback(async () => {
    if (authBootstrapPending || !isAuthenticated || mustChangePassword || unauthorizedRef.current) {
      return;
    }

    try {
      if (isTokenExpiringSoon(accessToken, 60000)) {
        refreshInFlightRef.current = refreshInFlightRef.current || refreshSession();
        await refreshInFlightRef.current;
        refreshInFlightRef.current = null;
      }

      setLoading(true);
      const notificationsRes = await listNotifications({ limit: 10 });
      const [operationalUnreadCounts, operationalList] = canUseOperationalNotifications
        ? await Promise.all([
            getOperationalUnreadCounts(),
            getOperationalNotifications({ limit: 5, unread: true })
          ])
        : [{ totalUnread: 0, criticalUnread: 0, highUnread: 0 }, { items: [] }];
      const data = notificationsRes?.data?.data;
      const list = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      const genericUnreadCount =
        typeof data?.unreadCount === "number"
          ? data.unreadCount
          : list.filter((n) => !n.isRead).length;

      setItems(list.map((item) => ({ ...item, notificationKind: "generic", timestamp: item.createdAt || null })));
      setOperationalItems(operationalList.items || []);
      setUnreadCount(genericUnreadCount + (operationalUnreadCounts.totalUnread || 0));
      setHasOperationalUnread(canUseOperationalNotifications && (operationalUnreadCounts.totalUnread || 0) > 0);
      const hasCritical =
        list.some((n) => !n.isRead && (n.priority === "CRITICAL" || n.priority === "HIGH"))
        || (canUseOperationalNotifications && (operationalUnreadCounts.criticalUnread || 0) > 0)
        || (canUseOperationalNotifications && (operationalUnreadCounts.highUnread || 0) > 0);
      setHasCriticalUnread(hasCritical);
    } catch (error) {
      refreshInFlightRef.current = null;
      if (error?.response?.status === 401) {
        unauthorizedRef.current = true;
        setOpen(false);
        setItems([]);
        setOperationalItems([]);
        setUnreadCount(0);
        setHasOperationalUnread(false);
      }
      // silent
    } finally {
      setLoading(false);
    }
  }, [accessToken, authBootstrapPending, canUseOperationalNotifications, isAuthenticated, mustChangePassword, refreshSession]);

  useEffect(() => {
    if (!authBootstrapPending && isAuthenticated && !mustChangePassword) {
      unauthorizedRef.current = false;
      return;
    }

    setOpen(false);
    setItems([]);
    setOperationalItems([]);
    setUnreadCount(0);
    setHasCriticalUnread(false);
    setHasOperationalUnread(false);
    setLoading(false);
  }, [authBootstrapPending, isAuthenticated, mustChangePassword]);

  // Poll unread count every 60s
  useEffect(() => {
    if (authBootstrapPending || !isAuthenticated || mustChangePassword) {
      return;
    }

    fetchNotifications();
    const id = setInterval(fetchNotifications, 60000);
    return () => clearInterval(id);
  }, [authBootstrapPending, fetchNotifications, isAuthenticated, mustChangePassword]);

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
    if (authBootstrapPending || !isAuthenticated || mustChangePassword) {
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

  const handleOperationalClick = async (item) => {
    try {
      if (item.isUnread) {
        await markOperationalNotificationRead(item.notificationId);
        setOperationalItems((prev) =>
          prev.map((currentItem) =>
            currentItem.notificationId === item.notificationId
              ? { ...currentItem, isUnread: false, readAt: new Date().toISOString() }
              : currentItem
          )
        );
        setUnreadCount((count) => Math.max(0, count - 1));
      }

      navigate(resolveOperationalDeepLink(item));
      setOpen(false);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to open operational notification.");
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await Promise.all([
        markAllNotificationsRead(),
        canUseOperationalNotifications ? markAllOperationalNotificationsRead() : Promise.resolve()
      ]);
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setOperationalItems((prev) => prev.map((item) => ({ ...item, isUnread: false, readAt: new Date().toISOString() })));
      setUnreadCount(0);
      setHasCriticalUnread(false);
      setHasOperationalUnread(false);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to mark all notifications as read.");
    }
  };

  const combinedItems = [...operationalItems, ...items]
    .sort((left, right) => new Date(right.timestamp || right.createdAt || 0).getTime() - new Date(left.timestamp || left.createdAt || 0).getTime())
    .slice(0, 10);

  return (
    <div className="notif-bell-wrap" ref={dropdownRef}>
      <button
        className={`notif-bell-btn ${hasOperationalUnread ? "notif-bell-btn--operational" : ""}`}
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
          <span className={`notif-bell-badge ${hasCriticalUnread ? "notif-bell-badge--critical" : ""}`}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
        {hasOperationalUnread && <span className="notif-bell-operational-indicator" aria-hidden="true" />}
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
            {loading && combinedItems.length === 0 && (
              <div className="notif-empty">Loading...</div>
            )}
            {!loading && combinedItems.length === 0 && (
              <div className="notif-empty">No notifications</div>
            )}
            {combinedItems.map((item) => {
              const isOperational = item.notificationKind === "operational";
              const isUnread = isOperational ? item.isUnread : !item.isRead;
              const severity = isOperational ? item.severity : item.priority;
              const locationLabel = isOperational ? getOperationalLocationLabel(item) : null;

              return (
                <div
                  key={`${item.notificationKind}:${item.notificationId || item.id}`}
                  className={`notif-item ${isUnread ? "notif-item--unread" : ""} ${severity === "CRITICAL" ? "notif-item--critical" : severity === "HIGH" ? "notif-item--high" : ""}`}
                  onClick={() => (isOperational ? handleOperationalClick(item) : !item.isRead && handleMarkRead(item.id))}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") {
                      return;
                    }
                    if (isOperational) {
                      handleOperationalClick(item);
                    } else if (!item.isRead) {
                      handleMarkRead(item.id);
                    }
                  }}
                >
                  <div className="notif-item__top">
                    <div className="notif-item__title">{item.title || item.type}</div>
                    {severity && severity !== "NORMAL" && (
                      <span className={`notif-priority-dot notif-priority-dot--${severity.toLowerCase()}`} />
                    )}
                    {isOperational && <span className="notif-item__kind">Ops</span>}
                  </div>
                  <div className="notif-item__msg">{item.message}</div>
                  <div className="notif-item__meta">
                    <span className="notif-item__time">{timeAgo(item.timestamp || item.createdAt)}</span>
                    {item.category && item.category !== "SYSTEM" && (
                      <span className="notif-item__cat">{item.category.toLowerCase()}</span>
                    )}
                    {locationLabel && <span className="notif-item__cat">{locationLabel}</span>}
                  </div>
                </div>
              );
            })}
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
