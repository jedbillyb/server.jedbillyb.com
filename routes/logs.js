import { Router } from 'express';
import { execAsync } from '../utils/exec.js';
import { spawn } from 'child_process';

const router = Router();

const validUnit = /^[a-zA-Z0-9@._:-]+$/;

function parseJournalOutput(out) {
  return out.trim().split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return { MESSAGE: line }; }
  });
}

export async function collectLogs({ unit = '', since = '', limit = 50 } = {}) {
  const n = Math.min(Math.max(parseInt(limit) || 50, 1), 500);

  const args = ['-n', String(n), '--no-pager', '-o', 'json'];
  if (unit) {
    if (!validUnit.test(unit)) throw new Error('Invalid unit name');
    args.push('-u', unit);
  }
  if (since) {
    if (!/^[\w\s:/-]+$/.test(since)) throw new Error('Invalid since value');
    args.push('--since', since);
  }

  const out = await execAsync(`journalctl ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`);
  return parseJournalOutput(out);
}

router.get('/', async (req, res) => {
  try {
    res.json(await collectLogs(req.query));
  } catch (err) {
    const bad = err.message === 'Invalid unit name' || err.message === 'Invalid since value';
    res.status(bad ? 400 : 500).json({ error: err.message });
  }
});

router.get('/stream', (req, res) => {
  const { unit = '' } = req.query;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const args = ['-f', '--no-pager', '-o', 'json'];
  if (unit) {
    if (!validUnit.test(unit)) {
      res.write(`data: ${JSON.stringify({ error: 'Invalid unit name' })}\n\n`);
      return res.end();
    }
    args.push('-u', unit);
  }

  const proc = spawn('journalctl', args);

  proc.stdout.on('data', data => {
    for (const line of data.toString().split('\n')) {
      if (line.trim()) res.write(`data: ${line.trim()}\n\n`);
    }
  });

  proc.on('close', () => res.end());
  req.on('close', () => proc.kill());
});

export default router;
