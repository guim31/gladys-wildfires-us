// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// Select values are strings in the manifest (stored by Gladys as typed); the
// normalized config holds numbers. Distances are in statute miles, the unit of
// the NIFC data and of its users; the `units` setting only changes the display.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Miles around the centre. A large fire runs 10 to 20 miles a day: 50 miles
// leaves time to see it coming, 150 miles covers a whole region of smoke.
export const RADII = ['10', '25', '50', '100', '150'];

// Miles under which a fire "comes close" (scene trigger `fire_approaching`).
export const ALERT_DISTANCES = ['1', '3', '5', '10', '15', '25'];

export const UNITS = ['imperial', 'metric'];

// Minutes between two readings. WFIGS is updated every few minutes, its
// answers are cached 5 minutes by ArcGIS: faster would only ask the same thing.
export const REFRESH_INTERVALS = ['10', '15', '30', '60'];

export const DEFAULT_CONFIG = {
  latitude: '',
  longitude: '',
  radius: '50',
  alert_distance: '10',
  prescribed_burns: false,
  ignore_contained: false,
  units: 'imperial',
  refresh_interval: '15',
  language: 'fr',
};

/** A coordinate typed by the user (decimal comma accepted), null if blank or invalid. */
export function parseCoordinate(value, limit) {
  const text = String(value ?? '')
    .trim()
    .replace(',', '.');
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(text)) {
    return null;
  }
  const number = Number(text);
  return Math.abs(number) <= limit ? number : null;
}

const pick = (value, allowed, fallback) =>
  allowed.includes(String(value)) ? Number(value) : Number(fallback);

const isTrue = (value) => value === true || value === 'true';

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const latitude = parseCoordinate(source.latitude, 90);
  const longitude = parseCoordinate(source.longitude, 180);
  // Both or none: half a centre falls back on the house.
  const center = latitude !== null && longitude !== null ? { latitude, longitude } : null;
  const typed = String(source.latitude ?? '').trim() + String(source.longitude ?? '').trim();
  return {
    center,
    // Something was typed but is not a pair of coordinates: said once in the logs.
    invalidCenter: center === null && typed !== '',
    radiusMiles: pick(source.radius, RADII, DEFAULT_CONFIG.radius),
    alertMiles: pick(source.alert_distance, ALERT_DISTANCES, DEFAULT_CONFIG.alert_distance),
    prescribedBurns: isTrue(source.prescribed_burns),
    ignoreContained: isTrue(source.ignore_contained),
    units: UNITS.includes(source.units) ? source.units : DEFAULT_CONFIG.units,
    refreshMinutes: pick(
      source.refresh_interval,
      REFRESH_INTERVALS,
      DEFAULT_CONFIG.refresh_interval,
    ),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
