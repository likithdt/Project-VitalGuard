import React, { useState, useEffect, useCallback } from 'react';
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
      await API.post(`/ambulance/requests/${requestId}/accept`);
      loadDriverData();
      refresh();
    } catch (err) {
      alert('Failed to accept: ' + (err.response?.data?.error || err.message));
    }
  };

  const declineDriverRequest = async (requestId) => {
    try {
      await API.post(`/ambulance/requests/${requestId}/decline`);
      loadDriverData();
      refresh();
    } catch (err) {
      alert('Failed to decline request: ' + (err.response?.data?.error || err.message));
    }
  };

  const updateAmbulanceStatus = async (status) => {
    try {
      await API.post('/ambulance/status', { status });
      loadDriverData();
      refresh();
    } catch (err) {
      alert('Failed to update ambulance status: ' + (err.response?.data?.error || err.message));
    }
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
                          color: 'var(--color-gray-500)'
                        }}>
                          <span>Risk: <strong>{eq.riskScore || 0}/100</strong></span>
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

    return (
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>
        {/* Section 12: Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)'
        }}>
          <div>
            <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--color-gray-900)' }}>
              Ambulance Driver Console
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '2px' }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--color-primary)' }}>
                Unit: {user?.ambulanceUnitId || currentJob?.ambulance?.unitId || 'AMB-102'}
              </span>
              <span>•</span>
              <span style={{ fontSize: '13px', color: 'var(--color-gray-500)' }}>
                Driver: {user?.fullName || 'Active Operator'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-gray-600)' }}>
              UNIT STATUS:
            </span>
            <button
              onClick={() => setIsDriverAvailable(!isDriverAvailable)}
              className={`btn btn-sm ${isDriverAvailable ? 'btn-success' : 'btn-secondary'}`}
              style={{ fontWeight: 800 }}
            >
              {isDriverAvailable ? 'AVAILABLE' : 'BUSY'}
            </button>
          </div>
        </div>

        {/* Section 12: New Request Card Alert */}
        {pendingRequests.map(req => (
          <div
            key={req.id}
            className="incoming-alert-card"
            style={{ marginBottom: 'var(--space-5)' }}
          >
            <div className="incoming-alert-header">
              <div className="incoming-alert-title">
                <span>🚨</span>
                <span>NEW AMBULANCE REQUEST</span>
                <StatusBadge status="CRITICAL" size="sm" />
              </div>
              <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--color-critical)' }}>
                RISK: {req.riskScore != null ? req.riskScore : 'N/A'}/100
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
              <div>
                <div className="stat-card-label">Patient</div>
                <div style={{ fontSize: '14px', fontWeight: 800 }}>{req.patientName || 'Emergency Patient'}</div>
              </div>
              <div>
                <div className="stat-card-label">Pickup Location</div>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>{req.pickupLat?.toFixed(4)}, {req.pickupLng?.toFixed(4)}</div>
              </div>
              <div>
                <div className="stat-card-label">Destination Hospital</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-primary)' }}>{req.destinationHospital || 'City General Hospital'}</div>
              </div>
              <div>
                <div className="stat-card-label">Distance & ETA</div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-secondary)' }}>
                  {req.distanceKm || 3.2} km • ~{req.etaMinutes || 7} min
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', borderTop: '1px solid rgba(220, 38, 38, 0.15)', paddingTop: 'var(--space-3)' }}>
              <button
                onClick={() => declineDriverRequest(req.id)}
                className="btn btn-secondary btn-sm"
              >
                ✗ DECLINE
              </button>
              <button
                onClick={() => acceptDriverRequest(req.id)}
                className="btn btn-critical btn-sm"
                style={{ fontWeight: 800 }}
              >
                ✓ ACCEPT REQUEST
              </button>
            </div>
          </div>
        ))}

        {/* Section 13: Driver Live Map & Active Job */}
        {activeEmergency ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{
              background: 'var(--color-success-bg)',
              border: '1px solid var(--color-success-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>🚑</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--color-success)' }}>
                    ACTIVE RESPONSE: SOS-{activeEmergency.id}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-gray-600)' }}>
                    Patient: {activeEmergency.patientName || activeEmergency.patientUid} • Destination: {activeEmergency.hospitalName || 'City Hospital'}
                  </div>
                </div>
              </div>

              <StatusBadge status={activeEmergency.status} size="sm" />
            </div>

            {/* Large Section 13 Google Map */}
            <GoogleMapTracking
              patientLocation={[activeEmergency.latitude, activeEmergency.longitude]}
              hospitalLocation={activeEmergency.hospitalLat && activeEmergency.hospitalLng ? [activeEmergency.hospitalLat, activeEmergency.hospitalLng] : [12.9716, 77.5946]}
              ambulanceLocation={ambulanceLocation ? [ambulanceLocation.latitude, ambulanceLocation.longitude] : [12.9650, 77.5850]}
              ambulanceStatus={activeEmergency.status}
              ambulanceUnitId={user?.ambulanceUnitId || currentJob?.ambulance?.unitId || 'AMB-102'}
              driverName={user?.fullName || 'Operator'}
              emergencyId={activeEmergency.id}
              followAmbulance={true}
              height="450px"
            />

            {/* Quick Action Navigation Buttons for Driver */}
            <div className="card" style={{ padding: 'var(--space-4)' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--color-gray-500)', textTransform: 'uppercase', marginBottom: '10px' }}>
                Progression Actions
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                <button
                  onClick={() => updateAmbulanceStatus('EN_ROUTE_TO_PATIENT')}
                  className="btn btn-secondary btn-sm"
                  style={{ flex: 1, minWidth: '130px' }}
                >
                  🚑 En Route to Patient
                </button>
                <button
                  onClick={() => updateAmbulanceStatus('ARRIVED_AT_PATIENT')}
                  className="btn btn-secondary btn-sm"
                  style={{ flex: 1, minWidth: '130px' }}
                >
                  📍 Arrived at Patient
                </button>
                <button
                  onClick={() => updateAmbulanceStatus('PATIENT_PICKED_UP')}
                  className="btn btn-secondary btn-sm"
                  style={{ flex: 1, minWidth: '130px' }}
                >
                  👤 Patient Picked Up
                </button>
                <button
                  onClick={() => updateAmbulanceStatus('EN_ROUTE_TO_HOSPITAL')}
                  className="btn btn-secondary btn-sm"
                  style={{ flex: 1, minWidth: '130px' }}
                >
                  🏥 En Route to Hospital
                </button>
                <button
                  onClick={() => updateAmbulanceStatus('ARRIVED_AT_HOSPITAL')}
                  className="btn btn-success btn-sm"
                  style={{ flex: 1, minWidth: '130px', fontWeight: 800 }}
                >
                  ✅ Arrived at Hospital
                </button>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState
            icon="🚑"
            title="No Active Emergency Dispatches"
            message="Your ambulance unit is in service and waiting for emergency requests."
          />
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
