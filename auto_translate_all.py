#!/usr/bin/env python3
"""
Comprehensive auto-translation script for GlbTOKEN.
Extracts all visible English text from HTML files, filters against existing TRANS keys,
generates translations for zh-CN, ru, ja, de, and appends to translations.js.
"""
import os
import re
import html as html_mod
import subprocess
from pathlib import Path

PROJECT_DIR = os.path.expanduser("~/projects/glbtoken")
TRANS_FILE = os.path.join(PROJECT_DIR, "translations.js")

ALL_HTML_FILES = [
    "index.html", "home.html", "about.html", "blog.html", "contact.html",
    "faq.html", "how.html", "models.html", "pricing.html", "privacy.html",
    "terms.html", "refund.html", "blog-article-1.html", "blog-article-2.html",
    "blog-article-3.html", "blog-article-4.html", "blog-article-5.html",
    "blog-article-6.html", "notifications.html", "settings.html",
    "history.html", "billing.html", "apikeys.html", "playground.html",
    "referral.html", "team.html", "topup.html", "presets.html",
    "login.html", "register.html", "dashboard.html",
]

SKIP_CLASSES = {
    "notranslate", "lang-selector", "lang-menu", "lang-option",
    "lang-btn", "lang-btn-mobile", "logo-glb", "logo-token",
    "nav-logo", "trust-badge", "star", "tm-dot", "tm-arrow",
    "copying", "dash-sidebar-toggle",
}
SKIP_TAGS = {"script", "style", "svg", "code", "pre", "option", "select",
             "input", "textarea"}

STANDARD_WORDS = {
    "API", "GT", "USD", "AI", "SSE", "CSV", "URL", "HTML", "CSS", "JS",
    "JSON", "SDK", "CLI", "GUI", "HTTP", "HTTPS", "IP", "DNS", "REST",
    "OpenAI", "Anthropic", "Google", "Meta", "DeepSeek", "Mistral",
    "Stripe", "Paystack", "GitHub", "GlbTOKEN", "Glb", "TOKEN",
    "github.com", "glbtoken.com", "Railway", "Cloudflare",
    "GPT-4o", "GPT-4", "Claude 3.5", "Claude 3", "Gemini 2.0",
    "Llama 3.1", "Llama 4", "DeepSeek V3", "Mistral Large",
    "Sonnet", "Maverick", "Opus", "Turbo", "Flash", "GPT",
    "Token", "Tokens", "sk-glt",
    "base_url", "api_key", "Authorization", "Bearer", "max_tokens",
    "temperature", "top_p", "frequency_penalty", "presence_penalty",
    "stream", "role", "content", "model", "messages",
    "EN", "DE", "RU", "JP", "notranslate",
}


def extract_text_from_html(filepath):
    """Extract visible text nodes from an HTML file, skipping technical content."""
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()
    
    # Remove script and style blocks
    content = re.sub(r'<script[^>]*>.*?</script>', '', content, flags=re.DOTALL | re.IGNORECASE)
    content = re.sub(r'<style[^>]*>.*?</style>', '', content, flags=re.DOTALL | re.IGNORECASE)
    content = re.sub(r'<svg[^>]*>.*?</svg>', '', content, flags=re.DOTALL | re.IGNORECASE)
    content = re.sub(r'<pre[^>]*>.*?</pre>', '', content, flags=re.DOTALL | re.IGNORECASE)
    content = re.sub(r'<code[^>]*>.*?</code>', '', content, flags=re.DOTALL | re.IGNORECASE)
    
    # Remove HTML tags, keep text
    text = re.sub(r'<[^>]+>', ' ', content)
    text = html_mod.unescape(text)
    
    # Split into lines and clean
    lines = []
    for line in text.split('\n'):
        line = line.strip()
        if len(line) < 3 or len(line) > 200:
            continue
        if re.match(r'^[\d\s\.,%$₿€£¥₦+\-*/=<>()\[\]{}|&^~@#:;"\'\\\\]+$', line):
            continue
        if re.match(r'^(https?://|/|\.\.|\./|[a-zA-Z]:\\\\|sk-glt)', line):
            continue
        if sum(1 for c in line if c in '{}[]<>()|&^#$@=+/\\"\'') > len(line) * 0.3:
            continue
        lines.append(line)
    
    return lines


