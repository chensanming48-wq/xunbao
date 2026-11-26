(() => {
  'use strict';

  const planModes = ['全域投放', '放量投放', '乘方投放'];
  const supportedPlanModes = ['全域投放', '放量投放', '乘方投放'];
  const minimumDailyBudgetForMode = mode => mode === '放量投放' ? 30 : 300;

  const shortPlanMode = mode => String(mode || '').replace(/投放$/, '');
  const options = {
    deliveryTime: ['长期投放', '今日投放', '自定义时间（待接通）'],
    namingRule: ['商品简称-日期-序号']
  };
  const filters = [
    { id: 'all', label: '全部商品', match: () => true },
    { id: 'available', label: '可创建', match: item => !!item.canCreate },
    { id: 'full', label: '已有全域', match: item => item.planStatus === '已有全域' },
    { id: 'volume', label: '已有放量', match: item => item.planStatus === '已有放量' },
    { id: 'cost', label: '已有控成本', match: item => item.planStatus === '已有控成本' },
    { id: 'multiply', label: '已有乘方', match: item => item.planStatus === '已有乘方' }
  ];
  const pageSize = 5;
  const ruleSelectIds = ['deliveryTime', 'materialRule', 'planState', 'queueModeFilter'];
  const platformRuleText = '支持控成本、放量与乘方投放；已有任意千川计划的商品会自动跳过';

  let page = 1;
  let activeFilter = 'all';
  let productSearchQuery = '';
  let toastTimer = 0;
  let openRuleSelectId = '';
  let queueFilter = 'all';
  let queueSearchQuery = '';
  let queueModeFilter = 'all';
  let queuePage = 1;
  let storeMenuOpen = false;
  let storeMenuFingerprint = '';
  let namingDraft = null;
  const queuePageSize = 4;
  let state = {
    account: { shopKey: '', shopName: '未选择店铺', accountName: '', advertiserId: '', loginReady: false, loginStatus: '千川登录待验证' },
    stores: [],
    metrics: { total: 0, eligible: 0, skipped: 0, selected: 0, planCount: 0, singleBudget: 0, totalBudget: 0 },
    catalog: { loading: true, statusText: '正在读取商品库…', currentProductIdentity: '' },
    rules: { scope: '勾选商品', plansPerProduct: 1, deliveryMode: '放量投放', dailyBudget: 30, roiTarget: 1.20, deliveryTime: '长期投放', materialRule: '智能优选素材', namingRule: options.namingRule[0], autoPauseAfterCreation: true },
    products: [],
    taskQueue: { expanded: false, success: 0, failed: 0, rows: [] },
    publishing: false,
    publishQueued: false,
    actionStatus: ''
  };

  const byId = id => document.getElementById(id);
  const escapeHtml = value => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const money = value => '¥' + Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  const post = (command, payload = {}) => {
    if (window.chrome && window.chrome.webview) {
      window.chrome.webview.postMessage({ type: 'command', command, payload });
    }
  };

  const icons = {
    store: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 9h16l-1.2-4H5.2L4 9Z"/><path d="M5 9v10h14V9M9 19v-5h6v5"/><path d="M4 9c0 2 3 2 4 0 1 2 3 2 4 0 1 2 3 2 4 0 1 2 4 2 4 0"/></svg>',
    package: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z"/><path d="M12 11v10"/></svg>',
    'check-circle': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 3 5 6v5c0 4.6 2.7 8.2 7 10 4.3-1.8 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-5"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.1 8.1A7 7 0 0 1 18.7 6L20 8M4 16l1.3 2A7 7 0 0 0 17.9 15.9"/></svg>',
    'arrow-left': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="m10 6-6 6 6 6M4 12h16"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
    'chevron-up': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 15 6-6 6 6"/></svg>'
  };

  function hydrateIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach(node => {
      const name = node.getAttribute('data-icon');
      if (icons[name]) node.innerHTML = icons[name];
    });
  }


  // The values come from the native, already validated batch, not mutable form fields.
  let publicationRequestId = '';
  const publicationDialog = document.createElement('section');
  publicationDialog.id = 'publicationConfirmation';
  publicationDialog.className = 'publication-confirmation inline-confirmation';
  publicationDialog.hidden = true;
  publicationDialog.setAttribute('aria-labelledby', 'publicationTitle');
  document.querySelector('.rules-panel').appendChild(publicationDialog);
  function setPublicationView(visible) {
    publicationDialog.hidden = !visible;
    document.querySelector('.rules-panel').classList.toggle('confirming', visible);
    // Freeze selection while native owns the validated batch snapshot.
    ['.workspace-primary', '.page-header', '#taskQueue'].forEach(selector => {
      document.querySelector(selector).inert = visible;
    });
  }
  function closePublicationConfirmation() {
    publicationRequestId = '';
    setPublicationView(false);
  }
  function answerPublication(accepted) {
    if (!publicationRequestId) return;
    const requestId = publicationRequestId;
    publicationRequestId = '';
    publicationDialog.querySelectorAll('button').forEach(button => { button.disabled = true; });
    post('confirmPublication', { requestId, accepted: accepted === true });
    setPublicationView(false);
    byId('generateButton').focus();
  }
  publicationDialog.addEventListener('click', event => {
    const button = event.target.closest('[data-publication-answer]');
    if (button && !button.disabled) answerPublication(button.dataset.publicationAnswer === 'yes');
  });
  window.addEventListener('keydown', event => {
    if (publicationRequestId && event.key === 'Escape') { event.preventDefault(); answerPublication(false); }
  });
  window.addEventListener('pagehide', () => { if (publicationRequestId) answerPublication(false); });

  function showPublicationConfirmation(message) {
    if (publicationRequestId) answerPublication(false);
    const s = message.summary || {};
    if (!message.requestId) return;
    const valid = Number.isInteger(s.planCount) && s.planCount > 0 &&
      Number.isFinite(s.dailyBudget) && s.dailyBudget > 0 &&
      Number.isFinite(s.totalBudget) && Math.abs(s.totalBudget - s.planCount * s.dailyBudget) < .01;
    if (!valid) {
      post('confirmPublication', { requestId: message.requestId, accepted: false });
      showToast('创建汇总无效，本次未提交，请重新核对。', true);
      return;
    }
    publicationRequestId = message.requestId;
    const autoPause = s.autoPause === true;
    publicationDialog.innerHTML = `
      <h2 id="publicationTitle"><span data-icon="list"></span>确认创建计划</h2>
      <div class="inline-confirm-account"><strong>${escapeHtml(s.shopName || '当前账户')}</strong><span>广告账户 ${escapeHtml(s.advertiserId || '—')}</span></div>
      <p class="inline-confirm-total" id="publicationDescription">将创建 <strong>${s.planCount}</strong> 个计划，每个日预算 <strong>${money(s.dailyBudget)}</strong>，合计每天最多 <strong>${money(s.totalBudget)}</strong></p>
      <p class="inline-confirm-mode">${escapeHtml(s.deliveryMode || '')} · ${s.combine ? '多商品合建计划 · 每计划 ' + escapeHtml(s.productsPerPlan || s.productCount || '—') + ' 个商品' : '每品单独建计划'}${s.deliveryMode === '放量投放' ? '' : ' · ROI ' + escapeHtml(Number(s.roiTarget).toFixed(2))}</p>
      ${s.deliveryMode === '乘方投放' ? '<p class="inline-confirm-mode">基础投放，不含达人佣金；不自动拉取联盟达人。</p>' : ''}
      <p class="inline-confirm-protection">${autoPause ? '创建后逐条暂停并核实；上述金额为所有计划启用后的每日预算合计。' : '创建后立即投放，可能产生实际广告消耗。'}</p>
      <p class="inline-confirm-warning" ${s.totalBudget >= Number(s.largeBudgetThreshold || 3000) ? '' : 'hidden'}>合计预算较高，请核对后再确认。</p>
      <div class="inline-confirm-actions"><button type="button" class="button secondary" data-publication-answer="no" id="publicationCancel">取消</button><button type="button" class="button primary" data-publication-answer="yes">确认创建</button></div>`;
    hydrateIcons(publicationDialog);
    setPublicationView(true);
    byId('publicationCancel').focus();
  }

  function showToast(text, error) {
    if (!text) return;
    const toast = byId('toast');
    toast.textContent = text;
    toast.classList.toggle('error', !!error);
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2700);
  }

  function closeStoreMenu(restoreFocus) {
    const button = byId('storeSwitchButton');
    const menu = byId('storeMenu');
    storeMenuOpen = false;
    button.classList.remove('open');
    button.setAttribute('aria-expanded', 'false');
    menu.hidden = true;
    if (restoreFocus) button.focus();
  }

  function openStoreMenu() {
    const button = byId('storeSwitchButton');
    if (button.disabled) return;
    closeOpenRuleSelect('', false);
    storeMenuOpen = true;
    button.classList.add('open');
    button.setAttribute('aria-expanded', 'true');
    byId('storeMenu').hidden = false;
    positionFloatingMenu(byId('storeMenu'), button, 330);
    const selected = byId('storeOptionList').querySelector('[aria-selected="true"]') || byId('storeOptionList').querySelector('[role="option"]');
    if (selected) selected.focus({ preventScroll: true });
  }

  function storeOptionHint(store) {
    if (store.advertiserId) return `广告账户 ${store.advertiserId}`;
    return '千川账户';
  }

  function renderStoreSwitcher() {
    const account = state.account || {};
    const stores = (Array.isArray(state.stores) ? state.stores : []).filter(store => store.loginReady === true);
    const button = byId('storeSwitchButton');
    button.disabled = stores.length === 0 || !!state.publishing;
    button.setAttribute('aria-label', stores.length
      ? `切换千川账户，当前 ${account.loginReady ? account.shopName || '未选择账户' : '未选择已登录账户'}`
      : '请先登录千川账户');
    byId('storeLoginCount').textContent = `${stores.length} 个已登录`;
    if (button.disabled && storeMenuOpen) closeStoreMenu(false);
    button.classList.toggle('open', storeMenuOpen);
    button.setAttribute('aria-expanded', storeMenuOpen ? 'true' : 'false');

    const fingerprint = JSON.stringify(stores.map(store => [
      store.shopKey, store.shopName, store.accountName, store.advertiserId,
      !!store.loginReady, store.loginStatus, !!store.selected
    ]));
    if (fingerprint === storeMenuFingerprint) return;
    storeMenuFingerprint = fingerprint;
    const list = byId('storeOptionList');
    if (!stores.length) {
      list.innerHTML = '<div class="store-option-empty">暂无已登录账户，请先到千川账户页登录</div>';
      return;
    }
    list.innerHTML = stores.map(store => {
      const selected = !!store.selected || (store.shopKey && store.shopKey === account.shopKey);
      return `<button class="store-option${selected ? ' selected' : ''}" type="button" role="option" aria-selected="${selected ? 'true' : 'false'}" data-store-key="${escapeHtml(store.shopKey || '')}" data-store-name="${escapeHtml(store.shopName || '未命名店铺')}">
        <span class="store-option-icon" data-icon="store" aria-hidden="true"></span>
        <span class="store-option-copy">
          <strong title="${escapeHtml(store.shopName || '千川账户')}">${escapeHtml(store.shopName || '千川账户')}</strong>
          <span class="store-option-meta"><small title="${escapeHtml(storeOptionHint(store))}">${escapeHtml(storeOptionHint(store))}</small></span>
        </span>
        <span class="store-option-current">${selected ? '当前' : '切换'}</span>
      </button>`;
    }).join('');
    hydrateIcons(list);
    list.querySelectorAll('[data-store-key]').forEach(option => option.addEventListener('click', () => {
      const selected = option.getAttribute('aria-selected') === 'true';
      const shopKey = option.dataset.storeKey || '';
      const shopName = option.dataset.storeName || '所选店铺';
      closeStoreMenu(false);
      if (selected || !shopKey) return;
      showToast(`正在切换到 ${shopName}…`, false);
      post('switchStore', { shopKey });
    }));
  }

  function setSelect(id, values, selected) {
    const select = byId(id);
    if (!select) return;
    const all = values.includes(selected) ? values : values.concat(selected ? [selected] : []);
    select.innerHTML = all.map(value => `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(value)}</option>`).join('');
    syncRuleSelect(id);
  }

  function selectedRuleText(select) {
    const option = select.options[select.selectedIndex];
    return option ? option.textContent : '';
  }

  function closeRuleSelect(id, restoreFocus) {
    const select = byId(id);
    if (!select || !select._ruleSelectUi) return;
    const ui = select._ruleSelectUi;
    ui.host.classList.remove('open');
    ui.trigger.setAttribute('aria-expanded', 'false');
    ui.menu.classList.remove('open');
    ui.menu.hidden = true;
    if (openRuleSelectId === id) openRuleSelectId = '';
    if (restoreFocus) ui.trigger.focus();
  }

  function closeOpenRuleSelect(exceptId, restoreFocus) {
    if (!openRuleSelectId || openRuleSelectId === exceptId) return;
    closeRuleSelect(openRuleSelectId, restoreFocus);
  }

  function positionFloatingMenu(menu, trigger, maximumHeight) {
    const rect = trigger.getBoundingClientRect();
    const inset = 8;
    const gap = 5;
    const width = Math.min(Math.max(120, rect.width), Math.max(1, window.innerWidth - inset * 2));
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.max(inset, Math.min(rect.left, window.innerWidth - width - inset))}px`;
    const below = Math.max(0, window.innerHeight - rect.bottom - inset - gap);
    const above = Math.max(0, rect.top - inset - gap);
    const naturalHeight = Math.min(menu.scrollHeight + (menu.offsetHeight - menu.clientHeight), maximumHeight);
    const upwards = below < naturalHeight && above > below;
    const menuHeight = Math.min(naturalHeight, upwards ? above : below);
    menu.style.maxHeight = `${menuHeight}px`;
    menu.style.top = `${Math.max(inset, upwards ? rect.top - menuHeight - gap : rect.bottom + gap)}px`;
  }

  function positionRuleSelectMenu(select) {
    const ui = select._ruleSelectUi;
    if (!ui || ui.menu.hidden) return;
    positionFloatingMenu(ui.menu, ui.trigger, 220);
  }

  function focusRuleOption(select, direction) {
    const items = Array.from(select._ruleSelectUi.menu.querySelectorAll('.rule-select-option'));
    if (!items.length) return;
    let index = items.indexOf(document.activeElement);
    if (direction === 'home') index = 0;
    else if (direction === 'end') index = items.length - 1;
    else if (index < 0) index = Math.max(0, items.findIndex(item => item.classList.contains('selected')));
    else index = (index + direction + items.length) % items.length;
    items[index].focus();
  }

  function chooseRuleOption(select, value) {
    if (select.value !== value) {
      select.value = value;
      syncRuleSelect(select.id);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    closeRuleSelect(select.id, true);
  }

  function openRuleSelect(select, focusOption) {
    const ui = select._ruleSelectUi;
    if (!ui) return;
    if (openRuleSelectId === select.id) {
      closeRuleSelect(select.id, false);
      return;
    }
    closeOpenRuleSelect(select.id, false);
    syncRuleSelect(select.id);
    openRuleSelectId = select.id;
    ui.host.classList.add('open');
    ui.trigger.setAttribute('aria-expanded', 'true');
    ui.menu.hidden = false;
    positionRuleSelectMenu(select);
    requestAnimationFrame(() => {
      ui.menu.classList.add('open');
      positionRuleSelectMenu(select);
      if (focusOption) focusRuleOption(select, 0);
    });
  }

  function syncRuleSelect(id) {
    const select = byId(id);
    if (!select || !select._ruleSelectUi) return;
    const ui = select._ruleSelectUi;
    ui.value.textContent = selectedRuleText(select);
    ui.menu.innerHTML = '';
    Array.from(select.options).forEach(option => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `rule-select-option${option.selected ? ' selected' : ''}`;
      button.textContent = option.textContent;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', option.selected ? 'true' : 'false');
      button.addEventListener('click', () => chooseRuleOption(select, option.value));
      ui.menu.appendChild(button);
    });
    if (!ui.menu.hidden) positionRuleSelectMenu(select);
  }

  function enhanceRuleSelect(select) {
    if (!select || select._ruleSelectUi) return;
    const host = document.createElement('div');
    const isQueueModeSelect = select.id === 'queueModeFilter';
    host.className = `rule-select${isQueueModeSelect ? ' queue-mode-select' : ''}`;
    select.parentNode.insertBefore(host, select);
    host.appendChild(select);
    select.classList.add('native-rule-select');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'rule-select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', `${select.id}Menu`);
    const label = select.closest('.rule-row');
    const labelText = select.getAttribute('aria-label') || (label && label.querySelector(':scope > span') ? label.querySelector(':scope > span').textContent : '选项');
    trigger.setAttribute('aria-label', `${labelText}：选择选项`);
    trigger.innerHTML = '<span class="rule-select-value"></span><span class="rule-select-chevron" data-icon="chevron-up"></span>';
    host.appendChild(trigger);
    hydrateIcons(trigger);

    const menu = document.createElement('div');
    menu.id = `${select.id}Menu`;
    menu.className = `rule-select-menu${isQueueModeSelect ? ' queue-mode-select-menu' : ''}`;
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', labelText);
    menu.hidden = true;
    document.body.appendChild(menu);

    select._ruleSelectUi = { host, trigger, value: trigger.querySelector('.rule-select-value'), menu };
    trigger.addEventListener('click', () => openRuleSelect(select, false));
    trigger.addEventListener('keydown', event => {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        openRuleSelect(select, true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeRuleSelect(select.id, true);
      }
    });
    menu.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        focusRuleOption(select, event.key === 'ArrowDown' ? 1 : -1);
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        focusRuleOption(select, event.key.toLowerCase());
      } else if (event.key === 'Escape' || event.key === 'Tab') {
        closeRuleSelect(select.id, event.key === 'Escape');
      }
    });
    syncRuleSelect(select.id);
  }

  function enhanceRuleSelects() {
    ruleSelectIds.forEach(id => enhanceRuleSelect(byId(id)));
    document.addEventListener('pointerdown', event => {
      if (!openRuleSelectId) return;
      const select = byId(openRuleSelectId);
      const ui = select && select._ruleSelectUi;
      if (ui && !ui.host.contains(event.target) && !ui.menu.contains(event.target)) closeRuleSelect(openRuleSelectId, false);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && openRuleSelectId) closeRuleSelect(openRuleSelectId, true);
    });
    window.addEventListener('resize', () => closeOpenRuleSelect('', false));
    // Capture nested scroll containers too; don't close a menu while scrolling its options.
    document.addEventListener('scroll', event => {
      if (event.target instanceof Element && event.target.closest('.rule-select-menu, .store-menu')) return;
      closeOpenRuleSelect('', false);
      closeStoreMenu(false);
    }, true);
    window.addEventListener('resize', () => closeStoreMenu(false));
  }

  function planStatusClass(status) {
    if (status === '发布中') return 'publishing';
    if (status === '发布成功') return 'publish-success';
    if (status === '发布失败') return 'publish-failed';
    if (status === '已创建，暂停待确认' || status === '待人工确认') return 'publish-pending';
    if (status === '已跳过' || status === '未发送') return 'publish-skipped';
    if (status === '未创建') return 'not-created';
    if (status === '可创建') return 'available';
    if (status === '已有全域') return 'full';
    if (status === '已有放量') return 'volume';
    if (status === '已有控成本') return 'cost';
    if (status === '已有乘方') return 'multiply';
    return 'blocked';
  }

  function filteredProducts() {
    const filter = filters.find(item => item.id === activeFilter) || filters[0];
    const query = productSearchQuery.trim().toLowerCase();
    return (state.products || []).filter(item => filter.match(item) && (!query ||
      [item.name, item.id].some(value => String(value || '').toLowerCase().includes(query))));
  }

  function renderHeaderAndMetrics() {
    const account = state.account || {};
    const metrics = state.metrics || {};
    const catalog = state.catalog || {};
    const syncButton = byId('syncProductsButton');
    byId('loginShopButton').hidden = false;
    byId('loginShopButton').disabled = !!state.publishing;
    const planStatusButton = byId('syncPlanStatusesButton');
    const planInventoryLoading = !!catalog.planInventoryLoading;
    syncButton.disabled = !account.loginReady || !!catalog.loading || !!catalog.productsRefreshQueued;
    syncButton.querySelector('.sync-button-text').textContent = catalog.productsRefreshQueued ? '商品刷新已排队' : catalog.loading ? '商品同步中…' : '立即同步商品';
    planStatusButton.disabled = planInventoryLoading || !!catalog.plansRefreshQueued;
    planStatusButton.querySelector('.plan-sync-button-text').textContent = catalog.plansRefreshQueued || planInventoryLoading ? '正在刷新' : '刷新计划状态';
    byId('metricStore').textContent = account.loginReady ? account.shopName || '千川账户' : '请先到千川账户页登录';
    byId('metricStore').title = byId('metricStore').textContent;
    byId('metricStoreHint').textContent = account.loginReady && account.advertiserId ? `广告账户 ${account.advertiserId}` : '请先到千川账户页登录';
    renderStoreSwitcher();
    byId('metricTotal').textContent = Number(metrics.total || 0).toLocaleString('zh-CN');
    byId('metricEligible').textContent = Number(metrics.eligible || 0).toLocaleString('zh-CN');
    byId('loginText').textContent = account.loginStatus || '千川登录待验证';
    byId('loginPill').classList.toggle('ready', !!account.loginReady);
    byId('loginPill').classList.toggle('waiting', !account.loginReady);
  }

  function renderFiltersAndNotice() {
    const products = state.products || [];
    const hiddenWarehouseCount = Math.max(0, Number((state.catalog || {}).hiddenWarehouseCount) || 0);
    const hiddenNotice = byId('hiddenWarehouseNotice');
    hiddenNotice.hidden = hiddenWarehouseCount === 0;
    hiddenNotice.textContent = hiddenWarehouseCount ? `已隐藏 ${hiddenWarehouseCount} 个仓库中商品` : '';
    byId('filterTabs').innerHTML = filters.map(filter => {
      const count = products.filter(filter.match).length;
      return `<button type="button" class="filter-tab${activeFilter === filter.id ? ' active' : ''}" data-filter="${filter.id}">${filter.label}<b>${count}</b></button>`;
    }).join('');
    byId('filterTabs').querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
      activeFilter = button.dataset.filter;
      page = 1;
      renderFiltersAndNotice();
      renderProducts();
    }));
    const catalog = state.catalog || {};
    const syncNotice = catalog.syncMessage || catalog.statusText || '';
    byId('catalogStatus').parentElement.hidden = !(state.account || {}).productReadError && !catalog.loading && !/(失败|无法|异常|超时|未登录|不可用|请先|待.*登录)/.test(syncNotice);
    byId('catalogStatus').textContent = (!(catalog.loading) && (state.account || {}).productReadError
      ? (state.account.productReadError + (products.length ? ' 已保留上次商品。' : '')) : '') || catalog.syncMessage || (catalog.loading
      ? (catalog.statusText || '正在读取当前店铺商品库…')
      : ((state.rules || {}).combineSelectedProducts
        ? '每个合建计划内共用预算与ROI；平台拒绝或任一商品不可投时停止'
        : platformRuleText));
  }

  function productImageMarkup(item) {
    if (!item.imageUrl) return '<span class="product-avatar" data-icon="package"></span>';
    return `<img class="product-image" src="${escapeHtml(item.imageUrl)}" alt="" loading="lazy"><span class="product-avatar image-fallback" data-icon="package" hidden></span>`;
  }

  function renderProducts() {
    const products = filteredProducts();
    const totalPages = Math.max(1, Math.ceil(products.length / pageSize));
    page = Math.min(Math.max(1, page), totalPages);
    const pageItems = products.slice((page - 1) * pageSize, page * pageSize);
    const rows = byId('productRows');
    const rowMarkup = pageItems.map(item => {
      const current = item.identity === (state.catalog || {}).currentProductIdentity;
      const baseStatus = item.planStatus || (item.canCreate ? '可创建' : (item.decision || '不可创建'));
      const publishStatus = item.publishStatus || '';
      const status = publishStatus || baseStatus;
      const rowPublishing = publishStatus === '发布中';
      const rowQueued = publishStatus === '排队中';
      const rowBusy = !!state.publishing || rowPublishing || rowQueued;
      let action = '';
      if (item.pendingPlanConfirmation || publishStatus === '发布成功' || /^已有/.test(baseStatus)) {
        action = `<button type="button" class="row-action" data-view-plan="${escapeHtml(item.identity)}">查看计划</button>`;
      }
      const displayStatus = status === '可创建' ? '未创建' : status.replace(/^已有(全域|放量|控成本|乘方)$/, '已建$1计划');
      return `<tr data-identity="${escapeHtml(item.identity)}" class="${current ? 'current ' : ''}${item.canCreate ? '' : 'unavailable'}">
        <td><input type="checkbox" data-select-product="${escapeHtml(item.identity)}" ${item.selected ? 'checked' : ''} ${item.canCreate && !rowBusy ? '' : 'disabled'} aria-label="选择 ${escapeHtml(item.name)}"></td>
        <td title="${escapeHtml(item.name)}"><div class="product-cell">${productImageMarkup(item)}<span class="product-copy"><strong>${escapeHtml(item.name || '未命名商品')}</strong><small>ID ${escapeHtml(item.id || '—')}</small></span></div></td>
        <td><span class="status-badge ${['出售中', '可投商品'].includes(item.status) ? 'selling' : 'blocked'}">${escapeHtml(item.status || '—')}</span></td>
        <td><span class="status-badge plan-status ${planStatusClass(status === '可创建' ? '未创建' : status)}" title="${escapeHtml(item.planStatusNote || publishStatus || item.decision || displayStatus)}">${escapeHtml(displayStatus)}</span></td>
        <td>${action}</td>
      </tr>`;
    });
    const existingRows = new Map(Array.from(rows.children).map(row => [row.dataset.identity, row]));
    pageItems.forEach((item, index) => {
      let row = existingRows.get(item.identity);
      if (!row || row._sourceMarkup !== rowMarkup[index]) {
        const holder = document.createElement('tbody');
        holder.innerHTML = rowMarkup[index];
        const replacement = holder.firstElementChild;
        replacement._sourceMarkup = rowMarkup[index];
        if (row) row.replaceWith(replacement);
        row = replacement;
        hydrateIcons(row);
      }
      if (rows.children[index] !== row) rows.insertBefore(row, rows.children[index] || null);
      existingRows.delete(item.identity);
    });
    existingRows.forEach(row => row.remove());
    const unboundRows = Array.from(rows.children).filter(row => !row._eventsBound);
    unboundRows.forEach(row => {
    row._eventsBound = true;
    row.querySelectorAll('.product-image').forEach(image => image.addEventListener('error', () => {
      image.hidden = true;
      const fallback = image.nextElementSibling;
      if (fallback) fallback.hidden = false;
    }, { once: true }));
    row.addEventListener('click', event => {
      if (event.target && event.target.closest('input,button')) return;
      post('setCurrentProduct', { identity: row.dataset.identity });
    });
    row.querySelectorAll('[data-select-product]').forEach(input => input.addEventListener('change', () => {
      post('setProductSelection', { identity: input.dataset.selectProduct, selected: input.checked });
    }));
    row.querySelectorAll('[data-view-plan]').forEach(button => button.addEventListener('click', () => {
      post('setQueueExpanded', { expanded: true, identity: button.dataset.viewPlan });
      state.taskQueue = Object.assign({}, state.taskQueue, { expanded: true });
      renderQueue();
    }));
    });
    byId('productEmpty').style.display = pageItems.length ? 'none' : 'flex';
    const catalog = state.catalog || {};
    const account = state.account || {};
    const readError = account.productReadError || (catalog.state === 'Failed' ? '本地商品缓存读取失败，请重新同步。' : '');
    const hasProducts = (state.products || []).length > 0;
    const emptyTitle = !account.loginReady ? '请先到千川账户页登录'
      : catalog.loading ? '正在获取商品'
      : readError ? '读取失败，点击重试'
      : hasProducts ? '当前筛选条件下没有商品'
      : catalog.productsVerified === true ? (catalog.productSource === 'douyin' ? '该店铺暂无商品' : '该账户暂无可投商品') : '尚未读取可投商品';
    byId('productEmpty').querySelector('strong').textContent = emptyTitle;
    byId('productEmpty').querySelector('small').textContent = !account.loginReady ? '登录后返回本页即可读取'
      : catalog.loading ? '商品返回后将立即显示，请稍候'
      : (readError === '读取失败，点击重试' ? '请稍后重试，已有商品缓存会保留。' : readError) || (hasProducts ? '请切换到全部商品或调整筛选条件'
        : catalog.productsVerified === true ? (catalog.productSource === 'douyin' ? '店铺已返回有效空列表，可稍后立即同步' : '千川已返回有效空列表，可稍后立即同步') : '请点击立即同步商品');
    const retry = byId('retryProductsButton');
    retry.hidden = !account.loginReady || !!catalog.loading || (hasProducts && !readError) || (!readError && catalog.productsVerified === true);
    retry.disabled = !!state.publishing || !!catalog.productsRefreshQueued;
    retry.textContent = catalog.productsRefreshQueued ? '重试已排队' : readError ? '点击重试' : '立即同步商品';
    const selectable = pageItems.filter(item => item.canCreate);
    const selectedOnPage = selectable.filter(item => item.selected).length;
    pageItems.forEach((item, index) => {
      rows.children[index].querySelector('[data-select-product]').checked = !!item.selected;
    });
    byId('selectPage').checked = selectable.length > 0 && selectedOnPage === selectable.length;
    byId('selectPage').indeterminate = selectedOnPage > 0 && selectedOnPage < selectable.length;
    byId('selectPage').disabled = selectable.length === 0 || !!state.publishing;
    const selectedTotal = Number((state.metrics || {}).selected || 0);
    byId('selectionSummary').textContent = `已选择 ${selectedTotal} / ${Number((state.metrics || {}).total || 0)} 个商品（本页 ${selectedOnPage} 个）`;
    byId('clearSelectionButton').disabled = selectedTotal === 0 || !!state.publishing || !!state.publishQueued;
    renderPagination(totalPages);
  }

  function renderPagination(totalPages) {
    const nav = byId('pagination');
    const buttons = [];
    buttons.push(`<button class="page-button page-arrow" data-page="${page - 1}" aria-label="上一页" ${page <= 1 ? 'disabled' : ''}><span aria-hidden="true">‹</span></button>`);
    const candidates = new Set([1, page - 1, page, page + 1, totalPages]);
    let previous = 0;
    [...candidates].filter(value => value >= 1 && value <= totalPages).sort((a, b) => a - b).forEach(value => {
      if (previous && value - previous > 1) buttons.push('<button class="page-button page-ellipsis" disabled aria-label="省略页码">…</button>');
      buttons.push(`<button class="page-button page-number${value === page ? ' active' : ''}" data-page="${value}">${value}</button>`);
      previous = value;
    });
    buttons.push(`<button class="page-button page-arrow" data-page="${page + 1}" aria-label="下一页" ${page >= totalPages ? 'disabled' : ''}><span aria-hidden="true">›</span></button>`);
    nav.innerHTML = buttons.join('');
    nav.querySelectorAll('[data-page]:not(:disabled)').forEach(button => button.addEventListener('click', () => {
      page = Number(button.dataset.page);
      renderProducts();
    }));
  }

  function renderRules() {
    const rules = state.rules || {};
    const mode = supportedPlanModes.includes(rules.deliveryMode) ? rules.deliveryMode : '放量投放';
    const groupingSupported = typeof rules.combineSelectedProducts === 'boolean';
    const combine = groupingSupported && rules.combineSelectedProducts;
    const rulesLocked = !!state.publishing || !!state.publishQueued;
    document.querySelector('.rules-panel').classList.toggle('combined-mode', combine);
    const hasRoiTarget = mode === '全域投放' || mode === '乘方投放';
    const minimumDailyBudget = minimumDailyBudgetForMode(mode);
    setSelect('deliveryTime', options.deliveryTime, rules.deliveryTime || options.deliveryTime[0]);
    const namingInput = byId('namingRule');
    const savedNaming = rules.namingRule || options.namingRule[0];
    if (namingDraft !== null && (namingDraft.trim() || options.namingRule[0]) === savedNaming) namingDraft = null;
    if (document.activeElement !== namingInput) namingInput.value = namingDraft === null ? savedNaming : namingDraft;
    namingInput.disabled = !!state.publishing || !!state.publishQueued;
    byId('dailyBudget').min = String(minimumDailyBudget);
    byId('dailyBudget').value = Math.max(minimumDailyBudget, Number(rules.dailyBudget || 0));
    byId('dailyBudgetLabel').textContent = '单计划日预算';
    byId('previewBudgetLabel').textContent = '单计划日预算';
    byId('previewTotalBudgetLabel').textContent = '全部启用后合计日预算';
    byId('roiTarget').value = Number(rules.roiTarget || 1.20).toFixed(2);
    byId('roiTargetRow').hidden = !hasRoiTarget;
    byId('roiTargetLabel').textContent = mode === '乘方投放' ? '综合营销ROI目标' : '净成交ROI目标';
    byId('previewRoiLabel').textContent = mode === '乘方投放' ? '综合营销ROI目标' : '净成交ROI目标';
    byId('roiTargetRow').title = mode === '乘方投放' ? '乘方按基础投放创建，不开启含达人佣金出价或自动拉取联盟达人' : '';
    byId('platformModeHint').textContent = mode === '乘方投放'
      ? '乘方使用基础投放；不含达人佣金，不自动拉取联盟达人'
      : '发布前会再次校验已有计划、可投商品和计划名称';
    byId('ruleGrid').classList.toggle('roi-mode', hasRoiTarget);
    document.querySelector('.rules-panel').classList.toggle('roi-mode', hasRoiTarget);
    document.querySelector('.preview-grid').classList.toggle('roi-mode', hasRoiTarget);
    byId('deliveryOptions').querySelectorAll('[data-delivery-mode]').forEach(button => {
      const selected = button.dataset.deliveryMode === mode;
      const supported = supportedPlanModes.includes(button.dataset.deliveryMode);
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      button.disabled = !supported || !!state.publishing || !!state.publishQueued || (combine && button.dataset.deliveryMode !== "全域投放");
      button.title = combine && button.dataset.deliveryMode !== '全域投放'
        ? '合建目前支持全域控成本；其他类型请使用每品单独建计划'
        : supported ? '发布前将核对账户、商品和已有计划' : '暂不支持该投放类型';
    });
    const metrics = state.metrics || {};
    const count = Number(metrics.planCount || 0);
    const maxPlans = Math.min(20, Number(rules.testStageLimit || rules.maxPlansPerBatch || 20));
    const writeEnabled = rules.writeEnabled === true;
    const availability = byId('writeAvailability');
    availability.textContent = rules.previewOnly ? '当前为离线预览，不能创建计划。' : !writeEnabled ? '当前账户暂不可创建，请检查登录及权限。' : '';
    availability.hidden = !availability.textContent;
    byId('combinedPlanCount').value = Number(rules.combinedPlanCount || 1);
    byId('combinedPlanCountRow').hidden = !combine;
    byId('plansPerProductRow').hidden = combine;
    byId('plansPerProduct').value = Number(rules.plansPerProduct || 1);
    byId('plansPerProduct').max = Math.min(20, Number(rules.maxPlansPerProduct || 20));
    const selectedProducts = (state.products || []).filter(item => item.selected);
    document.querySelectorAll('[data-combine]').forEach(button => {
      const selected = (button.dataset.combine === 'true') === combine;
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = rulesLocked || (!groupingSupported && button.dataset.combine === 'true');
      button.title = !groupingSupported && button.dataset.combine === 'true'
        ? '请更新软件后使用多商品合建' : '';
    });
    const unavailableCount = selectedProducts.filter(item => !item.canCreate).length;
    const groupError = !combine ? '' : selectedProducts.length < 2
      ? '至少选择 2 款商品，最多可合建 30 款'
      : selectedProducts.length > 30
        ? `已选择 ${selectedProducts.length} 款，请移除 ${selectedProducts.length - 30} 款后合建`
        : unavailableCount > 0
          ? `有 ${unavailableCount} 款商品不可创建，请移除标记商品或刷新计划状态`
          : mode !== '全域投放' ? '多商品合建仅支持全域控成本投放' : '';
    const invalidGroup = !!groupError;
    byId('groupingHint').textContent = combine
      ? (invalidGroup ? groupError
        : `${selectedProducts.length} 款商品/计划 × ${Number(rules.combinedPlanCount || 1)} 个全域计划 · 每计划 ${money(metrics.singleBudget)}/天 · 全部启用后 ${money(metrics.totalBudget)}/天 · ROI ${Number(rules.roiTarget || 1.2).toFixed(2)}`)
      : `每款商品 ${Number(rules.plansPerProduct || 1)} 个独立计划 · 合计 ${count} 个 · 日预算合计 ${money(metrics.totalBudget)}`;
    byId('groupingHint').classList.toggle('grouping-warning', invalidGroup);
    const group = byId('groupingProducts');
    group.hidden = !combine || !selectedProducts.length;
    group.innerHTML = combine ? selectedProducts.map(item => `<span class="grouping-chip${item.canCreate ? '' : ' unavailable'}" title="${escapeHtml(item.name)} · ID ${escapeHtml(item.id)}">
      <span>${item.canCreate ? '' : '不可创建 · '}${escapeHtml(item.name || item.id)}</span><button type="button" data-remove-product="${escapeHtml(item.identity)}" aria-label="移除${escapeHtml(item.name || item.id)}" ${rulesLocked ? 'disabled' : ''}>×</button></span>`).join('') : '';
    group.querySelectorAll('[data-remove-product]').forEach(button => button.addEventListener('click', () =>
      post('setProductSelection', { identity: button.dataset.removeProduct, selected: false })));
    document.querySelectorAll('#ruleGrid [data-rule]').forEach(input => { input.disabled = !!state.publishing || !!state.publishQueued; });
    byId('plansPerProduct').disabled = combine || !!state.publishing || !!state.publishQueued;
    byId('previewSelected').textContent = `${Number(metrics.selected || 0)} 个`;
    byId('previewMode').textContent = mode;
    byId('previewPlans').textContent = `${count} 个`;
    byId('previewBudget').textContent = money(metrics.singleBudget);
    byId('previewRoiRow').hidden = !hasRoiTarget;
    byId('previewRoi').textContent = Number(rules.roiTarget || 1.20).toFixed(2);
    byId('previewTotalBudget').textContent = money(metrics.totalBudget);
    const autoPauseAfterCreation = true;
    // Display the existing native pause behavior explicitly; this is not a write-policy change.
    byId('planState').value = 'true';
    byId('planState').title = '素材保护默认开启：创建后暂停，确认已暂停才继续发布';
    const previewProtection = byId('previewProtection');
    previewProtection.classList.toggle('disabled', !autoPauseAfterCreation);
    previewProtection.innerHTML = `<span data-icon="shield" aria-hidden="true"></span>${autoPauseAfterCreation ? '自动暂停' : '保护已关闭'}`;
    hydrateIcons(previewProtection);
    byId('publishNoticeText').textContent = autoPauseAfterCreation
      ? '创建与暂停分别记录；暂停待确认时请勿重复创建'
      : '已关闭素材保护：计划创建后可能立即投放并产生消耗';
    const publishQueued = !!state.publishQueued;
    const generateButton = byId('generateButton');
    generateButton.textContent = state.publishing ? '正在创建，请稍候…' : publishQueued ? '已排队，等待确认…' : '开始创建';
    const planInventoryLoading = !!((state.catalog || {}).planInventoryLoading);
    generateButton.disabled = !writeEnabled || !!rules.previewOnly || !!state.unfinishedBatch || count > maxPlans || invalidGroup || count <= 0 || !!state.publishing || publishQueued || planInventoryLoading || !!((state.catalog || {}).loading) || !!((state.catalog || {}).previewOnly);
    generateButton.title = invalidGroup ? groupError : planInventoryLoading
      ? '正在刷新千川计划状态，完成后再发布'
      : publishQueued
      ? '当前操作完成后会自动打开发布确认，不会直接提交计划'
      : '';
    const resume = byId('continueRemainingButton');
    resume.hidden = !Number(state.remainingCount || 0);
    resume.textContent = `继续剩余 ${Number(state.remainingCount || 0)} 个`;
    resume.disabled = !writeEnabled || !!state.publishing || publishQueued || planInventoryLoading || !!((state.batchRecovery || {}).pending);
    const actionStatus = byId('actionStatus');
    actionStatus.textContent = count > maxPlans ? `一批最多 ${maxPlans} 个，请减少数量。` : state.actionStatus || (state.unfinishedBatch ? '上一批尚未结束，请先核实并继续剩余，不能叠加新批次。' : '');
    const completed = actionStatus.textContent.startsWith('本批发布完成：');
    actionStatus.classList.toggle('batch-completed', completed);
    actionStatus.classList.toggle('batch-critical', /暂停待确认|待确认暂停|结果待确认|没建成|还没提交|未全部确认|停止|保存失败/.test(actionStatus.textContent));
    if (completed) actionStatus.innerHTML = escapeHtml(actionStatus.textContent)
      .replace(/已建好 \d+ 个计划|已确认暂停 \d+ 个计划/g, text => `<span class="publish-result-success">${text}</span>`);
  }

  let recoveryStamp = '';
  function renderBatchRecovery() {
    const recovery = state.batchRecovery || {};
    const stamp = String(recovery.stamp || '');
    if (stamp !== recoveryStamp) {
      recoveryStamp = stamp;
      byId('manualPauseReviewed').checked = false;
      byId('abandonBatchConfirmation').hidden = true;
    }
    byId('batchRecovery').hidden = !recovery.message;
    document.querySelector('.rules-panel').classList.toggle('has-batch-recovery', !!recovery.message);
    byId('batchRecoveryMessage').textContent = recovery.message || '';
    byId('recheckBatchButton').hidden = !recovery.pending;
    byId('recheckBatchButton').disabled = !!recovery.busy;
    byId('manualPauseReview').hidden = !recovery.canReview;
    byId('manualPauseReviewed').disabled = !!recovery.busy;
    byId('saveManualPauseReview').disabled = !!recovery.busy || !recovery.canReview || !byId('manualPauseReviewed').checked;
    byId('manualReviewNotice').hidden = !recovery.manualReviewed;
    byId('abandonBatchButton').hidden = !recovery.remaining;
    byId('abandonBatchButton').disabled = !!recovery.busy;
    byId('confirmAbandonBatch').disabled = !!recovery.busy;
    if (recovery.busy) byId('abandonBatchConfirmation').hidden = true;
  }

  function skipReasonText(reason) {
    if (!String(reason || '').trim()) return '未记录跳过原因，请查看记录核实';
    let text = String(reason).trim();
    if (/^PLAN_ALREADY_EXISTS$/i.test(text)) return '已有计划';
    text = text.replace(/(?:错误码|内部码|状态码|代码|error\s*code|code)\s*[:：=]?\s*[A-Za-z0-9_-]+/gi, '')
      .replace(/[A-Za-z_][A-Za-z0-9_.:/=-]*|\d{4,}/g, '')
      .replace(/[（(\[【]\s*[）)\]】]/g, '')
      .replace(/^[\s:：;；,，。\-()（）]+|[\s:：;；,，。\-()（）]+$/g, '');
    return /[\u4e00-\u9fff]/.test(text) ? text : '未提供可识别的跳过原因，请查看诊断记录核实';
  }

  function queueResult(item) {
    const explicit = String(item && item.result || '').toLowerCase();
    if (['success', 'failed', 'pending', 'skipped', 'cancelled'].includes(explicit)) return explicit;
    const status = String(item && item.status || '');
    if (status === '发布成功' || status === '创建成功') return 'success';
    if (status === '已创建，暂停待确认' || status === '待人工确认') return 'pending';
    if (status === '已跳过') return 'skipped';
    if (status === '已取消' || status === '未发送') return 'cancelled';
    if (status === '发布失败' || status === '执行失败') return 'failed';
    return '';
  }

  function queuePublishedAt(value) {
    const text = String(value || '—');
    const match = text.match(/^\d{4}-(\d{2}-\d{2}\s+\d{2}:\d{2})/);
    return match ? match[1] : text;
  }

  function queueProductMarkup(item) {
    const image = item.imageUrl
      ? `<img class="queue-product-image" src="${escapeHtml(item.imageUrl)}" alt="" loading="lazy"><span class="queue-product-avatar" data-icon="package" hidden></span>`
      : '<span class="queue-product-avatar" data-icon="package"></span>';
    const productName = item.productName || item.product || '未命名商品';
    const members = Array.isArray(item.products) ? item.products : [];
    const memberMarkup = members.length > 1 ? `<details class="queue-members"><summary>查看 ${members.length} 款商品</summary>${members.map(p => `<div><strong>${escapeHtml(p.name || p.id)}</strong><small>ID ${escapeHtml(p.id)}</small></div>`).join('')}</details>` : '';
    const secondary = item.planName || (item.productId ? `商品 ID ${item.productId}` : '—');
    return `<div class="queue-product">${image}<span class="queue-product-copy"><strong title="${escapeHtml(productName)}">${escapeHtml(productName)}</strong><small title="${escapeHtml(secondary)}">${escapeHtml(secondary)}</small>${memberMarkup}</span></div>`;
  }

  function renderQueuePagination(totalPages) {
    const nav = byId('queuePagination');
    if (!nav) return;
    const buttons = [`<button class="queue-page-button" type="button" data-queue-page="${queuePage - 1}" aria-label="上一页" ${queuePage <= 1 ? 'disabled' : ''}>‹</button>`];
    for (let value = 1; value <= totalPages; value += 1) {
      buttons.push(`<button class="queue-page-button${value === queuePage ? ' active' : ''}" type="button" data-queue-page="${value}">${value}</button>`);
    }
    buttons.push(`<button class="queue-page-button" type="button" data-queue-page="${queuePage + 1}" aria-label="下一页" ${queuePage >= totalPages ? 'disabled' : ''}>›</button>`);
    nav.innerHTML = buttons.join('');
    nav.querySelectorAll('[data-queue-page]:not(:disabled)').forEach(button => button.addEventListener('click', () => {
      queuePage = Number(button.dataset.queuePage);
      renderQueue();
    }));
  }

  function renderQueue() {
    const queue = state.taskQueue || {};
    const finalRows = (queue.rows || []).map(item => Object.assign({}, item, { _result: queueResult(item) })).filter(item => item._result);
    const successCount = Number(queue.success == null ? finalRows.filter(item => item._result === 'success').length : queue.success);
    const failedCount = Number(queue.failed == null ? finalRows.filter(item => item._result === 'failed').length : queue.failed);
    const totalCount = finalRows.length;
    byId('queueSuccess').textContent = successCount;
    byId('queueFailed').textContent = failedCount;
    byId('queueAll').textContent = totalCount;
    byId('queueAll').hidden = totalCount === 0;
    byId('queueSuccessTab').textContent = successCount;
    byId('queueFailedTab').textContent = failedCount;
    byId('queueSuccess').parentElement.hidden = successCount <= 0;
    byId('queueFailed').parentElement.hidden = failedCount <= 0;
    byId('queueSuccessTab').parentElement.hidden = successCount <= 0;
    byId('queueFailedTab').parentElement.hidden = failedCount <= 0;
    const otherCount = finalRows.filter(item => !['success', 'failed'].includes(item._result)).length;
    let otherTab = byId('queueOtherFilter');
    if (!otherTab) {
      otherTab = document.createElement('button');
      otherTab.id = 'queueOtherFilter';
      otherTab.type = 'button';
      otherTab.className = 'queue-filter-tab';
      otherTab.dataset.queueFilter = 'other';
      otherTab.addEventListener('click', () => { queueFilter = 'other'; queuePage = 1; renderQueue(); });
      byId('queueFilterTabs').appendChild(otherTab);
    }
    otherTab.textContent = [ ['pending', '结果待确认'], ['skipped', '已跳过'], ['cancelled', '还没提交'] ]
      .map(([result, label]) => { const count = finalRows.filter(item => item._result === result).length; return count > 0 ? `${label} ${count}` : ''; })
      .filter(Boolean).join(' / ');
    otherTab.hidden = otherCount === 0;
    if ((queueFilter === 'success' && successCount <= 0) || (queueFilter === 'failed' && failedCount <= 0) ||
        (queueFilter === 'other' && otherCount === 0)) { queueFilter = 'all'; queuePage = 1; }
    const skippedReasons = new Map();
    finalRows.filter(item => item._result === 'skipped').forEach(item => {
      const reason = skipReasonText(item.reason);
      skippedReasons.set(reason, (skippedReasons.get(reason) || 0) + 1);
    });
    byId('queueSkippedReasons').hidden = skippedReasons.size === 0;
    byId('queueSkippedReasons').textContent = skippedReasons.size ? '当前账户记录中的跳过原因：' +
      [...skippedReasons].map(([reason, count]) => `${reason}：${count} 个`).join('；') : '';
    byId('taskQueue').classList.toggle('expanded', !!queue.expanded);
    document.querySelector('.app-shell').classList.toggle('records-open', !!queue.expanded);
    byId('queueToggle').querySelector('span:first-child').textContent = queue.expanded ? '返回' : '查看记录';
    byId('queueFilterTabs').querySelectorAll('[data-queue-filter]').forEach(button => {
      button.classList.toggle('active', button.dataset.queueFilter === queueFilter);
    });
    if (byId('queueSearch').value !== queueSearchQuery) byId('queueSearch').value = queueSearchQuery;
    if (byId('queueModeFilter').value !== queueModeFilter) byId('queueModeFilter').value = queueModeFilter;
    syncRuleSelect('queueModeFilter');

    const search = queueSearchQuery.trim().toLowerCase();
    const filteredRows = finalRows.filter(item => {
      if (queueFilter === 'other') {
        if (['success', 'failed'].includes(item._result)) return false;
      } else if (queueFilter !== 'all' && item._result !== queueFilter) return false;
      if (queueModeFilter !== 'all' && item.deliveryMode !== queueModeFilter) return false;
      if (!search) return true;
      return [item.productName, item.product, item.productId, item.planName].concat((item.products || []).map(p => `${p.name || ""} ${p.id || ""}`))
        .some(value => String(value || '').toLowerCase().includes(search));
    });
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / queuePageSize));
    queuePage = Math.min(Math.max(1, queuePage), totalPages);
    const pageRows = filteredRows.slice((queuePage - 1) * queuePageSize, queuePage * queuePageSize);
    byId('queueRows').innerHTML = pageRows.map(item => {
      const success = item._result === 'success';
      const resultLabel = item.status || ({ success: '发布成功', failed: '发布失败', pending: '待人工确认', skipped: '已跳过', cancelled: '未发送' }[item._result]);
      const reason = item._result === 'skipped' ? skipReasonText(item.reason) : item.reason || (success ? '平台已确认计划发布成功' : '请查看记录中的具体状态');
      const actionLabel = success ? '查看计划' : (/已有|重复/.test(reason) ? '查看已有计划' : '查看原因');
      return `<tr data-queue-task-id="${escapeHtml(item.taskId || '')}">
        <td>${queueProductMarkup(item)}</td>
        <td>${escapeHtml(item.deliveryMode || '—')}</td>
        <td>${money(item.dailyBudget)}</td>
        <td>${escapeHtml(queuePublishedAt(item.publishedAt || item.createdAt))}</td>
        <td><span class="queue-result-badge ${escapeHtml(item._result)}">${escapeHtml(resultLabel)}</span></td>
        <td title="${escapeHtml(reason)}"><span class="queue-reason">${escapeHtml(reason)}</span></td>
        <td><button class="queue-row-action" type="button" data-queue-action="${success ? 'success' : 'failed'}" data-queue-reason="${escapeHtml(reason)}">${actionLabel}</button></td>
      </tr>`;
    }).join('');
    hydrateIcons(byId('queueRows'));
    byId('queueRows').querySelectorAll('.queue-product-image').forEach(image => image.addEventListener('error', () => {
      image.hidden = true;
      if (image.nextElementSibling) image.nextElementSibling.hidden = false;
    }, { once: true }));
    byId('queueRows').querySelectorAll('[data-queue-action]').forEach(button => button.addEventListener('click', () => {
      showToast(button.dataset.queueReason || (button.dataset.queueAction === 'success' ? '计划发布成功。' : '计划发布失败。'), button.dataset.queueAction === 'failed');
    }));
    byId('queueEmpty').style.display = pageRows.length ? 'none' : 'flex';
    byId('queueRows').parentElement.style.display = pageRows.length ? 'table' : 'none';
    byId('queueTotal').textContent = `共 ${filteredRows.length} 条记录`;
    renderQueuePagination(totalPages);
  }

  const renderedSections = Object.create(null);
  function renderChanged(key, value, draw) {
    const signature = JSON.stringify(value);
    if (renderedSections[key] === signature) return;
    draw();
    renderedSections[key] = signature;
  }
  function render() {
    renderChanged('header', [state.account, state.stores, state.metrics, state.catalog, state.publishing], renderHeaderAndMetrics);
    renderChanged('filters', [state.account, state.products, state.catalog, state.rules, activeFilter], renderFiltersAndNotice);
    renderChanged('products', [state.account, state.products, state.catalog, state.metrics, state.publishing, activeFilter, page], renderProducts);
    renderChanged('rules', [state.rules, state.metrics, state.products, state.catalog, state.publishing, state.publishQueued, state.actionStatus, state.unfinishedBatch, state.remainingCount, state.batchRecovery], renderRules);
    renderBatchRecovery();
    renderChanged('queue', [state.taskQueue, queueFilter, queuePage, queueSearchQuery, queueModeFilter], renderQueue);
  }

  function bindEvents() {
    document.querySelectorAll('[data-combine]').forEach(button => button.addEventListener('click', () =>
      post('setRule', { name: 'combineSelectedProducts', value: button.dataset.combine === 'true' }))); 
    byId('storeSwitchButton').addEventListener('click', () => {
      if (storeMenuOpen) closeStoreMenu(false);
      else openStoreMenu();
    });
    document.addEventListener('pointerdown', event => {
      if (!storeMenuOpen || event.target.closest('.store-switch-wrap')) return;
      closeStoreMenu(false);
    });
    document.addEventListener('keydown', event => {
      if (storeMenuOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        const options = [...byId('storeOptionList').querySelectorAll('[role="option"]')];
        if (options.length) {
          event.preventDefault();
          const index = options.indexOf(document.activeElement);
          const next = index < 0 ? 0 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
          options[next].focus();
        }
      }
      if (event.key === 'Escape' && storeMenuOpen) {
        event.preventDefault();
        closeStoreMenu(true);
      }
    });
    byId('retryProductsButton').addEventListener('click', () => byId('syncProductsButton').click());
    byId('syncProductsButton').addEventListener('click', () => {
      if ((state.catalog || {}).loading || (state.catalog || {}).productsRefreshQueued) return;
      if (state.publishing || (state.catalog || {}).planInventoryLoading) {
        state.catalog = Object.assign({}, state.catalog || {}, { productsRefreshQueued: true });
        renderHeaderAndMetrics();
        post('refreshProducts');
        return;
      }
      state.catalog = Object.assign({}, state.catalog || {}, {
        loading: true,
        statusText: '正在读取当前店铺商品，请稍候…',
        syncMessage: '正在读取当前店铺商品，请稍候…'
      });
      renderHeaderAndMetrics();
      renderFiltersAndNotice();
      renderProducts();
      post('refreshProducts');
    });
    byId('syncPlanStatusesButton').addEventListener('click', () => {
      if ((state.catalog || {}).planInventoryLoading || (state.catalog || {}).plansRefreshQueued) return;
      if (state.publishing || (state.catalog || {}).loading) {
        state.catalog = Object.assign({}, state.catalog || {}, { plansRefreshQueued: true });
        renderHeaderAndMetrics();
        post('refreshPlanStatuses');
        return;
      }
      state.catalog = Object.assign({}, state.catalog || {}, {
        planInventoryLoading: true,
        statusText: '正在向千川官方复核计划状态，请稍候…'
      });
      renderHeaderAndMetrics();
      renderFiltersAndNotice();
      renderRules();
      post('refreshPlanStatuses');
    });
    byId('checkLoginButton').addEventListener('click', () => post('checkLogin'));
    byId('loginShopButton').addEventListener('click', () => {
    if (!(state.stores || []).some(store => store.loginReady)) { showToast('请先到千川账户页登录'); return; }
    openStoreMenu();
  });

    // Carry the current input with the action as well, so a background refresh
    // or a delayed change acknowledgement cannot publish an older name.

    byId('productSearch').addEventListener('input', event => {
      productSearchQuery = event.target.value;
      page = 1;
      renderProducts();
    });
    byId('continueRemainingButton').addEventListener('click', () => post('continueRemaining', {}));
    byId('recheckBatchButton').addEventListener('click', () => post('refreshPlanStatuses', {}));
    byId('manualPauseReviewed').addEventListener('change', renderBatchRecovery);
    byId('saveManualPauseReview').addEventListener('click', () => {
      if (!byId('saveManualPauseReview').disabled)
        post('reviewBatchPause', { stamp: recoveryStamp, confirmed: true });
    });
    byId('abandonBatchButton').addEventListener('click', () => { byId('abandonBatchConfirmation').hidden = false; });
    byId('cancelAbandonBatch').addEventListener('click', () => { byId('abandonBatchConfirmation').hidden = true; });
    byId('confirmAbandonBatch').addEventListener('click', () => {
      if (!byId('confirmAbandonBatch').disabled) {
        byId('abandonBatchConfirmation').hidden = true;
        post('abandonBatch', { stamp: recoveryStamp, confirmed: true });
      }
    });
    byId('generateButton').addEventListener('click', () => post('generateTasks', {
      namingRule: byId('namingRule').value,
      combineSelectedProducts: !!(state.rules || {}).combineSelectedProducts,
      shopKey: (state.account || {}).shopKey || '',
      identities: (state.products || []).filter(item => item.selected && ((state.rules || {}).combineSelectedProducts || item.canCreate)).map(item => item.identity)
    }));
    byId('clearSelectionButton').addEventListener('click', () => post('clearProductSelection'));
    byId('namingRule').addEventListener('input', event => { namingDraft = event.target.value; });
    byId('queueToggle').addEventListener('click', () => {
      const expanded = !(state.taskQueue || {}).expanded;
      state.taskQueue.expanded = expanded;
      renderQueue();
      post('setQueueExpanded', { expanded });
    });
    byId('queueFilterTabs').addEventListener('click', event => {
      const button = event.target.closest('[data-queue-filter]');
      if (!button) return;
      queueFilter = button.dataset.queueFilter;
      queuePage = 1;
      renderQueue();
    });
    byId('queueSearch').addEventListener('input', event => {
      queueSearchQuery = event.target.value || '';
      queuePage = 1;
      renderQueue();
    });
    byId('queueModeFilter').addEventListener('change', event => {
      queueModeFilter = event.target.value || 'all';
      queuePage = 1;
      renderQueue();
    });
    byId('selectPage').addEventListener('change', event => {
      const items = filteredProducts().slice((page - 1) * pageSize, page * pageSize).filter(item => item.canCreate);
      post('setVisibleSelection', { identities: items.map(item => item.identity), selected: event.target.checked });
    });
    byId('deliveryOptions').addEventListener('click', event => {
      const button = event.target.closest('[data-delivery-mode]');
      if (!button) return;
      const nextMode = button.dataset.deliveryMode;
      if (!supportedPlanModes.includes(nextMode)) {
        showToast('请选择控成本、放量或乘方投放。', true);
        return;
      }
      const selectedMinimum = minimumDailyBudgetForMode(nextMode);
      const budgetInput = byId('dailyBudget');
      budgetInput.min = String(selectedMinimum);
      budgetInput.value = String(selectedMinimum);
      post('setRule', { name: 'deliveryMode', value: nextMode });
    });
    byId('ruleGrid').addEventListener('change', event => {
      const control = event.target.closest('[data-rule]');
      if (!control) return;
      post('setRule', { name: control.dataset.rule, value: control.value });
    });
  }

  hydrateIcons();
  bindEvents();
  render();
  enhanceRuleSelects();

  if (window.chrome && window.chrome.webview) {
    window.chrome.webview.addEventListener('message', event => {
      const message = event.data || {};
      if (message.type === 'publicationConfirmation') {
        showPublicationConfirmation(message);
      } else if (message.type === 'publicationConfirmationClosed') {
        closePublicationConfirmation();
      } else if (message.type === 'state') {
        const previousShopKey = (state.account || {}).shopKey || '';
        const previousAdvertiser = (state.account || {}).advertiserId || '';
        state = message;
        const nextShopKey = (state.account || {}).shopKey || '';
        if (publicationRequestId && (previousShopKey !== nextShopKey || previousAdvertiser !== ((state.account || {}).advertiserId || '') || (state.account || {}).loginReady === false)) answerPublication(false);
        if (previousShopKey && nextShopKey && previousShopKey !== nextShopKey) {
          page = 1;
          activeFilter = 'all';
          queuePage = 1;
          closeStoreMenu(false);
        }
        render();
      } else if (message.type === 'toast') {
        showToast(message.text, message.error);
      }
    });
    window.chrome.webview.postMessage({ type: 'ready' });
  }
})();
