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

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-main, #f8f9fb)',
      padding: '24px',
      fontFamily: 'Inter, sans-serif'
    }}>
      <div className="saas-card" style={{
        maxWidth: '460px',
        width: '100%',
        padding: '36px',
        background: '#ffffff',
        borderRadius: '16px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)',
        border: '1px solid var(--border-color, #e2e8f0)'
      }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '52px',
            height: '52px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
            color: '#fff',
            fontSize: '24px',
            marginBottom: '14px',
            boxShadow: '0 4px 12px rgba(13, 148, 136, 0.25)'
          }}>
            🔐
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary, #0f172a)', margin: '0 0 6px 0' }}>
            Account Password Setup
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary, #64748b)', margin: 0 }}>
            VitalGuard Secure Privileged Account Activation
          </p>
        </div>

        {verifying && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div className="status-spinner" style={{ margin: '0 auto 16px auto' }}></div>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary, #64748b)' }}>Verifying activation token...</p>
          </div>
        )}

        {!verifying && verifyError && (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              padding: '16px',
              borderRadius: '10px',
              fontSize: '14px',
              marginBottom: '24px',
              lineHeight: 1.5
            }}>
              ⚠️ {verifyError}
            </div>
            <Link
              to="/login"
              className="btn btn-secondary"
              style={{ width: '100%', display: 'inline-block', textAlign: 'center', textDecoration: 'none' }}
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
              padding: '20px',
              borderRadius: '12px',
              fontSize: '14px',
              marginBottom: '24px',
              lineHeight: 1.6
            }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>✓</div>
              <strong>Password Set Successfully!</strong>
              <p style={{ margin: '8px 0 0 0' }}>
                Your account is now <strong>ACTIVE</strong>. You can now log in to access your role-specific dashboard.
              </p>
            </div>
            <button
              onClick={() => navigate('/login')}
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: '15px' }}
            >
              Proceed to Login
            </button>
          </div>
        )}

        {!verifying && !verifyError && !success && tokenDetails && (
          <div>
            {/* User Details Preview */}
            <div style={{
              background: 'var(--bg-main, #f8f9fb)',
              border: '1px solid var(--border-color, #e2e8f0)',
              borderRadius: '10px',
              padding: '14px 16px',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted, #94a3b8)' }}>ACCOUNT</span>
                <StatusBadge status={tokenDetails.role} />
              </div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary, #0f172a)' }}>
                {tokenDetails.fullName || tokenDetails.email}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary, #64748b)' }}>
                {tokenDetails.email}
              </div>
            </div>

            {submitError && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                padding: '12px',
                borderRadius: '8px',
                fontSize: '13px',
                marginBottom: '16px'
              }}>
                {submitError}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #0f172a)', marginBottom: '6px' }}>
                  New Password
                </label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Enter secure password (min. 6 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoFocus
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #0f172a)', marginBottom: '6px' }}>
                  Confirm Password
                </label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Confirm your password"
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
                  padding: '12px',
                  fontSize: '15px',
                  fontWeight: 600,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '8px'
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
