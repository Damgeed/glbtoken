/**
 * footer.js — Reusable footer injector
 * Injects the EXACT footer HTML into <div id="footer-container">
 */
(function() {
  function injectFooter() {
    var container = document.getElementById('footer-container');
    if (!container) return;

    var footerHtml =
      '<footer><div class="container">' +
        '<div class="footer-grid">' +
          '<div class="footer-brand notranslate"><a href="/" class="nav-logo notranslate"><span class="nav-logo-icon"><img src="logo-nav.png" alt="GlbTOKEN" width="30" height="32" class="nav-logo-img" /></span><span class="logo-full notranslate"><span class="logo-glb notranslate">Glb</span><span class="logo-token notranslate">TOKEN</span></span></a><p data-i18n="footer-tagline">Global Token for AI. One balance, 100+ models, 56 providers. Pay-as-you-go.</p><div class="trust-badges notranslate"><span class="trust-badge notranslate">💳 Stripe</span><span class="trust-badge notranslate">🔶 Paystack</span><span class="trust-badge notranslate">₿ USDT</span><span class="trust-badge notranslate">₿ BTC</span></div></div>' +
          '<div class="footer-col"><h4>Product</h4><a href="pricing.html">Pricing</a><a href="models.html">Models</a><a href="apikeys.html">Docs</a></div>' +
          '<div class="footer-col"><h4>Company</h4><a href="about.html">About</a><a href="blog.html">Blog</a></div>' +
          '<div class="footer-col"><h4>Contact</h4><a href="faq.html">FAQ</a><a href="contact.html">Contact support</a><a href="terms.html">Terms</a><a href="privacy.html">Privacy</a><a href="refund.html">Refund</a></div>' +
        '</div>' +
        '<div class="footer-bottom"><span>&copy; 2026 GlbTOKEN</span></div>' +
      '</div></footer>';

    container.innerHTML = footerHtml;
  }

  document.addEventListener('DOMContentLoaded', injectFooter);
})();
