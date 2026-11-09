// -----------------------------------------------------------------------------
// What the integration writes to `docker logs`: at info, only the lifecycle
// (the start, a new wildfire or one coming close, NIFC lost and back, a user
// action), never one line per refresh cycle; a failure that repeats at every
// cycle is logged once, plus one line when it is over. Never the coordinates
// of the centre: the location of the home is the sensitive data here.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DORRAN_ROAD,
  HOUSE,
  PARADISE,
  captureLogs,
  create,
  createApi,
  createWorld,
  cycle,
} from './helpers/world.js';

const strip = (line) => line.text.replace(/^\[[^\]]+\] /, '');

async function world(t, config = {}, options = {}) {
  const w = await createWorld({ config, ...options });
  t.after(() => w.app.stop());
  return w;
}

test('the start is one info line', async (t) => {
  const lines = captureLogs(t, 'info');
  await world(t);
  assert.deepEqual(lines.map(strip), ['[INFO] [wildfires] Started: NIFC fires read every 15 min']);
});

test('normal refresh cycles write nothing at info, a containment included', async (t) => {
  const api = createApi();
  const w = await world(t, {}, { api });
  await create(w);
  const lines = captureLogs(t, 'info');
  api.setContainment(PARADISE, 100);
  for (let i = 0; i < 4; i += 1) {
    await cycle(w);
  }
  assert.equal(w.fake.sceneEvents.length, 1);
  assert.deepEqual(lines, []);
});

test('a new wildfire is one info line, without the distance', async (t) => {
  const api = createApi();
  const w = await world(t, {}, { api });
  const lines = captureLogs(t, 'info');
  api.addFire(DORRAN_ROAD, {
    id: 'cccccccc-0000-0000-0000-000000000001',
    latitude: 46.05,
    longitude: -118.4,
    name: 'Test Ridge',
  });
  await cycle(w);
  await cycle(w);
  assert.deepEqual(lines.map(strip), [
    '[INFO] [wildfires] New fire in the radius: Test Ridge (OR)',
  ]);
});

test('LOG_LEVEL=debug shows the cycles, never the coordinates of the centre', async (t) => {
  const lines = captureLogs(t, 'debug');
  const w = await world(t);
  await cycle(w);
  const configured = await world(t, { latitude: '34.0522', longitude: '-118.2437' });
  await cycle(configured);
  assert.ok(
    lines.some((line) => /Refresh cycle: \d+ fire\(s\) listed, 5 followed/.test(line.text)),
  );
  const all = lines.map((line) => line.text).join('\n');
  for (const value of [HOUSE.latitude, HOUSE.longitude, 34.0522, -118.2437, 45.7, -118.8]) {
    assert.doesNotMatch(all, new RegExp(String(value).replace('.', '\\.')));
  }
});

test('NIFC down at every cycle: one warning, then one line at recovery', async (t) => {
  const api = createApi();
  const w = await world(t, {}, { api });
  const lines = captureLogs(t, 'info');
  api.down = 503;
  for (let i = 0; i < 4; i += 1) {
    await cycle(w);
  }
  assert.deepEqual(
    lines.map((line) => [line.level, strip(line).replace(/^\[\w+\] /, '')]),
    [['warn', '[wildfires] NIFC unreachable: services3.arcgis.com: HTTP 503']],
  );
  api.down = false;
  await cycle(w);
  assert.deepEqual(lines.slice(1).map(strip), ['[INFO] [wildfires] NIFC answers again']);
});

test('states refused at every cycle: one warning, then one line at recovery', async (t) => {
  const api = createApi();
  const w = await world(t, {}, { api });
  await create(w);
  const lines = captureLogs(t, 'info');
  const publish = t.mock.method(w.gladys, 'publishChangedStates', async () => {
    throw new Error('Gladys unreachable');
  });
  for (let i = 0; i < 3; i += 1) {
    await cycle(w);
  }
  assert.ok(publish.mock.callCount() >= 3);
  assert.deepEqual(
    lines.map((line) => [line.level, strip(line).replace(/^\[\w+\] /, '')]),
    [['warn', '[wildfires] Publishing the states failed: Gladys unreachable']],
  );
  publish.mock.restore();
  await cycle(w);
  assert.match(lines.at(-1).text, /\[INFO\].*Publishing the states works again/);
});

test('invalid coordinates are said once, at the start', async (t) => {
  const lines = captureLogs(t, 'info');
  const w = await world(t, { latitude: 'abc', longitude: '2' });
  for (let i = 0; i < 3; i += 1) {
    await cycle(w);
  }
  assert.deepEqual(lines.map(strip), [
    '[WARN] [wildfires] The coordinates of the configuration are not valid: the house is used',
    '[INFO] [wildfires] Started: NIFC fires read every 15 min',
  ]);
});
