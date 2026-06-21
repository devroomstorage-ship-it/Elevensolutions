/**
 * Google Maps integration (server-side).
 *
 * Uses the Routes API (computeRoutes) for distance + duration + polyline and
 * the Geocoding API to turn a typed address into coordinates when the frontend
 * did not supply them (e.g. a quote created without using autocomplete).
 *
 * Every successful lookup is cached in google_route_cache keyed by a hash of
 * the rounded coordinates, so repeated quotes on the same lane cost nothing.
 *
 * The server key (GOOGLE_MAPS_SERVER_KEY) must be IP-restricted and is NEVER
 * sent to the browser. The browser autocomplete key is a separate, referrer-
 * restricted key exposed to the frontend as NEXT_PUBLIC_GOOGLE_MAPS_KEY.
 */
const crypto = require('crypto');
const { query } = require('../db');

const SERVER_KEY = process.env.GOOGLE_MAPS_SERVER_KEY;

/** Hash rounded coords (≈100m precision) so near-identical lanes share a cache row. */
function cacheKey(origin, dest) {
  const parts = [origin.lat, origin.lng, dest.lat, dest.lng]
    .map((n) => Number(n).toFixed(3))
    .join('|');
  return crypto.createHash('sha1').update(parts + '|DRIVE').digest('hex').slice(0, 40);
}

/** Geocode a free-text address into { lat, lng, formatted }. */
async function geocode(address) {
  if (!SERVER_KEY) throw new Error('GOOGLE_MAPS_SERVER_KEY not configured');
  const url =
    'https://maps.googleapis.com/maps/api/geocode/json?address=' +
    encodeURIComponent(address) +
    '&key=' +
    SERVER_KEY;

  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK' || !data.results.length) {
    throw new Error(`Geocoding failed for "${address}": ${data.status}`);
  }
  const r = data.results[0];
  return {
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    formatted: r.formatted_address,
  };
}

/**
 * Get distance/duration/polyline between two coordinate pairs.
 * @param {{lat:number,lng:number}} origin
 * @param {{lat:number,lng:number}} dest
 * @returns {Promise<{distance_km:number,duration_min:number,route_summary:string,route_polyline:string|null,cached:boolean}>}
 */
async function getRoute(origin, dest) {
  if (!SERVER_KEY) throw new Error('GOOGLE_MAPS_SERVER_KEY not configured');

  const key = cacheKey(origin, dest);

  // 1. Cache hit?
  const cached = await query(
    'SELECT * FROM google_route_cache WHERE cache_key = $1 AND expires_at > NOW()',
    [key]
  );
  if (cached.rows.length) {
    const c = cached.rows[0];
    return {
      distance_km: Number(c.distance_km),
      duration_min: c.duration_min,
      route_summary: c.route_summary,
      route_polyline: c.route_polyline,
      cached: true,
    };
  }

  // 2. Live call to the Routes API.
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': SERVER_KEY,
      'X-Goog-FieldMask':
        'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.description',
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: Number(origin.lat), longitude: Number(origin.lng) } } },
      destination: { location: { latLng: { latitude: Number(dest.lat), longitude: Number(dest.lng) } } },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
    }),
  });

  const data = await res.json();
  const route = data.routes && data.routes[0];
  if (!route) {
    throw new Error('No route found between the supplied points');
  }

  const result = {
    distance_km: Math.round((route.distanceMeters / 1000) * 100) / 100,
    duration_min: Math.round(parseInt(route.duration, 10) / 60),
    route_summary: route.description || null,
    route_polyline: (route.polyline && route.polyline.encodedPolyline) || null,
    cached: false,
  };

  // 3. Cache it (ignore duplicate races).
  await query(
    `INSERT INTO google_route_cache
       (cache_key, origin_lat, origin_lng, dest_lat, dest_lng,
        distance_km, duration_min, route_summary, route_polyline)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (cache_key) DO NOTHING`,
    [
      key, origin.lat, origin.lng, dest.lat, dest.lng,
      result.distance_km, result.duration_min, result.route_summary, result.route_polyline,
    ]
  );

  return result;
}

/** Build a shareable Google Maps directions deep-link. */
function directionsLink(origin, dest) {
  return (
    'https://www.google.com/maps/dir/?api=1' +
    `&origin=${origin.lat},${origin.lng}` +
    `&destination=${dest.lat},${dest.lng}` +
    '&travelmode=driving'
  );
}

module.exports = { geocode, getRoute, directionsLink };
