import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Login - Section 20
 * Split screen:
 * Left: VitalGuard branding & healthcare visual
 * Right: Clean medical login form
 */

const demoAccounts = [
  { email: 'patient@vitaguard.com', role: 'PATIENT', label: 'Patient', icon: '👤' },
  { email: 'family@vitaguard.com', role: 'FAMILY_MEMBER', label: 'Family (Priya)', icon: '👨‍👩‍👧‍👦' },
  { email: 'doctor@vitaguard.com', role: 'DOCTOR', label: 'Doctor', icon: '👨‍⚕️' },
  { email: 'hospital-admin@vitalguard.com', role: 'HOSPITAL_ADMIN', label: 'Hospital Admin', icon: '🏥' },
  { email: 'ambulance-driver@vitalguard.com', role: 'AMBULANCE_DRIVER', label: 'Driver', icon: '🚑' },
  { email: 'sysadmin@vitaguard.com', role: 'SYSTEM_ADMIN', label: 'SysAdmin', icon: '⚡' },
];

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const userData = await login(email, password);
      switch (userData.role) {
        case 'PATIENT':
          navigate('/user-dashboard');
          break;
        case 'FAMILY_MEMBER':
          navigate('/family-dashboard');
          break;
        case 'DOCTOR':
        case 'HOSPITAL_ADMIN':
        case 'AMBULANCE_DRIVER':
          navigate('/healthcare-dashboard');
          break;
        case 'ADMIN':
        case 'SYSTEM_ADMIN':
          navigate('/admin');
          break;
        default:
          navigate('/healthcare-dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid credentials. Please verify your email and password.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDemo = (demo) => {
    setEmail(demo.email);
    setPassword('password');
    setError('');
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      backgroundColor: 'var(--color-gray-50)'
    }}>
      {/* Left Column: Medical Branding & Platform Visual */}
      <div style={{
        flex: 1,
        background: 'linear-gradient(135deg, #0a2540 0%, #163b6d 100%)',
        color: 'white',
        padding: 'var(--space-10) var(--space-8)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden'
      }} className="login-branding-col">
        {/* Subtle grid accent */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(rgba(56, 189, 248, 0.15) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          pointerEvents: 'none'
        }} />

        {/* Top Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', zIndex: 2 }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: 'var(--radius-lg)',
            background: 'white',
            color: 'var(--color-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
            boxShadow: 'var(--shadow-md)'
          }}>
            🛡️
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.02em', color: 'white' }}>
              VitalGuard
            </div>
            <div style={{ fontSize: '11px', color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Emergency Healthcare Command
            </div>
          </div>
        </div>

        {/* Center Hero Information */}
        <div style={{ maxWidth: '520px', zIndex: 2, margin: 'var(--space-8) 0' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '4px 12px',
            borderRadius: 'var(--radius-full)',
            background: 'rgba(56, 189, 248, 0.15)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            color: '#7dd3fc',
            fontSize: '12px',
            fontWeight: 700,
            marginBottom: 'var(--space-4)'
          }}>
            <span className="pulse-dot" style={{ backgroundColor: '#38bdf8' }} />
            <span>REAL-TIME EMERGENCY RESPONSE INFRASTRUCTURE</span>
          </div>

          <h1 style={{
            fontSize: '2.25rem',
            fontWeight: 900,
            color: 'white',
            lineHeight: 1.2,
            marginBottom: 'var(--space-4)'
          }}>
            Intelligent Emergency Triage & Hospital Coordination
          </h1>

          <p style={{
            fontSize: 'var(--font-size-base)',
            color: '#cbd5e1',
            lineHeight: 1.6,
            marginBottom: 'var(--space-6)'
          }}>
            Connecting patients, specialist physicians, emergency command centers, and ambulance units with real-time biometric telemetry and live route tracking.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.06)', padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <div style={{ fontWeight: 800, fontSize: '13px', color: '#67e8f9' }}>⚡ Sub-Second Triage</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>AI risk prioritization algorithm</div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.06)', padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <div style={{ fontWeight: 800, fontSize: '13px', color: '#67e8f9' }}>🚑 Live Fleet Telemetry</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Continuous GPS ambulance tracking</div>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div style={{ fontSize: '11px', color: '#94a3b8', zIndex: 2 }}>
          Protected by role-based medical access tokens • HIPAA & SOC2 Ready
        </div>
      </div>

      {/* Right Column: Authentication Form */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-6)'
      }}>
        <div style={{ width: '100%', maxWidth: '420px' }}>
          <div className="card" style={{ padding: 'var(--space-8)' }}>
            <div style={{ marginBottom: 'var(--space-6)' }}>
              <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--color-gray-900)' }}>
                Welcome to VitalGuard
              </h2>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-gray-500)', marginTop: '4px' }}>
                Sign in to your clinical or patient emergency account
              </p>
            </div>

            {error && (
              <div style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-critical-bg)',
                border: '1px solid var(--color-critical-border)',
                color: 'var(--color-critical)',
                fontSize: '12px',
                fontWeight: 600,
                marginBottom: 'var(--space-4)'
              }} role="alert">
                ⚠️ {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label" htmlFor="email-input">Email Address</label>
                <input
                  id="email-input"
                  type="email"
                  className="form-input"
                  placeholder="name@vitaguard.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: 'var(--space-6)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="form-label" htmlFor="password-input">Password</label>
                </div>
                <input
                  id="password-input"
                  type="password"
                  className="form-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full"
                style={{ padding: '11px', fontWeight: 800 }}
                disabled={loading}
              >
                {loading ? 'Authenticating...' : 'Sign In'}
              </button>
            </form>

            {/* Quick Demo Credentials Switcher */}
            <div style={{ marginTop: 'var(--space-6)', paddingTop: 'var(--space-5)', borderTop: '1px solid var(--color-gray-200)' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-gray-500)', textTransform: 'uppercase', marginBottom: '8px' }}>
                Quick Demo Role Switcher
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {demoAccounts.map(d => (
                  <button
                    key={d.role}
                    type="button"
                    onClick={() => handleSelectDemo(d)}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '11px', padding: '4px 8px' }}
                  >
                    <span>{d.icon}</span>
                    <span>{d.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Create account link */}
            <div style={{ marginTop: 'var(--space-6)', textAlign: 'center', fontSize: '13px', color: 'var(--color-gray-600)' }}>
              Need an account?{' '}
              <Link to="/signup" style={{ color: 'var(--color-secondary)', fontWeight: 700, textDecoration: 'none' }}>
                Create Patient Account
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;