import React, { useState, useEffect } from 'react';
import API, { useApiResource } from '../services/api';
import { useRealtimeRefresh } from '../services/websocket';
import ConfirmModal from './ConfirmModal';

const CONSCIOUSNESS_OPTIONS = [
  { value: 'CONSCIOUS', label: 'Conscious & Oriented' },
  { value: 'CONSCIOUS_ALTERED', label: 'Conscious but Altered/Confused' },
  { value: 'UNRESPONSIVE', label: 'Unresponsive to Pain/Voice' },
  { value: 'COMA', label: 'Coma (GCS < 8)' }
];

const BREATHING_OPTIONS = [
  { value: 'NORMAL', label: 'Normal (12-20 breaths/min)' },
  { value: 'LABORED', label: 'Labored/Dyspneic' },
  { value: 'TACHYPNEIC', label: 'Tachypneic (>20 breaths/min)' },
  { value: 'ABSENT', label: 'Absent/Apneic - RESUSCITATION REQUIRED' },
  { value: 'AGONAL', label: 'Agonal Gasping' }
];

const NEXT_ACTION_OPTIONS = [
  { value: 'REMOTE_MONITORING', label: 'Continue Remote Monitoring', description: 'Patient stable, monitor vitals remotely' },
  { value: 'HOSPITAL_EVALUATION', label: 'Request Immediate Hospital Evaluation', description: 'Patient needs in-person clinical assessment at hospital' },
  { value: 'AMBULANCE_REQUIRED', label: 'Ambulance Transport Required', description: 'Patient requires emergency ambulance transport to hospital' },
  { value: 'FURTHER_ASSESSMENT', label: 'Request Further Clinical Assessment', description: 'Need specialist consultation or additional workup' }
];

