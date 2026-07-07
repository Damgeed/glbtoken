// GlbTOKEN i18n — instant client-side translation, no reload
// English text → {lang: translated text} lookup
// Generated for: zh-CN, ru, ja, de

const TRANS = {};


let curLang = localStorage.getItem('gt_lang') || 'en';

function switchLanguage(lang) {
  curLang = lang;
  localStorage.setItem('gt_lang', lang);
  translatePage();
  updateLangUI(lang);
}

function translatePage() {
  var walker = document.createTreeWalker(document.body, 4, null, false);
  var nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    if (!n.parentNode) continue;
    if (n.parentNode.closest && n.parentNode.closest('.notranslate,[translate="no"],script,style,svg,code,pre,option,.lang-selector,.lang-menu,.lang-option,.nav-logo,.logo-glb,.logo-token,.trust-badge,.star,.tm-dot,.tm-arrow,.copying,select,input,textarea,.lang-btn,.lang-btn-mobile')) continue;
    var text = n.textContent.trim();
    if (!text || text.length < 2 || text.length > 300) continue;
    if (TRANS[text] && TRANS[text][curLang]) {
      n.textContent = TRANS[text][curLang];
    }
  }
}

function updateLangUI(lang) {
  document.querySelectorAll('.lang-option').forEach(function(el) {
    el.classList.toggle('active', el.getAttribute('data-lang') === lang);
  });
  var lbl = document.getElementById('currentLangLabel');
  if (lbl) lbl.textContent = lang === 'zh-CN' ? '中文' : lang === 'en' ? 'EN' : lang === 'ru' ? 'RU' : lang === 'ja' ? '日' : 'DE';
  var lm = document.getElementById('langMenu');
  if (lm) lm.classList.remove('open');
}

// Apply on load
(function() {
  var saved = localStorage.getItem('gt_lang');
  if (saved && saved !== 'en') { 
    curLang = saved;
    document.addEventListener('DOMContentLoaded', function() { translatePage(); updateLangUI(saved); });
  }
})();


