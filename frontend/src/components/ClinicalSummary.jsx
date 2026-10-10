import { displayDate, displayValue } from '../services/api';

export function RecordedFields({ fields }) {
  return <dl className="recorded-fields">{fields.map(([label, value, suffix]) => (
    <div key={label}><dt>{label}</dt><dd>{displayValue(value, suffix)}</dd></div>
  ))}</dl>;
}

export function VitalsSummary({ vitals }) {
  return <section className="detail-section">
    <h3>Current vitals</h3>
    <p className="muted">Recorded: {displayDate(vitals?.recordedAt)}</p>
    <RecordedFields fields={[
      ['Heart rate', vitals?.heartRate, ' BPM'], ['Oxygen saturation', vitals?.spo2, '%'],
      ['Temperature', vitals?.temperature, ' °C'], ['Systolic pressure', vitals?.bpSystolic, ' mmHg'],
      ['Diastolic pressure', vitals?.bpDiastolic, ' mmHg'], ['Glucose', vitals?.glucose, ' mg/dL'],
      ['Respiratory rate', vitals?.respiratoryRate, ' breaths/min'],
    ]} />
  </section>;
}

export function AssessmentSummary({ assessment }) {
  return <section className="detail-section">
    <h3>AI assessment</h3>
    {assessment ? <>
      <p className="muted">Recorded: {displayDate(assessment.recordedAt)}</p>
      <RecordedFields fields={[
        ['Risk score', assessment.riskScore, '/100'], ['Severity', assessment.severity],
        ['Deterioration probability', Number.isFinite(assessment.deteriorationProbability) ? (assessment.deteriorationProbability * 100).toFixed(1) : null, '%'],
        ['Anomaly score', assessment.anomalyScore, '/100'], ['Prediction window', assessment.predictionWindowMinutes, ' minutes'],
        ['Trend', assessment.trend], ['Explanations', assessment.explanations],
      ]} />
    </> : <p className="muted">No assessment available.</p>}
    <p className="muted">AI-assisted prediction, not a medical diagnosis.</p>
  </section>;
}

export function MedicalRecords({ profile, history }) {
  return <>
    <section className="detail-section">
      <h3>Medical profile</h3>
      {profile ? <RecordedFields fields={[
        ['Conditions', profile.existingConditions], ['Cardiac history', profile.previousHeartProblems],
        ['Diabetes', profile.diabetes], ['Hypertension', profile.hypertension], ['Asthma', profile.asthma],
        ['Allergies', profile.allergies], ['Medications', profile.currentMedications],
        ['Surgeries', profile.previousSurgeries], ['Hospitalizations', profile.previousHospitalizations],
        ['Other symptoms', profile.customSymptoms],
      ]} /> : <p className="muted">Medical profile not available.</p>}
    </section>
    <section className="detail-section">
      <h3>Medical history</h3>
      {!Array.isArray(history) ? <p className="muted">Medical history not available.</p> : history.length === 0 ? <p className="muted">No medical history recorded.</p> : history.map((record, index) => (
        <article className="history-record" key={record.id ?? index}>
          <RecordedFields fields={[
            ['Date', record.date], ['Diagnosis', record.diagnosis], ['Symptoms', record.symptoms],
            ['Treatment', record.treatment], ['Medications', record.medications], ['Notes', record.notes],
            ['Hospital', record.hospital], ['Doctor', record.doctor], ['Department', record.department], ['Recorded vitals', record.vitals],
          ]} />
        </article>
      ))}
    </section>
  </>;
}
