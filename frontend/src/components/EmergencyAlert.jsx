import React from 'react';
import StatusBadge from './StatusBadge';

/**
 * EmergencyAlert - Real-time incoming emergency alert card (Section 7)
 * Displays: Patient, Severity, Risk Score, Vitals, Ambulance Required, Action buttons
 * Subtle critical pulse animation without flashing the whole screen.
 */

const EmergencyAlert = ({
  emergency,
  onView,
  onAccept,
  onDecline,
  role = 'hospital',
  isAccepted = false
}) => {
  if (!emergency) return null;

  const severity = emergency.severity || 'CRITICAL';
  const riskScore = emergency.riskScore != null ? emergency.riskScore : (emergency.risk_score || 92);
  const patientName = emergency.patientName || emergency.patient?.fullName || emergency.patientUid || 'Emergency Patient';
  
  // Extract or parse detected vitals
  const vitalsText = emergency.detectedVitals || 'HR 145 BPM • SpO2 82% • Temp 39.8°C';
  const requiresAmbulance = emergency.requiresAmbulance !== false;

  return (
    <div className="incoming-alert-card" role="alert" aria-live="assertive">
      {/* Alert Header */}
      <div className="incoming-alert-header">
        <div className="incoming-alert-title">
          <span>🚨</span>
          <span>NEW EMERGENCY DETECTED</span>
          <StatusBadge status={severity} size="sm" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: 'var(--color-critical)', fontWeight: 700, letterSpacing: '0.04em' }}>
            PRIORITY TRIAGE
          </span>
          <span style={{
            background: 'var(--color-critical)',
            color: 'white',
            fontSize: '11px',
            fontWeight: 800,
            padding: '2px 8px',
            borderRadius: '4px'
          }}>
            RISK {riskScore}/100
          </span>
        </div>
      </div>

      {/* Grid of Key Info */}
      <div className="incoming-alert-grid">
        <div>
          <div className="incoming-alert-item-label">Patient</div>
          <div className="incoming-alert-item-value" style={{ fontSize: '15px' }}>
            {patientName}
          </div>
          {emergency.patientUid && (
            <div style={{ fontSize: '11px', color: 'var(--color-gray-500)', fontFamily: 'monospace' }}>
              UID: {emergency.patientUid}
            </div>
          )}
        </div>

        <div>
          <div className="incoming-alert-item-label">Detected Vitals</div>
          <div className="incoming-alert-item-value" style={{ fontSize: '13px', color: 'var(--color-critical)' }}>
            {vitalsText}
          </div>
        </div>

        <div>
          <div className="incoming-alert-item-label">Ambulance Required</div>
          <div className="incoming-alert-item-value" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              fontWeight: 800,
              color: requiresAmbulance ? 'var(--color-critical)' : 'var(--color-success)'
            }}>
              {requiresAmbulance ? '🚑 YES' : '✓ NO'}
            </span>
          </div>
        </div>

        <div>
          <div className="incoming-alert-item-label">Required Department</div>
          <div className="incoming-alert-item-value" style={{ fontSize: '13px' }}>
            {emergency.requiredDepartment || 'Emergency / Trauma'}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 'var(--space-3)',
        borderTop: '1px solid rgba(220, 38, 38, 0.15)',
        paddingTop: 'var(--space-4)'
      }}>
        {onDecline && (
          <button onClick={() => onDecline(emergency.id)} className="btn btn-secondary btn-sm">
            Decline
          </button>
        )}

        {onView && (
          <button onClick={() => onView(emergency)} className="btn btn-secondary btn-sm" style={{ fontWeight: 600 }}>
            👁 VIEW DETAILS
          </button>
        )}

        {onAccept && !isAccepted && (
          <button
            onClick={() => onAccept(emergency.id)}
            className="btn btn-critical btn-sm"
            style={{ fontWeight: 800, padding: '8px 16px' }}
          >
            ✓ ACCEPT EMERGENCY
          </button>
        )}

        {isAccepted && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--color-success)',
            fontWeight: 800,
            fontSize: '13px'
          }}>
            ✓ Emergency Accepted
          </span>
        )}
      </div>
    </div>
  );
};

export default EmergencyAlert;