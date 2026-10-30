import React, { useState, useEffect } from 'react';
import { useSearchParams, useInRouterContext } from 'react-router-dom';
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
import UberJourneyStepper from '../components/UberJourneyStepper';
import ConfirmModal from '../components/ConfirmModal';
import { EmptyState, LoadingState } from '../components/StateComponents';

const getWorkflowAmbulanceStatus = (sos, tracking) => {
  if (!sos) return 'Standby';
  if (sos.requiresAmbulance === false || sos.status === 'AMBULANCE_NOT_REQUIRED' || sos.ambulanceDecision === 'NOT_REQUIRED') {
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
    case 'PENDING_HOSPITAL_ACCEPTANCE':
      return 'Awaiting Hospital Acceptance';
    case 'HOSPITAL_REJECTED':
      return 'Hospital Rejected - Re-routing';
    case 'NEXT_HOSPITAL_REQUESTED':
      return 'Contacting Next Hospital';
    case 'HOSPITAL_ACCEPTED':
      return 'Hospital Accepted - Doctor Assigned';
    case 'DOCTOR_ASSIGNED':
      return 'Doctor Assigned - Assessing Ambulance';
    case 'AMBULANCE_NOT_REQUIRED':
      return 'Ambulance Not Required';
    case 'AMBULANCE_REQUESTED':
    case 'PENDING_DRIVER_ACCEPTANCE':
      return 'Request Sent to Driver';
    case 'AMBULANCE_ACCEPTED':
    case 'DRIVER_ACCEPTED':
      return 'Driver Accepted - Preparing Dispatch';
    case 'AMBULANCE_DISPATCHED':
    case 'JOURNEY_STARTED':
    case 'EN_ROUTE_TO_PATIENT':
      return 'En Route to Patient';
    case 'ARRIVED_AT_PATIENT':
    case 'ARRIVED_AT_PICKUP':
      return 'Arrived at Patient';
    case 'PATIENT_PICKED_UP':
    case 'PATIENT_ONBOARD':
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

const FamilyDashboardInner = ({ searchParams, setSearchParams }) => {
  const { user } = useAuth();
  const [selectedPatientUid, setSelectedPatientUid] = useState(null);
  const [trackedEmergencyId, setTrackedEmergencyId] = useState(null);
  const rawTab = (typeof searchParams?.get === 'function' ? searchParams.get('tab') : searchParams?.tab) || 'overview';
  const activeTab = (rawTab === 'telemetry' || rawTab === 'vitals') ? 'telemetry'
    : (rawTab === 'emergency' || rawTab === 'sos') ? 'emergency'
    : (rawTab === 'history') ? 'history'
    : 'overview';

  const switchTab = (tabKey) => {
    if (tabKey === 'overview') {
      setSearchParams({});
    } else {
      setSearchParams({ tab: tabKey });
    }
  };

  // WebSocket real-time subscription for family member & selected patient
  const { connected: wsConnected, revision, refresh, tracking: trackingData, ambulanceLocation: liveAmbulanceLoc } = useRealtimeRefresh(
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

  // Assigned Hospital, Doctor, & Ambulance for active SOS
  const { data: assignedHospital } = useApiResource(activeId != null ? `/emergencies/${activeId}/hospital` : null, revision);
  const { data: assignedDoctor } = useApiResource(activeId != null ? `/emergencies/${activeId}/doctor` : null, revision);
  const { data: assignedAmbulance } = useApiResource(activeId != null ? `/emergency/${activeId}/ambulance` : null, revision);
  const { data: hospitalList } = useApiResource('/hospital', revision);

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

  // Emergency request modal for family guardian requesting ambulance
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [symptomList, setSymptomList] = useState(['Chest Pain']);
  const [symptomDesc, setSymptomDesc] = useState('');
  const [emergencyType, setEmergencyType] = useState('Cardiac');
  const [pickupAddress, setPickupAddress] = useState('');
  const [selectedHospitalId, setSelectedHospitalId] = useState('');
  const [isDispatching, setIsDispatching] = useState(false);

  useEffect(() => {
    if (selectedPatient?.address && !pickupAddress) {
      setPickupAddress(selectedPatient.address);
    }
  }, [selectedPatient, pickupAddress]);

  const handleSymptomToggle = (symptom) => {
    setSymptomList(prev =>
      prev.includes(symptom) ? prev.filter(s => s !== symptom) : [...prev, symptom]
    );
  };

  const executeSosForPatient = async () => {
    if (!selectedPatient?.uid) {
      alert('Please select a family member first.');
      return;
    }
    try {
      setIsDispatching(true);
      const payload = {
        patientUid: selectedPatient.uid,
        patient_uid: selectedPatient.uid,
        emergencyType: emergencyType || 'Cardiac',
        alert_message: `Emergency Ambulance Request for ${selectedPatient.fullName}: ${symptomList.join(', ')}`,
        description: symptomDesc ? `Guardian (${user?.fullName || 'Family'}). Details: ${symptomDesc}` : `Emergency reported by guardian for ${selectedPatient.fullName}`,
        symptoms: symptomList.join(', '),
        pickupAddress: pickupAddress || selectedPatient.address || '12 MG Road, Bengaluru, Karnataka',
        location: { lat: 12.9716, lng: 77.5946 },
        lat: 12.9716,
        lng: 77.5946,
        hospitalId: selectedHospitalId ? Number(selectedHospitalId) : null,
        destinationHospitalId: selectedHospitalId ? Number(selectedHospitalId) : null,
        requiresAmbulance: true
      };

      try {
        await API.post('/ambulance/request', payload);
      } catch {
        // Fallback to /emergency/sos
        await API.post('/emergency/sos', {
          ...payload,
          symptoms: symptomList
        });
      }

      setIsConfirmModalOpen(false);
      switchTab('emergency');
      refresh();
    } catch (err) {
      alert('Failed to dispatch emergency ambulance: ' + (err.response?.data?.error || 'Please call emergency services immediately.'));
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
              title="Request Ambulance"
              id="header-request-ambulance-btn"
            >
              🚑 Request Ambulance for {selectedPatient.fullName?.split(' ')[0]}
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

      {/* High-Priority Active Emergency Ambulance Tracking Card */}
      {activeSos && (
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <div className="alert alert-critical" style={{ padding: '20px 24px', borderRadius: 'var(--radius-xl, 16px)', background: 'linear-gradient(135deg, #FEF2F2 0%, #FFFFFF 100%)', border: '2px solid #FECACA', boxShadow: '0 8px 24px rgba(220, 38, 38, 0.12)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '50%',
                  background: '#DC2626',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '26px',
                  boxShadow: '0 0 18px rgba(220, 38, 38, 0.55)',
                  flexShrink: 0,
                  animation: 'ambulanceBeacon 1.2s infinite ease-in-out'
                }}>
                  🚑
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '16px', fontWeight: 800, color: '#DC2626' }}>
                      ACTIVE EMERGENCY: {activeSos.patient?.fullName || selectedPatient?.fullName || 'PATIENT'} (#SOS-{activeSos.id})
                    </span>
                    <StatusBadge status={activeSos.severity || 'CRITICAL'} size="sm" />
                  </div>
                  <div style={{ fontSize: '13px', color: '#334155', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span>Unit: <strong style={{ color: '#0B1F3A' }}>{assignedAmbulance?.unitId || activeSos.ambulanceUnitId || 'AMB-102'}</strong></span>
                    <span>•</span>
                    <span>Status: <strong style={{ color: '#DC2626' }}>{getWorkflowAmbulanceStatus(activeSos, trackingData)}</strong></span>
                    <span>•</span>
                    <span>Hospital: <strong>{assignedHospital?.name || activeSos.hospitalName || 'City General Hospital'}</strong></span>
                    <span>•</span>
                    <span style={{ color: '#0F766E', fontWeight: 800, background: '#F0FDFA', padding: '2px 8px', borderRadius: '10px', border: '1px solid #99F6E4' }}>
                      ⏱️ ETA: ~{trackingData?.eta || liveAmbulanceLoc?.eta || 4} min
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => switchTab('emergency')}
                  className="btn btn-critical"
                  style={{
                    padding: '10px 22px',
                    fontSize: '13px',
                    fontWeight: 800,
                    borderRadius: '12px',
                    boxShadow: '0 4px 14px rgba(220, 38, 38, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <span>🗺️</span>
                  <span>Track Ambulance Live</span>
                </button>
              </div>
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
                    {hasActiveSos ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPatientUid(patient.uid);
                          switchTab('emergency');
                        }}
                        className="btn btn-critical btn-xs"
                        style={{ fontWeight: 800 }}
                      >
                        🚨 Track Ambulance Live
                      </button>
                    ) : (
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
                    )}
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

  // Render Emergency Tab with Live Uber-Style Ambulance Tracking
  const renderEmergencyTab = () => {
    if (!activeSos) {
      return (
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <span>🛡️</span>
                <span>Live Ambulance Journey Status</span>
              </h3>
            </div>
            <div className="card-content" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>✓</div>
              <h4 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-gray-900)', marginBottom: '8px' }}>
                No active ambulance journey.
              </h4>
              <p style={{ color: 'var(--color-gray-600)', fontSize: '14px', maxWidth: '440px', margin: '0 auto 24px auto', lineHeight: 1.5 }}>
                All family members are safe and stable. No emergency ambulance journeys are currently active. Live 24/7 telemetry monitoring and command center sync remain active.
              </p>

              {selectedPatient && (
                <button
                  onClick={() => setIsConfirmModalOpen(true)}
                  className="btn btn-critical"
                  style={{ padding: '12px 24px' }}
                  title="Request Ambulance"
                  id="request-ambulance-btn"
                >
                  🚑 Request Ambulance for {selectedPatient.fullName}
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    const currentStatus = liveAmbulanceLoc?.status || trackingData?.status || assignedAmbulance?.status || activeSos.status;
    const ambUnit = liveAmbulanceLoc?.unitId || trackingData?.ambulanceUnitId || assignedAmbulance?.unitId || activeSos.ambulanceUnitId || 'AMB-102';
    const driver = assignedAmbulance?.driverName || trackingData?.driverName || 'Officer Rajiv';
    const phone = assignedAmbulance?.driverPhone || '9876543210';
    const regPlate = assignedAmbulance?.vehicleRegistration || 'KA-01-EQ-9042';
    const vType = assignedAmbulance?.vehicleType || 'Type-D Advanced Cardiac Life Support (ACLS)';
    const hosp = assignedHospital?.name || activeSos.hospitalName || 'City General Hospital';
    const ambCoords = liveAmbulanceLoc ? [liveAmbulanceLoc.latitude, liveAmbulanceLoc.longitude]
      : (trackingData?.ambulanceLatitude ? [trackingData.ambulanceLatitude, trackingData.ambulanceLongitude]
      : (assignedAmbulance?.latitude ? [assignedAmbulance.latitude, assignedAmbulance.longitude] : null));

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        {/* Uber-Style Journey Status Stepper (Requirement 3) */}
        <UberJourneyStepper
          currentStatus={currentStatus}
          timestamps={trackingData?.timestamps}
          distanceKm={trackingData?.distance || liveAmbulanceLoc?.distance}
          etaMinutes={trackingData?.eta || liveAmbulanceLoc?.eta}
        />

        {/* Section 4: Premium Emergency Summary Card */}
        <div className="active-emergency-status-card">
          <div className="emergency-status-row">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '22px' }}>🚨</span>
                <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-critical)' }}>
                  ACTIVE EMERGENCY: {selectedPatient?.fullName || activeSos.patient?.fullName || 'PATIENT'} (#SOS-{activeSos.id})
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
                  {hosp}
                </span>
              </div>

              <div className="emergency-status-item">
                <span className="emergency-status-label">Attending Doctor</span>
                <span className="emergency-status-value">
                  {assignedDoctor?.name ? `Dr. ${assignedDoctor.name}` : (activeSos.doctorName ? (activeSos.doctorName.startsWith('Dr.') ? activeSos.doctorName : `Dr. ${activeSos.doctorName}`) : (activeSos.status === 'DOCTOR_ASSIGNED' ? 'Doctor Assigned' : activeSos.status === 'DOCTOR_PENDING' ? 'Awaiting Doctor Assignment' : 'Awaiting Assignment'))}
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

        {/* Live Uber-Style Ambulance Tracking Map and Response Progress */}
        <div className="dashboard-map-grid">
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
              ambulanceLocation={ambCoords}
              ambulanceStatus={currentStatus}
              ambulanceUnitId={ambUnit}
              driverName={driver}
              driverPhone={phone}
              driverRating={assignedAmbulance?.driverRating || 4.9}
              vehicleRegistration={regPlate}
              vehicleType={vType}
              hospitalName={hosp}
              emergencyId={activeSos.id}
              height="460px"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {/* Patient Dossier Details */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <span>👤</span>
                  <span>Patient Emergency Dossier</span>
                </h3>
              </div>
              <div className="card-content" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#64748B' }}>Patient Name</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#0B1F3A' }}>{selectedPatient?.fullName || activeSos.patient?.fullName || 'Patient'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#64748B' }}>Age & Blood Group</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#0B1F3A' }}>{selectedPatient?.age || 45} yrs • {selectedPatient?.bloodGroup || 'O+'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#64748B' }}>Reported Symptoms</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#DC2626' }}>{Array.isArray(activeSos.symptoms) ? activeSos.symptoms.join(', ') : (activeSos.symptoms || 'Severe Chest Pain')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: '#64748B' }}>Emergency Contact</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#0B1F3A' }}>{selectedPatient?.contactPhone || '9876543210'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: '#64748B' }}>Pickup Address</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#0B1F3A', maxWidth: '180px', textAlign: 'right' }}>{selectedPatient?.address || 'Brigade Rd, Bangalore'}</span>
                </div>
              </div>
            </div>

            {/* Medical Audit & Response Timeline */}
            <div className="card" style={{ flex: 1 }}>
              <div className="card-header">
                <h3 className="card-title">
                  <span>📋</span>
                  <span>Response Event Timeline</span>
                </h3>
                <StatusBadge status={currentStatus} size="sm" />
              </div>
              <div className="card-content" style={{ maxHeight: '260px', overflowY: 'auto' }}>
                <EmergencyTimeline
                  currentStatus={currentStatus}
                  timestamps={trackingData?.timestamps}
                  compact={true}
                />
              </div>
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

  const getPageTitle = () => {
    if (activeTab === 'telemetry') return 'Family Guardian Console — Live Telemetry';
    if (activeTab === 'history') return 'Family Guardian Console — Incident History';
    if (activeTab === 'emergency') return 'Family Guardian Console — Active Emergency';
    return 'Family Guardian Console';
  };

  return (
    <DashboardLayout
      title={getPageTitle()}
      user={user}
      wsConnected={wsConnected}
      activeSubtab={activeTab}
      onSelectSubtab={switchTab}
    >
      {activeTab === 'overview' && renderOverviewTab()}
      {activeTab === 'emergency' && renderEmergencyTab()}
      {activeTab === 'telemetry' && renderTelemetryTab()}
      {activeTab === 'history' && renderHistoryTab()}

      {/* Request Ambulance Form Modal */}
      <ConfirmModal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={executeSosForPatient}
        title="Request Ambulance"
        patientName={selectedPatient?.fullName || 'Patient'}
        patientLocation={{ lat: 12.9716, lng: 77.5946 }}
        pickupAddress={pickupAddress}
        onAddressChange={setPickupAddress}
        emergencyType={emergencyType}
        onEmergencyTypeChange={setEmergencyType}
        vitals={latestVital || { heartRate: 78, spo2: 98, temperature: 36.7 }}
        symptoms={symptomList}
        onSymptomToggle={handleSymptomToggle}
        description={symptomDesc}
        onDescriptionChange={setSymptomDesc}
        hospitalList={hospitalList || []}
        selectedHospitalId={selectedHospitalId}
        onHospitalChange={setSelectedHospitalId}
        isSubmitting={isDispatching}
      />
    </DashboardLayout>
  );
};

const FamilyDashboardWithRouter = (props) => {
  const [searchParams, setSearchParams] = useSearchParams();
  return <FamilyDashboardInner {...props} searchParams={searchParams} setSearchParams={setSearchParams} />;
};

const FamilyDashboardWithoutRouter = (props) => {
  const [params, setParamsState] = useState(
    () => new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
  );
  const setSearchParams = (next) => {
    setParamsState(new URLSearchParams(next));
  };
  return <FamilyDashboardInner {...props} searchParams={params} setSearchParams={setSearchParams} />;
};

const FamilyDashboard = (props) => {
  const inRouter = useInRouterContext();
  if (inRouter) {
    return <FamilyDashboardWithRouter {...props} />;
  }
  return <FamilyDashboardWithoutRouter {...props} />;
};

export default FamilyDashboard;
