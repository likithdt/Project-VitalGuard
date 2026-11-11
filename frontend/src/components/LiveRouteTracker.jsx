import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import useLiveGpsTracking from '../services/useLiveGpsTracking';
import { getDrivingRoute, calcHaversineDistance } from '../services/routing';
import StatusBadge from './StatusBadge';
import API from '../services/api';

/**
 * LiveRouteTracker Component
 * 
 * Comprehensive Live GPS Route Tracking and Navigation Interface:
 * - Real-time browser GPS tracking with continuous watchPosition updates
 * - Moving live user marker with direction heading and pulsing radar beacon
 * - Solid two-tone route polylines:
 *     * Travelled path: Solid teal (#0D9488) line tracing exact breadcrumbs
 *     * Remaining navigation path: Dashed blue (#2563EB) road line calculated via OSRM
 * - Telemetry Dashboard HUD:
 *     * Current Latitude and Longitude
 *     * Current Speed (km/h)
 *     * Distance Travelled (km)
 *     * Active Tracking Duration (hh:mm:ss)
 *     * Estimated Arrival Time (ETA) to target hospital
 *     * Live Tracking Status (ACTIVE, STOPPED, GPS ERROR, REQUESTING)
 * - Start / Stop / Reset controls with completed route preservation
 * - Multi-provider map rendering (Leaflet + OpenStreetMap with tactical vector canvas fallback)
 */

// Default emergency hospitals in Bangalore metropolitan region
const DEFAULT_HOSPITALS = [
  { id: 'hosp-1', name: 'City General Hospital', address: 'Emergency Medical Center, MG Road', lat: 12.9800, lng: 77.6000 },
  { id: 'hosp-2', name: 'Apollo Emergency Medical Center', address: 'Bannerghatta Road, 3rd Block', lat: 12.9345, lng: 77.6101 },
  { id: 'hosp-3', name: 'Manipal Hospital Care Unit', address: 'Old Airport Road, HAL', lat: 12.9585, lng: 77.6500 },
  { id: 'hosp-4', name: 'Fortis Healthcare Hospital', address: 'Cunningham Road, Vasanth Nagar', lat: 12.9902, lng: 77.5950 }
];

