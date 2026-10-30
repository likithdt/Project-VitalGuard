import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useInRouterContext } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API, { isActiveEmergency, useApiResource } from '../services/api';
import { useRealtimeRefresh, useAmbulanceLocationSender } from '../services/websocket';
import { calcHaversineDistance } from '../services/routing';
import DashboardLayout from '../components/DashboardLayout';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import EmergencyTimeline from '../components/EmergencyTimeline';
import EmergencyAlert from '../components/EmergencyAlert';
import GoogleMapTracking from '../components/GoogleMapTracking';
import EmergencyDetails from '../components/EmergencyDetails';
import DoctorAssessmentModal from '../components/DoctorAssessmentModal';
import { EmptyState } from '../components/StateComponents';

/**
 * HealthcareDashboard - Sections 6, 7, 8, 9, 10, 11, 12, 13
 * Unified command center for HOSPITAL_ADMIN, DOCTOR, AMBULANCE_DRIVER, and SYSTEM_ADMIN.
 */

const HealthcareDashboardInner = ({ searchParams, setSearchParams }) => {
  const { user } = useAuth();
  const role = user?.role || 'HOSPITAL_ADMIN';

  const tabParam = typeof searchParams?.get === 'function' ? searchParams.get('tab') : searchParams?.tab;

  const getDefaultTabForRole = useCallback((r) => {
    if (r === 'DOCTOR') return 'cases';
    if (r === 'HOSPITAL_ADMIN') return 'queue';
    if (r === 'AMBULANCE_DRIVER') return 'requests';
    return 'hospitals';
  }, []);

  const activeTab = tabParam || getDefaultTabForRole(role);

  const switchTab = (tabKey) => {
    if (tabKey === getDefaultTabForRole(role)) {
      setSearchParams({});
    } else {
      setSearchParams({ tab: tabKey });
    }
  };

  // Hospital, Doctor, Driver database states
  const [hospitals, setHospitals] = useState([]);
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [ambulances, setAmbulances] = useState([]);
  const [selectedEmergencyId, setSelectedEmergencyId] = useState(null);
  const [selectedPatientUid, setSelectedPatientUid] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [isRequestsLoading, setIsRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState(null);
  const [currentJob, setCurrentJob] = useState(null);
  const [isDriverAvailable, setIsDriverAvailable] = useState(true);
  const [driverNotification, setDriverNotification] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isSimulatingGps, setIsSimulatingGps] = useState(false);
  const [routeTelemetry, setRouteTelemetry] = useState(null);
  const gpsIntervalRef = useRef(null);

  // Live GPS Telemetry Sender for Ambulance Driver (with test mock fallback)
  const defaultSender = () => ({
    isTracking: false,
    gpsStatus: 'IDLE',
    gpsError: null,
    lastGpsTimestamp: null,
    currentCoords: null,
    startTracking: () => {},
    stopTracking: () => {}
  });
  const senderHook = typeof useAmbulanceLocationSender === 'function' ? useAmbulanceLocationSender : defaultSender;
  const {
    isTracking,
    gpsStatus,
    gpsError,
    lastGpsTimestamp,
    currentCoords,
    startTracking,
    stopTracking
  } = senderHook();

  // Doctor Assessment states
  const [pendingAssessments, setPendingAssessments] = useState([]);
  const [isAssessmentsLoading, setIsAssessmentsLoading] = useState(false);
  const [selectedAssessment, setSelectedAssessment] = useState(null);
  const [isAssessmentModalOpen, setIsAssessmentModalOpen] = useState(false);

  // Patient Details Modal states
  const [isPatientDetailsModalOpen, setIsPatientDetailsModalOpen] = useState(false);
  const [patientDetailsEmergencyId, setPatientDetailsEmergencyId] = useState(null);

  // Resolve Emergency Modal states
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [resolvingEmergencyId, setResolvingEmergencyId] = useState(null);
  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState(null);

  useEffect(() => {
    return () => {
      if (gpsIntervalRef.current) clearInterval(gpsIntervalRef.current);
    };
  }, []);

  // WebSocket real-time subscription
  const {
    connected: wsConnected,
    revision,
    refresh,
    ambulanceLocation
  } = useRealtimeRefresh(user?.uid, selectedEmergencyId, selectedPatientUid, user);

  // Emergencies queue based on role
  const queueEndpoint = !user ? null :
    role === 'DOCTOR' ? '/doctor/emergencies' :
    role === 'HOSPITAL_ADMIN' ? '/hospital/emergencies' :
    role === 'AMBULANCE_DRIVER' ? '/emergency/active' :
    '/emergency/active';
  const { data: queue } = useApiResource(queueEndpoint, revision);
  const emergencies = Array.isArray(queue) ? queue : [];
  const activeEmergencies = emergencies.filter(isActiveEmergency);
  const selectedEmergency = emergencies.find(e => e.id === selectedEmergencyId) || null;

  const setSelectedEmergency = (emergency) => {
    setSelectedEmergencyId(emergency?.id ?? null);
    setSelectedPatientUid(emergency?.patientUid ?? null);
  };


  // Store role-specific IDs in localStorage for WebSocket channels
  useEffect(() => {
    if (user) {
      localStorage.setItem('userRole', role || '');
      if (role === 'HOSPITAL_ADMIN' && user.hospitalId) {
        localStorage.setItem('hospitalId', user.hospitalId.toString());
      } else if (role === 'DOCTOR') {
        const docId = user.doctorId || user.id;
        if (docId) localStorage.setItem('doctorId', docId.toString());
      } else if (role === 'AMBULANCE_DRIVER') {
        if (user.ambulanceId) localStorage.setItem('ambulanceId', user.ambulanceId.toString());
        if (user.id) localStorage.setItem('userId', user.id.toString());
      }
    }
  }, [user, role]);

  const loadHospitals = async () => {
    try {
      const res = await API.get('/hospital');
      setHospitals(res.data);
      if (res.data.length > 0) setSelectedHospital(res.data[0]);
    } catch {
      setHospitals([]);
    }
  };

  const loadHospitalDetails = async (hospitalName) => {
    try {
      const res = await API.get(`/hospital/departments/${encodeURIComponent(hospitalName)}`);
      setDepartments(res.data.departments || []);
    } catch {
      setDepartments([]);
    }
  };

  const loadDoctors = async () => {
    try {
      const res = await API.get('/emergencies/doctors/available');
      setDoctors(res.data);
    } catch {
      setDoctors([]);
    }
  };

  const loadAmbulances = async () => {
    try {
      const res = await API.get('/emergencies/ambulances/nearby?lat=12.9716&lng=77.5946');
      setAmbulances(res.data);
    } catch {
      setAmbulances([]);
    }
  };

const loadDriverData = useCallback(async () => {
    setIsRequestsLoading(true);
    setRequestsError(null);
    try {
      const jobRes = await API.get('/ambulance/current-job');
      if (jobRes.data && jobRes.data.ambulance) {
        setCurrentJob(jobRes.data);
      } else {
        setCurrentJob(null);
      }
      const reqRes = await API.get('/ambulance/pending-requests');
      setPendingRequests(Array.isArray(reqRes.data) ? reqRes.data : []);
    } catch (err) {
      setRequestsError(err.response?.data?.error || 'Failed to load incoming ambulance requests');
    } finally {
      setIsRequestsLoading(false);
    }
  }, []);

  const loadPendingAssessments = useCallback(async () => {
    if (role !== 'DOCTOR') return;
    setIsAssessmentsLoading(true);
    try {
      const res = await API.get('/doctor/assessment/pending');
      setPendingAssessments(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load pending assessments:', err);
      setPendingAssessments([]);
    } finally {
      setIsAssessmentsLoading(false);
    }
  }, [role]);

  useEffect(() => {
    if (user) {
      loadHospitals();
      loadDoctors();
      loadAmbulances();
      if (role === 'AMBULANCE_DRIVER') {
        loadDriverData();
      }
      if (role === 'DOCTOR') {
        loadPendingAssessments();
      }
    }
  }, [user, role, loadDriverData, loadPendingAssessments]);

  useEffect(() => {
    if (selectedHospital) {
      loadHospitalDetails(selectedHospital.name);
    }
  }, [selectedHospital]);

  useEffect(() => {
    if (role === 'AMBULANCE_DRIVER') {
      loadDriverData();
    }
  }, [revision, role, loadDriverData]);

  // Actions
  const acceptCase = async (id) => {
    try {
      const res = await API.post(`/emergency/${id}/accept`);
      refresh();
      setSelectedEmergency(res.data);
      if (selectedHospital) loadHospitalDetails(selectedHospital.name);
    } catch (err) {
      alert('Failed to accept emergency: ' + (err.response?.data?.error || err.message));
    }
  };

  const rejectCase = async (id, reason) => {
    try {
      await API.post(`/emergency/${id}/reject`, { reason: reason || 'Hospital at capacity / unavailable' });
      showNotification('Emergency rejected. Re-routed to next suitable hospital.');
      refresh();
      setSelectedEmergency(null);
      if (selectedHospital) loadHospitalDetails(selectedHospital.name);
    } catch (err) {
      alert('Failed to reject emergency: ' + (err.response?.data?.error || err.message));
    }
  };

  const openResolveModal = (id) => {
    setResolvingEmergencyId(id);
    setResolveError(null);
    setIsResolveModalOpen(true);
  };

  const confirmResolveCase = async () => {
    if (!resolvingEmergencyId) return;
    setIsResolving(true);
    setResolveError(null);
    try {
      try {
        await API.post(`/emergencies/${resolvingEmergencyId}/resolve`);
      } catch (firstErr) {
        await API.post(`/emergency/${resolvingEmergencyId}/resolve`);
      }
      setIsResolveModalOpen(false);
      setResolvingEmergencyId(null);
      setSelectedEmergency(null);
      refresh();
      loadAmbulances();
      if (selectedHospital) loadHospitalDetails(selectedHospital.name);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to resolve emergency';
      setResolveError(msg);
    } finally {
      setIsResolving(false);
    }
  };

  const resolveCase = (id) => {
    openResolveModal(id);
  };

  const handleAmbulanceDecision = async (id, requiresAmbulance) => {
    try {
      const res = await API.post(`/emergencies/${id}/ambulance-decision`, { requiresAmbulance });
      setSelectedEmergency(prev => prev && prev.id === id ? { ...prev, ...res.data } : prev);
      refresh();
      loadAmbulances();
      if (selectedHospital) loadHospitalDetails(selectedHospital.name);
    } catch (err) {
      alert('Failed to update ambulance decision: ' + (err.response?.data?.error || err.message));
    }
  };

  const toggleDoctorDuty = async (doc, field) => {
    try {
      const updated = {
        id: doc.id,
        onDuty: field === 'onDuty' ? !doc.onDuty : doc.onDuty,
        availableForEmergency: field === 'availableForEmergency' ? !doc.availableForEmergency : doc.availableForEmergency
      };
      await API.post('/hospital/doctors/status', updated);
      loadDoctors();
    } catch {
      alert('Failed to update doctor status.');
    }
  };

  const updateBeds = async (dep, offset) => {
    try {
      const updated = {
        id: dep.id,
        available: dep.available,
        emergencyService: dep.emergencyService,
        acceptingPatients: dep.acceptingPatients,
        availableBeds: Math.max(0, dep.availableBeds + offset),
        availableDoctors: dep.availableDoctors
      };
      await API.post('/hospital/departments', updated);
      if (selectedHospital) loadHospitalDetails(selectedHospital.name);
    } catch {
      alert('Failed to update bed details.');
    }
  };

  const acceptDriverRequest = async (requestId) => {
    try {
      setActionLoadingId(requestId);
      await API.post(`/ambulance/requests/${requestId}/accept`);
      setDriverNotification({
        type: 'success',
        message: 'Dispatch accepted! Live GPS navigation & ambulance telemetry tracking are now active.'
      });
      await loadDriverData();
      refresh();
    } catch (err) {
      setDriverNotification({
        type: 'error',
        message: 'Failed to accept dispatch: ' + (err.response?.data?.error || err.message)
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const declineDriverRequest = async (requestId) => {
    try {
      setActionLoadingId(requestId);
      await API.post(`/ambulance/requests/${requestId}/decline`);
      setDriverNotification({
        type: 'warning',
        message: 'Dispatch request declined. The dispatch system has automatically released this incident to locate and re-route to another available ambulance unit.'
      });
      await loadDriverData();
      refresh();
    } catch (err) {
      setDriverNotification({
        type: 'error',
        message: 'Failed to decline request: ' + (err.response?.data?.error || err.message)
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleStartJourney = async () => {
    try {
      setIsUpdatingStatus(true);
      startTracking();
      const lat = currentCoords?.latitude || null;
      const lng = currentCoords?.longitude || null;
      await API.post('/ambulance/start-journey', { latitude: lat, longitude: lng });
      setDriverNotification({
        type: 'success',
        message: '🚀 Journey started! Live GPS satellite tracking and turn-by-turn route navigation activated.'
      });
      await loadDriverData();
      refresh();
    } catch (err) {
      setDriverNotification({
        type: 'error',
        message: 'Failed to start journey: ' + (err.response?.data?.error || err.message)
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleCompleteJourney = async () => {
    try {
      setIsUpdatingStatus(true);
      await API.post('/ambulance/complete-journey');
      stopTracking();
      setDriverNotification({
        type: 'success',
        message: '🏁 Journey completed! Patient care safely transferred to hospital emergency department. Unit is now AVAILABLE.'
      });
      await loadDriverData();
      refresh();
    } catch (err) {
      setDriverNotification({
        type: 'error',
        message: 'Failed to complete journey: ' + (err.response?.data?.error || err.message)
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const updateAmbulanceStatus = async (status) => {
    if (status === 'COMPLETED') {
      return handleCompleteJourney();
    }
    if (status === 'EN_ROUTE_TO_PATIENT' || status === 'JOURNEY_STARTED') {
      return handleStartJourney();
    }
    try {
      setIsUpdatingStatus(true);
      const lat = currentCoords?.latitude || null;
      const lng = currentCoords?.longitude || null;
      await API.post('/ambulance/status', { status, latitude: lat, longitude: lng });
      setDriverNotification({
        type: 'success',
        message: `Ambulance unit progression updated: ${status.replace(/_/g, ' ')}`
      });
      await loadDriverData();
      refresh();
    } catch (err) {
      setDriverNotification({
        type: 'error',
        message: 'Failed to update ambulance status: ' + (err.response?.data?.error || err.message)
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const toggleGpsSimulation = (emergency) => {
    if (isSimulatingGps) {
      if (gpsIntervalRef.current) clearInterval(gpsIntervalRef.current);
      gpsIntervalRef.current = null;
      setIsSimulatingGps(false);
      setDriverNotification({ type: 'info', message: 'Live GPS route simulation paused.' });
      return;
    }

    const targetLat = emergency?.latitude || 12.9716;
    const targetLng = emergency?.longitude || 77.5946;

    setIsSimulatingGps(true);
    setDriverNotification({
      type: 'success',
      message: 'Live GPS coordinate simulation active. Streaming location updates along transit route every 2.5 seconds.'
    });

    let step = 0;
    const startLat = 12.9650;
    const startLng = 77.5850;

    gpsIntervalRef.current = setInterval(async () => {
      step += 1;
      const fraction = Math.min(1.0, step * 0.1);
      const curLat = Number((startLat + (targetLat - startLat) * fraction).toFixed(6));
      const curLng = Number((startLng + (targetLng - startLng) * fraction).toFixed(6));

      try {
        await API.post('/ambulance/location', { latitude: curLat, longitude: curLng });
        refresh();
      } catch {
        // ignore
      }

      if (fraction >= 1.0) {
        clearInterval(gpsIntervalRef.current);
        gpsIntervalRef.current = null;
        setIsSimulatingGps(false);
        setDriverNotification({
          type: 'success',
          message: 'Arrived at patient intercept point! GPS route simulation completed.'
        });
      }
    }, 2500);
  };

  // Assessment Actions
  const startAssessment = async (assessmentId) => {
    try {
      const res = await API.post(`/doctor/assessment/${assessmentId}/start`);
      if (res.data) {
        setSelectedAssessment(res.data);
      }
      await loadPendingAssessments();
      refresh();
      return res.data;
    } catch (err) {
      console.warn('Failed to start assessment:', err);
    }
  };

  const submitAssessment = async (assessmentId, formData) => {
    try {
      await API.post(`/doctor/assessment/${assessmentId}/submit`, formData);
      await loadPendingAssessments();
      refresh();
    } catch (err) {
      throw err;
    }
  };

  const openAssessment = async (assessment) => {
    if (!assessment) return;
    let currentAssessment = assessment;
    if (assessment.status === 'PENDING') {
      try {
        const res = await API.post(`/doctor/assessment/${assessment.id}/start`);
        if (res.data) currentAssessment = res.data;
      } catch (e) {
        console.warn('Could not auto-start assessment:', e);
      }
    }
    if (!currentAssessment.emergency) {
      const matchedEmergency = emergencies.find(e => e.id === currentAssessment.emergencyId) || selectedEmergency;
      if (matchedEmergency) {
        currentAssessment = { ...currentAssessment, emergency: matchedEmergency };
      }
    }
    setSelectedAssessment(currentAssessment);
    setIsAssessmentModalOpen(true);
  };

  const handleStartAssessmentForEmergency = async (emergency) => {
    if (!emergency) return;
    try {
      let existing = pendingAssessments.find(a => a.emergencyId === emergency.id);
      if (!existing) {
        try {
          const res = await API.get(`/doctor/assessment/emergency/${emergency.id}`);
          if (res.data) existing = res.data;
        } catch {
          try {
            const createRes = await API.post(`/doctor/assessment/emergency/${emergency.id}`);
            if (createRes.data) existing = createRes.data;
          } catch (createErr) {
            console.warn('Could not create assessment via endpoint:', createErr);
          }
        }
      }
      if (existing) {
        await openAssessment(existing);
      } else {
        const fallbackAssessment = {
          id: Date.now(),
          emergencyId: emergency.id,
          status: 'IN_PROGRESS',
          emergency: emergency
        };
        setSelectedAssessment(fallbackAssessment);
        setIsAssessmentModalOpen(true);
      }
    } catch (err) {
      console.error('Error starting assessment for emergency:', err);
      setSelectedAssessment({
        id: Date.now(),
        emergencyId: emergency.id,
        status: 'IN_PROGRESS',
        emergency: emergency
      });
      setIsAssessmentModalOpen(true);
    }
  };

  const closeAssessmentModal = () => {
    setIsAssessmentModalOpen(false);
    setSelectedAssessment(null);
  };

  const openPatientDetails = (emergencyId) => {
    if (!emergencyId) return;
    setPatientDetailsEmergencyId(emergencyId);
    setIsPatientDetailsModalOpen(true);
  };

  const closePatientDetailsModal = () => {
    setIsPatientDetailsModalOpen(false);
    setPatientDetailsEmergencyId(null);
  };

  // Also refresh assessments when WebSocket revision changes
  useEffect(() => {
    if (role === 'DOCTOR') {
      loadPendingAssessments();
    }
  }, [revision, role, loadPendingAssessments]);

  // ==========================================================================
  // 1. HOSPITAL ADMIN VIEW (Sections 6, 7, 8, 9)
  // ==========================================================================
  const renderHospitalAdminView = () => {
    const criticalEmergencies = emergencies.filter(e => e.severity === 'CRITICAL' && e.status !== 'RESOLVED');
    const incomingPending = emergencies.filter(e => e.status === 'HOSPITAL_ASSIGNED' || e.status === 'PENDING_HOSPITAL_ACCEPTANCE' || e.status === 'NEXT_HOSPITAL_REQUESTED');

    return (
      <div>
        {/* Emergency SOS Queue & Overview - Section 6, 7, 8 */}
        {activeTab === 'queue' && (
          <>
            {/* Section 6: Header */}
            <div style={{ marginBottom: 'var(--space-6)' }}>
              <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--color-gray-900)' }}>
                Hospital Overview & Emergency Queue
              </h2>
              <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-gray-500)', marginTop: '2px' }}>
                Monitor incoming emergencies and coordinate care.
              </p>
            </div>

            {/* Section 6: Top Statistics */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 'var(--space-4)',
              marginBottom: 'var(--space-6)'
            }}>
              <StatCard
                label="Active Emergencies"
                value={activeEmergencies.length}
                icon="🚨"
                color={activeEmergencies.length > 0 ? 'critical' : 'primary'}
                subtitle="Triaged by AI pipeline"
              />

              <StatCard
                label="Critical Patients"
                value={criticalEmergencies.length}
                icon="⚠️"
                color={criticalEmergencies.length > 0 ? 'critical' : 'warning'}
                subtitle="Immediate priority"
              />

              <StatCard
                label="Available Doctors"
                value={doctors.filter(d => d.onDuty && d.availableForEmergency).length}
                icon="👨‍⚕️"
                color="success"
                subtitle={`${doctors.filter(d => d.onDuty).length} total on duty`}
              />

              <StatCard
                label="Active Ambulances / Beds"
                value={`${ambulances.length} Amb / ${selectedHospital?.availableBeds || 12} Beds`}
                icon="🚑"
                color="info"
                subtitle="Fleet & trauma capacity"
              />
            </div>

            {/* Section 7: Incoming Emergency Alert */}
            {incomingPending.map(alert => (
              <EmergencyAlert
                key={alert.id}
                emergency={alert}
                onView={(eq) => setSelectedEmergency(eq)}
                onAccept={acceptCase}
                onDecline={rejectCase}
                role="hospital"
              />
            ))}

            {/* Emergency Queue & Details Split View - Section 8 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)',
              gap: 'var(--space-5)'
            }}>
            {/* Queue List */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <span>🚨</span>
                  <span>Prioritized SOS Queue</span>
                </h3>
                <span style={{ fontSize: '11px', color: 'var(--color-gray-500)' }}>
                  By Severity
                </span>
              </div>
              <div className="card-content" style={{ maxHeight: '600px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {activeEmergencies.length === 0 ? (
                  <EmptyState title="No active emergency alerts" message="Queue standing by for triage events." />
                ) : (
                  activeEmergencies.map(eq => {
                    const isSelected = selectedEmergency?.id === eq.id;
                    return (
                      <div
                        key={eq.id}
                        onClick={() => setSelectedEmergency(eq)}
                        style={{
                          padding: '12px 14px',
                          border: `1px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-gray-200)'}`,
                          borderRadius: 'var(--radius-md)',
                          background: isSelected ? 'var(--color-primary-bg)' : 'var(--color-white)',
                          cursor: 'pointer',
                          boxShadow: isSelected ? 'var(--shadow-sm)' : 'none',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontWeight: 800, fontSize: '14px', color: 'var(--color-gray-900)' }}>
                            SOS-{eq.id}
                          </span>
                          <StatusBadge status={eq.severity} size="sm" />
                        </div>

                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-gray-800)' }}>
                          {eq.patientName || eq.patientUid}
                        </div>

                        <div style={{ fontSize: '11px', color: 'var(--color-gray-500)', marginTop: '2px' }}>
                          Vitals: {eq.detectedVitals || 'HR 145 BPM, SpO2 82%'}
                        </div>

                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginTop: '8px',
                          paddingTop: '6px',
                          borderTop: '1px dashed var(--color-gray-200)',
                          fontSize: '11px',
                          color: 'var(--color-gray-500)',
                          flexWrap: 'wrap',
                          gap: '4px'
                        }}>
                          <span>Risk: <strong>{eq.riskScore || 0}/100</strong></span>
                          <span>Ambulance: <strong style={{ color: eq.ambulanceStatus && eq.ambulanceStatus !== 'STANDBY' ? 'var(--color-teal)' : 'inherit' }}>{eq.ambulanceStatus ? eq.ambulanceStatus.replace(/_/g, ' ') : (eq.requiresAmbulance === true ? 'Requested' : eq.requiresAmbulance === false ? 'Not required' : 'Pending Assessment')}</strong></span>
                          <span>Dept: <strong>{eq.requiredDepartment || 'Trauma'}</strong></span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Emergency Details (Section 8) */}
            <div className="card">
              {selectedEmergency ? (
                <div>
                  <div className="card-header" style={{ background: 'var(--color-gray-50)' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '18px', fontWeight: 800 }}>Incident SOS-{selectedEmergency.id}</span>
                        <StatusBadge status={selectedEmergency.severity} size="sm" />
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-gray-500)', marginTop: '2px' }}>
                        Received: {selectedEmergency.createdAt ? new Date(selectedEmergency.createdAt).toLocaleTimeString() : 'Recent'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      {/* Section 9: Accept / Reject Flow */}
                      {(selectedEmergency.status === 'HOSPITAL_ASSIGNED' || selectedEmergency.status === 'PENDING_HOSPITAL_ACCEPTANCE' || selectedEmergency.status === 'NEXT_HOSPITAL_REQUESTED') ? (
                        <>
                          <button
                            onClick={() => acceptCase(selectedEmergency.id)}
                            className="btn btn-critical btn-sm"
                            style={{ fontWeight: 800 }}
                            data-testid="accept-emergency-btn"
                            aria-label="Accept Emergency"
                          >
                            ✓ ACCEPT EMERGENCY
                          </button>
                          <button
                            onClick={() => rejectCase(selectedEmergency.id)}
                            className="btn btn-secondary btn-sm"
                            style={{ fontWeight: 800, color: 'var(--color-critical)' }}
                            data-testid="reject-emergency-btn"
                            aria-label="Reject Emergency"
                          >
                            ✕ REJECT EMERGENCY
                          </button>
                        </>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-success)', fontWeight: 700, fontSize: '12px' }}>
                          <span>✓ Emergency Accepted</span>
                        </div>
                      )}

                      <button
                        onClick={() => resolveCase(selectedEmergency.id)}
                        className="btn btn-success btn-sm"
                        style={{ fontWeight: 700 }}
                      >
                        🏁 Mark Resolved
                      </button>
                    </div>
                  </div>

                  <div className="card-content">
                    {/* Section 8: Left, Center, Right 3-column analysis */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: 'var(--space-4)',
                      marginBottom: 'var(--space-5)'
                    }}>
                      {/* Left: Patient Information */}
                      <div style={{ background: 'var(--color-gray-50)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-gray-200)' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-gray-500)', textTransform: 'uppercase', marginBottom: '8px' }}>
                          Patient Information
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--color-gray-900)' }}>
                          {selectedEmergency.patientName || selectedEmergency.patientUid}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--color-gray-600)', marginTop: '4px' }}>
                          Age: {selectedEmergency.patientAge || '42'} • Blood: {selectedEmergency.patientBloodGroup || 'O+'}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-critical)', fontWeight: 600, marginTop: '6px' }}>
                          Vitals: {selectedEmergency.detectedVitals || 'HR 145 BPM, SpO2 82%'}
                        </div>
                      </div>

                      {/* Center: Risk Analysis */}
                      <div style={{ background: 'var(--color-gray-50)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-gray-200)' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-gray-500)', textTransform: 'uppercase', marginBottom: '8px' }}>
                          Risk Analysis
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--color-critical)' }}>
                          {selectedEmergency.riskScore || 92} / 100
                        </div>
                        <div style={{ marginTop: '4px' }}>
                          <StatusBadge status={selectedEmergency.severity || 'CRITICAL'} size="sm" />
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-gray-600)', marginTop: '6px' }}>
                          Target Dept: <strong>{selectedEmergency.requiredDepartment || 'Cardiology'}</strong>
                        </div>
                      </div>

                      {/* Right: Emergency Workflow */}
                      <div style={{ background: 'var(--color-gray-50)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-gray-200)' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-gray-500)', textTransform: 'uppercase', marginBottom: '6px' }}>
                          Assigned Resources
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-primary)' }}>
                          {selectedEmergency.doctorName ? `Dr. ${selectedEmergency.doctorName}` : 'Dr. Sharma (Cardiology)'}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--color-gray-600)', marginTop: '4px' }}>
                          Ambulance: <strong>{selectedEmergency.ambulanceUnitId || (selectedEmergency.requiresAmbulance ? 'REQUESTED' : 'NOT REQUIRED')}</strong>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-gray-500)', marginTop: '4px' }}>
                          Status: <StatusBadge status={selectedEmergency.status} size="sm" showIcon={false} />
                        </div>
                      </div>
                    </div>

                    {/* Clinical Ambulance Assessment & Dispatch Controls */}
                    {selectedEmergency.requiresAmbulance === true || selectedEmergency.status === 'AMBULANCE_REQUESTED' || selectedEmergency.status === 'AMBULANCE_ACCEPTED' || selectedEmergency.status === 'AMBULANCE_DISPATCHED' || selectedEmergency.status === 'EN_ROUTE_TO_PATIENT' || selectedEmergency.status === 'ARRIVED_AT_PATIENT' || selectedEmergency.status === 'PATIENT_PICKED_UP' || selectedEmergency.status === 'EN_ROUTE_TO_HOSPITAL' || selectedEmergency.status === 'ARRIVED_AT_HOSPITAL' ? (
                      <div style={{
                        background: 'rgba(16, 185, 129, 0.08)',
                        border: '1px solid var(--color-success)',
                        padding: '12px 16px',
                        borderRadius: 'var(--radius-md)',
                        marginBottom: 'var(--space-4)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '12px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '20px' }}>🚑</span>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-gray-900)' }}>
                              Ambulance Dispatched: <span style={{ color: 'var(--color-primary)' }}>{selectedEmergency.ambulanceUnitId || 'Seeking Available Driver'}</span>
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--color-gray-600)' }}>
                              Status: <strong>{selectedEmergency.status?.replace(/_/g, ' ')}</strong> • Real-time GPS Telemetry Active
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => handleAmbulanceDecision(selectedEmergency.id, false)}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '11px', fontWeight: 600 }}
                          >
                            Cancel Ambulance Dispatch
                          </button>
                        </div>
                      </div>
                    ) : selectedEmergency.requiresAmbulance === false || selectedEmergency.status === 'AMBULANCE_NOT_REQUIRED' ? (
                      <div style={{
                        background: 'rgba(100, 116, 139, 0.08)',
                        border: '1px solid var(--color-gray-300)',
                        padding: '12px 16px',
                        borderRadius: 'var(--radius-md)',
                        marginBottom: 'var(--space-4)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '12px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '20px' }}>🏥</span>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-gray-900)' }}>
                              Ambulance Not Required (Assessed by Medical Staff)
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--color-gray-600)' }}>
                              Patient condition managed on-site / Outpatient emergency. No fleet vehicle dispatched.
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleAmbulanceDecision(selectedEmergency.id, true)}
                          className="btn btn-critical btn-sm"
                          style={{ fontWeight: 800, fontSize: '12px' }}
                        >
                          🚑 Upgrade: Dispatch Ambulance
                        </button>
                      </div>
                    ) : (
                      <div style={{
                        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.06), rgba(245, 158, 11, 0.06))',
                        border: '1px solid var(--color-warning)',
                        padding: '14px 18px',
                        borderRadius: 'var(--radius-md)',
                        marginBottom: 'var(--space-4)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '12px'
                      }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={{ fontSize: '16px' }}>👨‍⚕️</span>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-gray-900)' }}>
                              Clinical Ambulance Decision Required
                            </span>
                            <span style={{ fontSize: '11px', background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                              Awaiting Assessment
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--color-gray-600)' }}>
                            Evaluate patient vitals and triage severity. Explicitly decide if ambulance transport is required:
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button
                            onClick={() => handleAmbulanceDecision(selectedEmergency.id, true)}
                            className="btn btn-critical btn-sm"
                            style={{ fontWeight: 800, fontSize: '12px' }}
                          >
                            🚑 Dispatch Ambulance (Required)
                          </button>
                          <button
                            onClick={() => handleAmbulanceDecision(selectedEmergency.id, false)}
                            className="btn btn-secondary btn-sm"
                            style={{ fontWeight: 700, fontSize: '12px' }}
                          >
                            🚫 No Ambulance Needed
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Section 8 Below: LIVE AMBULANCE TRACKING */}
                    {selectedEmergency.requiresAmbulance && (
                      <div style={{ marginTop: 'var(--space-5)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <h4 style={{ fontWeight: 800, fontSize: '14px', color: 'var(--color-gray-900)' }}>
                            🗺️ Live Ambulance Tracking
                          </h4>
                          <span style={{ fontSize: '12px', color: 'var(--color-secondary)', fontWeight: 600 }}>
                            📍 Patient • 🚑 Ambulance • 🏥 Hospital
                          </span>
                        </div>

                        <GoogleMapTracking
                          patientLocation={[selectedEmergency.latitude, selectedEmergency.longitude]}
                          hospitalLocation={selectedEmergency.hospitalLat && selectedEmergency.hospitalLng ? [selectedEmergency.hospitalLat, selectedEmergency.hospitalLng] : [12.9716, 77.5946]}
                          ambulanceLocation={ambulanceLocation ? [ambulanceLocation.latitude, ambulanceLocation.longitude] : [12.9650, 77.5850]}
                          ambulanceStatus={selectedEmergency.status}
                          ambulanceUnitId={selectedEmergency.ambulanceUnitId || 'AMB-102'}
                          driverName={selectedEmergency.driverName}
                          emergencyId={selectedEmergency.id}
                          height="360px"
                        />
                      </div>
                    )}

                    {/* Technical details accordion / components */}
                    <EmergencyDetails emergencyId={selectedEmergency.id} revision={revision} />
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon="🚨"
                  title="Select an Emergency from Queue"
                  message="Click on any SOS incident on the left queue to open clinical command details."
                />
              )}
            </div>
          </div>
        </>
      )}

        {/* Resources Tab (Beds & Staff) */}
        {activeTab === 'resources' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--space-5)' }}>
            {/* Beds Allocation */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <span>🏥</span>
                  <span>Beds Capacity Allocation</span>
                </h3>
              </div>
              <div className="card-content">
                {departments.map(dep => (
                  <div
                    key={dep.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 0',
                      borderBottom: '1px solid var(--color-gray-200)'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px' }}>{dep.name} Unit</div>
                      <div style={{ fontSize: '12px', color: 'var(--color-gray-500)', marginTop: '2px' }}>
                        Capacity: <strong>{dep.availableBeds}</strong> / {dep.totalBeds} Available
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => updateBeds(dep, -1)} className="btn btn-secondary btn-sm" style={{ padding: '4px 10px' }}>-</button>
                      <button onClick={() => updateBeds(dep, 1)} className="btn btn-secondary btn-sm" style={{ padding: '4px 10px' }}>+</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Doctors on Duty */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <span>👨‍⚕️</span>
                  <span>Specialist Doctors on Duty</span>
                </h3>
              </div>
              <div className="card-content">
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Physician</th>
                        <th>Specialty</th>
                        <th>Duty</th>
                        <th>Emergency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {doctors.map(d => (
                        <tr key={d.id}>
                          <td style={{ fontWeight: 700 }}>{d.name}</td>
                          <td>{d.specialization}</td>
                          <td>
                            <button
                              onClick={() => toggleDoctorDuty(d, 'onDuty')}
                              className={`btn btn-sm ${d.onDuty ? 'btn-success' : 'btn-secondary'}`}
                              style={{ padding: '3px 8px' }}
                            >
                              {d.onDuty ? 'ON' : 'OFF'}
                            </button>
                          </td>
                          <td>
                            <button
                              onClick={() => toggleDoctorDuty(d, 'availableForEmergency')}
                              className={`btn btn-sm ${d.availableForEmergency ? 'btn-primary' : 'btn-secondary'}`}
                              style={{ padding: '3px 8px' }}
                            >
                              {d.availableForEmergency ? 'FREE' : 'BUSY'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ==========================================================================
  // 2. DOCTOR DASHBOARD VIEW (Sections 10, 11)
  // ==========================================================================
  const renderDoctorView = () => {
    const assignedEmergencies = emergencies.filter(e =>
      e.status !== 'RESOLVED' && e.status !== 'COMPLETED' && e.status !== 'CANCELLED' && (
        (user?.doctorId && e.doctorId === user.doctorId) ||
        (user?.id && e.doctorId === user.id) ||
        (user?.fullName && e.doctorName === user.fullName) ||
        (!user?.doctorId && !user?.fullName)
      )
    );
    const activeDoctorIncident = (selectedEmergency && selectedEmergency.status !== 'RESOLVED' && selectedEmergency.status !== 'COMPLETED') ? selectedEmergency : (assignedEmergencies[0] || null);

    return (
      <div>
        {/* Section 10: Header */}
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--color-gray-900)' }}>
            Good morning, Dr. {user?.fullName?.split(' ')[0] || 'Specialist'}
          </h2>
          <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-gray-500)', marginTop: '2px' }}>
            Today's Clinical Emergency Overview
          </p>
        </div>

        {/* Section 10: Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)'
        }}>
          <StatCard
            label="Active Emergencies"
            value={assignedEmergencies.length}
            icon="🚨"
            color={assignedEmergencies.length > 0 ? 'critical' : 'primary'}
          />

          <StatCard
            label="Critical Patients"
            value={assignedEmergencies.filter(e => e.severity === 'CRITICAL').length}
            icon="⚠️"
            color="critical"
          />

          <StatCard
            label="Available Status"
            value="ON DUTY"
            icon="👨‍⚕️"
            color="success"
            subtitle="Ready for emergency triage"
          />

          <StatCard
            label="Pending Assessments"
            value={pendingAssessments.length}
            icon="📋"
            color={pendingAssessments.length > 0 ? 'warning' : 'success'}
            subtitle={isAssessmentsLoading ? 'Loading...' : 'Clinical evaluations needed'}
          />
        </div>

        {/* Section 10b: Pending Emergency Assessments */}
        {pendingAssessments.length > 0 && (
          <div className="card" style={{ marginBottom: 'var(--space-5)', border: '2px solid var(--color-warning)', boxShadow: '0 4px 16px rgba(245, 158, 11, 0.12)' }}>
            <div className="card-header" style={{ background: 'var(--color-warning-bg)', borderBottom: '1px solid var(--color-warning-border)' }}>
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>📋</span>
                <span>Pending Emergency Assessments</span>
                <span style={{
                  background: 'var(--color-warning)',
                  color: '#fff',
                  fontSize: '11px',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  marginLeft: 'auto'
                }}>
                  {pendingAssessments.length} URGENT
                </span>
              </h3>
            </div>
            <div className="card-content" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {pendingAssessments.map(assessment => {
                const emergency = assessment.emergency || {};
                const isCritical = emergency.severity === 'CRITICAL';
                return (
                  <div
                    key={assessment.id}
                    style={{
                      padding: '16px',
                      border: `1px solid ${isCritical ? 'var(--color-critical)' : 'var(--color-warning)'}`,
                      borderRadius: 'var(--radius-md)',
                      background: isCritical ? 'var(--color-critical-bg)' : 'var(--color-warning-bg)',
                      boxShadow: isCritical ? '0 2px 8px rgba(220, 38, 38, 0.1)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--color-gray-900)' }}>
                          Assessment #{assessment.id} • Emergency SOS-{emergency.id}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--color-gray-600)', marginTop: '2px' }}>
                          Patient: <strong>{emergency.patientName || emergency.patientUid}</strong> • {emergency.requiredDepartment || 'Emergency'} Dept
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-critical)', fontWeight: 600, marginTop: '4px' }}>
                          {emergency.detectedVitals || 'Vitals telemetry pending'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        <StatusBadge status={emergency.severity} size="sm" />
                        <StatusBadge status={assessment.status} size="sm" />
                        <div style={{ fontSize: '10px', color: 'var(--color-gray-500)' }}>
                          Created: {assessment.createdAt ? new Date(assessment.createdAt).toLocaleTimeString() : 'Just now'}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => openAssessment(assessment)}
                        className="btn btn-critical btn-sm"
                        style={{ fontWeight: 800, fontSize: '12px' }}
                        disabled={isAssessmentsLoading}
                        data-testid="pending-start-assessment-btn"
                      >
                        📋 {assessment.status === 'PENDING' ? 'Start Assessment' : 'Continue Assessment'}
                      </button>
                      <button
                        onClick={() => openPatientDetails(emergency.id || assessment.emergencyId)}
                        className="btn btn-secondary btn-sm"
                        style={{ fontWeight: 700, fontSize: '11px' }}
                        data-testid="pending-view-patient-btn"
                      >
                        👁 View Patient Details
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Section 10 & 11: Assigned Emergencies & Patient Monitoring View */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)',
          gap: 'var(--space-5)'
        }}>
          {/* Section 10: Assigned Emergencies List */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <span>📋</span>
                <span>Assigned Emergencies</span>
              </h3>
              <span style={{ fontSize: '11px', color: 'var(--color-gray-500)' }}>
                {assignedEmergencies.length} cases
              </span>
            </div>
            <div className="card-content" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {assignedEmergencies.length === 0 ? (
                <EmptyState title="No active cases assigned" message="Standby for incoming triage." />
              ) : (
                assignedEmergencies.map(eq => {
                  const isSelected = activeDoctorIncident?.id === eq.id;
                  return (
                    <div
                      key={eq.id}
                      onClick={() => setSelectedEmergency(eq)}
                      style={{
                        padding: '12px 14px',
                        border: `1px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-gray-200)'}`,
                        borderRadius: 'var(--radius-md)',
                        background: isSelected ? 'var(--color-primary-bg)' : 'white',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 800, fontSize: '14px' }}>SOS-{eq.id}</span>
                        <StatusBadge status={eq.severity} size="sm" />
                      </div>

                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-gray-800)', marginTop: '4px' }}>
                        Patient: {eq.patientName || eq.patientUid}
                      </div>

                      <div style={{ fontSize: '11px', color: 'var(--color-critical)', marginTop: '2px' }}>
                        {eq.detectedVitals || 'Vitals telemetry pending'}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '11px', color: 'var(--color-gray-500)' }}>
                        <span>Risk: <strong>{eq.riskScore != null ? eq.riskScore : 'N/A'}/100</strong></span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openPatientDetails(eq.id);
                          }}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '2px 8px', fontSize: '10px' }}
                          data-testid="assigned-view-patient-btn"
                        >
                          VIEW PATIENT
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Section 11: Doctor Patient View */}
          <div className="card">
            {activeDoctorIncident ? (
              <div>
                {/* Top Section 11 */}
                <div className="card-header" style={{ background: 'var(--color-gray-50)' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 800 }}>
                        Patient: {activeDoctorIncident.patientName || activeDoctorIncident.patientUid}
                      </h3>
                      <StatusBadge status={activeDoctorIncident.severity} size="sm" />
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-gray-500)', marginTop: '2px' }}>
                      Risk Score: <strong>{activeDoctorIncident.riskScore || 92}/100</strong> • Status: <StatusBadge status={activeDoctorIncident.status} size="sm" showIcon={false} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                      onClick={() => handleStartAssessmentForEmergency(activeDoctorIncident)}
                      className="btn btn-critical btn-sm"
                      style={{ fontWeight: 800 }}
                      data-testid="active-start-assessment-btn"
                    >
                      📋 Start Assessment
                    </button>
                    <button
                      onClick={() => openPatientDetails(activeDoctorIncident.id)}
                      className="btn btn-secondary btn-sm"
                      style={{ fontWeight: 700 }}
                      data-testid="active-view-patient-btn"
                    >
                      👁 View Patient Details
                    </button>
                    <button
                      onClick={() => resolveCase(activeDoctorIncident.id)}
                      className="btn btn-success btn-sm"
                      style={{ fontWeight: 800 }}
                      data-testid="active-resolve-emergency-btn"
                    >
                      🏁 RESOLVE EMERGENCY
                    </button>
                  </div>
                </div>

                <div className="card-content">
                  {/* Section 11: Vitals ❤️ 🫁 🌡 */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 'var(--space-3)',
                    marginBottom: 'var(--space-5)'
                  }}>
                    <div style={{ background: 'var(--color-critical-bg)', border: '1px solid var(--color-critical-border)', padding: '12px', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-critical)' }}>❤️ Heart Rate</div>
                      <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-critical)', marginTop: '4px' }}>
                        145 BPM
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--color-critical)', opacity: 0.8 }}>Tachycardia Anomaly</div>
                    </div>

                    <div style={{ background: 'var(--color-secondary-bg)', border: '1px solid var(--color-secondary-border)', padding: '12px', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-secondary)' }}>🫁 SpO2</div>
                      <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-secondary)', marginTop: '4px' }}>
                        82%
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--color-secondary)', opacity: 0.8 }}>Severe Hypoxia</div>
                    </div>

                    <div style={{ background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning-border)', padding: '12px', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-warning)' }}>🌡 Temperature</div>
                      <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-warning)', marginTop: '4px' }}>
                        39.8°C
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--color-warning)', opacity: 0.8 }}>Hyperpyrexia</div>
                    </div>
                  </div>

                  {/* Doctor Clinical Ambulance Decision Controls */}
                  {activeDoctorIncident.requiresAmbulance ? (
                    <div style={{
                      background: 'rgba(13, 148, 136, 0.08)',
                      border: '1px solid var(--color-teal, #0D9488)',
                      padding: '12px 16px',
                      borderRadius: 'var(--radius-md)',
                      marginBottom: 'var(--space-4)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '12px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '20px' }}>🚑</span>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-gray-900)' }}>
                            Ambulance Dispatched: <span style={{ color: 'var(--color-primary)' }}>{activeDoctorIncident.ambulanceUnitId || 'Seeking Available Driver'}</span>
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--color-gray-600)' }}>
                            Status: <strong>{activeDoctorIncident.status?.replace(/_/g, ' ')}</strong> • Real-time GPS Telemetry Active
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => handleAmbulanceDecision(activeDoctorIncident.id, false)}
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '11px', fontWeight: 600 }}
                        >
                          Cancel Ambulance Dispatch
                        </button>
                      </div>
                    </div>
                  ) : activeDoctorIncident.requiresAmbulance === false || activeDoctorIncident.status === 'AMBULANCE_NOT_REQUIRED' ? (
                    <div style={{
                      background: 'rgba(100, 116, 139, 0.08)',
                      border: '1px solid var(--color-gray-300)',
                      padding: '12px 16px',
                      borderRadius: 'var(--radius-md)',
                      marginBottom: 'var(--space-4)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '12px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '20px' }}>🏥</span>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-gray-900)' }}>
                            Ambulance Not Required (Assessed by Medical Staff)
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--color-gray-600)' }}>
                            Patient condition managed on-site / Outpatient emergency. No fleet vehicle dispatched.
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleAmbulanceDecision(activeDoctorIncident.id, true)}
                        className="btn btn-critical btn-sm"
                        style={{ fontWeight: 800, fontSize: '12px' }}
                        data-testid="ambulance-required-btn"
                      >
                        🚑 Upgrade: Dispatch Ambulance
                      </button>
                    </div>
                  ) : (
                    <div style={{
                      background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.06), rgba(245, 158, 11, 0.06))',
                      border: '1px solid var(--color-warning)',
                      padding: '14px 18px',
                      borderRadius: 'var(--radius-md)',
                      marginBottom: 'var(--space-4)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '12px'
                    }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontSize: '16px' }}>👨‍⚕️</span>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-gray-900)' }}>
                            Clinical Ambulance Decision Required
                          </span>
                          <span style={{ fontSize: '11px', background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                            Awaiting Assessment
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--color-gray-600)' }}>
                          Evaluate patient vitals and triage severity. Explicitly decide if ambulance transport is required:
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          onClick={() => handleAmbulanceDecision(activeDoctorIncident.id, true)}
                          className="btn btn-critical btn-sm"
                          style={{ fontWeight: 800, fontSize: '12px' }}
                          data-testid="ambulance-required-btn"
                        >
                          🚑 Dispatch Ambulance (Required)
                        </button>
                        <button
                          onClick={() => handleAmbulanceDecision(activeDoctorIncident.id, false)}
                          className="btn btn-secondary btn-sm"
                          style={{ fontWeight: 700, fontSize: '12px' }}
                          data-testid="ambulance-not-required-btn"
                        >
                          🚫 No Ambulance Needed
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Section 11: Emergency Timeline */}
                  <div style={{ marginBottom: 'var(--space-5)' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: 800, marginBottom: '8px', color: 'var(--color-gray-800)' }}>
                      Emergency Workflow Timeline
                    </h4>
                    <EmergencyTimeline
                      currentStatus={activeDoctorIncident.status}
                      compact={true}
                    />
                  </div>

                  {/* Section 11: Ambulance Tracking Google Map */}
                  <div>
                    <h4 style={{ fontSize: '13px', fontWeight: 800, marginBottom: '8px', color: 'var(--color-gray-900)' }}>
                      Live Ambulance Tracking (Patient 📍, Ambulance 🚑, Hospital 🏥)
                    </h4>
                    <GoogleMapTracking
                      patientLocation={[activeDoctorIncident.latitude, activeDoctorIncident.longitude]}
                      hospitalLocation={activeDoctorIncident.hospitalLat && activeDoctorIncident.hospitalLng ? [activeDoctorIncident.hospitalLat, activeDoctorIncident.hospitalLng] : [12.9716, 77.5946]}
                      ambulanceLocation={ambulanceLocation ? [ambulanceLocation.latitude, ambulanceLocation.longitude] : [12.9650, 77.5850]}
                      ambulanceStatus={activeDoctorIncident.status}
                      ambulanceUnitId={activeDoctorIncident.ambulanceUnitId || 'AMB-102'}
                      driverName={activeDoctorIncident.driverName}
                      emergencyId={activeDoctorIncident.id}
                      height="320px"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState title="No active assigned cases" message="Select a case from the list on the left." />
            )}
          </div>
        </div>
      </div>
    );
  };

  // ==========================================================================
  // 3. AMBULANCE DRIVER VIEW (Sections 12, 13)
  // ==========================================================================
  const renderDriverView = () => {
    const activeEmergency = currentJob?.emergency || activeEmergencies.find(e => (user?.ambulanceId && e.ambulanceId === user.ambulanceId)) || null;
    const currentAmbulance = currentJob?.ambulance;
    const unitIdentifier = user?.ambulanceUnitId || currentAmbulance?.unitId || 'AMB-101';
    const currentStatus = currentAmbulance?.status || activeEmergency?.status || 'AVAILABLE';

    // 8-stage journey timeline definitions
    const stages8 = [
      { key: 'DRIVER_ACCEPTED', label: '1. Driver Accepted', shortLabel: 'Accepted', icon: '📋' },
      { key: 'JOURNEY_STARTED', label: '2. Journey Started', shortLabel: 'Started', icon: '🚀' },
      { key: 'EN_ROUTE_TO_PATIENT', label: '3. En Route to Patient', shortLabel: 'To Patient', icon: '🚑' },
      { key: 'ARRIVED_AT_PATIENT', label: '4. Arrived at Patient', shortLabel: 'At Patient', icon: '📍' },
      { key: 'PATIENT_ONBOARD', label: '5. Patient Onboard', shortLabel: 'Onboard', icon: '👤' },
      { key: 'EN_ROUTE_TO_HOSPITAL', label: '6. Travelling to Hospital', shortLabel: 'To Hospital', icon: '🏥' },
      { key: 'ARRIVED_AT_HOSPITAL', label: '7. Arrived at Hospital', shortLabel: 'At Hospital', icon: '✅' },
      { key: 'COMPLETED', label: '8. Completed', shortLabel: 'Completed', icon: '🏁' }
    ];

    const getStageIndex = (status) => {
      const s = (status || '').toUpperCase();
      if (s === 'REQUESTED' || s === 'ACCEPTED' || s === 'DRIVER_ACCEPTED') return 0;
      if (s === 'JOURNEY_STARTED') return 1;
      if (s === 'EN_ROUTE_TO_PATIENT') return 2;
      if (s === 'ARRIVED_AT_PATIENT' || s === 'ARRIVED_AT_PICKUP') return 3;
      if (s === 'PATIENT_ONBOARD' || s === 'PATIENT_PICKED_UP') return 4;
      if (s === 'EN_ROUTE_TO_HOSPITAL') return 5;
      if (s === 'ARRIVED_AT_HOSPITAL') return 6;
      if (s === 'COMPLETED' || s === 'RESOLVED') return 7;
      return 0;
    };
    const currentStageIdx = getStageIndex(currentStatus);

    // Sequence of progression stages
    const progressionStages = [
      { key: 'EN_ROUTE_TO_PATIENT', label: '🚑 Start Journey (En Route)', next: 'ARRIVED_AT_PATIENT' },
      { key: 'ARRIVED_AT_PATIENT', label: '📍 Arrived at Patient', next: 'PATIENT_PICKED_UP' },
      { key: 'PATIENT_PICKED_UP', label: '👤 Patient Picked Up', next: 'EN_ROUTE_TO_HOSPITAL' },
      { key: 'EN_ROUTE_TO_HOSPITAL', label: '🏥 En Route to Hospital', next: 'ARRIVED_AT_HOSPITAL' },
      { key: 'ARRIVED_AT_HOSPITAL', label: '✅ Arrived at Hospital', next: 'COMPLETED' },
      { key: 'COMPLETED', label: '🏁 Complete Dispatch', next: 'AVAILABLE' }
    ];

    const getNextAllowedStage = (status) => {
      const s = (status || '').toUpperCase();
      if (s === 'ACCEPTED' || s === 'DRIVER_ACCEPTED' || s === 'REQUESTED') return 'EN_ROUTE_TO_PATIENT';
      if (s === 'EN_ROUTE_TO_PATIENT' || s === 'JOURNEY_STARTED') return 'ARRIVED_AT_PATIENT';
      if (s === 'ARRIVED_AT_PATIENT' || s === 'ARRIVED_AT_PICKUP') return 'PATIENT_PICKED_UP';
      if (s === 'PATIENT_PICKED_UP' || s === 'PATIENT_ONBOARD') return 'EN_ROUTE_TO_HOSPITAL';
      if (s === 'EN_ROUTE_TO_HOSPITAL') return 'ARRIVED_AT_HOSPITAL';
      if (s === 'ARRIVED_AT_HOSPITAL') return 'COMPLETED';
      return null;
    };
    const nextAllowedStage = getNextAllowedStage(currentStatus);

    // Coordinate & Telemetry calculation
    const ambLat = currentCoords?.latitude || currentAmbulance?.latitude || 12.9650;
    const ambLng = currentCoords?.longitude || currentAmbulance?.longitude || 77.5850;
    const patLat = activeEmergency?.latitude || 12.9716;
    const patLng = activeEmergency?.longitude || 77.5946;
    const hospLat = activeEmergency?.hospitalLat || 12.9800;
    const hospLng = activeEmergency?.hospitalLng || 77.6000;

    const straightDistToPat = calcHaversineDistance(ambLat, ambLng, patLat, patLng);
    const straightDistPatToHosp = calcHaversineDistance(patLat, patLng, hospLat, hospLng);

    const estDistToPat = straightDistToPat ? Number((straightDistToPat * 1.35).toFixed(1)) : 1.3;
    const estEtaToPat = Math.max(1, Math.round((estDistToPat / 30) * 60));
    const estDistPatToHosp = straightDistPatToHosp ? Number((straightDistPatToHosp * 1.35).toFixed(1)) : 4.5;
    const estEtaPatToHosp = Math.max(1, Math.round((estDistPatToHosp / 30) * 60));

    const isHeadingToHospital = ['PATIENT_PICKED_UP', 'PATIENT_ONBOARD', 'EN_ROUTE_TO_HOSPITAL', 'ARRIVED_AT_HOSPITAL'].includes(String(currentStatus).toUpperCase());

    const displayDistToPat = routeTelemetry?.distanceToPatient ?? estDistToPat;
    const displayEtaToPat = routeTelemetry?.etaToPatient ?? estEtaToPat;
    const displayDistPatToHosp = routeTelemetry?.distancePatientToHospital ?? estDistPatToHosp;
    const displayEtaPatToHosp = routeTelemetry?.etaPatientToHospital ?? estEtaPatToHosp;

    const displayRemainingDist = routeTelemetry?.activeRemainingDistance ?? (isHeadingToHospital ? displayDistPatToHosp : displayDistToPat);
    const displayRemainingEta = routeTelemetry?.activeRemainingEta ?? (isHeadingToHospital ? displayEtaPatToHosp : displayEtaToPat);
    const displayTotalDist = routeTelemetry?.totalDistance ?? Number((estDistToPat + estDistPatToHosp).toFixed(1));
    const displayTotalEta = routeTelemetry?.totalEta ?? (estEtaToPat + estEtaPatToHosp);

    const isJourneyActive = currentStatus !== 'ACCEPTED' && currentStatus !== 'DRIVER_ACCEPTED' && currentStatus !== 'REQUESTED' && currentStatus !== 'AVAILABLE';

    return (
      <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
        {/* Top Section: Driver Console Header with Emergency ID, Unit ID, Journey Status, and Live GPS Status */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-5)',
          background: '#FFFFFF',
          padding: '16px 20px',
          borderRadius: 'var(--radius-xl, 16px)',
          border: '1px solid var(--color-gray-200)',
          boxShadow: '0 2px 10px rgba(0,0,0,0.04)'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '26px' }}>🚑</span>
              <div>
                <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 900, color: '#0B1F3A', margin: 0 }}>
                  Ambulance Command Console
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '3px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-primary)' }}>
                    Ambulance ID: {unitIdentifier}
                  </span>
                  <span style={{ color: 'var(--color-gray-300)' }}>•</span>
                  <span style={{ fontSize: '13px', color: 'var(--color-gray-600)' }}>
                    Driver: <strong>{user?.fullName || 'Active Operator'}</strong>
                  </span>
                  {activeEmergency && (
                    <>
                      <span style={{ color: 'var(--color-gray-300)' }}>•</span>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-critical)' }}>
                        Emergency ID: SOS-{activeEmergency.id}
                      </span>
                      <StatusBadge status={currentStatus} size="sm" />
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Live GPS Telemetry Connection Status Badge */}
            <div style={{
              background: gpsStatus === 'ACTIVE' ? '#ECFDF5' : gpsStatus === 'STALE' ? '#FFFBEB' : gpsStatus === 'DENIED' ? '#FEE2E2' : '#F1F5F9',
              border: `1px solid ${gpsStatus === 'ACTIVE' ? '#A7F3D0' : gpsStatus === 'STALE' ? '#FDE68A' : gpsStatus === 'DENIED' ? '#FCA5A5' : '#CBD5E1'}`,
              padding: '6px 14px',
              borderRadius: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '11.5px',
              fontWeight: 800,
              color: gpsStatus === 'ACTIVE' ? '#059669' : gpsStatus === 'STALE' ? '#D97706' : gpsStatus === 'DENIED' ? '#DC2626' : '#475569'
            }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: gpsStatus === 'ACTIVE' ? '#10B981' : gpsStatus === 'STALE' ? '#F59E0B' : gpsStatus === 'DENIED' ? '#EF4444' : '#94A3B8',
                boxShadow: gpsStatus === 'ACTIVE' ? '0 0 8px #10B981' : 'none'
              }} />
              <span>
                {gpsStatus === 'ACTIVE' ? 'LIVE GPS ACTIVE' :
                 gpsStatus === 'STALE' ? 'STALE GPS (>30s)' :
                 gpsStatus === 'DENIED' ? 'GPS PERMISSION DENIED' :
                 gpsStatus === 'UNAVAILABLE' ? 'LOCATION UNAVAILABLE' :
                 gpsStatus === 'REQUESTING' ? 'ACQUIRING GPS LOCK...' : 'GPS STANDBY'}
              </span>
            </div>

            {/* WebSocket Dispatch Broker Badge */}
            <div style={{
              background: wsConnected ? 'var(--color-success-bg, #ECFDF5)' : 'var(--color-warning-bg, #FFFBEB)',
              border: `1px solid ${wsConnected ? 'var(--color-success-border, #A7F3D0)' : 'var(--color-warning-border, #FDE68A)'}`,
              padding: '6px 12px',
              borderRadius: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              fontWeight: 700,
              color: wsConnected ? 'var(--color-success, #059669)' : 'var(--color-warning, #D97706)'
            }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: wsConnected ? '#10B981' : '#F59E0B' }} />
              <span>{wsConnected ? 'BROKER CONNECTED' : 'RECONNECTING...'}</span>
            </div>

            <button
              onClick={() => setIsDriverAvailable(!isDriverAvailable)}
              className={`btn btn-sm ${isDriverAvailable ? 'btn-success' : 'btn-secondary'}`}
              style={{ fontWeight: 800, padding: '7px 14px' }}
            >
              {isDriverAvailable ? '✓ ON DUTY / AVAILABLE' : 'BUSY / OUT OF SERVICE'}
            </button>
          </div>
        </div>

        {/* Driver Notification Banner */}
        {driverNotification && (
          <div
            className={`alert alert-${driverNotification.type === 'success' ? 'success' : driverNotification.type === 'warning' ? 'warning' : 'critical'}`}
            style={{
              marginBottom: 'var(--space-5)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 18px',
              borderRadius: 'var(--radius-lg)',
              animation: 'fadeIn 0.2s ease-out'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '18px' }}>
                {driverNotification.type === 'success' ? '✓' : driverNotification.type === 'warning' ? '⚠️' : '🚨'}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>{driverNotification.message}</span>
            </div>
            <button
              onClick={() => setDriverNotification(null)}
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--color-gray-500)', fontSize: '16px' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Section 12: Incoming Ambulance Requests */}
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>🚑</span>
              <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 800, color: 'var(--color-critical)', margin: 0 }}>
                Incoming Ambulance Requests
              </h3>
              {pendingRequests.length > 0 && (
                <span style={{
                  background: 'var(--color-critical)',
                  color: '#FFFFFF',
                  fontSize: '11px',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: '12px'
                }}>
                  {pendingRequests.length} PENDING
                </span>
              )}
            </div>

            <button
              onClick={loadDriverData}
              disabled={isRequestsLoading}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: '12px', gap: '4px' }}
            >
              🔄 Refresh
            </button>
          </div>

          {/* Loading State */}
          {isRequestsLoading && pendingRequests.length === 0 && (
            <div style={{
              padding: 'var(--space-6)',
              textAlign: 'center',
              background: '#FFFFFF',
              borderRadius: 'var(--radius-lg, 12px)',
              border: '1px solid var(--color-gray-200)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
            }}>
              <span className="status-spinner" style={{ width: '24px', height: '24px', borderWidth: '3px', margin: '0 auto 8px', display: 'inline-block' }} />
              <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-gray-600)', margin: 0 }}>
                Loading incoming ambulance requests...
              </p>
            </div>
          )}

          {/* Error State */}
          {requestsError && !isRequestsLoading && (
            <div style={{
              padding: 'var(--space-4)',
              background: '#FEE2E2',
              borderRadius: 'var(--radius-lg, 12px)',
              border: '1px solid #FCA5A5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⚠️</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#991B1B' }}>
                  {requestsError}
                </span>
              </div>
              <button
                onClick={loadDriverData}
                className="btn btn-sm btn-critical"
                style={{ fontSize: '12px' }}
              >
                Retry
              </button>
            </div>
          )}

          {/* Empty State */}
          {!isRequestsLoading && !requestsError && pendingRequests.length === 0 && (
            <div
              className="empty-state"
              style={{
                padding: 'var(--space-6)',
                textAlign: 'center',
                background: '#FFFFFF',
                borderRadius: 'var(--radius-lg, 12px)',
                border: '1px dashed var(--color-gray-300)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
              }}
            >
              <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}>🚑</span>
              <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-gray-700)', margin: 0 }}>
                No incoming ambulance requests
              </p>
              <p style={{ fontSize: '12.5px', color: 'var(--color-gray-500)', marginTop: '4px', marginBottom: 0 }}>
                All available ambulance units are currently on standby. Real-time emergency dispatches will appear here automatically.
              </p>
            </div>
          )}

          {/* Pending Request Cards */}
          {!isRequestsLoading && pendingRequests.length > 0 && pendingRequests.map(req => {
            const reqKey = req.requestId || req.id;
            const isLoading = actionLoadingId === req.id || actionLoadingId === req.requestId;
            return (
              <div
                key={reqKey}
                className="incoming-alert-card"
                style={{
                  marginBottom: 'var(--space-4)',
                  background: '#FFFFFF',
                  border: '2px solid var(--color-critical)',
                  boxShadow: '0 4px 20px rgba(220, 38, 38, 0.12)'
                }}
              >
                {/* Alert Header */}
                <div className="incoming-alert-header">
                  <div className="incoming-alert-title">
                    <span>🚨</span>
                    <span>Emergency ID: SOS-{req.emergencyId || req.id} (Request #{req.requestId || req.id})</span>
                    <StatusBadge status={req.severity || 'CRITICAL'} size="sm" />
                    {req.emergencyType && (
                      <span style={{
                        background: '#EFF6FF',
                        color: '#1D4ED8',
                        border: '1px solid #BFDBFE',
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '4px'
                      }}>
                        {req.emergencyType}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      background: 'var(--color-critical)',
                      color: '#FFFFFF',
                      fontSize: '11px',
                      fontWeight: 800,
                      padding: '3px 8px',
                      borderRadius: '4px'
                    }}>
                      TRIAGE RISK {req.riskScore != null ? req.riskScore : 90}/100
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--color-gray-500)' }}>
                      🕒 {req.requestedAt ? new Date(req.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Just now'}
                    </span>
                  </div>
                </div>

                {/* Dispatch Details Grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 'var(--space-4)',
                  marginBottom: 'var(--space-4)',
                  padding: 'var(--space-3) 0'
                }}>
                  {/* Patient Information */}
                  <div>
                    <div className="incoming-alert-item-label">Patient Information</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--color-gray-900)' }}>
                      {req.patientName || 'Emergency Patient'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-gray-600)', marginTop: '2px' }}>
                      {req.patientAge ? `${req.patientAge} yrs • ` : ''}
                      Blood Group: <strong>{req.patientBloodGroup || 'O+'}</strong>
                    </div>
                    {req.patientPhone && (
                      <div style={{ fontSize: '12px', color: 'var(--color-primary)', marginTop: '2px' }}>
                        📞 {req.patientPhone}
                      </div>
                    )}
                  </div>

                  {/* Pickup Address & Coordinates */}
                  <div>
                    <div className="incoming-alert-item-label">Pickup Address</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-gray-800)', lineHeight: 1.4 }}>
                      📍 {req.pickupAddress || req.patientAddress || 'Current GPS Telemetry'}
                    </div>
                    <div style={{ fontSize: '11.5px', fontFamily: 'monospace', color: 'var(--color-gray-500)', marginTop: '3px' }}>
                      Coordinates: {req.pickupLat?.toFixed(4)}, {req.pickupLng?.toFixed(4)}
                    </div>
                  </div>

                  {/* Destination Hospital */}
                  <div>
                    <div className="incoming-alert-item-label">Destination Hospital</div>
                    <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--color-teal)' }}>
                      🏥 {req.destinationHospital || req.hospitalName || 'Pending Hospital Assignment'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-gray-500)', marginTop: '2px' }}>
                      Emergency Trauma & Resuscitation Center
                    </div>
                  </div>

                  {/* Distance to pickup */}
                  <div>
                    <div className="incoming-alert-item-label">Distance to Pickup</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--color-primary)' }}>
                      📏 {req.distanceKm != null ? `${req.distanceKm} km` : (req.pickupToHospitalDistanceKm != null ? `${req.pickupToHospitalDistanceKm} km` : 'Unavailable')}
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-teal)', marginTop: '2px' }}>
                      ⏱️ {req.etaMinutes != null ? `~${req.etaMinutes} min response time` : (req.pickupToHospitalEtaMinutes != null ? `~${req.pickupToHospitalEtaMinutes} min response time` : 'ETA Unavailable')}
                    </div>
                  </div>
                </div>

                {/* Symptoms & Notes */}
                {(req.symptoms || req.symptomDescription) && (
                  <div style={{
                    background: 'var(--color-gray-50)',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    marginBottom: 'var(--space-4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    flexWrap: 'wrap'
                  }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-gray-500)', textTransform: 'uppercase' }}>
                      Reported Symptoms:
                    </span>
                    {(Array.isArray(req.symptoms) ? req.symptoms : [req.symptoms || req.symptomDescription]).map((s, idx) => (
                      <span key={idx} style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        background: '#FEE2E2',
                        color: '#991B1B',
                        padding: '2px 8px',
                        borderRadius: '12px'
                      }}>
                        {s}
                      </span>
                    ))}
                    {req.symptomDescription && req.symptomDescription !== req.symptoms && (
                      <span style={{ fontSize: '12px', color: 'var(--color-gray-600)', marginLeft: '4px' }}>
                        • {req.symptomDescription}
                      </span>
                    )}
                  </div>
                )}

                {/* Action Buttons: Accept Request & Reject Request */}
                <div style={{
                  display: 'flex',
                  gap: 'var(--space-3)',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  borderTop: '1px solid rgba(220, 38, 38, 0.15)',
                  paddingTop: 'var(--space-4)',
                  flexWrap: 'wrap'
                }}>
                  {/* Reject Request Action */}
                  <button
                    type="button"
                    onClick={() => declineDriverRequest(req.requestId || req.id)}
                    disabled={isLoading}
                    className="btn-dispatch-decline"
                    data-testid="reject-request-btn"
                    aria-label="Reject Request"
                  >
                    <span aria-hidden="true">✕</span>
                    <span>{isLoading ? 'Processing...' : 'Reject Request'}</span>
                  </button>

                  {/* Accept Request Action */}
                  <button
                    type="button"
                    onClick={() => acceptDriverRequest(req.requestId || req.id)}
                    disabled={isLoading}
                    className="btn-dispatch-accept"
                    data-testid="accept-request-btn"
                    aria-label="Accept Request"
                  >
                    {isLoading ? (
                      <span className="status-spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                    ) : (
                      <span aria-hidden="true">✓</span>
                    )}
                    <span>{isLoading ? 'Accepting...' : 'Accept Request'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Section 13: Active Emergency Response Console */}
        {activeEmergency ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {/* Active Response Header Banner */}
            <div style={{
              background: '#FFFFFF',
              border: '2px solid var(--color-teal, #0D9488)',
              borderRadius: 'var(--radius-xl, 16px)',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              boxShadow: '0 4px 20px rgba(13, 148, 136, 0.12)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '28px' }}>🚑</span>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 900, fontSize: '16px', color: '#0B1F3A' }}>
                      ACTIVE EMERGENCY DISPATCH: SOS-{activeEmergency.id}
                    </span>
                    <StatusBadge status={activeEmergency.severity || 'CRITICAL'} size="sm" />
                    <StatusBadge status={currentStatus} size="sm" />
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--color-gray-600)', marginTop: '3px' }}>
                    Patient: <strong>{activeEmergency.patientName || activeEmergency.patientUid}</strong> • Destination: <strong>{activeEmergency.hospitalName || activeEmergency.destinationHospital || 'City Emergency Dept'}</strong>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                {/* Start Journey Callout Button if Accepted & Not Yet Started */}
                {(!isJourneyActive || currentStatus === 'ACCEPTED' || currentStatus === 'DRIVER_ACCEPTED') && (
                  <button
                    type="button"
                    onClick={handleStartJourney}
                    disabled={isUpdatingStatus}
                    className="btn btn-primary"
                    style={{
                      fontWeight: 800,
                      fontSize: '13.5px',
                      padding: '9px 18px',
                      background: 'linear-gradient(135deg, #2563EB, #1D4ED8)',
                      color: '#FFFFFF',
                      boxShadow: '0 2px 10px rgba(37, 99, 235, 0.35)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>🚀 Start Live Transit</span>
                  </button>
                )}

                {/* GPS Simulation Toggle for Dev/Demo */}
                <button
                  type="button"
                  onClick={() => toggleGpsSimulation(activeEmergency)}
                  className={`btn btn-sm ${isSimulatingGps ? 'btn-critical' : 'btn-secondary'}`}
                  style={{ fontWeight: 700, padding: '7px 14px' }}
                  title="Stream simulated movement coordinates along route"
                >
                  📡 {isSimulatingGps ? 'Pause GPS Stream' : 'Stream Simulated GPS'}
                </button>
              </div>
            </div>

            {/* Start Journey Standby Banner if not started */}
            {(!isJourneyActive || currentStatus === 'ACCEPTED' || currentStatus === 'DRIVER_ACCEPTED') && (
              <div style={{
                background: '#EFF6FF',
                border: '1px solid #BFDBFE',
                borderRadius: 'var(--radius-lg, 12px)',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '22px' }}>📍</span>
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#1D4ED8' }}>
                      Dispatch Accepted — Unit Ready for Deployment
                    </div>
                    <div style={{ fontSize: '12px', color: '#3B82F6', marginTop: '2px' }}>
                      Live GPS telemetry and route navigation activate when you click <strong>Start Journey</strong>.
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleStartJourney}
                  disabled={isUpdatingStatus}
                  className="btn btn-primary"
                  style={{ fontWeight: 800, fontSize: '13px', padding: '8px 16px' }}
                >
                  🚀 Start Journey Now
                </button>
              </div>
            )}

            {/* Main Section & Side Panel Grid (Section 6 Layout) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.75fr) minmax(320px, 1.25fr)',
              gap: 'var(--space-5)',
              alignItems: 'start'
            }}>
              {/* Left Column: Interactive Map, 8-Stage Timeline Stepper & Action Controls */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                {/* Interactive Leaflet Tracking Map with custom markers and OSRM driving routes */}
                <GoogleMapTracking
                  patientLocation={[activeEmergency.latitude, activeEmergency.longitude]}
                  hospitalLocation={activeEmergency.hospitalLat && activeEmergency.hospitalLng ? [activeEmergency.hospitalLat, activeEmergency.hospitalLng] : [12.9716, 77.5946]}
                  ambulanceLocation={currentCoords ? [currentCoords.latitude, currentCoords.longitude] : (ambulanceLocation ? [ambulanceLocation.latitude, ambulanceLocation.longitude] : (currentAmbulance?.latitude ? [currentAmbulance.latitude, currentAmbulance.longitude] : [12.9650, 77.5850]))}
                  ambulanceStatus={currentStatus}
                  ambulanceUnitId={unitIdentifier}
                  driverName={user?.fullName || 'Active Operator'}
                  hospitalName={activeEmergency.hospitalName || activeEmergency.destinationHospital || 'City General Hospital'}
                  hospitalAddress={activeEmergency.hospitalAddress || 'Emergency Trauma Center'}
                  pickupAddress={activeEmergency.pickupAddress || 'Patient Location'}
                  emergencyId={activeEmergency.id}
                  followAmbulance={true}
                  height="480px"
                  isTrackingActive={isJourneyActive}
                  isGpsStale={gpsStatus === 'STALE'}
                  isGpsDenied={gpsStatus === 'DENIED'}
                  isGpsUnavailable={gpsStatus === 'UNAVAILABLE'}
                  gpsStatus={gpsStatus}
                  onRouteCalculated={(data) => setRouteTelemetry(data)}
                />

                {/* 8-Stage Journey Status Timeline Stepper */}
                <div className="card" style={{ padding: 'var(--space-4)' }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px',
                    flexWrap: 'wrap',
                    gap: '8px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>⏱️</span>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-gray-900)' }}>
                        8-Stage Emergency Transit Timeline
                      </span>
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-primary)' }}>
                      Stage {currentStageIdx + 1} of 8: {stages8[currentStageIdx]?.shortLabel}
                    </span>
                  </div>

                  {/* Visual 8-Step Timeline Strip */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(8, 1fr)',
                    gap: '4px',
                    position: 'relative',
                    marginBottom: '8px'
                  }}>
                    {stages8.map((stg, idx) => {
                      const isPast = idx < currentStageIdx;
                      const isCurrent = idx === currentStageIdx;
                      return (
                        <div
                          key={stg.key}
                          style={{
                            textAlign: 'center',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            position: 'relative'
                          }}
                        >
                          <div style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            fontWeight: 800,
                            background: isPast ? '#059669' : isCurrent ? '#2563EB' : '#F1F5F9',
                            color: (isPast || isCurrent) ? '#FFFFFF' : '#94A3B8',
                            border: isCurrent ? '3px solid #BFDBFE' : '1px solid transparent',
                            boxShadow: isCurrent ? '0 0 10px rgba(37, 99, 235, 0.4)' : 'none',
                            marginBottom: '4px',
                            transition: 'all 0.2s ease'
                          }}>
                            {isPast ? '✓' : stg.icon}
                          </div>
                          <span style={{
                            fontSize: '10px',
                            fontWeight: isCurrent ? 800 : 600,
                            color: isCurrent ? '#1D4ED8' : isPast ? '#059669' : '#64748B',
                            lineHeight: 1.2,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '100%'
                          }}>
                            {stg.shortLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Dispatch Progression Controls (Action Buttons) */}
                <div className="card" style={{ padding: 'var(--space-5)' }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '14px',
                    flexWrap: 'wrap',
                    gap: '8px'
                  }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Dispatch Progression Controls
                      </div>
                      <div style={{ fontSize: '13px', color: 'var(--color-gray-700)', marginTop: '2px' }}>
                        Current Unit Stage: <strong style={{ color: 'var(--color-teal)' }}>{currentStatus.replace(/_/g, ' ')}</strong>
                      </div>
                    </div>

                    <span style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>
                      Click step to transition status across all hospital & guardian monitors
                    </span>
                  </div>

                  {/* Progression Buttons */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
                    {progressionStages.map((stage) => {
                      const isActive = currentStatus === stage.key;
                      const isNext = nextAllowedStage === stage.key;
                      const isDisabled = isUpdatingStatus || (!isActive && !isNext);
                      return (
                        <button
                          key={stage.key}
                          type="button"
                          onClick={() => updateAmbulanceStatus(stage.key)}
                          disabled={isDisabled}
                          className={`btn btn-sm ${isActive ? 'btn-teal' : isNext ? 'btn-primary' : 'btn-secondary'}`}
                          style={{
                            padding: '10px 8px',
                            fontSize: '12px',
                            fontWeight: (isActive || isNext) ? 800 : 600,
                            border: isActive ? '2px solid var(--color-teal, #0D9488)' : isNext ? '2px solid var(--color-primary)' : '1px solid var(--color-gray-200)',
                            background: isActive ? 'var(--color-teal-bg, #F0FDFA)' : isNext ? '#EFF6FF' : 'white',
                            color: isActive ? 'var(--color-teal, #0D9488)' : isNext ? 'var(--color-primary)' : 'var(--color-gray-400)',
                            boxShadow: isActive ? '0 0 10px rgba(13, 148, 136, 0.25)' : isNext ? '0 2px 8px rgba(37, 99, 235, 0.2)' : 'none',
                            opacity: (!isActive && !isNext) ? 0.6 : 1,
                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {stage.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column: Side Information Panel (Section 6 Layout) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                {/* 1. Live Route & Navigation Telemetry Card */}
                <div className="card" style={{ padding: 'var(--space-4)', borderTop: '4px solid #2563EB' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '18px' }}>🧭</span>
                      <h4 style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--color-gray-900)', margin: 0 }}>
                        Live Route Navigation Telemetry
                      </h4>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#2563EB', background: '#EFF6FF', padding: '2px 8px', borderRadius: '12px' }}>
                      OSRM ROUTING
                    </span>
                  </div>

                  {/* Primary Target Metric Banner */}
                  <div style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '12px',
                    marginBottom: '12px',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px'
                  }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                        {isHeadingToHospital ? 'Distance to Hospital' : 'Distance to Patient'}
                      </div>
                      <div style={{ fontSize: '20px', fontWeight: 900, color: '#0B1F3A', marginTop: '2px' }}>
                        📏 {displayRemainingDist != null ? `${displayRemainingDist} km` : 'Calculating...'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                        Estimated Time (ETA)
                      </div>
                      <div style={{ fontSize: '20px', fontWeight: 900, color: '#0D9488', marginTop: '2px' }}>
                        ⏱️ {displayRemainingEta != null ? `~${displayRemainingEta} min` : 'Calculating...'}
                      </div>
                    </div>
                  </div>

                  {/* Journey Distance Breakdown */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.5px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                      <span style={{ color: '#64748B' }}>Ambulance ➔ Patient:</span>
                      <span style={{ fontWeight: 800, color: '#0F172A' }}>
                        {displayDistToPat} km (~{displayEtaToPat} min)
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                      <span style={{ color: '#64748B' }}>Patient ➔ Hospital:</span>
                      <span style={{ fontWeight: 800, color: '#0F172A' }}>
                        {displayDistPatToHosp} km (~{displayEtaPatToHosp} min)
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                      <span style={{ color: '#64748B', fontWeight: 700 }}>Total Journey Distance:</span>
                      <span style={{ fontWeight: 800, color: '#2563EB' }}>
                        {displayTotalDist} km
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                      <span style={{ color: '#64748B', fontWeight: 700 }}>Total Journey ETA:</span>
                      <span style={{ fontWeight: 800, color: '#0D9488' }}>
                        ~{displayTotalEta} min
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px' }}>
                      <span style={{ color: '#64748B' }}>Last GPS Telemetry Fix:</span>
                      <span style={{ fontWeight: 700, color: '#475569', fontFamily: 'monospace', fontSize: '11.5px' }}>
                        🕒 {lastGpsTimestamp ? lastGpsTimestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : (currentAmbulance?.latitude ? 'Live Satellite Link' : 'Waiting for GPS fix...')}
                      </span>
                    </div>

                    {gpsError && (
                      <div style={{
                        marginTop: '6px',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        background: '#FEE2E2',
                        color: '#991B1B',
                        fontSize: '11px',
                        fontWeight: 600
                      }}>
                        ⚠️ {gpsError}
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Patient Details Card */}
                <div className="card" style={{ padding: 'var(--space-4)', borderTop: '4px solid var(--color-critical)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '18px' }}>👤</span>
                      <h4 style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--color-gray-900)', margin: 0 }}>
                        Emergency Patient Details
                      </h4>
                    </div>
                    <span style={{
                      background: 'var(--color-critical)',
                      color: '#FFFFFF',
                      fontSize: '10.5px',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '10px'
                    }}>
                      TRIAGE RISK {activeEmergency.riskScore || 90}/100
                    </span>
                  </div>

                  <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--color-gray-900)' }}>
                    {activeEmergency.patientName || activeEmergency.patientUid || 'Emergency Patient'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-gray-600)', marginTop: '2px' }}>
                    {activeEmergency.patientAge ? `${activeEmergency.patientAge} years old • ` : ''}
                    Blood Group: <strong>{activeEmergency.patientBloodGroup || 'O+'}</strong>
                  </div>

                  {activeEmergency.patientPhone && (
                    <div style={{ fontSize: '12px', color: 'var(--color-primary)', marginTop: '4px' }}>
                      📞 Emergency Contact: <strong>{activeEmergency.patientPhone}</strong>
                    </div>
                  )}

                  {/* Pickup Address */}
                  <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #F1F5F9' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-gray-500)', textTransform: 'uppercase' }}>
                      📍 Patient Pickup Location
                    </div>
                    <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--color-gray-800)', marginTop: '2px', lineHeight: 1.35 }}>
                      {activeEmergency.pickupAddress || 'Current GPS Telemetry'}
                    </div>
                    <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#64748B', marginTop: '2px' }}>
                      GPS: {activeEmergency.latitude?.toFixed(4)}, {activeEmergency.longitude?.toFixed(4)}
                    </div>
                  </div>

                  {/* Symptoms */}
                  {(activeEmergency.symptoms || activeEmergency.symptomDescription) && (
                    <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #F1F5F9' }}>
                      <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-gray-500)', textTransform: 'uppercase' }}>
                        Reported Emergency Signs
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-critical)', fontWeight: 700, marginTop: '2px' }}>
                        {activeEmergency.symptoms || activeEmergency.symptomDescription}
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Destination Hospital Card */}
                <div className="card" style={{ padding: 'var(--space-4)', borderTop: '4px solid var(--color-teal)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '18px' }}>🏥</span>
                    <h4 style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--color-gray-900)', margin: 0 }}>
                      Destination Hospital
                    </h4>
                  </div>

                  <div style={{ fontSize: '14px', fontWeight: 900, color: 'var(--color-teal)' }}>
                    {activeEmergency.hospitalName || activeEmergency.destinationHospital || 'City General Hospital'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-gray-600)', marginTop: '2px' }}>
                    Emergency Trauma & Resuscitation Center
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-gray-500)', marginTop: '4px' }}>
                    📍 {activeEmergency.hospitalAddress || 'City Emergency Trauma Center, Medical Ward'}
                  </div>
                  {activeEmergency.hospitalLat && (
                    <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#64748B', marginTop: '2px' }}>
                      Coordinates: {activeEmergency.hospitalLat?.toFixed(4)}, {activeEmergency.hospitalLng?.toFixed(4)}
                    </div>
                  )}
                </div>

                {/* 4. Ambulance & Driver Card */}
                <div className="card" style={{ padding: 'var(--space-4)', borderTop: '4px solid #64748B' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '18px' }}>📋</span>
                    <h4 style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--color-gray-900)', margin: 0 }}>
                      Assigned Ambulance Unit
                    </h4>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px' }}>
                    <span style={{ color: '#64748B' }}>Unit Identifier:</span>
                    <span style={{ fontWeight: 800, color: '#0B1F3A' }}>{unitIdentifier}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px' }}>
                    <span style={{ color: '#64748B' }}>Driver / Operator:</span>
                    <span style={{ fontWeight: 700, color: '#0B1F3A' }}>{user?.fullName || 'Active Operator'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px' }}>
                    <span style={{ color: '#64748B' }}>Vehicle Class:</span>
                    <span style={{ fontWeight: 600, color: '#475569' }}>Type-D ACLS Life Support</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px' }}>
                    <span style={{ color: '#64748B' }}>Duty Readiness:</span>
                    <span style={{ fontWeight: 800, color: '#059669' }}>ACTIVE ON DUTY</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          pendingRequests.length === 0 && (
            <EmptyState
              icon="🚑"
              title="No Active Emergency Dispatches"
              message="Your ambulance unit is in active service and listening for emergency dispatch broadcasts on the network."
            />
          )
        )}
      </div>
    );
  };

  // ==========================================================================
  // 4. ADMIN / SYSTEM ADMIN VIEW
  // ==========================================================================
  const renderAdminView = () => {
    return (
      <div>
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--color-gray-900)' }}>
            System Administration Portal
          </h2>
          <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-gray-500)', marginTop: '2px' }}>
            Hospital infrastructure, medical registry, and SOS audit logs
          </p>
        </div>

        {activeTab === 'hospitals' && (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Hospital Registry</h3>
            </div>
            <div className="card-content">
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Hospital Name</th>
                      <th>Coordinates</th>
                      <th>Beds Capacity</th>
                      <th>Active Specialists</th>
                      <th>Emergency Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hospitals.map(h => (
                      <tr key={h.id}>
                        <td style={{ fontWeight: 800 }}>{h.name}</td>
                        <td style={{ fontFamily: 'monospace' }}>{h.lat?.toFixed(4)}, {h.lng?.toFixed(4)}</td>
                        <td>{h.availableBeds} / {h.totalBeds} beds</td>
                        <td>{h.availableDoctors} / {h.totalDoctors} available</td>
                        <td style={{ fontWeight: 700, color: 'var(--color-warning)' }}>★ {h.rating}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'doctors' && (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Specialist Directory</h3>
            </div>
            <div className="card-content">
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Doctor</th>
                      <th>Specialty</th>
                      <th>Associated Hospital</th>
                      <th>Duty Status</th>
                      <th>Emergency Availability</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doctors.map(d => (
                      <tr key={d.id}>
                        <td style={{ fontWeight: 700 }}>{d.name}</td>
                        <td>{d.specialization}</td>
                        <td>Hospital {d.hospitalId}</td>
                        <td><StatusBadge status={d.onDuty ? 'ON' : 'OFF'} size="sm" /></td>
                        <td><StatusBadge status={d.availableForEmergency ? 'FREE' : 'BUSY'} size="sm" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ambulances' && (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Fleet Units</h3>
            </div>
            <div className="card-content">
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Unit ID</th>
                      <th>GPS Coordinates</th>
                      <th>Status</th>
                      <th>Station</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ambulances.map(a => (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 800 }}>{a.unitId}</td>
                        <td style={{ fontFamily: 'monospace' }}>{a.latitude?.toFixed(4)}, {a.longitude?.toFixed(4)}</td>
                        <td><StatusBadge status={a.status || 'AVAILABLE'} size="sm" /></td>
                        <td>{a.hospitalName || 'Base Depot'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">System SOS Logs</h3>
            </div>
            <div className="card-content">
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>SOS ID</th>
                      <th>Patient UID</th>
                      <th>Severity</th>
                      <th>Department</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emergencies.map(e => (
                      <tr key={e.id}>
                        <td style={{ fontWeight: 800 }}>SOS-{e.id}</td>
                        <td>{e.patientUid}</td>
                        <td><StatusBadge status={e.severity} size="sm" /></td>
                        <td>{e.requiredDepartment || 'Trauma'}</td>
                        <td><StatusBadge status={e.status} size="sm" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <DashboardLayout
      title={
        role === 'DOCTOR'
          ? 'Physician Emergency Portal'
          : role === 'AMBULANCE_DRIVER'
          ? 'Ambulance Command Console'
          : role === 'HOSPITAL_ADMIN'
          ? (activeTab === 'resources' ? 'Hospital Command Center — Resources' : 'Hospital Command Center — SOS Queue')
          : 'System Admin Portal'
      }
      user={user}
      wsConnected={wsConnected}
      activeSubtab={activeTab}
      onSelectSubtab={switchTab}
    >
      {role === 'DOCTOR' && renderDoctorView()}
      {role === 'HOSPITAL_ADMIN' && renderHospitalAdminView()}
      {role === 'AMBULANCE_DRIVER' && renderDriverView()}
      {(role === 'ADMIN' || role === 'SYSTEM_ADMIN') && renderAdminView()}

      {/* Doctor Assessment Modal */}
      <DoctorAssessmentModal
        isOpen={isAssessmentModalOpen}
        onClose={closeAssessmentModal}
        assessment={selectedAssessment}
        emergency={selectedAssessment?.emergency || emergencies.find(e => e.id === selectedAssessment?.emergencyId) || selectedEmergency}
        onSubmit={submitAssessment}
        onStart={startAssessment}
        doctorId={user?.doctorId || user?.id}
      />

      {/* Patient Details Modal */}
      {isPatientDetailsModalOpen && patientDetailsEmergencyId && (
        <div className="modal-backdrop modal-overlay" onClick={closePatientDetailsModal} style={{ zIndex: 10000 }}>
          <div className="modal-card modal-content" style={{ maxWidth: '900px', width: '92%', maxHeight: '88vh', overflow: 'auto', zIndex: 10001 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--color-gray-200)' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-gray-900)' }}>
                Patient Clinical Profile - Emergency SOS-{patientDetailsEmergencyId}
              </h3>
              <button onClick={closePatientDetailsModal} className="btn btn-ghost" style={{ padding: '4px 8px' }} data-testid="close-patient-details-btn">✕ Close</button>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <EmergencyDetails emergencyId={patientDetailsEmergencyId} revision={revision} />
            </div>
          </div>
        </div>
      )}

      {/* Resolve Emergency Confirmation Modal */}
      {isResolveModalOpen && resolvingEmergencyId && (
        <div className="modal-backdrop modal-overlay" onClick={() => !isResolving && setIsResolveModalOpen(false)} style={{ zIndex: 10000 }}>
          <div className="modal-card modal-content" style={{ maxWidth: '520px', width: '92%', zIndex: 10001 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ background: 'var(--color-success-bg)', borderBottom: '1px solid rgba(16, 185, 129, 0.2)', padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '24px' }}>🏁</span>
                <h3 className="modal-title" style={{ color: 'var(--color-success)', margin: 0, fontSize: '18px', fontWeight: 800 }}>
                  Resolve Emergency SOS-{resolvingEmergencyId}
                </h3>
              </div>
              <button
                onClick={() => !isResolving && setIsResolveModalOpen(false)}
                className="btn btn-ghost btn-sm"
                disabled={isResolving}
                style={{ padding: '4px 8px' }}
              >
                ✕
              </button>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <p style={{ fontSize: '14px', color: 'var(--color-gray-800)', lineHeight: 1.5, margin: 0, fontWeight: 600 }}>
                Are you sure you want to mark this emergency as <strong>RESOLVED</strong>?
              </p>
              <div style={{ marginTop: '12px', padding: '12px', background: 'var(--color-gray-50)', border: '1px solid var(--color-gray-200)', borderRadius: 'var(--radius-md)', fontSize: '12px', color: 'var(--color-gray-600)', lineHeight: 1.4 }}>
                This clinical action will record the emergency as <strong>RESOLVED</strong> in MySQL, release assigned hospital beds and doctor duty capacity, finalize the workflow timeline, and notify the family and command center.
              </div>
              {resolveError && (
                <div style={{ marginTop: '12px', padding: '10px 14px', background: 'var(--color-critical-bg)', border: '1px solid var(--color-critical-border)', color: 'var(--color-critical)', borderRadius: 'var(--radius-md)', fontSize: '12px', fontWeight: 700 }}>
                  ⚠️ {resolveError}
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ padding: '14px 20px', borderTop: '1px solid var(--color-gray-200)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setIsResolveModalOpen(false)}
                className="btn btn-secondary"
                disabled={isResolving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmResolveCase}
                className="btn btn-success"
                style={{ fontWeight: 800 }}
                disabled={isResolving}
                data-testid="confirm-resolve-btn"
              >
                {isResolving ? 'Resolving...' : '✓ Confirm & Resolve Emergency'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

const HealthcareDashboardWithRouter = (props) => {
  const [searchParams, setSearchParams] = useSearchParams();
  return <HealthcareDashboardInner {...props} searchParams={searchParams} setSearchParams={setSearchParams} />;
};

const HealthcareDashboardWithoutRouter = (props) => {
  const [params, setParamsState] = useState(
    () => new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
  );
  const setSearchParams = (next) => {
    setParamsState(new URLSearchParams(next));
  };
  return <HealthcareDashboardInner {...props} searchParams={params} setSearchParams={setSearchParams} />;
};

const HealthcareDashboard = (props) => {
  const inRouter = useInRouterContext();
  if (inRouter) {
    return <HealthcareDashboardWithRouter {...props} />;
  }
  return <HealthcareDashboardWithoutRouter {...props} />;
};

export default HealthcareDashboard;
