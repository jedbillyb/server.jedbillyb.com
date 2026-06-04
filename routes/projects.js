import { Router } from 'express';
import { execAsync } from '../utils/exec.js';
import { projects } from '../config/projects.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(projects);
});

router.get('/:slug', (req, res) => {
  const project = projects.find(p => p.slug === req.params.slug);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

router.get('/:slug/vitals', async (req, res) => {
  const project = projects.find(p => p.slug === req.params.slug);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const vitals = { slug: project.slug, name: project.name };

  await Promise.allSettled([
    project.service
      ? execAsync(`systemctl is-active ${project.service}`).then(out => {
          vitals.serviceStatus = out.trim();
        })
      : Promise.resolve(),
    project.pm2
      ? execAsync('pm2 jlist').then(out => {
          const procs = JSON.parse(out);
          const proc = procs.find(p => p.name === project.pm2);
          if (proc) {
            vitals.pm2Status = proc.pm2_env?.status;
            vitals.pm2Restarts = proc.pm2_env?.restart_time;
            vitals.pm2Uptime = proc.pm2_env?.pm_uptime;
          }
        })
      : Promise.resolve(),
    project.port
      ? execAsync(`ss -tlnp | grep :${project.port}`).then(out => {
          vitals.portListening = out.trim() !== '';
        }).catch(() => { vitals.portListening = false; })
      : Promise.resolve(),
  ]);

  res.json(vitals);
});

router.get('/:slug/logs', async (req, res) => {
  const project = projects.find(p => p.slug === req.params.slug);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { limit = '6' } = req.query;
  const n = Math.min(Math.max(parseInt(limit) || 6, 1), 100);

  let unit = project.service || '';
  const cmd = unit
    ? `journalctl -u ${unit} -n ${n} --no-pager -o json`
    : `journalctl -n ${n} --no-pager -o json`;

  try {
    const out = await execAsync(cmd);
    const entries = out.trim().split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return { MESSAGE: line }; }
    });
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
