import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { projects } from '../config/projects.js';
import { collectProjectVitals } from '../routes/projects.js';
import { failedServices } from './failed.js';

// data kept on disk so the record survives a restart
const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'incident.json');

const TICK_MS = 10000;
const DOWN_AFTER_MS = TICK_MS * 3;

// when the most recent incident started, and if it is still happening or not
let state = { at: null, ongoing: false };

export function lastIncident() {
  return state.at === null ? null : { at: state.at, ongoing: state.ongoing };
}

function isUp(v) {
  return v.serviceStatus === 'active'
    || v.pm2Status === 'online'
    || v.state === 'running'
    || v.portListening === true;
}

// an outage in progress keeps its start time, and keeps it once it ends
function mark(degraded, when = Date.now()) {
  if (degraded && !state.ongoing) state = { at: when, ongoing: true };
  else if (!degraded && state.ongoing) state = { at: state.at, ongoing: false };
}

async function tick() {
  const watched = projects.filter(p => p.featured);
  const vitals = await Promise.all(
    watched.map(p => collectProjectVitals(p).catch(() => null))
  );

  const anyDown = vitals.some(v => v && !isUp(v));
  const failed = await failedServices().catch(() => 0);
  mark(anyDown || failed > 0);

  await writeFile(FILE, JSON.stringify({ ...state, heartbeat: Date.now() })).catch(() => {});
}

export async function startIncidentMonitor() {
  await mkdir(dirname(FILE), { recursive: true }).catch(() => {});
  const saved = await readFile(FILE, 'utf8').then(JSON.parse).catch(() => null);

  if (saved?.at) state = { at: saved.at, ongoing: !!saved.ongoing };

  // the api can't record its own outage while it's down, so the gap in the
  // heartbeat is read back on start instead
  if (saved?.heartbeat && Date.now() - saved.heartbeat > DOWN_AFTER_MS && !state.ongoing) {
    state = { at: saved.heartbeat, ongoing: false };
  }

  await tick();
  setInterval(tick, TICK_MS).unref();
}
