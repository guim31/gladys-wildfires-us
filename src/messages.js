// -----------------------------------------------------------------------------
// Texts sent from the container (feature values, connection status, action and
// scene messages, scene variables), in the four languages of the Gladys
// interface. Entries are strings or functions of one parameter object. German
// says "du", Spanish "usted". Fire, county and state names come from NIFC:
// they are not translated.
//
// Distances and areas follow the `units` setting: miles and acres (imperial,
// the default), or kilometres and hectares (metric).
// -----------------------------------------------------------------------------

import { LANGUAGES } from './config.js';
import { HECTARES_PER_ACRE, KM_PER_MILE } from './geo.js';

// Values of the "Nearest fire" feature, and pieces of sentences.
export const PHRASES = {
  en: {
    none: ({ radius }) => `No fire within ${radius}`,
    unnamed: 'Unnamed fire',
    prescribed: 'prescribed burn',
    contained: ({ percent }) => `${percent}% contained`,
    item: ({ name, distance }) => `${name}, ${distance}`,
    list: ({ head, items }) => `${head}: ${items.join('; ')}.`,
    more: ({ count }) => `and ${count} more`,
    fires: ({ count, radius }) =>
      count === 1 ? `1 fire within ${radius}` : `${count} fires within ${radius}`,
    noFire: ({ radius }) => `No fire within ${radius} of your home.`,
  },
  fr: {
    none: ({ radius }) => `Aucun feu à moins de ${radius}`,
    unnamed: 'Feu sans nom',
    prescribed: 'brûlage dirigé',
    contained: ({ percent }) => `maîtrisé à ${percent} %`,
    item: ({ name, distance }) => `${name}, à ${distance}`,
    list: ({ head, items }) => `${head} : ${items.join(' ; ')}.`,
    more: ({ count }) => `et ${count} de plus`,
    fires: ({ count, radius }) =>
      count === 1 ? `1 feu à moins de ${radius}` : `${count} feux à moins de ${radius}`,
    noFire: ({ radius }) => `Aucun feu à moins de ${radius} de chez vous.`,
  },
  de: {
    none: ({ radius }) => `Kein Brand im Umkreis von ${radius}`,
    unnamed: 'Brand ohne Namen',
    prescribed: 'kontrolliertes Abbrennen',
    contained: ({ percent }) => `zu ${percent} % eingedämmt`,
    item: ({ name, distance }) => `${name}, ${distance} entfernt`,
    list: ({ head, items }) => `${head}: ${items.join('; ')}.`,
    more: ({ count }) => `und ${count} weitere`,
    fires: ({ count, radius }) =>
      count === 1 ? `1 Brand im Umkreis von ${radius}` : `${count} Brände im Umkreis von ${radius}`,
    noFire: ({ radius }) => `Kein Brand im Umkreis von ${radius} um dein Zuhause.`,
  },
  es: {
    none: ({ radius }) => `Ningún incendio a menos de ${radius}`,
    unnamed: 'Incendio sin nombre',
    prescribed: 'quema prescrita',
    contained: ({ percent }) => `contenido al ${percent} %`,
    item: ({ name, distance }) => `${name}, a ${distance}`,
    list: ({ head, items }) => `${head}: ${items.join('; ')}.`,
    more: ({ count }) => `y ${count} más`,
    fires: ({ count, radius }) =>
      count === 1 ? `1 incendio a menos de ${radius}` : `${count} incendios a menos de ${radius}`,
    noFire: ({ radius }) => `Ningún incendio a menos de ${radius} de su casa.`,
  },
};

// Unit symbols, the same in every language.
export const UNIT_SYMBOLS = {
  imperial: { distance: 'mi', area: 'acres' },
  metric: { distance: 'km', area: 'ha' },
};

// Connection status of the Configuration screen, and messages of the actions.
export const STATUS = {
  en: {
    initFailed: 'Initialization failed, check the integration logs.',
    nifcDown: 'NIFC does not answer: the fires are not updated.',
    noCenter:
      'No centre: give your house a location in Gladys (Settings, Houses) or type coordinates.',
    invalidCenter: 'The coordinates are not valid: the location of your house is used.',
    truncated: 'NIFC lists too many fires around you: lower the radius.',
    summary: ({ text, time }) => `${text} Checked at ${time}.`,
  },
  fr: {
    initFailed: "L'initialisation a échoué, consultez les logs de l'intégration.",
    nifcDown: 'Le NIFC ne répond pas : les feux ne sont pas mis à jour.',
    noCenter:
      'Aucun centre : indiquez la position de votre maison dans Gladys (Paramètres, Maisons) ou saisissez des coordonnées.',
    invalidCenter:
      'Les coordonnées ne sont pas valides : la position de votre maison est utilisée.',
    truncated: 'Le NIFC liste trop de feux autour de vous : réduisez le rayon.',
    summary: ({ text, time }) => `${text} Vérifié à ${time}.`,
  },
  de: {
    initFailed: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
    nifcDown: 'NIFC antwortet nicht: Die Brände werden nicht aktualisiert.',
    noCenter:
      'Kein Mittelpunkt: Gib deinem Haus in Gladys einen Standort (Einstellungen, Häuser) oder trage Koordinaten ein.',
    invalidCenter: 'Die Koordinaten sind ungültig: Der Standort deines Hauses wird verwendet.',
    truncated: 'NIFC listet zu viele Brände um dich herum: Verkleinere den Radius.',
    summary: ({ text, time }) => `${text} Geprüft um ${time}.`,
  },
  es: {
    initFailed: 'La inicialización ha fallado, consulte los registros de la integración.',
    nifcDown: 'El NIFC no responde: los incendios no se actualizan.',
    noCenter:
      'Sin centro: indique la ubicación de su casa en Gladys (Ajustes, Casas) o introduzca coordenadas.',
    invalidCenter: 'Las coordenadas no son válidas: se usa la ubicación de su casa.',
    truncated: 'El NIFC enumera demasiados incendios a su alrededor: reduzca el radio.',
    summary: ({ text, time }) => `${text} Comprobado a las ${time}.`,
  },
};

