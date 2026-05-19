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
}
