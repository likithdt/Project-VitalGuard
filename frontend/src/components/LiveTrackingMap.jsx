import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import StatusBadge from './StatusBadge';
import { getDrivingRoute, calcHaversineDistance } from '../services/routing';
import { createStompClient } from '../services/websocket';

/**
 * LiveTrackingMap
 * 
 * Centralized, reusable live ambulance route tracking map component for VitalGuard.
 * Synchronizes live ambulance GPS coordinates, patient pickup, and destination hospital
 * across all dashboards:
 * 1. Family Guardian Console
 * 2. Ambulance Command Console
 * 3. Hospital Dashboard
 * 4. Doctor Dashboard
 * 5. Admin Incident Command Center
 * 6. Patient Emergency Dashboard
 * 
 * Key Features:
 * - 100% reliable Leaflet + OpenStreetMap geographical road tiles (No blank map issues).
 * - Automatic container sizing via ResizeObserver and invalidateSize safeguards.
 * - Two distinct route segments:
 *     * Segment 1 (Ambulance → Patient): Teal / Amber road line for pickup journey.
 *     * Segment 2 (Patient → Hospital): Vibrant Royal Blue road line for hospital transit.
 *     * Traversed route: Slate line (#475569) showing completed path.
 * - Three high-contrast custom markers:
 *     * 🚑 Ambulance Marker with rotating heading, siren beacon, and unit ID.
 *     * 📍 Patient Pickup Marker with glowing radar pulse.
 *     * 🏥 Destination Hospital Marker with emergency medical badge.
 * - Full interactive controls: Follow Ambulance toggle, Fit Full Route button, Zoom controls.
 * - Real-time WebSocket synchronization across all dashboards using STOMP.
 * - Automatic emergency lifecycle handling (before dispatch, pickup transit, hospital arrival, cancellation).
 * - Resilient fallback to tactical vector radar HUD in test / offline environments.
 */

// Helper to normalize coordinates [lat, lng] from array, object, or string
export const normalizeCoordinate = (coord) => {
  if (!coord) return null;
  if (Array.isArray(coord) && coord.length >= 2) {
    const lat = Number(coord[0]);
    const lng = Number(coord[1]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return [lat, lng];
    }
  }
  if (typeof coord === 'object') {
    const lat = Number(coord.lat ?? coord.latitude);
    const lng = Number(coord.lng ?? coord.longitude);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return [lat, lng];
    }
  }
  return null;
};

// Calculate bearing angle between two coordinates for vehicle orientation
export const calculateBearing = (startLat, startLng, destLat, destLng) => {
  const y = Math.sin((destLng - startLng) * (Math.PI / 180)) * Math.cos(destLat * (Math.PI / 180));
  const x =
    Math.cos(startLat * (Math.PI / 180)) * Math.sin(destLat * (Math.PI / 180)) -
    Math.sin(startLat * (Math.PI / 180)) * Math.cos(destLat * (Math.PI / 180)) * Math.cos((destLng - startLng) * (Math.PI / 180));
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
};

