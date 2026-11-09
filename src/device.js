// -----------------------------------------------------------------------------
// The one Gladys device of the integration: the fires around the house.
//
// Features (couples checked against the Gladys front, see
// test/gladys-rules.test.js):
//   - fire_count        counter-sensor/integer: the fires within the radius;
//   - nearest_distance  distance-sensor/decimal, miles or km (the `units` of
//                       the configuration when the device is created): to the
//                       perimeter of the nearest fire, 0 inside it, else to its
//                       point. Without any fire, NO_FIRE: a "below 10" condition
//                       stays false, and nothing is ever published at 0 for
//                       "no data";
//   - nearest_fire      text/text: the nearest fire, in words;
//   - total_area        surface/decimal, km²: the area of the fires within the
//                       radius. Gladys has no acre unit: the texts give acres.
//
// Published with should_poll: false: the refresh runs in the container
// (src/monitor.js). The platform id is fixed: there is one area per Gladys.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

export const DEVICE_TYPE = 'fires';
export const PLATFORM_ID = 'area';
export const FEATURE_KEYS = {
  COUNT: 'fire_count',
  DISTANCE: 'nearest_distance',
  NEAREST: 'nearest_fire',
  AREA: 'total_area',
};

// Farther than any radius (150 miles, 241 km): "no fire in the radius".
export const NO_FIRE = 1000;
export const MAX_COUNT = 10000;
// 100,000 km² is 25 million acres, ten times the largest fire on record.
export const MAX_AREA_KM2 = 100000;

// Feature names, frozen at creation in Gladys (language of the configuration).
export const NAMES = {
  en: {
    device: 'Fires around the house',
    fire_count: 'Fires in the radius',
    nearest_distance: 'Nearest fire distance',
    nearest_fire: 'Nearest fire',
    total_area: 'Total burned area',
  },
  fr: {
    device: 'Feux autour de la maison',
    fire_count: 'Feux dans le rayon',
    nearest_distance: 'Distance du feu le plus proche',
    nearest_fire: 'Feu le plus proche',
    total_area: 'Surface brûlée totale',
  },
  de: {
    device: 'Brände um das Haus',
    fire_count: 'Brände im Radius',
    nearest_distance: 'Entfernung des nächsten Brandes',
    nearest_fire: 'Nächster Brand',
    total_area: 'Verbrannte Gesamtfläche',
  },
  es: {
    device: 'Incendios alrededor de la casa',
    fire_count: 'Incendios en el radio',
    nearest_distance: 'Distancia del incendio más cercano',
    nearest_fire: 'Incendio más cercano',
    total_area: 'Superficie quemada total',
  },
};

/** External ids of the device and of its features. */
export function deviceIds(gladys) {
  const ids = gladys.externalIds(DEVICE_TYPE, PLATFORM_ID);
  return {
    device: ids.device,
    count: ids.feature(FEATURE_KEYS.COUNT),
    distance: ids.feature(FEATURE_KEYS.DISTANCE),
    nearest: ids.feature(FEATURE_KEYS.NEAREST),
    area: ids.feature(FEATURE_KEYS.AREA),
  };
}

const sensor = (name, externalId, category, type, extra) => ({
  name,
  external_id: externalId,
  category,
  type,
  read_only: true,
  has_feedback: false,
  ...extra,
});

/** The unit of the distance feature for a `units` setting. */
export const distanceUnit = (units) =>
  units === 'metric' ? DEVICE_FEATURE_UNITS.KM : DEVICE_FEATURE_UNITS.MILE;

/** The discovery payload of the device. */
export function buildDevice(gladys, { language = 'fr', units = 'imperial' } = {}) {
  const ids = deviceIds(gladys);
  const names = NAMES[language] ?? NAMES.fr;
  return {
    name: names.device,
    external_id: ids.device,
    model: 'NIFC WFIGS',
    should_poll: false,
    params: [],
    features: [
      sensor(
        names.fire_count,
        ids.count,
        DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
        TYPES.SENSOR.INTEGER,
        { keep_history: true, min: 0, max: MAX_COUNT },
      ),
      sensor(
        names.nearest_distance,
        ids.distance,
        DEVICE_FEATURE_CATEGORIES.DISTANCE_SENSOR,
        TYPES.SENSOR.DECIMAL,
        { unit: distanceUnit(units), keep_history: true, min: 0, max: NO_FIRE },
      ),
      sensor(names.nearest_fire, ids.nearest, DEVICE_FEATURE_CATEGORIES.TEXT, TYPES.TEXT.TEXT, {
        keep_history: false,
        min: 0,
        max: 0,
      }),
      sensor(names.total_area, ids.area, DEVICE_FEATURE_CATEGORIES.SURFACE, TYPES.SURFACE.DECIMAL, {
        unit: DEVICE_FEATURE_UNITS.SQUARE_KILOMETER,
        keep_history: true,
        min: 0,
        max: MAX_AREA_KM2,
      }),
    ],
  };
}
