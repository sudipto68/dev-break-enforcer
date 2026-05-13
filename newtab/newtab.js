const LOCKED_STATUSES = ['locked', 'break_timer', 'confirming'];
let countdownInterval = null;

(async () => {
  const { state, settings } = await sendMessage({ action: 'GET_STATE' });
  const { today, streak }   = await sendMessage({ action: 'GET_STATS' });

  if (LOCKED_STATUSES.includes(state?.status)) {
    show('view-locked');
    return;
  }

  show('view-dashboard');
  renderStats(today, streak);
  renderPauseButton(state);

  if (!state.paused && state.nextBreakAt) {
    startNextBreakCountdown(state.nextBreakAt);
  } else {
    document.getElementById('next-break-timer').textContent = 'Paused';
    document.querySelector('.next-break-card').classList.add('paused');
  }
})();

function renderStats(today, streak) {
  document.getElementById('stat-completed').textContent = today.completed;
  document.getElementById('stat-snoozed').textContent   = today.snoozed;
  document.getElementById('stat-streak').textContent    = streak > 0 ? `🔥 ${streak}` : streak;
}

function renderPauseButton(state) {
  const btn = document.getElementById('btn-pause');
  if (state.paused) {
    btn.textContent = 'Resume session';
    btn.classList.add('active');
  }
}

function startNextBreakCountdown(nextBreakAt) {
  const display = document.getElementById('next-break-timer');
  const sub     = document.getElementById('next-break-sub');

  function tick() {
    const diff = Math.max(0, nextBreakAt - Date.now());
    const totalSecs = Math.floor(diff / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    display.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    sub.textContent = diff === 0 ? 'Break starting…' : 'until next break';
  }

  tick();
  countdownInterval = setInterval(tick, 1000);
}

document.getElementById('btn-pause').addEventListener('click', async () => {
  const { state } = await sendMessage({ action: 'GET_STATE' });
  if (state.paused) {
    await sendMessage({ action: 'RESUME' });
    location.reload();
  } else {
    await sendMessage({ action: 'PAUSE' });
    clearInterval(countdownInterval);
    const display = document.getElementById('next-break-timer');
    display.textContent = 'Paused';
    document.querySelector('.next-break-card').classList.add('paused');
    document.getElementById('btn-pause').textContent = 'Resume session';
    document.getElementById('btn-pause').classList.add('active');
    document.getElementById('next-break-sub').textContent = '';
  }
});

function show(id) {
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
