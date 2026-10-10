import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useInRouterContext } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Topbar - Section 17 & 19
 * Application top navigation with Live WebSocket indicator, Notifications menu,
 * and Profile Dropdown (Profile, Settings, Logout).
 * Safe in both Router and non-Router test environments.
 */

const TopbarInner = ({
  onMenuToggle,
  title = 'VitalGuard',
  user,
  notifications = [],
  onNotificationClick,
  wsConnected = true,
  onNavigate,
  onLogout
}) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  const profileRef = useRef(null);
  const notifRef = useRef(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setIsProfileOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setIsNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const getRoleLabel = (r) => {
    const roles = {
      PATIENT: 'Patient',
      FAMILY_MEMBER: 'Family Member',
      DOCTOR: 'Physician',
      HOSPITAL_ADMIN: 'Hospital Admin',
      AMBULANCE_DRIVER: 'Ambulance Driver',
      ADMIN: 'System Admin',
      SYSTEM_ADMIN: 'System Admin',
    };
    return roles[r] || r;
  };

  return (
    <header className="dashboard-topbar" role="banner">
      {/* Left: Mobile Menu Trigger + Page Title */}
      <div className="topbar-left">
        <button
          onClick={onMenuToggle}
          className="btn btn-ghost btn-icon topbar-menu-toggle"
          aria-label="Toggle navigation menu"
        >
          ☰
        </button>
        <h1 className="topbar-title">
          {title}
        </h1>
      </div>

      {/* Center: Live Telemetry Indicator */}
      <div className="topbar-center">
        <div className={`status-indicator-pill ${wsConnected ? 'live' : 'offline'}`}>
          <span className="pulse-dot" />
          <span>{wsConnected ? 'LIVE DISPATCH CONNECTED' : 'DISCONNECTED'}</span>
        </div>
      </div>

      {/* Right: Notifications & Profile Menu */}
      <div className="topbar-right">
        {/* Notifications Dropdown */}
        <div className="dropdown" ref={notifRef}>
          <button
            onClick={() => {
              setIsNotifOpen(!isNotifOpen);
              setIsProfileOpen(false);
            }}
            className="btn btn-ghost btn-icon"
            style={{ position: 'relative' }}
            aria-label={`Notifications (${notifications.length})`}
            aria-expanded={isNotifOpen}
          >
            🔔
            {notifications.length > 0 && (
              <span style={{
                position: 'absolute',
                top: '4px',
                right: '4px',
                background: 'var(--color-critical)',
                color: 'white',
                fontSize: '10px',
                fontWeight: 800,
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {notifications.length > 9 ? '9+' : notifications.length}
              </span>
            )}
          </button>

          {isNotifOpen && (
            <div className="dropdown-menu" style={{ right: 0, width: '320px', padding: 0 }}>
              <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--color-gray-200)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--color-gray-900)' }}>
                  Notifications
                </span>
                <span style={{ fontSize: '11px', color: 'var(--color-gray-500)' }}>
                  {notifications.length} active
                </span>
              </div>

              <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--color-gray-500)', fontSize: '13px' }}>
                    <div style={{ fontSize: '24px', marginBottom: '6px' }}>✓</div>
                    No unread notifications
                  </div>
                ) : (
                  notifications.map((n, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        onNotificationClick?.(n);
                        setIsNotifOpen(false);
                      }}
                      style={{
                        padding: '10px 14px',
                        borderBottom: '1px solid var(--color-gray-100)',
                        cursor: 'pointer',
                        display: 'flex',
                        gap: '10px',
                        alignItems: 'flex-start',
                        transition: 'background-color 0.15s ease'
                      }}
                    >
                      <span style={{ fontSize: '16px' }}>{n.icon || '🚨'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-gray-900)' }}>
                          {n.title}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-gray-600)', marginTop: '2px' }}>
                          {n.message}
                        </div>
                        {n.time && (
                          <div style={{ fontSize: '10px', color: 'var(--color-gray-400)', marginTop: '3px' }}>
                            {n.time}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Profile Menu Dropdown - Section 19 */}
        <div className="dropdown" ref={profileRef}>
          <button
            onClick={() => {
              setIsProfileOpen(!isProfileOpen);
              setIsNotifOpen(false);
            }}
            className="btn btn-ghost"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 10px',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--color-gray-200)',
              backgroundColor: 'var(--color-white)'
            }}
            aria-expanded={isProfileOpen}
            aria-haspopup="true"
          >
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-primary)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '12px'
            }}>
              {user?.fullName?.charAt(0) || 'U'}
            </div>
            <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-gray-900)', lineHeight: 1.1 }}>
                {user?.fullName || 'User Profile'}
              </span>
              <span style={{ fontSize: '10px', color: 'var(--color-gray-500)', lineHeight: 1.1, textTransform: 'uppercase' }}>
                {getRoleLabel(user?.role)}
              </span>
            </div>
            <span style={{ fontSize: '10px', color: 'var(--color-gray-400)', marginLeft: '4px' }}>▼</span>
          </button>

          {isProfileOpen && (
            <div className="dropdown-menu" style={{ right: 0, minWidth: '200px' }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-gray-200)' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-gray-900)' }}>
                  {user?.fullName || 'User'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-gray-500)', marginTop: '2px' }}>
                  {user?.email || 'Logged in'}
                </div>
              </div>

              <button
                onClick={() => {
                  setIsProfileOpen(false);
                  onNavigate('/profile');
                }}
                className="dropdown-item"
              >
                <span>👤</span>
                <span>My Profile</span>
              </button>

              <button
                onClick={() => {
                  setIsProfileOpen(false);
                  onNavigate(user?.role === 'PATIENT' || user?.role === 'FAMILY_MEMBER' ? '/user-dashboard' : '/healthcare-dashboard');
                }}
                className="dropdown-item"
              >
                <span>🏥</span>
                <span>Dashboard Home</span>
              </button>

              <div className="dropdown-divider" />

              <button
                onClick={() => {
                  setIsProfileOpen(false);
                  onLogout();
                }}
                className="dropdown-item critical"
              >
                <span>🚪</span>
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

const TopbarWithRouter = (props) => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <TopbarInner
      {...props}
      onNavigate={(path) => navigate(path)}
      onLogout={() => {
        logout();
        navigate('/login');
      }}
    />
  );
};

const TopbarWithoutRouter = (props) => {
  const { logout } = useAuth();

  return (
    <TopbarInner
      {...props}
      onNavigate={() => {}}
      onLogout={() => logout?.()}
    />
  );
};

const Topbar = (props) => {
  const inRouter = useInRouterContext();
  if (inRouter) {
    return <TopbarWithRouter {...props} />;
  }
  return <TopbarWithoutRouter {...props} />;
};

export default Topbar;