// -----------------------------------------------------------------------------
// The dashboard widget `fires`, validated against the core's own rules
// (validateWidgetContent of the SDK): the budget, the lengths, the units of
// the user asking, the setting that hides the button.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { LANGUAGES } from '../src/config.js';
import { MAX_ITEMS } from '../src/widgets.js';
import { createApi, createWorld } from './helpers/world.js';

async function world(t, config = {}, options = {}) {
  const w = await createWorld({ config, ...options });
  t.after(() => w.app.stop());
  return w;
}

const get = async (w, request) => {
  const ack = await w.fake.widgetGet('fires', request);
  assert.equal(ack.success, true, ack.error);
  return ack.data.content ?? ack.data;
};

test('the widget is valid in every language and both unit systems', async (t) => {
  const w = await world(t, { radius: '150', prescribed_burns: true });
  assert.ok(w.monitor.fires.length > MAX_ITEMS);
  for (const language of LANGUAGES) {
    for (const units of ['us', 'metric']) {
      const content = await get(w, { language, units, settings: {} });
      assert.doesNotThrow(() => validateWidgetContent(content), `${language} ${units}`);
      assert.ok(content.components.length <= 8);
      const [heading] = content.components;
      assert.ok(heading.text.length <= 40, heading.text);
      const list = content.components.find((c) => c.type === 'card-list');
      assert.equal(list.items.length, MAX_ITEMS);
      for (const item of list.items) {
        assert.ok(item.title.length <= 60 && item.subtitle.length <= 60, item.title);
        assert.ok(!item.badge || item.badge.text.length <= 16);
      }
    }
  }
});

test('rows: nearest first, distance in the units of the user, containment badge', async (t) => {
  const w = await world(t);
  const us = await get(w, { language: 'en', units: 'us', settings: {} });
  assert.equal(us.components[0].text, '5 fires within 50 mi');
  const [first] = us.components.find((c) => c.type === 'card-list').items;
  assert.equal(first.title, 'North Cayuse');
  assert.equal(first.subtitle, '15 mi · 4,887 acres · Umatilla, OR');
  assert.deepEqual(first.badge, { text: '97 %', color: 'warning' });
  assert.match(first.description, /^97% contained\nDiscovered 07\/04\/2026\nCause: human\n2026-/);
  assert.match(
    first.links[0].url,
    /^https:\/\/www\.openstreetmap\.org\/\?mlat=45\.6831&mlon=-118\.4806/,
  );
  const metric = await get(w, { language: 'fr', units: 'metric', settings: {} });
  assert.equal(metric.components[0].text, '5 feux à moins de 80 km');
  const [premier] = metric.components.find((c) => c.type === 'card-list').items;
  assert.equal(premier.subtitle, '24 km · 1 978 ha · Umatilla, OR');
});

test('no fire: a heading, no list; NIFC never read: waiting', async (t) => {
  const w = await world(t, { radius: '10', language: 'en' });
  const content = await get(w, { language: 'de', units: 'metric', settings: {} });
  assert.equal(content.components[0].text, 'Kein Brand im Umkreis von 16 km');
  assert.equal(
    content.components.some((c) => c.type === 'card-list'),
    false,
  );
  const api = createApi();
  api.down = 'network';
  const down = await world(t, {}, { api });
  const waiting = await get(down, { language: 'es', units: 'us', settings: {} });
  assert.equal(waiting.components[0].text, 'Esperando al NIFC…');
});

test('the InciWeb button can be hidden', async (t) => {
  const w = await world(t);
  const shown = await get(w, { language: 'en', units: 'us', settings: {} });
  assert.equal(shown.components.at(-1).link.url, 'https://inciweb.wildfire.gov');
  const hidden = await get(w, { language: 'en', units: 'us', settings: { show_link: false } });
  assert.equal(
    hidden.components.some((c) => c.type === 'button'),
    false,
  );
});

test('a change of the fires nudges the widget, a quiet cycle does not', async (t) => {
  const api = createApi();
  const w = await world(t, {}, { api });
  const before = w.fake.widgetRefreshes.length;
  w.clock.advance(15 * 60 * 1000);
  await w.monitor.runCycle();
  assert.equal(w.fake.widgetRefreshes.length, before);
  api.setContainment('c8034780-d588-48da-8bc9-c6ced34cd8df', 90);
  w.clock.advance(15 * 60 * 1000);
  await w.monitor.runCycle();
  assert.equal(w.fake.widgetRefreshes.length, before + 1);
});
