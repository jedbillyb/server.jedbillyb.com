import { Router } from 'express';
import os from 'os';
import { execAsync } from '../utils/exec.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const [dfOut, netOut] = await Promise.all([
      execAsync("df -h / --output=used,avail,pcent | tail -1"),
      execAsync("cat /proc/net/dev | awk 'NR>2 && $1~/eth0|ens|enp/ {print $1,$2,$10}'"),
    ]);

    const [diskUsed, diskAvail, diskPcent] = dfOut.trim().split(/\s+/);

    const netLines = netOut.trim().split('\n').filter(Boolean);
    const net = {};
    for (const line of netLines) {
      const [iface, rx, tx] = line.split(/\s+/);
      net[iface.replace(':', '')] = { rxBytes: Number(rx), txBytes: Number(tx) };
    }

    const cpus = os.cpus();
    const load = os.loadavg();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    res.json({
      hostname: os.hostname(),
      uptime: os.uptime(),
      platform: os.platform(),
      arch: os.arch(),
      cpu: {
        model: cpus[0]?.model,
        cores: cpus.length,
        load,
      },
      memory: {
        total: totalMem,
        free: freeMem,
        used: totalMem - freeMem,
        usedPercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
      },
      disk: {
        used: diskUsed,
        available: diskAvail,
        usedPercent: diskPcent,
      },
      net,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/location', async (req, res) => {
  try {
    const resp = await fetch('https://ipinfo.io/json');
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
