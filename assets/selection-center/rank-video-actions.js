(() => {
  'use strict';

  // [创爆额度补丁 v6.0] iframe 捕获哨兵（与 compass-mapping.js 内联副本同源）：
  // 实测（2026-09-20）额度耗尽时官方详情页自身仍能加载数据。哨兵注入所有框架，
  // 在详情页 iframe 内挂钩 XHR/fetch 捕获 compete_product_detail 响应，供顶层
  // 捕获通道读取；并自动点击维度 tab 触发页面带完整签名的四维请求。
  if (window.top !== window) {
    try {
      const sh = String(location.hostname || '').toLowerCase();
      if (sh === 'compass.jinritemai.com' || sh.endsWith('.compass.jinritemai.com')) {
        if (!window.__CHUANGBAO_CAPTURE_SENTINEL_V1__) {
          Object.defineProperty(window, '__CHUANGBAO_CAPTURE_SENTINEL_V1__', { value: true, configurable: false });
          const store = new Map();
          Object.defineProperty(window, '__CHUANGBAO_DETAIL_CAPTURES__', { value: store, configurable: false });
          const record = (url, text) => {
            try {
              const raw = String(url || '');
              if (raw.indexOf('/compass_api/shop/product/compete_product_detail/') === -1) return;
              const path = raw.split('?')[0];
              const tail = path.slice(path.lastIndexOf('/') + 1);
              const query = raw.slice(raw.indexOf('?') + 1);
              // v6.0.1 统一 key 规则：tail + '|' + content_type（无则空串），
              // 与顶层 captureKeyForUrl 完全一致（此前 basic_info/flow_more 不匹配）。
              const ct = (query.match(/(?:^|&)content_type=(\d+)/) || [])[1] || '';
              const key = tail + '|' + ct;
              const entry = { text: String(text || ''), time: Date.now() };
              store.set(key, entry);
              // v6.0.2 别名：官方页面默认视图的 core_index 请求可能不带 content_type，
              // 同时存为 '|0'（顶层“总览”板块按 content_type=0 查询）。
              if (tail === 'core_index' && ct === '') store.set('core_index|0', entry);
              try { localStorage.setItem('cba_sentinel_alive', new Date().toISOString() + ' caps=' + store.size + ' last=' + key); } catch (_) {}
            } catch (_) {}
          };
          const nativeOpen = XMLHttpRequest.prototype.open;
          XMLHttpRequest.prototype.open = function (method, url) {
            try { this.__cbaCapUrl = String(url || ''); } catch (_) {}
            return nativeOpen.apply(this, arguments);
          };
          const nativeSend = XMLHttpRequest.prototype.send;
          XMLHttpRequest.prototype.send = function (body) {
            try {
              this.addEventListener('loadend', () => {
                try { if (this.__cbaCapUrl) record(this.__cbaCapUrl, this.responseText); } catch (_) {}
              });
            } catch (_) {}
            return nativeSend.apply(this, arguments);
          };
          try {
            const nativeFetch = window.fetch;
            if (typeof nativeFetch === 'function') {
              window.fetch = function (input, init) {
                const url = typeof input === 'string' ? input : (input && input.url) || '';
                return nativeFetch.apply(this, arguments).then(resp => {
                  try {
                    if (String(url).indexOf('/compass_api/shop/product/compete_product_detail/') !== -1) {
                      const clone = resp.clone();
                      clone.text().then(t => record(url, t)).catch(() => {});
                    }
                  } catch (_) {}
                  return resp;
                });
              };
            }
          } catch (_) {}
          // v6.0.1：维度 tab 点击移至顶层 withDetailWindow 按需执行（锚点从
          // 官方详情页“商品载体：全部/直播/短视频/商品卡”筛选器中定位）。
          try { localStorage.setItem('cba_sentinel_boot', new Date().toISOString() + ' ' + String(location.pathname).slice(0, 60)); } catch (_) {}
        }
      }
    } catch (_) {}
    return; // iframe 只运行哨兵，不执行榜单页主逻辑
  }

  const host = String(location.hostname || '').toLowerCase();
  if (host !== 'compass.jinritemai.com' && !host.endsWith('.compass.jinritemai.com')) return;

  // Install independently of the rank API, including document-created injection
  // before <html> exists and reinjection after an older rank module is installed.
  // This only gives the official detail page a usable viewport; it does not
  // change platform responses or claim that access restrictions are removed.
  try {
    const rescueKey = '__CHUANGBAO_INSIGHT_RESCUE_V1__';
    if (window[rescueKey]) {
      window[rescueKey].scan();
    } else {
    const RESCUE_STYLE = 'position:fixed;left:-99999px;top:0;width:1280px;height:900px;border:0;visibility:hidden;pointer-events:none;';
    const rescueFrame = frame => {
      try {
        frame.style.cssText = RESCUE_STYLE;
        let scheduled = false;
        const scheduleScroll = () => {
          if (scheduled || !frame.isConnected) return;
          scheduled = true;
          [900, 2200].forEach(delay => window.setTimeout(() => {
            if (!frame.isConnected) return;
            try {
              const win = frame.contentWindow;
              win.scrollTo(0, win.document.body ? win.document.body.scrollHeight : 4000);
              window.setTimeout(() => { if (frame.isConnected) try { win.scrollTo(0, 0); } catch (_) {} }, 700);
            } catch (_) {}
          }, delay));
        };
        frame.addEventListener('load', scheduleScroll, { once: true });
        try {
          if (frame.contentDocument?.readyState === 'complete' &&
              /\/shop\/chance\/rank-product\/detail/.test(frame.contentWindow.location.pathname)) scheduleScroll();
        } catch (_) {}
      } catch (_) {}
    };
    const rescueExisting = () => {
      try {
        document.querySelectorAll('#chuangbao-insight-frame-v1:not([data-cba-rescued])').forEach(frame => {
          frame.setAttribute('data-cba-rescued', '1');
          rescueFrame(frame);
        });
      } catch (_) {}
    };
    let rescueObserver = null;
    let rootObserver = null;
    const installWhenReady = () => {
      if (!document.documentElement) return;
      if (!rescueObserver) {
        const observer = new MutationObserver(rescueExisting);
        observer.observe(document.documentElement, { childList: true });
        rescueObserver = observer;
        if (rootObserver) { rootObserver.disconnect(); rootObserver = null; }
        document.removeEventListener('readystatechange', installWhenReady);
        document.removeEventListener('DOMContentLoaded', installWhenReady);
      }
      rescueExisting();
    };
    Object.defineProperty(window, rescueKey, { value: { scan: installWhenReady }, configurable: true });
    document.addEventListener('readystatechange', installWhenReady);
    document.addEventListener('DOMContentLoaded', installWhenReady);
    if (!document.documentElement) {
      rootObserver = new MutationObserver(installWhenReady);
      rootObserver.observe(document, { childList: true });
    }
    installWhenReady();
    }
  } catch (_) {}

  if (window.__CHUANGBAO_RANK_VIDEO_V1__) return;

  const PRODUCT_ENDPOINT = '/compass_api/shop/product/product_rank/video_bring_good';
  const TALENT_ENDPOINT = '/compass_api/shop/mall/market/common_rank';
  const DETAIL_VIDEO_ENDPOINT = '/compass_api/shop/product/compete_product_detail/flow_source/flow_more';
  const PRODUCT_PATH = '/shop/chance/rank-product';
  const TALENT_PATH = '/shop/chance/video-talent-rank';
  const DETAIL_PATH = '/shop/chance/rank-product/detail';
  const PRODUCT_MOUNT = 'data-chuangbao-product-video-copy';
  const PRODUCT_INSIGHT_MOUNT = 'data-chuangbao-product-video-insight';
  const TALENT_MOUNT = 'data-chuangbao-talent-video-copy';
  const DETAIL_SELECT_MOUNT = 'data-chuangbao-detail-video-select';
  const PANEL_ID = 'chuangbao-rank-video-panel-v1';
  const FIT_STYLE_ID = 'chuangbao-rank-viewport-fit-v1';
  const TOAST_ID = 'chuangbao-rank-video-toast-v1';
  const numericId = value => {
    const text = String(value == null ? '' : value).trim();
    return /^\d{6,32}$/.test(text) ? text : '';
  };
  const normalizedText = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  const normalizedPath = value => String(value || '/').replace(/\/+$/, '') || '/';
  const pathNow = () => normalizedPath(location.pathname || '/');
  const visiblePageText = () => {
    const selectors = [
      'h1', 'h2', '[role="heading"]', '[role="tab"]',
      '.semi-navigation-item-text', '.auxo-menu-item-text'
    ];
    return Array.from(document.querySelectorAll(selectors.join(',')))
      .filter(element => element && element.isConnected)
      .slice(0, 160)
      .map(element => normalizedText(element.textContent))
      .filter(Boolean)
      .join(' | ');
  };
  const isDetailPage = path => /(?:^|\/)detail(?:\/|$)/i.test(path) || /竞品详情/.test(document.title || '');
  const isProductPage = () => {
    const path = pathNow();
    if (isDetailPage(path)) return false;
    if (path === PRODUCT_PATH || path === '/shop/chance/product-rank' ||
        path === '/shop/chance/merchandise-product-rank') return true;
    const identity = `${normalizedText(document.title)} | ${visiblePageText()}`;
    return /商品排行/.test(identity) && /商品榜单|抖音大盘商品排行/.test(identity);
  };
  const isTalentPage = () => {
    const path = pathNow();
    if (isDetailPage(path)) return false;
    if (path === TALENT_PATH || path === '/shop/chance/talent-video-rank') return true;
    const identity = `${normalizedText(document.title)} | ${visiblePageText()}`;
    return /视频达人榜|达人排行/.test(identity) && /达人|视频/.test(identity);
  };
  const isDetailVideoPage = () => {
    const path = pathNow();
    if (path !== DETAIL_PATH && !isDetailPage(path)) return false;
    const identity = `${normalizedText(document.title)} | ${visiblePageText()}`;
    return /视频分析|短视频列表/.test(identity);
  };
  const state = {
    productItems: [],
    productById: new Map(),
    talentItems: [],
    talentById: new Map(),
    detailItems: [],
    selectedDetailRowKeys: new Set(),
    detailSelectionTouched: false,
    detailContextKey: '',
    detailPage: null,
    detailRevision: 0,
    bulkCopy: null,
    lastMode: '',
    lastGroupCount: 0,
    lastVideoCount: 0
  };

  const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  const list = value => Array.isArray(value) ? value : [];
  const text = value => typeof value === 'string' && value.trim() ? value.trim() : '';
  const positiveRank = value => {
    const number = typeof value === 'number'
      ? value
      : /^\d+$/.test(String(value || '').trim()) ? Number(value) : NaN;
    return Number.isSafeInteger(number) && number > 0 ? number : 0;
  };
  const uniqueVideoIds = (values, maximum) => Array.from(new Set(
    list(values).map(value => numericId(record(value) ? value.video_id : value)).filter(Boolean)
  )).slice(0, maximum);

  const findPromotionId = (value, key = '', depth = 0) => {
    if (depth > 10 || value == null) return '';
    if (typeof value === 'string') {
      if (!/promotion(?:_|%5f)?id/i.test(value)) return '';
      const variants = [value];
      try { variants.push(decodeURIComponent(value)); } catch (_error) { }
      for (const variant of variants) {
        const match = variant.match(/(?:promotion_id|promotionId|promotionID|promotion_product_id|promotionProductId)["'%\s]*[:=]["'%\s]*(\d{6,32})/i);
        const id = numericId(match && match[1]);
        if (id) return id;
        if (variant.length <= 100000 && /^\s*[\[{]/.test(variant)) {
          try {
            const nested = findPromotionId(JSON.parse(variant), key, depth + 1);
            if (nested) return nested;
          } catch (_error) { }
        }
      }
      return '';
    }
    const object = record(value);
    if (!object) return '';
    const direct = numericId(object.promotion_id) || numericId(object.promotionId) ||
      numericId(object.promotionID) || numericId(object.promotion_product_id) ||
      numericId(object.promotionProductId) || (/promotion/i.test(key) ? numericId(object.id) : '');
    if (direct) return direct;
    for (const [nestedKey, nestedValue] of Object.entries(object)) {
      const found = findPromotionId(nestedValue, nestedKey, depth + 1);
      if (found) return found;
    }
    return '';
  };

  const parseProductItems = body => {
    const root = record(body);
    const data = record(root && root.data);
    return list(data && data.data_result).map((value, index) => {
      const item = record(value);
      const product = record(item && item.product_info);
      const productId = numericId(product && product.id);
      if (!item || !productId) return null;
      const promotionInfo = record(product.promotion_info) || record(product.promotionInfo);
      const promotionId = numericId(product.promotion_id) || numericId(product.promotionId) ||
        numericId(promotionInfo && promotionInfo.promotion_id) ||
        numericId(promotionInfo && promotionInfo.promotionId) ||
        numericId(promotionInfo && promotionInfo.id) || numericId(item.promotion_id) ||
        numericId(item.promotionId) || findPromotionId(item) || productId;
      const shopList = list(product.shop_list);
      const shop = record(shopList[0]);
      return {
        productId,
        promotionId,
        productName: text(product.name),
        shopName: text(shop && shop.shop_name),
        rankNo: index + 1,
        videoIds: uniqueVideoIds(item.video_list, 10)
      };
    }).filter(Boolean);
  };

  const parseTalentItems = body => {
    const root = record(body);
    return list(root && root.data).map((value, index) => {
      const outer = record(value);
      const row = record(outer && outer.row);
      const authorDimension = record(row && row.author_dimension);
      const author = record(authorDimension && authorDimension.author_dimension);
      const authorId = numericId(author && author.author_id);
      if (!row || !authorId) return null;
      const videoContainer = record(row.video_list);
      const rankContainer = record(row.rank_info);
      const rankInfo = record(rankContainer && rankContainer.rank_info);
      return {
        authorId,
        authorName: text(author && author.author_nick_name),
        rankNo: positiveRank(rankInfo && rankInfo.rank_no) || index + 1,
        videoIds: uniqueVideoIds(videoContainer && videoContainer.video_list, 50)
      };
    }).filter(Boolean);
  };

  const detailCandidates = body => {
    const root = record(body);
    const data = root && root.data;
    return Array.isArray(data) ? data
      : list(record(data) && (data.data_result || data.list || data.items || data.data));
  };
  const parseDetailItems = body => {
    return detailCandidates(body).map((value, index) => {
      const item = record(value);
      const baseInfo = record(item && item.base_info);
      const video = record(baseInfo && baseInfo.video_base_info);
      const author = record(video && video.author_info);
      const videoId = numericId(video && video.video_id) || numericId(item && item.video_id);
      if (!videoId) return null;
      return {
        videoId,
        title: text(video && video.video_title) || text(item && item.video_title),
        authorName: text(author && author.author_nick_name) || text(item && item.author_name),
        rankNo: index + 1,
        videoIds: [videoId]
      };
    }).filter(Boolean);
  };

  const detailMetadata = (url, body) => {
    const page = record(body.page_result) || record(body.data?.page_result) || {};
    // Only pagination and transport noise are excluded; date, sort and filters identify the list.
    // Compass generates a new _lid request trace on each native page load.
    // It does not change the product, date range, sort order or filters.
    const transient = /^(page_no|page|page_num|page_index|_signature|a_bogus|msToken|_lid|_|timestamp|ts)$/i;
    const query = Array.from(url.searchParams.entries()).filter(([key]) => !transient.test(key))
      .sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv));
    const contextKey = JSON.stringify([location.href, query]);
    const pageNo = positiveRank(page.page_no || page.page || url.searchParams.get('page_no') ||
      url.searchParams.get('page') || url.searchParams.get('page_num'));
    return {
      contextKey, pageNo,
      pageSize: positiveRank(page.page_size || url.searchParams.get('page_size')),
      total: positiveRank(page.total || page.total_count),
      rawCount: detailCandidates(body).length,
      error: ['st', 'code', 'status_code'].some(key => body[key] != null && Number(body[key]) !== 0)
        ? '当前页返回失败，请在罗盘页面确认后重试' : ''
    };
  };

  const endpointFromEnvelope = envelope => {
    if (!envelope || envelope.channel !== 'chuangbao:capture:v1' ||
        envelope.direction !== 'page-to-host' || !envelope.body) return null;
    try {
      const url = new URL(String(envelope.url || ''), location.href);
      if (url.protocol !== 'https:' || url.hostname !== 'compass.jinritemai.com') return null;
      if (url.pathname === PRODUCT_ENDPOINT) return { mode: 'product', url };
      if (url.pathname === DETAIL_VIDEO_ENDPOINT) return { mode: 'detail', url };
      if (url.pathname === TALENT_ENDPOINT &&
          url.searchParams.get('rank_identity') === 'video_author_rank_v2' &&
          url.searchParams.get('content_type') === '2') return { mode: 'talent', url };
    } catch (_error) { }
    return null;
  };

  const postStatus = (mode, items) => {
    const groupCount = items.length;
    const videoCount = mode === 'detail' ? items.length : new Set(items.flatMap(item => item.videoIds)).size;
    state.lastMode = mode;
    state.lastGroupCount = groupCount;
    state.lastVideoCount = videoCount;
    try {
      if (window.chrome && window.chrome.webview) window.chrome.webview.postMessage({
        type: 'selectionRankVideoStatus',
        mode,
        groupCount,
        videoCount
      });
    } catch (_error) { }
    return { mode, groupCount, videoCount };
  };

  let scanTimer = 0;
  const scheduleScan = () => {
    if (scanTimer) return;
    scanTimer = window.setTimeout(() => {
      scanTimer = 0;
      scan();
    }, 120);
  };

  const applyEnvelope = envelope => {
    const endpoint = endpointFromEnvelope(envelope);
    if (!endpoint) return { mode: '', groupCount: 0, videoCount: 0, ignored: true };
    if (endpoint.mode === 'product') {
      state.productItems = parseProductItems(envelope.body);
      state.productById = new Map(state.productItems.map(item => [item.productId, item]));
      scheduleScan();
      return postStatus('product', state.productItems);
    }
    if (endpoint.mode === 'detail') {
      const meta = detailMetadata(endpoint.url, envelope.body);
      const pageKey = `${meta.contextKey}:${meta.pageNo}`;
      if (state.bulkCopy && meta.contextKey !== state.bulkCopy.contextKey)
        state.bulkCopy.error = '商品或筛选条件已变化，已停止收集；剪贴板未改动';
      if (state.detailContextKey !== pageKey) {
        state.detailContextKey = pageKey;
        state.detailSelectionTouched = false;
      }
      state.detailPage = meta;
      state.detailRevision += 1;
      state.detailItems = parseDetailItems(envelope.body);
      state.detailItems.forEach(item => { item.rowKey = `${meta.pageNo}:${item.rankNo}:${item.videoId}`; });
      const nextKeys = new Set(state.detailItems.map(item => item.rowKey));
      state.selectedDetailRowKeys = state.detailSelectionTouched
        ? new Set(Array.from(state.selectedDetailRowKeys).filter(key => nextKeys.has(key))) : nextKeys;
      scheduleScan();
      return postStatus('detail', state.detailItems);
    }
    state.talentItems = parseTalentItems(envelope.body);
    state.talentById = new Map(state.talentItems.map(item => [item.authorId, item]));
    scheduleScan();
    return postStatus('talent', state.talentItems);
  };

  const isVisible = element => {
    if (!element || !element.isConnected) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  };
  const rowText = row => normalizedText(row && (row.innerText || row.textContent));
  // The overall ranking has product metrics, not the short-video ranking feed.
  // Never present absent video IDs there as a background loading operation.
  const OVERVIEW_GUIDE_ID = 'chuangbao-product-overview-guide';
  const visibleRankTabs = () => Array.from(document.querySelectorAll('[role="tab"]'))
    .filter(tab => isVisible(tab) && tab.getClientRects().length > 0);
  const isProductOverview = () => visibleRankTabs().some(tab =>
    normalizedText(tab.textContent) === '总榜' && tab.getAttribute('aria-selected') === 'true');
  const removeProductVideoActions = row => {
    const actionHost = row.querySelector('[data-chuangbao-action-host]');
    const mount = row.__chuangbaoRankVideoMount || row.querySelector(`[${PRODUCT_MOUNT}]`) ||
      actionHost?.shadowRoot?.querySelector(`[${PRODUCT_MOUNT}]`);
    mount?.remove();
    row.__chuangbaoRankVideoMount = null;
    row.removeAttribute('data-chuangbao-product-video-id');
    const insight = row.querySelector(`[${PRODUCT_INSIGHT_MOUNT}]`);
    const badge = insight?.querySelector('[data-chuangbao-bad-comment-rate]');
    const copyGroup = row.querySelector('[data-chuangbao-product-copy-actions]');
    if (badge && copyGroup) copyGroup.prepend(badge);
    insight?.remove();
  };
  const removeOverviewGuide = () => document.getElementById(OVERVIEW_GUIDE_ID)?.remove();
  const showOverviewGuide = () => {
    let guide = document.getElementById(OVERVIEW_GUIDE_ID);
    if (!guide) {
      guide = document.createElement('section');
      guide.id = OVERVIEW_GUIDE_ID;
      guide.setAttribute('aria-label', '总榜视频操作说明');
      Object.assign(guide.style, {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '12px', flexWrap: 'wrap', margin: '10px 1px', padding: '10px 14px',
        boxSizing: 'border-box', color: '#334155', background: '#f7faff',
        borderRadius: '6px', font: "14px/1.6 'Microsoft YaHei','Segoe UI',sans-serif"
      });
      const label = document.createElement('span');
      label.textContent = '当前为总榜，展示商品数据。复制或下载视频，请前往短视频榜。';
      label.style.flex = '1 1 360px';
      label.style.minWidth = '0';
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '前往短视频榜';
      Object.assign(button.style, {
        flex: '0 0 auto', minHeight: '34px', padding: '5px 16px',
        border: '1px solid #7eafff', borderRadius: '6px', background: '#fff',
        color: '#1769ff', font: 'inherit', fontWeight: '600', cursor: 'pointer'
      });
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        // Re-resolve the platform tab after React rerenders; keep its filters/navigation.
        const tabs = visibleRankTabs().filter(tab => normalizedText(tab.textContent) === '短视频榜');
        if (!isProductPage() || !isProductOverview()) { scheduleScan(); return; }
        if (tabs.length !== 1 || tabs[0].getAttribute('aria-disabled') === 'true') {
          toast('未找到可用的短视频榜入口，请在页面上方选择“短视频榜”。', true);
          return;
        }
        tabs[0].click();
        scheduleScan();
      });
      guide.append(label, button);
    }
    mountPanelInline(guide, 'product');
  };
  const rowRank = row => {
    const firstCell = row && row.querySelector('td:first-child,[role="cell"]:first-child');
    const match = normalizedText(firstCell && firstCell.textContent).match(/\d+/);
    return match ? positiveRank(match[0]) : 0;
  };
  const numericAttribute = (row, names) => {
    for (const name of names) {
      const value = row && row.getAttribute ? row.getAttribute(name) : '';
      const direct = numericId(value);
      if (direct) return direct;
      const match = String(value || '').match(/\d{6,32}/);
      if (match) return match[0];
    }
    return '';
  };
  const idFromLinks = (row, keys) => {
    for (const anchor of Array.from(row.querySelectorAll('a[href]')).slice(0, 20)) {
      try {
        const url = new URL(anchor.href, location.href);
        for (const key of keys) {
          const found = numericId(url.searchParams.get(key));
          if (found) return found;
        }
        const pathId = String(url.pathname || '').match(/\d{6,32}/);
        if (pathId) return pathId[0];
      } catch (_error) { }
    }
    return '';
  };

  const productRows = () => Array.from(document.querySelectorAll('tbody tr,[role="row"][aria-rowindex]'))
    .filter(row => isVisible(row) && !row.querySelector('th,[role="columnheader"]') &&
      (row.hasAttribute('data-chuangbao-row-actions-v1') ||
       Array.from(row.querySelectorAll('button,a,[role="button"]')).some(element => normalizedText(element.textContent) === '查看详情')));
  const talentRows = () => Array.from(document.querySelectorAll('tbody tr.aurora-table-row,tbody tr,[role="row"][aria-rowindex]'))
    .filter((row, index, all) => all.indexOf(row) === index && isVisible(row) &&
      !row.querySelector('th,[role="columnheader"]') &&
      (row.querySelector('[class*="authorInfo-"],[class*="authorName-"]') ||
       Array.from(row.querySelectorAll('button,a,[role="button"]')).some(element => normalizedText(element.textContent) === '查看详情')));
  const detailTable = () => Array.from(document.querySelectorAll('table,[role="table"]')).find(table => {
    if (!isVisible(table)) return false;
    const headers = normalizedText(Array.from(table.querySelectorAll('thead th,[role="columnheader"]'))
      .map(header => header.textContent).join(' | '));
    return /短视频信息/.test(headers) && /用户支付金额|商品成交人数|商品点击率/.test(headers);
  }) || null;
  const detailRows = () => {
    const table = detailTable();
    if (!table) return [];
    return Array.from(table.querySelectorAll('tbody tr,[role="row"][aria-rowindex]'))
      .filter((row, index, all) => all.indexOf(row) === index && isVisible(row) &&
        !row.matches('[aria-hidden="true"],[class*="measure-row"],[class*="expanded-row"]') &&
        !row.querySelector('th,[role="columnheader"]'));
  };

  const resolveProduct = (row, index) => {
    const id = numericAttribute(row, [
      'data-chuangbao-product-id', 'data-product-id', 'data-productid',
      'data-goods-id', 'data-commodity-id', 'data-promotion-id', 'data-row-key'
    ]) || idFromLinks(row, ['product_id', 'productId', 'goods_id', 'commodity_id', 'promotion_id']);
    if (id && state.productById.has(id)) return state.productById.get(id);
    if (id) {
      const promotionMatch = state.productItems.find(item => item.promotionId === id);
      if (promotionMatch) return promotionMatch;
    }
    const content = rowText(row);
    const nameMatch = state.productItems.find(item => item.productName && content.includes(item.productName));
    return nameMatch || state.productItems[index] || null;
  };
  const resolveTalent = (row, index) => {
    const id = numericAttribute(row, [
      'data-chuangbao-talent-id', 'data-author-id', 'data-authorid',
      'data-talent-id', 'data-row-key'
    ]) || idFromLinks(row, ['author_id', 'authorId', 'talent_id', 'talentId']);
    if (id && state.talentById.has(id)) return state.talentById.get(id);
    const content = rowText(row);
    const nameMatch = state.talentItems.find(item => item.authorName && content.includes(item.authorName));
    const rank = rowRank(row);
    const rankMatch = rank ? state.talentItems.find(item => item.rankNo === rank) : null;
    return nameMatch || rankMatch || state.talentItems[index] || null;
  };
  const resolveDetail = (row, index) => {
    const id = numericAttribute(row, ['data-video-id', 'data-item-id', 'data-row-key']) ||
      idFromLinks(row, ['video_id', 'videoId', 'item_id', 'itemId']);
    // Each displayed occurrence has its own key, including identical IDs/titles.
    // Do not reuse our injected ID when the official table reuses a DOM row.
    const item = state.detailItems.find(value => value.rankNo === index + 1);
    return item && (!id || id === item.videoId) ? item : null;
  };

  const videoLinks = ids => Array.from(new Set(list(ids).map(numericId).filter(Boolean)))
    .map(id => `https://www.douyin.com/video/${id}`);
  const detailLinks = items => items.map(item => `https://www.douyin.com/video/${item.videoId}`);
  const copyText = async value => {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(value);
        return;
      } catch (_error) { /* WebView may require the legacy clipboard path after pagination. */ }
    }
    const input = document.createElement('textarea');
    input.value = value;
    input.setAttribute('readonly', 'readonly');
    Object.assign(input.style, { position: 'fixed', left: '-9999px', top: '-9999px' });
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand && document.execCommand('copy');
    input.remove();
    if (!copied) throw new Error('当前浏览器未允许写入剪贴板');
  };
  const toast = (message, error = false) => {
    document.getElementById(TOAST_ID)?.remove();
    const element = document.createElement('div');
    element.id = TOAST_ID;
    element.textContent = message;
    element.setAttribute('role', 'status');
    Object.assign(element.style, {
      position: 'fixed', left: '50%', top: '18%', transform: 'translateX(-50%)',
      zIndex: '2147483647', padding: '10px 16px', borderRadius: '999px',
      border: `1px solid ${error ? '#f5b8bb' : '#9cdbc0'}`,
      background: error ? '#fff1f1' : '#f0fff7', color: error ? '#c9363b' : '#0f8a55',
      boxShadow: '0 12px 30px rgba(15,23,42,.16)', fontFamily: "'Microsoft YaHei','Segoe UI',sans-serif",
      fontSize: '13px', fontWeight: '600', pointerEvents: 'none'
    });
    document.documentElement.appendChild(element);
    window.setTimeout(() => element.remove(), 1900);
  };
  // Opening is acknowledged separately from loading the videos in the dialog.
  const insightLauncher = (() => {
    const id = 'chuangbao-insight-launch-status-v1';
    const documentId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    let active = null, counter = 0, noticeTimer = 0;
    const notice = (message, error = false, persistent = false) => {
      clearTimeout(noticeTimer);
      document.getElementById(id)?.remove();
      if (!message) return;
      const node = document.createElement('div');
      node.id = id;
      node.setAttribute('role', error ? 'alert' : 'status');
      node.setAttribute('aria-live', 'polite');
      node.textContent = String(message).slice(0, 300);
      node.style.cssText = `position:fixed;left:50%;top:18%;transform:translateX(-50%);z-index:2147483647;max-width:calc(100vw - 48px);box-sizing:border-box;padding:12px 18px;border:1px solid ${error ? '#f5b8bb' : '#b8d4ff'};border-radius:12px;background:${error ? '#fff1f1' : '#f2f7ff'};color:${error ? '#b82c35' : '#1769ff'};box-shadow:0 12px 30px #0f172a26;font:14px/1.6 'Microsoft YaHei UI',sans-serif;pointer-events:none;overflow-wrap:anywhere`;
      (document.body || document.documentElement).appendChild(node);
      if (!persistent) noticeTimer = setTimeout(() => node.remove(), 6000);
    };
    const updateButton = (button, current) => {
      const busy = active?.button === button;
      button.disabled = Boolean(busy);
      button.setAttribute('aria-busy', String(Boolean(busy)));
      button.textContent = busy ? '正在打开…' : current ? '增强查看' : '商品待识别';
      button.title = busy ? '正在打开增强查看，请稍候' : current
        ? `增强查看：${current.productName || current.productId}`
        : '尚未识别当前商品，点击查看说明；请等待榜单加载或刷新页面';
    };
    const currentRequest = request => request && location.href === request.pageUrl &&
      request.row.isConnected && isProductPage() &&
      resolveInsightProduct(request.row)?.productId === request.productId;
    const restore = request => {
      clearTimeout(request.timeout);
      clearInterval(request.watch);
      if (active === request) active = null;
      if (request.button.isConnected) updateButton(request.button, resolveInsightProduct(request.row));
    };
    const ownedDialog = request => {
      const mount = document.getElementById('chuangbao-product-insight-v1');
      if (!mount?.isConnected || mount.getAttribute('data-chuangbao-insight-request-id') !== request.requestId ||
          mount.getAttribute('data-chuangbao-insight-product-id') !== request.productId) return false;
      const rect = mount.getBoundingClientRect(), style = getComputedStyle(mount);
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const cancelChangedRequest = () => {
      if (!active || currentRequest(active)) return;
      restore(active);
      notice('页面或商品已变化，请在当前商品重新点击增强查看。', true);
    };
    const receive = value => {
      const request = active;
      if (!request || value?.type !== 'selectionProductInsightOpenResult' ||
          value.requestId !== request.requestId || value.documentId !== documentId ||
          value.pageUrl !== request.pageUrl || value.productId !== request.productId) return false;
      if (!currentRequest(request)) { cancelChangedRequest(); return false; }
      const opened = value.status === 'opened' && ownedDialog(request);
      restore(request);
      notice(opened ? '' : value.status === 'opened'
        ? '增强查看未显示，请刷新罗盘页面后重试。'
        : value.message || '增强查看打开失败，请刷新罗盘页面后重试。', !opened);
      return true;
    };
    const start = (row, button, current) => {
      cancelChangedRequest();
      if (active) { notice('正在打开增强查看，请稍候。', false, true); return null; }
      const request = {row, button, productId: current.productId, pageUrl: location.href,
        requestId: `insight-${Date.now()}-${++counter}-${Math.random().toString(36).slice(2)}`};
      active = request;
      updateButton(button, current);
      notice('正在打开增强查看…', false, true);
      request.watch = setInterval(cancelChangedRequest, 400);
      request.timeout = setTimeout(() => {
        if (active !== request) return;
        const opened = currentRequest(request) && ownedDialog(request);
        restore(request);
        notice(opened ? '' : '增强查看打开超时，请刷新罗盘页面后重试。', !opened);
      }, 15000);
      return {requestId: request.requestId, documentId, pageUrl: request.pageUrl, productId: request.productId};
    };
    const failed = message => { if (active) restore(active); notice(message, true); };
    const api = {documentId, receive, isPending: (requestId, productId, pageUrl, token) =>
      token === documentId && active?.requestId === requestId && active.productId === productId &&
      active.pageUrl === pageUrl && currentRequest(active)};
    Object.defineProperty(window, '__CHUANGBAO_PRODUCT_INSIGHT_LAUNCHER_V1__', {value: api});
    window.chrome?.webview?.addEventListener?.('message', event => receive(event.data));
    window.addEventListener('popstate', cancelChangedRequest);
    window.addEventListener('hashchange', cancelChangedRequest);
    window.addEventListener('pagehide', () => {
      if (active) restore(active);
      clearTimeout(noticeTimer);
      document.getElementById(id)?.remove();
    });
    return {start, failed, updateButton, cancelChangedRequest};
  })();

  const sendVideoRequest = (action, mode, scope, title, links) => {
    if (!links.length) {
      toast(mode === 'talent' ? '当前达人响应中没有可提取的视频 ID' : '当前商品响应中没有可提取的视频 ID', true);
      return;
    }
    if (!window.chrome?.webview || typeof window.chrome.webview.postMessage !== 'function') {
      toast('创爆桌面端交接通道尚未就绪', true);
      return;
    }
    try {
      window.chrome.webview.postMessage({
        type: 'selectionVideoExtractionRequest',
        action,
        mode,
        scope,
        title: String(title || ''),
        links
      });
      toast(action === 'download'
        ? `正在为 ${links.length} 条视频打开保存目录…`
        : `正在将 ${links.length} 条视频送入一刀不剪…`);
    } catch (error) {
      toast(error && error.message ? error.message : action === 'download' ? '批量下载启动失败，请重试' : '送入一刀不剪失败，请重试', true);
    }
  };
  const sendToOneCut = (mode, scope, title, links) => sendVideoRequest('import', mode, scope, title, links);
  const downloadVideos = (mode, scope, title, links) => sendVideoRequest('download', mode, scope, title, links);

  // Resolve again on click: virtualized rows may retain our button after changing product.
  // Never use the response's row index as the identity for opening a product panel.
  const resolveInsightProduct = row => {
    const titleElement = row.querySelector('[data-testid*="product-name"],[class*="productName"],[class*="product-name"],a[title]');
    const title = normalizedText(titleElement && (titleElement.getAttribute('title') || titleElement.textContent));
    let id = numericAttribute(row, ['data-product-id', 'data-productid', 'data-goods-id', 'data-commodity-id', 'data-promotion-id']) ||
      numericId(row.getAttribute('data-row-key'));
    if (!id) {
      for (const anchor of row.querySelectorAll('a[href]')) {
        try {
          const url = new URL(anchor.href, location.href);
          id = ['product_id', 'productId', 'goods_id', 'commodity_id', 'promotion_id']
            .map(key => numericId(url.searchParams.get(key))).find(Boolean) || '';
          if (id) break;
        } catch (_error) { }
      }
    }
    if (id) {
      const item = state.productById.get(id) || state.productItems.find(value => value.promotionId === id);
      return item || { productId: id, productName: title || `商品 ${id}`, shopName: '' };
    }
    const content = rowText(row);
    const matches = state.productItems.filter(item => item.productName &&
      (title ? title === item.productName : content.includes(item.productName)));
    if (matches.length === 1) return matches[0];
    // The main row patch may be the only source of an ID. Reject a stale ID when
    // the visible title already belongs to a different product.
    id = numericId(row.getAttribute('data-chuangbao-product-id'));
    const item = id && state.productById.get(id);
    if (item && (!title || title === item.productName)) return item;
    return null;
  };

  const productVideoCell = row => {
    const table = row.closest('table,[role="table"]');
    if (!table) return null;
    let headers = Array.from(table.querySelectorAll('thead th,[role="columnheader"]'));
    // Some table components render their fixed header in a sibling table.
    if (!headers.length) {
      const wrapper = table.closest('.auxo-table,.ant-table,.semi-table-container,.aurora-table');
      if (wrapper) headers = Array.from(wrapper.querySelectorAll('thead th,[role="columnheader"]'));
    }
    let column = 0;
    let videoColumn = -1;
    for (const header of headers) {
      if (/^(?:带货短视频|带货视频|TOP\s*10\s*视频)$/i.test(normalizedText(header.textContent))) {
        videoColumn = column;
        break;
      }
      column += Number(header.getAttribute('colspan')) || 1;
    }
    if (videoColumn < 0) return null;
    column = 0;
    for (const cell of row.querySelectorAll(':scope > td,:scope > [role="cell"]')) {
      const span = Number(cell.getAttribute('colspan')) || 1;
      if (column === videoColumn && span === 1) return cell;
      column += span;
    }
    return null;
  };

  // Match the visible cover strip, which can be narrower than the video column.
  // Recompute during normal scans so resized and recycled rows stay aligned.
  const alignProductInsightButton = (target, mount) => {
    const covers = Array.from(target.querySelectorAll('img,video,[class*="cover"],[class*="Cover"],[style*="background-image"]'))
      .filter(element => !mount.contains(element))
      .map(element => element.getBoundingClientRect())
      .filter(rect => rect.width >= 18 && rect.width <= 120 && rect.height >= 32 &&
        rect.height <= 220 && rect.height > rect.width * 1.1);
    if (!covers.length) {
      mount.style.width = '100%';
      mount.style.marginLeft = '0px';
      return;
    }
    const left = Math.min(...covers.map(rect => rect.left));
    const right = Math.max(...covers.map(rect => rect.right));
    const style = getComputedStyle(target);
    const origin = target.getBoundingClientRect().left +
      (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.paddingLeft) || 0);
    mount.style.width = (right - left) + 'px';
    mount.style.marginLeft = (left - origin) + 'px';
  };

  const attachProductInsightButton = row => {
    const target = productVideoCell(row);
    let mount = row.querySelector(`[${PRODUCT_INSIGHT_MOUNT}]`);
    if (!target) {
      const badge = mount?.querySelector('[data-chuangbao-bad-comment-rate]');
      const copyGroup = row.querySelector('[data-chuangbao-product-copy-actions]');
      if (badge && copyGroup) copyGroup.prepend(badge);
      mount?.remove();
      return;
    }
    if (!mount) {
      mount = document.createElement('span');
      mount.setAttribute(PRODUCT_INSIGHT_MOUNT, '1');
      mount.setAttribute('data-chuangbao-video-badge-slot', '1');
      mount.style.cssText = 'display:block;clear:both;margin-top:6px;position:relative;z-index:4;';
      const shadow = mount.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = `:host{display:block}.bar{display:flex;width:100%;align-items:center;justify-content:center;gap:6px;white-space:nowrap}button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;flex:0 0 86px;width:86px;height:24px;margin:0;padding:0 4px;border:1px solid #1769ff;border-radius:5px;background:#1769ff;color:#fff;font:normal 12px/22px 'Microsoft YaHei UI','Microsoft YaHei','Segoe UI',sans-serif;white-space:nowrap;cursor:pointer}button:hover:not(:disabled){background:#0d58d7;border-color:#0d58d7}button:focus-visible{outline:2px solid #9abff8;outline-offset:2px}button:disabled{opacity:.45;cursor:not-allowed}::slotted([data-chuangbao-bad-comment-rate]){box-sizing:border-box!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 86px!important;width:86px!important;min-width:86px!important;max-width:86px!important;height:24px!important;margin:0!important;padding:0 4px!important;border:1px solid #9abff8!important;border-radius:5px!important;background:#fff!important;color:#1769ff!important;font:normal 12px/22px 'Microsoft YaHei UI','Microsoft YaHei','Segoe UI',sans-serif!important;white-space:nowrap!important}`;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '增强查看';
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (!row.isConnected || !isProductPage()) {
          insightLauncher.failed('页面已变化，请在商品榜重新点击增强查看。');
          return;
        }
        const current = resolveInsightProduct(row);
        if (!current) { insightLauncher.failed('尚未识别当前商品，请等待榜单加载或刷新页面后重试。'); return; }
        if (typeof window.chrome?.webview?.postMessage !== 'function') {
          insightLauncher.failed('桌面端交接通道尚未就绪，请重新进入选品中心后重试。');
          return;
        }
        const productId = current.productId;
        const title = current.productName || `商品 ${productId}`;
        const request = insightLauncher.start(row, button, current);
        if (!request) return;
        try { window.chrome.webview.postMessage({
          ...request,
          type: 'selectionRowAction', action: 'insight', pageUrl: String(location.href),
          item: {
            id: `row:compass.jinritemai.com:product:${productId}`,
            rawId: productId, kind: 'product', title, product: title,
            href: `https://compass.jinritemai.com/shop/chance/rank-product/detail?product_id=${encodeURIComponent(productId)}`,
            author: current.shopName || '', image: '', mediaUrl: '', price: '', commission: '', quality: 'platform-id'
          }
        }); } catch (_error) {
          insightLauncher.failed('增强查看未能交给主程序，请重新进入选品中心后重试。');
        }
      });
      const bar = document.createElement('span');
      bar.className = 'bar';
      bar.append(button, document.createElement('slot'));
      shadow.append(style, bar);
    }
    if (mount.parentNode !== target) target.appendChild(mount);
    const badge = row.querySelector('[data-chuangbao-bad-comment-rate]');
    if (badge && badge.parentNode !== mount) mount.appendChild(badge);
    alignProductInsightButton(target, mount);
    const current = resolveInsightProduct(row);
    const button = mount.shadowRoot.querySelector('button');
    insightLauncher.cancelChangedRequest();
    insightLauncher.updateButton(button, current);
  };

  const makeRowMount = mode => {
    const mount = document.createElement('span');
    mount.setAttribute(mode === 'product' ? PRODUCT_MOUNT : TALENT_MOUNT, '1');
    mount.style.cssText = 'display:block;width:100%;max-width:100%;min-width:0;margin:0;position:relative;z-index:4;';
    const shadow = mount.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `:host{all:initial;display:block;width:100%;font:normal 600 12px/24px 'Microsoft YaHei UI','Microsoft YaHei','Segoe UI',sans-serif;color:#1769ff}*{box-sizing:border-box}.bar{display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:26px;align-items:stretch;justify-items:stretch;gap:4px;width:100%;height:26px;margin:0;padding:0;font:normal 600 12px/24px 'Microsoft YaHei UI','Microsoft YaHei','Segoe UI',sans-serif;letter-spacing:0;color:#1769ff;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}button{display:flex!important;align-items:center!important;justify-content:center!important;width:100%!important;min-width:0!important;height:26px!important;margin:0!important;padding:0 2px!important;border:1px solid #9abff8;border-radius:5px;background:#fff;color:#1769ff!important;font:normal 600 12px/24px 'Microsoft YaHei UI','Microsoft YaHei','Segoe UI',sans-serif!important;letter-spacing:0!important;text-align:center!important;text-indent:0!important;vertical-align:middle!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;-webkit-appearance:none!important;appearance:none!important;cursor:pointer}button:hover:not(:disabled){border-color:#1769ff;background:#eaf2ff;color:#1769ff!important}button[data-send]{border-color:#1769ff;background:#1769ff;color:#fff!important}button[data-send]:hover:not(:disabled){border-color:#0d58d7;background:#0d58d7;color:#fff!important}button:disabled{border-color:#9abff8;background:#fff;color:#1769ff!important;opacity:.46;cursor:not-allowed}button[data-send]:disabled{border-color:#1769ff;background:#1769ff;color:#fff!important}`;
    const bar = document.createElement('span');
    bar.className = 'bar';
    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.disabled = true;
    copyButton.textContent = mode === 'product' ? '等待 TOP10 视频' : '等待达人视频';
    const sendButton = document.createElement('button');
    sendButton.type = 'button';
    sendButton.setAttribute('data-send', '1');
    sendButton.disabled = true;
    sendButton.textContent = '送入一刀不剪';
    bar.append(copyButton, sendButton);
    shadow.append(style, bar);
    mount.__chuangbaoButton = copyButton;
    mount.__chuangbaoCopyButton = copyButton;
    mount.__chuangbaoSendButton = sendButton;
    return mount;
  };
  const attachRowButton = (row, item, mode) => {
    const marker = mode === 'product' ? PRODUCT_MOUNT : TALENT_MOUNT;
    let mount = row.__chuangbaoRankVideoMount || row.querySelector(`[${marker}]`);
    if (!mount) {
      mount = makeRowMount(mode);
      row.__chuangbaoRankVideoMount = mount;
      const cells = Array.from(row.querySelectorAll(':scope > td,:scope > [role="cell"]'));
      const target = cells[cells.length - 1] || row;
      const actionHost = row.querySelector('[data-chuangbao-action-host]');
      const rankSlot = actionHost?.shadowRoot?.querySelector('[data-chuangbao-rank-slot]');
      (rankSlot || target).appendChild(mount);
      mount.__chuangbaoCopyButton.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        const rows = mode === 'product' ? productRows() : talentRows();
        const currentIndex = rows.indexOf(row);
        const current = mode === 'product'
          ? resolveProduct(row, currentIndex)
          : resolveTalent(row, currentIndex);
        const links = videoLinks(current && current.videoIds);
        if (!links.length) {
          toast(mode === 'product' ? '当前商品响应中没有可复制的视频 ID' : '当前达人响应中没有可复制的视频 ID', true);
          return;
        }
        try {
          await copyText(links.join('\n'));
          toast(`已复制 ${links.length} 条视频链接`);
        } catch (error) {
          toast(error && error.message ? error.message : '复制失败，请重试', true);
        }
      });
      mount.__chuangbaoSendButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const rows = mode === 'product' ? productRows() : talentRows();
        const currentIndex = rows.indexOf(row);
        const current = mode === 'product'
          ? resolveProduct(row, currentIndex)
          : resolveTalent(row, currentIndex);
        sendToOneCut(
          mode,
          'row',
          current && (mode === 'product' ? current.productName : current.authorName),
          videoLinks(current && current.videoIds));
      });
    }
    const actionHost = row.querySelector('[data-chuangbao-action-host]');
    const rankSlot = actionHost?.shadowRoot?.querySelector('[data-chuangbao-rank-slot]');
    if (rankSlot && mount.parentNode !== rankSlot) rankSlot.appendChild(mount);
    const button = mount.__chuangbaoCopyButton || mount.__chuangbaoButton || mount.shadowRoot?.querySelector('button');
    const sendButton = mount.__chuangbaoSendButton || mount.shadowRoot?.querySelector('[data-send]');
    if (!button || !sendButton) return;
    const count = item ? videoLinks(item.videoIds).length : 0;
    button.disabled = count === 0;
    sendButton.disabled = count === 0;
    button.textContent = mode === 'product'
      ? count ? '复制 TOP10 视频' : '等待 TOP10 视频'
      : count ? `复制达人视频 (${count})` : '等待达人视频';
    button.title = count
      ? `复制当前${mode === 'product' ? '商品' : '达人'}的 ${count} 条抖音视频链接`
      : '等待当前榜单视频数据加载';
    sendButton.title = count
      ? `将当前${mode === 'product' ? '商品' : '达人'}的 ${count} 条视频送入一刀不剪输入区`
      : '等待当前榜单视频数据加载';
    if (item) {
      row.setAttribute(mode === 'product' ? 'data-chuangbao-product-video-id' : 'data-chuangbao-talent-id',
        mode === 'product' ? item.productId : item.authorId);
    }
  };

  const attachDetailSelection = (row, item) => {
    let mount = row.__chuangbaoDetailVideoSelect || row.querySelector(`[${DETAIL_SELECT_MOUNT}]`);
    if (!mount) {
      mount = document.createElement('span');
      mount.setAttribute(DETAIL_SELECT_MOUNT, '1');
      mount.style.cssText = 'display:inline-flex;align-items:center;vertical-align:top;margin:3px 10px 3px 0;position:relative;z-index:4;';
      const shadow = mount.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = `:host{all:initial;display:inline-flex}label{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 10px;border:1px solid #9fc4ff;border-radius:7px;background:#f7fbff;color:#1769ff;font:700 12px/1 'Microsoft YaHei','Segoe UI',sans-serif;cursor:pointer;white-space:nowrap;box-sizing:border-box}input{width:18px;height:18px;margin:0;accent-color:#1769ff;cursor:pointer;flex:0 0 18px}`;
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      const caption = document.createElement('span');
      caption.textContent = '选择';
      checkbox.addEventListener('change', event => {
        event.stopPropagation();
        const rowKey = mount.dataset.rowKey;
        if (!rowKey) return;
        state.detailSelectionTouched = true;
        if (checkbox.checked) state.selectedDetailRowKeys.add(rowKey);
        else state.selectedDetailRowKeys.delete(rowKey);
        updatePanel('detail');
      });
      label.addEventListener('click', event => event.stopPropagation());
      label.append(checkbox, caption);
      shadow.append(style, label);
      mount.__chuangbaoCheckbox = checkbox;
      row.__chuangbaoDetailVideoSelect = mount;
      const firstCell = row.querySelector(':scope > td,:scope > [role="cell"]') || row;
      firstCell.insertBefore(mount, firstCell.firstChild);
    }
    const checkbox = mount.__chuangbaoCheckbox || mount.shadowRoot?.querySelector('input');
    const videoId = item && numericId(item.videoId);
    mount.dataset.videoId = videoId || '';
    mount.dataset.rowKey = item?.rowKey || '';
    if (videoId) row.setAttribute('data-chuangbao-detail-video-id', videoId);
    else row.removeAttribute('data-chuangbao-detail-video-id');
    if (checkbox) {
      checkbox.disabled = !videoId;
      checkbox.checked = !!videoId && state.selectedDetailRowKeys.has(item.rowKey);
      checkbox.title = videoId ? `选择视频 ${videoId}` : '等待当前页视频数据加载';
    }
  };

  const hideDetailRowActions = row => {
    const actionHost = row && row.querySelector('[data-chuangbao-action-host]');
    if (!actionHost) return;
    actionHost.setAttribute('data-chuangbao-detail-actions-hidden', '1');
    actionHost.style.setProperty('display', 'none', 'important');
    const actionCell = actionHost.closest('td,[role="cell"]');
    if (!actionCell) return;
    actionCell.style.removeProperty('width');
    actionCell.style.removeProperty('max-width');
    actionCell.style.removeProperty('padding-left');
    actionCell.style.removeProperty('padding-right');
    actionCell.style.removeProperty('overflow');
  };

  const currentRowItems = mode => {
    const rows = mode === 'product' ? productRows() : mode === 'talent' ? talentRows() : detailRows();
    return rows.map((row, index) => mode === 'product'
      ? resolveProduct(row, index)
      : mode === 'talent' ? resolveTalent(row, index) : resolveDetail(row, index)).filter(Boolean);
  };

  const paginationState = () => {
    const activeSelector = '[aria-current="page"],[class*="pagination-item-active"],[class*="page-item-active"],[class*="pagination"] [class*="active"]';
    const rootSelector = '[class*="pagination"],[class*="Pagination"],nav[aria-label*="分页"]';
    const table = detailTable();
    for (let parent = table?.parentElement; parent; parent = parent.parentElement) {
      const roots = Array.from(parent.querySelectorAll(rootSelector)).filter(root =>
        isVisible(root) && !table.contains(root) && root.querySelector(activeSelector));
      if (!roots.length) continue;
      const root = roots[0];
      const active = root.querySelector(activeSelector);
      const match = normalizedText(root.textContent).match(/共\s*([\d,，]+)\s*条/);
      return { root, pageNo: positiveRank(normalizedText(active.textContent)),
        total: match ? positiveRank(match[1].replace(/[,，]/g, '')) : 0 };
    }
    return { root: null, pageNo: 0, total: 0 };
  };
  const detailTotal = () => paginationState().total || state.detailPage?.total || 0;
  const enabledPageControl = element => element && isVisible(element) && !element.disabled &&
    !element.closest('[aria-disabled="true"],[disabled],[class*="disabled"]');
  const pageControl = (pagination, target) => {
    if (!pagination.root) return null;
    const controls = Array.from(pagination.root.querySelectorAll('li,button,a,[role="button"]'));
    const exact = controls.find(element => normalizedText(element.textContent) === String(target) &&
      enabledPageControl(element));
    if (exact) return exact;
    if (target !== pagination.pageNo + 1) return null;
    return controls.find(element => enabledPageControl(element) &&
      (/pagination-next|page-item-next/.test(element.className || '') ||
       /下一页|next page/i.test(`${element.getAttribute('aria-label') || ''} ${element.title || ''} ${normalizedText(element.textContent)}`))) || null;
  };
  const bulkDelay = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));
  const checkBulkCopy = operation => {
    if (operation.cancelled) throw new Error('已取消全部复制；剪贴板未改动');
    if (operation.error) throw new Error(operation.error);
    if (!isDetailVideoPage() || location.href !== operation.href ||
        state.detailPage?.contextKey !== operation.contextKey)
      throw new Error('商品或筛选条件已变化，已停止收集；剪贴板未改动');
  };
  const visitDetailPage = async (operation, target) => {
    checkBulkCopy(operation);
    const pagination = paginationState();
    const previousRevision = state.detailRevision;
    const alreadyThere = state.detailPage.pageNo === target && (!pagination.pageNo || pagination.pageNo === target);
    if (!alreadyThere) {
      const control = pageControl(pagination, target);
      if (!control) throw new Error(`找不到第 ${target} 页的可用翻页按钮；剪贴板未改动`);
      control.click();
    }
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      checkBulkCopy(operation);
      const meta = state.detailPage;
      const currentPagination = paginationState();
      if ((alreadyThere || state.detailRevision > previousRevision) && meta.pageNo === target) {
        if (meta.error) throw new Error(`第 ${target} 页加载失败；请在罗盘页面确认后重试，剪贴板未改动`);
        if ((meta.total && meta.total !== operation.total) ||
            (currentPagination.total && currentPagination.total !== operation.total) || meta.pageSize !== operation.pageSize)
          throw new Error('列表总条数或每页条数已变化，请重新复制；剪贴板未改动');
        const expectedRows = Math.min(operation.pageSize, operation.total - (target - 1) * operation.pageSize);
        if (meta.rawCount !== expectedRows || state.detailItems.length !== expectedRows)
          throw new Error(`第 ${target} 页应有 ${expectedRows} 条，仅识别 ${state.detailItems.length} 条有效链接；剪贴板未改动`);
        const rows = detailRows();
        if ((!currentPagination.pageNo || currentPagination.pageNo === target) && rows.length === expectedRows &&
            rows.every((row, index) => !!resolveDetail(row, index))) {
          // A fresh response identifies the page even when all IDs repeat across two pages.
          return detailLinks(state.detailItems);
        }
      }
      await bulkDelay(100);
    }
    throw new Error(`第 ${target} 页等待超时，未复制不完整的列表；请重试`);
  };
  const copyEntireDetailList = async () => {
    if (state.bulkCopy) { state.bulkCopy.cancelled = true; return; }
    const meta = state.detailPage;
    const total = detailTotal();
    if (!meta?.pageNo || !meta.pageSize || !total) {
      toast('尚未识别完整分页信息，请在短视频列表翻一页后重试', true);
      return;
    }
    const operation = { contextKey: meta.contextKey, href: location.href, total,
      pageSize: meta.pageSize, count: 0, cancelled: false, error: '' };
    state.bulkCopy = operation;
    updatePanel('detail');
    try {
      const links = [];
      const pages = Math.ceil(total / meta.pageSize);
      for (let pageNo = 1; pageNo <= pages; pageNo += 1) {
        links.push(...await visitDetailPage(operation, pageNo));
        operation.count = links.length;
        updatePanel('detail');
        // Sequential native pagination; no direct/replayed requests or modified access parameters.
        if (pageNo < pages) await bulkDelay(350);
      }
      checkBulkCopy(operation);
      if (links.length !== total) throw new Error(`应有 ${total} 条，实际收集 ${links.length} 条，请重试`);
      await copyText(links.join('\n'));
      toast(`已复制全部 ${links.length} 条视频链接（保留重复，按页面顺序）`);
    } catch (error) {
      toast(error?.message || '全部复制失败，请重试', true);
    } finally {
      state.bulkCopy = null;
      if (isDetailVideoPage()) updatePanel('detail');
    }
  };
  // User interaction outside this toolbar stops automation before the next page.
  document.addEventListener('pointerdown', event => {
    if (state.bulkCopy && event.isTrusted && !event.target.closest?.(`#${PANEL_ID}`))
      state.bulkCopy.cancelled = true;
  }, true);
  document.addEventListener('change', event => {
    if (state.bulkCopy && event.isTrusted && !event.target.closest?.(`#${PANEL_ID}`))
      state.bulkCopy.cancelled = true;
  }, true);
  const panelAnchor = mode => {
    const rows = mode === 'product' ? productRows() : mode === 'talent' ? talentRows() : detailRows();
    const firstRow = rows[0];
    return firstRow?.closest('table,[role="table"]') ||
      Array.from(document.querySelectorAll('table,[role="table"]')).find(isVisible) || null;
  };
  const ensureViewportFitStyle = () => {
    let style = document.getElementById(FIT_STYLE_ID);
    if (style) return style;
    style = document.createElement('style');
    style.id = FIT_STYLE_ID;
    style.textContent = `
      html,body{max-width:100%!important;overflow-x:hidden!important}
      [data-chuangbao-fit-rank-table]{width:100%!important;min-width:0!important;max-width:100%!important;table-layout:fixed!important}
      [data-chuangbao-fit-rank-table] th,[data-chuangbao-fit-rank-table] td,
      [data-chuangbao-fit-rank-table] [role="columnheader"],[data-chuangbao-fit-rank-table] [role="cell"]{min-width:0!important;box-sizing:border-box!important}
      [data-chuangbao-fit-rank-table] th>*:not([data-chuangbao-action-host]),
      [data-chuangbao-fit-rank-table] td>*:not([data-chuangbao-action-host]),
      [data-chuangbao-fit-rank-table] [role="cell"]>*:not([data-chuangbao-action-host]){max-width:100%!important}
      [data-chuangbao-fit-rank-table] th:last-child,[data-chuangbao-fit-rank-table] td:last-child,
      [data-chuangbao-fit-rank-table] [role="columnheader"]:last-child,[data-chuangbao-fit-rank-table] [role="cell"]:last-child{width:228px!important;max-width:228px!important}
      [data-chuangbao-operation-surface],
      [data-chuangbao-fit-rank-table] [data-chuangbao-action-cell]{
        background:transparent!important;
        background-color:transparent!important;
        background-image:none!important;
        box-shadow:none!important;
        backdrop-filter:none!important;
        -webkit-backdrop-filter:none!important;
        pointer-events:none!important;
      }
      [data-chuangbao-operation-surface]::before,[data-chuangbao-operation-surface]::after,
      [data-chuangbao-fit-rank-table] [data-chuangbao-action-cell]::before,
      [data-chuangbao-fit-rank-table] [data-chuangbao-action-cell]::after{
        background:transparent!important;
        background-image:none!important;
        box-shadow:none!important;
      }
      [data-chuangbao-operation-surface]>:not(a):not(button):not(input):not(select):not(textarea):not([role="button"]):not([data-chuangbao-action-host]),
      [data-chuangbao-fit-rank-table] [data-chuangbao-action-cell]>:not(a):not(button):not(input):not(select):not(textarea):not([role="button"]):not([data-chuangbao-action-host]){
        background-color:transparent!important;
        background-image:none!important;
        box-shadow:none!important;
      }
      [data-chuangbao-operation-surface] a,[data-chuangbao-operation-surface] button,
      [data-chuangbao-operation-surface] input,[data-chuangbao-operation-surface] select,
      [data-chuangbao-operation-surface] textarea,[data-chuangbao-operation-surface] [role="button"],
      [data-chuangbao-operation-surface] [data-chuangbao-action-host],
      [data-chuangbao-fit-rank-table] [data-chuangbao-action-cell] a,
      [data-chuangbao-fit-rank-table] [data-chuangbao-action-cell] button,
      [data-chuangbao-fit-rank-table] [data-chuangbao-action-cell] input,
      [data-chuangbao-fit-rank-table] [data-chuangbao-action-cell] select,
      [data-chuangbao-fit-rank-table] [data-chuangbao-action-cell] textarea,
      [data-chuangbao-fit-rank-table] [data-chuangbao-action-cell] [role="button"],
      [data-chuangbao-fit-rank-table] [data-chuangbao-action-cell] [data-chuangbao-action-host],
      [data-chuangbao-action-host] *{pointer-events:auto!important}
      [data-chuangbao-fit-rank-table] [data-chuangbao-action-cell] > [data-chuangbao-native-action-shell],
      [data-chuangbao-fit-rank-table] [data-chuangbao-action-cell] [data-chuangbao-native-row-action]{display:none!important}
    `;
    (document.head || document.documentElement).appendChild(style);
    return style;
  };
  const columnWidth = label => {
    if (/^(?:排名|名次)$/.test(label)) return 56;
    if (/操作/.test(label)) return 228;
    if (/短视频信息/.test(label)) return 330;
    if (/带货短视频|关联视频|视频素材/.test(label)) return 250;
    if (/^(?:商品|商品信息)$/.test(label)) return 286;
    if (/店铺名称|达人名称/.test(label)) return 176;
    if (/用户支付金额|成交金额/.test(label)) return 138;
    if (/商品成交人数/.test(label)) return 120;
    if (/商品点击率/.test(label)) return 124;
    if (/商品成交订单数/.test(label)) return 124;
    if (/点击次数|成交件数|销量/.test(label)) return 94;
    if (/发布时间|上榜时间/.test(label)) return 94;
    return 0;
  };
  const fitRankTable = mode => {
    const table = panelAnchor(mode);
    if (!table) return;
    ensureViewportFitStyle();
    table.setAttribute('data-chuangbao-fit-rank-table', '1');
    const headers = Array.from(table.querySelectorAll('thead th,[role="columnheader"]'));
    const columns = Array.from(table.querySelectorAll(':scope > colgroup > col'));
    headers.forEach((header, index) => {
      const label = normalizedText(header.textContent);
      const width = columnWidth(label);
      if (!width) return;
      header.style.setProperty('width', `${width}px`, 'important');
      header.style.setProperty('max-width', `${width}px`, 'important');
      if (/操作/.test(label)) header.setAttribute('data-chuangbao-operation-surface', '1');
      if (columns[index]) columns[index].style.setProperty('width', `${width}px`, 'important');
      for (const row of table.querySelectorAll('tbody tr,[role="row"]')) {
        const cells = row.querySelectorAll(':scope > td,:scope > [role="cell"]');
        const cell = cells[index];
        if (!cell) continue;
        cell.style.setProperty('width', `${width}px`, 'important');
        cell.style.setProperty('max-width', `${width}px`, 'important');
        if (/操作/.test(label)) cell.setAttribute('data-chuangbao-operation-surface', '1');
      }
    });
    let ancestor = table.parentElement;
    while (ancestor && ancestor !== document.body && ancestor !== document.documentElement) {
      ancestor.setAttribute('data-chuangbao-fit-rank-scroll-host', '1');
      ancestor.style.setProperty('min-width', '0', 'important');
      ancestor.style.setProperty('max-width', '100%', 'important');
      ancestor.style.setProperty('overflow-x', 'hidden', 'important');
      if (ancestor.scrollLeft) ancestor.scrollLeft = 0;
      ancestor = ancestor.parentElement;
    }
    const scrolling = document.scrollingElement;
    if (scrolling && scrolling.scrollLeft) scrolling.scrollLeft = 0;
  };
  const compactCompassChrome = () => {
    if (!/^(?:[^.]+\.)*compass\.jinritemai\.com$/i.test(location.hostname || '')) return;

    if (document.querySelector('[data-chuangbao-duplicate-compass-sidebar="1"]')) return;
    const sidebarCandidate = Array.from(document.querySelectorAll('aside,nav,div')).find(element => {
      if (!isVisible(element)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.left > 320 || rect.width < 105 || rect.width > 260 || rect.height < 300) return false;
      const text = normalizedText(element.textContent);
      const menuSignals = ['店铺榜单', '商品榜单', '内容榜单', '搜索榜单', '达人榜单', '类目概览'];
      return menuSignals.filter(signal => text.includes(signal)).length >= 3;
    });
    if (sidebarCandidate) {
      let sidebar = sidebarCandidate;
      while (sidebar.parentElement && sidebar.parentElement !== document.body) {
        const parentRect = sidebar.parentElement.getBoundingClientRect();
        if (parentRect.width > 280 || parentRect.height < 300) break;
        sidebar = sidebar.parentElement;
      }
      sidebar.setAttribute('data-chuangbao-duplicate-compass-sidebar', '1');
      sidebar.style.setProperty('display', 'none', 'important');
      const layout = sidebar.parentElement;
      if (layout) {
        for (const sibling of layout.children) {
          if (sibling === sidebar) continue;
          const rect = sibling.getBoundingClientRect();
          if (rect.width < 420) continue;
          sibling.style.setProperty('min-width', '0', 'important');
          sibling.style.setProperty('max-width', '100%', 'important');
          sibling.style.setProperty('width', '100%', 'important');
          sibling.style.setProperty('margin-left', '0', 'important');
        }
      }
    }

    const table = panelAnchor(isTalentPage() ? 'talent' : 'product');
    const wideScrollHosts = [document.documentElement, document.body, document.scrollingElement];
    let ancestor = table && table.parentElement;
    while (ancestor && ancestor !== document.body && ancestor !== document.documentElement) {
      wideScrollHosts.push(ancestor);
      ancestor = ancestor.parentElement;
    }
    for (const element of wideScrollHosts) {
      if (!element) continue;
      element.style.setProperty('min-width', '0', 'important');
      element.style.setProperty('max-width', '100%', 'important');
      element.style.setProperty('overflow-x', 'hidden', 'important');
      if (element.scrollLeft) element.scrollLeft = 0;
    }
  };
  const releaseViewportFit = () => {
    document.getElementById(FIT_STYLE_ID)?.remove();
    for (const element of document.querySelectorAll('[data-chuangbao-fit-rank-table]')) {
      for (const cell of element.querySelectorAll('col,th,td,[role="columnheader"],[role="cell"]')) {
        cell.style.removeProperty('width');
        cell.style.removeProperty('max-width');
        cell.removeAttribute('data-chuangbao-operation-surface');
      }
      element.removeAttribute('data-chuangbao-fit-rank-table');
    }
    for (const element of document.querySelectorAll('[data-chuangbao-fit-rank-scroll-host]')) {
      element.removeAttribute('data-chuangbao-fit-rank-scroll-host');
      element.style.removeProperty('min-width');
      element.style.removeProperty('max-width');
      element.style.removeProperty('overflow-x');
    }
  };
  const mountPanelInline = (panel, mode) => {
    const anchor = panelAnchor(mode);
    if (anchor?.parentElement && panel.parentElement !== anchor.parentElement)
      anchor.parentElement.insertBefore(panel, anchor);
    else if (anchor?.parentElement && panel.nextSibling !== anchor)
      anchor.parentElement.insertBefore(panel, anchor);
    else if (!panel.isConnected)
      (document.body || document.documentElement).appendChild(panel);
  };
  const panelItems = mode => {
    const items = currentRowItems(mode);
    return mode === 'detail'
      ? items.filter(item => state.selectedDetailRowKeys.has(item.rowKey))
      : items;
  };
  const createPanel = mode => {
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = PANEL_ID;
      panel.setAttribute('aria-label', '创爆榜单视频复制工具');
      Object.assign(panel.style, {
        position: 'relative', zIndex: '3', width: 'calc(100% - 2px)', minHeight: '62px',
        display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap',
        margin: '12px 1px 10px', padding: '9px 14px', overflow: 'visible',
        border: '1px solid #b9d3ff', borderRadius: '8px',
        background: 'linear-gradient(90deg,#f7fbff 0%,#f1f7ff 100%)',
        boxShadow: '0 2px 8px rgba(23,105,255,.06)', color: '#17233d',
        fontFamily: "'Microsoft YaHei','Segoe UI',sans-serif", boxSizing: 'border-box', containerType: 'inline-size'
      });
      const title = document.createElement('div');
      title.setAttribute('data-title', '1');
      Object.assign(title.style, { color: '#1769ff', fontSize: '14px', fontWeight: '800', whiteSpace: 'nowrap' });
      const body = document.createElement('div');
      body.setAttribute('data-panel-body', '1');
      Object.assign(body.style, { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', rowGap: '8px', flex: '1 1 720px', minWidth: '0', flexWrap: 'wrap' });
      const actions = document.createElement('div');
      actions.setAttribute('data-panel-actions', '1');
      actions.style.display = 'contents';
      const layoutStyle = document.createElement('style');
      layoutStyle.textContent = `
        #${PANEL_ID}[data-mode="detail"]{display:grid!important;grid-template-columns:auto minmax(0,1fr);gap:10px 16px!important;padding:12px 14px!important}
        #${PANEL_ID}[data-mode="detail"] [data-panel-body]{display:contents!important}
        #${PANEL_ID}[data-mode="detail"] [data-title]{grid-column:1;grid-row:1;align-self:center}
        #${PANEL_ID}[data-mode="detail"] [data-status]{grid-column:2;grid-row:1;min-width:0!important;align-self:center}
        #${PANEL_ID}[data-mode="detail"] [data-panel-actions]{display:grid!important;grid-column:1/-1;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
        #${PANEL_ID}[data-mode="detail"] [data-panel-actions]>button,
        #${PANEL_ID}[data-mode="detail"] [data-select-all-wrap]{min-width:0!important;width:100%;margin:0!important;padding:0 10px!important;white-space:nowrap;box-sizing:border-box}
        @container (max-width:740px){
          #${PANEL_ID}[data-mode="detail"] [data-panel-actions]{grid-template-columns:repeat(6,minmax(0,1fr))}
          #${PANEL_ID}[data-mode="detail"] [data-panel-actions]>*{grid-column:span 2}
          #${PANEL_ID}[data-mode="detail"] [data-download-all],
          #${PANEL_ID}[data-mode="detail"] [data-send-all]{grid-column:span 3}
        }
      `;
      const status = document.createElement('div');
      status.setAttribute('data-status', '1');
      Object.assign(status.style, { color: '#64748b', fontSize: '12px', lineHeight: '1.55', flex: '1 1 260px', minWidth: '180px' });
      const selectAllLabel = document.createElement('label');
      selectAllLabel.setAttribute('data-select-all-wrap', '1');
      Object.assign(selectAllLabel.style, { display: 'none', alignItems: 'center', justifyContent: 'center', gap: '8px', flex: '0 0 auto', minWidth: '160px', height: '38px', padding: '0 16px', border: '1px solid #7eafff', borderRadius: '8px', background: '#fff', color: '#1769ff', fontSize: '13px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap', boxSizing: 'border-box' });
      const selectAll = document.createElement('input');
      selectAll.type = 'checkbox';
      selectAll.setAttribute('data-select-all', '1');
      Object.assign(selectAll.style, { width: '18px', height: '18px', margin: '0', accentColor: '#1769ff', cursor: 'pointer', flex: '0 0 18px' });
      const selectAllCaption = document.createElement('span');
      selectAllCaption.textContent = '全选本页';
      selectAll.addEventListener('change', event => {
        event.stopPropagation();
        if (panel.dataset.mode !== 'detail') return;
        state.detailSelectionTouched = true;
        const keys = currentRowItems('detail').map(item => item.rowKey);
        if (selectAll.checked) keys.forEach(key => state.selectedDetailRowKeys.add(key));
        else keys.forEach(key => state.selectedDetailRowKeys.delete(key));
        detailRows().forEach((row, index) => attachDetailSelection(row, resolveDetail(row, index)));
        updatePanel('detail');
      });
      selectAllLabel.addEventListener('click', event => event.stopPropagation());
      selectAllLabel.append(selectAll, selectAllCaption);
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('data-copy-all', '1');
      Object.assign(button.style, { flex: '0 0 auto', minWidth: '160px', height: '38px', padding: '0 16px', border: '1px solid #7eafff', borderRadius: '8px', background: '#fff', color: '#1769ff', cursor: 'pointer', fontSize: '13px', fontWeight: '700' });
      button.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        const activeMode = panel.dataset.mode;
        const selected = panelItems(activeMode);
        const links = activeMode === 'detail' ? detailLinks(selected) : videoLinks(selected.flatMap(item => item.videoIds));
        if (!links.length) {
          toast('当前页尚无可复制的视频数据', true);
          return;
        }
        try {
          await copyText(links.join('\n'));
          toast(activeMode === 'detail' ? `已复制所选 ${links.length} 条视频链接（保留重复）` : `已复制当前页 ${links.length} 条去重视频链接`);
        } catch (error) {
          toast(error && error.message ? error.message : '复制失败，请重试', true);
        }
      });
      const entireButton = document.createElement('button');
      entireButton.type = 'button';
      entireButton.setAttribute('data-copy-entire', '1');
      entireButton.style.cssText = button.style.cssText;
      entireButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (panel.dataset.mode === 'detail') void copyEntireDetailList();
      });
      const downloadButton = document.createElement('button');
      downloadButton.type = 'button';
      downloadButton.setAttribute('data-download-all', '1');
      downloadButton.textContent = '批量下载';
      Object.assign(downloadButton.style, { flex: '0 0 auto', minWidth: '132px', height: '38px', padding: '0 16px', border: '1px solid #13a765', borderRadius: '8px', background: '#13a765', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '700' });
      downloadButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const activeMode = panel.dataset.mode;
        const items = panelItems(activeMode);
        const links = videoLinks(items.flatMap(item => item.videoIds));
        downloadVideos(
          activeMode,
          activeMode === 'detail' ? 'selected' : 'page',
          activeMode === 'product' ? '当前页商品榜单 TOP10 视频' :
            activeMode === 'talent' ? '当前页视频达人榜' : '商品详情视频分析所选短视频',
          links);
      });
      const sendButton = document.createElement('button');
      sendButton.type = 'button';
      sendButton.setAttribute('data-send-all', '1');
      sendButton.textContent = '批量送入一刀不剪';
      Object.assign(sendButton.style, { flex: '0 0 auto', minWidth: '176px', height: '38px', padding: '0 16px', border: '1px solid #1769ff', borderRadius: '8px', background: '#1769ff', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '700' });
      sendButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const activeMode = panel.dataset.mode;
        const items = panelItems(activeMode);
        const links = videoLinks(items.flatMap(item => item.videoIds));
        sendToOneCut(
          activeMode,
          activeMode === 'detail' ? 'selected' : 'page',
          activeMode === 'product' ? '当前页商品榜单 TOP10 视频' :
            activeMode === 'talent' ? '当前页视频达人榜' : '商品详情视频分析所选短视频',
          links);
      });
      actions.append(selectAllLabel, button, entireButton, downloadButton, sendButton);
      body.append(status, actions);
      panel.append(layoutStyle, title, body);
    }
    panel.dataset.mode = mode;
    mountPanelInline(panel, mode);
    return panel;
  };
  const updatePanel = mode => {
    const panel = createPanel(mode);
    const items = currentRowItems(mode);
    const selectedItems = panelItems(mode);
    const links = videoLinks(selectedItems.flatMap(item => item.videoIds));
    const copyCount = mode === 'detail' ? selectedItems.length : links.length;
    const bulk = state.bulkCopy;
    panel.querySelector('[data-title]').textContent = mode === 'product'
      ? '商品榜单 · TOP10 视频'
      : mode === 'talent' ? '视频达人榜 · 视频链接' : '视频分析 · 短视频批量下载';
    panel.querySelector('[data-status]').textContent = mode === 'detail'
      ? bulk ? `正在收集 ${bulk.count}/${bulk.total} 条 · 请勿切换商品或筛选条件`
        : `本页已识别 ${items.length} 条视频 · 已选择 ${copyCount} 条（复制保留重复）`
      : `本页已关联 ${items.length} ${mode === 'product' ? '个商品' : '位达人'} · ${links.length} 条去重视频`;
    const selectAllWrap = panel.querySelector('[data-select-all-wrap]');
    const selectAll = panel.querySelector('[data-select-all]');
    selectAllWrap.style.display = mode === 'detail' ? 'inline-flex' : 'none';
    if (mode === 'detail') {
      const selectableIds = items.map(item => item.rowKey);
      const selectedVisibleCount = selectableIds.filter(id => state.selectedDetailRowKeys.has(id)).length;
      selectAll.checked = selectableIds.length > 0 && selectedVisibleCount === selectableIds.length;
      selectAll.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < selectableIds.length;
      selectAll.disabled = selectableIds.length === 0 || !!bulk;
      Object.assign(selectAllWrap.style, {
        borderColor: selectableIds.length ? '#7eafff' : '#d6deea',
        background: selectableIds.length ? '#fff' : '#f5f7fa',
        color: selectableIds.length ? '#1769ff' : '#9ca9bb',
        cursor: selectableIds.length ? 'pointer' : 'not-allowed'
      });
    }
    const button = panel.querySelector('[data-copy-all]');
    button.textContent = mode === 'product' ? '复制本页商品视频' : mode === 'talent' ? '复制本页达人视频' : `复制所选 (${copyCount})`;
    button.disabled = copyCount === 0 || !!bulk;
    Object.assign(button.style, { borderColor: links.length ? '#7eafff' : '#d6deea', background: links.length ? '#fff' : '#f5f7fa', color: links.length ? '#1769ff' : '#9ca9bb', cursor: links.length ? 'pointer' : 'not-allowed' });
    const entireButton = panel.querySelector('[data-copy-entire]');
    entireButton.style.display = mode === 'detail' ? '' : 'none';
    const total = mode === 'detail' ? detailTotal() : 0;
    entireButton.textContent = bulk ? `取消复制 (${bulk.count}/${bulk.total})` : total ? `复制全部链接 (${total})` : '复制全部链接';
    entireButton.disabled = !bulk && (!total || !state.detailPage?.pageNo || !state.detailPage?.pageSize);
    entireButton.title = '按当前商品和筛选条件逐页收集，保留重复链接；完成后一次复制';
    const downloadButton = panel.querySelector('[data-download-all]');
    downloadButton.textContent = mode === 'detail' ? `批量下载 (${links.length})` : `批量下载 (${links.length})`;
    downloadButton.disabled = links.length === 0 || !!bulk;
    Object.assign(downloadButton.style, { borderColor: links.length ? '#13a765' : '#d6deea', background: links.length ? '#13a765' : '#f5f7fa', color: links.length ? '#fff' : '#9ca9bb', cursor: links.length ? 'pointer' : 'not-allowed' });
    const sendButton = panel.querySelector('[data-send-all]');
    sendButton.textContent = mode === 'detail' ? '所选送入一刀不剪' : '批量送入一刀不剪';
    sendButton.disabled = links.length === 0 || !!bulk;
    Object.assign(sendButton.style, { borderColor: links.length ? '#1769ff' : '#d6deea', background: links.length ? '#1769ff' : '#f5f7fa', color: links.length ? '#fff' : '#9ca9bb', cursor: links.length ? 'pointer' : 'not-allowed' });
  };
  const removePanel = () => document.getElementById(PANEL_ID)?.remove();
  const scan = () => {
    if (isProductPage()) {
      compactCompassChrome();
      const rows = productRows();
      if (isProductOverview()) {
        rows.forEach(removeProductVideoActions);
        removePanel();
        showOverviewGuide();
      } else {
        removeOverviewGuide();
        rows.forEach((row, index) => {
          attachRowButton(row, resolveProduct(row, index), 'product');
          attachProductInsightButton(row);
        });
        updatePanel('product');
      }
      fitRankTable('product');
      window.requestAnimationFrame(() => fitRankTable('product'));
      return;
    }
    removeOverviewGuide();
    if (isTalentPage()) {
      compactCompassChrome();
      const rows = talentRows();
      rows.forEach((row, index) => attachRowButton(row, resolveTalent(row, index), 'talent'));
      updatePanel('talent');
      fitRankTable('talent');
      window.requestAnimationFrame(() => fitRankTable('talent'));
      return;
    }
    if (isDetailVideoPage()) {
      const rows = detailRows();
      rows.forEach((row, index) => {
        attachDetailSelection(row, resolveDetail(row, index));
        hideDetailRowActions(row);
      });
      updatePanel('detail');
      fitRankTable('detail');
      window.requestAnimationFrame(() => fitRankTable('detail'));
      return;
    }
    releaseViewportFit();
    removePanel();
  };

  const api = {
    applyEnvelope,
    rescan: scan,
    videoLinks,
    snapshot: () => ({
      products: state.productItems.map(item => ({ ...item, videoIds: item.videoIds.slice() })),
      talents: state.talentItems.map(item => ({ ...item, videoIds: item.videoIds.slice() })),
      details: state.detailItems.map(item => ({ ...item, videoIds: item.videoIds.slice() })),
      selectedDetailVideoIds: state.detailItems.filter(item => state.selectedDetailRowKeys.has(item.rowKey)).map(item => item.videoId),
      lastMode: state.lastMode,
      lastGroupCount: state.lastGroupCount,
      lastVideoCount: state.lastVideoCount
    })
  };
  Object.defineProperty(window, '__CHUANGBAO_RANK_VIDEO_V1__', {
    value: api,
    configurable: false,
    enumerable: false,
    writable: false
  });

  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    applyEnvelope(event.data);
  }, false);
  if (window.chrome?.webview && typeof window.chrome.webview.addEventListener === 'function') {
    window.chrome.webview.addEventListener('message', event => applyEnvelope(event.data));
  }
  const observer = new MutationObserver(scheduleScan);
  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['aria-selected']
    });
    scheduleScan();
  } else {
    document.addEventListener('readystatechange', scheduleScan, { once: true });
  }
  window.addEventListener('popstate', scheduleScan);
  window.addEventListener('hashchange', scheduleScan);
  window.addEventListener('resize', scheduleScan);
  window.setInterval(scheduleScan, 1400);
})();

