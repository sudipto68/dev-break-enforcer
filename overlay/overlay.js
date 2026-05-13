const CIRCUMFERENCE = 2 * Math.PI * 52; // r=52

// True when overlay.html is a real tab (redirected new tab), not an iframe inside a page
const isStandaloneTab = new URLSearchParams(location.search).get('mode') === 'tab';

let timerInterval = null;
let checkedTasks  = new Set();

// ── Init ──────────────────────────────────────────────────────────────────────

chrome.runtime.sendMessage({ action: 'GET_STATE' }, (res) => {
  if (chrome.runtime.lastError || !res) return;
  const { state, settings } = res;
  updateSnoozeButton(state, settings);
  transitionToPhase(state, settings);
});

// When the SW broadcasts unlock, navigate standalone tabs away
if (isStandaloneTab) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'UNLOCKED') {
      window.close();
    }
  });
}

// ── Phase management ──────────────────────────────────────────────────────────

function transitionToPhase(state, settings) {
  switch (state.status) {
    case 'locked':
      showPhase('locked');
      break;
    case 'break_timer': {
      showPhase('timer');
      const elapsed  = Math.floor((Date.now() - state.breakStartedAt) / 1000);
      const duration = (settings?.breakDuration ?? 1) * 60;
      const remaining = Math.max(0, duration - elapsed);
      if (remaining <= 0) {
        finishTimer();
      } else {
        startCountdown(remaining, duration);
      }
      break;
    }
    case 'confirming':
      showPhase('confirm');
      break;
  }
}

function showPhase(name) {
  document.querySelectorAll('.phase').forEach(el => el.classList.remove('active'));
  document.getElementById(`phase-${name}`).classList.add('active');
}

// ── Countdown ─────────────────────────────────────────────────────────────────

function startCountdown(remaining, total) {
  const display = document.getElementById('countdown-display');
  const ring    = document.getElementById('progress-ring');
  ring.style.strokeDasharray = CIRCUMFERENCE;

  function tick() {
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    display.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
    ring.style.strokeDashoffset = CIRCUMFERENCE * (1 - remaining / total);

    if (remaining <= 0) {
      clearInterval(timerInterval);
      finishTimer();
    } else {
      remaining--;
    }
  }

  tick();
  timerInterval = setInterval(tick, 1000);
}

function finishTimer() {
  chrome.runtime.sendMessage({ action: 'CONFIRM_BREAK' }, () => {});
  // Transition locally to confirming while SW processes
  showPhase('confirm');
  document.getElementById('status-label').textContent = 'Confirm you completed both tasks';
}

// ── Button handlers ───────────────────────────────────────────────────────────

document.getElementById('btn-start').addEventListener('click', async () => {
  const res = await sendMessage({ action: 'GET_STATE' });
  const duration = (res?.settings?.breakDuration ?? 1) * 60;
  await sendMessage({ action: 'START_BREAK_TIMER' });
  showPhase('timer');
  startCountdown(duration, duration);
  document.getElementById('status-label').textContent = 'Break timer running…';
});

document.getElementById('btn-snooze').addEventListener('click', async () => {
  const res = await sendMessage({ action: 'SNOOZE' });
  if (res?.ok === false) {
    const btn = document.getElementById('btn-snooze');
    btn.textContent = 'No snoozes remaining';
    btn.disabled = true;
  }
  // Overlay will be removed by content script when SW broadcasts HIDE_OVERLAY
});

document.getElementById('btn-unlock').addEventListener('click', async () => {
  if (checkedTasks.size < 2) return;
  await sendMessage({ action: 'CONFIRM_BREAK' });
});

// Task checkboxes
document.querySelectorAll('#confirm-tasks .task-item').forEach(item => {
  item.addEventListener('click', () => {
    const task = item.dataset.task;
    if (checkedTasks.has(task)) {
      checkedTasks.delete(task);
      item.classList.remove('checked');
    } else {
      checkedTasks.add(task);
      item.classList.add('checked');
    }
    document.getElementById('btn-unlock').disabled = checkedTasks.size < 2;
  });
});

// ── Snooze button label ───────────────────────────────────────────────────────

function updateSnoozeButton(state, settings) {
  const btn = document.getElementById('btn-snooze');
  const remaining = (settings?.snoozeLimit ?? 1) - (state?.snoozeUsed ?? 0);
  if (remaining <= 0) {
    btn.classList.add('hidden');
  } else {
    btn.textContent = `Snooze ${settings?.snoozeDuration ?? 10} min (${remaining} remaining)`;
  }
}

// ── Util ──────────────────────────────────────────────────────────────────────

function sendMessage(msg) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(msg, res => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(res);
    });
  });
}
