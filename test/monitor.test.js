// -----------------------------------------------------------------------------
// The monitor on the recorded NIFC answers: the fires within the radius, the
// distance to the perimeter, the states of the device, the scene triggers (and
// when they must stay silent), the timer of the container, the centre, the
// privacy of the home location and the persistence under /data.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_FIRE } from '../src/device.js';
import { TRIGGERS } from '../src/monitor.js';
import {
  DORRAN_ROAD,
  FIRE_1924,
  HAGEN,
  HOAG,
  HOUSE,
  MCCULLY,
  NORTH_CAYUSE,
  PARADISE,
  WANAKET_RX,
  create,
  createApi,
  createWorld,
  cycle,
  followedKeys,
  lastState,
} from './helpers/world.js';

async function world(t, config = {}, options = {}) {
  const w = await createWorld({ config, ...options });
  t.after(() => w.app.stop());
  return w;
}

const AROUND_50 = [NORTH_CAYUSE, HAGEN, DORRAN_ROAD, FIRE_1924, PARADISE];

test('the fires within the radius, nearest first, wildfires only by default', async (t) => {
  const w = await world(t);
  assert.deepEqual(followedKeys(w), AROUND_50);
  const wide = await world(t, { radius: '100' });
  assert.deepEqual(followedKeys(wide).slice(0, 7), [...AROUND_50, MCCULLY, HOAG]);
  const narrow = await world(t, { radius: '10' });
  assert.deepEqual(followedKeys(narrow), []);
});

test('the distance is measured to the perimeter when NIFC maps one', async (t) => {
  const w = await world(t);
  const hagen = w.monitor.fires.find((fire) => fire.key === HAGEN);
  // 25.2 miles to the point of origin, 20.6 to the edge of the burned area.
  assert.equal(Math.round(hagen.distanceMiles * 10) / 10, 20.6);
  const dorran = w.monitor.fires.find((fire) => fire.key === DORRAN_ROAD);
  assert.equal(dorran.polygons, undefined);
  assert.equal(Math.round(dorran.distanceMiles * 10) / 10, 21.6);
});

test('a house inside a perimeter is at 0 miles', async (t) => {
  // A point inside the Hagen perimeter (first vertex nudged inside the shape).
  const w = await world(t, { latitude: '45.72', longitude: '-118.27' });
  assert.equal(w.monitor.fires[0].key, HAGEN);
  assert.equal(w.monitor.fires[0].distanceMiles, 0);
});

test('prescribed burns and fully contained fires follow the configuration', async (t) => {
  const burns = await world(t, { prescribed_burns: true });
  assert.ok(followedKeys(burns).includes(WANAKET_RX));
  const all = await world(t, { radius: '100' });
  assert.ok(followedKeys(all).includes(HOAG));
  const active = await world(t, { radius: '100', ignore_contained: true });
  assert.ok(!followedKeys(active).includes(HOAG));
  assert.ok(followedKeys(active).includes(NORTH_CAYUSE));
});

test('the location sent to NIFC is rounded to 0.1°, and only the area is asked', async (t) => {
  const api = createApi();
  await world(t, {}, { api });
  assert.equal(api.requests.length, 2);
  for (const url of api.requests) {
    assert.equal(url.searchParams.get('geometry'), '-118.8,45.7');
    assert.equal(url.searchParams.get('distance'), '55');
    assert.equal(url.searchParams.get('units'), 'esriSRUnit_StatuteMile');
    assert.doesNotMatch(url.href, /45\.672|118\.788/);
  }
});

test('the states: count, nearest distance, nearest fire, total area', async (t) => {
  const w = await world(t);
  const device = await create(w);
  assert.equal(lastState(w, device, 'fire_count'), 5);
  assert.equal(lastState(w, device, 'nearest_distance'), 14.9);
  assert.equal(
    lastState(w, device, 'nearest_fire'),
    'North Cayuse · 15 mi · 4\u202f887 acres · maîtrisé à 97 % · Umatilla, OR',
  );
  // 4,887 + 61,380 + 200 + 187 + 9,656 = 76,310 acres.
  assert.equal(lastState(w, device, 'total_area'), 308.82);
});

test('metric: the distance feature is created in km and published in km', async (t) => {
  const w = await world(t, { units: 'metric', language: 'en' });
  const device = await create(w);
  assert.equal(device.features.find((f) => f.external_id.endsWith(':nearest_distance')).unit, 'km');
  assert.equal(lastState(w, device, 'nearest_distance'), 24);
  assert.match(lastState(w, device, 'nearest_fire'), /^North Cayuse · 24 km · 1,978 ha · /);
});

