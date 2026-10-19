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

  const [showPassword, setShowPassword] = useState(false);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      backgroundColor: 'var(--color-bg-main)'
    }}>
      {/* Left Column: Medical Branding & Platform Visual */}
      <div style={{
        flex: 1,
        background: 'linear-gradient(135deg, #0B1F3A 0%, #162E52 65%, #0D9488 120%)',
        color: 'white',
        padding: 'var(--space-10) var(--space-8)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden'
      }} className="login-branding-col">
        {/* Subtle grid and mesh accent */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(rgba(59, 130, 246, 0.18) 1.5px, transparent 1.5px)',
          backgroundSize: '24px 24px',
          pointerEvents: 'none'
        }} />

        <div style={{
          position: 'absolute',
          bottom: '-10%',
          right: '-10%',
          width: '420px',
          height: '420px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(13, 148, 136, 0.25) 0%, transparent 70%)',
          pointerEvents: 'none',
          filter: 'blur(30px)'
        }} />

        {/* Top Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', zIndex: 2 }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: 'var(--radius-lg)',
            background: 'linear-gradient(135deg, #FFFFFF 0%, #EFF6FF 100%)',
            color: 'var(--color-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
            boxShadow: '0 4px 14px rgba(11, 31, 58, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.3)'
          }}>
            🛡️
          </div>
          <div>
            <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', color: 'white' }}>
              VitalGuard
            </div>
            <div style={{ fontSize: '11px', color: '#5EEAD4', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
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
            padding: '6px 14px',
            borderRadius: 'var(--radius-full)',
            background: 'rgba(13, 148, 136, 0.22)',
            border: '1px solid rgba(13, 148, 136, 0.4)',
            color: '#CCFBF1',
            fontSize: '11px',
            fontWeight: 800,
            letterSpacing: '0.05em',
            marginBottom: 'var(--space-5)'
          }}>
            <span className="pulse-dot" style={{ backgroundColor: '#2DD4BF' }} />
            <span>REAL-TIME EMERGENCY RESPONSE INFRASTRUCTURE</span>
          </div>

          <h1 style={{
            fontSize: '2.5rem',
            fontWeight: 900,
            color: 'white',
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            marginBottom: 'var(--space-4)'
          }}>
            Intelligent Emergency Triage & Hospital Coordination
          </h1>

          <p style={{
            fontSize: 'var(--font-size-base)',
            color: '#E2E8F0',
            lineHeight: 1.6,
            marginBottom: 'var(--space-6)'
          }}>
            Connecting patients, specialist physicians, emergency command centers, and ambulance units with real-time biometric telemetry and live route tracking.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <div style={{
              background: 'rgba(255, 255, 255, 0.08)',
              backdropFilter: 'blur(10px)',
              padding: '14px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{ fontWeight: 800, fontSize: '13px', color: '#5EEAD4' }}>⚡ Sub-Second Triage</div>
              <div style={{ fontSize: '12px', color: '#CBD5E1', marginTop: '3px', lineHeight: 1.4 }}>AI risk prioritization and predictive vital regressions</div>
            </div>

            <div style={{
              background: 'rgba(255, 255, 255, 0.08)',
              backdropFilter: 'blur(10px)',
              padding: '14px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{ fontWeight: 800, fontSize: '13px', color: '#93C5FD' }}>🚑 Live Fleet Telemetry</div>
              <div style={{ fontSize: '12px', color: '#CBD5E1', marginTop: '3px', lineHeight: 1.4 }}>Continuous GPS ambulance tracking & smart hospital bed routing</div>
            </div>
          </div>
        </div>

        {/* Footer trust badge */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '11px',
          color: '#94A3B8',
          zIndex: 2,
          paddingTop: 'var(--space-4)',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <span>🔒 Protected by Role-Based Clinical Authorization</span>
          <span>•</span>
          <span>HIPAA & SOC2 Ready</span>
        </div>
      </div>

      {/* Right Column: Authentication Form */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-8)'
      }}>
        <div style={{ width: '100%', maxWidth: '440px' }}>
          <div className="card" style={{
            padding: 'var(--space-8)',
            boxShadow: 'var(--shadow-xl)',
            borderRadius: 'var(--radius-xl)'
          }}>
            <div style={{ marginBottom: 'var(--space-6)' }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 10px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-secondary-bg)',
                color: 'var(--color-secondary)',
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '8px'
              }}>
                Secure Clinical Gateway
              </div>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
                Welcome to VitalGuard
              </h2>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                Sign in to your clinical or patient emergency account
              </p>
            </div>

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
                <span>⚠️</span>
                <span>{error}</span>
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
                <div style={{ position: 'relative' }}>
                  <input
                    id="password-input"
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    style={{ paddingRight: '44px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '16px',
                      color: 'var(--color-text-secondary)',
                      padding: '4px'
                    }}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-blue w-full"
                style={{
                  padding: '12px',
                  fontWeight: 800,
                  fontSize: 'var(--font-size-base)',
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.28)'
                }}
                disabled={loading}
              >
                {loading ? 'Authenticating...' : 'Sign In to Portal'}
              </button>
            </form>

            {/* Quick Demo Credentials Switcher */}
            <div style={{ marginTop: 'var(--space-6)', paddingTop: 'var(--space-5)', borderTop: '1px solid var(--color-gray-200)' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '10px'
              }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Quick Demo Role Switcher
                </span>
                <span style={{ fontSize: '10px', color: 'var(--color-teal)', fontWeight: 700 }}>Auto-fill Test Login</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                {demoAccounts.map(d => {
                  const isSelected = email === d.email;
                  return (
                    <button
                      key={d.role}
                      type="button"
                      onClick={() => handleSelectDemo(d)}
                      className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                      style={{
                        fontSize: '11px',
                        padding: '6px 8px',
                        justifyContent: 'flex-start',
                        gap: '6px'
                      }}
                      title={`Login as ${d.label}`}
                    >
                      <span>{d.icon}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Create account link */}
            <div style={{ marginTop: 'var(--space-6)', textAlign: 'center', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              Need an emergency monitoring account?{' '}
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