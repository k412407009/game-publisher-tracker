(() => {
  const data = window.GAME_WATCHLIST;
  const tdData = window.TD_WATCHLIST;
  if (!data) {
    document.body.innerHTML = '<main style="padding:40px;font-family:sans-serif">数据文件未加载，请确认 data/google-play-watchlist.js 存在。</main>';
    return;
  }

  const state = {
    view: 'products',
    cohort: '',
    query: '',
    company: '',
    account: '',
    tag: '',
    // 产品库默认展示全量；否则 Google Play 未回传首次上线日期的已发现产品会被
    // “最近一年”这一隐形默认条件过滤，搜索时看似不存在。
    release: 'all',
    sort: 'firstPublicTs',
    direction: 'desc',
    page: 1,
    pageSize: 50
  };
  const now = Date.parse(data.meta.generatedAt);
  const juneRankingCompanies = new Set(['VOODOO','OAKEVER','SAYGAMES','SUPERCENT','SUPERSONIC','BRAVESTARS','FALCON','WEDOBEST','HOMA','IKAME','GRAND','LOOM','ROLLIC','HABBY','LION_STUDIOS','TREEPLLA']);
  const day = 86400000;
  const number = new Intl.NumberFormat('zh-CN');
  const compact = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 });
  const dateFmt = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const marketNames = {
    us:'United States', ca:'Canada', mx:'Mexico', br:'Brazil', gb:'United Kingdom',
    de:'Germany', fr:'France', tr:'Türkiye', sa:'Saudi Arabia', ae:'UAE', in:'India',
    id:'Indonesia', jp:'Japan', kr:'Korea', au:'Australia', ph:'Philippines',
    th:'Thailand', vn:'Vietnam', tw:'Taiwan', sg:'Singapore', my:'Malaysia'
  };
  const els = Object.fromEntries([
    'freshnessText','kpiStrip','signalSummary','signalList','resultCount','searchInput','companyFilter','cohortFilter',
    'accountFilter','tagFilter','releaseFilter','resetFilters','productRows','pagination','exportCsv',
    'accountSummary','companyGroups','unresolvedSection','methodCaveat','footerStamp',
    'tdKpis','tdTopRows','tdResultCount','tdSearch','tdPlatform','tdStatus','tdSort','tdCards'
  ].map(id => [id, document.getElementById(id)]));

  function withinDays(ts, days) { return Boolean(ts) && now - ts <= days * day; }
  function fmtDate(ts) { return ts ? dateFmt.format(new Date(ts)) : '待补'; }
  function fmtReleaseDate(app) {
    if (app.releaseDateStatus === 'observed') return fmtDate(app.releasedTs);
    if (app.releaseDateStatus === 'unavailable') return '待补';
    // 多市场复核前，releasedTs 仍是 Google Play 详情返回的上架日期基线；
    // 可以展示，但不能把 updatedTs（版本更新时间）混进这一列。
    return app.releasedTs ? fmtDate(app.releasedTs) : '待补';
  }
  function fmtReleaseMarkets(app) {
    const observed = (app.releaseMarkets?.length ? app.releaseMarkets : [app.releaseMarket]).filter(Boolean);
    if (observed.length) return `上架 ${observed.map(value => `${marketNames[value] || String(value).toUpperCase()}（${String(value).toUpperCase()}）`).join(' / ')}`;
    if (app.releasedTs) {
      const market = String(data.meta.country || 'us').toLowerCase();
      return `上架 ${marketNames[market] || market.toUpperCase()}（${market.toUpperCase()}）`;
    }
    return '上架日期待补';
  }
  function publicTs(app) { return app.firstPublicTs || app.releasedTs || 0; }
  function fmtFirstPublicDate(app) {
    if (app.firstPublicKind === 'exposure' && app.earliestExposure) {
      const date = new Date(app.earliestExposure.ts);
      if (app.earliestExposure.datePrecision === 'year') return String(date.getUTCFullYear());
      if (app.earliestExposure.datePrecision === 'month') return `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    }
    return publicTs(app) ? fmtDate(publicTs(app)) : '待补';
  }
  function fmtFirstPublicDetail(app) {
    if (app.firstPublicKind === 'exposure' && app.earliestExposure) {
      const precisionLabels = { week: '（周期间起点）', month: '（月份精度）', year: '（年份精度）' };
      const precision = precisionLabels[app.earliestExposure.datePrecision] || '';
      return `曝光 ${app.earliestExposure.typeLabel}${precision}`;
    }
    return fmtReleaseMarkets(app);
  }
  function fmtExposureRange(event) {
    if (!event?.ts) return '';
    const date = new Date(event.ts);
    if (event.datePrecision === 'year') return String(date.getUTCFullYear());
    if (event.datePrecision === 'month') return `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    if (!event.endTs) return fmtDate(event.ts);
    return `${fmtDate(event.ts)}～${fmtDate(event.endTs)}`;
  }
  function renderExposure(app) {
    const event = app.earliestExposure;
    if (!event) return '<span class="exposure-empty">—</span>';
    const channel = event.retrievalChannel ? ' · DeepSeek复核' : '';
    return `<a class="exposure-link" href="${escape(event.sourceUrl)}" target="_blank" rel="noreferrer" title="${escape(event.title)}">${escape(event.typeLabel)}</a><span class="exposure-meta">${escape(fmtExposureRange(event))} · ${escape(event.sourceLabel)}${escape(channel)}</span>`;
  }
  function fmtNumber(value) { return value ? number.format(value) : '—'; }
  function fmtCompact(value) { return value ? compact.format(value) : '—'; }
  function fmtCurrency(value) {
    return Number.isFinite(value) ? `$${number.format(Math.round(value))}` : '—';
  }
  function fmtTdMetric(value, currency = false) {
    if (!Number.isFinite(value)) return '—';
    return `${currency ? '$' : ''}${compact.format(value)}`;
  }
  function escape(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  }
  function iconFallback(event) {
    const image = event.currentTarget;
    const fallbackSrc = image.dataset.fallbackSrc;
    if (fallbackSrc) {
      delete image.dataset.fallbackSrc;
      image.src = fallbackSrc;
      return;
    }
    image.style.visibility = 'hidden';
  }
  window.__watchlistIconFallback = iconFallback;

  function populateSelect(select, values) {
    const first = select.options[0];
    select.innerHTML = '';
    select.append(first);
    [...new Set(values.filter(Boolean))].sort((a,b) => a.localeCompare(b, 'zh-CN')).forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.append(option);
    });
  }

  function renderKpis() {
    const recent6 = data.apps.filter(app => withinDays(publicTs(app), 183)).length;
    const recent12 = data.apps.filter(app => withinDays(publicTs(app), 365)).length;
    const relatedCompanies = new Set(data.accounts.map(item => item.company)).size;
    const top = [...data.apps].sort((a,b) => b.ratings - a.ratings)[0];
    const kpis = [
      ['厂商主体', relatedCompanies, '含补充基准公司'],
      ['开发者账号', data.accounts.length, `${data.accounts.filter(a => a.crawlStatus === 'ok').length} 个抓取成功`],
      ['跟踪产品', data.apps.length, `${data.meta.verifiedCount ?? data.apps.length} 款本轮已复核 · ${data.meta.staleCount || 0} 款待复核`],
      ['近半年上新', recent6, `近一年 ${recent12} 款`],
      ['最高评分热度', fmtCompact(top?.ratings), top ? top.title : '—']
    ];
    els.kpiStrip.innerHTML = kpis.map(([label,value,detail]) => `
      <article class="kpi"><span class="kpi-label">${escape(label)}</span><b class="kpi-value">${escape(value)}</b><span class="kpi-detail">${escape(detail)}</span></article>
    `).join('');
  }

  function renderSignals() {
    const recent = data.apps.filter(app => withinDays(publicTs(app), 183))
      .sort((a,b) => publicTs(b) - publicTs(a) || b.ratings - a.ratings);
    els.signalSummary.textContent = `共 ${recent.length} 款。卡片按最早公开时间倒序（商店上架或可核验曝光取早者）。`;
    els.signalList.innerHTML = recent.slice(0, 8).map(app => `
      <article class="signal-card">
        <div class="signal-top">
          <span class="signal-date">${fmtFirstPublicDate(app)}</span>
          <img src="${escape(app.icon)}" alt="${escape(app.title)} 图标" referrerpolicy="no-referrer" onerror="__watchlistIconFallback(event)">
        </div>
        <h3><a href="${escape(app.url)}" target="_blank" rel="noreferrer">${escape(app.title)}</a></h3>
        <p class="signal-company">${escape(app.companyZh)} · ${escape(app.account)}</p>
        <div class="signal-metrics">
          <span><small>下载量下限</small>${escape(app.installs || '—')}</span>
          <span><small>评分数</small>${fmtCompact(app.ratings)}</span>
        </div>
      </article>
    `).join('') || '<p>最近半年没有可见新上架产品。</p>';
  }

  function filteredApps() {
    const q = state.query.trim().toLowerCase();
    return data.apps.filter(app => {
      const exposureText = (app.exposureEvents || []).map(event => `${event.typeLabel} ${event.title} ${event.summary} ${event.sourceLabel}`).join(' ');
      const haystack = `${app.title} ${app.appId} ${app.companyZh} ${app.account} ${app.genre} ${app.tags.join(' ')} ${exposureText}`.toLowerCase();
      if (q && !haystack.includes(q)) return false;
      if (state.cohort === 'june-2026' && !juneRankingCompanies.has(app.company)) return false;
      if (state.company && app.companyZh !== state.company) return false;
      if (state.account && app.account !== state.account) return false;
      if (state.tag && !app.tags.includes(state.tag)) return false;
      if (state.release === 'unknown' && publicTs(app)) return false;
      if (/^\d+$/.test(state.release) && !withinDays(publicTs(app), Number(state.release))) return false;
      return true;
    }).sort((a,b) => {
      const left = a[state.sort] ?? '';
      const right = b[state.sort] ?? '';
      const base = typeof left === 'string' ? left.localeCompare(right, 'zh-CN') : left - right;
      return state.direction === 'asc' ? base : -base;
    });
  }

  function renderTable() {
    const apps = filteredApps();
    const pages = Math.max(1, Math.ceil(apps.length / state.pageSize));
    state.page = Math.min(state.page, pages);
    const start = (state.page - 1) * state.pageSize;
    const visible = apps.slice(start, start + state.pageSize);
    const maxRatings = Math.max(...apps.map(app => app.ratings), 1);
    els.resultCount.textContent = `${number.format(apps.length)} 款结果`;
    document.querySelectorAll('th').forEach(th => th.classList.toggle('is-sorted', th.querySelector(`[data-sort="${state.sort}"]`)));
    els.productRows.innerHTML = visible.map(app => {
      const heat = app.ratings ? Math.max(3, Math.round(Math.log10(app.ratings + 1) / Math.log10(maxRatings + 1) * 100)) : 0;
      return `
        <tr>
          <td><div class="app-cell">
            <img class="app-icon" src="${escape(app.icon)}" alt="" referrerpolicy="no-referrer" onerror="__watchlistIconFallback(event)">
            <div><a class="app-title" href="${escape(app.url)}" target="_blank" rel="noreferrer" title="${escape(app.title)}">${escape(app.title)}</a><span class="app-id">${escape(app.appId)}</span>${app.status !== 'ok' ? '<span class="tag" title="本轮商店详情未能确认，保留上次数据">商店待复核 · 旧数据</span>' : ''}</div>
          </div></td>
          <td><span class="company-name">${escape(app.companyZh)}</span><span class="account-name">${escape(app.account)}</span></td>
          <td><span class="date-primary">${fmtFirstPublicDate(app)}</span><span class="date-secondary">${escape(fmtFirstPublicDetail(app))}</span></td>
          <td class="exposure-cell">${renderExposure(app)}</td>
          <td class="numeric"><span class="number-main">${escape(app.installs || '—')}</span></td>
          <td class="numeric"><span class="number-main">${fmtCurrency(app.revenueCumulativeWorldwideUsd)}</span><span class="date-secondary">Sensor Tower 估算</span></td>
          <td class="numeric"><span class="number-main">${fmtNumber(app.ratings)}</span><span class="heat-track"><i style="width:${heat}%"></i></span></td>
          <td class="numeric"><span class="number-main">${fmtNumber(app.reviews)}</span></td>
          <td class="numeric"><span class="score">${app.score ? app.score.toFixed(1) : '—'}</span></td>
          <td>${app.tags.map(tag => `<span class="tag">${escape(tag)}</span>`).join('')}</td>
        </tr>`;
    }).join('') || '<tr class="empty-row"><td colspan="10">没有符合当前条件的产品</td></tr>';
    renderPagination(pages, apps.length, start, visible.length);
  }

  function renderPagination(pages, total, start, shown) {
    const candidates = [...new Set([1, state.page - 1, state.page, state.page + 1, pages].filter(x => x >= 1 && x <= pages))];
    els.pagination.innerHTML = `
      <span class="page-status">显示 ${total ? start + 1 : 0}–${start + shown} / ${total}</span>
      <div class="page-buttons">
        <button data-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''}>←</button>
        ${candidates.map((page,index) => `${index && page - candidates[index-1] > 1 ? '<span>…</span>' : ''}<button class="${page === state.page ? 'is-current' : ''}" data-page="${page}">${page}</button>`).join('')}
        <button data-page="${state.page + 1}" ${state.page === pages ? 'disabled' : ''}>→</button>
      </div>`;
    els.pagination.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => {
      state.page = Number(button.dataset.page);
      renderTable();
      const databaseTop = document.querySelector('.database').getBoundingClientRect().top + window.scrollY - 84;
      window.scrollTo({ top: databaseTop, behavior: 'smooth' });
    }));
  }

  function renderAccounts() {
    const groups = new Map();
    data.accounts.forEach(account => {
      if (!groups.has(account.company)) groups.set(account.company, { name: account.companyZh, country: account.country, accounts: [] });
      groups.get(account.company).accounts.push(account);
    });
    const linked = data.accounts.filter(a => ['confirmed','high','probable'].includes(a.relationship)).length;
    const failed = data.accounts.filter(a => a.crawlStatus !== 'ok').length;
    els.accountSummary.innerHTML = [
      ['公司主体', groups.size], ['开发者账号', data.accounts.length], ['有关系证据', linked], ['抓取待复核', failed]
    ].map(([label,value]) => `<div class="account-stat"><b>${value}</b><span>${label}</span></div>`).join('');

    const sortedGroups = [...groups.entries()].sort((a,b) => Number(juneRankingCompanies.has(b[0])) - Number(juneRankingCompanies.has(a[0])) || b[1].accounts.length - a[1].accounts.length || a[1].name.localeCompare(b[1].name, 'zh-CN')).map(([,group]) => group);
    els.companyGroups.innerHTML = sortedGroups.map(group => {
      const companyApps = data.apps.filter(app => app.companyZh === group.name);
      const recent = companyApps.filter(app => withinDays(publicTs(app), 365)).length;
      return `<section class="company-group">
        <div class="company-identity"><h3>${escape(group.name)}</h3><p>${escape(group.country)}</p><div class="company-metrics">${group.accounts.length} 个账号 · ${companyApps.length} 款跟踪 · 近一年 ${recent} 款</div></div>
        <div class="account-cards">${group.accounts.map(account => `
          <article class="account-card">
            <div class="account-card-top"><h4><a href="${escape(account.developerUrl)}" target="_blank" rel="noreferrer">${escape(account.account)}</a></h4><span class="confidence ${escape(account.relationship)}">${escape(account.relationshipLabel)}</span></div>
            <p class="account-note">${escape(account.note)}</p>
            <div class="account-card-footer"><span class="account-count">${account.appCount} 款 · ${account.crawlStatus === 'ok' ? '已抓取' : '待复核'}</span><span class="source-links">${account.sources.map(source => `<a href="${escape(source.url)}" target="_blank" rel="noreferrer">${escape(source.label)}</a>`).join('')}</span></div>
          </article>`).join('')}</div>
      </section>`;
    }).join('');

    els.unresolvedSection.innerHTML = `<h3>待补账号池</h3>${data.unresolved.map(item => `
      <div class="unresolved-item"><b>${escape(item.company)}</b><p>${escape(item.reason)}</p><a href="${escape(item.source)}" target="_blank" rel="noreferrer">现有线索</a></div>
    `).join('')}`;
  }

  function renderTd() {
    if (!tdData || !els.tdCards) return;
    const mainById = new Map(data.apps.map(app => [app.appId, app]));
    const joined = tdData.items.map(item => ({ ...item, main: item.googlePlayId ? mainById.get(item.googlePlayId) : null }));
    const sensorItems = joined.filter(item => item.sensorTower);
    const visible = joined.filter(item => item.store?.status === 'visible-us').length;
    const publishers = new Set(joined.map(item => item.store?.developer).filter(Boolean)).size;
    const totalRevenue = sensorItems.reduce((sum, item) => sum + item.sensorTower.revenueWorldwideUsd, 0);
    els.tdKpis.innerHTML = [
      ['半年视频', joined.length, `${tdData.meta.cutoff} 起`],
      ['美国区可见', visible, `${tdData.meta.googlePlayExact + tdData.meta.appStoreExact} 款精确 ID · ${tdData.meta.storePending} 款待补`],
      ['反查发行方', publishers, '同厂产品已并入主库'],
      ['Sensor Tower', sensorItems.length, 'Android 包名精确匹配'],
      ['样本净收入', fmtTdMetric(totalRevenue, true), '2026-02 至 08-22']
    ].map(([label,value,detail]) => `<article><span>${escape(label)}</span><b>${escape(value)}</b><small>${escape(detail)}</small></article>`).join('');

    const tdRankingState = { key: 'revenue', direction: 'desc' };
    function renderTdRanking() {
      const top = [...sensorItems].sort((a,b) => {
        let comparison = 0;
        if (tdRankingState.key === 'name') comparison = (a.store?.title || a.game).localeCompare(b.store?.title || b.game, 'en');
        if (tdRankingState.key === 'downloads') comparison = a.sensorTower.downloadsWorldwide - b.sensorTower.downloadsWorldwide;
        if (tdRankingState.key === 'revenue') comparison = a.sensorTower.revenueWorldwideUsd - b.sensorTower.revenueWorldwideUsd;
        if (tdRankingState.key === 'date') comparison = a.videoDate.localeCompare(b.videoDate);
        if (!comparison) comparison = a.game.localeCompare(b.game, 'en');
        return tdRankingState.direction === 'asc' ? comparison : -comparison;
      });
      document.querySelectorAll('.td-performance-table th').forEach(th => {
        const button = th.querySelector('[data-td-sort]');
        const active = button?.dataset.tdSort === tdRankingState.key;
        th.classList.toggle('is-sorted', Boolean(active));
        if (active) th.setAttribute('aria-sort', tdRankingState.direction === 'asc' ? 'ascending' : 'descending');
        else th.removeAttribute('aria-sort');
        const arrow = button?.querySelector('span');
        if (arrow) arrow.textContent = active ? (tdRankingState.direction === 'asc' ? '↑' : '↓') : '↕';
      });
      els.tdTopRows.innerHTML = top.map((item,index) => {
        const store = item.store || {};
        const title = store.title || item.game;
        const productUrl = store.url || item.describedUrl || item.videoUrl;
        const remoteIcon = store.icon || item.main?.icon;
        const icon = item.googlePlayId && remoteIcon
          ? `assets/icons/td/${encodeURIComponent(item.googlePlayId)}.png`
          : remoteIcon;
        const iconFallbackAttr = icon !== remoteIcon && remoteIcon
          ? ` data-fallback-src="${escape(remoteIcon)}"`
          : '';
        return `<tr>
          <td class="td-rank">${index + 1}</td>
          <td><div class="td-product-cell">
            ${icon ? `<img class="td-ranking-icon" src="${escape(icon)}"${iconFallbackAttr} alt="${escape(title)} Icon" referrerpolicy="no-referrer" onerror="__watchlistIconFallback(event)">` : '<span class="td-ranking-icon td-icon-placeholder">TD</span>'}
            <div><a class="td-product-link" href="${escape(productUrl)}" target="_blank" rel="noreferrer" title="打开产品商店">${escape(title)}</a><span class="date-secondary">${escape(store.developer || '发行方待补')}</span></div>
          </div></td>
          <td class="numeric"><span class="number-main">${fmtTdMetric(item.sensorTower.downloadsWorldwide)}</span></td>
          <td class="numeric"><span class="number-main">${fmtTdMetric(item.sensorTower.revenueWorldwideUsd, true)}</span></td>
          <td>${escape(item.videoDate)}</td>
          <td><a href="${escape(item.videoUrl)}" target="_blank" rel="noreferrer">B站 ${escape(item.issue)} 期</a>${store.url ? ` · <a href="${escape(store.url)}" target="_blank" rel="noreferrer">商店</a>` : ''}</td>
        </tr>`;
      }).join('');
    }
    document.querySelectorAll('[data-td-sort]').forEach(button => button.addEventListener('click', () => {
      const key = button.dataset.tdSort;
      if (tdRankingState.key === key) tdRankingState.direction = tdRankingState.direction === 'desc' ? 'asc' : 'desc';
      else {
        tdRankingState.key = key;
        tdRankingState.direction = key === 'name' ? 'asc' : 'desc';
      }
      renderTdRanking();
    }));
    renderTdRanking();

    function filterAndRender() {
      const q = els.tdSearch.value.trim().toLowerCase();
      const platform = els.tdPlatform.value;
      const status = els.tdStatus.value;
      const rows = joined.filter(item => {
        const text = `${item.game} ${item.store?.title || ''} ${item.store?.developer || ''} ${item.googlePlayId || ''} ${item.store?.bundleId || ''}`.toLowerCase();
        if (q && !text.includes(q)) return false;
        if (platform && item.platform !== platform) return false;
        if (status === 'sensor' && !item.sensorTower) return false;
        if (status === 'visible' && item.store?.status !== 'visible-us') return false;
        if (status === 'pending' && item.store?.status === 'visible-us') return false;
        return true;
      }).sort((a,b) => {
        if (els.tdSort.value === 'downloads') return (b.sensorTower?.downloadsWorldwide ?? -1) - (a.sensorTower?.downloadsWorldwide ?? -1);
        if (els.tdSort.value === 'newest') return b.videoDate.localeCompare(a.videoDate);
        if (els.tdSort.value === 'installs') return (b.store?.minInstalls ?? -1) - (a.store?.minInstalls ?? -1);
        if (els.tdSort.value === 'name') return (a.store?.title || a.game).localeCompare(b.store?.title || b.game, 'en');
        return (b.sensorTower?.revenueWorldwideUsd ?? -1) - (a.sensorTower?.revenueWorldwideUsd ?? -1);
      });
      els.tdResultCount.textContent = `${rows.length} / ${joined.length} 款`;
      els.tdCards.innerHTML = rows.map(item => {
        const store = item.store || {};
        const title = store.title || item.game;
        const storeState = store.status === 'visible-us' ? '商店可见' : (item.googlePlayId || item.appStoreId ? '美国区不可见' : '商店待补');
        const remoteIcon = store.icon;
        const icon = item.googlePlayId && remoteIcon
          ? `assets/icons/td/${encodeURIComponent(item.googlePlayId)}.png`
          : remoteIcon;
        const iconFallbackAttr = icon !== remoteIcon && remoteIcon
          ? ` data-fallback-src="${escape(remoteIcon)}"`
          : '';
        return `<article class="td-card">
          <div class="td-card-top">${icon ? `<img src="${escape(icon)}"${iconFallbackAttr} alt="" referrerpolicy="no-referrer" onerror="__watchlistIconFallback(event)">` : '<span class="td-icon-placeholder">TD</span>'}<span class="td-platform">${escape(item.platform)}</span></div>
          <h3>${store.url ? `<a href="${escape(store.url)}" target="_blank" rel="noreferrer">${escape(title)}</a>` : escape(title)}</h3>
          <p>${escape(store.developer || '发行方待补')}</p>
          <div class="td-card-metrics"><span><small>ST 下载</small>${fmtTdMetric(item.sensorTower?.downloadsWorldwide)}</span><span><small>ST 净收入</small>${fmtTdMetric(item.sensorTower?.revenueWorldwideUsd, true)}</span><span><small>GP 安装下限</small>${fmtTdMetric(store.minInstalls)}</span></div>
          <div class="td-card-meta"><span>${escape(item.videoDate)} · ${escape(storeState)}</span><span>${escape(item.googlePlayId || store.bundleId || '应用 ID 待补')}</span></div>
          <div class="td-card-links"><a href="${escape(item.videoUrl)}" target="_blank" rel="noreferrer">B站 ${escape(item.issue)} 期</a>${item.describedUrl ? `<a href="${escape(item.describedUrl)}" target="_blank" rel="noreferrer">简介链接</a>` : ''}</div>
        </article>`;
      }).join('') || '<p class="td-empty">没有符合当前条件的样本。</p>';
    }
    [els.tdSearch, els.tdPlatform, els.tdStatus, els.tdSort].forEach(control => control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', filterAndRender));
    filterAndRender();
  }

  function switchView(view) {
    state.view = view;
    document.querySelectorAll('.nav-button').forEach(button => button.classList.toggle('is-active', button.dataset.view === view));
    document.querySelectorAll('[data-view-panel]').forEach(panel => panel.classList.toggle('is-active', panel.dataset.viewPanel === view));
    window.scrollTo({ top: document.querySelector('.hero').offsetHeight, behavior: 'smooth' });
  }

  function exportCsv() {
    const rows = filteredApps();
    const header = ['公司','开发者账号','产品','包名','最早公开','最早公开类型','Google Play 最早上架','最早上架地区','曝光信息','曝光来源','下载量区间','下载量下限','累计营收估算（USD）','累计下载估算','Sensor Tower 起始月','Sensor Tower 截止月','评分数','文字评论数','评分','赛道','Google Play'];
    const values = rows.map(app => [app.companyZh,app.account,app.title,app.appId,fmtFirstPublicDate(app),app.firstPublicKind === 'exposure' ? '公开曝光' : (app.firstPublicKind === 'store' ? '商店上架' : '待补'),fmtReleaseDate(app),(app.releaseMarkets?.length ? app.releaseMarkets : [app.releaseMarket]).filter(Boolean).map(value => value.toUpperCase()).join('|'),app.earliestExposure?.title || '',app.earliestExposure?.sourceUrl || '',app.installs,app.minInstalls,app.revenueCumulativeWorldwideUsd,app.downloadsCumulativeWorldwide,app.sensorTowerCumulativeStart,app.sensorTowerCumulativeEnd,app.ratings,app.reviews,app.score.toFixed(2),app.tags.join('|'),app.url]);
    const csv = [header, ...values].map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `热门竞品厂商跟踪-${new Date(data.meta.generatedAt).toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function bind() {
    document.getElementById('showLiveTd')?.addEventListener('click', () => {
      els.resetFilters.click();
      state.tag = '塔防';
      els.tagFilter.value = '塔防';
      switchView('products');
      renderTable();
      document.querySelector('.database').scrollIntoView({ behavior: 'smooth' });
    });
    document.querySelectorAll('.nav-button').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
    document.querySelectorAll('[data-sort]').forEach(button => button.addEventListener('click', () => {
      if (state.sort === button.dataset.sort) state.direction = state.direction === 'desc' ? 'asc' : 'desc';
      else { state.sort = button.dataset.sort; state.direction = ['title','companyZh'].includes(state.sort) ? 'asc' : 'desc'; }
      state.page = 1;
      renderTable();
    }));
    els.searchInput.addEventListener('input', event => { state.query = event.target.value; state.page = 1; renderTable(); });
    els.cohortFilter.addEventListener('change', event => { state.cohort = event.target.value; state.page = 1; renderTable(); });
    els.companyFilter.addEventListener('change', event => { state.company = event.target.value; state.page = 1; renderTable(); });
    els.accountFilter.addEventListener('change', event => { state.account = event.target.value; state.page = 1; renderTable(); });
    els.tagFilter.addEventListener('change', event => { state.tag = event.target.value; state.page = 1; renderTable(); });
    els.releaseFilter.addEventListener('change', event => { state.release = event.target.value; state.page = 1; renderTable(); });
    els.resetFilters.addEventListener('click', () => {
      Object.assign(state, { query:'', cohort:'', company:'', account:'', tag:'', release:'all', page:1 });
      els.searchInput.value = '';
      els.cohortFilter.value = '';
      els.companyFilter.value = '';
      els.accountFilter.value = '';
      els.tagFilter.value = '';
      els.releaseFilter.value = 'all';
      renderTable();
    });
    els.exportCsv.addEventListener('click', exportCsv);
  }

  function init() {
    const stamp = new Date(data.meta.generatedAt);
    const markets = (data.meta.discoveryCountries || [data.meta.country || 'us']).map(value => String(value).toUpperCase());
    const deepseekReviewed = data.meta.exposureRegistry?.deepseekReview?.completed || 0;
    els.freshnessText.textContent = `更新于 ${dateFmt.format(stamp)} · ${markets.length} 区联合发现${deepseekReviewed ? ` · ${deepseekReviewed} 款 DeepSeek复核` : ''}`;
    els.footerStamp.textContent = `${dateFmt.format(stamp)} · ${data.apps.length} PRODUCTS`;
    const deepseekMeta = data.meta.exposureRegistry?.deepseekReview;
    els.methodCaveat.textContent = `${data.meta.caveat}${deepseekMeta ? ` 本轮用 Tavily 检索、DeepSeek 结构化标注 ${deepseekMeta.completed} 款重点产品；只采纳有来源 URL 且能证明时间更早的记录。` : ''}`;
    populateSelect(els.companyFilter, data.apps.map(app => app.companyZh));
    populateSelect(els.accountFilter, data.apps.map(app => app.account));
    populateSelect(els.tagFilter, data.apps.flatMap(app => app.tags));
    renderKpis();
    renderSignals();
    renderAccounts();
    renderTd();
    bind();
    renderTable();
  }

  init();
})();
