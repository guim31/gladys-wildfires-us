// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `fires`.
//
// A heading with the number of fires within the radius, then the fires as a
// `card-list` (8 rows at most, the core's cap), nearest first: the name as
// title, the distance, area and place as subtitle, the containment as a badge
// (green at 100 %). Tapping a row opens the core's detail panel: discovery
// date, cause, NIFC identifier, and a map of the fire's location. The footer
// gives the source and the time of the last reading, and a link to InciWeb
// (hidden by the `show_link` setting).
//
// Distances follow the units of the Gladys user asking (`us` or `metric`).
// Budget: 2 texts, 1 card-list, 1 button.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { LANGUAGES } from './config.js';
import {
  PHRASES,
  containmentOf,
  formatArea,
  formatDate,
  formatDay,
  formatDistance,
  formatNumber,
  nameOf,
  placeOf,
  radiusText,
} from './messages.js';
import { WIDGET_KEY } from './monitor.js';
import { INCIWEB_SITE } from './nifc.js';

export const MAX_ITEMS = 8;
export const TTL_SECONDS = 300;

export const TEXT = {
  waiting: {
    en: 'Waiting for NIFC…',
    fr: 'En attente du NIFC…',
    de: 'Warte auf NIFC…',
    es: 'Esperando al NIFC…',
  },
  source: { en: 'Source: NIFC', fr: 'Source : NIFC', de: 'Quelle: NIFC', es: 'Fuente: NIFC' },
  shown: { en: 'shown', fr: 'affichés', de: 'angezeigt', es: 'mostrados' },
  discovered: {
    en: 'Discovered',
    fr: 'Découvert le',
    de: 'Entdeckt am',
    es: 'Descubierto el',
  },
  cause: { en: 'Cause:', fr: 'Cause :', de: 'Ursache:', es: 'Causa:' },
  map: { en: 'Map', fr: 'Carte', de: 'Karte', es: 'Mapa' },
  site: { en: 'InciWeb', fr: 'InciWeb', de: 'InciWeb', es: 'InciWeb' },
};

// NIFC causes, as published.
export const CAUSES = {
  en: { Human: 'human', Natural: 'natural', Undetermined: 'undetermined' },
  fr: { Human: 'humaine', Natural: 'naturelle', Undetermined: 'indéterminée' },
  de: { Human: 'menschlich', Natural: 'natürlich', Undetermined: 'unbestimmt' },
  es: { Human: 'humana', Natural: 'natural', Undetermined: 'indeterminada' },
};

const t = (text, language) => text[language] ?? text.en;
const clip = (text, max) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

/** "3 fires within 50 mi", "No fire within 80 km" (40 characters at most). */
export function heading(count, radius, language) {
  const p = PHRASES[language];
  return clip(count === 0 ? p.none({ radius }) : p.fires({ count, radius }), 40);
}

/** One row of the list, and its detail panel. */
export function itemOf(fire, language, units) {
  const cause = fire.cause ? (CAUSES[language][fire.cause] ?? fire.cause) : '';
  const description = [
    containmentOf(fire, language),
    fire.discoveredAt === null
      ? ''
      : `${t(TEXT.discovered, language)} ${formatDay(fire.discoveredAt, language)}`,
    cause ? `${t(TEXT.cause, language)} ${cause}` : '',
    fire.id ?? '',
  ].filter(Boolean);
  const item = {
    title: clip(nameOf(fire, language), 60),
    subtitle: clip(
      [
        formatDistance(fire.distanceMiles, language, units),
        formatArea(fire.acres, language, units),
        placeOf(fire),
      ]
        .filter(Boolean)
        .join(' · '),
      60,
    ),
    description: description.join('\n'),
  };
  if (fire.containment !== null) {
    item.badge = {
      text: `${formatNumber(fire.containment, language)} %`,
      color: fire.containment === 100 ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.WARNING,
    };
  }
  if (fire.latitude !== null && fire.longitude !== null) {
    const lat = fire.latitude.toFixed(4);
    const lon = fire.longitude.toFixed(4);
    item.links = [
      {
        url: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=11/${lat}/${lon}`,
        label: t(TEXT.map, language),
      },
    ];
  }
  return item;
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    async get(monitor, { language = 'en', units, settings = {} } = {}) {
      const lang = LANGUAGES.includes(language) ? language : 'en';
      // The units of the user asking; the configuration when the core sends none.
      const system =
        units === 'us' ? 'imperial' : units === 'metric' ? 'metric' : monitor.config.units;
      const updated = monitor.lastSuccessAt;
      const source = t(TEXT.source, lang);
      const fires = monitor.fires;
      const radius = radiusText(monitor.config.radiusMiles, lang, system);
      let title = updated === null ? t(TEXT.waiting, lang) : heading(fires.length, radius, lang);
      if (fires.length > MAX_ITEMS) {
        title = clip(`${title} (${MAX_ITEMS} ${t(TEXT.shown, lang)})`, 40);
      }
      const components = [{ type: 'text', variant: 'heading', text: title }];
      if (fires.length > 0) {
        components.push({
          type: 'card-list',
          display: 'list',
          items: fires.slice(0, MAX_ITEMS).map((fire) => itemOf(fire, lang, system)),
        });
      }
      components.push({
        type: 'text',
        variant: 'caption',
        text: updated === null ? source : `${source} · ${formatDate(updated, lang)}`,
      });
      if (settings.show_link !== false) {
        components.push({
          type: 'button',
          label: t(TEXT.site, lang),
          icon: 'external-link',
          link: { url: INCIWEB_SITE },
        });
      }
      return { ttl_seconds: TTL_SECONDS, components };
    },
  },
};