/** One entry of a message table, in every language: `{ en, fr, de, es }`. */
export function render(table, key, params = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => {
      const entry = table[language][key];
      return [language, typeof entry === 'function' ? entry(params) : entry];
    }),
  );
}

/** Several multi-language texts joined, language by language. */
export function join(...messages) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      messages
        .filter(Boolean)
        .map((message) => message[language])
        .join(' '),
    ]),
  );
}

// American English: the users of this integration live in the United States.
const locale = (language) => (language === 'en' ? 'en-US' : language);

/** A date in the user's time zone (TZ, set by the Gladys supervisor), e.g. "11/07 6:35 PM". */
export function formatDate(time, language) {
  return new Intl.DateTimeFormat(locale(language), {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(time));
}

/** A day, e.g. "07/04/2026" or "04/07/2026". */
export function formatDay(time, language) {
  return new Intl.DateTimeFormat(locale(language), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(time));
}

/** A time of day, e.g. "6:35 PM" or "18:35". */
export function formatTime(time, language) {
  return new Intl.DateTimeFormat(locale(language), {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(time));
}

/** A number in the user's language, e.g. "4,887" or "4 887" in French. */
export function formatNumber(value, language, digits = 0) {
  return new Intl.NumberFormat(locale(language), {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(value);
}

/** Miles in the unit of `units`: one decimal under 10, whole above. */
export function distanceValue(miles, units) {
  const value = units === 'metric' ? miles * KM_PER_MILE : miles;
  return value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
}

/** Acres in the unit of `units`, or null. */
export function areaValue(acres, units) {
  if (acres === null) {
    return null;
  }
  const value = units === 'metric' ? acres * HECTARES_PER_ACRE : acres;
  return value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
}

/** "12 mi", "3.2 km". */
export function formatDistance(miles, language, units) {
  return `${formatNumber(distanceValue(miles, units), language, 1)} ${UNIT_SYMBOLS[units].distance}`;
}

/** "4,887 acres", "1 978 ha"; '' when unknown. */
export function formatArea(acres, language, units) {
  const value = areaValue(acres, units);
  return value === null ? '' : `${formatNumber(value, language, 1)} ${UNIT_SYMBOLS[units].area}`;
}

/** "North Cayuse", "Tule (prescribed burn)", "Unnamed fire". */
export function nameOf(fire, language) {
  const p = PHRASES[language];
  const name = fire.name ?? p.unnamed;
  return fire.type === 'prescribed' ? `${name} (${p.prescribed})` : name;
}

/** "Umatilla, OR". */
export const placeOf = (fire) => [fire.county, fire.state].filter(Boolean).join(', ');

/** "97% contained"; '' when NIFC does not say. */
export const containmentOf = (fire, language) =>
  fire.containment === null
    ? ''
    : PHRASES[language].contained({ percent: formatNumber(fire.containment, language) });

/**
 * The value of the "Nearest fire" feature, e.g.
 * "North Cayuse · 12 mi · 4,887 acres · 97% contained · Umatilla, OR".
 */
export function describe(fire, language, units) {
  return [
    nameOf(fire, language),
    formatDistance(fire.distanceMiles, language, units),
    formatArea(fire.acres, language, units),
    containmentOf(fire, language),
    placeOf(fire),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** "50 mi" or "80 km": the radius in words. */
export const radiusText = (miles, language, units) => formatDistance(miles, language, units);

// Fires named in one sentence: a scene that reads it aloud stays short.
export const SENTENCE_FIRES = 5;

/**
 * The fires as one sentence, e.g. "2 fires within 50 mi: Hagen, 12 mi;
 * North Cayuse, 14 mi." Fires sorted already (nearest first).
 */
export function sentence(fires, { language, units, radiusMiles }) {
  const p = PHRASES[language];
  const radius = radiusText(radiusMiles, language, units);
  if (fires.length === 0) {
    return p.noFire({ radius });
  }
  const parts = fires.slice(0, SENTENCE_FIRES).map((fire) =>
    p.item({
      name: nameOf(fire, language),
      distance: formatDistance(fire.distanceMiles, language, units),
    }),
  );
  const rest = fires.length - SENTENCE_FIRES;
  if (rest > 0) {
    parts.push(p.more({ count: rest }));
  }
  return p.list({ head: p.fires({ count: fires.length, radius }), items: parts });
}
