"""Regression checks for the dashboard mobile layout and chart themes."""

from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def read(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


def css_block(source: str, selector: str) -> str:
    """Return a simple CSS rule body without coupling tests to declaration order."""

    rule = source.index(selector)
    body = source.index("{", rule)
    return source[body + 1 : source.index("}", body)]


def table_fragment(source: str, table_id: str) -> str:
    """Return one complete table by id, independent of attribute order."""

    marker = source.index(f'id="{table_id}"')
    start = source.rfind("<table", 0, marker)
    end = source.index("</table>", marker) + len("</table>")
    return source[start:end]


def colgroup_classes(source: str, table_id: str) -> list[str]:
    """Return the semantic column classes declared by one table."""

    return re.findall(r'<col\s+class="([^"]+)"\s*/?>', table_fragment(source, table_id))


def test_gateway_telemetry_is_the_top_right_header_item() -> None:
    html = read("dashboard.html")
    css = read("dashboard.css")

    title = html.index('id="gatewayOverviewTitle"')
    controls = html.index('class="gateway-card-controls"', title)
    telemetry = html.index('id="dashGatewayStatus"', controls)
    metrics = html.index('class="stat-cards gateway-metric-grid"', telemetry)

    assert title < controls < telemetry < metrics
    assert "grid-template-columns: minmax(0, 1fr) auto auto;" in css
    assert ".gateway-card-header .gateway-status-state" in css
    assert ".gateway-card-header .gateway-status small" in css
    assert "grid-column: 2;" in css
    assert "grid-row: 1;" in css


def test_overview_restores_request_logs_panel_and_account_loader() -> None:
    html = read("dashboard.html")
    css = read("dashboard.css")
    source = read("dashboard.js")

    grid = html.index('class="charts-side-grid"')
    usage = html.index('id="dailyChart"', grid)
    request_logs = html.index('id="dashRequestLogs"', usage)
    grid_end = html.index('<!-- ═══════ ADMIN:', request_logs)
    panel = html[request_logs:grid_end]

    # Request Logs is a visible Overview card beside Usage, not merely a link
    # in Gateway Overview or a panel that only exists on the full Logs page.
    assert grid < usage < request_logs < grid_end
    assert 'id="dashActivity"' not in html[grid:grid_end]
    assert 'id="dashRequestLogTable"' in panel
    assert 'id="dashRequestLogBody"' in panel
    assert "overview-data-table" in panel
    assert "overview-table-scroll" in panel
    assert 'href="logs.html"' in panel
    assert "View all" in panel

    # Overview uses the authenticated account-scoped endpoint, loads a compact
    # five-row preview on boot/refresh, and reuses Login History's established
    # bold-date / time-below timestamp instead of maintaining a third format.
    assert "async function loadOverviewRequestLogs()" in source
    assert "/api/logs?page=1&page_size=5" in source
    assert source.count("loadOverviewRequestLogs()") >= 2
    overview_start = source.index("async function loadOverviewRequestLogs()")
    overview_end = source.index("// ── Recent Transactions", overview_start)
    overview_loader = source[overview_start:overview_end]
    assert "fmtDTStack(iso)" in overview_loader
    assert 'class="td-date overview-table-time"' in overview_loader
    assert "function fmtOverviewLogTime(iso)" not in source

    assert "overflow-x: auto;" in css_block(css, ".overview-table-scroll")
    assert "white-space: nowrap;" in css_block(css, ".overview-data-table th,\n.overview-data-table td")
    assert "word-break: normal;" in css_block(css, ".overview-data-table th,\n.overview-data-table td")
    assert "font-variant-numeric: tabular-nums;" in css_block(css, ".overview-table-time")
    assert "font-weight: 600;" in css_block(css, ".td-date-strong")
    assert "color: var(--text-muted);" in css_block(css, ".td-time")


def test_overview_request_logs_and_transactions_share_mobile_table_contract() -> None:
    html = read("dashboard.html")
    css = read("dashboard.css")
    source = read("dashboard.js")

    request_start = html.rfind('<div class="dash-card', 0, html.index('id="dashRequestLogs"'))
    request_end = html.index('<!-- ═══════ ADMIN:', request_start)
    request_card = html[request_start:request_end]
    recent_start = html.index('<!-- ═══════ RECENT TRANSACTIONS')
    recent_end = html.index('<!-- Playground moved', recent_start)
    recent_card = html[recent_start:recent_end]

    # Both Overview data cards use the same typography, scroll and icon
    # primitives. This prevents Request Logs from becoming a one-off design.
    for card in (request_card, recent_card):
        assert "overview-data-card" in card
        assert "overview-data-table" in card
        assert "overview-table-scroll" in card
        assert "overview-data-icon" in card
    assert 'id="dashRequestLogTable"' in request_card
    assert 'id="dashRecentTxTable"' in recent_card

    icon_rule = css_block(css, ".overview-data-icon")
    assert "color: var(--primary);" in icon_rule
    assert "html.light .dashboard-request-logs-icon" not in css
    request_styles = css[
        css.index(".overview-data-card {") : css.index("/* Filter button row */")
    ]
    assert "#4fc3f7" not in request_styles.lower()
    assert "#2563eb" not in request_styles.lower()

    # Both renderers use Login History's same two-line timestamp contract.
    recent_renderer = source[
        source.index("async function loadRecentTx()") : source.index(
            "// ── Developer command center"
        )
    ]
    assert "var iso = t.created_at || '';" in recent_renderer
    assert "fmtDTStack(iso)" in recent_renderer
    assert 'class="td-date overview-table-time"' in recent_renderer
    assert source.count("fmtDTStack(iso)") >= 2
    assert "var typeLabels = {consumption:'Usage', deposit:'Deposit', topup:'Top-up'};" in recent_renderer

    # Explicit semantic columns keep adjacent headings evenly packed. Both
    # tables occupy the same compact width so Tokens/Latency/Status cannot
    # drift into unused space merely because their content is short.
    request_table = request_card[
        request_card.index('id="dashRequestLogTable"') : request_card.index(
            "</table>", request_card.index('id="dashRequestLogTable"')
        )
    ]
    recent_table = recent_card[
        recent_card.index('id="dashRecentTxTable"') : recent_card.index(
            "</table>", recent_card.index('id="dashRecentTxTable"')
        )
    ]
    assert "<thead><tr><th>Time</th>" in recent_table
    assert "<thead><tr><th>Date</th>" not in recent_table
    request_columns = [
        "overview-col-time",
        "overview-col-model",
        "overview-col-tokens",
        "overview-col-latency",
        "overview-col-request-status",
    ]
    recent_columns = [
        "overview-col-time",
        "overview-col-type",
        "overview-col-detail",
        "overview-col-amount",
        "overview-col-transaction-status",
    ]
    assert re.findall(r'<col\s+class="([^"]+)"\s*/?>', request_table) == request_columns
    assert re.findall(r'<col\s+class="([^"]+)"\s*/?>', recent_table) == recent_columns

    mobile = css[css.index("@media (max-width: 768px)", css.index(".overview-data-table")) :]
    mobile_table = css_block(mobile, ".overview-data-table")
    assert "min-width: 390px;" in mobile_table
    assert "table-layout: fixed;" in mobile_table
    mobile_head = css_block(mobile, ".overview-data-table th")
    assert "font-size: 0.65rem;" in mobile_head
    assert "padding: 0.38rem 0.22rem;" in mobile_head
    mobile_cell = css_block(mobile, ".overview-data-table td")
    assert "font-size: 0.72rem;" in mobile_cell
    assert "padding: 0.38rem 0.22rem;" in mobile_cell
    assert "white-space: nowrap;" in css_block(
        css, ".overview-data-table th,\n.overview-data-table td"
    )

    request_widths = {
        "overview-col-time": 84,
        "overview-col-model": 112,
        "overview-col-tokens": 62,
        "overview-col-latency": 72,
        "overview-col-request-status": 60,
    }
    recent_widths = {
        "overview-col-time": 84,
        "overview-col-type": 58,
        "overview-col-detail": 108,
        "overview-col-amount": 66,
        "overview-col-transaction-status": 74,
    }
    for name, width in request_widths.items():
        rule = css_block(mobile, f"#dashRequestLogTable .{name}")
        assert f"width: {width}px;" in rule
    for name, width in recent_widths.items():
        rule = css_block(mobile, f"#dashRecentTxTable .{name}")
        assert f"width: {width}px;" in rule
    assert sum(request_widths.values()) == sum(recent_widths.values()) == 390

    # Appearance's compact-cards mode must not re-expand or distort one table.
    compact_cells = css_block(
        mobile,
        "body.compact-cards .overview-data-table th",
    )
    assert "padding: 0.38rem 0.22rem;" in compact_cells
    compact_card = css_block(mobile, "body.compact-cards .overview-data-card.stat-card")
    assert "padding: 0.75rem;" in compact_card


def test_full_request_logs_lead_analytics_and_preserve_mobile_table() -> None:
    html = read("logs.html")
    css = read("logs.css")

    request_logs = html.index('id="dashRequestLogs"')
    analytics_grid = html.index('class="logs-grid"')
    formatter_start = html.index("function formatLogTimestamp(iso)")
    formatter_end = html.index("function setLogsStatus", formatter_start)
    formatter = html[formatter_start:formatter_end]
    renderer_start = html.index("function renderRequestLogRows()")
    renderer_end = html.index("async function loadRequestLogs", renderer_start)
    renderer = html[renderer_start:renderer_end]

    # The complete request history is the first substantive Logs card. On
    # mobile it no longer disappears below a long stack of analytics cards.
    assert request_logs < analytics_grid
    assert 'class="scroll-x request-logs-scroll"' in html
    assert 'id="requestLogTable"' in html
    request_columns = [
        "logs-col-time",
        "logs-col-model",
        "logs-col-provider",
        "logs-col-tokens",
        "logs-col-latency",
        "logs-col-cost",
        "logs-col-status",
    ]
    assert colgroup_classes(html, "requestLogTable") == request_columns
    assert "safeApi('GET','/api/logs?page=" in html
    assert "fmtDTStack(iso)" in formatter
    assert "formatLogTimestamp(time)" in renderer
    assert '<td class="td-date logs-timestamp"' in renderer
    assert "escapeHtml(timeCell)" not in renderer
    assert "+timeCell+" in renderer
    assert "overflow-x: auto;" in css_block(css, ".request-logs-scroll")
    assert "min-width: 760px;" in css_block(css, "#requestLogTable")
    request_cells = css_block(css, "#requestLogTable th,\n#requestLogTable td")
    assert "white-space: nowrap;" in request_cells
    assert "word-break: normal;" in request_cells
    assert "min-width: 0;" in css_block(css, "#dashRequestLogs")
    assert "flex-wrap: nowrap;" in css_block(css, ".logs-title-row")
    assert "white-space: nowrap;" in css_block(css, ".logs-title-main")
    filters = css_block(css, ".logs-filter-wrap,\n.logs-status-filter")
    assert "flex-wrap: nowrap;" in filters
    assert "white-space: nowrap;" in filters

    # The full Logs card follows Appearance instead of carrying a separate
    # blue theme or decorative top stripe.
    assert "--logs-blue" not in css
    assert "#4fc3f7" not in css.lower()
    assert "#2563eb" not in css.lower()
    assert "#dashRequestLogs::before" not in css
    assert "color: var(--primary);" in css_block(css, ".logs-title-main svg")
    assert "var(--primary)" in css_block(css, ".request-logs-scroll:focus-visible")
    assert "font-weight: 600;" in css_block(
        css, "#requestLogTable .logs-timestamp .td-date-strong"
    )
    full_log_time = css_block(css, "#requestLogTable .logs-timestamp .td-time")
    assert "font-size: 0.7rem;" in full_log_time
    assert "color: var(--text-muted);" in full_log_time

    mobile = css[css.index("@media (max-width: 767px)", css.index("#requestLogTable")) :]
    mobile_table = css_block(mobile, "#requestLogTable")
    assert "min-width: 590px;" in mobile_table
    assert "table-layout: fixed;" in mobile_table
    assert "font-size: 0.72rem;" in mobile_table
    mobile_head = css_block(mobile, "#requestLogTable th")
    assert "font-size: 0.65rem;" in mobile_head
    assert "padding: 0.38rem 0.22rem;" in mobile_head
    mobile_cell = css_block(mobile, "#requestLogTable td")
    assert "font-size: 0.72rem;" in mobile_cell
    assert "padding: 0.38rem 0.22rem;" in mobile_cell
    mobile_time = css_block(mobile, "#requestLogTable .logs-timestamp")
    assert "font-size: 0.72rem;" in mobile_time
    timestamp_width = re.search(r"min-width:\s*([0-9.]+)rem;", mobile_time)
    assert timestamp_width is not None
    assert float(timestamp_width.group(1)) < 9.5

    request_widths = {
        "logs-col-time": 88,
        "logs-col-model": 112,
        "logs-col-provider": 76,
        "logs-col-tokens": 116,
        "logs-col-latency": 70,
        "logs-col-cost": 74,
        "logs-col-status": 54,
    }
    for name, width in request_widths.items():
        assert f"width: {width}px;" in css_block(
            mobile, f"#requestLogTable .{name}"
        )
    assert sum(request_widths.values()) == 590

    # The secondary analytics tables follow the same direct mobile type rules;
    # inherited table font sizes must not silently enlarge individual cells.
    assert colgroup_classes(html, "responseTimeTable") == [
        "logs-compact-col-model",
        "logs-compact-col-provider",
        "logs-compact-col-metric",
        "logs-compact-col-date",
    ]
    assert colgroup_classes(html, "keyUsageTable") == [
        "logs-compact-col-key",
        "logs-compact-col-key-model",
        "logs-compact-col-calls",
        "logs-compact-col-tokens",
    ]
    compact_tables = css_block(mobile, "#responseTimeTable,\n  #keyUsageTable")
    assert "min-width: 340px;" in compact_tables
    assert "table-layout: fixed;" in compact_tables
    compact_heads = css_block(mobile, "#responseTimeTable th,\n  #keyUsageTable th")
    compact_cells = css_block(mobile, "#responseTimeTable td,\n  #keyUsageTable td")
    assert "font-size: 0.65rem;" in compact_heads
    assert "font-size: 0.72rem;" in compact_cells
    response_widths = [96, 72, 90, 82]
    key_widths = [100, 105, 55, 80]
    for name, width in zip(colgroup_classes(html, "responseTimeTable"), response_widths):
        assert f"width: {width}px;" in css_block(
            mobile, f"#responseTimeTable .{name}"
        )
    for name, width in zip(colgroup_classes(html, "keyUsageTable"), key_widths):
        assert f"width: {width}px;" in css_block(
            mobile, f"#keyUsageTable .{name}"
        )
    assert sum(response_widths) == sum(key_widths) == 340

    response_table = table_fragment(html, "responseTimeTable")
    assert '<span class="logs-label-wide">Avg Response Time</span>' in response_table
    assert '<span class="logs-label-compact">Avg Time</span>' in response_table
    assert "display: none;" in css_block(css, ".logs-label-compact")
    assert "display: none;" in css_block(mobile, ".logs-label-wide")
    assert "display: inline;" in css_block(mobile, ".logs-label-compact")


def test_usage_history_tables_have_compact_fixed_mobile_geometry() -> None:
    html = read("usage.html")
    css = read("usage.css")
    filters = read("filters.js")
    login_history = read("login-history.js")

    expected_columns = {
        "txDeposits": [
            "usage-col-date",
            "usage-col-amount",
            "usage-col-method",
            "usage-col-tokens",
            "usage-col-status",
        ],
        "txConsumption": [
            "usage-col-date",
            "usage-col-model",
            "usage-col-tokens",
            "usage-col-type",
        ],
        "loginTable": [
            "usage-col-device",
            "usage-col-browser",
            "usage-col-location",
            "usage-col-ip",
            "usage-col-login-status",
            "usage-col-time",
        ],
    }
    for table_id, columns in expected_columns.items():
        assert "usage-history-table" in table_fragment(html, table_id)
        assert colgroup_classes(html, table_id) == columns

    # Deposits/consumption and Login History retain the shared bold date over
    # muted time formatter rather than creating page-specific timestamps.
    assert filters.count("fmtDTStack(t.created_at)") >= 2
    assert "fmtDTStack(event.created_at)" in login_history

    mobile = css[
        css.index("@media (max-width: 768px)", css.index("Mobile history tables")) :
    ]
    deposits_and_login = css_block(mobile, "#txDeposits,\n  #loginTable")
    consumption = css_block(mobile, "#txConsumption")
    assert "min-width: 360px;" in deposits_and_login
    assert "table-layout: fixed;" in deposits_and_login
    assert "min-width: 330px;" in consumption
    assert "table-layout: fixed;" in consumption

    header_rule = css_block(mobile, ".tx-scroll.tx-fit .usage-history-table th")
    cell_rule = css_block(mobile, ".tx-scroll.tx-fit .usage-history-table td")
    assert "padding: 0.38rem 0.22rem;" in header_rule
    assert "font-size: 0.65rem;" in header_rule
    assert "padding: 0.38rem 0.22rem;" in cell_rule
    assert "font-size: 0.72rem;" in cell_rule

    widths = {
        "txDeposits": {
            "usage-col-date": 78,
            "usage-col-amount": 62,
            "usage-col-method": 72,
            "usage-col-tokens": 62,
            "usage-col-status": 86,
        },
        "txConsumption": {
            "usage-col-date": 78,
            "usage-col-model": 128,
            "usage-col-tokens": 70,
            "usage-col-type": 54,
        },
        "loginTable": {
            "usage-col-device": 80,
            "usage-col-browser": 64,
            "usage-col-location": 68,
            "usage-col-login-status": 68,
            "usage-col-time": 80,
        },
    }
    expected_totals = {"txDeposits": 360, "txConsumption": 330, "loginTable": 360}
    for table_id, column_widths in widths.items():
        for name, width in column_widths.items():
            assert f"width: {width}px;" in css_block(
                mobile, f"#{table_id} .{name}"
            )
        assert sum(column_widths.values()) == expected_totals[table_id]
    assert "display: none;" in css_block(mobile, "#loginTable .usage-col-ip")


def test_billing_invoices_use_shared_timestamp_and_two_mobile_widths() -> None:
    html = read("billing.html")
    css = read("billing.css")

    columns = [
        "billing-col-date",
        "billing-col-amount",
        "billing-col-method",
        "billing-col-tokens",
        "billing-col-status",
        "billing-col-receipt",
    ]
    assert "billing-history-table" in table_fragment(html, "invoicesTable")
    assert colgroup_classes(html, "invoicesTable") == columns

    renderer_start = html.index("function renderInvoices()")
    renderer_end = html.index("function computeSummary", renderer_start)
    renderer = html[renderer_start:renderer_end]
    assert "fmtDTStack(dateRaw)" in renderer
    assert "' + timestampHtml + '" in renderer
    assert "escapeHtml(timestampHtml)" not in renderer

    mobile = css[
        css.index("@media (max-width: 767px)", css.index("Invoices table")) :
    ]
    table_rule = css_block(mobile, "#invoicesTable")
    assert "min-width: 440px;" in table_rule
    assert "table-layout: fixed;" in table_rule
    head_rule = css_block(mobile, "#invoicesTable th")
    cell_rule = css_block(mobile, "#invoicesTable td")
    assert "font-size: 0.65rem;" in head_rule
    assert "font-size: 0.72rem;" in cell_rule

    widths = {
        "billing-col-date": 78,
        "billing-col-amount": 62,
        "billing-col-method": 72,
        "billing-col-tokens": 62,
        "billing-col-status": 86,
        "billing-col-receipt": 80,
    }
    for name, width in widths.items():
        assert f"width: {width}px;" in css_block(
            mobile, f"#invoicesTable .{name}"
        )
    assert sum(widths.values()) == 440

    small = css[
        css.index("@media (max-width: 560px)", css.index("Invoices table")) :
    ]
    assert "min-width: 360px;" in css_block(small, "#invoicesTable")
    hidden_receipt = css_block(small, "#invoicesTable .billing-col-receipt")
    assert "display: none;" in hidden_receipt
    assert sum(width for name, width in widths.items() if name != "billing-col-receipt") == 360


def test_referral_tables_use_fixed_mobile_tracks() -> None:
    html = read("referrals.html")
    css = read("referrals.css")
    source = read("referral.js")

    reward_columns = [
        "refs-reward-col-date",
        "refs-reward-col-type",
        "refs-reward-col-amount",
        "refs-reward-col-status",
    ]
    assert colgroup_classes(html, "refRewardsTable") == reward_columns
    assert source.count("fmtDTStack(") >= 2

    mobile = css[css.index("@media(max-width:767px)") :]
    reward_table = css_block(mobile, "#refRewardsTable")
    assert "min-width:330px;" in reward_table
    assert "table-layout:fixed;" in reward_table
    direct_type = mobile[mobile.index("#refRewardsTable th{") :]
    assert "font-size:0.65rem;" in css_block(direct_type, "#refRewardsTable th{")
    assert "font-size:0.72rem;" in css_block(direct_type, "#refRewardsTable td{")
    reward_widths = [82, 92, 70, 86]
    for name, width in zip(reward_columns, reward_widths):
        assert f"width:{width}px" in css_block(
            mobile, f"#refRewardsTable .{name}"
        )
    assert sum(reward_widths) == 330

    small = css[css.index("@media(max-width:560px)") :]
    assert "table-layout:fixed" in css_block(small, "#refTable")
    hidden_date = css_block(
        small, "#refTable th:nth-child(3),\n  #refTable td:nth-child(3)"
    )
    assert "display:none" in hidden_date
    visible_widths = {1: 20, 2: 32, 4: 20, 5: 28}
    for position, width in visible_widths.items():
        rule = css_block(
            small,
            f"#refTable th:nth-child({position}),\n  #refTable td:nth-child({position})",
        )
        assert f"width:{width}%" in rule
    assert sum(visible_widths.values()) == 100

    ref_cells = css_block(
        small, "#refTable th,\n  #refTable td"
    )
    assert "padding:0.38rem 0.22rem;" in ref_cells
    ref_type = small[small.index("#refTable th{") :]
    assert "font-size:0.65rem;" in css_block(ref_type, "#refTable th{")
    assert "font-size:0.72rem;" in css_block(ref_type, "#refTable td{")
    compact_cells = css_block(
        small, "body.compact-cards #refTable th,\n  body.compact-cards #refTable td"
    )
    assert "padding:0.38rem 0.22rem;" in compact_cells


def test_api_documentation_tables_have_one_mobile_scroll_owner() -> None:
    html = read("apikeys.html")
    css = read("apikeys.css")

    tables = {
        "tokenPricingTable": [
            "doc-col-model",
            "doc-col-provider",
            "doc-col-input",
            "doc-col-output",
        ],
        "errorCodesTable": ["doc-col-code", "doc-col-meaning"],
        "rateLimitsTable": [
            "doc-col-scope",
            "doc-col-control",
            "doc-col-behavior",
        ],
    }
    assert html.count('class="scroll-x doc-table-scroll"') == len(tables)
    for table_id, columns in tables.items():
        marker = html.index(f'id="{table_id}"')
        wrapper = html.rfind("<div", 0, marker)
        wrapper_tag = html[wrapper : html.index(">", wrapper) + 1]
        assert "doc-table-scroll" in wrapper_tag
        assert colgroup_classes(html, table_id) == columns

    mobile = css[css.index("@media (max-width: 768px)") :]
    scroll_owner = css_block(mobile, ".doc-table-scroll")
    assert "overflow-x: auto;" in scroll_owner
    assert "overflow-y: hidden;" in scroll_owner
    table_rule = css_block(mobile, ".doc-table {")
    assert "display: table;" in table_rule
    assert "table-layout: fixed;" in table_rule
    assert "overflow-x" not in table_rule
    assert "font-size: 0.65rem;" in css_block(mobile, ".doc-table th {")
    assert "font-size: 0.72rem;" in css_block(mobile, ".doc-table td {")
    assert "min-width: 400px;" in css_block(mobile, "#tokenPricingTable")
    assert "min-width: 0;" in css_block(mobile, "#errorCodesTable")
    assert "min-width: 440px;" in css_block(mobile, "#rateLimitsTable")


def test_settings_notifications_use_css_spacing_on_mobile() -> None:
    html = read("settings.html")
    css = read("settings.css")

    renderer_start = html.index("function loadNotifications()")
    renderer_end = html.index("function loadNotifSettings()", renderer_start)
    renderer = html[renderer_start:renderer_end]
    assert "notif-item dash-card settings-row" in renderer
    assert "style=\"margin-right:1rem\"" not in renderer

    mobile = css[
        css.index("@media (max-width: 768px)", css.index("Notification cards")) :
    ]
    card_rule = css_block(mobile, ".notif-item.dash-card.settings-row")
    assert "gap: 0.45rem;" in card_rule
    assert "padding: 0.5rem 0.65rem;" in card_rule
    icon_rule = css_block(mobile, ".notif-item .settings-icon")
    assert "width: 34px;" in icon_rule
    assert "height: 34px;" in icon_rule


def test_usage_chart_palette_is_visible_and_updates_with_theme() -> None:
    source = read("usage-charts.js")
    node_check = r"""
const vm = require('node:vm');
const source = process.env.USAGE_CHART_SOURCE;
const state = {theme: 'dark', accent: 'gold'};
let observerOptions = null;
let observerCallback = null;
const root = {classList: {contains: (name) => name === state.theme}};
const context = {
  console,
  document: {documentElement: root, addEventListener: () => {}},
  localStorage: {getItem: (key) => key === 'gt_accent' ? state.accent : null},
  getComputedStyle: () => ({getPropertyValue: (name) => name === '--chart-grid' ? '#grid' : '#tick'}),
  MutationObserver: function(callback) {
    observerCallback = callback;
    this.observe = (_target, options) => {observerOptions = options;};
  },
  window: {
    ACCENTS: {
      gold:{h:44,s:'96%',l:'52%'}, teal:{h:160,s:'100%',l:'42%'},
      blue:{h:217,s:'91%',l:'60%'}, purple:{h:271,s:'91%',l:'65%'},
      red:{h:0,s:'84%',l:'60%'}, pink:{h:330,s:'81%',l:'60%'},
      orange:{h:25,s:'95%',l:'53%'}, green:{h:142,s:'71%',l:'45%'},
      cyan:{h:189,s:'94%',l:'43%'}, indigo:{h:239,s:'84%',l:'67%'}
    }
  },
  cssVar: (name) => name === '--chart-grid' ? '#grid' : '#tick'
};
vm.createContext(context);
vm.runInContext(source, context);

function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2*l - 1))*s;
  const x = c*(1 - Math.abs((h/60)%2 - 1));
  const m = l - c/2;
  let rgb;
  if (h < 60) rgb=[c,x,0]; else if (h < 120) rgb=[x,c,0];
  else if (h < 180) rgb=[0,c,x]; else if (h < 240) rgb=[0,x,c];
  else if (h < 300) rgb=[x,0,c]; else rgb=[c,0,x];
  return rgb.map(v => v+m);
}
function luminance(rgb) {
  const c = rgb.map(v => v <= .04045 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4));
  return .2126*c[0] + .7152*c[1] + .0722*c[2];
}
function contrast(a, b) {
  const values=[luminance(a),luminance(b)].sort((x,y)=>y-x);
  return (values[0]+.05)/(values[1]+.05);
}
function parseHsl(value) {
  const m=value.match(/hsl\((\d+)\s+(\d+)%\s+(\d+)%\)/);
  if (!m) throw new Error('Invalid HSL '+value);
  return hslToRgb(Number(m[1]),Number(m[2]),Number(m[3]));
}

const lightCard=[1,1,1];
const darkCard=hslToRgb(222,38,8);
for (const accent of Object.keys(context.window.ACCENTS)) {
  state.accent=accent;
  state.theme='light';
  const light=context.usageChartPalette('tokens');
  if (contrast(parseHsl(light.fill),lightCard) < 3.5) throw new Error('Low light contrast for '+accent);
  state.theme='dark';
  const dark=context.usageChartPalette('tokens');
  if (contrast(parseHsl(dark.fill),darkCard) < 4.2) throw new Error('Low dark contrast for '+accent);
}

let updates=[];
const chart={
  $usageKind:'tokens', data:{datasets:[{}]},
  options:{scales:{y:{grid:{},ticks:{}},x:{ticks:{}}}},
  update:(mode)=>updates.push(mode)
};
state.theme='light'; state.accent='blue';
context.applyUsageChartTheme(chart);
if (chart.data.datasets[0].backgroundColor !== 'hsl(217 91% 30%)') throw new Error('Light palette did not apply');
if (chart.options.scales.y.grid.color !== '#grid' || chart.options.scales.x.ticks.color !== '#tick') throw new Error('Axes did not update');
if (updates.at(-1) !== 'none') throw new Error('Theme update animated unexpectedly');
if (!observerCallback || !observerOptions || !observerOptions.attributeFilter.includes('class') || !observerOptions.attributeFilter.includes('style')) throw new Error('Theme/accent observer missing');
"""
    result = subprocess.run(
        ["node", "-e", node_check],
        cwd=ROOT,
        env={**os.environ, "USAGE_CHART_SOURCE": source},
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr or result.stdout


def test_chart_axes_have_theme_specific_contrast() -> None:
    css = read("style.css")

    assert "--chart-grid: rgba(226, 232, 240, 0.12);" in css
    assert "--chart-tick: #b8c1ce;" in css
    assert "--chart-grid: rgba(15, 23, 42, 0.14);" in css
    assert "--chart-tick: #475569;" in css
