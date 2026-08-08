import { Router } from 'express';
import { readFile, readdir } from 'fs/promises';
import { execAsync } from '../utils/exec.js';
import { inspectContainer } from '../utils/container.js';
import { mcPing } from '../utils/mcping.js';
import { cpuPercent, resetCpu } from '../utils/cpu.js';
import { siteUptime } from '../utils/siteUptime.js';
import { projects } from '../config/projects.js';

const router = Router();


function since(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

router.get('/', (req, res) => {
  res.json(projects);
});

router.get('/:slug', (req, res) => {
  const project = projects.find(p => p.slug === req.params.slug);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

export async function collectProjectVitals(project) {
  const vitals = { slug: project.slug, name: project.name };


  if (project.mcVersion) vitals.version = project.mcVersion;

  // a static site has no specific process of its own, so its uptime comes from the probe
  // that has been requesting the page in the background
  if (project.probe) {
    const site = siteUptime(project.slug);
    if (site) {
      vitals.siteUp = site.up;
      vitals.siteUptimeSeconds = site.seconds;
    }
  }

  await Promise.allSettled([
    project.container
      ? inspectContainer(project.container).then(c => {
          vitals.state = c.state === 'running' ? 'running' : c.state;
          // while service is up it shows how long it has been up for. once it's down it shows
          // how long since it stopped/crashed
          vitals.last_up = c.state === 'running'
            ? since(c.startedAt)
            : since(c.finishedAt);
          if (c.mem) vitals.heap = c.mem.split('/')[0].trim();
          if (c.cpu) vitals.cpu = c.cpu;
        })
      : Promise.resolve(),
    project.container
      ? mcPing(project.mcHost || '127.0.0.1', project.mcPort || 25565)
          .then(p => {
            vitals.players = `${p.online}/${p.max}`;
            if (!vitals.version) vitals.version = p.version;
          })
          .catch(() => {  })
      : Promise.resolve(),
    project.service
      ? execAsync(`systemctl show ${project.service} -p ActiveState -p MemoryCurrent -p CPUUsageNSec -p ActiveEnterTimestamp`).then(out => {
          const props = Object.fromEntries(
            out.trim().split('\n').map(l => l.split('=').map(s => s.trim()))
          );
          if (props.ActiveState) vitals.serviceStatus = props.ActiveState;
          const mem = Number(props.MemoryCurrent);

          if (Number.isFinite(mem) && mem > 0 && mem < Number.MAX_SAFE_INTEGER) {
            vitals.memBytes = mem;
          }

          if (props.ActiveState === 'active') {
            const pct = cpuPercent(project.slug, Number(props.CPUUsageNSec));
            if (pct != null) vitals.cpuPercent = pct;

            // systemd writes the weekday first, e.g. "Wed 2026-07-22 06:59:29 UTC"
            const started = Date.parse(String(props.ActiveEnterTimestamp ?? '').replace(/^[A-Za-z]{3}\s/, ''));
            if (Number.isFinite(started)) {
              vitals.uptimeSeconds = Math.max(0, Math.round((Date.now() - started) / 1000));
            }
          } else {
            resetCpu(project.slug);
            vitals.cpuPercent = 0;
            vitals.uptimeSeconds = 0;
          }
        }).catch(() => {  })
      : Promise.resolve(),
    project.pm2
      ? execAsync('pm2 jlist').then(out => {
          const procs = JSON.parse(out);
          const proc = procs.find(p => p.name === project.pm2);
          if (proc) {
            vitals.pm2Status = proc.pm2_env?.status;
            vitals.pm2Restarts = proc.pm2_env?.restart_time;
            vitals.pm2Uptime = proc.pm2_env?.pm_uptime;
            if (proc.monit?.memory != null) vitals.memBytes = proc.monit.memory;
            if (proc.monit?.cpu != null) vitals.cpuPercent = proc.monit.cpu;
          }
        })
      : Promise.resolve(),
    project.port
      ? execAsync(`ss -tlnp | grep :${project.port}`).then(async out => {
          vitals.portListening = out.trim() !== '';


          if (!project.service && !project.pm2 && out.trim() !== '') {
            const pid = out.match(/pid=(\d+)/)?.[1];
            if (pid) {
              const rss = await execAsync(`awk '/^VmRSS:/{print $2}' /proc/${pid}/status`)
                .then(r => Number(r.trim()) * 1024).catch(() => null);
              if (Number.isFinite(rss) && rss > 0) vitals.memBytes = rss;

              const stat = await readFile(`/proc/${pid}/stat`, 'utf8').then(s => {
                const f = s.slice(s.lastIndexOf(')') + 2).split(' ');
                return { ticks: Number(f[11]) + Number(f[12]), startedTicks: Number(f[19]) };
              }).catch(() => null);

              if (Number.isFinite(stat?.ticks)) {
                // the kernel counts in ticks of 1/100th of a second
                const pct = cpuPercent(project.slug, (stat.ticks / 100) * 1e9);
                if (pct != null) vitals.cpuPercent = pct;
              }

              // the start time is measured from boot, so compare it against how long
              // the machine has been up to get the process's own uptime
              if (Number.isFinite(stat?.startedTicks)) {
                const booted = await readFile('/proc/uptime', 'utf8')
                  .then(s => Number(s.split(' ')[0])).catch(() => null);
                if (Number.isFinite(booted)) {
                  vitals.uptimeSeconds = Math.max(0, Math.round(booted - stat.startedTicks / 100));
                }
              }
            }
          }

          if (!project.service && !project.pm2 && out.trim() === '') {
            resetCpu(project.slug);
            vitals.cpuPercent = 0;
            vitals.uptimeSeconds = 0;
          }
        }).catch(() => { vitals.portListening = false; })
      : Promise.resolve(),
    project.diskUsage && project.path
      ? execAsync(`du -sb ${project.path}`).then(out => {
          const size = out.trim().split(/\s+/)[0];
          if (/^\d+$/.test(size)) vitals.diskBytes = Number(size);
        }).catch(() => {  })
      : Promise.resolve(),
    project.eventLog && project.service
      ? execAsync(`journalctl -u ${project.service} --no-pager -o short-iso -n 5000`).then(out => {
          const now = Date.now();
          const hourAgo = now - 3600000;
          let hits = 0, skipped = 0, newest = null;

          for (const line of out.split('\n')) {
            const isHit = line.includes(project.eventLog.hit);
            const isSkip = line.includes(project.eventLog.skipped);
            if (!isHit && !isSkip) continue;

            // timestamp is in format of "2026-07-27T21:13:05+0000"
            const ms = Date.parse(line.slice(0, line.indexOf(' ')));
            if (!Number.isFinite(ms)) continue;

            if (isHit && (newest === null || ms > newest)) newest = ms;
            if (ms >= hourAgo) isHit ? hits++ : skipped++;
          }

          // every request logs, so the ones that are not forwarded
          // log a skip, so the vital is what actually reaches telegram
          vitals.events_per_hour = Math.max(0, hits - skipped);
          vitals.last_event = newest === null ? null : since(new Date(newest).toISOString());
        }).catch(() => {  })
      : Promise.resolve(),
    project.openclawHome
      ? (async () => {
          const home = project.openclawHome;
          const [live, configured, files] = await Promise.all([

            // the newest session transcript records the model each reply used
            execAsync(`ls -t ${home}/agents/*/sessions/*.jsonl | head -1 | xargs -r tail -n 400 | grep -o '"model":"[^"]*"' | tail -1`)
              .then(out => out.match(/"model":"([^"]+)"/)?.[1] ?? null).catch(() => null),

            readFile(`${home}/openclaw.json`, 'utf8')
              .then(raw => JSON.parse(raw)?.agents?.defaults?.model?.primary?.split('/').pop() ?? null)
              .catch(() => null),

            readdir(`${home}/workspace`)
              .then(f => f.filter(n => n.endsWith('.md')).length).catch(() => null),
          ]);

          // the config only holds the configured default, so a model switched at runtime
          // never reaches it. the transcript is what's actually in use
          if (live ?? configured) vitals.model = live ?? configured;
          if (files != null) vitals.memoryFiles = files;
        })()
      : Promise.resolve(),
  ]);

  return vitals;
}

export async function collectProjectLogs(project, limit = 6) {
  const n = Math.min(Math.max(parseInt(limit) || 6, 1), 100);

  if (project.container) {



      const out = await execAsync(
        `docker logs --timestamps --tail ${Math.min(n * 8, 500)} ${project.container} 2>&1`
      );
      const clean = s => (
        s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
          .split('\r')
          .map(t => t.trim())
          .filter(Boolean)
          .pop() || ''
      );

      const sensitive = [
        /]:\s*<[^>]+>/,
        /]:\s*\[[^\]]+ -> [^\]]+\]/,
        /]:\s*\* /,
        /issued server command/i,
        /\bran command\b/i,
      ];

      const redact = s => s.replace(/(\/)?\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?/g, '[redacted]');

      const entries = out.trim().split('\n').filter(Boolean).map(line => {
        const sp = line.indexOf(' ');
        const ts = Date.parse(line.slice(0, sp));
        const raw = Number.isNaN(ts) ? line : line.slice(sp + 1);
        const msg = clean(raw);
        const ms = Number.isNaN(ts) ? null : String(ts * 1000);
        return { MESSAGE: msg, __REALTIME_TIMESTAMP: ms };
      })
        .filter(e => e.MESSAGE && !sensitive.some(re => re.test(e.MESSAGE)))
        .map(e => ({ ...e, MESSAGE: redact(e.MESSAGE) }))
        .slice(-n);

      return entries;
  }

  const unit = project.service || '';
  const cmd = unit
    ? `journalctl -u ${unit} -n ${n} --no-pager -o json`
    : `journalctl -n ${n} --no-pager -o json`;
  const out = await execAsync(cmd);
  return out.trim().split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return { MESSAGE: line }; }
  });
}

router.get('/:slug/vitals', async (req, res) => {
  const project = projects.find(p => p.slug === req.params.slug);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  try {
    res.json(await collectProjectVitals(project));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:slug/logs', async (req, res) => {
  const project = projects.find(p => p.slug === req.params.slug);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  try {
    res.json(await collectProjectLogs(project, req.query.limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export { projects };
export default router;
