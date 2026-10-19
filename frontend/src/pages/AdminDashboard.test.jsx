import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminDashboard from './AdminDashboard';
import * as AuthContext from '../context/AuthContext';
import API from '../services/api';

vi.mock('../services/api');
vi.mock('../components/GoogleMapTracking', () => ({
  default: (props) => (
    <div data-testid="mock-google-map-tracking">
      <span>Mock Map Tracking</span>
      <span>Emergency: {props.emergencyId}</span>
      <span>Status: {props.ambulanceStatus}</span>
    </div>
  )
}));

describe('AdminDashboard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { uid: 'SYS_01', fullName: 'System Admin', role: 'SYSTEM_ADMIN', email: 'sysadmin@vitaguard.com' },
      token: 'mock-token',
      logout: vi.fn(),
    });

    API.get.mockImplementation((path) => {
      if (path === '/admin/stats') {
        return Promise.resolve({
          data: {
            totalUsers: 15,
            activeDoctors: 5,
            hospitals: 3,
            ambulances: 4,
            ambulanceDrivers: 4,
            activeEmergencies: 1,
            pendingApprovals: 0
          }
        });
      }
      if (path === '/admin/doctors') {
        return Promise.resolve({
          data: [
            { id: 1, name: 'Dr. Anirudh Kulkarni', specialization: 'Cardiology', hospitalName: 'Apollo Hospital', onDuty: true, availableForEmergency: true, status: 'ACTIVE' }
          ]
        });
      }
      if (path === '/admin/hospital-admins') {
        return Promise.resolve({
          data: [
            { id: 2, fullName: 'Hospital Admin Apollo', email: 'admin@apollo.com', hospitalName: 'Apollo Hospital', role: 'HOSPITAL_ADMIN', status: 'ACTIVE' }
          ]
        });
      }
      if (path === '/admin/drivers') {
        return Promise.resolve({
          data: [
            { id: 3, fullName: 'Driver John', email: 'driver@apollo.com', ambulanceUnitId: 'AMB-01', role: 'AMBULANCE_DRIVER', status: 'ACTIVE' }
          ]
        });
      }
      if (path === '/admin/hospitals') {
        return Promise.resolve({
          data: [
            { id: 1, name: 'Apollo Hospital', availableBeds: 85, totalBeds: 100, availableDoctors: 12, totalDoctors: 30, rating: 4.8 }
          ]
        });
      }
      if (path === '/admin/ambulances') {
        return Promise.resolve({
          data: [
            { id: 1, unitId: 'AMB-01', hospitalName: 'Apollo Hospital', status: 'AVAILABLE', latitude: 12.92, longitude: 77.60 }
          ]
        });
      }
      if (path === '/admin/users') {
        return Promise.resolve({
          data: [
            { id: 1, uid: 'SYS_01', fullName: 'System Admin', email: 'sysadmin@vitaguard.com', role: 'SYSTEM_ADMIN', status: 'ACTIVE' }
          ]
        });
      }
      if (path === '/admin/pending-approvals') {
        return Promise.resolve({ data: [] });
      }
      if (path === '/admin/emergencies/active') {
        return Promise.resolve({
          data: [
            {
              id: 99,
              patientUid: 'PAT_99',
              patientName: 'Jane Foster',
              severity: 'CRITICAL',
              riskScore: 94,
              status: 'AMBULANCE_REQUESTED',
              symptoms: 'Acute chest compression & shortness of breath',
              heartRate: 118,
              oxygenLevel: 89,
              bloodPressure: '155/98',
              respiratoryRate: 26,
              patientLatitude: 12.9345,
              patientLongitude: 77.6101,
              hospital: { id: 1, name: 'Apollo Hospital', availableBeds: 14, totalBeds: 100 },
              hospitalId: 1,
              doctor: { id: 1, name: 'Dr. Anirudh Kulkarni', specialization: 'Cardiology' },
              doctorId: 1,
              ambulance: { id: 1, unitId: 'AMB-01', status: 'EN_ROUTE_TO_PATIENT', driver: { fullName: 'Driver John' } },
              ambulanceId: 1,
              createdAt: '2026-10-19T10:00:00Z',
              updatedAt: '2026-10-19T10:05:00Z'
            },
            // Duplicate record with the same ID to verify frontend deduplication
            {
              id: 99,
              patientUid: 'PAT_99',
              patientName: 'Jane Foster',
              severity: 'CRITICAL',
              riskScore: 94,
              status: 'AMBULANCE_REQUESTED',
              symptoms: 'Acute chest compression & shortness of breath',
              heartRate: 118,
              oxygenLevel: 89,
              bloodPressure: '155/98',
              respiratoryRate: 26,
              patientLatitude: 12.9345,
              patientLongitude: 77.6101,
              hospital: { id: 1, name: 'Apollo Hospital', availableBeds: 14, totalBeds: 100 },
              hospitalId: 1
            }
          ]
        });
      }
      if (path.includes('/timeline')) {
        return Promise.resolve({
          data: [
            { timestamp: '2026-10-19T10:00:00Z', event: 'EMERGENCY_DETECTED', description: 'Patient triggered SOS', actor: 'PAT_99' },
            { timestamp: '2026-10-19T10:01:00Z', event: 'HOSPITAL_ASSIGNED', description: 'Apollo Hospital assigned', actor: 'SYSTEM' }
          ]
        });
      }
      return Promise.resolve({ data: [] });
    });

    API.post.mockResolvedValue({ data: { success: true } });
  });

  it('renders System Administration Portal with metric cards and tabs', async () => {
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    expect(screen.getByText(/System Administration & Security Control/i)).toBeDefined();
    expect(screen.getByText(/ROLE: SYSTEM_ADMIN/i)).toBeDefined();

    // Verify stats cards load
    await waitFor(() => {
      expect(screen.getByText(/Total Users/i)).toBeDefined();
      expect(screen.getByText(/Active Doctors/i)).toBeDefined();
      expect(screen.getAllByText(/Hospitals/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Ambulances/i).length).toBeGreaterThan(0);
    });
  });

  it('navigates to Doctor tab and displays doctor management table', async () => {
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    const docTabButton = screen.getByText(/👨‍⚕️ Doctors/i);
    fireEvent.click(docTabButton);

    await waitFor(() => {
      expect(screen.getByText(/Doctor Management & Authorization/i)).toBeDefined();
      expect(screen.getByText('Dr. Anirudh Kulkarni')).toBeDefined();
      expect(screen.getByText('Cardiology')).toBeDefined();
    });
  });

  it('navigates to Hospital Admins tab and displays admin management table', async () => {
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    const adminTabButton = screen.getByText(/🏥 Hospital Admins/i);
    fireEvent.click(adminTabButton);

    await waitFor(() => {
      expect(screen.getByText(/Hospital Admin Management/i)).toBeDefined();
      expect(screen.getByText('Hospital Admin Apollo')).toBeDefined();
      expect(screen.getByText('admin@apollo.com')).toBeDefined();
    });
  });

  it('navigates to Ambulance Drivers tab and displays driver table', async () => {
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    const driverTabButton = screen.getByText(/🚑 Ambulance Drivers/i);
    fireEvent.click(driverTabButton);

    await waitFor(() => {
      expect(screen.getByText(/Ambulance Driver Management/i)).toBeDefined();
      expect(screen.getByText('Driver John')).toBeDefined();
      expect(screen.getByText('driver@apollo.com')).toBeDefined();
    });
  });

  it('opens Register Doctor modal when clicking + Register Doctor button', async () => {
    render(
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    );

    const registerDocBtns = screen.getAllByText(/\+ Register Doctor/i);
    fireEvent.click(registerDocBtns[0]);

    await waitFor(() => {
      expect(screen.getByText(/Register Verified Doctor/i)).toBeDefined();
      expect(screen.getByPlaceholderText(/e\.g\. Dr\. Ramesh Babu/i)).toBeDefined();
    });
  });

  it('displays synchronized real-time emergencies in Incident Command Center and deduplicates cards', async () => {
    render(
      <MemoryRouter initialEntries={['/admin?tab=emergencies']}>
        <AdminDashboard defaultTab="emergencies" />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Global Incident Command Center & Real-Time Dispatch/i)).toBeDefined();
      expect(screen.getByText(/Active Incidents Queue \(1\)/i)).toBeDefined();
      expect(screen.getByText('Jane Foster')).toBeDefined();
    });

    // Check patient telemetry
    expect(screen.getAllByText(/118/).length).toBeGreaterThan(0); // Heart rate
    expect(screen.getAllByText(/89/).length).toBeGreaterThan(0); // SpO2
    expect(screen.getAllByText(/155\/98/).length).toBeGreaterThan(0); // Blood pressure

    // Check map tracking component
    expect(screen.getByTestId('mock-google-map-tracking')).toBeDefined();
    expect(screen.getByText(/Emergency: 99/i)).toBeDefined();
  });

  it('provides administrative action controls to resolve emergency, cancel emergency, and dispatch', async () => {
    render(
      <MemoryRouter initialEntries={['/admin?tab=emergencies']}>
        <AdminDashboard defaultTab="emergencies" />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Incident Command: SOS-99/i)).toBeDefined();
    });

    // 1. Resolve Incident
    const resolveBtn = screen.getByText(/✓ Resolve Incident/i);
    fireEvent.click(resolveBtn);
    await waitFor(() => {
      expect(API.post).toHaveBeenCalledWith('/emergencies/99/resolve');
    });

    // 2. Cancel Incident Modal
    const cancelBtn = screen.getByText(/✕ Cancel Incident/i);
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(screen.getByText(/Are you sure you want to cancel this emergency request\?/i)).toBeDefined();
    });

    // Acknowledge active units warning checkbox and confirm
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    const confirmCancelBtn = screen.getByText(/Confirm Cancellation/i);
    fireEvent.click(confirmCancelBtn);
    await waitFor(() => {
      expect(API.post).toHaveBeenCalledWith('/emergency/99/cancel');
    });

    // 3. Hospital Override / Architecture Details Modal
    const hospBtn = screen.getByText(/🏥 Hospital Details \/ Override/i);
    fireEvent.click(hospBtn);
    await waitFor(() => {
      expect(screen.getByText(/Automated Clinical Triage & Architectural Contract/i)).toBeDefined();
      expect(screen.getByText(/PATCH \/api\/admin\/emergencies\/\{id\}\/hospital/i)).toBeDefined();
    });
  });
});
