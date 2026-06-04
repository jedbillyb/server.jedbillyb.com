import { Router } from 'express';
import { execAsync } from '../utils/exec.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { limit = '5' } = req.query;
    const n = Math.min(Math.max(parseInt(limit) || 5, 1), 100);
    const out = await execAsync(`journalctl -n ${n} --no-pager -o json`);
    const entries = out.trim().split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return { MESSAGE: line }; }
    });
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