def load_existing_translations():
    """Load existing TRANS and I18N_MIXED keys from translations.js."""
    if not os.path.exists(TRANS_FILE):
        return set(), set()
    
    with open(TRANS_FILE, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()
    
    trans_keys = set(re.findall(r'TRANS\["([^"]+)"\]', content))
    trans_keys.update(re.findall(r"TRANS\['([^']+)'\]", content))
    mixed_keys = set(re.findall(r'I18N_MIXED\["([^"]+)"\]', content))
    mixed_keys.update(re.findall(r"I18N_MIXED\['([^']+)'\]", content))
    
    return trans_keys, mixed_keys, content


# Comprehensive translation map for ALL dashboard/UI strings
COMPREHENSIVE_TRANSLATIONS = {
    # === Dashboard Overview ===
    "Token usage overview": {
        "zh-CN": "代币使用概览", "ru": "Обзор использования токенов",
        "ja": "トークン使用状況概要", "de": "Token-Nutzungsübersicht"
    },
    "Available Balance": {
        "zh-CN": "可用余额", "ru": "Доступный баланс",
        "ja": "利用可能残高", "de": "Verfügbares Guthaben"
    },
    "Total Spent": {
        "zh-CN": "总消费", "ru": "Всего потрачено",
        "ja": "総消費", "de": "Gesamtausgaben"
    },
    "Models Used": {
        "zh-CN": "已用模型", "ru": "Использовано моделей",
        "ja": "使用モデル数", "de": "Verwendete Modelle"
    },
    "API Requests": {
        "zh-CN": "API 请求", "ru": "API-запросы",
        "ja": "API リクエスト", "de": "API-Anfragen"
    },
    "API Keys Active": {
        "zh-CN": "活跃 API 密钥", "ru": "Активных ключей API",
        "ja": "アクティブな API キー", "de": "Aktive API-Schlüssel"
    },
    "Days Active": {
        "zh-CN": "活跃天数", "ru": "Дней активности",
        "ja": "アクティブ日数", "de": "Aktive Tage"
    },
    "Lifetime": {
        "zh-CN": "总计", "ru": "За всё время",
        "ja": "全期間", "de": "Gesamte Laufzeit"
    },
    "All time": {
        "zh-CN": "全部时间", "ru": "За всё время",
        "ja": "全期間", "de": "Gesamter Zeitraum"
    },
    "Total calls": {
        "zh-CN": "总调用次数", "ru": "Всего вызовов",
        "ja": "総呼び出し数", "de": "Gesamte Aufrufe"
    },
    "tokens consumed": {
        "zh-CN": "代币已消耗", "ru": "токенов потреблено",
        "ja": "消費済みトークン", "de": "Tokens verbraucht"
    },
    "lifetime spend": {
        "zh-CN": "累计消费", "ru": "расходы за всё время",
        "ja": "総支出", "de": "Gesamtausgaben"
    },
    "Usage by Model": {
        "zh-CN": "按模型用量", "ru": "Использование по моделям",
        "ja": "モデル別使用量", "de": "Nutzung nach Modell"
    },
    "Activity Timeline": {
        "zh-CN": "活动时间线", "ru": "Хронология активности",
        "ja": "アクティビティタイムライン", "de": "Aktivitätszeitstrahl"
    },
    "Recent Transactions": {
        "zh-CN": "最近交易", "ru": "Последние транзакции",
        "ja": "最近の取引", "de": "Letzte Transaktionen"
    },
    "Last 5": {
        "zh-CN": "最近 5 条", "ru": "Последние 5",
        "ja": "最新5件", "de": "Letzte 5"
    },
    "No transactions yet": {
        "zh-CN": "暂无交易记录", "ru": "Пока нет транзакций",
        "ja": "取引はまだありません", "de": "Noch keine Transaktionen"
    },
    "Cost Breakdown by Model": {
        "zh-CN": "按模型费用明细", "ru": "Разбивка затрат по моделям",
        "ja": "モデル別コスト明細", "de": "Kostenaufschlüsselung nach Modell"
    },
    "Error Rate Monitoring": {
        "zh-CN": "错误率监控", "ru": "Мониторинг ошибок",
        "ja": "エラー率監視", "de": "Fehlerraten-Überwachung"
    },
    "Response Time by Model": {
        "zh-CN": "按模型响应时间", "ru": "Время ответа по моделям",
        "ja": "モデル別応答時間", "de": "Antwortzeit nach Modell"
    },
    "Model Speed Comparison": {
        "zh-CN": "模型速度对比", "ru": "Сравнение скорости моделей",
        "ja": "モデル速度比較", "de": "Modellgeschwindigkeitsvergleich"
    },
    "Performance tiers": {
        "zh-CN": "性能等级", "ru": "Уровни производительности",
        "ja": "パフォーマンスレベル", "de": "Leistungsstufen"
    },
    "Avg Response Time": {
        "zh-CN": "平均响应时间", "ru": "Среднее время ответа",
        "ja": "平均応答時間", "de": "Durchschnittliche Antwortzeit"
    },
    "Max Response Time": {
        "zh-CN": "最大响应时间", "ru": "Макс. время ответа",
        "ja": "最大応答時間", "de": "Max. Antwortzeit"
    },
    "Avg Tokens/sec": {
        "zh-CN": "平均代币/秒", "ru": "Среднее токенов/сек",
        "ja": "平均トークン/秒", "de": "Durchschn. Tokens/Sek."
    },
    "Avg Latency": {
        "zh-CN": "平均延迟", "ru": "Средняя задержка",
        "ja": "平均レイテンシー", "de": "Durchschnittliche Latenz"
    },
    "Reliability %": {
        "zh-CN": "可靠性 %", "ru": "Надежность %",
        "ja": "信頼性 %", "de": "Zuverlässigkeit %"
    },
    "Call Count": {
        "zh-CN": "调用次数", "ru": "Количество вызовов",
        "ja": "呼び出し数", "de": "Anzahl Aufrufe"
    },
    "Speed Tier": {
        "zh-CN": "速度等级", "ru": "Уровень скорости",
        "ja": "速度レベル", "de": "Geschwindigkeitsstufe"
    },
    "Loading activity...": {
        "zh-CN": "正在加载活动...", "ru": "Загрузка активности...",
        "ja": "アクティビティを読み込み中...", "de": "Aktivität wird geladen..."
    },
    "Loading keys...": {
        "zh-CN": "正在加载密钥...", "ru": "Загрузка ключей...",
        "ja": "キーを読み込み中...", "de": "Schlüssel werden geladen..."
    },
    "No data yet": {
        "zh-CN": "暂无数据", "ru": "Нет данных",
        "ja": "データがまだありません", "de": "Noch keine Daten"
    },
    "Offline": {
        "zh-CN": "离线", "ru": "Офлайн",
        "ja": "オフライン", "de": "Offline"
    },
    "Per-model spend": {
        "zh-CN": "各模型花费", "ru": "Затраты по моделям",
        "ja": "モデル別支出", "de": "Ausgaben pro Modell"
    },
    "Track API errors": {
        "zh-CN": "追踪 API 错误", "ru": "Отслеживание ошибок API",
        "ja": "APIエラーを追跡", "de": "API-Fehler verfolgen"
    },
    "Speed indicators": {
        "zh-CN": "速度指标", "ru": "Индикаторы скорости",
        "ja": "速度インジケーター", "de": "Geschwindigkeitsindikatoren"
    },
    "Per request": {
        "zh-CN": "每次请求", "ru": "За запрос",
        "ja": "リクエストあたり", "de": "Pro Anfrage"
    },
    "Percentage": {
        "zh-CN": "百分比", "ru": "Процент",
        "ja": "パーセンテージ", "de": "Prozentsatz"
    },
    "Time": {
        "zh-CN": "时间", "ru": "Время",
        "ja": "時間", "de": "Zeit"
    },
    "Avg cost/call": {
        "zh-CN": "平均成本/调用", "ru": "Средняя стоимость/вызов",
        "ja": "平均コスト/コール", "de": "Durchschn. Kosten/Aufruf"
    },
    "Token Usage": {
        "zh-CN": "代币用量", "ru": "Использование токенов",
        "ja": "トークン使用量", "de": "Token-Nutzung"
    },
    "Total Cost": {
        "zh-CN": "总成本", "ru": "Общая стоимость",
        "ja": "総コスト", "de": "Gesamtkosten"
    },
    "Your Models": {
        "zh-CN": "您的模型", "ru": "Ваши модели",
        "ja": "あなたのモデル", "de": "Ihre Modelle"
    },
    "via New API": {
        "zh-CN": "通过 New API", "ru": "через New API",
        "ja": "New API経由", "de": "über New API"
    },
    "Connect New API to see available models.": {
        "zh-CN": "连接 New API 以查看可用模型。", "ru": "Подключите New API, чтобы увидеть доступные модели.",
        "ja": "New APIに接続して利用可能なモデルを表示。", "de": "Verbinden Sie New API, um verfügbare Modelle anzuzeigen."
    },

    # === Billing ===
    "Billing": {"zh-CN": "账单", "ru": "Оплата", "ja": "請求", "de": "Abrechnung"},
    "Payments": {"zh-CN": "付款", "ru": "Платежи", "ja": "支払い", "de": "Zahlungen"},
    "Manage invoices, payment methods, and billing summary.": {
        "zh-CN": "管理发票、支付方式和账单汇总。", "ru": "Управляйте счетами, способами оплаты и сводкой.",
        "ja": "請求書、支払い方法、請求サマリーを管理。", "de": "Verwalten Sie Rechnungen, Zahlungsmethoden und Abrechnungsübersicht."
    },
    "Billing Summary": {
        "zh-CN": "账单汇总", "ru": "Сводка по оплате",
        "ja": "請求サマリー", "de": "Abrechnungsübersicht"
    },
    "Last Invoice Date": {
        "zh-CN": "上次发票日期", "ru": "Дата последнего счета",
        "ja": "最終請求日", "de": "Letztes Rechnungsdatum"
    },
    "Top Payment Method": {
        "zh-CN": "主要支付方式", "ru": "Основной способ оплаты",
        "ja": "主な支払い方法", "de": "Hauptzahlungsmethode"
    },
    "Payment Methods": {
        "zh-CN": "支付方式", "ru": "Способы оплаты",
        "ja": "支払い方法", "de": "Zahlungsmethoden"
    },
    "No payment methods saved": {
        "zh-CN": "未保存支付方式", "ru": "Нет сохраненных способов оплаты",
        "ja": "支払い方法が保存されていません", "de": "Keine Zahlungsmethoden gespeichert"
    },
    "Add a card or mobile money method to get started.": {
        "zh-CN": "添加银行卡或移动支付方式以开始使用。", "ru": "Добавьте карту или мобильный платеж.",
        "ja": "カードまたはモバイルマネーを追加して開始。", "de": "Fügen Sie eine Karte oder Mobile Money hinzu."
    },
    "+ Add Payment Method": {
        "zh-CN": "+ 添加支付方式", "ru": "+ Добавить способ оплаты",
        "ja": "+ 支払い方法を追加", "de": "+ Zahlungsmethode hinzufügen"
    },
    "Invoices": {
        "zh-CN": "发票", "ru": "Счета", "ja": "請求書", "de": "Rechnungen"
    },
    "Amount": {"zh-CN": "金额", "ru": "Сумма", "ja": "金額", "de": "Betrag"},
    "Payment Method": {
        "zh-CN": "支付方式", "ru": "Способ оплаты",
        "ja": "支払い方法", "de": "Zahlungsmethode"
    },
    "Tokens Added": {
        "zh-CN": "添加代币", "ru": "Добавлено токенов",
        "ja": "追加トークン", "de": "Hinzugefügte Tokens"
    },
    "Status": {
        "zh-CN": "状态", "ru": "Статус", "ja": "ステータス", "de": "Status"
    },
    "Receipt": {
        "zh-CN": "收据", "ru": "Квитанция", "ja": "領収書", "de": "Quittung"
    },
    "No invoices yet": {
        "zh-CN": "暂无发票", "ru": "Пока нет счетов",
        "ja": "請求書はまだありません", "de": "Noch keine Rechnungen"
    },
    "+ Top Up Now": {
        "zh-CN": "+ 立即充值", "ru": "+ Пополнить сейчас",
        "ja": "+ 今すぐチャージ", "de": "+ Jetzt aufladen"
    },
    "Refresh": {
        "zh-CN": "刷新", "ru": "Обновить",
        "ja": "更新", "de": "Aktualisieren"
    },
    "Total Spent": {
        "zh-CN": "总消费", "ru": "Всего потрачено",
        "ja": "総消費", "de": "Gesamtausgaben"
    },
    "Date": {"zh-CN": "日期", "ru": "Дата", "ja": "日付", "de": "Datum"},
    "Detail": {"zh-CN": "详情", "ru": "Детали", "ja": "詳細", "de": "Details"},
    "Type": {"zh-CN": "类型", "ru": "Тип", "ja": "種類", "de": "Art"},

    # === Settings ===
    "Settings": {"zh-CN": "设置", "ru": "Настройки", "ja": "設定", "de": "Einstellungen"},
    "Account": {"zh-CN": "账户", "ru": "Аккаунт", "ja": "アカウント", "de": "Konto"},
    "Profile": {"zh-CN": "个人资料", "ru": "Профиль", "ja": "プロフィール", "de": "Profil"},
    "Security": {"zh-CN": "安全", "ru": "Безопасность", "ja": "セキュリティ", "de": "Sicherheit"},
    "Notifications": {
        "zh-CN": "通知", "ru": "Уведомления", "ja": "通知", "de": "Benachrichtigungen"
    },
    "Two-Factor Auth": {
        "zh-CN": "两步验证", "ru": "Двухфакторная аутентификация",
        "ja": "二要素認証", "de": "Zwei-Faktor-Authentifizierung"
    },
    "Add an extra layer of security": {
        "zh-CN": "增加额外的安全层", "ru": "Добавьте дополнительный уровень безопасности",
        "ja": "追加のセキュリティレイヤー", "de": "Zusätzliche Sicherheitsebene"
    },
    "Enable": {
        "zh-CN": "启用", "ru": "Включить", "ja": "有効にする", "de": "Aktivieren"
    },
    "Email Notifications": {
        "zh-CN": "邮件通知", "ru": "Email-уведомления",
        "ja": "メール通知", "de": "E-Mail-Benachrichtigungen"
    },
    "Receive account & marketing emails": {
        "zh-CN": "接收账户和营销邮件", "ru": "Получать письма об аккаунте и маркетинговые",
        "ja": "アカウントおよびマーケティングメールを受け取る", "de": "Konto- und Marketing-E-Mails erhalten"
    },
    "Low Balance Alerts": {
        "zh-CN": "低余额提醒", "ru": "Уведомления о низком балансе",
        "ja": "残高不足アラート", "de": "Niedrige-Guthaben-Benachrichtigungen"
    },
    "Get notified when your balance runs low": {
        "zh-CN": "余额不足时收到通知", "ru": "Получайте уведомления, когда баланс на исходе",
        "ja": "残高が少なくなったら通知", "de": "Benachrichtigt werden, wenn das Guthaben zur Neige geht"
    },
    "Login Alerts": {
        "zh-CN": "登录提醒", "ru": "Уведомления о входе",
        "ja": "ログインアラート", "de": "Anmeldebenachrichtigungen"
    },
    "Email when a new device signs in": {
        "zh-CN": "新设备登录时发送邮件", "ru": "Email при входе с нового устройства",
        "ja": "新しいデバイスからのログイン時にメール", "de": "E-Mail bei Anmeldung von einem neuen Gerät"
    },
    "Save Notification Preferences": {
        "zh-CN": "保存通知偏好", "ru": "Сохранить настройки уведомлений",
        "ja": "通知設定を保存", "de": "Benachrichtigungseinstellungen speichern"
    },
    "Notification History": {
        "zh-CN": "通知历史", "ru": "История уведомлений",
        "ja": "通知履歴", "de": "Benachrichtigungsverlauf"
    },
    "Mark All as Read": {
        "zh-CN": "全部标记为已读", "ru": "Отметить все как прочитанные",
        "ja": "すべて既読にする", "de": "Alle als gelesen markieren"
    },
    "Top-up Confirmed": {
        "zh-CN": "充值确认", "ru": "Пополнение подтверждено",
        "ja": "チャージ完了", "de": "Aufladung bestätigt"
    },
    "Low Balance Warning": {
        "zh-CN": "余额不足警告", "ru": "Предупреждение о низком балансе",
        "ja": "残高不足の警告", "de": "Warnung bei niedrigem Guthaben"
    },
    "API Key Created": {
        "zh-CN": "API 密钥已创建", "ru": "API-ключ создан",
        "ja": "APIキー作成完了", "de": "API-Schlüssel erstellt"
    },
    "Min ago": {
        "zh-CN": "分钟前", "ru": "мин. назад",
        "ja": "分前", "de": "Min. her"
    },
    "hour ago": {
        "zh-CN": "小时前", "ru": "ч. назад",
        "ja": "時間前", "de": "Std. her"
    },
    "days ago": {
        "zh-CN": "天前", "ru": "дн. назад",
        "ja": "日前", "de": "T. her"
    },
    "tokens credited": {
        "zh-CN": "代币已到账", "ru": "токенов зачислено",
        "ja": "トークンが付与されました", "de": "Tokens gutgeschrieben"
    },

    # === API Keys / Developer ===
    "Developer": {
        "zh-CN": "开发者", "ru": "Разработчик",
        "ja": "開発者", "de": "Entwickler"
    },
    "API Documentation": {
        "zh-CN": "API 文档", "ru": "Документация API",
        "ja": "API ドキュメント", "de": "API-Dokumentation"
    },
    "OpenAI-compatible endpoint. One API key for 100+ models. Integrate in minutes.": {
        "zh-CN": "OpenAI 兼容端点。一个 API 密钥可用于 100+ 模型。数分钟即可集成。",
        "ru": "Совместимая с OpenAI точка доступа. Один ключ API для 100+ моделей. Интеграция за минуты.",
        "ja": "OpenAI互換エンドポイント。1つのAPIキーで100以上のモデル。数分で統合。",
        "de": "OpenAI-kompatibler Endpunkt. Ein API-Schlüssel für 100+ Modelle. Integration in Minuten."
    },
    "Your API Keys": {
        "zh-CN": "您的 API 密钥", "ru": "Ваши ключи API",
        "ja": "あなたのAPIキー", "de": "Ihre API-Schlüssel"
    },
    "Manage your API access": {
        "zh-CN": "管理您的 API 访问", "ru": "Управляйте доступом к API",
        "ja": "APIアクセスを管理", "de": "API-Zugriff verwalten"
    },
    "↓ Newest": {
        "zh-CN": "↓ 最新", "ru": "↓ Новейшие",
        "ja": "↓ 最新順", "de": "↓ Neueste"
    },
    "↑ Oldest": {
        "zh-CN": "↑ 最早", "ru": "↑ Старейшие",
        "ja": "↑ 最古順", "de": "↑ Älteste"
    },
    "A-Z": {
        "zh-CN": "A-Z", "ru": "А-Я",
        "ja": "A-Z", "de": "A-Z"
    },
    "Usage": {
        "zh-CN": "用量", "ru": "Использование",
        "ja": "使用状況", "de": "Nutzung"
    },
    "+ New Key": {
        "zh-CN": "+ 新建密钥", "ru": "+ Новый ключ",
        "ja": "+ 新しいキー", "de": "+ Neuer Schlüssel"
    },
    "Create API Key": {
        "zh-CN": "创建 API 密钥", "ru": "Создать API-ключ",
        "ja": "APIキーを作成", "de": "API-Schlüssel erstellen"
    },
    "Name your key and set permissions": {
        "zh-CN": "命名密钥并设置权限", "ru": "Назовите ключ и установите разрешения",
        "ja": "キーに名前を付け、権限を設定", "de": "Schlüssel benennen und Berechtigungen festlegen"
    },
    "Key Name": {
        "zh-CN": "密钥名称", "ru": "Имя ключа",
        "ja": "キー名", "de": "Schlüsselname"
    },
    "Permissions": {
        "zh-CN": "权限", "ru": "Разрешения",
        "ja": "権限", "de": "Berechtigungen"
    },
    "Read & Write": {
        "zh-CN": "读写", "ru": "Чтение и запись",
        "ja": "読み書き", "de": "Lesen & Schreiben"
    },
    "Read Only": {
        "zh-CN": "只读", "ru": "Только чтение",
        "ja": "読み取り専用", "de": "Nur lesen"
    },
    "Cancel": {
        "zh-CN": "取消", "ru": "Отмена",
        "ja": "キャンセル", "de": "Abbrechen"
    },
    "Create Key": {
        "zh-CN": "创建密钥", "ru": "Создать ключ",
        "ja": "キーを作成", "de": "Schlüssel erstellen"
    },
    "Copy Key": {
        "zh-CN": "复制密钥", "ru": "Скопировать ключ",
        "ja": "キーをコピー", "de": "Schlüssel kopieren"
    },
    "Key created! Copy it now — you won't see it again.": {
        "zh-CN": "密钥已创建！立即复制——您将无法再次查看。",
        "ru": "Ключ создан! Скопируйте сейчас — вы больше его не увидите.",
        "ja": "キーを作成しました！今すぐコピー——二度と表示されません。",
        "de": "Schlüssel erstellt! Kopieren Sie ihn jetzt — Sie werden ihn nicht wieder sehen."
    },
    "Quick Start": {
        "zh-CN": "快速开始", "ru": "Быстрый старт",
        "ja": "クイックスタート", "de": "Schnellstart"
    },
    "Base URL": {
        "zh-CN": "基础 URL", "ru": "Базовый URL",
        "ja": "ベースURL", "de": "Basis-URL"
    },
    "This endpoint is fully compatible with the OpenAI SDK.": {
        "zh-CN": "此端点与 OpenAI SDK 完全兼容。",
        "ru": "Эта точка доступа полностью совместима с OpenAI SDK.",
        "ja": "このエンドポイントはOpenAI SDKと完全互換です。",
        "de": "Dieser Endpunkt ist vollständig mit dem OpenAI SDK kompatibel."
    },
    "Authentication": {
        "zh-CN": "身份验证", "ru": "Аутентификация",
        "ja": "認証", "de": "Authentifizierung"
    },
    "All API requests require an API key passed via the header:": {
        "zh-CN": "所有 API 请求都需要通过标头传递 API 密钥：",
        "ru": "Все API-запросы требуют ключ API, передаваемый через заголовок:",
        "ja": "すべてのAPIリクエストはヘッダーを介してAPIキーを渡す必要があります：",
        "de": "Alle API-Anfragen erfordern einen API-Schlüssel, der über den Header übergeben wird:"
    },
    "Available Models": {
        "zh-CN": "可用模型", "ru": "Доступные модели",
        "ja": "利用可能なモデル", "de": "Verfügbare Modelle"
    },
    "List all available models with pricing:": {
        "zh-CN": "列出所有可用模型及价格：", "ru": "Список всех доступных моделей с ценами:",
        "ja": "価格を含む利用可能な全モデルを表示：", "de": "Alle verfügbaren Modelle mit Preisen auflisten:"
    },
    "Chat Completions": {
        "zh-CN": "聊天补全", "ru": "Чат-завершения",
        "ja": "チャット補完", "de": "Chat-Vervollständigungen"
    },
    "Send a chat completion request (OpenAI-compatible):": {
        "zh-CN": "发送聊天补全请求（OpenAI 兼容）：",
        "ru": "Отправьте запрос на завершение чата (совместимо с OpenAI):",
        "ja": "チャット補完リクエストを送信（OpenAI互換）：",
        "de": "Senden Sie eine Chat-Vervollständigungsanfrage (OpenAI-kompatibel):"
    },
    "All parameters from the OpenAI API are supported:": {
        "zh-CN": "支持 OpenAI API 的所有参数：",
        "ru": "Поддерживаются все параметры OpenAI API:",
        "ja": "OpenAI APIのすべてのパラメータをサポート：",
        "de": "Alle Parameter der OpenAI API werden unterstützt:"
    },
    "Streaming": {
        "zh-CN": "流式传输", "ru": "Потоковая передача",
        "ja": "ストリーミング", "de": "Streaming"
    },
    "Server-Sent Events (SSE) streaming is fully supported:": {
        "zh-CN": "完全支持 Server-Sent Events (SSE) 流式传输：",
        "ru": "Потоковая передача SSE полностью поддерживается:",
        "ja": "Server-Sent Events (SSE) ストリーミングを完全サポート：",
        "de": "Server-Sent Events (SSE) Streaming wird vollständig unterstützt:"
    },
    "Node.js Example": {
        "zh-CN": "Node.js 示例", "ru": "Пример на Node.js",
        "ja": "Node.js の例", "de": "Node.js Beispiel"
    },
    "Token Pricing": {
        "zh-CN": "代币定价", "ru": "Цены на токены",
        "ja": "トークン料金", "de": "Token-Preise"
    },
    "Each API call consumes GlbTOKENs based on the model used.": {
        "zh-CN": "每次 API 调用根据使用的模型消耗 GlbTOKEN。",
        "ru": "Каждый вызов API потребляет GlbTOKEN в зависимости от используемой модели.",
        "ja": "各API呼び出しは使用モデルに基づいてGlbTOKENを消費します。",
        "de": "Jeder API-Aufruf verbraucht GlbTOKEN basierend auf dem verwendeten Modell."
    },
    "Error Codes": {
        "zh-CN": "错误代码", "ru": "Коды ошибок",
        "ja": "エラーコード", "de": "Fehlercodes"
    },
    "Code": {"zh-CN": "代码", "ru": "Код", "ja": "コード", "de": "Code"},
    "Meaning": {
        "zh-CN": "含义", "ru": "Значение",
        "ja": "意味", "de": "Bedeutung"
    },
    "Invalid or missing API key": {
        "zh-CN": "API 密钥无效或缺失", "ru": "Недействительный или отсутствующий ключ API",
        "ja": "APIキーが無効または見つかりません", "de": "Ungültiger oder fehlender API-Schlüssel"
    },
    "Insufficient token balance": {
        "zh-CN": "代币余额不足", "ru": "Недостаточный баланс токенов",
        "ja": "トークン残高が不足しています", "de": "Nicht genügend Token-Guthaben"
    },
    "Model not found or not available": {
        "zh-CN": "模型未找到或不可用", "ru": "Модель не найдена или недоступна",
        "ja": "モデルが見つからないか利用できません", "de": "Modell nicht gefunden oder nicht verfügbar"
    },
    "Rate limited — slow down requests": {
        "zh-CN": "请求频率限制——请降低请求速度", "ru": "Превышение лимита — замедлите запросы",
        "ja": "レート制限 — リクエストを減らしてください", "de": "Ratenbegrenzung — Anfragen verlangsamen"
    },
    "Best Practices": {
        "zh-CN": "最佳实践", "ru": "Лучшие практики",
        "ja": "ベストプラクティス", "de": "Bewährte Methoden"
    },
    "Rotate keys regularly": {
        "zh-CN": "定期轮换密钥", "ru": "Регулярно меняйте ключи",
        "ja": "定期的にキーをローテーション", "de": "Schlüssel regelmäßig rotieren"
    },
    "Use separate keys per project": {
        "zh-CN": "每个项目使用单独的密钥", "ru": "Используйте отдельные ключи для каждого проекта",
        "ja": "プロジェクトごとに個別のキーを使用", "de": "Separate Schlüssel pro Projekt verwenden"
    },
    "Set max tokens": {
        "zh-CN": "设置最大代币数", "ru": "Установите max_tokens",
        "ja": "最大トークンを設定", "de": "Max-Tokens festlegen"
    },
    "Monitor usage": {
        "zh-CN": "监控用量", "ru": "Отслеживайте использование",
        "ja": "使用状況を監視", "de": "Nutzung überwachen"
    },
    "Handle 402 errors": {
        "zh-CN": "处理 402 错误", "ru": "Обрабатывайте ошибки 402",
        "ja": "402エラーに対処", "de": "402-Fehler behandeln"
    },
    "Rate Limits": {
        "zh-CN": "速率限制", "ru": "Лимиты запросов",
        "ja": "レート制限", "de": "Ratenbegrenzungen"
    },
    "Rate limits depend on your account tier:": {
        "zh-CN": "速率限制取决于您的账户等级：",
        "ru": "Лимиты зависят от уровня вашего аккаунта:",
        "ja": "レート制限はアカウント階層によって異なります：",
        "de": "Ratenbegrenzungen hängen von Ihrem Kontotier ab:"
    },
    "Tier": {
        "zh-CN": "等级", "ru": "Уровень",
        "ja": "階層", "de": "Stufe"
    },
    "RPM": {"zh-CN": "RPM", "ru": "RPM", "ja": "RPM", "de": "RPM"},
    "TPM": {"zh-CN": "TPM", "ru": "TPM", "ja": "TPM", "de": "TPM"},
    "Ready to Build?": {
        "zh-CN": "准备好开始构建了吗？", "ru": "Готовы создавать?",
        "ja": "構築の準備はできましたか？", "de": "Bereit zum Entwickeln?"
    },
    "Create Free Account →": {
        "zh-CN": "创建免费账户 →", "ru": "Создать бесплатный аккаунт →",
        "ja": "無料アカウント作成 →", "de": "Kostenloses Konto erstellen →"
    },
    "Generate your first API key from the Dashboard after signing up.": {
        "zh-CN": "注册后从控制台生成您的第一个 API 密钥。",
        "ru": "Создайте первый API-ключ в панели управления после регистрации.",
        "ja": "登録後、ダッシュボードから最初のAPIキーを生成してください。",
        "de": "Generieren Sie Ihren ersten API-Schlüssel nach der Anmeldung im Dashboard."
    },
    "Or browse all models on the": {
        "zh-CN": "或在", "ru": "Или просмотрите все модели на",
        "ja": "または", "de": "Oder durchsuchen Sie alle Modelle auf der"
    },
    "page.": {"zh-CN": "页面。", "ru": "странице.", "ja": "ページ。", "de": "Seite."},
    "Price per 1K tokens": {
        "zh-CN": "每 1K 代币价格", "ru": "Цена за 1K токенов",
        "ja": "1Kトークンあたりの価格", "de": "Preis pro 1K Tokens"
    },
    "Model": {"zh-CN": "模型", "ru": "Модель", "ja": "モデル", "de": "Modell"},
    "Full pricing:": {
        "zh-CN": "完整定价：", "ru": "Полные цены:",
        "ja": "完全な料金：", "de": "Vollständige Preise:"
    },

    # === Team & Referrals ===
    "Team Management": {
        "zh-CN": "团队管理", "ru": "Управление командой",
        "ja": "チーム管理", "de": "Teamverwaltung"
    },
    "Manage organizations, members, and roles": {
        "zh-CN": "管理组织、成员和角色", "ru": "Управляйте организациями, участниками и ролями",
        "ja": "組織、メンバー、ロールを管理", "de": "Organisationen, Mitglieder und Rollen verwalten"
    },
    "+ Invite Member": {
        "zh-CN": "+ 邀请成员", "ru": "+ Пригласить участника",
        "ja": "+ メンバーを招待", "de": "+ Mitglied einladen"
    },
    "Team Members": {
        "zh-CN": "团队成员", "ru": "Участники команды",
        "ja": "チームメンバー", "de": "Teammitglieder"
    },
    "Team & Referrals": {
        "zh-CN": "团队与推荐", "ru": "Команда и рефералы",
        "ja": "チームと紹介", "de": "Team & Empfehlungen"
    },
    "Member": {"zh-CN": "成员", "ru": "Участник", "ja": "メンバー", "de": "Mitglied"},
    "Role": {"zh-CN": "角色", "ru": "Роль", "ja": "ロール", "de": "Rolle"},
    "Joined": {
        "zh-CN": "加入时间", "ru": "Присоединился",
        "ja": "参加日", "de": "Beigetreten"
    },
    "Actions": {
        "zh-CN": "操作", "ru": "Действия",
        "ja": "アクション", "de": "Aktionen"
    },
    "Owner": {
        "zh-CN": "所有者", "ru": "Владелец",
        "ja": "オーナー", "de": "Besitzer"
    },
    "Admin": {"zh-CN": "管理员", "ru": "Админ", "ja": "管理者", "de": "Admin"},
    "Viewer": {
        "zh-CN": "查看者", "ru": "Наблюдатель",
        "ja": "閲覧者", "de": "Betrachter"
    },
    "Remove": {
        "zh-CN": "移除", "ru": "Удалить",
        "ja": "削除", "de": "Entfernen"
    },
    "Invite Members": {
        "zh-CN": "邀请成员", "ru": "Пригласить участников",
        "ja": "メンバーを招待", "de": "Mitglieder einladen"
    },
    "Send Invite": {
        "zh-CN": "发送邀请", "ru": "Отправить приглашение",
        "ja": "招待を送信", "de": "Einladung senden"
    },
    "Pending Invites": {
        "zh-CN": "待处理的邀请", "ru": "Ожидающие приглашения",
        "ja": "保留中の招待", "de": "Ausstehende Einladungen"
    },
    "Cancel": {
        "zh-CN": "取消", "ru": "Отмена",
        "ja": "キャンセル", "de": "Abbrechen"
    },
    "Membership": {
        "zh-CN": "成员资格", "ru": "Членство",
        "ja": "メンバーシップ", "de": "Mitgliedschaft"
    },
    "You are a member of this organization. You can leave at any time.": {
        "zh-CN": "您是此组织的成员。您可以随时离开。",
        "ru": "Вы являетесь членом этой организации. Вы можете покинуть ее в любое время.",
        "ja": "あなたはこの組織のメンバーです。いつでも退会できます。",
        "de": "Sie sind Mitglied dieser Organisation. Sie können jederzeit austreten."
    },
    "Leave Organization": {
        "zh-CN": "离开组织", "ru": "Покинуть организацию",
        "ja": "組織を退出", "de": "Organisation verlassen"
    },
    "Total Spend": {
        "zh-CN": "总支出", "ru": "Всего расходов",
        "ja": "総支出", "de": "Gesamtausgaben"
    },
    "Total API Calls": {
        "zh-CN": "API 调用总数", "ru": "Всего вызовов API",
        "ja": "API呼び出し総数", "de": "API-Aufrufe gesamt"
    },
    "Active Members": {
        "zh-CN": "活跃成员", "ru": "Активных участников",
        "ja": "アクティブメンバー", "de": "Aktive Mitglieder"
    },
    "Avg Cost / Call": {
        "zh-CN": "平均成本/调用", "ru": "Средняя стоимость/вызов",
        "ja": "平均コスト/コール", "de": "Durchschn. Kosten/Aufruf"
    },
    "this month": {
        "zh-CN": "本月", "ru": "в этом месяце",
        "ja": "今月", "de": "diesen Monat"
    },
    "vs last month": {
        "zh-CN": "较上月", "ru": "по сравнению с прошлым месяцем",
        "ja": "先月比", "de": "vs. letzten Monat"
    },

    # === Referral Program ===
    "Referral Program": {
        "zh-CN": "推荐计划", "ru": "Реферальная программа",
        "ja": "紹介プログラム", "de": "Empfehlungsprogramm"
    },
    "Invite friends and earn rewards for every signup": {
        "zh-CN": "邀请好友，每次注册均可获得奖励",
        "ru": "Приглашайте друзей и получайте награды за каждую регистрацию",
        "ja": "友達を招待して、登録ごとに報酬を獲得",
        "de": "Freunde einladen und für jede Anmeldung Belohnungen erhalten"
    },
    "Copy Code": {
        "zh-CN": "复制代码", "ru": "Скопировать код",
        "ja": "コードをコピー", "de": "Code kopieren"
    },
    "Your Code": {
        "zh-CN": "您的代码", "ru": "Ваш код",
        "ja": "あなたのコード", "de": "Ihr Code"
    },
    "Share this code": {
        "zh-CN": "分享此代码", "ru": "Поделитесь этим кодом",
        "ja": "このコードを共有", "de": "Diesen Code teilen"
    },
    "Total Referrals": {
        "zh-CN": "总推荐数", "ru": "Всего рефералов",
        "ja": "総紹介数", "de": "Empfehlungen gesamt"
    },
    "Total Earned": {
        "zh-CN": "总收益", "ru": "Всего заработано",
        "ja": "総獲得", "de": "Gesamt verdient"
    },
    "Pending Rewards": {
        "zh-CN": "待处理奖励", "ru": "Ожидающие награды",
        "ja": "保留中の報酬", "de": "Ausstehende Belohnungen"
    },
    "Awaiting confirmation": {
        "zh-CN": "等待确认", "ru": "Ожидание подтверждения",
        "ja": "確認待ち", "de": "Warte auf Bestätigung"
    },
    "Share Your Referral Link": {
        "zh-CN": "分享您的推荐链接", "ru": "Поделитесь реферальной ссылкой",
        "ja": "紹介リンクを共有", "de": "Ihren Empfehlungslink teilen"
    },
    "Referrals Over Time": {
        "zh-CN": "推荐趋势", "ru": "Рефералы по времени",
        "ja": "紹介数の推移", "de": "Empfehlungen im Zeitverlauf"
    },
    "Earnings Over Time": {
        "zh-CN": "收益趋势", "ru": "Доход по времени",
        "ja": "収益の推移", "de": "Einnahmen im Zeitverlauf"
    },
    "Referrals": {
        "zh-CN": "推荐", "ru": "Рефералы",
        "ja": "紹介", "de": "Empfehlungen"
    },
    "Name": {"zh-CN": "名称", "ru": "Имя", "ja": "名前", "de": "Name"},
    "Date Joined": {
        "zh-CN": "加入日期", "ru": "Дата присоединения",
        "ja": "参加日", "de": "Beitrittsdatum"
    },
    "Reward Earned": {
        "zh-CN": "获得奖励", "ru": "Получено вознаграждение",
        "ja": "獲得報酬", "de": "Verdiente Belohnung"
    },
    "Reward History": {
        "zh-CN": "奖励记录", "ru": "История наград",
        "ja": "報酬履歴", "de": "Belohnungsverlauf"
    },
    "Signup Bonus": {
        "zh-CN": "注册奖励", "ru": "Бонус за регистрацию",
        "ja": "登録ボーナス", "de": "Anmeldebonus"
    },
    "Referral Milestone": {
        "zh-CN": "推荐里程碑", "ru": "Реферальный рубеж",
        "ja": "紹介マイルストーン", "de": "Empfehlungs-Meilenstein"
    },
    "Claimed": {
        "zh-CN": "已领取", "ru": "Получено",
        "ja": "受領済み", "de": "Eingelöst"
    },
    "Share Your Code": {
        "zh-CN": "分享您的代码", "ru": "Поделитесь кодом",
        "ja": "コードを共有", "de": "Code teilen"
    },
    "1. Share Your Code": {
        "zh-CN": "1. 分享您的代码", "ru": "1. Поделитесь кодом",
        "ja": "1. コードを共有", "de": "1. Code teilen"
    },
    "Copy your unique referral link and share it with friends via social media, email, or messaging apps.": {
        "zh-CN": "复制您的专属推荐链接，通过社交媒体、电子邮件或通讯应用与朋友分享。",
        "ru": "Скопируйте уникальную реферальную ссылку и поделитесь с друзьями через соцсети, email или мессенджеры.",
        "ja": "独自の紹介リンクをコピーして、ソーシャルメディア、メール、またはメッセージアプリで共有。",
        "de": "Kopieren Sie Ihren einzigartigen Empfehlungslink und teilen Sie ihn über soziale Medien, E-Mail oder Messenger."
    },
    "2. They Sign Up": {
        "zh-CN": "2. 他们注册", "ru": "2. Они регистрируются",
        "ja": "2. 友達が登録", "de": "2. Sie melden sich an"
    },
    "Your friends create an account using your referral link and start using GlbTOKEN.": {
        "zh-CN": "您的朋友通过您的推荐链接创建账户并开始使用 GlbTOKEN。",
        "ru": "Ваши друзья создают аккаунт по вашей ссылке и начинают использовать GlbTOKEN.",
        "ja": "友達が紹介リンクを使ってアカウントを作成し、GlbTOKENを使い始めます。",
        "de": "Ihre Freunde erstellen ein Konto mit Ihrem Empfehlungslink und nutzen GlbTOKEN."
    },
    "3. You Earn Rewards": {
        "zh-CN": "3. 您获得奖励", "ru": "3. Вы получаете награды",
        "ja": "3. 報酬を獲得", "de": "3. Sie erhalten Belohnungen"
    },
    "For every friend who signs up and uses the platform, you earn GT tokens as a reward.": {
        "zh-CN": "每位朋友注册并使用平台，您即可获得 GT 代币作为奖励。",
        "ru": "За каждого друга, который зарегистрируется и использует платформу, вы получаете GT токены.",
        "ja": "友達が登録してプラットフォームを利用するたびに、GTトークンを報酬として獲得。",
        "de": "Für jeden Freund, der sich anmeldet und die Plattform nutzt, erhalten Sie GT-Tokens als Belohnung."
    },
    "Active": {"zh-CN": "活跃", "ru": "Активен", "ja": "アクティブ", "de": "Aktiv"},
    "Pending": {
        "zh-CN": "待处理", "ru": "В ожидании",
        "ja": "保留中", "de": "Ausstehend"
    },
    "Inactive": {
        "zh-CN": "不活跃", "ru": "Неактивен",
        "ja": "非アクティブ", "de": "Inaktiv"
    },
    "+ New Org": {
        "zh-CN": "+ 新组织", "ru": "+ Новая организация",
        "ja": "+ 新しい組織", "de": "+ Neue Organisation"
    },
    "Pro Plan": {
        "zh-CN": "专业版", "ru": "Pro-план",
        "ja": "プロプラン", "de": "Pro-Tarif"
    },

    # === Usage & History ===
    "Login History": {
        "zh-CN": "登录历史", "ru": "История входов",
        "ja": "ログイン履歴", "de": "Anmeldeverlauf"
    },
    "Review all login attempts to your account": {
        "zh-CN": "查看您账户的所有登录尝试",
        "ru": "Просмотр всех попыток входа в аккаунт",
        "ja": "アカウントへの全ログイン試行を確認",
        "de": "Alle Anmeldeversuche für Ihr Konto anzeigen"
    },
    "Transaction History": {
        "zh-CN": "交易历史", "ru": "История транзакций",
        "ja": "取引履歴", "de": "Transaktionsverlauf"
    },
    "Deposits & Consumption": {
        "zh-CN": "充值与消耗", "ru": "Пополнения и расход",
        "ja": "入金と消費", "de": "Einzahlungen & Verbrauch"
    },
    "Deposits": {
        "zh-CN": "充值", "ru": "Пополнения",
        "ja": "入金", "de": "Einzahlungen"
    },
    "Consumption": {
        "zh-CN": "消耗", "ru": "Расход",
        "ja": "消費", "de": "Verbrauch"
    },
    "Method": {
        "zh-CN": "方式", "ru": "Способ",
        "ja": "方法", "de": "Methode"
    },
    "No deposits": {
        "zh-CN": "暂无充值", "ru": "Нет пополнений",
        "ja": "入金はありません", "de": "Keine Einzahlungen"
    },
    "No consumption": {
        "zh-CN": "暂无消耗", "ru": "Нет расходов",
        "ja": "消費はありません", "de": "Kein Verbrauch"
    },
    "Date Range": {
        "zh-CN": "日期范围", "ru": "Диапазон дат",
        "ja": "日付範囲", "de": "Datumsbereich"
    },
    "Device": {
        "zh-CN": "设备", "ru": "Устройство",
        "ja": "デバイス", "de": "Gerät"
    },
    "Device / Browser": {
        "zh-CN": "设备/浏览器", "ru": "Устройство/Браузер",
        "ja": "デバイス/ブラウザ", "de": "Gerät/Browser"
    },
    "All Devices": {
        "zh-CN": "所有设备", "ru": "Все устройства",
        "ja": "すべてのデバイス", "de": "Alle Geräte"
    },
    "All Status": {
        "zh-CN": "所有状态", "ru": "Все статусы",
        "ja": "すべてのステータス", "de": "Alle Status"
    },
    "Login Attempts": {
        "zh-CN": "登录尝试", "ru": "Попытки входа",
        "ja": "ログイン試行", "de": "Anmeldeversuche"
    },
    "IP Address": {
        "zh-CN": "IP 地址", "ru": "IP-адрес",
        "ja": "IPアドレス", "de": "IP-Adresse"
    },
    "Location": {
        "zh-CN": "位置", "ru": "Местоположение",
        "ja": "場所", "de": "Standort"
    },
    "Success": {"zh-CN": "成功", "ru": "Успешно", "ja": "成功", "de": "Erfolg"},
    "Failed": {"zh-CN": "失败", "ru": "Не удалось", "ja": "失敗", "de": "Fehlgeschlagen"},
    "No login history yet": {
        "zh-CN": "暂无登录历史", "ru": "Пока нет истории входов",
        "ja": "ログイン履歴はまだありません", "de": "Noch kein Anmeldeverlauf"
    },
    "Load More": {
        "zh-CN": "加载更多", "ru": "Загрузить еще",
        "ja": "さらに読み込む", "de": "Mehr laden"
    },
    "All entries loaded": {
        "zh-CN": "已加载全部条目", "ru": "Все записи загружены",
        "ja": "すべてのエントリを読み込みました", "de": "Alle Einträge geladen"
    },
    "Showing 0 entries": {
        "zh-CN": "显示 0 条记录", "ru": "Показано 0 записей",
        "ja": "0件を表示", "de": "0 Einträge angezeigt"
    },
    "Apply Filters": {
        "zh-CN": "应用筛选", "ru": "Применить фильтры",
        "ja": "フィルターを適用", "de": "Filter anwenden"
    },

    # === Playground ===
    "Playground": {
        "zh-CN": "游乐场", "ru": "Песочница",
        "ja": "プレイグラウンド", "de": "Playground"
    },
    "New Chat": {
        "zh-CN": "新对话", "ru": "Новый чат",
        "ja": "新しいチャット", "de": "Neuer Chat"
    },
    "Delete": {
        "zh-CN": "删除", "ru": "Удалить",
        "ja": "削除", "de": "Löschen"
    },
    "Type your message here...": {
        "zh-CN": "在此输入您的消息...", "ru": "Введите сообщение...",
        "ja": "メッセージを入力...", "de": "Geben Sie Ihre Nachricht ein..."
    },
    "Send Message": {
        "zh-CN": "发送消息", "ru": "Отправить сообщение",
        "ja": "メッセージを送信", "de": "Nachricht senden"
    },
    "Toggle sidebar": {
        "zh-CN": "切换侧边栏", "ru": "Переключить боковую панель",
        "ja": "サイドバー切替", "de": "Seitenleiste umschalten"
    },
    "Save Preset": {
        "zh-CN": "保存预设", "ru": "Сохранить пресет",
        "ja": "プリセットを保存", "de": "Voreinstellung speichern"
    },
    "Model Presets": {
        "zh-CN": "模型预设", "ru": "Пресеты моделей",
        "ja": "モデルプリセット", "de": "Modellvoreinstellungen"
    },
    "Presets": {
        "zh-CN": "预设", "ru": "Пресеты",
        "ja": "プリセット", "de": "Voreinstellungen"
    },
    "Create Preset": {
        "zh-CN": "创建预设", "ru": "Создать пресет",
        "ja": "プリセットを作成", "de": "Voreinstellung erstellen"
    },
    "+ Create Preset": {
        "zh-CN": "+ 创建预设", "ru": "+ Создать пресет",
        "ja": "+ プリセット作成", "de": "+ Voreinstellung erstellen"
    },
    "No presets yet": {
        "zh-CN": "暂无预设", "ru": "Пока нет пресетов",
        "ja": "プリセットがまだありません", "de": "Noch keine Voreinstellungen"
    },
    "Save and reuse model configurations": {
        "zh-CN": "保存并复用模型配置", "ru": "Сохраняйте и используйте конфигурации моделей",
        "ja": "モデル設定を保存して再利用", "de": "Modellkonfigurationen speichern und wiederverwenden"
    },
    "Create one to save your model configurations.": {
        "zh-CN": "创建一个以保存您的模型配置。",
        "ru": "Создайте один, чтобы сохранить конфигурации моделей.",
        "ja": "作成してモデル設定を保存しましょう。",
        "de": "Erstellen Sie eine, um Ihre Modellkonfigurationen zu speichern."
    },
    "All Presets": {
        "zh-CN": "所有预设", "ru": "Все пресеты",
        "ja": "すべてのプリセット", "de": "Alle Voreinstellungen"
    },
    "(optional)": {
        "zh-CN": "（可选）", "ru": "(необязательно)",
        "ja": "（オプション）", "de": "(optional)"
    },
    "Your Presets": {
        "zh-CN": "您的预设", "ru": "Ваши пресеты",
        "ja": "あなたのプリセット", "de": "Ihre Voreinstellungen"
    },
    "Hello, ": {
        "zh-CN": "你好，", "ru": "Здравствуйте, ",
        "ja": "こんにちは、", "de": "Hallo, "
    },
    "Nucleus sampling": {
        "zh-CN": "核采样", "ru": "Ядерная выборка",
        "ja": "Nucleus サンプリング", "de": "Nucleus-Sampling"
    },
    "Controls randomness": {
        "zh-CN": "控制随机性", "ru": "Контролирует случайность",
        "ja": "ランダム性を制御", "de": "Steuert die Zufälligkeit"
    },
    "System Prompt": {
        "zh-CN": "系统提示词", "ru": "Системный промпт",
        "ja": "システムプロンプト", "de": "System-Prompt"
    },
    "Top-up Confirmed": {
        "zh-CN": "充值确认", "ru": "Пополнение подтверждено",
        "ja": "チャージ完了", "de": "Aufladung bestätigt"
    },
    "Low Balance Warning": {
        "zh-CN": "余额不足警告", "ru": "Предупреждение о низком балансе",
        "ja": "残高不足の警告", "de": "Warnung bei niedrigem Guthaben"
    },
    "API Key Created": {
        "zh-CN": "API 密钥已创建", "ru": "API-ключ создан",
        "ja": "APIキー作成完了", "de": "API-Schlüssel erstellt"
    },
    "Logs": {"zh-CN": "日志", "ru": "Логи", "ja": "ログ", "de": "Protokolle"},
    "General": {"zh-CN": "常规", "ru": "Общее", "ja": "一般", "de": "Allgemein"},
    "Personal": {"zh-CN": "个人", "ru": "Личное", "ja": "個人", "de": "Persönlich"},
    "Chat": {"zh-CN": "聊天", "ru": "Чат", "ja": "チャット", "de": "Chat"},
    "Overview": {
        "zh-CN": "概览", "ru": "Обзор",
        "ja": "概要", "de": "Übersicht"
    },
    "API Keys": {
        "zh-CN": "API 密钥", "ru": "Ключи API",
        "ja": "APIキー", "de": "API-Schlüssel"
    },
    "Usage & History": {
        "zh-CN": "用量与历史", "ru": "Использование и история",
        "ja": "使用状況と履歴", "de": "Nutzung & Verlauf"
    },
    "Admin": {"zh-CN": "管理", "ru": "Админ", "ja": "管理", "de": "Admin"},
    "Team": {"zh-CN": "团队", "ru": "Команда", "ja": "チーム", "de": "Team"},
    "All Models": {
        "zh-CN": "所有模型", "ru": "Все модели",
        "ja": "すべてのモデル", "de": "Alle Modelle"
    },
    "All Providers": {
        "zh-CN": "所有提供商", "ru": "Все провайдеры",
        "ja": "すべてのプロバイダー", "de": "Alle Anbieter"
    },
    "Copy": {"zh-CN": "复制", "ru": "Копировать", "ja": "コピー", "de": "Kopieren"},
    "Country": {"zh-CN": "国家", "ru": "Страна", "ja": "国", "de": "Land"},
    "Currency": {"zh-CN": "货币", "ru": "Валюта", "ja": "通貨", "de": "Währung"},
    "Description": {
        "zh-CN": "描述", "ru": "Описание",
        "ja": "説明", "de": "Beschreibung"
    },
    "Phone": {"zh-CN": "电话", "ru": "Телефон", "ja": "電話", "de": "Telefon"},
    "SMS Code": {
        "zh-CN": "短信验证码", "ru": "SMS-код",
        "ja": "SMSコード", "de": "SMS-Code"
    },
    "Send Code": {
        "zh-CN": "发送验证码", "ru": "Отправить код",
        "ja": "コードを送信", "de": "Code senden"
    },
    "Verification Code": {
        "zh-CN": "验证码", "ru": "Код подтверждения",
        "ja": "認証コード", "de": "Bestätigungscode"
    },
    "Verify & Create Account": {
        "zh-CN": "验证并创建账户", "ru": "Подтвердить и создать аккаунт",
        "ja": "確認してアカウント作成", "de": "Bestätigen & Konto erstellen"
    },
    "Verify & Sign In": {
        "zh-CN": "验证并登录", "ru": "Подтвердить и войти",
        "ja": "確認してサインイン", "de": "Bestätigen & Anmelden"
    },
    "Continue": {
        "zh-CN": "继续", "ru": "Продолжить",
        "ja": "続ける", "de": "Weiter"
    },
    "Continue with Phone": {
        "zh-CN": "使用手机继续", "ru": "Продолжить с телефоном",
        "ja": "電話で続ける", "de": "Mit Telefon fortfahren"
    },
    "Buy Tokens": {
        "zh-CN": "购买代币", "ru": "Купить токены",
        "ja": "トークンを購入", "de": "Tokens kaufen"
    },
    "Top Up": {
        "zh-CN": "充值", "ru": "Пополнить",
        "ja": "チャージ", "de": "Aufladen"
    },
    "+ Top Up": {
        "zh-CN": "+ 充值", "ru": "+ Пополнить",
        "ja": "+ チャージ", "de": "+ Aufladen"
    },
    "Buy $5": {"zh-CN": "购买 $5", "ru": "Купить $5", "ja": "$5購入", "de": "Kaufen $5"},
    "Buy $20": {"zh-CN": "购买 $20", "ru": "Купить $20", "ja": "$20購入", "de": "Kaufen $20"},
    "Buy $50": {"zh-CN": "购买 $50", "ru": "Купить $50", "ja": "$50購入", "de": "Kaufen $50"},
    "Buy $100": {"zh-CN": "购买 $100", "ru": "Купить $100", "ja": "$100購入", "de": "Kaufen $100"},
    "Twitter": {"zh-CN": "Twitter", "ru": "Twitter", "ja": "Twitter", "de": "Twitter"},
    "WhatsApp": {"zh-CN": "WhatsApp", "ru": "WhatsApp", "ja": "WhatsApp", "de": "WhatsApp"},
    "Telegram": {"zh-CN": "Telegram", "ru": "Telegram", "ja": "Telegram", "de": "Telegram"},
    "Email": {"zh-CN": "邮箱", "ru": "Email", "ja": "メール", "de": "E-Mail"},
    "Share:": {"zh-CN": "分享：", "ru": "Поделиться:", "ja": "共有：", "de": "Teilen:"},
    "What's Next": {
        "zh-CN": "后续计划", "ru": "Что дальше",
        "ja": "今後の予定", "de": "Wie geht's weiter"
    },
    "What's Under the Hood": {
        "zh-CN": "技术架构", "ru": "Что под капотом",
        "ja": "内部構造", "de": "Unter der Haube"
    },
    "← Back to Blog": {
        "zh-CN": "← 返回博客", "ru": "← Назад в блог",
        "ja": "← ブログに戻る", "de": "← Zurück zum Blog"
    },
    "↑ Oldest": {
        "zh-CN": "↑ 最早", "ru": "↑ Старейшие",
        "ja": "↑ 最古順", "de": "↑ Älteste"
    },
    "↓ Newest": {
        "zh-CN": "↓ 最新", "ru": "↓ Новейшие",
        "ja": "↓ 最新順", "de": "↓ Neueste"
    },
    "tokens consumed": {
        "zh-CN": "代币已消耗", "ru": "токенов потреблено",
        "ja": "消費済みトークン", "de": "Tokens verbraucht"
    },
    "lifetime spend": {
        "zh-CN": "累计消费", "ru": "расходы за всё время",
        "ja": "総支出", "de": "Gesamtausgaben"
    },
    "remaining": {
        "zh-CN": "剩余", "ru": "осталось",
        "ja": "残り", "de": "übrig"
    },
    "used": {
        "zh-CN": "已使用", "ru": "использовано",
        "ja": "使用済み", "de": "verwendet"
    },
    "Generating...": {
        "zh-CN": "生成中...", "ru": "Генерация...",
        "ja": "生成中...", "de": "Generiere..."
    },
    "Try AI": {
        "zh-CN": "试用 AI", "ru": "Попробовать ИИ",
        "ja": "AIを試す", "de": "KI testen"
    },
    "Translation comparison": {
        "zh-CN": "翻译对比", "ru": "Сравнение переводов",
        "ja": "翻訳比較", "de": "Übersetzungsvergleich"
    },
    "Code generation test": {
        "zh-CN": "代码生成测试", "ru": "Тест генерации кода",
        "ja": "コード生成テスト", "de": "Code-Generierungstest"
    },
    "Get Started Today": {
        "zh-CN": "立即开始", "ru": "Начните сегодня",
        "ja": "今すぐ始める", "de": "Noch heute starten"
    },
    "Global by Design": {
        "zh-CN": "全球化设计", "ru": "Глобальный дизайн",
        "ja": "グローバル設計", "de": "Global von Grund auf"
    },
    "Pricing That Makes Sense": {
        "zh-CN": "合理的定价", "ru": "Разумные цены",
        "ja": "納得の料金設定", "de": "Preise, die Sinn ergeben"
    },
    "Quick Links": {
        "zh-CN": "快速链接", "ru": "Быстрые ссылки",
        "ja": "クイックリンク", "de": "Schnelllinks"
    },
    "Support Hours & Response Times": {
        "zh-CN": "支持时间与响应速度", "ru": "Часы поддержки и время ответа",
        "ja": "サポート時間と応答時間", "de": "Support-Zeiten & Antwortzeiten"
    },
    "24/7 — instant": {
        "zh-CN": "24/7 — 即时", "ru": "24/7 — мгновенно",
        "ja": "24時間365日 — 即時", "de": "24/7 — sofort"
    },
    "Mon–Fri, 08:00–18:00 UTC+0": {
        "zh-CN": "周一至周五 08:00–18:00 UTC+0",
        "ru": "Пн–Пт, 08:00–18:00 UTC+0",
        "ja": "月–金 08:00–18:00 UTC+0",
        "de": "Mo–Fr, 08:00–18:00 UTC+0"
    },
    "Send Us a Message": {
        "zh-CN": "给我们发消息", "ru": "Отправьте нам сообщение",
        "ja": "メッセージを送る", "de": "Senden Sie uns eine Nachricht"
    },
}


def main():
    print("=== Comprehensive GlbTOKEN Auto-Translation ===\n")
    
    # Load existing translations
    trans_keys, mixed_keys, existing_content = load_existing_translations()
    print(f"Existing: {len(trans_keys)} TRANS keys, {len(mixed_keys)} I18N_MIXED keys\n")
    
    # Extract text from ALL HTML files
    all_texts = set()
    for html_file in ALL_HTML_FILES:
        filepath = os.path.join(PROJECT_DIR, html_file)
        if not os.path.exists(filepath):
            print(f"  SKIP (not found): {html_file}")
            continue
        texts = extract_text_from_html(filepath)
        for t in texts:
            all_texts.add(t)
    
    print(f"Total unique texts found across all files: {len(all_texts)}\n")
    
    # Filter to untranslated texts
    untranslated = []
    for text in sorted(all_texts, key=lambda x: (len(x), x)):
        if text in trans_keys:
            continue
        # Skip standard words
        stripped = text.strip()
        if not stripped or len(stripped) < 3:
            continue
        skip = False
        for word in STANDARD_WORDS:
            if stripped.lower() == word.lower():
                skip = True
                break
        if skip:
            continue
        # Skip code-like
        if re.search(r'[{}[\]()=<>]', stripped):
            continue
        # Skip numbers/prices
        if re.match(r'^[\d\s,.$%₿€£¥₦+\-]', stripped):
            continue
        # Skip CSS classes
        if stripped.startswith('.') or stripped.startswith('#'):
            continue
        # Skip if contains non-Latin chars (already translated)
        if re.search(r'[\u4e00-\u9fff\u0400-\u04ff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]', stripped):
            continue
        # Check fuzzy match
        similar = False
        for key in trans_keys:
            if text.lower() == key.lower():
                similar = True
                break
        if similar:
            continue
        untranslated.append(text)
    
    print(f"Untranslated texts found: {len(untranslated)}\n")
    
    # Generate translations using our comprehensive map
    new_entries = []
    skipped = 0
    matched = set()
    
    for text in untranslated:
        # Check exact match in comprehensive map
        if text in COMPREHENSIVE_TRANSLATIONS:
            trans = COMPREHENSIVE_TRANSLATIONS[text]
            escaped_text = text.replace('\\', '\\\\').replace('"', '\\"')
            zh = trans["zh-CN"].replace('\\', '\\\\').replace('"', '\\"')
            ru = trans["ru"].replace('\\', '\\\\').replace('"', '\\"')
            ja = trans["ja"].replace('\\', '\\\\').replace('"', '\\"')
            de = trans["de"].replace('\\', '\\\\').replace('"', '\\"')
            entry = f'TRANS["{escaped_text}"] = {{en: "{escaped_text}", "zh-CN": "{zh}", ru: "{ru}", ja: "{ja}", de: "{de}"}};'
            new_entries.append(entry)
            matched.add(text)
            continue
        
        # Check prefix match
        found = False
        for key, trans in COMPREHENSIVE_TRANSLATIONS.items():
            if text.startswith(key) and len(text) < len(key) + 10:
                escaped_text = text.replace('\\', '\\\\').replace('"', '\\"')
                # For prefix matches, keep the suffix but translate the prefix part
                suffix = text[len(key):]
                if suffix.strip():
                    zh = trans["zh-CN"] + suffix
                    ru = trans["ru"] + suffix
                    ja = trans["ja"] + suffix
                    de = trans["de"] + suffix
                else:
                    zh = trans["zh-CN"]
                    ru = trans["ru"]
                    ja = trans["ja"]
                    de = trans["de"]
                zh = zh.replace('\\', '\\\\').replace('"', '\\"')
                ru = ru.replace('\\', '\\\\').replace('"', '\\"')
                ja = ja.replace('\\', '\\\\').replace('"', '\\"')
                de = de.replace('\\', '\\\\').replace('"', '\\"')
                entry = f'TRANS["{escaped_text}"] = {{en: "{escaped_text}", "zh-CN": "{zh}", ru: "{ru}", ja: "{ja}", de: "{de}"}};'
                new_entries.append(entry)
                matched.add(text)
                found = True
                break
        if found:
            continue
        
        skipped += 1
    
    print(f"Generated: {len(new_entries)} new translations")
    print(f"Skipped (no match in dictionary): {skipped}")
    
    if not new_entries:
        print("\nNothing new to translate. Exiting.")
        return 0
    
    # Show the first 20 entries as sample
    print(f"\nSample of {min(5, len(new_entries))} new translations:")
    for e in new_entries[:5]:
        print(f"  {e[:120]}...")
    if len(new_entries) > 5:
        print(f"  ... and {len(new_entries)-5} more")
    
    # Append to translations.js
    insert_pos = existing_content.rfind("(function() {")
    if insert_pos == -1:
        insert_pos = len(existing_content)
    
    header = "\n\n// ── Auto-translated dashboard/i18n texts ──\n"
    new_section = header + "\n".join(new_entries)
    updated = existing_content[:insert_pos] + new_section + existing_content[insert_pos:]
    
    with open(TRANS_FILE, "w", encoding="utf-8") as f:
        f.write(updated)
    
    print(f"\n✅ Appended {len(new_entries)} new translations to translations.js")
    
    # Bump version from v=219 to v=220
    print("\nBumping version v=219 → v=220...")
    result = subprocess.run(
        "cd ~/projects/glbtoken && find . -name '*.html' -o -name '*.js' -o -name '*.css' | xargs sed -i '' 's/v=219/v=220/g' 2>/dev/null",
        shell=True, capture_output=True, text=True, timeout=30
    )
    print(f"  stdout: {result.stdout[-200:] if result.stdout else '(empty)'}")
    print(f"  stderr: {result.stderr[-200:] if result.stderr else '(none)'}")
    
    # Git commit and push
    print("\nCommitting and pushing...")
    try:
        result = subprocess.run(
            "cd ~/projects/glbtoken && git add -A && git commit -m 'v=220 auto-translate dashboard and ui strings' && git push",
            shell=True, capture_output=True, text=True, timeout=120
        )
        print(f"  stdout: {result.stdout[-500:] if len(result.stdout) > 500 else result.stdout}")
        if result.stderr:
            print(f"  stderr: {result.stderr[-500:] if len(result.stderr) > 500 else result.stderr}")
        print("\n✅ Done! Pushed v=220 with new translations.")
    except Exception as e:
        print(f"⚠️ Git error: {e}")
    
    return 0


if __name__ == "__main__":
    exit(main())
