import React, { useState } from 'react';

/**
 * ConfirmModal - Emergency Request & Ambulance Dispatch Form
 */

const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Request Ambulance',
  patientName = 'Patient',
  patientLocation = { lat: 12.9716, lng: 77.5946 },
  onLocationChange,
  pickupAddress = '',
  onAddressChange,
  emergencyType = 'Cardiac',
  onEmergencyTypeChange,
  vitals,
  symptoms = [],
  onSymptomToggle,
  description = '',
  onDescriptionChange,
  hospitalList = [],
  selectedHospitalId = '',
  onHospitalChange,
  isSubmitting = false
}) => {
  const [validationError, setValidationError] = useState('');

  if (!isOpen) return null;

  const defaultSymptoms = [
    'Chest Pain',
    'Shortness of Breath',
    'Loss of Consciousness',
    'Severe Bleeding / Trauma',
    'High Fever / Seizure',
    'Stroke / Paralysis Symptoms'
  ];

  const emergencyTypes = [
    { label: 'Cardiac Emergency', value: 'Cardiac', icon: '❤️' },
    { label: 'Respiratory Distress', value: 'Respiratory', icon: '🫁' },
    { label: 'Trauma / Accident', value: 'Trauma', icon: '🩹' },
    { label: 'Stroke / Neurological', value: 'Neurology', icon: '🧠' },
    { label: 'General Critical', value: 'Critical Medical', icon: '🚨' }
  ];

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (symptoms.length === 0 && !description.trim()) {
      setValidationError('Please select at least one symptom or provide incident details.');
      return;
    }
    setValidationError('');
    onConfirm?.();
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" style={{ pointerEvents: 'auto' }}>
      <div className="modal-card" style={{ maxWidth: '580px', width: '92%', pointerEvents: 'auto' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header" style={{ background: 'var(--color-critical-bg)', borderBottom: '1px solid rgba(220, 38, 38, 0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: '26px' }}>🚑</span>
            <div>
              <h3 className="modal-title" style={{ color: 'var(--color-critical)', margin: 0, fontSize: '18px', fontWeight: 800 }}>
                {title} for {patientName}
              </h3>
              <p style={{ fontSize: '12px', color: '#991B1B', margin: '2px 0 0 0', fontWeight: 500 }}>
                Immediate dispatch of nearest emergency ambulance unit to patient
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm" aria-label="Close" style={{ color: '#991B1B' }}>
            ✕
          </button>
        </div>

        {/* Form Body */}
        <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto', padding: 'var(--space-4)' }}>
          {validationError && (
            <div style={{
              background: '#FEE2E2',
              color: '#991B1B',
              padding: '8px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              marginBottom: 'var(--space-3)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span>⚠️</span>
              <span>{validationError}</span>
            </div>
          )}

          {/* Vitals Summary Card */}
          <div style={{
            background: 'var(--color-gray-50)',
            border: '1px solid var(--color-gray-200)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3) var(--space-4)',
            marginBottom: 'var(--space-4)'
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-gray-500)', textTransform: 'uppercase', marginBottom: '8px' }}>
              Current Patient Telemetry
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)', textAlign: 'center' }}>
              <div style={{ background: 'white', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-gray-200)' }}>
                <div style={{ fontSize: '10px', color: 'var(--color-gray-500)' }}>HEART RATE</div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-critical)' }}>
                  {vitals?.heartRate ? `${vitals.heartRate} BPM` : '78 BPM'}
                </div>
              </div>
              <div style={{ background: 'white', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-gray-200)' }}>
                <div style={{ fontSize: '10px', color: 'var(--color-gray-500)' }}>SpO2</div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-secondary)' }}>
                  {vitals?.spo2 ? `${vitals.spo2}%` : '98%'}
                </div>
              </div>
              <div style={{ background: 'white', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-gray-200)' }}>
                <div style={{ fontSize: '10px', color: 'var(--color-gray-500)' }}>TEMPERATURE</div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-warning)' }}>
                  {vitals?.temperature ? `${vitals.temperature}°C` : '36.7°C'}
                </div>
              </div>
            </div>
          </div>

          {/* Emergency Type Selection */}
          <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
            <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-gray-700)', marginBottom: '6px', display: 'block' }}>
              Emergency Type & Priority Level
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '6px' }}>
              {emergencyTypes.map(t => {
                const isSelected = emergencyType === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEmergencyTypeChange?.(t.value);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '7px 10px',
                      borderRadius: '6px',
                      border: `1.5px solid ${isSelected ? 'var(--color-critical)' : 'var(--color-gray-200)'}`,
                      background: isSelected ? 'var(--color-critical-bg)' : '#FFFFFF',
                      color: isSelected ? 'var(--color-critical)' : 'var(--color-gray-800)',
                      fontSize: '11.5px',
                      fontWeight: isSelected ? 700 : 500,
                      cursor: 'pointer',
                      textAlign: 'left',
                      pointerEvents: 'auto'
                    }}
                  >
                    <span>{t.icon}</span>
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pickup Location & Address */}
          <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-gray-700)', margin: 0 }}>
                📍 Patient Pickup Address
              </label>
              <span style={{ fontSize: '10.5px', color: 'var(--color-success)', fontWeight: 700, background: 'var(--color-success-bg)', padding: '1px 6px', borderRadius: '4px' }}>
                GPS Locked: {patientLocation?.lat ? `${patientLocation.lat.toFixed(4)}, ${patientLocation.lng.toFixed(4)}` : '12.9716, 77.5946'}
              </span>
            </div>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. 42 Indiranagar 100ft Road, Bengaluru, Karnataka"
              value={pickupAddress}
              onChange={e => onAddressChange?.(e.target.value)}
              style={{ fontSize: '13px', pointerEvents: 'auto' }}
            />
          </div>

          {/* Destination Hospital (Optional Selection) */}
          <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
            <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-gray-700)', marginBottom: '4px', display: 'block' }}>
              🏥 Destination Hospital
            </label>
            <select
              className="form-input"
              value={selectedHospitalId}
              onChange={e => onHospitalChange?.(e.target.value)}
              style={{ fontSize: '13px', pointerEvents: 'auto' }}
            >
              <option value="">Auto-assign Nearest Emergency Trauma Hospital (Recommended)</option>
              {hospitalList && hospitalList.map(h => (
                <option key={h.id} value={h.id}>
                  {h.name} — {h.address || 'Emergency Unit'} ({h.availableBeds != null ? `${h.availableBeds} beds` : 'Open'})
                </option>
              ))}
            </select>
          </div>

          {/* Reported Symptoms Checklist */}
          <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
            <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-gray-700)', marginBottom: '6px', display: 'block' }}>
              Reported Patient Symptoms
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {defaultSymptoms.map((s, idx) => {
                const checked = symptoms.includes(s);
                const inputId = `symptom-${idx}-${s.replace(/\s+/g, '-')}`;
                return (
                  <label
                    key={s}
                    htmlFor={inputId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '7px 10px',
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${checked ? 'var(--color-critical)' : 'var(--color-gray-300)'}`,
                      background: checked ? 'var(--color-critical-bg)' : 'white',
                      cursor: 'pointer',
                      fontSize: '11.5px',
                      fontWeight: checked ? 700 : 400,
                      color: checked ? 'var(--color-critical)' : 'var(--color-gray-700)',
                      transition: 'all 0.15s ease',
                      pointerEvents: 'auto'
                    }}
                  >
                    <input
                      id={inputId}
                      type="checkbox"
                      checked={checked}
                      onChange={() => onSymptomToggle?.(s)}
                      style={{ accentColor: 'var(--color-critical)', pointerEvents: 'auto' }}
                    />
                    <span>{s}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Additional Incident Notes */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-gray-700)', marginBottom: '4px', display: 'block' }}>
              Incident Details & Clinical Notes
            </label>
            <textarea
              className="form-textarea"
              style={{ minHeight: '55px', fontSize: '12.5px', pointerEvents: 'auto' }}
              placeholder="e.g. onset 10 mins ago, sudden sharp chest tightness, patient responsive..."
              value={description}
              onChange={e => onDescriptionChange?.(e.target.value)}
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer" style={{ borderTop: '1px solid var(--color-gray-200)', padding: 'var(--space-3) var(--space-4)' }}>
          <button onClick={onClose} className="btn btn-secondary" disabled={isSubmitting} type="button">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="btn btn-critical"
            disabled={isSubmitting}
            style={{ fontWeight: 800, gap: '8px', pointerEvents: 'auto' }}
            type="button"
            id="request-ambulance-submit-btn"
          >
            {isSubmitting ? (
              <>
                <span className="status-spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                <span>DISPATCHING AMBULANCE...</span>
              </>
            ) : (
              <>
                <span>🚑</span>
                <span>REQUEST AMBULANCE</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
