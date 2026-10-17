/* ============================================================
   RISE AXIS — PWA BOOTSTRAP
   Registers SW, tracks sessions, shows install/update UI.
   ============================================================ */

(function () {
  'use strict';

  const INSTALL_BTN_ID = 'pwaInstallBtn';
  const SIDEBAR_FOOTER_SELECTOR = '.admin-sidebar-footer';

  // ---------- Environment detection
  function isStandalone() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      window.navigator.standalone === true
    );
  }
  function isIOS() {
    return /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
  }
  function isIOSSafari() {
    if (!isIOS()) return false;
    const ua = window.navigator.userAgent.toLowerCase();
    return /safari/.test(ua) && !/crios|fxios|edgios/.test(ua);
  }

  // ---------- Online / offline banner
  function ensureOfflineBanner() {
    if (document.getElementById('pwaOfflineBanner')) return;
    const banner = document.createElement('div');
    banner.id = 'pwaOfflineBanner';
    banner.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0;
      background: #C81E27; color: #fff;
      padding: 10px 16px;
      text-align: center;
      font-size: 0.85rem; font-weight: 700;
      z-index: 10000;
      display: none;
      align-items: center; justify-content: center; gap: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    `;
    banner.innerHTML = '<i class="fas fa-wifi" style="opacity:0.5;"></i> You are offline — changes will not save.';
    document.body.appendChild(banner);
  }

  function updateOfflineBanner() {
    const banner = document.getElementById('pwaOfflineBanner');
    if (!banner) return;
    banner.style.display = navigator.onLine ? 'none' : 'flex';
  }

  window.addEventListener('online', updateOfflineBanner);
  window.addEventListener('offline', updateOfflineBanner);

  // ---------- Update available banner
  function showUpdateBanner() {
    if (document.getElementById('pwaUpdateBanner')) return;
    const banner = document.createElement('div');
    banner.id = 'pwaUpdateBanner';
    banner.style.cssText = `
      position: fixed; bottom: 16px; left: 16px; right: 16px;
      max-width: 420px;
      background: #1D3B73; color: #fff;
      border-radius: 14px;
      padding: 14px 18px;
      display: flex; align-items: center; gap: 14px;
      box-shadow: 0 12px 30px rgba(29,59,115,0.4);
      z-index: 10001;
      animation: pwaSlideUp 0.3s ease;
    `;
    banner.innerHTML = `
      <i class="fas fa-sync-alt" style="font-size:1.2rem;color:#17B052;"></i>
      <div style="flex:1;">
        <div style="font-weight:800;font-size:0.88rem;margin-bottom:2px;">Update available</div>
        <div style="font-size:0.78rem;opacity:0.85;">Refresh to load the latest version.</div>
      </div>
      <button id="pwaUpdateBtn" style="
        background:#17B052;color:#fff;border:none;
        padding:8px 16px;border-radius:10px;
        font-weight:800;font-size:0.82rem;cursor:pointer;
      ">Refresh</button>
      <button id="pwaUpdateDismiss" style="
        background:transparent;color:#fff;border:none;
        font-size:1rem;cursor:pointer;padding:4px 8px;opacity:0.6;
      "><i class="fas fa-times"></i></button>
      <style>
        @keyframes pwaSlideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      </style>
    `;
    document.body.appendChild(banner);

    banner.querySelector('#pwaUpdateBtn').addEventListener('click', () => {
      window.location.reload();
    });
    banner.querySelector('#pwaUpdateDismiss').addEventListener('click', () => {
      banner.remove();
    });
  }

  // ---------- Service worker registration + update detection
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('sw.js', { scope: './' })
      .then((registration) => {
        console.log('[pwa] Service worker registered:', registration.scope);

        // Poll for updates every 60s while the tab is open
        setInterval(() => {
          registration.update().catch(() => {});
        }, 60_000);

        // Detect waiting worker → show "Update available"
        if (registration.waiting) {
          showUpdateBanner();
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version installed and waiting
              showUpdateBanner();
            }
          });
        });
      })
      .catch((err) => {
        console.warn('[pwa] SW registration failed:', err);
      });
  }

  // ---------- Session tracking
  // Writes a row into user_sessions on app open. Updates last_seen_at.
  async function trackSession() {
    if (!window.supabaseClient) return;
    const sb = window.supabaseClient;

    try {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;

      // Use a per-device token in localStorage so we update the same row
      let deviceToken = localStorage.getItem('rax_device_token');
      if (!deviceToken) {
        deviceToken = crypto.randomUUID();
        localStorage.setItem('rax_device_token', deviceToken);
      }

      const ua = navigator.userAgent;
      const deviceLabel = (() => {
        if (/android/i.test(ua)) return 'Android ' + (isStandalone() ? '(app)' : '(browser)');
        if (/iphone|ipad/i.test(ua)) return 'iOS ' + (isStandalone() ? '(app)' : '(browser)');
        if (/windows/i.test(ua)) return 'Windows desktop';
        if (/macintosh|mac os x/i.test(ua)) return 'Mac desktop';
        return 'Unknown device';
      })();

      // Check if this device already has a session row
      const { data: existing } = await sb
        .from('user_sessions')
        .select('id')
        .eq('user_id', user.id)
        .eq('user_agent', ua)
        .is('revoked_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        await sb.from('user_sessions')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        await sb.from('user_sessions').insert({
          user_id: user.id,
          device_label: deviceLabel,
          user_agent: ua
        });
      }
    } catch (err) {
      console.warn('[pwa] Session tracking failed:', err);
    }
  }

  // ---------- Install button
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallButton();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideInstallButton();
  });

  function ensureInstallButton() {
    const footer = document.querySelector(SIDEBAR_FOOTER_SELECTOR);
    if (!footer) return null;
    let btn = document.getElementById(INSTALL_BTN_ID);
    if (btn) return btn;

    btn = document.createElement('button');
    btn.id = INSTALL_BTN_ID;
    btn.type = 'button';
    btn.innerHTML = '<i class="fas fa-mobile-alt"></i> Install App';
    btn.style.cssText = `
      display: none; align-items: center; justify-content: center; gap: 8px;
      width: 100%; padding: 10px 14px; border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.18);
      background: linear-gradient(135deg, #17B052, #0d7a38);
      color: #fff; font-weight: 700; font-size: 0.82rem;
      cursor: pointer; transition: all 0.2s; margin-bottom: 4px;
      font-family: inherit;
    `;
    btn.addEventListener('click', handleInstallClick);
    footer.insertBefore(btn, footer.firstChild);
    return btn;
  }

  function showInstallButton() {
    if (isStandalone()) return;
    const btn = ensureInstallButton();
    if (!btn) return;
    if (isIOSSafari() || deferredPrompt) btn.style.display = 'flex';
  }

  function hideInstallButton() {
    const btn = document.getElementById(INSTALL_BTN_ID);
    if (btn) btn.style.display = 'none';
  }

  async function handleInstallClick() {
    if (isStandalone()) { hideInstallButton(); return; }
    if (isIOSSafari()) { showIOSHint(); return; }
    if (!deferredPrompt) { showFallbackHint(); return; }
    try {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') { deferredPrompt = null; hideInstallButton(); }
    } catch (err) {
      console.warn('[pwa] Install prompt failed:', err);
    }
  }

  function showIOSHint() {
    if (document.getElementById('pwaIOSHint')) return;
    const overlay = document.createElement('div');
    overlay.id = 'pwaIOSHint';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,41,0.7);backdrop-filter:blur(6px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:20px;max-width:420px;width:100%;padding:32px 28px;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,0.4);">
        <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#1D3B73,#0f2557);color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.6rem;margin:0 auto 18px;">
          <i class="fas fa-mobile-alt"></i>
        </div>
        <h3 style="font-size:1.3rem;font-weight:900;color:#1D3B73;margin-bottom:10px;">Install Rise Axis Admin</h3>
        <p style="color:#4a5568;font-size:0.92rem;line-height:1.7;margin-bottom:22px;">
          Tap <strong>Share</strong> at the bottom of Safari, then choose <strong>Add to Home Screen</strong>.
        </p>
        <button onclick="document.getElementById('pwaIOSHint').remove()" style="width:100%;padding:14px;background:linear-gradient(135deg,#1D3B73,#0f2557);color:#fff;border:none;border-radius:12px;font-weight:800;font-size:0.92rem;cursor:pointer;">
          Got it
        </button>
      </div>
    `;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  function showFallbackHint() {
    const t = document.getElementById('toastMessage');
    if (!t) return;
    const textEl = document.getElementById('toastText');
    const iconEl = document.getElementById('toastIcon');
    if (textEl) textEl.textContent = 'Use your browser menu → "Install App"';
    if (iconEl) iconEl.className = 'fas fa-info-circle';
    t.classList.remove('error');
    t.classList.add('show');
    clearTimeout(window.__pwaToastTimer);
    window.__pwaToastTimer = setTimeout(() => t.classList.remove('show'), 4000);
  }

  // ---------- Boot
  function boot() {
    ensureOfflineBanner();
    updateOfflineBanner();
    registerSW();

    // After the sidebar loads and Supabase client is available, track session
    const track = () => {
      if (window.supabaseClient) {
        trackSession();
      } else {
        setTimeout(track, 500);
      }
    };
    track();

    // Show install button on iOS as a hint
    if (isIOSSafari() && !isStandalone()) {
      setTimeout(showInstallButton, 500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.addEventListener('load', () => {
    setTimeout(() => {
      if (deferredPrompt && !isStandalone()) showInstallButton();
    }, 800);
  });

})();
