function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// uses the day.js duration plugin (loaded + extended by the page) to render a
// human-friendly uptime, e.g. "5 days", "an hour".
function fmtUptime(s) {
    return dayjs.duration(s, 'seconds').humanize();
}

function tsToTime(usec) {
    return new Date(Number(usec) / 1000).toLocaleTimeString('en-NZ', {
        hour: '2-digit', minute: '2-digit', hour12: false
    });
}
