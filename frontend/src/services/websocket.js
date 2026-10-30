import { useCallback, useEffect, useRef, useState } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import API from './api';

const getWsUrl = () => {
  if (typeof window !== 'undefined') {
    const envWs = import.meta.env?.VITE_WS_URL;
    if (envWs) return envWs;
    const envApi = import.meta.env?.VITE_API_BASE_URL;
    if (envApi) return envApi.replace(/\/api\/?$/, '') + '/ws';
    const host = window.location.hostname || 'localhost';
    return `http://${host}:8000/ws`;
  }
  return 'http://localhost:8000/ws';
};

export const createStompClient = (onConnect, onError) => {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  const client = new Client({
    webSocketFactory: () => new SockJS(getWsUrl()),
    connectHeaders: token ? { Authorization: `Bearer ${token}` } : {},
    beforeConnect: () => {
      const latestToken = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
      client.connectHeaders = latestToken ? { Authorization: `Bearer ${latestToken}` } : {};
    },
    reconnectDelay: 5000,
    heartbeatIncoming: 4000,
    heartbeatOutgoing: 4000,
    onConnect: (frame) => {
      if (onConnect) onConnect(frame);
    },
    onStompError: (frame) => {
      console.warn('STOMP broker error:', frame?.headers?.message, frame?.body);
      if (onError) onError(frame);
    },
    onWebSocketError: (event) => {
      console.warn('WebSocket connection error:', event);
    },
    onDisconnect: () => {
      if (onError) onError();
    }
  });
  return client;
};

export function useRealtimeRefresh(uid, emergencyId, patientUid = uid, user = null) {
  const [connected, setConnected] = useState(false);
  const [revision, setRevision] = useState(0);
  const [tracking, setTracking] = useState(null);
  const [ambulanceLocation, setAmbulanceLocation] = useState(null);
  const [ambulanceLocationsMap, setAmbulanceLocationsMap] = useState({});
  const [lastEvent, setLastEvent] = useState(null);
  const [client, setClient] = useState(null);
  const timer = useRef(null);
  const refresh = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    if (!uid) return;
    let active = true;
    const connection = createStompClient(() => {
      if (!active) return;
      setConnected(true);
      setClient(connection);
      refresh();
    }, () => {
      if (!active) return;
      setConnected(false);
      setClient(null);
    });
    connection.activate();
    const poll = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      clearInterval(poll);
      clearTimeout(timer.current);
      timer.current = null;
      window.removeEventListener('focus', refresh);
      connection.deactivate();
    };
  }, [uid, refresh]);

  useEffect(() => {
    if (!client || !connected) return;
    const scheduleRefresh = () => {
      if (timer.current) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        refresh();
      }, 350);
    };
    const topics = ['/topic/emergency-updates', '/topic/hospital-queue-refresh'];
    const userRole = user?.role || localStorage.getItem('userRole');

    if (patientUid) {
      topics.push(`/topic/vitals/${patientUid}`, `/topic/ai-risk/${patientUid}`);
      if (userRole === 'FAMILY_MEMBER' || userRole === 'PATIENT') {
        topics.push(`/topic/family-notifications/${patientUid}`);
      }
    }
    if (emergencyId != null) {
      topics.push(`/topic/emergency/${emergencyId}`);
    }

    // Add role-specific topics
    if (userRole === 'HOSPITAL_ADMIN') {
      const hospitalId = user?.hospitalId || localStorage.getItem('hospitalId');
      if (hospitalId) {
        topics.push(`/topic/hospital/${hospitalId}/emergencies`);
        topics.push(`/topic/hospital/assignments`);
      }
    } else if (userRole === 'DOCTOR') {
      const doctorId = user?.doctorId || user?.id || localStorage.getItem('doctorId');
      if (doctorId) {
        topics.push(`/topic/doctor/${doctorId}/emergencies`);
        topics.push(`/topic/doctor/${doctorId}/assessments`);
      }
    } else if (userRole === 'AMBULANCE_DRIVER') {
      const ambulanceId = user?.ambulanceId || localStorage.getItem('ambulanceId');
      const driverId = user?.id || localStorage.getItem('userId');
      if (ambulanceId) topics.push(`/topic/ambulance/${ambulanceId}`);
      if (driverId) topics.push(`/topic/ambulance/request/${driverId}`);
      topics.push('/topic/ambulance/requests');
    }
    const subscriptions = topics.map(topic => {
      try {
        return client.subscribe(topic, message => {
          scheduleRefresh();
          try {
            const data = JSON.parse(message.body);
            if (data && typeof data === 'object') {
          setLastEvent({
            ...data,
            _receivedAt: Date.now(),
            _topic: topic
          });
        }
        
        // Handle ambulance location updates from ambulance or emergency topics
        const hasCoordinates = data.latitude != null && data.longitude != null;
        if (hasCoordinates && (topic.startsWith('/topic/ambulance/') || topic === `/topic/emergency/${emergencyId}` || topic === '/topic/emergency-updates')) {
          const locObj = {
            latitude: Number(data.latitude),
            longitude: Number(data.longitude),
            status: data.status,
            ambulanceId: data.ambulanceId,
            unitId: data.unitId || data.ambulanceUnitId,
            timestamp: data.timestamp,
            emergencyId: data.emergencyId || emergencyId,
            distance: data.distance || data.distanceKm,
            eta: data.eta || data.etaMinutes
          };
          setAmbulanceLocation(locObj);
          const key = data.emergencyId || data.ambulanceId;
          if (key) {
            setAmbulanceLocationsMap(prev => ({
              ...prev,
              [key]: locObj
            }));
          }
        }
        
        // Handle emergency tracking updates - accept updates from all relevant topics
        const isEmergencyUpdate = topic === `/topic/emergency/${emergencyId}` || 
                                  topic === '/topic/emergency-updates' ||
                                  (topic.startsWith('/topic/hospital/') && topic.endsWith('/emergencies')) ||
                                  (topic.startsWith('/topic/doctor/') && topic.endsWith('/emergencies')) ||
                                  topic.startsWith('/topic/ambulance/') ||
                                  topic.startsWith('/topic/family-notifications/');
        
        if (isEmergencyUpdate && data && emergencyId != null && 
            (String(data.emergencyId) === String(emergencyId) || String(data.sosId) === String(emergencyId))) {
          setTracking(prev => ({
            ...(prev || {}),
            ...data,
            emergencyId
          }));
        }
        if (topic.includes('ambulance/request') && data) {
          setTracking(prev => ({
            ...(prev || {}),
            ...data,
            emergencyId: data.emergencyId || emergencyId
          }));
        }
      } catch {
        return;
      }
    });
      } catch (err) {
        console.warn(`Failed to subscribe to ${topic}:`, err);
        return null;
      }
    }).filter(Boolean);
    return () => {
      clearTimeout(timer.current);
      timer.current = null;
      subscriptions.forEach(subscription => {
        if (subscription && client.connected) subscription.unsubscribe();
      });
    };
  }, [client, connected, patientUid, emergencyId, refresh, user]);

  return { 
    connected, 
    revision, 
    refresh, 
    tracking: tracking?.emergencyId === emergencyId ? tracking : null, 
    ambulanceLocation,
    ambulanceLocationsMap,
    lastEvent
  };
}

