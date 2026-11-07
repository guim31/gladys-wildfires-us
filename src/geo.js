// -----------------------------------------------------------------------------
// Distances around the house, in statute miles: to a point (haversine), and to
// a fire perimeter (0 inside it, else to its nearest edge).
//
// The perimeter distance projects the polygon on a plane tangent at the house
// (equirectangular): within 200 miles the error stays under 1 %, far below the
// precision of a mapped perimeter.
// -----------------------------------------------------------------------------

export const EARTH_RADIUS_MILES = 3958.8;
export const KM_PER_MILE = 1.609344;
export const HECTARES_PER_ACRE = 0.40468564224;
export const SQUARE_KM_PER_ACRE = 0.0040468564224;

const rad = (degrees) => (degrees * Math.PI) / 180;

/** Great-circle distance in miles (haversine). */
export function distanceMiles(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Distance from (0, 0) to the segment a–b, in the plane. */
function toSegment([ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** Even-odd rule: is (0, 0) inside the ring? */
function encloses(ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > 0 !== yj > 0 && 0 < ((xj - xi) * -yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Distance in miles from the centre to a perimeter: the polygons of a GeoJSON
 * Polygon or MultiPolygon, as arrays of rings of [longitude, latitude]. 0 when
 * the centre is inside (holes excluded); null without any usable ring.
 */
export function distanceToPolygons(center, polygons) {
  const scale = rad(1) * EARTH_RADIUS_MILES;
  const cos = Math.cos(rad(center.latitude));
  const project = ([longitude, latitude]) => [
    (longitude - center.longitude) * cos * scale,
    (latitude - center.latitude) * scale,
  ];
  let best = Infinity;
  for (const polygon of polygons) {
    const rings = polygon
      .filter((ring) => Array.isArray(ring) && ring.length >= 3)
      .map((ring) => ring.map(project));
    if (rings.length === 0) {
      continue;
    }
    // Inside the outer ring and in no hole: the house is within the perimeter.
    if (encloses(rings[0]) && !rings.slice(1).some(encloses)) {
      return 0;
    }
    for (const ring of rings) {
      for (let i = 1; i < ring.length; i += 1) {
        best = Math.min(best, toSegment(ring[i - 1], ring[i]));
      }
    }
  }
  return Number.isFinite(best) ? best : null;
}
