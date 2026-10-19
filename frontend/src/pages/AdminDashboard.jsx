import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../services/api';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import StatusBadge from '../components/StatusBadge';
import { useRealtimeRefresh } from '../services/websocket';
import GoogleMapTracking from '../components/GoogleMapTracking';
import CancelEmergencyModal from '../components/CancelEmergencyModal';

export default function AdminDashboard({ defaultTab }) {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Navigation tabs: overview, doctors, hospital-admins, drivers, hospitals, ambulances, emergencies, users, audit-logs
  const tabParam = defaultTab || searchParams.get('tab') || 'overview';
  const [activeTab, setActiveTab] = useState(tabParam);

  // Synchronize state with URL param
  useEffect(() => {
    const t = defaultTab || searchParams.get('tab') || 'overview';
    setActiveTab(t);
  }, [searchParams, defaultTab]);

  const handleTabChange = (t) => {
    setActiveTab(t);
    setSearchParams(t === 'overview' ? {} : { tab: t });
  };

  // State data
  const [stats, setStats] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [hospitalAdmins, setHospitalAdmins] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [ambulances, setAmbulances] = useState([]);
  const [users, setUsers] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [emergencies, setEmergencies] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [setupSuccessModal, setSetupSuccessModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null); // { message, type: 'success' | 'error' }
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);

  // Emergency Command Center & Live Telemetry States
  const [selectedEmergency, setSelectedEmergency] = useState(null);
  const [selectedEmergencyTimeline, setSelectedEmergencyTimeline] = useState([]);
  const [emergencyActionLoading, setEmergencyActionLoading] = useState(null); // 'resolve' | 'cancel' | 'dispatch'
  const [emergencySeverityFilter, setEmergencySeverityFilter] = useState('ALL');
  const [emergencyStatusFilter, setEmergencyStatusFilter] = useState('ALL');
  const [emergencySearchQuery, setEmergencySearchQuery] = useState('');
  const [newEmergencyAlert, setNewEmergencyAlert] = useState(null);
  const [isCancelEmergencyConfirmOpen, setIsCancelEmergencyConfirmOpen] = useState(false);
  const [emergencyToCancel, setEmergencyToCancel] = useState(null);
  const [cancelEmergencyError, setCancelEmergencyError] = useState(null);
  const [isHospitalOverrideModalOpen, setIsHospitalOverrideModalOpen] = useState(false);
  const previousEmergencyIdsRef = useRef(new Set());

  // Filter/Search states
  const [searchTerm, setSearchTerm] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('ALL');

  // Modals state
  const [activeModal, setActiveModal] = useState(null); // 'register-doctor', 'register-admin', 'register-driver', 'add-hospital', 'add-ambulance', 'view-item'
  const [modalItem, setModalItem] = useState(null);

  // Forms state
  const [doctorForm, setDoctorForm] = useState({
    name: '', email: '', phone: '', specialization: 'Cardiology', hospitalId: '', password: 'DoctorPass123!'
  });
  const [adminForm, setAdminForm] = useState({
    name: '', email: '', phone: '', hospitalId: '', password: 'AdminPass123!'
  });
  const [driverForm, setDriverForm] = useState({
    name: '', email: '', phone: '', ambulanceId: '', password: 'DriverPass123!'
  });
  const [hospitalForm, setHospitalForm] = useState({
    name: '', totalBeds: 100, availableBeds: 80, totalDoctors: 20, availableDoctors: 15, rating: 4.8, lat: 12.9716, lng: 77.5946
  });
  const [ambulanceForm, setAmbulanceForm] = useState({
    unitId: '', hospitalName: 'Apollo Hospital', latitude: 12.9252, longitude: 77.6011
  });

  const showNotification = (message, type = 'success') => {
    setFeedback({ message, type });
    setTimeout(() => setFeedback(null), 5000);
  };

  const fetchAllData = async () => {
    try {
      setLoading(true);
      const [
        statsRes,
        doctorsRes,
        adminsRes,
        driversRes,
        hospitalsRes,
        ambulancesRes,
        usersRes,
        pendingRes,
        emergenciesRes,
        auditLogsRes
      ] = await Promise.all([
        API.get('/admin/stats').catch(() => ({ data: {} })),
        API.get('/admin/doctors').catch(() => ({ data: [] })),
        API.get('/admin/hospital-admins').catch(() => ({ data: [] })),
        API.get('/admin/drivers').catch(() => ({ data: [] })),
        API.get('/admin/hospitals').catch(() => ({ data: [] })),
        API.get('/admin/ambulances').catch(() => ({ data: [] })),
        API.get('/admin/users').catch(() => ({ data: [] })),
        API.get('/admin/pending-approvals').catch(() => ({ data: [] })),
        API.get('/admin/emergencies/active').catch(() => ({ data: [] })),
        API.get('/admin/audit-logs').catch(() => ({ data: [] }))
      ]);

      setStats(statsRes.data);
      setDoctors(doctorsRes.data || []);
      setHospitalAdmins(adminsRes.data || []);
      setDrivers(driversRes.data || []);
      setHospitals(hospitalsRes.data || []);
      setAmbulances(ambulancesRes.data || []);
      setUsers(usersRes.data || []);
      setPendingApprovals(pendingRes.data || []);
      setEmergencies(emergenciesRes.data || []);
      setAuditLogs(auditLogsRes.data || []);

      // If hospitals exist and default hospitalId not set for forms, set to first hospital
      if (hospitalsRes.data && hospitalsRes.data.length > 0) {
        const firstHospId = hospitalsRes.data[0].id;
        setDoctorForm(prev => prev.hospitalId ? prev : { ...prev, hospitalId: firstHospId });
        setAdminForm(prev => prev.hospitalId ? prev : { ...prev, hospitalId: firstHospId });
      }
      if (ambulancesRes.data && ambulancesRes.data.length > 0) {
        setDriverForm(prev => prev.ambulanceId ? prev : { ...prev, ambulanceId: ambulancesRes.data[0].id });
      }
    } catch (err) {
      console.error('Failed to load admin portal data:', err);
      showNotification('Failed to load some admin data. Please ensure backend is active.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Real-time synchronization via WebSocket STOMP
  const {
    connected: wsConnected,
    revision,
    refresh: wsRefresh,
    lastEvent,
    ambulanceLocation,
    ambulanceLocationsMap
  } = useRealtimeRefresh(user?.uid, selectedEmergency?.id, null, user);

  // Synchronize emergencies and stats whenever revision changes or on mount
  useEffect(() => {
    fetchAllData();
  }, [revision]);

  // Deduplicate emergencies by ID and sort by severity (CRITICAL first) then recency
  const uniqueEmergencies = Array.from(
    new Map(emergencies.map(e => [e.id, e])).values()
  ).sort((a, b) => {
    const order = { CRITICAL: 4, HIGH: 3, MODERATE: 2, LOW: 1 };
    const diff = (order[b.severity] || 0) - (order[a.severity] || 0);
    if (diff !== 0) return diff;
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  // Filtered emergencies based on search and status/severity filters
  const filteredEmergencies = uniqueEmergencies.filter(e => {
    if (emergencySeverityFilter !== 'ALL' && e.severity !== emergencySeverityFilter) return false;
    if (emergencyStatusFilter !== 'ALL' && e.status !== emergencyStatusFilter) return false;
    if (emergencySearchQuery.trim()) {
      const q = emergencySearchQuery.toLowerCase();
      const matchId = String(e.id).includes(q);
      const matchName = (e.patientName || '').toLowerCase().includes(q);
      const matchUid = (e.patientUid || '').toLowerCase().includes(q);
      const matchSymptoms = (e.symptoms || '').toLowerCase().includes(q);
      const matchHospital = (e.hospital?.name || '').toLowerCase().includes(q);
      if (!matchId && !matchName && !matchUid && !matchSymptoms && !matchHospital) return false;
    }
    return true;
  });

  // Keep selected emergency up-to-date with live state
  useEffect(() => {
    if (uniqueEmergencies.length > 0) {
      if (selectedEmergency) {
        const updated = uniqueEmergencies.find(e => e.id === selectedEmergency.id);
        if (updated) {
          setSelectedEmergency(updated);
        } else {
          setSelectedEmergency(uniqueEmergencies[0]);
        }
      } else {
        setSelectedEmergency(uniqueEmergencies[0]);
      }
    } else {
      setSelectedEmergency(null);
    }
  }, [emergencies]);

  // Fetch timeline whenever selected emergency changes
  useEffect(() => {
    if (selectedEmergency?.id) {
      API.get(`/admin/emergencies/${selectedEmergency.id}/timeline`)
        .then(res => setSelectedEmergencyTimeline(Array.isArray(res.data) ? res.data : []))
        .catch(() => setSelectedEmergencyTimeline([]));
    } else {
      setSelectedEmergencyTimeline([]);
    }
  }, [selectedEmergency?.id, revision]);

  // Detect new incoming emergency from WebSocket event
  useEffect(() => {
    if (!lastEvent) return;
    const eventId = lastEvent.emergencyId || lastEvent.id || lastEvent.sosId;
    if (eventId && !previousEmergencyIdsRef.current.has(eventId)) {
      previousEmergencyIdsRef.current.add(eventId);
      setNewEmergencyAlert({
        id: eventId,
        patientUid: lastEvent.patientUid,
        patientName: lastEvent.patientName || `Patient (${lastEvent.patientUid || 'Emergency SOS'})`,
        severity: lastEvent.severity || 'CRITICAL',
        riskScore: lastEvent.riskScore || 90,
        status: lastEvent.status || 'DETECTED'
      });
    }
  }, [lastEvent]);

  // Emergency Administrative Actions
  const handleResolveEmergency = async (id) => {
    try {
      setEmergencyActionLoading('resolve');
      await API.post(`/emergencies/${id}/resolve`);
      showNotification(`✓ Emergency Incident SOS-${id} has been marked as RESOLVED across all dashboards.`, 'success');
      wsRefresh();
      fetchAllData();
    } catch (err) {
      showNotification('Failed to resolve emergency: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setEmergencyActionLoading(null);
    }
  };

  const handleConfirmCancelEmergency = async () => {
    if (!emergencyToCancel) return;
    try {
      setEmergencyActionLoading('cancel');
      setCancelEmergencyError(null);
      await API.post(`/emergency/${emergencyToCancel.id}/cancel`);
      showNotification(`✓ Emergency Incident SOS-${emergencyToCancel.id} CANCELLED. Response units & beds released.`, 'success');
      setIsCancelEmergencyConfirmOpen(false);
      setEmergencyToCancel(null);
      wsRefresh();
      fetchAllData();
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Failed to cancel emergency';
      setCancelEmergencyError(errMsg);
      showNotification('Failed to cancel emergency: ' + errMsg, 'error');
    } finally {
      setEmergencyActionLoading(null);
    }
  };

  const handleDispatchAmbulance = async (id) => {
    try {
      setEmergencyActionLoading('dispatch');
      await API.post(`/emergencies/${id}/dispatch`);
      showNotification(`✓ Manual ambulance dispatch initiated for SOS-${id}. Nearest driver notified.`, 'success');
      wsRefresh();
      fetchAllData();
    } catch (err) {
      showNotification('Failed to dispatch ambulance: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setEmergencyActionLoading(null);
    }
  };

  // Handlers for Doctor
  const handleRegisterDoctor = async (e) => {
    e.preventDefault();
    try {
      const res = await API.post('/admin/doctors', doctorForm);
      showNotification('✓ Registration successful: Doctor account created.');
      setActiveModal(null);
      if (res.data?.setupToken) {
        setSetupSuccessModal({
          name: doctorForm.name,
          role: 'DOCTOR',
          email: doctorForm.email,
          setupUrl: `${window.location.origin}/setup-password?token=${res.data.setupToken}`
        });
      }
      setDoctorForm({ name: '', email: '', phone: '', specialization: 'Cardiology', hospitalId: hospitals[0]?.id || '', password: '' });
      fetchAllData();
    } catch (err) {
      showNotification(err.response?.data?.error || 'Failed to register doctor.', 'error');
    }
  };

  const handleUpdateDoctorStatus = async (docId, newStatus) => {
    try {
      await API.patch(`/admin/doctors/${docId}/status`, { status: newStatus });
      showNotification(`Doctor status updated to ${newStatus}.`);
      fetchAllData();
    } catch (err) {
      showNotification(err.response?.data?.error || 'Failed to update status.', 'error');
    }
  };

  // Handlers for Hospital Admin
  const handleRegisterHospitalAdmin = async (e) => {
    e.preventDefault();
    try {
      const res = await API.post('/admin/hospital-admins', adminForm);
      showNotification('✓ Registration successful: Hospital Admin account created.');
      setActiveModal(null);
      if (res.data?.setupToken) {
        setSetupSuccessModal({
          name: adminForm.name,
          role: 'HOSPITAL_ADMIN',
          email: adminForm.email,
          setupUrl: `${window.location.origin}/setup-password?token=${res.data.setupToken}`
        });
      }
      setAdminForm({ name: '', email: '', phone: '', hospitalId: hospitals[0]?.id || '', password: '' });
      fetchAllData();
    } catch (err) {
      showNotification(err.response?.data?.error || 'Failed to register hospital admin.', 'error');
    }
  };

  const handleUpdateAdminStatus = async (userId, newStatus) => {
    try {
      await API.patch(`/admin/hospital-admins/${userId}/status`, { status: newStatus });
      showNotification(`Hospital Admin status updated to ${newStatus}.`);
      fetchAllData();
    } catch (err) {
      showNotification(err.response?.data?.error || 'Failed to update status.', 'error');
    }
  };

  // Handlers for Ambulance Driver
  const handleRegisterDriver = async (e) => {
    e.preventDefault();
    try {
      const res = await API.post('/admin/drivers', driverForm);
      showNotification('✓ Registration successful: Ambulance Driver account created.');
      setActiveModal(null);
      if (res.data?.setupToken) {
        setSetupSuccessModal({
          name: driverForm.name,
          role: 'AMBULANCE_DRIVER',
          email: driverForm.email,
          setupUrl: `${window.location.origin}/setup-password?token=${res.data.setupToken}`
        });
      }
      setDriverForm({ name: '', email: '', phone: '', ambulanceId: ambulances[0]?.id || '', password: '' });
      fetchAllData();
    } catch (err) {
      showNotification(err.response?.data?.error || 'Failed to register ambulance driver.', 'error');
    }
  };

  const handleUpdateDriverStatus = async (userId, newStatus) => {
    try {
      await API.patch(`/admin/drivers/${userId}/status`, { status: newStatus });
      showNotification(`Ambulance Driver status updated to ${newStatus}.`);
      fetchAllData();
    } catch (err) {
      showNotification(err.response?.data?.error || 'Failed to update status.', 'error');
    }
  };

  // Handlers for Hospital
  const handleAddHospital = async (e) => {
    e.preventDefault();
    try {
      await API.post('/admin/hospitals', hospitalForm);
      showNotification('✓ Hospital registered successfully with standard triage departments.');
      setActiveModal(null);
      setHospitalForm({ name: '', totalBeds: 100, availableBeds: 80, totalDoctors: 20, availableDoctors: 15, rating: 4.8, lat: 12.9716, lng: 77.5946 });
      fetchAllData();
    } catch (err) {
      showNotification(err.response?.data?.error || 'Failed to register hospital.', 'error');
    }
  };

  // Handlers for Ambulance
  const handleAddAmbulance = async (e) => {
    e.preventDefault();
    try {
      await API.post('/admin/ambulances', ambulanceForm);
      showNotification('✓ Ambulance registered successfully into active emergency fleet.');
      setActiveModal(null);
      setAmbulanceForm({ unitId: '', hospitalName: hospitals[0]?.name || 'City Central Hospital', latitude: 12.9252, longitude: 77.6011 });
      fetchAllData();
    } catch (err) {
      showNotification(err.response?.data?.error || 'Failed to register ambulance.', 'error');
    }
  };

  // Handlers for User status
  const handleUpdateUserStatus = async (userId, newStatus) => {
    try {
      await API.patch(`/admin/users/${userId}/status`, { status: newStatus });
      showNotification(`User account status set to ${newStatus}.`);
      fetchAllData();
    } catch (err) {
      showNotification(err.response?.data?.error || 'Failed to update status.', 'error');
    }
  };

  // Approve / Reject pending registration requests
  const handleApproveUser = async (userId) => {
    try {
      await API.post(`/admin/users/${userId}/approve`);
      showNotification('✓ Account approved & activated.');
      fetchAllData();
    } catch (err) {
      showNotification(err.response?.data?.error || 'Approval failed.', 'error');
    }
  };

  const handleRejectUser = async (userId) => {
    try {
      await API.post(`/admin/users/${userId}/reject`);
      showNotification('Account registration request has been rejected.');
      fetchAllData();
    } catch (err) {
      showNotification(err.response?.data?.error || 'Rejection failed.', 'error');
    }
  };

  return (
    <div className="app-shell">
      <div className="dashboard-layout">
        {/* Mobile backdrop */}
        <div
          className={`sidebar-overlay ${isSidebarOpenMobile ? 'open' : ''}`}
          onClick={() => setIsSidebarOpenMobile(false)}
          aria-hidden="true"
        />

        <Sidebar
          isOpenMobile={isSidebarOpenMobile}
          onCloseMobile={() => setIsSidebarOpenMobile(false)}
        />
        <div className="dashboard-main">
          <Topbar
            title="System Administration Portal"
            user={user}
            onMenuToggle={() => setIsSidebarOpenMobile(!isSidebarOpenMobile)}
          />

          <main className="dashboard-content">
          
          {/* Notification Alert Toast */}
          {feedback && (
            <div 
              className={`alert ${feedback.type === 'error' ? 'alert-critical' : 'alert-low'}`} 
              style={{ marginBottom: 'var(--space-5)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '18px' }}>{feedback.type === 'error' ? '⚠️' : '✅'}</span>
                <span style={{ fontWeight: 700 }}>{feedback.message}</span>
              </div>
              <button 
                onClick={() => setFeedback(null)} 
                className="btn btn-ghost btn-sm"
                style={{ fontSize: '14px', padding: '2px 8px' }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Portal Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-3)', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span className="badge badge-low" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  ROLE: SYSTEM_ADMIN
                </span>
                <span style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>
                  Platform ID: {user?.uid || 'SYS_01'}
                </span>
                <div style={{
                  background: wsConnected ? 'var(--color-success-bg, #ECFDF5)' : 'var(--color-warning-bg, #FFFBEB)',
                  border: `1px solid ${wsConnected ? 'var(--color-success-border, #A7F3D0)' : 'var(--color-warning-border, #FDE68A)'}`,
                  padding: '3px 10px',
                  borderRadius: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: wsConnected ? 'var(--color-success, #059669)' : 'var(--color-warning, #D97706)'
                }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: wsConnected ? '#10B981' : '#F59E0B' }} />
                  <span>{wsConnected ? 'LIVE COMMAND NETWORK SYNCHRONIZED' : 'RECONNECTING TELEMETRY...'}</span>
                </div>
              </div>
              <h1 style={{ fontSize: '24px', fontWeight: 900, color: 'var(--color-gray-900)', marginTop: '4px' }}>
                System Administration & Security Control
              </h1>
              <p style={{ color: 'var(--color-gray-500)', fontSize: '13px', marginTop: '2px' }}>
                Privileged user provisioning, hospital federation, and multi-tenant resource authorization
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { fetchAllData(); wsRefresh(); }} className="btn btn-secondary btn-sm" title="Refresh all registry data">
                🔄 Sync State
              </button>
              <button onClick={() => setActiveModal('register-doctor')} className="btn btn-primary btn-sm">
                + Register Doctor
              </button>
              <button onClick={() => setActiveModal('register-admin')} className="btn btn-primary btn-sm">
                + Register Hospital Admin
              </button>
              <button onClick={() => setActiveModal('register-driver')} className="btn btn-primary btn-sm">
                + Register Driver
              </button>
            </div>
          </div>

          {/* Top Metric Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 'var(--space-4)',
            marginBottom: 'var(--space-6)',
            width: '100%',
            maxWidth: '100%',
            minWidth: 0,
            boxSizing: 'border-box'
          }}>
            <div className="card" style={{ padding: 'var(--space-4)', borderLeft: '4px solid var(--color-primary)' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-gray-500)', textTransform: 'uppercase' }}>Total Users</div>
              <div style={{ fontSize: '26px', fontWeight: 900, color: 'var(--color-primary)', marginTop: '4px' }}>
                {stats?.totalUsers ?? '...'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-gray-500)', marginTop: '2px' }}>Registered accounts</div>
            </div>

            <div className="card" style={{ padding: 'var(--space-4)', borderLeft: '4px solid #0284c7' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-gray-500)', textTransform: 'uppercase' }}>Active Doctors</div>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#0284c7', marginTop: '4px' }}>
                {stats?.activeDoctors ?? '...'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-gray-500)', marginTop: '2px' }}>Verified physicians</div>
            </div>

            <div className="card" style={{ padding: 'var(--space-4)', borderLeft: '4px solid #10b981' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-gray-500)', textTransform: 'uppercase' }}>Hospitals</div>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#10b981', marginTop: '4px' }}>
                {stats?.hospitals ?? '...'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-gray-500)', marginTop: '2px' }}>Active hospital hubs</div>
            </div>

            <div className="card" style={{ padding: 'var(--space-4)', borderLeft: '4px solid #f59e0b' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-gray-500)', textTransform: 'uppercase' }}>Ambulances</div>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#f59e0b', marginTop: '4px' }}>
                {stats?.ambulances ?? '...'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-gray-500)', marginTop: '2px' }}>Active fleet units</div>
            </div>

            <div className="card" style={{ padding: 'var(--space-4)', borderLeft: '4px solid #8b5cf6' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-gray-500)', textTransform: 'uppercase' }}>Ambulance Drivers</div>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#8b5cf6', marginTop: '4px' }}>
                {stats?.ambulanceDrivers ?? '...'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-gray-500)', marginTop: '2px' }}>Assigned personnel</div>
            </div>

            <div className="card" style={{ padding: 'var(--space-4)', borderLeft: '4px solid #ef4444' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-gray-500)', textTransform: 'uppercase' }}>Active Emergencies</div>
              <div style={{ fontSize: '26px', fontWeight: 900, color: '#ef4444', marginTop: '4px' }}>
                {uniqueEmergencies.length}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-gray-500)', marginTop: '2px' }}>Live SOS dispatches</div>
            </div>
          </div>

          {/* Pending Approval / Registration Requests Banner */}
          {pendingApprovals && pendingApprovals.length > 0 && (
            <div className="card" style={{ marginBottom: 'var(--space-6)', border: '1px solid #f59e0b', backgroundColor: '#fffbeb', padding: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '20px' }}>⏳</span>
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#92400e' }}>
                      Pending Registration & Activation Requests ({pendingApprovals.length})
                    </h3>
                    <p style={{ fontSize: '12px', color: '#b45309' }}>
                      These privileged accounts require System Admin approval before they can authenticate into their dashboards.
                    </p>
                  </div>
                </div>
              </div>

              <div className="table-wrapper">
                <table className="data-table" style={{ background: 'white' }}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Requested Role</th>
                      <th>Association</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingApprovals.map(p => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 800 }}>{p.fullName || 'Unnamed User'}</td>
                        <td>{p.email}</td>
                        <td><StatusBadge status={p.role} size="sm" /></td>
                        <td>{p.hospitalId ? `Hospital #${p.hospitalId}` : p.ambulanceId ? `Ambulance #${p.ambulanceId}` : 'Platform'}</td>
                        <td><StatusBadge status="PENDING" size="sm" /></td>
                        <td style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => handleApproveUser(p.id)} className="btn btn-primary btn-sm" style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}>
                            ✓ APPROVE
                          </button>
                          <button onClick={() => handleRejectUser(p.id)} className="btn btn-secondary btn-sm" style={{ color: '#ef4444' }}>
                            ✕ REJECT
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Real-time Incoming Emergency Banner Alert */}
          {newEmergencyAlert && (
            <div className="alert alert-critical" style={{
              marginBottom: 'var(--space-5)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 20px',
              borderRadius: 'var(--radius-lg)',
              boxShadow: '0 4px 18px rgba(220, 38, 38, 0.15)',
              border: '2px solid var(--color-critical)',
              animation: 'fadeIn 0.2s ease-out'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '24px' }}>🚨</span>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <strong style={{ fontSize: '14px', color: '#991B1B' }}>
                      NEW EMERGENCY SOS DETECTED: SOS-{newEmergencyAlert.id}
                    </strong>
                    <StatusBadge status={newEmergencyAlert.severity} size="sm" />
                    <span style={{ fontSize: '12px', background: '#DC2626', color: 'white', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
                      Risk {newEmergencyAlert.riskScore}/100
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-gray-600)', marginTop: '2px' }}>
                    Patient: <strong>{newEmergencyAlert.patientName}</strong> ({newEmergencyAlert.patientUid}) • Status: <strong>{newEmergencyAlert.status}</strong>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={() => {
                    handleTabChange('emergencies');
                    const target = uniqueEmergencies.find(e => e.id === newEmergencyAlert.id);
                    if (target) setSelectedEmergency(target);
                    setNewEmergencyAlert(null);
                  }}
                  className="btn btn-critical btn-sm"
                  style={{ fontWeight: 800 }}
                >
                  Open Incident Command →
                </button>
                <button
                  onClick={() => setNewEmergencyAlert(null)}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: '16px', color: 'var(--color-gray-500)' }}
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Navigation Tabs */}
          <div className="admin-tabs-container">
            <div className="admin-tabs" role="tablist" aria-label="System Administration Sections">
              {[
                { id: 'overview', label: '📊 System Overview', count: null },
                { id: 'doctors', label: '👨‍⚕️ Doctors', count: doctors.length },
                { id: 'hospital-admins', label: '🏥 Hospital Admins', count: hospitalAdmins.length },
                { id: 'drivers', label: '🚑 Ambulance Drivers', count: drivers.length },
                { id: 'hospitals', label: '🏢 Hospitals', count: hospitals.length },
                { id: 'ambulances', label: '🚨 Ambulances', count: ambulances.length },
                { id: 'emergencies', label: '📡 System Emergencies', count: uniqueEmergencies.length },
                { id: 'users', label: '👥 User Accounts', count: users.length },
                { id: 'audit-logs', label: '📜 Audit Trail', count: auditLogs.length },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`btn btn-sm admin-tab-btn ${activeTab === tab.id ? 'btn-primary' : 'btn-ghost'}`}
                  style={{
                    fontWeight: activeTab === tab.id ? 800 : 600,
                    borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
                    padding: '8px 14px'
                  }}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                >
                  <span>{tab.label}</span>
                  {tab.count !== null && (
                    <span style={{
                      marginLeft: '6px',
                      padding: '2px 6px',
                      borderRadius: '10px',
                      fontSize: '10px',
                      backgroundColor: activeTab === tab.id ? 'rgba(255,255,255,0.25)' : 'var(--color-gray-200)',
                      color: activeTab === tab.id ? 'white' : 'var(--color-gray-700)'
                    }}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* TAB 1: OVERVIEW & PIPELINE ARCHITECTURE */}
          {/* ========================================================================= */}
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
              
              {/* Security and Approval Architecture Banner */}
              <div className="card" style={{ padding: 'var(--space-5)', background: 'linear-gradient(135deg, #0a2540 0%, #1e3a8a 100%)', color: 'white', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
                  <div style={{ maxWidth: '800px', minWidth: 0, flex: '1 1 300px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 800, marginBottom: '8px' }}>
                      🔒 MANDATORY BACKEND AUTHORIZATION
                    </div>
                    <h2 style={{ fontSize: '20px', fontWeight: 900, color: 'white', marginBottom: '8px' }}>
                      Strict Privileged Registration & Zero Public Privilege Escalation
                    </h2>
                    <p style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.6 }}>
                      In VitalGuard, privileged clinical and dispatch roles (<strong>DOCTOR</strong>, <strong>HOSPITAL_ADMIN</strong>, <strong>AMBULANCE_DRIVER</strong>, <strong>SYSTEM_ADMIN</strong>) are strictly forbidden from self-registering via the public portal. The backend verifies account activation before issuing sessions; unauthorized attempts to login receive: <em>"Your account has not been registered by the system administrator."</em>
                    </p>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.08)', padding: '12px 18px', borderRadius: 'var(--radius-lg)', textAlign: 'center', border: '1px solid rgba(255,255,255,0.15)', flexShrink: 0 }}>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#93c5fd', fontWeight: 800 }}>Account Status Gate</div>
                    <div style={{ fontSize: '18px', fontWeight: 900, color: '#34d399', marginTop: '4px' }}>ACTIVE REQUIRED</div>
                    <div style={{ fontSize: '10px', color: '#cbd5e1', marginTop: '4px' }}>PENDING / SUSPENDED = 403</div>
                  </div>
                </div>

                {/* Emergency Flow Diagram */}
                <div style={{ marginTop: 'var(--space-5)', paddingTop: 'var(--space-4)', borderTop: '1px solid rgba(255,255,255,0.15)', width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#93c5fd', marginBottom: '10px' }}>
                    Live Emergency System Pipeline
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    background: 'rgba(0,0,0,0.2)',
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-md)',
                    width: '100%',
                    maxWidth: '100%',
                    minWidth: 0,
                    boxSizing: 'border-box'
                  }}>
                    <div style={{ textAlign: 'center', flex: '1 1 110px', minWidth: '95px' }}>
                      <div style={{ fontSize: '18px' }}>👤</div>
                      <div style={{ fontSize: '12px', fontWeight: 800 }}>1. Patient</div>
                      <div style={{ fontSize: '10px', color: '#94a3b8' }}>Biometric SOS / Vitals</div>
                    </div>
                    <span style={{ color: '#38bdf8' }}>➔</span>
                    <div style={{ textAlign: 'center', flex: '1 1 110px', minWidth: '95px' }}>
                      <div style={{ fontSize: '18px' }}>🚨</div>
                      <div style={{ fontSize: '12px', fontWeight: 800 }}>2. Emergency Request</div>
                      <div style={{ fontSize: '10px', color: '#94a3b8' }}>AI Risk Triage</div>
                    </div>
                    <span style={{ color: '#38bdf8' }}>➔</span>
                    <div style={{ textAlign: 'center', flex: '1 1 110px', minWidth: '95px' }}>
                      <div style={{ fontSize: '18px' }}>🏢</div>
                      <div style={{ fontSize: '12px', fontWeight: 800 }}>3. Hospital Hub</div>
                      <div style={{ fontSize: '10px', color: '#94a3b8' }}>Beds & Dept Allocated</div>
                    </div>
                    <span style={{ color: '#38bdf8' }}>➔</span>
                    <div style={{ textAlign: 'center', flex: '1 1 110px', minWidth: '95px' }}>
                      <div style={{ fontSize: '18px' }}>👨‍⚕️</div>
                      <div style={{ fontSize: '12px', fontWeight: 800 }}>4. Specialist Doctor</div>
                      <div style={{ fontSize: '10px', color: '#94a3b8' }}>Duty Team Assigned</div>
                    </div>
                    <span style={{ color: '#38bdf8' }}>➔</span>
                    <div style={{ textAlign: 'center', flex: '1 1 110px', minWidth: '95px' }}>
                      <div style={{ fontSize: '18px' }}>🚑</div>
                      <div style={{ fontSize: '12px', fontWeight: 800 }}>5. Ambulance Unit</div>
                      <div style={{ fontSize: '10px', color: '#94a3b8' }}>GPS Route Tracking</div>
                    </div>
                    <span style={{ color: '#38bdf8' }}>➔</span>
                    <div style={{ textAlign: 'center', flex: '1 1 110px', minWidth: '95px' }}>
                      <div style={{ fontSize: '18px' }}>🏁</div>
                      <div style={{ fontSize: '12px', fontWeight: 800 }}>6. Driver Pickup</div>
                      <div style={{ fontSize: '10px', color: '#94a3b8' }}>Transit to Hospital</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Actions Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
                <div className="card" style={{ padding: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '24px' }}>👨‍⚕️</span>
                    <div>
                      <h3 style={{ fontSize: '15px', fontWeight: 800 }}>Doctor Management</h3>
                      <p style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>Register and assign specialist doctors</p>
                    </div>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--color-gray-600)', marginBottom: '14px', lineHeight: 1.5 }}>
                    Register verified physicians, assign them to affiliated hospitals, and activate/deactivate emergency response privileges.
                  </p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setActiveModal('register-doctor')} className="btn btn-primary btn-sm">
                      + Register Doctor
                    </button>
                    <button onClick={() => handleTabChange('doctors')} className="btn btn-secondary btn-sm">
                      View All ({doctors.length})
                    </button>
                  </div>
                </div>

                <div className="card" style={{ padding: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '24px' }}>🏥</span>
                    <div>
                      <h3 style={{ fontSize: '15px', fontWeight: 800 }}>Hospital Admins</h3>
                      <p style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>Federated Hospital Command</p>
                    </div>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--color-gray-600)', marginBottom: '14px', lineHeight: 1.5 }}>
                    Provision hospital staff administrators with strict data isolation to ensure they only view their hospital's emergencies.
                  </p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setActiveModal('register-admin')} className="btn btn-primary btn-sm">
                      + Register Admin
                    </button>
                    <button onClick={() => handleTabChange('hospital-admins')} className="btn btn-secondary btn-sm">
                      View All ({hospitalAdmins.length})
                    </button>
                  </div>
                </div>

                <div className="card" style={{ padding: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '24px' }}>🚑</span>
                    <div>
                      <h3 style={{ fontSize: '15px', fontWeight: 800 }}>Ambulance Drivers</h3>
                      <p style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>Emergency Fleet Dispatch</p>
                    </div>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--color-gray-600)', marginBottom: '14px', lineHeight: 1.5 }}>
                    Assign authorized drivers to ambulance units with live telemetry and GPS dispatch permissions.
                  </p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setActiveModal('register-driver')} className="btn btn-primary btn-sm">
                      + Register Driver
                    </button>
                    <button onClick={() => handleTabChange('drivers')} className="btn btn-secondary btn-sm">
                      View All ({drivers.length})
                    </button>
                  </div>
                </div>
              </div>

              {/* Active Emergency Highlights */}
              <div className="card">
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <h3 className="card-title">Live System Emergencies ({uniqueEmergencies.length})</h3>
                    {uniqueEmergencies.length > 0 && (
                      <span className="badge badge-critical" style={{ fontSize: '11px', animation: 'pulse 2s infinite' }}>
                        ● {uniqueEmergencies.filter(e => e.severity === 'CRITICAL').length} CRITICAL
                      </span>
                    )}
                  </div>
                  <button onClick={() => handleTabChange('emergencies')} className="btn btn-secondary btn-sm">
                    Open Incident Command Center →
                  </button>
                </div>
                <div className="card-content">
                  {uniqueEmergencies.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-gray-500)' }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>🛡️</div>
                      <div style={{ fontWeight: 700 }}>No Active Emergencies in the Network</div>
                      <div style={{ fontSize: '12px', marginTop: '4px' }}>All emergency queues and ambulance dispatches are clear. Telemetry synchronized.</div>
                    </div>
                  ) : (
                    <div className="table-wrapper">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>SOS ID</th>
                            <th>Patient</th>
                            <th>Hospital</th>
                            <th>Specialist Doctor</th>
                            <th>Ambulance</th>
                            <th>Severity</th>
                            <th>Status</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {uniqueEmergencies.slice(0, 5).map(e => (
                            <tr
                              key={e.id}
                              style={{ cursor: 'pointer' }}
                              onClick={() => {
                                setSelectedEmergency(e);
                                handleTabChange('emergencies');
                              }}
                            >
                              <td style={{ fontWeight: 800 }}>
                                <span style={{ color: e.severity === 'CRITICAL' ? '#DC2626' : 'inherit' }}>
                                  SOS-{e.id}
                                </span>
                              </td>
                              <td>
                                <strong>{e.patientName || e.patientUid}</strong>
                                <div style={{ fontSize: '11px', color: 'var(--color-gray-500)' }}>{e.symptoms || 'Cardiac alert'}</div>
                              </td>
                              <td>{e.hospital?.name || (e.hospitalId ? `Hospital #${e.hospitalId}` : 'Assigning...')}</td>
                              <td>{e.doctor?.name || 'Emergency Team'}</td>
                              <td>{e.ambulance?.unitId || (e.ambulanceId ? `Unit #${e.ambulanceId}` : 'Not required')}</td>
                              <td><StatusBadge status={e.severity} size="sm" /></td>
                              <td><StatusBadge status={e.status} size="sm" /></td>
                              <td>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  style={{ fontSize: '11px', padding: '3px 8px' }}
                                  onClick={(evt) => {
                                    evt.stopPropagation();
                                    setSelectedEmergency(e);
                                    handleTabChange('emergencies');
                                  }}
                                >
                                  Command ➔
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: DOCTOR MANAGEMENT */}
          {/* ========================================================================= */}
          {activeTab === 'doctors' && (
            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h3 className="card-title">Doctor Management & Authorization</h3>
                  <p style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>
                    Only verified physicians approved by System Admin are permitted to authenticate
                  </p>
                </div>
                <button onClick={() => setActiveModal('register-doctor')} className="btn btn-primary btn-sm">
                  + Register Doctor
                </button>
              </div>

              <div className="card-content">
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Doctor Name</th>
                        <th>Email / Account</th>
                        <th>Phone</th>
                        <th>Specialization</th>
                        <th>Hospital</th>
                        <th>Duty / Available</th>
                        <th>Account Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {doctors.map(d => (
                        <tr key={d.id}>
                          <td style={{ fontWeight: 800 }}>{d.name}</td>
                          <td>
                            <div>{d.email || 'doctor@vitaguard.com'}</div>
                            <div style={{ fontSize: '11px', color: 'var(--color-gray-500)' }}>UID: {d.userUid || 'Linked'}</div>
                          </td>
                          <td>{d.phone || '9880123456'}</td>
                          <td>
                            <span className="badge badge-low" style={{ fontSize: '11px' }}>{d.specialization}</span>
                          </td>
                          <td>{d.hospitalName || `Hospital #${d.hospitalId}`}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <StatusBadge status={d.onDuty ? 'ON' : 'OFF'} size="sm" />
                              <StatusBadge status={d.availableForEmergency ? 'FREE' : 'BUSY'} size="sm" />
                            </div>
                          </td>
                          <td>
                            <StatusBadge status={d.status || 'ACTIVE'} size="sm" />
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              <button 
                                onClick={() => { setModalItem(d); setActiveModal('view-doctor'); }}
                                className="btn btn-secondary btn-sm"
                                style={{ fontSize: '11px', padding: '3px 8px' }}
                              >
                                View
                              </button>
                              {d.status !== 'ACTIVE' ? (
                                <button 
                                  onClick={() => handleUpdateDoctorStatus(d.id, 'ACTIVE')}
                                  className="btn btn-primary btn-sm"
                                  style={{ fontSize: '11px', padding: '3px 8px', backgroundColor: '#10b981', borderColor: '#10b981' }}
                                >
                                  Activate
                                </button>
                              ) : (
                                <>
                                  <button 
                                    onClick={() => handleUpdateDoctorStatus(d.id, 'DEACTIVATED')}
                                    className="btn btn-secondary btn-sm"
                                    style={{ fontSize: '11px', padding: '3px 8px', color: '#f59e0b' }}
                                    title="Temporarily deactivate account"
                                  >
                                    Deactivate
                                  </button>
                                  <button 
                                    onClick={() => handleUpdateDoctorStatus(d.id, 'SUSPENDED')}
                                    className="btn btn-secondary btn-sm"
                                    style={{ fontSize: '11px', padding: '3px 8px', color: '#ef4444' }}
                                    title="Suspend account privileges"
                                  >
                                    Suspend
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: HOSPITAL ADMIN MANAGEMENT */}
          {/* ========================================================================= */}
          {activeTab === 'hospital-admins' && (
            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h3 className="card-title">Hospital Admin Management</h3>
                  <p style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>
                    Administrators have strictly isolated data visibility bounded to their assigned hospital
                  </p>
                </div>
                <button onClick={() => setActiveModal('register-admin')} className="btn btn-primary btn-sm">
                  + Register Hospital Admin
                </button>
              </div>

              <div className="card-content">
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Admin Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Assigned Hospital</th>
                        <th>Role</th>
                        <th>Account Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hospitalAdmins.map(admin => (
                        <tr key={admin.id}>
                          <td style={{ fontWeight: 800 }}>{admin.fullName}</td>
                          <td>{admin.email}</td>
                          <td>{admin.phone || 'Not recorded'}</td>
                          <td>
                            <strong>{admin.hospitalName || `Hospital #${admin.hospitalId}`}</strong>
                            {admin.hospitalBeds && <span style={{ fontSize: '11px', color: 'var(--color-gray-500)', display: 'block' }}>Capacity: {admin.hospitalBeds} beds</span>}
                          </td>
                          <td><StatusBadge status="HOSPITAL_ADMIN" size="sm" /></td>
                          <td><StatusBadge status={admin.status || 'ACTIVE'} size="sm" /></td>
                          <td>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {admin.status !== 'ACTIVE' ? (
                                <button 
                                  onClick={() => handleUpdateAdminStatus(admin.id, 'ACTIVE')}
                                  className="btn btn-primary btn-sm"
                                  style={{ fontSize: '11px', padding: '3px 8px', backgroundColor: '#10b981', borderColor: '#10b981' }}
                                >
                                  Activate
                                </button>
                              ) : (
                                <>
                                  <button 
                                    onClick={() => handleUpdateAdminStatus(admin.id, 'DEACTIVATED')}
                                    className="btn btn-secondary btn-sm"
                                    style={{ fontSize: '11px', padding: '3px 8px', color: '#f59e0b' }}
                                  >
                                    Deactivate
                                  </button>
                                  <button 
                                    onClick={() => handleUpdateAdminStatus(admin.id, 'SUSPENDED')}
                                    className="btn btn-secondary btn-sm"
                                    style={{ fontSize: '11px', padding: '3px 8px', color: '#ef4444' }}
                                  >
                                    Suspend
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 4: AMBULANCE DRIVER MANAGEMENT */}
          {/* ========================================================================= */}
          {activeTab === 'drivers' && (
            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h3 className="card-title">Ambulance Driver Management</h3>
                  <p style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>
                    Assigned drivers can only operate their linked ambulance unit
                  </p>
                </div>
                <button onClick={() => setActiveModal('register-driver')} className="btn btn-primary btn-sm">
                  + Register Driver
                </button>
              </div>

              <div className="card-content">
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Driver Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Assigned Ambulance</th>
                        <th>Station Affinity</th>
                        <th>Account Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drivers.map(d => (
                        <tr key={d.id}>
                          <td style={{ fontWeight: 800 }}>{d.fullName}</td>
                          <td>{d.email}</td>
                          <td>{d.phone || 'Not recorded'}</td>
                          <td>
                            <strong>{d.ambulanceUnitId || `Ambulance #${d.ambulanceId}`}</strong>
                            {d.ambulanceStatus && (
                              <span style={{ display: 'block', marginTop: '2px' }}>
                                <StatusBadge status={d.ambulanceStatus} size="sm" />
                              </span>
                            )}
                          </td>
                          <td>{d.ambulanceHospital || 'City Base Depot'}</td>
                          <td><StatusBadge status={d.status || 'ACTIVE'} size="sm" /></td>
                          <td>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {d.status !== 'ACTIVE' ? (
                                <button 
                                  onClick={() => handleUpdateDriverStatus(d.id, 'ACTIVE')}
                                  className="btn btn-primary btn-sm"
                                  style={{ fontSize: '11px', padding: '3px 8px', backgroundColor: '#10b981', borderColor: '#10b981' }}
                                >
                                  Activate
                                </button>
                              ) : (
                                <>
                                  <button 
                                    onClick={() => handleUpdateDriverStatus(d.id, 'DEACTIVATED')}
                                    className="btn btn-secondary btn-sm"
                                    style={{ fontSize: '11px', padding: '3px 8px', color: '#f59e0b' }}
                                  >
                                    Deactivate
                                  </button>
                                  <button 
                                    onClick={() => handleUpdateDriverStatus(d.id, 'SUSPENDED')}
                                    className="btn btn-secondary btn-sm"
                                    style={{ fontSize: '11px', padding: '3px 8px', color: '#ef4444' }}
                                  >
                                    Suspend
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 5: HOSPITALS */}
          {/* ========================================================================= */}
          {activeTab === 'hospitals' && (
            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h3 className="card-title">Hospital Infrastructure Federation</h3>
                  <p style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>
                    Manage certified hospital nodes, bed allocations, and affiliated teams
                  </p>
                </div>
                <button onClick={() => setActiveModal('add-hospital')} className="btn btn-primary btn-sm">
                  + Add Hospital
                </button>
              </div>

              <div className="card-content">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
                  {hospitals.map(h => (
                    <div key={h.id} className="card" style={{ padding: 'var(--space-4)', border: '1px solid var(--color-gray-200)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div>
                          <h4 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-gray-900)' }}>{h.name}</h4>
                          <div style={{ fontSize: '11px', color: 'var(--color-gray-500)', fontFamily: 'monospace' }}>
                            📍 Lat: {h.lat?.toFixed(4)}, Lng: {h.lng?.toFixed(4)}
                          </div>
                        </div>
                        <StatusBadge status="ACTIVE" size="sm" />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', margin: '12px 0', padding: '10px', background: 'var(--color-gray-50)', borderRadius: 'var(--radius-md)' }}>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--color-gray-500)' }}>Available Beds</div>
                          <div style={{ fontSize: '16px', fontWeight: 800, color: '#10b981' }}>{h.availableBeds} / {h.totalBeds}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--color-gray-500)' }}>Specialists</div>
                          <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-primary)' }}>{h.doctorsCount || h.totalDoctors}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--color-gray-500)' }}>Ambulance Fleet</div>
                          <div style={{ fontSize: '16px', fontWeight: 800, color: '#f59e0b' }}>{h.ambulancesCount || 1} units</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--color-gray-500)' }}>Hospital Rating</div>
                          <div style={{ fontSize: '16px', fontWeight: 800, color: '#eab308' }}>★ {h.rating || 4.8}</div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: h.activeEmergencies > 0 ? '#ef4444' : 'var(--color-gray-500)', fontWeight: 700 }}>
                          {h.activeEmergencies > 0 ? `🚨 ${h.activeEmergencies} Active Emergencies` : '✓ Normal Triage Load'}
                        </span>
                        <button 
                          onClick={() => { setModalItem(h); setActiveModal('view-hospital'); }}
                          className="btn btn-secondary btn-sm"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 6: AMBULANCES */}
          {/* ========================================================================= */}
          {activeTab === 'ambulances' && (
            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h3 className="card-title">Ambulance Fleet & Driver Linkage</h3>
                  <p style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>
                    Live status, current emergency assignment, and telemetry tracking
                  </p>
                </div>
                <button onClick={() => setActiveModal('add-ambulance')} className="btn btn-primary btn-sm">
                  + Register Ambulance
                </button>
              </div>

              <div className="card-content">
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Unit ID</th>
                        <th>Station Affinity</th>
                        <th>Assigned Driver</th>
                        <th>Fleet Status</th>
                        <th>Coordinates</th>
                        <th>Current Emergency</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ambulances.map(a => (
                        <tr key={a.id}>
                          <td style={{ fontWeight: 800, fontSize: '14px' }}>{a.unitId}</td>
                          <td>{a.hospitalName || 'City Central'}</td>
                          <td>
                            {a.driverName ? (
                              <div>
                                <strong>{a.driverName}</strong>
                                <div style={{ fontSize: '11px', color: 'var(--color-gray-500)' }}>{a.driverEmail}</div>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--color-gray-400)', fontStyle: 'italic' }}>Unassigned</span>
                            )}
                          </td>
                          <td><StatusBadge status={a.status || 'AVAILABLE'} size="sm" /></td>
                          <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                            {a.latitude?.toFixed(4)}, {a.longitude?.toFixed(4)}
                          </td>
                          <td>
                            {a.currentEmergencyId ? (
                              <span className="badge badge-critical" style={{ fontSize: '11px' }}>
                                🚨 SOS-{a.currentEmergencyId} ({a.currentEmergencySeverity || 'ACTIVE'})
                              </span>
                            ) : (
                              <span style={{ color: '#10b981', fontSize: '12px', fontWeight: 600 }}>✓ Available</span>
                            )}
                          </td>
                          <td>
                            <button 
                              onClick={() => { setModalItem(a); setActiveModal('view-ambulance'); }}
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '11px', padding: '3px 8px' }}
                            >
                              View / Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 7: EMERGENCIES SYSTEM OVERVIEW & INCIDENT COMMAND CENTER */}
          {/* ========================================================================= */}
          {activeTab === 'emergencies' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              
              {/* Incident Command Header & Telemetry Health */}
              <div className="card" style={{ padding: 'var(--space-4) var(--space-5)', background: 'linear-gradient(135deg, #0B1F3A 0%, #1e3a8a 100%)', color: 'white' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                  <div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.12)', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 800, marginBottom: '6px' }}>
                      <span style={{ color: wsConnected ? '#34d399' : '#f87171' }}>●</span>
                      <span>{wsConnected ? 'LIVE STOMP COMMAND NETWORK: SYNCHRONIZED' : 'RECONNECTING TELEMETRY STREAM...'}</span>
                    </div>
                    <h2 style={{ fontSize: '20px', fontWeight: 900, color: 'white', margin: 0 }}>
                      Global Incident Command Center & Real-Time Dispatch
                    </h2>
                    <p style={{ fontSize: '12px', color: '#cbd5e1', margin: '4px 0 0 0' }}>
                      Continuous bi-directional emergency telemetry synchronized across Patient, Admin, Hospital, and Ambulance units.
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 'var(--radius-md)', padding: '8px 14px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#93c5fd', fontWeight: 800 }}>Active Queue</div>
                      <div style={{ fontSize: '18px', fontWeight: 900, color: '#ffffff' }}>{uniqueEmergencies.length}</div>
                    </div>
                    <div style={{ background: 'rgba(220, 38, 38, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: 'var(--radius-md)', padding: '8px 14px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#fca5a5', fontWeight: 800 }}>Critical Alerts</div>
                      <div style={{ fontSize: '18px', fontWeight: 900, color: '#f87171' }}>{uniqueEmergencies.filter(e => e.severity === 'CRITICAL').length}</div>
                    </div>
                    <div style={{ background: 'rgba(13, 148, 136, 0.2)', border: '1px solid rgba(20, 184, 166, 0.4)', borderRadius: 'var(--radius-md)', padding: '8px 14px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#5eead4', fontWeight: 800 }}>Ambulances Active</div>
                      <div style={{ fontSize: '18px', fontWeight: 900, color: '#2dd4bf' }}>{uniqueEmergencies.filter(e => e.ambulanceId || e.ambulance?.unitId).length}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { wsRefresh(); fetchAllData(); }}
                      className="btn btn-secondary btn-sm"
                      style={{ background: 'rgba(255,255,255,0.15)', color: 'white', borderColor: 'rgba(255,255,255,0.3)', fontWeight: 700 }}
                      title="Force manual sync with backend"
                    >
                      🔄 Force Sync
                    </button>
                  </div>
                </div>
              </div>

              {/* Filters & Incident Search Bar */}
              <div className="card" style={{ padding: 'var(--space-3) var(--space-4)' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 260px' }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="🔍 Search by SOS ID, Patient name/UID, Symptoms, or Hospital..."
                      value={emergencySearchQuery}
                      onChange={e => setEmergencySearchQuery(e.target.value)}
                      style={{ fontSize: '13px' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-gray-600)' }}>Severity:</label>
                    <select
                      className="form-select"
                      value={emergencySeverityFilter}
                      onChange={e => setEmergencySeverityFilter(e.target.value)}
                      style={{ fontSize: '12px', padding: '6px 10px', minWidth: '120px' }}
                    >
                      <option value="ALL">All Severities</option>
                      <option value="CRITICAL">🚨 CRITICAL Only</option>
                      <option value="HIGH">⚠️ HIGH Only</option>
                      <option value="MODERATE">🟡 MODERATE Only</option>
                      <option value="LOW">🟢 LOW Only</option>
                    </select>

                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-gray-600)', marginLeft: '6px' }}>Status:</label>
                    <select
                      className="form-select"
                      value={emergencyStatusFilter}
                      onChange={e => setEmergencyStatusFilter(e.target.value)}
                      style={{ fontSize: '12px', padding: '6px 10px', minWidth: '140px' }}
                    >
                      <option value="ALL">All Active Statuses</option>
                      <option value="DETECTED">DETECTED</option>
                      <option value="HOSPITAL_ASSIGNED">HOSPITAL_ASSIGNED</option>
                      <option value="AMBULANCE_REQUESTED">AMBULANCE_REQUESTED</option>
                      <option value="AMBULANCE_ACCEPTED">AMBULANCE_ACCEPTED</option>
                      <option value="EN_ROUTE_TO_PATIENT">EN_ROUTE_TO_PATIENT</option>
                      <option value="ARRIVED_AT_PATIENT">ARRIVED_AT_PATIENT</option>
                      <option value="PATIENT_PICKED_UP">PATIENT_PICKED_UP</option>
                      <option value="EN_ROUTE_TO_HOSPITAL">EN_ROUTE_TO_HOSPITAL</option>
                      <option value="ARRIVED_AT_HOSPITAL">ARRIVED_AT_HOSPITAL</option>
                    </select>

                    {(emergencySearchQuery || emergencySeverityFilter !== 'ALL' || emergencyStatusFilter !== 'ALL') && (
                      <button
                        type="button"
                        onClick={() => {
                          setEmergencySearchQuery('');
                          setEmergencySeverityFilter('ALL');
                          setEmergencyStatusFilter('ALL');
                        }}
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '12px', color: 'var(--color-primary-600)' }}
                      >
                        Reset Filters
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Main Dual-Pane Command Center */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(320px, 1.1fr) minmax(460px, 1.9fr)',
                gap: 'var(--space-5)',
                alignItems: 'start'
              }}>
                
                {/* LEFT PANE: Active Incident Queue List */}
                <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                  <div className="card-header" style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--color-gray-50)', borderBottom: '1px solid var(--color-gray-200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ fontSize: '14px', fontWeight: 800, margin: 0, color: 'var(--color-gray-900)' }}>
                        🚨 Active Incidents Queue ({filteredEmergencies.length})
                      </h3>
                      <span style={{ fontSize: '11px', color: 'var(--color-gray-500)' }}>
                        Ranked by clinical severity & recency
                      </span>
                    </div>
                    {filteredEmergencies.length > 0 && (
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-primary-600)' }}>
                        {selectedEmergency ? `Selected: SOS-${selectedEmergency.id}` : 'Select to inspect'}
                      </span>
                    )}
                  </div>

                  <div style={{ maxHeight: '680px', overflowY: 'auto', padding: 'var(--space-3)' }}>
                    {filteredEmergencies.length === 0 ? (
                      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-gray-500)' }}>
                        <div style={{ fontSize: '36px', marginBottom: '8px' }}>🛡️</div>
                        <strong style={{ fontSize: '14px', color: 'var(--color-gray-700)' }}>No Incidents Found</strong>
                        <p style={{ fontSize: '12px', margin: '4px 0 0 0' }}>
                          {uniqueEmergencies.length === 0 
                            ? 'All network queues clear. No active emergencies reported.' 
                            : 'No active incidents match the selected filter criteria.'}
                        </p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {filteredEmergencies.map(e => {
                          const isSelected = selectedEmergency?.id === e.id;
                          const isCritical = e.severity === 'CRITICAL';
                          return (
                            <div
                              key={e.id}
                              onClick={() => setSelectedEmergency(e)}
                              style={{
                                padding: '12px 14px',
                                borderRadius: 'var(--radius-md)',
                                border: isSelected 
                                  ? '2px solid var(--color-primary-600)' 
                                  : isCritical 
                                    ? '1px solid #FECACA' 
                                    : '1px solid var(--color-gray-200)',
                                background: isSelected 
                                  ? '#eff6ff' 
                                  : isCritical 
                                    ? '#FEF2F2' 
                                    : 'white',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                boxShadow: isSelected ? '0 2px 8px rgba(37, 99, 235, 0.15)' : 'none',
                                position: 'relative'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  {isCritical && <span style={{ color: '#DC2626', animation: 'pulse 1.5s infinite' }}>🚨</span>}
                                  <strong style={{ fontSize: '13px', color: isCritical ? '#991B1B' : 'var(--color-gray-900)' }}>
                                    SOS-{e.id}
                                  </strong>
                                  <StatusBadge status={e.severity} size="sm" />
                                </div>
                                <span style={{ fontSize: '11px', fontWeight: 800, color: isCritical ? '#DC2626' : 'var(--color-gray-600)', background: isCritical ? '#FEE2E2' : 'var(--color-gray-100)', padding: '1px 6px', borderRadius: '4px' }}>
                                  Risk {e.riskScore ?? 85}/100
                                </span>
                              </div>

                              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-gray-800)', marginBottom: '3px' }}>
                                {e.patientName || e.patientUid || 'Emergency Patient'}
                              </div>

                              <div style={{ fontSize: '11px', color: 'var(--color-gray-600)', marginBottom: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                <strong>Symptoms:</strong> {e.symptoms || 'Acute distress / Cardiac risk detected'}
                              </div>

                              {/* Telemetry Chips */}
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                {e.heartRate && (
                                  <span style={{ fontSize: '10px', background: '#FEE2E2', color: '#991B1B', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                    ❤️ {e.heartRate} bpm
                                  </span>
                                )}
                                {e.oxygenLevel && (
                                  <span style={{ fontSize: '10px', background: '#E0F2FE', color: '#0369A1', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                    🫁 {e.oxygenLevel}% SpO2
                                  </span>
                                )}
                                {e.bloodPressure && (
                                  <span style={{ fontSize: '10px', background: '#FEF3C7', color: '#92400E', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                    🩺 {e.bloodPressure}
                                  </span>
                                )}
                              </div>

                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--color-gray-500)', borderTop: '1px dashed var(--color-gray-200)', paddingTop: '6px' }}>
                                <span title={e.hospital?.name || 'Assigned Hospital'}>
                                  🏥 {e.hospital?.name ? (e.hospital.name.length > 18 ? e.hospital.name.slice(0, 18) + '...' : e.hospital.name) : (e.hospitalId ? `Hospital #${e.hospitalId}` : 'Assigning...')}
                                </span>
                                <StatusBadge status={e.status} size="sm" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* RIGHT PANE: Selected Incident Command & Live Telemetry Console */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  {!selectedEmergency ? (
                    <div className="card" style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--color-gray-500)' }}>
                      <div style={{ fontSize: '42px', marginBottom: '12px' }}>📡</div>
                      <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-gray-800)' }}>No Incident Selected</h3>
                      <p style={{ fontSize: '13px', maxWidth: '380px', margin: '6px auto 0 auto', color: 'var(--color-gray-600)' }}>
                        Select any emergency incident from the active queue to view live GPS dispatch telemetry, patient vitals, hospital triage status, and execute administrative actions.
                      </p>
                    </div>
                  ) : (() => {
                    const e = selectedEmergency;
                    const liveAmb = ambulanceLocationsMap[e.id] || (e.ambulanceId ? ambulanceLocationsMap[e.ambulanceId] : null);
                    const ambCoords = liveAmb?.latitude && liveAmb?.longitude
                      ? [liveAmb.latitude, liveAmb.longitude]
                      : (ambulanceLocation?.latitude && ambulanceLocation?.longitude
                          ? [ambulanceLocation.latitude, ambulanceLocation.longitude]
                          : (e.ambulance?.latitude && e.ambulance?.longitude
                              ? [e.ambulance.latitude, e.ambulance.longitude]
                              : null));
                    const ambStatus = liveAmb?.status || ambulanceLocation?.status || e.ambulance?.status || e.ambulanceStatus || e.status;
                    const ambUnitId = liveAmb?.unitId || e.ambulance?.unitId || (e.ambulanceId ? `AMB-${e.ambulanceId}` : 'AMB-102');
                    const driverName = e.ambulance?.driver?.fullName || e.ambulance?.driverName || 'Emergency Driver';

                    return (
                      <>
                        {/* Incident Header & Executive Action Controls */}
                        <div className="card" style={{ padding: 'var(--space-4)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--color-gray-200)', paddingBottom: '12px', marginBottom: '12px' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                <span style={{ fontSize: '20px' }}>🚨</span>
                                <h2 style={{ fontSize: '18px', fontWeight: 900, margin: 0, color: 'var(--color-gray-900)' }}>
                                  Incident Command: SOS-{e.id}
                                </h2>
                                <StatusBadge status={e.severity} size="sm" />
                                <StatusBadge status={e.status} size="sm" />
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--color-gray-600)' }}>
                                Patient: <strong>{e.patientName || e.patientUid}</strong> ({e.patientUid}) • Reported: <strong>{e.createdAt ? new Date(e.createdAt).toLocaleString() : 'Just now'}</strong>
                              </div>
                            </div>

                            {/* Administrative Action Command Buttons */}
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                              <button
                                type="button"
                                disabled={emergencyActionLoading !== null}
                                onClick={() => handleResolveEmergency(e.id)}
                                className="btn btn-primary btn-sm"
                                style={{ backgroundColor: '#10b981', borderColor: '#10b981', fontWeight: 700 }}
                              >
                                {emergencyActionLoading === 'resolve' ? 'Resolving...' : '✓ Resolve Incident'}
                              </button>

                              <button
                                type="button"
                                disabled={emergencyActionLoading !== null}
                                onClick={() => {
                                  setEmergencyToCancel(e);
                                  setIsCancelEmergencyConfirmOpen(true);
                                }}
                                className="btn btn-secondary btn-sm"
                                style={{ color: '#DC2626', borderColor: '#FCA5A5', fontWeight: 700, backgroundColor: '#FEF2F2' }}
                              >
                                {emergencyActionLoading === 'cancel' ? 'Cancelling...' : '✕ Cancel Incident'}
                              </button>

                              {(!e.ambulanceId && !e.ambulance?.unitId) && (
                                <button
                                  type="button"
                                  disabled={emergencyActionLoading !== null}
                                  onClick={() => handleDispatchAmbulance(e.id)}
                                  className="btn btn-secondary btn-sm"
                                  style={{ color: '#0369A1', borderColor: '#7DD3FC', fontWeight: 700, backgroundColor: '#F0F9FF' }}
                                >
                                  {emergencyActionLoading === 'dispatch' ? 'Dispatching...' : '🚑 Dispatch Ambulance'}
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setIsHospitalOverrideModalOpen(true)}
                                className="btn btn-secondary btn-sm"
                                style={{ fontWeight: 600 }}
                              >
                                🏥 Hospital Details / Override
                              </button>
                            </div>
                          </div>

                          {/* Quick Risk Score & Priority Alert Banner */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FEF2F2', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid #FECACA' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontSize: '18px' }}>⚠️</span>
                              <div>
                                <strong style={{ fontSize: '12px', color: '#991B1B' }}>
                                  AI Risk Severity Assessment: {e.severity} ({e.riskScore ?? 88}/100)
                                </strong>
                                <div style={{ fontSize: '11px', color: '#7F1D1D' }}>
                                  Chief Complaint: {e.symptoms || 'Acute symptoms requiring emergency triage'}
                                </div>
                              </div>
                            </div>
                            <span style={{ fontSize: '11px', background: '#DC2626', color: 'white', padding: '3px 8px', borderRadius: '4px', fontWeight: 800 }}>
                              PRIORITY 1
                            </span>
                          </div>
                        </div>

                        {/* Live Route & GPS Telemetry Panel */}
                        <div className="card" style={{ padding: 'var(--space-4)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <h3 style={{ fontSize: '14px', fontWeight: 800, margin: 0 }}>
                              🗺️ Live Incident GPS Tracking & Dispatch Routing
                            </h3>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '11px' }}>
                              <span style={{ color: ambCoords ? '#10b981' : '#f59e0b', fontWeight: 700 }}>
                                {ambCoords ? '● Real-Time GPS Active' : '● Vehicle Coordinates Simulated / Standby'}
                              </span>
                            </div>
                          </div>

                          <GoogleMapTracking
                            patientLocation={[e.patientLatitude || e.latitude || 12.9716, e.patientLongitude || e.longitude || 77.5946]}
                            hospitalLocation={e.hospital?.latitude && e.hospital?.longitude ? [e.hospital.latitude, e.hospital.longitude] : (e.hospitalLat && e.hospitalLng ? [e.hospitalLat, e.hospitalLng] : [12.9760, 77.6000])}
                            ambulanceLocation={ambCoords}
                            ambulanceStatus={ambStatus}
                            ambulanceUnitId={ambUnitId}
                            driverName={driverName}
                            emergencyId={e.id}
                            height="340px"
                          />
                        </div>

                        {/* Diagnostic & Telemetry Detail Grids */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
                          
                          {/* Card 1: Patient Telemetry & Vitals */}
                          <div className="card" style={{ padding: 'var(--space-4)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                              <span style={{ fontSize: '18px' }}>👤</span>
                              <h4 style={{ fontSize: '13px', fontWeight: 800, margin: 0 }}>Patient Telemetry & Vitals</h4>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                              <div style={{ background: 'var(--color-gray-50)', padding: '8px', borderRadius: '6px' }}>
                                <div style={{ fontSize: '10px', color: 'var(--color-gray-500)', textTransform: 'uppercase' }}>Heart Rate</div>
                                <div style={{ fontSize: '14px', fontWeight: 800, color: '#DC2626' }}>
                                  {e.heartRate || 108} <span style={{ fontSize: '10px', fontWeight: 400 }}>bpm</span>
                                </div>
                              </div>
                              <div style={{ background: 'var(--color-gray-50)', padding: '8px', borderRadius: '6px' }}>
                                <div style={{ fontSize: '10px', color: 'var(--color-gray-500)', textTransform: 'uppercase' }}>Blood Oxygen</div>
                                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0284C7' }}>
                                  {e.oxygenLevel || 91} <span style={{ fontSize: '10px', fontWeight: 400 }}>% SpO2</span>
                                </div>
                              </div>
                              <div style={{ background: 'var(--color-gray-50)', padding: '8px', borderRadius: '6px' }}>
                                <div style={{ fontSize: '10px', color: 'var(--color-gray-500)', textTransform: 'uppercase' }}>Blood Pressure</div>
                                <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--color-gray-800)' }}>
                                  {e.bloodPressure || '142/92'}
                                </div>
                              </div>
                              <div style={{ background: 'var(--color-gray-50)', padding: '8px', borderRadius: '6px' }}>
                                <div style={{ fontSize: '10px', color: 'var(--color-gray-500)', textTransform: 'uppercase' }}>Respiratory Rate</div>
                                <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--color-gray-800)' }}>
                                  {e.respiratoryRate || 24} <span style={{ fontSize: '10px', fontWeight: 400 }}>rpm</span>
                                </div>
                              </div>
                            </div>
                            <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--color-gray-600)', borderTop: '1px solid var(--color-gray-200)', paddingTop: '8px' }}>
                              <div><strong>Patient UID:</strong> {e.patientUid || 'LKT01'}</div>
                              <div><strong>GPS Coords:</strong> {(e.patientLatitude || 12.9716)?.toFixed(4)}, {(e.patientLongitude || 77.5946)?.toFixed(4)}</div>
                            </div>
                          </div>

                          {/* Card 2: Assigned Hospital & Doctor */}
                          <div className="card" style={{ padding: 'var(--space-4)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                              <span style={{ fontSize: '18px' }}>🏥</span>
                              <h4 style={{ fontSize: '13px', fontWeight: 800, margin: 0 }}>Assigned Hospital & Clinical Unit</h4>
                            </div>
                            <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <div>
                                <div style={{ fontSize: '10px', color: 'var(--color-gray-500)', textTransform: 'uppercase' }}>Hospital Name</div>
                                <div style={{ fontWeight: 800, fontSize: '13px' }}>
                                  {e.hospital?.name || (e.hospitalId ? `Hospital #${e.hospitalId}` : 'Assigned Nearest ER')}
                                </div>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                <div style={{ background: 'var(--color-gray-50)', padding: '6px 8px', borderRadius: '4px' }}>
                                  <div style={{ fontSize: '10px', color: 'var(--color-gray-500)' }}>Available Beds</div>
                                  <div style={{ fontWeight: 800 }}>{e.hospital?.availableBeds ?? 14} / {e.hospital?.totalBeds ?? 100}</div>
                                </div>
                                <div style={{ background: 'var(--color-gray-50)', padding: '6px 8px', borderRadius: '4px' }}>
                                  <div style={{ fontSize: '10px', color: 'var(--color-gray-500)' }}>Triage Status</div>
                                  <div style={{ fontWeight: 800, color: '#10b981' }}>ACCEPTED</div>
                                </div>
                              </div>
                              <div style={{ marginTop: '4px', borderTop: '1px solid var(--color-gray-200)', paddingTop: '6px' }}>
                                <div style={{ fontSize: '10px', color: 'var(--color-gray-500)' }}>Assigned Specialist Doctor</div>
                                <div style={{ fontWeight: 700 }}>{e.doctor?.name || (e.doctorId ? `Doctor #${e.doctorId}` : 'Emergency On-Call Physician')}</div>
                                <div style={{ fontSize: '11px', color: 'var(--color-gray-500)' }}>{e.doctor?.specialization || 'Cardiology / Acute Care'}</div>
                              </div>
                            </div>
                          </div>

                          {/* Card 3: Dispatched Ambulance & Driver */}
                          <div className="card" style={{ padding: 'var(--space-4)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                              <span style={{ fontSize: '18px' }}>🚑</span>
                              <h4 style={{ fontSize: '13px', fontWeight: 800, margin: 0 }}>Ambulance Fleet Telemetry</h4>
                            </div>
                            <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <div>
                                <div style={{ fontSize: '10px', color: 'var(--color-gray-500)', textTransform: 'uppercase' }}>Dispatched Unit</div>
                                <div style={{ fontWeight: 800, fontSize: '13px' }}>
                                  {ambUnitId}
                                </div>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                <div style={{ background: 'var(--color-gray-50)', padding: '6px 8px', borderRadius: '4px' }}>
                                  <div style={{ fontSize: '10px', color: 'var(--color-gray-500)' }}>Driver</div>
                                  <div style={{ fontWeight: 700 }}>{driverName}</div>
                                </div>
                                <div style={{ background: 'var(--color-gray-50)', padding: '6px 8px', borderRadius: '4px' }}>
                                  <div style={{ fontSize: '10px', color: 'var(--color-gray-500)' }}>Status</div>
                                  <div><StatusBadge status={ambStatus} size="sm" /></div>
                                </div>
                              </div>
                              <div style={{ marginTop: '4px', borderTop: '1px solid var(--color-gray-200)', paddingTop: '6px' }}>
                                <div style={{ fontSize: '10px', color: 'var(--color-gray-500)' }}>GPS Live Stream Coordinates</div>
                                <div style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--color-gray-700)' }}>
                                  {ambCoords ? `${ambCoords[0]?.toFixed(4)}, ${ambCoords[1]?.toFixed(4)}` : 'Awaiting mobile device ping'}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Card 4: Event Audit Trail Timeline */}
                          <div className="card" style={{ padding: 'var(--space-4)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                              <span style={{ fontSize: '18px' }}>📜</span>
                              <h4 style={{ fontSize: '13px', fontWeight: 800, margin: 0 }}>Incident Timeline & Audit Trail</h4>
                            </div>
                            <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
                              {selectedEmergencyTimeline.length > 0 ? (
                                selectedEmergencyTimeline.map((item, idx) => (
                                  <div key={idx} style={{ display: 'flex', gap: '8px', borderLeft: '2px solid var(--color-primary-500)', paddingLeft: '8px' }}>
                                    <div style={{ color: 'var(--color-gray-500)', minWidth: '60px' }}>
                                      {item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                                    </div>
                                    <div>
                                      <strong>{item.event || item.status || 'STATUS_UPDATE'}</strong>
                                      {item.description && <div style={{ color: 'var(--color-gray-600)' }}>{item.description}</div>}
                                      {item.actor && <div style={{ fontSize: '10px', color: 'var(--color-gray-400)' }}>By: {item.actor}</div>}
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  <div style={{ display: 'flex', gap: '8px', borderLeft: '2px solid #10b981', paddingLeft: '8px' }}>
                                    <div style={{ color: 'var(--color-gray-500)', minWidth: '60px' }}>
                                      {e.createdAt ? new Date(e.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '00:00'}
                                    </div>
                                    <div>
                                      <strong>EMERGENCY_DETECTED</strong>
                                      <div style={{ color: 'var(--color-gray-600)' }}>Patient triggered SOS alert. AI triage score: {e.riskScore ?? 88}/100.</div>
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', gap: '8px', borderLeft: '2px solid var(--color-primary-500)', paddingLeft: '8px' }}>
                                    <div style={{ color: 'var(--color-gray-500)', minWidth: '60px' }}>
                                      {e.updatedAt ? new Date(e.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '00:01'}
                                    </div>
                                    <div>
                                      <strong>{e.status}</strong>
                                      <div style={{ color: 'var(--color-gray-600)' }}>Current active status across synchronized dashboards.</div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                        </div>
                      </>
                    );
                  })()}
                </div>

              </div>

            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 8: ALL USERS DIRECTORY */}
          {/* ========================================================================= */}
          {activeTab === 'users' && (
            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h3 className="card-title">All User Accounts & Status Management</h3>
                  <p style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>
                    Global user directory with instant status toggling (ACTIVE, SUSPENDED, DEACTIVATED)
                  </p>
                </div>
                
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <select 
                    value={userRoleFilter} 
                    onChange={e => setUserRoleFilter(e.target.value)}
                    className="form-select"
                    style={{ width: '160px', padding: '6px 10px', fontSize: '12px' }}
                  >
                    <option value="ALL">All Roles</option>
                    <option value="PATIENT">Patients</option>
                    <option value="FAMILY_MEMBER">Family Members</option>
                    <option value="DOCTOR">Doctors</option>
                    <option value="HOSPITAL_ADMIN">Hospital Admins</option>
                    <option value="AMBULANCE_DRIVER">Ambulance Drivers</option>
                    <option value="SYSTEM_ADMIN">System Admins</option>
                  </select>

                  <input 
                    type="text" 
                    placeholder="Search name or email..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)}
                    className="form-input"
                    style={{ width: '200px', padding: '6px 10px', fontSize: '12px' }}
                  />
                </div>
              </div>

              <div className="card-content">
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>UID</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Phone</th>
                        <th>Association</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users
                        .filter(u => userRoleFilter === 'ALL' || u.role === userRoleFilter)
                        .filter(u => !searchTerm || u.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) || u.email?.toLowerCase().includes(searchTerm.toLowerCase()))
                        .map(u => (
                          <tr key={u.id}>
                            <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{u.uid}</td>
                            <td style={{ fontWeight: 800 }}>{u.fullName || 'User'}</td>
                            <td>{u.email}</td>
                            <td><StatusBadge status={u.role} size="sm" /></td>
                            <td>{u.phone || '—'}</td>
                            <td>
                              {u.hospitalId ? `Hospital #${u.hospitalId}` : u.ambulanceId ? `Ambulance #${u.ambulanceId}` : 'Public User'}
                            </td>
                            <td><StatusBadge status={u.status || 'ACTIVE'} size="sm" /></td>
                            <td>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                {u.status !== 'ACTIVE' ? (
                                  <button 
                                    onClick={() => handleUpdateUserStatus(u.id, 'ACTIVE')}
                                    className="btn btn-primary btn-sm"
                                    style={{ fontSize: '11px', padding: '3px 8px', backgroundColor: '#10b981', borderColor: '#10b981' }}
                                  >
                                    Activate
                                  </button>
                                ) : (
                                  <>
                                    <button 
                                      onClick={() => handleUpdateUserStatus(u.id, 'DEACTIVATED')}
                                      className="btn btn-secondary btn-sm"
                                      style={{ fontSize: '11px', padding: '3px 8px', color: '#f59e0b' }}
                                    >
                                      Deactivate
                                    </button>
                                    <button 
                                      onClick={() => handleUpdateUserStatus(u.id, 'SUSPENDED')}
                                      className="btn btn-secondary btn-sm"
                                      style={{ fontSize: '11px', padding: '3px 8px', color: '#ef4444' }}
                                    >
                                      Suspend
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 9: AUDIT LOGS / AUDIT TRAIL */}
          {/* ========================================================================= */}
          {activeTab === 'audit-logs' && (
            <div className="card" style={{ padding: 'var(--space-5)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-gray-900)' }}>
                    System Administration Audit Logs
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--color-gray-500)', marginTop: '2px' }}>
                    Immutable persistent trail of privileged registrations, status transitions, and security events.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => fetchAllData()} className="btn btn-secondary btn-sm">
                    🔄 Refresh Logs
                  </button>
                </div>
              </div>

              {auditLogs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-gray-500)' }}>
                  <div style={{ fontSize: '36px', marginBottom: '8px' }}>📜</div>
                  <div style={{ fontWeight: 700 }}>No audit logs recorded yet</div>
                  <p style={{ fontSize: '13px', marginTop: '4px' }}>Administrative actions will be automatically tracked and shown here.</p>
                </div>
              ) : (
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Admin</th>
                        <th>Action</th>
                        <th>Target</th>
                        <th>Role</th>
                        <th>Status Transition</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map(log => (
                        <tr key={log.id}>
                          <td style={{ fontSize: '12px', whiteSpace: 'nowrap', color: 'var(--color-gray-600)', fontFamily: 'monospace' }}>
                            {log.timestamp ? new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}
                            <div style={{ fontSize: '10px', color: 'var(--color-gray-400)' }}>
                              {log.timestamp ? new Date(log.timestamp).toLocaleDateString() : ''}
                            </div>
                          </td>
                          <td style={{ fontWeight: 700 }}>
                            {log.adminName || log.adminUserId}
                            <div style={{ fontSize: '11px', color: 'var(--color-gray-500)', fontFamily: 'monospace' }}>
                              {log.adminUserId}
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${
                              log.action?.includes('ACTIVATE') ? 'badge-low' :
                              log.action?.includes('DEACTIVATE') ? 'badge-critical' :
                              log.action?.includes('SUSPEND') ? 'badge-high' :
                              log.action?.includes('REGISTER') ? 'badge-medium' : 'badge-low'
                            }`} style={{ fontWeight: 800, fontSize: '11px' }}>
                              {log.action}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600 }}>
                            {log.targetName || `User #${log.targetUserId || '-'}`}
                            {log.targetUserId && (
                              <div style={{ fontSize: '11px', color: 'var(--color-gray-500)' }}>
                                ID: {log.targetUserId}
                              </div>
                            )}
                          </td>
                          <td>
                            <StatusBadge status={log.targetRole || 'USER'} />
                          </td>
                          <td style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                            {log.oldStatus && log.newStatus ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <StatusBadge status={log.oldStatus} />
                                <span>→</span>
                                <StatusBadge status={log.newStatus} />
                              </span>
                            ) : (
                              log.newStatus ? <StatusBadge status={log.newStatus} /> : '-'
                            )}
                          </td>
                          <td style={{ fontSize: '13px', color: 'var(--color-gray-600)', maxWidth: '300px' }}>
                            {log.description}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* MODALS */}
          {/* ========================================================================= */}

          {/* Modal: Register Doctor */}
          {activeModal === 'register-doctor' && (
            <div className="modal-backdrop" style={{
              position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
            }}>
              <div className="card" style={{ width: '100%', maxWidth: '520px', padding: 'var(--space-6)', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Register Verified Doctor</h3>
                  <button onClick={() => setActiveModal(null)} className="btn btn-ghost btn-sm">✕</button>
                </div>
                
                <form onSubmit={handleRegisterDoctor}>
                  <div className="form-group">
                    <label className="form-label">Full Name</label>
                    <input 
                      type="text" 
                      required 
                      className="form-input" 
                      placeholder="e.g. Dr. Ramesh Babu" 
                      value={doctorForm.name} 
                      onChange={e => setDoctorForm({ ...doctorForm, name: e.target.value })} 
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Email Address (Login Username)</label>
                    <input 
                      type="email" 
                      required 
                      className="form-input" 
                      placeholder="dr.ramesh@apollo.com" 
                      value={doctorForm.email} 
                      onChange={e => setDoctorForm({ ...doctorForm, email: e.target.value })} 
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Contact Phone</label>
                    <input 
                      type="tel" 
                      required 
                      className="form-input" 
                      placeholder="+91 9880123456" 
                      value={doctorForm.phone} 
                      onChange={e => setDoctorForm({ ...doctorForm, phone: e.target.value })} 
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Specialization</label>
                    <select 
                      className="form-select"
                      value={doctorForm.specialization}
                      onChange={e => setDoctorForm({ ...doctorForm, specialization: e.target.value })}
                    >
                      <option value="Cardiology">Cardiology</option>
                      <option value="Trauma Care">Trauma Care</option>
                      <option value="Neurology">Neurology</option>
                      <option value="Orthopedics">Orthopedics</option>
                      <option value="General Medicine">General Medicine</option>
                      <option value="Pediatrics">Pediatrics</option>
                      <option value="Emergency Medicine">Emergency Medicine</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Assigned Hospital</label>
                    <select 
                      className="form-select"
                      required
                      value={doctorForm.hospitalId}
                      onChange={e => setDoctorForm({ ...doctorForm, hospitalId: e.target.value })}
                    >
                      {hospitals.map(h => (
                        <option key={h.id} value={h.id}>{h.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '15px' }}>🔐</span>
                      <strong style={{ fontSize: '12px', color: '#1e40af' }}>Zero-Knowledge Password Setup</strong>
                    </div>
                    <p style={{ fontSize: '11px', color: '#3b82f6', margin: 0, lineHeight: 1.4 }}>
                      As System Administrator, you do not need to set or know the physician's password. A cryptographically secure, single-use activation link will be generated automatically.
                    </p>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: 'var(--space-5)' }}>
                    <button type="button" onClick={() => setActiveModal(null)} className="btn btn-secondary">
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary">
                      ✓ Register & Activate Doctor
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal: Register Hospital Admin */}
          {activeModal === 'register-admin' && (
            <div className="modal-backdrop" style={{
              position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
            }}>
              <div className="card" style={{ width: '100%', maxWidth: '520px', padding: 'var(--space-6)', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Register Hospital Admin</h3>
                  <button onClick={() => setActiveModal(null)} className="btn btn-ghost btn-sm">✕</button>
                </div>
                
                <form onSubmit={handleRegisterHospitalAdmin}>
                  <div className="form-group">
                    <label className="form-label">Admin Full Name</label>
                    <input 
                      type="text" 
                      required 
                      className="form-input" 
                      placeholder="e.g. Suresh Kumar" 
                      value={adminForm.name} 
                      onChange={e => setAdminForm({ ...adminForm, name: e.target.value })} 
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Email Address (Login Username)</label>
                    <input 
                      type="email" 
                      required 
                      className="form-input" 
                      placeholder="admin@manipal.com" 
                      value={adminForm.email} 
                      onChange={e => setAdminForm({ ...adminForm, email: e.target.value })} 
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Phone</label>
                    <input 
                      type="tel" 
                      required 
                      className="form-input" 
                      placeholder="+91 9880112233" 
                      value={adminForm.phone} 
                      onChange={e => setAdminForm({ ...adminForm, phone: e.target.value })} 
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Assigned Hospital</label>
                    <select 
                      className="form-select"
                      required
                      value={adminForm.hospitalId}
                      onChange={e => setAdminForm({ ...adminForm, hospitalId: e.target.value })}
                    >
                      {hospitals.map(h => (
                        <option key={h.id} value={h.id}>{h.name}</option>
                      ))}
                    </select>
                    <small style={{ color: 'var(--color-gray-500)', fontSize: '11px' }}>
                      Security isolation: Hospital Admin will ONLY see emergencies belonging to this hospital.
                    </small>
                  </div>

                  <div className="form-group" style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '15px' }}>🔐</span>
                      <strong style={{ fontSize: '12px', color: '#1e40af' }}>Zero-Knowledge Password Setup</strong>
                    </div>
                    <p style={{ fontSize: '11px', color: '#3b82f6', margin: 0, lineHeight: 1.4 }}>
                      Administrator credentials are zero-knowledge. A secure, expiring one-time link will be created for the admin to initialize their password.
                    </p>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: 'var(--space-5)' }}>
                    <button type="button" onClick={() => setActiveModal(null)} className="btn btn-secondary">
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary">
                      ✓ Register Hospital Admin
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal: Register Driver */}
          {activeModal === 'register-driver' && (
            <div className="modal-backdrop" style={{
              position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
            }}>
              <div className="card" style={{ width: '100%', maxWidth: '520px', padding: 'var(--space-6)', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Register Ambulance Driver</h3>
                  <button onClick={() => setActiveModal(null)} className="btn btn-ghost btn-sm">✕</button>
                </div>
                
                <form onSubmit={handleRegisterDriver}>
                  <div className="form-group">
                    <label className="form-label">Driver Full Name</label>
                    <input 
                      type="text" 
                      required 
                      className="form-input" 
                      placeholder="e.g. Ramesh Singh" 
                      value={driverForm.name} 
                      onChange={e => setDriverForm({ ...driverForm, name: e.target.value })} 
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Email Address (Login Username)</label>
                    <input 
                      type="email" 
                      required 
                      className="form-input" 
                      placeholder="driver@vitalguard.com" 
                      value={driverForm.email} 
                      onChange={e => setDriverForm({ ...driverForm, email: e.target.value })} 
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Phone</label>
                    <input 
                      type="tel" 
                      required 
                      className="form-input" 
                      placeholder="+91 9880998877" 
                      value={driverForm.phone} 
                      onChange={e => setDriverForm({ ...driverForm, phone: e.target.value })} 
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Assigned Ambulance Unit</label>
                    <select 
                      className="form-select"
                      required
                      value={driverForm.ambulanceId}
                      onChange={e => setDriverForm({ ...driverForm, ambulanceId: e.target.value })}
                    >
                      {ambulances.map(a => (
                        <option key={a.id} value={a.id}>{a.unitId} — {a.hospitalName || 'Base Depot'}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '15px' }}>🔐</span>
                      <strong style={{ fontSize: '12px', color: '#1e40af' }}>Zero-Knowledge Password Setup</strong>
                    </div>
                    <p style={{ fontSize: '11px', color: '#3b82f6', margin: 0, lineHeight: 1.4 }}>
                      Driver credentials are zero-knowledge. A secure, single-use activation link will be generated for the driver to establish their password.
                    </p>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: 'var(--space-5)' }}>
                    <button type="button" onClick={() => setActiveModal(null)} className="btn btn-secondary">
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary">
                      ✓ Register Ambulance Driver
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal: Add Hospital */}
          {activeModal === 'add-hospital' && (
            <div className="modal-backdrop" style={{
              position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
            }}>
              <div className="card" style={{ width: '100%', maxWidth: '520px', padding: 'var(--space-6)', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Add Certified Hospital</h3>
                  <button onClick={() => setActiveModal(null)} className="btn btn-ghost btn-sm">✕</button>
                </div>
                
                <form onSubmit={handleAddHospital}>
                  <div className="form-group">
                    <label className="form-label">Hospital Name</label>
                    <input 
                      type="text" 
                      required 
                      className="form-input" 
                      placeholder="e.g. Columbia Asia Hospital" 
                      value={hospitalForm.name} 
                      onChange={e => setHospitalForm({ ...hospitalForm, name: e.target.value })} 
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="form-group">
                      <label className="form-label">Latitude</label>
                      <input 
                        type="number" 
                        step="any" 
                        required 
                        className="form-input" 
                        value={hospitalForm.lat} 
                        onChange={e => setHospitalForm({ ...hospitalForm, lat: parseFloat(e.target.value) })} 
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Longitude</label>
                      <input 
                        type="number" 
                        step="any" 
                        required 
                        className="form-input" 
                        value={hospitalForm.lng} 
                        onChange={e => setHospitalForm({ ...hospitalForm, lng: parseFloat(e.target.value) })} 
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="form-group">
                      <label className="form-label">Total Beds</label>
                      <input 
                        type="number" 
                        required 
                        className="form-input" 
                        value={hospitalForm.totalBeds} 
                        onChange={e => setHospitalForm({ ...hospitalForm, totalBeds: parseInt(e.target.value) })} 
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Available Beds</label>
                      <input 
                        type="number" 
                        required 
                        className="form-input" 
                        value={hospitalForm.availableBeds} 
                        onChange={e => setHospitalForm({ ...hospitalForm, availableBeds: parseInt(e.target.value) })} 
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="form-group">
                      <label className="form-label">Total Doctors</label>
                      <input 
                        type="number" 
                        required 
                        className="form-input" 
                        value={hospitalForm.totalDoctors} 
                        onChange={e => setHospitalForm({ ...hospitalForm, totalDoctors: parseInt(e.target.value) })} 
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Rating</label>
                      <input 
                        type="number" 
                        step="0.1" 
                        max="5" 
                        min="1" 
                        required 
                        className="form-input" 
                        value={hospitalForm.rating} 
                        onChange={e => setHospitalForm({ ...hospitalForm, rating: parseFloat(e.target.value) })} 
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: 'var(--space-5)' }}>
                    <button type="button" onClick={() => setActiveModal(null)} className="btn btn-secondary">
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary">
                      ✓ Save Hospital
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal: Add Ambulance */}
          {activeModal === 'add-ambulance' && (
            <div className="modal-backdrop" style={{
              position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
            }}>
              <div className="card" style={{ width: '100%', maxWidth: '520px', padding: 'var(--space-6)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Register Ambulance Unit</h3>
                  <button onClick={() => setActiveModal(null)} className="btn btn-ghost btn-sm">✕</button>
                </div>
                
                <form onSubmit={handleAddAmbulance}>
                  <div className="form-group">
                    <label className="form-label">Ambulance Unit ID</label>
                    <input 
                      type="text" 
                      required 
                      className="form-input" 
                      placeholder="e.g. AMB-10" 
                      value={ambulanceForm.unitId} 
                      onChange={e => setAmbulanceForm({ ...ambulanceForm, unitId: e.target.value })} 
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Base Station / Hospital Affinity</label>
                    <select 
                      className="form-select"
                      value={ambulanceForm.hospitalName}
                      onChange={e => setAmbulanceForm({ ...ambulanceForm, hospitalName: e.target.value })}
                    >
                      {hospitals.map(h => (
                        <option key={h.id} value={h.name}>{h.name}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="form-group">
                      <label className="form-label">Station Latitude</label>
                      <input 
                        type="number" 
                        step="any" 
                        required 
                        className="form-input" 
                        value={ambulanceForm.latitude} 
                        onChange={e => setAmbulanceForm({ ...ambulanceForm, latitude: parseFloat(e.target.value) })} 
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Station Longitude</label>
                      <input 
                        type="number" 
                        step="any" 
                        required 
                        className="form-input" 
                        value={ambulanceForm.longitude} 
                        onChange={e => setAmbulanceForm({ ...ambulanceForm, longitude: parseFloat(e.target.value) })} 
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: 'var(--space-5)' }}>
                    <button type="button" onClick={() => setActiveModal(null)} className="btn btn-secondary">
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary">
                      ✓ Add Ambulance Unit
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal: View Details */}
          {activeModal === 'view-doctor' && modalItem && (
            <div className="modal-backdrop" style={{
              position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
            }}>
              <div className="card" style={{ width: '100%', maxWidth: '500px', padding: 'var(--space-6)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 800 }}>Physician Profile Details</h3>
                  <button onClick={() => setActiveModal(null)} className="btn btn-ghost btn-sm">✕</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div><strong>Name:</strong> {modalItem.name}</div>
                  <div><strong>Email:</strong> {modalItem.email || 'doctor@vitaguard.com'}</div>
                  <div><strong>Phone:</strong> {modalItem.phone || '9880123456'}</div>
                  <div><strong>Specialization:</strong> {modalItem.specialization}</div>
                  <div><strong>Hospital:</strong> {modalItem.hospitalName || `Hospital #${modalItem.hospitalId}`}</div>
                  <div><strong>On Duty:</strong> {modalItem.onDuty ? 'Yes' : 'No'}</div>
                  <div><strong>Available for SOS:</strong> {modalItem.availableForEmergency ? 'Yes' : 'No'}</div>
                  <div><strong>Status:</strong> <StatusBadge status={modalItem.status || 'ACTIVE'} size="sm" /></div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-5)' }}>
                  <button onClick={() => setActiveModal(null)} className="btn btn-primary btn-sm">Close</button>
                </div>
              </div>
            </div>
          )}

          {/* Modal: Password Setup Success Link */}
          {setupSuccessModal && (
            <div className="modal-backdrop" style={{
              position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1100,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
            }}>
              <div className="card" style={{ width: '100%', maxWidth: '560px', padding: 'var(--space-6)', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: 'var(--space-4)' }}>
                  <div style={{ width: '42px', height: '42px', borderRadius: '50%', backgroundColor: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
                    ✓
                  </div>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>Privileged User Registered</h3>
                    <p style={{ fontSize: '12px', color: 'var(--color-gray-500)', margin: 0 }}>Account created with status PENDING password setup</p>
                  </div>
                </div>

                <div style={{ background: 'var(--color-gray-50)', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
                  <div style={{ marginBottom: '4px' }}><strong>User:</strong> {setupSuccessModal.name} ({setupSuccessModal.email})</div>
                  <div><strong>Role:</strong> <StatusBadge status={setupSuccessModal.role} size="sm" /></div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '12px' }}>
                    One-Time Password Setup Link (Expires in 24 Hours):
                  </label>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <input 
                      type="text" 
                      readOnly 
                      value={setupSuccessModal.setupUrl} 
                      className="form-input" 
                      style={{ fontSize: '12px', fontFamily: 'monospace', backgroundColor: '#fff' }} 
                    />
                    <button 
                      type="button" 
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        navigator.clipboard?.writeText(setupSuccessModal.setupUrl);
                        showNotification('Setup link copied to clipboard!');
                      }}
                    >
                      📋 Copy
                    </button>
                  </div>
                  <small style={{ color: 'var(--color-gray-500)', fontSize: '11px', display: 'block', marginTop: '6px' }}>
                    Share this single-use link with the user. Once they set their password, their account will be activated.
                  </small>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button 
                    type="button" 
                    className="btn btn-secondary"
                    onClick={() => setSetupSuccessModal(null)}
                  >
                    Close
                  </button>
                  <a 
                    href={setupSuccessModal.setupUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="btn btn-primary"
                  >
                    Open Setup Page ↗
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Modal: Administrative Emergency Cancellation */}
          <CancelEmergencyModal
            isOpen={isCancelEmergencyConfirmOpen}
            emergency={emergencyToCancel}
            onClose={() => {
              if (emergencyActionLoading !== 'cancel') {
                setIsCancelEmergencyConfirmOpen(false);
                setEmergencyToCancel(null);
                setCancelEmergencyError(null);
              }
            }}
            onConfirm={handleConfirmCancelEmergency}
            isCancelling={emergencyActionLoading === 'cancel'}
            error={cancelEmergencyError}
          />

          {/* Modal: Hospital Assignment & Triage Details / Override */}
          {isHospitalOverrideModalOpen && selectedEmergency && (
            <div className="modal-backdrop" style={{
              position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
            }}>
              <div className="card" style={{ width: '100%', maxWidth: '580px', padding: 'var(--space-6)', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>
                      Hospital Triage & Facility Assignment
                    </h3>
                    <p style={{ fontSize: '12px', color: 'var(--color-gray-500)', margin: '4px 0 0 0' }}>
                      Incident: <strong>SOS-{selectedEmergency.id}</strong> • Patient: <strong>{selectedEmergency.patientName || selectedEmergency.patientUid}</strong>
                    </p>
                  </div>
                  <button onClick={() => setIsHospitalOverrideModalOpen(false)} className="btn btn-ghost btn-sm">✕</button>
                </div>

                {/* Currently Assigned Hospital Card */}
                <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#166534', fontWeight: 800, marginBottom: '4px' }}>
                    CURRENTLY ASSIGNED RECEIVING HOSPITAL
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 900, color: '#14532D' }}>
                    {selectedEmergency.hospital?.name || (selectedEmergency.hospitalId ? `Hospital #${selectedEmergency.hospitalId}` : 'Assigned Emergency Facility')}
                  </div>
                  <div style={{ fontSize: '12px', color: '#166534', marginTop: '6px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <span>🛏️ Available Beds: <strong>{selectedEmergency.hospital?.availableBeds ?? 14} / {selectedEmergency.hospital?.totalBeds ?? 100}</strong></span>
                    <span>👨‍⚕️ Receiving Doctor: <strong>{selectedEmergency.doctor?.name || 'Emergency Team'}</strong></span>
                  </div>
                </div>

                {/* System Architecture Explanation Alert */}
                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '14px', marginBottom: '16px', fontSize: '12px', color: '#1E40AF', lineHeight: 1.5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '16px' }}>ℹ️</span>
                    <strong style={{ fontSize: '13px', color: '#1E3A8A' }}>Automated Clinical Triage & Architectural Contract</strong>
                  </div>
                  <p style={{ margin: '0 0 8px 0' }}>
                    VitalGuard's triage engine (<code>EmergencyWorkflowService</code>) allocates receiving facilities using AI risk severity, specialized ICU bed availability, and Haversine geospatial proximity.
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>Backend Contract Status:</strong> The existing REST API enforces triage immutability to prevent conflicting hospital transfers while response units are en route. Direct manual hospital reassignment would require endpoint <code>PATCH /api/admin/emergencies/{'{id}'}/hospital</code>, which is documented in the technical sync report.
                  </p>
                </div>

                {/* Network Hospitals Overview */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--color-gray-700)', marginBottom: '8px' }}>
                    Registered Network Hospitals & Real-Time Capacity:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                    {hospitals.map(h => (
                      <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-gray-200)', background: 'var(--color-gray-50)', fontSize: '12px' }}>
                        <div>
                          <strong>{h.name}</strong>
                          <div style={{ fontSize: '11px', color: 'var(--color-gray-500)' }}>{h.address || 'Central City Healthcare Facility'}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontWeight: 800, color: h.availableBeds > 10 ? '#10b981' : '#f59e0b' }}>
                            {h.availableBeds ?? 20} Beds Free
                          </span>
                          <div style={{ fontSize: '10px', color: 'var(--color-gray-400)' }}>⭐ {h.rating || 4.8} / 5.0</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
                  <button
                    type="button"
                    onClick={() => setIsHospitalOverrideModalOpen(false)}
                    className="btn btn-primary btn-sm"
                  >
                    Done / Close
                  </button>
                </div>
              </div>
            </div>
          )}

          </main>
        </div>
      </div>
    </div>
  );
}
