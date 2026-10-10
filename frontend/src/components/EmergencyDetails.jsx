import { RecordedFields, VitalsSummary, AssessmentSummary, MedicalRecords } from './ClinicalSummary';
import { displayDate, displayValue, isActiveEmergency, useApiResource } from '../services/api';

export function TimelineView({ events }) {
  if (!Array.isArray(events)) return <p className="muted">Timeline unavailable.</p>;
  if (events.length === 0) return <p className="muted">No timeline events recorded.</p>;
  return <ol className="timeline-list">{events.map((event, index) => (
    <li key={event.id ?? index}>
      <span className="timeline-status">{displayValue(event.status)}</span>
      <span className="timeline-time">{displayDate(event.timestamp)}</span>
      {event.description && <span className="timeline-desc">{event.description}</span>}
    </li>
  ))}</ol>;
}

export function AssignmentSummary({ emergency }) {
  const active = isActiveEmergency(emergency);
  const assignment = (name, id, type) => name || (id != null ? `${type} assigned (name unavailable)` : active ? 'Pending assignment' : 'Not recorded');
  return <RecordedFields fields={[
    ['Hospital', assignment(emergency.hospitalName, emergency.hospitalId, 'Hospital')],
    ['Doctor', assignment(emergency.doctorName, emergency.doctorId, 'Doctor')],
    ['Hospital distance', emergency.hospitalDistance, ' km'],
    ['Estimated arrival', emergency.hospitalEta, typeof emergency.hospitalEta === 'number' ? ' min' : ''],
  ]} />;
}

export default function EmergencyDetails({ emergencyId, revision }) {
  const { data, loading, error, refresh } = useApiResource(emergencyId != null ? `/emergencies/${emergencyId}` : null, revision);
  const emergency = data?.id != null ? data : null;
  const { data: timeline, error: timelineError } = useApiResource(emergency ? `/emergencies/${emergencyId}/timeline` : null, revision);
  const previousEmergencies = emergency?.previousEmergencies;

  if (!emergencyId) return <p className="muted">Select an emergency to view details.</p>;
  if (loading && !emergency) return <p className="muted" role="status">Loading emergency details…</p>;
  if (error) return <div role="alert"><p className="muted">{error}</p><button className="btn-primary" onClick={refresh}>Retry details</button></div>;
  if (!emergency) return <p className="muted">Emergency not found or no longer available.</p>;

  const patient = emergency.patient ?? {};
  return <div className="emergency-details">
    <header>
      <h2>SOS-{emergency.id}</h2>
      <span className={`pill-status ${emergency.severity === 'CRITICAL' ? 'critical' : 'warning'}`}>{displayValue(emergency.severity)}</span>
      {!isActiveEmergency(emergency) && <span className="pill-status normal">{displayValue(emergency.status)}</span>}
    </header>
    {timelineError ? <p className="muted">{timelineError}</p> : null}
    <section className="detail-section">
      <h3>Incident</h3>
      <RecordedFieldsWrapper emergency={emergency} />
      <AssignmentSummary emergency={emergency} />
    </section>
    <section className="detail-section">
      <h3>Patient</h3>
      <RecordedFields fields={[
        ['Name', patient.fullName], ['Patient UID', patient.uid || emergency.patientUid],
        ['Age', patient.age], ['Blood group', patient.bloodGroup], ['Contact', patient.phone],
        ['Emergency contact', patient.emergencyContact], ['Address', patient.address],
      ]} />
    </section>
    <VitalsSummary vitals={emergency.currentVitals} />
    <AssessmentSummary assessment={emergency.aiAssessment} />
    <MedicalRecords profile={emergency.medicalProfile} history={emergency.medicalHistory} />
    <section className="detail-section">
      <h3>Previous emergencies</h3>
      {!Array.isArray(previousEmergencies) ? <p className="muted">Previous emergencies unavailable.</p> : previousEmergencies.length === 0 ? <p className="muted">No previous emergencies recorded.</p> : (
        <ul className="previous-emergencies">{previousEmergencies.map((previous, index) => (
          <li key={previous.id ?? index}>
            <strong>SOS-{displayValue(previous.id)}</strong>
            <span>{displayDate(previous.createdAt)} · {displayValue(previous.status)}</span>
            <span>{displayValue(previous.severity)} · {displayValue(previous.requiredDepartment)}</span>
          </li>
        ))}</ul>
      )}
    </section>
    <section className="detail-section">
      <h3>Timeline</h3>
      {timelineError ? <p className="muted">Timeline unavailable.</p> : <TimelineView events={timeline} />}
    </section>
  </div>;
}

function RecordedFieldsWrapper({ emergency }) {
  return <dl className="recorded-fields">
    <div><dt>Symptoms</dt><dd>{displayValue(emergency.symptoms)}</dd></div>
    <div><dt>Description</dt><dd>{displayValue(emergency.symptomDescription)}</dd></div>
    <div><dt>Required department</dt><dd>{displayValue(emergency.requiredDepartment)}</dd></div>
    <div><dt>Detected vitals</dt><dd>{displayValue(emergency.detectedVitals)}</dd></div>
    <div><dt>Risk score</dt><dd>{displayValue(emergency.riskScore, '/100')}</dd></div>
    <div><dt>Location</dt><dd>{emergency.latitude != null && emergency.longitude != null ? `${emergency.latitude.toFixed(4)}, ${emergency.longitude.toFixed(4)}` : 'Not recorded'}</dd></div>
    <div><dt>Created</dt><dd>{displayDate(emergency.createdAt)}</dd></div>
    <div><dt>Status</dt><dd>{displayValue(emergency.status)}</dd></div>
  </dl>;
}

