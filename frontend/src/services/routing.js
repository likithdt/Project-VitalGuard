/**
 * VitalGuard Routing & Navigation Service
 * 
 * Interacts with OSRM (Open Source Routing Machine) driving profile
 * to calculate road distance, driving ETA, and exact road geometry polyline waypoints.
 * 
 * Fallback: Realistic curved road interpolation with a 1.35x road factor
 * when network is offline or routing API is rate-limited.
 */

const routeCache = new Map();

// Calculate Haversine straight-line distance in km
export const calcHaversineDistance = (lat1, lon1, lat2, lon2) => {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
};

// Generate curved road waypoints between two coordinates
export const generateCurvedRoute = (start, end, segments = 16) => {
  if (!start || !end) return [];
  const coords = [];
  // Perpendicular offset for realistic street curving
  const dx = end[1] - start[1];
  const dy = end[0] - start[0];
  const midLat = (start[0] + end[0]) / 2 + dx * 0.15;
  const midLng = (start[1] + end[1]) / 2 - dy * 0.15;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const lat = (1 - t) * (1 - t) * start[0] + 2 * (1 - t) * t * midLat + t * t * end[0];
    const lng = (1 - t) * (1 - t) * start[1] + 2 * (1 - t) * t * midLng + t * t * end[1];
    coords.push([lat, lng]);
  }
  return coords;
};

/**
 * Fetch driving directions from OSRM
 * @param {[number, number]} start [lat, lng]
 * @param {[number, number]} end [lat, lng]
 * @returns {Promise<{ distanceKm: number, etaMinutes: number, coordinates: [number, number][] }>}
 */
export async function getDrivingRoute(start, end) {
  if (!start || !end || !start[0] || !start[1] || !end[0] || !end[1]) {
    return null;
  }

  const startLat = Number(start[0]);
  const startLng = Number(start[1]);
  const endLat = Number(end[0]);
  const endLng = Number(end[1]);

  const cacheKey = `${startLat.toFixed(4)},${startLng.toFixed(4)}->${endLat.toFixed(4)},${endLng.toFixed(4)}`;
  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey);
  }

  // Calculate fallback estimation in advance
  const straightLine = calcHaversineDistance(startLat, startLng, endLat, endLng) || 1.0;
  // Road distance factor ~1.35x in urban settings
  const fallbackDistanceKm = Number((straightLine * 1.35).toFixed(1));
  // Average urban emergency speed ~32 km/h
  const fallbackEtaMinutes = Math.max(1, Math.round((fallbackDistanceKm / 32) * 60));
  const fallbackCoords = generateCurvedRoute([startLat, startLng], [endLat, endLng]);

  const fallbackResult = {
    distanceKm: fallbackDistanceKm,
    etaMinutes: fallbackEtaMinutes,
    coordinates: fallbackCoords,
    provider: 'fallback-road-model'
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout

    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
    const res = await fetch(osrmUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      routeCache.set(cacheKey, fallbackResult);
      return fallbackResult;
    }

    const data = await res.json();
    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const distKm = Number((route.distance / 1000).toFixed(1));
      const etaMin = Math.max(1, Math.round(route.duration / 60));
      // GeoJSON coordinates are [lng, lat], convert to [lat, lng]
      const coords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);

      const result = {
        distanceKm: distKm,
        etaMinutes: etaMin,
        coordinates: coords,
        provider: 'osrm-driving'
      };

      routeCache.set(cacheKey, result);
      return result;
    }
  } catch (err) {
    // Network error or timeout, return realistic fallback
  }

  routeCache.set(cacheKey, fallbackResult);
  return fallbackResult;
}

/**
 * Calculate complete journey telemetry for all transit phases
 * @param {[number, number]} ambulanceCoord
 * @param {[number, number]} patientCoord
 * @param {[number, number]} hospitalCoord
 */
export async function calculateCompleteJourneyTelemetry(ambulanceCoord, patientCoord, hospitalCoord) {
  const [ambToPat, patToHosp] = await Promise.all([
    ambulanceCoord && patientCoord ? getDrivingRoute(ambulanceCoord, patientCoord) : Promise.resolve(null),
    patientCoord && hospitalCoord ? getDrivingRoute(patientCoord, hospitalCoord) : Promise.resolve(null)
  ]);

  const distToPat = ambToPat?.distanceKm != null ? ambToPat.distanceKm : null;
  const etaToPat = ambToPat?.etaMinutes != null ? ambToPat.etaMinutes : null;

  const distPatToHosp = patToHosp?.distanceKm != null ? patToHosp.distanceKm : null;
  const etaPatToHosp = patToHosp?.etaMinutes != null ? patToHosp.etaMinutes : null;

  const totalDist = (distToPat != null && distPatToHosp != null)
    ? Number((distToPat + distPatToHosp).toFixed(1))
    : (distToPat || distPatToHosp);
  const totalEta = (etaToPat != null && etaPatToHosp != null)
    ? (etaToPat + etaPatToHosp)
    : (etaToPat || etaPatToHosp);

  return {
    ambulanceToPatient: { distanceKm: distToPat, etaMinutes: etaToPat, coordinates: ambToPat?.coordinates || [] },
    patientToHospital: { distanceKm: distPatToHosp, etaMinutes: etaPatToHosp, coordinates: patToHosp?.coordinates || [] },
    totalDistanceKm: totalDist,
    totalEtaMinutes: totalEta
  };
}
