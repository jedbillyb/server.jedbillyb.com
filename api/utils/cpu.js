const samples = new Map();

export function cpuPercent(key, usedNs) {
  if (!Number.isFinite(usedNs) || usedNs < 0) {
    samples.delete(key);
    return null;
  }

  const nowNs = Date.now() * 1e6;
  const prev = samples.get(key);
  samples.set(key, { usedNs, nowNs });

  if (!prev || usedNs < prev.usedNs) return null;

  const elapsed = nowNs - prev.nowNs;
  if (elapsed <= 0) return null;

  return Math.round(((usedNs - prev.usedNs) / elapsed) * 1000) / 10;
}

export function resetCpu(key) {
  samples.delete(key);
}
