// -----------------------------------------------------------------------------
// The scene action `read_fires` and the configuration action `check_now`.
// Both read NIFC again when the last cycle is older than one interval, and
// answer with the fires around the house as one sentence, nearest first:
// something a scene can send by message or read aloud.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { LANGUAGES } from './config.js';
import { STATUS, formatTime, render, sentence } from './messages.js';

const logger = createLogger({ name: 'wildfires-actions' });

export const SCENE_ACTION = 'read_fires';
export const CONFIG_ACTION = 'check_now';

/** Scene action: outputs `text` and `count`; throws if NIFC never answered. */
export async function readFires(monitor) {
  const { fires, ok } = await monitor.fresh();
  const { language } = monitor.config;
  if (!ok) {
    throw new Error(render(STATUS, monitor.hasCenter ? 'nifcDown' : 'noCenter')[language]);
  }
  return { text: sentence(fires, monitor.config), count: fires.length };
}

/** Configuration action: the fires around the house now, in every language. */
export async function checkNow(monitor) {
  const { fires, ok } = await monitor.fresh();
  logger.info(`Check requested: ${ok ? `${fires.length} fire(s) followed` : 'no reading'}`);
  if (!ok) {
    return render(STATUS, monitor.hasCenter ? 'nifcDown' : 'noCenter');
  }
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      render(STATUS, 'summary', {
        text: sentence(fires, { ...monitor.config, language }),
        time: formatTime(monitor.lastSuccessAt, language),
      })[language],
    ]),
  );
}
