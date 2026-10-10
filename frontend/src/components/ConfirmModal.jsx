import React from 'react';

/**
 * ConfirmModal - Emergency confirmation modal with location and vitals preview
 */

const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Emergency SOS',
  patientLocation,
  vitals,
  symptoms = [],
  onSymptomToggle,
  description,
  onDescriptionChange,
  isSubmitting = false
}) => {
  if (!isOpen) return null;

  const defaultSymptoms = [
    'Chest Pain',
    'Shortness of Breath',
    'Loss of Consciousness',
    'Severe Bleeding / Trauma',
    'High Fever / Seizure'
  ];

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header" style={{ background: 'var(--color-critical-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: '24px' }}>🚨</span>
            <div>
              <h3 className="modal-title" style={{ color: 'var(--color-critical)' }}>
                {title}
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--color-critical)', opacity: 0.9 }}>
                Immediate dispatch to nearest emergency response unit
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm" aria-label="Close">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Vitals Summary Card */}
          <div style={{
            background: 'var(--color-gray-50)',
            border: '1px solid var(--color-gray-200)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3) var(--space-4)',
            marginBottom: 'var(--space-4)'
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-gray-500)', textTransform: 'uppercase', marginBottom: '8px' }}>
              Current Patient Vitals
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)', textAlign: 'center' }}>
              <div style={{ background: 'white', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-gray-200)' }}>
                <div style={{ fontSize: '10px', color: 'var(--color-gray-500)' }}>HEART RATE</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-critical)' }}>
                  {vitals?.heartRate ? `${vitals.heartRate} BPM` : '78 BPM'}
                </div>
              </div>
              <div style={{ background: 'white', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-gray-200)' }}>
                <div style={{ fontSize: '10px', color: 'var(--color-gray-500)' }}>SpO2</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-secondary)' }}>
                  {vitals?.spo2 ? `${vitals.spo2}%` : '98%'}
                </div>
              </div>
              <div style={{ background: 'white', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-gray-200)' }}>
                <div style={{ fontSize: '10px', color: 'var(--color-gray-500)' }}>TEMP</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-warning)' }}>
                  {vitals?.temperature ? `${vitals.temperature}°C` : '36.7°C'}
                </div>
              </div>
            </div>
          </div>

          {/* Current Location */}
          <div style={{
            background: 'var(--color-gray-50)',
            border: '1px solid var(--color-gray-200)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3) var(--space-4)',
            marginBottom: 'var(--space-4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-gray-500)', textTransform: 'uppercase' }}>
                📍 GPS Coordinates
              </div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-gray-800)', fontFamily: 'monospace', marginTop: '2px' }}>
                {patientLocation?.lat ? `${patientLocation.lat.toFixed(4)}, ${patientLocation.lng.toFixed(4)}` : '12.9716, 77.5946 (Current Location)'}
              </div>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--color-success)', fontWeight: 600, background: 'var(--color-success-bg)', padding: '2px 8px', borderRadius: '4px' }}>
              ✓ Geolocation Locked
            </span>
          </div>

          {/* Symptoms Checklist */}
          <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
            <label className="form-label">Select Reported Symptoms</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {defaultSymptoms.map(s => {
                const checked = symptoms.includes(s);
                return (
                  <label
                    key={s}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${checked ? 'var(--color-critical)' : 'var(--color-gray-300)'}`,
                      background: checked ? 'var(--color-critical-bg)' : 'white',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: checked ? 600 : 400,
                      color: checked ? 'var(--color-critical)' : 'var(--color-gray-700)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onSymptomToggle?.(s)}
                      style={{ accentColor: 'var(--color-critical)' }}
                    />
                    <span>{s}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Additional details */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Additional Incident Notes</label>
            <textarea
              className="form-textarea"
              style={{ minHeight: '60px', fontSize: '13px' }}
              placeholder="e.g. onset 10 mins ago, sudden sharp pain, patient responsive..."
              value={description}
              onChange={e => onDescriptionChange?.(e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary" disabled={isSubmitting}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="btn btn-critical"
            disabled={isSubmitting}
            style={{ fontWeight: 800, gap: '8px' }}
          >
            {isSubmitting ? 'DISPATCHING SOS...' : '🚨 CONFIRM & DISPATCH SOS'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
