function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// uses the day.js duration plugin (loaded + extended by the page) to render a
// human-friendly uptime, e.g. "5 days", "an hour".
function fmtUptime(s) {
    return dayjs.duration(s, 'seconds').humanize();
}

// a line reporting the service starting or stopping is picked out from the ordinary lines
function stateClass(msg) {
    const s = String(msg ?? '');
    if (/^(Started|Starting)\b/.test(s) || /\bDone \(/.test(s)) return 'log-green log-state';
    if (/^(Stopped|Stopping)\b/.test(s)
        || /\b(Deactivated successfully|Main process exited|Failed with result|Stopping server)\b/.test(s)) return 'log-red log-state';
    return '';
}

function tsToTime(usec) {
    return new Date(Number(usec) / 1000).toLocaleTimeString('en-NZ', {
        hour: '2-digit', minute: '2-digit', hour12: false
    });
}

// data is cleared if the api becomes unreachable, to prevent frozen data
let apiOnline = null;
function setApiOnline(online) {
    if (online === apiOnline) return;
    apiOnline = online;
    if (online) return;

    // the colour is a claim about health just as much as the number is, so a green
    // dash would still read as "fine" while the api is unreachable
    document.querySelectorAll('[data-vital], .vital-value, .stat-value').forEach(el => {
        el.textContent = '—';
        el.classList.remove('vital-green', 'vital-red');
    });
    document.querySelectorAll('.box-status').forEach(el => {
        el.textContent = '—';
        el.className = 'box-status unknown';
    });
    ['status-text', 'uptime', 'uptime-status', 'banner-uptime', 'banner-load'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '—';
    });

    // a filled usage bar is a claim about right now, same as the number above it
    document.querySelectorAll('.stat-bar').forEach(el => { el.style.width = '0%'; });
    document.querySelectorAll('.stat-sub').forEach(el => { el.textContent = '—'; });

    // a table full of green rows reads as live just as much as a number does
    document.querySelectorAll('.data-table tbody').forEach(body => {
        const cols = body.parentElement.querySelectorAll('th').length || 1;
        body.innerHTML = `<tr><td colspan="${cols}" class="muted">—</td></tr>`;
    });

    // the manifest banner claims everything is fine, so it can't be left saying that
    const banner = document.querySelector('.status-banner');
    if (banner) {
        banner.className = 'status-banner unknown';
        document.getElementById('banner-dot').className = 'banner-dot unknown';
        document.getElementById('banner-title').textContent = 'waiting for the api';
        document.getElementById('banner-sub').textContent = '—';
    }

    // the project pages keep a coloured running/stopped pill, which is a claim of its own
    const badge = document.getElementById('status-badge');
    if (badge) {
        badge.className = 'project-status-unknown';
        document.getElementById('status-dot').className = 'status-dot-unknown';
    }
}

// EventSource only retries on its own when the connection drops at the network level.
// while the api is down nginx answers with an error status instead, which the browser
// treats as fatal and never retries, so the reconnecting is done by hand here
function liveStream(url, onData) {
    let current = null, timer = null, wait = 2000, stopped = false;

    function open() {
        const es = new EventSource(url);
        current = es;

        es.onmessage = ev => {
            if (es !== current) return;
            wait = 2000;
            setApiOnline(true);
            try { onData(JSON.parse(ev.data)); } catch {}
        };

        es.onerror = () => {
            es.close();
            // a connection that has already been replaced must not queue a retry of
            // its own, or each failure doubles the number of attempts
            if (stopped || es !== current) return;
            current = null;
            setApiOnline(false);
            clearTimeout(timer);
            timer = setTimeout(open, wait);
            // back off so a long outage isn't hammered every two seconds
            wait = Math.min(wait * 2, 15000);
        };
    }

    open();
    return { close() { stopped = true; clearTimeout(timer); current?.close(); current = null; } };
}
