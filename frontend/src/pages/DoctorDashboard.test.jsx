import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import HealthcareDashboard from './HealthcareDashboard';
import * as AuthContext from '../context/AuthContext';
import API from '../services/api';

vi.mock('../components/MapComponent', () => ({
  default: () => <div data-testid="mock-map">Mock Map Component</div>
}));
vi.mock('../components/GoogleMapTracking', () => ({
  default: () => <div data-testid="mock-google-map">Mock Google Map Tracking</div>
}));
vi.mock('../services/websocket', () => ({
  useRealtimeRefresh: () => ({
    connected: true,
    revision: 0,
    refresh: vi.fn(),
    ambulanceLocation: null
  }),
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

const mockEmergency = {
  id: 101,
  patientUid: 'PAT_101',
  patientName: 'Rahul Sharma',
  severity: 'CRITICAL',
  riskScore: 95,
  status: 'DOCTOR_ASSIGNED',
  symptoms: 'Acute crushing chest pain, dyspnea, and diaphoresis',
  symptomDescription: 'Acute crushing chest pain, dyspnea, and diaphoresis',
  detectedVitals: 'HR: 145 BPM, SpO2: 82%, BP: 165/105 mmHg, Temp: 39.8°C',
  heartRate: 145,
  spo2: 82,
  temperature: 39.8,
  bpSystolic: 165,
  bpDiastolic: 105,
  hospitalId: 1,
  hospitalName: 'Apollo Speciality Hospital',
  doctorId: 10,
  doctorName: 'Dr. Arjun Mehta',
  requiredDepartment: 'Cardiology',
  requiresAmbulance: false,
  ambulanceStatus: null,
  patient: {
    uid: 'PAT_101',
    fullName: 'Rahul Sharma',
    age: 54,
    gender: 'MALE',
    bloodGroup: 'B+',
    phone: '+91 98765 43210',
    emergencyContact: '+91 98765 11111',
    address: 'Indiranagar 100ft Road, Bengaluru'
  },
  currentVitals: {
    heartRate: 145,
    spo2: 82,
    temperature: 39.8,
    bpSystolic: 165,
    bpDiastolic: 105,
    bloodPressure: '165/105'
  },
  medicalProfile: {
    allergies: ['Penicillin', 'Sulfa'],
    conditions: ['Hypertension', 'Type 2 Diabetes'],
    notes: 'Prior coronary stent in 2021.'
  },
  medicalHistory: [
    { id: 1, diagnosis: 'Hypertension', date: '2021-05-10', notes: 'Managed with ACE inhibitors' }
  ],
  previousEmergencies: []
};

const mockPendingAssessment = {
  id: 501,
  emergencyId: 101,
  doctorId: 10,
  status: 'PENDING',
  createdAt: new Date().toISOString(),
  emergency: mockEmergency
};

describe('Doctor Dashboard - Physician Emergency Portal Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: {
        uid: 'DOC_10',
        id: 10,
        doctorId: 10,
        fullName: 'Dr. Arjun Mehta',
        role: 'DOCTOR',
        email: 'dr.mehta@apollo.com',
        hospitalId: 1
      },
      token: 'mock-doctor-jwt-token',
      logout: vi.fn()
    });

    vi.spyOn(API, 'get').mockImplementation(async (path) => {
      if (path === '/doctor/emergencies') {
        return { status: 200, data: [mockEmergency] };
      }
      if (path === '/doctor/assessment/pending') {
        return { status: 200, data: [mockPendingAssessment] };
      }
      if (path === '/hospital/doctors') {
        return {
          status: 200,
          data: [
            { id: 10, name: 'Dr. Arjun Mehta', specialization: 'Cardiology', onDuty: true, availableForEmergency: true }
          ]
        };
      }
      if (path === '/hospital/ambulances') {
        return { status: 200, data: [] };
      }
      if (path === '/emergencies/101') {
        return { status: 200, data: mockEmergency };
      }
      if (path === '/emergencies/101/timeline') {
        return {
          status: 200,
          data: [
            { id: 1, status: 'SENSOR_TRIGGERED', timestamp: '2026-10-30T10:00:00Z', description: 'Critical tachycardia and hypoxia detected' },
            { id: 2, status: 'HOSPITAL_ACCEPTED', timestamp: '2026-10-30T10:02:00Z', description: 'Apollo Hospital accepted emergency request' },
            { id: 3, status: 'DOCTOR_ASSIGNED', timestamp: '2026-10-30T10:02:05Z', description: 'Dr. Arjun Mehta assigned to emergency case' }
          ]
        };
      }
      if (path === '/doctor/assessment/emergency/101') {
        return { status: 200, data: mockPendingAssessment };
      }
      return { status: 200, data: [] };
    });

    vi.spyOn(API, 'post').mockImplementation(async (path, body) => {
      if (path === '/doctor/assessment/501/start' || path === '/doctor/assessment/emergency/101/start') {
        return {
          status: 200,
          data: {
            ...mockPendingAssessment,
            status: 'IN_PROGRESS'
          }
        };
      }
      if (path === '/doctor/assessment/501/submit') {
        return {
          status: 200,
          data: {
            ...mockPendingAssessment,
            status: 'SUBMITTED',
            ...body
          }
        };
      }
      if (path === '/emergencies/101/resolve' || path === '/emergency/101/resolve') {
        return {
          status: 200,
          data: {
            id: 101,
            status: 'RESOLVED',
            message: 'Emergency resolved successfully'
          }
        };
      }
      if (path === '/emergencies/101/ambulance-decision') {
        return {
          status: 200,
          data: {
            ...mockEmergency,
            requiresAmbulance: body.requiresAmbulance,
            status: body.requiresAmbulance ? 'AMBULANCE_REQUESTED' : 'DOCTOR_ASSIGNED'
          }
        };
      }
      return { status: 200, data: { success: true } };
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders Physician Emergency Portal with assigned emergency and pending assessment count', async () => {
    render(<HealthcareDashboard />);

    expect(await screen.findByText('Physician Emergency Portal')).toBeTruthy();
    expect(screen.getByText(/Today's Clinical Emergency Overview/i)).toBeTruthy();
    expect(screen.getByText('1 URGENT')).toBeTruthy();

    // Check Assigned Emergencies list has SOS-101
    expect(screen.getByText('SOS-101')).toBeTruthy();
    expect(screen.getAllByText(/Rahul Sharma/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/HR: 145 BPM/i).length).toBeGreaterThan(0);

    // Check 3 action buttons exist in active emergency view
    expect(screen.getByTestId('active-start-assessment-btn')).toBeTruthy();
    expect(screen.getByTestId('active-view-patient-btn')).toBeTruthy();
    expect(screen.getByTestId('active-resolve-emergency-btn')).toBeTruthy();
  });

  it('Start Assessment: opens DoctorAssessmentModal, starts questionnaire, and submits clinical observation', async () => {
    render(<HealthcareDashboard />);

    // Click "Start Assessment" from active emergency card
    const startBtn = await screen.findByTestId('active-start-assessment-btn');
    fireEvent.click(startBtn);

    // Verify Doctor Assessment Modal is displayed
    expect(await screen.findByText('Clinical Emergency Assessment')).toBeTruthy();
    expect(screen.getAllByText(/Emergency SOS-101/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Rahul Sharma/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/HR: 145 BPM/i).length).toBeGreaterThan(0);

    // If modal is in PENDING state, start questionnaire
    const modalStartBtn = screen.queryByTestId('start-assessment-modal-btn');
    if (modalStartBtn) {
      fireEvent.click(modalStartBtn);
    }

    // Verify clinical evaluation form is active
    expect(await screen.findByText('Initial Assessment')).toBeTruthy();
    expect(screen.getByText(/Is the patient conscious and responsive\?/i)).toBeTruthy();
    expect(screen.getByText(/Is the patient breathing normally\?/i)).toBeTruthy();

    // Fill in Step 1
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'CONSCIOUS_ALTERED' } });
    fireEvent.change(selects[1], { target: { value: 'LABORED' } });

    // Advance to Step 2
    const nextToObservationsBtn = screen.getByText(/Next: Clinical Observations →/i);
    fireEvent.click(nextToObservationsBtn);

    // Verify Step 2
    expect(await screen.findByText('Clinical Observations')).toBeTruthy();
    const summaryInput = screen.getByPlaceholderText(/Provide a concise clinical assessment/i);
    fireEvent.change(summaryInput, {
      target: { value: 'Acute coronary syndrome presentation with secondary respiratory distress.' }
    });

    // Advance to Step 3
    fireEvent.click(screen.getByText(/Next: Next Action →/i));

    // Verify Step 3: Action plan & Ambulance Decision
    expect(await screen.findByText(/Next Action & Ambulance Decision/i)).toBeTruthy();
    fireEvent.click(screen.getByDisplayValue('AMBULANCE_REQUIRED'));
    fireEvent.click(screen.getByText(/YES - Dispatch Ambulance/i));

    // Submit Assessment
    const submitBtn = screen.getByText('✓ Submit Assessment');
    fireEvent.click(submitBtn);

    // Verify API called with assessment submission
    await waitFor(() => {
      expect(API.post).toHaveBeenCalledWith('/doctor/assessment/501/submit', expect.objectContaining({
        consciousnessLevel: 'CONSCIOUS_ALTERED',
        breathingStatus: 'LABORED',
        assessmentSummary: 'Acute coronary syndrome presentation with secondary respiratory distress.',
        nextAction: 'AMBULANCE_REQUIRED',
        requiresAmbulance: true
      }));
    });
  });

  it('Start Assessment from Pending Assessments queue: opens assessment modal directly', async () => {
    render(<HealthcareDashboard />);

    const queueStartBtn = await screen.findByTestId('pending-start-assessment-btn');
    expect(queueStartBtn).toBeTruthy();
    fireEvent.click(queueStartBtn);

    expect(await screen.findByText('Clinical Emergency Assessment')).toBeTruthy();
    expect(screen.getAllByText(/Emergency SOS-101/i).length).toBeGreaterThan(0);
  });

  it('View Patient Details: opens modal and renders detailed patient telemetry and clinical history', async () => {
    render(<HealthcareDashboard />);

    // Click "View Patient Details" from active emergency view
    const viewPatientBtn = await screen.findByTestId('active-view-patient-btn');
    fireEvent.click(viewPatientBtn);

    // Verify modal header opens
    expect(await screen.findByText('Patient Clinical Profile - Emergency SOS-101')).toBeTruthy();

    // Verify Emergency Details component rendered patient info
    expect(await screen.findByText('Indiranagar 100ft Road, Bengaluru')).toBeTruthy();
    expect(screen.getByText('B+')).toBeTruthy();
    expect(screen.getByText('+91 98765 43210')).toBeTruthy();
    expect(screen.getByText('54')).toBeTruthy(); // Age

    // Verify Timeline view rendered in details
    expect(await screen.findByText(/Critical tachycardia and hypoxia detected/i)).toBeTruthy();
    expect(await screen.findByText(/Apollo Hospital accepted emergency request/i)).toBeTruthy();

    // Close modal
    const closeBtn = screen.getByTestId('close-patient-details-btn');
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText('Patient Clinical Profile - Emergency SOS-101')).toBeNull();
    });
  });

  it('Resolve Emergency: opens confirmation dialog and calls resolve endpoint on confirm', async () => {
    render(<HealthcareDashboard />);

    // Click "RESOLVE EMERGENCY"
    const resolveBtn = await screen.findByTestId('active-resolve-emergency-btn');
    fireEvent.click(resolveBtn);

    // Verify confirmation modal
    expect(await screen.findByText('Resolve Emergency SOS-101')).toBeTruthy();
    expect(screen.getByText(/Are you sure you want to mark this emergency as/i)).toBeTruthy();

    // Click "Confirm & Resolve Emergency"
    const confirmBtn = screen.getByTestId('confirm-resolve-btn');
    fireEvent.click(confirmBtn);

    // Verify backend resolve endpoint was called
    await waitFor(() => {
      expect(API.post).toHaveBeenCalledWith('/emergencies/101/resolve');
    });

    // Verify modal closes
    await waitFor(() => {
      expect(screen.queryByText('Resolve Emergency SOS-101')).toBeNull();
    });
  });

  it('Resolve Emergency: displays specific backend error if resolution fails', async () => {
    vi.spyOn(API, 'post').mockImplementation(async (path) => {
      if (path.includes('/resolve')) {
        const error = new Error('Request failed');
        error.response = { data: { error: 'Doctor not authorized to resolve unassigned emergency' } };
        throw error;
      }
      return { status: 200, data: {} };
    });

    render(<HealthcareDashboard />);

    const resolveBtn = await screen.findByTestId('active-resolve-emergency-btn');
    fireEvent.click(resolveBtn);

    const confirmBtn = await screen.findByTestId('confirm-resolve-btn');
    fireEvent.click(confirmBtn);

    // Verify specific error message is shown in the modal alert
    expect(await screen.findByText(/Doctor not authorized to resolve unassigned emergency/i)).toBeTruthy();
  });
});
