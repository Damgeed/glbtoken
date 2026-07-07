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
    if (!text || text.length < 2 || text.length > 400) continue;
    if (TRANS[text] && TRANS[text][curLang]) {
      n.textContent = TRANS[text][curLang];
    }
  }
  // Also handle data-i18n elements for dynamic content
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    var key = el.getAttribute('data-i18n');
    if (TRANS[key] && TRANS[key][curLang]) {
      el.textContent = TRANS[key][curLang];
    }
  });
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

// Also translate after page navigation (bfcache)
window.addEventListener('pageshow', function() {
  var saved = localStorage.getItem('gt_lang');
  if (saved && saved !== 'en') {
    curLang = saved;
    translatePage();
    updateLangUI(saved);
  }
});

// ── Group 1: Navigation, Buttons, Auth ──

TRANS["Home"] = {en: "Home", "zh-CN": "首页", ru: "Главная", ja: "ホーム", de: "Startseite"};
TRANS["Pricing"] = {en: "Pricing", "zh-CN": "价格", ru: "Цены", ja: "料金", de: "Preise"};
TRANS["How It Works"] = {en: "How It Works", "zh-CN": "使用指南", ru: "Как это работает", ja: "使い方", de: "So funktioniert's"};
TRANS["Models"] = {en: "Models", "zh-CN": "模型", ru: "Модели", ja: "モデル", de: "Modelle"};
TRANS["Docs"] = {en: "Docs", "zh-CN": "文档", ru: "Документация", ja: "ドキュメント", de: "Dokumentation"};
TRANS["Dashboard"] = {en: "Dashboard", "zh-CN": "控制台", ru: "Панель управления", ja: "ダッシュボード", de: "Dashboard"};
TRANS["Login"] = {en: "Login", "zh-CN": "登录", ru: "Войти", ja: "ログイン", de: "Anmelden"};
TRANS["Get Started"] = {en: "Get Started", "zh-CN": "开始使用", ru: "Начать", ja: "始める", de: "Loslegen"};
TRANS["Sign Out"] = {en: "Sign Out", "zh-CN": "退出登录", ru: "Выйти", ja: "ログアウト", de: "Abmelden"};
TRANS["Account"] = {en: "Account", "zh-CN": "账户", ru: "Аккаунт", ja: "アカウント", de: "Konto"};
TRANS["Billing"] = {en: "Billing", "zh-CN": "账单", ru: "Оплата", ja: "請求", de: "Abrechnung"};
TRANS["Notifications"] = {en: "Notifications", "zh-CN": "通知", ru: "Уведомления", ja: "通知", de: "Benachrichtigungen"};
TRANS["Settings"] = {en: "Settings", "zh-CN": "设置", ru: "Настройки", ja: "設定", de: "Einstellungen"};
TRANS["Buy Tokens"] = {en: "Buy Tokens", "zh-CN": "购买代币", ru: "Купить токены", ja: "トークンを購入", de: "Tokens kaufen"};
TRANS["FAQ"] = {en: "FAQ", "zh-CN": "常见问题", ru: "Часто задаваемые вопросы", ja: "よくある質問", de: "FAQ"};
TRANS["About"] = {en: "About", "zh-CN": "关于我们", ru: "О нас", ja: "概要", de: "Über uns"};
TRANS["Blog"] = {en: "Blog", "zh-CN": "博客", ru: "Блог", ja: "ブログ", de: "Blog"};
TRANS["Contact"] = {en: "Contact", "zh-CN": "联系我们", ru: "Контакты", ja: "お問い合わせ", de: "Kontakt"};
TRANS["Refund"] = {en: "Refund", "zh-CN": "退款政策", ru: "Возврат", ja: "返金", de: "Rückerstattung"};
TRANS["Privacy"] = {en: "Privacy", "zh-CN": "隐私政策", ru: "Конфиденциальность", ja: "プライバシー", de: "Datenschutz"};
TRANS["Terms"] = {en: "Terms", "zh-CN": "服务条款", ru: "Условия", ja: "利用規約", de: "AGB"};
TRANS["Product"] = {en: "Product", "zh-CN": "产品", ru: "Продукт", ja: "製品", de: "Produkt"};
TRANS["Company"] = {en: "Company", "zh-CN": "公司", ru: "Компания", ja: "会社情報", de: "Unternehmen"};
TRANS["Support"] = {en: "Support", "zh-CN": "支持", ru: "Поддержка", ja: "サポート", de: "Support"};
TRANS["Email"] = {en: "Email", "zh-CN": "邮箱", ru: "Электронная почта", ja: "メールアドレス", de: "E-Mail"};
TRANS["Password"] = {en: "Password", "zh-CN": "密码", ru: "Пароль", ja: "パスワード", de: "Passwort"};
TRANS["Full Name"] = {en: "Full Name", "zh-CN": "全名", ru: "Полное имя", ja: "氏名", de: "Vollständiger Name"};
TRANS["Confirm Password"] = {en: "Confirm Password", "zh-CN": "确认密码", ru: "Подтвердите пароль", ja: "パスワードを確認", de: "Passwort bestätigen"};
TRANS["Sign In"] = {en: "Sign In", "zh-CN": "登录", ru: "Войти", ja: "サインイン", de: "Anmelden"};
TRANS["Forgot Password?"] = {en: "Forgot Password?", "zh-CN": "忘记密码？", ru: "Забыли пароль?", ja: "パスワードをお忘れですか？", de: "Passwort vergessen?"};
TRANS["Welcome Back"] = {en: "Welcome Back", "zh-CN": "欢迎回来", ru: "С возвращением", ja: "おかえりなさい", de: "Willkommen zurück"};
TRANS["Start using 100+ AI models"] = {en: "Start using 100+ AI models", "zh-CN": "开始使用 100+ 种 AI 模型", ru: "Начните использовать 100+ моделей ИИ", ja: "100以上のAIモデルを使い始める", de: "Nutzen Sie 100+ KI-Modelle"};
TRANS["or continue with"] = {en: "or continue with", "zh-CN": "或使用以下方式继续", ru: "или войти через", ja: "または次で続ける", de: "oder fortfahren mit"};
TRANS["Have an account?"] = {en: "Have an account?", "zh-CN": "已有账户？", ru: "Уже есть аккаунт?", ja: "アカウントをお持ちですか？", de: "Bereits ein Konto?"};
TRANS["Don't have an account?"] = {en: "Don't have an account?", "zh-CN": "没有账户？", ru: "Нет аккаунта?", ja: "アカウントをお持ちでないですか？", de: "Kein Konto?"};
TRANS["Create Account"] = {en: "Create Account", "zh-CN": "创建账户", ru: "Создать аккаунт", ja: "アカウント作成", de: "Konto erstellen"};
TRANS["New Password"] = {en: "New Password", "zh-CN": "新密码", ru: "Новый пароль", ja: "新しいパスワード", de: "Neues Passwort"};
TRANS["Current Password"] = {en: "Current Password", "zh-CN": "当前密码", ru: "Текущий пароль", ja: "現在のパスワード", de: "Aktuelles Passwort"};
TRANS["Save Changes"] = {en: "Save Changes", "zh-CN": "保存更改", ru: "Сохранить изменения", ja: "変更を保存", de: "Änderungen speichern"};
TRANS["Update Password"] = {en: "Update Password", "zh-CN": "更新密码", ru: "Обновить пароль", ja: "パスワードを更新", de: "Passwort aktualisieren"};
TRANS["Two-Factor Auth"] = {en: "Two-Factor Auth", "zh-CN": "两步验证", ru: "Двухфакторная аутентификация", ja: "二要素認証", de: "Zwei-Faktor-Authentifizierung"};
TRANS["Enable"] = {en: "Enable", "zh-CN": "启用", ru: "Включить", ja: "有効にする", de: "Aktivieren"};
TRANS["Timezone"] = {en: "Timezone", "zh-CN": "时区", ru: "Часовой пояс", ja: "タイムゾーン", de: "Zeitzone"};
TRANS["Profile"] = {en: "Profile", "zh-CN": "个人资料", ru: "Профиль", ja: "プロフィール", de: "Profil"};
TRANS["Add an extra layer of security"] = {en: "Add an extra layer of security", "zh-CN": "增加一层额外的安全保护", ru: "Добавьте дополнительный уровень безопасности", ja: "セキュリティをさらに強化", de: "Eine zusätzliche Sicherheitsebene hinzufügen"};
TRANS["User"] = {en: "User", "zh-CN": "用户", ru: "Пользователь", ja: "ユーザー", de: "Benutzer"};

