import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

/**
 * DashboardLayout - Section 2 Global Layout
 * Unifies sidebar, topbar, mobile drawer, notifications, and main content area
 */

const DashboardLayout = ({
  children,
  title = 'VitalGuard',
  user,
  notifications = [],
  onNotificationClick,
  wsConnected = true,
  activeSubtab,
  onSelectSubtab
}) => {
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);

  return (
    <div className="app-shell">
      <div className="dashboard-layout">
        {/* Mobile backdrop */}
        <div
          className={`sidebar-overlay ${isSidebarOpenMobile ? 'open' : ''}`}
          onClick={() => setIsSidebarOpenMobile(false)}
          aria-hidden="true"
        />

        {/* Sidebar */}
        <Sidebar
          isOpenMobile={isSidebarOpenMobile}
          onCloseMobile={() => setIsSidebarOpenMobile(false)}
          activeSubtab={activeSubtab}
          onSelectSubtab={onSelectSubtab}
        />

        {/* Main Content View */}
        <div className="dashboard-main">
          {/* Topbar */}
          <Topbar
            title={title}
            user={user}
            wsConnected={wsConnected}
            notifications={notifications}
            onNotificationClick={onNotificationClick}
            onMenuToggle={() => setIsSidebarOpenMobile(!isSidebarOpenMobile)}
          />

          {/* Page Content */}
          <main className="dashboard-content">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};

export default DashboardLayout;