const DoctorAssessmentModal = ({
  isOpen,
  onClose,
  assessment,
  emergency,
  onSubmit,
  onStart,
  doctorId
}) => {
  const [formData, setFormData] = useState({
    currentSymptoms: '',
    consciousnessLevel: '',
    breathingStatus: '',
    immediateDangerSigns: '',
    sensorReadingsEvaluation: '',
    additionalObservations: '',
    assessmentSummary: '',
    nextAction: '',
    requiresAmbulance: null,
    ambulanceDecision: 'PENDING'
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [activeSection, setActiveSection] = useState('initial');
  const [localStatus, setLocalStatus] = useState(assessment?.status || 'PENDING');

  const effEmergency = emergency || assessment?.emergency || null;
  const emergencyId = effEmergency?.id;
  const patientUid = effEmergency?.patientUid;

  useEffect(() => {
    if (assessment?.status) {
      setLocalStatus(assessment.status);
    }
  }, [assessment?.status]);

  const { connected: wsConnected, revision } = useRealtimeRefresh(null, emergencyId, patientUid, null);

  // Auto-populate sensor readings evaluation from emergency data
  useEffect(() => {
    if (effEmergency && effEmergency.id) {
      const vitals = effEmergency.detectedVitals || '';
      const symptoms = effEmergency.symptoms || '';
      const desc = effEmergency.symptomDescription || '';
      setFormData(prev => {
        if (prev.sensorReadingsEvaluation) return prev;
        return {
          ...prev,
          sensorReadingsEvaluation: `AI-Detected Vitals: ${vitals}. Symptoms: ${symptoms}. Description: ${desc}. `,
          currentSymptoms: prev.currentSymptoms || symptoms || desc || ''
        };
      });
    }
  }, [effEmergency?.id, effEmergency?.detectedVitals, effEmergency?.symptoms, effEmergency?.symptomDescription]);

  const isSectionValid = (section) => {
    if (section === 'initial') {
      return Boolean(formData.currentSymptoms?.trim() && formData.consciousnessLevel && formData.breathingStatus);
    }
    if (section === 'clinical') {
      return Boolean(formData.assessmentSummary?.trim());
    }
    if (section === 'action') {
      return Boolean(formData.nextAction && formData.requiresAmbulance !== null);
    }
    return true;
  };

  const validateSection = (section) => {
    const newErrors = {};
    if (section === 'initial') {
      if (!formData.currentSymptoms?.trim()) newErrors.currentSymptoms = 'Required';
      if (!formData.consciousnessLevel) newErrors.consciousnessLevel = 'Required';
      if (!formData.breathingStatus) newErrors.breathingStatus = 'Required';
    } else if (section === 'clinical') {
      if (!formData.assessmentSummary?.trim()) newErrors.assessmentSummary = 'Required';
    } else if (section === 'action') {
      if (!formData.nextAction) newErrors.nextAction = 'Required';
      if (formData.requiresAmbulance === null) newErrors.requiresAmbulance = 'Required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
  };

  const handleSectionNext = (section) => {
    if (validateSection(section)) {
      if (section === 'initial') setActiveSection('clinical');
      else if (section === 'clinical') setActiveSection('action');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateSection('action') || !validateSection('clinical') || !validateSection('initial')) return;

    setIsSubmitting(true);
    try {
      await onSubmit(assessment.id, formData);
      onClose();
    } catch (err) {
      alert('Failed to submit assessment: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStart = async () => {
    if (!assessment) return;
    setIsStarting(true);
    try {
      if (onStart) {
        await onStart(assessment.id);
      }
      setLocalStatus('IN_PROGRESS');
    } catch (err) {
      console.warn('onStart handler error:', err);
      // Still allow doctor to proceed with questionnaire
      setLocalStatus('IN_PROGRESS');
    } finally {
      setIsStarting(false);
    }
  };

  if (!isOpen || !assessment) return null;

  const isSubmitted = localStatus === 'SUBMITTED' || assessment.status === 'SUBMITTED';
  const isInProgress = localStatus === 'IN_PROGRESS' || assessment.status === 'IN_PROGRESS' || isSubmitted;
  const isCritical = effEmergency?.severity === 'CRITICAL';
  const isUnresponsive = formData.consciousnessLevel === 'UNRESPONSIVE' || formData.consciousnessLevel === 'COMA';
  const isBreathingAbsent = formData.breathingStatus === 'ABSENT' || formData.breathingStatus === 'AGONAL';

  const patientDisplayName = effEmergency?.patientName || effEmergency?.patient?.fullName || effEmergency?.patientUid || 'Patient';
  const emergencyIdDisplay = effEmergency?.id || assessment.emergencyId || 'N/A';

  return (
    <div className="modal-backdrop modal-overlay" onClick={onClose} style={{ zIndex: 10000 }}>
      <div className="modal-card modal-content assessment-modal" onClick={e => e.stopPropagation()} style={{ zIndex: 10001 }}>
        <div className="modal-header">
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-gray-900)' }}>
              Clinical Emergency Assessment
            </h3>
            <div style={{ fontSize: '12px', color: 'var(--color-gray-500)', marginTop: '2px' }}>
              Emergency SOS-{emergencyIdDisplay} • {patientDisplayName} • Risk: {effEmergency?.riskScore || 85}/100
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <StatusBadge status={effEmergency?.severity || 'CRITICAL'} size="sm" />
            <button onClick={onClose} className="btn btn-ghost" style={{ padding: '4px 8px' }}>✕</button>
          </div>
        </div>

        {/* Patient & Sensor Readings Overview Banner */}
        <div style={{
          background: 'var(--color-gray-50)',
          borderBottom: '1px solid var(--color-gray-200)',
          padding: '12px 20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
          fontSize: '11px'
        }}>
          <div>
            <span style={{ color: 'var(--color-gray-500)', fontWeight: 600 }}>Patient:</span>
            <div style={{ fontWeight: 800, color: 'var(--color-gray-900)', fontSize: '12px' }}>{patientDisplayName}</div>
            <div style={{ color: 'var(--color-gray-500)' }}>UID: {effEmergency?.patientUid || 'N/A'}</div>
          </div>
          <div>
            <span style={{ color: 'var(--color-gray-500)', fontWeight: 600 }}>Detected Vitals:</span>
            <div style={{ fontWeight: 700, color: 'var(--color-critical)' }}>{effEmergency?.detectedVitals || 'Monitoring Telemetry Active'}</div>
          </div>
          <div>
            <span style={{ color: 'var(--color-gray-500)', fontWeight: 600 }}>Reported Symptoms:</span>
            <div style={{ fontWeight: 700, color: 'var(--color-gray-800)' }}>{effEmergency?.symptoms || effEmergency?.symptomDescription || 'Cardiac / Acute Distress'}</div>
          </div>
          <div>
            <span style={{ color: 'var(--color-gray-500)', fontWeight: 600 }}>Assessment Status:</span>
            <div><StatusBadge status={localStatus || assessment.status} size="sm" /></div>
          </div>
        </div>

        {!isSubmitted && !isInProgress && (
          <div className="modal-body" style={{ padding: '24px 20px', textAlign: 'center', background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning-border)', borderRadius: 'var(--radius-md)', margin: '16px 20px' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>📋</div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-warning-text)' }}>
              Assessment Ready to Begin
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-gray-600)', marginTop: '4px' }}>
              Begin clinical evaluation for {patientDisplayName}. Sensor readings and patient profile are loaded.
            </div>
            <button
              onClick={handleStart}
              disabled={isStarting}
              className="btn btn-critical"
              style={{ marginTop: '14px', fontWeight: 800, padding: '10px 28px', fontSize: '13px' }}
              data-testid="start-assessment-modal-btn"
            >
              {isStarting ? 'Starting...' : '▶ Start Assessment Now'}
            </button>
          </div>
        )}

        {(isInProgress || isSubmitted) && (
          <form onSubmit={handleSubmit}>
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {/* Progress Indicator */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', padding: '0 4px' }}>
                {['initial', 'clinical', 'action'].map((section, idx) => (
                  <div key={section} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '50%',
                      background: activeSection === section || (isSubmitted && idx < 2) ? 'var(--color-primary)' : 'var(--color-gray-200)',
                      color: activeSection === section || (isSubmitted && idx < 2) ? '#fff' : 'var(--color-gray-500)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '12px',
                      border: activeSection === section ? '2px solid var(--color-primary)' : 'none'
                    }}>
                      {idx + 1}
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-gray-600)', textAlign: 'center' }}>
                      {section === 'initial' ? 'Initial' : section === 'clinical' ? 'Clinical' : 'Action'}
                    </span>
                  </div>
                ))}
              </div>

              {/* Section 1: Initial Assessment */}
              {activeSection === 'initial' && (
                <div style={{ animation: 'fadeIn 0.2s ease' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '20px' }}>🔍</span>
                    <h4 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-gray-900)', margin: 0 }}>
                      Initial Assessment
                    </h4>
                    {isCritical && (
                      <span style={{ fontSize: '10px', background: 'var(--color-critical-bg)', color: 'var(--color-critical)', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                        CRITICAL PRIORITY
                      </span>
                    )}
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--color-gray-700)', marginBottom: '6px' }}>
                      What symptoms or signs are currently present? <span style={{ color: 'var(--color-critical)' }}>*</span>
                    </label>
                    <textarea
                      value={formData.currentSymptoms}
                      onChange={e => handleChange('currentSymptoms', e.target.value)}
                      rows={3}
                      className={`form-input ${errors.currentSymptoms ? 'error' : ''}`}
                      placeholder="e.g., Chest pain radiating to left arm, diaphoresis, shortness of breath..."
                      disabled={isSubmitted}
                    />
                    {errors.currentSymptoms && <div className="error-text">{errors.currentSymptoms}</div>}
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--color-gray-700)', marginBottom: '6px' }}>
                      Is the patient conscious and responsive? <span style={{ color: 'var(--color-critical)' }}>*</span>
                    </label>
                    <select
                      value={formData.consciousnessLevel}
                      onChange={e => handleChange('consciousnessLevel', e.target.value)}
                      className={`form-input ${errors.consciousnessLevel ? 'error' : ''}`}
                      disabled={isSubmitted}
                    >
                      <option value="">Select consciousness level</option>
                      {CONSCIOUSNESS_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    {errors.consciousnessLevel && <div className="error-text">{errors.consciousnessLevel}</div>}
                    {(isUnresponsive || formData.consciousnessLevel === 'UNRESPONSIVE' || formData.consciousnessLevel === 'COMA') && (
                      <div style={{ marginTop: '8px', padding: '10px', background: 'var(--color-critical-bg)', border: '1px solid var(--color-critical-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-critical)', fontSize: '12px', fontWeight: 700 }}>
                        ⚠️ UNRESPONSIVE PATIENT - PRIORITIZE EMERGENCY ESCALATION. Do not delay action awaiting questionnaire completion.
                      </div>
                    )}
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--color-gray-700)', marginBottom: '6px' }}>
                      Is the patient breathing normally? <span style={{ color: 'var(--color-critical)' }}>*</span>
                    </label>
                    <select
                      value={formData.breathingStatus}
                      onChange={e => handleChange('breathingStatus', e.target.value)}
                      className={`form-input ${errors.breathingStatus ? 'error' : ''}`}
                      disabled={isSubmitted}
                    >
                      <option value="">Select breathing status</option>
                      {BREATHING_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    {errors.breathingStatus && <div className="error-text">{errors.breathingStatus}</div>}
                    {(isBreathingAbsent || formData.breathingStatus === 'ABSENT' || formData.breathingStatus === 'AGONAL') && (
                      <div style={{ marginTop: '8px', padding: '10px', background: 'var(--color-critical-bg)', border: '1px solid var(--color-critical-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-critical)', fontSize: '12px', fontWeight: 700 }}>
                        🚨 ABSENT/AGONAL BREATHING - IMMEDIATE RESUSCITATION REQUIRED. Activate emergency protocols NOW.
                      </div>
                    )}
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--color-gray-700)', marginBottom: '6px' }}>
                      Are there any immediate danger signs?
                    </label>
                    <textarea
                      value={formData.immediateDangerSigns}
                      onChange={e => handleChange('immediateDangerSigns', e.target.value)}
                      rows={2}
                      className="form-input"
                      placeholder="e.g., Hemodynamic instability, active seizure, airway compromise, massive hemorrhage..."
                      disabled={isSubmitted}
                    />
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--color-gray-700)', marginBottom: '6px' }}>
                      Do the current sensor readings require further urgent evaluation?
                    </label>
                    <textarea
                      value={formData.sensorReadingsEvaluation}
                      onChange={e => handleChange('sensorReadingsEvaluation', e.target.value)}
                      rows={3}
                      className="form-input"
                      placeholder="Review AI-detected vitals and note any discrepancies or urgent concerns..."
                      disabled={isSubmitted}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                    <button
                      type="button"
                      onClick={() => handleSectionNext('initial')}
                      disabled={!isSectionValid('initial') || isSubmitted}
                      className="btn btn-primary"
                      style={{ fontWeight: 700 }}
                    >
                      Next: Clinical Observations →
                    </button>
                  </div>
                </div>
              )}

              {/* Section 2: Clinical Observations */}
              {activeSection === 'clinical' && (
                <div style={{ animation: 'fadeIn 0.2s ease' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '20px' }}>🏥</span>
                    <h4 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-gray-900)', margin: 0 }}>
                      Clinical Observations
                    </h4>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--color-gray-700)', marginBottom: '6px' }}>
                      Review the actual sensor readings and their timestamps
                    </label>
                    <div style={{ background: 'var(--color-gray-50)', border: '1px solid var(--color-gray-200)', borderRadius: 'var(--radius-md)', padding: '12px', fontSize: '12px', fontFamily: 'monospace', color: 'var(--color-gray-700)', maxHeight: '200px', overflowY: 'auto' }}>
                      <div style={{ fontWeight: 700, marginBottom: '8px', color: 'var(--color-gray-900)' }}>AI-Detected Vitals:</div>
                      <div>{effEmergency?.detectedVitals || 'HR: 145, SpO2: 82%, Temp: 39.8°C'}</div>
                      <div style={{ marginTop: '8px', fontWeight: 700, color: 'var(--color-gray-900)' }}>Symptoms:</div>
                      <div>{effEmergency?.symptoms || 'Chest pain, dyspnea'}</div>
                      <div style={{ marginTop: '8px', fontWeight: 700, color: 'var(--color-gray-900)' }}>Description:</div>
                      <div>{effEmergency?.symptomDescription || 'Severe chest pressure radiating to left arm'}</div>
                      <div style={{ marginTop: '8px', fontWeight: 700, color: 'var(--color-gray-900)' }}>Risk Score:</div>
                      <div>{effEmergency?.riskScore || 90}/100 ({effEmergency?.severity || 'CRITICAL'})</div>
                      <div style={{ marginTop: '8px', fontWeight: 700, color: 'var(--color-gray-900)' }}>Target Department:</div>
                      <div>{effEmergency?.requiredDepartment || 'Emergency'}</div>
                    </div>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--color-gray-700)', marginBottom: '6px' }}>
                      Record additional observations
                    </label>
                    <textarea
                      value={formData.additionalObservations}
                      onChange={e => handleChange('additionalObservations', e.target.value)}
                      rows={3}
                      className="form-input"
                      placeholder="e.g., Skin signs, neurological findings, hemodynamic parameters, response to initial interventions..."
                      disabled={isSubmitted}
                    />
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--color-gray-700)', marginBottom: '6px' }}>
                      Assessment Summary <span style={{ color: 'var(--color-critical)' }}>*</span>
                    </label>
                    <textarea
                      value={formData.assessmentSummary}
                      onChange={e => handleChange('assessmentSummary', e.target.value)}
                      rows={4}
                      className={`form-input ${errors.assessmentSummary ? 'error' : ''}`}
                      placeholder="Provide a concise clinical assessment: working diagnosis, acuity, key findings, and clinical impression..."
                      disabled={isSubmitted}
                    />
                    {errors.assessmentSummary && <div className="error-text">{errors.assessmentSummary}</div>}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setActiveSection('initial')}
                      disabled={isSubmitted}
                      className="btn btn-secondary"
                      style={{ fontWeight: 700 }}
                    >
                      ← Back: Initial Assessment
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSectionNext('clinical')}
                      disabled={!isSectionValid('clinical') || isSubmitted}
                      className="btn btn-primary"
                      style={{ fontWeight: 700 }}
                    >
                      Next: Next Action →
                    </button>
                  </div>
                </div>
              )}

              {/* Section 3: Next Action */}
              {activeSection === 'action' && (
                <div style={{ animation: 'fadeIn 0.2s ease' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '20px' }}>⚡</span>
                    <h4 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-gray-900)', margin: 0 }}>
                      Next Action & Ambulance Decision
                    </h4>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--color-gray-700)', marginBottom: '10px' }}>
                      Select the next clinical action <span style={{ color: 'var(--color-critical)' }}>*</span>
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {NEXT_ACTION_OPTIONS.map(opt => (
                        <label
                          key={opt.value}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: '10px',
                            padding: '12px', border: `1px solid ${formData.nextAction === opt.value ? 'var(--color-primary)' : 'var(--color-gray-200)'}`,
                            borderRadius: 'var(--radius-md)', cursor: 'pointer',
                            background: formData.nextAction === opt.value ? 'var(--color-primary-bg)' : 'var(--color-white)',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <input
                            type="radio"
                            name="nextAction"
                            value={opt.value}
                            checked={formData.nextAction === opt.value}
                            onChange={() => handleChange('nextAction', opt.value)}
                            style={{ marginTop: '2px', accentColor: 'var(--color-primary)' }}
                            disabled={isSubmitted}
                          />
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-gray-900)' }}>{opt.label}</div>
                            <div style={{ fontSize: '11px', color: 'var(--color-gray-500)' }}>{opt.description}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                    {errors.nextAction && <div className="error-text" style={{ marginTop: '8px' }}>{errors.nextAction}</div>}
                  </div>

                  <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--color-gray-50)', border: '1px solid var(--color-gray-200)', borderRadius: 'var(--radius-md)' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--color-gray-700)', marginBottom: '10px' }}>
                      Is ambulance transport required? <span style={{ color: 'var(--color-critical)' }}>*</span>
                    </label>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="requiresAmbulance"
                          value="true"
                          checked={formData.requiresAmbulance === true}
                          onChange={() => handleChange('requiresAmbulance', true)}
                          disabled={isSubmitted}
                          style={{ accentColor: 'var(--color-critical)', width: '18px', height: '18px' }}
                        />
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-critical)' }}>YES - Dispatch Ambulance</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="requiresAmbulance"
                          value="false"
                          checked={formData.requiresAmbulance === false}
                          onChange={() => handleChange('requiresAmbulance', false)}
                          disabled={isSubmitted}
                          style={{ accentColor: 'var(--color-primary)', width: '18px', height: '18px' }}
                        />
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-primary)' }}>NO - Continue Without Ambulance</span>
                      </label>
                    </div>
                    {errors.requiresAmbulance && <div className="error-text" style={{ marginTop: '8px' }}>{errors.requiresAmbulance}</div>}
                    <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--color-gray-500)' }}>
                      {formData.requiresAmbulance === true ? '🚑 Ambulance will be dispatched immediately upon submission' : formData.requiresAmbulance === false ? '🏥 No ambulance dispatch - patient managed on-site or via alternative transport' : ''}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setActiveSection('clinical')}
                      disabled={isSubmitted}
                      className="btn btn-secondary"
                      style={{ fontWeight: 700 }}
                    >
                      ← Back: Clinical Observations
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || isSubmitted}
                      className="btn btn-success"
                      style={{ fontWeight: 800, padding: '12px 28px', fontSize: '14px' }}
                    >
                      {isSubmitting ? 'Submitting...' : isSubmitted ? '✓ Assessment Submitted' : '✓ Submit Assessment'}
                    </button>
                  </div>
                </div>
              )}

              {isSubmitted && (
                <div style={{ textAlign: 'center', padding: '24px', background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-success)' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>✓</div>
                  <div style={{ fontSize: '16px', fontWeight: 800 }}>Assessment Submitted Successfully</div>
                  <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.8 }}>
                    Submitted at {assessment.submittedAt ? new Date(assessment.submittedAt).toLocaleString() : 'now'} •
                    Ambulance: {assessment.ambulanceDecision === 'REQUIRED' ? 'Dispatched' : assessment.ambulanceDecision === 'NOT_REQUIRED' ? 'Not Required' : 'Pending'}
                  </div>
                </div>
              )}
            </div>
          </form>
        )}

        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '16px 20px', borderTop: '1px solid var(--color-gray-200)' }}>
          <button onClick={onClose} disabled={isSubmitting || isStarting} className="btn btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const StatusBadge = ({ status, size = 'md' }) => {
  if (!status) return null;
  const colors = {
    CRITICAL: 'var(--color-critical)', HIGH: 'var(--color-warning)', MODERATE: 'var(--color-info)',
    LOW: 'var(--color-success)', PENDING: 'var(--color-warning)', ACTIVE: 'var(--color-primary)',
    RESOLVED: 'var(--color-success)', COMPLETED: 'var(--color-success)', CANCELLED: 'var(--color-gray-500)',
    ON: 'var(--color-success)', OFF: 'var(--color-gray-500)', FREE: 'var(--color-primary)', BUSY: 'var(--color-warning)',
    AVAILABLE: 'var(--color-success)', REQUESTED: 'var(--color-info)', ACCEPTED: 'var(--color-primary)',
    DISPATCHED: 'var(--color-primary)', EN_ROUTE_TO_PATIENT: 'var(--color-secondary)', ARRIVED_AT_PATIENT: 'var(--color-warning)',
    PATIENT_PICKED_UP: 'var(--color-info)', EN_ROUTE_TO_HOSPITAL: 'var(--color-secondary)', ARRIVED_AT_HOSPITAL: 'var(--color-success)',
    HOSPITAL_ACCEPTED: 'var(--color-primary)', DOCTOR_ASSIGNED: 'var(--color-info)', AMBULANCE_REQUESTED: 'var(--color-warning)',
    AMBULANCE_ACCEPTED: 'var(--color-primary)', AMBULANCE_DISPATCHED: 'var(--color-primary)',
    AMBULANCE_NOT_REQUIRED: 'var(--color-gray-500)', PENDING_HOSPITAL_ACCEPTANCE: 'var(--color-warning)',
    NEXT_HOSPITAL_REQUESTED: 'var(--color-info)', HOSPITAL_REJECTED: 'var(--color-critical)',
    DETECTED: 'var(--color-critical)', SEARCHING_HOSPITAL: 'var(--color-warning)', FAMILY_NOTIFIED: 'var(--color-info)',
    IN_PROGRESS: 'var(--color-primary)', SUBMITTED: 'var(--color-success)'
  };
  const bgColors = {
    CRITICAL: 'var(--color-critical-bg)', HIGH: 'var(--color-warning-bg)', MODERATE: 'var(--color-info-bg)',
    LOW: 'var(--color-success-bg)', PENDING: 'var(--color-warning-bg)', ACTIVE: 'var(--color-primary-bg)',
    RESOLVED: 'var(--color-success-bg)', COMPLETED: 'var(--color-success-bg)', CANCELLED: 'var(--color-gray-100)',
    ON: 'var(--color-success-bg)', OFF: 'var(--color-gray-100)', FREE: 'var(--color-primary-bg)', BUSY: 'var(--color-warning-bg)',
    AVAILABLE: 'var(--color-success-bg)', REQUESTED: 'var(--color-info-bg)', ACCEPTED: 'var(--color-primary-bg)',
    DISPATCHED: 'var(--color-primary-bg)', EN_ROUTE_TO_PATIENT: 'var(--color-secondary-bg)', ARRIVED_AT_PATIENT: 'var(--color-warning-bg)',
    PATIENT_PICKED_UP: 'var(--color-info-bg)', EN_ROUTE_TO_HOSPITAL: 'var(--color-secondary-bg)', ARRIVED_AT_HOSPITAL: 'var(--color-success-bg)',
    HOSPITAL_ACCEPTED: 'var(--color-primary-bg)', DOCTOR_ASSIGNED: 'var(--color-info-bg)', AMBULANCE_REQUESTED: 'var(--color-warning-bg)',
    AMBULANCE_ACCEPTED: 'var(--color-primary-bg)', AMBULANCE_DISPATCHED: 'var(--color-primary-bg)',
    AMBULANCE_NOT_REQUIRED: 'var(--color-gray-100)', PENDING_HOSPITAL_ACCEPTANCE: 'var(--color-warning-bg)',
    NEXT_HOSPITAL_REQUESTED: 'var(--color-info-bg)', HOSPITAL_REJECTED: 'var(--color-critical-bg)',
    DETECTED: 'var(--color-critical-bg)', SEARCHING_HOSPITAL: 'var(--color-warning-bg)', FAMILY_NOTIFIED: 'var(--color-info-bg)',
    IN_PROGRESS: 'var(--color-primary-bg)', SUBMITTED: 'var(--color-success-bg)'
  };
  const sizes = {
    sm: { padding: '2px 8px', fontSize: '10px' },
    md: { padding: '4px 10px', fontSize: '11px' },
    lg: { padding: '6px 14px', fontSize: '12px' }
  };
  const s = sizes[size] || sizes.md;
  return (
    <span style={{
      ...s, borderRadius: '9999px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em',
      background: bgColors[status] || 'var(--color-gray-100)', color: colors[status] || 'var(--color-gray-700)'
    }}>
      {status.replace(/_/g, ' ')}
    </span>
  );
};

export default DoctorAssessmentModal;