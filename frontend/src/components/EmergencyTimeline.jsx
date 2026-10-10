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
  { key: 'HOSPITAL_ASSIGNED', label: 'Hospital Assigned', description: 'Assigned to nearest capable hospital' },
  { key: 'HOSPITAL_ACCEPTED', label: 'Hospital Accepted', description: 'Hospital command center accepted case' },
  { key: 'DOCTOR_ASSIGNED', label: 'Doctor Assigned', description: 'Emergency specialist physician assigned' },
  { key: 'AMBULANCE_REQUESTED', label: 'Ambulance Requested', description: 'Emergency transit requested' },
  { key: 'EN_ROUTE_TO_PATIENT', label: 'Ambulance En Route', aliases: ['AMBULANCE_ACCEPTED', 'AMBULANCE_DISPATCHED'], description: 'Ambulance traveling to patient' },
  { key: 'PATIENT_PICKED_UP', label: 'Patient Picked Up', aliases: ['ARRIVED_AT_PATIENT'], description: 'Patient secured in ambulance' },
  { key: 'ARRIVED_AT_HOSPITAL', label: 'Arrived at Hospital', aliases: ['EN_ROUTE_TO_HOSPITAL'], description: 'Ambulance arrived at emergency department' },
  { key: 'RESOLVED', label: 'Resolved', description: 'Patient safely admitted and care transitioned' },
];

const EmergencyTimeline = ({ currentStatus, timestamps = {}, compact = false }) => {
  // Normalize currentStatus
  const normalizedStatus = (currentStatus || 'DETECTED').toUpperCase();

  // Determine current active step index
  let currentIndex = DEFAULT_TIMELINE_STEPS.findIndex(
    step => step.key === normalizedStatus || (step.aliases && step.aliases.includes(normalizedStatus))
  );

  if (currentIndex === -1) {
    if (normalizedStatus === 'RESOLVED') {
      currentIndex = DEFAULT_TIMELINE_STEPS.length - 1;
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

  return (
    <div className="timeline-container" role="list" aria-label="Emergency Workflow Timeline">
      {DEFAULT_TIMELINE_STEPS.map((step, idx) => {
        const isCompleted = idx < currentIndex || (normalizedStatus === 'RESOLVED' && idx === DEFAULT_TIMELINE_STEPS.length - 1);
        const isActive = idx === currentIndex && normalizedStatus !== 'RESOLVED';
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
    </div>
  );
};

export default EmergencyTimeline;