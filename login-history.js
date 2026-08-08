/* ══════════════════════════════════════════
   LOGIN HISTORY
   ══════════════════════════════════════════ */

let loginHistoryOffset = 0;
const LOGIN_PAGE_SIZE = 50;

async function loadLoginHistory(offset) {
  if (!token) return;
  const off = offset !== undefined ? offset : 0;
  try {
    const d = await safeApi('GET', '/api/auth/login-history?offset=' + off + '&limit=' + LOGIN_PAGE_SIZE);
    if (!d) return;
    const body = document.getElementById('loginHistoryBody');
    if (!body) return;
    const events = d.events || d || [];
    if (!events.length && off === 0) {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2rem">No login history</td></tr>';
      return;
    }
    const rows = events.map(renderLoginRow);
    if (off === 0) {
      // Show first 3 + styled Show More dropdown (desktop shows all, mobile collapses)
      if (window.renderTableWithCollapse) {
        renderTableWithCollapse('loginHistoryBody', rows, 'loginCollapse', 'loginMoreBtn');
      } else {
        body.innerHTML = rows.join('');
      }
    } else {
      body.insertAdjacentHTML('beforeend', rows.join(''));
    }
    loginHistoryOffset = off + events.length;
    const loadMore = document.getElementById('loginLoadMore');
    if (loadMore) loadMore.style.display = 'none';
    const moreWrap = document.getElementById('loginMoreWrap');
    if (moreWrap) moreWrap.style.display = 'none';
  } catch (e) {}
}

function getFlag(location) {
  if (!location) return '🌍';
  var map = { 'US': '🇺🇸', 'UK': '🇬🇧', 'DE': '🇩🇪', 'JP': '🇯🇵', 'KR': '🇰🇷', 'CA': '🇨🇦', 'AU': '🇦🇺', 'FR': '🇫🇷', 'IN': '🇮🇳', 'SG': '🇸🇬' };
  var parts = location.split(', ');
  var code = parts[parts.length - 1];
  return map[code] || '🌍';
}

function getBrowserShort(ua) {
  if (!ua) return '—';
  var u = ua.toLowerCase();
  // iOS browsers carry AppleWebKit + Safari tokens but NOT their own engine
  // name (e.g. Firefox iOS = "FxiOS/… Safari/…") — detect them BEFORE Safari.
  if (u.indexOf('fxios/') !== -1) return 'Firefox';
  if (u.indexOf('crios/') !== -1) return 'Chrome';
  if (u.indexOf('edgios/') !== -1) return 'Edge';
  if (u.indexOf('opios/') !== -1) return 'Opera';
  if (u.indexOf('samsungbrowser') !== -1) return 'Samsung';
  if (u.indexOf('ucbrowser') !== -1) return 'UC';
  if (u.indexOf('edg/') !== -1 || u.indexOf('edge/') !== -1) return 'Edge';
  if (u.indexOf('opr/') !== -1 || u.indexOf('opera') !== -1) return 'Opera';
  if (u.indexOf('chrome/') !== -1 && u.indexOf('chromium') === -1) return 'Chrome';
  if (u.indexOf('firefox/') !== -1) return 'Firefox';
  if (u.indexOf('safari/') !== -1) return 'Safari';
  if (u.indexOf('msie') !== -1 || u.indexOf('trident') !== -1) return 'IE';
  if (u.indexOf('wget') !== -1) return 'Wget';
  if (u.indexOf('curl') !== -1) return 'cURL';
  if (u.indexOf('python') !== -1) return 'Python';
  if (u.indexOf('postman') !== -1) return 'Postman';
  return '—';
}

function renderLoginRow(event) {
  const deviceIcon = event.device_type === 'mobile' ? '📱' : event.device_type === 'tablet' ? '📲' : '💻';
  const statusBadge = event.success ? '<span class="badge-success">Success</span>' : '<span class="badge-failed">Failed</span>';
  const ip = escapeHtml(event.ip_address || '—');
  const rawLoc = event.location || '';
  let locHtml;
  if (rawLoc) {
    const parts = rawLoc.split(', ');
    const city = parts[0] || rawLoc;
    const country = parts[1] || '';
    locHtml = getFlag(rawLoc) + ' <span class="loc-city">' + escapeHtml(city) + '</span>' + (country ? '<span class="loc-country">, ' + escapeHtml(country) + '</span>' : '');
  } else {
    locHtml = '🌍 <span class="loc-city">Unknown</span>';
  }
  const device = escapeHtml(event.device_name || event.device_type || '—');
  const browser = '<span class="td-browser">' + escapeHtml(getBrowserShort(event.user_agent)) + '</span>';
  const ts = window.fmtDTStack ? fmtDTStack(event.created_at) : '<div class="td-date-strong">—</div>';
  return '<tr class="history-row">'
    + '<td><span class="device-icon">' + deviceIcon + '</span><span>' + device + '</span></td>'
    + '<td class="td-browser-cell">' + browser + '</td>'
    + '<td class="td-location">' + locHtml + '</td>'
    + '<td class="td-ip">' + ip + '</td>'
    + '<td class="tx-td-center">' + statusBadge + '</td>'
    + '<td class="td-date">' + ts + '</td>'
    + '</tr>';
}

function filterLoginHistory() {
  const dateFilter = document.getElementById('loginDateFilter');
  const deviceFilter = document.getElementById('loginDeviceFilter');
  const statusFilter = document.getElementById('loginStatusFilter');
  const rows = document.querySelectorAll('#loginHistoryBody .history-row, #loginCollapse .history-row');
  rows.forEach(function (row) {
    let show = true;
    if (dateFilter && dateFilter.value) {
      if (!row.textContent.toLowerCase().includes(dateFilter.value.toLowerCase())) show = false;
    }
    if (deviceFilter && deviceFilter.value && deviceFilter.value !== 'all') {
      const deviceIcon = row.querySelector('.device-icon');
      if (deviceIcon) {
        const iconText = deviceIcon.textContent;
        if (deviceFilter.value === 'mobile' && iconText !== '📱' && iconText !== '📲') show = false;
        if (deviceFilter.value === 'desktop' && iconText !== '💻') show = false;
      }
    }
    if (statusFilter && statusFilter.value && statusFilter.value !== 'all') {
      const hasSuccess = row.querySelector('.badge-success');
      const hasFailed = row.querySelector('.badge-failed');
      if (statusFilter.value === 'success' && !hasSuccess) show = false;
      if (statusFilter.value === 'failed' && !hasFailed) show = false;
    }
    row.style.display = show ? '' : 'none';
  });
}
