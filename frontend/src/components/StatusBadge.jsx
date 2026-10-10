import React from 'react';

/**
 * StatusBadge component conforming to VitalGuard design system (Section 16)
 * CRITICAL -> red
 * HIGH -> orange
 * MODERATE -> yellow
 * LOW -> green
 * AVAILABLE -> green
 * REQUESTED -> blue
 * ACCEPTED -> blue
 * EN_ROUTE -> blue
 * ARRIVED -> green
 * RESOLVED -> gray
 */

const getBadgeConfig = (status) => {
  const normalized = (status || '').toString().toUpperCase().trim();

  switch (normalized) {
    case 'CRITICAL':
      return { className: 'badge-critical', label: 'Critical', icon: '🚨' };
    case 'HIGH':
      return { className: 'badge-high', label: 'High', icon: '⚠️' };
    case 'MODERATE':
      return { className: 'badge-moderate', label: 'Moderate', icon: '⚡' };
    case 'LOW':
    case 'NORMAL':
      return { className: 'badge-low', label: normalized === 'NORMAL' ? 'Normal' : 'Low', icon: '✓' };
    case 'AVAILABLE':
    case 'FREE':
    case 'ON_DUTY':
    case 'ON':
      return { className: 'badge-available', label: normalized === 'ON' ? 'On Duty' : 'Available', icon: '✓' };
    case 'REQUESTED':
    case 'AMBULANCE_REQUESTED':
      return { className: 'badge-requested', label: 'Requested', icon: '📋' };
    case 'ACCEPTED':
    case 'HOSPITAL_ACCEPTED':
    case 'AMBULANCE_ACCEPTED':
      return { className: 'badge-accepted', label: 'Accepted', icon: '✓' };
    case 'EN_ROUTE':
    case 'EN_ROUTE_TO_PATIENT':
    case 'EN_ROUTE_TO_HOSPITAL':
    case 'AMBULANCE_DISPATCHED':
      return { className: 'badge-enroute', label: normalized.replace(/_/g, ' '), icon: '🚑' };
    case 'ARRIVED':
    case 'ARRIVED_AT_PATIENT':
    case 'ARRIVED_AT_HOSPITAL':
    case 'PATIENT_PICKED_UP':
      return { className: 'badge-arrived', label: normalized.replace(/_/g, ' '), icon: '📍' };
    case 'RESOLVED':
    case 'COMPLETED':
      return { className: 'badge-resolved', label: 'Resolved', icon: '🏁' };
    case 'BUSY':
    case 'OFF_DUTY':
    case 'OFF':
      return { className: 'badge-high', label: normalized === 'OFF' ? 'Off Duty' : 'Busy', icon: '⏳' };
    case 'CANCELLED':
      return { className: 'badge-critical', label: 'Cancelled', icon: '✕' };
    case 'ACTIVE':
      return { className: 'badge-available', label: 'Active', icon: '✓' };
    case 'PENDING':
      return { className: 'badge-moderate', label: 'Pending', icon: '⏳' };
    case 'REJECTED':
      return { className: 'badge-critical', label: 'Rejected', icon: '✕' };
    case 'SUSPENDED':
      return { className: 'badge-high', label: 'Suspended', icon: '⏸' };
    case 'DEACTIVATED':
      return { className: 'badge-resolved', label: 'Deactivated', icon: '🔒' };
    case 'DETECTED':
      return { className: 'badge-requested', label: 'Detected', icon: '🔍' };
    case 'HOSPITAL_ASSIGNED':
      return { className: 'badge-requested', label: 'Hospital Assigned', icon: '🏥' };
    case 'DOCTOR_ASSIGNED':
      return { className: 'badge-accepted', label: 'Doctor Assigned', icon: '👨‍⚕️' };
    default:
      return { className: 'badge-resolved', label: normalized.replace(/_/g, ' ') || 'Unknown', icon: '•' };
  }
};

const StatusBadge = ({ status, label, size = 'md', showIcon = true }) => {
  const config = getBadgeConfig(status);
  const sizeClass = size === 'sm' ? 'badge-sm' : size === 'lg' ? 'badge-lg' : '';

  return (
    <span className={`badge ${config.className} ${sizeClass}`}>
      {showIcon && <span aria-hidden="true" style={{ fontSize: size === 'sm' ? '10px' : '11px' }}>{config.icon}</span>}
      <span>{label || config.label}</span>
    </span>
  );
};

export default StatusBadge;