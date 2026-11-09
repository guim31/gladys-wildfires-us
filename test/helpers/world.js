// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake NIFC serving the
// recorded answers of test/fixtures (filtered by category and distance the way
// the real ArcGIS layers do), a manual clock, a temporary /data, and the
// integration wired on top through registerHandlers. Nothing touches the
// network.
// -----------------------------------------------------------------------------

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { distanceMiles, distanceToPolygons } from '../../src/geo.js';
import { Store } from '../../src/store.js';

process.env.LOG_LEVEL ??= 'silent';
process.env.TZ = 'America/Los_Angeles';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));

// The answers were recorded on 07/11/2026 around 18:31 UTC.
export const START = Date.parse('2026-11-07T18:40:00Z');

// A house in Pendleton, Oregon (public coordinates of the city centre).
export const HOUSE = {
  id: 'house-1',
  name: 'Home',
  selector: 'home',
  latitude: 45.6721,
  longitude: -118.7886,
};

// IRWIN ids of recorded fires, with their distance from the house.
export const NORTH_CAYUSE = 'b0396ac9-6c41-4bc3-a899-f309fc28baae'; // 14.9 mi, 97 %, perimeter
export const HAGEN = 'd4e53810-46d0-48fb-889b-3e670328dcfb'; // 20.6 mi to the perimeter, 25.2 to the point
export const DORRAN_ROAD = 'a9728afd-fd16-45f5-9097-b1117964703f'; // 21.6 mi, no perimeter
export const WANAKET_RX = '9edc6736-3f83-404d-a07d-e6bb14167c20'; // prescribed, 23.5 mi
export const FIRE_1924 = 'b0d63f9c-031a-4473-aee8-17b02eca8a21'; // 35.0 mi, Washington
export const PARADISE = 'c8034780-d588-48da-8bc9-c6ced34cd8df'; // 41.2 mi, 86 %
export const MCCULLY = '55c74279-0c6b-4cf7-bf16-731e6a8fb5f9'; // 56.6 mi
export const HOAG = '0bac8699-01a7-4d17-a418-4acb6c324e43'; // 67.9 mi, 100 %

const irwinOf = (feature) =>
  (feature.properties.IrwinID ?? feature.properties.poly_IRWINID)
    .replace(/[{}]/g, '')
    .toLowerCase();

/**
 * Fake NIFC. `api.down`: 'network' (connection refused), a status (503),
 * 'arcgis' (HTTP 200 with an ArcGIS error) or false.
 */
