// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ALERT_DISTANCES,
  DEFAULT_CONFIG,
  LANGUAGES,
  RADII,
  REFRESH_INTERVALS,
  UNITS,
} from '../src/config.js';
import { TYPES } from '../src/nifc.js';
import { CONFIG_ACTION, SCENE_ACTION } from '../src/actions.js';
import { TRIGGERS, WIDGET_KEY } from '../src/monitor.js';
import { WIDGETS } from '../src/widgets.js';
import { DORRAN_ROAD, createApi, createWorld, cycle } from './helpers/world.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Every list of form fields the manifest can declare (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

// The handlers the integration actually registers on the SDK.
const { gladys: registered, app } = await createWorld({ connect: false });
await app.stop();
const handlerKeys = (prefix) =>
  Object.keys(registered.handlers)
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));

const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const optionValues = (field) => field.options.map((option) => option.value);
const field = (list, key) => list.find((entry) => entry.key === key);

test('identity: name, image, cover, cloud transport, categories, country', () => {
  assert.equal(manifest.name, 'US Wildfires');
  assert.equal(manifest.type, 'device');
  assert.match(manifest.docker_image, /^ghcr\.io\/guim31\/gladys-wildfires-us:/);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-wildfires-us/main/cover.png',
  );
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.deepEqual(manifest.categories, ['environment', 'security']);
  assert.deepEqual(manifest.countries, ['US']);
});

test('the widget offers to hide its button, by a boolean setting', () => {
  const [widget] = manifest.widgets;
  assert.deepEqual(
    widget.settings.map((setting) => [setting.key, setting.type, setting.default]),
    [['show_link', 'boolean', true]],
  );
});

test('the centre defaults to the house: the manifest declares the location', () => {
  assert.equal(manifest.location, true);
});

test('Gladys 5.3.0 at least: the `countries` field of the manifest', () => {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  const [major, minor] = match.slice(1).map(Number);
  assert.ok(major > 5 || (major === 5 && minor >= 3), manifest.gladys_version);
});

test('every manifest action, scene action and widget has its handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.actions), [CONFIG_ACTION]);
  assert.deepEqual(handlerKeys('action:'), [CONFIG_ACTION]);
  assert.deepEqual(keysOf(manifest.scene_actions), [SCENE_ACTION]);
  assert.deepEqual(handlerKeys('sceneAction:'), [SCENE_ACTION]);
  assert.deepEqual(keysOf(manifest.widgets), [WIDGET_KEY]);
  assert.deepEqual(Object.keys(WIDGETS), [WIDGET_KEY]);
  assert.deepEqual(handlerKeys('widget:'), [WIDGET_KEY]);
});

test('the outputs of read_fires are the declared ones', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const { data } = await world.fake.sceneAction(SCENE_ACTION, {});
  const declared = field(manifest.scene_actions, SCENE_ACTION).outputs;
  assert.deepEqual(Object.keys(data.outputs).sort(), keysOf(declared).sort());
  for (const output of declared) {
    assert.equal(typeof data.outputs[output.key], output.type, output.key);
  }
});

test('the scene triggers the monitor fires are declared, with their filters and variables', async (t) => {
  assert.deepEqual(keysOf(manifest.scene_triggers), Object.values(TRIGGERS));
  const api = createApi();
  const world = await createWorld({ api });
  t.after(() => world.app.stop());
  const id = api.addFire(DORRAN_ROAD, {
    id: 'dddddddd-0000-0000-0000-000000000001',
    latitude: 45.7,
    longitude: -118.8,
  });
  await cycle(world);
  api.setContainment(id, 100);
  await cycle(world);
  assert.deepEqual(world.fake.sceneEvents.map((e) => e.key).sort(), Object.values(TRIGGERS).sort());
  for (const event of world.fake.sceneEvents) {
    const trigger = field(manifest.scene_triggers, event.key);
    const keys = [...new Set([...keysOf(trigger.fields), ...keysOf(trigger.variables)])];
    assert.deepEqual(Object.keys(event.data).sort(), keys.sort(), `${event.key}: data keys`);
    for (const variable of trigger.variables) {
      const value = event.data[variable.key];
      assert.ok(value === null || typeof value === variable.type, `${event.key}.${variable.key}`);
    }
    for (const filter of trigger.fields ?? []) {
      assert.ok(optionValues(filter).includes(event.data[filter.key]), filter.key);
    }
  }
  for (const trigger of manifest.scene_triggers) {
    for (const filter of trigger.fields ?? []) {
      assert.deepEqual(optionValues(filter), Object.values(TYPES));
    }
  }
});

test('config_schema defaults and options are the ones of the code', () => {
  for (const entry of manifest.config_schema) {
    if (entry.default !== undefined) {
      assert.deepEqual(DEFAULT_CONFIG[entry.key], entry.default, entry.key);
    }
  }
  assert.deepEqual(
    Object.keys(DEFAULT_CONFIG).sort(),
    manifest.config_schema
      .filter((entry) => entry.type !== 'section')
      .map((entry) => entry.key)
      .sort(),
  );
  assert.deepEqual(optionValues(field(manifest.config_schema, 'language')), LANGUAGES);
  assert.deepEqual(optionValues(field(manifest.config_schema, 'radius')), RADII);
  assert.deepEqual(optionValues(field(manifest.config_schema, 'alert_distance')), ALERT_DISTANCES);
  assert.deepEqual(optionValues(field(manifest.config_schema, 'units')), UNITS);
  assert.deepEqual(
    optionValues(field(manifest.config_schema, 'refresh_interval')),
    REFRESH_INTERVALS,
  );
});

test('section fields are purely presentational', () => {
  for (const section of manifest.config_schema.filter((entry) => entry.type === 'section')) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
  }
});

test('no number field (the form has no step): coordinates are parsed strings', () => {
  assert.deepEqual(
    allFields.filter((entry) => entry.type === 'number'),
    [],
  );
});

test('actions: no field at all (the core applies no default, #3154 and #3155)', () => {
  for (const action of manifest.actions) {
    assert.equal(action.fields, undefined, action.key);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version);
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`));
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `description.${lang}: ${text.length}`);
  }
});
