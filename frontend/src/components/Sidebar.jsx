import React from 'react';
import { Link, useNavigate, useLocation, useInRouterContext } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Sidebar - Primary Application Navigation System
 * Role-tailored navigation with active indicator, medical brand logo, and sign out.
 * Single source of navigation truth across all VitalGuard dashboards.
 * Safe in both Router and non-Router test environments.
 */

const getNavItemsForRole = (role) => {
  switch (role) {
    case 'PATIENT':
      return [
        { path: '/user-dashboard', label: 'Overview', icon: '🏠', ariaLabel: 'Overview' },
        { path: '/user-dashboard?tab=emergency', label: 'Emergency Tracking', icon: '🚨', ariaLabel: 'Emergency' },
        { path: '/user-dashboard?tab=chat', label: 'Med-AI Advisor', icon: '🤖', ariaLabel: 'Med-AI Advisor' },
        { path: '/user-dashboard?tab=history', label: 'Incident History', icon: '📋', ariaLabel: 'History' },
        { path: '/profile', label: 'Patient Profile', icon: '👤', ariaLabel: 'Patient Profile' },
      ];
    case 'FAMILY_MEMBER':
      return [
        { path: '/family-dashboard', label: 'Family Guardian Console', icon: '👨‍👩‍👧‍👦', ariaLabel: 'Overview' },
        { path: '/family-dashboard?tab=emergency', label: 'Emergency Tracking', icon: '🚨', ariaLabel: 'Emergency Tracking' },
        { path: '/family-dashboard?tab=telemetry', label: 'Live Telemetry', icon: '❤️', ariaLabel: 'Live Telemetry' },
        { path: '/family-dashboard?tab=history', label: 'Incident History', icon: '📋', ariaLabel: 'History' },
        { path: '/profile', label: 'Guardian Profile', icon: '👤', ariaLabel: 'Guardian Profile' },
      ];
    case 'DOCTOR':
      return [
        { path: '/healthcare-dashboard', label: 'Doctor Cases', icon: '👨‍⚕️', ariaLabel: 'Doctor Cases' },
        { path: '/profile', label: 'My Profile', icon: '👤', ariaLabel: 'My Profile' },
      ];
    case 'HOSPITAL_ADMIN':
      return [
        { path: '/healthcare-dashboard', label: 'Command Center', icon: '🏥', ariaLabel: 'Command Center' },
        { path: '/healthcare-dashboard?tab=resources', label: 'Hospital Resources', icon: '🛏️', ariaLabel: 'Hospital Resources' },
        { path: '/profile', label: 'Admin Profile', icon: '👤', ariaLabel: 'Admin Profile' },
      ];
    case 'AMBULANCE_DRIVER':
      return [
        { path: '/healthcare-dashboard', label: 'Ambulance Console', icon: '🚑', ariaLabel: 'Ambulance Console' },
        { path: '/profile', label: 'Driver Profile', icon: '👤', ariaLabel: 'Driver Profile' },
      ];
    case 'ADMIN':
    case 'SYSTEM_ADMIN':
      return [
        { path: '/admin', label: 'Admin Dashboard', icon: '⚡', ariaLabel: 'Admin Dashboard' },
        { path: '/admin?tab=doctors', label: 'Doctors', icon: '👨‍⚕️', ariaLabel: 'Doctors' },
        { path: '/admin?tab=hospital-admins', label: 'Hospital Admins', icon: '🏥', ariaLabel: 'Hospital Admins' },
        { path: '/admin?tab=drivers', label: 'Ambulance Drivers', icon: '🚑', ariaLabel: 'Ambulance Drivers' },
        { path: '/admin?tab=hospitals', label: 'Hospitals', icon: '🏢', ariaLabel: 'Hospitals' },
        { path: '/admin?tab=ambulances', label: 'Ambulances', icon: '🚨', ariaLabel: 'Ambulances' },
        { path: '/admin?tab=emergencies', label: 'System Emergencies', icon: '📡', ariaLabel: 'System Emergencies' },
        { path: '/admin?tab=users', label: 'User Accounts', icon: '👥', ariaLabel: 'User Accounts' },
        { path: '/admin?tab=audit-logs', label: 'Audit Trail', icon: '📜', ariaLabel: 'Audit Trail' },
        { path: '/profile', label: 'Admin Profile', icon: '👤', ariaLabel: 'Admin Profile' },
      ];
    default:
      return [
        { path: '/user-dashboard', label: 'Overview', icon: '🏠', ariaLabel: 'Overview' },
        { path: '/user-dashboard?tab=emergency', label: 'Emergency Tracking', icon: '🚨', ariaLabel: 'Emergency' },
        { path: '/user-dashboard?tab=chat', label: 'Med-AI Advisor', icon: '🤖', ariaLabel: 'Med-AI Advisor' },
        { path: '/user-dashboard?tab=history', label: 'Incident History', icon: '📋', ariaLabel: 'History' },
        { path: '/profile', label: 'Profile', icon: '👤', ariaLabel: 'Profile' },
      ];
  }
};

