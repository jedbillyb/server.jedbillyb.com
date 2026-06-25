import { Router } from 'express';
import { execAsync } from '../utils/exec.js';

const router = Router();

export async function collectDockerContainers() {
  const out = await execAsync(
    `docker ps --format '{"id":"{{.ID}}","name":"{{.Names}}","image":"{{.Image}}","status":"{{.Status}}","ports":"{{.Ports}}","created":"{{.CreatedAt}}"}'`
  );
  return out.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
}

router.get('/containers', async (req, res) => {
  try {
    res.json(await collectDockerContainers());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
