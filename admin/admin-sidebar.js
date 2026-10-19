/* ============================================================
   RISE AXIS SOLUTIONS — SHARED ADMIN SIDEBAR + AUTH HELPERS
   Used by: orders.html, invoices.html, invoice-edit.html,
            invoice-view.html, invoice-print.html,
            products.html, reports.html, analytics.html,
            settings.html, posts.html
   ============================================================
   Provides:
     - window.adminSidebarReady  : Promise resolving to {user, profile, role}
     - window.adminAuthCheck(roles) : Promise<bool>, redirects on failure
     - window.adminGetProfile() : { user, profile, role } (cached)
     - auto-renders sidebar + mobile bar + overlay + logout wiring
   ============================================================ */

(function () {
  'use strict';

  // ---------- Config
  const SUPABASE_URL = 'https://feurddyhflvnomakexxs.supabase.co'.trim();
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZldXJkZHloZmx2bm9tYWtleHhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2MTY5MTQsImV4cCI6MjEwNjE5MjkxNH0.1lA2I8KGwOJx309MbH5zU0HHGSZjzrv795FMqyubwi4'.trim();

  // ---------- Reuse existing supabase client if present, else create
  let sb = window.supabaseClient;
  if (!sb) {
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      console.error('[admin-sidebar] Supabase SDK not loaded. Add <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> before this file.');
      return;
    }
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.supabaseClient = sb;
  }

  // ---------- Sidebar nav definition
  // Each item: { section, label, icon, href, roles }
   const NAV_ITEMS = [
    { section: 'Operations', label: 'Orders',   icon: 'fa-boxes-packing', href: 'orders.html',   roles: ['admin','sales'] },
    { section: 'Operations', label: 'Invoices', icon: 'fa-file-invoice',  href: 'invoices.html', roles: ['admin','sales'] },
    { section: 'Operations', label: 'Products', icon: 'fa-box',           href: 'products.html', roles: ['admin','sales'] },
    { section: 'Content',    label: 'Blog',     icon: 'fa-newspaper',     href: 'posts.html',    roles: ['admin'] },
    { section: 'Insights',   label: 'Reports',  icon: 'fa-chart-line',    href: 'reports.html',  roles: ['admin','sales'] },
    { section: 'Insights',   label: 'Manage Users',icon: 'fa-users-cog',     href: 'users.html',    roles: ['admin'] },
    { section: 'Insights',   label: 'Analytics',icon: 'fa-bolt',          href: 'analytics.html',roles: ['admin'] },
    { section: 'Insights',   label: 'Audit',    icon: 'fa-history',       href: 'audit.html',    roles: ['admin'] },
    { section: 'System',     label: 'Settings', icon: 'fa-cog',           href: 'settings.html', roles: ['admin'] }
  ];

  // ---------- Which page am I on?
  function currentPage() {
    const path = window.location.pathname || '';
    const file = path.substring(path.lastIndexOf('/') + 1) || 'orders.html';
    return file.toLowerCase();
  }

  // ---------- Build the sidebar HTML
  function buildSidebarHTML(role) {
    const page = currentPage();
    const allowed = NAV_ITEMS.filter(i => i.roles.includes(role));
    // Group by section, preserving order
    const sections = [];
    const seenSections = {};
    allowed.forEach(item => {
      if (!seenSections[item.section]) {
        seenSections[item.section] = [];
        sections.push(item.section);
      }
      seenSections[item.section].push(item);
    });

    let navHtml = '';
    sections.forEach(sectionName => {
      navHtml += `<div class="nav-section">${sectionName}</div>`;
      seenSections[sectionName].forEach(item => {
        const active = page === item.href.toLowerCase() ? 'active' : '';
        navHtml += `
          <a href="${item.href}" class="${active}">
            <i class="fas ${item.icon}"></i> ${item.label}
          </a>`;
      });
    });

    return `
      <div class="admin-sidebar-brand">
        <div class="logo-mark"><span class="rise">RISE</span><span class="axis">AXIS</span></div>
        <small>Admin Panel</small>
      </div>
      <nav class="admin-sidebar-nav" style="overflow-y: auto; flex: 1;">
        ${navHtml}
      </nav>
      <div class="admin-sidebar-footer">
        <div class="user-chip">
          <i id="userInitials">··</i>
          <span id="userEmail">Loading...</span>
        </div>
        <button class="btn-logout" onclick="adminLogout()">
          <i class="fas fa-sign-out-alt"></i> Logout
        </button>
      </div>`;
  }

  function buildMobileBarHTML() {
    return `
      <div class="brand-mini"><span class="rise">RISE</span><span class="axis">AXIS</span></div>
      <button class="admin-mobile-toggle" onclick="adminToggleSidebar()" aria-label="Open menu">
        <i class="fas fa-bars"></i>
      </button>`;
  }

  // ---------- Inject the shell into the DOM
  function injectShell(role) {
    const body = document.body;

    // Mobile bar
    let mobileBar = document.getElementById('adminMobileBar');
    if (!mobileBar) {
      mobileBar = document.createElement('div');
      mobileBar.id = 'adminMobileBar';
      mobileBar.className = 'admin-mobile-bar';
      mobileBar.innerHTML = buildMobileBarHTML();
      body.insertBefore(mobileBar, body.firstChild);
    } else {
      mobileBar.innerHTML = buildMobileBarHTML();
    }

    // Sidebar
    let sidebar = document.getElementById('adminSidebar');
    if (!sidebar) {
      sidebar = document.createElement('aside');
      sidebar.id = 'adminSidebar';
      sidebar.className = 'admin-sidebar';
      
      // Inject scrollbar styles dynamically
      sidebar.style.display = 'flex';
      sidebar.style.flexDirection = 'column';
      sidebar.style.height = '100vh';
      sidebar.style.overflowY = 'auto';

      // Custom scrollbar styling
      const style = document.createElement('style');
      style.innerHTML = `
        #adminSidebar::-webkit-scrollbar { width: 6px; }
        #adminSidebar::-webkit-scrollbar-track { background: transparent; }
        #adminSidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 10px; }
        #adminSidebar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.4); }
      `;
      document.head.appendChild(style);

      body.insertBefore(sidebar, mobileBar.nextSibling);
    }
    sidebar.innerHTML = buildSidebarHTML(role);

    // Overlay
    let overlay = document.getElementById('sidebarOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'sidebarOverlay';
      overlay.className = 'admin-sidebar-overlay';
      overlay.addEventListener('click', adminCloseSidebar);
      sidebar.parentNode.insertBefore(overlay, sidebar.nextSibling);
    }

    // Wrap existing main in .admin-shell if not already wrapped
    const existingMain = document.getElementById('adminMain');
    if (existingMain && !existingMain.closest('.admin-shell')) {
      const shell = document.createElement('div');
      shell.className = 'admin-shell';
      existingMain.parentNode.insertBefore(shell, existingMain);
      shell.appendChild(existingMain);
    }

    // Fill user chip
    const profile = currentProfile;
    if (profile) {
      const initialsEl = document.getElementById('userInitials');
      const emailEl = document.getElementById('userEmail');
      const p = profile.profile || {};
      const u = profile.user || {};
      const initials = ((p.first_name || u.email || 'A')[0] + (p.last_name || '')[0]).toUpperCase();
      if (initialsEl) initialsEl.textContent = initials || '··';
      if (emailEl) emailEl.textContent = u.email || '—';
    }
  }

  // ---------- Sidebar toggle (mobile)
  window.adminToggleSidebar = function () {
    const sidebar = document.getElementById('adminSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('open');
  };

  window.adminCloseSidebar = function () {
    const sidebar = document.getElementById('adminSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
  };

    // ---------- Logout
  window.adminLogout = async function () {
    try { await sb.auth.signOut(); } catch (e) { /* ignore */ }

    // Detect if we're running as an installed PWA (standalone)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      window.navigator.standalone === true;

    // If running as an installed app, stay inside the app — go to login card.
    // If running in a regular browser, go to the shop homepage.
    window.location.replace(isStandalone ? 'login.html' : '../index.html');
  };

  // ---------- Toast (shared, used by redirects)
  function showToast(msg, type) {
    // Reuse the page's toast if it exists
    const toastEl = document.getElementById('toastMessage');
    if (!toastEl) return;
    const iconEl = document.getElementById('toastIcon');
    const textEl = document.getElementById('toastText');
    if (textEl) textEl.textContent = msg;
    if (iconEl) {
      iconEl.className = type === 'error'
        ? 'fas fa-exclamation-circle'
        : 'fas fa-check-circle';
    }
    toastEl.classList.toggle('error', type === 'error');
    toastEl.classList.add('show');
    clearTimeout(window.__adminToastTimer);
    window.__adminToastTimer = setTimeout(() => toastEl.classList.remove('show'), 3000);
  }
  window.adminShowToast = showToast;

  // ---------- Cache for profile
  let currentProfile = null;

  // ---------- Core: load user + profile
  async function loadProfile() {
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return { user: null, profile: null, role: null };

      const { data: profile } = await sb
        .from('profiles')
        .select('role, first_name, last_name, email')
        .eq('id', user.id)
        .single();

      if (!profile) return { user, profile: null, role: null };
      return { user, profile, role: profile.role || 'customer' };
    } catch (err) {
      console.error('[admin-sidebar] loadProfile failed:', err);
      return { user: null, profile: null, role: null };
    }
  }

  // ---------- Auth check + redirect
  // Usage: const ok = await adminAuthCheck(['admin','sales']); if (!ok) return;
  window.adminAuthCheck = async function (allowedRoles) {
    if (!currentProfile) currentProfile = await loadProfile();
    const { user, profile, role } = currentProfile;

    const page = currentPage();

    if (!user) {
      showToast('Please sign in to continue.', 'error');
      setTimeout(() => {
        window.location.href = '../pages/login.html';
      }, 800);
      return false;
    }

    if (!profile) {
      showToast('Your profile could not be loaded.', 'error');
      setTimeout(() => {
        window.location.href = '../index.html';
      }, 800);
      return false;
    }

    if (allowedRoles && !allowedRoles.includes(role)) {
      // Silent redirect to orders (or appropriate fallback)
      showToast('You do not have access to that page.', 'error');
      const fallback = ['admin','sales'].includes(role) ? 'orders.html' : '../index.html';
      setTimeout(() => {
        window.location.href = fallback;
      }, 900);
      return false;
    }

    return true;
  };

  // ---------- Expose cached profile
  window.adminGetProfile = function () {
    return currentProfile || { user: null, profile: null, role: null };
  };

  // ---------- Auto-inject as soon as the DOM is ready
  function boot() {
    // Wait for DOM
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
      return;
    }

    // Ensure we have a main element — every admin page has <main id="adminMain">
    const mainEl = document.getElementById('adminMain');
    if (!mainEl) {
      console.warn('[admin-sidebar] No #adminMain element found — pages should wrap their content in <main id="adminMain">.');
    }

    // Load profile then inject sidebar once we know the role
    loadProfile().then(profileInfo => {
      currentProfile = profileInfo;
      // Only inject if we have a role. If not authenticated, skip — the page's
      // own auth guard will redirect.
      const role = profileInfo.role;
      if (role && ['admin','sales'].includes(role)) {
        injectShell(role);
      } else {
        // Still inject an empty sidebar so styling is consistent
        injectShell(role || 'admin');
      }
      // Resolve the ready promise
      window.adminSidebarReady = Promise.resolve(profileInfo);
    });

    // Escape key closes mobile sidebar
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        window.adminCloseSidebar();
      }
    });

    // Redraw sidebar when navigating? Not needed — full page loads.
  }

  // Promise that resolves when sidebar is ready
  window.adminSidebarReady = new Promise(resolve => {
    window.__adminSidebarResolve = resolve;
  });

  // Patch loadProfile to resolve the ready promise
  const originalBoot = boot;

  boot();
    // ---------- Session expiry detection
  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      // Only redirect if we were on an admin page (avoid double redirect from login.html)
      const path = window.location.pathname;
      if (path.includes('/admin/') && !path.endsWith('/login.html')) {
        const isStandalone =
          window.matchMedia('(display-mode: standalone)').matches ||
          window.navigator.standalone === true;
        window.location.replace(isStandalone ? 'login.html' : '../pages/login.html');
      }
    }
  });

})();