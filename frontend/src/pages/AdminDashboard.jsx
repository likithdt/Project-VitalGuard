import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../services/api';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import StatusBadge from '../components/StatusBadge';

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

  useEffect(() => {
    fetchAllData();
  }, []);

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
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="badge badge-low" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  ROLE: SYSTEM_ADMIN
                </span>
                <span style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>
                  Platform ID: {user?.uid || 'SYS_01'}
                </span>
              </div>
              <h1 style={{ fontSize: '24px', fontWeight: 900, color: 'var(--color-gray-900)', marginTop: '4px' }}>
                System Administration & Security Control
              </h1>
              <p style={{ color: 'var(--color-gray-500)', fontSize: '13px', marginTop: '2px' }}>
                Privileged user provisioning, hospital federation, and multi-tenant resource authorization
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => fetchAllData()} className="btn btn-secondary btn-sm" title="Refresh all registry data">
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
                {stats?.activeEmergencies ?? '0'}
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
                { id: 'emergencies', label: '📡 System Emergencies', count: emergencies.length },
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
                  <h3 className="card-title">Live System Emergencies ({emergencies.length})</h3>
                  <button onClick={() => handleTabChange('emergencies')} className="btn btn-secondary btn-sm">
                    Open Command Center
                  </button>
                </div>
                <div className="card-content">
                  {emergencies.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-gray-500)' }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>🛡️</div>
                      <div style={{ fontWeight: 700 }}>No Active Emergencies in the Network</div>
                      <div style={{ fontSize: '12px', marginTop: '4px' }}>All emergency queues and ambulance dispatches are clear.</div>
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
                          </tr>
                        </thead>
                        <tbody>
                          {emergencies.slice(0, 5).map(e => (
                            <tr key={e.id}>
                              <td style={{ fontWeight: 800 }}>SOS-{e.id}</td>
                              <td>{e.patientName || e.patientUid}</td>
                              <td>{e.hospital?.name || (e.hospitalId ? `Hospital #${e.hospitalId}` : 'Assigning...')}</td>
                              <td>{e.doctor?.name || 'Emergency Team'}</td>
                              <td>{e.ambulance?.unitId || (e.ambulanceId ? `Unit #${e.ambulanceId}` : 'Not required')}</td>
                              <td><StatusBadge status={e.severity} size="sm" /></td>
                              <td><StatusBadge status={e.status} size="sm" /></td>
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
          {/* TAB 7: EMERGENCIES SYSTEM OVERVIEW */}
          {/* ========================================================================= */}
          {activeTab === 'emergencies' && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">System-Wide Emergency Overview</h3>
                <p style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>
                  Global bird's-eye view across Patient ➔ Emergency ➔ Hospital ➔ Doctor ➔ Ambulance ➔ Driver
                </p>
              </div>

              <div className="card-content">
                {emergencies.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-gray-500)' }}>
                    <div style={{ fontSize: '36px', marginBottom: '8px' }}>🛡️</div>
                    <div style={{ fontWeight: 800, fontSize: '16px' }}>No Active Emergencies in the Network</div>
                    <div style={{ fontSize: '13px', marginTop: '4px' }}>All patient telemetry is stable. No pending dispatches.</div>
                  </div>
                ) : (
                  <div className="table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>SOS ID</th>
                          <th>Patient Info</th>
                          <th>Assigned Hospital</th>
                          <th>Assigned Doctor</th>
                          <th>Dispatched Ambulance</th>
                          <th>Severity & Vitals</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {emergencies.map(e => (
                          <tr key={e.id}>
                            <td style={{ fontWeight: 900 }}>SOS-{e.id}</td>
                            <td>
                              <strong>{e.patientName || e.patientUid}</strong>
                              <div style={{ fontSize: '11px', color: 'var(--color-gray-500)' }}>{e.symptoms || 'Cardiac alert'}</div>
                            </td>
                            <td>{e.hospital?.name || (e.hospitalId ? `Hospital #${e.hospitalId}` : 'Not assigned')}</td>
                            <td>{e.doctor?.name || (e.doctorId ? `Doctor #${e.doctorId}` : 'Emergency Team')}</td>
                            <td>
                              {e.ambulance?.unitId ? (
                                <div>
                                  <strong>{e.ambulance.unitId}</strong>
                                  <div style={{ fontSize: '10px', color: 'var(--color-gray-500)' }}>Driver: {e.ambulance.driver?.fullName || 'Assigned'}</div>
                                </div>
                              ) : 'Not required'}
                            </td>
                            <td>
                              <StatusBadge status={e.severity} size="sm" />
                              {e.detectedVitals && <div style={{ fontSize: '11px', color: 'var(--color-gray-500)', marginTop: '2px' }}>{e.detectedVitals}</div>}
                            </td>
                            <td><StatusBadge status={e.status} size="sm" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
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

          </main>
        </div>
      </div>
    </div>
  );
}