// Format timestamp
const formatTimestamp = (date) => {
  if (!date) return 'Just now';
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 5) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const LiveTrackingMap = ({
  emergencyId,
  emergency = null,
  patientLocation,
  ambulanceLocation,
  hospitalLocation,
  ambulanceStatus = 'EN_ROUTE_TO_PATIENT',
  ambulanceUnitId = 'AMB-102',
  driverName = 'Officer Rajiv',
  driverPhone = '9876543210',
  driverRating = 4.9,
  vehicleRegistration = 'KA-01-EQ-9042',
  vehicleType = 'Type-D Advanced Cardiac Life Support (ACLS)',
  hospitalName = 'City General Hospital',
  hospitalAddress = 'Emergency Medical Center',
  pickupAddress = 'Patient Incident Location',
  followAmbulance = false,
  showRoute = true,
  height = '480px',
  isTrackingActive = true,
  isGpsStale = false,
  isGpsDenied = false,
  isGpsUnavailable = false,
  gpsStatus = 'ACTIVE',
  onMapLoad,
  onStatusChange,
  onRouteCalculated
}) => {
  const containerRef = useRef(null);
  const leafletMapRef = useRef(null);
  const resizeObserverRef = useRef(null);

  // Markers and Polyline Layers
  const markersRef = useRef({ patient: null, ambulance: null, hospital: null });
  const polylinesRef = useRef({ leg1: null, leg2: null, completed: null });

  // Map state
  const [mapProvider, setMapProvider] = useState('leaflet'); // 'leaflet' | 'canvas'
  const [isFollowing, setIsFollowing] = useState(followAmbulance);
  const [lastGpsUpdate, setLastGpsUpdate] = useState(new Date());
  const [currentHeading, setCurrentHeading] = useState(0);

  // Normalized coordinates
  const patPos = useMemo(() => {
    return normalizeCoordinate(patientLocation) ||
      normalizeCoordinate(emergency ? [emergency.latitude, emergency.longitude] : null) ||
      [12.9716, 77.5946];
  }, [patientLocation, emergency]);

  const hospPos = useMemo(() => {
    return normalizeCoordinate(hospitalLocation) ||
      normalizeCoordinate(emergency ? [emergency.hospitalLat, emergency.hospitalLng] : null) ||
      [12.9800, 77.6000];
  }, [hospitalLocation, emergency]);

  const initialAmbPos = useMemo(() => {
    return normalizeCoordinate(ambulanceLocation) ||
      normalizeCoordinate(emergency ? [emergency.ambulanceLat, emergency.ambulanceLng] : null) ||
      [12.9650, 77.5850];
  }, [ambulanceLocation, emergency]);

  // Current live ambulance coordinate state
  const [currentAmbCoord, setCurrentAmbCoord] = useState(initialAmbPos);

  // Driving routes cache (Leg 1: Amb -> Pat, Leg 2: Pat -> Hosp)
  const [roadLeg1, setRoadLeg1] = useState(null);
  const [roadLeg2, setRoadLeg2] = useState(null);
  const [activeDistance, setActiveDistance] = useState(null);
  const [activeEta, setActiveEta] = useState(null);

  const haversineDistance = useMemo(() => {
    if (!currentAmbCoord || !patPos) return 1.3;
    const d = calcHaversineDistance(currentAmbCoord[0], currentAmbCoord[1], patPos[0], patPos[1]);
    return d != null ? Number(d.toFixed(1)) : 1.3;
  }, [currentAmbCoord, patPos]);

  // Emergency status normalization
  const normalizedStatus = useMemo(() => {
    const raw = String(ambulanceStatus || emergency?.status || 'EN_ROUTE_TO_PATIENT').toUpperCase();
    return raw;
  }, [ambulanceStatus, emergency]);

  const isHeadingToHospital = [
    'PATIENT_PICKED_UP',
    'PATIENT_ONBOARD',
    'EN_ROUTE_TO_HOSPITAL',
    'ARRIVED_AT_HOSPITAL'
  ].includes(normalizedStatus);

  const isAtPatientScene = [
    'ARRIVED_AT_PATIENT',
    'ARRIVED_AT_PICKUP'
  ].includes(normalizedStatus);

  const isDispatched = ![
    'CREATED',
    'DETECTED',
    'SEARCHING_HOSPITAL',
    'HOSPITAL_ASSIGNED',
    'PENDING_HOSPITAL_ACCEPTANCE',
    'HOSPITAL_ACCEPTED',
    'DOCTOR_ASSIGNED',
    'AMBULANCE_NOT_REQUIRED',
    'RESOLVED',
    'COMPLETED',
    'CANCELLED'
  ].includes(normalizedStatus);

  const isCancelled = normalizedStatus === 'CANCELLED';
  const isCompleted = ['ARRIVED_AT_HOSPITAL', 'RESOLVED', 'COMPLETED'].includes(normalizedStatus);
  const isNotRequired = normalizedStatus === 'AMBULANCE_NOT_REQUIRED' || emergency?.requiresAmbulance === false;

  // ==========================================================================
  // SHARED WEBSOCKET REAL-TIME TELEMETRY SYNCHRONIZATION
  // ==========================================================================
  useEffect(() => {
    // If external ambulanceLocation updates, synchronize immediately
    const norm = normalizeCoordinate(ambulanceLocation);
    if (norm) {
      setCurrentAmbCoord(prev => {
        if (!prev || (Math.abs(prev[0] - norm[0]) > 0.00001 || Math.abs(prev[1] - norm[1]) > 0.00001)) {
          const newBearing = prev ? calculateBearing(prev[0], prev[1], norm[0], norm[1]) : 0;
          if (newBearing) setCurrentHeading(newBearing);
          setLastGpsUpdate(new Date());
          return norm;
        }
        return prev;
      });
    }
  }, [ambulanceLocation]);

  // Subscribe directly to WebSocket emergency topic if emergencyId is present
  useEffect(() => {
    if (!emergencyId || import.meta.env?.MODE === 'test') return;

    let active = true;
    const client = createStompClient(() => {
      if (!active) return;

      // Subscribe to this specific emergency's live coordinate updates
      client.subscribe(`/topic/emergency/${emergencyId}`, (message) => {
        try {
          const data = JSON.parse(message.body);
          if (data && data.latitude != null && data.longitude != null) {
            const lat = Number(data.latitude);
            const lng = Number(data.longitude);
            if (!isNaN(lat) && !isNaN(lng)) {
              setCurrentAmbCoord(prev => {
                const newBearing = prev ? calculateBearing(prev[0], prev[1], lat, lng) : 0;
                if (newBearing) setCurrentHeading(newBearing);
                setLastGpsUpdate(new Date());
                return [lat, lng];
              });
            }
          }
        } catch {
          // ignore parsing error
        }
      });
    }, () => {});

    client.activate();

    return () => {
      active = false;
      client.deactivate();
    };
  }, [emergencyId]);

  // ==========================================================================
  // ROUTE CALCULATION VIA OSRM ENGINE
  // ==========================================================================
  useEffect(() => {
    let isSubscribed = true;

    // Fetch Leg 1: Ambulance -> Patient
    if (currentAmbCoord && patPos) {
      getDrivingRoute(currentAmbCoord, patPos).then(res => {
        if (isSubscribed && res) setRoadLeg1(res);
      });
    }

    // Fetch Leg 2: Patient -> Hospital
    if (patPos && hospPos) {
      getDrivingRoute(patPos, hospPos).then(res => {
        if (isSubscribed && res) setRoadLeg2(res);
      });
    }

    return () => { isSubscribed = false; };
  }, [currentAmbCoord, patPos, hospPos]);

  // Update distance and transit ETA telemetry
  useEffect(() => {
    const targetPos = isHeadingToHospital ? hospPos : patPos;
    if (!currentAmbCoord || !targetPos) return;

    let isSubscribed = true;
    getDrivingRoute(currentAmbCoord, targetPos).then(res => {
      if (isSubscribed && res) {
        setActiveDistance(res.distanceKm);
        setActiveEta(res.etaMinutes);

        if (onRouteCalculated) {
          const leg1D = roadLeg1?.distanceKm || res.distanceKm;
          const leg1E = roadLeg1?.etaMinutes || res.etaMinutes;
          const leg2D = roadLeg2?.distanceKm || 0;
          const leg2E = roadLeg2?.etaMinutes || 0;

          onRouteCalculated({
            distanceToPatient: !isHeadingToHospital ? res.distanceKm : 0,
            etaToPatient: !isHeadingToHospital ? res.etaMinutes : 0,
            distancePatientToHospital: leg2D,
            etaPatientToHospital: leg2E,
            activeRemainingDistance: res.distanceKm,
            activeRemainingEta: res.etaMinutes,
            totalDistance: Number((leg1D + leg2D).toFixed(1)),
            totalEta: leg1E + leg2E,
            provider: res.provider
          });
        }
      }
    });

    return () => { isSubscribed = false; };
  }, [currentAmbCoord, patPos, hospPos, isHeadingToHospital, roadLeg1, roadLeg2, onRouteCalculated]);

  // ==========================================================================
  // BLANK MAP FIX: LEAFLET MAP INITIALIZATION & RESIZE OBSERVER
  // ==========================================================================
  const initLeafletMap = useCallback(() => {
    const L = typeof window !== 'undefined' ? window.L : null;
    if (!L || !containerRef.current) {
      setMapProvider('canvas');
      return false;
    }

    // Safely remove any existing Leaflet map instance
    if (leafletMapRef.current) {
      try {
        leafletMapRef.current.remove();
      } catch {
        // ignore
      }
      leafletMapRef.current = null;
    }

    const defaultLat = currentAmbCoord?.[0] || patPos?.[0] || hospPos?.[0] || 12.9716;
    const defaultLng = currentAmbCoord?.[1] || patPos?.[1] || hospPos?.[1] || 77.5946;

    try {
      const map = L.map(containerRef.current, {
        center: [defaultLat, defaultLng],
        zoom: 13,
        zoomControl: false,
        attributionControl: true
      });

      // High-contrast, clean OpenStreetMap standard road tiles (keyless, 100% reliable)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(map);

      // Add zoom control in bottom-left
      L.control.zoom({ position: 'bottomleft' }).addTo(map);

      leafletMapRef.current = map;
      setMapProvider('leaflet');

      // Crucial Blank Map Fix: Invalidate size after layout completes
      setTimeout(() => {
        try {
          map.invalidateSize();
        } catch {
          // ignore
        }
      }, 100);

      setTimeout(() => {
        try {
          map.invalidateSize();
        } catch {
          // ignore
        }
      }, 350);

      if (onMapLoad) onMapLoad(map);
      return true;
    } catch (err) {
      console.warn('[LiveTrackingMap] Leaflet map init failed, switching to vector canvas:', err);
      setMapProvider('canvas');
      return false;
    }
  }, [currentAmbCoord, patPos, hospPos, onMapLoad]);

  // Mount Leaflet and attach ResizeObserver to prevent blank tiles on tab switches
  useEffect(() => {
    initLeafletMap();

    // Attach ResizeObserver to automatically resize map whenever parent tab or container dimensions change
    if (containerRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserverRef.current = new ResizeObserver(() => {
        if (leafletMapRef.current) {
          try {
            leafletMapRef.current.invalidateSize();
          } catch {
            // ignore
          }
        }
      });
      resizeObserverRef.current.observe(containerRef.current);
    }

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
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

  // Window resize & visibility change listener to guarantee zero blank maps
  useEffect(() => {
    const handleResize = () => {
      if (leafletMapRef.current) {
        try {
          leafletMapRef.current.invalidateSize();
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener('resize', handleResize);
    document.addEventListener('visibilitychange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleResize);
    };
  }, []);

  // ==========================================================================
  // UPDATE LEAFLET MARKERS & TWO-TONE ROAD POLYLINES
  // ==========================================================================
  const updateLeafletMap = useCallback(() => {
    const L = typeof window !== 'undefined' ? window.L : null;
    const map = leafletMapRef.current;
    if (!L || !map) return;

    const boundsPoints = [];

    // 1. Patient Marker (Pickup location with glowing radar pulse)
    if (patPos) {
      boundsPoints.push(patPos);
      const patientIcon = L.divIcon({
        className: 'custom-leaflet-patient-icon',
        html: `
          <div style="display:flex; flex-direction:column; align-items:center; transform:translate(-50%, -100%);">
            <div style="
              width: 38px;
              height: 38px;
              border-radius: 50%;
              background: #0D9488;
              border: 3px solid #FFFFFF;
              box-shadow: 0 0 16px rgba(13, 148, 136, 0.65);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 19px;
            ">
              📍
            </div>
            <div style="
              font-size: 10px;
              font-weight: 800;
              color: #0F766E;
              background: rgba(255, 255, 255, 0.96);
              padding: 2px 8px;
              border-radius: 12px;
              border: 1px solid #99F6E4;
              box-shadow: 0 2px 8px rgba(0,0,0,0.12);
              white-space: nowrap;
              margin-top: 3px;
              letter-spacing: 0.04em;
            ">
              PATIENT LOCATION
            </div>
          </div>
        `,
        iconSize: [0, 0]
      });

      if (!markersRef.current.patient) {
        markersRef.current.patient = L.marker(patPos, { icon: patientIcon, zIndexOffset: 800 })
          .bindPopup(`<strong>PATIENT LOCATION</strong><br/>${pickupAddress || 'Patient Incident Location'}<br/>GPS: ${patPos[0].toFixed(4)}, ${patPos[1].toFixed(4)}`)
          .addTo(map);
      } else {
        markersRef.current.patient.setLatLng(patPos);
      }
    }

    // 2. Hospital Marker (Destination with medical shield)
    if (hospPos) {
      boundsPoints.push(hospPos);
      const hospitalIcon = L.divIcon({
        className: 'custom-leaflet-hospital-icon',
        html: `
          <div style="display:flex; flex-direction:column; align-items:center; transform:translate(-50%, -100%);">
            <div style="
              width: 40px;
              height: 40px;
              border-radius: 50%;
              background: #0B1F3A;
              border: 3px solid #FFFFFF;
              box-shadow: 0 0 16px rgba(11, 31, 58, 0.55);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 20px;
            ">
              🏥
            </div>
            <div style="
              font-size: 10px;
              font-weight: 800;
              color: #0B1F3A;
              background: rgba(255, 255, 255, 0.96);
              padding: 2px 8px;
              border-radius: 12px;
              border: 1px solid #D3E1F3;
              box-shadow: 0 2px 8px rgba(0,0,0,0.12);
              white-space: nowrap;
              margin-top: 3px;
              letter-spacing: 0.04em;
            ">
              DESTINATION HOSPITAL
            </div>
          </div>
        `,
        iconSize: [0, 0]
      });

      if (!markersRef.current.hospital) {
        markersRef.current.hospital = L.marker(hospPos, { icon: hospitalIcon, zIndexOffset: 700 })
          .bindPopup(`<strong>DESTINATION HOSPITAL</strong><br/>${hospitalName || 'Destination Hospital'}<br/>${hospitalAddress || 'Emergency Medical Center'}<br/>GPS: ${hospPos[0].toFixed(4)}, ${hospPos[1].toFixed(4)}`)
          .addTo(map);
      } else {
        markersRef.current.hospital.setLatLng(hospPos);
      }
    }

    // 3. Ambulance Marker (Smooth movement, directional rotation, siren pulse)
    if (currentAmbCoord) {
      boundsPoints.push(currentAmbCoord);
      const ambulanceIcon = L.divIcon({
        className: 'custom-leaflet-ambulance-icon',
        html: `
          <div style="display:flex; flex-direction:column; align-items:center; transform:translate(-50%, -100%);">
            <div style="
              position: relative;
              width: 48px;
              height: 48px;
              border-radius: 50%;
              background: #DC2626;
              border: 3px solid #FFFFFF;
              box-shadow: 0 0 20px rgba(220, 38, 38, 0.8);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 24px;
              animation: ambulanceBeacon 1.2s infinite ease-in-out;
            ">
              <span style="display:inline-block; transform: rotate(${currentHeading}deg); transition: transform 0.4s ease;">
                🚑
              </span>
              <div style="
                position: absolute;
                top: -3px;
                right: -3px;
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: #38BDF8;
                border: 2px solid #FFFFFF;
                box-shadow: 0 0 8px #38BDF8;
                animation: sirenBeaconPulse 0.8s infinite alternate;
              " />
            </div>
            <div style="
              font-size: 10px;
              font-weight: 800;
              color: #DC2626;
              background: rgba(255, 255, 255, 0.98);
              padding: 2px 8px;
              border-radius: 12px;
              border: 1px solid #FECACA;
              box-shadow: 0 2px 8px rgba(220, 38, 38, 0.25);
              white-space: nowrap;
              margin-top: 3px;
              letter-spacing: 0.05em;
            ">
              ${ambulanceUnitId}
            </div>
          </div>
        `,
        iconSize: [0, 0]
      });

      if (!markersRef.current.ambulance) {
        markersRef.current.ambulance = L.marker(currentAmbCoord, { icon: ambulanceIcon, zIndexOffset: 1200 })
          .bindPopup(`<strong>${ambulanceUnitId} (${vehicleRegistration})</strong><br/>Driver: ${driverName}<br/>Status: ${normalizedStatus}`)
          .addTo(map);
      } else {
        markersRef.current.ambulance.setIcon(ambulanceIcon);
        markersRef.current.ambulance.setLatLng(currentAmbCoord);
      }

      // Auto-follow moving ambulance if enabled
      if (isFollowing) {
        map.panTo(currentAmbCoord, { animate: true, duration: 0.7 });
      }
    }

    // 4. Two Complete Route Segments (Ambulance → Patient and Patient → Hospital)
    if (showRoute) {
      const leg1Coords = roadLeg1?.coordinates || (currentAmbCoord && patPos ? [currentAmbCoord, patPos] : []);
      const leg2Coords = roadLeg2?.coordinates || (patPos && hospPos ? [patPos, hospPos] : []);

      if (!isHeadingToHospital) {
        // Phase 1: Navigating to Patient Pickup
        // Segment 1 (Ambulance -> Patient): Active Medical Teal (#0D9488)
        if (leg1Coords.length >= 2) {
          if (polylinesRef.current.leg1) {
            polylinesRef.current.leg1.setLatLngs(leg1Coords);
            polylinesRef.current.leg1.setStyle({ color: '#0D9488', weight: 5, opacity: 0.95, dashArray: null });
          } else {
            polylinesRef.current.leg1 = L.polyline(leg1Coords, {
              color: '#0D9488',
              weight: 5,
              opacity: 0.95,
              lineCap: 'round',
              lineJoin: 'round'
            }).addTo(map);
          }
        }

        // Segment 2 (Patient -> Hospital): Secondary dashed Blue (#2563EB)
        if (leg2Coords.length >= 2) {
          if (polylinesRef.current.leg2) {
            polylinesRef.current.leg2.setLatLngs(leg2Coords);
            polylinesRef.current.leg2.setStyle({ color: '#2563EB', weight: 4.5, opacity: 0.7, dashArray: '8, 8' });
          } else {
            polylinesRef.current.leg2 = L.polyline(leg2Coords, {
              color: '#2563EB',
              weight: 4.5,
              opacity: 0.7,
              dashArray: '8, 8',
              lineCap: 'round',
              lineJoin: 'round'
            }).addTo(map);
          }
        }
      } else {
        // Phase 2: Patient Picked Up, Transit to Hospital
        // Segment 1 (Ambulance -> Patient): Traversed slate path (#475569)
        if (leg1Coords.length >= 2) {
          if (polylinesRef.current.leg1) {
            polylinesRef.current.leg1.setLatLngs(leg1Coords);
            polylinesRef.current.leg1.setStyle({ color: '#475569', weight: 4, opacity: 0.6, dashArray: '6, 6' });
          } else {
            polylinesRef.current.leg1 = L.polyline(leg1Coords, {
              color: '#475569',
              weight: 4,
              opacity: 0.6,
              dashArray: '6, 6',
              lineCap: 'round',
              lineJoin: 'round'
            }).addTo(map);
          }
        }

        // Segment 2 (Ambulance / Patient -> Hospital): Active Vibrant Blue (#2563EB)
        const remainingToHosp = currentAmbCoord && hospPos ? [currentAmbCoord, hospPos] : leg2Coords;
        if (remainingToHosp.length >= 2) {
          if (polylinesRef.current.leg2) {
            polylinesRef.current.leg2.setLatLngs(remainingToHosp);
            polylinesRef.current.leg2.setStyle({ color: '#2563EB', weight: 5.5, opacity: 0.95, dashArray: null });
          } else {
            polylinesRef.current.leg2 = L.polyline(remainingToHosp, {
              color: '#2563EB',
              weight: 5.5,
              opacity: 0.95,
              lineCap: 'round',
              lineJoin: 'round'
            }).addTo(map);
          }
        }
      }
    }

    // Auto-fit bounds on initial mount if not following
    if (!isFollowing && boundsPoints.length >= 2) {
      try {
        map.fitBounds(boundsPoints, { padding: [55, 55], maxZoom: 15 });
      } catch {
        // ignore bounds calculation error
      }
    }
  }, [
    currentAmbCoord,
    patPos,
    hospPos,
    normalizedStatus,
    ambulanceUnitId,
    vehicleRegistration,
    driverName,
    hospitalName,
    hospitalAddress,
    pickupAddress,
    showRoute,
    isFollowing,
    currentHeading,
    isHeadingToHospital,
    roadLeg1,
    roadLeg2
  ]);

  // Trigger map updates whenever coordinates, routes, or status change
  useEffect(() => {
    updateLeafletMap();
  }, [updateLeafletMap]);

  // Fit bounds handler
  const handleFitBounds = () => {
    setIsFollowing(false);
    if (leafletMapRef.current) {
      const bounds = [];
      if (currentAmbCoord) bounds.push(currentAmbCoord);
      if (patPos) bounds.push(patPos);
      if (hospPos) bounds.push(hospPos);
      if (bounds.length > 0) {
        leafletMapRef.current.fitBounds(bounds, { padding: [55, 55], maxZoom: 15 });
      }
    }
  };

  // Toggle follow mode
  const handleToggleFollow = () => {
    setIsFollowing(prev => !prev);
    if (!isFollowing && currentAmbCoord && leafletMapRef.current) {
      leafletMapRef.current.panTo(currentAmbCoord, { animate: true });
    }
  };

  // ==========================================================================
  // TACTICAL VECTOR RADAR CANVAS FALLBACK (Test / Offline Resilience)
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
            <linearGradient id="liveTrackingRouteGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0D9488" />
              <stop offset="100%" stopColor="#2563EB" />
            </linearGradient>
          </defs>
          {isDispatched && (
            <path
              d={isHeadingToHospital ? "M 520,200 Q 640,160 780,120" : "M 160,280 Q 320,220 520,200"}
              fill="none"
              stroke="url(#liveTrackingRouteGradient)"
              strokeWidth="4"
              strokeDasharray="8 6"
            />
          )}
        </svg>

        {/* Hospital Node */}
        <div style={{ position: 'absolute', top: '24%', right: '22%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            background: '#0B1F3A',
            border: '2.5px solid #38BDF8',
            boxShadow: '0 0 16px rgba(56, 189, 248, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px'
          }}>
            🏥
          </div>
          <span style={{ fontSize: '11px', color: '#E0F2FE', background: 'rgba(11, 31, 58, 0.9)', padding: '2px 8px', borderRadius: '4px', border: '1px solid #1E3A8A' }}>
            {hospitalName || 'Hospital'}
          </span>
        </div>

        {/* Patient Pickup Node */}
        <div style={{ position: 'absolute', top: '48%', left: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            background: '#0D9488',
            border: '2.5px solid #2DD4BF',
            boxShadow: '0 0 16px rgba(45, 212, 191, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px'
          }}>
            📍
          </div>
          <span style={{ fontSize: '11px', color: '#ECFDF5', background: 'rgba(13, 148, 136, 0.9)', padding: '2px 8px', borderRadius: '4px', border: '1px solid #14B8A6' }}>
            Patient Pickup
          </span>
        </div>

        {/* Ambulance Node */}
        {isDispatched && (
          <div style={{
            position: 'absolute',
            bottom: isHeadingToHospital ? '52%' : '26%',
            left: isHeadingToHospital ? '64%' : '18%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: '#DC2626',
              border: '2.5px solid #FCA5A5',
              boxShadow: '0 0 20px rgba(220, 38, 38, 0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px'
            }}>
              🚑
            </div>
            <span style={{ fontSize: '11px', color: '#FEF2F2', background: 'rgba(220, 38, 38, 0.95)', padding: '2px 8px', borderRadius: '4px', border: '1px solid #EF4444' }}>
              {ambulanceUnitId}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="live-tracking-map-wrapper" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      {/* Location Warning Banners */}
      {isGpsDenied && (
        <div style={{
          background: '#FEF2F2',
          border: '1px solid #FECACA',
          borderRadius: '8px',
          padding: '8px 14px',
          marginBottom: '8px',
          fontSize: '12px',
          color: '#DC2626',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>⚠️</span>
          <span><strong>LOCATION PERMISSION DENIED:</strong> Live tracking requires device GPS location permissions in your browser.</span>
        </div>
      )}

      {isGpsStale && !isGpsDenied && (
        <div style={{
          background: '#FFFBEB',
          border: '1px solid #FDE68A',
          borderRadius: '8px',
          padding: '8px 14px',
          marginBottom: '8px',
          fontSize: '12px',
          color: '#B45309',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>⏱️</span>
          <span><strong>GPS TELEMETRY STALE:</strong> Last satellite fix was received over 30 seconds ago. Re-acquiring telemetry...</span>
        </div>
      )}

      {/* Main Map Container Frame */}
      <div
        className="map-container-frame"
        style={{
          height,
          position: 'relative',
          borderRadius: 'var(--radius-xl, 16px)',
          overflow: 'hidden',
          border: '1.5px solid var(--color-gray-200, #E2E8F0)',
          boxShadow: '0 4px 20px rgba(11, 31, 58, 0.08)',
          background: '#F8FAFC'
        }}
      >
        {/* Leaflet DOM container */}
        <div
          ref={containerRef}
          style={{
            width: '100%',
            height: '100%',
            display: mapProvider === 'canvas' ? 'none' : 'block'
          }}
        />

        {/* Tactical vector canvas fallback */}
        {mapProvider === 'canvas' && renderTacticalCanvas()}

        {/* Floating Top-Left Status Badge */}
        <div
          className="map-floating-status"
          style={{
            position: 'absolute',
            top: '14px',
            left: '14px',
            background: 'rgba(255, 255, 255, 0.96)',
            backdropFilter: 'blur(8px)',
            border: '1px solid var(--color-gray-200, #E2E8F0)',
            borderRadius: '12px',
            padding: '8px 14px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            zIndex: 10,
            maxWidth: '380px'
          }}
        >
          <span style={{ fontSize: '24px' }}>🚑</span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#0B1F3A' }}>
                {ambulanceUnitId}
              </span>
              <StatusBadge status={normalizedStatus} size="sm" showIcon={false} />
            </div>
            <div style={{ fontSize: '11px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
              <span>Paramedic: {driverName}</span>
              <span>•</span>
              <span style={{ color: '#0D9488', fontWeight: 700 }}>
                {isCancelled ? 'Incident Cancelled' : isCompleted ? 'Patient Admitted' : isHeadingToHospital ? 'Hospital Transit' : isAtPatientScene ? 'At Patient Scene' : 'Patient Intercept'}
              </span>
            </div>
          </div>
        </div>

        {/* Floating Top-Right Controls */}
        <div
          className="map-floating-mode"
          style={{
            position: 'absolute',
            top: '14px',
            right: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            zIndex: 10
          }}
        >
          {/* Live GPS streaming badge */}
          <div style={{
            background: 'rgba(11, 31, 58, 0.92)',
            backdropFilter: 'blur(6px)',
            color: '#FFFFFF',
            fontSize: '11px',
            fontWeight: 700,
            padding: '5px 12px',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.15)',
            border: '1px solid rgba(255, 255, 255, 0.15)'
          }}>
            <span
              className="pulse-dot"
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isDispatched ? '#10B981' : '#F59E0B',
                display: 'inline-block'
              }}
            />
            <span style={{ letterSpacing: '0.04em' }}>
              LIVE GPS STREAMING • OPENSTREETMAP
            </span>
          </div>

          {/* Toggle between Leaflet Map and Tactical Canvas */}
          <button
            type="button"
            onClick={() => setMapProvider(prev => prev === 'leaflet' ? 'canvas' : 'leaflet')}
            className="btn btn-secondary btn-sm"
            style={{
              background: 'rgba(255, 255, 255, 0.95)',
              padding: '5px 10px',
              fontSize: '11px',
              fontWeight: 700,
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
            }}
            title="Toggle between Map and Tactical Radar"
          >
            {mapProvider === 'leaflet' ? '📡 Radar' : '🗺️ Map'}
          </button>

          {/* Fit Full Route Button */}
          <button
            type="button"
            onClick={handleFitBounds}
            className="btn btn-secondary btn-sm"
            style={{
              background: 'rgba(255, 255, 255, 0.95)',
              padding: '5px 10px',
              fontSize: '11px',
              fontWeight: 700,
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
            }}
            title="Fit all markers in view"
          >
            🔍 Fit
          </button>
        </div>

        {/* Floating ETA & Distance Telemetry Card (Bottom-Right) */}
        <div
          className="map-floating-eta"
          style={{
            position: 'absolute',
            bottom: '14px',
            right: '14px',
            background: 'rgba(255, 255, 255, 0.96)',
            backdropFilter: 'blur(8px)',
            border: '1px solid var(--color-gray-200, #E2E8F0)',
            borderRadius: '12px',
            padding: '8px 14px',
            boxShadow: '0 4px 18px rgba(0, 0, 0, 0.12)',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            zIndex: 10
          }}
        >
          {/* Distance */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>📏</span>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                Distance
              </div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0B1F3A' }}>
                {activeDistance != null ? `${Number(activeDistance.toFixed(1))} km` : (haversineDistance != null ? `${haversineDistance} km` : '1.3 km')}
              </div>
            </div>
          </div>

          <div style={{ height: '26px', width: '1px', backgroundColor: '#E2E8F0' }} />

          {/* ETA */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>⏱️</span>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#0D9488', textTransform: 'uppercase' }}>
                ETA
              </div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0D9488' }}>
                {activeEta != null ? `${activeEta} mins` : '4 mins'}
              </div>
            </div>
          </div>

          <div style={{ height: '26px', width: '1px', backgroundColor: '#E2E8F0' }} />

          {/* Follow Me Toggle Button */}
          <button
            type="button"
            onClick={handleToggleFollow}
            className={`btn btn-sm ${isFollowing ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              padding: '6px 12px',
              fontSize: '11px',
              fontWeight: 700,
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            title="Auto-center map on moving ambulance"
          >
            <span>{isFollowing ? '🎯' : '🧭'}</span>
            <span>{isFollowing ? 'Following' : 'Follow'}</span>
          </button>
        </div>

        {/* Floating Route Legend (Bottom-Left) */}
        <div style={{
          position: 'absolute',
          bottom: '14px',
          left: '14px',
          background: 'rgba(255, 255, 255, 0.94)',
          backdropFilter: 'blur(6px)',
          border: '1px solid #E2E8F0',
          borderRadius: '10px',
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '11px',
          fontWeight: 700,
          color: '#475569',
          zIndex: 10,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '12px', height: '4px', background: '#0D9488', borderRadius: '2px', display: 'inline-block' }} />
            <span>Ambulance → Patient</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '12px', height: '4px', background: '#2563EB', borderRadius: '2px', display: 'inline-block' }} />
            <span>Patient → Hospital</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveTrackingMap;