test('a device created in miles stays in miles after a switch to metric', async (t) => {
  const w = await world(t);
  const device = await create(w);
  await w.fake.configUpdated({ units: 'metric' });
  await w.monitor.running;
  await cycle(w);
  assert.equal(lastState(w, device, 'nearest_distance'), 14.9);
});

test('no fire: the distance is NO_FIRE, never 0, and the text says the radius', async (t) => {
  const w = await world(t, { radius: '10', language: 'en' });
  const device = await create(w);
  assert.equal(lastState(w, device, 'fire_count'), 0);
  assert.equal(lastState(w, device, 'nearest_distance'), NO_FIRE);
  assert.equal(lastState(w, device, 'nearest_fire'), 'No fire within 10 mi');
  assert.equal(lastState(w, device, 'total_area'), 0);
});

test('NIFC down: nothing published, the status says it, values come back after', async (t) => {
  const api = createApi();
  api.down = 503;
  const w = await world(t, {}, { api });
  const device = await create(w);
  assert.equal(w.fake.states.length, 0);
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /NIFC does not answer/);
  api.down = false;
  await cycle(w);
  assert.equal(lastState(w, device, 'fire_count'), 5);
  assert.equal(w.fake.connectionStatus.connected, true);
});

test('an ArcGIS error answered with HTTP 200 is a failure, not "no fire"', async (t) => {
  const api = createApi();
  const w = await world(t, {}, { api });
  const device = await create(w);
  const before = w.fake.states.length;
  api.down = 'arcgis';
  await cycle(w);
  assert.equal(w.fake.states.length, before);
  assert.equal(lastState(w, device, 'fire_count'), 5);
  assert.equal(w.fake.connectionStatus.connected, false);
});

test('no house location and no coordinates: no query, no state, a clear status', async (t) => {
  const api = createApi();
  const w = await world(t, {}, { api, houses: [{ ...HOUSE, latitude: null, longitude: null }] });
  await create(w);
  assert.equal(api.requests.length, 0);
  assert.equal(w.fake.states.length, 0);
  assert.match(w.fake.connectionStatus.message.en, /No centre/);
  const { error } = await w.fake.sceneAction('read_fires', {});
  assert.match(String(error?.message ?? error), /Aucun centre/);
});

test('the fires present at the first start fire nothing', async (t) => {
  const w = await world(t);
  await cycle(w);
  assert.deepEqual(w.fake.sceneEvents, []);
});

test('new fire, fire approaching, fire contained: each once per fire', async (t) => {
  const api = createApi();
  const w = await world(t, { language: 'en' }, { api });
  // A new fire 30 miles north-east, then closer, then contained.
  const id = api.addFire(DORRAN_ROAD, {
    id: '11111111-2222-3333-4444-555555555555',
    latitude: 46.05,
    longitude: -118.4,
    name: 'Test Ridge',
  });
  await cycle(w);
  assert.deepEqual(
    w.fake.sceneEvents.map((e) => e.key),
    [TRIGGERS.NEW],
  );
  const data = w.fake.sceneEvents[0].data;
  assert.equal(data.name, 'Test Ridge');
  assert.equal(data.incident_type, 'wildfire');
  assert.equal(data.distance_unit, 'mi');
  assert.equal(data.containment, 0);
  assert.equal(data.state, 'OR');
  assert.match(data.summary, /^Test Ridge · 3\d mi · 200 acres · 0% contained · Umatilla, OR$/);

  api.move(id, 45.75, -118.75); // about 6 miles
  await cycle(w);
  assert.deepEqual(
    w.fake.sceneEvents.map((e) => e.key),
    [TRIGGERS.NEW, TRIGGERS.APPROACHING],
  );
  // Back and forth across the alert distance: not fired again.
  api.move(id, 46.0, -118.75);
  await cycle(w);
  api.move(id, 45.75, -118.75);
  await cycle(w);
  assert.equal(w.fake.sceneEvents.length, 2);

  api.setContainment(id, 100);
  await cycle(w);
  api.setContainment(id, 90);
  await cycle(w);
  api.setContainment(id, 100);
  await cycle(w);
  assert.deepEqual(
    w.fake.sceneEvents.map((e) => e.key),
    [TRIGGERS.NEW, TRIGGERS.APPROACHING, TRIGGERS.CONTAINED],
  );
});