const formatDuration = (totalSeconds) => {
  if (!totalSeconds || totalSeconds < 0) return '00:00:00';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

const formatCoord = (val, type) => {
  if (val == null || isNaN(val)) return '—';
  const abs = Math.abs(val).toFixed(5);
  if (type === 'lat') return `${abs}° ${val >= 0 ? 'N' : 'S'}`;
  if (type === 'lng') return `${abs}° ${val >= 0 ? 'E' : 'W'}`;
  return val.toFixed(5);
};

const LiveRouteTracker = ({
  user = null,
  activeEmergency = null,
  initialDestination = null,
  onLocationUpdate = null
}) => {
  // Use our specialized live GPS tracking hook
  const {
    isTracking,
    gpsStatus,
    gpsError,
    currentCoords,
    startCoords,
    breadcrumbs,
    distanceTravelledKm,
    durationSeconds,
    currentSpeedKmH,
    lastGpsTimestamp,
    startLiveTracking,
    stopLiveTracking,
    resetTracking
  } = useLiveGpsTracking({
    enableBackendSync: true,
    backendSyncIntervalMs: 10000,
    minDistanceFilterMeters: 2.0
  });

  const [followUser, setFollowUser] = useState(true);
  const [mapProvider, setMapProvider] = useState('initializing'); // 'leaflet' | 'canvas'
  const [hospitals, setHospitals] = useState(DEFAULT_HOSPITALS);
  const [selectedDestinationId, setSelectedDestinationId] = useState(() => {
    if (initialDestination?.id) return initialDestination.id;
    if (activeEmergency?.hospitalId) return String(activeEmergency.hospitalId);
    return 'hosp-1'; // Default to City General Hospital
  });

  // Target destination coordinates and metadata
  const selectedHospital = useMemo(() => {
    if (selectedDestinationId === 'none') return null;
    return hospitals.find(h => String(h.id) === String(selectedDestinationId)) || hospitals[0] || null;
  }, [hospitals, selectedDestinationId]);

  // Route calculation to destination via OSRM
  const [remainingRoute, setRemainingRoute] = useState(null);
  const [etaMinutes, setEtaMinutes] = useState(null);
  const [remainingDistanceKm, setRemainingDistanceKm] = useState(null);

  // Map and layer references
  const mapContainerRef = useRef(null);
  const leafletMapRef = useRef(null);
  const markersRef = useRef({ user: null, start: null, destination: null });
  const polylinesRef = useRef({ travelled: null, remaining: null });

  // Load available hospitals from backend
  useEffect(() => {
    let active = true;
    API.get('/hospitals')
      .then(res => {
        if (active && Array.isArray(res.data) && res.data.length > 0) {
          const mapped = res.data.map(h => ({
            id: String(h.id),
            name: h.name,
            address: h.address || 'Hospital Emergency Center',
            lat: h.lat != null ? Number(h.lat) : 12.9800,
            lng: h.lng != null ? Number(h.lng) : 77.6000
          }));
          setHospitals(mapped);
        }
      })
      .catch(() => {
        // Fall back to DEFAULT_HOSPITALS
      });
    return () => { active = false; };
  }, []);

  // Update remaining driving route to destination when currentCoords or destination changes
  useEffect(() => {
    let active = true;
    if (!currentCoords || !selectedHospital) {
      setRemainingRoute(null);
      setEtaMinutes(null);
      setRemainingDistanceKm(null);
      return;
    }

    const start = [currentCoords.latitude, currentCoords.longitude];
    const end = [selectedHospital.lat, selectedHospital.lng];

    getDrivingRoute(start, end).then(res => {
      if (active && res) {
        setRemainingRoute(res.coordinates || []);
        setRemainingDistanceKm(res.distanceKm);
        setEtaMinutes(res.etaMinutes);
      }
    });

    return () => { active = false; };
  }, [currentCoords, selectedHospital]);

  // Notify parent of location changes if callback provided
  useEffect(() => {
    if (currentCoords && onLocationUpdate) {
      onLocationUpdate(currentCoords);
    }
  }, [currentCoords, onLocationUpdate]);

  // ==========================================================================
  // LEAFLET MAP INITIALIZATION
  // ==========================================================================
  const initLeafletMap = useCallback(() => {
    const L = typeof window !== 'undefined' ? window.L : null;
    if (!L || !mapContainerRef.current) {
      setMapProvider('canvas');
      return false;
    }

    if (leafletMapRef.current) {
      try {
        leafletMapRef.current.remove();
      } catch {
        // ignore
      }
      leafletMapRef.current = null;
    }

    const centerLat = currentCoords?.latitude || startCoords?.[0] || selectedHospital?.lat || 12.9716;
    const centerLng = currentCoords?.longitude || startCoords?.[1] || selectedHospital?.lng || 77.5946;

    try {
      const map = L.map(mapContainerRef.current, {
        center: [centerLat, centerLng],
        zoom: 14,
        zoomControl: false
      });

      // High-contrast clean OpenStreetMap road tiles
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(map);

      // Clean zoom controls in bottom-left
      L.control.zoom({ position: 'bottomleft' }).addTo(map);

      leafletMapRef.current = map;
      setMapProvider('leaflet');

      setTimeout(() => {
        try {
          map.invalidateSize();
        } catch {
          // ignore
        }
      }, 200);

      return true;
    } catch (err) {
      console.warn('[LiveRouteTracker] Leaflet init error, switching to canvas:', err);
      setMapProvider('canvas');
      return false;
    }
  }, [currentCoords, startCoords, selectedHospital]);

  // Initialize map on component mount
  useEffect(() => {
    initLeafletMap();
    return () => {
      if (leafletMapRef.current) {
        try {
          leafletMapRef.current.remove();
        } catch {
          // ignore
        }
        leafletMapRef.current = null;
      }
    };
  }, [initLeafletMap]);

  // ==========================================================================
  // UPDATE LEAFLET MARKERS & POLYLINES
  // ==========================================================================
  useEffect(() => {
    const L = typeof window !== 'undefined' ? window.L : null;
    const map = leafletMapRef.current;
    if (!L || !map) return;

    const bounds = [];

    // 1. Start Marker
    if (startCoords) {
      bounds.push(startCoords);
      const startIcon = L.divIcon({
        className: 'custom-start-marker',
        html: `
          <div style="display:flex; flex-direction:column; align-items:center; transform:translate(-50%, -100%);">
            <div style="
              width: 32px;
              height: 32px;
              border-radius: 50%;
              background: #0284C7;
              border: 3px solid #FFFFFF;
              box-shadow: 0 0 12px rgba(2, 132, 199, 0.6);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 16px;
            ">
              📍
            </div>
            <div style="
              font-size: 10px;
              font-weight: 800;
              color: #0369A1;
              background: rgba(255, 255, 255, 0.95);
              padding: 2px 6px;
              border-radius: 10px;
              border: 1px solid #BAE6FD;
              box-shadow: 0 2px 6px rgba(0,0,0,0.1);
              white-space: nowrap;
              margin-top: 2px;
            ">
              START POINT
            </div>
          </div>
        `,
        iconSize: [0, 0]
      });

      if (!markersRef.current.start) {
        markersRef.current.start = L.marker(startCoords, { icon: startIcon, zIndexOffset: 500 })
          .bindPopup(`<strong>Journey Start Point</strong><br/>GPS: ${startCoords[0].toFixed(5)}, ${startCoords[1].toFixed(5)}`)
          .addTo(map);
      } else {
        markersRef.current.start.setLatLng(startCoords);
      }
    }

    // 2. Destination Hospital Marker
    if (selectedHospital) {
      const destPos = [selectedHospital.lat, selectedHospital.lng];
      bounds.push(destPos);
      const destIcon = L.divIcon({
        className: 'custom-dest-marker',
        html: `
          <div style="display:flex; flex-direction:column; align-items:center; transform:translate(-50%, -100%);">
            <div style="
              width: 38px;
              height: 38px;
              border-radius: 50%;
              background: #0B1F3A;
              border: 3px solid #FFFFFF;
              box-shadow: 0 0 16px rgba(11, 31, 58, 0.6);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 19px;
            ">
              🏥
            </div>
            <div style="
              font-size: 10px;
              font-weight: 800;
              color: #0B1F3A;
              background: rgba(255, 255, 255, 0.96);
              padding: 2px 8px;
              border-radius: 10px;
              border: 1px solid #CBD5E1;
              box-shadow: 0 2px 6px rgba(0,0,0,0.12);
              white-space: nowrap;
              margin-top: 2px;
            ">
              ${selectedHospital.name}
            </div>
          </div>
        `,
        iconSize: [0, 0]
      });

      if (!markersRef.current.destination) {
        markersRef.current.destination = L.marker(destPos, { icon: destIcon, zIndexOffset: 700 })
          .bindPopup(`<strong>${selectedHospital.name}</strong><br/>${selectedHospital.address}<br/>Destination Hospital`)
          .addTo(map);
      } else {
        markersRef.current.destination.setLatLng(destPos);
        markersRef.current.destination.setIcon(destIcon);
      }
    } else if (markersRef.current.destination) {
      map.removeLayer(markersRef.current.destination);
      markersRef.current.destination = null;
    }

    // 3. User Live Marker (Pulsing Radar Beacon + Heading Arrow)
    if (currentCoords) {
      const userPos = [currentCoords.latitude, currentCoords.longitude];
      bounds.push(userPos);

      const heading = currentCoords.heading || 0;
      const userIcon = L.divIcon({
        className: 'custom-user-live-marker',
        html: `
          <div style="display:flex; flex-direction:column; align-items:center; transform:translate(-50%, -100%);">
            <div style="
              position: relative;
              width: 44px;
              height: 44px;
              border-radius: 50%;
              background: #0D9488;
              border: 3px solid #FFFFFF;
              box-shadow: 0 0 20px rgba(13, 148, 136, 0.8);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 20px;
            ">
              <span style="display:inline-block; transform: rotate(${heading}deg); transition: transform 0.3s ease;">
                🧭
              </span>
              <div style="
                position: absolute;
                top: -3px;
                right: -3px;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: #10B981;
                border: 2px solid #FFFFFF;
                box-shadow: 0 0 8px #10B981;
                animation: sirenBeaconPulse 0.9s infinite alternate;
              " />
            </div>
            <div style="
              font-size: 10px;
              font-weight: 800;
              color: #0F766E;
              background: rgba(255, 255, 255, 0.98);
              padding: 2px 8px;
              border-radius: 12px;
              border: 1px solid #99F6E4;
              box-shadow: 0 2px 8px rgba(13, 148, 136, 0.25);
              white-space: nowrap;
              margin-top: 3px;
              letter-spacing: 0.04em;
            ">
              YOU (LIVE GPS)
            </div>
          </div>
        `,
        iconSize: [0, 0]
      });

      if (!markersRef.current.user) {
        markersRef.current.user = L.marker(userPos, { icon: userIcon, zIndexOffset: 1000 })
          .bindPopup(`<strong>Your Live GPS Location</strong><br/>Lat: ${userPos[0].toFixed(5)}, Lng: ${userPos[1].toFixed(5)}<br/>Speed: ${currentSpeedKmH} km/h`)
          .addTo(map);
      } else {
        markersRef.current.user.setIcon(userIcon);
        markersRef.current.user.setLatLng(userPos);
      }

      // Keep user visible on map if follow mode is active
      if (followUser) {
        map.panTo(userPos, { animate: true, duration: 0.7 });
      }
    }

    // 4. Travelled Route Polyline: Solid Medical Teal (#0D9488)
    if (breadcrumbs.length >= 2) {
      if (polylinesRef.current.travelled) {
        polylinesRef.current.travelled.setLatLngs(breadcrumbs);
      } else {
        polylinesRef.current.travelled = L.polyline(breadcrumbs, {
          color: '#0D9488',
          weight: 5,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(map);
      }
    } else if (polylinesRef.current.travelled && breadcrumbs.length === 0) {
      map.removeLayer(polylinesRef.current.travelled);
      polylinesRef.current.travelled = null;
    }

    // 5. Remaining Route to Destination: Dashed Vital Blue (#2563EB)
    if (remainingRoute && remainingRoute.length >= 2) {
      if (polylinesRef.current.remaining) {
        polylinesRef.current.remaining.setLatLngs(remainingRoute);
      } else {
        polylinesRef.current.remaining = L.polyline(remainingRoute, {
          color: '#2563EB',
          weight: 4.5,
          opacity: 0.85,
          dashArray: '8, 8',
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(map);
      }
    } else if (polylinesRef.current.remaining) {
      map.removeLayer(polylinesRef.current.remaining);
      polylinesRef.current.remaining = null;
    }
  }, [
    currentCoords,
    startCoords,
    selectedHospital,
    breadcrumbs,
    remainingRoute,
    followUser,
    currentSpeedKmH
  ]);

  // Handle Fit Bounds action
  const handleFitBounds = () => {
    setFollowUser(false);
    const map = leafletMapRef.current;
    if (!map) return;

    const points = [];
    if (breadcrumbs.length > 0) points.push(...breadcrumbs);
    else if (currentCoords) points.push([currentCoords.latitude, currentCoords.longitude]);
    if (startCoords) points.push(startCoords);
    if (selectedHospital) points.push([selectedHospital.lat, selectedHospital.lng]);

    if (points.length >= 2) {
      map.fitBounds(points, { padding: [50, 50], maxZoom: 16 });
    } else if (points.length === 1) {
      map.setView(points[0], 15);
    }
  };

  // ==========================================================================
  // TACTICAL VECTOR RADAR FALLBACK (Test / Offline Resilience)
  // ==========================================================================
  const renderTacticalCanvas = () => {
    return (
      <div
        data-testid="tactical-canvas-hud"
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          background: 'radial-gradient(ellipse at center, #0F2744 0%, #071526 100%)',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'monospace'
        }}
      >
        {/* Subtle grid pattern */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'linear-gradient(rgba(13, 148, 136, 0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(13, 148, 136, 0.12) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          opacity: 0.7
        }} />

        {/* Animated Vector Route Line */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <defs>
            <linearGradient id="liveRouteGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0D9488" />
              <stop offset="100%" stopColor="#2563EB" />
            </linearGradient>
          </defs>
          <path
            d="M 120,320 Q 280,240 480,210 T 780,120"
            fill="none"
            stroke="url(#liveRouteGradient)"
            strokeWidth="4"
            strokeDasharray={isTracking ? '8 6' : 'none'}
          />
        </svg>

        {/* Start Point Node */}
        <div style={{ position: 'absolute', bottom: '26%', left: '12%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: '#0284C7',
            border: '2px solid #BAE6FD',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px'
          }}>
            📍
          </div>
          <span style={{ fontSize: '11px', color: '#BAE6FD', background: 'rgba(2, 132, 199, 0.9)', padding: '2px 8px', borderRadius: '4px' }}>
            Start Point
          </span>
        </div>

        {/* Live User Node */}
        <div style={{ position: 'absolute', top: '44%', left: '48%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            background: '#0D9488',
            border: '3px solid #2DD4BF',
            boxShadow: '0 0 16px rgba(45, 212, 191, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px'
          }}>
            🧭
          </div>
          <span style={{ fontSize: '11px', color: '#ECFDF5', background: 'rgba(13, 148, 136, 0.9)', padding: '2px 8px', borderRadius: '4px' }}>
            Live GPS Position
          </span>
        </div>

        {/* Destination Hospital Node */}
        {selectedHospital && (
          <div style={{ position: 'absolute', top: '18%', right: '16%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: '#0B1F3A',
              border: '2px solid #38BDF8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px'
            }}>
              🏥
            </div>
            <span style={{ fontSize: '11px', color: '#E0F2FE', background: 'rgba(11, 31, 58, 0.9)', padding: '2px 8px', borderRadius: '4px' }}>
              {selectedHospital.name}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="live-route-tracker-card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4, 16px)' }}>
      {/* Header Bar */}
      <div style={{
        background: 'var(--color-surface, #FFFFFF)',
        border: '1px solid var(--color-gray-200, #E2E8F0)',
        borderRadius: 'var(--radius-xl, 16px)',
        padding: 'var(--space-4, 16px) var(--space-5, 20px)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 'var(--space-3, 12px)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>🧭</span>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-gray-900, #0F172A)', margin: 0 }}>
                Live GPS Route Tracking
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--color-gray-500, #64748B)', margin: '2px 0 0 0' }}>
                Real-time satellite positioning, movement breadcrumbs & hospital route guidance
              </p>
            </div>
          </div>
        </div>

        {/* Live Tracking Status Indicator & Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Status Badge */}
          {gpsStatus === 'ACTIVE' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#ECFDF5',
              color: '#065F46',
              border: '1.5px solid #A7F3D0',
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 800,
              letterSpacing: '0.04em'
            }}>
              <span className="pulse-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
              LIVE TRACKING ACTIVE
            </div>
          )}

          {gpsStatus === 'REQUESTING' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#FEF3C7',
              color: '#92400E',
              border: '1.5px solid #FDE68A',
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 800
            }}>
              🛰️ ACQUIRING GPS LOCK...
            </div>
          )}

          {gpsStatus === 'STOPPED' && (
            <div style={{
              background: '#F1F5F9',
              color: '#475569',
              border: '1px solid #CBD5E1',
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 700
            }}>
              ⏹️ TRACKING STOPPED
            </div>
          )}

          {(gpsStatus === 'DENIED' || gpsStatus === 'UNAVAILABLE' || gpsStatus === 'TIMEOUT' || gpsStatus === 'ERROR') && (
            <div style={{
              background: '#FEF2F2',
              color: '#991B1B',
              border: '1px solid #FECACA',
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 800
            }}>
              ⚠️ GPS ERROR
            </div>
          )}

          {gpsStatus === 'IDLE' && (
            <div style={{
              background: '#F8FAFC',
              color: '#64748B',
              border: '1px solid #E2E8F0',
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 600
            }}>
              STANDBY
            </div>
          )}

          {/* Action Trigger Buttons */}
          {!isTracking ? (
            <button
              type="button"
              onClick={startLiveTracking}
              className="btn btn-primary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                fontWeight: 800,
                fontSize: '13px',
                borderRadius: 'var(--radius-lg, 10px)'
              }}
            >
              <span>▶</span>
              <span>Start Live Tracking</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={stopLiveTracking}
              className="btn btn-critical"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                fontWeight: 800,
                fontSize: '13px',
                borderRadius: 'var(--radius-lg, 10px)'
              }}
            >
              <span>⏹</span>
              <span>Stop Live Tracking</span>
            </button>
          )}

          {/* Clear Route Reset button (available when stopped with breadcrumbs) */}
          {!isTracking && breadcrumbs.length > 0 && (
            <button
              type="button"
              onClick={resetTracking}
              className="btn btn-secondary"
              style={{
                padding: '9px 14px',
                fontWeight: 700,
                fontSize: '13px',
                borderRadius: 'var(--radius-lg, 10px)'
              }}
              title="Clear recorded route breadcrumbs"
            >
              ↺ Reset
            </button>
          )}
        </div>
      </div>

      {/* Permission Denied / GPS Error Notification Banner */}
      {gpsError && (
        <div
          role="alert"
          style={{
            background: '#FEF2F2',
            border: '1.5px solid #FECACA',
            borderRadius: 'var(--radius-lg, 12px)',
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            color: '#991B1B',
            fontSize: '13px'
          }}
        >
          <span style={{ fontSize: '22px' }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, marginBottom: '2px' }}>GPS Location Error</div>
            <div>{gpsError}</div>
          </div>
          <button
            type="button"
            onClick={startLiveTracking}
            className="btn btn-critical btn-xs"
            style={{ whiteSpace: 'nowrap' }}
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Navigation Destination Selector & Route Targeting */}
      <div style={{
        background: 'var(--color-surface, #FFFFFF)',
        border: '1px solid var(--color-gray-200, #E2E8F0)',
        borderRadius: 'var(--radius-xl, 16px)',
        padding: 'var(--space-3, 12px) var(--space-4, 16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 'var(--space-3, 12px)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>🏥</span>
          <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-gray-800, #1E293B)' }}>
            Destination Hospital:
          </span>
          <select
            value={selectedDestinationId}
            onChange={(e) => setSelectedDestinationId(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid var(--color-gray-300, #CBD5E1)',
              background: '#FFFFFF',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--color-gray-800, #1E293B)',
              minWidth: '240px'
            }}
          >
            <option value="none">None (Free Movement Tracking)</option>
            {hospitals.map(h => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.address ? h.address.split(',')[0] : 'Emergency Unit'})
              </option>
            ))}
          </select>
        </div>

        {selectedHospital && (
          <div style={{ fontSize: '12px', color: 'var(--color-gray-600, #475569)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Target Coordinates:</span>
            <code style={{ background: '#F1F5F9', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', color: '#0B1F3A', fontWeight: 700 }}>
              {selectedHospital.lat.toFixed(4)}, {selectedHospital.lng.toFixed(4)}
            </code>
          </div>
        )}
      </div>

      {/* Telemetry Dashboard HUD (5 Metrics Cards) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 'var(--space-3, 12px)'
      }}>
        {/* Metric 1: Current Coordinates */}
        <div className="card" style={{ padding: 'var(--space-3, 12px) var(--space-4, 16px)' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-gray-500, #64748B)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            🌐 GPS Location
          </div>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-gray-900, #0F172A)', marginTop: '4px' }}>
            {currentCoords ? (
              <span>
                {formatCoord(currentCoords.latitude, 'lat')}, {formatCoord(currentCoords.longitude, 'lng')}
              </span>
            ) : (
              <span style={{ color: 'var(--color-gray-400, #94A3B8)' }}>Standby</span>
            )}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-gray-500, #64748B)', marginTop: '2px' }}>
            {currentCoords?.accuracy != null ? `Accuracy ±${currentCoords.accuracy}m` : 'Satellite ready'}
          </div>
        </div>

        {/* Metric 2: Current Speed */}
        <div className="card" style={{ padding: 'var(--space-3, 12px) var(--space-4, 16px)' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-gray-500, #64748B)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            ⚡ Current Speed
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#0D9488', marginTop: '4px' }}>
            {currentSpeedKmH != null ? `${currentSpeedKmH} km/h` : '0.0 km/h'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-gray-500, #64748B)', marginTop: '2px' }}>
            {isTracking ? 'Active velocity tracking' : 'Stationary'}
          </div>
        </div>

        {/* Metric 3: Distance Travelled */}
        <div className="card" style={{ padding: 'var(--space-3, 12px) var(--space-4, 16px)' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-gray-500, #64748B)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            📏 Distance Travelled
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-primary, #0B1F3A)', marginTop: '4px' }}>
            {distanceTravelledKm != null ? `${distanceTravelledKm} km` : '0.00 km'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-gray-500, #64748B)', marginTop: '2px' }}>
            {breadcrumbs.length} breadcrumb points
          </div>
        </div>

        {/* Metric 4: Tracking Duration */}
        <div className="card" style={{ padding: 'var(--space-3, 12px) var(--space-4, 16px)' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-gray-500, #64748B)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            ⏱️ Tracking Duration
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-gray-900, #0F172A)', marginTop: '4px', fontFamily: 'monospace' }}>
            {formatDuration(durationSeconds)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-gray-500, #64748B)', marginTop: '2px' }}>
            {isTracking ? 'Live session timer' : 'Timer stopped'}
          </div>
        </div>

        {/* Metric 5: Estimated Arrival Time (ETA) to Destination */}
        <div className="card" style={{ padding: 'var(--space-3, 12px) var(--space-4, 16px)' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-gray-500, #64748B)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            🏥 Destination ETA
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#2563EB', marginTop: '4px' }}>
            {selectedHospital ? (
              etaMinutes != null ? `${etaMinutes} mins` : 'Calculating...'
            ) : (
              '—'
            )}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-gray-500, #64748B)', marginTop: '2px' }}>
            {selectedHospital ? (
              remainingDistanceKm != null ? `${remainingDistanceKm} km road distance` : selectedHospital.name
            ) : (
              'Free roaming mode'
            )}
          </div>
        </div>
      </div>

      {/* Interactive Map Section */}
      <div style={{
        position: 'relative',
        width: '100%',
        height: '520px',
        borderRadius: 'var(--radius-xl, 16px)',
        overflow: 'hidden',
        border: '1px solid var(--color-gray-200, #E2E8F0)',
        boxShadow: '0 4px 18px rgba(0,0,0,0.06)',
        background: '#0B1F3A'
      }}>
        {/* Leaflet DOM container */}
        <div
          ref={mapContainerRef}
          style={{ width: '100%', height: '100%' }}
        />

        {/* Tactical vector canvas fallback when Leaflet is unavailable in test/offline environments */}
        {mapProvider === 'canvas' && renderTacticalCanvas()}

        {/* Floating Map Legend & Control Overlay */}
        <div style={{
          position: 'absolute',
          top: '14px',
          left: '14px',
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(8px)',
          border: '1px solid var(--color-gray-200, #E2E8F0)',
          borderRadius: '12px',
          padding: '8px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          zIndex: 10,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-gray-700, #334155)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🗺️ MAP ROUTE LEGEND</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '11px', color: 'var(--color-gray-600, #475569)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '14px', height: '4px', background: '#0D9488', borderRadius: '2px', display: 'inline-block' }} />
              <span>Travelled Route</span>
            </div>
            {selectedHospital && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '14px', height: '4px', borderTop: '2px dashed #2563EB', display: 'inline-block' }} />
                <span>Hospital Navigation</span>
              </div>
            )}
          </div>
        </div>

        {/* Floating Controls (Top Right): Follow Me Toggle & Fit Route */}
        <div style={{
          position: 'absolute',
          top: '14px',
          right: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 10
        }}>
          <button
            type="button"
            onClick={() => setFollowUser(!followUser)}
            className={`btn btn-sm ${followUser ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              background: followUser ? '#0D9488' : 'rgba(255, 255, 255, 0.95)',
              color: followUser ? '#FFFFFF' : 'var(--color-gray-800, #1E293B)',
              fontSize: '11px',
              fontWeight: 700,
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}
            title="Auto-center map on moving user position"
          >
            {followUser ? '🎯 Centered on Me' : '🧭 Free Pan'}
          </button>

          <button
            type="button"
            onClick={handleFitBounds}
            className="btn btn-secondary btn-sm"
            style={{
              background: 'rgba(255, 255, 255, 0.95)',
              fontSize: '11px',
              fontWeight: 700,
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}
            title="Fit full route and destinations in map viewport"
          >
            🔍 Fit Full Route
          </button>
        </div>

        {/* Bottom Floating Telemetry Bar */}
        <div style={{
          position: 'absolute',
          bottom: '14px',
          right: '14px',
          background: 'rgba(255, 255, 255, 0.96)',
          backdropFilter: 'blur(8px)',
          border: '1px solid var(--color-gray-200, #E2E8F0)',
          borderRadius: '12px',
          padding: '8px 14px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          zIndex: 10
        }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-gray-500, #64748B)', textTransform: 'uppercase' }}>
              Last GPS Update
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-gray-900, #0F172A)' }}>
              {lastGpsTimestamp ? lastGpsTimestamp.toLocaleTimeString() : 'Awaiting GPS lock'}
            </div>
          </div>

          <div style={{ width: '1px', height: '24px', background: '#E2E8F0' }} />

          <div>
            <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-gray-500, #64748B)', textTransform: 'uppercase' }}>
              Telemetry Provider
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#0D9488' }}>
              Device Hardware GPS (WGS84)
            </div>
          </div>
        </div>
      </div>

      {/* Completed Route Summary Panel (Shown when tracking was active and stopped) */}
      {!isTracking && breadcrumbs.length >= 2 && (
        <div style={{
          background: '#F8FAFC',
          border: '1.5px solid #CBD5E1',
          borderRadius: 'var(--radius-xl, 16px)',
          padding: 'var(--space-4, 16px) var(--space-5, 20px)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-3, 12px)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '26px' }}>🏁</span>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-gray-900, #0F172A)' }}>
                Route Tracking Complete
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-gray-600, #475569)', marginTop: '2px' }}>
                Your route has been recorded and preserved. Total {distanceTravelledKm} km covered over {formatDuration(durationSeconds)}.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={startLiveTracking}
              className="btn btn-primary btn-sm"
              style={{ fontWeight: 800 }}
            >
              ▶ Resume Tracking
            </button>
            <button
              type="button"
              onClick={resetTracking}
              className="btn btn-secondary btn-sm"
            >
              Clear Route & Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveRouteTracker;

