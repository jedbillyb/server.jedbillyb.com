import { execAsync } from './exec.js';

const validName = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;



export async function inspectContainer(name) {
  if (!validName.test(name)) throw new Error('Invalid container name');

  let state = 'absent', startedAt = null;
  try {
    const out = await execAsync(
      `docker inspect --format '{{.State.Status}}|{{.State.StartedAt}}' ${name}`
    );
    const [s, started] = out.trim().split('|');
    state = s || 'unknown';
    startedAt = started || null;
  } catch {
    return { state: 'absent', startedAt: null, mem: null, cpu: null };
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

  return { state, startedAt, mem, cpu };
}
