import { Router } from 'express';
import { execAsync } from '../utils/exec.js';

const router = Router();

router.get('/containers', async (req, res) => {
  try {
    const out = await execAsync(
      `docker ps --format '{"id":"{{.ID}}","name":"{{.Names}}","image":"{{.Image}}","status":"{{.Status}}","ports":"{{.Ports}}","created":"{{.CreatedAt}}"}'`
    );
    const containers = out.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    res.json(containers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
