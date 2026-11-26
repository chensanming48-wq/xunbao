(async () => {
  'use strict';
  const request = __CHUANGBAO_ALLIANCE_REQUEST__;
  const warning = '需要登录精选联盟达人账号才能查询。请勿频繁点击，以免触发账号风控或封控。';
  const fail = (status, message, securityReason) => Object.assign(new Error(message), { status, securityReason });
  if (location.origin !== 'https://buyin.jinritemai.com' || window.top !== window)
    return JSON.stringify({ status: 'login-required', message: warning });
  let environment = null;
  const activeReads = new Set();
  let terminalFailure = null;
  async function prepareEnvironment() {
    // Use the official SDK already loaded by this page. Never borrow a device ID.
    let sdk;
    for (const key of Object.keys(window).filter(key => key.startsWith('webpackChunk'))) {
      const chunks = window[key];
      if (!Array.isArray(chunks) || typeof chunks.push !== 'function') continue;
      let runtime;
      chunks.push([['chuangbao-alliance-environment-' + Date.now()], {}, value => { runtime = value; }]);
      if (!runtime?.m) continue;
      for (const [id, factory] of Object.entries(runtime.m)) {
        if (typeof factory !== 'function') continue;
        const source = Function.prototype.toString.call(factory);
        if (!source.includes('getNonFxgEcomDid') || !source.includes('reportNonFxgEcomDid')) continue;
        const candidate = runtime(id);
        if (typeof candidate?.getNonFxgEcomDid === 'function' && typeof candidate?.reportNonFxgEcomDid === 'function') {
          sdk = candidate; break;
        }
      }
      if (sdk) break;
    }
    const componentMissing = () => fail('security-required', '未检测到抖音安全组件。请先安装官方组件，安装完成后点击“已安装，重新检测”。本次尚未读取商品数据。', 'component-missing');
    if (!sdk) {
      if (request.securityComponent === 'missing') throw componentMissing();
      throw fail('security-required', '精选联盟安全环境尚未加载完成，请重新检测；仍失败时请检查网络或在官方页面完成安全验证。', 'sdk-unavailable');
    }
    const validDevice = value => {
      const seraph = typeof value?.seraph_did === 'string' ? value.seraph_did.trim() : '';
      const ewid = typeof value?.ewid === 'string' ? value.ewid.trim() : '';
      return seraph && ewid && seraph.length <= 256 && ewid.length <= 256
        ? { seraph_did: seraph, ewid } : null;
    };
    const currentDevice = () => { try { return validDevice(sdk.getNonFxgEcomDid()); } catch (_) { return null; } };
    // The official getter reads this browser's environment. Reporting again
    // repeats token, native-component and fingerprint work, even when ready.
    environment = currentDevice();
    if (environment) return;
    // Native registration is only a hint. A ready official environment above
    // remains usable; unknown registry access must not be called "missing".
    if (request.securityComponent === 'missing') throw componentMissing();
    let timer;
    try {
      const key = '__CHUANGBAO_ALLIANCE_ENVIRONMENT_INIT_V1__';
      let pending = window[key];
      if (!pending || pending.sdk !== sdk || pending.accountKey !== request.accountKey || pending.settled) {
        pending = { sdk, accountKey: request.accountKey, settled: false };
        pending.promise = Promise.resolve().then(() => sdk.reportNonFxgEcomDid({ appName: 'buyin' }))
          .then(value => { pending.settled = true; return value; }, error => { pending.settled = true; throw error; });
        window[key] = pending;
      }
      // Repeated clicks after a timeout share the unfinished initialization.
      // They must not launch overlapping native-component work.
      const initialized = await Promise.race([
        pending.promise,
        new Promise((resolve, reject) => { timer = setTimeout(() => {
          const ready = currentDevice();
          if (ready) resolve(ready);
          else reject(fail('security-required', '抖音安全环境准备超时。请确认官方安全组件已安装并完成启动，再点击“已安装，重新检测”；仍失败时请检查网络或在官方页面完成安全验证。本次尚未读取商品数据。', 'initialization-timeout'));
        }, 12000); })
      ]);
      environment = validDevice(initialized) || currentDevice();
      if (!environment && initialized?.needInstallSeraph === true) throw componentMissing();
      if (!environment)
        throw fail('security-required', '抖音安全组件尚未就绪。请完成官方组件安装，再点击“已安装，重新检测”。本次尚未读取商品数据。', 'environment-unready');
    } catch (error) {
      if (error.status) throw error;
      throw fail('security-required', '抖音安全组件初始化失败。请检查官方组件和网络后重新检测，本次尚未读取商品数据。', 'initialization-failed');
    } finally { clearTimeout(timer); }
  }
  async function read(path, body, stage = '数据查询') {
    const controller = new AbortController();
    if (terminalFailure) throw terminalFailure;
    activeReads.add(controller);
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      let url = 'https://buyin.jinritemai.com' + path;
      if (body && ['/pc/selection/decision/pack_detail', '/pc/selection/common/material_list'].includes(path)) {
        if (!environment) throw fail('security-required', '精选联盟安全环境尚未就绪，已停止查询。');
        url += '?' + new URLSearchParams(environment);
        body = { ...body, extra: { ...body.extra, seraph_did: environment.seraph_did } };
      }
      const response = await fetch(url, {
        method: body ? 'POST' : 'GET', credentials: 'include', cache: 'no-store',
        headers: body ? { Accept: 'application/json', 'Content-Type': 'application/json' } : {},
        ...(body ? { body: JSON.stringify(body) } : {}), signal: controller.signal
      });
      // Security interception can deliberately return HTTP 200 with an empty body.
      const securityCode = response.headers?.get('x-ecom-sec-code');
      if (securityCode && securityCode !== '0') {
        const code = /^\d{1,8}$/.test(securityCode) ? '（安全码 ' + securityCode + '）' : '';
        throw fail('limited', '精选联盟安全环境校验未通过' + code + '，已暂停查询。请在官方页面检查抖音安全组件后再试。');
      }
      if (response.status === 429 || response.status === 403)
        throw fail('limited', '平台限制了本次查询，已暂停请求，请稍后再试。');
      if (response.status === 401) throw fail('login-required', warning);
      if (response.redirected && response.url) {
        const redirected = new URL(response.url);
        if (redirected.origin === 'https://buyin.jinritemai.com' && /^\/mpa\/account\/login(?:\/|$)/.test(redirected.pathname))
          throw fail('login-required', warning);
      }
      if (!response.ok) throw fail('error', `精选联盟${stage}失败（HTTP ${response.status}），请稍后重试。`);
      // Validate the body before parsing: a successful HTTP status can still have
      // an empty/truncated body or a login HTML page. Never treat it as zero sales.
      const text = (await response.text()).replace(/^\uFEFF/, '').trim();
      if (!text) throw fail('error', `精选联盟${stage}返回了空内容（HTTP ${response.status}），本次查询未完成，请稍后再试。`);
      let json;
      try { json = JSON.parse(text); }
      catch (_) { throw fail('error', `精选联盟${stage}返回的数据不完整或格式异常，本次查询未完成，请稍后再试。`); }
      if (!json || typeof json !== 'object' || Array.isArray(json))
        throw fail('error', `精选联盟${stage}返回的数据结构异常，本次查询未完成。`);
      const message = String(json.message || json.msg || '').slice(0, 160);
      // This platform denial does not contain the usual risk-control keywords.
      // Route it through the same batch cancellation and native cooldown path.
      if ((!Object.prototype.hasOwnProperty.call(json, 'code') || Number(json.code) !== 0) &&
          /环境\s*存在\s*风险/.test(message))
        throw fail('limited', '精选联盟提示当前环境存在风险，已暂停查询。请在官方页面完成安全验证，并检查抖音安全组件，验证通过后再试。');
      if (/频繁|风控|验证码|验证后|访问受限|访问限制|too many|captcha/i.test(message))
        throw fail('limited', '精选联盟提示访问受限或需要验证，已暂停请求。');
      if (!Object.prototype.hasOwnProperty.call(json, 'code') || Number(json.code) !== 0) {
        if (/登录|login|未授权/i.test(message)) throw fail('login-required', warning);
        throw fail('error', message || '精选联盟未返回有效数据，请检查账号权限。');
      }
      if (!json.data || typeof json.data !== 'object') throw fail('error', '精选联盟响应缺少数据。');
      if (body && json.data.product_id != null && String(json.data.product_id) !== String(request.productId))
        throw fail('error', '精选联盟返回了其他商品的数据，已丢弃本次结果。');
      return json.data;
    } catch (error) {
      if (['limited', 'login-required', 'account-changed'].includes(error.status)) {
        terminalFailure = error;
        for (const active of activeReads) if (active !== controller) active.abort();
      }
      if (terminalFailure) throw terminalFailure;
      if (error.status || error.name === 'AbortError') throw error;
      throw fail('error', `精选联盟${stage}连接中断或响应读取失败，本次查询未完成，请稍后再试。`);
    } finally { clearTimeout(timer); activeReads.delete(controller); }
  }
  async function identity() {
    const data = await read('/index/getUser', null, '账号校验');
    if (String(data.user_role) !== '1' || !/^\d{1,40}$/.test(String(data.buyin_account_id || '')) ||
        !/^\d{1,40}$/.test(String(data.user_id || ''))) throw fail('login-required', warning);
    return String(data.buyin_account_id) + ':' + String(data.user_id);
  }
  function dates(begin, end) {
    const normalize = value => /^\d{4}\/\d{2}\/\d{2} 00:00:00$/.test(value || '') ? value.slice(0, 10).replaceAll('/', '-') : value;
    begin = normalize(begin); end = normalize(end);
    const parse = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') &&
      Number.isFinite(Date.parse(value + 'T00:00:00Z')) &&
      new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
    if (!parse(begin) || !parse(end) || begin > end) throw fail('error', '请选择明确的统计日期。');
    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    if (end >= today) throw fail('error', '精选联盟日数据仅支持昨天及以前的完整自然日，请调整统计周期。');
    const earliest = new Date(Date.parse(today + 'T00:00:00Z') - 90 * 86400000).toISOString().slice(0, 10);
    if (begin < earliest) throw fail('error', '精选联盟补充仅支持最近90天内的日期。');
    const result = [];
    for (let time = Date.parse(begin + 'T00:00:00Z'); time <= Date.parse(end + 'T00:00:00Z'); time += 86400000)
      result.push(new Date(time).toISOString().slice(0, 10));
    return result;
  }
  const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value :
    typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value)) ? Number(value) : null;
  function daily(rows) {
    const map = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const raw = String(row?.calculate_time || '');
      const date = /^\d{8}$/.test(raw) ? raw.slice(0, 4) + '-' + raw.slice(4, 6) + '-' + raw.slice(6) : raw;
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        if (map.has(date)) throw fail('error', '精选联盟日数据重复，已停止合计。');
        map.set(date, row);
      }
    }
    return map;
  }
  try {
    if (request.command === 'identity') return JSON.stringify({ status: 'ok', accountKey: await identity() });
    if (request.command !== 'query' || !/^\d{6,32}$/.test(request.productId || '')) throw fail('error', '商品编号无效。');
    const selected = dates(request.beginDate, request.endDate);
    const accountKey = await identity();
    if (accountKey !== request.accountKey) throw fail('account-changed', '精选联盟账号已变化，请重新点击映射数据。');
    await prepareEnvironment();
    const pack = params => read('/pc/selection/decision/pack_detail', {
      scene_info: { request_page: 2 }, biz_id: request.productId, biz_id_type: 2,
      enter_from: 'pc.selection_square.recommend_main', data_module: 'dynamic',
      dynamic_params: params, extra: {}
    }, params.param_type === 15 ? '购买人群查询' : '成交数据查询');
    // One bounded batch per user query. A risk/login response aborts the other
    // in-flight reads and is never retried or bypassed using another endpoint.
    const replies = await Promise.allSettled([
      pack({ param_type: 9, promotion_data_params: { time_range: '90' }, content_data_params: { time_range: '90' } }),
      pack({ param_type: 15, audience_analysis_params: { time_range: '30' } }),
      read('/pc/selection/common/material_list', {
        scene: 'PCSquareSearch', size: 30, search_text: request.productId, cursor: 0,
        extra: { new_session_strategy: '1', search_id: '', session_id: '', use_kol_product: '1' }, filters: {}
      }, '佣金查询')
    ]);
    if (terminalFailure) throw terminalFailure;
    if (replies[0].status === 'rejected') throw replies[0].reason;
    const trend = replies[0].value;
    const moduleRows = value => value && (value.code == null || Number(value.code) === 0) ? daily(value.calculate_data_list) : new Map();
    const content = moduleRows(trend.model?.content_data);
    const promotion = moduleRows(trend.model?.promotion_data);
    // A complete zero-filled history can be a platform placeholder, even when
    // recommendations, commission or a 30-day aggregate are available.
    // Those independent fields cannot establish exact daily zero turnover.
    const placeholder = (map, fields) => map.size >= 30 && [...map.values()].every(row =>
      fields.every(field => number(row[field]) === 0));
    const contentUnavailable = placeholder(content, ['live_sales', 'video_sales', 'image_text_sales', 'bind_shop_sales',
      'live_sales_amount', 'video_sales_amount', 'video_pv', 'live_sales_content_num', 'video_sales_content_num']);
    const promotionUnavailable = placeholder(promotion, ['sales', 'sales_amount', 'pv', 'sales_content_num']);
    const sum = (map, field) => {
      if (map === content && contentUnavailable || map === promotion && promotionUnavailable) return null;
      let total = 0;
      for (const date of selected) {
        const value = number(map.get(date)?.[field]);
        if (value === null) return null;
        total += value;
      }
      return Number.isSafeInteger(Math.round(total)) ? total : null;
    };
    const amount = field => { const value = sum(content, field); return value === null ? null : value / 100; };
    const counts = ['live_sales', 'video_sales', 'image_text_sales', 'bind_shop_sales'].map(field => sum(content, field));
    const totalSales = sum(promotion, 'sales');
    const totalKnown = totalSales !== null && counts.every(value => value !== null);
    const difference = totalKnown ? totalSales - counts.reduce((a, b) => a + b, 0) : null;
    const money = value => value === null ? null : '¥' + value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const count = value => value === null ? null : value.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
    const metric = (label, value) => ({ label, value });
    const section = (key, title, values, period = selected[0] + ' – ' + selected[selected.length - 1]) => ({
      key, title, values: values.filter(value => value.value !== null && value.value !== ''),
      source: 'alliance', sourceLabel: '精选联盟 · ' + period, cached: false, limited: false,
      ok: values.some(value => value.value !== null && value.value !== ''), updatedAt: Date.now()
    });
    const videoAmount = amount('video_sales_amount'), liveAmount = amount('live_sales_amount');
    const sections = [
      section('video', '短视频表现', [metric('成交额', money(videoAmount)), metric('成交数量', count(counts[1])),
        metric('平均成交单价', videoAmount !== null && counts[1] > 0 ? money(videoAmount / counts[1]) : null),
        metric('视频浏览次数（PV）', count(sum(content, 'video_pv'))), metric('带货视频（日累计）', count(sum(content, 'video_sales_content_num')))]),
      section('overview', '渠道成交数量', [metric('总成交数量', count(totalSales)), ...counts.map((value, i) => metric(['直播', '短视频', '图文', '橱窗'][i], count(value)))]),
      section('live', '直播表现', [metric('成交额', money(liveAmount)), metric('成交数量', count(counts[0])),
        metric('平均成交单价', liveAmount !== null && counts[0] > 0 ? money(liveAmount / counts[0]) : null),
        metric('带货场次（日累计）', count(sum(content, 'live_sales_content_num')))]),
      section('product-card', '其他渠道（差额）', [metric('其他渠道成交数量', count(difference !== null && difference >= 0 ? difference : null))])
    ];
    let audienceError = '';
    let audiences = [];
    try {
      if (replies[1].status === 'rejected') throw replies[1].reason;
      const data = replies[1].value;
      const groups = data.model?.audience_analysis_data?.audience_analysis;
      if (Array.isArray(groups)) audiences = ['主要性别', '主要年龄', '主要地区', '主要人群'].map((label, i) =>
        metric(label, typeof groups[i]?.items?.[0]?.label_name === 'string' ? groups[i].items[0].label_name.slice(0, 100) : null));
    } catch (error) {
      if (['limited', 'login-required'].includes(error.status)) throw error;
      audienceError = '购买人群未返回。';
    }
    sections.push(section('basic', '购买人群（近30天）', audiences, '近30天，与所选成交周期独立'));
    // Current commission is independent of the selected historical sales period.
    let commissionError = '';
    try {
      if (replies[2].status === 'rejected') throw replies[2].reason;
      const data = replies[2].value;
      // Official selection cards identify the product and promotion separately.
      // A product ID passed as a promotion ID can return an empty product_cos.
      // Search may include recommendations: accept only one exact product match.
      const matches = Array.isArray(data.summary_promotions) ? data.summary_promotions.filter(item =>
        typeof item?.product_id === 'string' && item.product_id === request.productId) : [];
      const product = matches.length === 1 ? matches[0] : null;
      // This API's origin is already in percentage units: 0.5 means 0.5%.
      const percent = number(product?.base_model?.promotion_info?.cos_info?.cos?.cos_ratio?.origin);
      if (percent !== null && percent >= 0 && percent <= 100) {
        sections[1].values.push(metric('当前佣金比例', Number(percent.toFixed(4)) + '%'));
        sections[1].ok = true;
      } else commissionError = '当前佣金未返回，暂无法估算保本 ROI。';
    } catch (error) {
      if (['limited', 'login-required'].includes(error.status)) throw error;
      commissionError = '当前佣金未返回，暂无法估算保本 ROI。';
    }
    if (await identity() !== accountKey) throw fail('account-changed', '精选联盟账号已变化，已丢弃本次结果。');
    const salesUnavailable = videoAmount === null || liveAmount === null || totalSales === null || counts.some(value => value === null);
    const unavailableDetails = false; // Independent valid fields remain visible.
    const usable = sections.filter(value => value.ok).length;
    return JSON.stringify({ status: usable ? 'ok' : 'empty', productId: request.productId,
      beginDate: request.beginDate, endDate: request.endDate, accountKey, sections, updatedAt: Date.now(),
      unavailableDetails, salesUnavailable,
      dataCoverage: { selectedDays: selected.length, contentDays: selected.filter(date => content.has(date)).length,
        promotionDays: selected.filter(date => promotion.has(date)).length, contentPlaceholder: contentUnavailable, promotionPlaceholder: promotionUnavailable },
      message: (salesUnavailable ? '所选周期部分成交明细未返回；缺失明细或全零占位未计为真实成交数据。' : '') +
        audienceError + commissionError + (usable ? '日累计视频或场次可能跨日重复；其他渠道为差额，不代表商品卡专属统计。' : '所选周期没有完整可用数据，未填入推测值。') });
  } catch (error) {
    return JSON.stringify({ status: error.status || 'error', ...(error.securityReason ? { securityReason: error.securityReason } : {}), message: error.name === 'AbortError' ? '查询超时，已停止请求，请稍后重试。' : error.message || '查询失败。' });
  }
})()
