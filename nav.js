/**
 * nav.js — Reusable navigation bar injector
 * Injects the EXACT nav HTML into <div id="nav-container">
 * Supports data-active-page attribute to highlight the current page link
 * Supports data-logo-active="true" to add active class to the logo (index.html)
 */
(function() {
  function injectNav() {
    var container = document.getElementById('nav-container');
    if (!container) return;

    var activePage = container.getAttribute('data-active-page') || '';
    var logoActive = container.getAttribute('data-logo-active') === 'true';

    function navLink(href, pageId, label) {
      var cls = activePage === pageId ? ' class="active"' : '';
      return '<a href="' + href + '"' + cls + '>' + label + '</a>';
    }

    var logoSpan = logoActive ? '<a href="/" class="nav-logo active"><span class="nav-logo-icon"><img src="logo-nav.png" alt="GlbTOKEN" width="30" height="32" class="nav-logo-img" /></span><span class="logo-full notranslate"><span class="logo-glb notranslate">Glb</span><span class="logo-token notranslate">TOKEN</span></span></a>' : '<a href="/" class="nav-logo notranslate"><span class="nav-logo-icon"><img src="logo-nav.png" alt="GlbTOKEN" width="30" height="32" class="nav-logo-img" /></span><span class="logo-full notranslate"><span class="logo-glb notranslate">Glb</span><span class="logo-token notranslate">TOKEN</span></span></a>';

    var navHtml =
      '<nav class="navbar"><div class="container navbar-inner">' +
        logoSpan +
        '<div class="nav-center" id="navCenter">' +
          navLink('index.html', 'home', 'Home') +
          navLink('pricing.html', 'pricing', 'Pricing') +
          navLink('how.html', 'how', 'How It Works') +
          navLink('models.html', 'models', 'Models') +
          '<a href="apikeys.html" id="navApiLink"' + (activePage === 'docs' ? ' class="active"' : '') + '>Docs</a>' +
        '</div>' +
        '<div class="nav-right">' +
          '<a class="theme-toggle" onclick="toggleTheme()" id="themeBtn" title="Toggle theme">🌙</a>' +
          '<div class="lang-selector notranslate">' +
            '<button class="lang-btn notranslate" onclick="toggleLangMenu()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2h1"/><path d="M9.5 17a5 5 0 004-4.5"/><path d="M14.5 17a5 5 0 01-4-4.5"/></svg> <span class="notranslate" id="currentLangLabel">EN</span></button>' +
          '</div>' +
          '<div class="lang-menu notranslate" id="langMenu">' +
            '<div class="lang-option notranslate active" data-lang="en" onclick="switchLanguage(\'en\')">🇬🇧 English</div>' +
            '<div class="lang-option notranslate" data-lang="zh-CN" onclick="switchLanguage(\'zh-CN\')">🇨🇳 中文</div>' +
            '<div class="lang-option notranslate" data-lang="ru" onclick="switchLanguage(\'ru\')">🇷🇺 Русский</div>' +
            '<div class="lang-option notranslate" data-lang="ja" onclick="switchLanguage(\'ja\')">🇯🇵 日本語</div>' +
            '<div class="lang-option notranslate" data-lang="de" onclick="switchLanguage(\'de\')">🇩🇪 Deutsch</div>' +
          '</div>' +
          '<span class="nav-balance-standalone" id="navBalance">0 Tokens</span>' +
          '<div id="navGuest">' +
            '<a class="nav-btn-outline" href="login.html">Login</a>' +
            '<a class="nav-btn" href="register.html">Get Started</a>' +
          '</div>' +
          '<div id="navUser" class="d-none">' +
            '<div class="nav-avatar" onclick="toggleDropdown()">U<div class="dropdown" id="userDropdown">' +
              '<div class="dropdown-header cursor-pointer" onclick="window.location=\'dashboard.html#settings\'">' +
                '<div class="dd-av" id="ddAvatar">U</div>' +
                '<div class="dd-info">' +
                  '<div class="dd-name" id="dropName">User</div>' +
                  '<div class="dd-email" id="dropEmail">user@email.com</div>' +
                '</div>' +
              '</div>' +
              '<div class="dd-items">' +
                '<a href="dashboard.html"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> Dashboard</a>' +
                '<a onclick="showPage(\'settings\')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg> Settings</a>' +
                '<a onclick="showPage(\'notifications\')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> Notifications</a>' +
              '</div>' +
              '<div class="dd-footer">' +
                '<a onclick="logoutUser()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> Sign Out</a>' +
              '</div>' +
            '</div></div>' +
          '</div>' +
        '</div>' +
        '<div class="mobile-right-group">' +
          '<a class="theme-toggle-mobile" onclick="toggleTheme()" id="themeBtnMobile" title="Toggle theme">🌙</a>' +
          '<button class="lang-btn-mobile notranslate" onclick="toggleLangMenu()" id="langBtnMobile" title="Translate"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2h1"/><path d="M9.5 17a5 5 0 004-4.5"/><path d="M14.5 17a5 5 0 01-4-4.5"/></svg></button>' +
          '<button class="hamburger" id="hamburgerBtn" onclick="toggleMobile()"><span></span><span></span><span></span></button>' +
        '</div>' +
      '</div></nav>' +
      '<div class="mobile-backdrop" id="mobileBackdrop" onclick="closeMobile()"></div>' +
      '<div class="mobile-overlay" id="mobileOverlay">' +
        '<div class="m-close"><button onclick="closeMobile()">✕</button></div>' +
        '<a href="/" onclick="closeMobile()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1"/></svg> Home</a>' +
        '<a href="pricing.html" onclick="closeMobile()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg> Pricing</a>' +
        '<a href="how.html" onclick="closeMobile()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5V4a2 2 0 012-2h8.5L20 7.5V20a2 2 0 01-2 2H6a2 2 0 01-2-2z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="12" x2="16" y2="12"/></svg> How It Works</a>' +
        '<a href="models.html" onclick="closeMobile()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg> Models</a>' +
        '<a href="apikeys.html" onclick="closeMobile()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> Docs</a>' +
        '<hr>' +
        '<div class="m-section-label">Account</div>' +
        '<div class="mobile-auth-grid" id="mobileGuestSection">' +
          '<a href="login.html" onclick="closeMobile()" id="mobileLoginLink" class="mobile-auth-btn mobile-auth-btn-outline">Login</a>' +
          '<a href="register.html" onclick="closeMobile()" id="mobileRegisterLink" class="mobile-auth-btn mobile-auth-btn-primary">Get Started</a>' +
        '</div>' +
        '<div id="mobileUserSection" class="d-none">' +
          '<div class="mobile-account-card">' +
            '<a href="dashboard.html" onclick="closeMobile()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> Dashboard</a>' +
            '<a href="settings.html" onclick="closeMobile()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg> Settings</a>' +
            '<a href="notifications.html" onclick="closeMobile()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> Notifications</a>' +
            '<div class="mobile-account-signout"><a href="javascript:void(0)" onclick="closeMobile();setTimeout(function(){logoutUser()},250)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> Sign Out</a></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    container.innerHTML = navHtml;
  }

  document.addEventListener('DOMContentLoaded', injectNav);
})();
