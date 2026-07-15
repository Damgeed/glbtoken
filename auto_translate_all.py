#!/usr/bin/env python3
"""Deep scan: extract all untranslated English text from HTML files and generate translations."""

import os, re, html as html_mod, subprocess, sys

PROJECT_DIR = os.path.expanduser("~/projects/glbtoken")
TRANS_FILE = os.path.join(PROJECT_DIR, "translations.js")

ALL_HTML = [
    "index.html","home.html","about.html","blog.html","contact.html",
    "faq.html","how.html","models.html","pricing.html","privacy.html",
    "terms.html","refund.html","blog-article-1.html","blog-article-2.html",
    "blog-article-3.html","blog-article-4.html","blog-article-5.html",
    "blog-article-6.html","notifications.html","settings.html",
    "history.html","billing.html","apikeys.html","playground.html",
    "referral.html","team.html","topup.html","presets.html",
    "login.html","register.html","dashboard.html",
]

# Comprehensive translation dictionary
T = {
    # Dashboard sidebar labels
    "Chat": {"zh-CN": "聊天", "ru": "Чат", "ja": "チャット", "de": "Chat"},
    "General": {"zh-CN": "通用", "ru": "Общие", "ja": "一般", "de": "Allgemein"},
    "Personal": {"zh-CN": "个人", "ru": "Личные", "ja": "個人", "de": "Persönlich"},
    "Admin": {"zh-CN": "管理", "ru": "Админ", "ja": "管理", "de": "Admin"},
    "Team": {"zh-CN": "团队", "ru": "Команда", "ja": "チーム", "de": "Team"},
    "Overview": {"zh-CN": "概览", "ru": "Обзор", "ja": "概要", "de": "Übersicht"},
    "API Keys": {"zh-CN": "API 密钥", "ru": "API-ключи", "ja": "APIキー", "de": "API-Schlüssel"},
    "Usage & History": {"zh-CN": "用量与历史", "ru": "Использование и история", "ja": "使用状況と履歴", "de": "Nutzung & Verlauf"},
    "Team & Referrals": {"zh-CN": "团队与推荐", "ru": "Команда и рефералы", "ja": "チームと紹介", "de": "Team & Empfehlungen"},
    "Logs": {"zh-CN": "日志", "ru": "Логи", "ja": "ログ", "de": "Protokolle"},
    "Playground": {"zh-CN": "游乐场", "ru": "Площадка", "ja": "プレイグラウンド", "de": "Playground"},

    # Dashboard overview
    "Hello,": {"zh-CN": "你好，", "ru": "Здравствуйте, ", "ja": "こんにちは、", "de": "Hallo, "},
    "Token usage overview": {"zh-CN": "代币使用概览", "ru": "Обзор использования токенов", "ja": "トークン使用状況概要", "de": "Token-Nutzungsübersicht"},
    "Available Balance": {"zh-CN": "可用余额", "ru": "Доступный баланс", "ja": "利用可能残高", "de": "Verfügbares Guthaben"},
    "Total Spent": {"zh-CN": "总消费", "ru": "Всего потрачено", "ja": "総消費", "de": "Gesamtausgaben"},
    "Models Used": {"zh-CN": "已用模型", "ru": "Использовано моделей", "ja": "使用モデル数", "de": "Verwendete Modelle"},
    "API Requests": {"zh-CN": "API 请求", "ru": "API запросы", "ja": "API リクエスト", "de": "API-Anfragen"},
    "API Keys Active": {"zh-CN": "活跃 API 密钥", "ru": "Активных ключей API", "ja": "アクティブな API キー", "de": "Aktive API-Schlüssel"},
    "Days Active": {"zh-CN": "活跃天数", "ru": "Дней активности", "ja": "アクティブ日数", "de": "Aktive Tage"},
    "Lifetime": {"zh-CN": "总计", "ru": "За всё время", "ja": "全期間", "de": "Gesamte Laufzeit"},
    "All time": {"zh-CN": "全部时间", "ru": "За всё время", "ja": "全期間", "de": "Gesamter Zeitraum"},
    "Total calls": {"zh-CN": "总调用次数", "ru": "Всего вызовов", "ja": "総呼び出し数", "de": "Gesamte Aufrufe"},

    # Stat card labels
    "Total Spent": {"zh-CN": "总消费", "ru": "Всего потрачено", "ja": "総消費", "de": "Gesamtausgaben"},

    # Usage section
    "Usage": {"zh-CN": "用量", "ru": "Использование", "ja": "使用状況", "de": "Nutzung"},
    "Usage by Model": {"zh-CN": "按模型用量", "ru": "Использование по моделям", "ja": "モデル別使用量", "de": "Nutzung nach Modell"},
    "Activity Timeline": {"zh-CN": "活动时间线", "ru": "Хронология активности", "ja": "アクティビティタイムライン", "de": "Aktivitätszeitstrahl"},
    "Recent Transactions": {"zh-CN": "最近交易", "ru": "Последние транзакции", "ja": "最近の取引", "de": "Letzte Transaktionen"},
    "Last 5": {"zh-CN": "最近 5 条", "ru": "Последние 5", "ja": "最新5件", "de": "Letzte 5"},
    "No transactions yet": {"zh-CN": "暂无交易记录", "ru": "Пока нет транзакций", "ja": "取引はまだありません", "de": "Noch keine Transaktionen"},
    "View all →": {"zh-CN": "查看全部 →", "ru": "Посмотреть все →", "ja": "すべて見る →", "de": "Alle anzeigen →"},

    # Billing section
    "Payments": {"zh-CN": "付款", "ru": "Платежи", "ja": "支払い", "de": "Zahlungen"},
    "Billing": {"zh-CN": "账单", "ru": "Оплата", "ja": "請求", "de": "Abrechnung"},
    "Manage invoices, payment methods, and billing summary.": {"zh-CN": "管理发票、支付方式和账单摘要。", "ru": "Управляйте счетами, способами оплаты и сводкой.", "ja": "請求書、支払い方法、請求サマリーを管理。", "de": "Verwalten Sie Rechnungen, Zahlungsmethoden und Abrechnungsübersicht."},
    "Billing Summary": {"zh-CN": "账单摘要", "ru": "Сводка по оплате", "ja": "請求サマリー", "de": "Abrechnungsübersicht"},
    "Total Spent": {"zh-CN": "总消费", "ru": "Всего потрачено", "ja": "総消費", "de": "Gesamtausgaben"},
    "Last Invoice Date": {"zh-CN": "上次发票日期", "ru": "Дата последнего счета", "ja": "最終請求日", "de": "Letztes Rechnungsdatum"},
    "Top Payment Method": {"zh-CN": "首选支付方式", "ru": "Основной способ оплаты", "ja": "主な支払い方法", "de": "Hauptzahlungsmethode"},
    "Payment Methods": {"zh-CN": "支付方式", "ru": "Способы оплаты", "ja": "支払い方法", "de": "Zahlungsmethoden"},
    "No payment methods saved": {"zh-CN": "未保存支付方式", "ru": "Нет сохраненных способов оплаты", "ja": "支払い方法が保存されていません", "de": "Keine Zahlungsmethoden gespeichert"},
    "Add a card or mobile money method to get started.": {"zh-CN": "添加银行卡或移动支付方式开始使用。", "ru": "Добавьте карту или мобильный платеж, чтобы начать.", "ja": "カードまたはモバイルマネーを追加して開始。", "de": "Fügen Sie eine Karte oder Mobile Money hinzu, um zu beginnen."},
    "+ Add Payment Method": {"zh-CN": "+ 添加支付方式", "ru": "+ Добавить способ оплаты", "ja": "+ 支払い方法を追加", "de": "+ Zahlungsmethode hinzufügen"},
    "Invoices": {"zh-CN": "发票", "ru": "Счета", "ja": "請求書", "de": "Rechnungen"},
    "Date": {"zh-CN": "日期", "ru": "Дата", "ja": "日付", "de": "Datum"},
    "Amount": {"zh-CN": "金额", "ru": "Сумма", "ja": "金額", "de": "Betrag"},
    "Payment Method": {"zh-CN": "支付方式", "ru": "Способ оплаты", "ja": "支払い方法", "de": "Zahlungsmethode"},
    "Tokens Added": {"zh-CN": "添加代币", "ru": "Добавлено токенов", "ja": "追加トークン", "de": "Tokens hinzugefügt"},
    "Status": {"zh-CN": "状态", "ru": "Статус", "ja": "ステータス", "de": "Status"},
    "Receipt": {"zh-CN": "收据", "ru": "Квитанция", "ja": "領収書", "de": "Quittung"},
    "No invoices yet": {"zh-CN": "暂无发票", "ru": "Пока нет счетов", "ja": "請求書はまだありません", "de": "Noch keine Rechnungen"},
    "+ Top Up Now": {"zh-CN": "+ 立即充值", "ru": "+ Пополнить сейчас", "ja": "+ 今すぐチャージ", "de": "+ Jetzt aufladen"},
    "Refresh": {"zh-CN": "刷新", "ru": "Обновить", "ja": "更新", "de": "Aktualisieren"},

    # Settings section
    "Settings": {"zh-CN": "设置", "ru": "Настройки", "ja": "設定", "de": "Einstellungen"},
    "Profile": {"zh-CN": "个人资料", "ru": "Профиль", "ja": "プロフィール", "de": "Profil"},
    "Full Name": {"zh-CN": "全名", "ru": "Полное имя", "ja": "氏名", "de": "Vollständiger Name"},
    "Email": {"zh-CN": "邮箱", "ru": "Электронная почта", "ja": "メールアドレス", "de": "E-Mail"},
    "Timezone": {"zh-CN": "时区", "ru": "Часовой пояс", "ja": "タイムゾーン", "de": "Zeitzone"},
    "Save Changes": {"zh-CN": "保存更改", "ru": "Сохранить изменения", "ja": "変更を保存", "de": "Änderungen speichern"},
    "Security": {"zh-CN": "安全", "ru": "Безопасность", "ja": "セキュリティ", "de": "Sicherheit"},
    "Current Password": {"zh-CN": "当前密码", "ru": "Текущий пароль", "ja": "現在のパスワード", "de": "Aktuelles Passwort"},
    "New Password": {"zh-CN": "新密码", "ru": "Новый пароль", "ja": "新しいパスワード", "de": "Neues Passwort"},
    "Two-Factor Auth": {"zh-CN": "两步验证", "ru": "Двухфакторная аутентификация", "ja": "二要素認証", "de": "Zwei-Faktor-Authentifizierung"},
    "Add an extra layer of security": {"zh-CN": "增加额外的安全层", "ru": "Добавьте дополнительный уровень безопасности", "ja": "追加のセキュリティ層を追加", "de": "Fügen Sie eine zusätzliche Sicherheitsebene hinzu"},
    "Enable": {"zh-CN": "启用", "ru": "Включить", "ja": "有効にする", "de": "Aktivieren"},
    "Update Password": {"zh-CN": "更新密码", "ru": "Обновить пароль", "ja": "パスワードを更新", "de": "Passwort aktualisieren"},
    "Notifications": {"zh-CN": "通知", "ru": "Уведомления", "ja": "通知", "de": "Benachrichtigungen"},
    "Email Notifications": {"zh-CN": "邮件通知", "ru": "Уведомления по email", "ja": "メール通知", "de": "E-Mail-Benachrichtigungen"},
    "Receive account & marketing emails": {"zh-CN": "接收账户和营销邮件", "ru": "Получать письма об аккаунте и рассылки", "ja": "アカウントとマーケティングメールを受信", "de": "Konto- und Marketing-E-Mails erhalten"},
    "Low Balance Alerts": {"zh-CN": "余额不足提醒", "ru": "Уведомления о низком балансе", "ja": "残高低下アラート", "de": "Niedrige-Guthaben-Benachrichtigungen"},
    "Get notified when your balance runs low": {"zh-CN": "余额不足时收到通知", "ru": "Получать уведомления, когда баланс на исходе", "ja": "残高が少なくなったら通知", "de": "Benachrichtigt werden, wenn das Guthaben zur Neige geht"},
    "Login Alerts": {"zh-CN": "登录提醒", "ru": "Уведомления о входе", "ja": "ログインアラート", "de": "Login-Benachrichtigungen"},
    "Email when a new device signs in": {"zh-CN": "新设备登录时发送邮件", "ru": "Письмо при входе с нового устройства", "ja": "新しいデバイスからのサインイン時にメール", "de": "E-Mail bei Anmeldung von einem neuen Gerät"},
    "Save Notification Preferences": {"zh-CN": "保存通知偏好", "ru": "Сохранить настройки уведомлений", "ja": "通知設定を保存", "de": "Benachrichtigungseinstellungen speichern"},
    "Notification History": {"zh-CN": "通知历史", "ru": "История уведомлений", "ja": "通知履歴", "de": "Benachrichtigungsverlauf"},
    "Mark All as Read": {"zh-CN": "全部标为已读", "ru": "Отметить все прочитанными", "ja": "すべて既読にする", "de": "Alle als gelesen markieren"},

    # API Keys section
    "Developer": {"zh-CN": "开发者", "ru": "Разработчикам", "ja": "開発者", "de": "Entwickler"},
    "API Documentation": {"zh-CN": "API 文档", "ru": "API документация", "ja": "APIドキュメント", "de": "API-Dokumentation"},
    "OpenAI-compatible endpoint. One API key for 100+ models. Integrate in minutes.": {"zh-CN": "OpenAI 兼容端点。一个 API 密钥可使用 100+ 模型。分钟级集成。", "ru": "OpenAI-совместимый эндпоинт. Один API-ключ для 100+ моделей. Интеграция за минуты.", "ja": "OpenAI互換エンドポイント。1つのAPIキーで100以上のモデル。数分で統合。", "de": "OpenAI-kompatibler Endpunkt. Ein API-Schlüssel für 100+ Modelle. Integration in Minuten."},
    "Your API Keys": {"zh-CN": "您的 API 密钥", "ru": "Ваши API-ключи", "ja": "あなたのAPIキー", "de": "Ihre API-Schlüssel"},
    "Manage your API access": {"zh-CN": "管理您的 API 访问", "ru": "Управление доступом к API", "ja": "APIアクセスを管理", "de": "API-Zugriff verwalten"},
    "+ New Key": {"zh-CN": "+ 新建密钥", "ru": "+ Новый ключ", "ja": "+ 新しいキー", "de": "+ Neuer Schlüssel"},
    "Create API Key": {"zh-CN": "创建 API 密钥", "ru": "Создать API-ключ", "ja": "APIキーを作成", "de": "API-Schlüssel erstellen"},
    "Name your key and set permissions": {"zh-CN": "命名您的密钥并设置权限", "ru": "Назовите ключ и задайте разрешения", "ja": "キーに名前を付けて権限を設定", "de": "Schlüssel benennen und Berechtigungen festlegen"},
    "Key Name": {"zh-CN": "密钥名称", "ru": "Имя ключа", "ja": "キー名", "de": "Schlüsselname"},
    "Permissions": {"zh-CN": "权限", "ru": "Разрешения", "ja": "権限", "de": "Berechtigungen"},
    "Read & Write": {"zh-CN": "读写", "ru": "Чтение и запись", "ja": "読み取りと書き込み", "de": "Lesen & Schreiben"},
    "Read Only": {"zh-CN": "只读", "ru": "Только чтение", "ja": "読み取りのみ", "de": "Nur lesen"},
    "Cancel": {"zh-CN": "取消", "ru": "Отмена", "ja": "キャンセル", "de": "Abbrechen"},
    "Create Key": {"zh-CN": "创建密钥", "ru": "Создать ключ", "ja": "キーを作成", "de": "Schlüssel erstellen"},
    "Key created! Copy it now — you won't see it again.": {"zh-CN": "密钥已创建！立即复制——您将不会再看到它。", "ru": "Ключ создан! Скопируйте сейчас — вы больше его не увидите.", "ja": "キーを作成しました！今すぐコピーしてください——再表示されません。", "de": "Schlüssel erstellt! Kopieren Sie ihn jetzt — Sie werden ihn nicht wieder sehen."},
    "Copy Key": {"zh-CN": "复制密钥", "ru": "Копировать ключ", "ja": "キーをコピー", "de": "Schlüssel kopieren"},
    "Quick Start": {"zh-CN": "快速开始", "ru": "Быстрый старт", "ja": "クイックスタート", "de": "Schnellstart"},
    "Base URL": {"zh-CN": "基础 URL", "ru": "Базовый URL", "ja": "ベースURL", "de": "Basis-URL"},
    "Authentication": {"zh-CN": "身份验证", "ru": "Аутентификация", "ja": "認証", "de": "Authentifizierung"},
    "Available Models": {"zh-CN": "可用模型", "ru": "Доступные модели", "ja": "利用可能なモデル", "de": "Verfügbare Modelle"},
    "Chat Completions": {"zh-CN": "聊天补全", "ru": "Чат-завершения", "ja": "チャット補完", "de": "Chat-Completions"},
    "Streaming": {"zh-CN": "流式传输", "ru": "Стриминг", "ja": "ストリーミング", "de": "Streaming"},
    "Node.js Example": {"zh-CN": "Node.js 示例", "ru": "Пример на Node.js", "ja": "Node.jsの例", "de": "Node.js-Beispiel"},
    "Token Pricing": {"zh-CN": "代币定价", "ru": "Цены токенов", "ja": "トークン料金", "de": "Token-Preise"},
    "Error Codes": {"zh-CN": "错误代码", "ru": "Коды ошибок", "ja": "エラーコード", "de": "Fehlercodes"},
    "Best Practices": {"zh-CN": "最佳实践", "ru": "Лучшие практики", "ja": "ベストプラクティス", "de": "Bewährte Methoden"},
    "Rate Limits": {"zh-CN": "速率限制", "ru": "Лимиты запросов", "ja": "レート制限", "de": "Ratenbegrenzungen"},
    "Ready to Build?": {"zh-CN": "准备开始构建？", "ru": "Готовы начать?", "ja": "構築の準備はできましたか？", "de": "Bereit zu starten?"},
    "Create Free Account →": {"zh-CN": "创建免费账户 →", "ru": "Создать бесплатный аккаунт →", "ja": "無料アカウント作成 →", "de": "Kostenloses Konto erstellen →"},

    # Usage & History section
    "Login History": {"zh-CN": "登录历史", "ru": "История входов", "ja": "ログイン履歴", "de": "Anmeldeverlauf"},
    "Review all login attempts to your account": {"zh-CN": "查看您账户的所有登录尝试", "ru": "Просмотр всех попыток входа в аккаунт", "ja": "アカウントへのすべてのログイン試行を確認", "de": "Alle Anmeldeversuche für Ihr Konto anzeigen"},
    "Transaction History": {"zh-CN": "交易历史", "ru": "История транзакций", "ja": "取引履歴", "de": "Transaktionsverlauf"},
    "Deposits & Consumption": {"zh-CN": "充值与消耗", "ru": "Пополнения и расход", "ja": "入金と消費", "de": "Einzahlungen & Verbrauch"},
    "Deposits": {"zh-CN": "充值", "ru": "Пополнения", "ja": "入金", "de": "Einzahlungen"},
    "Consumption": {"zh-CN": "消费", "ru": "Расход", "ja": "消費", "de": "Verbrauch"},
    "No deposits": {"zh-CN": "暂无充值记录", "ru": "Нет пополнений", "ja": "入金なし", "de": "Keine Einzahlungen"},
    "No consumption": {"zh-CN": "暂无消费记录", "ru": "Нет расходов", "ja": "消費なし", "de": "Kein Verbrauch"},
    "Date Range": {"zh-CN": "日期范围", "ru": "Диапазон дат", "ja": "日付範囲", "de": "Datumsbereich"},
    "Device": {"zh-CN": "设备", "ru": "Устройство", "ja": "デバイス", "de": "Gerät"},
    "All Devices": {"zh-CN": "所有设备", "ru": "Все устройства", "ja": "すべてのデバイス", "de": "Alle Geräte"},
    "All Status": {"zh-CN": "所有状态", "ru": "Все статусы", "ja": "すべてのステータス", "de": "Alle Status"},
    "Apply Filters": {"zh-CN": "应用筛选", "ru": "Применить фильтры", "ja": "フィルターを適用", "de": "Filter anwenden"},
    "Login Attempts": {"zh-CN": "登录尝试", "ru": "Попытки входа", "ja": "ログイン試行", "de": "Anmeldeversuche"},
    "Timestamp": {"zh-CN": "时间戳", "ru": "Время", "ja": "タイムスタンプ", "de": "Zeitstempel"},
    "IP Address": {"zh-CN": "IP 地址", "ru": "IP-адрес", "ja": "IPアドレス", "de": "IP-Adresse"},
    "Device / Browser": {"zh-CN": "设备/浏览器", "ru": "Устройство / Браузер", "ja": "デバイス/ブラウザ", "de": "Gerät/Browser"},
    "Location": {"zh-CN": "位置", "ru": "Местоположение", "ja": "場所", "de": "Standort"},
    "No login history yet": {"zh-CN": "暂无登录历史", "ru": "История входов пока пуста", "ja": "ログイン履歴はまだありません", "de": "Noch kein Anmeldeverlauf"},
    "Logins will appear here once you sign in from different devices or locations.": {"zh-CN": "从不同设备或位置登录后，登录记录将显示在此处。", "ru": "Записи о входе появятся после входа с разных устройств или мест.", "ja": "異なるデバイスや場所からサインインすると、ログインがここに表示されます。", "de": "Anmeldungen erscheinen hier, sobald Sie sich von verschiedenen Geräten oder Standorten aus anmelden."},
    "Load More": {"zh-CN": "加载更多", "ru": "Загрузить еще", "ja": "もっと読み込む", "de": "Mehr laden"},

    # Playground
    "New Chat": {"zh-CN": "新建聊天", "ru": "Новый чат", "ja": "新しいチャット", "de": "Neuer Chat"},
    "Delete": {"zh-CN": "删除", "ru": "Удалить", "ja": "削除", "de": "Löschen"},

    # Team Management
    "Team Management": {"zh-CN": "团队管理", "ru": "Управление командой", "ja": "チーム管理", "de": "Teamverwaltung"},
    "Manage organizations, members, and roles": {"zh-CN": "管理组织、成员和角色", "ru": "Управление организациями, участниками и ролями", "ja": "組織、メンバー、役割を管理", "de": "Organisationen, Mitglieder und Rollen verwalten"},
    "+ Invite Member": {"zh-CN": "+ 邀请成员", "ru": "+ Пригласить участника", "ja": "+ メンバーを招待", "de": "+ Mitglied einladen"},
    "+ New Org": {"zh-CN": "+ 新建组织", "ru": "+ Новая организация", "ja": "+ 新しい組織", "de": "+ Neue Organisation"},
    "Team Members": {"zh-CN": "团队成员", "ru": "Участники команды", "ja": "チームメンバー", "de": "Teammitglieder"},
    "Member": {"zh-CN": "成员", "ru": "Участник", "ja": "メンバー", "de": "Mitglied"},
    "Role": {"zh-CN": "角色", "ru": "Роль", "ja": "役割", "de": "Rolle"},
    "Joined": {"zh-CN": "加入时间", "ru": "Дата вступления", "ja": "参加日", "de": "Beigetreten"},
    "Actions": {"zh-CN": "操作", "ru": "Действия", "ja": "アクション", "de": "Aktionen"},
    "Owner": {"zh-CN": "所有者", "ru": "Владелец", "ja": "所有者", "de": "Eigentümer"},
    "Admin": {"zh-CN": "管理员", "ru": "Админ", "ja": "管理者", "de": "Admin"},
    "Member": {"zh-CN": "成员", "ru": "Участник", "ja": "メンバー", "de": "Mitglied"},
    "Viewer": {"zh-CN": "查看者", "ru": "Наблюдатель", "ja": "閲覧者", "de": "Betrachter"},
    "Remove": {"zh-CN": "移除", "ru": "Удалить", "ja": "削除", "de": "Entfernen"},
    "Total Spend": {"zh-CN": "总支出", "ru": "Всего расходов", "ja": "総支出", "de": "Gesamtausgaben"},
    "Total API Calls": {"zh-CN": "API 调用总数", "ru": "Всего API вызовов", "ja": "総APIコール数", "de": "API-Aufrufe gesamt"},
    "Active Members": {"zh-CN": "活跃成员", "ru": "Активные участники", "ja": "アクティブメンバー", "de": "Aktive Mitglieder"},
    "Avg Cost / Call": {"zh-CN": "平均每次调用成本", "ru": "Средняя стоимость вызова", "ja": "平均コスト/コール", "de": "Durchschnittskosten/Aufruf"},

    # Error monitoring
    "Error Rate Monitoring": {"zh-CN": "错误率监控", "ru": "Мониторинг ошибок", "ja": "エラー率監視", "de": "Fehlerraten-Überwachung"},
    "Track API errors": {"zh-CN": "追踪 API 错误", "ru": "Отслеживание ошибок API", "ja": "APIエラーを追跡", "de": "API-Fehler verfolgen"},
    "Total Errors": {"zh-CN": "总错误数", "ru": "Всего ошибок", "ja": "総エラー数", "de": "Fehler gesamt"},
    "Error Rate": {"zh-CN": "错误率", "ru": "Процент ошибок", "ja": "エラー率", "de": "Fehlerrate"},
    "Last Error": {"zh-CN": "上次错误", "ru": "Последняя ошибка", "ja": "最後のエラー", "de": "Letzter Fehler"},
    "Percentage": {"zh-CN": "百分比", "ru": "Процент", "ja": "パーセンテージ", "de": "Prozentsatz"},
    "Time": {"zh-CN": "时间", "ru": "Время", "ja": "時間", "de": "Zeit"},

    # Response time / Speed
    "Response Time by Model": {"zh-CN": "按模型的响应时间", "ru": "Время ответа по моделям", "ja": "モデル別応答時間", "de": "Antwortzeit nach Modell"},
    "Speed indicators": {"zh-CN": "速度指标", "ru": "Показатели скорости", "ja": "速度指標", "de": "Geschwindigkeitsindikatoren"},
    "Model Speed Comparison": {"zh-CN": "模型速度对比", "ru": "Сравнение скорости моделей", "ja": "モデル速度比較", "de": "Modellgeschwindigkeitsvergleich"},
    "Performance tiers": {"zh-CN": "性能等级", "ru": "Уровни производительности", "ja": "パフォーマンスレベル", "de": "Leistungsstufen"},
    "Model": {"zh-CN": "模型", "ru": "Модель", "ja": "モデル", "de": "Modell"},
    "Avg Response Time": {"zh-CN": "平均响应时间", "ru": "Среднее время ответа", "ja": "平均応答時間", "de": "Durchschnittliche Antwortzeit"},
    "Max Response Time": {"zh-CN": "最大响应时间", "ru": "Макс. время ответа", "ja": "最大応答時間", "de": "Maximale Antwortzeit"},
    "Call Count": {"zh-CN": "调用次数", "ru": "Количество вызовов", "ja": "呼び出し数", "de": "Anzahl Aufrufe"},
    "Speed": {"zh-CN": "速度", "ru": "Скорость", "ja": "速度", "de": "Geschwindigkeit"},
    "Avg Tokens/sec": {"zh-CN": "平均代币/秒", "ru": "Среднее токенов/сек", "ja": "平均トークン/秒", "de": "Durchschn. Tokens/Sek."},
    "Avg Latency": {"zh-CN": "平均延迟", "ru": "Средняя задержка", "ja": "平均レイテンシー", "de": "Durchschnittliche Latenz"},
    "Reliability %": {"zh-CN": "可靠性 %", "ru": "Надежность %", "ja": "信頼性 %", "de": "Zuverlässigkeit %"},
    "Speed Tier": {"zh-CN": "速度等级", "ru": "Уровень скорости", "ja": "速度レベル", "de": "Geschwindigkeitsstufe"},

    # Cost breakdown
    "Cost Breakdown by Model": {"zh-CN": "按模型费用明细", "ru": "Разбивка затрат по моделям", "ja": "モデル別コスト明細", "de": "Kostenaufschlüsselung nach Modell"},
    "Per-model spend": {"zh-CN": "每个模型的花费", "ru": "Расходы по моделям", "ja": "モデル別支出", "de": "Ausgaben pro Modell"},
    "Total Cost": {"zh-CN": "总成本", "ru": "Общая стоимость", "ja": "総コスト", "de": "Gesamtkosten"},
    "Most Expensive Model": {"zh-CN": "最贵模型", "ru": "Самая дорогая модель", "ja": "最も高価なモデル", "de": "Teuerstes Modell"},
    "Avg Cost / Call": {"zh-CN": "平均每次调用成本", "ru": "Средняя стоимость вызова", "ja": "平均コスト/コール", "de": "Durchschnittskosten/Aufruf"},
    "Per request": {"zh-CN": "每次请求", "ru": "За запрос", "ja": "リクエストごと", "de": "Pro Anfrage"},

    # Dashboard cards
    "Your Models": {"zh-CN": "您的模型", "ru": "Ваши модели", "ja": "あなたのモデル", "de": "Ihre Modelle"},
    "via New API": {"zh-CN": "通过 New API", "ru": "через New API", "ja": "New API経由", "de": "über New API"},
    "Connect New API to see available models.": {"zh-CN": "连接 New API 以查看可用模型。", "ru": "Подключите New API, чтобы увидеть доступные модели.", "ja": "New APIに接続すると利用可能なモデルが表示されます。", "de": "Verbinden Sie New API, um verfügbare Modelle anzuzeigen."},
    "All Models": {"zh-CN": "所有模型", "ru": "Все модели", "ja": "すべてのモデル", "de": "Alle Modelle"},

    # Token usage
    "Token Usage": {"zh-CN": "代币用量", "ru": "Использование токенов", "ja": "トークン使用量", "de": "Token-Nutzung"},
    "used": {"zh-CN": "已使用", "ru": "использовано", "ja": "使用済み", "de": "verwendet"},
    "remaining": {"zh-CN": "剩余", "ru": "осталось", "ja": "残り", "de": "übrig"},
    "tokens consumed": {"zh-CN": "代币已消耗", "ru": "токенов потреблено", "ja": "消費済みトークン", "de": "Tokens verbraucht"},
    "lifetime spend": {"zh-CN": "累计消费", "ru": "расходы за всё время", "ja": "総支出", "de": "Gesamtausgaben"},

    # Other dashboard text
    "Top Up": {"zh-CN": "充值", "ru": "Пополнить", "ja": "チャージ", "de": "Aufladen"},
    "Buy Tokens": {"zh-CN": "购买代币", "ru": "Купить токены", "ja": "トークンを購入", "de": "Tokens kaufen"},
    "Offline": {"zh-CN": "离线", "ru": "Офлайн", "ja": "オフライン", "de": "Offline"},
    "Loading...": {"zh-CN": "加载中...", "ru": "Загрузка...", "ja": "読み込み中...", "de": "Wird geladen..."},
    "Loading activity...": {"zh-CN": "正在加载活动...", "ru": "Загрузка активности...", "ja": "アクティビティを読み込み中...", "de": "Aktivität wird geladen..."},
    "Loading keys...": {"zh-CN": "正在加载密钥...", "ru": "Загрузка ключей...", "ja": "キーを読み込み中...", "de": "Schlüssel werden geladen..."},
    "Loading usage data...": {"zh-CN": "正在加载用量数据...", "ru": "Загрузка данных об использовании...", "ja": "使用状況データを読み込み中...", "de": "Nutzungsdaten werden geladen..."},
    "Loading response times...": {"zh-CN": "正在加载响应时间...", "ru": "Загрузка времени ответа...", "ja": "応答時間を読み込み中...", "de": "Antwortzeiten werden geladen..."},
    "Loading speed data...": {"zh-CN": "正在加载速度数据...", "ru": "Загрузка данных о скорости...", "ja": "速度データを読み込み中...", "de": "Geschwindigkeitsdaten werden geladen..."},
    "No data yet": {"zh-CN": "暂无数据", "ru": "Нет данных", "ja": "データがまだありません", "de": "Noch keine Daten"},
    "Retry": {"zh-CN": "重试", "ru": "Повторить", "ja": "再試行", "de": "Wiederholen"},

    # Notification types
    "Top-up Confirmed": {"zh-CN": "充值确认", "ru": "Пополнение подтверждено", "ja": "チャージ確認完了", "de": "Aufladung bestätigt"},
    "Low Balance Warning": {"zh-CN": "余额不足提醒", "ru": "Предупреждение о низком балансе", "ja": "残高不足の警告", "de": "Niedrige-Guthaben-Warnung"},
    "API Key Created": {"zh-CN": "API 密钥已创建", "ru": "API-ключ создан", "ja": "APIキー作成完了", "de": "API-Schlüssel erstellt"},
    "dismiss": {"zh-CN": "关闭", "ru": "Закрыть", "ja": "閉じる", "de": "Schließen"},

    # Billing stats
    "Code": {"zh-CN": "代码", "ru": "Код", "ja": "コード", "de": "Code"},
    "Meaning": {"zh-CN": "含义", "ru": "Значение", "ja": "意味", "de": "Bedeutung"},

    # Common labels
    "Tier": {"zh-CN": "等级", "ru": "Уровень", "ja": "ティア", "de": "Stufe"},
    "Free (25K GT)": {"zh-CN": "免费 (25K GT)", "ru": "Бесплатный (25K GT)", "ja": "無料 (25K GT)", "de": "Kostenlos (25K GT)"},
    "Starter": {"zh-CN": "入门", "ru": "Начальный", "ja": "スターター", "de": "Einsteiger"},
    "Pro": {"zh-CN": "专业版", "ru": "Про", "ja": "プロ", "de": "Pro"},

    # More labels from docs
    "Price per 1K tokens": {"zh-CN": "每 1K 代币价格", "ru": "Цена за 1K токенов", "ja": "1Kトークンあたりの価格", "de": "Preis pro 1K Tokens"},
    "Use the OpenAI Python SDK with your GlbTOKEN API key:": {"zh-CN": "使用 OpenAI Python SDK 和您的 GlbTOKEN API 密钥：", "ru": "Используйте OpenAI Python SDK с вашим API-ключом GlbTOKEN:", "ja": "OpenAI Python SDKとGlbTOKEN APIキーを使用：", "de": "Verwenden Sie das OpenAI Python SDK mit Ihrem GlbTOKEN API-Schlüssel:"},
    "List all available models with pricing:": {"zh-CN": "列出所有可用模型及定价：", "ru": "Список всех доступных моделей с ценами:", "ja": "すべての利用可能なモデルと料金を表示：", "de": "Alle verfügbaren Modelle mit Preisen auflisten:"},
    "Send a chat completion request (OpenAI-compatible):": {"zh-CN": "发送聊天补全请求（OpenAI 兼容）：", "ru": "Отправьте запрос чат-завершения (OpenAI-совместимый):", "ja": "チャット補完リクエストを送信（OpenAI互換）：", "de": "Senden Sie eine Chat-Completion-Anfrage (OpenAI-kompatibel):"},
    "Server-Sent Events (SSE) streaming is fully supported:": {"zh-CN": "完全支持 SSE 流式传输：", "ru": "SSE-стриминг полностью поддерживается:", "ja": "SSEストリーミングを完全サポート：", "de": "SSE-Streaming wird vollständig unterstützt:"},
    "Each API call consumes GlbTOKENs based on the model used. Prices vary by model capability:": {"zh-CN": "每次 API 调用根据所用模型消耗 GlbTOKEN。价格因模型能力而异：", "ru": "Каждый API-вызов расходует GlbTOKEN в зависимости от модели. Цены различаются в зависимости от возможностей модели:", "ja": "API呼び出しごとに、使用するモデルに基づいてGlbTOKENを消費。価格はモデルの機能によって異なります：", "de": "Jeder API-Aufruf verbraucht GlbTOKEN basierend auf dem verwendeten Modell. Die Preise variieren je nach Modellfähigkeit:"},
    "Rate limits depend on your account tier:": {"zh-CN": "速率限制取决于您的账户等级：", "ru": "Лимиты зависят от уровня вашего аккаунта:", "ja": "レート制限はアカウントのティアによって異なります：", "de": "Ratenbegrenzungen hängen von Ihrem Kontotier ab:"},

    # Sort buttons
    "↓ Newest": {"zh-CN": "↓ 最新", "ru": "↓ Новые", "ja": "↓ 最新順", "de": "↓ Neueste"},
    "↑ Oldest": {"zh-CN": "↑ 最早", "ru": "↑ Старые", "ja": "↑ 古い順", "de": "↑ Älteste"},
    "A-Z": {"zh-CN": "A-Z", "ru": "А-Я", "ja": "A-Z", "de": "A-Z"},
    "Usage": {"zh-CN": "用量", "ru": "Использование", "ja": "使用状況", "de": "Nutzung"},

    # Usage filter buttons
    "Tokens": {"zh-CN": "代币", "ru": "Токены", "ja": "トークン", "de": "Tokens"},
    "Cost": {"zh-CN": "费用", "ru": "Стоимость", "ja": "コスト", "de": "Kosten"},

    # Org stuff
    "12 members": {"zh-CN": "12 名成员", "ru": "12 участников", "ja": "12名のメンバー", "de": "12 Mitglieder"},
    "Pro Plan": {"zh-CN": "专业版方案", "ru": "Pro-план", "ja": "プロプラン", "de": "Pro-Tarif"},
    "this month": {"zh-CN": "本月", "ru": "в этом месяце", "ja": "今月", "de": "diesen Monat"},
    "vs last month": {"zh-CN": "与上月相比", "ru": "по сравнению с прошлым месяцем", "ja": "先月比", "de": "vs. letzten Monat"},

    # More misc
    "0 events": {"zh-CN": "0 个事件", "ru": "0 событий", "ja": "0 イベント", "de": "0 Ereignisse"},
    "Search": {"zh-CN": "搜索", "ru": "Поиск", "ja": "検索", "de": "Suche"},
    "Toggle theme": {"zh-CN": "切换主题", "ru": "Переключить тему", "ja": "テーマ切替", "de": "Design umschalten"},
    "Translate": {"zh-CN": "翻译", "ru": "Перевести", "ja": "翻訳", "de": "Übersetzen"},

    # Profile
    "Enter current password": {"zh-CN": "输入当前密码", "ru": "Введите текущий пароль", "ja": "現在のパスワードを入力", "de": "Aktuelles Passwort eingeben"},
    "Enter new password": {"zh-CN": "输入新密码", "ru": "Введите новый пароль", "ja": "新しいパスワードを入力", "de": "Neues Passwort eingeben"},

    # Best practices text
    "Rotate keys regularly": {"zh-CN": "定期轮换密钥", "ru": "Регулярно меняйте ключи", "ja": "定期的にキーを更新", "de": "Schlüssel regelmäßig rotieren"},
    "Use separate keys per project": {"zh-CN": "每个项目使用单独的密钥", "ru": "Используйте отдельные ключи для каждого проекта", "ja": "プロジェクトごとに個別のキーを使用", "de": "Separate Schlüssel pro Projekt verwenden"},
    "Set max tokens": {"zh-CN": "设置最大代币数", "ru": "Установить макс. токенов", "ja": "最大トークンを設定", "de": "Max-Token setzen"},
    "Monitor usage": {"zh-CN": "监控用量", "ru": "Отслеживание использования", "ja": "使用状況を監視", "de": "Nutzung überwachen"},
    "Handle 402 errors": {"zh-CN": "处理 402 错误", "ru": "Обрабатывайте ошибки 402", "ja": "402エラーに対処", "de": "402-Fehler behandeln"},

    # Error codes meaning
    "Invalid or missing API key": {"zh-CN": "无效或缺失的 API 密钥", "ru": "Недействительный или отсутствующий API-ключ", "ja": "無効または欠落しているAPIキー", "de": "Ungültiger oder fehlender API-Schlüssel"},
    "Insufficient token balance": {"zh-CN": "代币余额不足", "ru": "Недостаточный баланс токенов", "ja": "トークン残高不足", "de": "Nicht genügend Token-Guthaben"},
    "Model not found or not available": {"zh-CN": "模型未找到或不可用", "ru": "Модель не найдена или недоступна", "ja": "モデルが見つからないか利用不可", "de": "Modell nicht gefunden oder nicht verfügbar"},
    "Rate limited — slow down requests": {"zh-CN": "速率受限——请降低请求频率", "ru": "Превышен лимит — снизьте частоту запросов", "ja": "レート制限に達しました——リクエストを減らしてください", "de": "Rate limit — reduzieren Sie die Anfragen"},

    # Support chat
    "Support": {"zh-CN": "支持", "ru": "Поддержка", "ja": "サポート", "de": "Support"},
    "Hi! I'm the GlbTOKEN assistant. Ask me about buying tokens, AI models, payments, or API keys.": {"zh-CN": "您好！我是 GlbTOKEN 助手。您可以咨询购买代币、AI 模型、支付或 API 密钥等问题。", "ru": "Привет! Я помощник GlbTOKEN. Спрашивайте о покупке токенов, моделях ИИ, платежах или API-ключах.", "ja": "こんにちは！GlbTOKENアシスタントです。トークンの購入、AIモデル、支払い、APIキーについて質問してください。", "de": "Hallo! Ich bin der GlbTOKEN-Assistent. Fragen Sie mich zu Tokens, KI-Modellen, Zahlungen oder API-Schlüsseln."},
    "Send a message...": {"zh-CN": "发送消息...", "ru": "Отправить сообщение...", "ja": "メッセージを送信...", "de": "Nachricht senden..."},

    # Playground hints
    "Ask anything, get answers from 100+ AI models": {"zh-CN": "提出任何问题，从 100+ AI 模型获取答案", "ru": "Спросите что угодно, получите ответы от 100+ моделей ИИ", "ja": "何でも質問して、100以上のAIモデルから回答を得る", "de": "Fragen Sie alles und erhalten Sie Antworten von 100+ KI-Modellen"},
    "Type your message here...": {"zh-CN": "在此输入您的消息...", "ru": "Введите сообщение...", "ja": "メッセージを入力...", "de": "Geben Sie Ihre Nachricht ein..."},

    # More context
    "Generating new API keys from your Dashboard and revoke old ones.": {"zh-CN": "从控制台生成新的 API 密钥并撤销旧的。", "ru": "Создавайте новые API-ключи из панели и отзывайте старые.", "ja": "ダッシュボードから新しいAPIキーを生成して古いものを取り消す。", "de": "Neue API-Schlüssel im Dashboard erstellen und alte widerrufen."},
    "Helps track usage and limit blast radius.": {"zh-CN": "有助于跟踪使用情况并限制影响范围。", "ru": "Помогает отслеживать использование и ограничивать последствия.", "ja": "使用状況の追跡と影響範囲の制限に役立ちます。", "de": "Hilft, die Nutzung zu verfolgen und den Schadensradius zu begrenzen."},
    "Always set max_tokens to control costs.": {"zh-CN": "始终设置 max_tokens 以控制成本。", "ru": "Всегда устанавливайте max_tokens для контроля расходов.", "ja": "常にmax_tokensを設定してコストを管理。", "de": "Immer max_tokens setzen, um Kosten zu kontrollieren."},
    "Check your Dashboard for real-time token consumption.": {"zh-CN": "在控制台查看实时代币消耗。", "ru": "Проверяйте панель для отслеживания расхода токенов в реальном времени.", "ja": "ダッシュボードでリアルタイムのトークン消費を確認。", "de": "Prüfen Sie das Dashboard für Echtzeit-Token-Verbrauch."},
    "Top up before your balance runs out to avoid service interruption.": {"zh-CN": "在余额耗尽前充值，避免服务中断。", "ru": "Пополняйте баланс до его истощения, чтобы избежать перерыва.", "ja": "残高がなくなる前にチャージしてサービス中断を防ぐ。", "de": "Laden Sie Ihr Guthaben auf, bevor es aufgebraucht ist."},

    # Additional
    "Total:": {"zh-CN": "总计：", "ru": "Итого:", "ja": "合計：", "de": "Gesamt:"},
    "Cost:": {"zh-CN": "费用：", "ru": "Стоимость:", "ja": "コスト：", "de": "Kosten:"},
    "Your balance is below 1,000 tokens": {"zh-CN": "您的余额低于 1,000 个代币", "ru": "Ваш баланс ниже 1 000 токенов", "ja": "残高が1,000トークンを下回っています", "de": "Ihr Guthaben liegt unter 1.000 Tokens"},
    "Pending": {"zh-CN": "待处理", "ru": "В ожидании", "ja": "保留中", "de": "Ausstehend"},
    "Active": {"zh-CN": "活跃", "ru": "Активен", "ja": "アクティブ", "de": "Aktiv"},
    "Inactive": {"zh-CN": "不活跃", "ru": "Неактивен", "ja": "非アクティブ", "de": "Inaktiv"},
    "Success": {"zh-CN": "成功", "ru": "Успешно", "ja": "成功", "de": "Erfolg"},
    "Failed": {"zh-CN": "失败", "ru": "Ошибка", "ja": "失敗", "de": "Fehlgeschlagen"},
    "Copied!": {"zh-CN": "已复制！", "ru": "Скопировано!", "ja": "コピーしました！", "de": "Kopiert!"},
    "Copy code": {"zh-CN": "复制代码", "ru": "Копировать код", "ja": "コードをコピー", "de": "Code kopieren"},
    "Copy Code": {"zh-CN": "复制代码", "ru": "Копировать код", "ja": "コードをコピー", "de": "Code kopieren"},

    # Footer
    "Product": {"zh-CN": "产品", "ru": "Продукт", "ja": "製品", "de": "Produkt"},
    "Company": {"zh-CN": "公司", "ru": "Компания", "ja": "会社情報", "de": "Unternehmen"},
    "Contact": {"zh-CN": "联系我们", "ru": "Контакты", "ja": "お問い合わせ", "de": "Kontakt"},
    "Contact support": {"zh-CN": "联系客服", "ru": "Связаться с поддержкой", "ja": "サポートに連絡", "de": "Support kontaktieren"},
    "Global Token for AI. One balance, 100+ models, 56 providers. Pay-as-you-go.": {
        "zh-CN": "全球 AI 代币。一个余额，100+ 模型，56 家供应商。按需付费。",
        "ru": "Глобальный токен для ИИ. Один баланс, 100+ моделей, 56 провайдеров. Платите по мере использования.",
        "ja": "AIのためのグローバルトークン。1つの残高、100以上のモデル、56のプロバイダー。従量課金制。",
        "de": "Globales Token für KI. Ein Guthaben, 100+ Modelle, 56 Anbieter. Pay-as-you-go."
    },
    "footer-tagline": {"zh-CN": "全球 AI 代币。一个余额，100+ 模型，56 家供应商。按需付费。",
        "ru": "Глобальный токен для ИИ. Один баланс, 100+ моделей, 56 провайдеров. Платите по мере использования.",
        "ja": "AIのためのグローバルトークン。1つの残高、100以上のモデル、56のプロバイダー。従量課金制。",
        "de": "Globales Token für KI. Ein Guthaben, 100+ Modelle, 56 Anbieter. Pay-as-you-go."},
}

