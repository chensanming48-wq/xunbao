(() => {
  'use strict';

  const factoryName = '__CHUANGBAO_CREATE_PRODUCT_INSIGHT_FILTERS_V1__';
  if (typeof window[factoryName] === 'function') return 'already-installed';

  // The protected template uses video_url for copying, which can be a CDN playback
  // address. Its preview already identifies the row's work. Keep this correction in
  // the existing extension and use the rendered rows so sorting and paging agree.
  const installWorkLinkCopy = (shadow, mount) => {
    const actionButtons = Array.from(shadow.querySelectorAll('.actions button'));
    const copyPage = actionButtons.find(button => button.textContent === '复制本页链接');
    const copySelected = actionButtons.find(button => /^复制已选[（(]/.test(button.textContent));
    const subtitle = shadow.querySelector('.sub');
    const idleSubtitle = subtitle && subtitle.textContent;
    let noticeTimer = 0;
    let copying = false;
    let disposed = false;
    const workLink = value => {
      try {
        const url = new URL(value);
        if (!/^https?:$/.test(url.protocol)) return '';
        const host = url.hostname.toLowerCase();
        if (host === 'v.douyin.com' && /^\/[a-z0-9_-]+\/?$/i.test(url.pathname))
          return `https://v.douyin.com${url.pathname}`;
        if (!['douyin.com', 'www.douyin.com', 'iesdouyin.com', 'www.iesdouyin.com'].includes(host)) return '';
        const match = url.pathname.match(/^\/(?:share\/)?(video|note)\/(\d{6,32})\/?$/);
        if (match) return `https://www.douyin.com/${match[1]}/${match[2]}`;
        const modalId = url.searchParams.get('modal_id');
        return /^\d{6,32}$/.test(modalId || '') ? `https://www.douyin.com/video/${modalId}` : '';
      } catch (_error) { return ''; }
    };
    const notifyCopy = message => {
      if (disposed || !mount.isConnected || !subtitle) return;
      window.clearTimeout(noticeTimer);
      subtitle.textContent = message;
      noticeTimer = window.setTimeout(() => {
        if (!disposed && mount.isConnected && subtitle.textContent === message) subtitle.textContent = idleSubtitle;
      }, 2200);
    };
    const writeCopy = async text => {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try { await navigator.clipboard.writeText(text); return; } catch (_error) {}
      }
      if (disposed || !mount.isConnected) throw new Error('复制已取消');
      const focusBefore = shadow.activeElement || document.activeElement;
      const area = document.createElement('textarea');
      area.value = text;
      area.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
      document.body.append(area);
      try {
        area.select();
        if (!document.execCommand('copy')) throw new Error('复制失败');
      } finally {
        area.remove();
        if (focusBefore && focusBefore.isConnected) focusBefore.focus({ preventScroll: true });
      }
    };
    const copyHandler = async event => {
      const button = event.target && event.target.closest && event.target.closest('button');
      if (!button || (button !== copyPage && button !== copySelected && !button.matches('.copy-one'))) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (disposed || copying || button.disabled || !mount.isConnected) return;
      const visibleRows = Array.from(shadow.querySelectorAll('.table .row'));
      const chosenRows = button === copyPage ? visibleRows : button === copySelected
        ? visibleRows.filter(row => row.querySelector('input[data-select-index]:checked'))
        : visibleRows.filter(row => row.contains(button));
      if (!chosenRows.length) return;
      const links = [];
      for (const row of chosenRows) {
        const link = workLink(row.querySelector('a[href]')?.href);
        if (!link) {
          notifyCopy(`第 ${visibleRows.indexOf(row) + 1} 行缺少可用的抖音作品链接，请刷新后重试`);
          return;
        }
        links.push(link);
      }
      copying = true;
      try {
        await writeCopy(links.join('\n'));
        notifyCopy(button === copyPage ? `已复制本页 ${links.length} 条视频链接`
          : button === copySelected ? `已复制所选 ${links.length} 条视频链接` : '视频链接已复制');
      } catch (_error) { notifyCopy('视频链接复制失败，请重试'); }
      finally { copying = false; }
    };
    shadow.addEventListener('click', copyHandler, true);
    return () => {
      disposed = true;
      window.clearTimeout(noticeTimer);
      shadow.removeEventListener('click', copyHandler, true);
    };
  };

  const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const metricValue = node => {
    const lower = finite(node && node.extra_value && node.extra_value.lower && node.extra_value.lower.value);
    const direct = finite(node && node.value && node.value.value);
    const upper = finite(node && node.extra_value && node.extra_value.upper && node.extra_value.upper.value);
    return lower !== null ? lower : direct !== null ? direct : upper;
  };
  const pageData = (payload, expectedPage) => {
    const values = Array.isArray(payload && payload.data)
      ? payload.data
      : payload && payload.data && Array.isArray(payload.data.data) ? payload.data.data : null;
    if (!values) throw new Error('平台未返回视频列表，请在官方详情页确认是否有数据。');
    const pageResult = payload.page_result || payload.data && payload.data.page_result || {};
    for (const key of ['page_no', 'page']) {
      if (Object.prototype.hasOwnProperty.call(pageResult, key) &&
          (!/^[0-9]+$/.test(String(pageResult[key])) || Number(pageResult[key]) !== expectedPage))
        throw new Error('平台返回的页码与本次查询不一致，请刷新本页重试。');
    }
    const rawPageSize = Number(pageResult.page_size);
    const rawTotal = Number(pageResult.total);
    return {
      values,
      pageSize: Number.isSafeInteger(rawPageSize) && rawPageSize > 0 ? rawPageSize : 10,
      total: Number.isSafeInteger(rawTotal) && rawTotal >= 0 ? rawTotal : null
    };
  };
  const option = (value, label) => ({ value, label });
  const definitions = [
    {
      key: 'pay', label: '支付金额', width: 144,
      options: [option(0, '不限'), option(1000, '¥1,000及以上'), option(5000, '¥5,000及以上'), option(20000, '¥2万及以上'), option(100000, '¥10万及以上')]
    },
    {
      key: 'buyers', label: '成交人数', width: 128,
      options: [option(0, '不限'), option(250, '250人及以上'), option(1000, '1,000人及以上'), option(5000, '5,000人及以上')]
    },
    {
      key: 'clickRate', label: '点击率', width: 104,
      options: [option(0, '不限'), option(0.01, '1%及以上'), option(0.025, '2.5%及以上'), option(0.05, '5%及以上'), option(0.1, '10%及以上')]
    },
    {
      key: 'sort', label: '排序', width: 158,
      options: [option('pay', '支付金额'), option('buyers', '成交人数'), option('clickRate', '点击率'), option('orders', '成交订单数'), option('published', '发布时间')]
    }
  ];

  Object.defineProperty(window, factoryName, {
    configurable: true,
    value: context => {
      const { shadow, mount, filters, rangeLabel, reload, requestPage, normalizeValue } = context || {};
      if (!shadow || !mount || !filters || !rangeLabel || typeof reload !== 'function' ||
          typeof requestPage !== 'function' || typeof normalizeValue !== 'function') return null;

      // Brand this extension during OEM builds; keep the protected template intact.
      const heading = shadow.querySelector('header h2');
      const dialog = shadow.querySelector('[role="dialog"]');
      if (heading) heading.textContent = '创爆增强显示 · 带货短视频';
      if (dialog) dialog.setAttribute('aria-label', '创爆商品透视');

      const state = { query: '', pay: 0, buyers: 0, clickRate: 0, sort: 'pay' };
      const caches = new Map();
      const controls = new Map();
      let openKey = '';
      let searchTimer = 0;
      let disposed = false;
      const removeWorkLinkCopy = installWorkLinkCopy(shadow, mount);

      const style = document.createElement('style');
      style.textContent = `
        .actions button,.filters,.filters button,.filters input,.insight-filter-menu,.cell:last-child a,.cell:last-child button,footer,.pager button{font-family:"Microsoft YaHei UI","Microsoft YaHei",sans-serif;font-size:11.5px}
        .actions{flex-wrap:nowrap}.actions button,.filters button,.cell:last-child button,.pager button{display:inline-flex;align-items:center;justify-content:center;line-height:1}.cell:last-child{gap:6px;flex-wrap:nowrap;padding-left:8px;padding-right:8px}.cell:last-child a{display:inline-flex;align-items:center;line-height:1}
        .actions button,.filters,.filters button,.filters input,.insight-filter-menu{font-size:14px}.actions button,.filters button{height:36px;white-space:nowrap}
        .filters{position:relative;overflow:visible;flex-wrap:wrap;min-height:56px;gap:8px}
        .insight-search{width:176px;height:36px;padding:0 11px;border:1px solid #d8e3f2;border-radius:9px;background:#fff;color:#25324a;font:14px/1 "Microsoft YaHei UI","Microsoft YaHei",sans-serif;outline:none}
        .insight-search::placeholder{color:#9aa8bb}.insight-search:hover{border-color:#a9caf8}.insight-search:focus{border-color:#1769ff;box-shadow:0 0 0 3px rgba(23,105,255,.10)}
        .insight-filter-select{position:relative;flex:0 0 auto}.insight-filter-trigger{position:relative;display:flex;align-items:center;width:var(--filter-width);height:36px;padding:0 30px 0 11px;overflow:hidden;border-color:#d8e3f2;background:#fff;color:#34445f;text-align:left;white-space:nowrap}
        .insight-filter-label{display:block;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .insight-filter-trigger:hover:not(:disabled){border-color:#1769ff;background:#f7faff;color:#1769ff}.insight-filter-select.open .insight-filter-trigger{border-color:#1769ff;background:#fff;color:#1769ff;box-shadow:0 0 0 3px rgba(23,105,255,.10)}
        .insight-filter-chevron{position:absolute;top:50%;right:11px;display:block;width:12px;height:12px;object-fit:contain;pointer-events:none;transform:translateY(-50%);transform-origin:50% 50%;transition:transform .16s ease}.insight-filter-select.open .insight-filter-chevron{transform:translateY(-50%) rotate(180deg)}
        .insight-filter-menu{position:absolute;z-index:20;top:40px;left:0;display:none;width:max(100%,178px);max-height:250px;overflow:auto;padding:6px;border:1px solid #d8e3f2;border-radius:10px;background:#fff;box-shadow:0 14px 34px rgba(35,55,88,.18)}
        .insight-filter-select.open .insight-filter-menu{display:block}.insight-filter-option{display:flex;align-items:center;justify-content:space-between;width:100%;height:38px;padding:0 10px;border:0;border-radius:7px;background:#fff;color:#34445f;font-size:14px;text-align:left;white-space:nowrap;cursor:pointer}.insight-filter-option:hover{background:#f3f7ff;color:#1769ff}.insight-filter-option.selected{background:#edf4ff;color:#1769ff;font-weight:700}.insight-filter-check{width:14px;height:14px;margin:0;accent-color:#1769ff;pointer-events:none}
        .insight-filter-reset{height:34px;padding:0 8px;border-color:transparent;background:transparent;color:#1769ff}.insight-filter-reset:hover:not(:disabled){background:#edf4ff;color:#1769ff}.insight-filter-reset:disabled{border-color:transparent;background:transparent;color:#a4afbf}
        .insight-filter-status{color:#60708a;white-space:nowrap}.range-label{margin-left:auto;white-space:nowrap}
        @media(max-width:1080px){.filters{flex-wrap:wrap}.range-label{margin-left:0}.insight-search{width:150px}}
      `;
      shadow.append(style);

      const search = document.createElement('input');
      search.type = 'search';
      search.className = 'insight-search';
      search.placeholder = '搜索视频或达人';
      search.setAttribute('aria-label', '搜索视频或达人');

      const status = document.createElement('span');
      status.className = 'insight-filter-status';
      status.setAttribute('aria-live', 'polite');

      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'insight-filter-reset';
      reset.textContent = '重置';

      const closeMenus = () => {
        openKey = '';
        controls.forEach(control => {
          control.root.classList.remove('open');
          control.trigger.setAttribute('aria-expanded', 'false');
        });
      };
      const selectedDefinitionOption = definition =>
        definition.options.find(entry => entry.value === state[definition.key]) || definition.options[0];
      const triggerText = definition => {
        const selected = selectedDefinitionOption(definition);
        if (definition.key === 'sort') return `排序：${selected.label}`;
        return selected.value === 0 ? definition.label : selected.label;
      };
      const active = () => !!state.query || state.pay > 0 || state.buyers > 0 || state.clickRate > 0 || state.sort !== 'pay';
      const syncReset = () => { reset.disabled = !active(); };

      const selectNodes = definitions.map(definition => {
        const root = document.createElement('div');
        root.className = 'insight-filter-select';
        root.style.setProperty('--filter-width', `${definition.width}px`);
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'insight-filter-trigger';
        trigger.setAttribute('aria-label', definition.label);
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        const text = document.createElement('span');
        text.className = 'insight-filter-label';
        const chevron = document.createElement('img');
        chevron.className = 'insight-filter-chevron';
        chevron.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0Ij48cGF0aCBmaWxsPSIjNTU2NTdmIiBkPSJNNSA4aDE0bC03IDh6Ii8+PC9zdmc+';
        chevron.alt = '';
        chevron.draggable = false;
        chevron.setAttribute('aria-hidden', 'true');
        trigger.append(text, chevron);
        const menu = document.createElement('div');
        menu.className = 'insight-filter-menu';
        menu.setAttribute('role', 'listbox');
        menu.setAttribute('aria-label', `${definition.label}筛选`);
        const optionButtons = definition.options.map(entry => {
          const button = document.createElement('label');
          button.className = 'insight-filter-option';
          button.setAttribute('role', 'option');
          const label = document.createElement('span');
          label.textContent = entry.label;
          const check = document.createElement('input');
          check.type = 'checkbox';
          check.className = 'insight-filter-check';
          button.append(label, check);
          check.addEventListener('change', event => {
            event.stopPropagation();
            const changed = state[definition.key] !== entry.value;
            state[definition.key] = entry.value;
            updateControls();
            closeMenus();
            if (changed) reload();
          });
          menu.append(button);
          return { button, check, entry };
        });
        trigger.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          const opening = openKey !== definition.key;
          closeMenus();
          if (opening) {
            openKey = definition.key;
            root.classList.add('open');
            trigger.setAttribute('aria-expanded', 'true');
          }
        });
        root.append(trigger, menu);
        controls.set(definition.key, { root, trigger, text, optionButtons });
        return root;
      });

      const updateControls = () => {
        definitions.forEach(definition => {
          const control = controls.get(definition.key);
          control.text.textContent = triggerText(definition);
          control.optionButtons.forEach(({ button, check, entry }) => {
            const selected = state[definition.key] === entry.value;
            button.classList.toggle('selected', selected);
            button.setAttribute('aria-selected', selected ? 'true' : 'false');
            check.checked = selected;
          });
        });
        syncReset();
      };

      rangeLabel.before(search, ...selectNodes, reset, status);
      updateControls();

      search.addEventListener('input', () => {
        state.query = search.value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('zh-CN');
        syncReset();
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(() => { if (!disposed) reload(); }, 280);
      });
      search.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          window.clearTimeout(searchTimer);
          reload();
        }
      });
      reset.addEventListener('click', () => {
        window.clearTimeout(searchTimer);
        state.query = '';
        state.pay = 0;
        state.buyers = 0;
        state.clickRate = 0;
        state.sort = 'pay';
        search.value = '';
        status.textContent = '';
        updateControls();
        closeMenus();
        reload();
      });

      const outsideHandler = event => {
        if (openKey && !event.composedPath().some(node => node && node.classList && node.classList.contains('insight-filter-select'))) closeMenus();
      };
      shadow.addEventListener('pointerdown', outsideHandler, true);
      const escapeHandler = event => {
        if (event.key !== 'Escape' || !openKey) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const trigger = controls.get(openKey) && controls.get(openKey).trigger;
        closeMenus();
        trigger && trigger.focus();
      };
      window.addEventListener('keydown', escapeHandler, true);

      const rangeKey = range => `${range.beginDate}|${range.endDate}|${range.dateType}`;
      const entryFor = range => {
        const key = rangeKey(range);
        if (!caches.has(key)) caches.set(key, { pages: new Map(), pageSize: 10, total: null, complete: false });
        return caches.get(key);
      };
      const rememberPage = (range, page, values, pageResult) => {
        const entry = entryFor(range);
        entry.pages.set(page, values.slice());
        const rawPageSize = Number(pageResult && pageResult.page_size);
        const rawTotal = Number(pageResult && pageResult.total);
        if (Number.isSafeInteger(rawPageSize) && rawPageSize > 0) entry.pageSize = rawPageSize;
        if (Number.isSafeInteger(rawTotal) && rawTotal >= 0) entry.total = rawTotal;
        if (values.length < entry.pageSize) entry.complete = true;
      };
      const fetchInto = async (entry, range, page, signal) => {
        if (entry.pages.has(page)) return;
        const parsed = pageData(await requestPage(page, range, signal), page);
        entry.pages.set(page, parsed.values);
        entry.pageSize = parsed.pageSize;
        if (parsed.total !== null) entry.total = parsed.total;
        if (parsed.values.length < parsed.pageSize) entry.complete = true;
      };
      const collectAll = async (range, signal) => {
        const entry = entryFor(range);
        await fetchInto(entry, range, 1, signal);
        const maximumPages = 60;
        if (entry.total !== null) {
          const pageCount = Math.min(maximumPages, Math.max(1, Math.ceil(entry.total / entry.pageSize)));
          const missing = Array.from({ length: pageCount }, (_value, index) => index + 1).filter(page => !entry.pages.has(page));
          while (missing.length) {
            const batch = missing.splice(0, 4);
            await Promise.all(batch.map(page => fetchInto(entry, range, page, signal)));
          }
          entry.complete = pageCount >= Math.ceil(entry.total / entry.pageSize);
        } else {
          for (let page = 2; page <= maximumPages && !entry.complete; page += 1) await fetchInto(entry, range, page, signal);
        }
        const pages = Array.from(entry.pages.keys()).sort((left, right) => left - right);
        const values = [];
        const seen = new Set();
        pages.forEach(page => entry.pages.get(page).forEach(raw => {
          const id = String(raw && raw.base_info && raw.base_info.video_base_info && raw.base_info.video_base_info.video_id || '');
          const key = id || `page-${page}-row-${values.length}`;
          if (seen.has(key)) return;
          seen.add(key);
          values.push(raw);
        }));
        return { values, originalTotal: entry.total === null ? values.length : entry.total, complete: entry.complete };
      };
      const rawMetric = (raw, key) => metricValue(raw && raw.metrics && raw.metrics[key]);
      const filterValues = values => values.filter(raw => {
        const video = raw && raw.base_info && raw.base_info.video_base_info || {};
        const author = video.author_info || {};
        const haystack = `${video.video_title || ''} ${author.author_nick_name || ''}`.toLocaleLowerCase('zh-CN');
        if (state.query && !haystack.includes(state.query)) return false;
        const pay = rawMetric(raw, 'pay_amt');
        const buyers = rawMetric(raw, 'pay_ucnt');
        const clickRate = rawMetric(raw, 'dh_product_click_ratio_uv');
        if (state.pay > 0 && (pay === null || pay / 100 < state.pay)) return false;
        if (state.buyers > 0 && (buyers === null || buyers < state.buyers)) return false;
        if (state.clickRate > 0 && (clickRate === null || clickRate < state.clickRate)) return false;
        return true;
      });
      const sortValue = raw => {
        if (state.sort === 'buyers') return rawMetric(raw, 'pay_ucnt');
        if (state.sort === 'clickRate') return rawMetric(raw, 'dh_product_click_ratio_uv');
        if (state.sort === 'orders') return rawMetric(raw, 'pay_cnt');
        if (state.sort === 'published') return finite(raw && raw.base_info && raw.base_info.video_base_info && raw.base_info.video_base_info.publish_time);
        return rawMetric(raw, 'pay_amt');
      };
      const loadPage = async (page, range, signal) => {
        const collected = await collectAll(range, signal);
        const filtered = filterValues(collected.values)
          .map((raw, index) => ({ raw, index, value: sortValue(raw) }))
          .sort((left, right) => (right.value === null ? -Infinity : right.value) - (left.value === null ? -Infinity : left.value) || left.index - right.index)
          .map(entry => entry.raw);
        const pageSize = 10;
        const filteredTotal = filtered.length;
        const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));
        const safePage = Math.min(Math.max(1, page), totalPages);
        const slice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
        return {
          page: safePage,
          items: slice.map(normalizeValue),
          filteredTotal,
          originalTotal: collected.originalTotal,
          totalPages,
          hasNext: safePage < totalPages,
          complete: collected.complete
        };
      };
      const updateStatus = result => {
        status.textContent = `筛选后 ${result.filteredTotal} / ${result.originalTotal} 条${result.complete ? '' : '（前600条）'}`;
      };
      const clearStatus = () => { status.textContent = ''; };
      const cleanup = () => {
        if (disposed) return;
        disposed = true;
        window.clearTimeout(searchTimer);
        window.removeEventListener('keydown', escapeHandler, true);
        removeWorkLinkCopy();
      };
      const nativeRemove = mount.remove.bind(mount);
      mount.remove = () => { cleanup(); nativeRemove(); };

      return { hasActiveFilters: active, rememberPage, loadPage, updateStatus, clearStatus, closeMenus };
    },
    writable: false
  });

  return 'installed';
})();
