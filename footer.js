/**
 * footer.js — Reusable footer injector
 * Injects the EXACT footer HTML into <div id="footer-container">.
 *
 * Dashboard variant: when the container has data-mini="1", the SAME full
 * footer is injected but hidden by default behind a bottom drawer, with a
 * floating ⬆️ arrow at bottom-center that pops the original footer up on click.
 */
(function() {
  var FOOTER_HTML =
    '<footer><div class="container">' +
      '<div class="footer-grid">' +
        '<div class="footer-brand notranslate"><a href="/" class="nav-logo notranslate"><span class="nav-logo-icon"><img src="logo-nav.png" alt="GlbTOKEN" width="30" height="32" class="nav-logo-img" /></span><span class="logo-full notranslate"><span class="logo-glb notranslate">Glb</span><span class="logo-token notranslate">TOKEN</span></span></a><p data-i18n="footer-tagline">Global Token for AI. One balance, 100+ models, 56 providers. Pay-as-you-go.</p><div class="trust-badges notranslate"><span class="trust-badge notranslate">💳 Stripe</span><span class="trust-badge notranslate">🔶 Paystack</span><span class="trust-badge notranslate">₿ USDT</span><span class="trust-badge notranslate">₿ BTC</span></div></div>' +
        '<div class="footer-col"><h4>Product</h4><a href="pricing.html">Pricing</a><a href="models.html">Models</a><a href="apikeys.html">Docs</a></div>' +
        '<div class="footer-col"><h4>Company</h4><a href="about.html">About</a><a href="blog.html">Blog</a><a href="status.html">System Status</a></div>' +
        '<div class="footer-col"><h4>Contact</h4><a href="faq.html">FAQ</a><a href="contact.html">Contact support</a><a href="terms.html">Terms</a><a href="privacy.html">Privacy</a><a href="refund.html">Refund</a></div>' +
      '</div>' +
      '<div class="footer-bottom"><span>&copy; 2026 GlbTOKEN</span></div>' +
    '</div></footer>';

  function injectFooter() {
    var container = document.getElementById('footer-container');
    if (!container) return;

    if (container.getAttribute('data-mini') === '1') {
      injectDashboardFooter(container);
      return;
    }

    container.innerHTML = FOOTER_HTML;
  }

  function injectDashboardFooter(container) {
    // Same footer as every other page — just hidden behind a bottom drawer.
    container.innerHTML = FOOTER_HTML;
    var footer = container.querySelector('footer');
    if (footer) footer.classList.add('footer-drawer');

    var arrow = document.createElement('button');
    arrow.type = 'button';
    arrow.className = 'footer-arrow';
    arrow.id = 'footerArrow';
    arrow.setAttribute('aria-label', 'Show footer');
    arrow.setAttribute('aria-expanded', 'false');
    arrow.title = 'Footer';
    arrow.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>';
    arrow.onclick = function() { toggleFooterDrawer(); };
    container.insertBefore(arrow, container.firstChild);
  }

  window.toggleFooterDrawer = function() {
    var open = document.body.classList.toggle('has-footer-open');
    var drawer = document.querySelector('.footer-drawer');
    var arrow = document.getElementById('footerArrow');
    if (open && drawer) {
      // Let the fixed drawer's own height drive the arrow/FAB lift (CSS var).
      document.documentElement.style.setProperty('--footer-h', drawer.offsetHeight + 'px');
    }
    if (arrow) {
      arrow.classList.toggle('active', open);
      arrow.setAttribute('aria-expanded', open ? 'true' : 'false');
      arrow.setAttribute('aria-label', open ? 'Hide footer' : 'Show footer');
    }
  };

  document.addEventListener('DOMContentLoaded', injectFooter);
})();
