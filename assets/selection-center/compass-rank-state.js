(() => {
  'use strict';

  if (window.top !== window) return;
  const host = String(location.hostname || '').toLowerCase();
  if (host !== 'compass.jinritemai.com') return;

  const path = String(location.pathname || '').replace(/\/+$/, '') || '/';
  const rankPaths = new Set([
    '/shop/chance/rank-product',
    '/shop/chance/product-rank',
    '/shop/chance/video-talent-rank'
  ]);
  const detailPaths = new Set([
    '/shop/chance/rank-product/detail',
    '/shop/chance/product-rank/detail'
  ]);
  const isRankPath = rankPaths.has(path);
  const isDetailPath = detailPaths.has(path);
  if (!isRankPath && !isDetailPath) return;
  if (window.__CHUANGBAO_COMPASS_RANK_STATE_V1__) return;
  Object.defineProperty(window, '__CHUANGBAO_COMPASS_RANK_STATE_V1__', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const selectedTabKey = 'chuangbao:compass-rank-selected-tab:v1';
  const selectedPageKey = 'chuangbao:compass-rank-selected-page:v1';
  const returnTabKey = 'chuangbao:compass-rank-return-tab:v1';
  const returnPageKey = 'chuangbao:compass-rank-return-page:v1';
  const restorePendingKey = 'chuangbao:compass-rank-restore-pending:v1';
  const supportedLabels = new Set([
    '总榜',
    '搜索榜',
    '直播榜',
    '商品卡榜',
    '达人带货榜',
    '短视频榜',
    '实时爆品挖掘榜',
    '退后购买榜',
    '同行爆品榜'
  ]);
  const normalize = value => String(value || '').replace(/\s+/g, '').trim();

  const readSession = key => {
    try { return String(sessionStorage.getItem(key) || ''); }
    catch (_error) { return ''; }
  };
  const writeSession = (key, value) => {
    try { sessionStorage.setItem(key, value); }
    catch (_error) { }
  };
  const removeSession = key => {
    try { sessionStorage.removeItem(key); }
    catch (_error) { }
  };

  // Reaching a product detail page is the reliable signal that the next return
  // to the ranking page should restore the user's last explicitly selected tab.
  // The selected tab itself is not encoded in Compass' URL or browser history.
  if (isDetailPath) {
    // Preserve an immutable return snapshot. The list page can repaint itself
    // to page 1 while it is unloading; that transient state must never replace
    // the page the user explicitly selected before opening this detail.
    if (!readSession(returnTabKey))
      writeSession(returnTabKey, readSession(selectedTabKey));
    if (!readSession(returnPageKey))
      writeSession(returnPageKey, readSession(selectedPageKey));
    writeSession(restorePendingKey, '1');
    return;
  }

  const restoreCoverId = 'chuangbao-compass-rank-restore-cover';
  const restoreCoverStyleId = 'chuangbao-compass-rank-restore-cover-style';
  const restoreRootAttribute = 'data-chuangbao-compass-rank-restoring';
  let restoreCoverObserver = null;
  let restoreCoverFailSafeTimer = 0;

  const removeRestoreCover = () => {
    if (restoreCoverObserver) {
      restoreCoverObserver.disconnect();
      restoreCoverObserver = null;
    }
    if (restoreCoverFailSafeTimer) {
      clearTimeout(restoreCoverFailSafeTimer);
      restoreCoverFailSafeTimer = 0;
    }
    const cover = document.getElementById(restoreCoverId);
    if (cover) cover.remove();
    if (document.documentElement)
      document.documentElement.removeAttribute(restoreRootAttribute);
  };

  const installRestoreCover = () => {
    if (readSession(restorePendingKey) !== '1') return;
    if (!document.documentElement) {
      if (!restoreCoverObserver) {
        restoreCoverObserver = new MutationObserver(() => {
          if (!document.documentElement) return;
          restoreCoverObserver.disconnect();
          restoreCoverObserver = null;
          installRestoreCover();
        });
        restoreCoverObserver.observe(document, { childList: true });
      }
      return;
    }
    document.documentElement.setAttribute(restoreRootAttribute, '1');
    if (!document.getElementById(restoreCoverStyleId)) {
      const style = document.createElement('style');
      style.id = restoreCoverStyleId;
      style.textContent = `
        html[${restoreRootAttribute}] body::before{
          content:"";position:fixed;inset:0;z-index:2147483646;
          background:#f7f9fc!important;
        }
        #${restoreCoverId}{
          position:fixed;inset:0;z-index:2147483647;display:flex;
          align-items:center;justify-content:center;background:#f7f9fc;
          color:#61708a;font:500 14px/1.5 "Microsoft YaHei UI","Microsoft YaHei","Segoe UI",sans-serif;
        }
        #${restoreCoverId} .chuangbao-rank-restore-status{
          display:flex;align-items:center;gap:10px;padding:12px 18px;
          border:1px solid #dce8fa;border-radius:10px;background:#fff;
          box-shadow:0 8px 24px rgba(36,79,143,.08);
        }
        #${restoreCoverId} .chuangbao-rank-restore-spinner{
          width:17px;height:17px;border:2px solid #d8e7ff;border-top-color:#1769ff;
          border-radius:50%;animation:chuangbao-rank-restore-spin .75s linear infinite;
        }
        @keyframes chuangbao-rank-restore-spin{to{transform:rotate(360deg)}}
        @media (prefers-reduced-motion:reduce){
          #${restoreCoverId} .chuangbao-rank-restore-spinner{animation:none}
        }
      `;
      (document.head || document.documentElement).appendChild(style);
    }

    const appendCover = () => {
      if (!document.body || document.getElementById(restoreCoverId)) return Boolean(document.body);
      const desiredPage = Number.parseInt(readSession(selectedPageKey), 10);
      const cover = document.createElement('div');
      cover.id = restoreCoverId;
      cover.setAttribute('role', 'status');
      cover.setAttribute('aria-live', 'polite');
      const status = document.createElement('div');
      status.className = 'chuangbao-rank-restore-status';
      const spinner = document.createElement('span');
      spinner.className = 'chuangbao-rank-restore-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      const caption = document.createElement('span');
      caption.textContent = Number.isFinite(desiredPage) && desiredPage > 1
        ? `正在返回第 ${desiredPage} 页…`
        : '正在恢复上一页…';
      status.append(spinner, caption);
      cover.appendChild(status);
      document.body.appendChild(cover);
      return true;
    };

    if (!appendCover()) {
      restoreCoverObserver = new MutationObserver(() => {
        if (!appendCover()) return;
        restoreCoverObserver.disconnect();
        restoreCoverObserver = null;
      });
      restoreCoverObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
    // Never leave the third-party page covered if its markup changes and the
    // restoration can no longer identify a tab or pagination control.
    // This is an app-level transition cover, not the site's own loading state.
    // Never let it block the user for a full network round-trip: restoration
    // continues in the background after the visual hand-off budget expires.
    restoreCoverFailSafeTimer = setTimeout(removeRestoreCover, 850);
  };

  // Native browser history already preserves the live ranking document and
  // its pagination on the normal detail-return path. Do not cover that page
  // with a second app-level loading screen; the logic below is now a silent
  // fallback only for the uncommon case where Compass rebuilds the document.

  const labelFromNode = start => {
    let node = start instanceof Element ? start : start && start.parentElement;
    for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
      const label = normalize(node.textContent);
      if (supportedLabels.has(label)) return label;
    }
    return '';
  };

  const pageFromNode = start => {
    let numberNode = start instanceof Element ? start : start && start.parentElement;
    for (let depth = 0; numberNode && depth < 5; depth += 1, numberNode = numberNode.parentElement) {
      const text = normalize(numberNode.textContent);
      if (!/^\d{1,3}$/.test(text)) continue;
      let container = numberNode;
      for (let parentDepth = 0; container && parentDepth < 10; parentDepth += 1, container = container.parentElement) {
        const className = typeof container.className === 'string' ? container.className : '';
        const ariaLabel = String(container.getAttribute && container.getAttribute('aria-label') || '');
        if (/pagination|pager|page[-_]?nav/i.test(className) ||
          (container.tagName === 'NAV' && /页|page/i.test(ariaLabel))) return text;
      }
    }
    return '';
  };

  const isDetailNavigationClick = start => {
    let node = start instanceof Element ? start : start && start.parentElement;
    for (let depth = 0; node && depth < 9; depth += 1, node = node.parentElement) {
      const href = String(node.getAttribute && node.getAttribute('href') || '');
      if (/\/shop\/chance\/(?:rank-product|product-rank)\/detail(?:[/?#]|$)/i.test(href))
        return true;
      if (node.matches && node.matches('button,a,[role="button"]')) {
        const text = normalize(node.textContent);
        if (/^(?:查看|查询)详情$/.test(text)) return true;
      }
    }
    return false;
  };

  const freezeReturnSnapshot = () => {
    const label = selectedRankLabel() || readSession(selectedTabKey);
    const pageNumber = selectedPageNumber() || readSession(selectedPageKey);
    if (supportedLabels.has(label)) writeSession(returnTabKey, label);
    if (/^\d{1,3}$/.test(pageNumber)) writeSession(returnPageKey, pageNumber);
    if (supportedLabels.has(label) || /^\d{1,3}$/.test(pageNumber))
      writeSession(restorePendingKey, '1');
  };

  // Only trusted user clicks change the remembered tab. Programmatic clicks
  // from Compass itself, or from the restore routine below, cannot overwrite it.
  document.addEventListener('click', event => {
    if (!event.isTrusted) return;
    // Run in the capture phase, before Compass' own detail handler can repaint
    // or unmount the ranking list and expose a transient page-1 selection.
    if (isDetailNavigationClick(event.target)) {
      freezeReturnSnapshot();
      return;
    }
    const label = labelFromNode(event.target);
    if (label) {
      writeSession(selectedTabKey, label);
      writeSession(selectedPageKey, '1');
      return;
    }
    const pageNumber = pageFromNode(event.target);
    if (pageNumber) {
      writeSession(selectedPageKey, pageNumber);
      const activeLabel = selectedRankLabel();
      if (activeLabel) writeSession(selectedTabKey, activeLabel);
    }
  }, true);

  let observer = null;
  let timer = 0;
  let restoring = false;
  let restoreDeadline = 0;
  let tabRestoreClicks = 0;
  let pageRestoreClicks = 0;
  let lastTabRestoreClickAt = 0;
  let lastPageRestoreClickAt = 0;
  let tabReadyAt = 0;
  let pageReadyAt = 0;
  let rankRequestsInFlight = 0;
  let rankRequestSequence = 0;
  let rankRequestEpoch = 0;
  let lastRankRequestFinishedAt = 0;
  let tabRequestSequenceAtClick = 0;
  let pageRequestSequenceAtClick = 0;
  let networkAttemptTimer = 0;
  const silentStabilityGuardMilliseconds = 3200;

  const isRankDataRequest = request => {
    try {
      const rawUrl = typeof request === 'string' || request instanceof URL
        ? String(request)
        : String(request && request.url || '');
      const url = new URL(rawUrl, location.href);
      if (url.origin !== location.origin) return false;
      // Only the two APIs that actually replace the ranking list participate
      // in restoration. Quota, notification and analytics requests can remain
      // open for a long time and must never hold the return screen hostage.
      return /\/compass_api\/shop\/product\/product_rank\//i.test(url.pathname) ||
        /\/compass_api\/shop\/mall\/market\/common_rank/i.test(url.pathname) ||
        /\/compass_api\/rank-(?:tab|page)/i.test(url.pathname);
    } catch (_error) {
      return false;
    }
  };

  const scheduleNetworkAttempt = delay => {
    if (!restoring || networkAttemptTimer) return;
    networkAttemptTimer = setTimeout(() => {
      networkAttemptTimer = 0;
      attemptRestore();
    }, Math.max(0, delay || 0));
  };

  const beginRankDataRequest = () => {
    const requestEpoch = rankRequestEpoch;
    rankRequestsInFlight += 1;
    rankRequestSequence += 1;
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      // A request suspended or aborted when the list entered the browser's
      // back-forward cache belongs to the old lifecycle. It must not decrement
      // or indefinitely block requests from the restored page.
      if (requestEpoch !== rankRequestEpoch) return;
      rankRequestsInFlight = Math.max(0, rankRequestsInFlight - 1);
      lastRankRequestFinishedAt = Date.now();
      // Give the page's promise/XHR handlers one rendering frame to commit the
      // response, then re-evaluate immediately instead of waiting a fixed time.
      scheduleNetworkAttempt(0);
    };
  };

  const resetRankRequestTracking = () => {
    rankRequestEpoch += 1;
    rankRequestsInFlight = 0;
    lastRankRequestFinishedAt = 0;
  };

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') {
    window.fetch = function (...args) {
      const finish = isRankDataRequest(args[0]) ? beginRankDataRequest() : null;
      try {
        const result = nativeFetch.apply(this, args);
        if (!finish) return result;
        return Promise.resolve(result).then(value => {
          finish();
          return value;
        }, error => {
          finish();
          throw error;
        });
      } catch (error) {
        if (finish) finish();
        throw error;
      }
    };
  }

  const xhrPrototype = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
  if (xhrPrototype && typeof xhrPrototype.open === 'function' && typeof xhrPrototype.send === 'function') {
    const nativeXhrOpen = xhrPrototype.open;
    const nativeXhrSend = xhrPrototype.send;
    const trackedXhrKey = Symbol('chuangbaoCompassRankRequest');
    const activeXhrKey = Symbol('chuangbaoCompassRankRequestActive');
    xhrPrototype.open = function (method, url, ...rest) {
      this[trackedXhrKey] = isRankDataRequest(url);
      return nativeXhrOpen.call(this, method, url, ...rest);
    };
    xhrPrototype.send = function (...args) {
      if (!this[trackedXhrKey] || this[activeXhrKey])
        return nativeXhrSend.apply(this, args);
      const finishRequest = beginRankDataRequest();
      this[activeXhrKey] = true;
      const finish = () => {
        this[activeXhrKey] = false;
        finishRequest();
      };
      this.addEventListener('loadend', finish, { once: true });
      try {
        return nativeXhrSend.apply(this, args);
      } catch (error) {
        finish();
        throw error;
      }
    };
  }

  const stopRestore = clearPending => {
    if (clearPending) {
      removeSession(restorePendingKey);
      removeSession(returnTabKey);
      removeSession(returnPageKey);
    }
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (timer) {
      clearInterval(timer);
      timer = 0;
    }
    if (networkAttemptTimer) {
      clearTimeout(networkAttemptTimer);
      networkAttemptTimer = 0;
    }
    restoring = false;
    removeRestoreCover();
  };

  const isVisible = element => {
    try {
      const style = getComputedStyle(element);
      const rectangle = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' &&
        Number(style.opacity || 1) > 0 && rectangle.width > 2 && rectangle.height > 2;
    } catch (_error) {
      return false;
    }
  };

  const isSelected = start => {
    let node = start;
    for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
      const ariaSelected = String(node.getAttribute && node.getAttribute('aria-selected') || '').toLowerCase();
      const ariaCurrent = String(node.getAttribute && node.getAttribute('aria-current') || '').toLowerCase();
      const className = typeof node.className === 'string' ? node.className : '';
      if (ariaSelected === 'true' || ariaCurrent === 'true' || ariaCurrent === 'page' ||
        /(?:^|[-_\s])(active|selected)(?:$|[-_\s])/i.test(className)) return true;
    }
    return false;
  };

  const findTab = desiredLabel => {
    const selector = '[role="tab"],button,a,[class*="tab"],[class*="Tab"]';
    const candidates = Array.from(document.querySelectorAll(selector));
    const exact = candidates.filter(element =>
      normalize(element.textContent) === desiredLabel && isVisible(element));
    if (!exact.length) return null;
    return exact.find(element => element.matches('[role="tab"],button,a')) || exact[exact.length - 1];
  };

  const paginationRoots = () => Array.from(document.querySelectorAll(
    '[class*="pagination"],[class*="Pagination"],[class*="pager"],[class*="Pager"],' +
    '[class*="page-nav"],[class*="page_nav"],[class*="PageNav"],nav[aria-label]'))
    .filter(isVisible);

  const findPage = desiredPage => {
    const roots = paginationRoots();
    for (const root of roots) {
      const candidates = Array.from(root.querySelectorAll('li,button,a,[role="button"]'));
      const exact = candidates.filter(element =>
        normalize(element.textContent) === desiredPage && isVisible(element));
      if (!exact.length) continue;
      // Click the actual interactive descendant first. Some Compass builds put
      // no handler on the surrounding <li>, so HTMLElement.click() on that
      // shell looks successful to our code but never changes the real page.
      return exact.find(element => element.matches('button,a,[role="button"]')) || exact[0];
    }
    return null;
  };

  const selectedRankLabel = () => {
    for (const label of supportedLabels) {
      const target = findTab(label);
      if (target && isSelected(target)) return label;
    }
    return '';
  };

  const selectedPageNumber = () => {
    const roots = paginationRoots();
    for (const root of roots) {
      const selected = Array.from(root.querySelectorAll('li,button,a,[role="button"]'))
        .find(element => /^\d{1,3}$/.test(normalize(element.textContent)) && isSelected(element));
      if (selected) return normalize(selected.textContent);
    }
    return '';
  };

  const captureVisibleState = () => {
    const label = selectedRankLabel();
    const pageNumber = selectedPageNumber();
    // Trusted clicks are authoritative. Pagehide is only a fallback for a
    // previously empty value: Compass may already have painted page 1 while
    // unloading, and that transient DOM must not overwrite the user's page 5.
    if (label && !readSession(selectedTabKey)) writeSession(selectedTabKey, label);
    if (pageNumber && !readSession(selectedPageKey)) writeSession(selectedPageKey, pageNumber);
  };

  const attemptRestore = () => {
    if (!restoring) return;
    if (readSession(restorePendingKey) !== '1') {
      stopRestore(false);
      return;
    }

    const now = Date.now();
    const desiredLabel = readSession(returnTabKey) || readSession(selectedTabKey);
    if (supportedLabels.has(desiredLabel) && desiredLabel !== '总榜') {
      const tabTarget = findTab(desiredLabel);
      if (!tabTarget || !isSelected(tabTarget)) {
        tabReadyAt = 0;
        if (tabTarget && tabRestoreClicks < 3 && now - lastTabRestoreClickAt >= 700) {
          tabRestoreClicks += 1;
          lastTabRestoreClickAt = now;
          tabRequestSequenceAtClick = rankRequestSequence;
          tabTarget.click();
        }
        if (now >= restoreDeadline) stopRestore(true);
        return;
      }
      if (!tabReadyAt) tabReadyAt = now;
      // Native WebView2 history commonly revives the exact list document from
      // memory. When its remembered tab is already selected, do not wait for
      // unrelated or stale network work at all.
      if (tabRestoreClicks === 0) {
        tabRequestSequenceAtClick = rankRequestSequence;
      } else {
        // Compass marks a tab active before its result request finishes. Wait
        // for that specific ranking request in the silent fallback path.
        if (rankRequestsInFlight > 0) return;
        const tabRequestObserved = rankRequestSequence > tabRequestSequenceAtClick;
        const tabSettledAt = tabRequestObserved
          ? Math.max(tabReadyAt, lastRankRequestFinishedAt)
          : Math.max(tabReadyAt, lastTabRestoreClickAt);
        const tabQuietPeriod = tabRequestObserved ? 0 : 80;
        if (now - tabSettledAt < tabQuietPeriod) return;
      }
    }

    const desiredPageNumber = Number.parseInt(
      readSession(returnPageKey) || readSession(selectedPageKey),
      10);
    if (!Number.isFinite(desiredPageNumber) || desiredPageNumber <= 1) {
      stopRestore(true);
      return;
    }

    const desiredPage = String(desiredPageNumber);
    const pageTarget = findPage(desiredPage);
    if (pageTarget && isSelected(pageTarget)) {
      if (!pageReadyAt) pageReadyAt = now;
      // Showing the revived page is immediate, but keep this silent observer
      // alive for a few seconds. Compass can apply a stale tab/list response
      // well after page 5 first appears and reset the selected page to 1. The
      // previous implementation stopped here and therefore missed that reset.
      if (rankRequestsInFlight > 0) return;
      const pageRequestObserved = rankRequestSequence > pageRequestSequenceAtClick;
      const pageSettledAt = pageRequestObserved
        ? Math.max(pageReadyAt, lastRankRequestFinishedAt)
        : Math.max(pageReadyAt, lastPageRestoreClickAt);
      const pageQuietPeriod = silentStabilityGuardMilliseconds;
      if (now - pageSettledAt >= pageQuietPeriod) stopRestore(true);
      return;
    }
    pageReadyAt = 0;
    if (pageTarget && pageRestoreClicks < 8 && now - lastPageRestoreClickAt >= 120) {
      pageRestoreClicks += 1;
      lastPageRestoreClickAt = now;
      pageRequestSequenceAtClick = rankRequestSequence;
      pageTarget.click();
      return;
    }

    if (now >= restoreDeadline ||
      (pageRestoreClicks >= 8 && now - lastPageRestoreClickAt >= 1500)) stopRestore(true);
  };

  const beginRestore = () => {
    if (restoring || readSession(restorePendingKey) !== '1') return;
    restoring = true;
    restoreDeadline = Date.now() + 30000;
    tabRestoreClicks = 0;
    pageRestoreClicks = 0;
    lastTabRestoreClickAt = 0;
    lastPageRestoreClickAt = 0;
    tabReadyAt = 0;
    pageReadyAt = 0;
    tabRequestSequenceAtClick = rankRequestSequence;
    pageRequestSequenceAtClick = rankRequestSequence;
    if (document.documentElement) {
      observer = new MutationObserver(attemptRestore);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'aria-selected', 'aria-current']
      });
    }
    timer = setInterval(attemptRestore, 25);
    attemptRestore();
  };

  // Compass can now switch between the rank and detail routes with
  // history.pushState rather than a document navigation. In that case neither
  // the detail-document snapshot above nor pageshow runs, so a normal browser
  // Back operation used to return to Compass' default first page. Capture the
  // immutable rank snapshot while the rank DOM is still alive, then start the
  // same restoration pipeline when the SPA returns to the rank route.
  let lastSpaPath = path;
  const currentSpaPath = () => String(location.pathname || '').replace(/\/+$/, '') || '/';
  const handleSpaRouteChange = () => {
    const nextPath = currentSpaPath();
    if (nextPath === lastSpaPath) return;
    const leavingRankForDetail = rankPaths.has(lastSpaPath) && detailPaths.has(nextPath);
    const returningToRank = detailPaths.has(lastSpaPath) && rankPaths.has(nextPath);
    if (leavingRankForDetail) freezeReturnSnapshot();
    lastSpaPath = nextPath;
    if (!returningToRank) return;
    if (readSession(restorePendingKey) !== '1')
      writeSession(restorePendingKey, '1');
    beginRestore();
  };
  const wrapHistoryRoute = methodName => {
    try {
      const nativeMethod = window.history && window.history[methodName];
      if (typeof nativeMethod !== 'function') return;
      window.history[methodName] = function (...args) {
        const result = nativeMethod.apply(this, args);
        handleSpaRouteChange();
        return result;
      };
    } catch (_error) {
      // Native navigation and popstate remain covered when a page prevents
      // history wrapping.
    }
  };
  wrapHistoryRoute('pushState');
  wrapHistoryRoute('replaceState');
  window.addEventListener('popstate', handleSpaRouteChange);

  // pageshow covers a document restored from WebView2's back-forward cache;
  // DOMContentLoaded covers a newly reconstructed Compass ranking document.
  window.addEventListener('pageshow', event => {
    // Fetch/XHR counters from a frozen list document are not trustworthy after
    // a native history return; start this lifecycle from a clean slate.
    if (event.persisted) resetRankRequestTracking();
    beginRestore();
  });
  window.addEventListener('pagehide', () => {
    captureVisibleState();
    resetRankRequestTracking();
  });
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', beginRestore, { once: true });
  else
    beginRestore();
})();
