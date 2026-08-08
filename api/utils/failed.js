import { execAsync } from './exec.js';

// how many systemd units have failed
export async function failedServices() {
  const out = await execAsync('systemctl --failed --no-pager --no-legend').catch(() => '');

  return out.trim().split('\n').filter(l =>
    l.trim() && !l.includes('0 loaded') && !l.includes('units listed')
  ).length;
}
