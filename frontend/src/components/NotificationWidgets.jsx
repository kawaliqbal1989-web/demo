import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  triggerAutomationRun,
  triggerAutomationCleanup
} from "../services/notificationService";
import { getFriendlyErrorMessage } from "../utils/apiErrors";

const NOTIFICATION_TYPES = [
  { type: "RISK_ALERT", label: "Student Risk Alerts", category: "RISK", description: "When a student is flagged as at-risk" },
  { type: "FEE_OVERDUE", label: "Fee Overdue Alerts", category: "FINANCE", description: "Overdue fee collection alerts" },
  { type: "FEE_UPCOMING", label: "Fee Due Reminders", category: "FINANCE", description: "Upcoming fee payment reminders" },
  { type: "ATTENDANCE_DROP", label: "Attendance Drop Alerts", category: "OPERATIONS", description: "Critical attendance anomalies" },
  { type: "STALE_BATCH", label: "Stale Batch Alerts", category: "OPERATIONS", description: "Batches with no recent sessions" },
  { type: "HEALTH_SCORE_DROP", label: "Center Health Alerts", category: "OPERATIONS", description: "When a center's health grade drops" },
  { type: "TEACHER_OVERLOAD", label: "Teacher Overload Alerts", category: "OPERATIONS", description: "When teachers are overloaded" },
  { type: "PROMOTION_READY", label: "Promotions", category: "WORKFLOW", description: "Student promotion notifications" },
  { type: "PROMOTION_CONFIRMED", label: "Promotion Confirmed", category: "WORKFLOW", description: "Confirmed student promotions" },
  { type: "COMPETITION_STAGE_UPDATE", label: "Competition Updates", category: "WORKFLOW", description: "Competition stage changes" },
  { type: "EXAM_CYCLE_CREATED", label: "Exam Cycles", category: "ACADEMIC", description: "New exam cycle announcements" },
  { type: "EXAM_RESULT_PUBLISHED", label: "Exam Results", category: "ACADEMIC", description: "Published exam results" },
  { type: "SYSTEM_BROADCAST", label: "System Broadcasts", category: "SYSTEM", description: "Platform-wide announcements" }
];

const CATEGORY_LABELS = {
  RISK: "Risk & Safety",
  FINANCE: "Financial",
  OPERATIONS: "Operations",
  WORKFLOW: "Workflow",
  ACADEMIC: "Academic",
  SYSTEM: "System"
};

const CATEGORY_ICONS = {
  RISK: "⚠️",
  FINANCE: "💰",
  OPERATIONS: "⚙️",
  WORKFLOW: "📋",
  ACADEMIC: "📚",
  SYSTEM: "🔔"
};

function NotificationPreferences() {
  const [prefs, setPrefs] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchPrefs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getNotificationPreferences();
      const data = res?.data?.data;
      const map = {};
      if (Array.isArray(data)) {
        data.forEach(p => { map[p.type] = p.enabled; });
      }
      setPrefs(map);
    } catch {
      // Default all to enabled
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPrefs(); }, [fetchPrefs]);

  const handleToggle = (type) => {
    setPrefs(prev => ({ ...prev, [type]: prev[type] === false ? true : false }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const preferences = NOTIFICATION_TYPES.map(nt => ({
        type: nt.type,
        enabled: prefs[nt.type] !== false
      }));
      await updateNotificationPreferences(preferences);
      toast.success("Notification preferences saved");
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  const categories = {};
  NOTIFICATION_TYPES.forEach(nt => {
    if (!categories[nt.category]) categories[nt.category] = [];
    categories[nt.category].push(nt);
  });

  if (loading) {
    return (
      <div className="notif-prefs card">
        <div className="notif-prefs__header">
          <h3>Notification Preferences</h3>
        </div>
        <div className="notif-prefs__loading">Loading preferences...</div>
      </div>
    );
  }

  return (
    <div className="notif-prefs card">
      <div className="notif-prefs__header">
        <h3>Notification Preferences</h3>
        <button className="button primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Preferences"}
        </button>
      </div>

      <div className="notif-prefs__body">
        {Object.entries(categories).map(([cat, types]) => (
          <div key={cat} className="notif-prefs__category">
            <div className="notif-prefs__cat-header">
              <span>{CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}</span>
            </div>
            {types.map(nt => (
              <label key={nt.type} className="notif-prefs__item">
                <div className="notif-prefs__item-text">
                  <span className="notif-prefs__item-label">{nt.label}</span>
                  <span className="notif-prefs__item-desc">{nt.description}</span>
                </div>
                <div className={`notif-toggle ${prefs[nt.type] !== false ? "notif-toggle--on" : ""}`}
                  onClick={() => handleToggle(nt.type)}
                  role="switch"
                  aria-checked={prefs[nt.type] !== false}
                  tabIndex={0}
                  onKeyDown={e => e.key === "Enter" && handleToggle(nt.type)}
                >
                  <div className="notif-toggle__track">
                    <div className="notif-toggle__thumb" />
                  </div>
                </div>
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Priority badge component for use in notification items
function PriorityBadge({ priority }) {
  if (!priority || priority === "NORMAL") return null;
  const cls = `notif-priority notif-priority--${priority.toLowerCase()}`;
  return <span className={cls}>{priority}</span>;
}

// Category badge component
function CategoryBadge({ category }) {
  if (!category) return null;
  const icon = CATEGORY_ICONS[category] || "🔔";
  return (
    <span className="notif-category-badge">
      {icon} {CATEGORY_LABELS[category] || category}
    </span>
  );
}

// Automation panel (superadmin only)
function AutomationPanel() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [cleaning, setCleaning] = useState(false);

  const handleRunAutomation = async () => {
    try {
      setRunning(true);
      setResults(null);
      const res = await triggerAutomationRun();
      const data = res?.data?.data;
      setResults(data);
      toast.success("Automation rules executed");
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Automation run failed");
    } finally {
      setRunning(false);
    }
  };

  const handleCleanup = async () => {
    try {
      setCleaning(true);
      const res = await triggerAutomationCleanup();
      const data = res?.data?.data;
      toast.success(`Cleaned up ${data?.deleted || 0} expired notifications`);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Cleanup failed");
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="automation-panel card">
      <div className="automation-panel__header">
        <h3>Notification Automation</h3>
        <span className="automation-panel__subtitle">Run automated notification rules across all centers</span>
      </div>

      <div className="automation-panel__actions">
        <button className="button primary" onClick={handleRunAutomation} disabled={running}>
          {running ? "Running..." : "Run Automation Rules"}
        </button>
        <button className="button secondary" onClick={handleCleanup} disabled={cleaning}>
          {cleaning ? "Cleaning..." : "Cleanup Expired"}
        </button>
      </div>

      {results && (
        <div className="automation-panel__results">
          <h4>Results</h4>
          <div className="automation-results-grid">
            {Object.entries(results).map(([rule, result]) => (
              <div key={rule} className={`automation-result-item ${result.ok ? "" : "automation-result-item--error"}`}>
                <span className="automation-result-item__name">{formatRuleName(rule)}</span>
                <span className="automation-result-item__status">
                  {result.ok ? `${result.count} notification${result.count !== 1 ? "s" : ""}` : result.error}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatRuleName(name) {
  return name.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase()).trim();
}

export { NotificationPreferences, PriorityBadge, CategoryBadge, AutomationPanel, CATEGORY_LABELS, CATEGORY_ICONS };
