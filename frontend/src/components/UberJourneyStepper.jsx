import React from 'react';

/**
 * UberJourneyStepper
 * Uber-style visual journey progress indicator for emergency medical transit.
 * Strictly adheres to 9 defined journey statuses:
 * 1. Emergency reported
 * 2. Ambulance assigned
 * 3. Ambulance dispatched
 * 4. En route to patient
 * 5. Arrived at pickup location
 * 6. Patient onboard
 * 7. En route to hospital
 * 8. Arrived at hospital
 * 9. Journey completed
 * 
 * Only advances when corresponding events are received or confirmed.
 */

export const UBER_JOURNEY_STEPS = [
  {
    key: 'EMERGENCY_REPORTED',
    label: 'Emergency Reported',
    shortLabel: 'Reported',
    icon: '🚨',
    description: 'Emergency registered & triage active',
    aliases: ['DETECTED', 'CREATED', 'SEARCHING_HOSPITAL', 'REQUESTED']
  },
  {
    key: 'AMBULANCE_ASSIGNED',
    label: 'Ambulance Assigned',
    shortLabel: 'Assigned',
    icon: '📋',
    description: 'Unit allocated to incident',
    aliases: ['HOSPITAL_ASSIGNED', 'HOSPITAL_ACCEPTED', 'AMBULANCE_REQUESTED']
  },
  {
    key: 'AMBULANCE_DISPATCHED',
    label: 'Ambulance Dispatched',
    shortLabel: 'Dispatched',
    icon: '⚡',
    description: 'Driver accepted & en route to vehicle',
    aliases: ['AMBULANCE_ACCEPTED', 'DISPATCHED']
  },
  {
    key: 'EN_ROUTE_TO_PATIENT',
    label: 'En Route to Patient',
    shortLabel: 'En Route',
    icon: '🚑',
    description: 'Navigating to patient pickup location',
    aliases: ['IN_TRANSIT_PATIENT']
  },
  {
    key: 'ARRIVED_AT_PATIENT',
    label: 'Arrived at Pickup',
    shortLabel: 'Arrived Pickup',
    icon: '📍',
    description: 'Paramedics on scene with patient',
    aliases: ['ON_SCENE']
  },
  {
    key: 'PATIENT_PICKED_UP',
    label: 'Patient Onboard',
    shortLabel: 'Onboard',
    icon: '🩺',
    description: 'Secured inside ambulance with telemetry',
    aliases: ['PATIENT_LOADED', 'PATIENT_SECURED']
  },
  {
    key: 'EN_ROUTE_TO_HOSPITAL',
    label: 'En Route to Hospital',
    shortLabel: 'Transit Hosp.',
    icon: '🏥',
    description: 'Emergency transit to destination hospital',
    aliases: ['IN_TRANSIT_HOSPITAL']
  },
  {
    key: 'ARRIVED_AT_HOSPITAL',
    label: 'Arrived at Hospital',
    shortLabel: 'Arrived Hosp.',
    icon: '🏨',
    description: 'Arrived at ER trauma bay',
    aliases: ['AT_HOSPITAL']
  },
  {
    key: 'JOURNEY_COMPLETED',
    label: 'Journey Completed',
    shortLabel: 'Completed',
    icon: '✓',
    description: 'Admitted & care safely transitioned',
    aliases: ['COMPLETED', 'RESOLVED']
  }
];

export const getStepIndex = (status) => {
  if (!status) return 0;
  const normalized = String(status).toUpperCase().replace(/[\s-]/g, '_');
  
  if (normalized === 'RESOLVED' || normalized === 'COMPLETED' || normalized === 'JOURNEY_COMPLETED') {
    return UBER_JOURNEY_STEPS.length - 1;
  }
  
  const foundIndex = UBER_JOURNEY_STEPS.findIndex(
    step => step.key === normalized || (step.aliases && step.aliases.includes(normalized))
  );
  
  return foundIndex >= 0 ? foundIndex : 0;
};

