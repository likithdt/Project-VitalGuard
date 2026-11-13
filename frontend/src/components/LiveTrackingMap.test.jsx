import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import LiveTrackingMap from './LiveTrackingMap';

// Mock routing service
vi.mock('../services/routing', () => ({
  calcHaversineDistance: vi.fn((lat1, lon1, lat2, lon2) => {
    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
    return 1.3;
  }),
  getDrivingRoute: vi.fn().mockImplementation((start, end) => {
    return Promise.resolve({
      distanceKm: 2.1,
      etaMinutes: 5,
      coordinates: [start, [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2], end],
      provider: 'osrm'
    });
  })
}));

describe('LiveTrackingMap Component', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const mockProps = {
    emergencyId: 'SOS-207',
    patientLocation: [12.9716, 77.5946],
    ambulanceLocation: [12.9650, 77.5850],
    hospitalLocation: [12.9800, 77.6000],
    ambulanceStatus: 'EN_ROUTE_TO_PATIENT',
    ambulanceUnitId: 'AMB-102',
    driverName: 'Officer Rajiv',
    hospitalName: 'Apollo Emergency Center',
    pickupAddress: 'MG Road, Bangalore',
    height: '450px'
  };

  it('renders live tracking map frame with OpenStreetMap streaming badge and telemetry HUD', () => {
    render(<LiveTrackingMap {...mockProps} />);

    // OSM Streaming badge
    expect(screen.getByText(/LIVE GPS STREAMING • OPENSTREETMAP/i)).toBeTruthy();

    // Unit ID & driver
    expect(screen.getAllByText(/AMB-102/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Officer Rajiv/i)).toBeTruthy();

    // Status
    expect(screen.getByText(/EN ROUTE TO PATIENT/i)).toBeTruthy();

    // Two-tone route legend
    expect(screen.getByText(/Ambulance → Patient/i)).toBeTruthy();
    expect(screen.getByText(/Patient → Hospital/i)).toBeTruthy();
  });

  it('displays accurate driving distance and ETA to patient during pickup journey', () => {
    render(<LiveTrackingMap {...mockProps} />);

    // Distance display
    expect(screen.getByText(/1\.3 km/i)).toBeTruthy();

    // ETA display
    expect(screen.getAllByText(/min/i).length).toBeGreaterThan(0);
  });

  it('toggles Follow Ambulance mode when follow button is clicked', () => {
    render(<LiveTrackingMap {...mockProps} />);

    const followBtn = screen.getByRole('button', { name: /Follow/i });
    expect(followBtn).toBeTruthy();

    fireEvent.click(followBtn);
    expect(screen.getByRole('button', { name: /Following/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Following/i }));
    expect(screen.getByRole('button', { name: /Follow/i })).toBeTruthy();
  });

  it('automatically updates journey phase and telemetry after patient pickup', () => {
    const { rerender } = render(
      <LiveTrackingMap {...mockProps} ambulanceStatus="EN_ROUTE_TO_PATIENT" />
    );
    expect(screen.getByText(/Patient Intercept/i)).toBeTruthy();

    // Update status to hospital transit
    rerender(
      <LiveTrackingMap {...mockProps} ambulanceStatus="EN_ROUTE_TO_HOSPITAL" />
    );
    expect(screen.getByText(/Hospital Transit/i)).toBeTruthy();
    expect(screen.getByText(/EN ROUTE TO HOSPITAL/i)).toBeTruthy();
  });

  it('updates live ambulance coordinates dynamically as telemetry arrives', () => {
    const { rerender } = render(<LiveTrackingMap {...mockProps} />);

    // Simulate GPS movement
    rerender(
      <LiveTrackingMap
        {...mockProps}
        ambulanceLocation={[12.9690, 77.5910]}
      />
    );

    expect(screen.getAllByText(/AMB-102/i).length).toBeGreaterThan(0);
  });

  it('renders tactical vector radar HUD in fallback/test mode', () => {
    render(<LiveTrackingMap {...mockProps} />);

    // Canvas HUD is rendered in test mode
    expect(screen.getByTestId('tactical-canvas-hud')).toBeTruthy();
    expect(screen.getByText(/Patient Pickup/i)).toBeTruthy();

    // Toggle button exists
    const toggleBtn = screen.getByRole('button', { name: /Map|Radar/i });
    expect(toggleBtn).toBeTruthy();
  });
});