STANDARD_WORDS = {
    "API", "GT", "USD", "AI", "SSE", "CSV", "URL", "HTML", "CSS", "JS",
    "JSON", "SDK", "CLI", "GUI", "HTTP", "HTTPS", "IP", "DNS", "REST",
    "OpenAI", "Anthropic", "Google", "Meta", "DeepSeek", "Mistral",
    "Stripe", "Paystack", "GitHub", "GlbTOKEN", "Glb", "TOKEN",
    "github.com", "glbtoken.com", "Railway", "Cloudflare",
    "GPT-4o", "GPT-4", "Claude 3.5", "Claude 3", "Gemini 2.0",
    "Llama 3.1", "Llama 4", "DeepSeek V3", "Mistral Large",
    "gpt-4o-mini", "gpt-4-turbo", "claude-3.5-sonnet", "claude-3-opus",
    "Sonnet", "Maverick", "Opus", "Turbo", "Flash", "GPT", "GT",
    "Token", "Tokens", "GT Token", "GT Tokens", "sk-glt",
    "base_url", "api_key", "Authorization", "Bearer", "max_tokens",
    "temperature", "top_p", "frequency_penalty", "presence_penalty",
    "stream", "role", "content", "model", "messages",
    "EN", "DE", "RU", "JP", "notranslate",
    "RPM", "TPM", "7d", "30d", "90d",
}

