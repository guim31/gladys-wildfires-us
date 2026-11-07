// -----------------------------------------------------------------------------
// NIFC client: the current wildland fire incidents of WFIGS (Wildland Fire
// Interagency Geospatial Services, National Interagency Fire Center), and
// their mapped perimeters, around a centre, as plain fire objects.
//
// Two public ArcGIS FeatureServer layers, keyless, queried with a distance
// around a point so that only the area of the house is asked, never the whole
// country. The point sent is rounded to 0.1° (about 7 miles): the radius asked
// is widened by ROUNDING_MARGIN_MILES so the rounding loses no fire, and the
// exact distance is measured here, in the container.
//
// The two layers share the IRWIN id of the incident: a fire is the union of
// its location point and, when one is mapped, its perimeter. A perimeter whose
// point lies beyond the radius still brings its fire.
//
// ArcGIS answers HTTP 200 with `{ "error": … }` on a bad query; a page holds
// 2,000 features at most (`exceededTransferLimit` past it).
// -----------------------------------------------------------------------------

const SERVICE = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services';
export const INCIDENTS_URL = `${SERVICE}/WFIGS_Incident_Locations_Current/FeatureServer/0/query`;
export const PERIMETERS_URL = `${SERVICE}/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query`;
export const INCIWEB_SITE = 'https://inciweb.wildfire.gov';
export const USER_AGENT =
  'gladys-wildfires-us (Gladys Assistant integration; +https://github.com/guim31/gladys-wildfires-us)';

// Half the diagonal of a 0.1° cell, rounded up (0.05° of latitude is 3.5 miles).
export const ROUNDING_MARGIN_MILES = 5;
// About 200 m: enough for a distance in miles, and 20 times lighter than the
// full-resolution perimeters.
export const PERIMETER_SIMPLIFY_DEGREES = 0.002;

// Wildfires, and prescribed burns ("RX") when asked.
export const TYPES = { WF: 'wildfire', RX: 'prescribed' };

const INCIDENT_FIELDS = [
  'IrwinID',
  'UniqueFireIdentifier',
  'IncidentName',
  'IncidentTypeCategory',
  'IncidentSize',
  'PercentContained',
  'FireDiscoveryDateTime',
  'FireCause',
  'POOState',
  'POOCounty',
  'ModifiedOnDateTime_dt',
];
const PERIMETER_FIELDS = [
  'poly_IRWINID',
  'poly_IncidentName',
  'poly_GISAcres',
  'attr_UniqueFireIdentifier',
  'attr_IncidentTypeCategory',
  'attr_IncidentSize',
  'attr_PercentContained',
  'attr_FireDiscoveryDateTime',
  'attr_FireCause',
  'attr_POOState',
  'attr_POOCounty',
  'attr_ModifiedOnDateTime_dt',
];

export class HttpError extends Error {
  /**
   * @param {string} message
   * @param {number|null} status HTTP status, null for a network error or a bad body
   */
  constructor(message, status = null) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/** GET `url` and parse its JSON body; an ArcGIS `error` object is an error too. */
export async function getJson(fetchImpl, url, { timeoutMs = 30000 } = {}) {
  const host = new URL(url).host;
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const reason =
      err?.name === 'TimeoutError' ? `no answer in ${timeoutMs / 1000} s` : err.message;
    throw new HttpError(`${host}: ${reason}`);
  }
  if (response.status !== 200) {
    throw new HttpError(`${host}: HTTP ${response.status}`, response.status);
  }
  let body;
  try {
    body = JSON.parse(await response.text());
  } catch {
    throw new HttpError(`${host}: the answer is not JSON`, response.status);
  }
  if (body?.error) {
    throw new HttpError(`${host}: ArcGIS error ${body.error.code ?? ''}`.trim(), response.status);
  }
  if (!Array.isArray(body?.features)) {
    throw new HttpError(`${host}: no feature list in the answer`, response.status);
  }
  return body;
}

