function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtUptime(s) {
    const d = Math.floor(s / 86400);
    const h = String(Math.floor((s % 86400) / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    return d ? `${d}d ${h}:${m}` : `${h}:${m}`;
}

function tsToTime(usec) {
    return new Date(Number(usec) / 1000).toLocaleTimeString('en-NZ', {
        hour: '2-digit', minute: '2-digit', hour12: false
    });
}
