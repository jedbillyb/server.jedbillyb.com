import { Router } from 'express';
import { execAsync } from '../utils/exec.js';

const router = Router();

export async function collectProcesses({ sort = 'cpu', limit = 8 } = {}) {
  const sortFlag = sort === 'mem' ? '-pmem' : '-pcpu';
  const n = Math.min(Math.max(parseInt(limit) || 8, 1), 100);
  const out = await execAsync(`ps aux --sort=${sortFlag} | head -n ${n + 1}`);

  const lines = out.trim().split('\n').slice(1);
  return lines.map(line => {
    const parts = line.trim().split(/\s+/);
    return {
      user: parts[0],
      pid: Number(parts[1]),
      cpu: Number(parts[2]),
      mem: Number(parts[3]),
      vsz: Number(parts[4]),
      rss: Number(parts[5]),
      tty: parts[6],
      stat: parts[7],
      start: parts[8],
      time: parts[9],
      command: parts.slice(10).join(' '),
    };
  });
}

router.get('/', async (req, res) => {
  try {
    res.json(await collectProcesses(req.query));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
