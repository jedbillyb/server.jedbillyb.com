import { Router } from 'express';
import { execAsync } from '../utils/exec.js';

const router = Router();

export async function collectActivity(limit = 5) {
  const n = Math.min(Math.max(parseInt(limit) || 5, 1), 100);
  const out = await execAsync(`journalctl -n ${n} --no-pager -o json`);
  return out.trim().split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return { MESSAGE: line }; }
  });
}

router.get('/', async (req, res) => {
  try {
    res.json(await collectActivity(req.query.limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
