import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import API, { isActiveEmergency, useApiResource } from '../services/api';
import { useRealtimeRefresh } from '../services/websocket';
import DashboardLayout from '../components/DashboardLayout';
import VitalCard from '../components/VitalCard';
import EmergencyTimeline from '../components/EmergencyTimeline';
import EmergencyAlert from '../components/EmergencyAlert';
import StatusBadge from '../components/StatusBadge';
import GoogleMapTracking from '../components/GoogleMapTracking';
import ConfirmModal from '../components/ConfirmModal';
import { EmptyState } from '../components/StateComponents';

const getWorkflowAmbulanceStatus = (sos, tracking) => {
  if (!sos) return 'Standby';
  if (sos.requiresAmbulance === false || sos.status === 'AMBULANCE_NOT_REQUIRED') {
    return 'Not Required';
  }
  if (tracking?.status) {
    return tracking.status.replace(/_/g, ' ');
  }
  if (sos.ambulanceStatus) {
    return sos.ambulanceStatus.replace(/_/g, ' ');
  }
  switch (sos.status) {
    case 'CREATED':
    case 'SEARCHING_HOSPITAL':
    case 'DETECTED':
      return 'Searching Hospital';
    case 'HOSPITAL_ASSIGNED':
      return 'Awaiting Hospital Acceptance';
    case 'HOSPITAL_ACCEPTED':
      return 'Hospital Accepted - Assigning';
    case 'AMBULANCE_REQUESTED':
      return 'Request Sent to Driver';
    case 'AMBULANCE_ACCEPTED':
      return 'Driver Accepted - Preparing Dispatch';
    case 'AMBULANCE_DISPATCHED':
    case 'EN_ROUTE_TO_PATIENT':
      return 'En Route to Patient';
    case 'ARRIVED_AT_PATIENT':
      return 'Arrived at Patient';
    case 'PATIENT_PICKED_UP':
      return 'Patient Picked Up';
    case 'EN_ROUTE_TO_HOSPITAL':
      return 'En Route to Hospital';
    case 'ARRIVED_AT_HOSPITAL':
      return 'Arrived at Hospital';
    case 'RESOLVED':
    case 'COMPLETED':
      return 'Resolved';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return sos.status ? sos.status.replace(/_/g, ' ') : 'Standby';
  }
};