/** The query of one layer around the rounded centre. */
export function queryUrl(base, { center, radiusMiles, categories, prefix, fields, simplify }) {
  const params = new URLSearchParams({
    where: `${prefix}IncidentTypeCategory IN (${categories.map((c) => `'${c}'`).join(',')})`,
    // Rounded to 0.1°: the exact location of the house never leaves Gladys.
    geometry: `${center.longitude.toFixed(1)},${center.latitude.toFixed(1)}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    distance: String(radiusMiles + ROUNDING_MARGIN_MILES),
    units: 'esriSRUnit_StatuteMile',
    outFields: fields.join(','),
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
  });
  if (simplify) {
    params.set('maxAllowableOffset', String(PERIMETER_SIMPLIFY_DEGREES));
    params.set('geometryPrecision', '4');
  }
  return `${base}?${params}`;
}

// "{B0396AC9-…}" → "b0396ac9-…": the same incident in both layers.
const irwin = (value) =>
  typeof value === 'string' && value.trim() !== ''
    ? value.replace(/[{}]/g, '').trim().toLowerCase()
    : null;

const text = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
// A size of 0 means "not reported yet", not an empty fire.
const positive = (value) => {
  const n = number(value);
  return n !== null && n > 0 ? n : null;
};
const percent = (value) => {
  const n = number(value);
  return n === null ? null : Math.max(0, Math.min(100, n));
};
// "US-OR" → "OR".
const state = (value) => text(value).replace(/^US-/, '');

function polygonsOf(geometry) {
  if (geometry?.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    return [geometry.coordinates];
  }
  if (geometry?.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates;
  }
  return null;
}

/** One feature of either layer as a fire (prefix '' or 'attr_'); null if unusable. */
function parseFire(feature, prefix, key) {
  const p = feature?.properties ?? {};
  const type = TYPES[p[`${prefix}IncidentTypeCategory`]];
  if (!type || !key) {
    return null;
  }
  return {
    key,
    type,
    id: text(p[`${prefix}UniqueFireIdentifier`]) || null,
    name: text(prefix ? p.poly_IncidentName : p.IncidentName) || null,
    acres: positive(p[`${prefix}IncidentSize`]) ?? positive(p.poly_GISAcres),
    containment: percent(p[`${prefix}PercentContained`]),
    discoveredAt: number(p[`${prefix}FireDiscoveryDateTime`]),
    cause: text(p[`${prefix}FireCause`]),
    state: state(p[`${prefix}POOState`]),
    county: text(p[`${prefix}POOCounty`]),
    updatedAt: number(p[`${prefix}ModifiedOnDateTime_dt`]),
    latitude: null,
    longitude: null,
    polygons: null,
  };
}

/** A feature of the incident layer as a fire, or null. */
export function parseIncident(feature) {
  const p = feature?.properties ?? {};
  const fire = parseFire(feature, '', irwin(p.IrwinID) ?? irwin(p.UniqueFireIdentifier));
  const [longitude, latitude] = feature?.geometry?.coordinates ?? [];
  if (!fire || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return { ...fire, latitude, longitude };
}

/** A feature of the perimeter layer as a fire, or null. */
export function parsePerimeter(feature) {
  const p = feature?.properties ?? {};
  const fire = parseFire(feature, 'attr_', irwin(p.poly_IRWINID));
  const polygons = polygonsOf(feature?.geometry);
  if (!fire || !polygons) {
    return null;
  }
  return { ...fire, polygons };
}

/**
 * The current fires around `center` (radius in miles, widened for the
 * rounding), wildfires and, when asked, prescribed burns. `truncated` says a
 * layer hit its page size: some fires may be missing.
 */
export async function fetchFires(fetchImpl, { center, radiusMiles, prescribedBurns }) {
  const categories = prescribedBurns ? ['WF', 'RX'] : ['WF'];
  const [incidents, perimeters] = await Promise.all([
    getJson(
      fetchImpl,
      queryUrl(INCIDENTS_URL, {
        center,
        radiusMiles,
        categories,
        prefix: '',
        fields: INCIDENT_FIELDS,
      }),
    ),
    getJson(
      fetchImpl,
      queryUrl(PERIMETERS_URL, {
        center,
        radiusMiles,
        categories,
        prefix: 'attr_',
        fields: PERIMETER_FIELDS,
        simplify: true,
      }),
    ),
  ]);
  const fires = new Map();
  for (const feature of incidents.features) {
    const fire = parseIncident(feature);
    if (fire) {
      fires.set(fire.key, fire);
    }
  }
  for (const feature of perimeters.features) {
    const perimeter = parsePerimeter(feature);
    if (!perimeter) {
      continue;
    }
    const fire = fires.get(perimeter.key);
    if (fire) {
      // The incident record is the reference; the perimeter fills its gaps.
      // Several perimeter records of one incident: all of them count.
      fire.polygons = [...(fire.polygons ?? []), ...perimeter.polygons];
      fire.acres ??= perimeter.acres;
      fire.containment ??= perimeter.containment;
    } else {
      fires.set(perimeter.key, perimeter);
    }
  }
  const truncated = Boolean(
    incidents.exceededTransferLimit ||
    incidents.properties?.exceededTransferLimit ||
    perimeters.exceededTransferLimit ||
    perimeters.properties?.exceededTransferLimit,
  );
  return { fires: [...fires.values()], truncated };
}
