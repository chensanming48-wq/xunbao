(function () {
  'use strict';

  const bridge = window.chrome && window.chrome.webview;
  const workflowEl = document.getElementById('workflow');
  const productEl = document.getElementById('productPanel');
  const centerEl = document.getElementById('centerPanel');
  const assistantEl = document.getElementById('assistantPanel');
  const actionEl = document.getElementById('actionBar');
  const toastEl = document.getElementById('toast');
  const creditDialog = document.getElementById('generationCreditDialog');
  const icon = name => `<img class="card-icon" src="${'../ai-product-card-ui/'}${name}.svg" alt="">`;
  const step = number => `<span class="card-step">${number}</span>`;
  const paidGenerationCommands = new Set(['generate', 'applyAssistantAndGenerate', 'retrySlot']);
  let pendingGenerationConfirmation = null;
  let generationSubmissionPending = false;
  let toastTimer = 0;
  let searchTimer = 0;
  let openDropdownId = '';
  let assistantDraft = null;
  let assistantDraftProductId = '';
  let resetAssistantDraftWhenReady = false;
  let assistantPointEditorOpen = false;
  let assistantPointDraft = '';
  let lastProductMarkup = '';
  let state = {
    products: [], shops: ['全部店铺'], page: 1, totalPages: 1, totalProducts: 0,
    selectedShop: '全部店铺', statusFilter: 'selling', search: '', currentProduct: null,
    referenceImages: [], generatedAssets: [], creativeTitles: [], requestedImageCount: 6,
    aspectRatio: '1:1 方图', imageQuality: '2K', generationTemplate: 'AI智能混排',
    workflowStep: 1, status: '正在读取商品与素材状态…', progress: 0
  };

  const html = value => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const bool = value => value === true || value === 'true';
  const array = value => Array.isArray(value) ? value : [];
  const centerMarkup = new WeakMap();

  function updateCenterSection(className, markup) {
    let section = centerEl.querySelector(`:scope > .${className}`);
    if (section && centerMarkup.get(section) === markup) return;
    const template = document.createElement('template');
    template.innerHTML = markup;
    const next = template.content.firstElementChild;
    if (section && className === 'gallery') {
      const header = section.querySelector('.section-head');
      const nextHeader = next.querySelector('.section-head');
      if (header.outerHTML !== nextHeader.outerHTML) header.replaceWith(nextHeader);
      const grid = section.querySelector('.asset-grid');
      const cards = Array.from(grid.children);
      const nextCards = Array.from(next.querySelector('.asset-grid').children);
      nextCards.forEach((card, index) => {
        // Keep unchanged preview nodes alive while status/other thumbnails
        // refresh, so the browser can complete a double-click on the same node.
        if (!cards[index]) grid.appendChild(card);
        else if (cards[index].outerHTML !== card.outerHTML) cards[index].replaceWith(card);
      });
      cards.slice(nextCards.length).forEach(card => card.remove());
    } else if (section) {
      section.replaceWith(next);
      section = next;
    } else {
      centerEl.appendChild(next);
      section = next;
    }
    centerMarkup.set(section, markup);
  }

  function dropdownMarkup(id, selectedValue, options, commandName, ariaLabel, extraClass) {
    const selectedText = String(selectedValue == null ? '' : selectedValue);
    const normalizedOptions = array(options).map(option => {
      if (option && typeof option === 'object') {
        return { value: String(option.value == null ? '' : option.value), label: String(option.label == null ? option.value : option.label) };
      }
      return { value: String(option == null ? '' : option), label: String(option == null ? '' : option) };
    });
    const capabilityControl = ['imageCount', 'aspectRatio', 'imageQuality'].includes(id);
    if (!capabilityControl && !normalizedOptions.some(option => option.value === selectedText)) {
      normalizedOptions.unshift({ value: selectedText, label: selectedText });
    }
    const current = normalizedOptions.find(option => option.value === selectedText) || (capabilityControl ? { value: '', label: normalizedOptions.length ? '请选择' : '参数待获取' } : normalizedOptions[0]) || { value: '', label: '' };
    const open = openDropdownId === id;
    return `<div class="ui-dropdown${open ? ' open' : ''}${extraClass ? ` ${extraClass}` : ''}" data-dropdown-root="${html(id)}">
      <button type="button" class="ui-select-trigger" data-dropdown-toggle="${html(id)}" aria-label="${html(ariaLabel || '')}" ${capabilityControl && !normalizedOptions.length ? 'disabled' : ''} aria-haspopup="listbox" aria-expanded="${open ? 'true' : 'false'}"><span class="ui-select-value">${html(current.label)}</span><span class="ui-select-chevron" aria-hidden="true"></span></button>
      <div class="ui-select-menu" role="listbox" aria-label="${html(ariaLabel || '')}">${normalizedOptions.map(option => {
        const selected = option.value === selectedText;
        return `<button type="button" class="ui-select-option${selected ? ' selected' : ''}" role="option" aria-selected="${selected ? 'true' : 'false'}" data-dropdown-option="${html(id)}" data-dropdown-command="${html(commandName)}" data-value="${html(option.value)}"><span>${html(option.label)}</span>${selected ? '<span class="ui-option-check" aria-hidden="true"><span class="ui-checkmark"></span></span>' : ''}</button>`;
      }).join('')}</div>
    </div>`;
  }

  function configDropdownMarkup(id, label, selectedValue, options, commandName) {
    return `<div class="config-field"><span class="config-label">${html(label)}</span>${dropdownMarkup(id, selectedValue, options, commandName, label, 'config-dropdown')}</div>`;
  }

  function closeDropdown() {
    if (!openDropdownId) return;
    const root = document.querySelector(`[data-dropdown-root="${openDropdownId}"]`);
    if (root) {
      root.classList.remove('open');
      const trigger = root.querySelector('[data-dropdown-toggle]');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    }
    openDropdownId = '';
  }

  function toggleDropdown(id) {
    const wasOpen = openDropdownId === id;
    closeDropdown();
    if (wasOpen) return;
    const root = document.querySelector(`[data-dropdown-root="${id}"]`);
    if (!root) return;
    root.classList.add('open');
    const trigger = root.querySelector('[data-dropdown-toggle]');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    openDropdownId = id;
  }

  function priceText(value) {
    const raw = String(value == null ? '' : value).trim();
    if (!raw) return '价格待同步';
    return /^¥|^￥/.test(raw) ? raw.replace(/^￥/, '¥') : `¥ ${raw}`;
  }

  function statusText(product) {
    const raw = String(product && product.status || '').trim();
    const normalized = raw.toLowerCase().replace(/[\s_-]+/g, '');
    if (!raw) return state.statusFilter === 'warehouse' ? '仓库中' : '售卖中';
    if (/仓|下架|售罄/.test(raw) || ['warehouse', 'offline', 'offshelf', 'soldout'].includes(normalized)) return '仓库中';
    if (/售卖|在售|上架/.test(raw) || ['selling', 'online', 'onsale'].includes(normalized)) return '售卖中';
    return raw;
  }

  function qualityStatusText(value) {
    const raw = String(value == null ? '' : value).trim();
    const normalized = raw.toLowerCase().replace(/[\s_-]+/g, '');
    if (!raw) return '已生成';
    if (['passed', 'pass', 'approved', 'ok', 'success', 'succeeded'].includes(normalized)) return '已通过';
    if (['waiting', 'pending', 'queued'].includes(normalized)) return '等待任务';
    if (['running', 'generating', 'processing'].includes(normalized)) return '生成中';
    if (['failed', 'error', 'rejected'].includes(normalized)) return '需重试';
    return raw;
  }

  function imageCreditQuote(count) {
    const quantity = Number(count);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 12) return null;
    const caps = state.cardCapabilities || {};
    const unit = Number(state.cardUnitPrice);
    if (state.cardUnitPrice == null || !Number.isFinite(unit) || unit < 0 || !caps.ready ||
        !array(caps.counts).includes(Number(state.requestedImageCount)) ||
        !array(caps.ratios).includes(state.aspectRatio) || !array(caps.qualities).includes(state.imageQuality)) return null;
    return { count: quantity, unit, total: Math.round(quantity * unit * 1000000) / 1000000 };
  }

  function generationContext() {
    const product = state.currentProduct || {};
    return JSON.stringify([product.id, product.shop, state.requestedImageCount,
      state.aspectRatio, state.imageQuality, state.generationTemplate, state.cardUnitPrice, state.cardCapabilities,
      array(state.referenceImages).filter(item => bool(item.primary)).map(item => item.index)]);
  }

  function requestGenerationConfirmation(name, payload) {
    if (pendingGenerationConfirmation || generationSubmissionPending || state.busy || state.generationBusy) return;
    if (!state.currentProduct) { showToast('请先选择一个商品。', true); return; }
    if (name === 'generate' && !state.canGenerate) return;
    if (name === 'applyAssistantAndGenerate' && !state.canApplyAssistant) return;
    const quote = imageCreditQuote(name === 'retrySlot' ? 1 : state.requestedImageCount);
    if (!quote || (name === 'retrySlot' && (!Number.isInteger(payload?.slot) || payload.slot < 1 || payload.slot > Number(state.requestedImageCount)))) {
      showToast(state.cardMetadataMessage || '价格或生成参数不可用，请重新选择或稍后重试。', true);
      return;
    }
    closeDropdown();
    pendingGenerationConfirmation = { name, payload: JSON.parse(JSON.stringify(payload || {})),
      quote, context: generationContext(), origin: document.activeElement };
    document.getElementById('creditDialogTitle').textContent = name === 'retrySlot' ? '重新生成图片扣费确认' : '生成图片扣费确认';
    document.getElementById('creditDialogCount').textContent = `${quote.count} 张${name === 'retrySlot' ? `（重新生成第 ${payload.slot} 张）` : ''}`;
    document.getElementById('creditDialogUnit').textContent = `${quote.unit} 算力 / 张`;
    document.getElementById('creditDialogTotal').textContent = `${quote.total} 算力`;
    const confirm = document.getElementById('confirmCreditGeneration');
    confirm.textContent = `确认生成，扣除 ${quote.total} 算力`;
    confirm.disabled = false;
    creditDialog.showModal();
    // The initial keyboard focus is Cancel, so the opening Enter key cannot authorize a charge.
    document.getElementById('cancelCreditGeneration').focus({ preventScroll: true });
  }

  function closeGenerationConfirmation() {
    const pending = pendingGenerationConfirmation;
    pendingGenerationConfirmation = null;
    if (creditDialog.open) creditDialog.close();
    if (pending?.origin?.isConnected) pending.origin.focus({ preventScroll: true });
  }

  function submitConfirmedGeneration() {
    const pending = pendingGenerationConfirmation;
    if (!pending || generationSubmissionPending) return;
    if (pending.context !== generationContext() || state.busy || state.generationBusy) {
      closeGenerationConfirmation();
      showToast('生成设置已变化，请重新确认数量和算力。', true);
      return;
    }
    document.getElementById('confirmCreditGeneration').disabled = true;
    generationSubmissionPending = true;
    closeGenerationConfirmation();
    renderAction();
    renderAssistant();
    postCommand(pending.name, pending.payload);
  }

  function postCommand(name, payload) {
    if (!bridge) return;
    bridge.postMessage({ type: 'command', command: name, payload: payload || {} });
  }

  function command(name, payload) {
    if (!bridge) return;
    if (name === 'showRecords' && window.MaterialRecords) window.MaterialRecords.open();
    if (paidGenerationCommands.has(name)) requestGenerationConfirmation(name, payload);
    else postCommand(name, payload);
  }

  document.getElementById('confirmCreditGeneration').addEventListener('click', submitConfirmedGeneration);
  document.getElementById('cancelCreditGeneration').addEventListener('click', closeGenerationConfirmation);
  document.getElementById('closeCreditDialog').addEventListener('click', closeGenerationConfirmation);
  creditDialog.addEventListener('cancel', event => { event.preventDefault(); closeGenerationConfirmation(); });
  creditDialog.addEventListener('click', event => { if (event.target === creditDialog) closeGenerationConfirmation(); });

  function showToast(text, error) {
    window.clearTimeout(toastTimer);
    toastEl.textContent = text || '';
    toastEl.className = 'toast show' + (error ? ' error' : '');
    toastTimer = window.setTimeout(() => { toastEl.className = 'toast'; }, 2600);
  }

  function renderWorkflow() {
    const names = ['选择商品', '选择参考图', 'AI策划', '生成素材'];
    const current = Math.max(1, Math.min(4, Number(state.workflowStep || 1)));
    workflowEl.innerHTML = names.map((name, index) => {
      const step = index + 1;
      const cls = step < current ? 'done' : step === current ? 'active' : '';
      const number = step < current ? '<span class="ui-checkmark" aria-hidden="true"></span>' : html(step);
      return `<div class="step ${cls}"><span class="step-num">${number}</span><span>${name}</span></div>`;
    }).join('');
  }

  function productCard(product) {
    const active = state.currentProduct && String(state.currentProduct.id) === String(product.id) && state.currentProduct.shopKey === product.shopKey;
    const productName = String(product.name || '未命名商品');
    const productId = String(product.id == null || product.id === '' ? '—' : product.id);
    const thumb = product.preview
      ? `<img class="product-thumb" src="${html(product.preview)}" alt="">`
      : `<div class="thumb-empty" title="商品已入库，主图加载中">${icon('image')}</div>`;
    return `<button class="product-card${active ? ' active' : ''}" data-command="selectProduct" data-id="${html(product.id)}" data-shop-key="${html(product.shopKey || '')}">
      ${thumb}<span class="product-copy"><span class="product-shop">${html(product.shop || '未识别店铺')}</span>
      <span class="product-name" title="${html(productName)}">${html(productName)}</span>
      <span class="product-id" title="ID：${html(productId)}">ID：${html(productId)}</span>
      <span class="product-foot"><span class="product-price">${html(priceText(product.price))}</span><span class="product-status">${html(statusText(product))}</span></span></span>
      ${active ? '<span class="product-selected" aria-hidden="true"><span class="ui-checkmark"></span></span>' : ''}</button>`;
  }

  function renderProducts() {
    const products = array(state.products);
    const access = state.shopAccess;
    const shops = ['全部店铺'];
    const emptyMessage = access?.removed ? '店铺已移除，请选择其他店铺。' : state.search ? '没有匹配的商品，请调整搜索词' :
      Number(state.shopProductCount || 0) > 0 ? '当前分类暂无商品，请切换“售卖中 / 仓库中”' :
      state.productSyncing ? '正在更新共享商品库，商品读取后自动显示' :
      '共享商品库暂无该店铺商品，请确认店铺登录后点击“同步商品”';
    const markup = `
      <div class="section-title">${step(1)}${icon('image')}选择商品</div>
      <div class="field-stack">
        ${dropdownMarkup('shopSelect', access ? access.selectedKey : state.selectedShop || '全部店铺', access ? [{value: '', label: '全部店铺'}, ...array(access.options)] : shops, access ? 'setProductShop' : 'setShop', '店铺筛选', 'shop-dropdown')}
        <div class="search-wrap"><input id="productSearch" class="search" value="${html(state.search || '')}" placeholder="搜索商品 / ID" aria-label="搜索商品"><span class="search-icon"></span></div>
      </div>
      <div class="status-tabs"><button class="status-tab${state.statusFilter === 'selling' ? ' active' : ''}" data-command="setStatus" data-value="selling">售卖中</button><button class="status-tab${state.statusFilter === 'warehouse' ? ' active' : ''}" data-command="setStatus" data-value="warehouse">仓库中</button></div>
      <div class="product-list">${products.length ? products.map(productCard).join('') : `<div class="empty-state"><div><div class="empty-icon">${icon('image')}</div>${html(emptyMessage)}</div></div>`}</div>
      <div class="pager"><span>共 ${Number(state.totalProducts || 0)} 条</span><button data-command="setPage" data-page="${Number(state.page || 1) - 1}" ${Number(state.page || 1) <= 1 ? 'disabled' : ''}>上一页</button><button disabled>${Number(state.page || 1)}/${Number(state.totalPages || 1)}</button><button data-command="setPage" data-page="${Number(state.page || 1) + 1}" ${Number(state.page || 1) >= Number(state.totalPages || 1) ? 'disabled' : ''}>下一页</button></div>`;
    if (markup !== lastProductMarkup) {
      const scrollTop = productEl.querySelector('.product-list')?.scrollTop || 0;
      productEl.innerHTML = markup;
      productEl.querySelector('.product-list').scrollTop = scrollTop;
      lastProductMarkup = markup;
    }
  }

  function referenceMarkup() {
    const images = array(state.referenceImages);
    const primary = images.find(item => bool(item.primary)) || images[0];
    const visibleImages = images.slice(0, 5);
    if (primary && !visibleImages.some(item => Number(item.index) === Number(primary.index))) {
      if (visibleImages.length === 5) visibleImages[4] = primary;
      else visibleImages.push(primary);
    }
    const slots = Array.from({ length: 5 }, (_, slotIndex) => visibleImages[slotIndex] || null);
    const list = slots.map((item, slotIndex) => {
      if (!item) {
        return `<div class="reference-item placeholder" aria-label="参考图位置 ${slotIndex + 1}"><span class="reference-placeholder-icon">${icon('image')}</span><span>参考图 ${slotIndex + 1}</span></div>`;
      }
      return `<button class="reference-item${bool(item.primary) ? ' active' : ''}" data-command="setPrimaryImage" data-index="${Number(item.index || 0)}" title="设为主参考图">${item.preview ? `<img src="${html(item.preview)}" alt="商品参考图 ${slotIndex + 1}">` : `<span class="reference-image-empty">${icon('image')}</span>`}${bool(item.primary) ? '<span class="reference-check" aria-hidden="true"><span class="ui-checkmark"></span></span>' : ''}<span class="reference-label">参考图 ${slotIndex + 1}</span></button>`;
    }).join('');
    const referenceHint = visibleImages.length
      ? `${visibleImages.length}/5 张 · 点击图片切换主参考图`
      : '固定 5 个主图位 · 选择商品后自动填入';
    return `<section class="center-card reference"><div class="section-head"><div><span class="section-title">${step(2)}${icon('image')}商品参考图</span> <span class="section-subtitle">${referenceHint}</span></div><div class="gallery-actions"><button class="mini-btn primary-outline" data-command="analyze" ${state.canAnalyze ? '' : 'disabled'}>AI识别商品</button></div></div><div class="reference-list">${list}</div></section>`;
  }

  function assetMarkup(asset, index) {
    const slot = Number(asset && asset.slot || index + 1);
    const title = asset && asset.title ? asset.title : `差异化创意图 ${String(slot).padStart(2, '0')}`;
    if (!asset || (!asset.preview && !asset.url)) {
      return `<article class="asset-card placeholder"><div class="asset-preview"><div><img class="asset-placeholder-icon" src="../ai-graphic-web/icons/image.svg" alt="">图 ${String(slot).padStart(2,'0')}</div></div><div class="asset-footer"><div class="asset-title">${html(title)}</div><span>等待任务</span></div></article>`;
    }
    const qualityClass = bool(asset.reviewRequired) ? 'quality-review' : 'quality-ok';
    const qualityText = bool(asset.reviewRequired) ? '需复核' : qualityStatusText(asset.qualityStatus);
    const storageBadge = asset.localStatus ? `<span class="asset-storage${bool(asset.localSaved) ? ' saved' : ''}">${html(asset.localStatus)}</span>` : '';
    return `<article class="asset-card"><input class="asset-check" type="checkbox" data-command="selectGenerated" data-slot="${slot}" ${bool(asset.selected) ? 'checked' : ''} aria-label="选择第${slot}张素材"><div class="asset-preview local-image-preview" data-open-generated="${slot}" data-asset-url="${html(asset.url || '')}" tabindex="0" role="button" aria-label="打开第${slot}张本地原图" title="点击查看本地原图；生成后自动保存">${asset.preview ? `<img src="${html(asset.preview)}" alt="生成素材 ${slot}" draggable="false">` : '<span>图片已生成</span>'}${storageBadge}</div><div class="asset-footer"><div class="asset-title">${html(title)}</div>${bool(asset.retryAvailable) ? `<button data-command="retrySlot" data-slot="${slot}">重新生成</button>` : `<span class="${qualityClass}">${html(qualityText)}</span>`}</div></article>`;
  }

  function galleryMarkup() {
    const assets = array(state.generatedAssets);
    const count = Math.max(1, Math.min(12, Number(state.requestedImageCount || 6)));
    const slots = [];
    for (let i = 0; i < count; i += 1) slots.push(assets.find(item => Number(item.slot) === i + 1));
    const recordCount = Number(state.generationRecordTotalCount || 0);
    const activeRecordCount = Number(state.generationRecordActiveCount || 0);
    const recordText = activeRecordCount > 0
      ? `生成记录 · ${activeRecordCount}生成中`
      : recordCount > 0 ? `生成记录 ${recordCount}` : '生成记录';
    return `<section class="center-card gallery"><div class="section-head"><div><span class="section-title">${icon('image')}素材预览</span> <span class="section-subtitle">${assets.length ? `已生成 ${assets.length} 张` : '生成后可在此勾选并上传千川'}</span></div><div class="gallery-actions"><button class="mini-btn" data-command="showRecords">${icon('clock')}${recordText}</button><button class="mini-btn" data-command="downloadPack" ${state.canDownload ? '' : 'disabled'}>${icon('download')}下载整包</button><button class="mini-btn primary-outline" data-command="uploadQianchuan" ${state.canUpload ? '' : 'disabled'}>${icon('cloud-upload')}上传千川</button></div></div><div class="asset-grid">${slots.map(assetMarkup).join('')}</div></section>`;
  }

  function renderCenter() {
    const quote = imageCreditQuote(state.requestedImageCount);
    updateCenterSection('settings', `<section class="center-card settings"><div class="section-head"><span class="section-title">${step(4)}${icon('settings')}生成设置</span><button class="save-config-link" data-command="saveConfiguration">保存配置</button></div><div class="config-row">
      ${configDropdownMarkup('imageCount', '生成数量', Number(state.requestedImageCount || 6), array(state.cardCapabilities?.counts).map(value => ({ value, label: `${value} 张` })), 'setImageCount')}
      ${configDropdownMarkup('aspectRatio', '画面比例', state.aspectRatio || '1:1 方图', array(state.cardCapabilities?.ratios), 'setAspect')}
        ${configDropdownMarkup('imageQuality', '画面清晰', state.imageQuality || '2K', array(state.cardCapabilities?.qualities), 'setQuality')}
      ${configDropdownMarkup('generationTemplate', '生成模板', state.generationTemplate || 'AI智能混排', ['AI智能混排', '商品主图', '千川高点击图', '千川转化图'], 'setTemplate')}
    </div><div class="generation-credit-notice" role="status" aria-live="polite"><span><strong>${state.cardUnitPrice == null ? '价格待获取' : `${html(state.cardUnitPrice)} 算力 / 张`}</strong><span class="credit-notice-label">生成图片需消耗算力</span></span><span>${quote ? `预计消耗 <strong>${quote.total} 算力</strong>` : html(state.cardMetadataMessage || '请选择支持的生成参数')}</span></div></section>`);
    updateCenterSection('reference', referenceMarkup());
    updateCenterSection('gallery', galleryMarkup());
  }

  function checkLine(done, text) {
    return `<div class="status-line"><span class="status-mark${done ? '' : ' wait'}">${done ? '●' : '○'}</span><span>${html(text)}</span></div>`;
  }

  function sceneSuggestions(product) {
    const category = String(product && product.category || '');
    if (/杯|壶|饮|水具/.test(category)) return ['办公桌面', '居家日常', '出行携带', '健身运动', '学生宿舍', '户外露营'];
    if (/服|鞋|包|配饰/.test(category)) return ['通勤穿搭', '日常出街', '细节特写', '搭配展示', '旅行场景', '种草氛围'];
    if (/食品|零食|饮料/.test(category)) return ['开箱展示', '居家分享', '下午茶', '户外聚会', '口感特写', '囤货场景'];
    return ['真实使用', '核心功能', '细节特写', '居家场景', '出行场景', '种草对比'];
  }

  function suggestedTitles(product, points) {
    const planned = array(state.creativeTitles).filter(Boolean).slice(0, 4);
    if (planned.length) return planned;
    const productName = String(product && product.name || '这款好物').trim();
    const shortName = productName.length > 18 ? `${productName.slice(0, 18)}…` : productName;
    const fallbacks = points.slice(0, 3).map(point => `${point}｜${shortName}`);
    fallbacks.push(`${shortName}｜真实场景体验`);
    return fallbacks.slice(0, 4);
  }

  function uniqueText(values, fallbacks) {
    const seen = new Set();
    return array(values).concat(array(fallbacks)).map(value => String(value == null ? '' : value).trim()).filter(value => {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function assistantOptions(product) {
    return {
      scenarios: uniqueText(state.assistantScenarios, sceneSuggestions(product)),
      styles: uniqueText(state.assistantStyles, [state.styleName, '清爽商业', '极简留白', '真实生活', '轻奢质感']),
      compositions: uniqueText(state.assistantCompositions, ['商品主视觉', '场景展示', '细节特写', '统一背景多角度陈列'])
    };
  }

  function createAssistantDraft(product) {
    const options = assistantOptions(product);
    return {
      sellingPoints: uniqueText(state.sellingPoints, []).slice(0, 6),
      scenario: options.scenarios[0] || '',
      visualStyle: options.styles[0] || '',
      composition: options.compositions[0] || '',
      customIdea: String(state.instruction || '').trim(),
      dirty: false
    };
  }

  function currentAssistantDraft(product) {
    const productId = String(product && product.id || '');
    if (!assistantDraft || assistantDraftProductId !== productId) {
      assistantDraftProductId = productId;
      assistantDraft = createAssistantDraft(product);
    }
    return assistantDraft;
  }

  function focusAssistantPointInput() {
    window.requestAnimationFrame(() => {
      const input = document.getElementById('assistantPointInput');
      if (input) input.focus();
    });
  }

  function closeAssistantPointEditor() {
    assistantPointEditorOpen = false;
    assistantPointDraft = '';
  }

  function commitAssistantPoint() {
    const product = state.currentProduct;
    if (!product) return;
    const draft = currentAssistantDraft(product);
    const input = document.getElementById('assistantPointInput');
    const point = String(input ? input.value : assistantPointDraft).trim().slice(0, 36);
    if (!point) {
      if (input) input.focus();
      showToast('请输入要添加的商品卖点。', true);
      return;
    }
    if (draft.sellingPoints.some(item => item.toLowerCase() === point.toLowerCase())) {
      if (input) input.focus();
      showToast('这个卖点已经添加过了。', true);
      return;
    }
    if (draft.sellingPoints.length >= 6) {
      closeAssistantPointEditor();
      renderAssistant();
      showToast('重点卖点最多保留 6 个。', true);
      return;
    }
    draft.sellingPoints.push(point);
    draft.dirty = true;
    closeAssistantPointEditor();
    renderAssistant();
  }

  function assistantSelect(field, value, options) {
    const dropdownIds = {
      scenario: 'assistantScenario',
      visualStyle: 'assistantVisualStyle',
      composition: 'assistantComposition'
    };
    const labels = {
      scenario: '应用场景',
      visualStyle: '画面风格',
      composition: '构图方式'
    };
    return dropdownMarkup(
      dropdownIds[field] || `assistant${field}`,
      value,
      uniqueText([value].concat(array(options))),
      '',
      labels[field] || field,
      'assistant-dropdown'
    );
  }

  let lastAssistantMarkup = '';
  function renderAssistant() {
    const selected = !!state.currentProduct;
    const product = state.currentProduct || { name: '请先选择商品', category: '—', shop: '—', price: '' };
    assistantEl.classList.toggle('assistant-unavailable', !selected);
    if (!selected) {
      assistantDraft = null;
      assistantDraftProductId = '';
      closeAssistantPointEditor();
    }
    const draft = selected ? currentAssistantDraft(product) : { sellingPoints: [], scenario: '选择商品后设置', visualStyle: '选择商品后设置', composition: '选择商品后设置', customIdea: '' };
    const options = selected ? assistantOptions(product) : { scenarios: [], styles: [], compositions: [] };
    const references = array(state.referenceImages);
    const primary = references.find(item => bool(item.primary)) || references[0];
    const statusText = state.busy ? '处理中' : state.planReady ? '● 提炼完成' : state.analysisReady ? '● 可调整' : '等待提炼';
    const pointMarkup = draft.sellingPoints.length
      ? draft.sellingPoints.map((point, index) => `<button class="assistant-chip selected" data-assistant-action="removePoint" data-index="${index}" title="删除这个卖点"><span>${html(point)}</span><b>×</b></button>`).join('')
      : '<span class="assistant-placeholder">等待AI大模型提炼商品卖点</span>';
    const pointEditorMarkup = assistantPointEditorOpen
      ? `<div class="assistant-point-editor"><input id="assistantPointInput" class="assistant-point-input" type="text" maxlength="36" value="${html(assistantPointDraft)}" placeholder="输入商品卖点，按 Enter 添加" aria-label="输入商品卖点"><button type="button" class="assistant-point-confirm" data-assistant-action="confirmPoint">添加</button><button type="button" class="assistant-point-cancel" data-assistant-action="cancelPoint">取消</button></div>`
      : `<button class="assistant-chip add" data-assistant-action="addPoint"${draft.sellingPoints.length >= 6 ? ' disabled' : ''}>${icon('plus')}添加卖点</button>`;
    const ideaLength = Math.min(200, String(draft.customIdea || '').length);
    const assistantSummary = state.analysisReady
      ? 'AI大模型已结合抖音官方标题与多张参考图，整理为可调整的生成方案'
      : '当前显示本地默认建议，点击重新分析后才会替换为AI大模型识别结果';
    const recognitionTag = state.analysisReady ? 'AI识别' : '待AI识别';
    const extractionTitle = state.analysisReady ? 'AI提炼结果' : '默认建议';
    const assistantMarkup = `<div class="assistant-head"><div class="assistant-head-main"><div class="assistant-title">${step(3)}${icon('sparkles')}AI策划</div></div><div class="assistant-head-sub"><span>${html(assistantSummary)}</span><button data-assistant-action="reanalyze" ${state.canAnalyze ? '' : 'disabled'}>${icon('refresh-cw')}重新分析</button></div></div><div class="assistant-body">
      <section class="assistant-card recognition-card"><div class="assistant-card-head"><h4>${icon('image')}商品识别</h4><span class="assistant-card-tag">${html(recognitionTag)}</span></div><div class="recognition-content">${primary && primary.preview ? `<img class="recognition-thumb" src="${html(primary.preview)}" alt="当前商品">` : `<div class="recognition-thumb empty">${icon('image')}</div>`}<div class="recognition-copy"><strong>${html(product.name || '当前商品')}</strong><span>类目：${html(product.category || '待识别')}</span><span>店铺：${html(product.shop || '未识别店铺')}</span><span>价格：${html(priceText(product.price))}</span></div></div></section>
      <section class="assistant-card extraction-card"><div class="assistant-card-head"><h4>重点卖点</h4>${pointEditorMarkup}</div><div class="assistant-chip-list">${pointMarkup}</div></section><section class="assistant-card assistant-selector-card"><div class="assistant-field select-field"><label>应用场景</label>${assistantSelect('scenario', draft.scenario, options.scenarios)}</div><div class="assistant-field select-field"><label>画面风格</label>${assistantSelect('visualStyle', draft.visualStyle, options.styles)}</div><div class="assistant-field select-field"><label>构图方式</label>${assistantSelect('composition', draft.composition, options.compositions)}</div></section>
      <section class="assistant-card idea-card"><h4>我的想法 <span>（可选）</span></h4><textarea id="assistantCustomIdea" maxlength="200" placeholder="请输入生成要求…">${html(draft.customIdea)}</textarea><div class="assistant-count"><span id="assistantIdeaCount">${ideaLength}</span>/200</div></section>
    </div><div class="assistant-footer"><button class="assistant-footer-btn" data-assistant-action="restore" ${state.analysisReady ? '' : 'disabled'}>${icon('refresh-cw')}恢复AI推荐</button></div>`;
    if (assistantMarkup !== lastAssistantMarkup) { assistantEl.innerHTML = assistantMarkup; lastAssistantMarkup = assistantMarkup; }
    if (!selected) assistantEl.querySelectorAll('button, input, textarea, select').forEach(control => { control.disabled = true; });
  }

  let lastActionMarkup = '';
  function renderAction() {
    const enabled = state.canApplyAssistant && !!imageCreditQuote(state.requestedImageCount) && !generationSubmissionPending;
    const progress = Math.max(0, Math.min(100, Number(state.progress || 0)));
    const label = generationSubmissionPending ? '正在提交…' : state.generationBusy ? '正在生成素材…' : `生成${Number(state.requestedImageCount || 6)}张图片`;
    const actionMarkup = `<div class="action-status" title="${html(state.status || '')}"><div class="action-progress"><strong>${icon('chart-no-axes-column')}生成进度</strong><div class="progress-track" role="progressbar" aria-label="生成进度" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style="width:${progress}%"></div></div><span class="action-percent">${progress}%</span></div>${state.status ? `<span class="action-detail" role="status">${html(state.status)}</span>` : ''}</div><button class="generate-btn" data-assistant-action="apply" ${enabled ? '' : 'disabled'}>${step(5)}${icon('image')}${label}</button>`;
    if (actionMarkup !== lastActionMarkup) { actionEl.innerHTML = actionMarkup; lastActionMarkup = actionMarkup; }
  }

  function render() {
    if (window.MaterialRecords && window.MaterialRecords.update(state)) return;
    const active = document.activeElement;
    const editing = active && active.id && /^(INPUT|TEXTAREA)$/.test(active.tagName) ? {
      id: active.id, value: active.value, start: active.selectionStart, end: active.selectionEnd
    } : null;
    const dropdownId = openDropdownId;
    renderWorkflow();
    renderProducts();
    renderCenter();
    renderAssistant();
    renderAction();
    if (editing) {
      const next = document.getElementById(editing.id);
      if (next) {
        next.value = editing.value;
        next.focus({ preventScroll: true });
        if (editing.start !== null) next.setSelectionRange(editing.start, editing.end);
      }
    }
    if (dropdownId) {
      const root = document.querySelector(`[data-dropdown-root="${dropdownId}"]`);
      root?.classList.add('open');
      root?.querySelector('[data-dropdown-toggle]')?.setAttribute('aria-expanded', 'true');
    }
  }

  document.addEventListener('click', event => {
    const original = event.target.closest('[data-open-generated]');
    if (original) {
      event.preventDefault();
      if (event.detail <= 1) command('openGenerated', { slot: Number(original.dataset.openGenerated), url: original.dataset.assetUrl });
      return;
    }
    const assistantAction = event.target.closest('[data-assistant-action]');
    if (assistantAction && !assistantAction.disabled) {
      const product = state.currentProduct;
      const draft = product ? currentAssistantDraft(product) : null;
      const action = assistantAction.dataset.assistantAction;
      if (action === 'removePoint' && draft) {
        draft.sellingPoints.splice(Number(assistantAction.dataset.index || 0), 1);
        draft.dirty = true;
        renderAssistant();
      } else if (action === 'addPoint' && draft) {
        assistantPointEditorOpen = true;
        assistantPointDraft = '';
        renderAssistant();
        focusAssistantPointInput();
      } else if (action === 'confirmPoint' && draft) {
        commitAssistantPoint();
      } else if (action === 'cancelPoint') {
        closeAssistantPointEditor();
        renderAssistant();
      } else if (action === 'restore' && product) {
        closeAssistantPointEditor();
        assistantDraft = createAssistantDraft(product);
        assistantDraft.dirty = true;
        renderAssistant();
        showToast('已恢复AI大模型最初提炼的推荐内容。', false);
      } else if (action === 'reanalyze' && product) {
        closeAssistantPointEditor();
        resetAssistantDraftWhenReady = true;
        assistantDraft = null;
        command('analyze');
      } else if (action === 'apply' && draft) {
        closeAssistantPointEditor();
        command('applyAssistantAndGenerate', {
          sellingPoints: draft.sellingPoints,
          scenario: draft.scenario,
          visualStyle: draft.visualStyle,
          composition: draft.composition,
          customIdea: draft.customIdea
        });
      }
      return;
    }

    const dropdownOption = event.target.closest('[data-dropdown-option]');
    if (dropdownOption) {
      const id = dropdownOption.dataset.dropdownOption;
      const name = dropdownOption.dataset.dropdownCommand;
      if (name === 'setProductShop' && state.productSyncing) return;
      const rawValue = dropdownOption.dataset.value || '';
      const assistantFields = {
        assistantScenario: 'scenario',
        assistantVisualStyle: 'visualStyle',
        assistantComposition: 'composition'
      };
      const assistantField = assistantFields[id];
      if (assistantField && state.currentProduct) {
        const draft = currentAssistantDraft(state.currentProduct);
        draft[assistantField] = rawValue;
        draft.dirty = true;
        openDropdownId = '';
        renderAssistant();
        return;
      }
      const value = name === 'setImageCount' ? Number(rawValue) : rawValue;
      if (id === 'shopSelect' && state.shopAccess) {
        state.shopAccess = { ...state.shopAccess, selectedKey: rawValue, canSync: false, canRelogin: false };
      }
      else if (id === 'shopSelect') state.selectedShop = rawValue;
      else if (id === 'imageCount') state.requestedImageCount = Number(rawValue);
      else if (id === 'aspectRatio') state.aspectRatio = rawValue;
      else if (id === 'imageQuality') state.imageQuality = rawValue;
      else if (id === 'generationTemplate') state.generationTemplate = rawValue;
      openDropdownId = '';
      render();
      command(name, { value });
      return;
    }

    const dropdownToggle = event.target.closest('[data-dropdown-toggle]');
    if (dropdownToggle) {
      const id = dropdownToggle.dataset.dropdownToggle || '';
      toggleDropdown(id);
      return;
    }

    const target = event.target.closest('[data-command]');
    if (!target || target.disabled) {
      if (openDropdownId && !event.target.closest('.ui-dropdown')) closeDropdown();
      return;
    }
    closeDropdown();
    const name = target.dataset.command;
    const payload = {};
    if (target.dataset.id != null) payload.id = target.dataset.id;
    if (target.dataset.shopKey != null) payload.shopKey = target.dataset.shopKey;
    if (target.dataset.value != null) payload.value = target.dataset.value;
    if (target.dataset.index != null) payload.index = Number(target.dataset.index);
    if (target.dataset.slot != null) payload.slot = Number(target.dataset.slot);
    if (target.dataset.page != null) payload.page = Number(target.dataset.page);
    if (target.type === 'checkbox') payload.selected = target.checked;
    command(name, payload);
  });

  document.addEventListener('change', event => {
    const target = event.target;
    if (target.id === 'instruction') command('setInstruction', { value: target.value });
    else if (target.matches('[data-command="selectGenerated"]')) command('selectGenerated', { slot: Number(target.dataset.slot), selected: target.checked });
  });

  document.addEventListener('keydown', event => {
    const image = event.target.closest('[data-open-generated]');
    if (image && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      if (!event.repeat) command('openGenerated', { slot: Number(image.dataset.openGenerated), url: image.dataset.assetUrl });
      return;
    }
    if (event.target && event.target.id === 'assistantPointInput') {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitAssistantPoint();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeAssistantPointEditor();
        renderAssistant();
      }
      return;
    }
    if (event.key !== 'Escape' || !openDropdownId) return;
    closeDropdown();
  });

  document.addEventListener('input', event => {
    const target = event.target;
    if (target.id === 'assistantPointInput') {
      assistantPointDraft = target.value.slice(0, 36);
      return;
    }
    if (target.id === 'assistantCustomIdea' && state.currentProduct) {
      const draft = currentAssistantDraft(state.currentProduct);
      draft.customIdea = target.value.slice(0, 200);
      draft.dirty = true;
      const counter = document.getElementById('assistantIdeaCount');
      if (counter) counter.textContent = String(draft.customIdea.length);
      return;
    }
    if (target.id !== 'productSearch') return;
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => command('setSearch', { value: target.value }), 260);
  });

  if (bridge) {
    bridge.addEventListener('message', event => {
      const message = event.data || {};
      if (message.type === 'state') {
        const previousProductId = String(state.currentProduct && state.currentProduct.id || '');
        state = Object.assign({}, state, message);
        if (Object.prototype.hasOwnProperty.call(message, 'busy') || Object.prototype.hasOwnProperty.call(message, 'generationBusy')) generationSubmissionPending = false;
        if (pendingGenerationConfirmation && (pendingGenerationConfirmation.context !== generationContext() || state.busy || state.generationBusy)) {
          closeGenerationConfirmation();
          showToast('生成设置已变化，请重新确认数量和算力。', true);
        }
        const nextProductId = String(state.currentProduct && state.currentProduct.id || '');
        if (previousProductId !== nextProductId) {
          assistantDraft = null;
          assistantDraftProductId = '';
          closeAssistantPointEditor();
        }
        if (resetAssistantDraftWhenReady && !state.busy && state.analysisReady) {
          assistantDraft = null;
          assistantDraftProductId = '';
          closeAssistantPointEditor();
          resetAssistantDraftWhenReady = false;
        }
        render();
      } else if (message.type === 'toast') {
        if (bool(message.error) && generationSubmissionPending) {
          generationSubmissionPending = false;
          renderAction();
          renderAssistant();
        }
        showToast(message.text, bool(message.error));
      }
    });
    bridge.postMessage({ type: 'ready' });
  } else {
    showToast('本地素材桥接尚未连接。', true);
  }
  render();
})();
