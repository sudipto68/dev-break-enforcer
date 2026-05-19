const DEFAULT_DOMAINS = [
  'meet.google.com', 'zoom.us', 'teams.microsoft.com', 'whereby.com', 'webex.com'
];

let currentDomains = [];

(async () => {
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings) return;
  applyToUI(settings);
})();

function applyToUI(settings) {
  setSlider('work-interval',   'work-interval-val',   settings.workInterval,   'min');
  setSlider('break-duration',  'break-duration-val',  settings.breakDuration,  'min');
  setSlider('snooze-limit',    'snooze-limit-val',    settings.snoozeLimit,    '');
  setSlider('snooze-duration', 'snooze-duration-val', settings.snoozeDuration, 'min');
  document.getElementById('warning-enabled').checked = settings.warningEnabled;
  currentDomains = [...(settings.videoDomains ?? DEFAULT_DOMAINS)];
  renderDomains();
}

function setSlider(id, valId, value, unit) {
  const el  = document.getElementById(id);
  const val = document.getElementById(valId);
  el.value = value;
  val.textContent = formatVal(value, unit);
  el.addEventListener('input', () => {
    val.textContent = formatVal(el.value, unit);
  });
}

function formatVal(value, unit) {
  if (!unit) return value;
  return `${value} ${unit}${value == 1 ? '' : 's'}`;
}

function renderDomains() {
  const list = document.getElementById('domain-list');
  list.innerHTML = '';
  for (const domain of currentDomains) {
    const tag = document.createElement('div');
    tag.className = 'domain-tag';
    tag.innerHTML = `<span class="domain-name">${domain}</span><button class="domain-remove" title="Remove">✕</button>`;
    tag.querySelector('button').addEventListener('click', () => {
      currentDomains = currentDomains.filter(d => d !== domain);
      renderDomains();
    });
    list.appendChild(tag);
  }
}

document.getElementById('btn-add-domain').addEventListener('click', () => {
  const input = document.getElementById('new-domain');
  const val = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (val && !currentDomains.includes(val)) {
    currentDomains.push(val);
    renderDomains();
  }
  input.value = '';
});

document.getElementById('new-domain').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-add-domain').click();
});

document.getElementById('btn-save').addEventListener('click', async () => {
  const settings = {
    workInterval:   parseInt(document.getElementById('work-interval').value),
    breakDuration:  parseInt(document.getElementById('break-duration').value),
    snoozeLimit:    parseInt(document.getElementById('snooze-limit').value),
    snoozeDuration: parseInt(document.getElementById('snooze-duration').value),
    warningEnabled: document.getElementById('warning-enabled').checked,
    videoDomains:   currentDomains
  };

  await chrome.storage.local.set({ settings });

  // Directly reschedule alarms — don't rely on SW message passing
  await chrome.alarms.clearAll();
  await chrome.alarms.create('break', { delayInMinutes: settings.workInterval });
  if (settings.warningEnabled && settings.workInterval > 5) {
    await chrome.alarms.create('warning', { delayInMinutes: settings.workInterval - 5 });
  }

  const banner = document.getElementById('save-banner');
  banner.hidden = false;
  setTimeout(() => banner.hidden = true, 2500);
});

document.getElementById('btn-reset-history').addEventListener('click', async () => {
  if (!confirm('Reset all break history and streak? This cannot be undone.')) return;
  await chrome.storage.local.set({ history: [] });
  const banner = document.getElementById('save-banner');
  banner.textContent = 'History cleared.';
  banner.hidden = false;
  setTimeout(() => { banner.hidden = true; banner.textContent = 'Settings saved.'; }, 2500);
});
