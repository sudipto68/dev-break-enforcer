const LOCKED_STATUSES = ['locked', 'break_timer', 'confirming'];
let timerInterval = null;

(async () => {
  const [{ state, settings }, statsRes] = await Promise.all([
    sendMessage({ action: 'GET_STATE' }),
    sendMessage({ action: 'GET_STATS' })
  ]);

  const badge = document.getElementById('status-badge');

  if (state.paused) {
    badge.className = 'badge paused';
    badge.textContent = 'paused';
    showView('view-paused');
    return;
  }

  if (LOCKED_STATUSES.includes(state.status)) {
    badge.className = 'badge locked';
    badge.textContent = 'locked';
    showView('view-locked');
    return;
  }

  if (state.status === 'delayed') {
    badge.className = 'badge delayed';
    badge.textContent = 'call detected';
  }

  showView('view-working');
  renderStats(statsRes);
  if (state.nextBreakAt) startCountdown(state.nextBreakAt);
})();

function renderStats({ today, streak }) {
  document.getElementById('stat-completed').textContent = today?.completed ?? 0;
  document.getElementById('stat-snoozed').textContent   = today?.snoozed   ?? 0;
  const s = streak ?? 0;
  document.getElementById('stat-streak').textContent = s > 0 ? `🔥${s}` : s;
}

function startCountdown(nextBreakAt) {
  const display = document.getElementById('next-timer');
  function tick() {
    const diff = Math.max(0, nextBreakAt - Date.now());
    const total = Math.floor(diff / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    display.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  tick();
  timerInterval = setInterval(tick, 1000);
}

document.getElementById('btn-pause').addEventListener('click', async () => {
  await sendMessage({ action: 'PAUSE' });
  window.close();
});

document.getElementById('btn-resume')?.addEventListener('click', async () => {
  await sendMessage({ action: 'RESUME' });
  window.close();
});

function showView(id) {
  document.querySelectorAll('.view').forEach(el => el.hidden = true);
  document.getElementById(id).hidden = false;
}

function sendMessage(msg) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(msg, res => {
      if (chrome.runtime.lastError) resolve({});
      else resolve(res ?? {});
    });
  });
}
