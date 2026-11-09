// -----------------------------------------------------------------------------
// The monitor: reads the current fires of NIFC around the house every
// `refresh_interval` minutes, keeps those within the radius, publishes the
// states of the device, fires the scene triggers and serves the widget and
// the actions.
//
// Centre: the coordinates of the configuration, else the first located house
// of Gladys. It is sent to NIFC rounded to 0.1° (src/nifc.js) and never logged.
// Distance: to the mapped perimeter of a fire when there is one (0 inside it),
// else to its location point.
//
// Triggers, each once per fire: "new fire" when a fire enters the radius for
// the first time, "fire approaching" when it comes within the alert distance,
// "fire contained" when it reaches 100 % containment. The fires already there
// at the first start, or when the configuration changes, fire nothing: they
// are not news. What was seen is kept under /data, so a restart fires nothing
// either.
//
// States: `publishChangedStates` sends only what changed, plus a heartbeat every
// 12 hours. When NIFC does not answer, nothing is published: the last values
// stay, and the connection status says it.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { NO_FIRE, buildDevice, deviceIds, distanceUnit } from './device.js';
import { KM_PER_MILE, SQUARE_KM_PER_ACRE, distanceMiles, distanceToPolygons } from './geo.js';
import {
  PHRASES,
  STATUS,
  UNIT_SYMBOLS,
  areaValue,
  describe,
  distanceValue,
  join,
  nameOf,
  radiusText,
  render,
} from './messages.js';
import { fetchFires } from './nifc.js';

const logger = createLogger({ name: 'wildfires' });

export const WIDGET_KEY = 'fires';
export const TRIGGERS = {
  NEW: 'new_fire',
  APPROACHING: 'fire_approaching',
  CONTAINED: 'fire_contained',
};

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const DEFAULT_TIMINGS = {
  heartbeatMs: 12 * HOUR,
  // A fire no longer listed for this long is forgotten: back, it is new again.
  forgetAfterMs: 3 * DAY,
  // requestWidgetRefresh is rate-limited to one call every 10 s by the core.
  widgetRefreshMs: 10000,
  // The houses of Gladys are read again this often (no update event).
  housesMaxAgeMs: HOUR,
};

// Scene events fired by one cycle at most: the core takes 300 a minute, and a
// burst of news is better summed up by the device than by 50 scenes.
export const MAX_EVENTS_PER_CYCLE = 20;

const byDistance = (a, b) =>
  a.distanceMiles - b.distanceMiles || (b.acres ?? 0) - (a.acres ?? 0) || (a.key < b.key ? -1 : 1);

