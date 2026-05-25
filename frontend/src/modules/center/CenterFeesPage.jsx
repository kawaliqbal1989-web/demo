import { useState } from "react";
import { CenterFeesDashboardTab } from "./CenterFeesDashboardTab";
import { CenterFeeRemindersTab } from "./CenterFeeRemindersTab";

const TABS = [
  { key: "dashboard", label: "📊 Fee Dashboard" },
  { key: "reminders", label: "📞 Calling List" }
];

export function CenterFeesPage() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="page">
      <div className="page-header">
        <h1>Fee Management</h1>
        <p>Unified fee dashboard and student calling list</p>
      </div>

      {/* Tab Navigation */}
      <div className="tabs-nav" style={{ marginBottom: "1.5rem" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={activeTab === t.key ? "tab-btn active" : "tab-btn"}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === "dashboard" && <CenterFeesDashboardTab />}
        {activeTab === "reminders" && <CenterFeeRemindersTab />}
      </div>
    </div>
  );
}