TRANS["Home"] = {en: "Home", "zh-CN": "\u9996\u9875", ru: "\u0413\u043b\u0430\u0432\u043d\u0430\u044f", ja: "\u30db\u30fc\u30e0", de: "Start"};
TRANS["Pricing"] = {en: "Pricing", "zh-CN": "\u4ef7\u683c", ru: "\u0426\u0435\u043d\u044b", ja: "\u6599\u91d1", de: "Preise"};
TRANS["How It Works"] = {en: "How It Works", "zh-CN": "\u4f7f\u7528\u65b9\u5f0f", ru: "\u041a\u0430\u043a \u044d\u0442\u043e \u0440\u0430\u0431\u043e\u0442\u0430\u0435\u0442", ja: "\u4f7f\u3044\u65b9", de: "So funktioniert\\'s"};
TRANS["Models"] = {en: "Models", "zh-CN": "\u6a21\u578b", ru: "\u041c\u043e\u0434\u0435\u043b\u0438", ja: "\u30e2\u30c7\u30eb", de: "Modelle"};
TRANS["Docs"] = {en: "Docs", "zh-CN": "\u6587\u6863", ru: "\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0430\u0446\u0438\u044f", ja: "\u30c9\u30ad\u30e5\u30e1\u30f3\u30c8", de: "Dokumentation"};
TRANS["0 Tokens"] = {en: "0 Tokens", "zh-CN": "0 \u4e2a\u4ee3\u5e01", ru: "0 \u0442\u043e\u043a\u0435\u043d\u043e\u0432", ja: "0 \u30c8\u30fc\u30af\u30f3", de: "0 Token"};
TRANS["Login"] = {en: "Login", "zh-CN": "\u767b\u5f55", ru: "\u0412\u043e\u0439\u0442\u0438", ja: "\u30ed\u30b0\u30a4\u30f3", de: "Anmelden"};
TRANS["Get Started"] = {en: "Get Started", "zh-CN": "\u5f00\u59cb\u4f7f\u7528", ru: "\u041d\u0430\u0447\u0430\u0442\u044c", ja: "\u59cb\u3081\u308b", de: "Loslegen"};
TRANS["User"] = {en: "User", "zh-CN": "\u7528\u6237", ru: "\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c", ja: "\u30e6\u30fc\u30b6\u30fc", de: "Benutzer"};
TRANS["Billing"] = {en: "Billing", "zh-CN": "\u8d26\u5355", ru: "\u041e\u043f\u043b\u0430\u0442\u0430", ja: "\u8acb\u6c42", de: "Abrechnung"};
TRANS["Notifications"] = {en: "Notifications", "zh-CN": "\u901a\u77e5", ru: "\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f", ja: "\u901a\u77e5", de: "Benachrichtigungen"};
TRANS["Settings"] = {en: "Settings", "zh-CN": "\u8bbe\u7f6e", ru: "\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438", ja: "\u8a2d\u5b9a", de: "Einstellungen"};
TRANS["Buy Tokens"] = {en: "Buy Tokens", "zh-CN": "\u8d2d\u4e70\u4ee3\u5e01", ru: "\u041a\u0443\u043f\u0438\u0442\u044c \u0442\u043e\u043a\u0435\u043d\u044b", ja: "\u30c8\u30fc\u30af\u30f3\u3092\u8cfc\u5165", de: "Token kaufen"};
TRANS["Sign Out"] = {en: "Sign Out", "zh-CN": "\u9000\u51fa\u767b\u5f55", ru: "\u0412\u044b\u0439\u0442\u0438", ja: "\u30ed\u30b0\u30a2\u30a6\u30c8", de: "Abmelden"};
TRANS["Account"] = {en: "Account", "zh-CN": "\u8d26\u6237", ru: "\u0410\u043a\u043a\u0430\u0443\u043d\u0442", ja: "\u30a2\u30ab\u30a6\u30f3\u30c8", de: "Konto"};
TRANS["Company"] = {en: "Company", "zh-CN": "\u516c\u53f8", ru: "\u041a\u043e\u043c\u043f\u0430\u043d\u0438\u044f", ja: "\u4f1a\u793e\u60c5\u5831", de: "Unternehmen"};
TRANS["Global Token for AI. One balance, 100+ models, 56 providers. Pay-as-you-go."] = {en: "Global Token for AI. One balance, 100+ models, 56 providers. Pay-as-you-go.", "zh-CN": "\u5168\u7403AI\u4ee3\u5e01\u3002\u4e00\u4e2a\u4f59\u989d\uff0c100+\u6a21\u578b\uff0c56\u4e2a\u63d0\u4f9b\u5546\u3002\u6309\u9700\u4ed8\u8d39\u3002", ru: "\u0413\u043b\u043e\u0431\u0430\u043b\u044c\u043d\u044b\u0439 \u0442\u043e\u043a\u0435\u043d \u0434\u043b\u044f \u0418\u0418. \u041e\u0434\u0438\u043d \u0431\u0430\u043b\u0430\u043d\u0441, 100+ \u043c\u043e\u0434\u0435\u043b\u0435\u0439, 56 \u043f\u0440\u043e\u0432\u0430\u0439\u0434\u0435\u0440\u043e\u0432. \u041f\u043b\u0430\u0442\u0438\u0442\u0435 \u043f\u043e \u043c\u0435\u0440\u0435 \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u0438\u044f.", ja: "AI\u306e\u305f\u3081\u306e\u30b0\u30ed\u30fc\u30d0\u30eb\u30c8\u30fc\u30af\u30f3\u30021\u3064\u306e\u6b8b\u9ad8\u3001100\u4ee5\u4e0a\u306e\u30e2\u30c7\u30eb\u300156\u306e\u30d7\u30ed\u30d0\u30a4\u30c0\u30fc\u3002\u5f93\u91cf\u8ab2\u91d1\u5236\u3002", de: "Globaler Token f\u00fcr KI. Ein Guthaben, 100+ Modelle, 56 Anbieter. Pay-as-you-go."};
TRANS["Product"] = {en: "Product", "zh-CN": "\u4ea7\u54c1", ru: "\u041f\u0440\u043e\u0434\u0443\u043a\u0442", ja: "\u88fd\u54c1", de: "Produkt"};
TRANS["About"] = {en: "About", "zh-CN": "\u5173\u4e8e", ru: "\u041e \u043d\u0430\u0441", ja: "\u6982\u8981", de: "\u00dcber uns"};
TRANS["Blog"] = {en: "Blog", "zh-CN": "\u535a\u5ba2", ru: "\u0411\u043b\u043e\u0433", ja: "\u30d6\u30ed\u30b0", de: "Blog"};
TRANS["Contact"] = {en: "Contact", "zh-CN": "\u8054\u7cfb", ru: "\u041a\u043e\u043d\u0442\u0430\u043a\u0442\u044b", ja: "\u304a\u554f\u3044\u5408\u308f\u305b", de: "Kontakt"};
TRANS["FAQ"] = {en: "FAQ", "zh-CN": "\u5e38\u89c1\u95ee\u9898", ru: "\u0427\u0430\u0441\u0442\u043e \u0437\u0430\u0434\u0430\u0432\u0430\u0435\u043c\u044b\u0435 \u0432\u043e\u043f\u0440\u043e\u0441\u044b", ja: "\u3088\u304f\u3042\u308b\u8cea\u554f", de: "FAQ"};
TRANS["Contact support"] = {en: "Contact support", "zh-CN": "\u8054\u7cfb\u5ba2\u670d", ru: "\u0421\u0432\u044f\u0437\u0430\u0442\u044c\u0441\u044f \u0441 \u043f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u043e\u0439", ja: "\u30b5\u30dd\u30fc\u30c8\u306b\u9023\u7d61", de: "Support kontaktieren"};
TRANS["Terms"] = {en: "Terms", "zh-CN": "\u670d\u52a1\u6761\u6b3e", ru: "\u0423\u0441\u043b\u043e\u0432\u0438\u044f", ja: "\u5229\u7528\u898f\u7d04", de: "AGB"};
TRANS["Privacy"] = {en: "Privacy", "zh-CN": "\u9690\u79c1\u653f\u7b56", ru: "\u041a\u043e\u043d\u0444\u0438\u0434\u0435\u043d\u0446\u0438\u0430\u043b\u044c\u043d\u043e\u0441\u0442\u044c", ja: "\u30d7\u30e9\u30a4\u30d0\u30b7\u30fc", de: "Datenschutz"};
TRANS["Refund"] = {en: "Refund", "zh-CN": "\u9000\u6b3e\u653f\u7b56", ru: "\u0412\u043e\u0437\u0432\u0440\u0430\u0442", ja: "\u8fd4\u91d1", de: "R\u00fcckerstattung"};
TRANS["\ud83d\udcac Support"] = {en: "\ud83d\udcac Support", "zh-CN": "\ud83d\udcac \u5ba2\u670d", ru: "\ud83d\udcac \u041f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0430", ja: "\ud83d\udcac \u30b5\u30dd\u30fc\u30c8", de: "\ud83d\udcac Support"};
TRANS["Email"] = {en: "Email", "zh-CN": "\u90ae\u7bb1", ru: "\u042d\u043b. \u043f\u043e\u0447\u0442\u0430", ja: "\u30e1\u30fc\u30eb", de: "E-Mail"};
TRANS["Total Spent"] = {en: "Total Spent", "zh-CN": "\u603b\u6d88\u8d39", ru: "\u0412\u0441\u0435\u0433\u043e \u043f\u043e\u0442\u0440\u0430\u0447\u0435\u043d\u043e", ja: "\u7dcf\u6d88\u8cbb", de: "Gesamtausgaben"};
TRANS["Models Used"] = {en: "Models Used", "zh-CN": "\u4f7f\u7528\u7684\u6a21\u578b\u6570", ru: "\u0418\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u043e \u043c\u043e\u0434\u0435\u043b\u0435\u0439", ja: "\u4f7f\u7528\u30e2\u30c7\u30eb\u6570", de: "Genutzte Modelle"};
TRANS["Days Active"] = {en: "Days Active", "zh-CN": "\u6d3b\u8dc3\u5929\u6570", ru: "\u0414\u043d\u0435\u0439 \u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0441\u0442\u0438", ja: "\u30a2\u30af\u30c6\u30a3\u30d6\u65e5\u6570", de: "Aktive Tage"};
TRANS["Recent Activity"] = {en: "Recent Activity", "zh-CN": "\u6700\u8fd1\u6d3b\u52a8", ru: "\u041d\u0435\u0434\u0430\u0432\u043d\u044f\u044f \u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0441\u0442\u044c", ja: "\u6700\u8fd1\u306e\u30a2\u30af\u30c6\u30a3\u30d3\u30c6\u30a3", de: "Letzte Aktivit\u00e4t"};
TRANS["Date"] = {en: "Date", "zh-CN": "\u65e5\u671f", ru: "\u0414\u0430\u0442\u0430", ja: "\u65e5\u4ed8", de: "Datum"};
TRANS["Type"] = {en: "Type", "zh-CN": "\u7c7b\u578b", ru: "\u0422\u0438\u043f", ja: "\u7a2e\u985e", de: "Art"};
TRANS["Amount"] = {en: "Amount", "zh-CN": "\u91d1\u989d", ru: "\u0421\u0443\u043c\u043c\u0430", ja: "\u91d1\u984d", de: "Betrag"};
TRANS["Status"] = {en: "Status", "zh-CN": "\u72b6\u6001", ru: "\u0421\u0442\u0430\u0442\u0443\u0441", ja: "\u30b9\u30c6\u30fc\u30bf\u30b9", de: "Status"};
TRANS["Transaction History"] = {en: "Transaction History", "zh-CN": "\u4ea4\u6613\u5386\u53f2", ru: "\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u0442\u0440\u0430\u043d\u0437\u0430\u043a\u0446\u0438\u0439", ja: "\u53d6\u5f15\u5c65\u6b74", de: "Transaktionsverlauf"};
TRANS["Buy Tokens Now"] = {en: "Buy Tokens Now", "zh-CN": "\u7acb\u5373\u8d2d\u4e70", ru: "\u041a\u0443\u043f\u0438\u0442\u044c \u0441\u0435\u0439\u0447\u0430\u0441", ja: "\u4eca\u3059\u3050\u8cfc\u5165", de: "Jetzt kaufen"};
TRANS["Your Token Balance"] = {en: "Your Token Balance", "zh-CN": "\u60a8\u7684\u4ee3\u5e01\u4f59\u989d", ru: "\u0412\u0430\u0448 \u0431\u0430\u043b\u0430\u043d\u0441 \u0442\u043e\u043a\u0435\u043d\u043e\u0432", ja: "\u30c8\u30fc\u30af\u30f3\u6b8b\u9ad8", de: "Ihr Token-Guthaben"};
TRANS["Create Account"] = {en: "Create Account", "zh-CN": "\u521b\u5efa\u8d26\u6237", ru: "\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0430\u043a\u043a\u0430\u0443\u043d\u0442", ja: "\u30a2\u30ab\u30a6\u30f3\u30c8\u4f5c\u6210", de: "Konto erstellen"};
TRANS["Welcome Back"] = {en: "Welcome Back", "zh-CN": "\u6b22\u8fce\u56de\u6765", ru: "\u0421 \u0432\u043e\u0437\u0432\u0440\u0430\u0449\u0435\u043d\u0438\u0435\u043c", ja: "\u304a\u304b\u3048\u308a\u306a\u3055\u3044", de: "Willkommen zur\u00fcck"};
TRANS["Password"] = {en: "Password", "zh-CN": "\u5bc6\u7801", ru: "\u041f\u0430\u0440\u043e\u043b\u044c", ja: "\u30d1\u30b9\u30ef\u30fc\u30c9", de: "Passwort"};
TRANS["Forgot Password?"] = {en: "Forgot Password?", "zh-CN": "\u5fd8\u8bb0\u5bc6\u7801\uff1f", ru: "\u0417\u0430\u0431\u044b\u043b\u0438 \u043f\u0430\u0440\u043e\u043b\u044c?", ja: "\u30d1\u30b9\u30ef\u30fc\u30c9\u3092\u304a\u5fd8\u308c\u3067\u3059\u304b\uff1f", de: "Passwort vergessen?"};
TRANS["Sign In"] = {en: "Sign In", "zh-CN": "\u767b\u5f55", ru: "\u0412\u043e\u0439\u0442\u0438", ja: "\u30b5\u30a4\u30f3\u30a4\u30f3", de: "Anmelden"};
TRANS["or continue with"] = {en: "or continue with", "zh-CN": "\u6216\u4f7f\u7528\u4ee5\u4e0b\u65b9\u5f0f\u7ee7\u7eed", ru: "\u0438\u043b\u0438 \u043f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c \u0447\u0435\u0440\u0435\u0437", ja: "\u307e\u305f\u306f\u6b21\u3067\u7d9a\u3051\u308b", de: "oder fortfahren mit"};
TRANS["Don't have an account?"] = {en: "Don\\'t have an account?", "zh-CN": "\u8fd8\u6ca1\u6709\u8d26\u6237\uff1f", ru: "\u041d\u0435\u0442 \u0430\u043a\u043a\u0430\u0443\u043d\u0442\u0430?", ja: "\u30a2\u30ab\u30a6\u30f3\u30c8\u3092\u304a\u6301\u3061\u3067\u306a\u3044\u65b9", de: "Noch kein Konto?"};
TRANS["Start using 100+ AI models"] = {en: "Start using 100+ AI models", "zh-CN": "\u5f00\u59cb\u4f7f\u7528100+ AI\u6a21\u578b", ru: "\u041d\u0430\u0447\u043d\u0438\u0442\u0435 \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u044c 100+ \u043c\u043e\u0434\u0435\u043b\u0435\u0439 \u0418\u0418", ja: "100\u4ee5\u4e0a\u306eAI\u30e2\u30c7\u30eb\u3092\u4f7f\u3044\u59cb\u3081\u308b", de: "100+ KI-Modelle nutzen"};
TRANS["Full Name"] = {en: "Full Name", "zh-CN": "\u5168\u540d", ru: "\u041f\u043e\u043b\u043d\u043e\u0435 \u0438\u043c\u044f", ja: "\u6c0f\u540d", de: "Vollst\u00e4ndiger Name"};
TRANS["Confirm Password"] = {en: "Confirm Password", "zh-CN": "\u786e\u8ba4\u5bc6\u7801", ru: "\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u043f\u0430\u0440\u043e\u043b\u044c", ja: "\u30d1\u30b9\u30ef\u30fc\u30c9\u3092\u78ba\u8a8d", de: "Passwort best\u00e4tigen"};
TRANS["Have an account?"] = {en: "Have an account?", "zh-CN": "\u5df2\u6709\u8d26\u6237\uff1f", ru: "\u0423\u0436\u0435 \u0435\u0441\u0442\u044c \u0430\u043a\u043a\u0430\u0443\u043d\u0442?", ja: "\u30a2\u30ab\u30a6\u30f3\u30c8\u3092\u304a\u6301\u3061\u306e\u65b9", de: "Bereits ein Konto?"};