test('a new fire already within the alert distance fires both triggers', async (t) => {
  const api = createApi();
  const w = await world(t, {}, { api });
  api.addFire(DORRAN_ROAD, {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    latitude: 45.7,
    longitude: -118.8,
  });
  await cycle(w);
  assert.deepEqual(
    w.fake.sceneEvents.map((e) => e.key),
    [TRIGGERS.NEW, TRIGGERS.APPROACHING],
  );
});

test('a recorded fire reaching 100 % fires "contained"', async (t) => {
  const api = createApi();
  const w = await world(t, {}, { api });
  api.setContainment(PARADISE, 100);
  await cycle(w);
  assert.deepEqual(
    w.fake.sceneEvents.map((e) => [e.key, e.data.name]),
    [[TRIGGERS.CONTAINED, 'Paradise']],
  );
});

test('a fire leaving the radius and coming back is not new again', async (t) => {
  const api = createApi();
  const w = await world(t, { radius: '25' }, { api });
  assert.ok(followedKeys(w).includes(DORRAN_ROAD));
  api.move(DORRAN_ROAD, 45.95, -118.2); // about 35 miles, beyond the query too
  await cycle(w);
  assert.ok(!followedKeys(w).includes(DORRAN_ROAD));
  api.move(DORRAN_ROAD, 45.98, -118.82);
  await cycle(w);
  assert.deepEqual(w.fake.sceneEvents, []);
});

test('changing the configuration fires nothing for the fires it brings', async (t) => {
  const w = await world(t, { radius: '10' });
  await w.fake.configUpdated({ radius: '100', prescribed_burns: true });
  await w.monitor.running;
  await cycle(w);
  assert.ok(w.monitor.fires.length > 5);
  assert.deepEqual(w.fake.sceneEvents, []);
});

test('a restart remembers the fires seen (under /data)', async (t) => {
  const api = createApi();
  const first = await world(t, {}, { api });
  await first.app.stop();
  api.addFire(DORRAN_ROAD, {
    id: 'bbbbbbbb-0000-0000-0000-000000000001',
    latitude: 46.0,
    longitude: -118.5,
  });
  const second = await world(t, {}, { api, dataDir: first.dataDir });
  assert.deepEqual(
    second.fake.sceneEvents.map((e) => e.key),
    [TRIGGERS.NEW],
  );
});

test('the container refreshes on its own timer (should_poll is false)', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const api = createApi();
  const w = await world(t, {}, { api, timers: true });
  const device = w.fake.discoveredDevices[0];
  assert.equal(device.should_poll, false);
  assert.equal(device.poll_frequency, undefined);
  const before = api.requests.length;
  t.mock.timers.tick(15 * 60 * 1000);
  await w.monitor.running;
  assert.equal(api.requests.length, before + 2);
});

test('states go through publishChangedStates with a 12-hour heartbeat', async (t) => {
  const w = await world(t);
  await create(w);
  // The SDK keeps its own clock for the heartbeat: the option is what matters here.
  const publish = t.mock.method(w.gladys, 'publishChangedStates');
  await cycle(w);
  assert.equal(publish.mock.callCount(), 1);
  assert.deepEqual(publish.mock.calls[0].arguments[1], { heartbeat: 12 * 60 * 60 * 1000 });
  assert.equal(publish.mock.calls[0].arguments[0].length, 4);
});

test('read_fires: one sentence, nearest first', async (t) => {
  const w = await world(t, { language: 'en' });
  const { data } = await w.fake.sceneAction('read_fires', {});
  assert.equal(data.outputs.count, 5);
  assert.equal(
    data.outputs.text,
    '5 fires within 50 mi: North Cayuse, 15 mi; Hagen, 21 mi; Dorran Road, 22 mi; 1924, 35 mi; Paradise, 41 mi.',
  );
});

test('check_now answers in the four languages', async (t) => {
  const w = await world(t, { units: 'metric' });
  const { data } = await w.fake.action('check_now', {});
  const message = data.message ?? data;
  assert.match(message.fr, /^5 feux à moins de 80 km : North Cayuse, à 24 km ;/);
  assert.match(message.de, /^5 Brände im Umkreis von 80 km: /);
  assert.match(message.es, /^5 incendios a menos de 80 km: /);
});