export function createApi() {
  const api = {
    incidents: structuredClone(fixture('nifc/incidents.json').features),
    perimeters: structuredClone(fixture('nifc/perimeters.json').features),
    down: false,
    requests: [],

    incident(key) {
      return api.incidents.find((feature) => irwinOf(feature) === key);
    },
    perimeter(key) {
      return api.perimeters.find((feature) => irwinOf(feature) === key);
    },

    /** Change the containment of a fire, in both layers. */
    setContainment(key, percent) {
      const incident = api.incident(key);
      if (incident) {
        incident.properties.PercentContained = percent;
      }
      const perimeter = api.perimeter(key);
      if (perimeter) {
        perimeter.properties.attr_PercentContained = percent;
      }
    },

    /** Move the point of a fire (its perimeter is removed). */
    move(key, latitude, longitude) {
      api.incident(key).geometry.coordinates = [longitude, latitude];
      api.perimeters = api.perimeters.filter((feature) => irwinOf(feature) !== key);
    },

    /** A new fire, copied from a recorded incident, at a position. */
    addFire(fromKey, { id, latitude, longitude, name = 'Test Fire' }) {
      const feature = structuredClone(api.incident(fromKey));
      feature.properties.IrwinID = `{${id.toUpperCase()}}`;
      feature.properties.IncidentName = name;
      feature.properties.PercentContained = 0;
      feature.geometry.coordinates = [longitude, latitude];
      api.incidents.unshift(feature);
      return id;
    },

    /** The fire is out: gone from both layers. */
    remove(key) {
      api.incidents = api.incidents.filter((feature) => irwinOf(feature) !== key);
      api.perimeters = api.perimeters.filter((feature) => irwinOf(feature) !== key);
    },

    query(url) {
      const params = url.searchParams;
      const categories = [...params.get('where').matchAll(/'(\w+)'/g)].map((match) => match[1]);
      const [longitude, latitude] = params.get('geometry').split(',').map(Number);
      const center = { latitude, longitude };
      const radius = Number(params.get('distance'));
      if (url.pathname.includes('Perimeters')) {
        return api.perimeters.filter(
          (feature) =>
            categories.includes(feature.properties.attr_IncidentTypeCategory) &&
            distanceToPolygons(
              center,
              feature.geometry.type === 'Polygon'
                ? [feature.geometry.coordinates]
                : feature.geometry.coordinates,
            ) <= radius,
        );
      }
      return api.incidents.filter((feature) => {
        const [lon, lat] = feature.geometry.coordinates;
        return (
          categories.includes(feature.properties.IncidentTypeCategory) &&
          distanceMiles(latitude, longitude, lat, lon) <= radius
        );
      });
    },

    async fetch(input) {
      const url = new URL(input);
      api.requests.push(url);
      if (api.down === 'network') {
        throw new TypeError('fetch failed');
      }
      if (api.down === 'arcgis') {
        const body = { error: { code: 400, message: 'Unable to complete operation.' } };
        return { status: 200, text: async () => JSON.stringify(body) };
      }
      if (api.down) {
        return { status: api.down, text: async () => 'Service Unavailable' };
      }
      if (!url.pathname.endsWith('/FeatureServer/0/query')) {
        return { status: 404, text: async () => 'Not Found' };
      }
      const body = { type: 'FeatureCollection', features: api.query(url) };
      return { status: 200, text: async () => JSON.stringify(body) };
    },
  };
  return api;
}

/** A manual clock. */
export function createClock(start = START) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {Array} [options.houses] houses of Gladys
 * @param {object} [options.api] from createApi
 * @param {boolean} [options.connect]
 * @param {boolean} [options.timers] true: the monitor's own timer runs (mock it)
 */
export async function createWorld({
  config = {},
  devices = [],
  houses = [HOUSE],
  api = createApi(),
  connect = true,
  timers = false,
  clock = createClock(),
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-wildfires-us-')),
} = {}) {
  const gladys = createFakeGladys({ config, devices, houses });
  const store = new Store(dataDir);
  const app = registerHandlers(gladys, { store, fetch: api.fetch, timers, now: clock.now });
  if (connect) {
    await gladys.connect();
    await app.ready;
    await app.monitor.running;
  }
  return { gladys, fake: gladys.fake, app, monitor: app.monitor, api, clock, store, dataDir };
}

/** Create the device in Gladys, as the user would. */
export async function create(world) {
  const device = world.fake.discoveredDevices.at(-1);
  await world.fake.deviceCreated(device);
  return device;
}

/** External id of one feature of a device. */
export const featureId = (device, key) =>
  device.features.find((feature) => feature.external_id.endsWith(`:${key}`))?.external_id;

/** The last state published on one feature: a number, or the text. */
export function lastState(world, device, key) {
  const id = featureId(device, key);
  const state = world.fake.states.findLast((s) => s.device_feature_external_id === id);
  return state === undefined ? undefined : (state.text ?? state.state);
}

/** Run one refresh cycle, `minutes` later. */
export async function cycle(world, minutes = 15) {
  world.clock.advance(minutes * 60 * 1000);
  await world.monitor.runCycle();
}

/** Keys of the followed fires, in display order. */
export const followedKeys = (world) => world.monitor.fires.map((fire) => fire.key);

/**
 * Capture the integration's log lines at `level` and above (LOG_LEVEL is read
 * at every call). Returns the lines as `{ level, text }`.
 */
export function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => {
    const text = args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' ');
    const match = /^\[[^\]]+\] \[(\w+)\]/.exec(text);
    lines.push({ level: match ? match[1].toLowerCase() : 'raw', text });
  };
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}
