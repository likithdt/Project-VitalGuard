import React from 'react';
import { NavLink, useNavigate, useLocation, useInRouterContext } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Sidebar - Section 2 & 19
 * Role-tailored navigation with active indicator, medical brand logo, and sign out
 * Safe in both Router and non-Router test environments.
 */

const getNavItemsForRole = (role) => {
  switch (role) {
    case 'PATIENT':
      return [
        { path: '/user-dashboard', label: 'Dashboard', icon: '🏥' },
        { path: '/user-dashboard?tab=chat', label: 'Med-AI Advisor', icon: '🤖' },
        { path: '/profile', label: 'Patient Profile', icon: '👤' },
      ];
    case 'FAMILY_MEMBER':
      return [
        { path: '/family-dashboard', label: 'Family Console', icon: '👨‍👩‍👧‍👦' },
        { path: '/family-dashboard?tab=telemetry', label: 'Live Telemetry', icon: '❤️' },
        { path: '/family-dashboard?tab=history', label: 'Incident History', icon: '📋' },
        { path: '/profile', label: 'Guardian Profile', icon: '👤' },
      ];
    case 'DOCTOR':
      return [
        { path: '/healthcare-dashboard', label: 'Doctor Cases', icon: '👨‍⚕️' },
        { path: '/profile', label: 'My Profile', icon: '👤' },
      ];
    case 'HOSPITAL_ADMIN':
      return [
        { path: '/healthcare-dashboard', label: 'Command Center', icon: '🏥' },
        { path: '/profile', label: 'Admin Profile', icon: '👤' },
      ];
    case 'AMBULANCE_DRIVER':
      return [
        { path: '/healthcare-dashboard', label: 'Ambulance Console', icon: '🚑' },
        { path: '/profile', label: 'Driver Profile', icon: '👤' },
      ];
    case 'ADMIN':
    case 'SYSTEM_ADMIN':
      return [
        { path: '/admin', label: 'Admin Dashboard', icon: '⚡' },
        { path: '/admin?tab=doctors', label: 'Doctors', icon: '👨‍⚕️' },
        { path: '/admin?tab=hospital-admins', label: 'Hospital Admins', icon: '🏥' },
        { path: '/admin?tab=drivers', label: 'Ambulance Drivers', icon: '🚑' },
        { path: '/admin?tab=hospitals', label: 'Hospitals', icon: '🏢' },
        { path: '/admin?tab=ambulances', label: 'Ambulances', icon: '🚨' },
        { path: '/admin?tab=emergencies', label: 'System Emergencies', icon: '📡' },
        { path: '/admin?tab=users', label: 'User Accounts', icon: '👥' },
        { path: '/admin?tab=audit-logs', label: 'Audit Trail', icon: '📜' },
        { path: '/profile', label: 'Admin Profile', icon: '👤' },
      ];
    default:
      return [
        { path: '/user-dashboard', label: 'Dashboard', icon: '🏥' },
        { path: '/user-dashboard?tab=chat', label: 'Med-AI Advisor', icon: '🤖' },
        { path: '/profile', label: 'Profile', icon: '👤' },
      ];
  }
};

const SidebarContent = ({
  isCollapsed,
  isOpenMobile,
  onCloseMobile,
  pathname,
  fullPath = pathname,
  onNavigate,
  onLogout,
  user
}) => {
  const role = user?.role || 'PATIENT';
  const navItems = getNavItemsForRole(role);

  const getRoleDisplayName = (r) => {
    const roles = {
      PATIENT: 'Patient',
      FAMILY_MEMBER: 'Family Member',
      DOCTOR: 'Physician / Doctor',
      HOSPITAL_ADMIN: 'Hospital Admin',
      AMBULANCE_DRIVER: 'Ambulance Driver',
      ADMIN: 'System Admin',
      SYSTEM_ADMIN: 'System Admin',
    };
    return roles[r] || r;
  };

  return (
    <aside
      className={`dashboard-sidebar ${isCollapsed ? 'collapsed' : ''} ${isOpenMobile ? 'mobile-open' : ''}`}
      role="navigation"
      aria-label="Main Application Navigation"
    >
      {/* Brand Header */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon" aria-hidden="true">
          🛡️
        </div>
        {!isCollapsed && (
          <div>
            <div className="sidebar-brand-name">VitalGuard</div>
            <div className="sidebar-brand-sub">Emergency Platform</div>
          </div>
        )}
      </div>

      {/* Navigation List */}
      <nav className="sidebar-nav">
        <div className="sidebar-nav-section-title">
          {!isCollapsed && 'Navigation'}
        </div>

        {navItems.map((item) => {
          const isActive = item.path.includes('?')
            ? (fullPath === item.path)
            : (pathname === item.path && !fullPath.includes('?tab='));

          return (
            <a
              key={item.path}
              href={item.path}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(item.path);
                onCloseMobile?.();
              }}
              className={`sidebar-nav-link ${isActive ? 'active' : ''}`}
              title={item.label}
            >
              <span className="sidebar-nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              {!isCollapsed && <span>{item.label}</span>}
            </a>
          );
        })}
      </nav>

      {/* User Section at bottom */}
      <div className="sidebar-user">
        {!isCollapsed ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-primary)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '14px',
                flexShrink: 0
              }}>
                {user?.fullName?.charAt(0) || 'U'}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: 'var(--color-gray-900)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {user?.fullName || 'User'}
                </div>
                <div style={{
                  fontSize: '11px',
                  color: 'var(--color-gray-500)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {getRoleDisplayName(role)}
                </div>
              </div>
            </div>

            <button
              onClick={onLogout}
              className="btn btn-ghost btn-sm"
              style={{ padding: '6px', color: 'var(--color-critical)' }}
              title="Sign Out"
              aria-label="Sign Out"
            >
              🚪
            </button>
          </div>
        ) : (
          <button
            onClick={onLogout}
            className="btn btn-ghost btn-icon w-full"
            title="Sign Out"
            aria-label="Sign Out"
          >
            🚪
          </button>
        )}
      </div>
    </aside>
  );
};

const SidebarWithRouter = (props) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <SidebarContent
      {...props}
      user={user}
      pathname={location.pathname}
      fullPath={location.pathname + location.search}
      onNavigate={(path) => navigate(path)}
      onLogout={() => {
        logout();
        navigate('/login');
      }}
    />
  );
};

const SidebarWithoutRouter = (props) => {
  const { user, logout } = useAuth();

  return (
    <SidebarContent
      {...props}
      user={user}
      pathname="/"
      onNavigate={() => {}}
      onLogout={() => logout?.()}
    />
  );
};

const Sidebar = (props) => {
  const inRouter = useInRouterContext();
  if (inRouter) {
    return <SidebarWithRouter {...props} />;
  }
  return <SidebarWithoutRouter {...props} />;
};

export default Sidebar;