// ── Group 2: Dashboard & Finance ──

TRANS["Your Token Balance"] = {en: "Your Token Balance", "zh-CN": "您的代币余额", ru: "Ваш баланс токенов", ja: "あなたのトークン残高", de: "Ihr Token-Guthaben"};
TRANS["Available Balance"] = {en: "Available Balance", "zh-CN": "可用余额", ru: "Доступный баланс", ja: "利用可能残高", de: "Verfügbares Guthaben"};
TRANS["Total Spent"] = {en: "Total Spent", "zh-CN": "总消费", ru: "Всего потрачено", ja: "総支出額", de: "Gesamtausgaben"};
TRANS["Days Active"] = {en: "Days Active", "zh-CN": "活跃天数", ru: "Активных дней", ja: "アクティブ日数", de: "Aktive Tage"};
TRANS["Models Used"] = {en: "Models Used", "zh-CN": "已用模型数", ru: "Использовано моделей", ja: "使用モデル数", de: "Genutzte Modelle"};
TRANS["Recent Activity"] = {en: "Recent Activity", "zh-CN": "近期活动", ru: "Недавняя активность", ja: "最近のアクティビティ", de: "Letzte Aktivität"};
TRANS["Recent Transactions"] = {en: "Recent Transactions", "zh-CN": "最近交易", ru: "Последние транзакции", ja: "最近の取引", de: "Letzte Transaktionen"};
TRANS["Transaction History"] = {en: "Transaction History", "zh-CN": "交易历史", ru: "История транзакций", ja: "取引履歴", de: "Transaktionsverlauf"};
TRANS["No transactions yet"] = {en: "No transactions yet", "zh-CN": "暂无交易记录", ru: "Пока нет транзакций", ja: "まだ取引がありません", de: "Noch keine Transaktionen"};
TRANS["No activity yet. Buy tokens to get started!"] = {en: "No activity yet. Buy tokens to get started!", "zh-CN": "暂无活动。购买代币开始使用！", ru: "Пока нет активности. Купите токены, чтобы начать!", ja: "まだアクティビティがありません。トークンを購入して始めましょう！", de: "Noch keine Aktivität. Kaufen Sie Token, um zu beginnen!"};
TRANS["Buy Tokens Now"] = {en: "Buy Tokens Now", "zh-CN": "立即购买代币", ru: "Купить токены сейчас", ja: "今すぐトークンを購入", de: "Jetzt Token kaufen"};
TRANS["Token usage overview"] = {en: "Token usage overview", "zh-CN": "代币使用概览", ru: "Обзор использования токенов", ja: "トークン使用量の概要", de: "Token-Nutzungsübersicht"};
TRANS["Usage by Model"] = {en: "Usage by Model", "zh-CN": "按模型使用量", ru: "Использование по моделям", ja: "モデル別使用量", de: "Nutzung nach Modell"};
TRANS["Date"] = {en: "Date", "zh-CN": "日期", ru: "Дата", ja: "日付", de: "Datum"};
TRANS["Type"] = {en: "Type", "zh-CN": "类型", ru: "Тип", ja: "種類", de: "Typ"};
TRANS["Amount"] = {en: "Amount", "zh-CN": "金额", ru: "Сумма", ja: "金額", de: "Betrag"};
TRANS["Status"] = {en: "Status", "zh-CN": "状态", ru: "Статус", ja: "ステータス", de: "Status"};
TRANS["Tokens Spent"] = {en: "Tokens Spent", "zh-CN": "消耗代币", ru: "Потрачено токенов", ja: "消費トークン", de: "Verbrauchte Token"};
TRANS["Top Up Wallet"] = {en: "Top Up Wallet", "zh-CN": "充值钱包", ru: "Пополнить кошелек", ja: "ウォレットにチャージ", de: "Wallet aufladen"};
TRANS["Payment Successful!"] = {en: "Payment Successful!", "zh-CN": "支付成功！", ru: "Оплата прошла успешно!", ja: "支払い成功！", de: "Zahlung erfolgreich!"};
TRANS["Pay Now"] = {en: "Pay Now", "zh-CN": "立即支付", ru: "Оплатить сейчас", ja: "今すぐ支払う", de: "Jetzt bezahlen"};
TRANS["Records"] = {en: "Records", "zh-CN": "记录", ru: "Записи", ja: "記録", de: "Aufzeichnungen"};
TRANS["Deposits"] = {en: "Deposits", "zh-CN": "充值记录", ru: "Пополнения", ja: "入金", de: "Einzahlungen"};
TRANS["Tokens"] = {en: "Tokens", "zh-CN": "代币", ru: "Токены", ja: "トークン", de: "Token"};
TRANS["All time"] = {en: "All time", "zh-CN": "全部时间", ru: "За все время", ja: "全期間", de: "Gesamter Zeitraum"};
TRANS["Lifetime"] = {en: "Lifetime", "zh-CN": "累计", ru: "За все время", ja: "累計", de: "Gesamtnutzung"};
TRANS["Newest"] = {en: "Newest", "zh-CN": "最新", ru: "Новые", ja: "新しい順", de: "Neueste"};
TRANS["Oldest"] = {en: "Oldest", "zh-CN": "最早", ru: "Старые", ja: "古い順", de: "Älteste"};
TRANS["Price per 1K tokens"] = {en: "Price per 1K tokens", "zh-CN": "每千代币价格", ru: "Цена за 1K токенов", ja: "1Kトークンあたりの価格", de: "Preis pro 1.000 Token"};
TRANS["Token Packages"] = {en: "Token Packages", "zh-CN": "代币套餐", ru: "Пакеты токенов", ja: "トークンパッケージ", de: "Token-Pakete"};
TRANS["Starter"] = {en: "Starter", "zh-CN": "入门版", ru: "Стартовый", ja: "スターター", de: "Starter"};
TRANS["Professional"] = {en: "Professional", "zh-CN": "专业版", ru: "Профессиональный", ja: "プロフェッショナル", de: "Professional"};
TRANS["Enterprise"] = {en: "Enterprise", "zh-CN": "企业版", ru: "Корпоративный", ja: "エンタープライズ", de: "Enterprise"};
TRANS["Flexible amount"] = {en: "Flexible amount", "zh-CN": "自定义金额", ru: "Произвольная сумма", ja: "任意の金額", de: "Flexibler Betrag"};
TRANS["Every dollar counts"] = {en: "Every dollar counts", "zh-CN": "每一美元都物超所值", ru: "Каждый доллар на счету", ja: "1ドル単位でチャージ可能", de: "Jeder Dollar zählt"};
TRANS["API access"] = {en: "API access", "zh-CN": "API 访问", ru: "Доступ к API", ja: "API アクセス", de: "API-Zugriff"};
TRANS["Email support"] = {en: "Email support", "zh-CN": "邮件支持", ru: "Поддержка по email", ja: "メールサポート", de: "E-Mail-Support"};
TRANS["Priority support"] = {en: "Priority support", "zh-CN": "优先支持", ru: "Приоритетная поддержка", ja: "優先サポート", de: "Prioritäts-Support"};
TRANS["Dedicated support"] = {en: "Dedicated support", "zh-CN": "专属支持", ru: "Выделенная поддержка", ja: "専任サポート", de: "Dedizierter Support"};
TRANS["Team sharing"] = {en: "Team sharing", "zh-CN": "团队共享", ru: "Общий доступ для команды", ja: "チーム共有", de: "Team-Freigabe"};
TRANS["All 100+ models"] = {en: "All 100+ models", "zh-CN": "全部 100+ 模型", ru: "Все 100+ моделей", ja: "100以上の全モデル", de: "Alle 100+ Modelle"};
TRANS["Instant top-up"] = {en: "Instant top-up", "zh-CN": "即时到账", ru: "Мгновенное пополнение", ja: "即時チャージ", de: "Sofortige Aufladung"};
TRANS["Worldwide"] = {en: "Worldwide", "zh-CN": "全球", ru: "По всему миру", ja: "全世界", de: "Weltweit"};
TRANS["Africa"] = {en: "Africa", "zh-CN": "非洲", ru: "Африка", ja: "アフリカ", de: "Afrika"};
TRANS["Global"] = {en: "Global", "zh-CN": "全球", ru: "Глобально", ja: "グローバル", de: "Global"};
TRANS["Local Payments"] = {en: "Local Payments", "zh-CN": "本地支付", ru: "Локальные платежи", ja: "ローカル決済", de: "Lokale Zahlungen"};
TRANS["Crypto Payments"] = {en: "Crypto Payments", "zh-CN": "加密货币支付", ru: "Криптовалютные платежи", ja: "暗号通貨決済", de: "Krypto-Zahlungen"};
TRANS["Mobile money / Bank transfer"] = {en: "Mobile money / Bank transfer", "zh-CN": "移动支付 / 银行转账", ru: "Мобильные деньги / Банковский перевод", ja: "モバイルマネー / 銀行振込", de: "Mobile Money / Banküberweisung"};
TRANS["Choose Payment Method"] = {en: "Choose Payment Method", "zh-CN": "选择支付方式", ru: "Выберите способ оплаты", ja: "支払い方法を選択", de: "Zahlungsmethode wählen"};
TRANS["Authorization"] = {en: "Authorization", "zh-CN": "授权验证", ru: "Авторизация", ja: "認証", de: "Autorisierung"};
TRANS["Loading keys..."] = {en: "Loading keys...", "zh-CN": "正在加载密钥...", ru: "Загрузка ключей...", ja: "キーを読み込み中...", de: "Schlüssel werden geladen..."};
TRANS["Generate API Key"] = {en: "Generate API Key", "zh-CN": "生成 API 密钥", ru: "Сгенерировать API-ключ", ja: "API キーを生成", de: "API-Schlüssel generieren"};
TRANS["API Keys"] = {en: "API Keys", "zh-CN": "API 密钥", ru: "API-ключи", ja: "API キー", de: "API-Schlüssel"};
TRANS["API Keys Active"] = {en: "API Keys Active", "zh-CN": "活跃 API 密钥", ru: "Активные API-ключи", ja: "有効な API キー", de: "Aktive API-Schlüssel"};
TRANS["API Key Created"] = {en: "API Key Created", "zh-CN": "API 密钥已创建", ru: "API-ключ создан", ja: "API キーを作成しました", de: "API-Schlüssel erstellt"};
TRANS["0 items"] = {en: "0 items", "zh-CN": "0 项", ru: "0 элементов", ja: "0 件", de: "0 Einträge"};
TRANS["Select a package or custom amount. $2 minimum."] = {en: "Select a package or custom amount. $2 minimum.", "zh-CN": "选择一个套餐或自定义金额。最低 $2。", ru: "Выберите пакет или произвольную сумму. Минимум $2.", ja: "パッケージまたは任意の金額を選択。最低 $2。", de: "Wählen Sie ein Paket oder einen individuellen Betrag. Mindestens $2."};
TRANS["No activity yet"] = {en: "No activity yet", "zh-CN": "暂无活动", ru: "Пока нет активности", ja: "まだアクティビティがありません", de: "Noch keine Aktivität"};

