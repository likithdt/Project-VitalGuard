import LiveTrackingMap, { normalizeCoordinate, calculateBearing } from './LiveTrackingMap';

/**
 * GoogleMapTracking - Backward Compatibility Alias for LiveTrackingMap
 * 
 * Centralized mapping architecture now consolidated into LiveTrackingMap:
 * - 100% reliable Leaflet / OpenStreetMap road tiles (Fixes blank map issues).
 * - Multi-dashboard live ambulance synchronization via STOMP WebSockets.
 * - Complete Two-Tone Emergency Route Segments:
 *     Segment 1: Ambulance → Patient
 *     Segment 2: Patient → Hospital
 * - Follow Ambulance, Fit Route, and Zoom Controls.
 */

export { LiveTrackingMap, normalizeCoordinate, calculateBearing };
export default LiveTrackingMap;
