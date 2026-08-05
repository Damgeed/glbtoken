/* ══════════════════════════════════════════
   MODELS — Models grid page (models.html)
   Extracted from filters.js — shared globals
   (models, sortDir, escapeHtml, safeApi) come from shared.js
   ══════════════════════════════════════════ */
    // ── Models Grid ──
    let activeCategory = '';

    async function loadModels(){
      const grid=document.getElementById('modelGrid');
      const filter=document.getElementById('providerFilter');
      if(!grid)return;
      const [m, provStats]=await Promise.all([
        safeApi('GET','/api/models',null,null,true),
        safeApi('GET','/api/models/providers',null,null,true).catch(function(){return null;})
      ]);
      if(!m){grid.innerHTML='<p style="color:var(--text-muted);text-align:center;padding:2rem">Backend not connected. Start the API server.</p>';return}
      models=m;
        document.getElementById('modelCount').textContent=`${m.length} models loaded`;
        // Populate provider filter — show model count per provider from /api/models/providers
        var provCounts={};
        if(Array.isArray(provStats)) provStats.forEach(function(p){ if(p&&p.name) provCounts[p.name]=p.count||0; });
        const provs=[...new Set(m.map(x=>x.provider))].sort();
        filter.innerHTML='<option value="">All Providers</option>'+provs.map(p=>{
          var cnt=provCounts[p]||0;
          return `<option value="${escapeHtml(p)}">${escapeHtml(p)}${cnt?' ('+cnt+')':''}</option>`;
        }).join('');
        // Populate category pills
        const cats = [...new Set(m.map(x => x.category).filter(Boolean))];
        const cpills = document.getElementById('catPills');
        if(cpills){
          let pillsHtml = '<span class="cat-pill active" data-cat="" onclick="filterByCategory(this)">All</span>';
          CATEGORY_ORDER.forEach(cl => {
            let key = null;
            for (const [k,v] of Object.entries(CATEGORY_META)) {
              if (v.label === cl) { key = k; break; }
            }
            if (key && cats.includes(key)) {
              const meta = getCatMeta(key);
              pillsHtml += `<span class="cat-pill" data-cat="${key}" onclick="filterByCategory(this)" style="--pill-color:${meta.color}">${meta.icon} ${meta.label}</span>`;
            }
          });
          cpills.innerHTML = pillsHtml;
        }
        renderModelCards(m);
    }
    const CATEGORY_META = {
      'Flagship':   { icon: '🚀', label: 'Flagship',   color: '#F4B400', bg: 'rgba(244,180,0,0.10)', border: 'rgba(244,180,0,0.25)', desc: 'Best all-around flagship models' },
      'Vision':     { icon: '👁️', label: 'Vision',     color: '#3B82F6', bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.25)', desc: 'Multimodal & image understanding' },
      'Small':      { icon: '⚡', label: 'Fast & Cheap', color: '#22C55E', bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.25)', desc: 'Budget-friendly workhorses' },
      'Reasoning':  { icon: '🧠', label: 'Reasoning',   color: '#A855F7', bg: 'rgba(168,85,247,0.10)', border: 'rgba(168,85,247,0.25)', desc: 'Deep thinking & logical reasoning' },
      'Flash':      { icon: '⚡', label: 'Flash',       color: '#06B6D4', bg: 'rgba(6,182,212,0.10)', border: 'rgba(6,182,212,0.25)', desc: 'Ultra-fast response models' },
      'Large':      { icon: '🏗️', label: 'Large Models', color: '#F97316', bg: 'rgba(249,115,22,0.10)', border: 'rgba(249,115,22,0.25)', desc: 'Large-scale open models' },
      'Search':     { icon: '🔍', label: 'Search',      color: '#6366F1', bg: 'rgba(99,102,241,0.10)', border: 'rgba(99,102,241,0.25)', desc: 'Web-connected search models' },
    };
    const CATEGORY_ORDER = ['Flagship','Fast & Cheap','Reasoning','Vision','Flash','Large Models','Search'];

    function getCatMeta(cat) {
      // Map display labels back to internal keys
      for (const [k, v] of Object.entries(CATEGORY_META)) {
        if (v.label === cat || k === cat) return v;
      }
      return { icon: '📦', label: cat || 'Other', color: 'var(--text-muted)', bg: 'var(--card)', border: 'var(--border)', desc: '' };
    }

    function renderModelCards(models){
      const grid=document.getElementById('modelGrid');
      if(!grid)return;
      const isMobile = window.innerWidth < 768;
      const showCount = isMobile ? 6 : 15; // 3 rows × cols
      // Group by category
      const groups = {};
      models.forEach(m => {
        const c = m.category || 'Other';
        if (!groups[c]) groups[c] = [];
        groups[c].push(m);
      });
      function buildCard(m, pmeta){
        const priceIn = (m.prompt_price * 1000).toFixed(4);
        const priceOut = (m.completion_price * 1000).toFixed(4);
        const name = escapeHtml(m.name || String(m.model_id||m.name||'Unknown').split('/').pop());
        const id = escapeHtml(m.model_id);
        const prov = escapeHtml(m.provider);
        const desc = m.description ? escapeHtml(m.description) : '';
        const ver = m.version ? `<span class="mc-version">v${escapeHtml(m.version)}</span>` : '';
        const bg = pmeta ? pmeta.bg : 'var(--primary-subtle)';
        const clr = pmeta ? pmeta.color : 'var(--primary)';
        const brd = pmeta ? pmeta.border : 'hsla(44,96%,52%,0.2)';
        const clrIcon = pmeta ? pmeta.color : 'var(--primary)';
        const catTag = pmeta ? `<span class="mc-cat-tag" style="background:${bg};color:${clr}">${pmeta.icon} ${escapeHtml(pmeta.label)}</span>` : '';
        return `<div class="model-card">
          <div class="mc-top">
            <span class="mc-badge" style="background:${bg};color:${clr};border-color:${brd}">${prov}</span>
            ${catTag}
          </div>
          <h4 class="mc-name">${name}</h4>
          <div class="mc-id">${id}</div>
          ${ver}
          ${desc ? `<div class="mc-desc">${desc}</div>` : ''}
          <div class="mc-meta">
            <span title="Context window">📐 ${(m.context_length/1000).toFixed(0)}K</span>
            <span title="Input price">⬇️ $${priceIn}/1K</span>
            <span title="Output price">⬆️ $${priceOut}/1K</span>
          </div>
        </div>`;
      }
      let html = '';
      // Render in predefined order
      CATEGORY_ORDER.forEach(clabel => {
        let key = null;
        for (const [k, v] of Object.entries(CATEGORY_META)) {
          if (v.label === clabel) { key = k; break; }
        }
        if (!key) key = clabel;
        const items = groups[key];
        if (!items) return;
        const meta = getCatMeta(key);
        html += `<div class="cat-header" style="--cat-color:${meta.color};--cat-bg:${meta.bg};--cat-border:${meta.border}">
          <span class="cat-icon">${meta.icon}</span>
          <span class="cat-name">${escapeHtml(meta.label)}</span>
          <span class="cat-count">${items.length}</span>
          ${meta.desc ? `<span class="cat-desc">${escapeHtml(meta.desc)}</span>` : ''}
        </div>`;
        html += '<div class="cat-body">';
        if (items.length > showCount) {
          html += items.slice(0, showCount).map(m => buildCard(m, getCatMeta(m.category))).join('');
          html += `<div class="cat-more-wrap" style="display:none">${items.slice(showCount).map(m => buildCard(m, getCatMeta(m.category))).join('')}</div>`;
          html += `<button class="cat-more-btn" onclick="toggleCatMore(this)" data-expanded="false">Show ${items.length - showCount} more ▾</button>`;
        } else {
          html += items.map(m => buildCard(m, getCatMeta(m.category))).join('');
        }
        html += '</div>';
        delete groups[key];
      });
      // Remaining uncategorized
      Object.keys(groups).forEach(c => {
        const meta = getCatMeta(c);
        html += `<div class="cat-header" style="--cat-color:${meta.color};--cat-bg:${meta.bg};--cat-border:${meta.border}">
          <span class="cat-icon">${meta.icon}</span>
          <span class="cat-name">${escapeHtml(meta.label)}</span>
          <span class="cat-count">${groups[c].length}</span>
        </div>`;
        html += '<div class="cat-body">';
        const items = groups[c];
        if (items.length > showCount) {
          html += items.slice(0, showCount).map(m => buildCard(m, null)).join('');
          html += `<div class="cat-more-wrap" style="display:none">${items.slice(showCount).map(m => buildCard(m, null)).join('')}</div>`;
          html += `<button class="cat-more-btn" onclick="toggleCatMore(this)" data-expanded="false">Show ${items.length - showCount} more ▾</button>`;
        } else {
          html += items.map(m => buildCard(m, null)).join('');
        }
        html += '</div>';
      });
      grid.innerHTML = html;
    }
    function toggleCatMore(btn){
      const wrap = btn.previousElementSibling;
      const exp = btn.getAttribute('data-expanded') === 'true';
      if (exp) {
        wrap.style.display = 'none';
        btn.textContent = btn.textContent.replace(/^Show less/, 'Show ' + (wrap.children.length) + ' more') + ' ▾';
        btn.setAttribute('data-expanded', 'false');
      } else {
        wrap.style.display = '';
        btn.textContent = 'Show less ▴';
        btn.setAttribute('data-expanded', 'true');
      }
    }
    function filterByCategory(el) {
      activeCategory = el.getAttribute('data-cat') || '';
      document.querySelectorAll('.cat-pill').forEach(p => p.classList.toggle('active', p === el));
      filterModelCards();
    }
    function filterModelCards(){
      const q=document.getElementById('modelSearch').value.toLowerCase();
      const p=document.getElementById('providerFilter').value;
      const filtered=models.filter(m=>{
        const matchName=m.model_id.toLowerCase().includes(q)||m.name.toLowerCase().includes(q)||m.provider.toLowerCase().includes(q);
        const matchCat=!activeCategory||(m.category===activeCategory);
        return matchName&&matchCat&&(!p||m.provider===p);
      });
      renderModelCards(filtered);
      document.getElementById('modelCount').textContent=`${filtered.length} of ${models.length} models`;
    }
    function toggleModelSort(){
      sortDir=sortDir==='price_asc'?'price_desc':'price_asc';
      document.getElementById('sortBtn').textContent=sortDir==='price_asc'?'↑ Price':'↓ Price';
      models.sort((a,b)=>sortDir==='price_asc'?a.prompt_price-b.prompt_price:b.prompt_price-a.prompt_price);
      filterModelCards();
    }

    // Auto-init on models.html
    document.addEventListener('DOMContentLoaded', function(){
      if(typeof loadModels==='function')loadModels();
    });
