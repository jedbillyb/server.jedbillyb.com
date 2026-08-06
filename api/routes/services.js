import { Router } from 'express';
import { execAsync } from '../utils/exec.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const validUnit = /^[a-zA-Z0-9@._:-]+$/;

function sanitize(unit) {
  if (!validUnit.test(unit)) throw new Error('Invalid unit name');
  return unit;
}

export async function collectServices() {
  const out = await execAsync(
    'systemctl list-units --type=service --no-pager --no-legend'
  );
  const list = out.trim().split('\n').filter(Boolean).map(line => {
    const parts = line.trim().replace(/^●\s*/, '').split(/\s+/);
    return {
      unit: parts[0],
      load: parts[1],
      active: parts[2],
      sub: parts[3],
      description: parts.slice(4).join(' '),
    };
  });

  const names = list.map(s => s.unit).filter(u => validUnit.test(u));
  if (names.length) {
    const shown = await execAsync(
      `systemctl show ${names.join(' ')} -p Id -p ActiveEnterTimestamp`
    ).catch(() => '');

    const startedAt = {};
    for (const block of shown.trim().split('\n\n')) {
      const props = {};
      for (const line of block.trim().split('\n')) {
        const i = line.indexOf('=');
        if (i > 0) props[line.slice(0, i)] = line.slice(i + 1);
      }
      // systemd writes the weekday first, e.g. "Wed 2026-07-22 06:59:29 UTC"
      const ts = Date.parse(String(props.ActiveEnterTimestamp ?? '').replace(/^[A-Za-z]{3}\s/, ''));
      if (props.Id && Number.isFinite(ts)) startedAt[props.Id] = ts;
    }

    for (const s of list) {
      if (s.active === 'active' && startedAt[s.unit]) s.since = startedAt[s.unit];
    }
  }

  return list;
}

export async function collectService(unit) {
  sanitize(unit);
  const out = await execAsync(`systemctl show ${unit} --no-pager`);
  const props = {};
  for (const line of out.trim().split('\n')) {
    const idx = line.indexOf('=');
    if (idx > 0) props[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return props;
}

router.get('/', async (req, res) => {
  try {
    res.json(await collectServices());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:unit', async (req, res) => {
  try {
    res.json(await collectService(req.params.unit));
  } catch (err) {
    res.status(err.message === 'Invalid unit name' ? 400 : 500).json({ error: err.message });
  }
});

for (const action of ['start', 'stop', 'restart']) {
  router.post(`/:unit/${action}`, requireAuth, async (req, res) => {
    try {
      const unit = sanitize(req.params.unit);
      await execAsync(`systemctl ${action} ${unit}`);
      res.json({ success: true, action, unit });
    } catch (err) {
      res.status(err.message === 'Invalid unit name' ? 400 : 500).json({ error: err.message });
    }
  });
}

export default router;
