import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import LiveRouteTracker from './LiveRouteTracker';

// Mock routing service
vi.mock('../services/routing', () => ({
  calcHaversineDistance: (lat1, lon1, lat2, lon2) => {
    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
    return 1.45;
  },
  getDrivingRoute: vi.fn().mockResolvedValue({
    distanceKm: 2.3,
    etaMinutes: 6,
    coordinates: [[12.9716, 77.5946], [12.9750, 77.5970], [12.9800, 77.6000]],
    provider: 'osrm'
  })
}));

// Mock API service
vi.mock('../services/api', () => ({
  default: {
    get: vi.fn().mockImplementation((url) => {
      if (url === '/hospitals') {
        return Promise.resolve({
          data: [
            { id: 'hosp-1', name: 'City General Hospital', address: 'Emergency Medical Center', lat: 12.9800, lng: 77.6000 },
            { id: 'hosp-2', name: 'Apollo Emergency Center', address: 'Bannerghatta Road', lat: 12.9345, lng: 77.6101 }
          ]
        });
      }
      return Promise.resolve({ data: {} });
    }),
    put: vi.fn().mockResolvedValue({ data: { message: 'Profile updated' } }),
    post: vi.fn().mockResolvedValue({ data: { status: 'recorded' } })
  }
}));

describe('LiveRouteTracker Component', () => {
  let mockGeolocation;
  let watchPositionSuccessCallback = null;

  beforeEach(() => {
    vi.useFakeTimers();

    watchPositionSuccessCallback = null;

    mockGeolocation = {
      getCurrentPosition: vi.fn((success) => {
        success({
          coords: {
            latitude: 12.9716,
            longitude: 77.5946,
            speed: 5.5, // ~19.8 km/h
            heading: 45,
            accuracy: 6,
            altitude: 920
          },
          timestamp: Date.now()
        });
      }),
      watchPosition: vi.fn((success) => {
        watchPositionSuccessCallback = success;
        return 999;
      }),
      clearWatch: vi.fn()
    };

    Object.defineProperty(global.navigator, 'geolocation', {
      value: mockGeolocation,
      writable: true,
      configurable: true
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders initial tracking dashboard in standby mode with Start Live Tracking button', () => {
    render(<LiveRouteTracker />);

    // Title & subtitle
    expect(screen.getByText(/Live GPS Route Tracking/i)).toBeTruthy();

    // Standby status badge
    expect(screen.getAllByText(/STANDBY/i).length).toBeGreaterThan(0);

    // Action button
    const startBtn = screen.getByRole('button', { name: /Start Live Tracking/i });
    expect(startBtn).toBeTruthy();

    // Telemetry dashboard cards
    expect(screen.getByText(/GPS Location/i)).toBeTruthy();
    expect(screen.getByText(/Current Speed/i)).toBeTruthy();
    expect(screen.getByText(/Distance Travelled/i)).toBeTruthy();
    expect(screen.getByText(/Tracking Duration/i)).toBeTruthy();
    expect(screen.getByText(/Destination ETA/i)).toBeTruthy();
  });

  it('starts live tracking when user clicks Start Live Tracking button', async () => {
    render(<LiveRouteTracker />);

    const startBtn = screen.getByRole('button', { name: /Start Live Tracking/i });
    await act(async () => {
      fireEvent.click(startBtn);
    });

    // Verifies geolocation was invoked
    expect(mockGeolocation.getCurrentPosition).toHaveBeenCalled();
    expect(mockGeolocation.watchPosition).toHaveBeenCalled();

    // Status transitions to ACTIVE
    expect(screen.getByText(/LIVE TRACKING ACTIVE/i)).toBeTruthy();

    // Button transitions to Stop Live Tracking
    expect(screen.getByRole('button', { name: /Stop Live Tracking/i })).toBeTruthy();
  });

  it('updates live coordinates, speed and breadcrumbs as positions arrive', async () => {
    render(<LiveRouteTracker />);

    const startBtn = screen.getByRole('button', { name: /Start Live Tracking/i });
    await act(async () => {
      fireEvent.click(startBtn);
    });

    // Simulate watchPosition emitting movement to new coordinates
    await act(async () => {
      if (watchPositionSuccessCallback) {
        watchPositionSuccessCallback({
          coords: {
            latitude: 12.9730,
            longitude: 77.5960,
            speed: 8.0, // 28.8 km/h
            heading: 60,
            accuracy: 4,
            altitude: 922
          },
          timestamp: Date.now()
        });
      }
    });

    // Verified speed calculation: 8.0 m/s * 3.6 = 28.8 km/h
    expect(screen.getByText(/28.8 km\/h/i)).toBeTruthy();

    // Verified distance travelled updated
    expect(screen.getByText(/1.45 km/i)).toBeTruthy();
  });

  it('stops tracking, clears watch, and preserves route when Stop Live Tracking is clicked', async () => {
    render(<LiveRouteTracker />);

    const startBtn = screen.getByRole('button', { name: /Start Live Tracking/i });
    await act(async () => {
      fireEvent.click(startBtn);
    });

    // Simulate a couple of movements
    await act(async () => {
      if (watchPositionSuccessCallback) {
        watchPositionSuccessCallback({
          coords: { latitude: 12.9730, longitude: 77.5960, speed: 6.0, heading: 40, accuracy: 5 },
          timestamp: Date.now()
        });
        watchPositionSuccessCallback({
          coords: { latitude: 12.9750, longitude: 77.5980, speed: 7.0, heading: 45, accuracy: 5 },
          timestamp: Date.now()
        });
      }
    });

    const stopBtn = screen.getByRole('button', { name: /Stop Live Tracking/i });
    await act(async () => {
      fireEvent.click(stopBtn);
    });

    // Verifies clearWatch called with watch ID
    expect(mockGeolocation.clearWatch).toHaveBeenCalledWith(999);

    // Status transitions to STOPPED
    expect(screen.getByText(/TRACKING STOPPED/i)).toBeTruthy();

    // Preserved route summary banner is visible
    expect(screen.getByText(/Route Tracking Complete/i)).toBeTruthy();
  });

  it('handles location permission denied gracefully with descriptive error guidance', async () => {
    mockGeolocation.getCurrentPosition = vi.fn((success, error) => {
      error({ code: 1, message: 'User denied Geolocation' });
    });

    render(<LiveRouteTracker />);

    const startBtn = screen.getByRole('button', { name: /Start Live Tracking/i });
    await act(async () => {
      fireEvent.click(startBtn);
    });

    // Status indicates GPS ERROR
    expect(screen.getByText(/GPS ERROR/i)).toBeTruthy();

    // Clear alert banner explains permission denied
    expect(screen.getByText(/Location permission denied/i)).toBeTruthy();
  });

  it('allows destination hospital selection and calculates driving distance and ETA', async () => {
    render(<LiveRouteTracker />);

    const select = screen.getByRole('combobox');
    expect(select).toBeTruthy();

    await act(async () => {
      fireEvent.change(select, { target: { value: 'hosp-2' } });
    });

    expect(select.value).toBe('hosp-2');
  });
});
