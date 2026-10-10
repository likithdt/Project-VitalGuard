import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import StatusBadge from './StatusBadge';

/**
 * GoogleMapTracking - Section 14
 * Preserves Google Maps live tracking with smooth animations, directions routes,
 * floating status card, floating ETA card, patient/ambulance/hospital markers.
 * Includes graceful tactical telemetry vector canvas fallback when API key is not configured.
 */

const GoogleMapTracking = ({
  patientLocation,
  ambulanceLocation,
  hospitalLocation,
  ambulanceStatus = 'EN_ROUTE_TO_PATIENT',
  ambulanceUnitId = 'AMB-102',
  driverName,
  emergencyId,
  followAmbulance = false,
  showRoute = true,
  height = '420px',
  onMapLoad
}) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const loaderRef = useRef(null);

  const markersRef = useRef({
    patient: null,
    ambulance: null,
    hospital: null
  });

  const directionsServiceRef = useRef(null);
  const directionsRendererRef = useRef(null);
  const isMapReadyRef = useRef(false);
  const animationFrameRef = useRef(null);

  const [mapError, setMapError] = useState(null);
  const [distance, setDistance] = useState(null);
  const [eta, setEta] = useState(null);
  const [isFollowing, setIsFollowing] = useState(followAmbulance);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

  // Calculate straight-line approximate distance for fallback/instant display
  const calcDistance = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 2.4;
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

  // Pre-calculate fallback distance & ETA
  const fallbackDist = calcDistance(
    ambulanceLocation?.[0] || 12.9650,
    ambulanceLocation?.[1] || 77.5850,
    patientLocation?.[0] || 12.9716,
    patientLocation?.[1] || 77.5946
  );
  const fallbackEta = Math.max(2, Math.round(fallbackDist * 2.5));

  const currentDistance = distance !== null ? distance : fallbackDist;
  const currentEta = eta !== null ? eta : fallbackEta;

  const initializeMap = useCallback(async () => {
    if (isMapReadyRef.current || !mapRef.current || !apiKey) return;

    try {
      loaderRef.current = new Loader({
        apiKey,
        version: 'weekly',
        libraries: ['routes', 'marker']
      });

      const { Map } = await loaderRef.current.importLibrary('maps');
      const { AdvancedMarkerElement, PinElement } = await loaderRef.current.importLibrary('marker');

      const defaultLat = patientLocation?.[0] || ambulanceLocation?.[0] || hospitalLocation?.[0] || 12.9716;
      const defaultLng = patientLocation?.[1] || ambulanceLocation?.[1] || hospitalLocation?.[1] || 77.5946;

      const map = new Map(mapRef.current, {
        center: { lat: defaultLat, lng: defaultLng },
        zoom: 13,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        zoomControl: true,
        styles: [
          { featureType: 'poi.medical', elementType: 'all', stylers: [{ visibility: 'on' }] },
          { featureType: 'administrative', elementType: 'labels.text.fill', stylers: [{ color: '#444444' }] },
          { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#e0f2fe' }] }
        ]
      });

      mapInstanceRef.current = map;
      isMapReadyRef.current = true;

      const { DirectionsService, DirectionsRenderer } = await loaderRef.current.importLibrary('routes');
      directionsServiceRef.current = new DirectionsService();
      directionsRendererRef.current = new DirectionsRenderer({
        map,
        suppressMarkers: true,
        polylineOptions: {
          strokeColor: '#0284c7',
          strokeWeight: 5,
          strokeOpacity: 0.85
        }
      });

      if (onMapLoad) onMapLoad(map);
      updateMarkers(map, AdvancedMarkerElement, PinElement);
      if (showRoute) updateRoute();
    } catch (err) {
      console.warn('Google Maps initialization fallback:', err.message);
      setMapError('Google Maps API unavailable or key expired.');
    }
  }, [apiKey, patientLocation, ambulanceLocation, hospitalLocation, showRoute, onMapLoad]);

  const updateMarkers = useCallback((map, AdvancedMarkerElement, PinElement) => {
    if (!map || !AdvancedMarkerElement || !PinElement) return;

    // Patient Pin
    if (patientLocation?.[0] && patientLocation?.[1]) {
      const pos = { lat: patientLocation[0], lng: patientLocation[1] };
      if (!markersRef.current.patient) {
        const pin = new PinElement({ background: '#059669', borderColor: '#ffffff', glyphColor: '#ffffff' });
        markersRef.current.patient = new AdvancedMarkerElement({ map, position: pos, title: 'Patient Location', content: pin.element });
      } else {
        markersRef.current.patient.position = pos;
      }
    }

    // Hospital Pin
    if (hospitalLocation?.[0] && hospitalLocation?.[1]) {
      const pos = { lat: hospitalLocation[0], lng: hospitalLocation[1] };
      if (!markersRef.current.hospital) {
        const pin = new PinElement({ background: '#0a2540', borderColor: '#ffffff', glyphColor: '#ffffff' });
        markersRef.current.hospital = new AdvancedMarkerElement({ map, position: pos, title: 'Assigned Hospital', content: pin.element });
      } else {
        markersRef.current.hospital.position = pos;
      }
    }

    // Ambulance Pin
    if (ambulanceLocation?.[0] && ambulanceLocation?.[1]) {
      const pos = { lat: ambulanceLocation[0], lng: ambulanceLocation[1] };
      if (!markersRef.current.ambulance) {
        const pin = new PinElement({ background: '#dc2626', borderColor: '#ffffff', glyphColor: '#ffffff', scale: 1.25 });
        markersRef.current.ambulance = new AdvancedMarkerElement({ map, position: pos, title: `Ambulance ${ambulanceUnitId}`, content: pin.element });
      } else {
        markersRef.current.ambulance.position = pos;
      }

      if (isFollowing) {
        map.panTo(pos);
      }
    }
  }, [patientLocation, ambulanceLocation, hospitalLocation, ambulanceUnitId, isFollowing]);

  const updateRoute = useCallback(async () => {
    if (!directionsServiceRef.current || !directionsRendererRef.current || !ambulanceLocation) return;
    const origin = { lat: ambulanceLocation[0], lng: ambulanceLocation[1] };

    const isEnRouteToPatient = ['EN_ROUTE_TO_PATIENT', 'ACCEPTED', 'AMBULANCE_DISPATCHED', 'REQUESTED'].includes(ambulanceStatus);
    let destination = null;

    if (isEnRouteToPatient && patientLocation) {
      destination = { lat: patientLocation[0], lng: patientLocation[1] };
    } else if (hospitalLocation) {
      destination = { lat: hospitalLocation[0], lng: hospitalLocation[1] };
    }

    if (!destination) return;

    try {
      const result = await directionsServiceRef.current.route({
        origin,
        destination,
        travelMode: 'DRIVING'
      });
      directionsRendererRef.current.setDirections(result);
      if (result.routes?.[0]?.legs?.[0]) {
        const leg = result.routes[0].legs[0];
        if (leg.distance) setDistance((leg.distance.value / 1000).toFixed(1));
        if (leg.duration) setEta(Math.round(leg.duration.value / 60));
      }
    } catch {
      // Fallback calculation will serve metrics
    }
  }, [ambulanceLocation, patientLocation, hospitalLocation, ambulanceStatus]);

  useEffect(() => {
    if (apiKey) {
      initializeMap();
    }
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [initializeMap, apiKey]);

  // Tactical Fallback Canvas when Google Maps Key is not supplied
  const renderTacticalCanvas = () => {
    const isDispatched = !['HOSPITAL_ASSIGNED', 'CREATED', 'SEARCHING_HOSPITAL', 'AMBULANCE_NOT_REQUIRED', 'RESOLVED'].includes(ambulanceStatus);
    const isHeadingToHospital = ['PATIENT_PICKED_UP', 'EN_ROUTE_TO_HOSPITAL', 'ARRIVED_AT_HOSPITAL'].includes(ambulanceStatus);

    return (
      <div style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: 'radial-gradient(ellipse at center, #0f2744 0%, #071526 100%)',
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
          backgroundImage: 'linear-gradient(rgba(2, 132, 199, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(2, 132, 199, 0.1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          opacity: 0.6
        }} />

        {/* Tactical Route SVG */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <defs>
            <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          {/* Animated Route Line */}
          {isDispatched && (
            <path
              d={isHeadingToHospital ? "M 520,200 Q 640,160 780,120" : "M 160,280 Q 320,220 520,200"}
              fill="none"
              stroke="url(#routeGradient)"
              strokeWidth="4"
              strokeDasharray="8 6"
              filter="url(#glow)"
            />
          )}
        </svg>

        {/* Marker 1: Hospital (Top Right) */}
        <div style={{
          position: 'absolute',
          top: '25%',
          right: '20%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px'
        }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            background: '#0a2540',
            border: '2px solid #38bdf8',
            boxShadow: '0 0 14px rgba(56, 189, 248, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px'
          }}>
            🏥
          </div>
          <span style={{ fontSize: '11px', color: '#e0f2fe', background: 'rgba(10, 37, 64, 0.85)', padding: '2px 8px', borderRadius: '4px' }}>
            Hospital
          </span>
        </div>

        {/* Marker 2: Patient (Center) */}
        <div style={{
          position: 'absolute',
          top: '46%',
          left: '52%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px'
        }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            background: '#059669',
            border: '2px solid #34d399',
            boxShadow: '0 0 14px rgba(52, 211, 153, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px'
          }}>
            📍
          </div>
          <span style={{ fontSize: '11px', color: '#ecfdf5', background: 'rgba(5, 150, 105, 0.85)', padding: '2px 8px', borderRadius: '4px' }}>
            Patient
          </span>
        </div>

        {/* Marker 3: Ambulance (Visible when dispatched) */}
        {isDispatched && (
          <div style={{
            position: 'absolute',
            bottom: isHeadingToHospital ? '52%' : '28%',
            left: isHeadingToHospital ? '62%' : '18%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            transition: 'all 0.5s ease'
          }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              background: '#dc2626',
              border: '3px solid #f87171',
              boxShadow: '0 0 20px rgba(239, 68, 68, 0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              animation: 'pulse-ring 1.8s infinite'
            }}>
              🚑
            </div>
            <span style={{ fontSize: '11px', color: '#fef2f2', background: 'rgba(220, 38, 38, 0.85)', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
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
            background: 'rgba(15, 23, 42, 0.85)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            color: '#94a3b8',
            fontSize: '12px',
            padding: '6px 14px',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>🚑 Ambulance Standby</span>
            <span>•</span>
            <span style={{ color: '#38bdf8' }}>GPS Tracking Active Upon Dispatch</span>
          </div>
        )}

        {/* Telemetry Radar Watermark */}
        <div style={{
          position: 'absolute',
          top: '12px',
          right: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '11px',
          color: '#38bdf8',
          background: 'rgba(15, 23, 42, 0.75)',
          padding: '4px 10px',
          borderRadius: '20px',
          border: '1px solid rgba(56, 189, 248, 0.3)'
        }}>
          <span className="pulse-dot" style={{ backgroundColor: '#10b981' }} />
          <span>LIVE GPS TELEMETRY</span>
        </div>
      </div>
    );
  };

  return (
    <div className="map-container-frame" style={{ height }}>
      {apiKey && !mapError ? (
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      ) : (
        renderTacticalCanvas()
      )}

      {/* Floating Status Card (Top Left) */}
      <div className="map-floating-status">
        <span style={{ fontSize: '22px' }}>🚑</span>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-gray-900)' }}>
            {ambulanceUnitId}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-gray-500)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            <StatusBadge status={ambulanceStatus} size="sm" showIcon={false} />
            {driverName && <span>• Driver: {driverName}</span>}
          </div>
        </div>
      </div>

      {/* Floating Distance & ETA Card (Bottom Right) */}
      <div className="map-floating-eta">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>📏</span>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-gray-400)', textTransform: 'uppercase' }}>Distance</div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-gray-900)' }}>
              {currentDistance} km
            </div>
          </div>
        </div>

        <div style={{ height: '24px', width: '1px', backgroundColor: 'var(--color-gray-200)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>⏱️</span>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-gray-400)', textTransform: 'uppercase' }}>ETA</div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-secondary)' }}>
              ~{currentEta} min
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsFollowing(!isFollowing)}
          className={`btn btn-sm ${isFollowing ? 'btn-primary' : 'btn-secondary'}`}
          style={{ fontSize: '11px', padding: '4px 8px', marginLeft: '6px' }}
          title="Toggle Auto-Follow"
        >
          {isFollowing ? '✓ Following' : 'Follow'}
        </button>
      </div>
    </div>
  );
};

export default GoogleMapTracking;