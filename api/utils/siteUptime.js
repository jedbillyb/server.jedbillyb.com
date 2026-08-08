import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { projects } from '../config/projects.js';
import { execAsync } from './exec.js';

// data kept on disk so a site's uptime survives an api restart
const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'site-uptime.json');

const TICK_MS = 10000;
const TIMEOUT_MS = 3000;
const DOWN_AFTER_MS = TICK_MS * 3;

let state = {};

export function siteUptime(slug) {
  const s = state[slug];
  if (!s) return null;
  return {
    up: s.up,
    seconds: s.up && s.since ? Math.max(0, Math.round((Date.now() - s.since) / 1000)) : 0,
  };
}

function probe(site) {
  return new Promise(resolve => {
    const req = https.request({
      host: '127.0.0.1',
      port: 443,
      path: site.probe.path ?? '/',
      method: 'GET',
      servername: site.probe.host,
      headers: { Host: site.probe.host },
      rejectUnauthorized: false,
      timeout: TIMEOUT_MS,
    }, res => {
      // a 404 or a 502 means nginx is alive but this site is not being served.
      resolve(res.statusCode >= 200 && res.statusCode < 400);
      res.resume();
    });

    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
    req.end();
  });
}

// systemd writes the weekday in format "Wed 2026-07-22 06:59:29 UTC"
async function nginxStart() {
  const out = await execAsync('systemctl show nginx.service -p ActiveEnterTimestamp').catch(() => '');
  const ms = Date.parse(out.split('=')[1]?.trim().replace(/^[A-Za-z]{3}\s/, '') ?? '');
  return Number.isFinite(ms) ? ms : null;
}

const watched = () => projects.filter(p => p.probe);

async function tick() {
  await Promise.all(watched().map(async site => {
    const up = await probe(site);
    const prev = state[site.slug];

    state[site.slug] = {
      up,
      since: up ? (prev?.up ? prev.since : Date.now()) : null,
    };
  }));

  await writeFile(FILE, JSON.stringify({ sites: state, heartbeat: Date.now() })).catch(() => {});
}

export async function startSiteUptimeMonitor() {
  await mkdir(dirname(FILE), { recursive: true }).catch(() => {});
  const saved = await readFile(FILE, 'utf8').then(JSON.parse).catch(() => null);

  if (saved?.sites) state = saved.sites;

  if (!saved?.heartbeat || Date.now() - saved.heartbeat > DOWN_AFTER_MS) {
    const started = await nginxStart();
    for (const site of watched()) {
      const since = state[site.slug]?.since;
      if (started && (!since || since < started)) {
        state[site.slug] = { up: true, since: started };
      }
    }
  }

  await tick();
  setInterval(tick, TICK_MS).unref();
}