export class Monitor {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK fake)
   * @param {object} options.store see src/store.js
   * @param {Function} [options.fetch] fetch
   * @param {boolean} [options.timers] false: no background timer (tests drive the cycles)
   * @param {Function} [options.now] clock in ms
   * @param {object} [options.timings] overrides of DEFAULT_TIMINGS
   */
  constructor({ gladys, store, fetch: fetchImpl, timers = true, now, timings }) {
    this.gladys = gladys;
    this.store = store;
    this.fetch = fetchImpl ?? ((...args) => fetch(...args));
    this.timers = timers;
    this.now = now ?? (() => Date.now());
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.config = null;
    this.data = emptyData();
    // The followed fires of the last successful cycle, nearest first.
    this.fires = [];
    this.lastSuccessAt = null;
    this.lastCycleAt = -Infinity;
    this.truncated = false;
    // The next cycle takes the fires as known, firing nothing.
    this.seedNext = false;
    this.house = undefined;
    this.houseReadAt = -Infinity;
    this.hasCenter = false;
    this.statusMessage = undefined;
    this.cycleTimer = null;
    this.running = null;
    this.lastRefreshAt = -Infinity;
    this.refreshTimer = null;
    // null: the first successful cycle always nudges the widget, even without fire.
    this.signature = null;
    this.stopped = false;
    // Keys of the failures already logged, so a repeated one is not logged again.
    this.failing = new Set();
  }

  /** Log a failure once (warn or error), then at debug until `recovered(key)`. */
  failed(key, level, message, err) {
    const details = err ? [message, err] : [message];
    if (this.failing.has(key)) {
      logger.debug(...details);
      return;
    }
    this.failing.add(key);
    logger[level](...details);
  }

  /** One line when a failure logged by `failed(key)` is over. */
  recovered(key, message) {
    if (this.failing.delete(key)) {
      logger.info(message);
    }
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    this.config = config;
    const saved = await this.store.load();
    if (saved?.version === 1) {
      this.data = { ...emptyData(), ...saved };
    }
    // First start ever: the fires burning now are the starting point, not news.
    this.seedNext = !this.data.seeded;
    await this.publishDiscovered();
    this.warnAboutConfig();
    logger.info(`Started: NIFC fires read every ${config.refreshMinutes} min`);
    this.schedule();
    this.runCycle();
  }

  /** Reconnection: Gladys may have restarted, publish everything again. */
  async resync(config) {
    this.config = config;
    this.houseReadAt = -Infinity;
    await this.publishDiscovered();
    this.statusMessage = undefined;
    await this.updateConnectionStatus();
    this.gladys.forgetPublishedStates?.();
    await this.publishStates();
    this.requestRefresh();
  }

  async reconfigure(config) {
    // A cycle already running finishes with the old configuration, whole: the
    // new one comes after, and a wider area brings fires that are not news.
    await this.running;
    const before = this.config ?? {};
    const rediscover = config.language !== before.language || config.units !== before.units;
    // A wider or moved area brings fires that are not news; a change of language,
    // units or interval does not, and a fire appearing meanwhile still fires.
    const areaChanged = ['center', 'radiusMiles', 'alertMiles', 'prescribedBurns'].some(
      (key) => JSON.stringify(config[key]) !== JSON.stringify(before[key]),
    );
    this.config = config;
    this.houseReadAt = -Infinity;
    if (areaChanged) {
      this.seedNext = true;
    }
    logger.info('Configuration saved');
    this.warnAboutConfig();
    if (rediscover) {
      await this.publishDiscovered();
    }
    this.schedule();
    await this.runCycle();
    this.requestRefresh();
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.cycleTimer);
    clearTimeout(this.refreshTimer);
    this.cycleTimer = null;
    await this.running?.catch(() => {});
    await this.store.flush();
  }

  schedule() {
    if (!this.timers || this.stopped) {
      return;
    }
    clearInterval(this.cycleTimer);
    this.cycleTimer = setInterval(() => this.runCycle(), this.config.refreshMinutes * MINUTE);
    this.cycleTimer.unref?.();
  }

  warnAboutConfig() {
    if (this.config.invalidCenter) {
      logger.warn('The coordinates of the configuration are not valid: the house is used');
    }
  }

  async publishDiscovered() {
    await this.gladys.publishDiscoveredDevices([buildDevice(this.gladys, this.config)]);
  }

  /** The device as created in Gladys, or undefined. */
  createdDevice() {
    const id = deviceIds(this.gladys).device;
    return (this.gladys.devices ?? []).find((device) => device.external_id === id);
  }

  // --- Centre ------------------------------------------------------------------

  /** The centre of the area: the configured coordinates, else the first located house. */
  async center() {
    if (this.config.center) {
      return this.config.center;
    }
    if (this.now() - this.houseReadAt >= this.timings.housesMaxAgeMs) {
      try {
        const houses = await this.gladys.getHouses();
        this.house =
          houses.find(
            (house) => Number.isFinite(house.latitude) && Number.isFinite(house.longitude),
          ) ?? null;
        this.houseReadAt = this.now();
        this.recovered('houses', 'The houses of Gladys are readable again');
      } catch (err) {
        this.failed('houses', 'warn', `Cannot read the houses of Gladys: ${err.message}`);
      }
    }
    return this.house ? { latitude: this.house.latitude, longitude: this.house.longitude } : null;
  }

  // --- Cycles ------------------------------------------------------------------

  runCycle() {
    if (this.running || this.stopped) {
      return this.running;
    }
    this.running = this.cycle()
      .catch((err) => this.failed('cycle', 'error', 'Refresh cycle failed', err))
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }

  async cycle() {
    this.lastCycleAt = this.now();
    const center = await this.center();
    this.hasCenter = center !== null;
    if (!center) {
      // Nothing to ask NIFC: no value is published rather than a false "no fire".
      await this.updateConnectionStatus();
      return;
    }
    const { radiusMiles, prescribedBurns } = this.config;
    let fetched;
    try {
      fetched = await fetchFires(this.fetch, { center, radiusMiles, prescribedBurns });
      this.recovered('nifc', 'NIFC answers again');
    } catch (err) {
      this.failed('nifc', 'warn', `NIFC unreachable: ${err.message}`);
      await this.updateConnectionStatus();
      return;
    }
    this.truncated = fetched.truncated;
    const located = fetched.fires
      .map((fire) => ({ ...fire, distanceMiles: distanceTo(center, fire) }))
      .filter((fire) => fire.distanceMiles !== null);
    const inRadius = located.filter((fire) => fire.distanceMiles <= radiusMiles).sort(byDistance);
    await this.detectChanges(inRadius, located);
    // The perimeters are only needed for the distance: not kept in memory.
    const followed = inRadius
      .filter((fire) => !(this.config.ignoreContained && fire.containment === 100))
      .map(({ polygons: _polygons, ...fire }) => fire);
    logger.debug(
      `Refresh cycle: ${fetched.fires.length} fire(s) listed, ${followed.length} followed`,
    );
    this.fires = followed;
    this.lastSuccessAt = this.now();
    this.recovered('cycle', 'Refresh cycles work again');
    await this.publishStates();
    await this.updateConnectionStatus();
    const signature = followed
      .map(
        (fire) => `${fire.key}:${fire.distanceMiles.toFixed(1)}:${fire.acres}:${fire.containment}`,
      )
      .join(',');
    if (signature !== this.signature) {
      this.signature = signature;
      this.requestRefresh();
    }
  }

  /** Fire the scene triggers, and remember what was seen. */
  async detectChanges(inRadius, listed) {
    const now = this.now();
    const known = this.data.known;
    const seed = this.seedNext;
    this.seedNext = false;
    const { alertMiles, ignoreContained } = this.config;
    const changes = [];
    for (const fire of inRadius) {
      const before = known[fire.key];
      const contained = fire.containment === 100;
      const close = fire.distanceMiles <= alertMiles;
      // A fire already 100 % contained is not news when the user hides them.
      const quiet = ignoreContained && contained;
      if (!before && !quiet) {
        changes.push({ key: TRIGGERS.NEW, fire });
      }
      if (close && !before?.close && !quiet) {
        changes.push({ key: TRIGGERS.APPROACHING, fire });
      }
      if (before && contained && !before.contained) {
        changes.push({ key: TRIGGERS.CONTAINED, fire });
      }
      // Sticky: each trigger fires once per fire, even if a redrawn perimeter
      // moves it back and forth across the alert distance.
      known[fire.key] = {
        close: Boolean(before?.close) || close,
        contained: Boolean(before?.contained) || contained,
        seenAt: now,
      };
    }
    // Still listed but beyond the radius: not forgotten, not new when it comes back.
    for (const fire of listed) {
      if (known[fire.key]) {
        known[fire.key].seenAt = now;
      }
    }
    for (const [key, entry] of Object.entries(known)) {
      if (now - entry.seenAt > this.timings.forgetAfterMs) {
        delete known[key];
      }
    }
    this.data.seeded = true;
    this.store.save(this.data);
    if (seed) {
      logger.debug(`${changes.length} change(s) taken as known, no trigger fired`);
      return;
    }
    for (const [index, change] of changes.entries()) {
      if (index >= MAX_EVENTS_PER_CYCLE) {
        logger.debug(`${changes.length - index} more change(s) not sent to the scenes`);
        break;
      }
      await this.fire(change);
    }
  }

  async fire({ key, fire }) {
    const what = `${nameOf(fire, 'en')}${fire.state ? ` (${fire.state})` : ''}`;
    const lines = {
      [TRIGGERS.NEW]: `New fire in the radius: ${what}`,
      [TRIGGERS.APPROACHING]: `Fire within the alert distance: ${what}`,
      [TRIGGERS.CONTAINED]: `Fire 100% contained: ${what}`,
    };
    // A wildfire coming is lifecycle news; burns and containments stay at debug.
    if (fire.type === 'wildfire' && key !== TRIGGERS.CONTAINED) {
      logger.info(lines[key]);
    } else {
      logger.debug(lines[key]);
    }
    try {
      await this.gladys.publishSceneEvent(key, this.eventData(fire));
      this.recovered('scene', 'Scene triggers work again');
    } catch (err) {
      this.failed('scene', 'warn', `Firing the scene trigger failed: ${err.message}`);
    }
  }

  /** The flat data of a scene event (fields, then variables of the manifest). */
  eventData(fire) {
    const { language, units } = this.config;
    return {
      incident_type: fire.type,
      name: nameOf(fire, language),
      distance: distanceValue(fire.distanceMiles, units),
      distance_unit: UNIT_SYMBOLS[units].distance,
      area: areaValue(fire.acres, units),
      area_unit: UNIT_SYMBOLS[units].area,
      containment: fire.containment,
      state: fire.state,
      county: fire.county,
      cause: fire.cause,
      summary: describe(fire, language, units),
    };
  }

  // --- States ------------------------------------------------------------------

  /** The unit of the distance feature as created in Gladys (frozen at creation). */
  createdDistanceUnit() {
    const id = deviceIds(this.gladys).distance;
    const feature = this.createdDevice()?.features?.find((f) => f.external_id === id);
    return feature?.unit ?? distanceUnit(this.config.units);
  }

  statesOf() {
    if (this.lastSuccessAt === null) {
      return [];
    }
    const ids = deviceIds(this.gladys);
    const { language, units, radiusMiles } = this.config;
    const nearest = this.fires[0] ?? null;
    const acres = this.fires.reduce((sum, fire) => sum + (fire.acres ?? 0), 0);
    const perMile = this.createdDistanceUnit() === 'km' ? KM_PER_MILE : 1;
    return [
      { device_feature_external_id: ids.count, state: this.fires.length },
      {
        device_feature_external_id: ids.distance,
        state: nearest ? Math.round(nearest.distanceMiles * perMile * 10) / 10 : NO_FIRE,
      },
      {
        device_feature_external_id: ids.nearest,
        text: nearest
          ? describe(nearest, language, units)
          : PHRASES[language].none({ radius: radiusText(radiusMiles, language, units) }),
      },
      {
        device_feature_external_id: ids.area,
        state: Math.round(acres * SQUARE_KM_PER_ACRE * 1000) / 1000,
      },
    ];
  }

  async publishStates() {
    if (!this.createdDevice()) {
      return;
    }
    const states = this.statesOf();
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeatMs });
      this.recovered('publish', 'Publishing the states works again');
    } catch (err) {
      // Sent again at the next cycle (the SDK forgets what Gladys refused).
      this.failed('publish', 'warn', `Publishing the states failed: ${err.message}`);
    }
  }

  async updateConnectionStatus() {
    const parts = [];
    if (this.failing.has('nifc')) {
      parts.push(render(STATUS, 'nifcDown'));
    }
    if (!this.hasCenter) {
      parts.push(render(STATUS, 'noCenter'));
    } else if (this.config.invalidCenter) {
      parts.push(render(STATUS, 'invalidCenter'));
    }
    if (this.truncated) {
      parts.push(render(STATUS, 'truncated'));
    }
    const message = parts.length > 0 ? join(...parts) : undefined;
    const connected = !this.failing.has('nifc') && this.lastSuccessAt !== null && this.hasCenter;
    const key = JSON.stringify([connected, message]);
    if (key === this.statusMessage) {
      return;
    }
    this.statusMessage = key;
    await this.gladys.setConnectionStatus(connected, message).catch(() => {});
  }

  // --- Gladys events -----------------------------------------------------------

  async onDeviceCreated(device) {
    if (device?.external_id !== deviceIds(this.gladys).device) {
      return;
    }
    if (this.lastSuccessAt === null) {
      await this.runCycle();
    }
    // The SDK forgot the states of the device: everything is published again.
    this.gladys.forgetPublishedStates?.();
    await this.publishStates();
    this.requestRefresh();
  }

  /** onPoll fallback: should_poll is false, but a Gladys polling anyway gets an answer. */
  async poll(device) {
    if (device?.external_id !== deviceIds(this.gladys).device) {
      return;
    }
    // Read again only if the last cycle is older than half the interval.
    if (this.now() - this.lastCycleAt >= (this.config.refreshMinutes * MINUTE) / 2) {
      await this.runCycle();
    } else {
      await this.publishStates();
    }
  }

  /** The followed fires, read again if the last cycle is older than one interval. */
  async fresh() {
    if (this.now() - this.lastCycleAt >= this.config.refreshMinutes * MINUTE) {
      await this.runCycle();
    } else {
      await this.running;
    }
    return { fires: this.fires, ok: this.lastSuccessAt !== null };
  }

  // --- Widget -------------------------------------------------------------------

  requestRefresh() {
    if (this.stopped) {
      return;
    }
    const now = this.now();
    const wait = this.lastRefreshAt + this.timings.widgetRefreshMs - now;
    if (wait <= 0) {
      this.lastRefreshAt = now;
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    } else if (this.timers && !this.refreshTimer) {
      this.refreshTimer = setTimeout(() => {
        this.refreshTimer = null;
        this.requestRefresh();
      }, wait);
      this.refreshTimer.unref?.();
    }
  }
}

/** Miles from the centre to the perimeter of a fire, else to its point; null if neither. */
export function distanceTo(center, fire) {
  const toPerimeter = fire.polygons ? distanceToPolygons(center, fire.polygons) : null;
  if (toPerimeter !== null) {
    return toPerimeter;
  }
  if (fire.latitude === null || fire.longitude === null) {
    return null;
  }
  return distanceMiles(center.latitude, center.longitude, fire.latitude, fire.longitude);
}

function emptyData() {
  return { version: 1, seeded: false, known: {} };
}
