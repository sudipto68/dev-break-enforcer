let timerInterval = null;

(async () => {
  const [stateRes, statsRes] = await Promise.all([
    sendMessage({ action: 'GET_STATE' }),
    sendMessage({ action: 'GET_STATS' })
  ]);

  const state    = stateRes?.state;
  const settings = stateRes?.settings;
  const badge    = document.getElementById('status-badge');
  const timer    = document.getElementById('next-timer');
  const fill     = document.getElementById('timer-progress');
  const btn      = document.getElementById('btn-toggle-pause');

  renderStats(statsRes);

  if (['locked', 'break_timer', 'confirming'].includes(state?.status)) {
    badge.className  = 'badge locked';
    badge.textContent = 'Locked';
    timer.textContent = 'On break';
    timer.classList.add('dimmed');
    fill.style.width  = '0%';
    btn.hidden = true;
    return;
  }

  if (state?.paused) {
    badge.className   = 'badge paused';
    badge.textContent = 'Paused';
    timer.textContent = 'Paused';
    timer.classList.add('dimmed');
    fill.style.width  = '0%';
    btn.textContent   = 'Resume session';
    btn.classList.add('btn-ghost-green');
    return;
  }

  if (state?.status === 'delayed') {
    badge.className   = 'badge delayed';
    badge.textContent = 'Call detected';
    timer.textContent = 'Call in progress';
    timer.classList.add('dimmed');
    fill.style.width  = '0%';

    const note = document.createElement('p');
    note.className = 'delay-note';
    note.textContent = 'Break paused — active video call detected. Will retry automatically.';
    timer.closest('.timer-card').appendChild(note);
  }

  if (state?.nextBreakAt) {
    const totalMs = (settings?.workInterval ?? 60) * 60 * 1000;
    startCountdown(state.nextBreakAt, totalMs);
  }
})();

function renderStats({ today, streak } = {}) {
  document.getElementById('stat-completed').textContent = today?.completed ?? 0;
  document.getElementById('stat-snoozed').textContent   = today?.snoozed   ?? 0;
  const s = streak ?? 0;
  document.getElementById('stat-streak').textContent    = s > 0 ? `🔥 ${s}` : s;
}

function startCountdown(nextBreakAt, totalMs) {
  const display = document.getElementById('next-timer');
  const fill    = document.getElementById('timer-progress');

  function tick() {
    const diff      = Math.max(0, nextBreakAt - Date.now());
    const totalSecs = Math.floor(diff / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    display.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    fill.style.width = `${Math.min(100, (diff / totalMs) * 100)}%`;
  }

  tick();
  timerInterval = setInterval(tick, 1000);
}

document.getElementById('btn-toggle-pause').addEventListener('click', async () => {
  const { state } = await sendMessage({ action: 'GET_STATE' });
  await sendMessage({ action: state?.paused ? 'RESUME' : 'PAUSE' });
  window.close();
});

function sendMessage(msg) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(msg, res => {
      if (chrome.runtime.lastError) resolve({});
      else resolve(res ?? {});
    });
  });
}
