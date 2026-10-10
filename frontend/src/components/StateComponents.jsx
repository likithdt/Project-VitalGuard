import React from 'react';

/**
 * Clean reusable state components (Section 22 & 23)
 * LoadingState, EmptyState, ErrorState
 */

export const LoadingState = ({ message = 'Loading emergency care data...' }) => (
  <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
    <div style={{
      width: '40px',
      height: '40px',
      margin: '0 auto var(--space-4)',
      border: '3px solid var(--color-gray-200)',
      borderTopColor: 'var(--color-primary)',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite'
    }} />
    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-gray-700)' }}>
      {message}
    </div>
  </div>
);

export const EmptyState = ({
  icon = '📋',
  title = 'No active emergencies',
  message = 'All emergency care systems operational and standby.'
}) => (
  <div className="empty-state">
    <div className="empty-state-icon">{icon}</div>
    <div className="empty-state-title">{title}</div>
    <div className="empty-state-text">{message}</div>
  </div>
);

export const ErrorState = ({
  title = 'Unable to load emergency data',
  message = 'A connection or network error occurred.',
  onRetry
}) => (
  <div style={{
    padding: 'var(--space-8)',
    textAlign: 'center',
    background: 'var(--color-critical-bg)',
    border: '1px solid var(--color-critical-border)',
    borderRadius: 'var(--radius-lg)',
    maxWidth: '480px',
    margin: 'var(--space-6) auto'
  }}>
    <div style={{ fontSize: '36px', marginBottom: 'var(--space-2)' }}>⚠️</div>
    <h4 style={{ color: 'var(--color-critical)', fontWeight: 800, marginBottom: '6px' }}>
      {title}
    </h4>
    <p style={{ color: 'var(--color-gray-600)', fontSize: '13px', marginBottom: 'var(--space-4)' }}>
      {message}
    </p>
    {onRetry && (
      <button onClick={onRetry} className="btn btn-secondary btn-sm">
        🔄 Retry Connection
      </button>
    )}
  </div>
);
