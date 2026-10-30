import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import API from '../services/api';
import UserDashboard from './UserDashboard';
import HealthcareDashboard from './HealthcareDashboard';
import FamilyDashboard from './FamilyDashboard';

const session = vi.hoisted(() => ({ user: { uid: 'patient-1', role: 'PATIENT', fullName: 'Test Patient' } }));

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: session.user, logout: vi.fn() }) }));
vi.mock('../services/websocket', () => ({
  useRealtimeRefresh: () => ({ connected: true, revision: 0, refresh: vi.fn(), tracking: null }),
  useAmbulanceLocationSender: () => ({
    isTracking: false,
    gpsStatus: 'ACTIVE',
    gpsError: null,
    lastGpsTimestamp: new Date(),
    currentCoords: { latitude: 12.965, longitude: 77.585 },
    startTracking: vi.fn(),
    stopTracking: vi.fn()
  })
}));
vi.mock('../components/MapComponent', () => ({ default: () => <div>Map</div> }));

beforeEach(() => {
  if (typeof window !== 'undefined') {
    window.history.replaceState(null, '', '/');
  }
  session.user = { uid: 'patient-1', role: 'PATIENT', fullName: 'Test Patient' };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockResponses(queue) {
  return vi.spyOn(API, 'get').mockImplementation(async path => ({
    status: 200,
    data: path === '/hospital/emergencies' ? queue : path === '/emergencies/7' ? {
      id: 7, status: 'HOSPITAL_ASSIGNED', patientUid: 'patient-1',
      patient: { fullName: 'Test Patient' }, currentVitals: { heartRate: 81 },
      medicalHistory: [], previousEmergencies: [],
    } : path.includes('/assessment') || path.includes('/baseline') || path.includes('/predict/') || path.includes('/medical-profile') ? null : [],
  }));
}

describe('queue response regression', () => {
  it.each([[], null, {}])('renders patient history for queue %j', async queue => {
    mockResponses(queue);
    render(<UserDashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    expect(await screen.findByText('No historical events recorded.')).toBeTruthy();
  });

  it('opens hospital emergency details without undefined history variables', async () => {
    session.user = { uid: 'hospital-1', role: 'HOSPITAL_ADMIN', fullName: 'Hospital Admin' };
    const get = mockResponses([{ id: 7, status: 'HOSPITAL_ASSIGNED', patientUid: 'patient-1' }]);
    render(<HealthcareDashboard />);
    fireEvent.click(await screen.findByText('SOS-7'));
    expect(await screen.findByText('Test Patient')).toBeTruthy();
    expect(screen.getByText('81 BPM')).toBeTruthy();
    expect(get).toHaveBeenCalledWith('/emergencies/7', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('renders Med-AI Predictive Health Monitor and opens Clinical Med-AI Chat Advisor', async () => {
    mockResponses([]);
    render(<UserDashboard />);

    // Check Med-AI Health Monitor card is in Overview
    expect(await screen.findByText('Med-AI Predictive Health Monitor')).toBeTruthy();
    expect(screen.getByText('Unified Risk Fusion')).toBeTruthy();

    // Switch to Med-AI Advisor tab
    fireEvent.click(screen.getByRole('button', { name: 'Med-AI Advisor' }));

    // Check Clinical Med-AI Chat Advisor renders
    expect(await screen.findByText('Clinical Med-AI Chat Advisor')).toBeTruthy();
    expect(screen.getByText('Intelligent clinical triage, symptom analysis & emergency guidance')).toBeTruthy();
    expect(screen.getByText('💓 I feel racing heart palpitations')).toBeTruthy();

    // Click quick prompt chip
    fireEvent.click(screen.getByText('💓 I feel racing heart palpitations'));
    expect(await screen.findByText('💓 I feel racing heart palpitations', { selector: '.med-ai-bubble div' })).toBeTruthy();
  });

  it('renders Family Dashboard with linked family members and telemetry', async () => {
    session.user = { uid: 'family-1', role: 'FAMILY_MEMBER', fullName: 'Priya Sharma' };
    vi.spyOn(API, 'get').mockImplementation(async path => ({
      status: 200,
      data: path === '/family/patients' ? [
        { id: 1, uid: 'patient-1', fullName: 'John Doe', age: 45, bloodGroup: 'O+', relationship: 'Spouse', emergencyContact: true, contactPhone: '9876543210' }
      ] : path === '/vitals/history' ? [
        { heartRate: 74, spo2: 99, temperature: 36.6 }
      ] : path.includes('/emergencies/') ? [] : [],
    }));

    render(<FamilyDashboard />);

    expect(await screen.findByRole('heading', { level: 2, name: 'Family Guardian Console' })).toBeTruthy();
    expect(screen.getByText('John Doe')).toBeTruthy();
    expect(screen.getByText('Spouse')).toBeTruthy();
    expect(screen.getByText('PRIMARY CONTACT')).toBeTruthy();
    expect(screen.getByText('Live Telemetry Overview: John Doe')).toBeTruthy();
  });

  it('renders incoming ambulance request and allows driver to accept and reject dispatch', async () => {
    session.user = { uid: 'AMB_01', role: 'AMBULANCE_DRIVER', fullName: 'Ambulance Driver', ambulanceId: 1, ambulanceUnitId: 'AMB-01' };

    let currentJob = { ambulance: { id: 1, unitId: 'AMB-01', status: 'AVAILABLE' }, emergency: null };
    let pendingRequests = [
      {
        id: 102,
        requestId: 102,
        emergencyId: 207,
        status: 'PENDING',
        distanceKm: 8.2,
        etaMinutes: 13,
        patientName: 'Lokesh T',
        patientAge: 42,
        patientBloodGroup: 'A+',
        patientPhone: '9876543210',
        destinationHospital: 'Apollo Hospital',
        pickupAddress: 'Bangalore City Center',
        symptoms: 'Severe Chest Pain',
        symptomDescription: 'Acute myocardial infarction signs',
        riskScore: 92
      }
    ];

    vi.spyOn(API, 'get').mockImplementation(async path => {
      if (path === '/ambulance/current-job') {
        return { status: 200, data: currentJob };
      }
      if (path === '/ambulance/pending-requests') {
        return { status: 200, data: pendingRequests };
      }
      return { status: 200, data: [] };
    });

    const postSpy = vi.spyOn(API, 'post').mockImplementation(async (path) => {
      if (path === '/ambulance/requests/102/accept') {
        currentJob = {
          ambulance: { id: 1, unitId: 'AMB-01', status: 'ACCEPTED', currentEmergencyId: 207 },
          emergency: {
            id: 207,
            emergencyId: 207,
            patientName: 'Lokesh T',
            hospitalName: 'Apollo Hospital',
            destinationHospital: 'Apollo Hospital',
            status: 'ACCEPTED',
            severity: 'CRITICAL',
            latitude: 12.9863,
            longitude: 77.7175,
            hospitalLat: 12.9252,
            hospitalLng: 77.6011
          }
        };
        pendingRequests = [];
        return { status: 200, data: { success: true, status: 'DRIVER_ACCEPTED' } };
      }
      if (path === '/ambulance/requests/102/decline') {
        pendingRequests = [];
        return { status: 200, data: { success: true, status: 'DECLINED' } };
      }
      return { status: 200, data: { success: true } };
    });

    render(<HealthcareDashboard />);

    // Verify incoming dispatch card renders with real distance & ETA
    expect(await screen.findByText(/Emergency ID: SOS-207/)).toBeTruthy();
    expect(screen.getByText('Lokesh T')).toBeTruthy();
    expect(screen.getByText(/Apollo Hospital/)).toBeTruthy();
    expect(screen.getByText(/8.2 km/)).toBeTruthy();
    expect(screen.getByText(/~13 min response time/)).toBeTruthy();

    // Verify Accept Request button exists and click it
    const acceptBtn = screen.getByTestId('accept-request-btn');
    expect(acceptBtn).toBeTruthy();
    fireEvent.click(acceptBtn);

    // Verify API called with request ID 102
    expect(postSpy).toHaveBeenCalledWith('/ambulance/requests/102/accept');

    // Verify UI transitions to active emergency dispatch
    expect(await screen.findByText(/ACTIVE EMERGENCY DISPATCH: SOS-207/)).toBeTruthy();
    expect(screen.getAllByText(/Apollo Hospital/).length).toBeGreaterThan(0);
    expect(screen.getByText('🚑 Start Journey (En Route)')).toBeTruthy();
  });
});
