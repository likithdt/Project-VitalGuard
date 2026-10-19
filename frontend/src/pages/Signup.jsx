import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Signup = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: 'PATIENT',
    fullName: '',
    age: '',
    bloodGroup: '',
    address: '',
    latitude: 12.9716,
    longitude: 77.5946,
    doctorName: '',
    doctorPhone: '',
    doctorHospital: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'number' ? (value === '' ? '' : parseFloat(value)) : value
    }));
  };

  const handleGeoLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setFormData((prev) => ({
            ...prev,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          }));
        },
        () => alert('Could not fetch location. Using default coordinates.')
      );
    } else {
      alert('Geolocation is not supported by your browser.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const submitData = { ...formData };
      if (submitData.age === '') delete submitData.age;
      if (submitData.latitude === '') delete submitData.latitude;
      if (submitData.longitude === '') delete submitData.longitude;
      
      const userData = await register(submitData);
      if (userData.role === 'PATIENT' || userData.role === 'FAMILY_MEMBER') {
        navigate('/user-dashboard');
      } else {
        navigate('/healthcare-dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const roleOptions = [
    { value: 'PATIENT', label: 'Patient' },
    { value: 'FAMILY_MEMBER', label: 'Family Member' },
  ];

  const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      background: 'var(--color-bg-main)',
      padding: 'var(--space-8) var(--space-4)',
    }}>
      <div style={{ 
        width: '100%', 
        maxWidth: '760px',
      }}>
        {/* Signup Card */}
        <div className="card" style={{ 
          padding: 'var(--space-8)', 
          boxShadow: 'var(--shadow-xl)',
          borderRadius: 'var(--radius-xl)',
          background: 'var(--color-white)',
          border: '1px solid rgba(226, 232, 240, 0.9)'
        }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
            <div style={{ 
              width: '56px',
              height: '56px',
              borderRadius: 'var(--radius-lg)',
              margin: '0 auto var(--space-4)',
              background: 'linear-gradient(135deg, var(--color-primary) 0%, #162E52 60%, var(--color-secondary) 100%)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              boxShadow: '0 4px 14px rgba(11, 31, 58, 0.25)'
            }}>
              🛡️
            </div>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 12px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--color-teal-bg)',
              color: 'var(--color-teal)',
              fontSize: '11px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 'var(--space-2)'
            }}>
              Clinical Emergency Network
            </div>
            <h1 style={{ 
              fontSize: '2rem', 
              fontWeight: 800,
              color: 'var(--color-text-primary)',
              letterSpacing: '-0.02em',
              marginBottom: '6px',
            }}>
              Create VitalGuard Account
            </h1>
            <p style={{ 
              fontSize: 'var(--font-size-sm)', 
              color: 'var(--color-text-secondary)',
              maxWidth: '460px',
              margin: '0 auto'
            }}>
              Register for continuous biometric telemetry, automated emergency SOS dispatch, and specialist physician coordination
            </p>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-critical-bg)',
              border: '1px solid var(--color-critical-border)',
              color: 'var(--color-critical)',
              fontSize: '13px',
              fontWeight: 600,
              marginBottom: 'var(--space-5)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }} role="alert">
              <span>🚨</span>
              <div>
                <strong style={{ display: 'block' }}>Registration Failed</strong>
                <span>{error}</span>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            {/* Account Type Selector */}
            <div className="form-group">
              <label className="form-label">Select Account Role</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                {roleOptions.map((role) => {
                  const isSelected = formData.role === role.value;
                  return (
                    <label 
                      key={role.value}
                      style={{ 
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 'var(--space-3)',
                        padding: 'var(--space-4)',
                        border: `2px solid ${isSelected ? 'var(--color-secondary)' : 'var(--color-gray-200)'}`,
                        borderRadius: 'var(--radius-lg)',
                        background: isSelected ? 'var(--color-secondary-bg)' : 'var(--color-white)',
                        cursor: 'pointer',
                        transition: 'all var(--transition-fast)',
                        boxShadow: isSelected ? '0 0 0 1px var(--color-secondary)' : 'var(--shadow-xs)'
                      }}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={role.value}
                        checked={isSelected}
                        onChange={handleChange}
                        style={{ marginTop: '3px', accentColor: 'var(--color-secondary)' }}
                      />
                      <div>
                        <div style={{ 
                          fontSize: 'var(--font-size-base)', 
                          fontWeight: 700, 
                          color: isSelected ? 'var(--color-secondary)' : 'var(--color-text-primary)' 
                        }}>
                          {role.value === 'PATIENT' ? '🏥 Patient Account' : '👨‍👩‍👧‍👦 Family Guardian'}
                        </div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                          {role.value === 'PATIENT' ? 'Personal vitals monitoring, SOS trigger & health records' : 'Monitor linked family members & receive active alerts'}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Personal Information */}
            <div style={{
              background: '#F8FAFD',
              border: '1px solid var(--color-gray-200)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-5)'
            }}>
              <h3 style={{ 
                fontSize: 'var(--font-size-base)', 
                fontWeight: 800,
                color: 'var(--color-text-primary)',
                marginBottom: 'var(--space-4)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>👤</span>
                <span>Personal & Account Credentials</span>
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="fullName">Full Name</label>
                  <input
                    type="text"
                    id="fullName"
                    name="fullName"
                    className="form-input"
                    placeholder="e.g. Rahul Sharma"
                    value={formData.fullName}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="email">Email Address</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    className="form-input"
                    placeholder="name@email.com"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="password">Password</label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    className="form-input"
                    placeholder="•••••••• (min 8 chars)"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    minLength={8}
                  />
                </div>

                {formData.role === 'PATIENT' && (
                  <>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" htmlFor="age">Age</label>
                      <input
                        type="number"
                        id="age"
                        name="age"
                        className="form-input"
                        placeholder="e.g. 45"
                        value={formData.age}
                        onChange={handleChange}
                        min="1"
                        max="120"
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" htmlFor="bloodGroup">Blood Group</label>
                      <select
                        id="bloodGroup"
                        name="bloodGroup"
                        className="form-select"
                        value={formData.bloodGroup}
                        onChange={handleChange}
                      >
                        <option value="">Select Blood Group</option>
                        {bloodGroups.map(bg => (
                          <option key={bg} value={bg}>{bg}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Contact & Location Information */}
            <div style={{
              background: '#F8FAFD',
              border: '1px solid var(--color-gray-200)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-5)'
            }}>
              <h3 style={{ 
                fontSize: 'var(--font-size-base)', 
                fontWeight: 800,
                color: 'var(--color-text-primary)',
                marginBottom: 'var(--space-4)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>📍</span>
                <span>Contact & Emergency Geolocation</span>
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
                <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
                  <label className="form-label" htmlFor="address">Physical Residence Address</label>
                  <input
                    type="text"
                    id="address"
                    name="address"
                    className="form-input"
                    placeholder="Street address, Apartment, City, State"
                    value={formData.address}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>Emergency Dispatch GPS Coordinates</label>
                    <span style={{ fontSize: '11px', color: 'var(--color-teal)', fontWeight: 700 }}>Ensures sub-minute ambulance routing</span>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                    <input
                      type="number"
                      step="any"
                      name="latitude"
                      className="form-input"
                      placeholder="Latitude (e.g. 12.9716)"
                      value={formData.latitude}
                      onChange={handleChange}
                      required
                      style={{ flex: 1, minWidth: '140px' }}
                    />
                    <input
                      type="number"
                      step="any"
                      name="longitude"
                      className="form-input"
                      placeholder="Longitude (e.g. 77.5946)"
                      value={formData.longitude}
                      onChange={handleChange}
                      required
                      style={{ flex: 1, minWidth: '140px' }}
                    />
                    <button 
                      type="button" 
                      onClick={handleGeoLocation}
                      className="btn btn-secondary"
                      style={{ height: '42px', padding: '0 var(--space-4)', fontWeight: 700, gap: '6px' }}
                      title="Auto-detect current GPS coordinates"
                    >
                      <span>🛰️</span>
                      <span>Auto-Detect GPS</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Primary Doctor Referral (Patient only) */}
            {formData.role === 'PATIENT' && (
              <div style={{
                background: '#F8FAFD',
                border: '1px solid var(--color-gray-200)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-5)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                  <h3 style={{ 
                    fontSize: 'var(--font-size-base)', 
                    fontWeight: 800,
                    color: 'var(--color-text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    margin: 0
                  }}>
                    <span>🩺</span>
                    <span>Primary Doctor Referral</span>
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', background: 'var(--color-white)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--color-gray-200)' }}>Optional</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="doctorName">Doctor Name</label>
                    <input
                      type="text"
                      id="doctorName"
                      name="doctorName"
                      className="form-input"
                      placeholder="e.g. Dr. Anirudh Kulkarni"
                      value={formData.doctorName}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="doctorPhone">Doctor Phone</label>
                    <input
                      type="tel"
                      id="doctorPhone"
                      name="doctorPhone"
                      className="form-input"
                      placeholder="e.g. +91 9880123456"
                      value={formData.doctorPhone}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="doctorHospital">Associated Hospital</label>
                    <input
                      type="text"
                      id="doctorHospital"
                      name="doctorHospital"
                      className="form-input"
                      placeholder="e.g. Apollo Hospital"
                      value={formData.doctorHospital}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Submit */}
            <button 
              type="submit" 
              className="btn btn-blue btn-lg w-full"
              disabled={loading}
              style={{
                padding: '14px',
                fontSize: '1rem',
                fontWeight: 800,
                marginTop: 'var(--space-2)',
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.28)'
              }}
            >
              {loading ? 'Creating VitalGuard Account...' : '✓ Complete Registration & Open Dashboard'}
            </button>
          </form>

          {/* Footer */}
          <div style={{ textAlign: 'center', marginTop: 'var(--space-6)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            Already registered on VitalGuard?{' '}
            <Link to="/login" style={{ color: 'var(--color-secondary)', fontWeight: 700, textDecoration: 'none' }}>
              Sign In to Your Account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;