const UserDashboard = () => {
  const { user } = useAuth();
  const [trackedEmergencyId, setTrackedEmergencyId] = useState(null);

  // Read initial tab from URL query parameter if present
  const getInitialTab = () => {
    if (typeof window !== 'undefined' && window.location.search) {
      const tabParam = new URLSearchParams(window.location.search).get('tab');
      if (tabParam === 'chat' || tabParam === 'med-ai' || tabParam === 'advisor') return 'chat';
      if (tabParam === 'emergency' || tabParam === 'sos') return 'emergency';
      if (tabParam === 'history') return 'history';
    }
    return 'overview';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);

  const switchTab = (tabKey) => {
    setActiveTab(tabKey);
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      const newUrl = tabKey === 'overview' ? '/user-dashboard' : `/user-dashboard?tab=${tabKey}`;
      window.history.replaceState(null, '', newUrl);
    }
  };

  // Listen to popstate (browser back/forward or sidebar clicks)
  useEffect(() => {
    const handleUrlChange = () => {
      const tabParam = new URLSearchParams(window.location.search).get('tab');
      if (tabParam === 'chat' || tabParam === 'med-ai' || tabParam === 'advisor') setActiveTab('chat');
      else if (tabParam === 'emergency' || tabParam === 'sos') setActiveTab('emergency');
      else if (tabParam === 'history') setActiveTab('history');
      else if (tabParam === 'overview') setActiveTab('overview');
    };
    window.addEventListener('popstate', handleUrlChange);
    return () => window.removeEventListener('popstate', handleUrlChange);
  }, []);

  // WebSocket real-time subscription
  const { connected: wsConnected, revision, refresh, tracking: trackingData } = useRealtimeRefresh(user?.uid, trackedEmergencyId, user?.uid, user);

  // Vitals history from API
  const { data: storedVitals } = useApiResource('/vitals/history', revision);
  const vitalsHistory = Array.isArray(storedVitals) ? storedVitals : [];
  const latestVital = vitalsHistory[0] ?? null;

  // AI Trend analysis
  const { data: trendAnalysis } = useApiResource(user ? `/analysis/predict/${user.uid}` : null, revision);

  // AI Predictive Assessment & Personalized Baseline from backend
  const [aiAssessment, setAiAssessment] = useState(null);
  const [aiBaseline, setAiBaseline] = useState(null);

  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;

    API.get(`/ai/patients/${user.uid}/assessment`)
      .then(res => {
        if (!cancelled && res.status === 200 && res.data) {
          setAiAssessment(res.data);
        }
      })
      .catch(() => {});

    API.get(`/ai/patients/${user.uid}/baseline`)
      .then(res => {
        if (!cancelled && res.status === 200 && res.data) {
          setAiBaseline(res.data);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [user?.uid, revision]);

  // Active Emergency queue
  const { data: activeQueue } = useApiResource('/emergency/active', revision);
  const activeSos = Array.isArray(activeQueue) ? activeQueue.find(isActiveEmergency) : null;
  const activeId = activeSos?.id ?? null;

  if (trackedEmergencyId !== activeId) {
    setTrackedEmergencyId(activeId);
  }

  // Assigned Hospital & Doctor
  const { data: assignedHospital } = useApiResource(activeId != null ? `/emergencies/${activeId}/hospital` : null, revision);
  const { data: assignedDoctor } = useApiResource(activeId != null ? `/emergencies/${activeId}/doctor` : null, revision);

  // Emergency history
  const { data: emergencyHistory } = useApiResource('/hospital/emergencies', revision);
  const pastEmergencies = Array.isArray(emergencyHistory) ? emergencyHistory : [];
  const [selectedPastSos, setSelectedPastSos] = useState(null);
  const [pastTimelineEvents, setPastTimelineEvents] = useState([]);

  // Confirmation modal state
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [symptomList, setSymptomList] = useState(['Chest Pain']);
  const [symptomDesc, setSymptomDesc] = useState('');
  const [isDispatching, setIsDispatching] = useState(false);

  // Simulation mode
  const [simulating, setSimulating] = useState(false);
  const [simStep, setSimStep] = useState('');

  // Vital entry form
  const [vitalForm, setVitalForm] = useState({
    heart_rate: 78,
    spO2: 98,
    bp_systolic: 120,
    bp_diastolic: 80,
    temperature: 36.7
  });

  // Med-AI Chat Advisor state
  const messagesEndRef = useRef(null);
  const [chatInput, setChatInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    {
      id: 'init-1',
      sender: 'AI',
      text: `Hello ${user?.fullName?.split(' ')[0] || 'Patient'}. I am your VitalGuard Med-AI clinical advisor. I continuously analyze your live telemetry (Heart Rate: ${latestVital?.heartRate ?? 78} BPM, SpO2: ${latestVital?.spo2 ?? 98}%, Temp: ${latestVital?.temperature ?? 36.7}°C). How are you feeling today, or what symptoms would you like to discuss?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      urgent: false
    }
  ]);

  useEffect(() => {
    if (activeTab === 'chat' && typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isAiTyping, activeTab]);

  const handleSendChat = (overrideText = null) => {
    const textToSend = typeof overrideText === 'string' ? overrideText : chatInput;
    if (!textToSend.trim()) return;

    const userMsg = {
      id: `usr-${Date.now()}`,
      sender: 'User',
      text: textToSend.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      urgent: false
    };

    setChatMessages(prev => [...prev, userMsg]);
    if (!overrideText) setChatInput('');
    setIsAiTyping(true);

    const lower = textToSend.toLowerCase();
    const hr = latestVital?.heartRate ?? 78;
    const spo2 = latestVital?.spo2 ?? 98;
    const temp = latestVital?.temperature ?? 36.7;

    setTimeout(() => {
      let aiText = '';
      let isUrgent = false;

      // Clinical triage heuristics
      if (
        lower.includes('chest') ||
        lower.includes('crush') ||
        lower.includes('heart attack') ||
        lower.includes('tightness') ||
        hr > 120 ||
        spo2 < 90
      ) {
        isUrgent = true;
        aiText = `🚨 URGENT CLINICAL ALERT: Symptoms matching acute cardiac distress or severe vital instability detected. Your current telemetry displays HR: ${hr} BPM and SpO2: ${spo2}%. Chest pain and rapid arrhythmias require immediate intervention. Do not attempt to drive yourself. Press the EMERGENCY SOS button below immediately to dispatch the nearest emergency unit.`;
      } else if (
        lower.includes('palpitation') ||
        lower.includes('pulse') ||
        lower.includes('tachycardia') ||
        lower.includes('racing') ||
        hr > 100
      ) {
        aiText = `💓 Cardiac Telemetry Evaluation: Your recorded heart rate is currently ${hr} BPM. Resting pulse above 100 BPM (tachycardia) can be caused by dehydration, anxiety, caffeine, or an arrhythmia. Sit in a comfortable position, take slow diaphragmatic breaths, and drink water. If you feel lightheaded, nauseous, or feel chest heaviness, trigger the SOS dispatcher right away.`;
      } else if (
        lower.includes('breath') ||
        lower.includes('oxygen') ||
        lower.includes('spo2') ||
        lower.includes('wheez') ||
        lower.includes('dyspnea')
      ) {
        if (spo2 < 94) {
          isUrgent = true;
          aiText = `🫁 Respiratory Warning: Your oxygen saturation is currently ${spo2}% (Normal baseline is ≥ 95%). Oxygen levels below 94% indicate compromised gas exchange. Please sit upright, loosen any restrictive clothing, and seek urgent clinical assistance if you struggle to speak full sentences.`;
        } else {
          aiText = `🫁 Respiratory Evaluation: Your current SpO2 is nominal at ${spo2}%. Normal arterial oxygen saturation remains between 95% and 100%. If shortness of breath persists despite nominal oxygenation, it may be related to bronchospasm, hyperventilation, or anxiety. Keep monitoring your vitals.`;
        }
      } else if (
        lower.includes('fever') ||
        lower.includes('temperature') ||
        lower.includes('chills') ||
        temp > 38.0
      ) {
        aiText = `🌡️ Thermal Telemetry Evaluation: Recorded body temperature is ${temp}°C. ${temp >= 38.0 ? 'A temperature above 38.0°C denotes an active pyrexic response (fever).' : 'Your temperature is currently within safe limits.'} Stay well-hydrated, monitor for stiff neck or severe headache, and log new vitals every 30 minutes to track progression.`;
      } else if (
        lower.includes('baseline') ||
        lower.includes('anomaly') ||
        lower.includes('deviation') ||
        lower.includes('monitor')
      ) {
        const blHrMin = Math.round(aiBaseline?.normalHeartRateMin || 60);
        const blHrMax = Math.round(aiBaseline?.normalHeartRateMax || 100);
        const blSpo2 = Math.round(aiBaseline?.normalSpo2Min || 95);
        aiText = `📊 Personalized Baseline Analysis: Your historical baseline thresholds are established as: Normal HR: ${blHrMin}-${blHrMax} BPM, SpO2 floor: ≥ ${blSpo2}%, Temperature: ${(aiBaseline?.normalTemperatureMin || 36.0).toFixed(1)}-${(aiBaseline?.normalTemperatureMax || 37.5).toFixed(1)}°C. Your current readings are within ${hr >= blHrMin && hr <= blHrMax ? 'stable physiological parameters' : 'anomalous deviation'}. Unified Risk Score: ${aiAssessment?.riskScore || 14}/100.`;
      } else if (
        lower.includes('sos') ||
        lower.includes('emergency') ||
        lower.includes('when should i')
      ) {
        aiText = `🚑 VitalGuard Emergency Protocol: Trigger Emergency SOS immediately if you experience: 1) Crushing or squeezing chest pain, 2) Sudden weakness, speech difficulty, or facial drooping, 3) Acute shortness of breath, 4) Heart rate exceeding 130 BPM at rest, 5) Unexplained loss of consciousness. VitalGuard automatically alerts the nearest emergency department and coordinates live ambulance dispatch.`;
      } else {
        aiText = `VitalGuard Med-AI Clinical Assessment: I have logged your inquiry ("${textToSend}"). Current vital parameters (HR: ${hr} BPM, SpO2: ${spo2}%, Temp: ${temp}°C) indicate ${aiAssessment?.severity === 'CRITICAL' ? 'CRITICAL INSTABILITY' : 'a stable clinical profile'}. Please remember that this is an AI-assisted triage companion and not a formal medical diagnosis. If you feel sudden discomfort, utilize the Emergency SOS trigger at any moment.`;
      }

      const aiMsg = {
        id: `ai-${Date.now()}`,
        sender: 'AI',
        text: aiText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        urgent: isUrgent
      };

      setChatMessages(prev => [...prev, aiMsg]);
      setIsAiTyping(false);
    }, 600);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const handleSymptomToggle = (symptom) => {
    setSymptomList(prev =>
      prev.includes(symptom) ? prev.filter(s => s !== symptom) : [...prev, symptom]
    );
  };

  const handleEmergencyClick = () => {
    setIsConfirmModalOpen(true);
  };

  const executeSosTrigger = async (lat, lng) => {
    try {
      setIsDispatching(true);
      await API.post('/emergency/sos', {
        alert_message: symptomList.join(', '),
        description: symptomDesc,
        symptoms: symptomList,
        location: { lat, lng }
      });
      setIsConfirmModalOpen(false);
      switchTab('emergency');
      refresh();
    } catch {
      alert('Failed to dispatch emergency SOS. Please call emergency services directly.');
    } finally {
      setIsDispatching(false);
    }
  };

  const confirmAndDispatchSos = async () => {
    let lat = user?.latitude || 12.9716;
    let lng = user?.longitude || 77.5946;

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
          await executeSosTrigger(lat, lng);
        },
        async () => {
          await executeSosTrigger(lat, lng);
        },
        { timeout: 5000 }
      );
    } else {
      await executeSosTrigger(lat, lng);
    }
  };

  const startSimulation = async () => {
    try {
      setSimulating(true);
      setSimStep('Step 1: Normal vitals baseline logging...');
      await API.post('/vitals', {
        heart_rate: 72,
        spO2: 98,
        temperature: 36.6,
        latitude: user?.latitude || 12.9716,
        longitude: user?.longitude || 77.5946
      });
      refresh();

      await new Promise(r => setTimeout(r, 1500));
      setSimStep('Step 2: Detecting elevated cardiac anomalies...');
      await API.post('/vitals', {
        heart_rate: 104,
        spO2: 90,
        temperature: 37.9,
        latitude: user?.latitude || 12.9716,
        longitude: user?.longitude || 77.5946
      });
      refresh();

      await new Promise(r => setTimeout(r, 1500));
      setSimStep('Step 3: Critical tachycardia crash detected. Triggering automated SOS dispatch...');
      await API.post('/vitals', {
        heart_rate: 145,
        spO2: 82,
        temperature: 39.8,
        latitude: user?.latitude || 12.9716,
        longitude: user?.longitude || 77.5946
      });
      refresh();

      setSimStep('Step 4: AI triage matched CRITICAL severity. Nearest hospital assigned.');
      setTimeout(() => {
        refresh();
        switchTab('emergency');
        setSimulating(false);
        setSimStep('');
      }, 1500);
    } catch {
      setSimulating(false);
      setSimStep('');
    }
  };

  const postVital = async (e) => {
    e.preventDefault();
    try {
      await API.post('/vitals', {
        ...vitalForm,
        latitude: user?.latitude || 12.9716,
        longitude: user?.longitude || 77.5946
      });
      alert('Vitals logged successfully.');
      refresh();
    } catch {
      alert('Failed to log vitals.');
    }
  };

  const getVitalStatus = (name, val) => {
    if (val == null) return 'normal';
    if (name === 'hr') {
      if (val > 120 || val < 50) return 'critical';
      if (val > 100 || val < 60) return 'warning';
      return 'normal';
    }
    if (name === 'spo2') {
      if (val < 90) return 'critical';
      if (val < 95) return 'warning';
      return 'normal';
    }
    if (name === 'temp') {
      if (val > 38.5 || val < 35.5) return 'critical';
      if (val > 37.5 || val < 36.0) return 'warning';
      return 'normal';
    }
    return 'normal';
  };

  // Render Overview View (Section 3 + Med-AI Health Monitor)
  const renderOverviewTab = () => {
    const riskScore = aiAssessment?.riskScore ?? (trendAnalysis?.risk_score || 14);
    const severity = aiAssessment?.severity || (riskScore > 75 ? 'CRITICAL' : riskScore > 50 ? 'HIGH' : riskScore > 25 ? 'MODERATE' : 'LOW');

    const getSeverityBadgeClass = (s) => {
      switch (s) {
        case 'CRITICAL': return 'badge-critical';
        case 'HIGH': return 'badge-high';
        case 'MODERATE': return 'badge-moderate';
        default: return 'badge-low';
      }
    };

    const getGaugeColor = (s) => {
      switch (s) {
        case 'CRITICAL': return 'var(--color-critical)';
        case 'HIGH': return 'var(--color-warning)';
        case 'MODERATE': return '#eab308';
        default: return 'var(--color-success)';
      }
    };

    return (
      <div>
        {/* Top section - Section 3 */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)'
        }}>
          <div>
            <h2 style={{
              fontSize: 'var(--font-size-3xl)',
              fontWeight: 'var(--font-weight-extrabold)',
              color: 'var(--color-gray-900)',
              marginBottom: '4px'
            }}>
              {getGreeting()}, {user?.fullName?.split(' ')[0] || 'Patient'}
            </h2>
            <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-gray-500)' }}>
              Your health and emergency care, all in one place.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
            <button
              onClick={() => switchTab('chat')}
              className="btn btn-primary btn-sm"
              title="Open Med-AI Chat Advisor"
            >
              🤖 Consult Med-AI Advisor
            </button>
            <button
              onClick={startSimulation}
              disabled={simulating || activeSos}
              className="btn btn-secondary btn-sm"
              title="Simulate critical triage telemetry"
            >
              ⚡ {simulating ? 'Simulating...' : 'Test Emergency Simulation'}
            </button>
          </div>
        </div>

        {/* Simulator active alert */}
        {simulating && (
          <div style={{
            background: 'var(--color-secondary-bg)',
            border: '1px solid var(--color-secondary-border)',
            borderRadius: 'var(--radius-lg)',
            padding: '12px 16px',
            marginBottom: 'var(--space-5)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <span style={{ fontSize: '20px' }}>⚡</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--color-secondary)' }}>
                Simulation Mode Active
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-gray-600)' }}>
                {simStep}
              </div>
            </div>
          </div>
        )}

        {/* Active Emergency Notification Banner if SOS is live */}
        {activeSos && (
          <div style={{ marginBottom: 'var(--space-6)' }}>
            <EmergencyAlert
              emergency={activeSos}
              onView={() => switchTab('emergency')}
              role="patient"
              isAccepted={true}
            />
          </div>
        )}

        {/* Section 3 Cards: Heart Rate, SpO2, Temperature, AI Risk Score */}
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 'var(--space-4)'
          }}>
            <VitalCard
              type="hr"
              label="Heart Rate"
              value={latestVital?.heartRate ?? 78}
              unit="BPM"
              icon="❤️"
              status={getVitalStatus('hr', latestVital?.heartRate ?? 78)}
            />

            <VitalCard
              type="spo2"
              label="SpO2"
              value={latestVital?.spo2 ?? 98}
              unit="%"
              icon="🫁"
              status={getVitalStatus('spo2', latestVital?.spo2 ?? 98)}
            />

            <VitalCard
              type="temp"
              label="Temperature"
              value={latestVital?.temperature ?? 36.7}
              unit="°C"
              icon="🌡️"
              status={getVitalStatus('temp', latestVital?.temperature ?? 36.7)}
            />

            <VitalCard
              type="risk"
              label="AI Risk Score"
              value={riskScore}
              unit="/100"
              icon="🤖"
              status={severity === 'CRITICAL' ? 'critical' : severity === 'HIGH' ? 'warning' : 'normal'}
            />
          </div>
        </div>

        {/* Visually Prominent Emergency Action - Section 3 */}
        {!activeSos && (
          <div style={{ marginBottom: 'var(--space-8)' }}>
            <button
              onClick={handleEmergencyClick}
              className="btn-emergency-hero"
              aria-label="Request immediate medical assistance"
            >
              <div className="btn-emergency-hero-title">
                <span>🚨</span>
                <span>EMERGENCY SOS</span>
              </div>
              <div className="btn-emergency-hero-subtitle">
                Request immediate medical assistance & hospital dispatch
              </div>
            </button>
          </div>
        )}

        {/* 2-Column Section: Med-AI Predictive Health Monitor & Vital Intake Registry */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: 'var(--space-5)',
          marginBottom: 'var(--space-6)'
        }}>
          {/* Med-AI Health Monitor Card */}
          <div className="med-ai-monitor-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>🧠</span>
                <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 800, color: 'var(--color-gray-900)', margin: 0 }}>
                  Med-AI Predictive Health Monitor
                </h3>
              </div>
              <span className={`badge ${getSeverityBadgeClass(severity)}`}>
                {severity}
              </span>
            </div>

            {/* Unified Risk Fusion Gauge */}
            <div className="med-ai-gauge-container">
              <div className="med-ai-gauge-header">
                <span style={{ color: 'var(--color-gray-600)' }}>Unified Risk Fusion</span>
                <span style={{ color: getGaugeColor(severity) }}>
                  {riskScore} / 100
                </span>
              </div>
              <div className="med-ai-gauge-track">
                <div
                  className="med-ai-gauge-bar"
                  style={{
                    width: `${Math.min(100, Math.max(5, riskScore))}%`,
                    background: getGaugeColor(severity)
                  }}
                />
              </div>
            </div>

            {/* Personalized Baseline Vitals & Deterioration Metrics */}
            <div className="med-ai-metric-grid">
              <div className="med-ai-metric-item">
                <span className="med-ai-metric-label">Deterioration Prob</span>
                <span className="med-ai-metric-value" style={{ color: aiAssessment?.deteriorationProbability > 0.3 ? 'var(--color-critical)' : 'inherit' }}>
                  {aiAssessment?.deteriorationProbability ? (aiAssessment.deteriorationProbability * 100).toFixed(0) : '4'}%
                </span>
              </div>

              <div className="med-ai-metric-item">
                <span className="med-ai-metric-label">Anomaly Dev Score</span>
                <span className="med-ai-metric-value" style={{ color: (aiAssessment?.anomalyScore || 0) > 30 ? 'var(--color-critical)' : 'inherit' }}>
                  {aiAssessment?.anomalyScore ?? 0} / 100
                </span>
              </div>

              <div className="med-ai-metric-item">
                <span className="med-ai-metric-label">Baseline HR Range</span>
                <span className="med-ai-metric-value">
                  {Math.round(aiBaseline?.normalHeartRateMin || 60)} - {Math.round(aiBaseline?.normalHeartRateMax || 100)} BPM
                </span>
              </div>

              <div className="med-ai-metric-item">
                <span className="med-ai-metric-label">SpO2 Threshold</span>
                <span className="med-ai-metric-value">
                  &ge; {Math.round(aiBaseline?.normalSpo2Min || 95)}%
                </span>
              </div>
            </div>

            {/* Clinical Explanations & Insights */}
            <div style={{ borderTop: '1px solid var(--color-gray-200)', paddingTop: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-gray-500)', textTransform: 'uppercase', marginBottom: '6px' }}>
                AI Predictive Clinical Insights
              </div>
              {aiAssessment?.explanations ? (
                <ul style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px', margin: 0, fontSize: '13px' }}>
                  {aiAssessment.explanations.split('; ').map((item, idx) => (
                    <li key={idx} style={{ color: item.includes('offline') || item.includes('differ') || item.includes('exceed') ? 'var(--color-critical)' : 'var(--color-gray-700)' }}>
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={{ fontSize: '13px', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>✓</span>
                  <span>Continuous vitals telemetry aligns with nominal baseline parameters.</span>
                </div>
              )}
            </div>

            {/* Action Bar */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button
                onClick={() => switchTab('chat')}
                className="btn btn-secondary btn-sm w-full"
              >
                🤖 Consult Med-AI Chat Advisor
              </button>
            </div>

            <p style={{ fontSize: '10px', color: 'var(--color-gray-400)', fontStyle: 'italic', margin: 0 }}>
              AI-assisted clinical triage support. Prototype model — does not substitute emergency medical diagnosis.
            </p>
          </div>

          {/* Log Vitals Card */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <span>✍️</span>
                <span>Log Current Vitals</span>
              </h3>
              <span style={{ fontSize: '11px', color: 'var(--color-gray-500)' }}>Personal record</span>
            </div>
            <div className="card-content">
              <form onSubmit={postVital} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div className="form-group">
                  <label className="form-label">Heart Rate (BPM)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={vitalForm.heart_rate}
                    onChange={e => setVitalForm(p => ({ ...p, heart_rate: parseInt(e.target.value) || 0 }))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">SpO2 (%)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={vitalForm.spO2}
                    onChange={e => setVitalForm(p => ({ ...p, spO2: parseInt(e.target.value) || 0 }))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Temp (°C)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="form-input"
                    value={vitalForm.temperature}
                    onChange={e => setVitalForm(p => ({ ...p, temperature: parseFloat(e.target.value) || 0 }))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">BP Systolic</label>
                  <input
                    type="number"
                    className="form-input"
                    value={vitalForm.bp_systolic}
                    onChange={e => setVitalForm(p => ({ ...p, bp_systolic: parseInt(e.target.value) || 0 }))}
                  />
                </div>

                <div style={{ gridColumn: '1 / -1', marginTop: '4px' }}>
                  <button type="submit" className="btn btn-primary w-full">
                    💾 Record Vitals & Update AI Telemetry
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render Med-AI Chat Advisor Tab
  const renderChatTab = () => (
    <div className="med-ai-chat-card">
      {/* Med-AI Header */}
      <div className="med-ai-chat-header">
        <div className="med-ai-chat-header-title">
          <div className="med-ai-chat-avatar-badge" aria-hidden="true">
            🤖
          </div>
          <div className="med-ai-header-text">
            <h3>
              <span>Clinical Med-AI Chat Advisor</span>
              <span style={{ fontSize: '10px', background: 'rgba(16, 185, 129, 0.25)', color: '#a7f3d0', padding: '2px 8px', borderRadius: '12px' }}>
                LIVE READY
              </span>
            </h3>
            <p>Intelligent clinical triage, symptom analysis & emergency guidance</p>
          </div>
        </div>

        {/* Live Telemetry Pill */}
        <div className="med-ai-telemetry-pill">
          <span>❤️ {latestVital?.heartRate ?? 78} BPM</span>
          <span>🫁 {latestVital?.spo2 ?? 98}%</span>
          <span>🌡️ {latestVital?.temperature ?? 36.7}°C</span>
        </div>
      </div>

      {/* Safety Triage Disclaimer Banner */}
      <div className="med-ai-safety-banner">
        <div>
          <strong>Medical Notice:</strong> Med-AI analyzes telemetry for clinical advisory support only. For chest crushing pain or severe distress, trigger immediate SOS.
        </div>
        <button
          onClick={handleEmergencyClick}
          className="btn btn-critical btn-xs"
          style={{ whiteSpace: 'nowrap' }}
        >
          🚨 Immediate SOS
        </button>
      </div>

      {/* Quick Prompts Chips */}
      <div className="med-ai-quick-prompts">
        {[
          '🚨 Evaluate my current cardiac vitals',
          '💓 I feel racing heart palpitations',
          '🫁 Shortness of breath when resting',
          '🌡️ High fever and dizziness advice',
          '📊 Explain my personalized baseline',
          '🚑 When should I trigger emergency SOS?'
        ].map((prompt, idx) => (
          <button
            key={idx}
            className="med-ai-prompt-chip"
            onClick={() => handleSendChat(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Messages Scroll Area */}
      <div className="med-ai-messages-list">
        {chatMessages.map((msg) => (
          <div key={msg.id} className={`med-ai-msg-row ${msg.sender === 'AI' ? 'ai' : 'user'}`}>
            <div className={`med-ai-msg-avatar ${msg.sender === 'AI' ? 'ai' : 'user'}`} aria-hidden="true">
              {msg.sender === 'AI' ? '🤖' : '👤'}
            </div>
            <div className="med-ai-bubble">
              <div style={{ whiteSpace: 'pre-line' }}>{msg.text}</div>

              {msg.urgent && (
                <button
                  onClick={handleEmergencyClick}
                  className="med-ai-bubble-urgent-btn"
                >
                  🚨 TRIGGER EMERGENCY SOS DISPATCH NOW
                </button>
              )}

              <div className="med-ai-bubble-meta">
                <span>{msg.timestamp}</span>
                {msg.sender === 'AI' && <span>• VitalGuard Med-AI</span>}
              </div>
            </div>
          </div>
        ))}

        {isAiTyping && (
          <div className="med-ai-msg-row ai">
            <div className="med-ai-msg-avatar ai" aria-hidden="true">🤖</div>
            <div className="med-ai-typing-indicator">
              <span>Med-AI is analyzing clinical telemetry</span>
              <div className="med-ai-dot" />
              <div className="med-ai-dot" />
              <div className="med-ai-dot" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Input Area */}
      <div className="med-ai-input-bar">
        <input
          type="text"
          className="med-ai-input-field"
          placeholder="Describe symptoms or ask about vital signs (e.g., chest tightness, heart palpitations)..."
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSendChat()}
        />
        <button
          onClick={() => handleSendChat()}
          className="btn btn-primary"
          style={{ borderRadius: 'var(--radius-full)', padding: '10px 22px' }}
        >
          Send
        </button>
        <button
          onClick={handleEmergencyClick}
          className="btn btn-critical"
          style={{ borderRadius: 'var(--radius-full)', padding: '10px 16px' }}
          title="Trigger emergency SOS"
        >
          🚨 SOS
        </button>
      </div>
    </div>
  );

  // Render Emergency Tab (Section 4)
  const renderEmergencyTab = () => {
    if (!activeSos) {
      return (
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <span>🚨</span>
                <span>Immediate Medical SOS</span>
              </h3>
            </div>
            <div className="card-content">
              <p style={{ color: 'var(--color-gray-600)', marginBottom: 'var(--space-5)', textAlign: 'center' }}>
                If you or someone nearby is experiencing acute symptoms, initiate an emergency dispatch immediately.
              </p>

              <button
                onClick={handleEmergencyClick}
                className="btn-emergency-hero"
                style={{ padding: 'var(--space-6)' }}
              >
                <span style={{ fontSize: '20px' }}>🚨 TRIGGER EMERGENCY SOS DISPATCH</span>
                <span style={{ fontSize: '13px', opacity: 0.9, marginTop: '4px' }}>
                  Connects to Hospital Emergency Dispatch Center
                </span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Active Emergency View (Section 4)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        {/* Section 4: Premium Emergency Status Card */}
        <div className="active-emergency-status-card">
          <div className="emergency-status-row">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '22px' }}>🚨</span>
                <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-critical)' }}>
                  ACTIVE EMERGENCY (SOS-{activeSos.id})
                </span>
                <StatusBadge status={activeSos.severity || 'CRITICAL'} size="sm" />
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-gray-500)', marginTop: '4px' }}>
                Incident registered: {new Date(activeSos.createdAt || Date.now()).toLocaleTimeString()}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
              <div className="emergency-status-item">
                <span className="emergency-status-label">Risk Score</span>
                <span className="emergency-status-value" style={{ color: 'var(--color-critical)' }}>
                  {activeSos.riskScore != null ? `${activeSos.riskScore} / 100` : 'Assessing...'}
                </span>
              </div>

              <div className="emergency-status-item">
                <span className="emergency-status-label">Assigned Hospital</span>
                <span className="emergency-status-value">
                  {assignedHospital?.name || activeSos.hospitalName || 'Searching Hospital...'}
                </span>
              </div>

              <div className="emergency-status-item">
                <span className="emergency-status-label">Specialist Doctor</span>
                <span className="emergency-status-value">
                  {assignedDoctor?.name ? `Dr. ${assignedDoctor.name}` : (activeSos.doctorName ? (activeSos.doctorName.startsWith('Dr.') ? activeSos.doctorName : `Dr. ${activeSos.doctorName}`) : (activeSos.status === 'HOSPITAL_ASSIGNED' ? 'Pending Acceptance' : 'Awaiting Assignment'))}
                </span>
              </div>

              <div className="emergency-status-item">
                <span className="emergency-status-label">Ambulance</span>
                <span className="emergency-status-value" style={{ color: 'var(--color-secondary)' }}>
                  {getWorkflowAmbulanceStatus(activeSos, trackingData)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Large Google Map Live Ambulance Tracking */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.8fr) minmax(0, 1.2fr)',
          gap: 'var(--space-5)'
        }}>
          <div>
            <div style={{ marginBottom: 'var(--space-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 'var(--font-size-md)', fontWeight: 800, color: 'var(--color-gray-900)' }}>
                🗺️ Live Ambulance Tracking
              </h3>
              <span style={{ fontSize: '12px', color: 'var(--color-secondary)', fontWeight: 600 }}>
                📍 Patient • 🚑 Ambulance • 🏥 Hospital
              </span>
            </div>

            <GoogleMapTracking
              patientLocation={[activeSos.latitude, activeSos.longitude]}
              hospitalLocation={assignedHospital ? [assignedHospital.lat, assignedHospital.lng] : null}
              ambulanceLocation={trackingData?.ambulanceLatitude ? [trackingData.ambulanceLatitude, trackingData.ambulanceLongitude] : null}
              ambulanceStatus={trackingData?.status || activeSos.status}
              ambulanceUnitId={trackingData?.ambulanceUnitId || activeSos.ambulanceUnitId || 'AMB-102'}
              driverName={trackingData?.driverName}
              emergencyId={activeSos.id}
              height="440px"
            />
          </div>

          {/* Section 4: Emergency Response Timeline */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <span>📋</span>
                <span>Response Progress</span>
              </h3>
              <StatusBadge status={trackingData?.status || activeSos.status} size="sm" />
            </div>
            <div className="card-content" style={{ maxHeight: '440px', overflowY: 'auto' }}>
              <EmergencyTimeline
                currentStatus={trackingData?.status || activeSos.status}
                timestamps={trackingData?.timestamps}
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render History Tab
  const renderHistoryTab = () => (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">
          <span>📋</span>
          <span>Past Emergency Incident Logs</span>
        </h3>
        <span style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>
          {pastEmergencies.length} records
        </span>
      </div>

      <div className="card-content">
        {pastEmergencies.length > 0 ? (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>SOS ID</th>
                  <th>Date & Time</th>
                  <th>Severity</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pastEmergencies.map((pe) => (
                  <tr key={pe.id}>
                    <td style={{ fontWeight: 800 }}>SOS-{pe.id}</td>
                    <td>{new Date(pe.createdAt || Date.now()).toLocaleString()}</td>
                    <td><StatusBadge status={pe.severity} size="sm" /></td>
                    <td>{pe.requiredDepartment || 'General'}</td>
                    <td><StatusBadge status={pe.status} size="sm" /></td>
                    <td>
                      <button
                        onClick={async () => {
                          setSelectedPastSos(pe);
                          try {
                            const res = await API.get(`/emergencies/${pe.id}/timeline`);
                            setPastTimelineEvents(res.data);
                          } catch {
                            setPastTimelineEvents([]);
                          }
                        }}
                        className="btn btn-secondary btn-sm"
                      >
                        View Timeline
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="📋"
            title="No historical events recorded."
            message="Your emergency incident history will appear here once recorded."
          />
        )}

        {selectedPastSos && (
          <div style={{ marginTop: 'var(--space-6)', borderTop: '1px solid var(--color-gray-200)', paddingTop: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
              <h4 style={{ fontWeight: 800 }}>Timeline for SOS-{selectedPastSos.id}</h4>
              <button onClick={() => setSelectedPastSos(null)} className="btn btn-ghost btn-sm">Close</button>
            </div>
            <EmergencyTimeline
              currentStatus={selectedPastSos.status}
              timestamps={pastTimelineEvents.reduce((acc, t) => {
                if (!acc[t.status]) acc[t.status] = [];
                acc[t.status].push(t.timestamp);
                return acc;
              }, {})}
              compact={true}
            />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <DashboardLayout
      title="Patient Dashboard"
      user={user}
      wsConnected={wsConnected}
    >
      {/* Top Tab Switcher */}
      <div style={{
        display: 'flex',
        gap: 'var(--space-2)',
        marginBottom: 'var(--space-6)',
        borderBottom: '1px solid var(--color-gray-200)',
        paddingBottom: 'var(--space-3)',
        overflowX: 'auto'
      }}>
        <button
          onClick={() => switchTab('overview')}
          className={`btn ${activeTab === 'overview' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          aria-label="Overview"
        >
          <span aria-hidden="true">🏠</span>
          <span>Overview</span>
        </button>

        <button
          onClick={() => switchTab('emergency')}
          className={`btn ${activeTab === 'emergency' ? 'btn-critical' : 'btn-secondary'} btn-sm`}
          aria-label={activeSos ? `Active SOS (${activeSos.id})` : 'Emergency'}
        >
          <span aria-hidden="true">🚨</span>
          <span>{activeSos ? `Active SOS (${activeSos.id})` : 'Emergency'}</span>
        </button>

        <button
          onClick={() => switchTab('chat')}
          className={`btn ${activeTab === 'chat' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          aria-label="Med-AI Advisor"
        >
          <span aria-hidden="true">🤖</span>
          <span>Med-AI Advisor</span>
        </button>

        <button
          onClick={() => switchTab('history')}
          className={`btn ${activeTab === 'history' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          aria-label="History"
        >
          <span aria-hidden="true">📋</span>
          <span>History</span>
        </button>
      </div>

      {activeTab === 'overview' && renderOverviewTab()}
      {activeTab === 'emergency' && renderEmergencyTab()}
      {activeTab === 'chat' && renderChatTab()}
      {activeTab === 'history' && renderHistoryTab()}

      {/* Emergency Confirmation Modal */}
      <ConfirmModal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={confirmAndDispatchSos}
        patientLocation={{ lat: user?.latitude || 12.9716, lng: user?.longitude || 77.5946 }}
        vitals={latestVital || { heartRate: 78, spo2: 98, temperature: 36.7 }}
        symptoms={symptomList}
        onSymptomToggle={handleSymptomToggle}
        description={symptomDesc}
        onDescriptionChange={setSymptomDesc}
        isSubmitting={isDispatching}
      />
    </DashboardLayout>
  );
};

export default UserDashboard;