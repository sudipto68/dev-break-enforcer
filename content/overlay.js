// Guard against double injection via scripting.executeScript
if (window.__devBreakEnforcer) {
  // Script already running in this tab — just check state and show overlay if needed
  chrome.runtime.sendMessage({ action: 'GET_STATE' }, (res) => {
    if (!chrome.runtime.lastError && res?.state &&
        ['locked', 'break_timer', 'confirming'].includes(res.state.status)) {
      if (!document.getElementById('__dbe_overlay__')) injectOverlay();
    }
  });
} else {
  window.__devBreakEnforcer = true;
  init();
}

function init() {
  // Check state on page load — catches navigation and tab restores
  chrome.runtime.sendMessage({ action: 'GET_STATE' }, (res) => {
    if (chrome.runtime.lastError) return;
    if (res?.state && ['locked', 'break_timer', 'confirming'].includes(res.state.status)) {
      injectOverlay();
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'SHOW_OVERLAY') injectOverlay();
    if (msg.action === 'HIDE_OVERLAY') removeOverlay();
    if (msg.action === 'SHOW_WARNING') showWarningToast();
    if (msg.action === 'SHOW_CALL_DELAY') showCallDelayToast(msg.domain, msg.retryMinutes);
    if (msg.action === 'SYNC_STATE') {
      const iframe = document.querySelector('#__dbe_overlay__ iframe');
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(
          { action: 'SYNC_STATE', state: msg.state, settings: msg.settings },
          '*'
        );
      }
    }
  });
}

function injectOverlay() {
  if (document.getElementById('__dbe_overlay__')) return;

  // Pause any playing media so audio/video doesn't continue behind the overlay
  document.querySelectorAll('video, audio').forEach(media => {
    if (!media.paused) {
      media.pause();
      media.dataset.dbePaused = 'true';
    }
  });

  const overlayEl = document.createElement('div');
  overlayEl.id = '__dbe_overlay__';
  Object.assign(overlayEl.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    width: '100vw',
    height: '100vh',
    pointerEvents: 'all',
    margin: '0',
    padding: '0',
    border: 'none',
    background: 'transparent'
  });

  const iframe = document.createElement('iframe');
  iframe.src = chrome.runtime.getURL('overlay/overlay.html');
  Object.assign(iframe.style, {
    width: '100%',
    height: '100%',
    border: 'none',
    display: 'block'
  });
  iframe.setAttribute('allowtransparency', 'true');

  overlayEl.appendChild(iframe);
  document.documentElement.appendChild(overlayEl);
  document.body.style.overflow = 'hidden';
}

function removeOverlay() {
  const el = document.getElementById('__dbe_overlay__');
  if (!el) return;
  el.remove();
  document.body.style.overflow = '';

  // Resume any media we paused when the overlay appeared
  document.querySelectorAll('video[data-dbe-paused], audio[data-dbe-paused]').forEach(media => {
    delete media.dataset.dbePaused;
    media.play().catch(() => {});
  });
}

function showCallDelayToast(domain, retryMinutes) {
  if (document.getElementById('__dbe_call_delay__')) return;

  const toast = document.createElement('div');
  toast.id = '__dbe_call_delay__';
  Object.assign(toast.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: '2147483646',
    background: '#1a1f2e',
    border: '1px solid #58a6ff',
    borderRadius: '10px',
    padding: '14px 18px',
    color: '#e6edf3',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    fontSize: '13px',
    lineHeight: '1.4',
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    maxWidth: '300px',
    cursor: 'pointer',
    userSelect: 'none'
  });

  toast.innerHTML = `
    <span style="font-size:22px;flex-shrink:0">📹</span>
    <div>
      <div style="font-weight:600;color:#58a6ff;margin-bottom:3px">Break delayed</div>
      <div style="color:#8b949e;font-size:12px">
        Detected an active call on <span style="color:#c9d1d9;font-weight:500">${domain}</span>.
        Will retry in ${retryMinutes} min.
      </div>
    </div>
  `;

  toast.addEventListener('click', () => dismiss());
  document.documentElement.appendChild(toast);

  const timer = setTimeout(() => dismiss(), 10000);

  function dismiss() {
    clearTimeout(timer);
    toast.style.transition = 'opacity 0.3s ease';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }
}

function showWarningToast() {
  if (document.getElementById('__dbe_warning__')) return;

  const toast = document.createElement('div');
  toast.id = '__dbe_warning__';
  Object.assign(toast.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: '2147483646',
    background: '#1a1f2e',
    border: '1px solid #f0883e',
    borderRadius: '10px',
    padding: '14px 18px',
    color: '#e6edf3',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    fontSize: '13px',
    lineHeight: '1.4',
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    maxWidth: '280px',
    cursor: 'pointer',
    userSelect: 'none'
  });

  toast.innerHTML = `
    <span style="font-size:22px;flex-shrink:0">⏰</span>
    <div>
      <div style="font-weight:600;color:#f0883e;margin-bottom:3px">Break in 5 minutes</div>
      <div style="color:#8b949e;font-size:12px">Finish your thought — browser locks soon.</div>
    </div>
  `;

  toast.addEventListener('click', () => dismiss());
  document.documentElement.appendChild(toast);

  const timer = setTimeout(() => dismiss(), 8000);

  function dismiss() {
    clearTimeout(timer);
    toast.style.transition = 'opacity 0.3s ease';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }
}
