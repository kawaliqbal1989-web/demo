import { useCallback, useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { GlobalLoadingBar } from "../components/GlobalLoadingBar";
import { Breadcrumb } from "../components/Breadcrumb";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "abacus_sidebar_collapsed";

function getStoredSidebarCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function setStoredSidebarCollapsed(value) {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, value ? "1" : "0");
  } catch {
    // ignore storage failures
  }
}

function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => getStoredSidebarCollapsed());

  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebarCollapsed = useCallback(() => {
    setIsSidebarCollapsed((value) => !value);
  }, []);

  useEffect(() => {
    setStoredSidebarCollapsed(isSidebarCollapsed);
  }, [isSidebarCollapsed]);

  return (
    <div className={`app-shell ${isSidebarCollapsed ? "app-shell--sidebar-collapsed" : ""}`}>
      <Sidebar open={sidebarOpen} onClose={closeSidebar} collapsed={isSidebarCollapsed} />
      <div className="main-panel">
        <GlobalLoadingBar />
        <Topbar
          onToggleSidebar={toggleSidebar}
          onToggleSidebarCollapsed={toggleSidebarCollapsed}
          isSidebarCollapsed={isSidebarCollapsed}
        />
        <main className="content">
          <Breadcrumb />
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export { MainLayout };
