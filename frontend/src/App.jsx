import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Signup from './pages/Signup';
import UserDashboard from './pages/UserDashboard';
import HealthcareDashboard from './pages/HealthcareDashboard';
import FamilyDashboard from './pages/FamilyDashboard';
import Profile from './pages/Profile';
import AdminDashboard from './pages/AdminDashboard';
import SetupPassword from './pages/SetupPassword';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { token, user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', background: '#f8f9fb', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <h2>🛡️ VitalGuard</h2>
          <p style={{ color: '#475569' }}>Authenticating user session...</p>
        </div>
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && (!user || !allowedRoles.includes(user.role))) {
    if (user?.role === 'SYSTEM_ADMIN' || user?.role === 'ADMIN') {
      return <Navigate to="/admin" replace />;
    }
    if (user?.role === 'FAMILY_MEMBER') {
      return <Navigate to="/family-dashboard" replace />;
    }
    if (user?.role === 'PATIENT') {
      return <Navigate to="/user-dashboard" replace />;
    }
    return <Navigate to="/healthcare-dashboard" replace />;
  }

  // Validate required resource relationships
  if (user?.role === 'HOSPITAL_ADMIN' && !user.hospitalId) {
    return (
      <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', background: '#f8f9fb', fontFamily: 'sans-serif', padding: '20px' }}>
        <div className="saas-card" style={{ maxWidth: '480px', padding: '40px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px' }}>Missing Hospital Association</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
            Your Hospital Admin account is not linked to a hospital. Please contact the system administrator to assign you to a hospital.
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>User: {user.fullName} ({user.email})</p>
        </div>
      </div>
    );
  }

  if (user?.role === 'AMBULANCE_DRIVER' && !user.ambulanceId) {
    return (
      <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', background: '#f8f9fb', fontFamily: 'sans-serif', padding: '20px' }}>
        <div className="saas-card" style={{ maxWidth: '480px', padding: '40px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px' }}>Missing Ambulance Association</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
            Your Ambulance Driver account is not linked to an ambulance. Please contact the system administrator to assign you to an ambulance.
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>User: {user.fullName} ({user.email})</p>
        </div>
      </div>
    );
  }

  return children;
};

function App() {
  const { token, user } = useAuth();

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/setup-password" element={<SetupPassword />} />
        
        {/* System Administration Portal - Accessible ONLY by SYSTEM_ADMIN and ADMIN */}
        <Route 
          path="/admin" 
          element={
            <ProtectedRoute allowedRoles={['SYSTEM_ADMIN', 'ADMIN']}>
              <AdminDashboard />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/admin/system" 
          element={
            <ProtectedRoute allowedRoles={['SYSTEM_ADMIN', 'ADMIN']}>
              <AdminDashboard />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/admin/audit-logs" 
          element={
            <ProtectedRoute allowedRoles={['SYSTEM_ADMIN', 'ADMIN']}>
              <AdminDashboard defaultTab="audit-logs" />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/user-dashboard" 
          element={
            <ProtectedRoute allowedRoles={['PATIENT', 'FAMILY_MEMBER', 'ADMIN', 'SYSTEM_ADMIN']}>
              <UserDashboard />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/family-dashboard" 
          element={
            <ProtectedRoute allowedRoles={['FAMILY_MEMBER', 'ADMIN', 'SYSTEM_ADMIN', 'PATIENT']}>
              <FamilyDashboard />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/profile" 
          element={
            <ProtectedRoute allowedRoles={['PATIENT', 'FAMILY_MEMBER', 'DOCTOR', 'HOSPITAL_ADMIN', 'AMBULANCE_DRIVER', 'ADMIN', 'SYSTEM_ADMIN']}>
              <Profile />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/healthcare-dashboard" 
          element={
            <ProtectedRoute allowedRoles={['DOCTOR', 'HOSPITAL_ADMIN', 'AMBULANCE_DRIVER', 'ADMIN', 'SYSTEM_ADMIN']}>
              <HealthcareDashboard />
            </ProtectedRoute>
          } 
        />

        {/* Catch-all redirect based on authenticated role */}
        <Route 
          path="*" 
          element={
            token ? (
              user?.role === 'SYSTEM_ADMIN' || user?.role === 'ADMIN' ? (
                <Navigate to="/admin" replace />
              ) : user?.role === 'FAMILY_MEMBER' ? (
                <Navigate to="/family-dashboard" replace />
              ) : user?.role === 'PATIENT' ? (
                <Navigate to="/user-dashboard" replace />
              ) : (
                <Navigate to="/healthcare-dashboard" replace />
              )
            ) : (
              <Navigate to="/login" replace />
            )
          } 
        />
      </Routes>
    </Router>
  );
}

export default App;