;/* BEGIN selection recovered data service */
(async () => {
  'use strict';

  const request = null;
  const host = String(location.hostname || '').toLowerCase();
  if (window.top !== window || (host !== 'compass.jinritemai.com' && !host.endsWith('.compass.jinritemai.com')))
    return JSON.stringify({ status: 'unsupported-page', successCount: 0, failedCount: 5 });

  const stateKey = '__CHUANGBAO_COMPASS_MAPPING_V2__';
  if (!window[stateKey]) {
    const basicPath = '/compass_api/shop/product/compete_product_detail/basic_info';
    const corePath = '/compass_api/shop/product/compete_product_detail/core_index';
    const mappedAttribute = 'data-chuangbao-mapping-status';
    const modalId = 'chuangbao-compass-mapping-modal';

    const numberValue = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
    const textValue = value => value == null ? '' : String(value).trim();
    const compact = value => {
      if (!Number.isFinite(value)) return '-';
      if (Math.abs(value) >= 100000000) return `${Number((value / 100000000).toFixed(2))}亿`;
      if (Math.abs(value) >= 10000) return `${Number((value / 10000).toFixed(1))}万`;
      return Number(value).toLocaleString('zh-CN');
    };
    const formatted = (value, unit) => {
      if (!Number.isFinite(value)) return '-';
      if (unit === 'ratio') return `${Number((value * 100).toFixed(2))}%`;
      if (unit === 'price') return `¥${compact(value / 100)}`;
      return compact(value);
    };
    const metric = node => {
      const lower = numberValue(node && node.extra_value && node.extra_value.lower && node.extra_value.lower.value);
      const upper = numberValue(node && node.extra_value && node.extra_value.upper && node.extra_value.upper.value);
      const direct = numberValue(node && node.value && node.value.value);
      const unit = node && node.extra_value && node.extra_value.lower && node.extra_value.lower.unit ||
        node && node.value && node.value.unit || 'number';
      if (lower === null && upper === null) return direct === null ? '-' : formatted(direct, unit);
      if (lower !== null && (upper === null || upper < 0)) return `${formatted(lower, unit)}+`;
      if (lower === null) return formatted(upper, unit);
      return `${formatted(lower, unit)}-${formatted(upper, unit).replace(/^¥/, '')}`;
    };
    const nestedRaw = value => {
      let current = value;
      for (let depth = 0; depth < 3; depth += 1) {
        if (!current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, 'value')) break;
        current = current.value;
      }
      return current;
    };
    const formatDate = date => `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} 00:00:00`;
    const defaultDateRange = () => {
      const end = new Date();
      end.setDate(end.getDate() - 1);
      end.setHours(0, 0, 0, 0);
      const begin = new Date(end);
      begin.setDate(begin.getDate() - 6);
      return { beginDate: formatDate(begin), endDate: formatDate(end), dateType: '21', source: 'default' };
    };
    let latestRankRequest = '';
    if (typeof PerformanceObserver !== 'undefined') {
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (String(entry.name).includes('/compass_api/shop/product/product_rank/') &&
              new URL(entry.name, location.href).searchParams.has('begin_date')) latestRankRequest = entry.name;
        }
      });
      observer.observe({ type: 'resource', buffered: true });
    }
    const currentDateRange = () => {
      const result = defaultDateRange();
      const apply = (value, source) => {
        try {
          const url = new URL(value, location.href);
          const begin = url.searchParams.get('begin_date');
          const end = url.searchParams.get('end_date');
          if (!/^\d{4}\/\d{2}\/\d{2} 00:00:00$/.test(begin || '') ||
              !/^\d{4}\/\d{2}\/\d{2} 00:00:00$/.test(end || '')) return;
          Object.assign(result, { beginDate: begin, endDate: end,
            dateType: url.searchParams.get('date_type') || result.dateType, source });
        } catch (_error) {}
      };
      // Only ranking requests supply context. Old detail requests must never
      // override the date range currently selected on the ranking page.
      for (const entry of performance.getEntriesByType('resource')) {
        if (String(entry.name).includes('/compass_api/shop/product/product_rank/'))
          apply(entry.name, 'platform-request');
      }
      if (latestRankRequest) apply(latestRankRequest, 'platform-request');
      apply(location.href, 'page');
      const dateRoot = document.querySelector('[data-cba-date-context]');
      const visible = String(dateRoot ? dateRoot.textContent : document.body?.innerText || '').match(
        /(\d{4})[/-](\d{2})[/-](\d{2})\s*(?:-|–|—|~|至)\s*(\d{4})[/-](\d{2})[/-](\d{2})/);
      if (visible) {
        const beginDate = `${visible[1]}/${visible[2]}/${visible[3]} 00:00:00`;
        const endDate = `${visible[4]}/${visible[5]}/${visible[6]} 00:00:00`;
        if (beginDate !== result.beginDate || endDate !== result.endDate) {
          const days = Math.round((Date.parse(endDate) - Date.parse(beginDate)) / 86400000) + 1;
          result.dateType = days === 1 ? '20' : days === 30 ? '23' : '21';
        }
        Object.assign(result, { beginDate, endDate, source: 'page' });
      }
      return result;
    };
    const buildCoreUrl = (productId, range, contentType, indexes) => {
      const url = new URL(corePath, location.origin);
      const params = {
        product_id: productId,
        end_date: range.endDate,
        begin_date: range.beginDate,
        sale_type: '0',
        content_type: contentType,
        activity_id: '',
        index_selected: indexes,
        date_type: range.dateType
      };
      Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
      return url.toString();
    };
    const buildBasicUrl = productId => {
      const url = new URL(basicPath, location.origin);
      url.searchParams.set('product_id', productId);
      return url.toString();
    };
    const CACHE_FRESH_MS = 5 * 60 * 1000;
    const quotaErrorText = value => /详情页访问次数超限|额度不足|配额不足|600002/.test(String(value || ''));
    const pauseStorageKey = 'cba_detail_request_pause_v2';
    let pauseState = null;
    const readPause = () => {
      try {
        const stored = JSON.parse(sessionStorage.getItem(pauseStorageKey) || 'null');
        if (stored && ['quota', 'rate'].includes(stored.kind) && Number.isFinite(stored.until) &&
            stored.until > Date.now() && (!pauseState || stored.until > pauseState.until)) pauseState = stored;
      } catch (_) {}
      if (pauseState && pauseState.until <= Date.now()) pauseState = null;
      return pauseState;
    };
    const pauseMessage = state => state.kind === 'quota'
      ? '抖音已限制详情页访问（600002）。已暂停后续详情请求；恢复时间以平台为准。'
      : '平台请求过于频繁（HTTP 429）。已暂停后续请求，请稍后再试。';
    const pausedError = state => Object.assign(new Error(pauseMessage(state)), {
      limited: true, retryAfterMs: Math.max(0, state.until - Date.now()), kind: state.kind
    });
    const markLimited = error => {
      const kind = quotaErrorText(error.message) ? 'quota' : error.httpStatus === 429 ? 'rate' : '';
      if (!kind) return;
      // These are local backoff intervals, never claims about the platform's reset time.
      const delay = Number.isFinite(error.retryAfterMs) && error.retryAfterMs > 0
        ? error.retryAfterMs : kind === 'quota' ? 30 * 60 * 1000 : 60 * 1000;
      const old = readPause();
      pauseState = { kind, until: Math.max(Date.now() + delay, old?.until || 0) };
      try { sessionStorage.setItem(pauseStorageKey, JSON.stringify(pauseState)); } catch (_) {}
      Object.assign(error, pausedError(pauseState));
      error.message = pauseMessage(pauseState);
    };
    let requestQueue = Promise.resolve();
    let lastRequestAt = 0;
    const pendingRequests = new Map();
    const fetchJson = (url, guard = () => {}, options = {}) => {
      if (pendingRequests.has(url)) return pendingRequests.get(url);
      // [创爆额度补丁 v6.1] ignorePause：flow_more（视频/直播列表）与详情数据
      // 接口分属不同额度域（天镜/拾贝实测），视频直连不读全局暂停、不设暂停。
      const ignorePause = !!(options && options.ignorePause);
      const job = requestQueue.then(async () => {
        guard();
        let paused = readPause();
        if (paused && !ignorePause) throw pausedError(paused);
        const delay = Math.max(0, 250 - (Date.now() - lastRequestAt));
        if (delay) await new Promise(resolve => window.setTimeout(resolve, delay));
        guard();
        paused = readPause();
        if (paused && !ignorePause) throw pausedError(paused);
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 20000);
        try {
          lastRequestAt = Date.now();
          const response = await fetch(url, {
            credentials: 'include', headers: { accept: 'application/json, text/plain, */*', 'agw-js-conv': 'str' },
            referrerPolicy: 'strict-origin-when-cross-origin', signal: controller.signal
          });
          const text = await response.text();
          guard();
          if (!response.ok) {
            const error = Object.assign(new Error('HTTP ' + response.status), { httpStatus: response.status });
            const retryAfter = response.headers?.get?.('Retry-After');
            if (response.status === 429 && retryAfter) error.retryAfterMs = /^\d+$/.test(retryAfter.trim())
              ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now());
            throw error;
          }
          let payload;
          try { payload = JSON.parse(text); } catch (_) { throw new Error('接口返回的不是 JSON 数据'); }
          const code = [payload?.code, payload?.st].find(value => value != null && Number(value) !== 0);
          if (code != null) throw new Error('平台返回错误码 ' + code + '：' + textValue(payload.msg || payload.message));
          return payload;
        } catch (error) {
          if (!ignorePause) markLimited(error);
          throw error;
        } finally { window.clearTimeout(timer); }
      });
      const tracked = job.finally(() => pendingRequests.delete(url));
      pendingRequests.set(url, tracked);
      requestQueue = tracked.catch(() => {});
      return tracked;
    };
    // Keep bounded snapshots in this document only. Old unscoped localStorage data
    // cannot establish the current shop or date range and is deliberately not replayed.
    const sectionCache = new Map();
    const sectionCacheKey = (productId, sectionKey, range) =>
      [productId, range.beginDate, range.endDate, range.dateType, sectionKey].join('|');
    const readSectionCache = (productId, sectionKey, range) =>
      sectionCache.get(sectionCacheKey(productId, sectionKey, range)) || null;
    const writeSectionCache = (productId, sectionKey, values, range) => {
      const key = sectionCacheKey(productId, sectionKey, range);
      sectionCache.delete(key);
      sectionCache.set(key, { values, time: Date.now(), ...range });
      while (sectionCache.size > 250) sectionCache.delete(sectionCache.keys().next().value);
    };
    const cacheRangeText = entry => entry && entry.beginDate && entry.endDate
      ? entry.beginDate.slice(0, 10) + ' 至 ' + entry.endDate.slice(0, 10) : '';
    const applyCacheToSection = (section, entry) => {
      Object.assign(section, { values: entry.values.slice(), ok: true, cached: true,
        cachedAt: entry.time, cachedRange: cacheRangeText(entry) });
    };
    // [创爆额度补丁 v5.9.2] 真实额度探测：权限接口（get_view_quota）的响应会被
    // 页面层的改写补丁整体替换（remaining_cnt=10），导致看不到服务器真实配额。
    // 这里借 about:blank iframe 的原生 responseText getter 读同一 XHR 实例的
    // 原始返回（改写补丁不在 iframe 中运行，其原型 getter 保持原生），
    // 用于确诊真实剩余次数 / 重置时间，探测本身不消耗详情额度。
    const quotaRealKey = 'cba_quota_real_v1';
    let nativeProbeTransport = null;
    const getNativeProbeTransport = () => {
      if (nativeProbeTransport) return nativeProbeTransport;
      try {
        const frame = document.createElement('iframe');
        frame.id = 'chuangbao-quota-probe-frame';
        frame.style.cssText = 'display:none;';
        document.documentElement.append(frame);
        const proto = frame.contentWindow.XMLHttpRequest.prototype;
        const textDesc = Object.getOwnPropertyDescriptor(proto, 'responseText');
        const statusDesc = Object.getOwnPropertyDescriptor(proto, 'status');
        if (!textDesc?.get || !statusDesc?.get) { frame.remove(); return null; }
        nativeProbeTransport = { frame, textGetter: textDesc.get, statusGetter: statusDesc.get };
        return nativeProbeTransport;
      } catch (_error) { return null; }
    };
    const nativeJsonProbe = (url, timeoutMs = 15000) => new Promise(resolve => {
      const transport = getNativeProbeTransport();
      if (!transport) { resolve({ error: '原生请求通道不可用' }); return; }
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url + (url.includes('?') ? '&' : '?') + '_cba_probe=' + Date.now(), true);
        xhr.withCredentials = true;
        xhr.timeout = timeoutMs;
        xhr.onload = () => {
          const out = {};
          try {
            out.httpStatus = transport.statusGetter.call(xhr);
            out.raw = String(transport.textGetter.call(xhr) || '').slice(0, 800);
            try { out.payload = JSON.parse(out.raw); } catch (_e) {}
          } catch (error) { out.error = String(error.message || error); }
          resolve(out);
        };
        xhr.onerror = () => resolve({ error: '网络错误' });
        xhr.ontimeout = () => resolve({ error: '请求超时' });
        xhr.send();
      } catch (error) { resolve({ error: String(error.message || error) }); }
    });
    const probeRealQuota = productId => {
      const pid = String(productId || '').trim();
      if (!/^\d{6,32}$/.test(pid)) return Promise.resolve({ error: 'invalid-product-id' });
      return Promise.all([
        nativeJsonProbe(`${location.origin}/compass_api/shop/common/competition/get_view_quota?real_competition_type=2&real_target_id=${encodeURIComponent(pid)}`),
        nativeJsonProbe(`${location.origin}/compass_api/shop/product/compete_product_detail/check_competitors_permission?target_ids=${encodeURIComponent(pid)}&competition_type=2`)
      ]).then(([quota, permission]) => {
        const result = { time: Date.now(), productId: pid, quota, permission };
        try { localStorage.setItem(quotaRealKey, JSON.stringify(result)); } catch (_error) {}
        window.dispatchEvent(new CustomEvent('chuangbao:quota-probed', { detail: result }));
        return result;
      });
    };
    const readRealQuota = () => {
      try {
        const raw = localStorage.getItem(quotaRealKey);
        if (!raw) return null;
        const entry = JSON.parse(raw);
        return entry && entry.time && Date.now() - entry.time < 10 * 60 * 1000 ? entry : null;
      } catch (_error) { return null; }
    };
    const pair = (label, value) => ({ label, value: textValue(value) || '-' });
    const parseCommerce = payload => {
      const metrics = payload && payload.data && payload.data[0] && payload.data[0].metrics;
      if (!metrics) throw new Error('未返回核心指标');
      return [
        pair('成交额', metric(metrics.pay_amt)),
        pair('订单数', metric(metrics.pay_cnt)),
        pair('浏览量', metric(metrics.dh_product_show_uv)),
        pair('成交人数', metric(metrics.pay_ucnt)),
        pair('点击率', metric(metrics.dh_product_click_pv_ratio_uv))
      ];
    };
    const parseLive = payload => {
      const metrics = payload && payload.data && payload.data[0] && payload.data[0].metrics;
      if (!metrics) throw new Error('未返回直播核心指标');
      return [
        pair('直播场次', metric(metrics.live_room_cnt)),
        pair('带货达人', metric(metrics.live_author_cnt)),
        pair('成交额', metric(metrics.pay_amt)),
        pair('成交件数', metric(metrics.pay_combo_cnt)),
        pair('订单数', metric(metrics.pay_cnt))
      ];
    };
    const parseVideo = payload => {
      const metrics = payload && payload.data && payload.data[0] && payload.data[0].metrics;
      if (!metrics) throw new Error('未返回视频核心指标');
      return [
        pair('带货视频', metric(metrics.video_cnt)),
        pair('带货达人', metric(metrics.video_author_cnt)),
        pair('成交额', metric(metrics.pay_amt)),
        pair('成交件数', metric(metrics.pay_combo_cnt)),
        pair('订单数', metric(metrics.pay_cnt))
      ];
    };
    const parseCategory = value => {
      if (!Array.isArray(value)) return '-';
      const parts = value.map(item => {
        if (typeof item === 'string') return item.trim();
        if (!item || typeof item !== 'object') return '';
        return textValue(item.name || item.cname || item.category_name || item.value);
      }).filter(Boolean);
      return parts.length ? parts.join(' > ') : '-';
    };
    const parseShelfTime = value => {
      const raw = nestedRaw(value);
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        const timestamp = raw > 100000000000 ? raw : raw * 1000;
        return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
      }
      return textValue(raw) || '-';
    };
    const parseBadRate = value => {
      const raw = nestedRaw(value);
      if (typeof raw === 'number' && Number.isFinite(raw))
        return `${Number((raw * 100).toFixed(2))}%`;
      const text = textValue(raw);
      return text ? (text.includes('%') ? text : text) : '-';
    };
    const parseBasic = payload => {
      const data = payload && payload.data;
      if (!data || typeof data !== 'object') throw new Error('未返回商品基础信息');
      return [
        pair('商品类目', parseCategory(data.cid_info)),
        pair('首次上架', parseShelfTime(data.first_on_shelf_time)),
        pair('差评率', parseBadRate(data.bad_comment_rate))
      ];
    };
    const findRow = productId => {
      for (const row of document.querySelectorAll('[data-chuangbao-product-id]')) {
        if (row.getAttribute('data-chuangbao-product-id') === productId) return row;
      }
      for (const row of document.querySelectorAll('tbody tr,[role="row"][aria-rowindex],[data-row-key]')) {
        if (row.getAttribute('data-row-key') === productId) return row;
        const anchor = Array.from(row.querySelectorAll('a[href]')).find(value => {
          try { return new URL(value.href, location.href).searchParams.get('product_id') === productId; }
          catch (_error) { return false; }
        });
        if (anchor) return row;
      }
      return null;
    };
    const updateRowMappingStatus = (productId, status) => {
      const row = findRow(productId);
      if (!row) return;
      row.setAttribute(mappedAttribute, status);
      row.querySelectorAll('[data-chuangbao-mapping-summary]').forEach(summary => summary.remove());
    };
    const mappingNode = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text != null) node.textContent = text;
      return node;
    };
    const hasMappingValue = value => value != null &&
      !['', '-', '—', '--', '暂无数据', '暂未获取'].includes(String(value).trim());
    const createModal = (requestValue, range) => {
      document.getElementById(modalId)?.remove();
      const previousFocus = document.activeElement;
      const overlay = mappingNode('div');
      overlay.id = modalId;
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', modalId + '-title');
      const style = mappingNode('style');
      const scope = '#' + modalId;
      style.textContent = `
        ${scope}{box-sizing:border-box;position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(20,33,61,.38);backdrop-filter:blur(3px);font:14px/1.6 "Microsoft YaHei UI","Microsoft YaHei",sans-serif;color:#14213d;text-align:left}
        ${scope} *{box-sizing:border-box}
        ${scope} .cm-panel{width:880px;max-width:100%;max-height:calc(100vh - 40px);overflow:auto;background:#fff;border:1px solid #dfe7f3;border-radius:18px;padding:28px;box-shadow:0 24px 80px #14213d33}
        ${scope} h2,${scope} h3,${scope} p,${scope} dl,${scope} dt,${scope} dd{margin:0;padding:0;border:0;background:none;line-height:1.6}
        ${scope} .cm-header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:0;margin:0 0 20px;background:none;border:0;color:inherit;font-weight:400}
        ${scope} .cm-heading{min-width:0;flex:1}
        ${scope} .cm-eyebrow{color:#2f73ed;font-size:13px;font-weight:700;margin-bottom:7px}
        ${scope} .cm-title{font-size:19px;font-weight:700;color:#14213d;overflow-wrap:anywhere}
        ${scope} .cm-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;margin-top:10px;color:#6f7f9c;font-size:12px}
        ${scope} .cm-period{background:#f0f5ff;color:#355f9f;border-radius:6px;padding:3px 8px}
        ${scope} .cm-close{flex:0 0 34px;width:34px;height:34px;display:grid;place-items:center;padding:0;border:1px solid #dfe7f3;border-radius:9px;background:#fff;color:#6f7f9c;font:24px/1 Arial,sans-serif;cursor:pointer}
        ${scope} .cm-close:hover{background:#f0f5ff;color:#2f73ed}
        ${scope} button:focus-visible,${scope} summary:focus-visible{outline:2px solid #2f73ed;outline-offset:3px}
        ${scope} .cm-grid{display:grid;gap:16px}
        ${scope} .cm-card{min-width:0;padding:20px;border:1px solid #dfe7f3;border-radius:12px;background:#fff}
        ${scope} .cm-card.cm-featured{border-color:#c7dafe;background:#f5f8ff}
        ${scope} .cm-card-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;margin-bottom:5px}
        ${scope} .cm-card-title{font-size:15px;font-weight:700;color:#14213d}
        ${scope} .cm-badge{display:inline-block;font-size:11px;font-weight:500;line-height:20px;padding:0 7px;border-radius:5px;color:#3563a5;background:#e6efff}
        ${scope} .cm-badge.cm-cached{color:#876017;background:#fff1d5}
        ${scope} .cm-source{color:#657694;font-size:12px;overflow-wrap:anywhere}
        ${scope} .cm-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:20px 24px;margin-top:22px}
        ${scope} .cm-metric{min-width:0}
        ${scope} .cm-metric dt{font-size:12px;color:#657694;margin-bottom:5px}
        ${scope} .cm-metric dd{font-size:24px;line-height:1.3;color:#14213d;font-weight:700;letter-spacing:-.4px;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
        ${scope} .cm-featured .cm-metric dd{font-size:28px;color:#215abe}
        ${scope} .cm-basic{background:#fafbfd}
        ${scope} .cm-basic .cm-metrics{grid-template-columns:2fr 1fr 1fr;gap:14px 24px;margin-top:16px}
        ${scope} .cm-basic .cm-metric dd{font-size:14px;line-height:1.6;letter-spacing:0;font-weight:600;color:#334460}
        ${scope} .cm-notice{margin-top:16px;padding:12px 14px;border-radius:9px;background:#fff9ed;color:#856123;font-size:12px}
        ${scope} .cm-notice[hidden]{display:none}
        ${scope} .cm-notice-line{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 14px}
        ${scope} .cm-notice details{flex:1;min-width:0}
        ${scope} .cm-notice summary{cursor:pointer;width:fit-content;color:#856123;font-size:12px}
        ${scope} .cm-notice-detail{margin-top:9px;padding-top:9px;border-top:1px solid #eddcba;color:#876a3a;overflow-wrap:anywhere}
        ${scope} .cm-notice.cm-notice-quiet{margin:0;padding:0;background:transparent;color:#6f7f9c;font-size:11px}
        ${scope} .cm-notice-quiet summary{color:#526987;font-size:11px}
        ${scope} .cm-notice-quiet .cm-notice-detail{max-width:440px;padding:10px 12px;border:0;border-radius:8px;background:#f6f8fc;color:#526987}
        ${scope} .cm-footer{display:flex;flex-wrap:wrap;gap:4px 16px;justify-content:space-between;border-top:1px solid #e9eef6;margin:20px 0 0;padding:13px 0 0;font-size:11px;color:#6f7f9c;background:none}
        ${scope} .cm-empty{padding:34px 20px;border:1px dashed #dfe7f3;border-radius:12px;text-align:center;color:#657694;font-size:13px}
        ${scope} .cm-empty strong{display:block;margin-bottom:6px;color:#334460;font-size:15px}
        ${scope} .cm-loading{font-size:12px;color:#657694;padding:4px 0}
        @media(max-width:560px){
          ${scope}{padding:10px}
          ${scope} .cm-panel{padding:18px;max-height:calc(100vh - 20px);border-radius:14px}
          ${scope} .cm-header{gap:10px;margin-bottom:16px}
          ${scope} .cm-title{font-size:16px}
          ${scope} .cm-card{padding:16px}
          ${scope} .cm-metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 14px}
          ${scope} .cm-metric dd,${scope} .cm-featured .cm-metric dd{font-size:21px}
          ${scope} .cm-basic .cm-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
          ${scope} .cm-basic .cm-metric:first-child{grid-column:1/-1}
        }`;
      const panel = mappingNode('section', 'cm-panel');
      const header = mappingNode('header', 'cm-header');
      const heading = mappingNode('div', 'cm-heading');
      const title = mappingNode('h2', 'cm-title', requestValue.title || '当前商品');
      title.id = modalId + '-title';
      const meta = mappingNode('div', 'cm-meta');
      meta.append(mappingNode('span', '', '商品 ID：' + requestValue.productId),
        mappingNode('span', 'cm-period', range.beginDate.slice(0, 10) + ' 至 ' + range.endDate.slice(0, 10)));
      heading.append(mappingNode('p', 'cm-eyebrow', '商品映射数据'), title, meta);
      const close = mappingNode('button', 'cm-close', '×');
      close.type = 'button';
      close.setAttribute('aria-label', '关闭');
      close.title = '关闭';
      const dismiss = () => {
        overlay.remove();
        if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus();
      };
      close.addEventListener('click', dismiss);
      overlay.addEventListener('click', event => { if (event.target === overlay) dismiss(); });
      overlay.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
        if (event.key !== 'Tab') return;
        const focusable = Array.from(panel.querySelectorAll('button,summary')).filter(node => node.getClientRects().length);
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      });
      header.append(heading, close);
      const grid = mappingNode('div', 'cm-grid');
      grid.setAttribute('data-chuangbao-mapping-grid', '1');
      const notice = mappingNode('div', 'cm-notice');
      notice.setAttribute('data-chuangbao-limit-notice', '1');
      notice.hidden = true;
      const details = mappingNode('details');
      const summary = mappingNode('summary', '', '详情暂时受限 · 查看说明');
      const explanation = mappingNode('p', 'cm-notice-detail');
      explanation.setAttribute('data-chuangbao-limit-detail', '1');
      details.append(summary, explanation);
      notice.append(details);
      const footer = mappingNode('footer', 'cm-footer');
      const count = mappingNode('span');
      count.setAttribute('data-chuangbao-mapping-count', '1');
      count.setAttribute('role', 'status');
      footer.append(count, mappingNode('span', '', '仅展示有数据的指标 · 未返回项已隐藏'));
      footer.lastElementChild.setAttribute('data-chuangbao-mapping-footnote', '1');
      panel.append(header, grid, notice, footer);
      overlay.append(style, panel);
      document.documentElement.append(overlay);
      close.focus();
      return { overlay, grid };
    };
    const renderSections = (grid, sections, ranks = {}) => {
      if (!grid) return 0;
      grid.replaceChildren();
      let total = 0;
      const titles = { video: '短视频表现', overview: '成交总览', live: '直播表现', 'product-card': '商品卡表现', basic: '基础信息' };
      // Rank values supplement only their own channel; successful detail values take precedence.
      const order = ['video', 'overview', 'live', 'product-card', 'basic'];
      order.forEach(key => {
        const section = sections.find(value => value.key === key);
        if (!section) return;
        const detailValues = section.ok === true ? (section.values || []).filter(value => hasMappingValue(value.value)) : [];
        const rank = section.source === 'alliance' ? null : ranks[key];
        const isRank = !detailValues.length && rank?.values.some(value => hasMappingValue(value.value));
        const values = (isRank ? rank.values : detailValues).filter(value => hasMappingValue(value.value));
        if (!values.length) return;
        const isCached = !isRank && section.cached;
        const isBasic = key === 'basic';
        const card = mappingNode('section', 'cm-card' + (isBasic ? ' cm-basic' : total === 0 ? ' cm-featured' : ''));
        card.setAttribute('data-mapping-key', key);
        if (section.source === 'alliance') card.setAttribute('data-alliance-tab', ({ video: '短视频', live: '直播', basic: '购买人群', overview: '渠道数量', 'product-card': '其他渠道' })[key] || titles[key]);
        card.setAttribute('data-mapping-state', isRank ? 'rank-partial' : isCached ? 'cached' : 'ready');
        const heading = mappingNode('div', 'cm-card-head');
        heading.append(mappingNode('h3', 'cm-card-title', section.source === 'alliance' ? section.title : titles[key] || section.title));
        heading.append(mappingNode('span', 'cm-badge' + (isCached ? ' cm-cached' : ''), section.source === 'alliance' ? (isCached ? '精选联盟缓存' : '精选联盟') : isRank ? '榜单数据' : isCached ? '页面缓存' : '详情数据'));
        card.append(heading);
        const source = mappingNode('p', 'cm-source');
        if (section.source === 'alliance') {
          source.textContent = '来源：' + section.sourceLabel + ' · 获取于 ' + new Date(section.updatedAt).toLocaleString('zh-CN', { hour12: false });
        } else if (isRank) {
          source.setAttribute('data-chuangbao-rank-card-source', '1');
          source.textContent = '来源：' + (rank.sourceLabel || '罗盘短视频榜') +
            (rank.source === 'rank-page' ? ' · 页面读取于 ' : ' · 获取于 ') +
            new Date(rank.updatedAt).toLocaleString('zh-CN', { hour12: false });
        } else if (isCached) {
          source.setAttribute('data-chuangbao-cache-label', '1');
          source.textContent = '来源：罗盘商品详情 · 缓存于 ' + new Date(section.cachedAt).toLocaleString('zh-CN', { hour12: false }) +
            (section.cachedRange ? ' · ' + section.cachedRange : '');
        } else source.textContent = '来源：罗盘商品详情';
        card.append(source);
        const metrics = mappingNode('dl', 'cm-metrics');
        const priority = ['成交额', '成交件数', '带货视频', '订单数', '带货达人'];
        const sorted = isBasic ? values : [...values].sort((a, b) =>
          (priority.includes(a.label) ? priority.indexOf(a.label) : 99) - (priority.includes(b.label) ? priority.indexOf(b.label) : 99));
        sorted.forEach(value => {
          const cell = mappingNode('div', 'cm-metric');
          cell.setAttribute('data-mapping-metric', value.label);
          const display = mappingNode('dd', '', String(value.value));
          if (section.source === 'alliance' && String(value.value).length > 10)
            display.style.cssText = 'font-size:22px;white-space:normal;overflow-wrap:anywhere';
          cell.append(mappingNode('dt', '', value.label), display);
          metrics.append(cell);
        });
        card.append(metrics);
        grid.append(card);
        total += values.length;
      });
      const pending = sections.some(section => section.ok === null);
      if (!total) {
        const empty = mappingNode('div', 'cm-empty');
        empty.setAttribute('data-chuangbao-mapping-empty', '1');
        empty.append(mappingNode('strong', '', pending ? '正在读取商品数据…' : '当前周期暂无可展示的数据'),
          mappingNode('p', '', pending ? '正在整理当前商品的可用指标' : sections.some(section => section.source === 'alliance')
            ? '精选联盟未返回完整指标，请核对商品和日期；请勿频繁重试。' : '可稍后在罗盘页面查看，或切换商品与统计周期。'));
        grid.append(empty);
      } else if (pending) grid.append(mappingNode('p', 'cm-loading', '正在整理其余可用数据…'));
      return total;
    };
    const definitions = (productId, range) => [
      {
        key: 'basic',
        title: '基础信息',
        url: buildBasicUrl(productId),
        parse: parseBasic
      },
      {
        key: 'overview',
        title: '总览核心指标',
        url: buildCoreUrl(productId, range, '0', [
          'pay_amt', 'dh_product_show_uv', 'dh_product_click_uv', 'pay_ucnt',
          'dh_product_click_pv_ratio_uv', 'dh_pay_conversion_click_ratio_uv',
          'dh_pay_conversion_show_ratio_uv', 'pay_cnt', 'pay_combo_cnt',
          'ad_costed_amt', 'ad_efficiency', 'ad_receive_amt', 'ad_prod_click_cnt'
        ].join(',')),
        parse: parseCommerce
      },
      {
        key: 'live',
        title: '直播核心指标',
        url: buildCoreUrl(productId, range, '1', 'live_room_cnt,live_author_cnt,pay_amt,pay_combo_cnt,pay_cnt'),
        parse: parseLive
      },
      {
        key: 'video',
        title: '短视频核心指标',
        url: buildCoreUrl(productId, range, '2', 'video_cnt,video_author_cnt,pay_amt,pay_combo_cnt,pay_cnt'),
        parse: parseVideo
      },
      {
        key: 'product-card',
        title: '商品卡核心指标',
        url: buildCoreUrl(productId, range, '3', [
          'pay_amt', 'dh_product_show_uv', 'dh_product_click_uv', 'pay_ucnt',
          'dh_product_click_pv_ratio_uv', 'dh_pay_conversion_click_ratio_uv',
          'dh_pay_conversion_show_ratio_uv', 'pay_cnt', 'pay_combo_cnt',
          'ad_costed_amt', 'ad_efficiency', 'ad_receive_amt', 'ad_prod_click_cnt'
        ].join(',')),
        parse: parseCommerce
      }
    ];
    const running = new Map();
    const latestByKey = new Map();
    const keyFor = (id, range) => [id, range.beginDate, range.endDate, range.dateType].join('|');
    const displayResult = (requestValue, result) => {
      const modal = createModal(requestValue, result);
      modal.overlay.setAttribute('data-request-key', keyFor(result.productId, result));
      renderResult(result);
    };
    const renderResult = result => {
      const overlay = document.getElementById(modalId);
      if (!overlay || overlay.getAttribute('data-request-key') !== keyFor(result.productId, result)) return;
      const ranks = rankSourcesFor(result.productId, result);
      const total = renderSections(overlay.querySelector('[data-chuangbao-mapping-grid]'), result.sections, ranks);
      const count = overlay.querySelector('[data-chuangbao-mapping-count]');
      if (count) count.textContent = total ? '已展示 ' + total + ' 项可用数据' :
        result.status === 'loading' ? '正在读取数据…' : '暂无可用数据';
      const footnote = overlay.querySelector('[data-chuangbao-mapping-footnote]');
      if (result.source === 'alliance' && footnote) {
        footnote.textContent = '需要登录精选联盟达人账号才能查询。平台限流或风控时暂停查询。 ' + (result.message || '') + (result.cached ? ' 本次展示5分钟内的缓存。' : ' 同商品缓存5分钟。');
        footnote.style.cssText = 'color:#8a5b13;line-height:1.6;white-space:normal;max-width:760px';
      }
      const notice = overlay.querySelector('[data-chuangbao-limit-notice]');
      if (notice) {
        const limited = result.sections.some(section => section.limited);
        const state = readPause();
        notice.hidden = !limited;
        notice.classList.toggle('cm-notice-quiet', total > 0);
        const footer = overlay.querySelector('.cm-footer');
        if (total && notice.parentElement !== footer) footer.insertBefore(notice, footer.querySelector('[data-chuangbao-mapping-footnote]'));
        else if (!total && notice.parentElement === footer) footer.before(notice);
        notice.querySelector('summary').textContent = total ? '数据说明' : '详情暂时受限 · 查看说明';
        notice.querySelector('[data-chuangbao-limit-detail]').textContent = limited
          ? (total ? '可继续查看已取得的数据。' : '') + (state ? pauseMessage(state) : '详情访问暂时受限。') +
            (state ? ' 软件将在 ' + new Date(state.until).toLocaleTimeString('zh-CN', { hour12: false }) + ' 后允许再次查询，不会自动重试。' : '') +
            ' 平台额度是否恢复，请以罗盘官方页面为准。榜单指标按各自频道展示，不同频道不互相代填。'
          : '';
      }
    };
    const publish = result => {
      renderResult(result);
      latestByKey.set(keyFor(result.productId, result), result);
      if (latestByKey.size > 500) latestByKey.delete(latestByKey.keys().next().value);
      const current = currentDateRange();
      if (keyFor(result.productId, current) === keyFor(result.productId, result))
        updateRowMappingStatus(result.productId, result.status);
      window.dispatchEvent(new CustomEvent('chuangbao:product-mapping-updated', { detail: result }));
    };
    // Use only the successful response already delivered for the visible short-video ranking.
    // Ranking metrics have a different shape and scope from product-detail metrics.
    const rankRecords = new Map();
    // Additional channels read only the current platform table. No guessed API,
    // extra platform requests, or duplication of video metrics into other channels.
    const rankPageRecords = new Map();
    let rankPageIdentityChanged = false;
    const rankTabs = { '总榜': 'overview', '直播榜': 'live', '短视频榜': 'video', '商品卡榜': 'product-card' };
    const visibleElement = node => !!node && !!node.getClientRects?.().length &&
      getComputedStyle(node).visibility !== 'hidden' && getComputedStyle(node).display !== 'none';
    const currentRankTab = () => {
      if (!/^\/shop\/chance\/(rank-product|product-rank)\/?$/.test(location.pathname)) return null;
      const tabs = Array.from(document.querySelectorAll('[role="tab"][aria-selected="true"]'))
        .filter(visibleElement).map(node => textValue(node.textContent)).filter(name => rankTabs[name]);
      return tabs.length === 1 ? { key: rankTabs[tabs[0]], name: tabs[0] } : null;
    };
    const rankHeaderLabels = {
      '用户支付金额': '成交额', '成交金额': '成交额', '成交额': '成交额', '销售额': '成交额',
      '成交件数': '成交件数', '订单件数': '成交件数',
      '订单数': '订单数', '成交订单数': '订单数',
      '点击次数': '点击次数', '商品点击次数': '点击次数',
      '曝光次数': '曝光次数', '商品曝光次数': '曝光次数',
      '曝光人数': '曝光人数', '商品曝光人数': '曝光人数',
      '点击人数': '点击人数', '商品点击人数': '点击人数',
      '成交人数': '成交人数', '点击率': '点击率', '商品点击率': '点击率',
      '点击成交转化率': '点击成交转化率',
      '带货视频数': '带货视频', '带货视频': '带货视频',
      '带货达人数': '带货达人', '带货达人': '带货达人',
      '直播场次': '直播场次', '直播间数': '带货直播间', '直播带货达人数': '带货达人'
    };
    const channelRankLabels = {
      live: { '直播间用户支付金额': '成交额', '直播间点击次数': '点击次数',
        '直播间成交件数': '成交件数', '带货直播间数': '带货直播间' },
      video: { '短视频用户支付金额': '成交额', '短视频点击次数': '点击次数',
        '短视频成交件数': '成交件数', '带货短视频数': '带货视频' },
      'product-card': { '商品卡成交件数': '成交件数' }
    };
    const readRankPage = (productId, range) => {
      const tab = currentRankTab();
      if (!tab || !mappingScope || rankPageIdentityChanged || range.source === 'default' ||
          keyFor(productId, range) !== keyFor(productId, currentDateRange())) return false;
      const row = findRow(productId);
      if (!visibleElement(row)) return false;
      const table = row.closest('table');
      if (!table || row.closest('[aria-busy="true"]') || Array.from(document.querySelectorAll(
        '.ant-spin-spinning,.byted-spin-spinning,.arco-spin-loading,[role="progressbar"]')).some(visibleElement)) return false;
      // Fixed/virtual tables may split head/body. Use only an unambiguous header
      // in the same table container, never another table elsewhere on the page.
      const container = table.closest('.ant-table-container,.byted-table-container,.arco-table-container') || table;
      const heads = Array.from(container.querySelectorAll('thead')).filter(node =>
        node.querySelectorAll('tr').length === 1 && node.querySelectorAll('th').length);
      const cells = Array.from(row.children).filter(node => node.tagName === 'TD');
      const matching = heads.map(head => Array.from(head.querySelectorAll('th'))).filter(headers =>
        headers.length === cells.length && [...headers, ...cells].every(cell => cell.colSpan === 1 && cell.rowSpan === 1));
      if (matching.length !== 1 || !cells.length) return false;
      const headers = matching[0];
      const labelFor = header => {
        const name = textValue(header.innerText).replace(/\s+/g, '');
        return channelRankLabels[tab.key]?.[name] || rankHeaderLabels[name];
      };
      const labels = headers.map(labelFor).filter(Boolean);
      if (new Set(labels).size !== labels.length) return false;
      const values = [];
      headers.forEach((header, index) => {
        const label = labelFor(header);
        if (!label) return;
        // Read a scalar/range only; injected summaries, ratios with explanations,
        // login/limit messages and multi-line comparison values are not metrics.
        const value = textValue(cells[index].innerText).replace(/[￥]/g, '¥').replace(/[–—~～]/g, '-').replace(/\s+/g, '');
        if (!/^[¥]?\d[\d,]*(?:\.\d+)?[万亿]?%?(?:-[¥]?\d[\d,]*(?:\.\d+)?[万亿]?%?|\+)?$/.test(value)) return;
        values.push(pair(label, value));
      });
      const recordKey = keyFor(productId, range) + '|' + tab.key;
      // A successfully read empty row replaces its old snapshot as well.
      rankPageRecords.delete(recordKey);
      if (values.length) rankPageRecords.set(recordKey, { productId, ...range, channel: tab.key,
        scopeId: mappingScope, source: 'rank-page', sourceLabel: '罗盘' + tab.name,
        updatedAt: Date.now(), values });
      while (rankPageRecords.size > 500) rankPageRecords.delete(rankPageRecords.keys().next().value);
      return values.length > 0;
    };
    const rankSourcesFor = (productId, range) => {
      const sources = {};
      if (!currentRankTab() || keyFor(productId, range) !== keyFor(productId, currentDateRange()) ||
          !visibleElement(findRow(productId))) return sources;
      for (const key of ['overview', 'live', 'video', 'product-card']) {
        const record = rankPageRecords.get(keyFor(productId, range) + '|' + key);
        if (record && record.scopeId === mappingScope) sources[key] = record;
      }
      const video = peekRank(productId, range);
      if (video) sources.video = video;
      return sources;
    };
    const rankMetric = node => {
      const atom = value => {
        if (!value || !['price', 'number', 'ratio'].includes(value.unit)) return null;
        const raw = value.value;
        const numeric = typeof raw === 'number' ? raw : typeof raw === 'string' && /^-?\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : NaN;
        return Number.isFinite(numeric) ? { value: numeric, unit: value.unit } : null;
      };
      if (Array.isArray(node?.value_range)) {
        const lower = atom(node.value_range[0]);
        const upper = atom(node.value_range[1]);
        if (!lower || lower.value < 0 || !upper || upper.unit !== lower.unit ||
            (upper.value !== -1 && upper.value < lower.value)) return '-';
        return metric({ extra_value: { lower, upper } });
      }
      const direct = atom(node?.value);
      return direct && direct.value >= 0 ? formatted(direct.value, direct.unit) : '-';
    };
    const peekRank = (id, range = currentDateRange()) => {
      if (!/^\/shop\/chance\/(rank-product|product-rank)\/?$/.test(location.pathname) ||
          keyFor(id, range) !== keyFor(id, currentDateRange())) return null;
      const active = Array.from(document.querySelectorAll('[role="tab"][aria-selected="true"]'))
        .some(node => node.textContent.trim() === '短视频榜');
      if (!active) return null;
      const row = findRow(id);
      if (!row || (row.getClientRects && !row.getClientRects().length)) return null;
      // Keep the last received ranking snapshot while its product, tab and dates still match.
      // Time alone must not erase data that is still visible in the native ranking list.
      const record = rankRecords.get(keyFor(id, range));
      return record && record.scopeId === mappingScope ? record : null;
    };
    const captureRank = envelope => {
      if (!envelope || envelope.channel !== 'chuangbao:capture:v1' ||
          envelope.direction !== 'page-to-host') return false;
      let url;
      try { url = new URL(envelope.url, location.origin); } catch (_) { return false; }
      if (url.origin !== location.origin || url.pathname !== '/compass_api/shop/product/product_rank/video_bring_good') return false;
      const body = envelope.body;
      if (!body || ['st', 'code'].some(key => body[key] != null && Number(body[key]) !== 0) ||
          (envelope.status != null && (envelope.status < 200 || envelope.status >= 300)) ||
          !Array.isArray(body.data?.data_result)) return false;
      const range = { beginDate: url.searchParams.get('begin_date'), endDate: url.searchParams.get('end_date'),
        dateType: url.searchParams.get('date_type') };
      if (![range.beginDate, range.endDate].every(value => /^\d{4}\/\d{2}\/\d{2} 00:00:00$/.test(value || '')) || !range.dateType) return false;
      // Replace the received page's snapshot, including rows whose new values are empty.
      for (const [key, record] of rankRecords) {
        if (keyFor(record.productId, record) === keyFor(record.productId, range)) rankRecords.delete(key);
      }
      const receivedAt = Date.parse(envelope.capturedAt);
      const updatedAt = Number.isFinite(receivedAt) && receivedAt <= Date.now() ? receivedAt : Date.now();
      for (const item of body.data.data_result) {
        const id = textValue(item?.product_info?.id);
        if (!/^\d{6,32}$/.test(id)) continue;
        const videos = (Array.isArray(item.video_list) ? item.video_list : []).map(video => ({
          id: textValue(video?.video_id), title: textValue(video?.video_name),
          cover: /^https?:\/\//.test(video?.video_img || '') ? video.video_img : '',
          url: `https://www.douyin.com/video/${textValue(video?.video_id)}`
        })).filter(video => /^\d{6,32}$/.test(video.id)).slice(0, 10);
        rankRecords.set(keyFor(id, range), { productId: id, ...range, source: 'short-video-rank',
          scopeId: mappingScope, updatedAt, videos, values: [pair('成交额', rankMetric(item.pay_amt)),
            pair('成交件数', rankMetric(item.pay_combo_cnt)), pair('订单数', rankMetric(item.pay_cnt)),
            pair('带货视频', rankMetric(item.video_cnt)), pair('带货达人', rankMetric(item.video_author_cnt))] });
      }
      while (rankRecords.size > 500) rankRecords.delete(rankRecords.keys().next().value);
      for (const result of latestByKey.values()) renderResult(result);
      window.dispatchEvent(new CustomEvent('chuangbao:product-mapping-updated', { detail: { source: 'short-video-rank' } }));
      return true;
    };
    window.addEventListener('message', event => {
      if (event.source === window && event.origin === location.origin) captureRank(event.data);
    });
    window.chrome?.webview?.addEventListener?.('message', event => captureRank(event.data));

    const peek = productId => latestByKey.get(keyFor(productId, currentDateRange())) || null;
    const execute = (requestValue = {}) => {
      const productId = textValue(requestValue.productId);
      if (!/^\d{6,32}$/.test(productId))
        return Promise.resolve({ status: 'invalid-product-id', successCount: 0, failedCount: 5, productId });
      const range = currentDateRange();
      if (range.source === 'default' && !/^\/shop\/chance\/(rank-product|product-rank)\/detail\/?$/.test(location.pathname))
        return Promise.resolve({ status: 'missing-date-range', productId, successCount: 0, failedCount: 5 });
      const cacheKey = keyFor(productId, range);
      const previous = latestByKey.get(cacheKey);
      if (running.has(cacheKey)) {
        if (requestValue.openModal && previous) displayResult(requestValue, previous);
        return running.get(cacheKey);
      }
      const ttl = previous?.status === 'ok' && !previous?.limited ? CACHE_FRESH_MS : 15000;
      if (!requestValue.force && previous && !(previous.cacheOnly && !requestValue.cacheOnly) &&
          previous.status !== 'loading' && Date.now() - previous.updatedAt < ttl) {
        const reused = { ...previous, skipped: true, sections: previous.sections.map(section =>
          section.ok ? { ...section, cached: true, cachedAt: section.cachedAt || previous.updatedAt,
            cachedRange: cacheRangeText(previous) } : { ...section }) };
        if (requestValue.openModal) displayResult(requestValue, reused);
        publish(reused);
        return Promise.resolve(reused);
      }
      const sectionDefinitions = definitions(productId, range);
      const sections = sectionDefinitions.map(section => ({ key: section.key,
        title: section.title, ok: null, values: [], error: '' }));
      const result = { status: 'loading', productId, successCount: 0, failedCount: 0,
        ...range, dateSource: range.source, sections, cacheOnly: !!requestValue.cacheOnly, updatedAt: Date.now() };
      const job = Promise.resolve().then(async () => {
        if (requestValue.openModal) displayResult(requestValue, result);
        publish(result);
        for (const [index, definition] of sectionDefinitions.entries()) {
          const section = sections[index];
          const cached = readSectionCache(productId, definition.key, range);
          const paused = readPause();
          if (requestValue.cacheOnly || paused || (!requestValue.force && cached && Date.now() - cached.time < CACHE_FRESH_MS)) {
            if (cached) applyCacheToSection(section, cached);
            else Object.assign(section, { ok: false, error: '当前商品和统计周期暂无缓存数据。' });
            if (paused) Object.assign(section, { limited: true, retryAfterMs: paused.until - Date.now(), error: pauseMessage(paused) });
          } else {
            try {
              const payload = await fetchJson(definition.url);
              const values = definition.parse(payload);
              if (!values.some(value => value.value !== '-')) throw new Error('平台未返回可用指标');
              Object.assign(section, { values, ok: true });
              writeSectionCache(productId, definition.key, values, range);
            } catch (error) {
              Object.assign(section, { ok: false, limited: !!error.limited,
                retryAfterMs: error.retryAfterMs || 0, error: error.message || '平台未返回数据' });
              if (cached) applyCacheToSection(section, cached);
            }
          }
          publish(result);
        }
        result.successCount = sections.filter(section => section.ok === true).length;
        result.failedCount = sections.length - result.successCount;
        result.limited = sections.some(section => section.limited);
        result.status = result.successCount === 5 ? 'ok' : result.successCount > 0 ? 'partial' : 'error';
        result.updatedAt = Date.now();
        publish(result);
        return result;
      });
      const tracked = job.finally(() => running.delete(cacheKey));
      running.set(cacheKey, tracked);
      latestByKey.set(cacheKey, result);
      return tracked;
    };
    const videoCache = new Map();
    const videoRunning = new Map();
    const peekVideos = id => videoCache.get(keyFor(id, currentDateRange())) || null;
    const videos = (id, force = false, cacheOnly = false) => {
      if (!/^\d{6,32}$/.test(id)) return Promise.resolve(null);
      const range = currentDateRange();
      const key = keyFor(id, range);
      if (range.source === 'default') return Promise.resolve(null);
      if (videoRunning.has(key)) return videoRunning.get(key);
      const previous = videoCache.get(key);
      if (!force && previous && !(previous.cacheOnly && !cacheOnly) &&
          Date.now() - previous.updatedAt < (previous.ok ? CACHE_FRESH_MS : 15000))
        return Promise.resolve(previous);
      const result = { ok: null, items: [], error: '', cacheOnly: !!cacheOnly, updatedAt: Date.now() };
      videoCache.set(key, result);
      const job = Promise.resolve().then(async () => {
        const cached = readSectionCache(id, 'videolist', range);
        try {
          if (cacheOnly) throw new Error('当前商品和统计周期暂无视频缓存。');
          // [创爆额度补丁 v6.1] 对齐天镜：视频直连不读取全局暂停（flow_more 与
          // 详情数据接口分属不同额度域）；st:602 日期前移一天重试；空数据换
          // 入口参数（saleType）重试。完整详情页通道在 rank-video-actions.js。
          const flowUrl = (overrides = {}) => {
            const url = new URL('/compass_api/shop/product/compete_product_detail/flow_source/flow_more', location.origin);
            Object.entries(Object.assign({
              product_id: id, saleType: '0', source_entrance: 'video',
              date_type: range.dateType, begin_date: range.beginDate, end_date: range.endDate,
              activity_id: '', index_selected: 'pay_amt,dh_product_show_uv,dh_product_click_uv,pay_ucnt,dh_product_click_ratio_uv,dh_pay_conversion_click_ratio_uv,dh_pay_conversion_show_ratio_uv,pay_cnt,pay_combo_cnt',
              page_size: '10', page_no: '1', sort_field: 'pay_amt', is_asc: 'false'
            }, overrides)).forEach(([k, v]) => url.searchParams.set(k, v));
            return url.toString();
          };
          const shiftDay = dateText => {
            const date = new Date(String(dateText || '').replace(/\//g, '-'));
            if (Number.isNaN(date.getTime())) return '';
            date.setDate(date.getDate() - 1);
            const pad = value => String(value).padStart(2, '0');
            return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} 00:00:00`;
          };
          const rolledBack = () => {
            const begin = shiftDay(range.beginDate), end = shiftDay(range.endDate);
            return begin && end ? { begin_date: begin, end_date: end } : null;
          };
          const is602 = error => /602/.test(String(error && error.message || ''));
          let payload = null;
          try {
            payload = await fetchJson(flowUrl(), undefined, { ignorePause: true });
          } catch (directError) {
            const rollback = is602(directError) ? rolledBack() : null;
            if (rollback) {
              try { payload = await fetchJson(flowUrl(rollback), undefined, { ignorePause: true }); } catch (_) {}
            }
            if (!payload) throw directError;
          }
          if (!Array.isArray(payload?.data) || !payload.data.length) {
            try {
              const altPayload = await fetchJson(flowUrl({ saleType: '' }), undefined, { ignorePause: true });
              if (Array.isArray(altPayload?.data) && altPayload.data.length) payload = altPayload;
            } catch (_) {}
          }
          if (!Array.isArray(payload?.data)) throw new Error('视频列表未返回');
          result.items = payload.data.map(item => {
            const video = item?.base_info?.video_base_info || {};
            const videoId = textValue(video.video_id);
            const cover = /^https?:\/\//.test(video.video_image || '') ? video.video_image : '';
            return { id: videoId, title: textValue(video.video_title), cover,
              url: 'https://www.douyin.com/video/' + videoId };
          }).filter(item => /^\d{6,32}$/.test(item.id));
          result.ok = true;
          writeSectionCache(id, 'videolist', result.items.slice(), range);
        } catch (error) {
          Object.assign(result, { ok: false, error: error.message || '视频列表未返回',
            limited: !!error.limited, retryAfterMs: error.retryAfterMs || 0 });
          if (cached) Object.assign(result, { items: cached.values.slice(), ok: true, cached: true,
            cachedAt: cached.time, cachedRange: cacheRangeText(cached) });
        }
        result.updatedAt = Date.now();
        if (videoCache.size > 200) videoCache.delete(videoCache.keys().next().value);
        window.dispatchEvent(new CustomEvent('chuangbao:product-mapping-updated', { detail: { productId: id } }));
        return result;
      });
      const tracked = job.finally(() => videoRunning.delete(key));
      videoRunning.set(key, tracked);
      return tracked;
    };
    const showSnapshot = productId => {
      const result = peek(productId);
      if (!result) return false;
      displayResult({ productId, title: '商品数据' }, result);
      return true;
    };
    // Native-only transport: platform cookies and software tokens never enter this DTO.
    // A scope is renewed by the host whenever its software identity or platform cookie
    // fingerprint changes. Nothing from this cache survives a scope/document change.
    const documentId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID() : 'document-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    let mappingScope = '';
    const cloudCache = new Map();
    const cloudPending = new Map();
    const coreFields = {
      overview: ['pay_amt', 'pay_cnt', 'dh_product_show_uv', 'pay_ucnt', 'dh_product_click_pv_ratio_uv'],
      live: ['live_room_cnt', 'live_author_cnt', 'pay_amt', 'pay_combo_cnt', 'pay_cnt'],
      video: ['video_cnt', 'video_author_cnt', 'pay_amt', 'pay_combo_cnt', 'pay_cnt'],
      'product-card': ['pay_amt', 'pay_cnt', 'dh_product_show_uv', 'pay_ucnt', 'dh_product_click_pv_ratio_uv']
    };
    const scalar = value => typeof value === 'number' && Number.isFinite(value) ? value :
      typeof value === 'string' && value.length <= 80 ? value : null;
    const cleanAtom = value => value && typeof value === 'object' ? {
      value: scalar(value.value), unit: typeof value.unit === 'string' ? value.unit.slice(0, 24) : 'number'
    } : null;
    const cleanMetric = node => {
      if (!node || typeof node !== 'object') return null;
      if (node.extra_value && (node.extra_value.lower != null || node.extra_value.upper != null))
        return { extra_value: { lower: cleanAtom(node.extra_value.lower), upper: cleanAtom(node.extra_value.upper) } };
      return { value: cleanAtom(node.value) };
    };
    const candidates = (key, payload) => {
      if (key === 'basic') {
        const data = payload?.data || {};
        const rate = data.bad_comment_rate;
        // basic_info defines this field as a ratio; retain an explicit unit if supplied.
        const explicitUnit = rate?.unit || rate?.value?.unit || 'ratio';
        return {
          cid_info: (Array.isArray(data.cid_info) ? data.cid_info : []).slice(0, 10).map(item =>
            typeof item === 'string' ? item.slice(0, 120) : textValue(item?.name || item?.cname || item?.category_name || item?.value).slice(0, 120)),
          first_on_shelf_time: scalar(nestedRaw(data.first_on_shelf_time)),
          bad_comment_rate: { value: { value: scalar(nestedRaw(rate)), unit: String(explicitUnit).slice(0, 24) } }
        };
      }
      const metrics = payload?.data?.[0]?.metrics || {};
      return Object.fromEntries(coreFields[key].map(field => [field, cleanMetric(metrics[field])]));
    };
    const hasCandidate = data => Object.entries(data).some(([field, value]) => {
      if (field === 'cid_info') return value.some(part => part.trim());
      if (field === 'first_on_shelf_time') return value != null && value !== '';
      const lower = value?.extra_value?.lower?.value ?? value?.value?.value;
      return typeof lower === 'number' && Number.isFinite(lower) && lower >= 0 ||
        typeof lower === 'string' && /^\d+(?:\.\d+)?$/.test(lower);
    });
    const sameContext = (a, b) => a && b && ['productId', 'beginDate', 'endDate', 'dateType', 'scopeId', 'documentId']
      .every(key => a[key] === b[key]);
    const activeContext = productId => ({ productId, beginDate: currentDateRange().beginDate,
      endDate: currentDateRange().endDate, dateType: currentDateRange().dateType, scopeId: mappingScope, documentId });
    const cloud = async requestValue => {
      const command = requestValue.command;
      if (command === 'context') {
        if (!/^[a-zA-Z0-9-]{16,80}$/.test(requestValue.scopeId || '') || !/^\d{6,32}$/.test(requestValue.productId || ''))
          throw new Error('映射上下文无效');
        if (mappingScope !== requestValue.scopeId) {
          for (const job of cloudPending.values()) job.cancelled = true;
          cloudPending.clear(); cloudCache.clear(); sectionCache.clear(); latestByKey.clear(); videoCache.clear();
          // Initial binding claims only this document's visible list snapshot. Once an
          // identity has been bound, every later identity/cookie change discards it.
          if (mappingScope) { rankRecords.clear(); rankPageIdentityChanged = true; }
          else for (const [key, record] of rankRecords) {
            if (peekRank(record.productId) === record) record.scopeId = requestValue.scopeId;
            else rankRecords.delete(key);
          }
          document.getElementById(modalId)?.remove();
          rankPageRecords.clear();
          mappingScope = requestValue.scopeId;
        }
        const range = currentDateRange();
        if (range.source === 'default' && !/^\/shop\/chance\/(rank-product|product-rank)\/detail\/?$/.test(location.pathname))
          throw new Error('请先选择明确的统计日期，再映射数据');
        readRankPage(requestValue.productId, range);
        return { status: 'context', context: activeContext(requestValue.productId) };
      }
      const requestId = requestValue.requestId;
      if (!/^[a-zA-Z0-9-]{16,80}$/.test(requestId || '')) throw new Error('映射请求编号无效');
      if (command === 'alliance') {
        const response = requestValue.response, context = requestValue.context;
        if (!context || !sameContext(context, activeContext(context.productId)) ||
            response?.productId !== context.productId || response.beginDate !== context.beginDate || response.endDate !== context.endDate ||
            !Array.isArray(response.sections) || response.sections.length !== 5)
          throw new Error('页面、日期或账号已经变化，已丢弃精选联盟结果');
        const expectedKeys = ['video', 'overview', 'live', 'product-card', 'basic'];
        const sections = response.sections.map((section, index) => {
          if (section.key !== expectedKeys[index] || section.source !== 'alliance' || typeof section.ok !== 'boolean' ||
              typeof section.title !== 'string' || section.title.length > 40 || typeof section.sourceLabel !== 'string' || section.sourceLabel.length > 160 ||
              !Number.isFinite(section.updatedAt) || !Array.isArray(section.values) || section.values.length > 6 ||
              section.values.some(value => typeof value.label !== 'string' || value.label.length > 40 || typeof value.value !== 'string' || value.value.length > 150))
            throw new Error('精选联盟数据格式无效');
          return { ...section, cached: !!response.cached };
        });
        const successCount = sections.filter(section => section.ok && section.values.length).length;
        const result = { ...context, source: 'alliance', status: successCount === 5 ? 'ok' : successCount ? 'partial' : 'error',
          sections, successCount, failedCount: 5 - successCount, updatedAt: response.updatedAt,
          message: String(response.message || '').slice(0, 300), cached: !!response.cached, unavailableDetails: response.unavailableDetails === true,
          salesUnavailable: response.salesUnavailable === true };
        displayResult(requestValue, result); publish(result);
        return result;
      }
      if (command === 'cancel' || command === 'failed') {
        const pending = cloudPending.get(requestId);
        if (pending) {
          pending.cancelled = true;
          if (sameContext(pending.context, activeContext(pending.context.productId))) {
            const result = { ...pending.result, status: 'error', successCount: 0, failedCount: 5,
              sections: pending.result.sections.map(section => ({ ...section, ok: false,
                error: command === 'cancel' ? '本次映射已停止。' : '服务端标准化未完成，请重试。' })) };
            publish(result);
          }
          cloudPending.delete(requestId);
        }
        return { status: 'cancelled' };
      }
      if (command === 'apply') {
        const pending = cloudPending.get(requestId);
        const response = requestValue.response;
        if (!pending || pending.cancelled || !sameContext(pending.context, activeContext(pending.context.productId)))
          throw new Error('页面、日期或账号已经变化，已丢弃旧映射结果');
        const expected = definitions(pending.context.productId, pending.context);
        if (response?.schemaVersion !== 1 || response.normalizerVersion !== 'compass-1' || response.requestId !== requestId ||
            !sameContext(response.context, pending.context) || !Array.isArray(response.sections) || response.sections.length !== 5)
          throw new Error('服务端映射结果校验失败');
        const sections = response.sections.map((section, index) => {
          if (section.key !== expected[index].key || typeof section.ok !== 'boolean' || typeof section.cached !== 'boolean' ||
              typeof section.limited !== 'boolean' || !Number.isFinite(section.cachedAt) || !Number.isFinite(section.retryAfterMs) ||
              !Array.isArray(section.values) || section.values.length !== (index === 0 ? 3 : 5) ||
              section.values.some(value => typeof value.label !== 'string' || value.label.length > 30 || typeof value.value !== 'string' || value.value.length > 1400))
            throw new Error('服务端指标结构无效');
          return { ...section, title: expected[index].title, error: String(section.error || '').slice(0, 200),
            cachedRange: cacheRangeText(pending.context) };
        });
        const successCount = sections.filter(section => section.ok).length;
        const result = { ...pending.result, sections, successCount, failedCount: 5 - successCount,
          limited: sections.some(section => section.limited), status: successCount === 5 ? 'ok' : successCount ? 'partial' : 'error',
          normalizerVersion: response.normalizerVersion, updatedAt: Date.now() };
        cloudPending.delete(requestId);
        publish(result);
        return result;
      }
      if (command !== 'collect' || !sameContext(requestValue.context, activeContext(requestValue.context?.productId)))
        throw new Error('映射上下文已变化，请重新读取');
      if (cloudPending.has(requestId)) throw new Error('映射请求正在处理');
      if (cloudPending.size >= 20) throw new Error('待处理映射过多，请稍后重试');
      const context = requestValue.context;
      const groups = definitions(context.productId, context);
      const result = { ...context, status: 'loading', successCount: 0, failedCount: 0, updatedAt: Date.now(),
        sections: groups.map(group => ({ key: group.key, title: group.title, ok: null, values: [], error: '' })) };
      const pending = { context, result, cancelled: false };
      cloudPending.set(requestId, pending);
      const guard = () => {
        if (pending.cancelled || !sameContext(context, activeContext(context.productId))) throw new Error('映射已停止或上下文已变化');
      };
      try {
        if (requestValue.openModal) displayResult(requestValue, result);
        publish(result);
        const sections = [];
        for (const group of groups) {
          guard();
          const cacheKey = sectionCacheKey(context.productId, group.key, context);
          const cached = cloudCache.get(cacheKey);
          let entry = { key: group.key, data: null, capturedAt: 0, cached: false, errorCode: '', retryAfterMs: 0 };
          const paused = readPause();
          if (paused || (!requestValue.force && cached && Date.now() - cached.capturedAt < CACHE_FRESH_MS)) {
            if (cached) entry = { ...cached, cached: true };
            else entry.errorCode = 'MISSING_DATA';
            if (paused) Object.assign(entry, { errorCode: paused.kind === 'quota' ? 'PLATFORM_QUOTA' : 'PLATFORM_RATE_LIMIT',
              retryAfterMs: Math.min(86400000, Math.max(0, paused.until - Date.now())) });
          } else {
            try {
              const payload = await fetchJson(group.url, guard);
              guard();
              entry.data = candidates(group.key, payload);
              if (!hasCandidate(entry.data)) throw Object.assign(new Error('平台未返回可用指标'), { mappingCode: 'MISSING_DATA' });
              entry.capturedAt = Date.now();
              cloudCache.delete(cacheKey); cloudCache.set(cacheKey, { ...entry });
              while (cloudCache.size > 250) cloudCache.delete(cloudCache.keys().next().value);
            } catch (error) {
              guard();
              entry.data = null;
              if (cached) entry = { ...cached, cached: true };
              entry.errorCode = error.kind === 'quota' ? 'PLATFORM_QUOTA' : error.kind === 'rate' ? 'PLATFORM_RATE_LIMIT' : error.mappingCode || 'PLATFORM_ERROR';
              entry.retryAfterMs = Math.min(86400000, Math.max(0, error.retryAfterMs || 0));
            }
          }
          sections.push(entry);
          result.sections[sections.length - 1].collected = true;
          renderResult(result);
        }
        guard();
        return { schemaVersion: 1, requestId, context, sections };
      } catch (error) {
        await cloud({ command: 'cancel', requestId });
        throw error;
      }
    };
    Object.defineProperty(window, stateKey, {
      value: { execute, peek, currentDateRange, videos, peekVideos, captureRank, peekRank, rankSourcesFor, showSnapshot,
        probeRealQuota, readRealQuota, readPause, cloud },
      configurable: false,
      enumerable: false,
      writable: false
    });
  }

  // WebView document-created scripts run before the root element exists.
  // Wait before installing DOM readers; a detail WebView has no second injection.
  if (!document.documentElement) await new Promise(resolve =>
    document.addEventListener('DOMContentLoaded', resolve, { once: true }));

  // Independent, idempotent page reader: mall/card rows currently expose no
  // product ID to the legacy action bridge. Read only that visible row, without
  // inventing an identity, requesting details, or persisting/merging its values.
  // Kept outside the V2 singleton so a native mapping call can load this addition
  // in an existing authenticated document without restarting the application.
  if (!window.__CHUANGBAO_CARD_RANK_PREVIEW_V1__ && typeof MutationObserver !== 'undefined') {
    const previewId = 'chuangbao-card-rank-preview';
    const visible = node => !!node?.getClientRects?.().length && getComputedStyle(node).visibility !== 'hidden';
    const isTab = name => /^\/shop\/chance\/(rank-product|product-rank)\/?$/.test(location.pathname) &&
      Array.from(document.querySelectorAll('[role="tab"][aria-selected="true"]')).filter(visible)
        .filter(node => node.textContent.trim() === name).length === 1;
    const clean = value => String(value || '').trim();
    const rowData = (row, tabName = '商品卡榜') => {
      if (!isTab(tabName) || !row?.isConnected || !visible(row) || row.closest('[aria-busy="true"]') ||
          Array.from(document.querySelectorAll('.ant-spin-spinning,.byted-spin-spinning,.arco-spin-loading,[role="progressbar"]')).some(visible)) return null;
      const table = row.closest('table');
      const heads = table?.querySelectorAll('thead tr');
      const cells = Array.from(row.children).filter(node => node.tagName === 'TD');
      if (heads?.length !== 1) return null;
      const headers = Array.from(heads[0].querySelectorAll('th'));
      if (!cells.length || headers.length !== cells.length ||
          [...headers, ...cells].some(cell => cell.colSpan !== 1 || cell.rowSpan !== 1)) return null;
      const names = headers.map(header => clean(header.innerText).replace(/\s+/g, ''));
      if (new Set(names.filter(Boolean)).size !== names.filter(Boolean).length) return null;
      const productIndex = names.findIndex(name => name === '商品信息' || name === '商品');
      if (productIndex < 0) return null;
      const title = clean(cells[productIndex].innerText).split(/价格带|价格\s*[:：]/)[0].trim();
      if (title.length < 5 || title.length > 300) return null;
      const labels = tabName === '短视频榜'
        ? { '短视频用户支付金额': '成交额', '短视频成交件数': '成交件数',
          '短视频点击次数': '点击次数', '带货视频数': '带货视频' }
        : { '用户支付金额': '成交额', '商品卡成交件数': '成交件数',
          '点击次数': '点击次数', '点击成交转化率': '点击成交转化率' };
      const values = [];
      for (let i = 0; i < names.length; i++) {
        const label = labels[names[i]];
        if (!label) continue;
        const value = clean(cells[i].innerText).replace(/￥/g, '¥').replace(/[–—~～]/g, '-')
          .replace(/\s+/g, '').replace(/-¥/g, '-');
        if (/^¥?\d[\d,]*(?:\.\d+)?[万亿]?%?(?:-\d[\d,]*(?:\.\d+)?[万亿]?%?|\+)?$/.test(value)) values.push({ label, value });
      }
      const range = window[stateKey].currentDateRange();
      if (!values.length || range.source === 'default') return null;
      return { title, values, beginDate: range.beginDate, endDate: range.endDate, dateType: range.dateType };
    };
    const node = (tag, className, text) => {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (text != null) element.textContent = text;
      return element;
    };
    const supplementVideo = requestValue => {
      const id = String(requestValue?.productId || requestValue?.context?.productId || requestValue?.response?.context?.productId || '');
      if (!/^\d{6,32}$/.test(id) || !isTab('短视频榜')) return;
      const api = window[stateKey];
      const record = api.peekRank(id);
      if (!record) return;
      const row = Array.from(document.querySelectorAll('[data-chuangbao-product-id]'))
        .find(value => value.getAttribute('data-chuangbao-product-id') === id && visible(value));
      const data = rowData(row, '短视频榜');
      if (!data || ['beginDate', 'endDate', 'dateType'].some(key => record[key] !== data[key])) return;
      const labels = new Set(['成交额', '成交件数', '点击次数', '带货视频']);
      const extras = record.values.filter(value => !labels.has(value.label) && value.value !== '-' && value.value !== '' && value.value != null);
      // The native collector keeps its five-section transport unchanged. This
      // enriches only the same-scope visible video ranking returned by peekRank.
      const nextValues = [...data.values, ...extras];
      if (JSON.stringify(record.values) === JSON.stringify(nextValues)) return record;
      record.values = nextValues;
      const now = Date.now();
      if (!extras.length) {
        record.source = 'rank-page'; record.sourceLabel = '罗盘短视频榜'; record.updatedAt = now;
      } else {
        record.sourceLabel = '罗盘短视频榜（页面补充于 ' + new Date(now).toLocaleString('zh-CN', { hour12: false }) + '）';
      }
      return record;
    };
    let activePreview = null;
    const openPreview = row => {
      const data = rowData(row);
      if (!data) return false;
      document.getElementById(previewId)?.remove();
      const previousFocus = document.activeElement?.shadowRoot?.activeElement || document.activeElement;
      const overlay = node('div'); overlay.id = previewId;
      overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', previewId + '-title');
      const panel = node('section', 'cr-panel');
      const header = node('header', 'cr-header');
      const heading = node('div', 'cr-heading');
      const title = node('h2', '', data.title); title.id = previewId + '-title';
      heading.append(node('p', 'cr-eyebrow', '商品映射数据'), title,
        node('p', 'cr-meta', data.beginDate.slice(0, 10) + ' 至 ' + data.endDate.slice(0, 10)));
      const close = node('button', 'cr-close', '×'); close.type = 'button'; close.setAttribute('aria-label', '关闭');
      const dismiss = () => {
        overlay.remove(); activePreview = null;
        if (previousFocus?.isConnected) previousFocus.focus?.();
      };
      close.addEventListener('click', dismiss);
      overlay.addEventListener('click', event => { if (event.target === overlay) dismiss(); });
      overlay.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
        if (event.key === 'Tab') { event.preventDefault(); close.focus(); }
      });
      header.append(heading, close);
      const card = node('section', 'cr-card'); card.setAttribute('data-mapping-key', 'product-card');
      card.append(node('h3', '', '商品卡表现'), node('p', 'cr-source',
        '来源：罗盘商品卡榜 · 页面读取于 ' + new Date().toLocaleString('zh-CN', { hour12: false })));
      const metrics = node('dl', 'cr-metrics');
      for (const label of ['成交额', '成交件数', '点击次数', '点击成交转化率']) {
        const value = data.values.find(item => item.label === label); if (!value) continue;
        const item = node('div'); item.setAttribute('data-mapping-metric', label);
        item.append(node('dt', '', label), node('dd', '', value.value)); metrics.append(item);
      }
      card.append(metrics);
      const footer = node('footer', 'cr-footer');
      footer.append(node('span', '', '已展示 ' + data.values.length + ' 项可用数据'),
        node('span', '', '当前榜单页面数据 · 仅代表商品卡频道'));
      panel.append(header, card, footer); overlay.append(panel); document.documentElement.append(overlay);
      activePreview = { row, signature: JSON.stringify(data), dismiss };
      close.focus();
      return true;
    };
    const style = node('style'); style.id = previewId + '-style';
    style.textContent = `
      #${previewId}{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(20,33,61,.38);backdrop-filter:blur(3px);font:14px/1.6 "Microsoft YaHei UI","Microsoft YaHei",sans-serif;color:#14213d;text-align:left}
      #${previewId} *{box-sizing:border-box}
      #${previewId} .cr-panel{width:880px;max-width:100%;max-height:calc(100vh - 40px);overflow:auto;padding:28px;background:white;border:1px solid #dfe7f3;border-radius:18px;box-shadow:0 24px 80px #14213d33}
      #${previewId} h2,#${previewId} h3,#${previewId} p,#${previewId} dl,#${previewId} dd{margin:0}
      #${previewId} .cr-header{display:flex;justify-content:space-between;gap:18px;margin-bottom:22px}
      #${previewId} .cr-heading{min-width:0}#${previewId} h2{font-size:19px;color:#14213d;overflow-wrap:anywhere}
      #${previewId} .cr-eyebrow{margin-bottom:7px;color:#2f73ed;font-size:13px;font-weight:700}
      #${previewId} .cr-meta{margin-top:12px;color:#657694;font-size:12px}
      #${previewId} .cr-close{width:34px;height:34px;flex:0 0 34px;padding:0;border:1px solid #dfe7f3;border-radius:9px;background:#fff;color:#6f7f9c;font:24px Arial;cursor:pointer}
      #${previewId} .cr-close:focus-visible{outline:2px solid #2f73ed;outline-offset:3px}
      #${previewId} .cr-card{padding:20px;border:1px solid #c7dafe;border-radius:12px;background:#f5f8ff}
      #${previewId} h3{font-size:15px;font-weight:700}#${previewId} .cr-source{margin-top:5px;font-size:12px;color:#657694}
      #${previewId} .cr-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;margin-top:24px}
      #${previewId} .cr-metrics>div{min-width:0}#${previewId} dt{font-size:12px;color:#657694;margin-bottom:5px}
      #${previewId} dd{font-size:24px;font-weight:700;line-height:1.3;color:#215abe;letter-spacing:-.4px;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
      #${previewId} .cr-footer{display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px 16px;margin-top:20px;padding-top:13px;border-top:1px solid #e9eef6;color:#6f7f9c;font-size:11px}
      #chuangbao-compass-mapping-modal .cm-featured .cm-metrics:has(>.cm-metric:nth-child(4)) dd{font-size:24px}
      @media(max-width:560px){#${previewId}{padding:10px}#${previewId} .cr-panel{padding:18px;max-height:calc(100vh - 20px)}#${previewId} .cr-card{padding:16px}#${previewId} .cr-metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 14px}#${previewId} dd{font-size:21px}}
    `;
    document.documentElement.append(style);
    const scan = () => {
      if (activePreview && JSON.stringify(rowData(activePreview.row)) !== activePreview.signature) activePreview.dismiss();
      // Older live documents may re-render from an API snapshot after apply.
      // Keep the visible rank-only card in sync; successful detail cards retain priority.
      const modal = document.getElementById('chuangbao-compass-mapping-modal');
      const requestKey = modal?.getAttribute('data-request-key');
      const videoCard = modal?.querySelector('[data-mapping-key="video"][data-mapping-state="rank-partial"]');
      if (videoCard && requestKey) {
        const record = supplementVideo({ productId: requestKey.split('|')[0] });
        if (record && [record.productId, record.beginDate, record.endDate, record.dateType].join('|') === requestKey) {
          const metrics = videoCard.querySelector('.cm-metrics');
          const values = [...record.values].sort((a, b) => {
            const order = ['成交额', '点击次数', '成交件数', '带货视频', '订单数', '带货达人'];
            return order.indexOf(a.label) - order.indexOf(b.label);
          });
          const displayed = Array.from(metrics.children).map(item => ({ label: item.querySelector('dt').textContent, value: item.querySelector('dd').textContent }));
          if (JSON.stringify(displayed) !== JSON.stringify(values)) {
            metrics.replaceChildren(...values.map(value => {
              const item = node('div', 'cm-metric'); item.setAttribute('data-mapping-metric', value.label);
              item.append(node('dt', '', value.label), node('dd', '', value.value)); return item;
            }));
            modal.querySelector('[data-chuangbao-mapping-count]').textContent = '已展示 ' +
              modal.querySelectorAll('[data-mapping-metric]').length + ' 项可用数据';
          }
          const source = videoCard.querySelector('[data-chuangbao-rank-card-source]');
          const sourceText = '来源：' + record.sourceLabel + (record.source === 'rank-page' ? ' · 页面读取于 ' : ' · 获取于 ') +
            new Date(record.updatedAt).toLocaleString('zh-CN', { hour12: false });
          if (source && source.textContent !== sourceText) source.textContent = sourceText;
        }
      }
      // Normalize redundant currency signs for compact, readable interval labels.
      for (const value of document.querySelectorAll('#chuangbao-compass-mapping-modal [data-mapping-metric="成交额"] dd')) {
        if (value.textContent.includes('-¥')) value.textContent = value.textContent.replace(/-¥/g, '-');
      }
      for (const host of document.querySelectorAll('[data-chuangbao-action-host]')) {
        const shadow = host.shadowRoot;
        const original = shadow?.querySelector('button[data-action="map"]');
        if (!original) continue;
        const row = host.closest('tbody tr');
        let preview = shadow.querySelector('[data-card-rank-preview]');
        const shouldShow = original.disabled && !/^\d{6,32}$/.test(row?.getAttribute('data-chuangbao-product-id') || '') && !!rowData(row);
        if (shouldShow) {
          if (!preview) {
            preview = node('button', '', '映射数据'); preview.type = 'button';
            preview.setAttribute('data-card-rank-preview', '1'); preview.setAttribute('aria-label', '创爆映射数据');
            preview.title = '查看当前商品卡榜页面指标';
            preview.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); openPreview(row); });
            original.after(preview);
            original.setAttribute('data-card-preview-display', original.style.getPropertyValue('display'));
            original.setAttribute('data-card-preview-priority', original.style.getPropertyPriority('display'));
            original.style.setProperty('display', 'none', 'important');
          }
        } else if (preview) {
          preview.remove();
          const prior = original.getAttribute('data-card-preview-display');
          if (prior) original.style.setProperty('display', prior, original.getAttribute('data-card-preview-priority') || '');
          else original.style.removeProperty('display');
          original.removeAttribute('data-card-preview-display'); original.removeAttribute('data-card-preview-priority');
        }
      }
    };
    let scanTimer = null;
    const schedule = () => { if (scanTimer == null) scanTimer = setTimeout(() => { scanTimer = null; scan(); }, 150); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['aria-selected', 'aria-busy', 'data-chuangbao-product-id', 'data-row-key'] });
    Object.defineProperty(window, '__CHUANGBAO_CARD_RANK_PREVIEW_V1__', { value: { rescan: scan, supplementVideo }, configurable: false });
    schedule();
  }

  // The detail list lives in another WebView sharing this browser profile.
  // Exchange only the visible pagination count in memory, after the host has
  // authorized/bound the mapping context. No detail request or persistent cache.
  if (!window.__CHUANGBAO_VIDEO_LIST_COUNT_V1__ && typeof BroadcastChannel !== 'undefined' && typeof MutationObserver !== 'undefined') {
    const channel = new BroadcastChannel('chuangbao-selection-video-list-count-v1');
    const records = new Map();
    let context = null, pending = null, minimumDocumentTime = 0;
    const key = value => [value.productId, value.beginDate, value.endDate, value.dateType].join('|');
    const visible = value => !!value?.getClientRects?.().length && getComputedStyle(value).visibility !== 'hidden';
    const readDetail = () => {
      if (!/^\/shop\/chance\/(rank-product|product-rank)\/detail\/?$/.test(location.pathname)) return null;
      const productId = new URL(location.href).searchParams.get('product_id');
      if (!/^\d{6,32}$/.test(productId || '')) return null;
      const active = Array.from(document.querySelectorAll('[role="tab"][aria-selected="true"]')).filter(visible);
      if (!active.some(tab => tab.textContent.trim() === '视频分析')) return null;
      const tables = Array.from(document.querySelectorAll('table,[role="table"]')).filter(table => visible(table) &&
        /短视频信息/.test(Array.from(table.querySelectorAll('thead th,[role="columnheader"]')).map(h => h.textContent).join('|')));
      if (tables.length !== 1 || tables[0].closest('[aria-busy="true"]') ||
          Array.from(document.querySelectorAll('.ant-spin-spinning,.byted-spin-spinning,.arco-spin-loading,[role="progressbar"]')).some(visible)) return null;
      const range = window[stateKey].currentDateRange();
      if (range.source === 'default') return null;
      for (let parent = tables[0].parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        const pagers = Array.from(parent.querySelectorAll('[class*="pagination"],[class*="Pagination"],nav[aria-label*="分页"]'))
          .filter(pager => visible(pager) && !tables[0].contains(pager));
        const totals = pagers.map(pager => pager.textContent.match(/^\s*共\s*([\d,，]+)\s*条/))
          .filter(Boolean).map(match => Number(match[1].replace(/[,，]/g, '')));
        if (!totals.length) continue;
        if (new Set(totals).size !== 1 || !Number.isSafeInteger(totals[0]) || totals[0] < 0 || totals[0] > 100000000) return null;
        return { productId, beginDate: range.beginDate, endDate: range.endDate, dateType: range.dateType,
          total: totals[0], capturedAt: Date.now(), sourceDocumentTime: performance.timeOrigin };
      }
      return null;
    };
    const render = () => {
      const modal = document.getElementById('chuangbao-compass-mapping-modal');
      if (!modal || !context || modal.getAttribute('data-request-key') !== key(context)) return;
      const record = records.get(key(context));
      if (!record) return;
      const grid = modal.querySelector('[data-chuangbao-mapping-grid]');
      if (!grid) return;
      let card = grid.querySelector('[data-mapping-key="video-list"]');
      const signature = JSON.stringify(record);
      if (card?.getAttribute('data-list-count-signature') === signature) return;
      const element = (tag, className, text) => {
        const value = document.createElement(tag); value.className = className;
        if (text != null) value.textContent = text; return value;
      };
      if (card) card.remove();
      card = element('section', 'cm-card'); card.setAttribute('data-mapping-key', 'video-list');
      card.setAttribute('data-list-count-signature', signature);
      const head = element('div', 'cm-card-head');
      head.append(element('h3', 'cm-card-title', '带货视频列表'), element('span', 'cm-badge', '列表统计'));
      const source = element('p', 'cm-source', '来源：罗盘商品详情 · 视频分析列表 · 读取于 ' +
        new Date(record.capturedAt).toLocaleString('zh-CN', { hour12: false }));
      const metrics = element('dl', 'cm-metrics');
      const metric = element('div', 'cm-metric'); metric.setAttribute('data-mapping-metric', '带货视频列表数量');
      metric.append(element('dt', '', '带货视频列表数量'), element('dd', '', record.total.toLocaleString('zh-CN') + ' 条'));
      metrics.append(metric);
      const note = element('p', 'cm-source', '按详情页当前筛选条件统计，与分页栏“共几条”一致。');
      note.style.marginTop = '12px';
      card.append(head, source, metrics, note);
      grid.querySelector('.cm-empty')?.remove(); grid.append(card);
      const count = modal.querySelector('[data-chuangbao-mapping-count]');
      if (count) count.textContent = '已展示 ' + modal.querySelectorAll('[data-mapping-metric]').length + ' 项可用数据';
    };
    channel.onmessage = event => {
      const message = event.data;
      if (message?.type === 'query' && /^[a-zA-Z0-9-]{16,80}$/.test(message.nonce || '')) {
        const record = readDetail();
        if (record && key(record) === message.key) channel.postMessage({ type: 'count', nonce: message.nonce, record });
      } else if (message?.type === 'count' && pending && message.nonce === pending.nonce) {
        const record = message.record;
        if (!record || key(record) !== key(context) || !Number.isSafeInteger(record.total) || record.total < 0 || record.total > 100000000 ||
            !Number.isFinite(record.capturedAt) || Math.abs(Date.now() - record.capturedAt) > 10000 ||
            !Number.isFinite(record.sourceDocumentTime) || record.sourceDocumentTime < minimumDocumentTime || record.sourceDocumentTime > Date.now()) return;
        records.set(key(context), record);
        while (records.size > 100) records.delete(records.keys().next().value);
        pending.finish(); pending = null; render();
      }
    };
    const bind = async next => {
      if (!next?.scopeId || !next.documentId || !/^\d{6,32}$/.test(next.productId || '')) return;
      if (context && (context.scopeId !== next.scopeId || context.documentId !== next.documentId)) {
        records.clear(); minimumDocumentTime = Date.now();
      }
      if (pending) { pending.finish(); pending = null; }
      context = { ...next };
      if (/\/detail\/?$/.test(location.pathname)) {
        const record = readDetail(); if (record && key(record) === key(context)) records.set(key(context), record);
        render(); return;
      }
      await new Promise(resolve => {
        const nonce = crypto.randomUUID();
        const timer = setTimeout(() => { if (pending?.nonce === nonce) pending = null; resolve(); }, 350);
        pending = { nonce, finish: () => { clearTimeout(timer); resolve(); } };
        channel.postMessage({ type: 'query', nonce, key: key(context) });
      });
    };
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (!scheduled) { scheduled = true; setTimeout(() => { scheduled = false; render(); }, 80); }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    Object.defineProperty(window, '__CHUANGBAO_VIDEO_LIST_COUNT_V1__', { value: { bind, readDetail }, configurable: false });
    window.addEventListener('pagehide', () => { channel.close(); observer.disconnect(); }, { once: true });
  }

  // Install separately from the data singleton so already-open authenticated
  // documents receive the layout update on their next mapping operation.
  if (!window.__CHUANGBAO_MAPPING_TABS_V1__ && typeof MutationObserver !== 'undefined') {
    const modalId = 'chuangbao-compass-mapping-modal';
    const states = new WeakMap();
    const labels = { video: '短视频', overview: '成交总览', live: '直播', 'product-card': '商品卡', basic: '基础信息', 'video-list': '视频列表' };
    const style = document.createElement('style');
    style.textContent = `
      #${modalId}.cm-tabbed .cm-panel{overflow:visible;max-height:none;padding:24px;width:880px}
      #${modalId}.cm-tabbed .cm-header{margin-bottom:16px}
      #${modalId}.cm-tabbed .cm-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 16px;padding:5px;background:#f3f6fb;border-radius:10px}
      #${modalId}.cm-tabbed .cm-tab{flex:1;min-width:84px;padding:8px 12px;border:0;border-radius:7px;background:transparent;color:#657694;font:600 13px/1.5 "Microsoft YaHei",sans-serif;cursor:pointer;white-space:nowrap}
      #${modalId}.cm-tabbed .cm-tab[aria-selected="true"]{background:#fff;color:#2465cf;box-shadow:0 1px 5px #14213d14}
      #${modalId}.cm-tabbed .cm-card[hidden]{display:none!important}
      #${modalId}.cm-tabbed .cm-card{min-height:200px}
      #${modalId}.cm-tabbed .cm-metrics{grid-template-columns:repeat(3,minmax(0,1fr));gap:18px 24px;margin-top:18px}
      #${modalId}.cm-tabbed .cm-metric dd,#${modalId}.cm-tabbed .cm-featured .cm-metric dd{font-size:26px}
      #${modalId}.cm-tabbed .cm-basic .cm-metric dd{font-size:14px}
      #${modalId}.cm-tabbed .cm-basic .cm-metrics{grid-template-columns:2fr 1fr 1fr}
      #${modalId}.cm-tabbed .cm-footer{margin-top:16px;padding-top:10px}
      @media(max-width:560px),(max-height:620px){
        #${modalId}.cm-tabbed{padding:12px}
        #${modalId}.cm-tabbed .cm-panel{padding:16px}
        #${modalId}.cm-tabbed .cm-header{margin-bottom:12px}
        #${modalId}.cm-tabbed .cm-title{font-size:16px}
        #${modalId}.cm-tabbed .cm-meta{margin-top:6px}
        #${modalId}.cm-tabbed .cm-tabs{margin-bottom:12px;gap:4px}
        #${modalId}.cm-tabbed .cm-tab{min-width:72px;padding:6px 8px;font-size:12px}
        #${modalId}.cm-tabbed .cm-card{min-height:0;padding:14px}
        #${modalId}.cm-tabbed .cm-metrics{gap:12px 16px;margin-top:14px}
        #${modalId}.cm-tabbed .cm-metric dd,#${modalId}.cm-tabbed .cm-featured .cm-metric dd{font-size:21px}
        #${modalId}.cm-tabbed .cm-basic .cm-metric dd{font-size:13px}
        #${modalId}.cm-tabbed .cm-footer{margin-top:12px;padding-top:8px}
      }
      @media(max-width:560px){
        #${modalId}.cm-tabbed .cm-metrics,#${modalId}.cm-tabbed .cm-basic .cm-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
        #${modalId}.cm-tabbed .cm-basic .cm-metric:first-child{grid-column:1/-1}
      }`;
    document.documentElement.append(style);
    const sync = () => {
      const modal = document.getElementById(modalId), grid = modal?.querySelector('[data-chuangbao-mapping-grid]');
      if (!grid) return;
      const cards = Array.from(grid.querySelectorAll(':scope > [data-mapping-key]'));
      let state = states.get(modal);
      if (!state) {
        const nav = document.createElement('div'); nav.className = 'cm-tabs';
        nav.setAttribute('role', 'tablist'); nav.setAttribute('aria-label', '商品数据分组');
        grid.before(nav); state = { nav, active: '', signature: '' }; states.set(modal, state);
        modal.classList.add('cm-tabbed');
        nav.addEventListener('keydown', event => {
          const tabs = Array.from(nav.querySelectorAll('[role="tab"]'));
          const index = tabs.indexOf(document.activeElement);
          if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 :
            (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
          tabs[next].click(); tabs[next].focus();
        });
      }
      const keys = cards.map(card => card.getAttribute('data-mapping-key'));
      if (!keys.includes(state.active)) state.active = keys[0] || '';
      const signature = keys.join('|');
      if (state.signature !== signature) {
        state.signature = signature;
        state.nav.replaceChildren(...keys.map(key => {
          const tab = document.createElement('button'); tab.type = 'button'; tab.className = 'cm-tab';
          tab.textContent = modal.querySelector('[data-mapping-key="' + key + '"]')?.getAttribute('data-alliance-tab') || labels[key] || key; tab.id = modalId + '-tab-' + key;
          tab.setAttribute('role', 'tab'); tab.setAttribute('data-mapping-tab', key);
          tab.setAttribute('aria-controls', modalId + '-panel-' + key);
          tab.addEventListener('click', () => { state.active = key; sync(); });
          return tab;
        }));
      }
      state.nav.hidden = !cards.length;
      cards.forEach(card => {
        const key = card.getAttribute('data-mapping-key'), active = key === state.active;
        card.hidden = !active; card.id = modalId + '-panel-' + key;
        card.setAttribute('role', 'tabpanel'); card.setAttribute('aria-labelledby', modalId + '-tab-' + key);
      });
      state.nav.querySelectorAll('[role="tab"]').forEach(tab => {
        const active = tab.getAttribute('data-mapping-tab') === state.active;
        tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
      });
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    Object.defineProperty(window, '__CHUANGBAO_MAPPING_TABS_V1__', { value: { sync }, configurable: false });
    sync();
  }

  // Compact report treatment can also load into documents with the prior tabs.
  if (!window.__CHUANGBAO_MAPPING_COMPACT_V1__ && typeof MutationObserver !== 'undefined') {
    const modalId = 'chuangbao-compass-mapping-modal';
    const scope = '#' + modalId + '.cm-tabbed.cm-compact';
    const style = document.createElement('style');
    style.textContent = `
      ${scope} .cm-panel{width:1080px;padding:30px 34px;border-radius:18px}
      ${scope} .cm-header{margin-bottom:22px}
      ${scope} .cm-eyebrow{font-size:14px;margin-bottom:12px}
      ${scope} .cm-title{font-size:22px;line-height:1.5}
      ${scope} .cm-meta{margin-top:16px;font-size:14px;gap:8px 16px}
      ${scope} .cm-tabs{justify-content:flex-start;gap:16px;padding:0 0 12px;margin:0 0 22px;background:none;border-radius:0;border-bottom:1px solid #e4ebf5}
      ${scope} .cm-tab{flex:0 1 auto;min-width:88px;padding:9px 16px;font-size:14px}
      ${scope} .cm-tab:hover{background:#f4f7fd;color:#2465cf}
      ${scope} .cm-tab[aria-selected="true"]{background:#edf3ff;color:#2465cf;box-shadow:none}
      ${scope} .cm-grid{gap:8px}
      ${scope} .cm-card{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;column-gap:10px;min-height:0;padding:0;background:none;border:0;border-radius:0}
      ${scope} .cm-card-head{display:contents}
      ${scope} .cm-card-title{grid-column:1;grid-row:1;font-size:20px;line-height:1.5}
      ${scope} .cm-badge{grid-column:3;grid-row:1;font-size:12px;line-height:22px;background:#f1f6ff;border:1px solid #d9e7fc}
      ${scope} .cm-badge.cm-cached{background:#fff7e7;border-color:#f0dfb8}
      ${scope} .cm-source{grid-column:2;grid-row:1;font-size:12px;text-align:right;max-width:390px}
      ${scope} .cm-card>.cm-source:last-child{grid-column:1/-1;grid-row:3;text-align:left;max-width:none}
      ${scope} .cm-metrics{grid-column:1/-1;grid-row:2;grid-template-columns:repeat(var(--cm-metric-columns,5),minmax(0,1fr));gap:0;margin-top:16px;padding:26px 0 12px;border-top:1px solid #e4ebf5}
      ${scope} .cm-metric{padding:0 16px;border-left:1px solid #dce5f2}
      ${scope} .cm-metric:first-child{padding-left:0;border-left:0}
      ${scope} .cm-metric:last-child{padding-right:0}
      ${scope} .cm-metric dt{font-size:14px;line-height:1.6;margin-bottom:8px;white-space:nowrap}
      ${scope} .cm-metric dd,${scope} .cm-featured .cm-metric dd{font-size:28px;line-height:1.35;letter-spacing:-.7px;color:#14213d;white-space:nowrap}
      ${scope} .cm-metric[data-mapping-metric="成交额"] dd{color:#2f73ed;font-size:34px}
      ${scope} .cm-basic .cm-metrics{grid-template-columns:2fr 1fr 1fr}
      ${scope} .cm-basic .cm-metric dd{font-size:14px;letter-spacing:0;white-space:normal}
      ${scope} .cm-footer{margin-top:24px;padding-top:14px;font-size:12px}
      @media(max-width:1000px){
        ${scope} .cm-metric{padding:0 12px}
        ${scope} .cm-metric dd,${scope} .cm-featured .cm-metric dd{font-size:21px}
        ${scope} .cm-metric[data-mapping-metric="成交额"] dd{font-size:24px}
        ${scope} .cm-basic .cm-metric dd{font-size:13px}
      }
      @media(max-width:760px){
        ${scope} .cm-panel{padding:20px}
        ${scope} .cm-tabs{gap:6px}
        ${scope} .cm-tab{min-width:72px;padding:7px 10px;font-size:13px}
        ${scope} .cm-card{grid-template-columns:1fr auto}
        ${scope} .cm-badge{grid-column:2}
        ${scope} .cm-source{grid-column:1/-1;grid-row:2;text-align:left;max-width:none;margin-top:5px}
        ${scope} .cm-metrics{grid-row:3;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px 0}
        ${scope} .cm-card>.cm-source:last-child{grid-row:4}
        ${scope} .cm-metric:nth-child(3n+1){padding-left:0;border-left:0}
      }
      @media(max-width:560px){
        ${scope} .cm-panel{padding:16px}
        ${scope} .cm-title{font-size:16px}
        ${scope} .cm-header{margin-bottom:16px}
        ${scope} .cm-meta{margin-top:10px;gap:6px}
        ${scope} .cm-tabs{margin-bottom:16px;gap:4px}
        ${scope} .cm-tab{min-width:0;flex:1 0 auto;font-size:12px;padding:6px 8px}
        ${scope} .cm-card-title{font-size:17px}
        ${scope} .cm-metrics,${scope} .cm-basic .cm-metrics{grid-template-columns:repeat(2,minmax(0,1fr));padding-top:18px;gap:12px 0}
        ${scope} .cm-metric dt{font-size:12px;margin-bottom:5px}
        ${scope} .cm-metric:nth-child(n){padding:0 12px;border-left:1px solid #dce5f2}
        ${scope} .cm-metric:nth-child(2n+1){padding-left:0;border-left:0}
        ${scope} .cm-metric dd{font-size:21px}
        ${scope} .cm-basic .cm-metric dd{font-size:13px}
        ${scope} .cm-footer{margin-top:16px;padding-top:10px}
      }
      @media(max-height:620px){
        ${scope} .cm-header{margin-bottom:12px}
        ${scope} .cm-meta{margin-top:8px}
        ${scope} .cm-tabs{margin-bottom:14px;padding-bottom:8px}
        ${scope} .cm-metrics{padding-top:18px;margin-top:12px}
        ${scope} .cm-footer{margin-top:14px}
      }`;
    document.documentElement.append(style);
    const sync = () => {
      const modal = document.getElementById(modalId);
      if (!modal?.classList.contains('cm-tabbed')) return;
      modal.classList.add('cm-compact');
      const cards = Array.from(modal.querySelectorAll('[data-mapping-key]'));
      let visibleCount = 0, totalCount = 0;
      cards.forEach(card => {
        const count = card.querySelectorAll('[data-mapping-metric]').length;
        const columns = String(Math.min(count, 5) || 1);
        if (card.style.getPropertyValue('--cm-metric-columns') !== columns) card.style.setProperty('--cm-metric-columns', columns);
        totalCount += count;
        if (!card.hidden) visibleCount += count;
      });
      const counter = modal.querySelector('[data-chuangbao-mapping-count]');
      const text = '共 ' + totalCount + ' 项可用指标 · 当前 ' + visibleCount + ' 项';
      if (counter && totalCount && counter.textContent !== text) counter.textContent = text;
    };
    // Tab clicks only change attributes. Observe these separately from data
    // repainting, and avoid writes when nothing has changed.
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    Object.defineProperty(window, '__CHUANGBAO_MAPPING_COMPACT_V1__', { value: { sync }, configurable: false });
    sync();
  }

  // Presentation only. Query, cache, account scope and channel contracts stay in the data service.
  if (!window.__CHUANGBAO_ALLIANCE_REPORT_V4__ && typeof MutationObserver !== 'undefined') {
    const modalId = 'chuangbao-compass-mapping-modal';
    const scope = '#' + modalId + '.cm-alliance-report.cm-alliance-report-v4';
    const node = (tag, className, text) => {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (text != null) element.textContent = String(text);
      return element;
    };
    // Lucide icons, ISC license. Geometry is from the official icon library.
    // https://github.com/lucide-icons/lucide (license also in assets/home-web/icons/lucide-LICENSE.txt)
    const icons = {"user-round": "data:image/svg+xml,%3Csvg%0A%20%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%0A%20%20width%3D%2224%22%0A%20%20height%3D%2224%22%0A%20%20viewBox%3D%220%200%2024%2024%22%0A%20%20fill%3D%22none%22%0A%20%20stroke%3D%22%2364748b%22%0A%20%20stroke-width%3D%222%22%0A%20%20stroke-linecap%3D%22round%22%0A%20%20stroke-linejoin%3D%22round%22%0A%3E%0A%20%20%3Ccircle%20cx%3D%2212%22%20cy%3D%228%22%20r%3D%225%22%20/%3E%0A%20%20%3Cpath%20d%3D%22M20%2021a8%208%200%200%200-16%200%22%20/%3E%0A%3C/svg%3E%0A", "users-round": "data:image/svg+xml,%3Csvg%0A%20%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%0A%20%20width%3D%2224%22%0A%20%20height%3D%2224%22%0A%20%20viewBox%3D%220%200%2024%2024%22%0A%20%20fill%3D%22none%22%0A%20%20stroke%3D%22%2364748b%22%0A%20%20stroke-width%3D%222%22%0A%20%20stroke-linecap%3D%22round%22%0A%20%20stroke-linejoin%3D%22round%22%0A%3E%0A%20%20%3Cpath%20d%3D%22M18%2021a8%208%200%200%200-16%200%22%20/%3E%0A%20%20%3Ccircle%20cx%3D%2210%22%20cy%3D%228%22%20r%3D%225%22%20/%3E%0A%20%20%3Cpath%20d%3D%22M22%2020c0-3.37-2-6.5-4-8a5%205%200%200%200-.45-8.3%22%20/%3E%0A%3C/svg%3E%0A", "map-pin": "data:image/svg+xml,%3Csvg%0A%20%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%0A%20%20width%3D%2224%22%0A%20%20height%3D%2224%22%0A%20%20viewBox%3D%220%200%2024%2024%22%0A%20%20fill%3D%22none%22%0A%20%20stroke%3D%22%2364748b%22%0A%20%20stroke-width%3D%222%22%0A%20%20stroke-linecap%3D%22round%22%0A%20%20stroke-linejoin%3D%22round%22%0A%3E%0A%20%20%3Cpath%20d%3D%22M20%2010c0%204.993-5.539%2010.193-7.399%2011.799a1%201%200%200%201-1.202%200C9.539%2020.193%204%2014.993%204%2010a8%208%200%200%201%2016%200%22%20/%3E%0A%20%20%3Ccircle%20cx%3D%2212%22%20cy%3D%2210%22%20r%3D%223%22%20/%3E%0A%3C/svg%3E%0A", "graduation-cap": "data:image/svg+xml,%3Csvg%0A%20%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%0A%20%20width%3D%2224%22%0A%20%20height%3D%2224%22%0A%20%20viewBox%3D%220%200%2024%2024%22%0A%20%20fill%3D%22none%22%0A%20%20stroke%3D%22%2364748b%22%0A%20%20stroke-width%3D%222%22%0A%20%20stroke-linecap%3D%22round%22%0A%20%20stroke-linejoin%3D%22round%22%0A%3E%0A%20%20%3Cpath%20d%3D%22M21.42%2010.922a1%201%200%200%200-.019-1.838L12.83%205.18a2%202%200%200%200-1.66%200L2.6%209.08a1%201%200%200%200%200%201.832l8.57%203.908a2%202%200%200%200%201.66%200z%22%20/%3E%0A%20%20%3Cpath%20d%3D%22M22%2010v6%22%20/%3E%0A%20%20%3Cpath%20d%3D%22M6%2012.5V16a6%203%200%200%200%2012%200v-3.5%22%20/%3E%0A%3C/svg%3E%0A", "circle-help": "data:image/svg+xml,%3Csvg%0A%20%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%0A%20%20width%3D%2224%22%0A%20%20height%3D%2224%22%0A%20%20viewBox%3D%220%200%2024%2024%22%0A%20%20fill%3D%22none%22%0A%20%20stroke%3D%22%2364748b%22%0A%20%20stroke-width%3D%222%22%0A%20%20stroke-linecap%3D%22round%22%0A%20%20stroke-linejoin%3D%22round%22%0A%3E%0A%20%20%3Ccircle%20cx%3D%2212%22%20cy%3D%2212%22%20r%3D%2210%22%20/%3E%0A%20%20%3Cpath%20d%3D%22M9.09%209a3%203%200%200%201%205.83%201c0%202-3%203-3%203%22%20/%3E%0A%20%20%3Cpath%20d%3D%22M12%2017h.01%22%20/%3E%0A%3C/svg%3E%0A", "x": "data:image/svg+xml,%3Csvg%0A%20%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%0A%20%20width%3D%2224%22%0A%20%20height%3D%2224%22%0A%20%20viewBox%3D%220%200%2024%2024%22%0A%20%20fill%3D%22none%22%0A%20%20stroke%3D%22%2364748b%22%0A%20%20stroke-width%3D%222%22%0A%20%20stroke-linecap%3D%22round%22%0A%20%20stroke-linejoin%3D%22round%22%0A%3E%0A%20%20%3Cpath%20d%3D%22M18%206%206%2018%22%20/%3E%0A%20%20%3Cpath%20d%3D%22m6%206%2012%2012%22%20/%3E%0A%3C/svg%3E%0A"};
    const icon = name => { const img = node('img', 'ca-icon'); img.src = icons[name]; img.alt = ''; img.setAttribute('aria-hidden', 'true'); return img; };
    const style = node('style');
    style.textContent = `
      ${scope}{box-sizing:border-box;position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;background:rgba(20,33,61,.38);backdrop-filter:blur(3px);text-align:left;padding:8px;font:18px/1.5 "Segoe UI","Microsoft YaHei UI",sans-serif;color:#111a32}
      ${scope} .cm-panel{box-sizing:border-box;width:1040px!important;max-width:100%!important;padding:32px 40px 30px!important;max-height:none!important;overflow:visible!important;border:1px solid #e0e7ef;border-radius:18px;background:#fff}
      ${scope} *{box-sizing:border-box}
      ${scope} .cm-header{display:flex;align-items:flex-start;justify-content:space-between;position:relative;margin:0 0 24px!important;gap:12px}
      ${scope} .cm-title{display:flex;flex-wrap:wrap;align-items:baseline;gap:14px;font-size:38px!important;font-weight:700;line-height:1.4!important;letter-spacing:-.5px;color:#10162b}
      ${scope} .ca-subtitle{font-size:18px;font-weight:400;color:#8a96ab;letter-spacing:0}
      ${scope} .cm-eyebrow,${scope} .cm-grid,${scope} .cm-tabs,${scope} .cm-footer{display:none!important}
      ${scope} .cm-meta{display:flex;flex-wrap:wrap;gap:8px 20px!important;margin-top:16px!important;font-size:20px!important;line-height:1.6;color:#77849c}
      ${scope} .ca-product{color:#19223b;font-weight:600;max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      ${scope} .cm-meta .cm-period{border:0;background:none;padding:0;font:inherit;color:inherit}
      ${scope} .cm-meta .cm-period:last-child{padding-left:20px;border-left:1px solid #dce4ef}
      ${scope} .cm-heading{min-width:0;flex:1}
      ${scope} .cm-close{display:grid;place-items:center;cursor:pointer;flex-shrink:0;width:36px;height:36px;flex-basis:36px;border:0;border-radius:8px;background:transparent;box-shadow:none;padding:6px;color:#73809a}
      ${scope} .cm-close:hover{background:#f0f4fa}
      ${scope} .cm-close:focus-visible{outline:2px solid #2563eb;outline-offset:2px}
      ${scope} .ca-icon{display:inline-block;width:24px;height:24px;flex:none;vertical-align:middle}
      ${scope} .cm-close .ca-icon{width:24px;height:24px}
      ${scope} .ca-report{color:#111a32}
      ${scope} .ca-hero{display:grid;grid-template-columns:repeat(var(--ca-hero-columns,3),minmax(0,1fr));padding:8px 0 30px;margin:0;border-bottom:1px solid #dce5f2}
      ${scope} .ca-stat{min-width:0;margin:0;padding:0 36px;border-left:1px solid #dce5f2;--ca-color:#2563eb}
      ${scope} .ca-stat:first-child{padding-left:0;border-left:0}
      ${scope} .ca-stat:last-child{padding-right:0}
      ${scope} .ca-stat[data-alliance-metric="live.amount"]{--ca-color:#7c3aed}
      ${scope} .ca-stat[data-alliance-metric="overview.sales"]{--ca-color:#009e9c}
      ${scope} .ca-stat dt{font-size:22px;font-weight:400;color:#52627e;margin:0 0 6px}
      ${scope} .ca-stat dd{margin:0;color:var(--ca-color);font-size:64px;line-height:1.2;font-weight:700;letter-spacing:-1.5px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
      ${scope} .ca-stat dd.ca-long{font-size:42px;letter-spacing:-.5px}
      ${scope} .ca-stat:after{content:"";display:block;width:48px;height:4px;border-radius:3px;margin-top:12px;background:var(--ca-color);opacity:.7}
      ${scope} .ca-body{display:grid;grid-template-columns:minmax(0,1fr) 27%;border-bottom:1px solid #dce5f2}
      ${scope} .ca-channels{min-width:0;padding-right:30px}
      ${scope} .ca-table{width:100%;margin:0;border-collapse:collapse;table-layout:fixed;background:none}
      ${scope} .ca-table th,${scope} .ca-table td{padding:19px 0;vertical-align:middle;border:0;border-bottom:1px solid #e0e7f1;background:none;text-align:left;overflow-wrap:anywhere;line-height:1.4;font-variant-numeric:tabular-nums}
      ${scope} .ca-table th:first-child,${scope} .ca-table td:first-child{width:auto;border-left:0;padding-left:0}
      ${scope} .ca-table thead th{font-size:18px;color:#77869e;font-weight:400;padding:22px 0}
      ${scope} .ca-table tbody th{font-size:24px;font-weight:600;color:#111a32;padding-right:8px}
      ${scope} .ca-table tbody td{font-size:22px;font-weight:400;color:#111a32}
      ${scope} .ca-table tbody tr:last-child>*{border-bottom:0}
      ${scope} .ca-quantity{padding-right:30px!important}
      ${scope} .ca-quantity-text{display:flex;align-items:baseline;flex-wrap:wrap;gap:2px 6px}
      ${scope} .ca-count{font-size:30px;font-weight:650;white-space:nowrap}
      ${scope} .ca-share{display:inline-block;font-size:22px;line-height:1.5;color:#2563eb;font-weight:400;white-space:nowrap}
      ${scope} .ca-share-track{height:12px;margin-top:8px;border-radius:20px;background:#edf1f6;overflow:hidden}
      ${scope} .ca-share-fill{height:100%;max-width:100%;border-radius:inherit;background:#3485ff}
      ${scope} .ca-details{display:grid;grid-template-columns:.8fr 1fr 1.3fr;align-items:center;min-width:0}
      ${scope} .ca-detail{min-width:0;padding:0 14px;border-left:1px solid #e0e7f1}
      ${scope} .ca-detail:first-child{padding-left:0;border-left:0}
      ${scope} .ca-detail:last-child{padding-right:0}
      ${scope} .ca-detail-label{display:block;font-size:18px;font-weight:500;color:#5b6b84;margin-bottom:8px;white-space:normal}
      ${scope} .ca-detail-value{display:block;font-size:22px;font-weight:600;white-space:normal}
      ${scope} .ca-missing{color:#95a1b5!important;font-weight:400!important}
      ${scope} .ca-detail-value.ca-missing{font-size:19px!important}
      ${scope} .ca-roi{display:flex;flex-direction:column;align-items:stretch;min-width:0;padding:38px 48px 30px 34px;border-top:0;border-left:1px solid #dce5f2;gap:0;font-size:20px}
      ${scope} .ca-roi-heading{display:flex;align-items:center;gap:8px;font-size:28px;font-weight:600;color:#10162b;line-height:1.4}
      ${scope} .ca-roi-heading .ca-icon{width:23px;height:23px}
      ${scope} .ca-roi-value{display:block;margin:6px 0 28px;font-size:96px;font-weight:650;color:#ed8b09;line-height:1.2;letter-spacing:-2px;font-variant-numeric:tabular-nums}
      ${scope} .ca-roi-parameters{margin:8px 0 0}
      ${scope} .ca-roi-parameter{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:24px 0}
      ${scope} .ca-roi-parameter dt,${scope} .ca-roi-parameter dd{margin:0;font-size:24px;color:#202a42;font-weight:400}
      ${scope} .ca-roi-note{margin:42px 0 0;color:#8290a7;font-size:18px;line-height:1.6}
      ${scope} .ca-audience{display:flex;align-items:center;gap:26px;padding:24px 0;margin:0}
      ${scope} .ca-row-label{margin:0;font-size:24px;line-height:1.5;font-weight:600;white-space:nowrap;color:#19223b}
      ${scope} .ca-audience-values{display:flex;align-items:center;flex-wrap:wrap;gap:12px 24px;min-width:0;padding:0;border:0;font-size:22px;line-height:1.6;color:#52627e}
      ${scope} .ca-audience-values span+span:before{content:none}
      ${scope} .ca-audience-item{display:flex;align-items:center;gap:14px;min-width:0;overflow-wrap:anywhere}
      ${scope} .ca-audience-item+.ca-audience-item{border-left:1px solid #dce5f2;padding-left:24px}
      ${scope} .ca-audience-item .ca-icon{width:28px;height:28px}
      ${scope} .ca-note{margin:10px 0 0;color:#8592a8;font-size:18px;font-weight:400;line-height:1.6}
      ${scope} .ca-empty{padding:40px 18px;text-align:center;color:#657694}
      ${scope} .ca-empty strong{display:block;font-size:20px;color:#334460;margin-bottom:8px}
      ${scope} .ca-empty p{font-size:15px}
      @media(min-width:0px){
        ${scope} .cm-panel{padding:24px 30px!important}
        ${scope} .cm-header{margin-bottom:24px!important}
        ${scope} .cm-title{font-size:28px!important}
        ${scope} .ca-subtitle{font-size:15px}
        ${scope} .cm-meta{font-size:14px!important;margin-top:12px!important;gap:8px 16px!important}
        ${scope} .ca-hero{padding:4px 0 24px}
        ${scope} .ca-stat{padding:0 28px}
        ${scope} .ca-stat dt{font-size:18px}
        ${scope} .ca-stat dd{font-size:48px}
        ${scope} .ca-stat dd.ca-long{font-size:32px}
        ${scope} .ca-stat:after{width:38px;height:3px;margin-top:10px}
        ${scope} .ca-channels{padding-right:24px}
        ${scope} .ca-table th,${scope} .ca-table td{padding:16px 0}
        ${scope} .ca-table thead th{font-size:15px;padding:18px 0}
        ${scope} .ca-table tbody th{font-size:20px}
        ${scope} .ca-quantity{padding-right:22px!important}
        ${scope} .ca-count{font-size:22px}
        ${scope} .ca-share{font-size:16px}
        ${scope} .ca-share-track{height:10px;margin-top:6px}
        ${scope} .ca-detail{padding:0 10px}
        ${scope} .ca-detail-label{font-size:15px;margin-bottom:6px}
        ${scope} .ca-detail-value{font-size:18px}
        ${scope} .ca-detail-value.ca-missing{font-size:17px!important}
        ${scope} .ca-roi{padding:28px 20px 22px 26px}
        ${scope} .ca-roi-heading{font-size:22px}
        ${scope} .ca-roi-value{font-size:70px;margin-bottom:14px}
        ${scope} .ca-roi-parameter{padding:16px 0}
        ${scope} .ca-roi-parameter dt,${scope} .ca-roi-parameter dd{font-size:18px}
        ${scope} .ca-roi-note{font-size:14px;margin-top:24px}
        ${scope} .ca-audience{gap:20px;padding:20px 0}
        ${scope} .ca-row-label{font-size:19px}
        ${scope} .ca-audience-values{font-size:17px;gap:10px 18px}
        ${scope} .ca-audience-item{gap:10px}
        ${scope} .ca-audience-item+.ca-audience-item{padding-left:18px}
        ${scope} .ca-audience-item .ca-icon{width:24px;height:24px}
        ${scope} .ca-note{font-size:14px;margin-top:8px}
      }
      @media(min-width:0px){
        ${scope} .cm-panel{padding:18px 24px!important}
        ${scope} .cm-header{margin-bottom:18px!important}
        ${scope} .cm-title{font-size:24px!important}
        ${scope} .cm-meta{font-size:12px!important;margin-top:8px!important;gap:6px 12px!important}
        ${scope} .ca-product{max-width:300px}
        ${scope} .ca-subtitle{font-size:13px}
        ${scope} .cm-meta .cm-period:last-child{padding-left:12px}
        ${scope} .ca-hero{padding-bottom:18px}
        ${scope} .ca-stat{padding:0 24px}
        ${scope} .ca-stat dt{font-size:16px}
        ${scope} .ca-stat dd{font-size:40px}
        ${scope} .ca-channels{padding-right:20px}
        ${scope} .ca-table th,${scope} .ca-table td{padding:13px 0}
        ${scope} .ca-table thead th{font-size:13px;padding:15px 0}
        ${scope} .ca-table tbody th{font-size:18px}
        ${scope} .ca-quantity{padding-right:18px!important}
        ${scope} .ca-count{font-size:19px}
        ${scope} .ca-share{font-size:14px}
        ${scope} .ca-share-track{height:8px;margin-top:6px}
        ${scope} .ca-detail{padding:0 8px}
        ${scope} .ca-detail-label{font-size:15px;margin-bottom:5px}
        ${scope} .ca-detail-value{font-size:18px}
        ${scope} .ca-detail-value.ca-missing{font-size:17px!important}
        ${scope} .ca-roi{padding:24px 16px 16px 22px}
        ${scope} .ca-roi-heading{font-size:19px;gap:6px}
        ${scope} .ca-roi-heading .ca-icon{width:18px;height:18px}
        ${scope} .ca-roi-value{font-size:60px;margin-bottom:10px}
        ${scope} .ca-roi-parameter{padding:14px 0}
        ${scope} .ca-roi-parameter dt,${scope} .ca-roi-parameter dd{font-size:16px}
        ${scope} .ca-roi-note{font-size:12px;margin-top:22px}
        ${scope} .ca-audience{gap:18px;padding:18px 0}
        ${scope} .ca-row-label{font-size:16px}
        ${scope} .ca-audience-values{font-size:15px;gap:8px 14px}
        ${scope} .ca-audience-item{gap:8px}
        ${scope} .ca-audience-item+.ca-audience-item{padding-left:14px}
        ${scope} .ca-audience-item .ca-icon{width:22px;height:22px}
        ${scope} .ca-note{font-size:12px;margin-top:6px}
      }
      @media(max-width:850px),(max-height:740px){
        ${scope} .cm-panel{padding:14px 18px!important}
        ${scope} .cm-header{margin-bottom:12px!important}
        ${scope} .cm-title{font-size:22px!important}
        ${scope} .cm-meta{font-size:11px!important;margin-top:5px!important;gap:4px 8px!important}
        ${scope} .ca-product{max-width:250px}
        ${scope} .ca-stat{padding:0 16px}
        ${scope} .ca-stat dt{font-size:14px}
        ${scope} .ca-stat dd{font-size:32px;letter-spacing:-.5px}
        ${scope} .ca-stat dd.ca-long{font-size:25px}
        ${scope} .ca-stat:after{width:30px;margin-top:7px}
        ${scope} .ca-hero{padding-bottom:14px}
        ${scope} .ca-channels{padding-right:14px}
        ${scope} .ca-table th,${scope} .ca-table td{padding:10px 0}
        ${scope} .ca-table thead th{font-size:11px;padding:11px 0}
        ${scope} .ca-table tbody th{font-size:15px}
        ${scope} .ca-quantity{padding-right:12px!important}
        ${scope} .ca-count{font-size:16px}
        ${scope} .ca-share{font-size:12px}
        ${scope} .ca-detail{padding:0 6px}
        ${scope} .ca-detail-label{font-size:13px;white-space:normal}
        ${scope} .ca-detail-value{font-size:16px;white-space:normal}
        ${scope} .ca-detail-value.ca-missing{font-size:15px!important}
        ${scope} .ca-roi{padding:18px 12px 14px 16px}
        ${scope} .ca-roi-heading{font-size:16px}
        ${scope} .ca-roi-value{font-size:50px;margin-bottom:6px}
        ${scope} .ca-roi-parameter{padding:10px 0}
        ${scope} .ca-roi-parameter dt,${scope} .ca-roi-parameter dd{font-size:14px}
        ${scope} .ca-roi-note{font-size:11px;margin-top:16px}
        ${scope} .ca-audience{gap:16px;padding:14px 0}
        ${scope} .ca-row-label{font-size:14px}
        ${scope} .ca-audience-values{font-size:13px;gap:6px 10px}
        ${scope} .ca-audience-item+.ca-audience-item{padding-left:10px}
        ${scope} .ca-audience-item .ca-icon{width:20px;height:20px}
        ${scope} .ca-note{font-size:11px;margin-top:4px}
      }
      ${scope} .ca-loading{min-height:min(586px,calc(100vh - 210px));display:flex;flex-direction:column;justify-content:center;align-items:center;gap:14px;text-align:center;color:#77849c}
      ${scope} .ca-loading strong{font-size:23px;font-weight:600;letter-spacing:.4px;color:#30436b}
      ${scope} .ca-loading p{font-size:14px;color:#7d8ba5;max-width:600px;overflow-wrap:anywhere;margin:0}
      ${scope} .ca-security-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin-top:8px}
      ${scope} .ca-security-actions button{padding:10px 18px;border:1px solid #1769ff;border-radius:8px;background:#fff;color:#1769ff;font-size:14px;cursor:pointer}
      ${scope} .ca-security-actions button:first-child{background:#1769ff;color:#fff}
      ${scope} .ca-security-actions button:disabled{opacity:.55;cursor:wait}
      ${scope} .ca-security-actions button:focus-visible{outline:3px solid #9bbfff;outline-offset:3px}
      ${scope} .ca-loading-track{position:relative;isolation:isolate;width:min(200px,70vw);height:8px;margin-bottom:6px;border-radius:999px;overflow:hidden;background:linear-gradient(100deg,#6d94ed 0%,#8393e2 48%,#a08ad2 100%);box-shadow:0 4px 16px rgba(105,126,198,.22),inset 0 1px 0 rgba(255,255,255,.32)}
      ${scope} .ca-loading-track::after{content:'';position:absolute;inset:0 auto 0 -75%;width:70%;border-radius:inherit;background:linear-gradient(100deg,rgba(255,255,255,0),rgba(238,247,255,.35) 30%,rgba(255,255,255,.95) 52%,rgba(242,237,255,.4) 70%,rgba(255,255,255,0));animation:ca-mapping-loading-light 2.2s cubic-bezier(.4,0,.2,1) infinite;will-change:transform}
      @keyframes ca-mapping-loading-light{from{transform:translateX(0)}to{transform:translateX(240%)}}
      @media(prefers-reduced-motion:reduce){${scope} .ca-loading-track::after{animation:none;transform:translateX(150%);will-change:auto}}
      @media(max-height:740px){${scope} .ca-loading{min-height:min(430px,calc(100vh - 180px))}}
      @media(max-width:620px){
        ${scope} .cm-panel{padding:14px!important}
        ${scope} .ca-body{grid-template-columns:minmax(0,1fr)}
        ${scope} .ca-channels{padding-right:0}
        ${scope} .ca-roi{display:grid;grid-template-columns:140px minmax(0,1fr);gap:0 16px;border-left:0;border-top:1px solid #dce5f2;padding:12px 0}
        ${scope} .ca-roi-heading{font-size:15px}
        ${scope} .ca-roi-value{font-size:44px;margin:0;grid-column:1;grid-row:2/4}
        ${scope} .ca-roi-parameters{grid-column:2;grid-row:1/3;margin:0}
        ${scope} .ca-roi-parameter{padding:5px 0}
        ${scope} .ca-roi-note{grid-column:2;margin:6px 0 0;font-size:10px}
        ${scope} .ca-audience{gap:12px;align-items:flex-start}
        ${scope} .ca-audience-values{gap:5px 8px}
        ${scope} .ca-audience-item+.ca-audience-item{padding-left:0;border:0}
        ${scope} .ca-stat{padding:0 12px}
        ${scope} .ca-stat dd{font-size:27px}
        ${scope} .ca-stat dt{font-size:12px}
      }`;
    document.documentElement.append(style);
    const present = value => value != null && !['', '-', '—', '--', '暂无数据', '暂未获取'].includes(String(value).trim());
    const shortMoney = value => {
      const match = /^¥([\d,]+(?:\.\d+)?)$/.exec(String(value));
      if (!match) return value;
      const amount = Number(match[1].replace(/,/g, ''));
      return amount >= 100000000 ? '¥' + (amount / 100000000).toFixed(2) + '亿' : amount >= 10000 ? '¥' + (amount / 10000).toFixed(2) + '万' : value;
    };
    const render = result => {
      const modal = document.getElementById(modalId);
      if (!modal || result?.source !== 'alliance' || modal.getAttribute('data-request-key') !== [result.productId, result.beginDate, result.endDate, result.dateType].join('|')) return;
      const panel = modal.querySelector('.cm-panel'), grid = modal.querySelector('[data-chuangbao-mapping-grid]');
      if (!panel || !grid) return;
      modal.removeAttribute('aria-busy');
      modal.querySelector('.ca-loading')?.remove();
      const signature = JSON.stringify(['analysis-desk-v4', result.productId, result.beginDate, result.endDate, result.cached, result.sections, result.message]);
      if (modal.querySelector('.ca-report')?.getAttribute('data-report-signature') === signature) return;
      modal.classList.add('cm-alliance-report', 'cm-alliance-report-v4');
      const title = modal.querySelector('.cm-title'), meta = modal.querySelector('.cm-meta');
      if (title && !modal.hasAttribute('data-alliance-product-title')) modal.setAttribute('data-alliance-product-title', title.textContent);
      if (title) title.replaceChildren(document.createTextNode('商品映射数据'), node('span', 'ca-subtitle', '精简分析台'));
      const close = modal.querySelector('.cm-close'); if (close) close.replaceChildren(icon('x'));
      if (meta) {
        const name = modal.getAttribute('data-alliance-product-title') || '当前商品';
        const product = node('span', 'ca-product', '商品：' + name); product.title = name;
        meta.replaceChildren(product, node('span', 'cm-period', '商品 ID：' + result.productId), node('span', 'cm-period', result.beginDate.slice(0, 10) + ' 至 ' + result.endDate.slice(0, 10)));
      }
      const get = (key, label) => {
        const section = result.sections.find(value => value.key === key && value.source === 'alliance' && value.ok);
        const found = section?.values.find(value => value.label === label && present(value.value));
        return found ? String(found.value) : null;
      };
      const report = node('div', 'ca-report'); report.setAttribute('data-report-signature', signature);
      if (result.unavailableDetails) {
        const explanation = node('div', 'ca-empty');
        explanation.append(node('strong', '', '查无数据可用'), node('p', '', String(result.message || '').replace(/^精选联盟未提供/, '未获取到')));
        report.append(explanation);
        // Read only the already captured, same-product/date/account ranking.
        // Keep channel labels and intervals; never infer other channels or ROI.
        const ranks = window[stateKey].rankSourcesFor(result.productId, result);
        for (const key of ['video', 'overview', 'live', 'product-card']) {
          const rank = ranks[key];
          if (!rank?.values?.length) continue;
          const card = node('section', 'ca-rank-fallback'); card.setAttribute('data-rank-channel', key);
          card.style.cssText = 'border-top:1px solid #dce5f2;padding:18px 0';
          card.append(node('h3', '', (rank.sourceLabel || '罗盘榜单') + ' · 已有数据'));
          const metrics = node('dl', 'ca-hero'); metrics.style.cssText = 'display:flex;flex-wrap:wrap;gap:16px 28px;padding:12px 0';
          for (const item of rank.values.filter(value => present(value.value))) {
            const cell = node('div', ''); cell.append(node('dt', '', item.label), node('dd', '', String(item.value)));
            cell.lastElementChild.style.cssText = 'margin:6px 0 0;color:#4566c5;font-size:22px;font-weight:600'; metrics.append(cell);
          }
          const source = node('p', 'ca-note', '来源：' + rank.sourceLabel + ' · ' + result.beginDate.slice(0, 10) + ' 至 ' + result.endDate.slice(0, 10) + ' · 获取于 ' + new Date(rank.updatedAt).toLocaleString('zh-CN', {hour12:false}));
          card.append(metrics, source); report.append(card);
        }
        if (!report.querySelector('.ca-rank-fallback')) report.append(node('p', 'ca-note', '当前页面也没有可补充的同商品、同周期榜单数据。'));
        modal.querySelector('.ca-report')?.remove(); grid.before(report); return;
      }
      const numericCount = value => value !== null && /^\d+(?:,\d{3})*$/.test(value) && Number.isSafeInteger(Number(value.replace(/,/g, ''))) ? Number(value.replace(/,/g, '')) : null;
      const total = numericCount(get('overview', '总成交数量'));
      const quantities = [get('overview', '直播'), get('overview', '短视频'), get('overview', '图文'), get('overview', '橱窗'), get('product-card', '其他渠道成交数量')].map(numericCount);
      const sharesValid = total > 0 && quantities.every(value => value !== null) && quantities.reduce((a, b) => a + b, 0) === total;
      const highlights = [['短视频成交额', get('video', '成交额'), 'video.amount'], ['直播成交额', get('live', '成交额'), 'live.amount'], ['总成交数量', get('overview', '总成交数量'), 'overview.sales']].filter(value => value[1] !== null || result.salesUnavailable);
      if (highlights.length) {
        const hero = node('dl', 'ca-hero'); hero.style.setProperty('--ca-hero-columns', highlights.length);
        highlights.forEach(([label, value, id]) => {
          const cell = node('div', 'ca-stat'); cell.setAttribute('data-alliance-metric', id);
          const display = value === null ? '未返回' : id.endsWith('.amount') ? shortMoney(value) : value;
          const number = node('dd', value === null ? 'ca-missing' : String(display).length > 11 ? 'ca-long' : '', display); number.title = value ?? '所选周期明细未返回';
          cell.append(node('dt', '', label), number); hero.append(cell);
        }); report.append(hero);
      }
      const rows = [
        { name: '短视频', key: 'video', values: [get('video', '成交数量') ?? get('overview', '短视频'), get('video', '平均成交单价'), get('video', '视频浏览次数（PV）'), get('video', '带货视频（日累计）')] },
        { name: '直播', key: 'live', values: [get('live', '成交数量') ?? get('overview', '直播'), get('live', '平均成交单价'), null, get('live', '带货场次（日累计）')] },
        { name: '图文', key: 'image', values: [get('overview', '图文'), null, null, null] },
        { name: '橱窗', key: 'showcase', values: [get('overview', '橱窗'), null, null, null] },
        { name: '其他（差额）', key: 'other', values: [get('product-card', '其他渠道成交数量'), null, null, null] }
      ].filter(row => row.values.some(value => value !== null) || result.salesUnavailable);
      const body = node('div', 'ca-body');
      if (rows.length) {
        const channels = node('div', 'ca-channels'), table = node('table', 'ca-table'); table.setAttribute('aria-label', '渠道成交数量与明细');
        const colgroup = node('colgroup'); ['17%', '33%', '50%'].forEach(width => { const col = node('col'); col.style.width = width; colgroup.append(col); });
        const head = node('thead'), header = node('tr'); ['渠道', sharesValid ? '成交数量（占比）' : '成交数量', '渠道明细'].forEach(label => { const th = node('th', '', label); th.scope = 'col'; header.append(th); }); head.append(header);
        const tbody = node('tbody');
        rows.forEach(row => {
          const line = node('tr'); line.setAttribute('data-channel', row.key);
          const label = node('th', '', row.name); label.scope = 'row'; line.append(label);
          const quantity = node('td', 'ca-quantity'), value = row.values[0], count = numericCount(value), countLine = node('div', 'ca-quantity-text');
          const number = node('span', value === null ? 'ca-count ca-missing' : 'ca-count', value ?? '未返回');
          if (value !== null) number.setAttribute('data-alliance-metric', row.key + '.sales'); countLine.append(number); quantity.append(countLine);
          if (sharesValid && count !== null && count <= total) {
            const percent = count / total * 100;
            const percentLabel = percent > 0 && percent < .1 ? '<0.1%' : Number(percent.toFixed(1)) + '%';
            const share = node('span', 'ca-share', '(' + percentLabel + ')'); share.title = '成交数量占比：' + count.toLocaleString('zh-CN') + ' ÷ ' + total.toLocaleString('zh-CN'); countLine.append(share);
            const track = node('div', 'ca-share-track'), fill = node('div', 'ca-share-fill'); track.setAttribute('aria-hidden', 'true'); fill.style.width = percent + '%'; if (count > 0) fill.style.minWidth = '6px'; track.append(fill); quantity.append(track);
          }
          line.append(quantity);
          const detailsCell = node('td'), details = node('div', 'ca-details'), detailed = ['video', 'live'].includes(row.key);
          ['平均单价', '浏览次数', row.key === 'live' ? '带货场次（日累计）' : '带货视频（日累计）'].forEach((heading, index) => {
            const value = row.values[index + 1], item = node('div', 'ca-detail');
            if (detailed) item.append(node('span', 'ca-detail-label', heading));
            const display = value === null ? (detailed ? '未返回' : '—') : index === 1 ? value + ' PV' : index === 2 ? (row.key === 'video' ? '视频 ' : '场次 ') + value : value;
            const number = node('span', 'ca-detail-value' + (value === null ? ' ca-missing' : ''), display);
            if (value !== null) number.setAttribute('data-alliance-metric', row.key + '.' + ['average', 'pv', 'content'][index]); item.append(number); details.append(item);
          }); detailsCell.append(details); line.append(detailsCell); tbody.append(line);
        }); table.append(colgroup, head, tbody); channels.append(table); body.append(channels);
      }
      if (highlights.length || get('overview', '当前佣金比例') !== null) {
        const roi = node('aside', 'ca-roi'); roi.setAttribute('aria-label', '预估保本 ROI');
        const heading = node('div', 'ca-roi-heading', '预估保本 ROI'), help = icon('circle-help');
        const formula = '1 ÷ [佣金比例 × 0.9 × (1－预计退货率)]；预估值，不是实际投放 ROI。当前佣金不代表所选历史周期佣金。';
        help.title = formula; heading.append(help);
        const current = get('overview', '当前佣金比例'), raw = current?.replace(/%$/, '').trim();
        const commission = raw && /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : NaN, refund = 15;
        const valid = commission > 0 && commission <= 100;
        const output = node('strong', 'ca-roi-value', valid ? (1 / (commission / 100 * .9 * (1 - refund / 100))).toFixed(2) : '暂无法计算'); output.title = formula;
        if (!valid) { output.classList.add('ca-missing'); output.style.setProperty('font-size', '30px', 'important'); }
        const parameters = node('dl', 'ca-roi-parameters');
        [['佣金', Number.isFinite(commission) && commission >= 0 && commission <= 100 ? commission + '%' : '未返回', 'commission'], ['预计退货率', refund + '%', 'refund']].forEach(([label, value, key]) => {
          const pair = node('div', 'ca-roi-parameter'), number = node('dd', '', value); number.setAttribute('data-roi-value', key); pair.append(node('dt', '', label), number); parameters.append(pair);
        });
        roi.append(heading, output);
        if (!valid) roi.append(node('p', 'ca-note', commission === 0 ? '当前佣金为 0，无法估算保本 ROI。' : '缺少当前商品佣金，暂无法计算。'));
        roi.append(parameters); body.append(roi);
      }
      if (body.children.length) { if (body.children.length === 1) body.style.gridTemplateColumns = 'minmax(0,1fr)'; report.append(body); }
      const audience = [['主要性别', 'user-round'], ['主要年龄', 'users-round'], ['主要地区', 'map-pin'], ['主要人群', 'graduation-cap']].map(([label, image]) => ({ label, image, value: get('basic', label) })).filter(item => item.value !== null);
      if (audience.length) {
        const strip = node('div', 'ca-audience'), values = node('div', 'ca-audience-values');
        audience.forEach(item => { const cell = node('span', 'ca-audience-item'), text = node('span', '', item.value); text.title = item.label; text.setAttribute('data-alliance-metric', 'audience.' + item.label); cell.append(icon(item.image), text); values.append(cell); });
        strip.append(node('p', 'ca-row-label', '购买人群（近30天）'), values); report.append(strip);
      }
      if (!report.children.length) {
        const empty = node('div', 'ca-empty'); empty.append(node('strong', '', '当前周期暂无可展示的数据'), node('p', '', result.message || '未返回完整指标，请核对商品和日期。')); report.append(empty);
      }
      if (result.salesUnavailable) {
        const ranks = window[stateKey].rankSourcesFor(result.productId, result);
        for (const key of ['video', 'overview', 'live', 'product-card']) {
          const rank = ranks[key]; if (!rank?.values?.length) continue;
          const card = node('section', 'ca-rank-fallback'); card.setAttribute('data-rank-channel', key);
          card.append(node('h3', '', (rank.sourceLabel || '罗盘榜单') + ' · 已有数据'));
          const values = node('p', 'ca-note', rank.values.filter(item => present(item.value)).map(item => item.label + '：' + item.value).join('；'));
          card.append(values, node('p', 'ca-note', result.beginDate.slice(0, 10) + ' 至 ' + result.endDate.slice(0, 10) + ' · 获取于 ' + new Date(rank.updatedAt).toLocaleString('zh-CN', { hour12: false })));
          report.append(card);
        }
      }
      const note = node('p', 'ca-note', (result.salesUnavailable ? '部分成交明细未返回，缺失明细或全零占位未计为真实成交。' : '') + '日累计可能跨日重复；其他渠道为差额。' + (result.cached ? ' 本次展示5分钟内缓存。' : ''));
      note.title = '其他渠道为差额，非商品卡专属数据。购买人群为近30天，与所选成交周期独立。'; report.append(note);
      modal.querySelector('.ca-report')?.remove(); grid.before(report);
    };
    const api = window[stateKey], cloud = api.cloud, showSnapshot = api.showSnapshot;
    let pending = null;
    const pendingKey = item => [item.productId, item.range.beginDate, item.range.endDate, item.range.dateType].join('|');
    const watchDismiss = (modal, item) => {
      modal.addEventListener('click', event => {
        if (event.target === modal || event.target.closest('.cm-close')) item.dismissed = true;
      }, true);
      modal.addEventListener('keydown', event => { if (event.key === 'Escape') item.dismissed = true; }, true);
    };
    const showPending = item => {
      if (item.dismissed) return;
      const previousFocus = document.activeElement;
      document.getElementById(modalId)?.remove();
      const modal = node('div', 'cm-overlay cm-alliance-report cm-alliance-report-v4'); modal.id = modalId;
      modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-busy', 'true');
      modal.setAttribute('aria-labelledby', modalId + '-title'); modal.setAttribute('data-request-key', pendingKey(item));
      modal.setAttribute('data-alliance-product-title', item.title);
      const panel = node('section', 'cm-panel'), header = node('div', 'cm-header'), info = node('div', 'cm-heading');
      const title = node('div', 'cm-title', '商品映射数据'); title.id = modalId + '-title'; title.append(node('span', 'ca-subtitle', '精简分析台'));
      const meta = node('div', 'cm-meta'), product = node('span', 'ca-product', '商品：' + item.title); product.title = item.title;
      meta.append(product, node('span', 'cm-period', '商品 ID：' + item.productId));
      if (item.range.beginDate && item.range.endDate) meta.append(node('span', 'cm-period', item.range.beginDate.slice(0, 10) + ' 至 ' + item.range.endDate.slice(0, 10)));
      info.append(title, meta); const close = node('button', 'cm-close'); close.type = 'button'; close.setAttribute('aria-label', '关闭商品映射'); close.append(icon('x'));
      const dismiss = () => { item.dismissed = true; modal.remove(); if (previousFocus?.isConnected) previousFocus.focus?.({preventScroll:true}); };
      close.addEventListener('click', dismiss);
      modal.addEventListener('click', event => { if (event.target === modal) dismiss(); });
      modal.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
        if (event.key === 'Tab') {
          const buttons = [...modal.querySelectorAll('button:not(:disabled)')];
          const index = buttons.indexOf(document.activeElement);
          event.preventDefault(); buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
        }
      });
      const loading = node('div', 'ca-loading'); loading.setAttribute('role', 'status'); loading.setAttribute('aria-live', 'polite');
      const progress = node('div', 'ca-loading-track'); progress.setAttribute('role', 'progressbar'); progress.setAttribute('aria-label', '正在加载商品映射数据');
      loading.append(progress, node('strong', '', '加载中…'), node('p', '', '正在查询商品数据，请稍候。'));
      const grid = node('div', 'cm-grid'); grid.setAttribute('data-chuangbao-mapping-grid', '');
      header.append(info, close); panel.append(header, loading, grid); modal.append(panel); document.documentElement.append(modal); close.focus({preventScroll:true});
      watchDismiss(modal, item);
    };
    api.cloud = async value => {
      const command = value?.command;
      if (command === 'alliance-security-feedback') {
        const modal = document.getElementById(modalId);
        if (!modal || !value.token || modal.getAttribute('data-security-token') !== value.token) return {status:'stale-presentation'};
        if (value.retrying) { modal.remove(); return {status:'retrying'}; }
        const message = modal.querySelector('.ca-loading p'); if (message) message.textContent = value.message;
        modal.querySelectorAll('.ca-security-actions button').forEach(button => { button.disabled = false; });
        return {status:'security-feedback-presented'};
      }
      if (command === 'alliance-focus') {
        if (!pending || pending.finished || value.requestId !== pending.requestId) return {status:'stale-presentation'};
        pending.dismissed = false;
        if (!document.getElementById(modalId)) showPending(pending);
        const modal = document.getElementById(modalId);
        const message = modal?.querySelector('.ca-loading p');
        if (message) message.textContent = '正在查询上方商品，请稍候。本次不会重复发起查询。';
        modal?.querySelector('.cm-close')?.focus({preventScroll:true});
        return {status:'pending', requestId:pending.requestId};
      }
      if (command === 'alliance-pending') {
        if (!/^[a-zA-Z0-9_-]{8,128}$/.test(String(value.requestId || '')) || !/^\d{6,30}$/.test(String(value.productId || ''))) return {status:'invalid-presentation'};
        if (pending && !pending.finished) return {status:'pending', requestId:pending.requestId};
        pending = {requestId:value.requestId, productId:String(value.productId), title:String(value.title || '当前商品'), range:api.currentDateRange() || {}, dismissed:false, finished:false};
        if (!value.silent) showPending(pending);
        return {status:'pending', requestId:pending.requestId};
      }
      if (command === 'alliance-failed') {
        if (!pending || value.requestId !== pending.requestId || String(value.productId) !== pending.productId) return {status:'stale-presentation'};
        pending.finished = true;
        if (pending.dismissed) return {status:'dismissed'};
        let modal = document.getElementById(modalId); if (!modal) { showPending(pending); modal = document.getElementById(modalId); }
        modal.removeAttribute('aria-busy'); const loading = modal.querySelector('.ca-loading');
        loading.replaceChildren(node('strong', '', '本次查询未完成'), node('p', '', value.message || '暂时无法获取商品数据，请稍后重试。'));
        if (/^[a-f0-9]{32}$/.test(String(value.securityHelpToken || '')) && window.chrome?.webview?.postMessage) {
          modal.setAttribute('data-security-token', value.securityHelpToken);
          loading.querySelector('strong').textContent = '请检查抖音安全组件';
          const actions = node('div', 'ca-security-actions');
          for (const [action, label] of [['install', '下载官方安全组件'], ['retry', '已安装，重新检测']]) {
            const button = node('button', '', label); button.type = 'button'; button.setAttribute('data-security-action', action);
            button.addEventListener('click', () => {
              if (!modal.isConnected || button.disabled) return;
              actions.querySelectorAll('button').forEach(item => { item.disabled = true; });
              try { window.chrome.webview.postMessage({type:'selectionAllianceSecurityAction', action, token:value.securityHelpToken, pageUrl:location.href}); }
              catch (_) {
                loading.querySelector('p').textContent = '暂时无法连接软件，请关闭提示后重新点击映射数据。';
                actions.querySelectorAll('button').forEach(item => { item.disabled = false; });
              }
            });
            actions.append(button);
          }
          loading.append(actions);
        }
        return {status:'failure-presented'};
      }
      const active = pending;
      if (command === 'alliance' && active && (value.requestId !== active.requestId || String(value.productId) !== active.productId)) return {status:'stale-presentation', message:'已丢弃过期的映射结果。'};
      const result = await cloud(value);
      // Initial account binding clears old DOM in the data service. Keep this request's loading state visible.
      if (command === 'context' && active === pending && active && !active.finished && !active.dismissed && !document.getElementById(modalId)) showPending(active);
      if (command === 'alliance' && active && active === pending) {
        active.finished = true;
        if (active.dismissed) { document.getElementById(modalId)?.remove(); return result; }
      }
      render(result);
      return result;
    };

    api.showSnapshot = productId => { const shown = showSnapshot(productId); if (shown) render(api.peek(productId)); return shown; };
    window.addEventListener('chuangbao:product-mapping-updated', event => render(event.detail));
    Object.defineProperty(window, '__CHUANGBAO_ALLIANCE_REPORT_V4__', { value: { render }, configurable: false });
  }


  // Immediate browser-side feedback; runs before the row action crosses the native bridge.
  if (!window.__CHUANGBAO_MAPPING_CLICK_FEEDBACK_V1__) {
    const feedbackId = 'chuangbao-mapping-login-status';
    const styleId = 'chuangbao-mapping-click-feedback-style';
    const api = window[stateKey], cloud = api.cloud;
    let active = null, cooldownUntil = 0, timer = null, toastTimer = null;
    const clean = text => String(text || '').replace(/精选联盟/g, '').replace(/已收到点击[，,、]?\s*/g, '');
    const ensureStyle = () => {
      if (document.getElementById(styleId)) return;
      const style = document.createElement('style'); style.id = styleId;
      style.textContent = `
        #${feedbackId}{position:fixed!important;left:50%!important;top:50%!important;right:auto!important;bottom:auto!important;transform:translate(-50%,-50%)!important;z-index:2147483646!important;width:max-content!important;max-width:calc(100vw - 48px)!important;box-sizing:border-box!important;padding:18px 26px!important;border:1px solid #c8e8d5!important;border-radius:14px!important;background:#fff!important;color:#15803d!important;box-shadow:0 12px 40px #173e2626!important;font:500 16px/1.6 "Microsoft YaHei UI",sans-serif!important;text-align:center!important;pointer-events:none!important}
        .tools button[data-chuangbao-mapping-click-busy],button[data-chuangbao-mapping-click-busy]{color:#15803d!important;border-color:#9bd5b0!important;background:#f2fbf5!important}
        button[data-chuangbao-mapping-click-busy="pending"]::before{content:'';display:inline-block;width:10px;height:10px;margin-right:5px;vertical-align:-1px;border:2px solid #b8dfc5;border-top-color:#15803d;border-radius:50%;animation:cb-map-click-spin .8s linear infinite}
        @keyframes cb-map-click-spin{to{transform:rotate(360deg)}}
        @media(prefers-reduced-motion:reduce){button[data-chuangbao-mapping-click-busy="pending"]::before{animation:none}}
      `;
      (document.head || document.documentElement).append(style);
    };
    const feedback = (message, transient = false) => {
      ensureStyle(); clearTimeout(toastTimer);
      let node = document.getElementById(feedbackId);
      if (!node) { node = document.createElement('div'); node.id = feedbackId; node.dataset.mappingImmediate = '1'; node.setAttribute('role','status'); node.setAttribute('aria-live','polite'); (document.body || document.documentElement).append(node); }
      if (node.textContent !== clean(message)) node.textContent = clean(message);
      if (transient) toastTimer = setTimeout(() => { if (!active) node.remove(); }, 6000);
      return node;
    };
    const paint = (state, text, mode = 'pending') => {
      for (const button of state.buttons.keys()) {
        if (button.textContent !== text) button.textContent = text;
        if (button.getAttribute('data-chuangbao-mapping-click-busy') !== mode) button.setAttribute('data-chuangbao-mapping-click-busy', mode);
        button.setAttribute('aria-busy', 'true');
      }
    };
    const restore = state => {
      clearInterval(timer); timer = null;
      for (const [button, before] of state.buttons) {
        button.replaceChildren(...before.children);
        if (before.ariaBusy === null) button.removeAttribute('aria-busy'); else button.setAttribute('aria-busy',before.ariaBusy);
        button.removeAttribute('data-chuangbao-mapping-click-busy');
      }
      if (active === state) active = null;
    };
    const remember = (state, button) => {
      ensureStyle();
      const root=button.getRootNode();
      if (root.host && !root.getElementById(styleId)) root.append(document.getElementById(styleId).cloneNode(true));
      if (!state.buttons.has(button)) state.buttons.set(button,{children:Array.from(button.childNodes),ariaBusy:button.getAttribute('aria-busy')});
    };
    const countdown = () => {
      if (!active || active.phase !== 'cooldown') return;
      const seconds = Math.max(0, Math.ceil((cooldownUntil-Date.now())/1000));
      if (!seconds) { restore(active); feedback('可以查询了，请点击映射数据。',true); return; }
      paint(active, '稍候 '+seconds+'秒', 'cooldown');
      feedback('请等待 '+seconds+' 秒后再查询。');
    };
    const deadlineFrom = text => {
      const match = text.match(/请在\s*(\d{2}):(\d{2}):(\d{2})\s*后再查询/);
      if (!match || +match[1]>23 || +match[2]>59 || +match[3]>59) return 0;
      const now=Date.now(), date=new Date(now); date.setHours(+match[1],+match[2],+match[3],0);
      if (date.getTime()<now-43200000) date.setDate(date.getDate()+1);
      return date.getTime()<=now+901000 ? Math.max(now,date.getTime()) : 0;
    };
    const syncToast = () => {
      const node=document.getElementById(feedbackId); if (!node) return;
      ensureStyle(); const text=clean(node.textContent);
      if (node.textContent!==text) node.textContent=text;
      if (!active || node===active.seenToast || node.dataset.mappingImmediate==='1') return;
      active.seenToast=node; active.acknowledged=true;
      const deadline=deadlineFrom(text);
      if (deadline) {
        cooldownUntil=deadline; active.phase='cooldown'; countdown();
        clearInterval(timer); if(active?.phase==='cooldown') timer=setInterval(countdown,250); return;
      }
      if (/正在验证|等待扫码/.test(text)) { paint(active,'正在验证…'); return; }
      if (/正在查询/.test(text)) { active.phase='query'; paint(active,'查询中…'); return; }
      restore(active);
    };
    // Capture observes the existing protected button without changing its handler/file.
    window.addEventListener('click', event => {
      const button=event.composedPath().find(node=>node?.matches?.('button[data-action="map"]'));
      const host=button?.getRootNode()?.host || button?.closest('[data-chuangbao-action-host]');
      if (!button || button.disabled || !host?.matches('[data-chuangbao-action-host]')) return;
      if (!active) active={buttons:new Map(),phase:'auth',acknowledged:false,seenToast:document.getElementById(feedbackId),startedAt:Date.now(),requestId:null};
      remember(active,button); const state=active;
      if (Date.now()<cooldownUntil) {
        event.preventDefault(); event.stopImmediatePropagation(); state.phase='cooldown'; countdown();
        clearInterval(timer); if(active?.phase==='cooldown') timer=setInterval(countdown,250); return;
      }
      paint(state,state.phase==='query'?'查询中…':'正在验证…');
      feedback(state.phase==='query'?'正在查询，请稍候。':'正在验证登录状态…');
      // Only diagnose a missing native acknowledgement, not a user taking time to scan.
      setTimeout(()=>{if(active===state&&!state.acknowledged&&state.phase==='auth'){restore(state);feedback('页面暂未响应，请稍后重试。',true);}},15000);
    },true);
    const observer=new MutationObserver(syncToast); observer.observe(document,{childList:true,subtree:true,characterData:true});
    api.cloud=async value=>{
      const state=active, result=await cloud(value);
      if (!state || active!==state) return result;
      if (['alliance-pending','alliance-focus'].includes(value?.command) && result?.status==='pending') {
        state.acknowledged=true; state.phase='query'; state.requestId=result.requestId;
        paint(state,'查询中…'); document.getElementById(feedbackId)?.remove();
      } else if (['alliance','alliance-failed'].includes(value?.command) && state.requestId===value.requestId) {
        restore(state); document.getElementById(feedbackId)?.remove();
      }
      return result;
    };
    window.addEventListener('pagehide',()=>{if(active)restore(active);clearTimeout(toastTimer);document.getElementById(feedbackId)?.remove();});
    Object.defineProperty(window,'__CHUANGBAO_MAPPING_CLICK_FEEDBACK_V1__',{value:{},configurable:false});
    if(document.documentElement)ensureStyle();
  }


  window.__CHUANGBAO_MAPPING_DISPATCH_V1__ = async value => {
    if (!value) return null;
    window.__CHUANGBAO_CARD_RANK_PREVIEW_V1__?.supplementVideo(value);
    try {
      if (value.command === 'alliance-cached') {
        await window[stateKey].cloud({ ...value, command: 'alliance-pending', silent: true });
        value = { ...value, command: 'alliance' };
      }
      const result = await (value.command ? window[stateKey].cloud(value) : window[stateKey].execute(value || {}));
      if (value.command === 'context' && result?.context) await window.__CHUANGBAO_VIDEO_LIST_COUNT_V1__?.bind(result.context);
      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({ status: 'error', successCount: 0, failedCount: 5,
        message: error instanceof Error && error.message ? error.message : '映射数据请求失败' });
    }
  };
  return window.__CHUANGBAO_MAPPING_DISPATCH_V1__(request);
})()

;/* BEGIN current-page product link selection */
(() => {
  'use strict';
  if (window.top !== window || !/^(?:[^.]+\.)*compass\.jinritemai\.com$/i.test(location.hostname)) return;
  const KEY = '__CHUANGBAO_PRODUCT_LINK_SELECTION_V1__';
  if (window[KEY]) { window[KEY].rescan(); return; }
  const BAR = 'chuangbao-product-link-selection';
  const OWN = 'data-chuangbao-product-select';
  const norm = value => String(value || '').replace(/\s+/g, ' ').trim();
  const id = value => /^\d{6,32}$/.test(String(value || '').trim()) ? String(value).trim() : '';
  const visible = element => !!element?.isConnected && element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== 'hidden' && !element.closest('[aria-hidden="true"]');
  const productPage = () => /^\/shop\/chance\/(?:rank-product|product-rank|merchandise-product-rank)\/?$/.test(location.pathname);
  const selected = new Set();
  let table = null, context = '', signature = '', timer = 0, copying = false;
  let entries = [], bar = null, rootObserver = null;
  const attributes = ['data-product-id', 'data-productid', 'data-goods-id', 'data-goodsid', 'data-commodity-id'];
  const productId = row => {
    // Prefer current platform attributes over IDs left by a previous injected row action.
    for (const element of [row, ...row.querySelectorAll(attributes.map(a => `[${a}]`).join(','))]) {
      if (element.closest(`[${OWN}], [data-chuangbao-product-copy-actions], [data-chuangbao-action-host]`)) continue;
      for (const attr of attributes) { const found = id(element.getAttribute(attr)); if (found) return found; }
    }
    for (const anchor of row.querySelectorAll('a[href]')) {
      try {
        const url = new URL(anchor.getAttribute('href'), location.href);
        if (!/^(?:compass|haohuo)\.jinritemai\.com$/i.test(url.hostname) || /\/video\/|\/aweme\//.test(url.pathname)) continue;
        for (const key of ['product_id', 'productId', 'goods_id', 'goodsId', 'commodity_id']) {
          const found = id(url.searchParams.get(key)); if (found) return found;
        }
        if (url.hostname === 'haohuo.jinritemai.com' && /\/product\//.test(url.pathname)) {
          const found = id(url.searchParams.get('id')); if (found) return found;
        }
        const found = url.pathname.match(/\/(?:product|goods|commodity)\/(\d{6,32})(?:\/|$)/i);
        if (found) return found[1];
      } catch (_) { }
    }
    const explicit = norm(row.textContent).match(/(?:商品|货品)\s*ID\s*[:：]?\s*(\d{6,32})/i);
    if (explicit) return explicit[1];
    // Existing product copy controls carry the same canonical product identifier.
    // Do not use the short-video extraction ID or guess from the row's index.
    if (row.matches('[data-video-id],[data-aweme-id],[data-chuangbao-detail-video-id]')) return '';
    const rowKey = norm(row.getAttribute('data-row-key')).match(/^(\d{6,32})(?:_\d+)?$/);
    if (rowKey) return rowKey[1];
    return id(row.getAttribute('data-chuangbao-product-id'));
  };
  const headers = target => Array.from(target.querySelectorAll('thead th,[role="columnheader"]'));
  const cells = row => Array.from(row.querySelectorAll(':scope > td,:scope > [role="cell"]'));
  const findTable = () => Array.from(document.querySelectorAll('table,[role="table"]')).find(target => {
    if (!visible(target) || target.closest('[role="dialog"],#chuangbao-insight-frame-v1')) return false;
    const labels = headers(target).map(h => norm(h.textContent.replace(/全选/g, '')));
    return labels.some(label => /^(?:排名|名次)$/.test(label)) &&
      labels.some(label => /^(?:商品|商品信息)$/.test(label)) && !labels.some(label => /^(?:短)?视频信息$/.test(label));
  }) || null;
  const currentRows = target => Array.from(target.querySelectorAll('tbody tr,[role="row"][aria-rowindex]')).filter(row =>
    row.closest('table,[role="table"]') === target && visible(row) && cells(row).length > 1 &&
    !row.matches('[class*="measure-row"],[class*="expanded-row"]') && !row.querySelector('th,[role="columnheader"]'));
  const contextKey = () => {
    const active = Array.from(document.querySelectorAll('[role="tab"][aria-selected="true"]')).filter(visible).map(tab => norm(tab.textContent));
    const controls = Array.from(document.querySelectorAll('input:not([type="checkbox"]),select,[aria-current="page"],[class*="pagination"] [aria-selected="true"]'))
      .filter(element => visible(element) && !element.closest(`table,[role="table"],#${BAR},[role="dialog"]`))
      .map(element => element.tagName === 'SELECT' || element.tagName === 'INPUT' ? element.value : norm(element.textContent));
    return JSON.stringify([location.href, active, controls]);
  };
  const setText = (element, value) => { if (element.textContent !== value) element.textContent = value; };
  const toast = (message, error = false) => {
    document.getElementById(BAR + '-toast')?.remove();
    const node = document.createElement('div'); node.id = BAR + '-toast'; node.setAttribute('role', 'status'); node.textContent = message;
    node.style.cssText = `position:fixed;left:50%;top:18%;transform:translateX(-50%);z-index:2147483647;padding:10px 18px;border-radius:8px;font:14px Microsoft YaHei;color:${error ? '#c9363b' : '#1769ff'};background:${error ? '#fff1f1' : '#eff6ff'};box-shadow:0 4px 20px #17233d22;pointer-events:none`;
    document.documentElement.append(node); window.setTimeout(() => node.remove(), 2200);
  };
  const clipboard = async value => {
    const active = document.activeElement;
    const input = document.createElement('textarea'); input.value = value; input.setAttribute('readonly', '');
    input.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.append(input); input.select();
    let copied = false;
    try { copied = !!document.execCommand?.('copy'); } catch (_) { }
    finally { input.remove(); try { active?.focus({ preventScroll: true }); } catch (_) { } }
    if (copied) return;
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); return; }
    throw new Error('当前浏览器未允许写入剪贴板');
  };
  const clear = () => { selected.clear(); refresh(); };
  const ensureStyle = () => {
    if (document.getElementById(BAR + '-style')) return;
    const style = document.createElement('style'); style.id = BAR + '-style';
    style.textContent = `
      #${BAR}{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;box-sizing:border-box;min-width:0;flex:1 1 560px;padding:10px 14px;margin:10px 1px;color:#334155;background:#f7faff;border-radius:6px;font:14px/1.6 'Microsoft YaHei','Segoe UI',sans-serif}
      #${BAR}[data-integrated]{margin:0;padding:0;background:transparent}
      #${BAR} .cba-selection-info{display:flex;align-items:center;gap:12px;flex-wrap:wrap;min-width:0}
      #${BAR} .cba-selection-count{white-space:nowrap} #${BAR} .cba-selection-count strong{color:#1769ff}
      #${BAR} .cba-selection-scope{color:#8a98ad;font-size:12px}
      #${BAR} button{font:inherit;cursor:pointer;border-radius:6px;min-height:34px}
      #${BAR} [data-clear]{background:transparent;border:0;color:#1769ff;padding:3px 0}
      #${BAR} [data-copy]{flex:0 0 auto;border:1px solid #1769ff;background:#1769ff;color:#fff;padding:6px 18px;font-weight:600}
      #${BAR} [data-copy]:disabled{cursor:default;border-color:#d9e4f5;background:#e8effa;color:#95a4bc}
      [data-chuangbao-bulk-guide] > span:first-child{display:none!important}
      [data-chuangbao-bulk-rank-cell]{width:96px!important;min-width:96px!important;max-width:96px!important;white-space:nowrap!important}
      [${OWN}]{display:inline-flex;align-items:center;gap:5px;vertical-align:middle;margin-right:9px;cursor:pointer;font-weight:400;color:#475569;font-size:12px}
      [${OWN}] input{appearance:auto!important;width:16px!important;height:16px!important;margin:0!important;accent-color:#1769ff;cursor:pointer;flex-shrink:0}
      [${OWN}] input:disabled{cursor:default}
      [data-chuangbao-product-selected] > td,[data-chuangbao-product-selected] > [role="cell"]{background-color:#edf5ff!important}
      [data-chuangbao-product-selected]{background-color:#edf5ff!important}
      @media(max-width:800px){#${BAR}{gap:8px;padding:9px 10px}#${BAR} .cba-selection-scope{flex-basis:100%}#${BAR} [data-copy]{padding:6px 12px}}
    `; (document.head || document.documentElement).append(style);
  };
  const ensureBar = () => {
    if (bar) return;
    bar = document.createElement('section'); bar.id = BAR; bar.setAttribute('aria-label', '本页商品链接批量复制');
    bar.innerHTML = '<div class="cba-selection-info"><span class="cba-selection-count">已选 <strong data-count>0</strong> / 本页 <span data-total>0</span> 件</span><button type="button" data-clear>取消选择</button><span class="cba-selection-scope" data-scope>仅选择本页商品</span></div><button type="button" data-copy disabled>复制选中商品链接（0）</button>';
    bar.querySelector('[data-clear]').addEventListener('click', event => { event.stopPropagation(); clear(); });
    bar.querySelector('[data-copy]').addEventListener('click', async event => {
      event.stopPropagation(); scan();
      const links = Array.from(new Set(entries.filter(entry => selected.has(entry.key) && entry.id).map(entry =>
        `https://haohuo.jinritemai.com/views/product/item2?id=${encodeURIComponent(entry.id)}`)));
      if (!links.length || copying) return;
      copying = true; refresh();
      try { await clipboard(links.join('\n')); toast(`已复制 ${links.length} 个商品链接`); }
      catch (_) { toast('复制失败，请重试或检查剪贴板权限', true); }
      finally { copying = false; refresh(); }
    });
  };
  const checkbox = (cell, all = false) => {
    let label = Array.from(cell.children).find(child => child.hasAttribute(OWN));
    if (!label) {
      label = document.createElement('label'); label.setAttribute(OWN, all ? 'all' : 'row');
      const input = document.createElement('input'); input.type = 'checkbox'; label.append(input);
      if (all) { const text = document.createElement('span'); text.textContent = '全选'; label.append(text); }
      label.addEventListener('click', event => event.stopPropagation());
      input.addEventListener('change', event => {
        event.stopPropagation();
        const checked = input.checked; scan();
        if (all) { entries.forEach(entry => { if (entry.id) checked ? selected.add(entry.key) : selected.delete(entry.key); }); }
        else { const entry = entries.find(value => value.input === input); if (entry?.id) checked ? selected.add(entry.key) : selected.delete(entry.key); }
        refresh();
      });
      cell.prepend(label);
    }
    cell.setAttribute('data-chuangbao-bulk-rank-cell', '1');
    return label.querySelector('input');
  };
  const refresh = () => {
    if (!bar || !table) return;
    const available = entries.filter(entry => entry.id);
    const chosen = available.filter(entry => selected.has(entry.key));
    entries.forEach(entry => {
      entry.input.checked = !!entry.id && selected.has(entry.key); entry.input.disabled = !entry.id;
      entry.input.setAttribute('aria-label', `选择第 ${entry.index + 1} 件商品`);
      entry.input.title = entry.id ? '选择此商品' : '尚未取得商品 ID，暂不可复制';
      if (entry.input.checked) { if (!entry.row.hasAttribute('data-chuangbao-product-selected')) entry.row.setAttribute('data-chuangbao-product-selected', '1'); }
      else if (entry.row.hasAttribute('data-chuangbao-product-selected')) entry.row.removeAttribute('data-chuangbao-product-selected');
    });
    const input = table.querySelector(`[${OWN}="all"] input`);
    if (input) {
      input.checked = available.length > 0 && chosen.length === available.length;
      input.indeterminate = chosen.length > 0 && chosen.length < available.length; input.disabled = !available.length;
      input.setAttribute('aria-label', '全选本页可复制商品'); input.title = '仅全选当前页商品';
    }
    setText(bar.querySelector('[data-count]'), String(chosen.length)); setText(bar.querySelector('[data-total]'), String(entries.length));
    const missing = entries.length - available.length;
    setText(bar.querySelector('[data-scope]'), missing ? `仅选择本页商品 · ${missing} 件暂无商品 ID` : '仅选择本页商品');
    const button = bar.querySelector('[data-copy]'); button.disabled = copying || !chosen.length;
    setText(button, copying ? '正在复制…' : `复制选中商品链接（${chosen.length}）`);
    bar.querySelector('[data-clear]').disabled = !chosen.length;
  };
  const cleanup = () => {
    document.querySelectorAll(`[${OWN}]`).forEach(node => node.remove());
    document.querySelectorAll('[data-chuangbao-product-selected],[data-chuangbao-bulk-rank-cell],[data-chuangbao-bulk-guide]').forEach(node => {
      node.removeAttribute('data-chuangbao-product-selected'); node.removeAttribute('data-chuangbao-bulk-rank-cell'); node.removeAttribute('data-chuangbao-bulk-guide');
    });
    bar?.remove(); table = null; entries = []; selected.clear(); context = ''; signature = '';
  };
  const scan = () => {
    if (!productPage()) { cleanup(); return; }
    const next = findTable(); if (!next) { if (table) cleanup(); return; }
    ensureStyle(); ensureBar();
    const nextContext = contextKey();
    const rows = currentRows(next); const ids = rows.map(productId);
    // Include title identity so a reused row without IDs cannot keep old selection.
    const nextSignature = JSON.stringify(rows.map((row, index) => ids[index] || norm(cells(row)[1]?.textContent).replace(/复制链接|复制ID|复制标题/g, '')));
    if (context !== nextContext || signature !== nextSignature) selected.clear();
    table = next; context = nextContext; signature = nextSignature;
    const rankIndex = headers(table).findIndex(header => /^(?:排名|名次)$/.test(norm(header.textContent.replace(/全选/g, ''))));
    if (rankIndex < 0) { cleanup(); return; }
    checkbox(headers(table)[rankIndex], true);
    const rankColumn = table.querySelectorAll(':scope > colgroup > col')[rankIndex];
    if (rankColumn) rankColumn.style.setProperty('width', '96px', 'important');
    const seen = new Map();
    entries = rows.map((row, index) => {
      const product = ids[index]; const occurrence = seen.get(product) || 0; seen.set(product, occurrence + 1);
      return { row, index, id: product, key: `${product}:${occurrence}`, input: checkbox(cells(row)[rankIndex]) };
    });
    const guide = document.getElementById('chuangbao-product-overview-guide');
    document.querySelectorAll('[data-chuangbao-bulk-guide]').forEach(node => { if (node !== guide) node.removeAttribute('data-chuangbao-bulk-guide'); });
    if (guide?.isConnected) {
      guide.setAttribute('data-chuangbao-bulk-guide', '1'); bar.setAttribute('data-integrated', '1');
      if (bar.parentElement !== guide) guide.insertBefore(bar, guide.querySelector('button'));
    } else {
      bar.removeAttribute('data-integrated');
      const videoPanel = document.getElementById('chuangbao-rank-video-panel-v1');
      const anchor = videoPanel?.parentElement === table.parentElement ? videoPanel : table;
      if (bar.parentElement !== anchor.parentElement || bar.nextSibling !== anchor) anchor.parentElement.insertBefore(bar, anchor);
    }
    refresh();
  };
  const schedule = () => { if (!timer) timer = window.setTimeout(() => { timer = 0; scan(); }, 150); };
  // A capture-phase reset happens before the platform can recycle rows for another page/filter.
  // Pure row operations (view/copy/tracking) do not alter the selection.
  const navigationControl = target => {
    const node = target?.closest?.('[role="tab"],button,a,[role="button"],[role="option"],[role="radio"],input,select,[class*="pagination"],[class*="Pagination"],[class*="tagItem"],[class*="-select"],[class*="-cascader"],[class*="-picker"],[class*="-tabs-tab"]');
    if (!node || node.closest(`#${BAR},table,[role="table"],[role="dialog"]`)) return false;
    return !node.closest('#chuangbao-rank-video-panel-v1') && (node !== document.body);
  };
  document.addEventListener('click', event => { if (productPage() && navigationControl(event.target)) clear(); schedule(); }, true);
  document.addEventListener('change', event => { if (productPage() && navigationControl(event.target)) clear(); schedule(); }, true);
  document.addEventListener('input', event => { if (productPage() && navigationControl(event.target)) clear(); schedule(); }, true);
  window.addEventListener('popstate', () => { clear(); schedule(); });
  const install = () => {
    if (!document.documentElement) return;
    if (!rootObserver) {
      rootObserver = new MutationObserver(records => {
        if (records.some(record => !record.target.closest?.(`#${BAR},[${OWN}],[data-chuangbao-action-host],#${BAR}-toast`) &&
          !(record.type === 'attributes' && ['data-chuangbao-product-selected', 'data-chuangbao-bulk-rank-cell', 'data-chuangbao-bulk-guide'].includes(record.attributeName)))) schedule();
      });
      rootObserver.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true,
        attributeFilter: [...attributes, 'data-row-key', 'data-chuangbao-product-id', 'aria-selected', 'aria-current', 'aria-hidden'] });
    }
    scan();
  };
  Object.defineProperty(window, KEY, { value: { rescan: install }, configurable: false });
  document.addEventListener('DOMContentLoaded', install); document.addEventListener('readystatechange', install);
  window.setInterval(install, 1200); install();
})();
/* END current-page product link selection */

/* BEGIN product first shelf date */
;(() => {
  'use strict';
  const key = '__CHUANGBAO_FIRST_SHELF_DATE_V1__';
  if (window.top !== window || window[key]) return;
  if (!/(^|\.)compass\.jinritemai\.com$/i.test(location.hostname)) return;
  const attribute = 'data-chuangbao-first-shelf-time';
  const groupSelector = '[data-chuangbao-product-copy-actions]';
  const styleId = 'chuangbao-first-shelf-date-style-v1';
  const endpoint = '/compass_api/shop/product/compete_product_detail/basic_info';
  const cache = new Map();
  const pending = new Map();
  const scheduled = new Set();
  const queue = [];
  let active = 0;
  let scanTimer = 0;
  const rankingPage = () => /^\/shop\/chance\/rank-product\/?$/.test(location.pathname);
  const ensureRankingStyle = () => {
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `${groupSelector}[data-chuangbao-product-copy-uniform] { margin-top:49px!important; }`;
    document.documentElement.appendChild(style);
  };
  const idForRequest = value => {
    try {
      const url = new URL(String(value || ''), location.href);
      const id = url.searchParams.get('product_id') || '';
      return url.origin === location.origin && url.pathname === endpoint && /^\d{6,32}$/.test(id) ? id : '';
    } catch (_) { return ''; }
  };
  const dateFormatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const shelfDate = value => {
    let raw = value;
    for (let depth = 0; depth < 4 && raw && typeof raw === 'object'; depth += 1) raw = raw.value;
    if (raw == null || raw === '' || typeof raw === 'boolean') return '';
    const text = String(raw).trim();
    if (/^\d{10}(?:\d{3})?$/.test(text)) {
      const timestamp = Number(text) * (text.length === 10 ? 1000 : 1);
      const date = new Date(timestamp);
      return timestamp > 0 && Number.isFinite(date.getTime()) ? dateFormatter.format(date) : '';
    }
    const parts = text.match(/^(\d{4})[年/.-](\d{1,2})[月/.-](\d{1,2})日?(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
    if (parts) {
      const year = Number(parts[1]), month = Number(parts[2]), day = Number(parts[3]);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
      return `${parts[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(text)) {
      const date = new Date(text);
      if (Number.isFinite(date.getTime())) return dateFormatter.format(date);
    }
    return '';
  };
  const scheduleScan = () => {
    if (!scanTimer) scanTimer = window.setTimeout(() => { scanTimer = 0; scan(); }, 140);
  };
  const remember = (id, payload) => {
    const code = payload && (payload.code ?? payload.st);
    const valid = payload && (code == null || Number(code) === 0);
    cache.set(id, valid ? shelfDate(payload.data && payload.data.first_on_shelf_time) : '');
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    scheduleScan();
  };
  const begin = id => pending.set(id, (pending.get(id) || 0) + 1);
  const finish = id => {
    const count = (pending.get(id) || 1) - 1;
    if (count) pending.set(id, count); else pending.delete(id);
  };
  // Reuse the existing row's basic-info read without changing its response or request.
  const previousFetch = window.fetch;
  if (typeof previousFetch === 'function') window.fetch = function (input) {
    const id = idForRequest(typeof input === 'string' || input instanceof URL ? input : input && input.url);
    const request = previousFetch.apply(this, arguments);
    if (id) {
      begin(id);
      request.then(async response => {
        try { remember(id, response.ok ? await response.clone().json() : null); }
        catch (_) { remember(id, null); }
        finally { finish(id); }
      }, () => { remember(id, null); finish(id); });
    }
    return request;
  };
  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrSend = XMLHttpRequest.prototype.send;
  const xhrId = Symbol('firstShelfProduct');
  XMLHttpRequest.prototype.open = function (method, url) {
    this[xhrId] = idForRequest(url);
    return xhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    const id = this[xhrId];
    if (id) {
      begin(id);
      this.addEventListener('loadend', () => {
        try {
          const payload = this.status >= 200 && this.status < 300
            ? this.responseType === 'json' ? this.response : JSON.parse(this.responseText) : null;
          remember(id, payload);
        } catch (_) { remember(id, null); }
        finally { finish(id); }
      }, { once: true });
    }
    try { return xhrSend.apply(this, arguments); }
    catch (error) { if (id) finish(id); throw error; }
  };
  const rowId = row => {
    for (const name of ['data-product-id', 'data-row-key', 'data-chuangbao-product-id']) {
      const id = row.getAttribute(name) || '';
      if (/^\d{6,32}$/.test(id)) return id;
    }
    return '';
  };
  const currentRows = () => Array.from(document.querySelectorAll(groupSelector)).map(group => {
    const row = group.closest('tbody tr,[role="row"],[data-chuangbao-product-id]');
    return { group, row, id: row && rowId(row) };
  }).filter(item => item.id && !item.row.hasAttribute('data-chuangbao-detail-video-id') &&
    /价格带/.test(item.group.parentElement.textContent));
  const visibleProduct = id => rankingPage() && currentRows().some(item =>
    item.id === id && item.row.getBoundingClientRect().height > 0);
  const pump = () => {
    while (active < 2 && queue.length) {
      const id = queue.shift();
      scheduled.delete(id);
      if (!visibleProduct(id) || cache.has(id) || pending.has(id)) continue;
      active += 1;
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 9000);
      window.fetch(`${endpoint}?product_id=${encodeURIComponent(id)}`, {
        credentials: 'include', headers: { Accept: 'application/json' }, signal: controller.signal
      }).then(async response => remember(id, response.ok ? await response.json() : null))
        .catch(() => remember(id, null))
        .finally(() => { window.clearTimeout(timer); active -= 1; pump(); });
    }
  };
  const scan = () => {
    if (!rankingPage()) {
      document.querySelectorAll(`[${attribute}]`).forEach(label => label.remove());
      document.getElementById(styleId)?.remove();
      return;
    }
    ensureRankingStyle();
    const rows = currentRows();
    const retained = new Set();
    for (const { group, row, id } of rows) {
      let label = row.querySelector(`[${attribute}]`);
      if (!label) {
        label = document.createElement('div');
        label.setAttribute(attribute, '1');
        label.style.cssText = "margin-top:5px;line-height:20px;font-size:11px;font-weight:400;color:#1769ff;font-family:'Microsoft YaHei UI','Microsoft YaHei',sans-serif;text-align:center;white-space:nowrap;max-width:none!important;";
      }
      if (group.nextElementSibling !== label) group.insertAdjacentElement('afterend', label);
      // Include the rate badge when this rank displays four controls in the group.
      const copyRects = Array.from(group.querySelectorAll('[data-chuangbao-bad-comment-rate],[data-chuangbao-copy-product-link],[data-chuangbao-copy-product-id],[data-chuangbao-copy-product-title]'))
        .map(button => button.getBoundingClientRect()).filter(rect => rect.width > 0);
      const groupRect = group.getBoundingClientRect();
      if (copyRects.length && groupRect.width > 0) {
        const scale = group.offsetWidth / groupRect.width;
        const left = Math.min(...copyRects.map(rect => rect.left));
        const right = Math.max(...copyRects.map(rect => rect.right));
        const width = `${((right - left) * scale).toFixed(3)}px`;
        const marginLeft = `${((left - groupRect.left) * scale).toFixed(3)}px`;
        if (label.style.width !== width) label.style.width = width;
        if (label.style.marginLeft !== marginLeft) label.style.marginLeft = marginLeft;
      }
      if (label.getAttribute('data-product-id') !== id) label.setAttribute('data-product-id', id);
      const text = `上架时间: ${cache.get(id) || '--'}`;
      if (label.textContent !== text) label.textContent = text;
      retained.add(label);
      if (!cache.has(id) && !pending.has(id) && !scheduled.has(id) && row.getBoundingClientRect().height > 0) {
        scheduled.add(id);
        // Existing basic-info reads get the first opportunity; fallback serves an already-open page.
        window.setTimeout(() => { queue.push(id); pump(); }, 1100);
      }
    }
    document.querySelectorAll(`[${attribute}]`).forEach(label => { if (!retained.has(label)) label.remove(); });
  };
  let observer;
  const install = () => {
    if (!document.documentElement) return;
    if (!observer) {
      observer = new MutationObserver(scheduleScan);
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true,
        attributeFilter: ['data-product-id', 'data-row-key', 'data-chuangbao-product-id', 'data-chuangbao-detail-video-id'] });
    }
    scheduleScan();
  };
  Object.defineProperty(window, key, { value: { rescan: install }, configurable: false });
  document.addEventListener('DOMContentLoaded', install);
  document.addEventListener('readystatechange', install);
  window.addEventListener('popstate', scheduleScan);
  window.addEventListener('resize', scheduleScan);
  install();
})();
/* END product first shelf date */

/* BEGIN current row platform product identity */
(() => {
  'use strict';
  const key = '__CHUANGBAO_CURRENT_ROW_PRODUCT_ID_V1__';
  if (window.top !== window || window[key] || location.hostname !== 'compass.jinritemai.com') return;
  const owned = 'data-chuangbao-platform-product-id';
  // row-actions owns data-chuangbao-product-id and clears it on unsupported ranks.
  // Use the platform attribute it already reads, so the two scans cannot fight.
  const canonical = 'data-product-id';
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  // Read the record attached to this DOM row, never an API array index or video ID.
  const currentProduct = row => {
    const fiberKey = Object.keys(row).find(name => name.startsWith('__reactFiber$'));
    let fiber = fiberKey && row[fiberKey];
    for (let depth = 0; fiber && depth < 8; depth++, fiber = fiber.return) {
      const product = fiber.memoizedProps?.record?.product_info;
      if (!product || !/^\d{6,32}$/.test(String(product.id || ''))) continue;
      const name = normalize(product.name);
      // A recycled row may have committed text before its old fiber is replaced.
      const cell = Array.from(row.querySelectorAll(':scope > td')).find(td => /价格带/.test(td.textContent));
      if (name && cell && normalize(cell.textContent).includes(name)) return String(product.id);
      return '';
    }
    return '';
  };
  const scan = () => {
    const ranking = location.pathname.replace(/\/$/, '') === '/shop/chance/rank-product';
    for (const row of document.querySelectorAll('tbody tr')) {
      const previous = row.getAttribute(owned);
      const id = ranking ? currentProduct(row) : '';
      if (previous && row.getAttribute(canonical) === previous && previous !== id) row.removeAttribute(canonical);
      if (previous && previous !== id) row.removeAttribute(owned);
      if (id && (!row.hasAttribute(canonical) || row.getAttribute(canonical) === previous)) {
        if (row.getAttribute(canonical) !== id) row.setAttribute(canonical, id);
        if (row.getAttribute(owned) !== id) row.setAttribute(owned, id);
      }
    }
  };
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    window.setTimeout(() => { queued = false; scan(); }, 0);
  };
  let observer;
  const install = () => {
    if (!document.documentElement) return;
    if (!observer) {
      observer = new MutationObserver(schedule);
      observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true });
      // React may replace only its record while retaining all DOM children.
      window.setInterval(scan, 1000);
      document.addEventListener('click', scan, true);
    }
    scan();
  };
  Object.defineProperty(window, key, { value: { rescan: scan }, configurable: false });
  document.addEventListener('DOMContentLoaded', install);
  window.addEventListener('popstate', schedule);
  install();
})();
/* END current row platform product identity */
