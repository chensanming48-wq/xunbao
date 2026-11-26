(() => {
  'use strict';

  if (window.top !== window || window.__CHUANGBAO_COMPASS_DETAIL_OVERLAY_V1__) return;
  Object.defineProperty(window, '__CHUANGBAO_COMPASS_DETAIL_OVERLAY_V1__', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const host = String(location.hostname || '').toLowerCase();
  const rankPaths = new Set([
    '/shop/chance/rank-product',
    '/shop/chance/product-rank',
    '/shop/chance/video-talent-rank'
  ]);
  const detailPaths = new Set([
    '/shop/chance/rank-product/detail',
    '/shop/chance/product-rank/detail'
  ]);
  const normalizePath = value => String(value || '').replace(/\/+$/, '') || '/';
  const normalizeText = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  const isCompassRankPage = () =>
    (host === 'compass.jinritemai.com' || host.endsWith('.compass.jinritemai.com')) &&
    rankPaths.has(normalizePath(location.pathname));
  const isDetailUrl = value => {
    try {
      const url = new URL(value, location.href);
      if (url.protocol !== 'https:') return false;
      if ((url.hostname === 'compass.jinritemai.com' || url.hostname.endsWith('.compass.jinritemai.com')) &&
          detailPaths.has(normalizePath(url.pathname))) return true;
      return url.hostname === 'haohuo.jinritemai.com' &&
        normalizePath(url.pathname) === '/ecommerce/trade/detail/index.html' &&
        /^\d{6,32}$/.test(normalizeText(url.searchParams.get('id')));
    } catch (_error) {
      return false;
    }
  };
  // Keep only the product/shop/date fields from the successful ranking
  // responses that this page already requested. This sends no extra queries.
  const detailContexts = new Map();
  const decimalId = value => {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) return '';
    const text = String(value == null ? '' : value);
    return /^\d{1,32}$/.test(text) ? text : '';
  };
  const dateEpoch = value => {
    if (!/^\d{4}\/\d{2}\/\d{2}(?: 00:00:00)?$/.test(value || '')) return '';
    const time = Date.parse(value.slice(0, 10).replaceAll('/', '-') + 'T00:00:00+08:00');
    return Number.isFinite(time) ? String(time / 1000) : '';
  };
  const captureDetailContext = envelope => {
    if (!isCompassRankPage() || envelope?.channel !== 'chuangbao:capture:v1' ||
        envelope.direction !== 'page-to-host') return;
    let url;
    try { url = new URL(envelope.url, location.href); } catch (_) { return; }
    if (url.origin !== location.origin || url.pathname !== '/compass_api/shop/product/product_rank/video_bring_good') return;
    const body = envelope.body;
    if (!body || ['st', 'code'].some(key => body[key] != null && Number(body[key]) !== 0) ||
        (envelope.status != null && (envelope.status < 200 || envelope.status >= 300)) || !Array.isArray(body.data?.data_result)) return;
    const begin = dateEpoch(url.searchParams.get('begin_date'));
    const end = dateEpoch(url.searchParams.get('end_date'));
    const dateType = decimalId(url.searchParams.get('date_type'));
    detailContexts.clear();
    for (const item of body.data.data_result) {
      const product = item?.product_info;
      const id = decimalId(product?.id);
      if (!/^\d{6,32}$/.test(id)) continue;
      const shops = Array.isArray(product?.shop_list) ? product.shop_list : [];
      const shop = shops[0];
      const shopId = decimalId(item.product_shop_id) || decimalId(product.product_shop_id) ||
        decimalId(shop?.shop_id) || decimalId(shop?.id);
      detailContexts.set(id, { shopId, dateType, dateValue: begin && end ? begin + ',' + end : '' });
    }
  };
  window.addEventListener('message', event => {
    if (event.source === window && event.origin === location.origin) captureDetailContext(event.data);
  });
  window.chrome?.webview?.addEventListener?.('message', event => captureDetailContext(event.data));
  const completeDetailUrl = value => {
    const url = new URL(value, location.href);
    if (!detailPaths.has(normalizePath(url.pathname))) return url.href;
    const context = detailContexts.get(url.searchParams.get('product_id'));
    if (context) {
      for (const [key, data] of [['product_shop_id', context.shopId], ['date_type', context.dateType], ['date_value', context.dateValue]])
        if (data && !url.searchParams.has(key)) url.searchParams.set(key, data);
    }
    return url.href;
  };
  const interactiveFromEvent = event => {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    for (const candidate of path) {
      if (!candidate || candidate === document || candidate === window || !candidate.matches) continue;
      if (candidate.matches('a,button,[role="button"],[data-chuangbao-native-row-action]')) return candidate;
    }
    const target = event.target;
    return target && target.closest
      ? target.closest('a,button,[role="button"],[data-chuangbao-native-row-action]')
      : null;
  };
  const findRow = (element, event) => {
    const selector = '[data-chuangbao-product-id],tbody tr,[role="row"][aria-rowindex],[data-row-key]';
    // The blue row buttons live in a shadow root. Element.closest() stops at
    // that boundary, but the composed click path includes the host and row.
    // Resolve the product from the live row instead of forwarding another click
    // to a native button which Compass may already have replaced during render.
    const candidates = [element];
    if (event && typeof event.composedPath === 'function') candidates.push(...event.composedPath());
    for (const candidate of candidates) {
      if (!candidate || typeof candidate.closest !== 'function') continue;
      const row = candidate.closest(selector);
      if (row) return row;
    }
    return null;
  };
  const productIdFrom = (row, element) => {
    const values = [
      row && row.getAttribute && row.getAttribute('data-chuangbao-product-id'),
      row && row.getAttribute && row.getAttribute('data-product-id'),
      row && row.getAttribute && row.getAttribute('data-goods-id'),
      row && row.getAttribute && row.getAttribute('data-row-key'),
      element && element.getAttribute && element.getAttribute('data-product-id'),
      element && element.getAttribute && element.getAttribute('data-goods-id')
    ];
    for (const value of values) {
      const match = normalizeText(value).match(/\d{6,32}/);
      if (match) return match[0];
    }
    if (row && row.querySelectorAll) {
      for (const anchor of Array.from(row.querySelectorAll('a[href]'))) {
        try {
          const url = new URL(anchor.href, location.href);
          for (const key of ['product_id', 'productId', 'goods_id', 'goodsId']) {
            const value = normalizeText(url.searchParams.get(key));
            if (/^\d{6,32}$/.test(value)) return value;
          }
        } catch (_error) {}
      }
    }
    return '';
  };
  const detailUrlFrom = (row, element) => {
    const candidates = [];
    if (element && element.href) candidates.push(element.href);
    const anchor = element && element.closest ? element.closest('a[href]') : null;
    if (anchor && anchor.href) candidates.push(anchor.href);
    if (row && row.querySelectorAll) {
      // Product-title links can point to the retail page. A detail action must
      // not silently open that instead of the platform's analytics detail URL.
      for (const item of Array.from(row.querySelectorAll('a[href]'))) {
        if (isDetailUrl(item.href) && new URL(item.href, location.href).hostname !== 'haohuo.jinritemai.com') candidates.push(item.href);
      }
    }
    for (const candidate of candidates) if (isDetailUrl(candidate)) return new URL(candidate, location.href).href;
    return '';
  };
  const isViewDetailsAction = element => {
    if (!element) return false;
    const anchor = element.closest && element.closest('a[href]');
    if (isDetailUrl(element.href) || (anchor && isDetailUrl(anchor.href))) return true;
    const label = normalizeText(
      (element.getAttribute && (element.getAttribute('aria-label') || element.getAttribute('title'))) ||
      element.textContent);
    return label === '查看详情' || label === '查询详情';
  };
  let navigationSerial = 0;
  let pendingFallback = 0;
  let forwardingNative = false;
  const postDetail = detailUrl => {
    if (!isCompassRankPage() || !isDetailUrl(detailUrl) ||
        !window.chrome || !window.chrome.webview) return false;
    try {
      window.chrome.webview.postMessage({
        type: 'selectionOpenCompassDetail',
        pageUrl: String(location.href || ''),
        detailUrl: completeDetailUrl(detailUrl)
      });
      navigationSerial += 1;
      window.clearTimeout(pendingFallback);
      return true;
    } catch (_error) {
      return false;
    }
  };

  // Compass is a single-page application. If its click markup changes and the
  // capture listener cannot identify the product row, stop the client router
  // itself before it replaces the ranking document. The host opens that URL in
  // the isolated detail WebView instead.
  for (const methodName of ['pushState', 'replaceState']) {
    const nativeMethod = window.history && window.history[methodName];
    if (typeof nativeMethod !== 'function') continue;
    window.history[methodName] = function (state, title, url) {
      if (url != null && postDetail(url)) return;
      return nativeMethod.apply(this, arguments);
    };
  }

  // Let the platform construct its complete URL, including shop and date
  // context, before moving it into the host's detail WebView.
  const nativeWindowOpen = window.open;
  if (typeof nativeWindowOpen === 'function') {
    window.open = function (url) {
      if (url != null && postDetail(url)) return null;
      return nativeWindowOpen.apply(this, arguments);
    };
  }

  const scheduleFallback = (row, element) => {
    const serial = navigationSerial;
    const pageUrl = location.href;
    const productId = productIdFrom(row, element);
    if (!productId) return;
    window.clearTimeout(pendingFallback);
    pendingFallback = window.setTimeout(() => {
      if (serial !== navigationSerial || location.href !== pageUrl || !row?.isConnected ||
          productIdFrom(row, element) !== productId) return;
      // Only use an ID-only URL if no platform handler supplied a destination.
      postDetail(detailUrlFrom(row, element) || `https://compass.jinritemai.com/shop/chance/rank-product/detail?product_id=${encodeURIComponent(productId)}`);
    }, 1500);
  };

  document.addEventListener('click', event => {
    if (forwardingNative || !isCompassRankPage() || !window.chrome?.webview) return;
    const element = interactiveFromEvent(event);
    if (!isViewDetailsAction(element)) return;
    const row = findRow(element, event);
    // A different anchor in the same row may contain an incomplete URL. Only
    // intercept the clicked anchor here; let buttons run their native handler.
    const detailUrl = detailUrlFrom(null, element);
    if (detailUrl && postDetail(detailUrl)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    scheduleFallback(row, element);
    // The custom row button may retain a detached native node after React
    // re-renders. Resolve the connected node at click time; do not build a
    // replacement URL before that handler has had a chance to run.
    const inShadow = element.getRootNode && element.getRootNode() !== document;
    if (inShadow && row?.querySelectorAll) {
      const nativeAction = Array.from(row.querySelectorAll('a,button,[role="button"],[tabindex],[data-chuangbao-native-row-action]'))
        .find(item => item.isConnected && /^(查看|查询)详情$/.test(normalizeText(
          item.getAttribute('aria-label') || item.getAttribute('title') || item.textContent)));
      if (nativeAction && typeof nativeAction.click === 'function') {
        event.preventDefault();
        event.stopImmediatePropagation();
        const nativeUrl = detailUrlFrom(null, nativeAction);
        if (nativeUrl && postDetail(nativeUrl)) return;
        forwardingNative = true;
        try { nativeAction.click(); } finally { forwardingNative = false; }
      }
    }
  }, true);
})();

// Product ID lookup is independent of the native row-detail interceptor above.
// It only asks the existing host to open a product; it does not request or alter data.
(() => {
  'use strict';

  if (window.top !== window || window.__CHUANGBAO_PRODUCT_LOOKUP_V1__ ||
      String(location.hostname || '').toLowerCase() !== 'compass.jinritemai.com' ||
      typeof document.querySelectorAll !== 'function') return;
  Object.defineProperty(window, '__CHUANGBAO_PRODUCT_LOOKUP_V1__', { value: true });

  const marker = 'chuangbao-product-lookup-v1';
  const paths = new Set(['/shop/chance/product-rank', '/shop/chance/rank-product']);
  const onProductRank = () => paths.has(String(location.pathname || '').replace(/\/+$/, ''));
  let mount = null;
  let timer = 0;
  let observer = null;

  const findSearchAnchor = () => {
    const input = Array.from(document.querySelectorAll('input[placeholder]')).find(element => {
      if (!/商品名|商品名称/.test(String(element.getAttribute('placeholder') || ''))) return false;
      const bounds = element.getBoundingClientRect();
      return bounds.width > 80 && bounds.height > 12 && getComputedStyle(element).visibility !== 'hidden';
    });
    if (!input) return null;
    // Keep the platform's search wrapper intact, including its icon and event handlers.
    let anchor = input;
    for (let depth = 0; depth < 4 && anchor.parentElement; depth += 1) {
      const parent = anchor.parentElement;
      if (parent === document.body || parent === document.documentElement) break;
      const box = parent.getBoundingClientRect();
      if (box.height > 76 || box.width > 640 || parent.querySelectorAll('input').length > 1) break;
      anchor = parent;
    }
    return anchor;
  };

  const createLookup = () => {
    const element = document.createElement('div');
    element.id = marker;
    element.style.cssText = 'display:inline-block;vertical-align:top;flex:1 1 440px;min-width:0;max-width:100%;margin:0 0 8px 12px;box-sizing:border-box;';
    const shadow = element.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host{font:13px/1.5 "Microsoft YaHei UI","Microsoft YaHei","Segoe UI",sans-serif;color:#203350}
      *{box-sizing:border-box}.lookup{display:flex;align-items:center;gap:8px;flex-wrap:wrap;max-width:100%;margin:0;padding:0}
      label{font-size:12px;font-weight:600;color:#58708d;white-space:nowrap}
      input{width:206px;min-width:120px;max-width:100%;height:32px;border:1px solid #d3dfef;border-radius:6px;padding:0 10px;background:#fff;color:#203350;font:inherit;outline:none}
      input::placeholder{color:#90a0b5}input:focus{border-color:#2878ff;box-shadow:0 0 0 2px #2878ff1a}input[aria-invalid="true"]{border-color:#db5158}
      button{height:32px;padding:0 12px;border:1px solid #bcd2f4;border-radius:6px;background:#fff;color:#1769ff;white-space:nowrap;font:600 13px "Microsoft YaHei UI","Microsoft YaHei",sans-serif;cursor:pointer}
      button:hover{background:#eef5ff;border-color:#2878ff}button.primary{background:#1769ff;border-color:#1769ff;color:#fff}button.primary:hover{background:#075ce9}
      button:focus-visible{outline:2px solid #1769ff;outline-offset:2px}.status{flex-basis:100%;margin:0;color:#61738a;font-size:12px;line-height:18px}.status:empty{display:none}.status.error{color:#c13f47}
      @media(max-width:700px){input{flex:1 1 160px}.lookup{gap:6px}label{flex-basis:100%}}
    `;
    const group = document.createElement('div');
    group.className = 'lookup';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', '商品ID快捷查询');
    const label = document.createElement('label');
    label.htmlFor = 'product-id';
    label.textContent = '商品 ID';
    const input = document.createElement('input');
    input.id = 'product-id';
    input.type = 'text';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = '商品ID或罗盘详情链接';
    input.setAttribute('aria-describedby', 'lookup-status');
    const status = document.createElement('p');
    status.id = 'lookup-status';
    status.className = 'status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const showStatus = (text, error) => {
      status.textContent = text;
      status.className = error ? 'status error' : 'status';
      input.setAttribute('aria-invalid', error ? 'true' : 'false');
    };
    const submit = action => {
      if (!onProductRank()) return;
      // Product IDs exceed Number.MAX_SAFE_INTEGER; never coerce them to numbers.
      const entered = input.value.trim();
      let productId = entered;
      let suppliedUrl = '';
      if (/^https:\/\//i.test(entered)) {
        try {
          const url = new URL(entered);
          if (url.hostname === 'compass.jinritemai.com' && !url.username && !url.password && !url.port &&
              /^\/shop\/chance\/(rank-product|product-rank)\/detail\/?$/.test(url.pathname)) {
            productId = url.searchParams.get('product_id') || '';
            suppliedUrl = url.href;
          }
        } catch (_) {}
      }
      if (!productId || !/^\d{6,32}$/.test(productId)) {
        showStatus(productId ? '商品ID应为6至32位数字，请检查后重试。' : '请先输入商品ID。', true);
        input.focus();
        return;
      }
      input.value = suppliedUrl || productId;
      const bridge = window.chrome && window.chrome.webview;
      if (!bridge || typeof bridge.postMessage !== 'function') {
        showStatus('请在创爆选品中心内使用此功能。', true);
        return;
      }
      const detailUrl = suppliedUrl || `https://compass.jinritemai.com/shop/chance/rank-product/detail?product_id=${encodeURIComponent(productId)}`;
      const pageUrl = String(location.href || '');
      const title = `商品 ${productId}`;
      try {
        // [v5.5诊断] 增强显示按钮点击标记（判断消息是否发出）
        try { localStorage.setItem('cba_btn_' + action, new Date().toISOString() + ' pid=' + productId + ' bridge=' + !!(bridge && bridge.postMessage)); } catch (_btnError) {}
        if (action === 'detail') {
          bridge.postMessage({ type: 'selectionOpenCompassDetail', pageUrl, detailUrl });
        } else {
          bridge.postMessage({
            type: 'selectionRowAction', action: 'insight', pageUrl,
            item: {
              id: `row:compass.jinritemai.com:product:${productId}`,
              rawId: productId, kind: 'product', title, product: title,
              href: detailUrl, image: '', mediaUrl: '', author: '', price: '', commission: '', quality: 'platform-id'
            }
          });
        }
        showStatus(action === 'detail' ? '正在打开商品详情…' : '正在打开增强显示…', false);
      } catch (_error) {
        showStatus('暂时无法打开，请稍后重试。', true);
      }
    };
    const button = (text, action, primary) => {
      const control = document.createElement('button');
      control.type = 'button';
      control.textContent = text;
      // The document's native row handler intentionally does not claim this action.
      control.setAttribute('aria-label', `按商品ID${text}`);
      if (primary) control.className = 'primary';
      control.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        submit(action);
      });
      return control;
    };
    input.addEventListener('input', () => showStatus('', false));
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      event.stopPropagation();
      submit('detail');
    });
    group.append(label, input, button('查看详情', 'detail', false), button('增强显示', 'insight', true), status);
    shadow.append(style, group);
    return element;
  };

  const observe = () => {
    if (observer && document.documentElement)
      observer.observe(document.documentElement, { childList: true, subtree: true });
  };
  const reconcile = () => {
    timer = 0;
    // Mutations made during mounting must not reschedule the observer itself.
    if (observer) observer.disconnect();
    try {
      if (!onProductRank()) {
        if (mount && mount.isConnected) mount.remove();
        return;
      }
      const existing = document.getElementById(marker);
      if (existing) { mount = existing; return; }
      const anchor = findSearchAnchor();
      if (!anchor || !anchor.parentNode) return;
      if (!mount) mount = createLookup();
      anchor.insertAdjacentElement('afterend', mount);
    } finally {
      observe();
    }
  };
  const schedule = () => {
    if (timer) return;
    timer = window.setTimeout(reconcile, 120);
  };
  const install = () => {
    if (observer) return;
    observer = new MutationObserver(schedule);
    observe();
    schedule();
    window.addEventListener('popstate', schedule);
    window.addEventListener('hashchange', schedule);
  };
  if (document.documentElement) install();
  else document.addEventListener('DOMContentLoaded', install, { once: true });
})();
