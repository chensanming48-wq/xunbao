(() => {
  'use strict';

  if (window.top !== window || window.__CHUANGBAO_COPY_PRODUCT_LINK_V1__) return;
  Object.defineProperty(window, '__CHUANGBAO_COPY_PRODUCT_LINK_V1__', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const host = String(location.hostname || '').toLowerCase();
  const supportedHost = host === 'compass.jinritemai.com' || host.endsWith('.compass.jinritemai.com');
  if (!supportedHost) return;

  const buttonAttribute = 'data-chuangbao-copy-product-link';
  const idButtonAttribute = 'data-chuangbao-copy-product-id';
  const titleButtonAttribute = 'data-chuangbao-copy-product-title';
  const groupAttribute = 'data-chuangbao-product-copy-actions';
  const uniformStyleAttribute = 'data-chuangbao-product-copy-uniform';
  const uniformStyleId = 'chuangbao-product-copy-uniform-style-v1';
  const ensureUniformProductStyle = () => {
    if (document.getElementById(uniformStyleId)) return;
    const style = document.createElement('style');
    style.id = uniformStyleId;
    const scope = `[${groupAttribute}][${uniformStyleAttribute}]`;
    style.textContent = `
      ${scope} { flex-wrap:nowrap!important; gap:5px!important; white-space:nowrap; }
      ${scope} > button { flex:0 0 auto; min-width:0!important; padding:0 7px!important; }
      ${scope} > :is([data-chuangbao-bad-comment-rate],[${buttonAttribute}],[${idButtonAttribute}],[${titleButtonAttribute}]) {
        font-family:'Microsoft YaHei UI'!important;
        font-size:11px!important;
        font-weight:400!important;
        color:#1769ff!important;
        border:1px solid #1769ff!important;
        background:#fff!important;
      }
      ${scope} > button:hover:not(:disabled) { background:#eaf2ff!important; }
    `;
    document.documentElement.appendChild(style);
  };
  const normalize = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  const firstPlatformId = value => {
    const match = normalize(value).match(/\d{6,32}/);
    return match ? match[0] : '';
  };
  const attributeValue = (element, names) => {
    for (const name of names) {
      const value = element && element.getAttribute ? firstPlatformId(element.getAttribute(name)) : '';
      if (value) return value;
    }
    return '';
  };
  const idFromHref = href => {
    if (!href) return '';
    try {
      const url = new URL(href, location.href);
      for (const key of ['product_id', 'productId', 'goods_id', 'goodsId', 'commodity_id', 'promotion_id', 'item_id', 'itemId', 'id']) {
        const value = normalize(url.searchParams.get(key));
        if (/^\d{6,32}$/.test(value)) return value;
      }
      const match = String(url.pathname || '').match(/(?:product|goods|commodity|promotion|item)\/(\d{6,32})/i);
      return match ? match[1] : '';
    } catch (_error) {
      return '';
    }
  };
  const productIdFromRow = row => {
    const attributeNames = [
      'data-chuangbao-product-id', 'data-product-id', 'data-productid',
      'data-goods-id', 'data-goodsid', 'data-commodity-id',
      'data-promotion-id', 'data-item-id', 'data-row-key'
    ];
    const direct = attributeValue(row, attributeNames);
    if (direct) return direct;
    for (const element of Array.from(row.querySelectorAll(attributeNames.map(name => `[${name}]`).join(','))).slice(0, 30)) {
      if (element.hasAttribute(buttonAttribute) || element.hasAttribute(idButtonAttribute)) continue;
      const nested = attributeValue(element, attributeNames);
      if (nested) return nested;
    }
    for (const anchor of Array.from(row.querySelectorAll('a[href]')).slice(0, 30)) {
      const linked = idFromHref(anchor.href || anchor.getAttribute('href'));
      if (linked) return linked;
    }
    const textMatch = String(row.innerText || row.textContent || '').match(/(?:商品|货品|推广)\s*ID\s*[:：]?\s*(\d{6,32})/i);
    return textMatch ? textMatch[1] : '';
  };
  const productInfoCell = row => {
    const cells = Array.from(row.querySelectorAll(':scope > td,:scope > [role="cell"]'));
    // Detail video tables put the thumbnail/title/date in the first column;
    // the product ranking's second-column fallback would target payment data.
    const videoCell = cells.find(cell => /发布时间/.test(normalize(cell.textContent)) && cell.querySelector('img'));
    if (videoCell) return videoCell;
    const table = row.closest('table,[role="table"],[role="grid"]');
    const headers = table ? Array.from(table.querySelectorAll('thead th,[role="columnheader"]')) : [];
    const videoColumn = headers.findIndex(header => /^(?:短)?视频信息$/.test(normalize(header.textContent)));
    if (videoColumn >= 0 && cells[videoColumn]) return cells[videoColumn];
    return cells.find(cell => /价格带/.test(normalize(cell.textContent)) && cell.querySelector('img')) ||
      cells.find(cell => /价格带/.test(normalize(cell.textContent))) ||
      cells[1] || null;
  };
  const canonicalProductLink = productId =>
    `https://haohuo.jinritemai.com/views/product/item2?id=${encodeURIComponent(productId)}`;
  const isVideoRow = row => {
    if (row.hasAttribute('data-chuangbao-detail-video-id') || row.hasAttribute('data-video-id')) return true;
    const table = row.closest('table,[role="table"],[role="grid"]');
    return !!table && Array.from(table.querySelectorAll('thead th,[role="columnheader"]'))
      .some(header => /^(?:短)?视频信息$/.test(normalize(header.textContent)));
  };
  const videoIdFromRow = row => {
    // Read current native identifiers before our marker: pagination may reuse this row.
    for (const name of ['data-video-id', 'data-item-id', 'data-row-key']) {
      const value = normalize(row.getAttribute(name));
      if (/^\d{6,32}$/.test(value)) return value;
    }
    for (const anchor of Array.from(row.querySelectorAll('a[href]')).slice(0, 30)) {
      try {
        const url = new URL(anchor.getAttribute('href'), location.href);
        if (url.hostname === 'douyin.com' || url.hostname.endsWith('.douyin.com')) {
          const match = url.pathname.match(/^\/video\/(\d{6,32})\/?$/);
          if (match) return match[1];
        }
      } catch (_error) { }
    }
    const captured = normalize(row.getAttribute('data-chuangbao-detail-video-id'));
    return /^\d{6,32}$/.test(captured) ? captured : '';
  };
  const rowCopyTarget = row => {
    const kind = isVideoRow(row) ? 'video' : 'product';
    const id = kind === 'video' ? videoIdFromRow(row) : productIdFromRow(row);
    return { kind, id, link: !id ? '' : kind === 'video'
      ? `https://www.douyin.com/video/${id}` : canonicalProductLink(id) };
  };

  const productTitleFromRow = row => {
    if (isVideoRow(row)) return '';
    const cell = productInfoCell(row);
    if (!cell) return '';
    const excluded = `[${groupAttribute}],button,[role="button"],[data-chuangbao-action-host],[data-chuangbao-bad-comment-rate]`;
    const valid = value => {
      const text = normalize(value);
      return text.length >= 2 && text.length <= 1000 && !/^\d+$/.test(text) &&
        !/^(?:价格带|差评率|复制|已复制|商品\s*ID|查看详情|加入追踪)/.test(text) &&
        !/^[¥￥]/.test(text) && !/(?:…|\.{3})$/.test(text) ? text : '';
    };
    // CSS ellipsis only clips the rendered text. Read the full DOM text/title,
    // restricted to the product cell so shop names and row actions cannot leak in.
    const selectors = [
      '[data-testid*="product-name"],[data-testid*="goods-name"],[data-testid*="commodity-name"]',
      '[class*="productName"],[class*="product-name"],[class*="goodsName"],[class*="goods-name"],[class*="commodityName"],[class*="itemName"]',
      '[class*="title"],a[title],[title],a[href]'
    ];
    for (const selector of selectors) {
      for (const element of cell.querySelectorAll(selector)) {
        if (element.closest(excluded) || element.matches('img')) continue;
        for (const value of [element.getAttribute('title'), element.getAttribute('aria-label'), element.textContent]) {
          const text = valid(value);
          if (text && !/价格带|差评率/.test(text)) return text;
        }
      }
    }
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement.closest(excluded)) continue;
      if (/价格带/.test(node.nodeValue)) break;
      const text = valid(node.nodeValue);
      if (text) return text;
    }
    return '';
  };

  const resetButton = button => {
    if (!button || !button.isConnected) return;
    button.textContent = button.hasAttribute(titleButtonAttribute) ? '复制标题' :
      button.hasAttribute(idButtonAttribute) ? '复制ID' : '复制链接';
    button.disabled = false;
    button.style.background = '#fff';
    button.style.borderColor = '#9abff8';
    button.style.color = '#1769ff';
    button.removeAttribute('title');
    button.removeAttribute('data-copy-state');
  };
  const showResult = (button, success, message) => {
    if (!button || !button.isConnected) return;
    window.clearTimeout(button.__chuangbaoCopyResetTimer);
    button.textContent = success ? '已复制' : '复制失败';
    button.disabled = false;
    button.setAttribute('data-copy-state', success ? 'success' : 'error');
    button.style.background = success ? '#ecfdf3' : '#fff3f3';
    button.style.borderColor = success ? '#69c58f' : '#ef8d8d';
    button.style.color = success ? '#14804a' : '#d64545';
    if (message) button.title = message;
    button.__chuangbaoCopyResetTimer = window.setTimeout(() => resetButton(button), success ? 1600 : 2400);
  };

  const copyRowValue = async (button, value, label) => {
    if (button.disabled) return;
    window.clearTimeout(button.__chuangbaoCopyResetTimer);
    resetButton(button);
    button.disabled = true;
    // Normal clipboard writes finish inside this click; only a slow fallback needs a pending label.
    const pendingTimer = window.setTimeout(() => {
      if (button.isConnected && button.disabled) button.textContent = '复制中…';
    }, 180);
    const copyFallback = () => {
      const focused = document.activeElement;
      const area = document.createElement('textarea');
      area.value = value;
      area.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(area);
      try {
        area.select();
        if (!document.execCommand('copy')) throw new Error('复制失败');
      } finally {
        area.remove();
        if (focused && focused.isConnected && typeof focused.focus === 'function') focused.focus({ preventScroll: true });
      }
    };
    try {
      try { copyFallback(); } catch (error) {
        if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') throw error;
        await navigator.clipboard.writeText(value);
      }
      showResult(button, true, `${label}已复制`);
    } catch (_error) {
      showResult(button, false, `${label}复制失败，请重试`);
    } finally {
      window.clearTimeout(pendingTimer);
    }
  };

  const createButton = (row, target, action = 'link') => {
    const copyId = action === 'id';
    const copyTitle = action === 'title';
    const actionLabel = copyTitle ? '标题' : copyId ? 'ID' : '链接';
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute(copyTitle ? titleButtonAttribute : copyId ? idButtonAttribute : buttonAttribute, '1');
    button.setAttribute('data-product-id', target.id);
    button.setAttribute('data-chuangbao-copy-kind', target.kind);
    const kindLabel = target.kind === 'video' ? '视频' : '商品';
    button.setAttribute('aria-label', `复制该${kindLabel}${actionLabel}`);
    button.textContent = `复制${actionLabel}`;
    button.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      copyTitle ? 'min-width:68px' : copyId ? 'min-width:58px' : 'min-width:96px',
      'height:20px',
      'margin-top:3px',
      'margin-left:6px',
      'padding:0 9px',
      'border:1px solid #9abff8',
      'border-radius:5px',
      'background:#fff',
      'color:#1769ff',
      "font-family:'Microsoft YaHei UI','Microsoft YaHei','Segoe UI',sans-serif",
      'font-size:11px',
      'font-weight:600',
      'line-height:18px',
      'text-align:center',
      'box-sizing:border-box',
      'vertical-align:top',
      'white-space:nowrap',
      'cursor:pointer',
      'transition:background-color .15s,border-color .15s,color .15s'
    ].join(';');
    button.addEventListener('mouseenter', () => {
      if (button.disabled) return;
      button.style.background = '#eaf2ff';
      button.style.borderColor = '#1769ff';
    });
    button.addEventListener('mouseleave', () => {
      button.style.background = button.getAttribute('data-copy-state') === 'success' ? '#ecfdf3' : '#fff';
      button.style.borderColor = button.getAttribute('data-copy-state') === 'success' ? '#69c58f' : '#9abff8';
    });
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const current = rowCopyTarget(row);
      const label = current.kind === 'video' ? '视频' : '商品';
      if (copyTitle) {
        const title = productTitleFromRow(row);
        if (!title) { showResult(button, false, '当前行没有完整的商品标题，请等待商品加载后重试'); return; }
        copyRowValue(button, title, '商品标题');
        return;
      }
      if (!/^\d{6,32}$/.test(current.id)) {
        showResult(button, false, `当前行没有有效的${label} ID`);
        return;
      }
      copyRowValue(button, copyId ? current.id : current.link, `${label}${copyId ? ' ID ' : '链接'}`);
    });
    return button;
  };
  const alignActionsWithProductImage = (row, cell, button, idButton, titleButton) => {
    let group = row.querySelector(`[${groupAttribute}]`);
    if (!group) {
      group = document.createElement('div');
      group.setAttribute(groupAttribute, '1');
      group.style.cssText = 'display:flex;align-items:center;justify-content:flex-start;flex-wrap:wrap;gap:6px;margin-top:3px;max-width:100%;box-sizing:border-box;text-align:left;';
    }
    // Start a new line below the thumbnail and its title/price or publish date.
    if (group.parentNode !== cell) cell.appendChild(group);
    // Product rankings leave an extra line below the price before the actions.
    const detailVideoRow = row.hasAttribute('data-chuangbao-detail-video-id') ||
      /发布时间/.test(normalize(cell.textContent));
    const productRankingRow = /价格带/.test(normalize(cell.textContent));
    group.toggleAttribute(uniformStyleAttribute, productRankingRow);
    const topSpacing = productRankingRow ? '33px' : detailVideoRow ? '21px' : '3px';
    if (group.style.marginTop !== topSpacing) group.style.marginTop = topSpacing;
    const copyButtonStyle = {
      fontSize: detailVideoRow ? '13px' : '11px',
      height: detailVideoRow ? '26px' : '20px',
      lineHeight: detailVideoRow ? '24px' : '18px'
    };
    for (const copyButton of [button, idButton, titleButton].filter(Boolean)) {
      for (const [property, value] of Object.entries(copyButtonStyle)) {
        if (copyButton.style[property] !== value) copyButton.style[property] = value;
      }
    }
    const badge = row.querySelector('[data-chuangbao-bad-comment-rate]');
    const videoBadgeSlot = row.querySelector('[data-chuangbao-video-badge-slot]');
    if (badge && videoBadgeSlot && badge.parentNode !== videoBadgeSlot) videoBadgeSlot.appendChild(badge);
    const actions = [videoBadgeSlot ? null : badge, button, idButton, titleButton].filter(Boolean);
    actions.forEach((action, index) => {
      if (group.children[index] !== action) group.insertBefore(action, group.children[index] || null);
      if (action.style.marginLeft !== '0px') action.style.marginLeft = '0';
      if (action.style.marginTop !== '0px') action.style.marginTop = '0';
    });
  };
  const attach = row => {
    if (!row || !row.isConnected) return;
    const cell = productInfoCell(row);
    const target = rowCopyTarget(row);
    let button = row.querySelector(`[${buttonAttribute}]`);
    let idButton = row.querySelector(`[${idButtonAttribute}]`);
    let titleButton = row.querySelector(`[${titleButtonAttribute}]`);
    const needsTitle = target.kind === 'product' && !!productTitleFromRow(row);
    if (!cell || !/^\d{6,32}$/.test(target.id)) {
      if (button) button.remove();
      if (idButton) idButton.remove();
      if (titleButton) titleButton.remove();
      return;
    }
    if (button && button.getAttribute('data-product-id') === target.id &&
        idButton && idButton.getAttribute('data-product-id') === target.id &&
        (needsTitle ? titleButton && titleButton.getAttribute('data-product-id') === target.id && cell.contains(titleButton) : !titleButton) &&
        button.getAttribute('data-chuangbao-copy-kind') === target.kind &&
        cell.contains(button) && cell.contains(idButton)) {
      alignActionsWithProductImage(row, cell, button, idButton, titleButton);
      return;
    }
    if (button) button.remove();
    if (idButton) idButton.remove();
    if (titleButton) titleButton.remove();
    button = createButton(row, target);
    idButton = createButton(row, target, 'id');
    titleButton = needsTitle ? createButton(row, target, 'title') : null;
    alignActionsWithProductImage(row, cell, button, idButton, titleButton);
  };

  const candidateSelector = [
    'tbody tr', '[role="row"][aria-rowindex]', '[data-row-key]',
    '[data-testid*="product-item"]', '[data-testid*="goods-item"]',
    '[class*="product-card"]', '[class*="productCard"]',
    '[class*="goods-card"]', '[class*="goodsCard"]', '[class*="commodity-card"]'
  ].join(',');
  let scanPending = false;
  const scan = () => {
    scanPending = false;
    ensureUniformProductStyle();
    const seen = new Set();
    for (const candidate of Array.from(document.querySelectorAll(candidateSelector)).slice(0, 500)) {
      const row = candidate.closest('tbody tr,[role="row"][aria-rowindex]') || candidate;
      if (seen.has(row) || row.querySelector('th,[role="columnheader"]')) continue;
      seen.add(row);
      attach(row);
    }
  };
  const scheduleScan = () => {
    if (scanPending) return;
    scanPending = true;
    window.setTimeout(scan, 140);
  };
  const install = () => {
    scheduleScan();
    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-chuangbao-product-id', 'data-product-id', 'data-row-key',
        'data-video-id', 'data-item-id', 'data-chuangbao-detail-video-id']
    });
    window.setInterval(scheduleScan, 1400);
  };
  if (document.documentElement) install();
  else document.addEventListener('readystatechange', install, { once: true });
})();
