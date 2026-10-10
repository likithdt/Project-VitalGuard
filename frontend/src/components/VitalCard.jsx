import React from 'react';
import StatusBadge from './StatusBadge';

/**
 * VitalCard - Section 3
 * Modern clean card for vitals (Heart Rate, SpO2, Temperature, Blood Pressure, Glucose, AI Risk Score)
 */

const VITAL_CONFIGS = {
  hr: {
    title: 'Heart Rate',
    unit: 'BPM',
    icon: '❤️',
    normal: '60 - 100 BPM'
  },
  spo2: {
    title: 'SpO2 Oxygen',
    unit: '%',
    icon: '🫁',
    normal: '95 - 100%'
  },
  temp: {
    title: 'Temperature',
    unit: '°C',
    icon: '🌡️',
    normal: '36.1 - 37.2°C'
  },
  bp: {
    title: 'Blood Pressure',
    unit: 'mmHg',
    icon: '🩺',
    normal: '120/80 mmHg'
  },
  glucose: {
    title: 'Blood Glucose',
    unit: 'mg/dL',
    icon: '🩸',
    normal: '70 - 140 mg/dL'
  },
  risk: {
    title: 'AI Risk Score',
    unit: '/100',
    icon: '🤖',
    normal: '< 30 Low Risk'
  }
};

const VitalCard = ({
  type = 'hr',
  label,
  value,
  unit,
  icon,
  status = 'normal',
  trend,
  trendUp = false,
  onClick
}) => {
  const config = VITAL_CONFIGS[type] || VITAL_CONFIGS.hr;
  const displayTitle = label || config.title;
  const displayUnit = unit || config.unit;
  const displayIcon = icon || config.icon;
  const displayValue = value != null ? value : '--';

  const statusClass = status === 'critical' ? 'critical' : status === 'warning' ? 'warning' : 'success';

  return (
    <div
      className={`vital-card ${statusClass}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <div className="vital-header">
        <div className="vital-icon-title">
          <span style={{ fontSize: '18px' }}>{displayIcon}</span>
          <span className="vital-title">{displayTitle}</span>
        </div>
        <StatusBadge
          status={status === 'critical' ? 'CRITICAL' : status === 'warning' ? 'HIGH' : 'NORMAL'}
          size="sm"
          showIcon={false}
        />
      </div>

      <div className="vital-body">
        <span className="vital-value">{displayValue}</span>
        <span className="vital-unit">{displayUnit}</span>
      </div>

      <div className="vital-footer">
        <span>Normal: {config.normal}</span>
        {trend && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '2px',
            fontWeight: 700,
            color: trendUp ? 'var(--color-critical)' : 'var(--color-success)'
          }}>
            {trendUp ? '↑' : '↓'} {trend}
          </span>
        )}
      </div>
    </div>
  );
};

export default VitalCard;