"""Regression checks for the dashboard mobile layout and chart themes."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def read(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


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


def test_request_logs_preserve_table_width_and_format_timestamps() -> None:
    html = read("logs.html")
    css = read("logs.css")

    assert 'class="scroll-x request-logs-scroll"' in html
    assert 'id="requestLogTable"' in html
    assert "fmtDTStack(time)" in html
    assert "'<td class=\"td-date\">'+escapeHtml(time)" not in html
    assert "#requestLogTable {\n  min-width: 760px;" in css
    assert "#requestLogTable th,\n#requestLogTable td {\n  white-space: nowrap;" in css
    assert "#dashRequestLogs {\n  min-width: 0;" in css


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
