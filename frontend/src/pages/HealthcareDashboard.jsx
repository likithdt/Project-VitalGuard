import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import API, { isActiveEmergency, useApiResource } from '../services/api';
import { useRealtimeRefresh } from '../services/websocket';
import DashboardLayout from '../components/DashboardLayout';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import EmergencyTimeline from '../components/EmergencyTimeline';
import EmergencyAlert from '../components/EmergencyAlert';
import GoogleMapTracking from '../components/GoogleMapTracking';
import EmergencyDetails from '../components/EmergencyDetails';
import { EmptyState } from '../components/StateComponents';

/**
 * HealthcareDashboard - Sections 6, 7, 8, 9, 10, 11, 12, 13
 * Unified command center for HOSPITAL_ADMIN, DOCTOR, AMBULANCE_DRIVER, and SYSTEM_ADMIN.
 */

const HealthcareDashboard = () => {
  const { user } = useAuth();
  const role = user?.role || 'HOSPITAL_ADMIN';

  // Subtabs state
  const [activeTab, setActiveTab] = useState('');

  // Hospital, Doctor, Driver database states
  const [hospitals, setHospitals] = useState([]);
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [ambulances, setAmbulances] = useState([]);
  const [selectedEmergencyId, setSelectedEmergencyId] = useState(null);
  const [selectedPatientUid, setSelectedPatientUid] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [currentJob, setCurrentJob] = useState(null);
  const [isDriverAvailable, setIsDriverAvailable] = useState(true);
  const [driverNotification, setDriverNotification] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isSimulatingGps, setIsSimulatingGps] = useState(false);
  const gpsIntervalRef = useRef(null);

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

  // Set default tabs based on role
  useEffect(() => {
    if (role === 'DOCTOR') setActiveTab('cases');
    else if (role === 'HOSPITAL_ADMIN') setActiveTab('queue');
    else if (role === 'AMBULANCE_DRIVER') setActiveTab('requests');
    else if (role === 'ADMIN' || role === 'SYSTEM_ADMIN') setActiveTab('hospitals');
  }, [role]);

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
    try {
      const jobRes = await API.get('/ambulance/current-job');
      if (jobRes.data && jobRes.data.ambulance) {
        setCurrentJob(jobRes.data);
      }
      const reqRes = await API.get('/ambulance/pending-requests');
      setPendingRequests(Array.isArray(reqRes.data) ? reqRes.data : []);
    } catch {
      // Driver data standby
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadHospitals();
      loadDoctors();
      loadAmbulances();
      if (role === 'AMBULANCE_DRIVER') {
        loadDriverData();
      }
    }
  }, [user, role, loadDriverData]);

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

  const resolveCase = async (id) => {
    try {
      await API.post(`/emergencies/${id}/resolve`);
      setSelectedEmergency(null);
      refresh();
      loadAmbulances();
      if (selectedHospital) loadHospitalDetails(selectedHospital.name);
    } catch {
      alert('Failed to resolve emergency.');
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

  const updateAmbulanceStatus = async (status) => {
    try {
      setIsUpdatingStatus(true);
      await API.post('/ambulance/status', { status });
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

  // ==========================================================================
  // 1. HOSPITAL ADMIN VIEW (Sections 6, 7, 8, 9)
  // ==========================================================================
  const renderHospitalAdminView = () => {
    const criticalEmergencies = emergencies.filter(e => e.severity === 'CRITICAL' && e.status !== 'RESOLVED');
    const incomingPending = emergencies.filter(e => e.status === 'HOSPITAL_ASSIGNED');

    return (
      <div>
        {/* Section 6: Header */}
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--color-gray-900)' }}>
            Hospital Overview
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
            role="hospital"
          />
        ))}

        {/* Navigation Tabs for Hospital Admin */}
        <div style={{
          display: 'flex',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-5)',
          borderBottom: '1px solid var(--color-gray-200)',
          paddingBottom: 'var(--space-3)'
        }}>
          <button
            onClick={() => setActiveTab('queue')}
            className={`btn ${activeTab === 'queue' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          >
            <span>🚑</span>
            <span>Emergency SOS Queue ({activeEmergencies.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('resources')}
            className={`btn ${activeTab === 'resources' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          >
            <span>🏥</span>
            <span>Beds & Staff Allocation</span>
          </button>
        </div>

        {/* Emergency Queue & Details Split View - Section 8 */}
        {activeTab === 'queue' && (
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
                          <span>Ambulance: <strong style={{ color: eq.ambulanceStatus && eq.ambulanceStatus !== 'STANDBY' ? 'var(--color-teal)' : 'inherit' }}>{eq.ambulanceStatus ? eq.ambulanceStatus.replace(/_/g, ' ') : (eq.requiresAmbulance ? 'Requested' : 'Not required')}</strong></span>
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

                    <div style={{ display: 'flex', gap: '8px' }}>
                      {/* Section 9: Accept Flow */}
                      {selectedEmergency.status === 'HOSPITAL_ASSIGNED' ? (
                        <button
                          onClick={() => acceptCase(selectedEmergency.id)}
                          className="btn btn-critical btn-sm"
                          style={{ fontWeight: 800 }}
                        >
                          ✓ ACCEPT EMERGENCY
                        </button>
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
      (user?.doctorId && e.doctorId === user.doctorId) ||
      (user?.id && e.doctorId === user.id) ||
      (user?.fullName && e.doctorName === user.fullName)
    );
    const activeDoctorIncident = selectedEmergency || assignedEmergencies[0] || null;

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
        </div>

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
                            setSelectedEmergency(eq);
                          }}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '2px 8px', fontSize: '10px' }}
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

                  <button
                    onClick={() => resolveCase(activeDoctorIncident.id)}
                    className="btn btn-success btn-sm"
                    style={{ fontWeight: 800 }}
                  >
                    🏁 RESOLVE EMERGENCY
                  </button>
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

    // Sequence of progression stages
    const progressionStages = [
      { key: 'EN_ROUTE_TO_PATIENT', label: '🚑 En Route to Patient', next: 'ARRIVED_AT_PATIENT' },
      { key: 'ARRIVED_AT_PATIENT', label: '📍 Arrived at Patient', next: 'PATIENT_PICKED_UP' },
      { key: 'PATIENT_PICKED_UP', label: '👤 Patient Picked Up', next: 'EN_ROUTE_TO_HOSPITAL' },
      { key: 'EN_ROUTE_TO_HOSPITAL', label: '🏥 En Route to Hospital', next: 'ARRIVED_AT_HOSPITAL' },
      { key: 'ARRIVED_AT_HOSPITAL', label: '✅ Arrived at Hospital', next: 'COMPLETED' },
      { key: 'COMPLETED', label: '🏁 Complete Dispatch', next: 'AVAILABLE' }
    ];

    return (
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        {/* Driver Console Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-5)'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '24px' }}>🚑</span>
              <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--color-gray-900)', margin: 0 }}>
                Ambulance Dispatch Console
              </h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-teal)' }}>
                Unit: {unitIdentifier}
              </span>
              <span>•</span>
              <span style={{ fontSize: '13px', color: 'var(--color-gray-600)' }}>
                Driver: <strong>{user?.fullName || 'Active Operator'}</strong>
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
              <span>{wsConnected ? 'DISPATCH BROKER CONNECTED' : 'RECONNECTING TELEMETRY...'}</span>
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

        {/* Section 12: Incoming Dispatch Requests */}
        {pendingRequests.length > 0 && (
          <div style={{ marginBottom: 'var(--space-6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-3)' }}>
              <span style={{ fontSize: '18px' }}>⚡</span>
              <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 800, color: 'var(--color-critical)', margin: 0 }}>
                INCOMING DISPATCH REQUESTS ({pendingRequests.length})
              </h3>
            </div>

            {pendingRequests.map(req => {
              const isLoading = actionLoadingId === req.id;
              return (
                <div
                  key={req.id}
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
                      <span>DISPATCH REQUEST: SOS-{req.emergencyId || req.id}</span>
                      <StatusBadge status={req.severity || 'CRITICAL'} size="sm" />
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
                        {req.requestedAt ? new Date(req.requestedAt).toLocaleTimeString() : 'Just now'}
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
                      <div className="incoming-alert-item-label">Patient Profile</div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--color-gray-900)' }}>
                        {req.patientName || 'Emergency Patient'}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-gray-600)', marginTop: '2px' }}>
                        {req.patientAge ? `${req.patientAge} yrs • ` : ''}
                        Blood: <strong>{req.patientBloodGroup || 'O+'}</strong>
                      </div>
                      {req.patientPhone && (
                        <div style={{ fontSize: '12px', color: 'var(--color-primary)', marginTop: '2px' }}>
                          📞 {req.patientPhone}
                        </div>
                      )}
                    </div>

                    {/* Patient Pickup Location */}
                    <div>
                      <div className="incoming-alert-item-label">Pickup Location</div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-gray-800)' }}>
                        📍 {req.pickupLat?.toFixed(4)}, {req.pickupLng?.toFixed(4)}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-gray-600)', marginTop: '2px', lineHeight: 1.4 }}>
                        {req.patientAddress || 'Current patient GPS telemetry coordinate'}
                      </div>
                    </div>

                    {/* Assigned Destination Hospital */}
                    <div>
                      <div className="incoming-alert-item-label">Assigned Hospital</div>
                      <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--color-teal)' }}>
                        🏥 {req.destinationHospital || req.hospitalName || 'City General Hospital'}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-gray-500)', marginTop: '2px' }}>
                        Trauma & Emergency Care Unit
                      </div>
                    </div>

                    {/* Response Metrics */}
                    <div>
                      <div className="incoming-alert-item-label">Response Metrics</div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--color-primary)' }}>
                        📏 {req.distanceKm || 2.4} km
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-teal)', marginTop: '2px' }}>
                        ⏱️ ~{req.etaMinutes || 6} min response time
                      </div>
                    </div>
                  </div>

                  {/* Symptoms & Clinical Notes */}
                  {req.symptoms && (
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
                      {(Array.isArray(req.symptoms) ? req.symptoms : [req.symptoms]).map((s, idx) => (
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
                    </div>
                  )}

                  {/* Action Buttons: Clearly visible Accept & Decline actions */}
                  <div style={{
                    display: 'flex',
                    gap: 'var(--space-3)',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    borderTop: '1px solid rgba(220, 38, 38, 0.15)',
                    paddingTop: 'var(--space-4)',
                    flexWrap: 'wrap'
                  }}>
                    {/* Decline Action */}
                    <button
                      type="button"
                      onClick={() => declineDriverRequest(req.id)}
                      disabled={isLoading}
                      className="btn-dispatch-decline"
                      aria-label="Decline Request"
                    >
                      <span aria-hidden="true">✕</span>
                      <span>{isLoading ? 'Processing...' : 'DECLINE REQUEST'}</span>
                    </button>

                    {/* Accept Action */}
                    <button
                      type="button"
                      onClick={() => acceptDriverRequest(req.id)}
                      disabled={isLoading}
                      className="btn-dispatch-accept"
                      aria-label="Accept Dispatch"
                    >
                      {isLoading ? (
                        <span className="status-spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                      ) : (
                        <span aria-hidden="true">✓</span>
                      )}
                      <span>{isLoading ? 'Accepting...' : 'ACCEPT DISPATCH'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 900, fontSize: '16px', color: '#0B1F3A' }}>
                      ACTIVE EMERGENCY DISPATCH: SOS-{activeEmergency.id}
                    </span>
                    <StatusBadge status={activeEmergency.severity || 'CRITICAL'} size="sm" />
                    <StatusBadge status={activeEmergency.status} size="sm" />
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--color-gray-600)', marginTop: '3px' }}>
                    Patient: <strong>{activeEmergency.patientName || activeEmergency.patientUid}</strong> • Destination: <strong>{activeEmergency.hospitalName || 'City Emergency Dept'}</strong>
                  </div>
                </div>
              </div>

              {/* GPS Simulation Toggle */}
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

            {/* Interactive Live Tracking Map with Leaflet OpenStreetMap tiles */}
            <GoogleMapTracking
              patientLocation={[activeEmergency.latitude, activeEmergency.longitude]}
              hospitalLocation={activeEmergency.hospitalLat && activeEmergency.hospitalLng ? [activeEmergency.hospitalLat, activeEmergency.hospitalLng] : [12.9716, 77.5946]}
              ambulanceLocation={ambulanceLocation ? [ambulanceLocation.latitude, ambulanceLocation.longitude] : (currentAmbulance?.latitude ? [currentAmbulance.latitude, currentAmbulance.longitude] : [12.9650, 77.5850])}
              ambulanceStatus={currentStatus}
              ambulanceUnitId={unitIdentifier}
              driverName={user?.fullName || 'Active Operator'}
              emergencyId={activeEmergency.id}
              followAmbulance={true}
              height="460px"
            />

            {/* Step-by-Step Status Progression Action Bar */}
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
                  Click step to update status across hospital & patient monitors
                </span>
              </div>

              {/* Progression Buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
                {progressionStages.map((stage) => {
                  const isActive = currentStatus === stage.key;
                  return (
                    <button
                      key={stage.key}
                      type="button"
                      onClick={() => updateAmbulanceStatus(stage.key)}
                      disabled={isUpdatingStatus}
                      className={`btn btn-sm ${isActive ? 'btn-teal' : 'btn-secondary'}`}
                      style={{
                        padding: '10px 8px',
                        fontSize: '12px',
                        fontWeight: isActive ? 800 : 600,
                        border: isActive ? '2px solid var(--color-teal, #0D9488)' : '1px solid var(--color-gray-200)',
                        background: isActive ? 'var(--color-teal-bg, #F0FDFA)' : 'white',
                        color: isActive ? 'var(--color-teal, #0D9488)' : 'var(--color-gray-700)',
                        boxShadow: isActive ? '0 0 10px rgba(13, 148, 136, 0.25)' : 'none',
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

        {/* Tab Switcher */}
        <div style={{
          display: 'flex',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-5)',
          borderBottom: '1px solid var(--color-gray-200)',
          paddingBottom: 'var(--space-3)'
        }}>
          <button
            onClick={() => setActiveTab('hospitals')}
            className={`btn ${activeTab === 'hospitals' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          >
            Hospitals ({hospitals.length})
          </button>
          <button
            onClick={() => setActiveTab('doctors')}
            className={`btn ${activeTab === 'doctors' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          >
            Doctors ({doctors.length})
          </button>
          <button
            onClick={() => setActiveTab('ambulances')}
            className={`btn ${activeTab === 'ambulances' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          >
            Ambulances ({ambulances.length})
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`btn ${activeTab === 'logs' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          >
            SOS Logs ({emergencies.length})
          </button>
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
          ? 'Doctor Portal'
          : role === 'AMBULANCE_DRIVER'
          ? 'Ambulance Console'
          : role === 'HOSPITAL_ADMIN'
          ? 'Hospital Command Center'
          : 'System Admin Portal'
      }
      user={user}
      wsConnected={wsConnected}
    >
      {role === 'DOCTOR' && renderDoctorView()}
      {role === 'HOSPITAL_ADMIN' && renderHospitalAdminView()}
      {role === 'AMBULANCE_DRIVER' && renderDriverView()}
      {(role === 'ADMIN' || role === 'SYSTEM_ADMIN') && renderAdminView()}
    </DashboardLayout>
  );
};

export default HealthcareDashboard;
