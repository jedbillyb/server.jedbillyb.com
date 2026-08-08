import { Router } from 'express';
import { failedServices } from '../utils/failed.js';
import { lastIncident } from '../utils/incident.js';
import os from 'os';

const router = Router();

export async function collectStatus() {
  const failed = await failedServices();

  const load = os.loadavg();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  return {
    ok: failed === 0,
    uptime: os.uptime(),
    load,
    memory: {
      total: totalMem,
      free: freeMem,
      usedPercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
    },
    failedServices: failed,
    // when the last outage started, so the page doesn't have to remember it
    lastIncident: lastIncident(),
  };
}

router.get('/', async (req, res) => {
  try {
    res.json(await collectStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