// ── Group 3: Hero, Marketing & FAQ ──

TRANS["The Smartest Way to Use AI"] = {en: "The Smartest Way to Use AI", "zh-CN": "使用 AI 的最智能方式", ru: "Самый умный способ использовать ИИ", ja: "AIを活用する最もスマートな方法", de: "Der intelligenteste Weg, KI zu nutzen"};
TRANS["One Balance. 100+ Models. No Subscriptions."] = {en: "One Balance. 100+ Models. No Subscriptions.", "zh-CN": "一个余额。100+ 模型。无需订阅。", ru: "Один баланс. 100+ моделей. Без подписок.", ja: "1つの残高。100以上のモデル。サブスクリプション不要。", de: "Ein Guthaben. 100+ Modelle. Keine Abos."};
TRANS["100+ Models. One Balance."] = {en: "100+ Models. One Balance.", "zh-CN": "100+ 模型。一个余额。", ru: "100+ моделей. Один баланс.", ja: "100以上のモデル。1つの残高。", de: "100+ Modelle. Ein Guthaben."};
TRANS["Get Started in 3 Steps"] = {en: "Get Started in 3 Steps", "zh-CN": "3 步快速上手", ru: "Начните за 3 шага", ja: "3ステップで始める", de: "Starten Sie in 3 Schritten"};
TRANS["Why GlbTOKEN"] = {en: "Why GlbTOKEN", "zh-CN": "为什么选择 GlbTOKEN", ru: "Почему GlbTOKEN", ja: "なぜGlbTOKENなのか", de: "Warum GlbTOKEN"};
TRANS["Ready for Premium AI?"] = {en: "Ready for Premium AI?", "zh-CN": "准备好体验高级 AI 了吗？", ru: "Готовы к премиальному ИИ?", ja: "プレミアムAIをご用意していますか？", de: "Bereit für Premium-KI?"};
TRANS["Premium AI."] = {en: "Premium AI.", "zh-CN": "高级 AI。", ru: "Премиум ИИ.", ja: "プレミアムAI。", de: "Premium-KI."};
TRANS["Global Token for AI. One balance, 100+ models, 56 providers. Pay-as-you-go."] = {en: "Global Token for AI. One balance, 100+ models, 56 providers. Pay-as-you-go.", "zh-CN": "AI 全球通证。一个余额，100+ 模型，56 家供应商。按需付费。", ru: "Глобальный токен для ИИ. Один баланс, 100+ моделей, 56 провайдеров. Оплата по мере использования.", ja: "AIのためのグローバルトークン。1つの残高、100以上のモデル、56のプロバイダー。従量課金制。", de: "Globaler Token für KI. Ein Guthaben, 100+ Modelle, 56 Anbieter. Pay-as-you-go."};
TRANS["Try our free AI models right now. No account needed."] = {en: "Try our free AI models right now. No account needed.", "zh-CN": "立即免费试用我们的 AI 模型。无需注册账号。", ru: "Попробуйте наши бесплатные модели ИИ прямо сейчас. Без регистрации.", ja: "無料のAIモデルを今すぐお試しください。アカウント不要。", de: "Testen Sie jetzt unsere kostenlosen KI-Modelle. Kein Konto erforderlich."};
TRANS["Ask me anything"] = {en: "Ask me anything", "zh-CN": "问我任何问题", ru: "Спроси меня о чём угодно", ja: "何でも質問してください", de: "Frag mich alles"};
TRANS["One token. 100+ models. No subscriptions."] = {en: "One token. 100+ models. No subscriptions.", "zh-CN": "一个通证。100+ 模型。无需订阅。", ru: "Один токен. 100+ моделей. Без подписок.", ja: "1つのトークン。100以上のモデル。サブスクリプション不要。", de: "Ein Token. 100+ Modelle. Keine Abos."};
TRANS["Pay-as-You-Go"] = {en: "Pay-as-You-Go", "zh-CN": "按需付费", ru: "Платите по мере использования", ja: "従量課金制", de: "Pay-as-you-go"};
TRANS["Use Any AI"] = {en: "Use Any AI", "zh-CN": "使用任意 AI", ru: "Используйте любой ИИ", ja: "あらゆるAIを利用", de: "Jede KI nutzen"};
TRANS["Frequently Asked Questions"] = {en: "Frequently Asked Questions", "zh-CN": "常见问题解答", ru: "Часто задаваемые вопросы", ja: "よくある質問", de: "Häufig gestellte Fragen"};
TRANS["How GlbTOKEN Works"] = {en: "How GlbTOKEN Works", "zh-CN": "GlbTOKEN 工作原理", ru: "Как работает GlbTOKEN", ja: "GlbTOKENの仕組み", de: "Wie GlbTOKEN funktioniert"};
TRANS["Four simple steps."] = {en: "Four simple steps.", "zh-CN": "四个简单的步骤。", ru: "Четыре простых шага.", ja: "4つの簡単なステップ。", de: "Vier einfache Schritte."};
TRANS["Guide"] = {en: "Guide", "zh-CN": "指南", ru: "Руководство", ja: "ガイド", de: "Leitfaden"};
TRANS["Privacy Policy"] = {en: "Privacy Policy", "zh-CN": "隐私政策", ru: "Политика конфиденциальности", ja: "プライバシーポリシー", de: "Datenschutzerklärung"};
TRANS["Refund Policy"] = {en: "Refund Policy", "zh-CN": "退款政策", ru: "Политика возврата", ja: "返金ポリシー", de: "Rückerstattungsrichtlinie"};
TRANS["Terms of Service"] = {en: "Terms of Service", "zh-CN": "服务条款", ru: "Условия обслуживания", ja: "利用規約", de: "Nutzungsbedingungen"};
TRANS["Our Mission"] = {en: "Our Mission", "zh-CN": "我们的使命", ru: "Наша миссия", ja: "私たちの使命", de: "Unsere Mission"};
TRANS["Global Team"] = {en: "Global Team", "zh-CN": "全球团队", ru: "Глобальная команда", ja: "グローバルチーム", de: "Globales Team"};
TRANS["Contact support"] = {en: "Contact support", "zh-CN": "联系客服", ru: "Связаться с поддержкой", ja: "サポートに連絡", de: "Support kontaktieren"};
TRANS["Available 24/7"] = {en: "Available 24/7", "zh-CN": "全天候支持", ru: "Доступно 24/7", ja: "年中無休24時間対応", de: "24/7 verfügbar"};
TRANS["Response within 2 hours"] = {en: "Response within 2 hours", "zh-CN": "2 小时内回复", ru: "Ответ в течение 2 часов", ja: "2時間以内に返信", de: "Antwort innerhalb von 2 Stunden"};
TRANS["Blog & Updates"] = {en: "Blog & Updates", "zh-CN": "博客与更新", ru: "Блог и обновления", ja: "ブログ＆アップデート", de: "Blog & Updates"};
TRANS["Follow us for updates"] = {en: "Follow us for updates", "zh-CN": "关注我们获取最新动态", ru: "Следите за нами", ja: "アップデートをフォロー", de: "Folgen Sie uns für Neuigkeiten"};
TRANS["Ready to Build?"] = {en: "Ready to Build?", "zh-CN": "准备好开始构建了吗？", ru: "Готовы создавать?", ja: "構築を始めますか？", de: "Bereit zum Entwickeln?"};
TRANS["Multi-Model Access"] = {en: "Multi-Model Access", "zh-CN": "多模型访问", ru: "Доступ к нескольким моделям", ja: "マルチモデルアクセス", de: "Multi-Modell-Zugriff"};
TRANS["Contact Us"] = {en: "Contact Us", "zh-CN": "联系我们", ru: "Свяжитесь с нами", ja: "お問い合わせ", de: "Kontaktieren Sie uns"};
TRANS["Create one"] = {en: "Create one", "zh-CN": "创建一个", ru: "Создать", ja: "作成する", de: "Erstellen"};
TRANS["Payments"] = {en: "Payments", "zh-CN": "支付", ru: "Платежи", ja: "支払い", de: "Zahlungen"};
TRANS["Providers"] = {en: "Providers", "zh-CN": "供应商", ru: "Провайдеры", ja: "プロバイダー", de: "Anbieter"};
TRANS["View all →"] = {en: "View all →", "zh-CN": "查看全部 →", ru: "Смотреть все →", ja: "すべて表示 →", de: "Alle anzeigen →"};