const checkIsItemActive = (itemPath, currentPath, currentSearch = '', activeSubtab = null) => {
  if (itemPath === '/profile') {
    return currentPath === '/profile';
  }

  const currentParams = new URLSearchParams(currentSearch);
  const currentTab = activeSubtab || currentParams.get('tab');

  if (itemPath.includes('?tab=')) {
    const [itemBase, itemQuery] = itemPath.split('?');
    const itemParams = new URLSearchParams(itemQuery);
    const itemTab = itemParams.get('tab');

    if (currentPath === itemBase && currentTab === itemTab) {
      return true;
    }
    if (currentPath === '/admin/audit-logs' && itemTab === 'audit-logs') {
      return true;
    }
    return false;
  }

  if (currentPath === itemPath || (itemPath === '/admin' && currentPath === '/admin/system')) {
    return !currentTab || currentTab === 'overview' || currentTab === 'queue';
  }

  return false;
};

const SidebarContent = ({
  isCollapsed,
  isOpenMobile,
  onCloseMobile,
  pathname = '/',
  search = '',
  onNavigate,
  onLogout,
  user,
  useRouterLink = false,
  activeSubtab = null
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
          const isActive = checkIsItemActive(item.path, pathname, search, activeSubtab);

          if (useRouterLink) {
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => {
                  onNavigate?.(item.path);
                  onCloseMobile?.();
                }}
                className={`sidebar-nav-link ${isActive ? 'active' : ''}`}
                title={item.label}
                aria-label={item.ariaLabel || item.label}
                role="button"
              >
                {!isCollapsed ? (
                  <span>{item.icon} {item.label}</span>
                ) : (
                  <span className="sidebar-nav-icon" aria-hidden="true">{item.icon}</span>
                )}
              </Link>
            );
          }

          return (
            <button
              type="button"
              key={item.path}
              onClick={(e) => {
                e.preventDefault();
                onNavigate?.(item.path);
                onCloseMobile?.();
              }}
              className={`sidebar-nav-link ${isActive ? 'active' : ''}`}
              title={item.label}
              aria-label={item.ariaLabel || item.label}
              role="button"
              style={{
                width: '100%',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              {!isCollapsed ? (
                <span>{item.icon} {item.label}</span>
              ) : (
                <span className="sidebar-nav-icon" aria-hidden="true">{item.icon}</span>
              )}
            </button>
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
      search={location.search}
      fullPath={location.pathname + location.search}
      useRouterLink={true}
      activeSubtab={props.activeSubtab}
      onNavigate={(path) => {
        if (props.onSelectSubtab) {
          const tab = new URLSearchParams(path.split('?')[1] || '').get('tab') || 'overview';
          props.onSelectSubtab(tab);
        }
        navigate(path);
      }}
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
      pathname={typeof window !== 'undefined' ? window.location.pathname : '/'}
      search={typeof window !== 'undefined' ? window.location.search : ''}
      activeSubtab={props.activeSubtab}
      useRouterLink={false}
      onNavigate={(path) => {
        if (props.onSelectSubtab) {
          const tab = new URLSearchParams(path.split('?')[1] || '').get('tab') || 'overview';
          props.onSelectSubtab(tab);
        }
      }}
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