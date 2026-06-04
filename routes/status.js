import { Router } from 'express';
import { execAsync } from '../utils/exec.js';
import os from 'os';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const failedOut = await execAsync(
      'systemctl --failed --no-pager --no-legend'
    ).catch(() => '');

    const failedLines = failedOut.trim().split('\n').filter(l =>
      l.trim() && !l.includes('0 loaded') && !l.includes('units listed')
    );

    const load = os.loadavg();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    res.json({
      ok: failedLines.length === 0,
      uptime: os.uptime(),
      load,
      memory: {
        total: totalMem,
        free: freeMem,
        usedPercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
      },
      failedServices: failedLines.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
