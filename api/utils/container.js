import { execAsync } from './exec.js';

const validName = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;



export async function inspectContainer(name) {
  if (!validName.test(name)) throw new Error('Invalid container name');

  let state = 'absent', startedAt = null, finishedAt = null;
  try {
    const out = await execAsync(
      `docker inspect --format '{{.State.Status}}|{{.State.StartedAt}}|{{.State.FinishedAt}}' ${name}`
    );
    const [s, started, finished] = out.trim().split('|');
    const real = t => (t && !t.startsWith('0001-') ? t : null);
    state = s || 'unknown';
    startedAt = real(started);
    finishedAt = real(finished);
  } catch {
    return { state: 'absent', startedAt: null, finishedAt: null, mem: null, cpu: null };
  }

  let mem = null, cpu = null;
  if (state === 'running') {
    try {
      const out = await execAsync(
        `docker stats --no-stream --format '{{.CPUPerc}}|{{.MemUsage}}' ${name}`
      );
      const [c, m] = out.trim().split('|');
      cpu = c || null;
      mem = m || null;
    } catch {  }
  }

  return { state, startedAt, finishedAt, mem, cpu };
}
