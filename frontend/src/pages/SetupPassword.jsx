import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import API from '../services/api';
import StatusBadge from '../components/StatusBadge';

export default function SetupPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [verifying, setVerifying] = useState(true);
  const [tokenDetails, setTokenDetails] = useState(null);
  const [verifyError, setVerifyError] = useState(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setVerifying(false);
      setVerifyError('No setup token provided. Please use the activation link provided by your System Administrator.');
      return;
    }

    const verify = async () => {
      try {
        setVerifying(true);
        const res = await API.get(`/auth/setup-password?token=${encodeURIComponent(token)}`);
        setTokenDetails(res.data);
      } catch (err) {
        setVerifyError(err.response?.data?.error || 'Password setup link is invalid or has expired.');
      } finally {
        setVerifying(false);
      }
    };

    verify();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);

    if (!newPassword || newPassword.length < 6) {
      setSubmitError('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setSubmitError('Passwords do not match.');
      return;
    }

    try {
      setSubmitting(true);
      await API.post('/auth/setup-password', {
        token,
        newPassword
      });
      setSuccess(true);
    } catch (err) {
      setSubmitError(err.response?.data?.error || 'Failed to set password. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const getPasswordStrength = () => {
    if (!newPassword) return 0;
    let score = 0;
    if (newPassword.length >= 6) score += 33;
    if (newPassword.length >= 8) score += 33;
    if (/[A-Z]/.test(newPassword) && /[0-9!@#$%^&*]/.test(newPassword)) score += 34;
    return score;
  };

  const strength = getPasswordStrength();

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(circle at 50% 0%, #1e3a8a 0%, #0B1F3A 70%, #050d1a 100%)',
      padding: '24px',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      position: 'relative'
    }}>
      {/* Decorative Grid Mesh */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: 'radial-gradient(rgba(13, 148, 136, 0.15) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
        opacity: 0.6,
        pointerEvents: 'none'
      }} />

      <div className="card" style={{
        maxWidth: '480px',
        width: '100%',
        padding: '36px 32px',
        background: '#ffffff',
        borderRadius: '20px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.1)',
        position: 'relative',
        zIndex: 1
      }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #0D9488 0%, #2563EB 100%)',
            color: '#fff',
            fontSize: '24px',
            marginBottom: '14px',
            boxShadow: '0 8px 20px rgba(13, 148, 136, 0.3)'
          }}>
            🔐
          </div>
          <div style={{
            fontSize: '11px',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: '#0D9488',
            marginBottom: '4px'
          }}>
            Privileged Access Activation
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0B1F3A', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
            Set Account Password
          </h1>
          <p style={{ fontSize: '13px', color: '#64748B', margin: 0, lineHeight: 1.5 }}>
            VitalGuard Secure Clinical & Dispatch Network
          </p>
        </div>

        {verifying && (
          <div style={{ textAlign: 'center', padding: '36px 0' }}>
            <div className="status-spinner" style={{ margin: '0 auto 16px auto', width: '36px', height: '36px', borderWidth: '3px' }} />
            <p style={{ fontSize: '14px', color: '#64748B', fontWeight: 500 }}>Verifying cryptographic activation token...</p>
          </div>
        )}

        {!verifying && verifyError && (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              padding: '18px',
              borderRadius: '12px',
              fontSize: '14px',
              marginBottom: '24px',
              lineHeight: 1.5,
              textAlign: 'left'
            }}>
              <div style={{ fontWeight: 700, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>⚠️</span> Link Expired or Invalid
              </div>
              <div>{verifyError}</div>
            </div>
            <Link
              to="/login"
              className="btn btn-primary"
              style={{ width: '100%', display: 'inline-block', textAlign: 'center', textDecoration: 'none', padding: '12px' }}
            >
              Return to Login
            </Link>
          </div>
        )}

        {!verifying && !verifyError && success && (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              color: '#166534',
              padding: '24px 20px',
              borderRadius: '14px',
              fontSize: '14px',
              marginBottom: '24px',
              lineHeight: 1.6
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: '#dcfce7',
                color: '#16A34A',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                fontWeight: 800,
                marginBottom: '10px'
              }}>
                ✓
              </div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#166534', marginBottom: '4px' }}>
                Password Set Successfully!
              </div>
              <p style={{ margin: '8px 0 0 0', color: '#15803d' }}>
                Your account is now <strong>ACTIVE</strong> with verified credentials. You can now log in to access your role-specific console.
              </p>
            </div>
            <button
              onClick={() => navigate('/login')}
              className="btn btn-primary"
              style={{ width: '100%', padding: '13px', fontSize: '15px', fontWeight: 700 }}
            >
              Proceed to Login →
            </button>
          </div>
        )}

        {!verifying && !verifyError && !success && tokenDetails && (
          <div>
            {/* User Details Preview */}
            <div style={{
              background: '#F5F8FC',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              padding: '14px 16px',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', letterSpacing: '0.04em' }}>VERIFIED ACCOUNT</span>
                <StatusBadge status={tokenDetails.role} size="sm" />
              </div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#172B4D' }}>
                {tokenDetails.fullName || tokenDetails.email}
              </div>
              <div style={{ fontSize: '13px', color: '#64748B', marginTop: '2px' }}>
                {tokenDetails.email}
              </div>
            </div>

            {submitError && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                padding: '12px 14px',
                borderRadius: '10px',
                fontSize: '13px',
                marginBottom: '18px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>⚠️</span>
                <span>{submitError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#172B4D' }}>
                    New Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#0D9488',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0
                    }}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Enter secure password (min. 6 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoFocus
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />

                {/* Password strength bar */}
                {newPassword && (
                  <div style={{ marginTop: '8px' }}>
                    <div style={{
                      height: '4px',
                      width: '100%',
                      background: '#E2E8F0',
                      borderRadius: '2px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${strength}%`,
                        background: strength > 70 ? '#16A34A' : strength > 35 ? '#F59E0B' : '#DC2626',
                        transition: 'all 0.2s ease'
                      }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
                      <span>Strength</span>
                      <span>{strength > 70 ? 'Strong' : strength > 35 ? 'Moderate' : 'Weak (min. 6 chars)'}</span>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#172B4D', marginBottom: '6px' }}>
                  Confirm Password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  padding: '13px',
                  fontSize: '15px',
                  fontWeight: 700,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)'
                }}
              >
                {submitting ? 'Setting Password...' : 'Activate Account & Set Password'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

