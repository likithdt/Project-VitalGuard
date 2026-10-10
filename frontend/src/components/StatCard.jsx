import React from 'react';

/**
 * StatCard - Section 6 & 10
 * Clean metric card for command center dashboards
 */

const StatCard = ({
  label,
  value,
  icon = '📊',
  color = 'primary', // primary, critical, warning, success, info
  subtitle,
  trend,
  trendUp
}) => {
  return (
    <div className="stat-card">
      <div>
        <div className="stat-card-label">{label}</div>
        <div className={`stat-card-value ${color === 'critical' ? 'critical' : color === 'success' ? 'success' : ''}`}>
          {value != null ? value : '--'}
        </div>
        {subtitle && (
          <div style={{ fontSize: '11px', color: 'var(--color-gray-500)', marginTop: '4px' }}>
            {subtitle}
          </div>
        )}
        {trend && (
          <div style={{
            fontSize: '11px',
            fontWeight: 700,
            marginTop: '4px',
            color: trendUp ? 'var(--color-critical)' : 'var(--color-success)'
          }}>
            {trendUp ? '↑' : '↓'} {trend}
          </div>
        )}
      </div>

      <div className={`stat-card-icon ${color}`}>
        {icon}
      </div>
    </div>
  );
};

export default StatCard;