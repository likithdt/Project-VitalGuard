import React, { useState, useEffect } from 'react';
import StatusBadge from './StatusBadge';

/**
 * CancelEmergencyModal
 * Confirmation dialog for cancelling an active Emergency SOS.
 * 
 * Safety requirements:
 * 1. Prominently asks: "Are you sure you want to cancel this emergency request?"
 * 2. Two actions: "Keep Emergency Active" and "Confirm Cancellation"
 * 3. Shows appropriate warning and requires explicit confirmation if accepted by hospital or ambulance.
 * 4. Shows clear error or in-progress states.
 */

const CancelEmergencyModal = ({
  isOpen,
  emergency,
  onClose,
  onConfirm,
  isCancelling = false,
  error = null
}) => {
  const [hasAcknowledged, setHasAcknowledged] = useState(false);

  // Reset acknowledgment when modal opens or emergency changes
  useEffect(() => {
    if (isOpen) {
      setHasAcknowledged(false);
    }
  }, [isOpen, emergency?.id]);

  if (!isOpen || !emergency) return null;

  // Determine if already accepted by hospital or ambulance
  const isAcceptedByUnits = Boolean(
    emergency.hospitalAccepted ||
    emergency.ambulanceId ||
    (emergency.hospitalId && !['CREATED', 'SEARCHING_HOSPITAL', 'DETECTED'].includes(emergency.status)) ||
    ['HOSPITAL_ACCEPTED', 'DOCTOR_ASSIGNED', 'AMBULANCE_REQUESTED', 'AMBULANCE_ACCEPTED', 'AMBULANCE_DISPATCHED', 'EN_ROUTE_TO_PATIENT', 'ARRIVED_AT_PATIENT', 'PATIENT_PICKED_UP', 'EN_ROUTE_TO_HOSPITAL', 'ARRIVED_AT_HOSPITAL'].includes(emergency.status?.toUpperCase()) ||
    (emergency.ambulanceStatus && !['STANDBY', 'NOT_REQUIRED', 'CANCELLED', 'RESOLVED'].includes(emergency.ambulanceStatus?.toUpperCase()))
  );

  const canSubmit = !isCancelling && (!isAcceptedByUnits || hasAcknowledged);

  return (
    <div
      className="modal-backdrop"
      onClick={!isCancelling ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-emergency-title"
    >
      <div
        className="modal-card"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '520px', width: '100%' }}
      >
        {/* Header */}
        <div className="modal-header" style={{ background: '#FEF2F2', borderBottom: '1px solid #FECACA' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }} aria-hidden="true">⚠️</span>
            <div>
              <h3
                id="cancel-emergency-title"
                className="modal-title"
                style={{ color: '#DC2626', fontSize: '18px', fontWeight: 800 }}
              >
                Cancel Emergency Request
              </h3>
              <p style={{ fontSize: '12px', color: '#991B1B', margin: '2px 0 0 0' }}>
                Incident Reference: SOS-{emergency.id}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            disabled={isCancelling}
            aria-label="Close dialog"
            style={{ color: '#64748B', fontSize: '16px' }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ padding: '24px 20px' }}>
          {/* Main Question */}
          <div style={{
            fontSize: '17px',
            fontWeight: 800,
            color: '#172B4D',
            marginBottom: '12px',
            lineHeight: 1.4
          }}>
            Are you sure you want to cancel this emergency request?
          </div>

          <p style={{
            fontSize: '13px',
            color: '#64748B',
            marginBottom: '20px',
            lineHeight: 1.5
          }}>
            Cancelling will halt all emergency tracking, release assigned hospital care teams, and stand down response dispatches.
          </p>

          {/* Emergency Summary Badge Strip */}
          <div style={{
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                Active Incident
              </div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#0B1F3A', marginTop: '2px' }}>
                SOS-{emergency.id}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <StatusBadge status={emergency.severity || 'CRITICAL'} size="sm" />
              <StatusBadge status={emergency.status || 'ACTIVE'} size="sm" />
            </div>
          </div>

          {/* Warning Banner if already accepted by hospital or ambulance */}
          {isAcceptedByUnits && (
            <div style={{
              background: '#FFFBEB',
              border: '1.5px solid #FDE68A',
              borderRadius: '10px',
              padding: '14px',
              marginBottom: '18px'
            }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '20px', flexShrink: 0 }}>🚨</span>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#92400E' }}>
                    Response Teams Already Dispatched
                  </div>
                  <div style={{ fontSize: '12px', color: '#B45309', marginTop: '4px', lineHeight: 1.5 }}>
                    An emergency response unit or hospital facility (
                    <strong>{emergency.hospitalName || 'Assigned Hospital'}</strong>
                    {emergency.ambulanceUnitId ? ` • Ambulance ${emergency.ambulanceUnitId}` : ''}
                    ) has already accepted this request.
                  </div>
                </div>
              </div>

              {/* Explicit Confirmation Checkbox */}
              <label style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                marginTop: '12px',
                paddingTop: '10px',
                borderTop: '1px dashed #FCD34D',
                cursor: 'pointer',
                userSelect: 'none'
              }}>
                <input
                  type="checkbox"
                  id="confirm-cancellation-checkbox"
                  checked={hasAcknowledged}
                  onChange={(e) => setHasAcknowledged(e.target.checked)}
                  style={{
                    accentColor: '#DC2626',
                    width: '16px',
                    height: '16px',
                    marginTop: '2px',
                    cursor: 'pointer'
                  }}
                />
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#78350F', lineHeight: 1.4 }}>
                  I understand that response units are active and explicitly confirm this cancellation.
                </span>
              </label>
            </div>
          )}

          {/* Error Message if cancellation failed */}
          {error && (
            <div style={{
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              color: '#991B1B',
              padding: '12px',
              borderRadius: '8px',
              fontSize: '13px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }} role="alert">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="modal-footer" style={{
          background: '#F8FAFC',
          borderTop: '1px solid #E2E8F0',
          padding: '14px 20px',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px',
          flexWrap: 'wrap'
        }}>
          {/* Action 1: Keep Emergency Active */}
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
            disabled={isCancelling}
            style={{
              padding: '10px 18px',
              fontSize: '14px',
              fontWeight: 700,
              minWidth: '160px'
            }}
          >
            Keep Emergency Active
          </button>

          {/* Action 2: Confirm Cancellation */}
          <button
            type="button"
            onClick={onConfirm}
            className="btn btn-critical"
            disabled={!canSubmit}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              minWidth: '170px',
              justifyContent: 'center',
              opacity: canSubmit ? 1 : 0.6,
              cursor: canSubmit ? 'pointer' : 'not-allowed'
            }}
          >
            {isCancelling ? (
              <>
                <span className="status-spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                <span>Cancelling...</span>
              </>
            ) : (
              <>
                <span aria-hidden="true">✕</span>
                <span>Confirm Cancellation</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CancelEmergencyModal;
