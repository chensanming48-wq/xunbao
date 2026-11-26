(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const state = {
    payload: { items: [], status: '●  正在连接罗盘', loggedIn: false },
    view: 'shortvideo',
    selected: new Set(),
    expanded: '',
    keyword: '',
    price: 'all',
    brand: 'all'
  };

  const viewMeta = {
    total: { title: '抖音商品', workflow: '商品榜单 · TOP10 视频', media: '关联短视频', amount: '用户支付金额' },
    search: { title: '抖音搜索商品', workflow: '搜索榜单 · TOP10 视频', media: '搜索带货视频', amount: '搜索成交金额' },
    live: { title: '抖音直播商品', workflow: '直播榜单 · 高转化素材', media: '直播间', amount: '直播成交额' },
    productcard: { title: '抖音商品卡', workflow: '商品卡榜单 · TOP10 素材', media: '关联素材', amount: '商品卡成交额' },
    talent: { title: '抖音达人商品', workflow: '达人榜单 · TOP10 素材', media: '代表内容', amount: '近30天带货成交额' },
    shortvideo: { title: '抖音商品', workflow: '商品榜单 · TOP10 视频', media: '带货短视频', amount: '短视频用户支付金额' },
    realtime: { title: '短视频带货榜', workflow: '实时爆品 · 高转化素材', media: '热门视频', amount: '视频成交额' }
  };

  function post(message) {
    if (window.chrome && window.chrome.webview) window.chrome.webview.postMessage(message);
  }

  function text(value) {
    return value == null ? '' : String(value).trim();
  }

  function create(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = value;
    return node;
  }

  function createButton(label, className, handler) {
    const button = create('button', className, label);
    button.type = 'button';
    button.addEventListener('click', event => {
      event.stopPropagation();
      handler(event);
    });
    return button;
  }

  function createImage(url, className, alt) {
    const value = text(url);
    if (!/^https?:\/\//i.test(value) && !/^data:image\//i.test(value)) {
      return create('span', `${className} asset-missing`, '暂无封面');
    }
    const image = document.createElement('img');
    image.className = className;
    image.src = value;
    image.alt = alt || '';
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => {
      const fallback = create('span', `${className} asset-missing`, '暂无封面');
      image.replaceWith(fallback);
    }, { once: true });
    return image;
  }

  function metric(item, names, fallback) {
    const metrics = item && item.metrics && typeof item.metrics === 'object' ? item.metrics : {};
    for (const name of names) {
      const direct = text(metrics[name]);
      if (direct) return direct;
      const key = Object.keys(metrics).find(candidate => candidate.toLowerCase() === name.toLowerCase());
      if (key && text(metrics[key])) return text(metrics[key]);
    }
    return fallback || '—';
  }

  function itemKey(item, index) {
    return text(item.id) || text(item.rawId) || `${text(item.title)}-${index}`;
  }

  function productLabel(item) {
    return text(item.product) || text(item.title) || text(item.author) || '未命名商品';
  }

  function groupRows(items) {
    const safe = Array.isArray(items) ? items.filter(Boolean) : [];
    const products = safe.filter(item => text(item.kind).toLowerCase() === 'product' || (!text(item.kind) && !text(item.mediaUrl)));
    const media = safe.filter(item => text(item.kind).toLowerCase() === 'video' || text(item.mediaUrl));
    const base = products.length ? products : safe.filter(item => text(item.kind).toLowerCase() !== 'talent').slice(0, 80);
    const usedMedia = new Set();

    const rows = base.map((item, index) => {
      const title = productLabel(item);
      const rawId = text(item.rawId);
      let related = media.filter((video, mediaIndex) => {
        if (usedMedia.has(mediaIndex)) return false;
        const candidate = `${text(video.product)} ${text(video.title)}`.toLowerCase();
        const match = (rawId && rawId === text(video.rawId)) ||
          (title.length > 4 && candidate.includes(title.slice(0, Math.min(12, title.length)).toLowerCase())) ||
          (text(video.product).length > 4 && title.toLowerCase().includes(text(video.product).slice(0, 10).toLowerCase()));
        if (match) usedMedia.add(mediaIndex);
        return match;
      });
      if (!related.length && products.length && media.length) {
        related = media.filter((_, mediaIndex) => !usedMedia.has(mediaIndex)).slice(0, 4);
        related.forEach(video => {
          const mediaIndex = media.indexOf(video);
          if (mediaIndex >= 0) usedMedia.add(mediaIndex);
        });
      }
      if (!related.length && text(item.mediaUrl)) related = [item];
      const key = itemKey(item, index);
      return { key, item, title, related };
    });

    if (rows.length) return rows;
    return media.slice(0, 80).map((item, index) => ({
      key: itemKey(item, index), item, title: productLabel(item), related: [item]
    }));
  }

  function parsePrice(value) {
    const match = text(value).replace(/,/g, '').match(/\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  }

  function visibleRows() {
    const query = state.keyword.toLowerCase();
    return groupRows(state.payload.items).filter(row => {
      const item = row.item;
      const haystack = `${row.title} ${text(item.author)} ${text(item.rawId)} ${text(item.product)}`.toLowerCase();
      if (query && !haystack.includes(query)) return false;
      if (state.price !== 'all' && state.price !== 'custom') {
        const number = parsePrice(text(item.price) || metric(item, ['价格'], ''));
        if (number != null) {
          if (state.price === '60+' && number < 60) return false;
          if (state.price !== '60+') {
            const parts = state.price.split('-').map(Number);
            if (number < parts[0] || number >= parts[1]) return false;
          }
        }
      }
      return true;
    }).slice(0, 120);
  }

  function createRank(rank) {
    const cell = create('div', `rank-cell top-${rank}`);
    cell.appendChild(create('strong', '', String(rank)));
    if (rank <= 3) cell.appendChild(create('span', '', rank === 1 ? '首次上榜' : '榜单上升'));
    return cell;
  }

  function createProduct(row) {
    const item = row.item;
    const cell = create('div', 'product-cell');
    cell.appendChild(createImage(item.image, 'product-cover', row.title));
    const copy = create('div', 'product-copy');
    const name = create('span', 'product-name', row.title);
    name.title = row.title;
    copy.appendChild(name);
    const price = text(item.price) || metric(item, ['价格'], '价格待平台返回');
    copy.appendChild(create('span', 'product-subtitle', `价格带 ${price}`));
    cell.appendChild(copy);
    return cell;
  }

  function createMedia(row) {
    const cell = create('div', 'media-list');
    const related = row.related.filter(Boolean).slice(0, 4);
    if (!related.length) {
      cell.appendChild(create('span', 'media-empty', state.view === 'live' ? '直播间待关联' : '视频待关联'));
      return cell;
    }
    related.forEach(media => {
      const wrap = create('div', 'media-thumb-wrap');
      wrap.appendChild(createImage(media.image || row.item.image, 'media-thumb', text(media.title)));
      const play = create('span', 'media-play', '\uE768');
      play.setAttribute('aria-hidden', 'true');
      wrap.appendChild(play);
      cell.appendChild(wrap);
    });
    if (row.related.length > 4) cell.appendChild(create('span', 'media-more', `+${row.related.length - 4}`));
    return cell;
  }

  function createShop(row) {
    const item = row.item;
    const mediaAuthor = row.related.map(candidate => text(candidate.author)).find(Boolean);
    const shop = text(item.author) || mediaAuthor || '罗盘店铺';
    const cell = create('div', 'shop-cell');
    const logoSource = row.related.map(candidate => text(candidate.shopImage)).find(Boolean);
    if (logoSource) cell.appendChild(createImage(logoSource, 'shop-logo', shop));
    cell.appendChild(create('span', 'shop-name', shop));
    cell.title = shop;
    return cell;
  }

  function runItemAction(action, row) {
    post({ type: 'itemAction', action, id: row.key });
  }

  function createOperations(row) {
    const cell = create('div', 'operation-cell');
    const top = create('div', 'operation-line');
    top.appendChild(createButton('查看详情', 'link-action', () => runItemAction('open', row)));
    top.appendChild(createButton('加入追踪', 'link-action', () => runItemAction('track', row)));
    top.appendChild(createButton('找货源', 'link-action', () => runItemAction('source', row)));
    cell.appendChild(top);

    const tools = create('div', 'operation-buttons');
    tools.appendChild(createButton('映射数据', 'mini-button', () => runItemAction('map', row)));
    tools.appendChild(createButton('添加自选', 'mini-button', () => runItemAction('select', row)));
    cell.appendChild(tools);

    const bottom = create('div', 'operation-bottom');
    const mediaReady = row.related.some(item => text(item.mediaUrl));
    bottom.appendChild(createButton(mediaReady ? 'TOP10 视频已就绪' : '等待 TOP10 视频', 'mini-button status', () => toggleExpanded(row.key)));
    bottom.appendChild(createButton('送入一刀不剪', `mini-button onecut${mediaReady ? ' ready' : ''}`, () => sendRowsToOneCut([row])));
    cell.appendChild(bottom);
    return cell;
  }

  function createExpanded(row) {
    const panel = create('div', 'row-expanded');
    const summary = create('div', 'expanded-summary');
    summary.appendChild(create('strong', '', text(row.item.author) || row.title));
    summary.appendChild(create('span', '', `已关联 ${row.related.length} 条视频`));
    panel.appendChild(summary);
    const actions = create('div', 'expanded-actions');
    [
      ['查看详情', 'open'], ['加入追踪', 'track'], ['找货源', 'source'],
      ['映射数据', 'map'], ['添加自选', 'select']
    ].forEach(([label, action]) => actions.appendChild(createButton(label, '', () => runItemAction(action, row))));
    actions.appendChild(createButton('送入一刀不剪', 'primary-button', () => sendRowsToOneCut([row])));
    panel.appendChild(actions);
    return panel;
  }

  function createTableRow(row, index) {
    const wrapper = create('div', 'table-row-wrap');
    const line = create('div', 'selection-grid table-row');
    line.dataset.key = row.key;
    const select = create('div', 'select-column');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.selected.has(row.key);
    checkbox.setAttribute('aria-label', `选择 ${row.title}`);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.selected.add(row.key); else state.selected.delete(row.key);
      updateBatchBar();
    });
    select.appendChild(checkbox);
    line.appendChild(select);
    line.appendChild(createRank(index + 1));
    line.appendChild(createProduct(row));
    line.appendChild(createMedia(row));
    line.appendChild(createShop(row));
    line.appendChild(create('div', 'metric-cell', metric(row.item, ['成交金额', '用户支付金额'], '—')));
    line.appendChild(create('div', 'minor-cell', metric(row.item, ['销量', '成交件数', '成交订单数'], '—')));
    line.appendChild(create('div', 'minor-cell', metric(row.item, ['发布时间', '日期'], '—')));
    line.appendChild(createOperations(row));
    line.addEventListener('dblclick', () => toggleExpanded(row.key));
    wrapper.appendChild(line);
    if (state.expanded === row.key) wrapper.appendChild(createExpanded(row));
    return wrapper;
  }

  function createCard(row, index) {
    const card = create('article', 'ranking-card');
    card.appendChild(create('span', 'card-rank', String(index + 1)));
    const media = row.related[0] || row.item;
    card.appendChild(createImage(media.image || row.item.image, 'card-cover', row.title));
    const body = create('div', 'card-body');
    body.appendChild(create('h2', '', row.title));
    body.appendChild(create('p', '', text(row.item.author) || '罗盘店铺'));
    const metrics = create('div', 'card-metrics');
    metrics.appendChild(create('span', '', `视频成交额 ${metric(row.item, ['成交金额'], '—')}`));
    metrics.appendChild(create('span', '', `近7天销量 ${metric(row.item, ['销量', '成交件数'], '—')}`));
    body.appendChild(metrics);
    const actions = create('div', 'card-actions');
    actions.appendChild(createButton('查看同款视频', 'secondary-button', () => toggleExpanded(row.key)));
    actions.appendChild(createButton('加入选品', 'primary-button', () => runItemAction('select', row)));
    body.appendChild(actions);
    card.appendChild(body);
    return card;
  }

  function renderRows() {
    const rows = visibleRows();
    const container = byId('tableRows');
    const cardMode = state.view === 'realtime';
    container.replaceChildren();
    container.classList.toggle('card-grid', cardMode);
    byId('emptyState').hidden = rows.length > 0;
    document.querySelector('.table-head').hidden = cardMode;
    rows.forEach((row, index) => container.appendChild(cardMode ? createCard(row, index) : createTableRow(row, index)));
    const mediaCount = rows.reduce((total, row) => total + row.related.length, 0);
    byId('workflowMeta').textContent = rows.length
      ? `本页已关联 ${rows.length} 个商品 · ${mediaCount} 条视频`
      : text(state.payload.status) || '正在等待罗盘榜单数据';
    updateBatchBar();
  }

  function renderHeader() {
    const meta = viewMeta[state.view] || viewMeta.shortvideo;
    byId('titlePrefix').textContent = meta.title;
    byId('workflowTitle').textContent = meta.workflow;
    byId('mediaColumnTitle').textContent = meta.media;
    byId('amountColumnTitle').textContent = meta.amount;
    document.querySelectorAll('#rankTabs button').forEach(button => button.classList.toggle('active', button.dataset.view === state.view));
    document.querySelectorAll('.site-tabs button').forEach(button => button.classList.toggle('active', button.dataset.section === state.view || (state.view === 'shortvideo' && button.dataset.section === 'shortvideo')));
  }

  function render() {
    renderHeader();
    renderRows();
    const hasItems = Array.isArray(state.payload.items) && state.payload.items.length > 0;
    byId('loginButton').textContent = state.payload.loggedIn ? '打开罗盘原页面' : '打开罗盘登录';
    byId('copyButton').disabled = !hasItems;
    byId('bulkOneCutButton').disabled = !hasItems;
  }

  function updateBatchBar() {
    const rows = visibleRows();
    const valid = new Set(rows.map(row => row.key));
    [...state.selected].forEach(key => { if (!valid.has(key)) state.selected.delete(key); });
    const count = state.selected.size;
    byId('selectedCount').textContent = String(count);
    byId('batchBar').hidden = count === 0;
    const selectAll = byId('selectAll');
    selectAll.checked = rows.length > 0 && count === rows.length;
    selectAll.indeterminate = count > 0 && count < rows.length;
  }

  function selectedRows() {
    const rows = visibleRows();
    const selected = rows.filter(row => state.selected.has(row.key));
    return selected.length ? selected : rows;
  }

  function toggleExpanded(key) {
    state.expanded = state.expanded === key ? '' : key;
    renderRows();
  }

  function sendRowsToOneCut(rows) {
    const ids = rows.map(row => row.key);
    post({ type: 'batchOneCut', ids });
    showToast(`已提交 ${ids.length} 个商品的视频处理请求`);
  }

  async function copyVisibleLinks() {
    const links = visibleRows().flatMap(row => row.related.map(item => text(item.mediaUrl)).filter(Boolean));
    const unique = [...new Set(links)];
    if (!unique.length) {
      showToast('当前榜单还没有可复制的视频链接');
      return;
    }
    try {
      await navigator.clipboard.writeText(unique.join('\r\n'));
      showToast(`已复制 ${unique.length} 条视频链接`);
    } catch (_) {
      post({ type: 'copyLinks', links: unique });
    }
  }

  function batchAction(action) {
    const ids = selectedRows().map(row => row.key);
    post({ type: 'batchAction', action, ids });
    showToast(action === 'track' ? `正在加入追踪 ${ids.length} 个商品` : `正在添加自选 ${ids.length} 个商品`);
  }

  let toastTimer = 0;
  function showToast(message) {
    const toast = byId('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function setView(view, notifyHost) {
    if (!viewMeta[view]) return;
    state.view = view;
    state.expanded = '';
    state.selected.clear();
    render();
    if (notifyHost) post({ type: 'navigateSelection', view });
  }

  function installEvents() {
    byId('keyword').addEventListener('input', event => { state.keyword = event.target.value.trim(); renderRows(); });
    byId('globalSearch').addEventListener('input', event => {
      byId('keyword').value = event.target.value;
      state.keyword = event.target.value.trim();
      renderRows();
    });
    byId('selectAll').addEventListener('change', event => {
      const rows = visibleRows();
      rows.forEach(row => event.target.checked ? state.selected.add(row.key) : state.selected.delete(row.key));
      renderRows();
    });
    document.querySelectorAll('#rankTabs button').forEach(button => button.addEventListener('click', () => setView(button.dataset.view, true)));
    document.querySelectorAll('.site-tabs button').forEach(button => button.addEventListener('click', () => {
      const section = button.dataset.section;
      if (viewMeta[section]) setView(section, true);
      else document.querySelectorAll('.site-tabs button').forEach(candidate => candidate.classList.toggle('active', candidate === button));
    }));
    document.querySelectorAll('.segmented-field').forEach(field => field.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
      field.querySelectorAll('button').forEach(candidate => candidate.classList.toggle('active', candidate === button));
      state[field.dataset.filter] = button.dataset.value;
      renderRows();
    })));
    byId('refreshButton').addEventListener('click', () => post({ type: 'refreshSelection' }));
    byId('platformButton').addEventListener('click', () => post({ type: 'showPlatformPage' }));
    byId('loginButton').addEventListener('click', () => post({ type: state.payload.loggedIn ? 'showPlatformPage' : 'showPlatformLogin' }));
    byId('copyButton').addEventListener('click', copyVisibleLinks);
    byId('bulkOneCutButton').addEventListener('click', () => sendRowsToOneCut(selectedRows()));
    byId('batchOneCutFooterButton').addEventListener('click', () => sendRowsToOneCut(selectedRows()));
    byId('batchSelectButton').addEventListener('click', () => batchAction('select'));
    byId('batchTrackButton').addEventListener('click', () => batchAction('track'));
  }

  function setRollingDate() {
    const end = new Date();
    end.setDate(end.getDate() - 1);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    const format = value => `${value.getFullYear()}/${String(value.getMonth() + 1).padStart(2, '0')}/${String(value.getDate()).padStart(2, '0')}`;
    byId('dateRange').textContent = `${format(start)} - ${format(end)}`;
  }

  window.__assistantApply = payload => {
    state.payload = payload && typeof payload === 'object' ? payload : state.payload;
    render();
  };
  window.__selectionUi = {
    setView: view => setView(view, false),
    expandFirst: () => {
      const first = visibleRows()[0];
      if (first) toggleExpanded(first.key);
    },
    selectFirst: count => {
      state.selected.clear();
      visibleRows().slice(0, Math.max(0, Number(count) || 0)).forEach(row => state.selected.add(row.key));
      renderRows();
    },
    snapshot: () => ({ view: state.view, rows: visibleRows().length, selected: state.selected.size, expanded: state.expanded })
  };

  setRollingDate();
  installEvents();
  render();
  post({ type: 'ready' });
})();