def extract_text_from_html(filepath):
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()
    content = re.sub(r'<script[^>]*>.*?</script>', '', content, flags=re.DOTALL | re.IGNORECASE)
    content = re.sub(r'<style[^>]*>.*?</style>', '', content, flags=re.DOTALL | re.IGNORECASE)
    content = re.sub(r'<svg[^>]*>.*?</svg>', '', content, flags=re.DOTALL | re.IGNORECASE)
    content = re.sub(r'<pre[^>]*>.*?</pre>', '', content, flags=re.DOTALL | re.IGNORECASE)
    content = re.sub(r'<code[^>]*>.*?</code>', '', content, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<[^>]+>', ' ', content)
    text = html_mod.unescape(text)
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
        # Skip if contains non-Latin chars
        if re.search(r'[\u4e00-\u9fff\u0400-\u04ff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]', line):
            continue
        lines.append(line)
    return lines

def load_existing_translations():
    if not os.path.exists(TRANS_FILE):
        return set()
    with open(TRANS_FILE, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()
    keys = set(re.findall(r'TRANS\["([^"]+)"\]', content))
    keys.update(re.findall(r"TRANS\['([^']+)'\]", content))
    return keys

def should_skip(text):
    stripped = text.strip()
    if not stripped or len(stripped) < 3:
        return True
    # Check standard words
    for w in STANDARD_WORDS:
        if stripped.lower() == w.lower():
            return True
    # Skip single words that are navigation labels etc
    if len(stripped.split()) == 1:
        single = stripped.upper()
        known = {"DASHBOARD", "LOGIN", "REGISTER", "LOGOUT", "SAVE",
                  "CANCEL", "DELETE", "EDIT", "VIEW", "LOAD", "DONE",
                  "BACK", "NEXT", "PREV", "ALL", "TOP", "NEW",
                  "CHAT", "GENERAL", "PERSONAL", "ADMIN", "TEAM",
                  "OVERVIEW", "BILLING", "SETTINGS", "PLAYGROUND",
                  "DOCS", "HOME", "ABOUT", "BLOG", "FAQ", "CONTACT",
                  "PRICING", "MODELS", "SUPPORT", "TERMS", "PRIVACY",
                  "REFUND", "HELLO", "CLOSE", "OPEN", "MORE",
                  "SHOW", "HIDE", "ADD", "REMOVE", "COPY", "APPLY",
                  "FILTER", "SORT", "RESET", "ACCOUNT", "PROFILE",
                  "SECURITY", "NOTIFICATIONS", "DEPOSITS", "CONSUMPTION",
                  "OWNER", "VIEWER", "TIMESTAMP", "STATUS", "AMOUNT",
                  "DEVICE", "LOCATION", "RECEIPT", "METHOD", "TIER",
                  "CODE", "MEANING", "MODEL", "SPEED", "COST", "USAGE",
                  "TOKENS", "COST:", "TOTAL:", "SEARCH", "SUPPORT",
                  "CONTACT", "COMPANY", "PRODUCT", "BILLING", "SETTINGS",
                  "PLAYGROUND", "DOCS", "PENDING", "ACTIVE", "INACTIVE"}
        if single in known:
            return True
    return False

def main():
    print("=== Deep Auto-Translator ===\n")
    
    existing_keys = load_existing_translations()
    print(f"Existing TRANS keys: {len(existing_keys)}")

    # Extract all texts
    all_texts = set()
    for html_file in ALL_HTML:
        fp = os.path.join(PROJECT_DIR, html_file)
        if not os.path.exists(fp):
            continue
        texts = extract_text_from_html(fp)
        all_texts.update(texts)
    print(f"Total unique texts from HTML: {len(all_texts)}")

    # Find untranslated ones that we have dictionary entries for
    new_entries = []
    for text in sorted(all_texts, key=lambda x: (len(x), x)):
        if text in existing_keys:
            continue
        if should_skip(text):
            continue
        # Check for similar
        similar = False
        for key in existing_keys:
            if text.lower() == key.lower():
                similar = True
                break
        if similar:
            continue
        
        # Check our dictionary
        if text in T:
            t = T[text]
            escaped_text = text.replace('\\', '\\\\').replace('"', '\\"')
            zh = t.get("zh-CN", text).replace('\\', '\\\\').replace('"', '\\"')
            ru = t.get("ru", text).replace('\\', '\\\\').replace('"', '\\"')
            ja = t.get("ja", text).replace('\\', '\\\\').replace('"', '\\"')
            de = t.get("de", text).replace('\\', '\\\\').replace('"', '\\"')
            entry = f'TRANS["{escaped_text}"] = {{en: "{escaped_text}", "zh-CN": "{zh}", ru: "{ru}", ja: "{ja}", de: "{de}"}};'
            new_entries.append((text, entry))
        else:
            # Try to match with data-i18n keys (mixed keys may already exist)
            pass

    print(f"New translations to add: {len(new_entries)}")
    
    if not new_entries:
        print("Nothing new to translate.")
        return

    # Read existing file
    with open(TRANS_FILE, "r", encoding="utf-8") as f:
        existing = f.read()

    # Build new content
    new_section = "\n\n// ── Auto-translated dashboard/i18n texts ──\n"
    for text, entry in new_entries:
        new_section += entry + "\n"

    # Insert before the IIFE section
    insert_pos = existing.rfind("\n\n(function()")
    if insert_pos == -1:
        insert_pos = existing.rfind("(function()")
    if insert_pos == -1:
        insert_pos = len(existing)
    
    updated = existing[:insert_pos] + new_section + existing[insert_pos:]

    with open(TRANS_FILE, "w", encoding="utf-8") as f:
        f.write(updated)

    print(f"✅ Appended {len(new_entries)} new translations to translations.js")
    
    # Bump version v=225 → v=226
    print("\nBumping version v=225 → v=226...")
    try:
        subprocess.run(
            "cd ~/projects/glbtoken && find . -name '*.html' -o -name '*.js' -o -name '*.css' | xargs sed -i '' 's/v=225/v=226/g' 2>/dev/null",
            shell=True, check=True, timeout=30
        )
        print("✅ Version bumped to v=226")
    except Exception as e:
        print(f"⚠️ Version bump error: {e}")

    # Git commit & push
    try:
        subprocess.run("cd ~/projects/glbtoken && git add -A", shell=True, check=True, capture_output=True, timeout=30)
        result = subprocess.run(
            f"cd ~/projects/glbtoken && git commit -m 'v=226 auto-translate {len(new_entries)} dashboard and ui strings' && git push",
            shell=True, capture_output=True, text=True, timeout=60
        )
        if result.stdout:
            print(result.stdout[-300:])
        if result.stderr:
            print(result.stderr[-300:])
        print(f"✅ Pushed v=226")
    except Exception as e:
        print(f"⚠️ Git error: {e}")

    return 0

if __name__ == "__main__":
    sys.exit(main())
