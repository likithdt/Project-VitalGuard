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
      background: 'var(--color-gray-50)',
      padding: 'var(--space-6)',
    }}>
      <div style={{ 
        width: '100%', 
        maxWidth: '720px',
      }}>
        {/* Signup Card */}
        <div className="card" style={{ 
          padding: 'var(--space-8)', 
          boxShadow: 'var(--shadow-xl)',
        }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
            <div className="avatar avatar-xl" style={{ 
              margin: '0 auto var(--space-4)',
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-light))',
            }}>
              🛡️
            </div>
            <h1 style={{ 
              fontSize: 'var(--font-size-3xl)', 
              fontWeight: 'var(--font-weight-extrabold)',
              color: 'var(--color-gray-900)',
              marginBottom: 'var(--space-2)',
            }}>
              Create Account
            </h1>
            <p style={{ 
              fontSize: 'var(--font-size-xs)', 
              fontWeight: 'var(--font-weight-semibold)',
              color: 'var(--color-primary)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 'var(--space-2)',
            }}>
              VitalGuard Health Network
            </p>
            <p style={{ 
              fontSize: 'var(--font-size-base)', 
              color: 'var(--color-gray-500)',
            }}>
              Join the health command & telemetry network
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="alert alert-critical" style={{ marginBottom: 'var(--space-5)' }}>
              <span style={{ fontSize: '18px' }}>🚨</span>
              <div>
                <div className="alert-title">Registration Failed</div>
                <div className="alert-message">{error}</div>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            {/* Account Type */}
            <div className="form-group">
              <label className="form-label">Account Type</label>
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                {roleOptions.map((role) => (
                  <label 
                    key={role.value}
                    style={{ 
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                      padding: 'var(--space-4)',
                      border: `2px solid ${formData.role === role.value ? 'var(--color-primary)' : 'var(--color-gray-300)'}`,
                      borderRadius: 'var(--radius-xl)',
                      background: formData.role === role.value ? 'var(--color-primary-bg)' : 'var(--color-white)',
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={role.value}
                      checked={formData.role === role.value}
                      onChange={handleChange}
                      style={{ display: 'none' }}
                    />
                    <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: formData.role === role.value ? 'var(--color-primary)' : 'var(--color-gray-900)' }}>
                      {role.label}
                    </span>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-500)' }}>
                      {role.value === 'PATIENT' ? 'Full access to vitals & emergency' : 'Monitor loved ones'}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Personal Information */}
            <div style={{ borderTop: '1px solid var(--color-gray-200)', paddingTop: 'var(--space-5)' }}>
              <h3 style={{ 
                fontSize: 'var(--font-size-lg)', 
                fontWeight: 'var(--font-weight-bold)',
                color: 'var(--color-gray-900)',
                marginBottom: 'var(--space-4)',
              }}>
                Personal Information
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
                <div className="form-group">
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

                <div className="form-group">
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

                <div className="form-group">
                  <label className="form-label" htmlFor="password">Password</label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    className="form-input"
                    placeholder="•••••••• (min 8 characters)"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    minLength={8}
                  />
                </div>

                {formData.role === 'PATIENT' && (
                  <>
                    <div className="form-group">
                      <label className="form-label" htmlFor="age">Age</label>
                      <input
                        type="number"
                        id="age"
                        name="age"
                        className="form-input"
                        placeholder="45"
                        value={formData.age}
                        onChange={handleChange}
                        min="1"
                        max="120"
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="bloodGroup">Blood Group</label>
                      <select
                        id="bloodGroup"
                        name="bloodGroup"
                        className="form-select"
                        value={formData.bloodGroup}
                        onChange={handleChange}
                      >
                        <option value="">Select Blood Group</option>
                        {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
                          <option key={bg} value={bg}>{bg}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Contact Information */}
            <div style={{ borderTop: '1px solid var(--color-gray-200)', paddingTop: 'var(--space-5)' }}>
              <h3 style={{ 
                fontSize: 'var(--font-size-lg)', 
                fontWeight: 'var(--font-weight-bold)',
                color: 'var(--color-gray-900)',
                marginBottom: 'var(--space-4)',
              }}>
                Contact Information
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label" htmlFor="address">Address</label>
                  <input
                    type="text"
                    id="address"
                    name="address"
                    className="form-input"
                    placeholder="Street address, City, State"
                    value={formData.address}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Geographic Coordinates</label>
                  <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                    <input
                      type="number"
                      step="any"
                      name="latitude"
                      className="form-input"
                      placeholder="Latitude"
                      value={formData.latitude}
                      onChange={handleChange}
                      required
                      style={{ flex: 1 }}
                    />
                    <input
                      type="number"
                      step="any"
                      name="longitude"
                      className="form-input"
                      placeholder="Longitude"
                      value={formData.longitude}
                      onChange={handleChange}
                      required
                      style={{ flex: 1 }}
                    />
                    <button 
                      type="button" 
                      onClick={handleGeoLocation}
                      className="btn btn-secondary"
                      style={{ alignSelf: 'flex-end', height: '43px', padding: '0 var(--space-4)' }}
                    >
                      📍 Detect
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Emergency Contact (Patient only) */}
            {formData.role === 'PATIENT' && (
              <div style={{ borderTop: '1px solid var(--color-gray-200)', paddingTop: 'var(--space-5)' }}>
                <h3 style={{ 
                  fontSize: 'var(--font-size-lg)', 
                  fontWeight: 'var(--font-weight-bold)',
                  color: 'var(--color-gray-900)',
                  marginBottom: 'var(--space-4)',
                }}>
                  Primary Doctor Referral (Optional)
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
                  <div className="form-group">
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
                  <div className="form-group">
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
                  <div className="form-group">
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
              className="btn btn-primary btn-lg w-full"
              disabled={loading}
              style={{ padding: 'var(--space-3)', fontSize: 'var(--font-size-base)', marginTop: 'var(--space-2)' }}
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>

          {/* Footer */}
          <div style={{ textAlign: 'center', marginTop: 'var(--space-6)', fontSize: 'var(--font-size-sm)', color: 'var(--color-gray-500)' }}>
            Already have an account? <Link to="/login" style={{ color: 'var(--color-primary)', fontWeight: 'var(--font-weight-semibold)', textDecoration: 'none' }}>Sign In</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;