// ── Group 4: Errors, Misc, Pages ──

TRANS["Insufficient token balance"] = {en: "Insufficient token balance", "zh-CN": "代币余额不足", ru: "Недостаточный баланс токенов", ja: "トークン残高不足", de: "Unzureichendes Token-Guthaben"};
TRANS["Invalid or missing API key"] = {en: "Invalid or missing API key", "zh-CN": "API密钥无效或缺失", ru: "Неверный или отсутствующий API-ключ", ja: "APIキーが無効または見つかりません", de: "Ungültiger oder fehlender API-Schlüssel"};
TRANS["Rate limited — slow down requests"] = {en: "Rate limited — slow down requests", "zh-CN": "请求频率受限——请降低请求速度", ru: "Превышен лимит запросов — снизьте частоту", ja: "レート制限 — リクエストを減らしてください", de: "Ratenbegrenzung — verlangsamen Sie Ihre Anfragen"};
TRANS["Model not found or not available"] = {en: "Model not found or not available", "zh-CN": "模型未找到或不可用", ru: "Модель не найдена или недоступна", ja: "モデルが見つからないか利用できません", de: "Modell nicht gefunden oder nicht verfügbar"};
TRANS["Handle 402 errors"] = {en: "Handle 402 errors", "zh-CN": "处理402错误", ru: "Обработка ошибок 402", ja: "402エラーの処理", de: "402-Fehler behandeln"};
TRANS["Live Chat"] = {en: "Live Chat", "zh-CN": "在线聊天", ru: "Чат в реальном времени", ja: "ライブチャット", de: "Live-Chat"};
TRANS["Live Chat (Human)"] = {en: "Live Chat (Human)", "zh-CN": "在线聊天（人工）", ru: "Чат с оператором", ja: "ライブチャット（有人）", de: "Live-Chat (Menschlich)"};
TRANS["Live Chat (AI)"] = {en: "Live Chat (AI)", "zh-CN": "在线聊天（AI）", ru: "Чат с ИИ", ja: "ライブチャット（AI）", de: "Live-Chat (KI)"};
TRANS["Mark All as Read"] = {en: "Mark All as Read", "zh-CN": "全部标记为已读", ru: "Отметить все как прочитанное", ja: "すべて既読にする", de: "Alle als gelesen markieren"};
TRANS["Service Downtime"] = {en: "Service Downtime", "zh-CN": "服务宕机", ru: "Простой сервиса", ja: "サービスダウンタイム", de: "Service-Ausfallzeit"};
TRANS["Top-up Confirmed"] = {en: "Top-up Confirmed", "zh-CN": "充值确认", ru: "Пополнение подтверждено", ja: "チャージ確認済み", de: "Aufladung bestätigt"};
TRANS["Alerts"] = {en: "Alerts", "zh-CN": "警报", ru: "Уведомления", ja: "アラート", de: "Benachrichtigungen"};
TRANS["Low Balance Warning"] = {en: "Low Balance Warning", "zh-CN": "余额不足警告", ru: "Предупреждение о низком балансе", ja: "残高不足の警告", de: "Warnung bei niedrigem Guthaben"};
TRANS["Unused Tokens"] = {en: "Unused Tokens", "zh-CN": "未使用代币", ru: "Неиспользованные токены", ja: "未使用トークン", de: "Ungenutzte Token"};
TRANS["Token Purchases"] = {en: "Token Purchases", "zh-CN": "代币购买", ru: "Покупка токенов", ja: "トークン購入", de: "Token-Käufe"};
TRANS["Rotate keys regularly"] = {en: "Rotate keys regularly", "zh-CN": "定期轮换密钥", ru: "Регулярно меняйте ключи", ja: "定期的にキーをローテーションする", de: "Schlüssel regelmäßig rotieren"};
TRANS["Use separate keys per project"] = {en: "Use separate keys per project", "zh-CN": "每个项目使用单独的密钥", ru: "Используйте отдельные ключи для каждого проекта", ja: "プロジェクトごとに個別のキーを使用する", de: "Separate Schlüssel pro Projekt verwenden"};
TRANS["From signup to first API call — under 2 minutes."] = {en: "From signup to first API call — under 2 minutes.", "zh-CN": "从注册到首次API调用——不到2分钟", ru: "От регистрации до первого API-запроса — менее 2 минут", ja: "サインアップから初回API呼び出しまで — 2分未満", de: "Von der Anmeldung bis zum ersten API-Aufruf — unter 2 Minuten."};
TRANS["One balance for 100+ models across 56 providers. Switch between GPT, Claude, Llama, Gemini instantly."] = {en: "One balance for 100+ models across 56 providers. Switch between GPT, Claude, Llama, Gemini instantly.", "zh-CN": "一个余额即可使用56家提供商的100多个模型。在GPT、Claude、Llama、Gemini之间即时切换。", ru: "Один баланс для 100+ моделей от 56 провайдеров. Мгновенно переключайтесь между GPT, Claude, Llama, Gemini.", ja: "1つの残高で56のプロバイダーにわたる100以上のモデルを利用。GPT、Claude、Llama、Geminiを瞬時に切り替え。", de: "Ein Guthaben für 100+ Modelle von 56 Anbietern. Wechseln Sie sofort zwischen GPT, Claude, Llama, Gemini."};
TRANS["Sign up with email, Google, or GitHub. No credit card needed."] = {en: "Sign up with email, Google, or GitHub. No credit card needed.", "zh-CN": "使用邮箱、Google或GitHub注册。无需信用卡。", ru: "Регистрируйтесь по email, через Google или GitHub. Кредитная карта не требуется.", ja: "メール、Google、またはGitHubでサインアップ。クレジットカード不要。", de: "Anmeldung per E-Mail, Google oder GitHub. Keine Kreditkarte erforderlich."};
TRANS["No hidden fees — transparent pricing"] = {en: "No hidden fees — transparent pricing", "zh-CN": "无隐藏费用——透明定价", ru: "Без скрытых платежей — прозрачные цены", ja: "隠れ費用なし — 透明な料金設定", de: "Keine versteckten Gebühren — transparente Preise"};
TRANS["Instant top-up — tokens in seconds"] = {en: "Instant top-up — tokens in seconds", "zh-CN": "即时充值——秒到账", ru: "Мгновенное пополнение — токены за секунды", ja: "即時チャージ — トークンが数秒で反映", de: "Sofortige Aufladung — Token in Sekunden"};
TRANS["Usage-based pricing — only pay for what you use"] = {en: "Usage-based pricing — only pay for what you use", "zh-CN": "按使用量计费——只为使用部分付费", ru: "Оплата по использованию — платите только за то, что используете", ja: "使用量ベースの料金 — 使った分だけ支払い", de: "Nutzungsbasierte Preisgestaltung — nur für das bezahlen, was Sie nutzen"};
TRANS["OpenAI-compatible endpoint. One API key for 100+ models. Integrate in minutes."] = {en: "OpenAI-compatible endpoint. One API key for 100+ models. Integrate in minutes.", "zh-CN": "OpenAI兼容端点。一个API密钥可用于100多个模型。几分钟内完成集成。", ru: "Совместимая с OpenAI конечная точка. Один API-ключ для 100+ моделей. Интеграция за минуты.", ja: "OpenAI互換のエンドポイント。1つのAPIキーで100以上のモデル。数分で統合。", de: "OpenAI-kompatibler Endpunkt. Ein API-Schlüssel für 100+ Modelle. Integration in Minuten."};
TRANS["API Documentation"] = {en: "API Documentation", "zh-CN": "API文档", ru: "Документация API", ja: "APIドキュメント", de: "API-Dokumentation"};
TRANS["Developer"] = {en: "Developer", "zh-CN": "开发者", ru: "Разработчикам", ja: "開発者", de: "Entwickler"};
TRANS["What is GlbTOKEN?"] = {en: "What is GlbTOKEN?", "zh-CN": "什么是GlbTOKEN？", ru: "Что такое GlbTOKEN?", ja: "GlbTOKENとは？", de: "Was ist GlbTOKEN?"};
TRANS["How do I buy tokens?"] = {en: "How do I buy tokens?", "zh-CN": "如何购买通证？", ru: "Как купить токены?", ja: "トークンの購入方法は？", de: "Wie kaufe ich Tokens?"};
TRANS["How do I use the API?"] = {en: "How do I use the API?", "zh-CN": "如何使用 API？", ru: "Как использовать API?", ja: "APIの使い方は？", de: "Wie verwende ich die API?"};
TRANS["How are token prices calculated?"] = {en: "How are token prices calculated?", "zh-CN": "通证价格如何计算？", ru: "Как рассчитываются цены на токены?", ja: "トークンの価格はどのように計算されますか？", de: "Wie werden Token-Preise berechnet?"};
TRANS["Which AI models are supported?"] = {en: "Which AI models are supported?", "zh-CN": "支持哪些 AI 模型？", ru: "Какие модели ИИ поддерживаются?", ja: "どのAIモデルがサポートされていますか？", de: "Welche KI-Modelle werden unterstützt?"};
TRANS["How do I contact support?"] = {en: "How do I contact support?", "zh-CN": "如何联系客服？", ru: "Как связаться со службой поддержки?", ja: "サポートへの連絡方法は？", de: "Wie kontaktiere ich den Support?"};
TRANS["Is there a refund policy?"] = {en: "Is there a refund policy?", "zh-CN": "有退款政策吗？", ru: "Есть ли политика возврата?", ja: "返金ポリシーはありますか？", de: "Gibt es eine Rückerstattungsrichtlinie?"};
TRANS["Is my data secure?"] = {en: "Is my data secure?", "zh-CN": "我的数据安全吗？", ru: "Защищены ли мои данные?", ja: "データは安全ですか？", de: "Sind meine Daten sicher?"};
TRANS["Do tokens expire?"] = {en: "Do tokens expire?", "zh-CN": "通证会过期吗？", ru: "Срок действия токенов истекает?", ja: "トークンに有効期限はありますか？", de: "Verfallen Tokens?"};
TRANS["What payment methods do you accept?"] = {en: "What payment methods do you accept?", "zh-CN": "你们接受哪些支付方式？", ru: "Какие способы оплаты вы принимаете?", ja: "どの支払い方法に対応していますか？", de: "Welche Zahlungsmethoden akzeptieren Sie?"};
TRANS["Do I need an account to use the chat?"] = {en: "Do I need an account to use the chat?", "zh-CN": "使用聊天功能需要注册账号吗？", ru: "Нужна ли учётная запись для использования чата?", ja: "チャットを利用するにはアカウントが必要ですか？", de: "Brauche ich ein Konto, um den Chat zu nutzen?"};
TRANS["Generate an API key and use 100+ models via one endpoint. Full OpenAI-compatible API."] = {en: "Generate an API key and use 100+ models via one endpoint. Full OpenAI-compatible API.", "zh-CN": "生成 API 密钥，通过一个端点使用 100+ 模型。完全兼容 OpenAI 的 API。", ru: "Создайте API-ключ и используйте 100+ моделей через одну конечную точку. Полностью совместимый с OpenAI API.", ja: "APIキーを生成して、1つのエンドポイントから100以上のモデルを利用。完全なOpenAI互換API。", de: "Generieren Sie einen API-Schlüssel und nutzen Sie 100+ Modelle über einen Endpunkt. Vollständig OpenAI-kompatible API."};
TRANS["All API requests require an API key passed via the"] = {en: "All API requests require an API key passed via the", "zh-CN": "所有API请求都需要通过以下方式传递API密钥", ru: "Все API-запросы требуют передачи API-ключа через", ja: "すべてのAPIリクエストにはAPIキーを次の方法で渡す必要があります", de: "Alle API-Anfragen erfordern einen API-Schlüssel, der über die"};
TRANS["Pass your key in the"] = {en: "Pass your key in the", "zh-CN": "在以下位置传递您的密钥", ru: "Передавайте ключ в", ja: "キーを次の場所で渡してください", de: "Übergeben Sie Ihren Schlüssel in der"};
TRANS["You can reach us at"] = {en: "You can reach us at", "zh-CN": "您可以通过以下方式联系我们", ru: "Вы можете связаться с нами по", ja: "お問い合わせはこちらまで", de: "Sie erreichen uns unter"};
TRANS["Full pricing:"] = {en: "Full pricing:", "zh-CN": "完整定价：", ru: "Полные цены:", ja: "完全な料金：", de: "Vollständige Preisgestaltung:"};
TRANS["For custom pricing."] = {en: "For custom pricing.", "zh-CN": "定制价格请联系我们", ru: "Для индивидуальных цен.", ja: "カスタム料金については。", de: "Für individuelle Preise."};
TRANS["Visit the Models page for the complete, searchable list with live pricing."] = {en: "Visit the Models page for the complete, searchable list with live pricing.", "zh-CN": "访问模型页面查看完整、可搜索的列表和实时定价。", ru: "Посетите страницу Models для получения полного, доступного для поиска списка с актуальными ценами.", ja: "モデルページで、検索可能な完全なリストと最新の料金を確認してください。", de: "Besuchen Sie die Modelle-Seite für die vollständige, durchsuchbare Liste mit Live-Preisen."};
TRANS["Generate an API key from your Dashboard, then use our OpenAI-compatible endpoint:"] = {en: "Generate an API key from your Dashboard, then use our OpenAI-compatible endpoint:", "zh-CN": "从仪表盘生成API密钥，然后使用我们的OpenAI兼容端点：", ru: "Сгенерируйте API-ключ в панели управления, затем используйте нашу совместимую с OpenAI конечную точку:", ja: "ダッシュボードからAPIキーを生成し、OpenAI互換のエンドポイントを使用してください：", de: "Generieren Sie einen API-Schlüssel über Ihr Dashboard und verwenden Sie dann unseren OpenAI-kompatiblen Endpunkt:"};
TRANS["Top up with Stripe, Paystack (mobile money/bank), or crypto."] = {en: "Top up with Stripe, Paystack (mobile money/bank), or crypto.", "zh-CN": "通过Stripe、Paystack（移动货币/银行）或加密货币充值。", ru: "Пополняйте через Stripe, Paystack (мобильные деньги/банк) или криптовалюту.", ja: "Stripe、Paystack（モバイルマネー/銀行）、または暗号通貨でチャージ。", de: "Aufladen über Stripe, Paystack (Mobile Money/Bank) oder Krypto."};
TRANS["Pay in NGN, GHS, KES via Paystack, USD via Stripe, or crypto (USDT/BTC/ETH). Africa-first."] = {en: "Pay in NGN, GHS, KES via Paystack, USD via Stripe, or crypto (USDT/BTC/ETH). Africa-first.", "zh-CN": "通过Paystack用NGN、GHS、KES支付，通过Stripe用USD支付，或加密货币（USDT/BTC/ETH）。非洲优先。", ru: "Оплачивайте в NGN, GHS, KES через Paystack, USD через Stripe или криптовалютой (USDT/BTC/ETH). В первую очередь для Африки.", ja: "Paystack経由でNGN、GHS、KES、Stripe経由でUSD、または暗号通貨（USDT/BTC/ETH）で支払い。アフリカファースト。", de: "Zahlen Sie in NGN, GHS, KES über Paystack, USD über Stripe oder Krypto (USDT/BTC/ETH). Afrika-first."};
TRANS["Make AI as easy to buy as electricity. Pay for what you use, use any model, switch anytime."] = {en: "Make AI as easy to buy as electricity. Pay for what you use, use any model, switch anytime.", "zh-CN": "让AI像买电一样简单。按使用量付费，使用任何模型，随时切换。", ru: "Сделайте покупку ИИ такой же простой, как покупка электроэнергии. Платите за использование, используйте любую модель, переключайтесь в любой момент.", ja: "AIを電気のように簡単に購入できるように。使った分だけ支払い、どんなモデルでも使い、いつでも切り替え可能。", de: "Machen Sie KI so einfach zu kaufen wie Strom. Bezahlen Sie für das, was Sie nutzen, verwenden Sie jedes Modell, wechseln Sie jederzeit."};
TRANS["No monthly subscriptions expiring unused. Buy tokens once, spend whenever. They never expire."] = {en: "No monthly subscriptions expiring unused. Buy tokens once, spend whenever. They never expire.", "zh-CN": "没有月付订阅过期浪费。一次购买代币，随时使用。永不过期。", ru: "Никаких ежемесячных подписок, сгорающих без использования. Купите токены один раз, тратьте когда угодно. Они никогда не истекают.", ja: "使わずに期限切れになる月額サブスクリプションはありません。トークンを一度購入すれば、いつでも使えます。期限切れなし。", de: "Keine monatlichen Abos, die ungenutzt verfallen. Token einmal kaufen, jederzeit ausgeben. Sie verfallen nie."};
TRANS["Track balance, usage per model, and spending from your dashboard. Top up anytime — tokens never expire."] = {en: "Track balance, usage per model, and spending from your dashboard. Top up anytime — tokens never expire.", "zh-CN": "从仪表盘追踪余额、各模型使用量和支出。随时充值——代币永不过期。", ru: "Отслеживайте баланс, использование по моделям и расходы в панели управления. Пополняйте в любое время — токены никогда не истекают.", ja: "ダッシュボードで残高、モデルごとの使用量、支出を追跡。いつでもチャージ — トークンは期限切れなし。", de: "Verfolgen Sie Guthaben, Nutzung pro Modell und Ausgaben über Ihr Dashboard. Laden Sie jederzeit auf — Token verfallen nie."};
TRANS["One balance, 100+ models, 56 providers. No subscriptions."] = {en: "One balance, 100+ models, 56 providers. No subscriptions.", "zh-CN": "一个余额，100+ 模型，56 家供应商。无需订阅。", ru: "Один баланс, 100+ моделей, 56 провайдеров. Без подписок.", ja: "1つの残高、100以上のモデル、56のプロバイダー。サブスクリプション不要。", de: "Ein Guthaben, 100+ Modelle, 56 Anbieter. Keine Abos."};

