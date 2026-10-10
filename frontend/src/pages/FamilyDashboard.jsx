import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import API, { isActiveEmergency, useApiResource } from '../services/api';
import { useRealtimeRefresh } from '../services/websocket';
import DashboardLayout from '../components/DashboardLayout';
import StatCard from '../components/StatCard';
import VitalCard from '../components/VitalCard';
import EmergencyTimeline from '../components/EmergencyTimeline';
import EmergencyAlert from '../components/EmergencyAlert';
import StatusBadge from '../components/StatusBadge';
import GoogleMapTracking from '../components/GoogleMapTracking';
import ConfirmModal from '../components/ConfirmModal';
import { EmptyState, LoadingState } from '../components/StateComponents';

const getWorkflowAmbulanceStatus = (sos, tracking) => {
  if (!sos) return 'Standby';
  if (sos.requiresAmbulance === false || sos.status === 'AMBULANCE_NOT_REQUIRED') {
    return 'Not Required';
  }
  if (tracking?.status) {
    return tracking.status.replace(/_/g, ' ');
  }
  if (sos.ambulanceStatus) {
    return sos.ambulanceStatus.replace(/_/g, ' ');
  }
  switch (sos.status) {
    case 'CREATED':
    case 'SEARCHING_HOSPITAL':
    case 'DETECTED':
      return 'Searching Hospital';
    case 'HOSPITAL_ASSIGNED':
      return 'Awaiting Hospital Acceptance';
    case 'HOSPITAL_ACCEPTED':
      return 'Hospital Accepted - Assigning';
    case 'AMBULANCE_REQUESTED':
      return 'Request Sent to Driver';
    case 'AMBULANCE_ACCEPTED':
      return 'Driver Accepted - Preparing Dispatch';
    case 'AMBULANCE_DISPATCHED':
    case 'EN_ROUTE_TO_PATIENT':
      return 'En Route to Patient';
    case 'ARRIVED_AT_PATIENT':
      return 'Arrived at Patient';
    case 'PATIENT_PICKED_UP':
      return 'Patient Picked Up';
    case 'EN_ROUTE_TO_HOSPITAL':
      return 'En Route to Hospital';
    case 'ARRIVED_AT_HOSPITAL':
      return 'Arrived at Hospital';
    case 'RESOLVED':
    case 'COMPLETED':
      return 'Resolved';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return sos.status ? sos.status.replace(/_/g, ' ') : 'Standby';
  }
};

