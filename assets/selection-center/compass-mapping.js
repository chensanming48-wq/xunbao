(async () => {
  'use strict';

  const request = __CHUANGBAO_MAPPING_ITEM__;
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