TRANS["One Balance. 100+ Models. No Subscriptions. Pay-as-you-go access to the world's most sophisticated AI models through a single, elegant API."] = {en: "One Balance. 100+ Models. No Subscriptions. Pay-as-you-go access to the world's most sophisticated AI models through a single, elegant API.", "zh-CN": "一个余额。100+ 模型。无订阅。按需付费，通过一个优雅的单一 API 访问全球最先进的 AI 模型。", ru: "Один баланс. 100+ моделей. Без подписок. Оплата по мере использования — доступ к самым передовым AI-моделям мира через единое элегантное API.", ja: "1つのバランス。100以上のモデル。サブスクリプション不要。従量課金制で、世界で最も洗練されたAIモデルに1つのエレガントなAPIでアクセス。", de: "Ein Guthaben. 100+ Modelle. Keine Abos. Nutzungsabhängige Bezahlung für die anspruchsvollsten KI-Modelle der Welt über eine einzige, elegante API."};
TRANS["Pay with Crypto, Mobile Money & Cards"] = {en: "Pay with Crypto, Mobile Money & Cards", "zh-CN": "使用加密货币、移动支付和银行卡支付", ru: "Оплата криптовалютой, мобильными деньгами и картами", ja: "暗号通貨、モバイルマネー、カードで支払う", de: "Zahlen Sie mit Krypto, Mobile Money und Karten"};
TRANS["Sign in to your GlbTOKEN account"] = {en: "Sign in to your GlbTOKEN account", "zh-CN": "登录您的 GlbTOKEN 账户", ru: "Войдите в свою учетную запись GlbTOKEN", ja: "GlbTOKENアカウントにサインイン", de: "Melden Sie sich bei Ihrem GlbTOKEN-Konto an"};
TRANS["Reset Password"] = {en: "Reset Password", "zh-CN": "重置密码", ru: "Сбросить пароль", ja: "パスワードをリセット", de: "Passwort zurücksetzen"};
TRANS["Enter your email and we'll send a reset link."] = {en: "Enter your email and we'll send a reset link.", "zh-CN": "输入您的邮箱，我们将发送重置链接。", ru: "Введите ваш email, и мы отправим ссылку для сброса.", ja: "メールアドレスを入力してください。リセットリンクをお送りします。", de: "Geben Sie Ihre E-Mail-Adresse ein, wir senden Ihnen einen Link zum Zurücksetzen."};
TRANS["Access the world's most sophisticated AI models through a single, elegant API. Designed for those who demand excellence."] = {en: "Access the world's most sophisticated AI models through a single, elegant API. Designed for those who demand excellence.", "zh-CN": "通过一个优雅的单一 API 访问全球最先进的 AI 模型。专为追求卓越的用户而设计。", ru: "Получите доступ к самым передовым AI-моделям мира через единое элегантное API. Создано для тех, кто требует совершенства.", ja: "世界で最も洗練されたAIモデルに、1つのエレガントなAPIでアクセス。卓越性を求める人のために設計されました。", de: "Greifen Sie über eine einzige, elegante API auf die anspruchsvollsten KI-Modelle der Welt zu. Entwickelt für alle, die Exzellenz verlangen."};
TRANS["Choose a model from the left and start chatting. I can help with code, writing, analysis, research, and more \u2014 all for free."] = {en: "Choose a model from the left and start chatting. I can help with code, writing, analysis, research, and more \u2014 all for free.", "zh-CN": "从左侧选择一个模型开始聊天。我可以帮助您处理代码、写作、分析、研究等 \u2014 全部免费。", ru: "Выберите модель слева и начните чат. Я помогу с кодом, текстами, анализом, исследованиями и многим другим \u2014 всё бесплатно.", ja: "左側からモデルを選んでチャットを開始。コード、ライティング、分析、リサーチなど、すべて無料でお手伝いします。", de: "Wählen Sie links ein Modell aus und starten Sie den Chat. Ich helfe bei Code, Texten, Analysen, Recherchen und mehr \u2014 alles kostenlos."};
TRANS["support chat."] = {en: "support chat.", "zh-CN": "支持聊天。", ru: "чат поддержки.", ja: "サポートチャット。", de: "Support-Chat."};
TRANS["One Token Balance."] = {en: "One Token Balance.", "zh-CN": "统一代币余额。", ru: "Один токен-баланс.", ja: "1つのトークンバランス。", de: "Ein Token-Guthaben."};
TRANS["Three payment channels:"] = {en: "Three payment channels:", "zh-CN": "三种支付方式：", ru: "Три способа оплаты:", ja: "3つの支払い方法：", de: "Drei Zahlungswege:"};
TRANS["All models with pricing & version info."] = {en: "All models with pricing & version info.", "zh-CN": "所有模型的价格和版本信息。", ru: "Все модели с ценами и информацией о версиях.", ja: "すべてのモデルの料金とバージョン情報。", de: "Alle Modelle mit Preis- und Versionsinformationen."};
TRANS["List all available models with pricing:"] = {en: "List all available models with pricing:", "zh-CN": "列出所有可用模型及其价格：", ru: "Список всех доступных моделей с ценами:", ja: "利用可能な全モデルと料金を表示：", de: "Alle verfügbaren Modelle mit Preisen auflisten:"};
TRANS["Rate limits depend on your account tier:"] = {en: "Rate limits depend on your account tier:", "zh-CN": "速率限制取决于您的账户等级：", ru: "Лимиты запросов зависят от вашего тарифного плана:", ja: "レート制限はアカウントのティアによって異なります：", de: "Die Ratenbegrenzung hängt von Ihrem Kontotarif ab:"};
TRANS["Can I use GlbTOKEN for commercial projects?"] = {en: "Can I use GlbTOKEN for commercial projects?", "zh-CN": "我可以将 GlbTOKEN 用于商业项目吗？", ru: "Можно ли использовать GlbTOKEN в коммерческих проектах?", ja: "GlbTOKENを商用プロジェクトで使用できますか？", de: "Kann ich GlbTOKEN für kommerzielle Projekte verwenden?"};
TRANS["New Models Added: GPT-5.5 & Claude Sonnet 5"] = {en: "New Models Added: GPT-5.5 & Claude Sonnet 5", "zh-CN": "新增模型：GPT-5.5 和 Claude Sonnet 5", ru: "Добавлены новые модели: GPT-5.5 и Claude Sonnet 5", ja: "新モデル追加：GPT-5.5 と Claude Sonnet 5", de: "Neue Modelle hinzugefügt: GPT-5.5 & Claude Sonnet 5"};
TRANS["Introducing GlbTOKEN \u2014 One Balance for All AI"] = {en: "Introducing GlbTOKEN \u2014 One Balance for All AI", "zh-CN": "隆重推出 GlbTOKEN \u2014 统一余额，尽享所有 AI", ru: "Представляем GlbTOKEN \u2014 Один баланс для всех AI", ja: "GlbTOKENのご紹介 \u2014 すべてのAIに1つのバランス", de: "Einführung von GlbTOKEN \u2014 Ein Guthaben für alle KI"};
TRANS["Paystack Integration: African Payments Now Live"] = {en: "Paystack Integration: African Payments Now Live", "zh-CN": "Paystack 集成：非洲支付现已上线", ru: "Интеграция с Paystack: Африканские платежи теперь доступны", ja: "Paystack統合：アフリカでの支払いが利用可能に", de: "Paystack-Integration: Afrikanische Zahlungen jetzt live"};
TRANS["Developer API Launched: 100+ Models, One Endpoint"] = {en: "Developer API Launched: 100+ Models, One Endpoint", "zh-CN": "开发者 API 发布：100+ 模型，一个端点", ru: "Запущено Developer API: 100+ моделей, одна конечная точка", ja: "デベロッパーAPI公開：100以上のモデル、1つのエンドポイント", de: "Developer-API gestartet: 100+ Modelle, ein Endpunkt"};
TRANS["Follow us for updates, announcements, and community support."] = {en: "Follow us for updates, announcements, and community support.", "zh-CN": "关注我们获取更新、公告和社区支持。", ru: "Следите за нами, чтобы получать обновления, анонсы и поддержку сообщества.", ja: "最新情報、お知らせ、コミュニティサポートについてはフォローしてください。", de: "Folgen Sie uns für Updates, Ankündigungen und Community-Support."};
TRANS["Chat with our AI assistant instantly \u2014 click the 💬 icon in the bottom-right corner."] = {en: "Chat with our AI assistant instantly \u2014 click the 💬 icon in the bottom-right corner.", "zh-CN": "立即与我们的 AI 助手聊天 \u2014 点击右下角的 💬 图标。", ru: "Общайтесь с нашим AI-ассистентом мгновенно \u2014 нажмите на иконку 💬 в правом нижнем углу.", ja: "AIアシスタントとすぐにチャット \u2014 右下の💬アイコンをクリック。", de: "Sofort mit unserem KI-Assistenten chatten \u2014 klicken Sie auf das 💬-Symbol in der unteren rechten Ecke."};
TRANS["Click the 💬 button in the bottom-right corner"] = {en: "Click the 💬 button in the bottom-right corner", "zh-CN": "点击右下角的 💬 按钮", ru: "Нажмите кнопку 💬 в правом нижнем углу", ja: "右下の💬ボタンをクリック", de: "Klicken Sie auf die 💬-Schaltfläche in der unteren rechten Ecke"};
TRANS["Sign up with email, Google, or GitHub. 30 seconds, no card needed. Select your country for localized payment options."] = {en: "Sign up with email, Google, or GitHub. 30 seconds, no card needed. Select your country for localized payment options.", "zh-CN": "使用邮箱、Google 或 GitHub 注册。30 秒，无需银行卡。选择您的国家以获取本地化支付选项。", ru: "Зарегистрируйтесь по email, Google или GitHub. 30 секунд, карта не нужна. Выберите свою страну для локализованных вариантов оплаты.", ja: "メール、Google、またはGitHubでサインアップ。30秒、カード不要。お住まいの国を選択して、ローカライズされた支払いオプションを表示。", de: "Registrieren Sie sich mit E-Mail, Google oder GitHub. 30 Sekunden, keine Karte nötig. Wählen Sie Ihr Land für lokalisierte Zahlungsoptionen."};
TRANS["Go to Dashboard"] = {en: "Go to Dashboard", "zh-CN": "前往仪表盘", ru: "Перейти в панель управления", ja: "ダッシュボードへ", de: "Zum Dashboard"};
TRANS["View all 100+ \u2192"] = {en: "View all 100+ \u2192", "zh-CN": "查看全部 100+ \u2192", ru: "Посмотреть все 100+ \u2192", ja: "すべて見る 100+ \u2192", de: "Alle 100+ anzeigen \u2192"};
TRANS["About GlbTOKEN"] = {en: "About GlbTOKEN", "zh-CN": "关于 GlbTOKEN", ru: "О GlbTOKEN", ja: "GlbTOKENについて", de: "Über GlbTOKEN"};
TRANS["Today"] = {en: "Today", "zh-CN": "今天", ru: "Сегодня", ja: "今日", de: "Heute"};
TRANS["This Week"] = {en: "This Week", "zh-CN": "本周", ru: "Эта неделя", ja: "今週", de: "Diese Woche"};
TRANS["This Month"] = {en: "This Month", "zh-CN": "本月", ru: "Этот месяц", ja: "今月", de: "Diesen Monat"};
TRANS["Custom Range"] = {en: "Custom Range", "zh-CN": "自定义范围", ru: "Свой диапазон", ja: "カスタム範囲", de: "Benutzerdefinierter Bereich"};
TRANS["Apply"] = {en: "Apply", "zh-CN": "应用", ru: "Применить", ja: "適用", de: "Anwenden"};
TRANS["Cancel"] = {en: "Cancel", "zh-CN": "取消", ru: "Отмена", ja: "キャンセル", de: "Abbrechen"};
