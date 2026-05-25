import { useState } from "react";
import { CenterQuickCollectionTab } from "./CenterQuickCollectionTab";
import { CenterFeeRemindersTab } from "./CenterFeeRemindersTab";

const TABS = [
  { key: "quick-collection", label: "💰 Quick Collection" },
  { key: "reminders", label: "📞 Reminders & Calling List" }
];

export function CenterFeesPage() {
  const [activeTab, setActiveTab] = useState("quick-collection");

  return (
    <div className="page">
      <div className="page-header">
        <h1>Fee Management</h1>
        <p>Collect payments and manage fee reminders</p>
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
        {activeTab === "quick-collection" && <CenterQuickCollectionTab />}
        {activeTab === "reminders" && <CenterFeeRemindersTab />}
      </div>
    </div>
  );
}
