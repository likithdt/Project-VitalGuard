import { useCallback, useEffect, useRef, useState } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

export const createStompClient = (onConnect, onError) => {
  const client = new Client({
    webSocketFactory: () => new SockJS('http://localhost:8000/ws'),
    beforeConnect: () => {
      const token = localStorage.getItem('token');
      client.connectHeaders = token ? { Authorization: `Bearer ${token}` } : {};
    },
    reconnectDelay: 5000,
    heartbeatIncoming: 4000,
    heartbeatOutgoing: 4000,
    onConnect,
    onStompError: onError,
    onWebSocketError: onError,
    onWebSocketClose: onError,
  });
  return client;
};

export function useRealtimeRefresh(uid, emergencyId, patientUid = uid, user = null) {
  const [connected, setConnected] = useState(false);
  const [revision, setRevision] = useState(0);
  const [tracking, setTracking] = useState(null);
  const [ambulanceLocation, setAmbulanceLocation] = useState(null);
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
      }, 500);
    };
    const topics = ['/topic/emergency-updates', '/topic/hospital-queue-refresh'];
    if (patientUid) topics.push(`/topic/vitals/${patientUid}`, `/topic/ai-risk/${patientUid}`, `/topic/family-notifications/${patientUid}`);
    if (emergencyId != null) topics.push(`/topic/emergency/${emergencyId}`);
    // Add role-specific topics
    const userRole = user?.role || localStorage.getItem('userRole');
    if (userRole === 'HOSPITAL_ADMIN') {
      const hospitalId = user?.hospitalId || localStorage.getItem('hospitalId');
      if (hospitalId) topics.push(`/topic/hospital/${hospitalId}/emergencies`);
    } else if (userRole === 'DOCTOR') {
      const doctorId = user?.doctorId || user?.id || localStorage.getItem('doctorId');
      if (doctorId) topics.push(`/topic/doctor/${doctorId}/emergencies`);
    } else if (userRole === 'AMBULANCE_DRIVER') {
      const ambulanceId = user?.ambulanceId || localStorage.getItem('ambulanceId');
      const driverId = user?.id || localStorage.getItem('userId');
      if (ambulanceId) topics.push(`/topic/ambulance/${ambulanceId}`);
      if (driverId) topics.push(`/topic/ambulance/request/${driverId}`);
    }
    const subscriptions = topics.map(topic => client.subscribe(topic, message => {
      scheduleRefresh();
      try {
        const data = JSON.parse(message.body);
        
        // Handle ambulance location updates
        if (topic.startsWith('/topic/ambulance/') && data.latitude != null && data.longitude != null) {
          setAmbulanceLocation({
            latitude: data.latitude,
            longitude: data.longitude,
            status: data.status,
            ambulanceId: data.ambulanceId,
            unitId: data.unitId,
            timestamp: data.timestamp,
            emergencyId: data.emergencyId,
            distance: data.distance,
            eta: data.eta
          });
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
          setTracking({ ...data, emergencyId });
        }
        if (topic.includes('ambulance/request') && data) {
          setTracking({ ...data, emergencyId: data.emergencyId });
        }
      } catch {
        return;
      }
    }));
    return () => {
      clearTimeout(timer.current);
      timer.current = null;
      subscriptions.forEach(subscription => {
        if (client.connected) subscription.unsubscribe();
      });
    };
  }, [client, connected, patientUid, emergencyId, refresh, user]);

  return { connected, revision, refresh, tracking: tracking?.emergencyId === emergencyId ? tracking : null, ambulanceLocation };
}

// New hook for ambulance driver to send location updates
export function useAmbulanceLocationSender() {
  const [isTracking, setIsTracking] = useState(false);
  const watchIdRef = useRef(null);
  const intervalRef = useRef(null);

  const startTracking = useCallback(() => {
    if (isTracking) return;
    
    if (!navigator.geolocation) {
      console.warn('Geolocation is not supported by this browser');
      return;
    }

    setIsTracking(true);

    // High accuracy GPS tracking
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const response = await fetch('http://localhost:8000/api/ambulance/location', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ latitude, longitude })
          });
          if (!response.ok) {
            console.error('Failed to send location update');
          }
        } catch (error) {
          console.error('Error sending location:', error);
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );

    // Also send periodic updates as backup
    intervalRef.current = setInterval(async () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            try {
              await fetch('http://localhost:8000/api/ambulance/location', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ latitude, longitude })
              });
            } catch (error) {
              console.error('Error sending periodic location:', error);
            }
          },
          () => {},
          { enableHighAccuracy: true, timeout: 5000 }
        );
      }
    }, 30000); // Every 30 seconds
  }, [isTracking]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsTracking(false);
  }, []);

  useEffect(() => {
    return () => stopTracking();
  }, [stopTracking]);

  return { isTracking, startTracking, stopTracking };
}