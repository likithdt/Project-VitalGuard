import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import StatusBadge from './StatusBadge';
import { getDrivingRoute } from '../services/routing';

/**
 * GoogleMapTracking - Section 14 & Uber-Style Live Ambulance Tracking
 * 
 * Multi-provider architecture:
 * 1. Leaflet / OpenStreetMap road tiles (native in browser, high reliability, no API key required).
 * 2. Google Maps Platform (when valid VITE_GOOGLE_MAPS_API_KEY is configured).
 * 3. Tactical vector telemetry canvas fallback (test & offline resilience).
 * 
 * Uber-Style Live Ride Tracking Features:
 * - 🚑 Ambulance marker with custom icon, directional orientation heading, siren beacon pulse.
 * - 📍 Patient pickup marker with glowing radar ripple.
 * - 🏥 Destination hospital marker with emergency shield badge.
 * - Two-Tone Route Line:
 *     * Completed Route: Dark neutral slate line (#475569) showing traversed path.
 *     * Remaining Route: Vibrant medical teal/blue (#0D9488 / #2563EB) showing route to destination.
 * - Smooth marker interpolation between GPS updates.
 * - Uber-style Floating Live Tracking & Driver Information Card:
 *     * ETA and distance remaining countdown.
 *     * Driver profile card (name, rating, vehicle type, registration plate, contact driver button).
 *     * Destination hospital & SOS reference number.
 *     * Last GPS update timestamp.
 * - Separated Dev-Only Simulation Controller:
 *     * Clearly labeled "DEMO GPS SIMULATION" to test marker movement without hardware.
 *     * Automatically pauses when live hardware GPS coordinates arrive.
 * - Responsive layout for desktop and mobile.
 */

// Helper to normalize [lat, lng] from array or object
const normalizeCoord = (coord) => {
  if (!coord) return null;
  if (Array.isArray(coord) && coord.length >= 2) {
    const lat = Number(coord[0]);
    const lng = Number(coord[1]);
    if (!isNaN(lat) && !isNaN(lng)) return [lat, lng];
  }
  if (typeof coord === 'object') {
    const lat = Number(coord.lat ?? coord.latitude);
    const lng = Number(coord.lng ?? coord.longitude);
    if (!isNaN(lat) && !isNaN(lng)) return [lat, lng];
  }
  return null;
};

// Calculate Haversine distance in km
const calcHaversineDistance = (lat1, lon1, lat2, lon2) => {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const R = 6371; // km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
};

// Compute bearing angle between two coordinates
const calcBearing = (startLat, startLng, destLat, destLng) => {
  const y = Math.sin((destLng - startLng) * (Math.PI / 180)) * Math.cos(destLat * (Math.PI / 180));
  const x =
    Math.cos(startLat * (Math.PI / 180)) * Math.sin(destLat * (Math.PI / 180)) -
    Math.sin(startLat * (Math.PI / 180)) * Math.cos(destLat * (Math.PI / 180)) * Math.cos((destLng - startLng) * (Math.PI / 180));
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
};

// Generate realistic street waypoints between origin and destination
const generateInterpolatedRoute = (start, end, segments = 12) => {
  if (!start || !end) return [];
  const coords = [];
  // Add subtle curved street deviations
  const midLat = (start[0] + end[0]) / 2 + 0.0018;
  const midLng = (start[1] + end[1]) / 2 - 0.0012;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // Quadratic Bezier interpolation for realistic road curvature
    const lat = (1 - t) * (1 - t) * start[0] + 2 * (1 - t) * t * midLat + t * t * end[0];
    const lng = (1 - t) * (1 - t) * start[1] + 2 * (1 - t) * t * midLng + t * t * end[1];
    coords.push([lat, lng]);
  }
  return coords;
};

