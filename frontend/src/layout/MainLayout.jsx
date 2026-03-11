import { useState, useCallback } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { GlobalLoadingBar } from "../components/GlobalLoadingBar";
import { Breadcrumb } from "../components/Breadcrumb";

function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="app-shell">
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      <div className="main-panel">
        <GlobalLoadingBar />
        <Topbar onToggleSidebar={toggleSidebar} />
        <main className="content">
          <Breadcrumb />
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export { MainLayout };
