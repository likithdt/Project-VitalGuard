import React from 'react';
import { NavLink } from 'react-router-dom';

const EmergencyCard = ({ 
  emergency, 
  onClick, 
  onAccept,
  variant = 'default', // default, compact, alert
  selected = false,
  showActions = false,
  role = 'patient', // patient, hospital, doctor, driver
}) => {
  const severityColors = {
    CRITICAL: 'critical',
    HIGH: 'critical',
    MODERATE: 'warning',
    LOW: 'success',
    NORMAL: 'secondary',
  };

  const severityClass = severityColors[emergency?.severity] || 'secondary';
  const statusClass = `status-${(emergency?.status || '').toLowerCase().replace(/_/g, '-')}`;
  const ambulanceRequired = emergency?.requiresAmbulance === true || emergency?.requiresAmbulance === 'true';

  const formatVitals = (vitals) => {
    if (!vitals) return 'No vitals recorded';
    return vitals;
  };

  if (variant === 'alert') {
    return (
      <div className="card emergency-alert-card" style={{ 
        borderLeft: '4px solid var(--color-critical)',
        background: 'var(--color-critical-bg)',
        borderColor: 'var(--color-critical-border)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 'var(--space-2)',
              marginBottom: 'var(--space-2)',
              flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: '20px' }}>🚨</span>
              <h3 style={{ 
                fontSize: 'var(--font-size-lg)', 
                fontWeight: 'var(--font-weight-extrabold)',
                color: 'var(--color-critical)',
                margin: 0,
              }}>
                NEW EMERGENCY REQUEST
              </h3>
              <span className={`badge badge-critical`}>
                {emergency?.severity}
              </span>
              <span className={`badge badge-${severityClass}`}>
                Risk: {emergency?.riskScore || 0}/100
              </span>
            </div>
            <p style={{ 
              color: 'var(--color-gray-700)', 
              marginBottom: 'var(--space-3)',
              fontSize: 'var(--font-size-sm)',
            }}>
              <strong>Patient:</strong> {emergency?.patientName || emergency?.patientUid}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', fontSize: 'var(--font-size-sm)' }}>
              <span style={{ 
                background: 'rgba(220, 38, 38, 0.1)', 
                padding: 'var(--space-1) var(--space-2)', 
                borderRadius: 'var(--radius-md)',
                fontWeight: 'var(--font-weight-semibold)',
                color: 'var(--color-critical)',
              }}>
                HR: {emergency?.heartRate || '?'} BPM
              </span>
              <span style={{ 
                background: 'rgba(220, 38, 38, 0.1)', 
                padding: 'var(--space-1) var(--space-2)', 
                borderRadius: 'var(--radius-md)',
                fontWeight: 'var(--font-weight-semibold)',
                color: 'var(--color-critical)',
              }}>
                SpO₂: {emergency?.spo2 || '?'}%
              </span>
              <span style={{ 
                background: 'rgba(220, 38, 38, 0.1)', 
                padding: 'var(--space-1) var(--space-2)', 
                borderRadius: 'var(--radius-md)',
                fontWeight: 'var(--font-weight-semibold)',
                color: 'var(--color-critical)',
              }}>
                Temp: {emergency?.temperature || '?'}°C
              </span>
              <span className={`badge badge-${ambulanceRequired ? 'critical' : 'success'}`}>
                {ambulanceRequired ? '🚑 Ambulance Required' : '✓ Ambulance Not Required'}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {showActions && role === 'hospital' && emergency?.status === 'HOSPITAL_ASSIGNED' && (
              <>
                <button 
                  onClick={(e) => { e.stopPropagation(); onClick?.(emergency); }}
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                >
                  👁 View Details
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); onAccept?.(emergency); }}
                  className="btn btn-critical"
                  style={{ flex: 1, fontWeight: 'var(--font-weight-extrabold)' }}
                >
                  ✓ ACCEPT & DISPATCH
                </button>
              </>
            )}
            {showActions && role === 'hospital' && emergency?.status !== 'HOSPITAL_ASSIGNED' && (
              <button 
                onClick={(e) => { e.stopPropagation(); onClick?.(emergency); }}
                className="btn btn-primary"
                style={{ flex: 1 }}
              >
                👁 View Details
              </button>
            )}
            {showActions && role !== 'hospital' && (
              <button 
                onClick={(e) => { e.stopPropagation(); onClick?.(emergency); }}
                className="btn btn-primary"
                style={{ flex: 1 }}
              >
                👁 View Details
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div 
        className={`card emergency-card-compact ${selected ? 'selected' : ''}`}
        onClick={() => onClick?.(emergency)}
        style={{ 
          cursor: onClick ? 'pointer' : 'default',
          transition: 'all var(--transition-fast)',
          borderLeft: selected ? `4px solid var(--color-primary)` : 'none',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <span style={{ 
                fontSize: 'var(--font-size-sm)', 
                fontWeight: 'var(--font-weight-bold)',
                color: 'var(--color-gray-900)',
              }}>
                SOS-{emergency?.id}
              </span>
              <span className={`badge badge-${severityClass}`}>
                {emergency?.severity}
              </span>
              <span className={`badge badge-${statusClass}`}>
                {emergency?.status}
              </span>
            </div>
          </div>
          <div style={{ textAlign: 'right', minWidth: '120px' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-500)', marginBottom: '2px' }}>
              RISK SCORE
            </div>
            <div style={{ 
              fontSize: 'var(--font-size-lg)', 
              fontWeight: 'var(--font-weight-extrabold)',
              color: severityClass === 'critical' ? 'var(--color-critical)' : 'var(--color-gray-900)',
            }}>
              {emergency?.riskScore || 0}/100
            </div>
          </div>
        </div>
        <div style={{ 
          fontSize: 'var(--font-size-sm)', 
          color: 'var(--color-gray-600)',
          marginBottom: 'var(--space-3)',
        }}>
          <strong>Patient:</strong> {emergency?.patientName || emergency?.patientUid}
        </div>
        <div style={{ 
          fontSize: 'var(--font-size-sm)', 
          color: 'var(--color-gray-600)',
          marginBottom: 'var(--space-2)',
        }}>
          <strong>Vitals:</strong> {formatVitals(emergency?.detectedVitals || emergency?.currentVitals)}
        </div>
        <div style={{ 
          display: 'flex', 
          gap: 'var(--space-4)', 
          fontSize: 'var(--font-size-xs)', 
          color: 'var(--color-gray-500)',
          flexWrap: 'wrap',
        }}>
          <span><strong>Dept:</strong> {emergency?.requiredDepartment || 'N/A'}</span>
          <span><strong>Hospital:</strong> {emergency?.hospitalName || 'Unassigned'}</span>
          <span><strong>Dr:</strong> {emergency?.doctorName || 'Unassigned'}</span>
          <span><strong>Amb:</strong> {emergency?.ambulanceUnitId ? 'Assigned' : (ambulanceRequired ? 'Requested' : 'Not Required')}</span>
        </div>
      </div>
    );
  }

  // Default variant
  return (
    <div 
      className={`card emergency-card ${selected ? 'selected' : ''}`}
      onClick={() => onClick?.(emergency)}
      style={{ 
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all var(--transition-fast)',
        borderLeft: selected ? `4px solid var(--color-primary)` : 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-4)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
            <span style={{ 
              fontSize: 'var(--font-size-lg)', 
              fontWeight: 'var(--font-weight-extrabold)',
              color: 'var(--color-gray-900)',
            }}>
              SOS-{emergency?.id}
            </span>
            <span className={`badge badge-${severityClass}`}>
              {emergency?.severity}
            </span>
            <span className={`badge badge-${statusClass}`}>
              {emergency?.status}
            </span>
            {ambulanceRequired && (
              <span className="badge badge-critical">🚑 Required</span>
            )}
          </div>
          <p style={{ 
            fontSize: 'var(--font-size-base)', 
            color: 'var(--color-gray-700)',
            marginBottom: 'var(--space-3)',
          }}>
            <strong>Patient:</strong> {emergency?.patientName || emergency?.patientUid}
            {emergency?.patientAge && <span style={{ marginLeft: 'var(--space-3)' }}> • Age: {emergency.patientAge}</span>}
            {emergency?.patientBloodGroup && <span style={{ marginLeft: 'var(--space-3)' }}> • Blood: {emergency.patientBloodGroup}</span>}
          </p>
        </div>
        <div style={{ textAlign: 'right', minWidth: '140px' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-500)', marginBottom: 'var(--space-1)', textTransform: 'uppercase' }}>
            Risk Score
          </div>
          <div style={{ 
            fontSize: 'var(--font-size-3xl)', 
            fontWeight: 'var(--font-weight-extrabold)',
            color: severityClass === 'critical' ? 'var(--color-critical)' : 'var(--color-gray-900)',
            lineHeight: 'var(--line-height-tight)',
          }}>
            {emergency?.riskScore || 0}/100
          </div>
        </div>
      </div>

      <div style={{ 
        background: 'var(--color-gray-50)', 
        borderRadius: 'var(--radius-lg)', 
        padding: 'var(--space-4)',
        marginBottom: 'var(--space-4)',
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', fontSize: 'var(--font-size-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ color: 'var(--color-critical)' }}>❤️</span>
            <strong>HR:</strong> {emergency?.heartRate || emergency?.currentVitals?.heartRate || '—'} BPM
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ color: 'var(--color-info)' }}>🫁</span>
            <strong>SpO₂:</strong> {emergency?.spo2 || emergency?.currentVitals?.spo2 || '—'}%
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ color: 'var(--color-warning)' }}>🌡️</span>
            <strong>Temp:</strong> {emergency?.temperature || emergency?.currentVitals?.temperature || '—'}°C
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ color: 'var(--color-primary)' }}>📍</span>
            <strong>Loc:</strong> {emergency?.latitude?.toFixed(4)}, {emergency?.longitude?.toFixed(4)}
          </div>
        </div>
      </div>

      <div style={{ 
        display: 'flex', 
        flexWrap: 'wrap', 
        gap: 'var(--space-4)', 
        fontSize: 'var(--font-size-sm)', 
        color: 'var(--color-gray-600)',
        paddingTop: 'var(--space-3)',
        borderTop: '1px solid var(--color-gray-200)',
      }}>
        <span><strong>Dept:</strong> {emergency?.requiredDepartment || 'N/A'}</span>
        <span><strong>Hospital:</strong> {emergency?.hospitalName || 'Unassigned'}</span>
        <span><strong>Doctor:</strong> {emergency?.doctorName || 'Unassigned'}</span>
        <span><strong>Ambulance:</strong> {emergency?.ambulanceUnitId ? emergency.ambulanceUnitId + ' (' + (emergency.ambulanceStatus || 'En Route') + ')' : (ambulanceRequired ? 'Requested' : 'Not Required')}</span>
      </div>

      {showActions && (
        <div style={{ 
          display: 'flex', 
          gap: 'var(--space-2)', 
          marginTop: 'var(--space-4)',
          paddingTop: 'var(--space-4)',
          borderTop: '1px solid var(--color-gray-200)',
        }}>
          <button 
            onClick={(e) => { e.stopPropagation(); onClick?.(emergency); }}
            className="btn btn-primary"
            style={{ flex: 1 }}
          >
            👁 View Details
          </button>
          {role === 'hospital' && emergency?.status === 'HOSPITAL_ASSIGNED' && (
            <button 
              onClick={(e) => { e.stopPropagation(); onAccept?.(emergency); }}
              className="btn btn-critical"
              style={{ flex: 1, fontWeight: 'var(--font-weight-extrabold)' }}
            >
              ✓ ACCEPT & DISPATCH
            </button>
          )}
          {role === 'driver' && emergency?.status === 'AMBULANCE_REQUESTED' && (
            <div style={{ display: 'flex', gap: 'var(--space-2)', flex: 1 }}>
              <button 
                onClick={(e) => { e.stopPropagation(); onAccept?.(emergency, true); }}
                className="btn btn-success"
                style={{ flex: 1 }}
              >
                ✓ ACCEPT
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); onAccept?.(emergency, false); }}
                className="btn btn-critical"
                style={{ flex: 1 }}
              >
                ✗ DECLINE
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function formatVitals(vitals) {
  if (!vitals) return 'No vitals recorded';
  return vitals;
}

export default EmergencyCard;