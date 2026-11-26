(() => {
  'use strict';

  // [v5.4存活标记] 证明本模板脚本被执行
  try { localStorage.setItem('cba_pi_alive', new Date().toISOString() + ' ' + String(location.href).slice(0, 90)); } catch (_e) {}
  const item = __CHUANGBAO_INSIGHT_ITEM__;
  const host = String(location.hostname || '').toLowerCase();
  if (window.top !== window || (host !== 'compass.jinritemai.com' && !host.endsWith('.compass.jinritemai.com')))
    return 'unsupported-page';

  const productId = String(item && item.productId || '').trim();
  if (!/^\d{6,32}$/.test(productId)) return 'invalid-product-id';

  const mountId = 'chuangbao-product-insight-v1';
  const priorMount = document.getElementById(mountId);
  if (priorMount) { priorMount.dispatchEvent(new Event('chuangbao-insight-close')); priorMount.remove(); }
  document.getElementById('chuangbao-insight-frame-v1')?.remove();
  // Align with the date that Compass currently offers on the ranking page.
  // Early in the morning its latest available day may precede yesterday.
  const officialRange = String(document.body?.innerText || '').match(/(\d{4}[/-]\d{1,2}[/-]\d{1,2})\s*[-~至]\s*(\d{4}[/-]\d{1,2}[/-]\d{1,2})/);
  const officialEndParts = officialRange?.[2].split(/[/-]/).map(Number);
  const officialEnd = officialEndParts && new Date(Date.UTC(officialEndParts[0], officialEndParts[1] - 1, officialEndParts[2]));
  const validOfficialEnd = officialEnd && Number.isFinite(officialEnd.getTime()) &&
    officialEnd.getUTCFullYear() === officialEndParts[0] && officialEnd.getUTCMonth() === officialEndParts[1] - 1 &&
    officialEnd.getUTCDate() === officialEndParts[2] ? officialEnd : null;
  const focusBefore = document.activeElement;
  const mount = document.createElement('div');
  mount.id = mountId;
  mount.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';
  const shadow = mount.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    *{box-sizing:border-box}button{font-family:inherit}.overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(15,23,42,.38);backdrop-filter:blur(4px);font-family:"Microsoft YaHei","Segoe UI",sans-serif;color:#14213d}
    .panel{display:flex;flex-direction:column;width:min(1520px,calc(100vw - 48px));height:min(850px,calc(100vh - 48px));overflow:hidden;border:1px solid #dce8fb;border-radius:18px;background:#fff;box-shadow:0 28px 80px rgba(15,23,42,.24)}
    header{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:15px 20px;border-bottom:1px solid #e4eaf2;background:linear-gradient(180deg,#fff,#f7faff)}h2{margin:0;font-size:19px}.sub{margin-top:5px;color:#60708a;font-size:12px}.actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
    button{height:32px;padding:0 13px;border:1px solid #a9caf8;border-radius:8px;background:#eef6ff;color:#1769ff;font-size:12px;cursor:pointer}button:hover:not(:disabled){background:#1769ff;color:#fff}button:disabled{border-color:#d8e0eb;background:#f4f6f9;color:#a4afbf;cursor:not-allowed}.close{width:34px;padding:0;border-radius:50%;font-size:21px;background:#fff;color:#60708a}
    .summary{padding:9px 20px;border-bottom:1px solid #e4eaf2;background:#f8fafc;color:#60708a;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.body{min-height:0;flex:1;overflow:auto}.table{min-width:1160px}.head,.row{display:grid;grid-template-columns:minmax(300px,1.45fr) repeat(5,minmax(118px,.72fr)) minmax(104px,.55fr)}.head{position:sticky;top:0;z-index:2;min-height:42px;align-items:center;border-bottom:1px solid #e4eaf2;background:#f5f8fc;color:#25324a;font-size:12px;font-weight:700}.cell{display:flex;align-items:center;justify-content:flex-end;min-width:0;padding:9px 11px;text-align:right;white-space:pre-line}.cell:first-child{justify-content:flex-start;text-align:left}.row{min-height:76px;border-bottom:1px solid #edf1f6;font-size:12px}.row:nth-child(even){background:#fbfdff}.video{display:flex;align-items:center;gap:9px;min-width:0}.cover{width:44px;height:58px;flex:0 0 44px;border-radius:7px;object-fit:cover;background:#dbe8f8}.video-text{min-width:0}.title{overflow:hidden;color:#172033;font-weight:650;text-overflow:ellipsis;white-space:nowrap}.meta{margin-top:3px;overflow:hidden;color:#7c899d;text-overflow:ellipsis;white-space:nowrap}.state{display:grid;place-items:center;min-height:360px;padding:30px;color:#60708a;font-size:14px;text-align:center;white-space:pre-line}.state.error{color:#c83b42}.copy-one{height:28px;padding:0 10px;border-radius:7px}
    footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 20px;border-top:1px solid #e4eaf2;background:#fff;color:#60708a;font-size:12px}.pager{display:flex;gap:8px}.filters{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 20px;border-bottom:1px solid #e4eaf2;font-size:12px;color:#60708a}.filters button[aria-pressed=true]{background:#1769ff;color:#fff;border-color:#1769ff}.range-label{margin-left:auto}.video input{accent-color:#1769ff}.cell a{font-size:12px;color:#1769ff;text-decoration:none;white-space:nowrap}.cell:last-child{gap:8px;flex-wrap:wrap}.select-all{display:flex;align-items:center;gap:6px;margin-right:8px}button:focus-visible,a:focus-visible,input:focus-visible{outline:2px solid #1769ff;outline-offset:3px}.panel{outline:none}
    @media(max-width:900px){.overlay{padding:10px}.panel{width:calc(100vw - 20px);height:calc(100vh - 20px)}header{align-items:flex-start;flex-direction:column}.actions{justify-content:flex-start}.head,.row{grid-template-columns:280px repeat(5,116px) 102px}}
  `;

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const panel = document.createElement('section');
  panel.className = 'panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', '创爆商品透视');
  overlay.addEventListener('click', event => { if (event.target === overlay) closeInsight(); });

  const header = document.createElement('header');
  const heading = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = '创爆增强显示 · 带货短视频';
  const subtitle = document.createElement('div');
  subtitle.className = 'sub';
  subtitle.textContent = `商品ID：${productId}`;
  heading.append(title, subtitle);
  const actions = document.createElement('div');
  actions.className = 'actions';
  const actionButton = label => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    return button;
  };
  const copyProduct = actionButton('复制商品ID');
  const copyAll = actionButton('复制本页链接');
  copyAll.disabled = true;
  const copySelected = actionButton('复制已选（0）');
  copySelected.disabled = true;
  const close = actionButton('×');
  close.className = 'close';
  close.setAttribute('aria-label', '关闭商品透视');
  close.addEventListener('click', () => closeInsight());
  actions.append(copyProduct, copyAll, copySelected, close);
  header.append(heading, actions);

  const summary = document.createElement('div');
  summary.className = 'summary';
  summary.textContent = `当前商品：${String(item.title || '-')} ｜ 店铺/作者：${String(item.author || '-')}`;
  const body = document.createElement('div');
  body.className = 'body';
  const table = document.createElement('div');
  table.className = 'table';
  const tableHead = document.createElement('div');
  tableHead.className = 'head';
  ['短视频信息', '用户支付金额', '商品成交人数', '商品点击率(人数)', '商品成交订单数', '商品成交件数', '操作'].forEach(label => {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.textContent = label;
    tableHead.append(cell);
  });
  const rows = document.createElement('div');
  table.append(tableHead, rows);
  body.append(table);
  const footer = document.createElement('footer');
  const pageText = document.createElement('span');
  pageText.textContent = '第 1 页';
  const pager = document.createElement('div');
  pager.className = 'pager';
  const previous = actionButton('上一页');
  const refresh = actionButton('刷新本页');
  const next = actionButton('下一页');
  pager.append(previous, refresh, next);
  footer.append(pageText, pager);
  const filters = document.createElement('div');
  filters.className = 'filters';
  const dateButtons = [];
  const selectLabel = document.createElement('label');
  selectLabel.className = 'select-all';
  const selectAll = document.createElement('input');
  selectAll.type = 'checkbox';
  selectAll.setAttribute('aria-label', '选择本页全部视频');
  selectLabel.append(selectAll, document.createTextNode('选择本页'));
  filters.append(selectLabel);
  const dateStorageKey = 'chuangbao.product-insight.days.v1';
  let selectedDays = 7;
  try { const saved = Number(localStorage.getItem(dateStorageKey)); if ([1, 7, 30].includes(saved)) selectedDays = saved; } catch (_error) {}
  for (const days of [1, 7, 30]) {
    const button = actionButton(`近${days}天`);
    button.dataset.days = String(days);
    button.setAttribute('aria-pressed', String(days === selectedDays));
    button.addEventListener('click', () => {
      if (selectedDays === days) return;
      selectedDays = days;
      try { localStorage.setItem(dateStorageKey, String(days)); } catch (_error) {}
      dateButtons.forEach(entry => entry.setAttribute('aria-pressed', String(Number(entry.dataset.days) === days)));
      load(1);
    });
    dateButtons.push(button);
    filters.append(button);
  }
  const rangeLabel = document.createElement('span');
  rangeLabel.className = 'range-label';
  filters.append(rangeLabel);
  panel.append(header, summary, filters, body, footer);
  overlay.append(panel);
  shadow.append(style, overlay);
  document.documentElement.append(mount);
  close.focus({ preventScroll: true });

  let currentPage = 1;
  let totalPages = 1;
  let total = 0;
  let loading = false;
  let currentItems = [];
  let hasNext = false;
  let activeController = null;
  let requestTransport = null;
  let requestVersion = 0;
  let closed = false;
  const selected = new Set();
  const closeInsight = () => {
    if (closed) return;
    closed = true;
    requestVersion += 1;
    activeController?.abort();
    requestTransport?.frame.remove();
    requestTransport = null;
    window.removeEventListener('keydown', keyboardHandler, true);
    mount.remove();
    if (focusBefore && focusBefore.isConnected && typeof focusBefore.focus === 'function') focusBefore.focus({ preventScroll: true });
  };
  mount.addEventListener('chuangbao-insight-close', closeInsight, { once: true });
  const keyboardHandler = event => {
    if (!mount.isConnected) return;
    if (event.key === 'Escape') { event.preventDefault(); closeInsight(); }
    if (event.key === 'Tab') {
      const focusable = Array.from(shadow.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href]'));
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && shadow.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && shadow.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  };
  window.addEventListener('keydown', keyboardHandler, true);

  const formatDate = date => `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')} 00:00:00`;
  const currentDateRange = () => {
    // Calendar days in Asia/Shanghai, independent of the Windows time zone.
    const end = new Date(Date.now() + 8 * 60 * 60 * 1000);
    end.setUTCDate(end.getUTCDate() - 1);
    if (validOfficialEnd && validOfficialEnd < end) end.setTime(validOfficialEnd.getTime());
    const begin = new Date(end);
    begin.setUTCDate(begin.getUTCDate() - selectedDays + 1);
    return { beginDate: formatDate(begin), endDate: formatDate(end), dateType: { 1: '20', 7: '21', 30: '23' }[selectedDays] };
  };
  // Preserve the page request pipeline (including the platform session SDK).
  // Read the server response with native accessors from a local about:blank realm
  // so unrelated response display rewrites cannot disguise server errors.
  const getRequestTransport = () => {
    if (requestTransport) return requestTransport;
    const frame = document.createElement('iframe');
    frame.id = 'chuangbao-insight-transport-v1';
    frame.title = '商品数据请求';
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = 'display:none;';
    document.documentElement.append(frame);
    try {
      const XHR = window.XMLHttpRequest;
      const nativePrototype = frame.contentWindow.XMLHttpRequest.prototype;
      const responseTextGetter = Object.getOwnPropertyDescriptor(nativePrototype, 'responseText')?.get;
      const statusGetter = Object.getOwnPropertyDescriptor(nativePrototype, 'status')?.get;
      if (!responseTextGetter || !statusGetter) throw new Error('请求环境不可用');
      requestTransport = { frame, XHR, responseTextGetter, statusGetter };
      return requestTransport;
    } catch (_error) {
      frame.remove();
      throw new Error('当前页面暂不支持数据读取，请重新打开罗盘后再试。');
    }
  };
  // [创爆补丁 v5.8] 额度受限降级通道：直接请求被服务器拒绝（st=602 店铺商品参数错误 /
  // st=600002 详情页访问次数超限等额度类限制）时，改走官方详情页捕获模式——
  // 隐藏 iframe 加载官方详情页 → 页面自身请求 flow_more（服务器认可页面上下文，9月8日实测可成功）→
  // 捕获响应渲染表格（对齐大富豪插件的捕获架构）。捕获结果写本地缓存（24小时），
  // 避免每次查询都消耗详情页访问次数。若本注释消失说明文件被构建覆盖需重打。
  const captureCacheKey = (pid, days) => `cba_cap_cache_${pid}_${days}`;
  const readCaptureCache = (pid, days) => {
    try {
      const raw = localStorage.getItem(captureCacheKey(pid, days));
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (!entry || !entry.time || Date.now() - entry.time > 24 * 60 * 60 * 1000) return null;
      return entry.payload;
    } catch (_error) { return null; }
  };
  const writeCaptureCache = (pid, days, payload) => {
    try { localStorage.setItem(captureCacheKey(pid, days), JSON.stringify({ time: Date.now(), payload })); } catch (_error) {}
  };
  const captureViaDetailPage = (pid, signal) => new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.id = 'chuangbao-insight-frame-v1';
    frame.title = '商品数据捕获';
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;border:0;visibility:hidden;pointer-events:none;';
    const captured = [];
    let settled = false;
    let poller = null;
    const cleanup = () => { clearInterval(poller); frame.remove(); };
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      cleanup();
      error ? reject(error) : resolve(value);
    };
    const onAbort = () => finish(new DOMException('Request cancelled', 'AbortError'));
    if (signal.aborted) { onAbort(); return; }
    signal.addEventListener('abort', onAbort, { once: true });
    const guard = setTimeout(() => finish(new Error('官方详情页加载超时（25秒），请稍后重试。'), null), 25000);
    frame.addEventListener('load', () => {
      // load 事件后挂捕获钩子：SPA 页面的数据请求（flow_more）在 JS 初始化阶段发出，可被截获。
      try {
        const win = frame.contentWindow;
        const proto = win.XMLHttpRequest.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'responseText');
        if (desc && desc.get) {
          const nativeGet = desc.get;
          Object.defineProperty(proto, 'responseText', {
            configurable: true,
            enumerable: desc.enumerable,
            get: function () {
              const value = nativeGet.call(this);
              try {
                if (String(this._cbaUrl || '').indexOf('flow_source/flow_more') !== -1 && value && value.length > 2)
                  captured.push(value);
              } catch (_error) {}
              return value;
            }
          });
          const nativeOpen = proto.open;
          proto.open = function (method, url) {
            this._cbaUrl = url;
            return nativeOpen.apply(this, arguments);
          };
        }
        const nativeFetch = win.fetch;
        if (nativeFetch) {
          win.fetch = function (input, init) {
            return nativeFetch.apply(this, arguments).then(response => {
              try {
                const url = String(typeof input === 'string' ? input : (input && input.url) || '');
                if (url.indexOf('flow_source/flow_more') !== -1) {
                  response.clone().text().then(text => { if (text && text.length > 2) captured.push(text); }).catch(() => {});
                }
              } catch (_error) {}
              return response;
            });
          };
        }
      } catch (_error) {}
      let waited = 0;
      poller = setInterval(() => {
        waited += 1000;
        for (let index = captured.length - 1; index >= 0; index -= 1) {
          try {
            const payload = JSON.parse(captured[index]);
            const values = payload && (Array.isArray(payload.data) ? payload.data : (payload.data && Array.isArray(payload.data.data) ? payload.data.data : null));
            if (values && (payload.st === 0 || payload.st === '0')) { finish(null, payload); return; }
          } catch (_error) {}
        }
        if (waited >= 15000) {
          for (let index = captured.length - 1; index >= 0; index -= 1) {
            try {
              const payload = JSON.parse(captured[index]);
              if (payload && payload.st === 600002) {
                finish(new Error('平台服务器已限制本账号的详情页访问次数（600002），捕获通道同样受限。若为每日额度，次日自动恢复；也可换个商品ID或稍后再试。'), null);
                return;
              }
            } catch (_error) {}
          }
          finish(new Error('官方详情页 15 秒内未返回视频数据（页面未发起请求或无数据），请用"查看详情"打开官方页面确认。'), null);
        }
      }, 1000);
    }, { once: true });
    frame.src = `https://compass.jinritemai.com/shop/chance/rank-product/detail?product_id=${encodeURIComponent(pid)}`;
    document.documentElement.append(frame);
  });
  const insightUrl = (page, range) => {
    const url = new URL('/compass_api/shop/product/compete_product_detail/flow_source/flow_more', location.origin);
    const params = {
      product_id: productId,
      saleType: '0',
      source_entrance: 'video',
      date_type: range.dateType,
      end_date: range.endDate,
      begin_date: range.beginDate,
      activity_id: '',
      // Preserve the existing nine requested metrics and the platform units.
      index_selected: 'pay_amt,dh_product_show_uv,dh_product_click_uv,pay_ucnt,dh_product_click_ratio_uv,dh_pay_conversion_click_ratio_uv,dh_pay_conversion_show_ratio_uv,pay_cnt,pay_combo_cnt',
      page_size: '10',
      page_no: String(page),
      sort_field: 'pay_amt',
      is_asc: 'false',
      // [创爆补丁] 对齐大富豪：附上请求标识 _lid（时间+随机串，非登录令牌），降低与真实页面请求的差异。
      _lid: `${Date.now()}${Math.random().toString(36).slice(2, 8)}`
    };
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    return url.toString();
  };
  const requestJson = (address, signal) => new Promise((resolve, reject) => {
    const url = new URL(address, location.origin);
    if (url.origin !== location.origin ||
        url.pathname !== '/compass_api/shop/product/compete_product_detail/flow_source/flow_more') {
      reject(new Error('当前页面暂不支持数据读取，请重新打开罗盘后再试。'));
      return;
    }
    if (signal.aborted) { reject(new DOMException('Request cancelled', 'AbortError')); return; }
    const { XHR, responseTextGetter, statusGetter } = getRequestTransport();
    const xhr = new XHR();
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      xhr.onload = xhr.onerror = xhr.ontimeout = xhr.onabort = null;
      error ? reject(error) : resolve(value);
    };
    const abort = () => {
      finish(new DOMException('Request cancelled', 'AbortError'));
      xhr.abort();
    };
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    try {
      xhr.open('GET', url.toString(), true);
      xhr.withCredentials = true;
      xhr.timeout = 15000;
      xhr.setRequestHeader('Accept', 'application/json, text/plain, */*');
      xhr.onload = () => {
        try {
          const status = statusGetter.call(xhr);
          if (status === 401) throw new Error('登录已失效，请在选品中心重新登录罗盘。');
          if (status === 403) throw new Error('当前账号没有查看该商品数据的权限。');
          if (status < 200 || status >= 300) throw new Error(`平台暂时无法提供数据（HTTP ${status}），请稍后刷新。`);
          let payload;
          try { payload = JSON.parse(responseTextGetter.call(xhr)); }
          catch (_error) { throw new Error('平台未返回有效数据，请确认罗盘登录状态后重试。'); }
          if (!payload || typeof payload !== 'object' || Array.isArray(payload))
            throw new Error('平台未返回有效数据，请确认罗盘登录状态后重试。');
          const codes = ['code', 'st', 'status_code']
            .filter(key => Object.prototype.hasOwnProperty.call(payload, key)).map(key => payload[key]);
          if (codes.some(code => code !== 0 && code !== '0')) {
            const rawMessage = payload.msg || payload.message;
            const message = typeof rawMessage === 'string' ? rawMessage.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
            const codeText = codes.filter(code => code !== 0 && code !== '0')
              .map(code => String(code)).filter(code => /^[a-z0-9_-]{1,24}$/i.test(code)).join('/');
            throw new Error(`罗盘未通过商品查询${message ? '：' + message : ''}${codeText ? '（' + codeText + '）' : ''}。请核对商品ID，并在“查看详情”确认是否可查看。`);
          }
          finish(null, payload);
        } catch (error) { finish(error); }
      };
      xhr.onerror = () => finish(new Error('网络连接失败，请检查网络后刷新。'));
      xhr.ontimeout = () => finish(new Error('读取超时，请稍后刷新。'));
      xhr.onabort = () => finish(new DOMException('Request cancelled', 'AbortError'));
      xhr.send();
    } catch (error) { finish(error); }
  });
  const numberValue = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const compact = value => Math.abs(value) >= 10000 ? `${Number((value / 10000).toFixed(1))}万` : Number(value).toLocaleString('zh-CN');
  const formatted = (value, unit) => unit === 'ratio' ? `${Number((value * 100).toFixed(1))}%` : unit === 'price' ? `¥${compact(value / 100)}` : compact(value);
  const metric = node => {
    const lower = numberValue(node && node.extra_value && node.extra_value.lower && node.extra_value.lower.value);
    const upper = numberValue(node && node.extra_value && node.extra_value.upper && node.extra_value.upper.value);
    const direct = numberValue(node && node.value && node.value.value);
    const unit = node && node.extra_value && node.extra_value.lower && node.extra_value.lower.unit || node && node.value && node.value.unit || 'number';
    if (lower === null && upper === null) return direct === null ? '-' : formatted(direct, unit);
    if (lower !== null && (upper === null || upper < 0)) return `${formatted(lower, unit)}+`;
    if (lower === null) return formatted(upper, unit);
    return `${formatted(lower, unit)}-${formatted(upper, unit).replace(/^¥/, '')}`;
  };
  const safeUrl = value => {
    try { const url = new URL(String(value || '')); return /^https?:$/.test(url.protocol) ? url.toString() : ''; }
    catch (_error) { return ''; }
  };
  const normalize = raw => {
    const video = raw && raw.base_info && raw.base_info.video_base_info || {};
    const author = video.author_info || {};
    const metrics = raw && raw.metrics || {};
    const extra = raw && raw.base_info && raw.base_info.extra_info || {};
    const videoId = String(video.video_id || '').trim();
    const published = numberValue(video.publish_time);
    const publishedText = published === null ? '-' : new Date(published * 1000).toLocaleString('zh-CN', { hour12: false });
    return {
      videoId,
      videoUrl: safeUrl(video.video_url) || (/^\d{6,32}$/.test(videoId) ? `https://www.douyin.com/video/${videoId}` : ''),
      cover: safeUrl(video.video_image),
      title: String(video.video_title || '未命名短视频').trim(),
      author: String(author.author_nick_name || '-').trim(),
      published: publishedText,
      payAmount: metric(metrics.pay_amt),
      buyerCount: metric(metrics.pay_ucnt),
      clickRate: metric(metrics.dh_product_click_ratio_uv),
      orderCount: metric(metrics.pay_cnt),
      dealCount: metric(metrics.pay_combo_cnt),
      watchCount: metric({ value: extra.watch_cnt }),
      commentCount: metric({ value: extra.comment_cnt })
    };
  };
  const copy = async text => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(text); return; } catch (_error) {}
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
    document.body.append(area);
    area.select();
    const okay = document.execCommand('copy');
    area.remove();
    if (!okay) throw new Error('复制失败');
  };
  const notify = message => {
    subtitle.textContent = message;
    window.setTimeout(() => { if (mount.isConnected) subtitle.textContent = `商品ID：${productId}`; }, 1600);
  };
  copyProduct.addEventListener('click', async () => { try { await copy(productId); notify('商品ID已复制'); } catch (_error) { notify('商品ID复制失败'); } });
  copyAll.addEventListener('click', async () => {
    const links = currentItems.map(value => value.videoUrl).filter(Boolean);
    if (!links.length) return;
    try { await copy(links.join('\n')); notify(`已复制本页 ${links.length} 条视频链接`); }
    catch (_error) { notify('视频链接复制失败'); }
  });
  const updateSelection = () => {
    const selectable = currentItems.map((value, index) => value.videoUrl ? index : -1).filter(index => index >= 0);
    selectAll.disabled = loading || !selectable.length;
    selectAll.checked = selectable.length > 0 && selected.size === selectable.length;
    selectAll.indeterminate = selected.size > 0 && selected.size < selectable.length;
    copySelected.textContent = `复制已选（${selected.size}）`;
    copySelected.disabled = loading || !selected.size;
  };
  copySelected.addEventListener('click', async () => {
    const links = currentItems.filter((_value, index) => selected.has(index)).map(value => value.videoUrl).filter(Boolean);
    if (!links.length) return;
    try { await copy(links.join('\n')); notify(`已复制所选 ${links.length} 条视频链接`); }
    catch (_error) { notify('视频链接复制失败'); }
  });
  selectAll.addEventListener('change', () => {
    selected.clear();
    if (selectAll.checked) currentItems.forEach((value, index) => { if (value.videoUrl) selected.add(index); });
    rows.querySelectorAll('input[data-select-index]').forEach(input => { input.checked = selected.has(Number(input.dataset.selectIndex)); });
    updateSelection();
  });
  const setState = (message, error) => {
    rows.replaceChildren();
    const state = document.createElement('div');
    state.className = `state${error ? ' error' : ''}`;
    state.textContent = message;
    rows.append(state);
  };
  const render = values => {
    rows.replaceChildren();
    if (!values.length) { setState('当前商品没有返回带货短视频数据。', false); return; }
    values.forEach((value, index) => {
      const row = document.createElement('div');
      row.className = 'row';
      const info = document.createElement('div');
      info.className = 'cell video';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.selectIndex = String(index);
      checkbox.setAttribute('aria-label', `选择视频：${value.title}`);
      checkbox.disabled = !value.videoUrl;
      checkbox.addEventListener('change', () => {
        checkbox.checked ? selected.add(index) : selected.delete(index);
        updateSelection();
      });
      const image = document.createElement(value.cover ? 'img' : 'span');
      image.className = 'cover';
      image.setAttribute('aria-hidden', 'true');
      if (value.cover) {
        image.alt = '';
        image.src = value.cover;
        image.addEventListener('error', () => {
          const placeholder = document.createElement('span');
          placeholder.className = 'cover';
          placeholder.setAttribute('aria-hidden', 'true');
          image.replaceWith(placeholder);
        }, { once: true });
      }
      const text = document.createElement('div');
      text.className = 'video-text';
      const name = document.createElement('div');
      name.className = 'title';
      name.title = value.title;
      name.textContent = value.title;
      const author = document.createElement('div');
      author.className = 'meta';
      author.textContent = `${value.author} ｜ ${value.published}`;
      const extra = document.createElement('div');
      extra.className = 'meta';
      extra.textContent = `观看 ${value.watchCount} ｜ 评论 ${value.commentCount}`;
      text.append(name, author, extra);
      info.append(checkbox, image, text);
      row.append(info);
      [value.payAmount, value.buyerCount, value.clickRate, value.orderCount, value.dealCount].forEach(metricText => {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.textContent = metricText;
        row.append(cell);
      });
      const action = document.createElement('div');
      action.className = 'cell';
      if (value.videoUrl) {
        const preview = document.createElement('a');
        preview.textContent = '预览';
        preview.href = /^\d{6,32}$/.test(value.videoId) ? `https://www.douyin.com/video/${value.videoId}` : value.videoUrl;
        preview.target = '_blank';
        preview.rel = 'noopener noreferrer';
        action.append(preview);
      }
      const copyOne = actionButton('复制视频');
      copyOne.className = 'copy-one';
      copyOne.disabled = !value.videoUrl;
      copyOne.addEventListener('click', async () => { try { await copy(value.videoUrl); notify('视频链接已复制'); } catch (_error) { notify('视频链接复制失败'); } });
      action.append(copyOne);
      row.append(action);
      rows.append(row);
    });
  };
  const updatePager = () => {
    pageText.textContent = total > 0 ? `第 ${currentPage} / ${totalPages} 页，共 ${total} 条` : `第 ${currentPage} 页`;
    previous.disabled = loading || currentPage <= 1;
    next.disabled = loading || !hasNext;
    refresh.disabled = loading;
    copyAll.disabled = loading || !currentItems.some(value => value.videoUrl);
    updateSelection();
  };
  const load = async page => {
    if (closed) return;
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    const version = ++requestVersion;
    const isCurrent = () => version === requestVersion && !closed && mount.isConnected;
    loading = true;
    currentPage = page;
    currentItems = [];
    selected.clear();
    total = 0;
    totalPages = 1;
    hasNext = false;
    const range = currentDateRange();
    rangeLabel.textContent = `${range.beginDate.slice(0, 10)} — ${range.endDate.slice(0, 10)}`;
    updatePager();
    setState(`正在读取近${selectedDays}天的带货短视频（第 ${page} 页）…`, false);
    try {
      // Bind this response to the exact date and page requested by this load.
      const payload = await requestJson(insightUrl(page, range), controller.signal);
      if (!isCurrent()) return;
      const values = Array.isArray(payload.data) ? payload.data : payload.data?.data;
      if (!Array.isArray(values)) throw new Error('平台未返回视频列表，请在官方详情页确认是否有数据。');
      const pageResult = payload.page_result || payload.data?.page_result || {};
      for (const key of ['page_no', 'page']) {
        if (Object.prototype.hasOwnProperty.call(pageResult, key) &&
            (!/^[0-9]+$/.test(String(pageResult[key])) || Number(pageResult[key]) !== page))
          throw new Error('平台返回的页码与本次查询不一致，请刷新本页重试。');
      }
      currentItems = values.map(normalize);
      const pageSize = Number.isSafeInteger(pageResult.page_size) && pageResult.page_size > 0 ? pageResult.page_size : 10;
      const hasTotal = Number.isSafeInteger(pageResult.total) && pageResult.total >= 0;
      total = hasTotal ? pageResult.total : 0;
      totalPages = Math.max(1, Math.ceil(total / pageSize));
      hasNext = hasTotal ? page < totalPages : values.length >= pageSize;
      render(currentItems);
    } catch (error) {
      if (!isCurrent() || error?.name === 'AbortError') return;
      // [创爆补丁 v5.8] 额度受限降级：先查本地缓存，无缓存走官方详情页捕获模式。
      let recovered = false;
      try {
        let payload = page === 1 ? readCaptureCache(productId, selectedDays) : null;
        const fromCache = !!payload;
        if (!payload) {
          setState('额度受限，正在通过官方详情页捕获数据…（首次约 15-25 秒，结果将缓存 24 小时）', false);
          payload = await captureViaDetailPage(productId, controller.signal);
          writeCaptureCache(productId, selectedDays, payload);
        }
        if (!isCurrent()) return;
        const values = Array.isArray(payload.data) ? payload.data : payload.data?.data;
        if (!Array.isArray(values)) throw new Error('捕获通道未返回视频列表，请用"查看详情"确认该商品是否有数据。');
        // 捕获数据来自详情页自身的请求（默认日期段），不校验本地页码一致性。
        currentItems = values.map(normalize);
        const pageResult = payload.page_result || payload.data?.page_result || {};
        const pageSize = Number.isSafeInteger(pageResult.page_size) && pageResult.page_size > 0 ? pageResult.page_size : 10;
        const hasTotal = Number.isSafeInteger(pageResult.total) && pageResult.total >= 0;
        total = hasTotal ? pageResult.total : 0;
        totalPages = Math.max(1, Math.ceil(total / pageSize));
        hasNext = hasTotal ? 1 < totalPages : values.length >= pageSize;
        currentPage = 1;
        render(currentItems);
        recovered = true;
        try { localStorage.setItem('cba_capture_ok', new Date().toISOString() + (fromCache ? ' cache' : ' live') + ' items=' + currentItems.length + ' pid=' + productId); } catch (_diag) {}
      } catch (captureError) {
        if (!isCurrent() || captureError?.name === 'AbortError') return;
        try { localStorage.setItem('cba_frame_err', new Date().toISOString() + ' capture=' + String(captureError && captureError.message || captureError).slice(0, 200)); } catch (_diag) {}
        error = captureError;
      }
      if (!recovered) {
        currentItems = [];
        selected.clear();
        total = 0;
        totalPages = 1;
        hasNext = false;
        setState(error?.message || '暂时无法读取数据，请稍后刷新。', true);
      }
    } finally {
      if (isCurrent()) { loading = false; updatePager(); }
    }
  };
  previous.addEventListener('click', () => load(Math.max(1, currentPage - 1)));
  next.addEventListener('click', () => { if (hasNext) load(currentPage + 1); });
  refresh.addEventListener('click', () => load(currentPage));
  load(1);
  return 'opened';
})();
