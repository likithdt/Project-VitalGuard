import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminDashboard from './AdminDashboard';
import * as AuthContext from '../context/AuthContext';
import API from '../services/api';

vi.mock('../services/api');

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
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });
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
});
