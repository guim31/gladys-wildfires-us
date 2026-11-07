// -----------------------------------------------------------------------------
// The NIFC client and the geometry, on the recorded answers: the query sent,
// the fields read, the join of incidents and perimeters, the errors.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceMiles, distanceToPolygons } from '../src/geo.js';
import {
  HttpError,
  INCIDENTS_URL,
  fetchFires,
  getJson,
  parseIncident,
  parsePerimeter,
  queryUrl,
} from '../src/nifc.js';
import { HAGEN, HOUSE, NORTH_CAYUSE, WANAKET_RX, createApi, fixture } from './helpers/world.js';

const center = { latitude: HOUSE.latitude, longitude: HOUSE.longitude };

test('the query: rounded centre, widened radius, category filter, GeoJSON', () => {
  const url = new URL(
    queryUrl(INCIDENTS_URL, {
      center,
      radiusMiles: 50,
      categories: ['WF', 'RX'],
      prefix: '',
      fields: ['IrwinID'],
    }),
  );
  assert.equal(url.searchParams.get('where'), "IncidentTypeCategory IN ('WF','RX')");
  assert.equal(url.searchParams.get('geometry'), '-118.8,45.7');
  assert.equal(url.searchParams.get('distance'), '55');
  assert.equal(url.searchParams.get('f'), 'geojson');
  assert.equal(url.searchParams.get('outSR'), '4326');
});

test('an incident and a perimeter of the recording, read field by field', () => {
  const incidents = fixture('nifc/incidents.json').features;
  const perimeters = fixture('nifc/perimeters.json').features;
  const fire = incidents.map(parseIncident).find((f) => f?.key === NORTH_CAYUSE);
  assert.deepEqual(
    { ...fire, latitude: fire.latitude.toFixed(4), longitude: fire.longitude.toFixed(4) },
    {
      key: NORTH_CAYUSE,
      type: 'wildfire',
      id: '2026-OR973S-000206',
      name: 'North Cayuse',
      acres: 4887,
      containment: 97,
      discoveredAt: 1783202460000,
      cause: 'Human',
      state: 'OR',
      county: 'Umatilla',
      updatedAt: fire.updatedAt,
      latitude: '45.6831',
      longitude: '-118.4806',
      polygons: null,
    },
  );
  const burn = incidents.map(parseIncident).find((f) => f?.key === WANAKET_RX);
  assert.equal(burn.type, 'prescribed');
  assert.equal(burn.containment, null);
  const perimeter = perimeters.map(parsePerimeter).find((f) => f?.key === HAGEN);
  assert.equal(perimeter.name, 'Hagen');
  assert.ok(perimeter.polygons.length > 1, 'Hagen is a MultiPolygon');
  assert.equal(parseIncident({ properties: { IncidentTypeCategory: 'WF' } }), null);
  assert.equal(
    parseIncident({
      properties: { IrwinID: '{X}', IncidentTypeCategory: 'CX' },
      geometry: { coordinates: [0, 0] },
    }),
    null,
  );
});

test('fetchFires joins the two layers on the IRWIN id', async () => {
  const api = createApi();
  const { fires, truncated } = await fetchFires(api.fetch, {
    center,
    radiusMiles: 50,
    prescribedBurns: false,
  });
  assert.equal(truncated, false);
  assert.equal(new Set(fires.map((f) => f.key)).size, fires.length);
  assert.ok(fires.every((f) => f.type === 'wildfire'));
  const hagen = fires.find((f) => f.key === HAGEN);
  assert.ok(hagen.polygons && hagen.latitude !== null);
});

test('a perimeter alone (its point beyond the radius) still brings its fire', async () => {
  const api = createApi();
  api.remove(HAGEN);
  api.perimeters.push(
    fixture('nifc/perimeters.json').features.find((f) =>
      /D4E53810/.test(f.properties.poly_IRWINID),
    ),
  );
  const { fires } = await fetchFires(api.fetch, {
    center,
    radiusMiles: 50,
    prescribedBurns: false,
  });
  const hagen = fires.find((f) => f.key === HAGEN);
  assert.equal(hagen.latitude, null);
  assert.equal(hagen.acres, 61380);
  assert.equal(hagen.containment, 99);
});

test('a truncated layer is reported', async () => {
  const body = {
    type: 'FeatureCollection',
    features: [],
    properties: { exceededTransferLimit: true },
  };
  const fetchImpl = async () => ({ status: 200, text: async () => JSON.stringify(body) });
  const { truncated } = await fetchFires(fetchImpl, {
    center,
    radiusMiles: 50,
    prescribedBurns: false,
  });
  assert.equal(truncated, true);
});

test('HTTP errors, network errors, ArcGIS errors and bad bodies are HttpErrors', async () => {
  const url = `${INCIDENTS_URL}?f=geojson`;
  const answer = (status, text) => async () => ({ status, text: async () => text });
  await assert.rejects(getJson(answer(503, ''), url), { name: 'HttpError', status: 503 });
  await assert.rejects(getJson(answer(200, 'not json'), url), /not JSON/);
  await assert.rejects(getJson(answer(200, '{"error":{"code":400}}'), url), /ArcGIS error 400/);
  await assert.rejects(getJson(answer(200, '{}'), url), /no feature list/);
  await assert.rejects(
    getJson(async () => {
      throw new TypeError('fetch failed');
    }, url),
    (err) => err instanceof HttpError && err.status === null,
  );
});

test('geometry: haversine, inside a polygon, to its edge, holes', () => {
  // Pendleton to Portland, Oregon: 188 miles as the crow flies.
  assert.equal(Math.round(distanceMiles(45.6721, -118.7886, 45.5152, -122.6784)), 188);
  const square = (size) => [
    [-size, -size],
    [size, -size],
    [size, size],
    [-size, size],
    [-size, -size],
  ];
  const origin = { latitude: 0, longitude: 0 };
  assert.equal(distanceToPolygons(origin, [[square(1)]]), 0);
  // A hole around the house: outside the burned area, at the edge of the hole.
  const holed = distanceToPolygons(origin, [[square(1), square(0.5)]]);
  assert.equal(Math.round(holed), 35);
  const away = distanceToPolygons({ latitude: 0, longitude: 3 }, [[square(1)]]);
  assert.equal(Math.round(away), 138);
  assert.equal(distanceToPolygons(origin, [[[[0, 0]]]]), null);
});