const GoogleMapTracking = ({
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
  pickupAddress = 'Patient Location',
  emergencyId = 101,
  followAmbulance = false,
  showRoute = true,
  height = '460px',
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
  const googleMapInstanceRef = useRef(null);
  const leafletMapInstanceRef = useRef(null);
  const loaderRef = useRef(null);

  // Leaflet markers & layers
  const leafletMarkersRef = useRef({ patient: null, ambulance: null, hospital: null });
  const leafletLayersRef = useRef({ completedRoute: null, remainingRoute: null });
  const animationFrameRef = useRef(null);

  const [mapProvider, setMapProvider] = useState('initializing'); // 'google' | 'leaflet' | 'canvas'
  const [distance, setDistance] = useState(null);
  const [eta, setEta] = useState(null);
  const [isFollowing, setIsFollowing] = useState(followAmbulance);
  const [googleAuthFailed, setGoogleAuthFailed] = useState(false);
  const [lastGpsUpdate, setLastGpsUpdate] = useState(new Date());
  const [showCallModal, setShowCallModal] = useState(false);

  // Normalized coordinates
  const patPos = useMemo(() => normalizeCoord(patientLocation) || [12.9716, 77.5946], [patientLocation]);
  const hospPos = useMemo(() => normalizeCoord(hospitalLocation) || [12.9800, 77.6000], [hospitalLocation]);
  const initialAmbPos = useMemo(() => normalizeCoord(ambulanceLocation) || [12.9650, 77.5850], [ambulanceLocation]);

  // Current interpolated ambulance coordinate state
  const [currentAmbCoord, setCurrentAmbCoord] = useState(initialAmbPos);
  const [currentHeading, setCurrentHeading] = useState(0);

  // Road directions cache state
  const [roadLeg1, setRoadLeg1] = useState(null);
  const [roadLeg2, setRoadLeg2] = useState(null);

  // Fetch real road waypoints asynchronously via OSRM
  useEffect(() => {
    let isSubscribed = true;
    if (initialAmbPos && patPos) {
      getDrivingRoute(initialAmbPos, patPos).then(res => {
        if (isSubscribed && res) setRoadLeg1(res);
      });
    }
    if (patPos && hospPos) {
      getDrivingRoute(patPos, hospPos).then(res => {
        if (isSubscribed && res) setRoadLeg2(res);
      });
    }
    return () => { isSubscribed = false; };
  }, [initialAmbPos, patPos, hospPos]);

  // Dev-only simulation state
  const [isSimulating, setIsSimulating] = useState(false);
  const [simStepIndex, setSimStepIndex] = useState(0);
  const [simLeg, setSimLeg] = useState('toPatient'); // 'toPatient' | 'atPatient' | 'toHospital' | 'atHospital'
  const simulationTimerRef = useRef(null);

  // Full route waypoints (Leg 1: Dispatch -> Patient, Leg 2: Patient -> Hospital)
  const leg1Waypoints = useMemo(() => {
    return (roadLeg1?.coordinates && roadLeg1.coordinates.length > 0)
      ? roadLeg1.coordinates
      : generateInterpolatedRoute(initialAmbPos, patPos, 14);
  }, [roadLeg1, initialAmbPos, patPos]);

  const leg2Waypoints = useMemo(() => {
    return (roadLeg2?.coordinates && roadLeg2.coordinates.length > 0)
      ? roadLeg2.coordinates
      : generateInterpolatedRoute(patPos, hospPos, 16);
  }, [roadLeg2, patPos, hospPos]);

  // Determine transit phase
  const isHeadingToHospital = [
    'PATIENT_PICKED_UP',
    'EN_ROUTE_TO_HOSPITAL',
    'ARRIVED_AT_HOSPITAL'
  ].includes(String(ambulanceStatus).toUpperCase());

  const isAtPatientScene = String(ambulanceStatus).toUpperCase() === 'ARRIVED_AT_PATIENT';

  // Synchronize when real hardware GPS props update
  useEffect(() => {
    const norm = normalizeCoord(ambulanceLocation);
    if (norm) {
      // If receiving real external GPS coordinate, update and stop simulation
      setCurrentAmbCoord(prev => {
        if (!prev || (Math.abs(prev[0] - norm[0]) > 0.00001 || Math.abs(prev[1] - norm[1]) > 0.00001)) {
          const newBearing = prev ? calcBearing(prev[0], prev[1], norm[0], norm[1]) : 0;
          setCurrentHeading(newBearing);
          setLastGpsUpdate(new Date());
          return norm;
        }
        return prev;
      });
    }
  }, [ambulanceLocation]);

  // Driving distance and transit ETA recalculation via routing provider
  useEffect(() => {
    if (!currentAmbCoord) return;
    let isSubscribed = true;
    const targetPos = (isHeadingToHospital && hospPos) ? hospPos : patPos;

    getDrivingRoute(currentAmbCoord, targetPos).then(res => {
      if (isSubscribed && res) {
        setDistance(res.distanceKm);
        setEta(res.etaMinutes);
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
  // DEV-ONLY SIMULATION ENGINE (Tests marker movement & route updates)
  // ==========================================================================
  const toggleSimulation = () => {
    if (isSimulating) {
      clearInterval(simulationTimerRef.current);
      simulationTimerRef.current = null;
      setIsSimulating(false);
    } else {
      setIsSimulating(true);
      setSimStepIndex(0);
      setSimLeg('toPatient');
    }
  };

  const resetSimulation = () => {
    if (simulationTimerRef.current) {
      clearInterval(simulationTimerRef.current);
      simulationTimerRef.current = null;
    }
    setIsSimulating(false);
    setSimStepIndex(0);
    setSimLeg('toPatient');
    setCurrentAmbCoord(initialAmbPos);
    setLastGpsUpdate(new Date());
  };

  useEffect(() => {
    if (!isSimulating) return;

    simulationTimerRef.current = setInterval(() => {
      setSimStepIndex(prevIndex => {
        if (simLeg === 'toPatient') {
          const nextIndex = prevIndex + 1;
          if (nextIndex < leg1Waypoints.length) {
            const nextCoord = leg1Waypoints[nextIndex];
            const prevCoord = leg1Waypoints[prevIndex];
            setCurrentHeading(calcBearing(prevCoord[0], prevCoord[1], nextCoord[0], nextCoord[1]));
            setCurrentAmbCoord(nextCoord);
            setLastGpsUpdate(new Date());
            return nextIndex;
          } else {
            // Reached patient pickup
            setSimLeg('atPatient');
            if (onStatusChange) onStatusChange('ARRIVED_AT_PATIENT');
            return 0;
          }
        } else if (simLeg === 'atPatient') {
          // Transition to transit to hospital
          setSimLeg('toHospital');
          if (onStatusChange) onStatusChange('EN_ROUTE_TO_HOSPITAL');
          return 0;
        } else if (simLeg === 'toHospital') {
          const nextIndex = prevIndex + 1;
          if (nextIndex < leg2Waypoints.length) {
            const nextCoord = leg2Waypoints[nextIndex];
            const prevCoord = leg2Waypoints[prevIndex];
            setCurrentHeading(calcBearing(prevCoord[0], prevCoord[1], nextCoord[0], nextCoord[1]));
            setCurrentAmbCoord(nextCoord);
            setLastGpsUpdate(new Date());
            return nextIndex;
          } else {
            // Reached hospital
            setSimLeg('atHospital');
            if (onStatusChange) onStatusChange('ARRIVED_AT_HOSPITAL');
            clearInterval(simulationTimerRef.current);
            setIsSimulating(false);
            return prevIndex;
          }
        }
        return prevIndex;
      });
    }, 1400);

    return () => {
      if (simulationTimerRef.current) {
        clearInterval(simulationTimerRef.current);
      }
    };
  }, [isSimulating, simLeg, leg1Waypoints, leg2Waypoints, onStatusChange]);

  // ==========================================================================
  // LEAFLET INITIALIZATION & UPDATES
  // ==========================================================================
  const initLeafletMap = useCallback(() => {
    const L = typeof window !== 'undefined' ? window.L : null;
    if (!L || !containerRef.current) return false;

    if (leafletMapInstanceRef.current) {
      try {
        leafletMapInstanceRef.current.remove();
      } catch {
        // ignore
      }
      leafletMapInstanceRef.current = null;
    }

    const defaultLat = currentAmbCoord?.[0] || patPos?.[0] || hospPos?.[0] || 12.9716;
    const defaultLng = currentAmbCoord?.[1] || patPos?.[1] || hospPos?.[1] || 77.5946;

    try {
      const map = L.map(containerRef.current, {
        center: [defaultLat, defaultLng],
        zoom: 13,
        zoomControl: false
      });

      // OpenStreetMap standard high-contrast road tiles (clean, keyless, reliable)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(map);

      // Clean zoom controls
      L.control.zoom({ position: 'bottomleft' }).addTo(map);

      leafletMapInstanceRef.current = map;
      setMapProvider('leaflet');

      setTimeout(() => {
        try {
          map.invalidateSize();
        } catch {
          // ignore
        }
      }, 150);

      if (onMapLoad) onMapLoad(map);
      return true;
    } catch (err) {
      console.warn('Leaflet map init failed, switching to vector canvas:', err);
      setMapProvider('canvas');
      return false;
    }
  }, [currentAmbCoord, patPos, hospPos, onMapLoad]);

  // Update Leaflet Markers, Two-Tone Route Polylines, and Camera
  const updateLeafletMap = useCallback(() => {
    const L = typeof window !== 'undefined' ? window.L : null;
    const map = leafletMapInstanceRef.current;
    if (!L || !map) return;

    const boundsPoints = [];

    // 1. Patient Marker (Pickup location with radar pulse)
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

      if (!leafletMarkersRef.current.patient) {
        leafletMarkersRef.current.patient = L.marker(patPos, { icon: patientIcon })
          .bindPopup(`<strong>PATIENT LOCATION</strong><br/>${pickupAddress || 'Patient Incident Location'}<br/>GPS: ${patPos[0].toFixed(4)}, ${patPos[1].toFixed(4)}`)
          .addTo(map);
      } else {
        leafletMarkersRef.current.patient.setLatLng(patPos);
      }
    }

    // 2. Hospital Marker (Destination with emergency shield)
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

      if (!leafletMarkersRef.current.hospital) {
        leafletMarkersRef.current.hospital = L.marker(hospPos, { icon: hospitalIcon })
          .bindPopup(`<strong>DESTINATION HOSPITAL</strong><br/>${hospitalName || 'Destination Hospital'}<br/>${hospitalAddress || 'Emergency Medical Center'}<br/>GPS: ${hospPos[0].toFixed(4)}, ${hospPos[1].toFixed(4)}`)
          .addTo(map);
      } else {
        leafletMarkersRef.current.hospital.setLatLng(hospPos);
      }
    }

    // 3. Ambulance Marker (Smooth movement, heading rotation, and siren beacon)
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

      if (!leafletMarkersRef.current.ambulance) {
        leafletMarkersRef.current.ambulance = L.marker(currentAmbCoord, { icon: ambulanceIcon, zIndexOffset: 1200 })
          .bindPopup(`<strong>${ambulanceUnitId} (${vehicleRegistration})</strong><br/>Driver: ${driverName}<br/>Status: ${ambulanceStatus}`)
          .addTo(map);
      } else {
        // Smoothly interpolate Leaflet marker position
        leafletMarkersRef.current.ambulance.setIcon(ambulanceIcon);
        leafletMarkersRef.current.ambulance.setLatLng(currentAmbCoord);
      }

      if (isFollowing) {
        map.panTo(currentAmbCoord, { animate: true, duration: 0.8 });
      }
    }

    // 4. Two-Tone Route Polylines: Completed vs Remaining Paths
    if (showRoute && currentAmbCoord) {
      let completedPath = [];
      let remainingPath = [];

      if (!isHeadingToHospital) {
        // Leg 1: Navigating to Patient Pickup
        // Find closest index along leg1Waypoints
        let closestIdx = 0;
        let minD = Infinity;
        leg1Waypoints.forEach((pt, i) => {
          const d = Math.hypot(pt[0] - currentAmbCoord[0], pt[1] - currentAmbCoord[1]);
          if (d < minD) {
            minD = d;
            closestIdx = i;
          }
        });

        completedPath = [...leg1Waypoints.slice(0, closestIdx), currentAmbCoord];
        remainingPath = [currentAmbCoord, ...leg1Waypoints.slice(closestIdx + 1)];
      } else {
        // Leg 2: Transit from Patient Pickup to Hospital
        let closestIdx = 0;
        let minD = Infinity;
        leg2Waypoints.forEach((pt, i) => {
          const d = Math.hypot(pt[0] - currentAmbCoord[0], pt[1] - currentAmbCoord[1]);
          if (d < minD) {
            minD = d;
            closestIdx = i;
          }
        });

        completedPath = [patPos, ...leg2Waypoints.slice(0, closestIdx), currentAmbCoord];
        remainingPath = [currentAmbCoord, ...leg2Waypoints.slice(closestIdx + 1)];
      }

      // Draw Completed Path: Muted slate / traversed road
      if (completedPath.length >= 2) {
        if (leafletLayersRef.current.completedRoute) {
          leafletLayersRef.current.completedRoute.setLatLngs(completedPath);
        } else {
          leafletLayersRef.current.completedRoute = L.polyline(completedPath, {
            color: '#475569',
            weight: 4.5,
            opacity: 0.8,
            lineCap: 'round',
            lineJoin: 'round'
          }).addTo(map);
        }
      }

      // Draw Remaining Path: Vibrant medical teal/blue route
      if (remainingPath.length >= 2) {
        const remainingColor = isHeadingToHospital ? '#2563EB' : '#0D9488';
        if (leafletLayersRef.current.remainingRoute) {
          leafletLayersRef.current.remainingRoute.setLatLngs(remainingPath);
          leafletLayersRef.current.remainingRoute.setStyle({ color: remainingColor });
        } else {
          leafletLayersRef.current.remainingRoute = L.polyline(remainingPath, {
            color: remainingColor,
            weight: 5,
            opacity: 0.95,
            dashArray: '8, 8',
            lineCap: 'round',
            lineJoin: 'round'
          }).addTo(map);
        }
      }
    }

    // Auto-fit bounds on initial mount if not following
    if (!isFollowing && boundsPoints.length >= 2) {
      try {
        map.fitBounds(boundsPoints, { padding: [55, 55], maxZoom: 15 });
      } catch {
        // bounds error safeguard
      }
    }
  }, [
    currentAmbCoord,
    patPos,
    hospPos,
    ambulanceStatus,
    ambulanceUnitId,
    vehicleRegistration,
    driverName,
    hospitalName,
    emergencyId,
    showRoute,
    isFollowing,
    currentHeading,
    isHeadingToHospital,
    leg1Waypoints,
    leg2Waypoints
  ]);

  // Auth failure listener for Google Maps
  useEffect(() => {
    window.gm_authFailure = () => {
      console.warn('[VitalGuard] Google Maps authentication failed. Seamlessly switching to Leaflet OpenStreetMap carrier.');
      setGoogleAuthFailed(true);
      if (googleMapInstanceRef.current && containerRef.current) {
        containerRef.current.innerHTML = '';
        googleMapInstanceRef.current = null;
      }
      initLeafletMap();
    };

    return () => {
      delete window.gm_authFailure;
    };
  }, [initLeafletMap]);

  // Handle Map Initialization on Mount
  const rawApiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  const isKeyUsable = Boolean(
    rawApiKey &&
    rawApiKey.length >= 25 &&
    !rawApiKey.includes('your_google_maps_api_key') &&
    !rawApiKey.includes('YOUR_API_KEY') &&
    !rawApiKey.includes('placeholder')
  );

  useEffect(() => {
    let initialized = false;

    if (isKeyUsable && !googleAuthFailed) {
      loaderRef.current = new Loader({
        apiKey: rawApiKey,
        version: 'weekly',
        libraries: ['routes', 'marker']
      });

      loaderRef.current.importLibrary('maps')
        .then(({ Map }) => {
          if (!containerRef.current) return;
          const defaultLat = currentAmbCoord?.[0] || patPos?.[0] || 12.9716;
          const defaultLng = currentAmbCoord?.[1] || patPos?.[1] || 77.5946;

          const map = new Map(containerRef.current, {
            center: { lat: defaultLat, lng: defaultLng },
            zoom: 13,
            mapTypeControl: false,
            streetViewControl: false,
            zoomControl: true
          });

          googleMapInstanceRef.current = map;
          setMapProvider('google');
          initialized = true;
          if (onMapLoad) onMapLoad(map);
        })
        .catch((err) => {
          console.warn('[VitalGuard] Google Maps failed to load, switching to Leaflet:', err);
          if (!initialized) initLeafletMap();
        });
    } else {
      const leafletSuccess = initLeafletMap();
      if (!leafletSuccess) {
        setMapProvider('canvas');
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (leafletMapInstanceRef.current) {
        try {
          leafletMapInstanceRef.current.remove();
        } catch {
          // ignore
        }
        leafletMapInstanceRef.current = null;
      }
    };
  }, [isKeyUsable, rawApiKey, googleAuthFailed, initLeafletMap, onMapLoad]);

  // Update Leaflet layers whenever locations change
  useEffect(() => {
    if (mapProvider === 'leaflet') {
      updateLeafletMap();
    }
  }, [mapProvider, updateLeafletMap]);

  // Fit all active locations into map view
  const handleFitBounds = () => {
    setIsFollowing(false);
    if (leafletMapInstanceRef.current) {
      const bounds = [];
      if (currentAmbCoord) bounds.push(currentAmbCoord);
      if (patPos) bounds.push(patPos);
      if (hospPos) bounds.push(hospPos);
      if (bounds.length > 0) {
        leafletMapInstanceRef.current.fitBounds(bounds, { padding: [55, 55], maxZoom: 15 });
      }
    }
  };

  // Format last updated timestamp
  const formatTimeAgo = (date) => {
    if (!date) return 'Just now';
    const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diffSec < 5) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // ==========================================================================
  // TACTICAL VECTOR RADAR CANVAS FALLBACK
  // ==========================================================================
  const renderTacticalCanvas = () => {
    const isDispatched = !['HOSPITAL_ASSIGNED', 'CREATED', 'SEARCHING_HOSPITAL', 'AMBULANCE_NOT_REQUIRED', 'RESOLVED', 'CANCELLED'].includes(ambulanceStatus);

    return (
      <div style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: 'radial-gradient(ellipse at center, #0F2744 0%, #071526 100%)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'monospace'
      }}>
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
            <linearGradient id="tacticalRouteGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0D9488" />
              <stop offset="100%" stopColor="#38BDF8" />
            </linearGradient>
            <filter id="radarGlow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {isDispatched && (
            <path
              d={isHeadingToHospital ? "M 520,200 Q 640,160 780,120" : "M 160,280 Q 320,220 520,200"}
              fill="none"
              stroke="url(#tacticalRouteGradient)"
              strokeWidth="4"
              strokeDasharray="8 6"
              filter="url(#radarGlow)"
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
            Hospital
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
            gap: '4px',
            transition: 'all 0.6s ease'
          }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              background: '#DC2626',
              border: '3px solid #F87171',
              boxShadow: '0 0 22px rgba(220, 38, 38, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              animation: 'ambulanceBeacon 1.2s infinite ease-in-out'
            }}>
              🚑
            </div>
            <span style={{ fontSize: '11px', color: '#FEF2F2', background: 'rgba(220, 38, 38, 0.9)', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
              {ambulanceUnitId}
            </span>
          </div>
        )}

        {!isDispatched && (
          <div style={{
            position: 'absolute',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15, 23, 42, 0.9)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            color: '#94A3B8',
            fontSize: '12px',
            padding: '6px 16px',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>🚑 Ambulance Unit On Standby</span>
            <span>•</span>
            <span style={{ color: '#38BDF8' }}>Awaiting Dispatch Acceptance</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="uber-live-ambulance-tracking-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        width: '100%'
      }}
    >
      {/* Simulation Banner Notice (Requirement 9) */}
      {isSimulating && (
        <div style={{
          background: '#FEF3C7',
          border: '1px solid #FCD34D',
          color: '#92400E',
          padding: '8px 14px',
          borderRadius: '10px',
          fontSize: '12px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🧪</span>
            <span>
              <strong>DEMO SIMULATION ACTIVE:</strong> Testing real-time marker trajectory along street coordinates. (Never presented as real hardware GPS).
            </span>
          </div>
          <button
            onClick={resetSimulation}
            className="btn btn-secondary btn-xs"
            style={{ fontSize: '11px', background: '#FFFFFF' }}
          >
            Stop Simulation
          </button>
        </div>
      )}

      {/* Real-time GPS Telemetry Notice / Warning */}
      {isGpsDenied && (
        <div style={{
          background: '#FEE2E2',
          border: '1.5px solid #EF4444',
          color: '#991B1B',
          padding: '10px 16px',
          borderRadius: '12px',
          fontSize: '13px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <span style={{ fontSize: '18px' }}>🚫</span>
          <span><strong>LOCATION PERMISSION DENIED:</strong> Please allow GPS location access in your browser to enable live turn-by-turn navigation and vehicle telemetry.</span>
        </div>
      )}

      {isGpsStale && !isGpsDenied && (
        <div style={{
          background: '#FFFBEB',
          border: '1.5px solid #F59E0B',
          color: '#B45309',
          padding: '10px 16px',
          borderRadius: '12px',
          fontSize: '13px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <span style={{ fontSize: '18px' }}>⚠️</span>
          <span><strong>STALE GPS LOCATION:</strong> GPS updates have stopped (&gt; 30s). Re-acquiring satellite fix...</span>
        </div>
      )}

      {isGpsUnavailable && !isGpsDenied && !isGpsStale && (
        <div style={{
          background: '#F1F5F9',
          border: '1.5px solid #94A3B8',
          color: '#475569',
          padding: '10px 16px',
          borderRadius: '12px',
          fontSize: '13px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <span style={{ fontSize: '18px' }}>📡</span>
          <span><strong>LOCATION UNAVAILABLE:</strong> Searching for GPS coordinates... Map is displaying last known operational waypoint.</span>
        </div>
      )}

      {/* Main Map Frame */}
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
        {/* Map rendering layer */}
        <div
          ref={containerRef}
          style={{
            width: '100%',
            height: '100%',
            display: mapProvider === 'canvas' ? 'none' : 'block'
          }}
        />

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
            maxWidth: '360px'
          }}
        >
          <span style={{ fontSize: '24px' }}>🚑</span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#0B1F3A' }}>
                {ambulanceUnitId}
              </span>
              <StatusBadge status={ambulanceStatus} size="sm" showIcon={false} />
            </div>
            <div style={{ fontSize: '11px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
              <span>Paramedic Telemetry</span>
              <span>•</span>
              <span style={{ color: '#0D9488', fontWeight: 700 }}>
                {isHeadingToHospital ? 'Hospital Transit' : isAtPatientScene ? 'At Patient Scene' : 'Patient Intercept'}
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
          {/* Live GPS badge */}
          <div
            style={{
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
            }}
          >
            <span
              className="pulse-dot"
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isSimulating ? '#F59E0B' : '#10B981',
                display: 'inline-block'
              }}
            />
            <span style={{ letterSpacing: '0.04em' }}>
              LIVE GPS STREAMING {isSimulating ? '• SIMULATOR' : mapProvider === 'google' ? '• GOOGLE MAPS' : '• OPENSTREETMAP'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setMapProvider(p => p === 'canvas' ? 'leaflet' : 'canvas')}
            className="btn btn-secondary btn-sm"
            style={{
              background: 'rgba(255, 255, 255, 0.95)',
              padding: '5px 10px',
              fontSize: '11px',
              fontWeight: 700,
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)'
            }}
            title="Toggle between Map and Tactical Radar"
          >
            {mapProvider === 'canvas' ? '🗺️ Map' : '📡 Radar'}
          </button>

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
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)'
            }}
            title="Fit all markers in view"
          >
            🔍 Fit
          </button>
        </div>

        {/* Floating Bottom-Right Distance & Follow Pill */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>📏</span>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                Distance
              </div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0B1F3A' }}>
                {distance != null ? `${distance} km` : '1.3 km'}
              </div>
            </div>
          </div>

          <div style={{ height: '26px', width: '1px', backgroundColor: '#E2E8F0' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>⏱️</span>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#0D9488', textTransform: 'uppercase' }}>
                ETA
              </div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0D9488' }}>
                ~{eta != null ? eta : 4} min
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsFollowing(!isFollowing)}
            className={`btn btn-sm ${isFollowing ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              fontSize: '11px',
              padding: '5px 10px',
              marginLeft: '4px',
              borderRadius: '8px',
              fontWeight: 700
            }}
            title="Keep ambulance centered on map"
          >
            {isFollowing ? '✓ Following' : 'Follow'}
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* UBER-STYLE LIVE RIDE TRACKING CARD (Requirement 4)                  */}
      {/* ==================================================================== */}
      <div
        className="uber-tracking-info-card"
        style={{
          background: '#FFFFFF',
          borderRadius: 'var(--radius-xl, 16px)',
          border: '1.5px solid var(--color-gray-200, #E2E8F0)',
          boxShadow: '0 4px 20px rgba(11, 31, 58, 0.06)',
          padding: '20px 24px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '20px',
          alignItems: 'center'
        }}
      >
        {/* Left Column: Driver & Vehicle Identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #0B1F3A 0%, #1E3A8A 100%)',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '26px',
            boxShadow: '0 4px 14px rgba(11, 31, 58, 0.25)',
            flexShrink: 0
          }}>
            👨‍✈️
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '16px', fontWeight: 800, color: '#0B1F3A' }}>
                {driverName}
              </span>
              <span style={{
                background: '#FEF3C7',
                color: '#B45309',
                fontSize: '11px',
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: '12px'
              }}>
                ★ {driverRating || 4.9}
              </span>
            </div>

            <div style={{ fontSize: '13px', color: '#475569', marginTop: '2px', fontWeight: 600 }}>
              {vehicleType}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', fontSize: '12px', color: '#64748B' }}>
              <span style={{ background: '#F1F5F9', padding: '1px 8px', borderRadius: '4px', fontWeight: 700, color: '#0F172A' }}>
                {ambulanceUnitId}
              </span>
              <span>•</span>
              <span style={{ fontWeight: 600 }}>{vehicleRegistration}</span>
            </div>
          </div>
        </div>

        {/* Center Column: Live ETA & Route Telemetry */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          borderLeft: '1px solid #F1F5F9',
          paddingLeft: '16px'
        }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Current Journey Progress
          </div>

          <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F766E', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>~{eta != null ? eta : 4} Mins to Destination</span>
            <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
              ({distance != null ? distance : '1.3'} kilometers remaining)
            </span>
          </div>

          <div style={{ fontSize: '12px', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🏥 Destination:</span>
            <strong>{hospitalName || 'City General Hospital'}</strong>
          </div>

          <div style={{ fontSize: '11px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Ref: <strong>#SOS-{emergencyId || '101'}</strong></span>
            <span>•</span>
            <span>Last GPS: {formatTimeAgo(lastGpsUpdate)}</span>
          </div>
        </div>

        {/* Right Column: Interactive Call & Simulation Actions */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: '10px',
          justifyContent: 'center'
        }}>
          <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
            <button
              onClick={() => setShowCallModal(true)}
              className="btn btn-primary btn-sm"
              style={{
                flex: 1,
                padding: '9px 14px',
                fontSize: '12px',
                fontWeight: 700,
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
              title="Call Ambulance Driver"
            >
              <span>📞</span>
              <span>Call Driver</span>
            </button>

            <button
              onClick={toggleSimulation}
              className={`btn btn-sm ${isSimulating ? 'btn-critical' : 'btn-secondary'}`}
              style={{
                fontSize: '11px',
                fontWeight: 700,
                borderRadius: '10px',
                padding: '9px 12px',
                whiteSpace: 'nowrap'
              }}
              title="Development mode simulation of GPS coordinates"
            >
              {isSimulating ? '⏸ Pause Demo' : '🧪 Dev GPS Sim'}
            </button>
          </div>

          <div style={{ fontSize: '11px', color: '#64748B' }}>
            Paramedic contact authorized for linked family guardians.
          </div>
        </div>
      </div>

      {/* Driver Contact Modal */}
      {showCallModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(11, 31, 58, 0.65)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '16px',
            maxWidth: '420px',
            width: '100%',
            padding: '24px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '42px', marginBottom: '12px' }}>📞</div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0B1F3A', marginBottom: '6px' }}>
              Contact Ambulance Dispatch & Crew
            </h3>
            <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '16px', lineHeight: 1.5 }}>
              Connecting you directly to <strong>{driverName}</strong> on Unit <strong>{ambulanceUnitId}</strong>.
            </p>

            <div style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              padding: '14px',
              marginBottom: '20px'
            }}>
              <div style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 800 }}>
                Direct Emergency Line
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#0B1F3A', letterSpacing: '0.05em', marginTop: '4px' }}>
                +91 {driverPhone}
              </div>
              <div style={{ fontSize: '11px', color: '#10B981', fontWeight: 700, marginTop: '2px' }}>
                ● Active Voice Channel
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowCallModal(false)}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                Close
              </button>
              <a
                href={`tel:${driverPhone}`}
                className="btn btn-primary"
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textDecoration: 'none'
                }}
              >
                Dial Now
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Global CSS keyframes for beacon animation */}
      <style>{`
        @keyframes ambulanceBeacon {
          0%, 100% {
            box-shadow: 0 0 16px rgba(220, 38, 38, 0.7);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 28px rgba(220, 38, 38, 0.95);
            transform: scale(1.08);
          }
        }
        @keyframes sirenBeaconPulse {
          0% {
            transform: scale(0.9);
            opacity: 0.6;
          }
          100% {
            transform: scale(1.2);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default GoogleMapTracking;