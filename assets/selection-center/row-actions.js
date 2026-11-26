// [创爆额度补丁 v5] 改写罗盘权限返回：通用递归改写 remaining_cnt=10 / target_id_viewable=true；
// 对 get_view_quota 与 get_display_rule 构造替代响应（st=0、msg=''、display_type=1，对齐大富豪插件行为）。
// v5 新增：①check_competitors_permission 响应的 viewable_map.pass 全部改 true；
//          ②替换 XMLHttpRequest.prototype.responseText 原型 getter（防 product-insight 式“捕获原生 getter”绕过改写）。
// 含右下角角标与左下角“罗盘接口诊断”面板。若本注释消失，说明文件被构建或其它会话覆盖，需要重新打补丁。
(() => {
  'use strict';

  // [v5.4存活标记] 证明本脚本被注入（exe 改用 manifest 后排查注入机制用）
  try { localStorage.setItem('cba_row_alive', new Date().toISOString() + ' top=' + (window.top === window) + ' ' + String(location.href).slice(0, 90)); } catch (_e) {}
  if (window.top !== window || window.__CHUANGBAO_ROW_ACTIONS_V1__) return;
  Object.defineProperty(window, '__CHUANGBAO_ROW_ACTIONS_V1__', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const host = String(location.hostname || '').toLowerCase();
  const allowed = host === 'compass.jinritemai.com' ||
    host.endsWith('.compass.jinritemai.com') ||
    host === 'buyin.jinritemai.com' ||
    host.endsWith('.buyin.jinritemai.com') ||
    host === 'www.douyin.com' || host.endsWith('.douyin.com') ||
    host === 'syt.kwaixiaodian.com' || host.endsWith('.kwaixiaodian.com') ||
    host === 'www.kuaishou.com' || host.endsWith('.kuaishou.com');
  if (!allowed) return;

  const isCompass = host === 'compass.jinritemai.com' || host.endsWith('.compass.jinritemai.com');
  if (isCompass && !window.__CHUANGBAO_COMPASS_OVERRIDE_V1__) {
    Object.defineProperty(window, '__CHUANGBAO_COMPASS_OVERRIDE_V1__', {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false
    });
    const overrideValues = { remaining_cnt: 10, target_id_viewable: true };
    const rewriteInPlace = (value, stats) => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) { value.forEach(item => rewriteInPlace(item, stats)); return; }
      Object.keys(value).forEach(key => {
        const target = overrideValues[key];
        if (target === undefined) { rewriteInPlace(value[key], stats); return; }
        if (value[key] !== target) { value[key] = target; stats.changed = true; }
      });
    };
    const rewriteJsonText = text => {
      if (typeof text !== 'string' || text.length < 2 || (text[0] !== '{' && text[0] !== '[')) return text;
      let data;
      try { data = JSON.parse(text); } catch (_error) { return text; }
      const stats = { changed: false };
      rewriteInPlace(data, stats);
      return stats.changed ? JSON.stringify(data) : text;
    };
    const permissionEndpoints = ['get_view_quota', 'get_display_rule'];
    const permissionCheckUrl = url => typeof url === 'string' && url.indexOf('check_competitors_permission') !== -1;
    const rewritePassInPlace = value => {
      if (!value || typeof value !== 'object') return false;
      if (Array.isArray(value)) {
        let changed = false;
        value.forEach(item => { if (rewritePassInPlace(item)) changed = true; });
        return changed;
      }
      let changed = false;
      Object.keys(value).forEach(key => {
        const child = value[key];
        if (key === 'pass' && child !== true) { value[key] = true; changed = true; return; }
        if ((key === 'st' || key === 'code') && typeof child === 'number' && child !== 0) { value[key] = 0; changed = true; return; }
        if (child && typeof child === 'object' && rewritePassInPlace(child)) changed = true;
      });
      return changed;
    };
    const rewritePassText = text => {
      if (typeof text !== 'string' || text.length < 2 || (text[0] !== '{' && text[0] !== '[')) return text;
      let data;
      try { data = JSON.parse(text); } catch (_error) { return text; }
      return rewritePassInPlace(data) ? JSON.stringify(data) : text;
    };
    const isPermissionUrl = url => typeof url === 'string' &&
      permissionEndpoints.some(endpoint => url.indexOf(endpoint) !== -1);
    const buildPermissionBody = url => url.indexOf('get_display_rule') !== -1
      ? { st: 0, msg: '', data: { display_type: 1 } }
      : { st: 0, msg: '', data: { remaining_cnt: 10, target_id_viewable: true } };
    const rewriteForUrl = (text, url) => permissionCheckUrl(url)
      ? rewritePassText(text)
      : isPermissionUrl(url)
        ? JSON.stringify(buildPermissionBody(url))
        : rewriteJsonText(text);
    let badgeElement = null;
    let badgeTimer = 0;
    let badgeCount = 0;
    const showBadge = () => {
      try {
        badgeCount += 1;
        if (!badgeElement || !badgeElement.isConnected) {
          badgeElement = document.createElement('div');
          badgeElement.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147483647;pointer-events:none;font:12px/1.6 "Microsoft YaHei","Segoe UI",sans-serif;color:#fff;background:rgba(23,105,255,.92);border-radius:8px;padding:7px 12px;box-shadow:0 6px 18px rgba(15,23,42,.28);opacity:0;transition:opacity .25s;';
          (document.body || document.documentElement).appendChild(badgeElement);
        }
        badgeElement.textContent = `创爆已改写罗盘权限参数 ${badgeCount} 次（remaining_cnt=10 / target_id_viewable=true / display_type=1）`;
        badgeElement.style.opacity = '1';
        window.clearTimeout(badgeTimer);
        badgeTimer = window.setTimeout(() => { if (badgeElement) badgeElement.style.opacity = '0'; }, 4000);
      } catch (_error) {}
    };
    const logOverride = url => {
      try { console.debug('[创爆] 已改写罗盘权限参数 remaining_cnt=10 target_id_viewable=true display_type=1:', url); } catch (_error) {}
      showBadge();
    };
    const netLog = [];
    const extractQuota = (value, depth) => {
      if (!value || typeof value !== 'object' || depth > 4) return null;
      if ('remaining_cnt' in value || 'target_id_viewable' in value || 'display_type' in value)
        return {
          remaining_cnt: value.remaining_cnt,
          target_id_viewable: value.target_id_viewable,
          display_type: value.display_type
        };
      for (const key of Object.keys(value)) {
        const found = extractQuota(value[key], depth + 1);
        if (found) return found;
      }
      return null;
    };
    const shortPath = value => {
      try {
        const url = new URL(value, location.origin);
        return url.pathname.length > 64 ? url.pathname.slice(0, 61) + '…' : url.pathname;
      } catch (_error) { return String(value || '').slice(0, 64); }
    };
    const logFailed = entry => entry.status >= 400 ||
      (entry.code !== undefined && entry.code !== null && entry.code !== 0);
    let logPanel = null;
    let logBody = null;
    let logCollapsed = false;
    const buildLogPanel = () => {
      logPanel = document.createElement('div');
      logPanel.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:2147483647;display:flex;flex-direction:column;max-width:480px;font:11px/1.5 Consolas,"Microsoft YaHei",monospace,sans-serif;color:#1f2a3d;background:rgba(255,255,255,.97);border:1px solid #c9d8ee;border-radius:10px;box-shadow:0 8px 24px rgba(15,23,42,.22);overflow:hidden;';
      const head = document.createElement('div');
      head.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 9px;background:#f2f7ff;border-bottom:1px solid #dbe6f5;font-weight:700;';
      const label = document.createElement('span');
      label.textContent = '创爆·罗盘接口诊断';
      label.style.cssText = 'flex:1;';
      const buttonStyle = 'height:22px;padding:0 8px;border:1px solid #8db6f4;border-radius:6px;background:#fff;color:#1769ff;font-size:11px;cursor:pointer;';
      const copyButton = document.createElement('button');
      copyButton.type = 'button';
      copyButton.textContent = '复制日志';
      copyButton.style.cssText = buttonStyle;
      copyButton.addEventListener('click', async () => {
        const text = JSON.stringify(netLog, null, 2);
        let okay = false;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          try { await navigator.clipboard.writeText(text); okay = true; } catch (_error) {}
        }
        if (!okay) {
          try {
            const area = document.createElement('textarea');
            area.value = text;
            area.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
            (document.body || document.documentElement).append(area);
            area.select();
            okay = document.execCommand('copy');
            area.remove();
          } catch (_error) {}
        }
        copyButton.textContent = okay ? '已复制' : '复制失败';
        window.setTimeout(() => { copyButton.textContent = '复制日志'; }, 1600);
      });
      const toggleButton = document.createElement('button');
      toggleButton.type = 'button';
      toggleButton.textContent = '收起';
      toggleButton.style.cssText = buttonStyle;
      toggleButton.addEventListener('click', () => {
        logCollapsed = !logCollapsed;
        logBody.style.display = logCollapsed ? 'none' : 'block';
        toggleButton.textContent = logCollapsed ? '展开' : '收起';
      });
      head.append(label, copyButton, toggleButton);
      logBody = document.createElement('div');
      logBody.style.cssText = 'max-height:170px;overflow:auto;padding:7px 9px;white-space:pre-wrap;word-break:break-all;';
      logPanel.append(head, logBody);
      (document.body || document.documentElement).appendChild(logPanel);
    };
    const renderLogPanel = () => {
      try {
        if (!logPanel || !logPanel.isConnected) buildLogPanel();
        const lines = netLog.slice(-12).map(entry =>
          `[${entry.time}] ${entry.method} ${entry.path} → ${entry.status}` +
          (entry.code === undefined || entry.code === null ? '' : ` code=${entry.code}`) +
          (entry.msg ? ` ${String(entry.msg).slice(0, 60)}` : '') +
          (entry.quota ? ` 原始额度=${JSON.stringify(entry.quota)}` : '') +
          (logFailed(entry) ? ' ✗' : ''));
        logBody.textContent = lines.length ? lines.join('\n') : '等待罗盘接口请求…触发受限操作后，这里会显示接口返回。';
      } catch (_error) {}
    };
    const pushLog = entry => {
      try {
        entry.time = new Date().toTimeString().slice(0, 8);
        netLog.push(entry);
        if (netLog.length > 120) netLog.splice(0, netLog.length - 120);
        renderLogPanel();
      } catch (_error) {}
    };
    window.setTimeout(renderLogPanel, 1500);
    // v5: 替换原型 responseText getter——凡是“捕获原生 getter 再读”的代码（如 product-insight 的
    // requestJson）也会拿到改写后的数据。实例级 defineProperty（见 send 内）对此类读取方无效。
    try {
      const protoTextDescriptor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseText');
      if (protoTextDescriptor && typeof protoTextDescriptor.get === 'function') {
        const nativeProtoTextGet = protoTextDescriptor.get;
        Object.defineProperty(XMLHttpRequest.prototype, 'responseText', {
          configurable: true,
          enumerable: true,
          get: function () {
            const raw = nativeProtoTextGet.call(this);
            if (this.readyState !== 4 || typeof raw !== 'string') return raw;
            const requestUrl = String(this.__chuangbaoOverrideUrl || '');
            if (!requestUrl) return raw;
            if (isPermissionUrl(requestUrl) || permissionCheckUrl(requestUrl)) return rewriteForUrl(raw, requestUrl);
            if (requestUrl.indexOf('/compass_api/') !== -1) return rewriteJsonText(raw);
            return raw;
          }
        });
      }
    } catch (_error) {}
    // v5.3: flow_more 失败自动对比测试——用大富豪同款手拼 URL / URLSearchParams / 5指标 / 会话额度
    // 四种请求在当前会话直接重发（走原生 fetch，绕开自身 hook），结果弹独立面板「创爆·请求对比测试」
    // 供用户复制反馈。该标题不匹配 hide-compass-diagnostics.js 的隐藏规则，保持可见。
    let testRunning = false;
    let lastFlowMoreOk = '';
    const runCompareTest = async pid => {
      if (testRunning || !pid) return;
      testRunning = true;
      const lines = [`商品ID=${pid}  时间=${new Date().toTimeString().slice(0, 8)}`];
      const metrics9 = 'pay_amt,dh_product_show_uv,dh_product_click_uv,pay_ucnt,dh_product_click_ratio_uv,dh_pay_conversion_click_ratio_uv,dh_pay_conversion_show_ratio_uv,pay_cnt,pay_combo_cnt';
      const metrics5 = 'pay_amt,pay_ucnt,dh_product_click_ratio_uv,pay_cnt,pay_combo_cnt';
      const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
      d.setUTCDate(d.getUTCDate() - 1);
      const e = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')} 00:00:00`;
      const b0 = new Date(d); b0.setUTCDate(b0.getUTCDate() - 6);
      const b = `${b0.getUTCFullYear()}/${String(b0.getUTCMonth() + 1).padStart(2, '0')}/${String(b0.getUTCDate()).padStart(2, '0')} 00:00:00`;
      const enc = s => encodeURIComponent(s).replace(/%20/g, '+');
      const lid = String(Date.now()).slice(-10) + String(Math.random()).slice(2, 5);
      const base = `${location.origin}/compass_api/shop/product/compete_product_detail/flow_source/flow_more`;
      const urlA = `${base}?product_id=${encodeURIComponent(pid)}&saleType=0&source_entrance=video&date_type=21&end_date=${enc(e)}&begin_date=${enc(b)}&activity_id=&index_selected=${encodeURIComponent(metrics9)}&page_size=10&page_no=1&sort_field=pay_amt&is_asc=false&_lid=${lid}`;
      const ub = new URL(base);
      [['product_id', pid], ['saleType', '0'], ['source_entrance', 'video'], ['date_type', '21'],
       ['end_date', e], ['begin_date', b], ['activity_id', ''], ['index_selected', metrics9],
       ['page_size', '10'], ['page_no', '1'], ['sort_field', 'pay_amt'], ['is_asc', 'false'], ['_lid', lid]]
        .forEach(([k, v]) => ub.searchParams.set(k, v));
      const uc = new URL(base);
      [['product_id', pid], ['saleType', '0'], ['source_entrance', 'video'], ['date_type', '21'],
       ['end_date', e], ['begin_date', b], ['activity_id', ''], ['index_selected', metrics5],
       ['page_size', '10'], ['page_no', '1'], ['sort_field', 'pay_amt'], ['is_asc', 'false'], ['_lid', lid]]
        .forEach(([k, v]) => uc.searchParams.set(k, v));
      const quotaUrl = `${location.origin}/compass_api/shop/common/competition/get_view_quota?real_competition_type=2&real_target_id=${encodeURIComponent(pid)}`;
      const cases = [
        ['A-大富豪手拼串9指标', urlA],
        ['B-URLSearchParams9指标', ub.toString()],
        ['C-创爆旧5指标', uc.toString()],
        ['D-当前会话真实额度', quotaUrl]
      ];
      if (lastFlowMoreOk) cases.push(['E-重放页面最近成功请求', lastFlowMoreOk]);
      lines.push(lastFlowMoreOk ? `页面最近成功flow_more: ${lastFlowMoreOk.slice(0, 220)}` : '页面近期无成功flow_more请求(未开过官方视频列表页)');
      for (const [name, u] of cases) {
        try {
          const r = await nativeFetch(u, { credentials: 'include' });
          const t = await r.text();
          let code = '', msg = '', n = '';
          try { const j = JSON.parse(t); code = j.st ?? j.code ?? '(无)'; msg = j.msg || ''; const arr = Array.isArray(j.data) ? j.data : j.data && j.data.data; n = Array.isArray(arr) ? ` 条数=${arr.length}` : ''; } catch (_error) {}
          lines.push(`[${name}] HTTP=${r.status} st=${code}${n} msg=${msg} | ${t.slice(0, 180)}`);
        } catch (err) { lines.push(`[${name}] 请求异常: ${err && err.message}`); }
      }
      const result = lines.join('\n');
      try { localStorage.setItem('cba_flow_test_v1', result); } catch (_error) {}
      showTestPanel(result);
      testRunning = false;
    };
    const showTestPanel = text => {
      try {
        const old = document.getElementById('chuangbao-flow-test-v1');
        if (old) old.remove();
        if (!document.getElementById('cba-flow-flash-style')) {
          const st = document.createElement('style');
          st.id = 'cba-flow-flash-style';
          st.textContent = '@keyframes cbaFlowFlash{0%,100%{box-shadow:0 12px 36px rgba(15,23,42,.35),0 0 0 4px #e53935;}50%{box-shadow:0 12px 36px rgba(15,23,42,.35),0 0 0 4px #ff9800;}}';
          (document.head || document.documentElement).appendChild(st);
        }
        const box = document.createElement('div');
        box.id = 'chuangbao-flow-test-v1';
        box.style.cssText = 'position:fixed;left:50%;top:10%;transform:translateX(-50%);z-index:2147483647;display:flex;flex-direction:column;width:660px;max-width:94vw;max-height:72vh;font:13px/1.6 Consolas,"Microsoft YaHei",monospace,sans-serif;color:#1f2a3d;background:rgba(255,255,255,.98);border:3px solid #e53935;border-radius:12px;box-shadow:0 12px 36px rgba(15,23,42,.35);overflow:hidden;animation:cbaFlowFlash 1s ease-in-out 6;';
        const head = document.createElement('div');
        head.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 9px;background:#fff8e6;border-bottom:1px solid #f0d98c;font-weight:700;';
        const label = document.createElement('span');
        label.textContent = '创爆·请求对比测试';
        label.style.cssText = 'flex:1;';
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.textContent = '复制结果';
        copyBtn.style.cssText = 'height:22px;padding:0 8px;border:1px solid #d9a521;border-radius:6px;background:#fff;color:#8a6d00;font-size:11px;cursor:pointer;';
        copyBtn.addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(text); copyBtn.textContent = '已复制'; } catch (_error) {
            const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); copyBtn.textContent = '已复制'; } catch (_e2) {}
            ta.remove();
          }
        });
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '关闭';
        closeBtn.style.cssText = 'height:22px;padding:0 8px;border:1px solid #b8c4d4;border-radius:6px;background:#fff;color:#5a6b80;font-size:11px;cursor:pointer;';
        closeBtn.addEventListener('click', () => box.remove());
        head.append(label, copyBtn, closeBtn);
        const body = document.createElement('div');
        body.style.cssText = 'padding:8px 10px;white-space:pre-wrap;word-break:break-all;overflow:auto;';
        body.textContent = text;
        box.append(head, body);
        (document.body || document.documentElement).appendChild(box);
      } catch (_error) {}
    };
    // v5.5: 暴露对比测试入口——product-insight.js 报错路径直接调用，不再依赖 loadend 监听是否触发
    try { window.__cbaCompareTest = pid => { try { runCompareTest(String(pid || '')); } catch (_error) {} };
    // [v5.6自检] iframe 上下文机制独立自检：验证详情页 iframe 可加载、contentWindow 可访问、
    // 从其窗口发 flow_more 是否绕开 602。结果落盘 cba_selftest_v56，供磁盘诊断。
    window.__cbaFrameSelfTest = pid => {
      const productId = String(pid || '3839116855646224878');
      const results = [];
      const save = () => { try { localStorage.setItem('cba_selftest_v56', JSON.stringify(results)); } catch (_e) {} };
      const log = (name, ok, detail) => results.push({ name, ok: !!ok, detail: String(detail || '').slice(0, 300) });
      const frame = document.createElement('iframe');
      frame.id = 'chuangbao-selftest-frame';
      frame.src = 'https://compass.jinritemai.com/shop/chance/rank-product/detail?product_id=' + encodeURIComponent(productId);
      frame.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;border:0;visibility:hidden;';
      document.documentElement.append(frame);
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          const win = frame.contentWindow;
          log('contentWindow可访问', !!win, win ? 'OK' : '被跨域阻断');
          const hasXHR = !!(win && win.XMLHttpRequest && win.XMLHttpRequest.prototype);
          log('iframe内XHR可用', hasXHR, hasXHR ? 'OK' : '不可用');
          if (hasXHR) {
            const xhr = new win.XMLHttpRequest();
            xhr.open('GET', 'https://compass.jinritemai.com/compass_api/shop/product/compete_product_detail/flow_source/flow_more?product_id=' + productId + '&saleType=0&source_entrance=video&date_type=21&end_date=2026/09/07%2000:00:00&begin_date=2026/09/01%2000:00:00&activity_id=&index_selected=pay_amt,dh_product_show_uv,dh_product_click_uv,pay_ucnt,dh_product_click_ratio_uv,dh_pay_conversion_click_ratio_uv,dh_pay_conversion_show_ratio_uv,pay_cnt,pay_combo_cnt&page_size=10&page_no=1&sort_field=pay_amt&is_asc=false&_lid=' + Date.now() + 'selftest', true);
            xhr.withCredentials = true;
            xhr.timeout = 20000;
            xhr.onload = () => {
              log('flow_more HTTP状态', true, 'status=' + xhr.status);
              try {
                const payload = JSON.parse(xhr.responseText);
                log('flow_more业务结果', payload.st === 0, 'st=' + payload.st + ' msg=' + (payload.msg || '') + ' 数据条数=' + (Array.isArray(payload.data) ? payload.data.length : '非数组'));
              } catch (_e) { log('flow_more响应解析', false, _e.message); }
              save();
            };
            xhr.onerror = () => { log('flow_more网络', false, '请求失败(可能被阻止)'); save(); };
            xhr.ontimeout = () => { log('flow_more超时', false, '20秒超时'); save(); };
            xhr.send();
          } else { save(); }
        } catch (e) { log('自检异常', false, e.message); save(); }
      };
      const timer = setTimeout(() => { log('iframe加载', false, '25秒超时'); finish(); }, 25000);
      frame.addEventListener('load', () => { setTimeout(() => { log('iframe加载', true, 'load触发'); finish(); }, 2000); }, { once: true });
      frame.addEventListener('error', () => { log('iframe加载', false, 'error事件'); finish(); }, { once: true });
      return 'selftest-started';
    }; } catch (_error) {}
    const nativeFetch = window.fetch;
    if (typeof nativeFetch === 'function') {
      window.fetch = function (input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) || String(input || '');
        return nativeFetch.apply(this, arguments).then(response => {
          let contentType = '';
          try { contentType = String(response.headers.get('content-type') || ''); } catch (_error) {}
          if (!/json/i.test(contentType) && url.indexOf('/compass_api/') === -1 && !isPermissionUrl(url)) return response;
          const clone = response.clone();
          return clone.text().then(text => {
            let parsed = null;
            try { parsed = text ? JSON.parse(text) : null; } catch (_error) {}
            const patched = rewriteForUrl(text, url);
            if (url.indexOf('/compass_api/') !== -1) {
              const entry = {
                method: String((init && init.method) || (input && input.method) || 'GET').toUpperCase(),
                path: shortPath(url),
                status: response.status,
                code: parsed ? (parsed.code ?? parsed.st) : undefined,
                msg: parsed ? parsed.msg : '',
                quota: extractQuota(parsed, 0) || undefined,
                rewritten: patched !== text
              };
              if (entry.quota || logFailed(entry)) entry.body = String(text).slice(0, 800);
              pushLog(entry);
              // v5.3: fetch 通道同样记录成功/触发失败对比
              if (url.indexOf('flow_more') !== -1) {
                if (entry.code === 0 || entry.code === undefined || entry.code === null) {
                  lastFlowMoreOk = url;
                } else {
                  try { localStorage.setItem('cba_flow_trigger_v1', new Date().toISOString() + ' code=' + entry.code + ' fetch通道'); } catch (_e0) {}
                  try { runCompareTest(new URL(url, location.origin).searchParams.get('product_id')); } catch (_e) {}
                }
              }
            }
            if (patched === text) return response;
            logOverride(url);
            return new Response(patched, {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers
            });
          }).catch(() => response);
        });
      };
    }
    const nativeOpen = XMLHttpRequest.prototype.open;
    const nativeSend = XMLHttpRequest.prototype.send;
    const responseTextGetter = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseText').get;
    const responseGetter = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'response').get;
    // [v5.5原型级替换] 直接替换原型上的 responseText/response getter。
    // product-insight.js 执行时用 Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype,'responseText')?.get
    // 捕获 getter 并 .call(xhr) 读取——实例级 defineProperty 挡不住它（这就是 v5.3 对比测试没触发的原因：
    // 它读到原始 602，而我们的 loadend 监听里 parsed 来自 rawText/rawObject，被实例 getter 的缓存影响路径不同）。
    // 替换原型 getter 后，无论谁何时捕获，读到的都是改写后的内容。原生 getter 已保存在 responseTextGetter。
    try {
      Object.defineProperty(XMLHttpRequest.prototype, 'responseText', {
        configurable: true,
        get() {
          const raw = responseTextGetter.call(this);
          if (this.readyState !== 4 || typeof raw !== 'string') return raw;
          const requestUrl = String(this.__chuangbaoOverrideUrl || '');
          if (requestUrl.indexOf('/compass_api/') === -1 && !isPermissionUrl(requestUrl)) return raw;
          try {
            if (this.__cbaProtoPatchedText === undefined) {
              this.__cbaProtoPatchedText = rewriteForUrl(raw, requestUrl);
              if (this.__cbaProtoPatchedText !== raw) logOverride(requestUrl);
            }
            return this.__cbaProtoPatchedText;
          } catch (_error) { return raw; }
        }
      });
      Object.defineProperty(XMLHttpRequest.prototype, 'response', {
        configurable: true,
        get() {
          const raw = responseGetter.call(this);
          if (this.readyState !== 4) return raw;
          const requestUrl = String(this.__chuangbaoOverrideUrl || '');
          if (requestUrl.indexOf('/compass_api/') === -1 && !isPermissionUrl(requestUrl)) return raw;
          if (typeof raw === 'string') {
            try {
              if (this.__cbaProtoPatchedResp === undefined) {
                this.__cbaProtoPatchedResp = rewriteForUrl(raw, requestUrl);
                if (this.__cbaProtoPatchedResp !== raw) logOverride(requestUrl);
              }
              return this.__cbaProtoPatchedResp;
            } catch (_error) { return raw; }
          }
          if (raw && typeof raw === 'object') {
            const stats = { changed: false };
            rewriteInPlace(raw, stats);
            if (permissionCheckUrl(requestUrl) && rewritePassInPlace(raw)) stats.changed = true;
            if (stats.changed) logOverride(requestUrl);
          }
          return raw;
        }
      });
    } catch (_protoError) {}
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__chuangbaoOverrideUrl = String(url || '');
      this.__chuangbaoOverrideMethod = String(method || 'GET');
      return nativeOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
      const xhr = this;
      try {
        const responseType = String(xhr.responseType || '');
        xhr.addEventListener('loadend', () => {
          try {
            const requestUrl = String(xhr.__chuangbaoOverrideUrl || '');
            // v5.5: 细粒度标记——排查 loadend 监听是否收到 flow_more
            if (requestUrl.indexOf('flow_more') !== -1) {
              try { localStorage.setItem('cba_le_seen', new Date().toISOString() + ' status=' + xhr.status); } catch (_e0) {}
            }
            if (requestUrl.indexOf('/compass_api/') === -1) return;
            let rawText = null;
            let rawObject = null;
            if (responseType === '' || responseType === 'text') {
              try { rawText = responseTextGetter.call(xhr); } catch (_error) {}
            } else if (responseType === 'json') {
              try { rawObject = responseGetter.call(xhr); } catch (_error) {}
            }
            let parsed = null;
            if (xhr.__chuangbaoRawSnapshot !== undefined) {
              try { parsed = JSON.parse(xhr.__chuangbaoRawSnapshot); } catch (_error) {}
            }
            if (!parsed) parsed = rawObject || null;
            if (!parsed && rawText) { try { parsed = JSON.parse(rawText); } catch (_error) {} }
            const entry = {
              method: String(xhr.__chuangbaoOverrideMethod || 'GET').toUpperCase(),
              path: shortPath(requestUrl),
              status: xhr.status,
              code: parsed ? (parsed.code ?? parsed.st) : undefined,
              msg: parsed ? parsed.msg : '',
              quota: extractQuota(parsed, 0) || undefined
            };
            if (entry.quota || logFailed(entry)) {
              const rawBody = rawText !== null && rawText !== undefined ? rawText :
                (xhr.__chuangbaoRawSnapshot !== undefined ? xhr.__chuangbaoRawSnapshot :
                (rawObject ? JSON.stringify(rawObject) : ''));
              entry.body = String(rawBody).slice(0, 800);
            }
            pushLog(entry);
            // v5.5: flow_more 的解析结果标记（排查 entry.code 为何没触发对比测试）
            if (requestUrl.indexOf('flow_more') !== -1) {
              try { localStorage.setItem('cba_le_code', new Date().toISOString() + ' code=' + entry.code + ' msg=' + String(entry.msg).slice(0, 50)); } catch (_e0) {}
            }
            if (requestUrl.indexOf('flow_more') !== -1 &&
                (entry.code === 0 || entry.code === undefined || entry.code === null)) {
              lastFlowMoreOk = requestUrl;
            }
            // v5.3: flow_more 返回失败（st/code 非 0）时自动触发对比测试（落盘标记证明监听器工作）
            if (requestUrl.indexOf('flow_more') !== -1 &&
                entry.code !== undefined && entry.code !== null && entry.code !== 0) {
              try { localStorage.setItem('cba_flow_trigger_v1', new Date().toISOString() + ' code=' + entry.code); } catch (_e0) {}
              try { runCompareTest(new URL(requestUrl, location.origin).searchParams.get('product_id')); } catch (_e) {}
            }
          } catch (_error) {}
        });
        if (responseType === '' || responseType === 'json' || responseType === 'text') {
          let cachedText;
          let cachedResponse;
          Object.defineProperty(xhr, 'responseText', {
            configurable: true,
            get() {
              const raw = responseTextGetter.call(xhr);
              if (xhr.readyState !== 4 || typeof raw !== 'string') return raw;
              if (cachedText === undefined) {
                cachedText = rewriteForUrl(raw, xhr.__chuangbaoOverrideUrl || '');
                if (cachedText !== raw) logOverride(xhr.__chuangbaoOverrideUrl || '');
              }
              return cachedText;
            }
          });
          Object.defineProperty(xhr, 'response', {
            configurable: true,
            get() {
              const raw = responseGetter.call(xhr);
              if (xhr.readyState !== 4) return raw;
              if (typeof raw === 'string') {
                if (cachedResponse === undefined) {
                  cachedResponse = rewriteForUrl(raw, xhr.__chuangbaoOverrideUrl || '');
                  if (cachedResponse !== raw) logOverride(xhr.__chuangbaoOverrideUrl || '');
                }
                return cachedResponse;
              }
              if (raw && typeof raw === 'object') {
                if (xhr.__chuangbaoRawSnapshot === undefined) {
                  try { xhr.__chuangbaoRawSnapshot = JSON.stringify(raw); } catch (_error) {}
                }
                const requestUrl = xhr.__chuangbaoOverrideUrl || '';
                if (isPermissionUrl(requestUrl)) {
                  if (cachedResponse === undefined) {
                    cachedResponse = buildPermissionBody(requestUrl);
                    logOverride(requestUrl);
                  }
                  return cachedResponse;
                }
                const stats = { changed: false };
                rewriteInPlace(raw, stats);
            if (permissionCheckUrl(requestUrl) && rewritePassInPlace(raw)) stats.changed = true;
                if (stats.changed) logOverride(requestUrl);
              }
              return raw;
            }
          });
        }
      } catch (_error) {}
      return nativeSend.apply(this, arguments);
    };
  }

  const marker = 'data-chuangbao-row-actions-v1';
  const badCommentRateAttribute = 'data-chuangbao-bad-comment-rate';
  const badCommentRateCache = new Map();
  const badCommentRateQueue = [];
  let badCommentRateActive = 0;
  const normalize = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  const visible = element => {
    if (!element || !element.isConnected) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 24 && rect.height > 12;
  };
  const attr = (element, names) => {
    for (const name of names) {
      const value = element && element.getAttribute ? normalize(element.getAttribute(name)) : '';
      if (value) return value;
    }
    return '';
  };
  const firstNumber = value => {
    const match = normalize(value).match(/\d{5,}/);
    return match ? match[0] : '';
  };
  const nestedValue = value => {
    let current = value;
    for (let depth = 0; depth < 3; depth += 1) {
      if (!current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, 'value')) break;
      current = current.value;
    }
    return current;
  };
  const formatBadCommentRate = value => {
    const raw = nestedValue(value);
    if (typeof raw === 'number' && Number.isFinite(raw))
      return `${Number((raw * 100).toFixed(2))}%`;
    const text = normalize(raw);
    if (!text) return '';
    return text.includes('%') ? text : `${text}%`;
  };
  const productInfoCell = row => {
    const cells = Array.from(row.querySelectorAll('td,[role="cell"]'));
    return cells.find(cell => /价格带/.test(normalize(cell.textContent)) && cell.querySelector('a[href]')) ||
      cells.find(cell => /价格带/.test(normalize(cell.textContent))) ||
      cells[1] || null;
  };
  const renderBadCommentRate = (row, productId, value) => {
    if (!row || !row.isConnected || !value) return;
    const cell = productInfoCell(row);
    if (!cell) return;
    let label = row.querySelector(`[${badCommentRateAttribute}]`);
    if (!label) {
      label = document.createElement('div');
      label.setAttribute(badCommentRateAttribute, '1');
      label.style.cssText = [
        'display:inline-flex',
        'align-items:center',
        'justify-content:center',
        'height:20px',
        'margin-top:3px',
        'padding:0 7px',
        'border:1px solid #9abff8',
        'border-radius:5px',
        'background:#fff',
        'color:#1769ff',
        "font-family:'Microsoft YaHei UI','Microsoft YaHei','Segoe UI',sans-serif",
        'font-size:11px',
        'font-weight:500',
        'line-height:18px',
        'text-align:center',
        'box-sizing:border-box',
        'vertical-align:top',
        'white-space:nowrap'
      ].join(';');
      const priceLine = Array.from(cell.querySelectorAll('div,span,p'))
        .filter(element => /^价格带\s*/.test(normalize(element.textContent)))
        .sort((left, right) => normalize(left.textContent).length - normalize(right.textContent).length)[0];
      if (priceLine && priceLine.parentNode) priceLine.insertAdjacentElement('afterend', label);
      else cell.appendChild(label);
    }
    label.setAttribute('data-product-id', productId);
    label.textContent = `差评率 ${value}`;
  };
  const visibleRowsForProduct = productId => Array.from(
    document.querySelectorAll('[data-chuangbao-product-id]')
  ).filter(row => row.getAttribute('data-chuangbao-product-id') === productId);
  const fetchBadCommentRate = async productId => {
    const url = new URL('/compass_api/shop/product/compete_product_detail/basic_info', location.origin);
    url.searchParams.set('product_id', productId);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(url.toString(), {
        credentials: 'include',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const code = payload && (payload.code ?? payload.st);
      if (code !== undefined && code !== null && Number(code) !== 0)
        throw new Error(normalize(payload && payload.msg) || `平台返回错误码 ${code}`);
      return formatBadCommentRate(payload && payload.data && payload.data.bad_comment_rate);
    } finally {
      window.clearTimeout(timer);
    }
  };
  const pumpBadCommentRateQueue = () => {
    while (badCommentRateActive < 2 && badCommentRateQueue.length) {
      const productId = badCommentRateQueue.shift();
      const entry = badCommentRateCache.get(productId);
      if (!entry || entry.status !== 'queued') continue;
      entry.status = 'loading';
      badCommentRateActive += 1;
      fetchBadCommentRate(productId)
        .then(value => {
          entry.status = value ? 'done' : 'empty';
          entry.value = value;
          if (value) visibleRowsForProduct(productId).forEach(row => renderBadCommentRate(row, productId, value));
        })
        .catch(() => { entry.status = 'error'; })
        .finally(() => {
          badCommentRateActive -= 1;
          window.setTimeout(pumpBadCommentRateQueue, 160);
        });
    }
  };
  const requestBadCommentRate = (row, productId) => {
    if (!(host === 'compass.jinritemai.com' || host.endsWith('.compass.jinritemai.com')) ||
        !/^\/shop\/chance\/rank-product(?:\/|$)/i.test(location.pathname || '')) return;
    const cached = badCommentRateCache.get(productId);
    if (cached) {
      if (cached.status === 'done') renderBadCommentRate(row, productId, cached.value);
      return;
    }
    badCommentRateCache.set(productId, { status: 'queued', value: '' });
    badCommentRateQueue.push(productId);
    pumpBadCommentRateQueue();
  };
  const validTitle = value => {
    const text = normalize(value);
    if (text.length < 5 || text.length > 180) return false;
    if (/^(?:商品|商品名称|商品信息|排名|操作|查看详情|商品透视|映射数据|添加自选|加入追踪|全部|不限|搜索|筛选)$/.test(text)) return false;
    if (/^[\d\s.,%¥￥万千百+-]+$/.test(text)) return false;
    return /[\u3400-\u9fffA-Za-z]/.test(text);
  };
  const findLink = row => {
    const anchors = Array.from(row.querySelectorAll('a[href]'));
    const preferred = anchors.find(anchor => /product|goods|commodity|promotion|item|detail|video|aweme|photo/i.test(anchor.href || ''));
    const chosen = preferred || anchors[0] || (row.closest && row.closest('a[href]'));
    return chosen && chosen.href ? String(chosen.href) : '';
  };
  const idFromHref = (href, keys, pattern) => {
    if (!href) return '';
    try {
      const url = new URL(href, location.href);
      for (const key of keys) {
        const value = normalize(url.searchParams.get(key));
        if (/^\d{5,}$/.test(value)) return value;
      }
      const match = String(url.pathname || '').match(pattern);
      return match ? match[1] : '';
    } catch (_error) {
      return '';
    }
  };
  const findProductId = (row, href, text) => firstNumber(attr(row, [
    'data-product-id', 'data-productid', 'data-goods-id', 'data-goodsid',
    'data-commodity-id', 'data-promotion-id', 'data-item-id', 'data-row-key'
  ])) || idFromHref(
    href,
    ['product_id', 'productId', 'goods_id', 'goodsId', 'commodity_id', 'promotion_id', 'item_id', 'itemId'],
    /(?:product|goods|commodity|promotion|item)\/(\d{5,})/i
  ) || firstNumber((text.match(/(?:商品|货品|推广)\s*ID\s*[:：]?\s*(\d{5,})/i) || [])[1]);
  const findVideoId = (row, href, text) => firstNumber(attr(row, [
    'data-video-id', 'data-videoid', 'data-aweme-id', 'data-awemeid',
    'data-content-id', 'data-photo-id'
  ])) || idFromHref(
    href,
    ['aweme_id', 'awemeId', 'video_id', 'videoId', 'content_id', 'contentId', 'photoId'],
    /(?:video|aweme|content|photo)\/(\d{5,})/i
  ) || firstNumber((text.match(/(?:视频|作品|内容)\s*ID\s*[:：]?\s*(\d{5,})/i) || [])[1]);
  const firstTitle = row => {
    const selectors = [
      '[data-testid*="product-name"]', '[data-testid*="goods-name"]',
      '[data-testid*="commodity-name"]', '[class*="productName"]',
      '[class*="product-name"]', '[class*="goodsName"]', '[class*="goods-name"]',
      '[class*="commodityName"]', '[class*="itemName"]', '[class*="item-name"]',
      '[class*="title"]', 'a[title]'
    ];
    for (const selector of selectors) {
      for (const element of Array.from(row.querySelectorAll(selector)).slice(0, 12)) {
        for (const candidate of [element.getAttribute('title'), element.getAttribute('aria-label'), element.textContent]) {
          if (validTitle(candidate)) return normalize(candidate);
        }
      }
    }
    for (const image of Array.from(row.querySelectorAll('img')).slice(0, 8)) {
      if (validTitle(image.alt)) return normalize(image.alt);
    }
    const lines = String(row.innerText || row.textContent || '').split(/[\r\n]+/);
    for (const line of lines) if (validTitle(line)) return normalize(line);
    return '';
  };
  const secondary = (row, selectors) => {
    for (const selector of selectors) {
      const element = row.querySelector(selector);
      const value = normalize(element && (element.getAttribute('title') || element.textContent));
      if (value && value.length <= 100) return value;
    }
    return '';
  };
  const findPrice = text => {
    const match = text.match(/(?:到手价|商品价格|售价|价格)\s*[:：]?\s*([¥￥]\s*)?([\d,.]+)(?:\s*[-~至]\s*([¥￥]\s*)?([\d,.]+))?/);
    if (!match) return '';
    return match[4] ? `¥${normalize(match[2])} - ¥${normalize(match[4])}` : `¥${normalize(match[2])}`;
  };
  const itemFromRow = row => {
    const rawText = String(row.innerText || row.textContent || '');
    const text = normalize(rawText);
    const title = firstTitle(row);
    if (!title || text.length < 8 || text.length > 1400) return null;
    const href = findLink(row);
    const productId = findProductId(row, href, text);
    const videoId = findVideoId(row, href, text);
    const productLink = /product|goods|commodity|promotion|item/i.test(href);
    const videoLink = /(?:\/video\/|\/aweme\/|\/photo\/|short-video)/i.test(href);
    const detailPage = /rank-product\/detail|compete[_-]product[_-]detail/i.test(location.pathname || '');
    const videoEvidence = Boolean(videoId || videoLink || row.querySelector('[data-video-id],[data-aweme-id],video')) ||
      /(?:播放量|视频时长|关联视频|视频达人)/.test(text);
    const kind = videoEvidence || (detailPage && !productId && !productLink) ? 'video' : 'product';
    const rawId = kind === 'video' ? (videoId || productId) : (productId || videoId);
    let pageUrl = href;
    if (!pageUrl && kind === 'video' && videoId)
      pageUrl = `https://www.douyin.com/video/${encodeURIComponent(videoId)}`;
    if (!pageUrl && kind === 'product' && productId && host.includes('compass.jinritemai.com'))
      pageUrl = `https://compass.jinritemai.com/shop/chance/rank-product/detail?product_id=${encodeURIComponent(productId)}`;
    const imageElement = Array.from(row.querySelectorAll('img')).find(image => visible(image) && Number(image.naturalWidth || image.width || 0) >= 24);
    const author = secondary(row, [
      '[class*="shopName"]', '[class*="shop-name"]', '[class*="authorName"]',
      '[class*="author-name"]', '[class*="nickName"]', '[class*="nickname"]',
      '[data-testid*="shop"]', '[data-testid*="author"]'
    ]);
    const commission = (text.match(/(?:佣金率?|佣金比例)\s*[:：]?\s*([\d.]+\s*%)/) || [])[1] || '';
    return {
      id: `row:${host}:${kind}:${rawId || title}`,
      rawId,
      kind,
      title,
      product: kind === 'product' ? title : '',
      author,
      href: pageUrl,
      image: imageElement && imageElement.src ? String(imageElement.src) : '',
      mediaUrl: '',
      price: kind === 'product' ? findPrice(text) : '',
      commission: normalize(commission),
      quality: rawId ? 'platform-id' : (pageUrl ? 'linked' : 'preview')
    };
  };
  const publish = (action, item) => {
    window.postMessage({
      channel: 'chuangbao:row-action:v1',
      direction: 'page-to-host',
      action,
      pageUrl: String(location.href || ''),
      item
    }, window.location.origin);
  };
  const button = (label, action, enabled, readItem) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.dataset.action = action;
    element.disabled = !enabled;
    element.setAttribute('aria-label', `创爆${label}`);
    element.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const item = readItem();
      if (item) publish(action, item);
    });
    return element;
  };
  const nativeActionLabels = ['查看详情', '加入追踪', '找货源'];
  const findNativeAction = (target, label) => {
    const interactive = Array.from(target.querySelectorAll('a,button,[role="button"],[tabindex]'))
      .find(element => !element.closest('[data-chuangbao-action-host]') && normalize(element.textContent) === label);
    if (interactive) return interactive;
    return Array.from(target.querySelectorAll('*')).find(element => {
      if (element.closest('[data-chuangbao-action-host]') || normalize(element.textContent) !== label) return false;
      return !Array.from(element.children).some(child => normalize(child.textContent) === label);
    }) || null;
  };
  const hideNativeActionLayout = (target, actions) => {
    for (const element of actions.values()) {
      element.setAttribute('data-chuangbao-native-row-action', '1');
      element.style.setProperty('display', 'none', 'important');
    }
    for (const child of Array.from(target.children)) {
      if (child.hasAttribute('data-chuangbao-action-host')) continue;
      const containsAction = Array.from(actions.values()).some(element => child === element || child.contains(element));
      if (!containsAction) continue;
      const unrelatedText = normalize(child.textContent)
        .replace(/查看详情|加入追踪|找货源/g, '')
        .trim();
      if (!unrelatedText) child.setAttribute('data-chuangbao-native-action-shell', '1');
    }
  };
  const attach = row => {
    if (!row) return;
    const initial = itemFromRow(row);
    if (!initial) return;
    const previousProductId = row.getAttribute('data-chuangbao-product-id') || '';
    if (initial.kind === 'product' && /^\d{6,32}$/.test(initial.rawId)) {
      row.setAttribute('data-chuangbao-product-id', initial.rawId);
      requestBadCommentRate(row, initial.rawId);
      if (previousProductId !== initial.rawId)
        window.dispatchEvent(new CustomEvent('chuangbao:product-row-ready', {
          detail: { productId: initial.rawId }
        }));
    } else {
      row.removeAttribute('data-chuangbao-product-id');
      row.querySelectorAll(`[${badCommentRateAttribute}]`).forEach(label => label.remove());
    }
    if (row.hasAttribute(marker)) {
      const existingHost = row.querySelector('[data-chuangbao-action-host]');
      if (existingHost && typeof existingHost.__chuangbaoSyncNativeActions === 'function')
        existingHost.__chuangbaoSyncNativeActions();
      const existingSlot = existingHost?.shadowRoot?.querySelector('[data-chuangbao-rank-slot]');
      if (existingSlot && row.__chuangbaoRankVideoMount && row.__chuangbaoRankVideoMount.parentNode !== existingSlot)
        existingSlot.appendChild(row.__chuangbaoRankVideoMount);
      return;
    }
    row.setAttribute(marker, '1');
    const target = row.querySelector('td:last-child,[role="cell"]:last-child,[class*="action"]') || row;
    const mount = document.createElement('span');
    mount.setAttribute('data-chuangbao-action-host', '1');
    mount.style.cssText = 'display:block;width:220px;max-width:100%;min-width:0;margin:0 auto;position:relative;z-index:3;';
    const shadow = mount.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host{all:initial;display:block;width:100%;font:normal 600 12px/24px 'Microsoft YaHei UI','Microsoft YaHei','Segoe UI',sans-serif;color:#1769ff}*{box-sizing:border-box}
      .stack{display:grid;align-items:center;align-content:center;gap:4px;width:220px;max-width:100%;min-width:0;font:normal 600 12px/24px 'Microsoft YaHei UI','Microsoft YaHei','Segoe UI',sans-serif;letter-spacing:0;color:#1769ff;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
      .quick-links,.tools{display:grid;grid-auto-rows:26px;align-items:stretch;justify-items:stretch;gap:4px;width:100%;height:26px;margin:0;padding:0}
      .quick-links{grid-template-columns:repeat(3,minmax(0,1fr))}.tools{grid-template-columns:repeat(2,minmax(0,1fr))}
      .quick-link,.tools button{display:flex!important;align-items:center!important;justify-content:center!important;width:100%!important;min-width:0!important;height:26px!important;margin:0!important;padding:0 2px!important;border:1px solid #9abff8!important;border-radius:5px!important;background:#fff!important;font:normal 600 12px/24px 'Microsoft YaHei UI','Microsoft YaHei','Segoe UI',sans-serif!important;letter-spacing:0!important;color:#1769ff!important;text-align:center!important;text-indent:0!important;vertical-align:middle!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;-webkit-appearance:none!important;appearance:none!important}
      .quick-link:disabled{color:#1769ff!important;border-color:#9abff8!important;background:#fff!important;opacity:.46}
      .tools:empty{display:none}
      button{border:1px solid #9abff8;border-radius:5px;color:#1769ff;background:#fff;cursor:pointer}
      button:hover:not(:disabled){color:#1769ff;border-color:#1769ff;background:#eaf2ff}
      button:disabled{color:#1769ff;border-color:#9abff8;background:#fff;opacity:.46;cursor:not-allowed}
      .rank-slot{display:block;width:100%}
    `;
    const stack = document.createElement('span');
    stack.className = 'stack';
    const quickLinks = document.createElement('span');
    quickLinks.className = 'quick-links';
    const nativeActions = new Map();
    const proxyButtons = new Map();
    for (const label of nativeActionLabels) {
      const proxy = document.createElement('button');
      proxy.type = 'button';
      proxy.className = 'quick-link';
      proxy.textContent = label;
      proxy.setAttribute('aria-label', label);
      proxy.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const original = nativeActions.get(label) || findNativeAction(target, label);
        if (!original) return;
        if (typeof original.click === 'function') original.click();
        else original.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      });
      proxyButtons.set(label, proxy);
      quickLinks.appendChild(proxy);
    }
    const tools = document.createElement('span');
    tools.className = 'tools';
    const rankSlot = document.createElement('span');
    rankSlot.className = 'rank-slot';
    rankSlot.setAttribute('data-chuangbao-rank-slot', '1');
    const readItem = () => itemFromRow(row);
    if (initial.kind === 'product') {
      if (host === 'compass.jinritemai.com' || host.endsWith('.compass.jinritemai.com')) {
        tools.append(button('映射数据', 'map', /^\d{6,32}$/.test(initial.rawId), readItem));
      }
      tools.append(
        button('添加自选', 'select', Boolean(initial.rawId || initial.href), readItem)
      );
    }
    const syncNativeActions = () => {
      nativeActions.clear();
      for (const label of nativeActionLabels) {
        const original = findNativeAction(target, label);
        if (original) nativeActions.set(label, original);
        const proxy = proxyButtons.get(label);
        if (proxy) proxy.disabled = !original;
      }
      hideNativeActionLayout(target, nativeActions);
    };
    mount.__chuangbaoSyncNativeActions = syncNativeActions;
    stack.append(quickLinks, tools, rankSlot);
    shadow.append(style, stack);
    mount.__chuangbaoRankSlot = rankSlot;
    const pendingRankMount = row.__chuangbaoRankVideoMount;
    if (pendingRankMount) rankSlot.appendChild(pendingRankMount);
    if (target !== row) {
      target.setAttribute('data-chuangbao-action-cell', '1');
      target.style.width = '228px';
      target.style.maxWidth = '228px';
      target.style.verticalAlign = 'middle';
      target.style.boxSizing = 'border-box';
      target.style.paddingLeft = '4px';
      target.style.paddingRight = '4px';
      target.style.overflow = 'hidden';
    }
    target.appendChild(mount);
    syncNativeActions();
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
    const seen = new Set();
    for (const candidate of Array.from(document.querySelectorAll(candidateSelector)).slice(0, 500)) {
      const row = candidate.closest('tbody tr,[role="row"][aria-rowindex]') || candidate;
      if (seen.has(row) || !visible(row) || row.querySelector('th,[role="columnheader"]')) continue;
      seen.add(row);
      attach(row);
    }
  };
  const scheduleScan = () => {
    if (scanPending) return;
    scanPending = true;
    window.setTimeout(scan, 180);
  };
  const install = () => {
    scheduleScan();
    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setInterval(scheduleScan, 1400);
  };
  if (document.documentElement) install();
  else document.addEventListener('readystatechange', install, { once: true });
})();
