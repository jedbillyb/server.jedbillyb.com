import { Router } from 'express';
import { collectSystem } from './system.js';
import { collectStatus } from './status.js';
import { collectServices, collectService } from './services.js';
import { collectProcesses } from './processes.js';
import { collectDockerContainers } from './docker.js';
import { collectActivity } from './activity.js';
import { collectLogs } from './logs.js';
import { collectProjectVitals, collectProjectLogs, projects } from './projects.js';

const router = Router();

const validUnit = /^[a-zA-Z0-9@._:-]+$/;
const truthy = v => v === '1' || v === 'true' || v === '';
const csv = v => String(v).split(',').map(s => s.trim()).filter(Boolean);









router.get('/', (req, res) => {
  const q = req.query;
  const interval = Math.min(Math.max(parseInt(q.interval) || 2000, 500), 30000);
  const logsLimit = q.logsLimit;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); 
  res.flushHeaders();

  
  const findProject = slug => projects.find(p => p.slug === slug);

  
  
  
  const TASK_TIMEOUT = 1500;
  const withTimeout = p => Promise.race([
    p,
    new Promise(resolve => setTimeout(resolve, TASK_TIMEOUT)),
  ]);

  async function snapshot() {
    const out = {};
    const tasks = [];
    const add = (key, promise) => tasks.push(
      withTimeout(Promise.resolve(promise).then(v => { out[key] = v; })).catch(() => {})
    );

    if (truthy(q.system)) add('system', collectSystem());
    if (truthy(q.status)) add('status', collectStatus());
    if (truthy(q.services)) add('services', collectServices());
    if (truthy(q.projects)) out.projects = projects;
    if (truthy(q.docker)) add('docker', collectDockerContainers());
    if (q.processes != null) add('processes', collectProcesses({ limit: q.processes }));
    if (q.activity != null) add('activity', collectActivity(q.activity));

    if (q.service) {
      out.service = {};
      for (const unit of csv(q.service)) {
        if (validUnit.test(unit)) {
          add(`service:${unit}`, collectService(unit).then(v => { out.service[unit] = v; }));
        }
      }
    }

    if (q.logs && validUnit.test(q.logs)) {
      add('logs', collectLogs({ unit: q.logs, limit: logsLimit ?? 5 }));
    }

    if (q.vitals) {
      out.vitals = {};
      for (const slug of csv(q.vitals)) {
        const p = findProject(slug);
        if (p) add(`vitals:${slug}`, collectProjectVitals(p).then(v => { out.vitals[slug] = v; }));
      }
    }

    if (q.projectLogs) {
      out.projectLogs = {};
      for (const slug of csv(q.projectLogs)) {
        const p = findProject(slug);
        if (p) add(`plogs:${slug}`, collectProjectLogs(p, logsLimit ?? 6).then(v => { out.projectLogs[slug] = v; }));
      }
    }

    await Promise.all(tasks);
    return out;
  }

  let closed = false;
  async function tick() {
    if (closed) return;
    try {
      const data = await snapshot();
      if (!closed) res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (err) {
      if (!closed) res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
    }
  }

  tick(); 
  const timer = setInterval(tick, interval);

  req.on('close', () => {
    closed = true;
    clearInterval(timer);
    res.end();
  });
});

export default router;
