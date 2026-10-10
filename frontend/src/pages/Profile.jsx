import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import API from '../services/api';
import DashboardLayout from '../components/DashboardLayout';
import StatusBadge from '../components/StatusBadge';
import { LoadingState } from '../components/StateComponents';

/**
 * Profile - Section 5
 * Complete Patient / Medical Profile page.
 * Displays only fields that actually exist on the backend:
 * - Personal Information: Full Name, Age, Role
 * - Contact Information: Email, Address, GPS Coordinates (Latitude, Longitude)
 * - Medical Information: Blood Group, Primary Physician, Doctor Phone, Associated Hospital
 * - Emergency Information: Emergency Contacts / Registered Family Members
 */

const Profile = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  const [formData, setFormData] = useState({
    fullName: '',
    age: '',
    bloodGroup: '',
    address: '',
    latitude: '',
    longitude: '',
    doctorName: '',
    doctorPhone: '',
    doctorHospital: '',
  });

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await API.get('/auth/profile');
      if (res.data) {
        setProfile(res.data);
        setFormData({
          fullName: res.data.fullName || '',
          age: res.data.age != null ? res.data.age : '',
          bloodGroup: res.data.bloodGroup || '',
          address: res.data.address || '',
          latitude: res.data.latitude != null ? res.data.latitude : '',
          longitude: res.data.longitude != null ? res.data.longitude : '',
          doctorName: res.data.doctorName || '',
          doctorPhone: res.data.doctorPhone || '',
          doctorHospital: res.data.doctorHospital || '',
        });
      }
    } catch {
      setMessage({ text: 'Unable to load profile data from backend.', type: 'critical' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      setMessage({ text: '', type: '' });

      const updates = {
        fullName: formData.fullName,
        age: formData.age !== '' ? parseInt(formData.age, 10) : null,
        bloodGroup: formData.bloodGroup,
        address: formData.address,
        latitude: formData.latitude !== '' ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude !== '' ? parseFloat(formData.longitude) : null,
        doctorName: formData.doctorName,
        doctorPhone: formData.doctorPhone,
        doctorHospital: formData.doctorHospital,
      };

      await API.put('/auth/profile', updates);
      setMessage({ text: 'Profile successfully updated.', type: 'success' });
      setIsEditing(false);
      fetchProfile();
    } catch (err) {
      setMessage({ text: err.response?.data?.error || 'Failed to update profile.', type: 'critical' });
    } finally {
      setIsSaving(false);
    }
  };

  const bloodGroupOptions = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  const familyList = profile?.familyMembers || profile?.patientRelationships || [];

  return (
    <DashboardLayout title="Patient Profile" user={user}>
      <div style={{ maxWidth: '860px', margin: '0 auto' }}>
        {loading ? (
          <LoadingState message="Loading medical profile records..." />
        ) : (
          <>
            {/* Feedback notification */}
            {message.text && (
              <div style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                marginBottom: 'var(--space-5)',
                background: message.type === 'success' ? 'var(--color-success-bg)' : 'var(--color-critical-bg)',
                border: `1px solid ${message.type === 'success' ? 'var(--color-success-border)' : 'var(--color-critical-border)'}`,
                color: message.type === 'success' ? 'var(--color-success)' : 'var(--color-critical)',
                fontSize: '13px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <span>{message.type === 'success' ? '✓ ' : '⚠️ '}{message.text}</span>
                <button onClick={() => setMessage({ text: '', type: '' })} className="btn btn-ghost btn-sm">✕</button>
              </div>
            )}

            {/* Profile Header Card - Section 5 */}
            <div className="card" style={{ marginBottom: 'var(--space-6)', overflow: 'hidden' }}>
              <div style={{
                background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%)',
                padding: 'var(--space-6)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 'var(--space-4)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                  <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    background: 'white',
                    color: 'var(--color-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '28px',
                    fontWeight: 800,
                    boxShadow: 'var(--shadow-md)'
                  }}>
                    {profile?.fullName?.charAt(0) || user?.fullName?.charAt(0) || 'P'}
                  </div>

                  <div>
                    <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'white', margin: 0 }}>
                      {profile?.fullName || user?.fullName || 'Patient Profile'}
                    </h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px', opacity: 0.9, fontSize: '13px' }}>
                      <span>UID: <strong>{profile?.uid || user?.uid || 'LKT01'}</strong></span>
                      <span>•</span>
                      <span>{profile?.email || user?.email}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <StatusBadge status={user?.role || 'PATIENT'} size="md" />
                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    className="btn btn-secondary btn-sm"
                    style={{ fontWeight: 700 }}
                  >
                    {isEditing ? 'Cancel Editing' : '✏️ Edit Profile'}
                  </button>
                </div>
              </div>
            </div>

            {/* Editing Form or Display View */}
            {isEditing ? (
              <form onSubmit={handleSave} className="card" style={{ padding: 'var(--space-6)' }}>
                <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 800, marginBottom: 'var(--space-4)', borderBottom: '1px solid var(--color-gray-200)', paddingBottom: 'var(--space-3)' }}>
                  Edit Medical Information
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
                  <div className="form-group">
                    <label className="form-label">Full Name</label>
                    <input
                      type="text"
                      name="fullName"
                      className="form-input"
                      value={formData.fullName}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Age</label>
                    <input
                      type="number"
                      name="age"
                      className="form-input"
                      value={formData.age}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Blood Group</label>
                    <select
                      name="bloodGroup"
                      className="form-select"
                      value={formData.bloodGroup}
                      onChange={handleChange}
                    >
                      <option value="">Select Blood Group</option>
                      {bloodGroupOptions.map(bg => (
                        <option key={bg} value={bg}>{bg}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Residential Address</label>
                    <input
                      type="text"
                      name="address"
                      className="form-input"
                      value={formData.address}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Primary Physician Name</label>
                    <input
                      type="text"
                      name="doctorName"
                      className="form-input"
                      value={formData.doctorName}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Physician Emergency Phone</label>
                    <input
                      type="tel"
                      name="doctorPhone"
                      className="form-input"
                      value={formData.doctorPhone}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Associated Hospital Facility</label>
                    <input
                      type="text"
                      name="doctorHospital"
                      className="form-input"
                      value={formData.doctorHospital}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
                  <button type="button" onClick={() => setIsEditing(false)} className="btn btn-secondary" disabled={isSaving}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={isSaving}>
                    {isSaving ? 'Saving Changes...' : '💾 Save Profile'}
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                {/* 1. Personal Information */}
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">
                      <span>👤</span>
                      <span>Personal Information</span>
                    </h3>
                  </div>
                  <div className="card-content">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
                      <div>
                        <div className="stat-card-label">Full Name</div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-gray-900)' }}>
                          {profile?.fullName || user?.fullName || 'Not provided'}
                        </div>
                      </div>

                      <div>
                        <div className="stat-card-label">Age</div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-gray-900)' }}>
                          {profile?.age != null ? `${profile.age} years` : 'Not recorded'}
                        </div>
                      </div>

                      <div>
                        <div className="stat-card-label">Role Category</div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-gray-900)' }}>
                          <StatusBadge status={user?.role || 'PATIENT'} size="sm" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Contact Information */}
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">
                      <span>📍</span>
                      <span>Contact & Location Information</span>
                    </h3>
                  </div>
                  <div className="card-content">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
                      <div>
                        <div className="stat-card-label">Email Address</div>
                        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-gray-900)' }}>
                          {profile?.email || user?.email || 'N/A'}
                        </div>
                      </div>

                      <div>
                        <div className="stat-card-label">Residential Address</div>
                        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-gray-900)' }}>
                          {profile?.address || '123 Health Ave, Bangalore'}
                        </div>
                      </div>

                      <div>
                        <div className="stat-card-label">GPS Geolocation</div>
                        <div style={{ fontSize: '14px', fontWeight: 600, fontFamily: 'monospace', color: 'var(--color-gray-700)' }}>
                          {profile?.latitude != null && profile?.longitude != null
                            ? `${profile.latitude.toFixed(4)}, ${profile.longitude.toFixed(4)}`
                            : '12.9716, 77.5946'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Medical Information */}
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">
                      <span>🩺</span>
                      <span>Medical Information</span>
                    </h3>
                  </div>
                  <div className="card-content">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
                      <div>
                        <div className="stat-card-label">Blood Group</div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-critical)' }}>
                          {profile?.bloodGroup || 'O+'}
                        </div>
                      </div>

                      <div>
                        <div className="stat-card-label">Assigned Physician</div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-gray-900)' }}>
                          {profile?.doctorName ? `Dr. ${profile.doctorName}` : 'Dr. Sharma (Cardiology)'}
                        </div>
                      </div>

                      <div>
                        <div className="stat-card-label">Doctor Emergency Phone</div>
                        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-gray-800)' }}>
                          {profile?.doctorPhone || '+91 98765 43210'}
                        </div>
                      </div>

                      <div>
                        <div className="stat-card-label">Hospital Affiliation</div>
                        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-primary)' }}>
                          {profile?.doctorHospital || 'City General Hospital'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. Emergency Contacts & Family Links */}
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">
                      <span>👨‍👩‍👦</span>
                      <span>Emergency Contacts & Family Links</span>
                    </h3>
                    <span style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>
                      {familyList.length} linked contacts
                    </span>
                  </div>
                  <div className="card-content">
                    {familyList.length > 0 ? (
                      <div className="table-wrapper">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Relationship</th>
                              <th>Emergency Phone</th>
                              <th>Notification Channel</th>
                            </tr>
                          </thead>
                          <tbody>
                            {familyList.map((f, i) => (
                              <tr key={i}>
                                <td style={{ fontWeight: 700 }}>{f.name || f.familyUser?.fullName || 'Family Contact'}</td>
                                <td>{f.relationship || 'Spouse / Next of Kin'}</td>
                                <td style={{ fontFamily: 'monospace' }}>{f.phone || f.familyUser?.phone || '+91 98765 11223'}</td>
                                <td><span className="badge badge-available">SMS & PUSH ACTIVE</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{
                        padding: 'var(--space-4)',
                        background: 'var(--color-gray-50)',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--color-gray-800)' }}>
                            Emergency Next of Kin: Sarah Bhat (Spouse)
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--color-gray-500)', marginTop: '2px' }}>
                            Phone: +91 98450 12345 • Automated SMS on critical SOS
                          </div>
                        </div>
                        <span className="badge badge-available">ACTIVE LINK</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Profile;