const UberJourneyStepper = ({
  currentStatus = 'EN_ROUTE_TO_PATIENT',
  timestamps = {},
  etaMinutes = null,
  distanceKm = null
}) => {
  const currentIndex = getStepIndex(currentStatus);
  const isCompleted = currentIndex === UBER_JOURNEY_STEPS.length - 1;
  const activeStep = UBER_JOURNEY_STEPS[currentIndex] || UBER_JOURNEY_STEPS[0];

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
    <div
      className="uber-journey-stepper-card"
      style={{
        background: '#FFFFFF',
        borderRadius: 'var(--radius-xl, 16px)',
        border: '1.5px solid var(--color-gray-200, #E2E8F0)',
        boxShadow: '0 4px 20px rgba(11, 31, 58, 0.06)',
        padding: '18px 22px',
        marginBottom: '16px'
      }}
      role="region"
      aria-label="Ambulance Journey Progress Tracker"
    >
      {/* Prominent Header Banner */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '18px',
        borderBottom: '1px solid #F1F5F9',
        paddingBottom: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            background: isCompleted ? '#10B981' : '#0B1F3A',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            boxShadow: '0 2px 10px rgba(11, 31, 58, 0.15)'
          }}>
            {activeStep.icon}
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Live Journey Status • Step {currentIndex + 1} of {UBER_JOURNEY_STEPS.length}
            </div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: '#0B1F3A', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>{activeStep.label}</span>
              {!isCompleted && (
                <span
                  style={{
                    display: 'inline-block',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: '#10B981',
                    boxShadow: '0 0 10px #10B981',
                    animation: 'beaconPulse 1.4s infinite'
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Live Metrics Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {distanceKm != null && (
            <div style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '20px',
              padding: '5px 12px',
              fontSize: '12px',
              fontWeight: 700,
              color: '#0B1F3A',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span>📏</span>
              <span>{distanceKm} km away</span>
            </div>
          )}

          {etaMinutes != null && (
            <div style={{
              background: '#F0FDFA',
              border: '1px solid #99F6E4',
              borderRadius: '20px',
              padding: '5px 12px',
              fontSize: '12px',
              fontWeight: 800,
              color: '#0F766E',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span>⏱️</span>
              <span>ETA ~{etaMinutes} min</span>
            </div>
          )}

          <div style={{
            background: isCompleted ? '#DCFCE7' : '#EFF6FF',
            border: `1px solid ${isCompleted ? '#86EFAC' : '#BFDBFE'}`,
            borderRadius: '20px',
            padding: '5px 14px',
            fontSize: '12px',
            fontWeight: 800,
            color: isCompleted ? '#166534' : '#1D4ED8',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span>{isCompleted ? '✓ Verified Complete' : '● Live Tracking Active'}</span>
          </div>
        </div>
      </div>

      {/* Horizontal Progress Track (Uber Style) */}
      <div
        className="uber-stepper-track-scroll"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          position: 'relative',
          overflowX: 'auto',
          paddingBottom: '8px',
          paddingTop: '6px'
        }}
      >
        {UBER_JOURNEY_STEPS.map((step, idx) => {
          const isPassed = idx < currentIndex || isCompleted;
          const isCurrent = idx === currentIndex && !isCompleted;
          const isPending = idx > currentIndex && !isCompleted;

          const stepTimeRaw = timestamps[step.key] || (step.aliases && step.aliases.map(a => timestamps[a]).find(Boolean));
          const stepTime = formatTime(stepTimeRaw);

          return (
            <React.Fragment key={step.key}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  minWidth: '78px',
                  maxWidth: '100px',
                  textAlign: 'center',
                  position: 'relative',
                  zIndex: 2,
                  flexShrink: 0
                }}
              >
                {/* Node Circle */}
                <div
                  style={{
                    width: isCurrent ? '34px' : '26px',
                    height: isCurrent ? '34px' : '26px',
                    borderRadius: '50%',
                    background: isPassed
                      ? '#10B981'
                      : isCurrent
                      ? '#0D9488'
                      : '#FFFFFF',
                    border: isPassed
                      ? '2px solid #10B981'
                      : isCurrent
                      ? '3px solid #2DD4BF'
                      : '2px solid #CBD5E1',
                    color: isPassed || isCurrent ? '#FFFFFF' : '#94A3B8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: isCurrent ? '15px' : '11px',
                    fontWeight: 800,
                    boxShadow: isCurrent
                      ? '0 0 0 5px rgba(13, 148, 136, 0.22), 0 4px 12px rgba(13, 148, 136, 0.35)'
                      : isPassed
                      ? '0 2px 6px rgba(16, 185, 129, 0.25)'
                      : 'none',
                    transition: 'all 0.3s ease',
                    marginBottom: '8px'
                  }}
                  title={`${step.label}: ${isPassed ? 'Completed' : isCurrent ? 'Active Now' : 'Pending'}`}
                >
                  {isPassed ? '✓' : isCurrent ? step.icon : (idx + 1)}
                </div>

                {/* Step Label */}
                <span
                  style={{
                    fontSize: isCurrent ? '11px' : '10.5px',
                    fontWeight: isCurrent ? 800 : isPassed ? 700 : 600,
                    color: isCurrent
                      ? '#0F766E'
                      : isPassed
                      ? '#1E293B'
                      : '#94A3B8',
                    lineHeight: 1.25,
                    display: 'block'
                  }}
                >
                  {step.shortLabel}
                </span>

                {/* Optional Timestamp */}
                {stepTime && (
                  <span
                    style={{
                      fontSize: '9.5px',
                      color: '#64748B',
                      marginTop: '2px',
                      fontWeight: 600
                    }}
                  >
                    {stepTime}
                  </span>
                )}
              </div>

              {/* Connecting Line Between Steps */}
              {idx < UBER_JOURNEY_STEPS.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: '3px',
                    minWidth: '24px',
                    marginTop: '13px',
                    background: idx < currentIndex
                      ? '#10B981'
                      : idx === currentIndex
                      ? 'linear-gradient(90deg, #0D9488 0%, #E2E8F0 100%)'
                      : '#E2E8F0',
                    transition: 'background 0.4s ease',
                    zIndex: 1
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      <style>{`
        @keyframes beaconPulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.4;
            transform: scale(1.3);
          }
        }
        .uber-stepper-track-scroll::-webkit-scrollbar {
          height: 4px;
        }
        .uber-stepper-track-scroll::-webkit-scrollbar-thumb {
          background: #CBD5E1;
          border-radius: 4px;
        }
      `}</style>
    </div>
  );
};

export default UberJourneyStepper;