const FamilyDashboard = () => {
  const { user } = useAuth();
  const [selectedPatientUid, setSelectedPatientUid] = useState(null);
  const [trackedEmergencyId, setTrackedEmergencyId] = useState(null);

  // Tab state synced with URL search params if present
  const getInitialTab = () => {
    if (typeof window !== 'undefined' && window.location.search) {
      const tabParam = new URLSearchParams(window.location.search).get('tab');
      if (tabParam === 'telemetry' || tabParam === 'vitals') return 'telemetry';
      if (tabParam === 'emergency' || tabParam === 'sos') return 'emergency';
      if (tabParam === 'history') return 'history';
    }
    return 'overview';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);

  const switchTab = (tabKey) => {
    setActiveTab(tabKey);
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      const newUrl = tabKey === 'overview' ? '/family-dashboard' : `/family-dashboard?tab=${tabKey}`;
      window.history.replaceState(null, '', newUrl);
    }
  };

  // Listen to popstate for browser navigation
  useEffect(() => {
    const handleUrlChange = () => {
      const tabParam = new URLSearchParams(window.location.search).get('tab');
      if (tabParam === 'telemetry' || tabParam === 'vitals') setActiveTab('telemetry');
      else if (tabParam === 'emergency' || tabParam === 'sos') setActiveTab('emergency');
      else if (tabParam === 'history') setActiveTab('history');
      else if (tabParam === 'overview') setActiveTab('overview');
    };
    window.addEventListener('popstate', handleUrlChange);
    return () => window.removeEventListener('popstate', handleUrlChange);
  }, []);

  // WebSocket real-time subscription for family member & selected patient
  const { connected: wsConnected, revision, refresh, tracking: trackingData } = useRealtimeRefresh(
    user?.uid,
    trackedEmergencyId,
    selectedPatientUid || user?.uid,
    user
  );

  // Fetch linked patients for this family member
  const { data: linkedPatientsData, loading: loadingPatients } = useApiResource('/family/patients', revision);
  const linkedPatients = Array.isArray(linkedPatientsData) ? linkedPatientsData : [];

  // Automatically select the first linked patient if none selected
  useEffect(() => {
    if (linkedPatients.length > 0 && !selectedPatientUid) {
      setSelectedPatientUid(linkedPatients[0].uid);
    }
  }, [linkedPatients, selectedPatientUid]);

  const selectedPatient = linkedPatients.find(p => p.uid === selectedPatientUid) || linkedPatients[0] || null;

  // Active emergencies in system
  const { data: activeQueue } = useApiResource('/emergency/active', revision);
  const activeEmergencies = Array.isArray(activeQueue) ? activeQueue.filter(isActiveEmergency) : [];

  // Emergency matching any linked patient or selected patient
  const activeSos = activeEmergencies.find(e =>
    e.patientUid === selectedPatient?.uid || linkedPatients.some(lp => lp.uid === e.patientUid)
  ) || null;

  const activeId = activeSos?.id ?? null;
  if (trackedEmergencyId !== activeId) {
    setTrackedEmergencyId(activeId);
  }

  // Assigned Hospital & Doctor for active SOS
  const { data: assignedHospital } = useApiResource(activeId != null ? `/emergencies/${activeId}/hospital` : null, revision);
  const { data: assignedDoctor } = useApiResource(activeId != null ? `/emergencies/${activeId}/doctor` : null, revision);

  // Emergency history for selected patient
  const { data: patientHistoryData } = useApiResource(
    selectedPatient?.uid ? `/family/emergencies/${selectedPatient.uid}` : null,
    revision
  );
  const pastEmergencies = Array.isArray(patientHistoryData) ? patientHistoryData : [];
  const [selectedPastSos, setSelectedPastSos] = useState(null);
  const [pastTimelineEvents, setPastTimelineEvents] = useState([]);

  // Telemetry for selected patient
  const { data: vitalsData } = useApiResource('/vitals/history', revision);
  const vitalsList = Array.isArray(vitalsData) ? vitalsData : [];
  const latestVital = vitalsList[0] || null;

  // AI Assessment for selected patient
  const [patientAi, setPatientAi] = useState(null);
  useEffect(() => {
    if (!selectedPatient?.uid) return;
    let cancelled = false;
    API.get(`/ai/patients/${selectedPatient.uid}/assessment`)
      .then(res => {
        if (!cancelled && res.status === 200 && res.data) setPatientAi(res.data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedPatient?.uid, revision]);

  // Confirmation modal for family member initiating emergency on patient's behalf
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [symptomList, setSymptomList] = useState(['Chest Pain']);
  const [symptomDesc, setSymptomDesc] = useState('');
  const [isDispatching, setIsDispatching] = useState(false);

  const handleSymptomToggle = (symptom) => {
    setSymptomList(prev =>
      prev.includes(symptom) ? prev.filter(s => s !== symptom) : [...prev, symptom]
    );
  };

  const executeSosForPatient = async () => {
    try {
      setIsDispatching(true);
      await API.post('/emergency/sos', {
        alert_message: `Family Report for ${selectedPatient?.fullName || 'Patient'}: ${symptomList.join(', ')}`,
        description: `Initiated by Family Guardian (${user?.fullName || 'Family'}). Details: ${symptomDesc}`,
        symptoms: symptomList,
        location: { lat: 12.9716, lng: 77.5946 }
      });
      setIsConfirmModalOpen(false);
      switchTab('emergency');
      refresh();
    } catch {
      alert('Failed to dispatch emergency SOS. Please call emergency services immediately.');
    } finally {
      setIsDispatching(false);
    }
  };

  const getVitalStatus = (name, val) => {
    if (val == null) return 'normal';
    if (name === 'hr') {
      if (val > 120 || val < 50) return 'critical';
      if (val > 100 || val < 60) return 'warning';
      return 'normal';
    }
    if (name === 'spo2') {
      if (val < 90) return 'critical';
      if (val < 95) return 'warning';
      return 'normal';
    }
    if (name === 'temp') {
      if (val > 38.5 || val < 35.5) return 'critical';
      if (val > 37.5 || val < 36.0) return 'warning';
      return 'normal';
    }
    return 'normal';
  };

  // Render Overview View
  const renderOverviewTab = () => (
    <div>
      {/* Top Greeting & Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 'var(--space-4)',
        marginBottom: 'var(--space-6)'
      }}>
        <div>
          <h2 style={{
            fontSize: 'var(--font-size-3xl)',
            fontWeight: 'var(--font-weight-extrabold)',
            color: 'var(--color-gray-900)',
            marginBottom: '4px'
          }}>
            Family Guardian Console
          </h2>
          <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-gray-500)' }}>
            Real-time emergency monitoring and health oversight for your loved ones.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          {selectedPatient && !activeSos && (
            <button
              onClick={() => setIsConfirmModalOpen(true)}
              className="btn btn-critical btn-sm"
              title="Report an emergency for your linked family member"
            >
              🚨 Report Emergency for {selectedPatient.fullName?.split(' ')[0]}
            </button>
          )}
        </div>
      </div>

      {/* Top Summary Statistics Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 'var(--space-4)',
        marginBottom: 'var(--space-6)'
      }}>
        <StatCard
          label="LINKED MEMBERS"
          value={linkedPatients.length}
          trend={linkedPatients.length > 0 ? 'Active protection' : 'No members linked'}
          trendDirection="neutral"
          icon="👨‍👩‍👧‍👦"
        />

        <StatCard
          label="ACTIVE EMERGENCIES"
          value={activeSos ? 1 : 0}
          trend={activeSos ? 'CRITICAL ALERT ACTIVE' : 'All members stable'}
          trendDirection={activeSos ? 'up' : 'down'}
          status={activeSos ? 'critical' : 'normal'}
          icon="🚨"
        />

        <StatCard
          label="GUARDIAN STATUS"
          value="PRIMARY"
          trend="Emergency notifications enabled"
          trendDirection="neutral"
          icon="🛡️"
        />

        <StatCard
          label="DISPATCH NETWORK"
          value={wsConnected ? 'CONNECTED' : 'STANDBY'}
          trend="Live telemetry & hospital sync"
          trendDirection="neutral"
          icon="⚡"
        />
      </div>

      {/* High-Priority Active Emergency Banner */}
      {activeSos && (
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <div className="alert alert-critical" style={{ padding: '16px 20px', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '24px' }}>🚨</span>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-critical)' }}>
                    ACTIVE EMERGENCY FOR {activeSos.patient?.fullName || selectedPatient?.fullName || 'PATIENT'} (SOS-{activeSos.id})
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-gray-700)', marginTop: '2px' }}>
                    Hospital: {assignedHospital?.name || 'Assigned General Hospital'} • Ambulance: {activeSos.ambulanceStatus?.replace(/_/g, ' ') || 'EN ROUTE'} • Severity: {activeSos.severity || 'CRITICAL'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => switchTab('emergency')}
                className="btn btn-critical btn-sm"
              >
                🗺️ Track Ambulance & Hospital Live
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Linked Family Members Grid */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
          <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 800, color: 'var(--color-gray-900)', margin: 0 }}>
            Linked Family Members ({linkedPatients.length})
          </h3>
          <span style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>
            Select a member to view live telemetry and location
          </span>
        </div>

        {loadingPatients ? (
          <LoadingState message="Loading linked family members..." />
        ) : linkedPatients.length > 0 ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 'var(--space-4)'
          }}>
            {linkedPatients.map((patient) => {
              const isSelected = patient.uid === selectedPatient?.uid;
              const hasActiveSos = activeEmergencies.some(e => e.patientUid === patient.uid);

              return (
                <div
                  key={patient.id || patient.uid}
                  className={`family-patient-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedPatientUid(patient.uid)}
                >
                  <div className="family-patient-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div className="family-patient-avatar">
                        {patient.fullName?.charAt(0) || 'P'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--color-gray-900)' }}>
                          {patient.fullName}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                          <span className="family-relationship-badge">
                            {patient.relationship || 'Family'}
                          </span>
                          {patient.emergencyContact && (
                            <span style={{ fontSize: '10px', background: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                              PRIMARY CONTACT
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <StatusBadge
                      status={hasActiveSos ? 'CRITICAL' : 'AVAILABLE'}
                      size="sm"
                    />
                  </div>

                  <div className="family-vitals-mini-bar">
                    <span>Age: {patient.age || 45} yrs</span>
                    <span>Blood: {patient.bloodGroup || 'O+'}</span>
                    <span>Phone: {patient.contactPhone || '9876543210'}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                    <span style={{ fontSize: '12px', color: isSelected ? 'var(--color-secondary)' : 'var(--color-gray-500)', fontWeight: 600 }}>
                      {isSelected ? '✓ Currently Selected' : 'Click to inspect vitals'}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPatientUid(patient.uid);
                        switchTab('telemetry');
                      }}
                      className="btn btn-secondary btn-xs"
                    >
                      View Telemetry →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon="👨‍👩‍👧‍👦"
            title="No family members linked"
            message="Your account is not linked to any patient yet. Patients can link your email in their profile page."
          />
        )}
      </div>

      {/* Selected Member Quick Vitals Preview */}
      {selectedPatient && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <span>❤️</span>
              <span>Live Telemetry Overview: {selectedPatient.fullName}</span>
            </h3>
            <button
              onClick={() => switchTab('telemetry')}
              className="btn btn-secondary btn-sm"
            >
              Full Telemetry & History →
            </button>
          </div>
          <div className="card-content">
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 'var(--space-4)'
            }}>
              <VitalCard
                type="hr"
                label="Heart Rate"
                value={latestVital?.heartRate ?? 78}
                unit="BPM"
                icon="❤️"
                status={getVitalStatus('hr', latestVital?.heartRate ?? 78)}
              />
              <VitalCard
                type="spo2"
                label="SpO2"
                value={latestVital?.spo2 ?? 98}
                unit="%"
                icon="🫁"
                status={getVitalStatus('spo2', latestVital?.spo2 ?? 98)}
              />
              <VitalCard
                type="temp"
                label="Temperature"
                value={latestVital?.temperature ?? 36.7}
                unit="°C"
                icon="🌡️"
                status={getVitalStatus('temp', latestVital?.temperature ?? 36.7)}
              />
              <VitalCard
                type="risk"
                label="AI Risk Score"
                value={patientAi?.riskScore || 14}
                unit="/100"
                icon="🤖"
                status={patientAi?.severity === 'CRITICAL' ? 'critical' : 'normal'}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Render Emergency Tab with Live Google Maps Tracking
  const renderEmergencyTab = () => {
    if (!activeSos) {
      return (
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <span>🛡️</span>
                <span>Emergency Dispatch Status</span>
              </h3>
            </div>
            <div className="card-content" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>✓</div>
              <h4 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-gray-900)', marginBottom: '8px' }}>
                All Linked Family Members Are Safe
              </h4>
              <p style={{ color: 'var(--color-gray-600)', fontSize: '14px', maxWidth: '420px', margin: '0 auto 24px auto' }}>
                No active emergency dispatch requests currently exist for {selectedPatient?.fullName || 'your family members'}. Live WebSocket monitoring is active.
              </p>

              {selectedPatient && (
                <button
                  onClick={() => setIsConfirmModalOpen(true)}
                  className="btn btn-critical"
                  style={{ padding: '12px 24px' }}
                >
                  🚨 Report Urgent Medical Issue for {selectedPatient.fullName}
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        {/* Section 4: Premium Emergency Status Card */}
        <div className="active-emergency-status-card">
          <div className="emergency-status-row">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '22px' }}>🚨</span>
                <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-critical)' }}>
                  ACTIVE EMERGENCY: {selectedPatient?.fullName || 'PATIENT'} (SOS-{activeSos.id})
                </span>
                <StatusBadge status={activeSos.severity || 'CRITICAL'} size="sm" />
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-gray-500)', marginTop: '4px' }}>
                Alert registered: {new Date(activeSos.createdAt || Date.now()).toLocaleTimeString()}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
              <div className="emergency-status-item">
                <span className="emergency-status-label">Risk Score</span>
                <span className="emergency-status-value" style={{ color: 'var(--color-critical)' }}>
                  {activeSos.riskScore != null ? `${activeSos.riskScore} / 100` : 'Assessing...'}
                </span>
              </div>

              <div className="emergency-status-item">
                <span className="emergency-status-label">Assigned Hospital</span>
                <span className="emergency-status-value">
                  {assignedHospital?.name || activeSos.hospitalName || 'Searching Hospital...'}
                </span>
              </div>

              <div className="emergency-status-item">
                <span className="emergency-status-label">Doctor</span>
                <span className="emergency-status-value">
                  {assignedDoctor?.name ? `Dr. ${assignedDoctor.name}` : (activeSos.doctorName ? (activeSos.doctorName.startsWith('Dr.') ? activeSos.doctorName : `Dr. ${activeSos.doctorName}`) : (activeSos.status === 'HOSPITAL_ASSIGNED' ? 'Pending Acceptance' : 'Awaiting Assignment'))}
                </span>
              </div>

              <div className="emergency-status-item">
                <span className="emergency-status-label">Ambulance</span>
                <span className="emergency-status-value" style={{ color: 'var(--color-secondary)' }}>
                  {getWorkflowAmbulanceStatus(activeSos, trackingData)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Live Google Maps Tracking and Timeline */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.8fr) minmax(0, 1.2fr)',
          gap: 'var(--space-5)'
        }}>
          <div>
            <div style={{ marginBottom: 'var(--space-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 800, color: 'var(--color-gray-900)' }}>
                🗺️ Live Ambulance Tracking
              </h3>
              <span style={{ fontSize: '12px', color: 'var(--color-secondary)', fontWeight: 600 }}>
                📍 Patient • 🚑 Ambulance • 🏥 Hospital
              </span>
            </div>

            <GoogleMapTracking
              patientLocation={[activeSos.latitude || 12.9716, activeSos.longitude || 77.5946]}
              hospitalLocation={assignedHospital ? [assignedHospital.lat, assignedHospital.lng] : null}
              ambulanceLocation={trackingData?.ambulanceLatitude ? [trackingData.ambulanceLatitude, trackingData.ambulanceLongitude] : null}
              ambulanceStatus={trackingData?.status || activeSos.status}
              ambulanceUnitId={trackingData?.ambulanceUnitId || activeSos.ambulanceUnitId || 'AMB-102'}
              driverName={trackingData?.driverName}
              emergencyId={activeSos.id}
              height="440px"
            />
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <span>📋</span>
                <span>Response Progress</span>
              </h3>
              <StatusBadge status={trackingData?.status || activeSos.status} size="sm" />
            </div>
            <div className="card-content" style={{ maxHeight: '440px', overflowY: 'auto' }}>
              <EmergencyTimeline
                currentStatus={trackingData?.status || activeSos.status}
                timestamps={trackingData?.timestamps}
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render Telemetry Tab
  const renderTelemetryTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Patient Selector */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <span>❤️</span>
            <span>Live Health Telemetry</span>
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>Member:</span>
            <select
              value={selectedPatient?.uid || ''}
              onChange={(e) => setSelectedPatientUid(e.target.value)}
              className="form-input"
              style={{ padding: '4px 10px', fontSize: '13px', width: 'auto' }}
            >
              {linkedPatients.map(p => (
                <option key={p.uid} value={p.uid}>
                  {p.fullName} ({p.relationship || 'Family'})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="card-content">
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 'var(--space-4)',
            marginBottom: 'var(--space-6)'
          }}>
            <VitalCard
              type="hr"
              label="Heart Rate"
              value={latestVital?.heartRate ?? 78}
              unit="BPM"
              icon="❤️"
              status={getVitalStatus('hr', latestVital?.heartRate ?? 78)}
            />
            <VitalCard
              type="spo2"
              label="SpO2"
              value={latestVital?.spo2 ?? 98}
              unit="%"
              icon="🫁"
              status={getVitalStatus('spo2', latestVital?.spo2 ?? 98)}
            />
            <VitalCard
              type="temp"
              label="Temperature"
              value={latestVital?.temperature ?? 36.7}
              unit="°C"
              icon="🌡️"
              status={getVitalStatus('temp', latestVital?.temperature ?? 36.7)}
            />
            <VitalCard
              type="risk"
              label="AI Risk Score"
              value={patientAi?.riskScore || 14}
              unit="/100"
              icon="🤖"
              status={patientAi?.severity === 'CRITICAL' ? 'critical' : 'normal'}
            />
          </div>

          {/* AI Clinical Insights */}
          <div style={{ padding: '16px', background: 'var(--color-gray-50)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-gray-200)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-gray-500)', textTransform: 'uppercase', marginBottom: '6px' }}>
              🧠 Med-AI Predictive Telemetry Evaluation
            </div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-gray-900)' }}>
              Status: {patientAi?.severity || 'STABLE'} (Risk Score: {patientAi?.riskScore || 14}/100)
            </div>
            <p style={{ fontSize: '13px', color: 'var(--color-gray-600)', marginTop: '4px' }}>
              {patientAi?.explanations || 'Continuous telemetry indicates no critical anomalies. Patient baseline is nominal.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  // Render History Tab
  const renderHistoryTab = () => (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">
          <span>📋</span>
          <span>Emergency Incident History: {selectedPatient?.fullName || 'Linked Patient'}</span>
        </h3>
        <span style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>
          {pastEmergencies.length} recorded incidents
        </span>
      </div>

      <div className="card-content">
        {pastEmergencies.length > 0 ? (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>SOS ID</th>
                  <th>Date & Time</th>
                  <th>Severity</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pastEmergencies.map((pe) => (
                  <tr key={pe.id}>
                    <td style={{ fontWeight: 800 }}>SOS-{pe.id}</td>
                    <td>{new Date(pe.createdAt || Date.now()).toLocaleString()}</td>
                    <td><StatusBadge status={pe.severity} size="sm" /></td>
                    <td>{pe.requiredDepartment || 'General'}</td>
                    <td><StatusBadge status={pe.status} size="sm" /></td>
                    <td>
                      <button
                        onClick={async () => {
                          setSelectedPastSos(pe);
                          try {
                            const res = await API.get(`/emergencies/${pe.id}/timeline`);
                            setPastTimelineEvents(res.data);
                          } catch {
                            setPastTimelineEvents([]);
                          }
                        }}
                        className="btn btn-secondary btn-sm"
                      >
                        View Timeline
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="📋"
            title="No historical events recorded."
            message={`No past emergency incidents on record for ${selectedPatient?.fullName || 'this family member'}.`}
          />
        )}

        {selectedPastSos && (
          <div style={{ marginTop: 'var(--space-6)', borderTop: '1px solid var(--color-gray-200)', paddingTop: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
              <h4 style={{ fontWeight: 800 }}>Timeline for SOS-{selectedPastSos.id}</h4>
              <button onClick={() => setSelectedPastSos(null)} className="btn btn-ghost btn-sm">Close</button>
            </div>
            <EmergencyTimeline
              currentStatus={selectedPastSos.status}
              timestamps={pastTimelineEvents.reduce((acc, t) => {
                if (!acc[t.status]) acc[t.status] = [];
                acc[t.status].push(t.timestamp);
                return acc;
              }, {})}
              compact={true}
            />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <DashboardLayout
      title="Family Guardian Console"
      user={user}
      wsConnected={wsConnected}
    >
      {/* Top Tab Switcher */}
      <div style={{
        display: 'flex',
        gap: 'var(--space-2)',
        marginBottom: 'var(--space-6)',
        borderBottom: '1px solid var(--color-gray-200)',
        paddingBottom: 'var(--space-3)',
        overflowX: 'auto'
      }}>
        <button
          onClick={() => switchTab('overview')}
          className={`btn ${activeTab === 'overview' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          aria-label="Overview"
        >
          <span aria-hidden="true">🏠</span>
          <span>Overview</span>
        </button>

        <button
          onClick={() => switchTab('emergency')}
          className={`btn ${activeTab === 'emergency' ? 'btn-critical' : 'btn-secondary'} btn-sm`}
          aria-label={activeSos ? `Active SOS (${activeSos.id})` : 'Emergency'}
        >
          <span aria-hidden="true">🚨</span>
          <span>{activeSos ? `Active SOS (${activeSos.id})` : 'Emergency Tracking'}</span>
        </button>

        <button
          onClick={() => switchTab('telemetry')}
          className={`btn ${activeTab === 'telemetry' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          aria-label="Live Telemetry"
        >
          <span aria-hidden="true">❤️</span>
          <span>Live Telemetry</span>
        </button>

        <button
          onClick={() => switchTab('history')}
          className={`btn ${activeTab === 'history' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          aria-label="History"
        >
          <span aria-hidden="true">📋</span>
          <span>History</span>
        </button>
      </div>

      {activeTab === 'overview' && renderOverviewTab()}
      {activeTab === 'emergency' && renderEmergencyTab()}
      {activeTab === 'telemetry' && renderTelemetryTab()}
      {activeTab === 'history' && renderHistoryTab()}

      {/* Confirmation Modal to report emergency on patient's behalf */}
      <ConfirmModal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={executeSosForPatient}
        patientLocation={{ lat: 12.9716, lng: 77.5946 }}
        vitals={latestVital || { heartRate: 78, spo2: 98, temperature: 36.7 }}
        symptoms={symptomList}
        onSymptomToggle={handleSymptomToggle}
        description={symptomDesc}
        onDescriptionChange={setSymptomDesc}
        isSubmitting={isDispatching}
      />
    </DashboardLayout>
  );
};

export default FamilyDashboard;
