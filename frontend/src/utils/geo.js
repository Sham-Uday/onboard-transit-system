// Geographic and ETA calculation utilities for OnBoard Transit System

export const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';
export const FALLBACK_SPEED_KMH = 30; // Used when the bus has no recent moving speed
export const MOVING_KMH = 5;          // Below this we treat the bus as stopped for averaging
export const OFF_ROUTE_KM = 0.3;      // Bus farther than this from route -> straight-line ETA fallback

/**
 * Calculates Great-Circle distance between two coordinates in kilometers using Haversine formula
 */
export function calculateDistanceKM(lat1, lon1, lat2, lon2) {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) {
    return 0;
  }
  const R = 6371; // Earth radius in KM
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Human-friendly formatting of estimated arrival time
 */
export function formatETA(distanceKM, speedKMH = FALLBACK_SPEED_KMH) {
  const safeSpeed = Math.max(speedKMH, 5);
  const timeInMinutes = Math.round((distanceKM / safeSpeed) * 60);
  if (timeInMinutes <= 1) return 'Arriving Now';
  return `~${timeInMinutes} mins (${distanceKM.toFixed(1)} km away)`;
}

/**
 * Calculates direct point-to-point ETA
 */
export function calculateETA(busLat, busLng, stopLat, stopLng, speedKMH = FALLBACK_SPEED_KMH) {
  if (!busLat || !busLng || !stopLat || !stopLng) return 'N/A';
  const dist = calculateDistanceKM(busLat, busLng, stopLat, stopLng);
  return formatETA(dist, speedKMH);
}

/**
 * Adds intermediate points on long straight segments so nearest-point route tracking is accurate
 */
export function densifyPath(points, stepKM = 0.05) {
  if (!Array.isArray(points) || points.length < 2) return points || [];
  const out = [];
  for (let i = 0; i < points.length; i++) {
    out.push(points[i]);
    if (i === points.length - 1) break;
    const [a, b] = [points[i], points[i + 1]];
    const dist = calculateDistanceKM(a[0], a[1], b[0], b[1]);
    const n = Math.ceil(dist / stepKM);
    for (let k = 1; k < n; k++) {
      out.push([
        a[0] + ((b[0] - a[0]) * k) / n,
        a[1] + ((b[1] - a[1]) * k) / n
      ]);
    }
  }
  return out;
}

/**
 * Generates an array of simulation waypoints strictly following the OSRM road path
 */
export function generateRoadWaypoints(roadPath, stops, stepKM = 0.02) {
  // 1. Prefer real OSRM road coordinates if available
  if (Array.isArray(roadPath) && roadPath.length >= 2) {
    const densified = densifyPath(roadPath, stepKM);
    return densified.map(([lat, lng]) => ({
      lat: parseFloat(lat.toFixed(6)),
      lng: parseFloat(lng.toFixed(6))
    }));
  }

  // 2. Fallback to densified stops path if roadPath is still pending
  if (Array.isArray(stops) && stops.length >= 2) {
    const stopCoords = stops.map(s => [s.lat, s.lng]);
    const densified = densifyPath(stopCoords, stepKM);
    return densified.map(([lat, lng]) => ({
      lat: parseFloat(lat.toFixed(6)),
      lng: parseFloat(lng.toFixed(6))
    }));
  }

  return [];
}

/**
 * Backward compatibility alias
 */
export function generateRouteWaypoints(stops, pointsPerSegment = 8) {
  return generateRoadWaypoints(null, stops, 0.03);
}


