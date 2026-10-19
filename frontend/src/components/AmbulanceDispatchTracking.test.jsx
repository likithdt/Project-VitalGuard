import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import GoogleMapTracking from './GoogleMapTracking';

describe('GoogleMapTracking & Dispatch Telemetry', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const mockProps = {
    patientLocation: [12.9716, 77.5946],
    ambulanceLocation: [12.9650, 77.5850],
    hospitalLocation: [12.9800, 77.6000],
    ambulanceStatus: 'EN_ROUTE_TO_PATIENT',
    ambulanceUnitId: 'AMB-102',
    driverName: 'Officer Rajiv',
    emergencyId: 101,
    height: '400px'
  };

  it('renders tracking console with telemetry badges and status', () => {
    render(<GoogleMapTracking {...mockProps} />);

    // Live GPS telemetry badge
    expect(screen.getByText(/LIVE GPS STREAMING/i)).toBeTruthy();

    // Ambulance unit identifier
    expect(screen.getAllByText(/AMB-102/i).length).toBeGreaterThan(0);

    // Operator name
    expect(screen.getByText(/Officer Rajiv/i)).toBeTruthy();

    // Status badge
    expect(screen.getByText(/EN ROUTE TO PATIENT/i)).toBeTruthy();
  });

  it('calculates and displays Haversine distance and transit ETA', () => {
    render(<GoogleMapTracking {...mockProps} />);

    // Distance calculation
    expect(screen.getByText(/1\.3 km/i)).toBeTruthy();

    // ETA calculation
    expect(screen.getAllByText(/min/i).length).toBeGreaterThan(0);
  });

  it('toggles Follow Ambulance mode when follow button is clicked', () => {
    render(<GoogleMapTracking {...mockProps} />);

    const followBtn = screen.getByRole('button', { name: /Follow/i });
    expect(followBtn).toBeTruthy();

    fireEvent.click(followBtn);

    // After clicking, button text toggles to Following mode
    expect(screen.getByRole('button', { name: /Following/i })).toBeTruthy();
  });

  it('renders tactical radar HUD when in fallback mode with patient and ambulance positions', () => {
    render(<GoogleMapTracking {...mockProps} />);

    // Radar HUD markers
    expect(screen.getByText(/Patient Pickup/i)).toBeTruthy();
    expect(screen.getByText(/Patient Intercept/i)).toBeTruthy();
  });
});