// Live GPS Telemetry hook for authorized ambulance drivers
export function useAmbulanceLocationSender() {
  const [isTracking, setIsTracking] = useState(false);
  const [gpsStatus, setGpsStatus] = useState('IDLE'); // 'IDLE' | 'REQUESTING' | 'ACTIVE' | 'STALE' | 'DENIED' | 'UNAVAILABLE'
  const [gpsError, setGpsError] = useState(null);
  const [lastGpsTimestamp, setLastGpsTimestamp] = useState(null);
  const [currentCoords, setCurrentCoords] = useState(null);

  const watchIdRef = useRef(null);
  const intervalRef = useRef(null);
  const staleCheckTimerRef = useRef(null);
  const lastUpdateRef = useRef(null);

  const sendCoordsToBackend = useCallback(async (latitude, longitude, heading, speed) => {
    try {
      await API.post('/ambulance/location', {
        latitude,
        longitude,
        heading: heading != null && !isNaN(heading) ? heading : null,
        speed: speed != null && !isNaN(speed) ? speed : null
      });
      lastUpdateRef.current = Date.now();
      setLastGpsTimestamp(new Date());
      setGpsStatus('ACTIVE');
      setGpsError(null);
    } catch (err) {
      console.warn('Ambulance GPS telemetry delivery error:', err?.message);
    }
  }, []);

  const handlePositionSuccess = useCallback((position) => {
    const { latitude, longitude, heading, speed } = position.coords;
    setCurrentCoords({ latitude, longitude, heading, speed });
    sendCoordsToBackend(latitude, longitude, heading, speed);
  }, [sendCoordsToBackend]);

  const handlePositionError = useCallback((error) => {
    console.warn('Geolocation device error:', error);
    if (error.code === 1) { // PERMISSION_DENIED
      setGpsStatus('DENIED');
      setGpsError('Location permission denied. Please allow GPS location permissions in your browser.');
    } else if (error.code === 2) { // POSITION_UNAVAILABLE
      setGpsStatus('UNAVAILABLE');
      setGpsError('Location unavailable. Searching for GPS satellite signal...');
    } else if (error.code === 3) { // TIMEOUT
      setGpsStatus('STALE');
      setGpsError('GPS fix timed out. Retrying satellite lock...');
    } else {
      setGpsStatus('UNAVAILABLE');
      setGpsError('GPS telemetry offline.');
    }
  }, []);

  const startTracking = useCallback(() => {
    if (isTracking) return;

    if (typeof window === 'undefined' || !navigator.geolocation) {
      setGpsStatus('UNAVAILABLE');
      setGpsError('Geolocation is not supported by this browser environment');
      return;
    }

    setIsTracking(true);
    setGpsStatus('REQUESTING');
    setGpsError(null);

    // Initial immediate GPS fix
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        handlePositionSuccess(pos);
      },
      (err) => {
        handlePositionError(err);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );

    // Continuous watchPosition
    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePositionSuccess,
      handlePositionError,
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 2000
      }
    );

    // Periodic heartbeat sync every 6 seconds as backup
    intervalRef.current = setInterval(() => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          handlePositionSuccess,
          handlePositionError,
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 3000 }
        );
      }
    }, 6000);

    // Stale GPS watchdog: check if last GPS update was more than 30s ago
    staleCheckTimerRef.current = setInterval(() => {
      if (lastUpdateRef.current && (Date.now() - lastUpdateRef.current > 30000)) {
        setGpsStatus(prev => prev === 'ACTIVE' ? 'STALE' : prev);
      }
    }, 5000);

  }, [isTracking, handlePositionSuccess, handlePositionError]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined') {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (staleCheckTimerRef.current !== null) {
      clearInterval(staleCheckTimerRef.current);
      staleCheckTimerRef.current = null;
    }
    setIsTracking(false);
    setGpsStatus('IDLE');
    setGpsError(null);
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined') {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
      if (staleCheckTimerRef.current !== null) clearInterval(staleCheckTimerRef.current);
    };
  }, []);

  return {
    isTracking,
    gpsStatus,
    gpsError,
    lastGpsTimestamp,
    currentCoords,
    startTracking,
    stopTracking
  };
}