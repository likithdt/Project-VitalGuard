import React from 'react';

/**
 * EmergencyTimeline - Reusable medical workflow timeline (Section 15)
 * Visual states:
 * Completed -> ✓ (green node, solid green connector)
 * Active    -> ● (blue/pulse node)
 * Pending   -> ○ (gray circle, gray connector)
 */

const DEFAULT_TIMELINE_STEPS = [
  { key: 'DETECTED', label: 'Detected', description: 'Emergency condition detected and triaged' },
  { key: 'HOSPITAL_ASSIGNED', label: 'Hospital Assigned', aliases: ['PENDING_HOSPITAL_ACCEPTANCE', 'NEXT_HOSPITAL_REQUESTED'], description: 'Assigned to nearest capable hospital' },
  { key: 'HOSPITAL_ACCEPTED', label: 'Hospital Accepted', description: 'Hospital command center accepted case' },
  { key: 'DOCTOR_ASSIGNED', label: 'Doctor Assigned', aliases: ['AMBULANCE_NOT_REQUIRED'], description: 'Emergency specialist physician assigned' },
  { key: 'AMBULANCE_REQUESTED', label: 'Ambulance Requested', aliases: ['PENDING_DRIVER_ACCEPTANCE'], description: 'Emergency transit requested' },
  { key: 'EN_ROUTE_TO_PATIENT', label: 'Ambulance En Route', aliases: ['AMBULANCE_ACCEPTED', 'AMBULANCE_DISPATCHED', 'DRIVER_ACCEPTED', 'JOURNEY_STARTED'], description: 'Ambulance traveling to patient' },
  { key: 'PATIENT_PICKED_UP', label: 'Patient Picked Up', aliases: ['ARRIVED_AT_PATIENT', 'ARRIVED_AT_PICKUP', 'PATIENT_ONBOARD'], description: 'Patient secured in ambulance' },
  { key: 'ARRIVED_AT_HOSPITAL', label: 'Arrived at Hospital', aliases: ['EN_ROUTE_TO_HOSPITAL'], description: 'Ambulance arrived at emergency department' },
  { key: 'RESOLVED', label: 'Resolved', aliases: ['COMPLETED'], description: 'Patient safely admitted and care transitioned' },
];

const TERMINAL_STATUSES = ['CANCELLED', 'RESOLVED', 'COMPLETED'];

const EmergencyTimeline = ({ currentStatus, timestamps = {}, compact = false }) => {
  // Normalize currentStatus
  const normalizedStatus = (currentStatus || 'DETECTED').toUpperCase();

  // Determine current active step index
  let currentIndex = DEFAULT_TIMELINE_STEPS.findIndex(
    step => step.key === normalizedStatus || (step.aliases && step.aliases.includes(normalizedStatus))
  );

  // Handle terminal statuses (CANCELLED, RESOLVED, COMPLETED)
  // For terminal statuses, show the last step that was reached based on timestamps
  // If no timestamps, default to the last completed step or DETECTED
  const isTerminal = TERMINAL_STATUSES.includes(normalizedStatus);
  if (currentIndex === -1 || isTerminal) {
    if (normalizedStatus === 'RESOLVED' || normalizedStatus === 'COMPLETED') {
      currentIndex = DEFAULT_TIMELINE_STEPS.length - 1;
    } else if (normalizedStatus === 'CANCELLED') {
      // Find the last step that has a timestamp
      let lastCompletedIndex = -1;
      DEFAULT_TIMELINE_STEPS.forEach((step, idx) => {
        const stepKeys = [step.key, ...(step.aliases || [])];
        const hasTimestamp = stepKeys.some(k => timestamps[k]);
        if (hasTimestamp) lastCompletedIndex = idx;
      });
      currentIndex = lastCompletedIndex >= 0 ? lastCompletedIndex : 0;
    } else {
      currentIndex = 0;
    }
  }

  const formatTime = (ts) => {
    if (!ts) return null;
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return null;
    }
  };

  const isCancelled = normalizedStatus === 'CANCELLED';

  return (
    <div className="timeline-container" role="list" aria-label="Emergency Workflow Timeline">
      {DEFAULT_TIMELINE_STEPS.map((step, idx) => {
        const isCompleted = idx < currentIndex || (normalizedStatus === 'RESOLVED' && idx === DEFAULT_TIMELINE_STEPS.length - 1);
        const isActive = idx === currentIndex && !isCancelled && normalizedStatus !== 'RESOLVED';
        const isPending = idx > currentIndex;

        const stateClass = isCompleted ? 'completed' : isActive ? 'active' : 'pending';
        const rawTime = timestamps[step.key] || (step.aliases && step.aliases.map(a => timestamps[a]).find(Boolean));
        const formattedTime = formatTime(Array.isArray(rawTime) ? rawTime[0] : rawTime);

        return (
          <div key={step.key} className="timeline-step" role="listitem">
            <div className="timeline-axis">
              <div className={`timeline-node ${stateClass}`} aria-label={`${step.label}: ${stateClass}`}>
                {isCompleted ? '✓' : isActive ? '●' : '○'}
              </div>
              {idx < DEFAULT_TIMELINE_STEPS.length - 1 && (
                <div className={`timeline-line ${isCompleted ? 'completed' : ''}`} />
              )}
            </div>

            <div className="timeline-content">
              <div className="timeline-title-row">
                <span className={`timeline-title ${isActive ? 'active' : ''}`}>
                  {step.label}
                </span>
                {formattedTime && (
                  <span className="timeline-time">{formattedTime}</span>
                )}
              </div>
              {!compact && (
                <p style={{ fontSize: '11px', color: 'var(--color-gray-500)', marginTop: '2px', lineHeight: 1.3 }}>
                  {step.description}
                </p>
              )}
            </div>
          </div>
        );
      })}
      {isCancelled && (
        <div style={{ marginTop: '12px', padding: '8px 12px', background: 'var(--color-critical-bg)', border: '1px solid var(--color-critical-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-critical)', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>✕</span>
          <span>Emergency was cancelled</span>
        </div>
      )}
    </div>
  );
};

export default EmergencyTimeline;