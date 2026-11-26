(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = value => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const modes = ['智能混剪', '自定义混剪', '超级混剪'];
  const defaultSettings = {
    frameMode: 'contain', mode: '智能混剪', duration: '15 秒', durationSeconds: 15, count: 3,
    rhythm: '标准', applyAll: true, audioSourceId: '__mute', audioSourceText: '静音',
    audioScope: '整条成片', audioLength: '截断至成片时长', audioStart: 0,
    audioEnd: 15, audioFadeInSeconds: 0.5, audioFadeOutSeconds: 0.5, outputPath: ''
  };
  let state = window.__audioRemixInitialState || {
    sources: [], rules: [], settings: defaultSettings,
    audioOptions: [{ id: '__mute', text: '静音' }], running: false, progress: 0,
    status: '规则已就绪，可预览效果', resultSummary: '结果摘要：等待导入素材并设置规则',
    latestOutput: '', logs: [], canUndo: false, canRedo: false
  };
  let editingRuleId = '';
  let toastTimer = 0;
  let dragContext = null;
  let timelineZoom = 1;
  let sequenceResizeTimer = 0;
  let activeCustomSelect = null;
  let customSelectMenu = null;
  let customSelectEventsBound = false;

  const icons = {
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="14" height="14" rx="2"/><path d="m17 10 4-2v8l-4-2M8 9l4 3-4 3V9Z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h7l2 2h9v10H3V6Z"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M20 7v5h-5M19 12a7 7 0 1 1-2-5l3 3"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4V8Z"/></svg>',
    playFill: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m8 5 11 7-11 7V5Z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M7 4v16 M17 4v16"/></svg>',
    expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5"/></svg>',
    volume: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 10v4h4l5 4V6L8 10H4Z"/><path d="M16 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12"/></svg>',
    grip: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="6" r="1.4"/><circle cx="16" cy="6" r="1.4"/><circle cx="8" cy="12" r="1.4"/><circle cx="16" cy="12" r="1.4"/><circle cx="8" cy="18" r="1.4"/><circle cx="16" cy="18" r="1.4"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 4h12v16l-6-4-6 4V4Z"/></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m9 7-5 5 5 5"/><path d="M5 12h8a6 6 0 0 1 6 6"/></svg>',
    redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m15 7 5 5-5 5"/><path d="M19 12h-8a6 6 0 0 0-6 6"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m4 16-1 5 5-1L19 9l-4-4L4 16Z"/><path d="m13 7 4 4"/></svg>'
  };

  function iconsIn(root = document) {
    root.querySelectorAll('[data-icon]').forEach(node => {
      const key = node.dataset.icon;
      if (icons[key]) node.innerHTML = icons[key];
    });
  }

  function post(command, payload = {}) {
    if (window.chrome && window.chrome.webview) {
      window.chrome.webview.postMessage({ type: 'command', command, payload });
    }
  }

  function toast(text, error) {
    if (!text) return;
    const node = $('toast');
    node.textContent = text;
    node.classList.toggle('error', !!error);
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 2400);
  }

  function selectOptions(id, items, value, getValue = item => item, getText = item => item) {
    const element = $(id);
    element.innerHTML = items.map(item => {
      const optionValue = getValue(item);
      return `<option value="${esc(optionValue)}"${String(optionValue) === String(value) ? ' selected' : ''}${item && item.disabled ? ' disabled' : ''}>${esc(getText(item))}${item && item.disabled ? ' · 无音轨' : ''}</option>`;
    }).join('');
    syncCustomSelect(element);
  }

  function ensureCustomSelectMenu() {
    if (customSelectMenu) return customSelectMenu;
    customSelectMenu = document.createElement('div');
    customSelectMenu.className = 'ui-select-menu';
    customSelectMenu.id = 'remixSelectMenu';
    customSelectMenu.setAttribute('role', 'listbox');
    customSelectMenu.hidden = true;
    customSelectMenu.addEventListener('click', event => {
      const optionButton = event.target.closest('.ui-select-option');
      if (!optionButton || !activeCustomSelect || optionButton.disabled) return;
      chooseCustomSelectOption(activeCustomSelect, Number(optionButton.dataset.optionIndex));
    });
    customSelectMenu.addEventListener('keydown', event => {
      if (!activeCustomSelect) return;
      const options = [...customSelectMenu.querySelectorAll('.ui-select-option:not(:disabled)')];
      const currentIndex = options.indexOf(document.activeElement);
      if (event.key === 'Escape') {
        event.preventDefault();
        closeCustomSelect(true);
        return;
      }
      if (event.key === 'Tab') {
        // Restore the field before the browser advances to its adjacent control.
        closeCustomSelect(true);
        return;
      }
      let nextIndex = -1;
      if (event.key === 'ArrowDown') nextIndex = Math.min(options.length - 1, currentIndex + 1);
      if (event.key === 'ArrowUp') nextIndex = Math.max(0, currentIndex < 0 ? options.length - 1 : currentIndex - 1);
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = options.length - 1;
      if (nextIndex >= 0) {
        event.preventDefault();
        options[nextIndex].focus();
      }
    });
    document.body.appendChild(customSelectMenu);
    return customSelectMenu;
  }

  function syncCustomSelect(select) {
    if (!select) return;
    const root = select.closest('.ui-select');
    if (!root) return;
    const trigger = root.querySelector('.ui-select-trigger');
    const valueNode = root.querySelector('.ui-select-value');
    const selected = select.selectedOptions && select.selectedOptions[0] || select.options[select.selectedIndex];
    valueNode.textContent = selected ? selected.textContent : '';
    trigger.disabled = !!select.disabled;
    root.classList.toggle('is-disabled', !!select.disabled);
    const fieldLabel = select.getAttribute('aria-label') || select.labels?.[0]?.querySelector(':scope > span')?.textContent || select.labels?.[0]?.textContent.trim() || '下拉选项';
    trigger.setAttribute('aria-label', `${fieldLabel}：${valueNode.textContent}`);
    trigger.title = selected ? selected.textContent : '';
    trigger.style.fontSize = getComputedStyle(select).fontSize;
    if (activeCustomSelect === select && customSelectMenu && !customSelectMenu.hidden) {
      if (select.disabled || !trigger.getClientRects().length) { closeCustomSelect(false); return; }
      renderCustomSelectMenu(select);
      positionCustomSelectMenu(select);
    }
  }

  function renderCustomSelectMenu(select) {
    const menu = ensureCustomSelectMenu();
    const html = [...select.options].map((option, index) => {
      const selected = index === select.selectedIndex;
      return `<button type="button" tabindex="-1" class="ui-select-option${selected ? ' is-selected' : ''}" role="option" aria-selected="${selected}" data-option-index="${index}"${option.disabled ? ' disabled' : ''}><span>${esc(option.textContent)}</span><i aria-hidden="true">✓</i></button>`;
    }).join('');
    // Native state updates must not destroy the option currently used by the keyboard.
    if (menu._optionsHtml === html) return;
    const focusedIndex = menu.contains(document.activeElement) ? document.activeElement.dataset.optionIndex : null;
    menu.innerHTML = html;
    menu._optionsHtml = html;
    if (focusedIndex != null) menu.querySelector(`[data-option-index="${focusedIndex}"]:not(:disabled)`)?.focus({preventScroll:true});
  }

  function positionCustomSelectMenu(select) {
    if (!select || !customSelectMenu || customSelectMenu.hidden) return;
    const trigger = select.closest('.ui-select').querySelector('.ui-select-trigger');
    const triggerRect = trigger.getBoundingClientRect();
    if (!trigger.getClientRects().length) { closeCustomSelect(false); return; }
    customSelectMenu.style.fontSize = getComputedStyle(trigger).fontSize;
    customSelectMenu.style.width = `${Math.min(innerWidth - 16, Math.max(88, triggerRect.width))}px`;
    const below = innerHeight - triggerRect.bottom - 12, above = triggerRect.top - 12;
    const desiredHeight = Math.min(288, select.options.length * 36 + 12);
    const openAbove = below < desiredHeight && above > below;
    customSelectMenu.style.maxHeight = `${Math.max(36, Math.min(288, openAbove ? above : below))}px`;
    customSelectMenu.style.left = '0px';
    customSelectMenu.style.top = '0px';
    const menuRect = customSelectMenu.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(Math.max(margin, triggerRect.left), Math.max(margin, innerWidth - menuRect.width - margin));
    const belowTop = triggerRect.bottom + 4;
    const top = openAbove
      ? Math.max(margin, triggerRect.top - menuRect.height - 4)
      : Math.min(belowTop, innerHeight - menuRect.height - margin);
    customSelectMenu.style.left = `${Math.round(left)}px`;
    customSelectMenu.style.top = `${Math.round(Math.max(margin, top))}px`;
  }

  function openCustomSelect(select) {
    if (!select || select.disabled) return;
    if (activeCustomSelect === select && customSelectMenu && !customSelectMenu.hidden) {
      closeCustomSelect(true);
      return;
    }
    closeCustomSelect(false);
    activeCustomSelect = select;
    const root = select.closest('.ui-select');
    const trigger = root.querySelector('.ui-select-trigger');
    root.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    renderCustomSelectMenu(select);
    const menu = ensureCustomSelectMenu();
    // A modal dialog's top layer excludes menus mounted on document.body.
    (select.closest('dialog[open]') || document.body).appendChild(menu);
    menu.setAttribute('aria-label', trigger.getAttribute('aria-label'));
    menu.hidden = false;
    menu.classList.add('is-open');
    menu.dataset.selectId = select.id;
    positionCustomSelectMenu(select);
    const selected = menu.querySelector('.ui-select-option.is-selected:not(:disabled)') || menu.querySelector('.ui-select-option:not(:disabled)');
    if (selected) { selected.focus({ preventScroll: true }); selected.scrollIntoView({block:'nearest'}); }
  }

  function closeCustomSelect(focusTrigger) {
    if (!activeCustomSelect) return;
    const select = activeCustomSelect;
    const root = select.closest('.ui-select');
    const trigger = root && root.querySelector('.ui-select-trigger');
    if (root) root.classList.remove('is-open');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    if (customSelectMenu) {
      customSelectMenu.classList.remove('is-open');
      customSelectMenu.hidden = true;
      customSelectMenu.innerHTML = '';
      customSelectMenu._optionsHtml = null;
      delete customSelectMenu.dataset.selectId;
    }
    activeCustomSelect = null;
    if (focusTrigger && trigger) trigger.focus({ preventScroll: true });
  }

  function chooseCustomSelectOption(select, optionIndex) {
    const option = select.options[optionIndex];
    if (!option || option.disabled) return;
    const changed = select.selectedIndex !== optionIndex;
    select.selectedIndex = optionIndex;
    syncCustomSelect(select);
    if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
    closeCustomSelect(true);
  }

  function enhanceSelects() {
    ensureCustomSelectMenu();
    document.querySelectorAll('select:not([data-ui-enhanced])').forEach(select => {
      if (select.closest('#customWorkspace')) return;
      select.dataset.uiEnhanced = 'true';
      select.classList.add('ui-select-native');
      select.setAttribute('aria-hidden', 'true');
      select.tabIndex = -1;
      const root = document.createElement('div');
      root.className = 'ui-select';
      root.dataset.selectId = select.id;
      select.parentNode.insertBefore(root, select);
      root.appendChild(select);
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'ui-select-trigger';
      trigger.setAttribute('aria-haspopup', 'listbox');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-controls', 'remixSelectMenu');
      if (select.hasAttribute('aria-describedby')) trigger.setAttribute('aria-describedby', select.getAttribute('aria-describedby'));
      trigger.innerHTML = '<span class="ui-select-value"></span><i class="ui-select-arrow" aria-hidden="true"></i>';
      root.appendChild(trigger);
      trigger.addEventListener('click', () => openCustomSelect(select));
      trigger.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openCustomSelect(select);
        }
      });
      select.addEventListener('change', () => syncCustomSelect(select));
      syncCustomSelect(select);
    });
    document.querySelectorAll('select[data-ui-enhanced]').forEach(syncCustomSelect);
    if (!customSelectEventsBound) {
      customSelectEventsBound = true;
      document.addEventListener('pointerdown', event => {
        if (!activeCustomSelect) return;
        const root = activeCustomSelect.closest('.ui-select');
        if (!root.contains(event.target) && !customSelectMenu.contains(event.target)) closeCustomSelect(false);
      });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && activeCustomSelect) {
          event.preventDefault();
          closeCustomSelect(true);
        }
      });
      document.addEventListener('scroll', () => positionCustomSelectMenu(activeCustomSelect), true);
      window.addEventListener('resize', () => { closeCustomSelect(false); document.querySelectorAll('select[data-ui-enhanced]').forEach(syncCustomSelect); });
    }
  }

  function formatDuration(seconds) {
    const value = Math.max(0, Number(seconds || 0));
    const minutes = Math.floor(value / 60);
    const remain = Math.floor(value % 60);
    return String(minutes).padStart(2, '0') + ':' + String(remain).padStart(2, '0');
  }

  function materialName(source) {
    const index = (state.sources || []).findIndex(item => source && item.id === source.id);
    return `素材 ${index >= 0 ? index + 1 : '?'}`;
  }

  function sourceAspectText(source) {
    const width = Number(source && source.videoWidth || 0);
    const height = Number(source && source.videoHeight || 0);
    if (!width || !height) return '';
    const ratio = width / height;
    if (Math.abs(ratio - 16 / 9) < .03) return '16:9';
    if (Math.abs(ratio - 9 / 16) < .03) return '9:16';
    if (Math.abs(ratio - 4 / 3) < .03) return '4:3';
    if (Math.abs(ratio - 1) < .03) return '1:1';
    return ratio > 1 ? `${ratio.toFixed(2)}:1` : `1:${(1 / ratio).toFixed(2)}`;
  }

  function kindClass(rule, index) {
    if (rule.kind === 'Opening') return 'opening';
    if (rule.kind === 'Ending') return 'ending';
    return index % 2 === 0 ? 'middle alt' : 'middle warm';
  }

  function ruleBadge(rule) {
    return rule.kind === 'Opening' ? '固定开头' : rule.kind === 'Ending' ? '固定结尾' : '随机混剪';
  }

  function ruleDuration(rule) {
    if (rule.kind === 'Opening') return Math.max(.5, Number(rule.end || 0) - Number(rule.start || 0));
    if (rule.kind === 'Middle') return Math.max(.5, Number(rule.maximum || rule.minimum || 0));
    return Math.max(.5, Number(rule.duration || 0));
  }

  function ruleTimingText(rule) {
    if (rule.kind === 'Opening') return `${Number(rule.start || 0)}–${Number(rule.end || 0)} 秒`;
    if (rule.kind === 'Middle') return `${Number(rule.minimum || 0)}–${Number(rule.maximum || 0)} 秒`;
    return `${Number(rule.duration || 0)} 秒`;
  }

  function sourceById(id) {
    return (state.sources || []).find(source => source.id === id) || null;
  }

  function firstRuleSource(rule) {
    const id = rule && rule.sourceIds && rule.sourceIds.length ? rule.sourceIds[0] : '';
    return sourceById(id);
  }

  function thumbnailMarkup(source, placeholderClass = 'source-letter') {
    if (source && source.thumbnailDataUrl) {
      return `<img src="${esc(source.thumbnailDataUrl)}" alt="${esc(materialName(source))}">`;
    }
    return `<span class="${placeholderClass}">${esc(source && source.label || '?')}</span>`;
  }

  function renderHeader() {
    ['undoTop', 'undoTimeline'].forEach(id => { $(id).disabled = !state.canUndo || !!state.running; });
    ['redoTop', 'redoTimeline'].forEach(id => { $(id).disabled = !state.canRedo || !!state.running; });
    $('saveTemplate').disabled = !!state.running;
    const draft = state.draft || {};
    $('editState').textContent = draft.text || '编辑后自动保存';
    $('editState').dataset.state = draft.state || 'new';
    $('editState').title = draft.detail || '工程自动保存在本机';
    $('draftDetail').textContent = draft.detail || '自由指定素材片段与音频来源，一键批量生成成片';
    $('draftDetail').classList.toggle('draft-warning', !!draft.missing || draft.state === 'error');
    $('saveDraftCopy').hidden = draft.state !== 'error';
    $('saveDraftCopy').disabled = !!state.running;
    $('saveDraftCopy').onclick = () => post('saveDraftCopy');
  }

  function renderSources() {
    const sources = state.sources || [];
    const list = $('sourceList');
    const oldScroll = list.scrollLeft;
    $('sourceCount').textContent = String(sources.length);
    list.innerHTML = sources.map(source => `
      <article class="source-card${source.missing ? ' source-missing' : ''}${source.id === (chosenPreviewSource || (state.settings || {}).audioSourceId) ? ' selected' : ''}" draggable="${state.running || source.missing ? 'false' : 'true'}" data-source-id="${esc(source.id)}" tabindex="0" title="${esc(source.fileName)} · ${source.missing ? '找不到原文件，请重新定位' : '点击播放本地原视频，拖入规则使用'}">
        <div class="source-thumb">${thumbnailMarkup(source)}<span class="source-number">${esc(materialName(source))}</span>${source.embeddedBlackBars === true ? '<span class="source-bars-hint" title="检测到可能自带的黑边，请播放确认">疑似黑边</span>' : ''}<time class="source-duration">${esc(source.durationText || '--:--')}</time>${source.missing ? `<button class="source-relink" data-relink-source="${esc(source.id)}">重新定位</button>` : ''}</div>
        <div class="source-copy"><strong>${esc(source.fileName || materialName(source))}</strong><small>${esc(source.status)}</small></div>
        <button class="source-menu" data-remove-source="${esc(source.id)}" title="移除素材" aria-label="移除${esc(materialName(source))}"><span data-icon="trash"></span></button>
      </article>`).join('');
    list.scrollLeft = oldScroll;
    $('sourceEmpty').style.display = sources.length ? 'none' : 'flex';
    list.querySelectorAll('[data-relink-source]').forEach(button => {
      button.disabled = !!state.running;
      button.onclick = event => { event.stopPropagation(); post('relinkDraftSource', { id: button.dataset.relinkSource }); };
    });
    list.querySelectorAll('[data-remove-source]').forEach(button => {
      button.disabled = !!state.running;
      button.onclick = event => { event.stopPropagation(); post('removeSource', { id: button.dataset.removeSource }); };
    });
    list.querySelectorAll('.source-card').forEach(card => {
      card.addEventListener('dragstart', event => startDrag(event, { kind: 'source', id: card.dataset.sourceId }, card));
      card.addEventListener('dragend', finishDrag);
      const activate = () => sourceById(card.dataset.sourceId)?.missing ? (!state.running && post('relinkDraftSource', { id: card.dataset.sourceId })) : showSourcePreview(card.dataset.sourceId, true);
      card.onclick = activate;
      card.onkeydown = event => {
        if (event.target !== card || event.repeat) return;
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
      };
    });
    $('materialSummary').textContent = sources.length ? `已导入 ${sources.length} 个素材` : '尚未添加素材';
  }

  function ruleTime(rule) {
    if (rule.kind === 'Opening') {
      return `<div class="time-inputs"><input data-rule-field="start" data-rule-id="${esc(rule.id)}" type="number" min="0" step="0.5" value="${Number(rule.start || 0)}"><span>–</span><input data-rule-field="end" data-rule-id="${esc(rule.id)}" type="number" min="0" step="0.5" value="${Number(rule.end || 0)}"><span>秒</span></div>`;
    }
    if (rule.kind === 'Middle') {
      return `<div class="time-inputs"><input data-rule-field="minimum" data-rule-id="${esc(rule.id)}" type="number" min="0.5" step="0.5" value="${Number(rule.minimum || 0)}"><span>–</span><input data-rule-field="maximum" data-rule-id="${esc(rule.id)}" type="number" min="0.5" step="0.5" value="${Number(rule.maximum || 0)}"><span>秒</span></div>`;
    }
    return `<div class="time-inputs"><input data-rule-field="duration" data-rule-id="${esc(rule.id)}" type="number" min="0" step="0.5" value="${Number(rule.duration || 0)}"><span>秒</span></div>`;
  }

  function renderRules() {
    const settings = state.settings || defaultSettings;
    const focusedMode = document.activeElement?.closest('#modeTabs [data-mode]')?.dataset.mode;
    $('modeTabs').innerHTML = modes.map(mode => {
      const selected = window.SuperMixUI?.active ? mode === '超级混剪' : settings.mode === mode;
      const description = mode === '智能混剪' ? '多个视频自动选片' : mode === '超级混剪' ? '主视频＋补充素材，多种变化' : '自己设置剪辑规则';
      return `<button type="button" class="mode-tab${selected ? ' active' : ''}" data-mode="${esc(mode)}" aria-pressed="${selected}"${state.running ? ' disabled' : ''}><span class="cm-mode-icon">${icons[mode === '智能混剪' ? 'playFill' : mode === '自定义混剪' ? 'plus' : 'video']}</span><span class="cm-mode-copy"><span class="mode-label">${esc(mode)}</span><span class="mode-description">${description}</span></span></button>`;
    }).join('');
    $('modeTabs').querySelectorAll('[data-mode]').forEach(button => button.onclick = () => {
      if (button.dataset.mode === '超级混剪') { window.SuperMixUI?.enter(); return; }
      window.SuperMixUI?.leave();
      if (!state.running && button.dataset.mode !== settings.mode) post('setMode', { value: button.dataset.mode });
    });
    if (focusedMode) $('modeTabs').querySelector(`[data-mode="${focusedMode}"]`)?.focus();

    const body = $('ruleRows');
    const rules = state.rules || [];
    body.innerHTML = rules.map((rule, index) => {
      const semanticClass = kindClass(rule, index);
      return `<tr class="rule-row sequence-clip-row" data-rule-id="${esc(rule.id)}" data-rule-index="${index}" draggable="${!state.running && rule.kind === 'Middle'}">
        <td><div class="rule-kind-cell"><span class="rule-index ${semanticClass}">${index + 1}</span><strong>${esc(rule.kindText)}</strong></div></td>
        <td><button class="source-chip" data-source-rule="${esc(rule.id)}" title="${esc(rule.sourceText)}">${firstRuleSource(rule) && firstRuleSource(rule).thumbnailDataUrl ? `<img src="${esc(firstRuleSource(rule).thumbnailDataUrl)}" alt="">` : ''}<span>${esc(rule.sourceIds && rule.sourceIds.length === 1 && firstRuleSource(rule) ? materialName(firstRuleSource(rule)) + ' · ' + firstRuleSource(rule).fileName : rule.sourceText || '请选择素材')}</span></button></td>
        <td>${ruleTime(rule)}</td>
        <td><span class="rule-badge">${esc(ruleBadge(rule))}</span></td>
        <td><div class="rule-ops"><span class="rule-grip" title="拖动中段行调整顺序" data-icon="grip"></span><button class="rule-op remove" data-remove-rule="${esc(rule.id)}" title="删除"><span data-icon="trash"></span></button></div></td>
      </tr>`;
    }).join('');
    $('ruleEmpty').style.display = rules.length ? 'none' : 'flex';
    body.querySelectorAll('[data-source-rule]').forEach(button => button.onclick = () => openSourceModal(button.dataset.sourceRule));
    body.querySelectorAll('[data-remove-rule]').forEach(button => button.onclick = () => post('removeRule', { id: button.dataset.removeRule }));
    body.querySelectorAll('[data-rule-field]').forEach(input => input.onchange = () => post('updateRule', { id: input.dataset.ruleId, field: input.dataset.ruleField, value: input.value }));
    $('applyAll').checked = !!settings.applyAll;
    bindRuleRowsDrag(body);
  }

  function renderSettings() {
    const settings = state.settings || defaultSettings;
    selectOptions('durationSelect', ['15 秒', '20 秒', '30 秒', '45 秒', '60 秒'], settings.duration);
    if (document.activeElement !== $('countInput')) $('countInput').value = Number(settings.count || 3);
    selectOptions('rhythmSelect', ['快节奏', '标准', '舒缓'], settings.rhythm);
    const rules = state.rules || [];
    $('overviewMeta').textContent = `共 ${rules.length} 段 · 目标 ${Number(settings.durationSeconds || 15)} 秒`;
    $('generationEstimate').textContent = `预计生成 ${Number(settings.count || 1)} 条成片`;
  }

  function renderAudio() {
    const settings = state.settings || defaultSettings;
    selectOptions('audioSource', state.audioOptions || [], settings.audioSourceId, item => item.id, item => item.text);
    selectOptions('audioScope', ['整条成片', '仅指定时间段'], settings.audioScope);
    selectOptions('audioLength', ['截断至成片时长', '循环填充', '不足部分静音'], settings.audioLength);
    if (document.activeElement !== $('audioStart')) $('audioStart').value = Number(settings.audioStart || 0);
    if (document.activeElement !== $('audioEnd')) $('audioEnd').value = Number(settings.audioEnd || 0);
    const fadeOptions = ['0', '0.3', '0.5', '1', '1.5', '2'];
    const fadeText = value => Number(value) === 0 ? '无' : `${Number(value).toFixed(1)}s`;
    selectOptions('audioFadeIn', fadeOptions, String(Number(settings.audioFadeInSeconds == null ? .5 : settings.audioFadeInSeconds)), value => value, fadeText);
    selectOptions('audioFadeOut', fadeOptions, String(Number(settings.audioFadeOutSeconds == null ? .5 : settings.audioFadeOutSeconds)), value => value, fadeText);
    $('rangeField').classList.toggle('is-hidden', settings.audioScope !== '仅指定时间段');
    $('audioFields').classList.toggle('has-range', settings.audioScope === '仅指定时间段');
    $('audioTrackLabel').textContent = settings.audioSourceText || '静音';
    renderAudition();
  }

  function renderRuler() {
    const duration = Math.max(1, Number((state.settings || defaultSettings).durationSeconds || 15));
    const steps = duration <= 20 ? 3 : duration <= 45 ? 5 : 6;
    $('timelineRuler').innerHTML = Array.from({ length: steps + 1 }, (_, index) => {
      const seconds = duration * index / steps;
      return `<span class="ruler-tick" data-ruler-left="${index / steps * 100}">${formatDuration(seconds)}</span>`;
    }).join('');
    $('timelineRuler').querySelectorAll('[data-ruler-left]').forEach(tick => tick.style.left = `${tick.dataset.rulerLeft}%`);
  }

  function clipMarkup(rule, index, width) {
    const source = firstRuleSource(rule);
    const semanticClass = kindClass(rule, index);
    const duration = ruleDuration(rule);
    const role = rule.kind === 'Opening' ? '开头画面' : rule.kind === 'Ending' ? '结尾画面' : '中段画面';
    const displayName = rule.autoSource ? '自动选择' : source ? materialName(source) : (rule.sourceText || '请选择素材');
    const draggable = !state.running && rule.kind === 'Middle';
    const isEmpty = !source;
    const emptyAction = rule.kind === 'Ending' ? '自动匹配' : '选择画面';
    const thumbnail = isEmpty
      ? `<span class="clip-empty-state" aria-hidden="true"><span class="clip-empty-icon"><span data-icon="video"></span><span class="clip-empty-plus" data-icon="plus"></span></span><span class="clip-empty-label">${emptyAction}</span></span>`
      : thumbnailMarkup(source, 'clip-placeholder');
    return `<article class="sequence-clip ${semanticClass}" data-rule-id="${esc(rule.id)}" data-rule-index="${index}" data-clip-width="${width}" draggable="${draggable ? 'true' : 'false'}" title="${draggable ? '拖动可调整中段顺序；将左侧素材拖到这里可替换' : '将左侧素材拖到这里可替换'}">
      <div class="clip-thumb${isEmpty ? ' is-empty' : ''}"${isEmpty ? ` data-sequence-source="${esc(rule.id)}" role="button" tabindex="0" aria-label="${esc(emptyAction)}：${esc(role)}"` : ''}>${thumbnail}<span class="clip-role">${index + 1}&nbsp; ${esc(role)}</span></div>
      <div class="clip-copy"><strong>${esc(displayName)}</strong><span>${duration.toFixed(1)}s · ${esc(ruleBadge(rule))}</span></div>
      <span class="clip-grip" data-icon="grip"></span>
    </article>`;
  }

  function insertZoneMarkup(index) {
    return `<div class="insert-zone" data-insert-index="${index}" title="拖到这里可插入中段片段"></div>`;
  }

  function renderSequence() {
    const rules = state.rules || [];
    const track = $('videoTrack');
    renderRuler();
    if (!rules.length) {
      track.innerHTML = '<div class="track-empty">导入素材后，可将素材拖到这里编排</div>';
      bindEmptyTrackDrop(track);
    } else {
      let markup = '';
      const usableWidth = Math.max(660, track.clientWidth - Math.max(0, rules.length - 1) * 11 - 8);
      const equalWidth = Math.max(168, Math.min(360, usableWidth / Math.max(1, rules.length) * timelineZoom));
      rules.forEach((rule, index) => {
        if (index > 0) markup += insertZoneMarkup(index);
        markup += clipMarkup(rule, index, equalWidth);
      });
      track.innerHTML = markup;
      track.querySelectorAll('[data-clip-width]').forEach(clip => clip.style.setProperty('--clip-width', `${clip.dataset.clipWidth}px`));
      track.querySelectorAll('[data-sequence-source]').forEach(button => {
        button.onclick = event => {
          event.stopPropagation();
          openSourceModal(button.dataset.sequenceSource);
        };
        button.onkeydown = event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.stopPropagation();
          openSourceModal(button.dataset.sequenceSource);
        };
      });
      bindSequenceDragAndDrop(track);
    }
    track.classList.toggle('is-scrollable', track.scrollWidth > track.clientWidth + 6);
    iconsIn(track);

    $('sequenceSummary').innerHTML = rules.map((rule, index) => `<span class="summary-chip ${kindClass(rule, index)}">${index + 1} ${esc(rule.kind === 'Opening' ? '开头' : rule.kind === 'Ending' ? '结尾' : '中段')}</span>`).join('<span class="summary-arrow">›</span>');
    const duration = Number((state.settings || defaultSettings).durationSeconds || 15);
    const progress = state.running ? Math.max(0, Math.min(100, Number(state.progress || 0))) : 0;
    $('playbackTime').textContent = `${formatDuration(duration * progress / 100)} / ${formatDuration(duration)}`;
    $('playbackValue').style.width = `${progress}%`;
    $('playhead').style.left = `${progress}%`;
  }

  function startDrag(event, context, element) {
    if (state.running) {
      event.preventDefault();
      return;
    }
    dragContext = context;
    element.classList.add('dragging');
    document.body.classList.add('drag-active');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = context.kind === 'source' ? 'copyMove' : 'move';
      event.dataTransfer.setData('text/plain', JSON.stringify(context));
    }
  }

  function finishDrag() {
    document.querySelectorAll('.dragging,.drop-replace,.drop-reorder,.drop-insert').forEach(node => node.classList.remove('dragging', 'drop-replace', 'drop-reorder', 'drop-insert'));
    document.body.classList.remove('drag-active');
    dragContext = null;
  }

  function bindSequenceDragAndDrop(track) {
    track.querySelectorAll('.sequence-clip').forEach(clip => {
      if (clip.getAttribute('draggable') === 'true') {
        clip.addEventListener('dragstart', event => startDrag(event, { kind: 'rule', id: clip.dataset.ruleId, index: Number(clip.dataset.ruleIndex) }, clip));
        clip.addEventListener('dragend', finishDrag);
      }
      clip.addEventListener('dragover', event => {
        if (!dragContext) return;
        if (dragContext.kind === 'rule' && clip.getAttribute('draggable') !== 'true') return;
        event.preventDefault();
        event.dataTransfer.dropEffect = dragContext.kind === 'source' ? 'copy' : 'move';
        clip.classList.toggle('drop-replace', dragContext.kind === 'source');
        clip.classList.toggle('drop-reorder', dragContext.kind === 'rule');
      });
      clip.addEventListener('dragleave', event => {
        if (!clip.contains(event.relatedTarget)) clip.classList.remove('drop-replace', 'drop-reorder');
      });
      clip.addEventListener('drop', event => {
        event.preventDefault();
        const context = dragContext;
        clip.classList.remove('drop-replace', 'drop-reorder');
        if (!context) return finishDrag();
        if (context.kind === 'source') {
          post('setRuleSources', { id: clip.dataset.ruleId, sourceIds: [context.id], autoSource: false });
          toast('素材已替换，编排规则和规则概览将同步更新');
        } else if (context.kind === 'rule' && context.id !== clip.dataset.ruleId) {
          post('reorderRule', { id: context.id, targetIndex: Number(clip.dataset.ruleIndex) });
          toast('中段片段顺序已调整');
        }
        finishDrag();
      });
    });

    track.querySelectorAll('.insert-zone').forEach(zone => {
      zone.addEventListener('dragover', event => {
        if (!dragContext) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = dragContext.kind === 'source' ? 'copy' : 'move';
        zone.classList.add('drop-insert');
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('drop-insert'));
      zone.addEventListener('drop', event => {
        event.preventDefault();
        const context = dragContext;
        zone.classList.remove('drop-insert');
        if (!context) return finishDrag();
        let targetIndex = Number(zone.dataset.insertIndex || 0);
        if (context.kind === 'source') {
          post('insertSourceRule', { sourceId: context.id, targetIndex });
          toast('已插入新的中段片段');
        } else {
          if (Number(context.index) < targetIndex) targetIndex -= 1;
          post('reorderRule', { id: context.id, targetIndex });
          toast('中段片段顺序已调整');
        }
        finishDrag();
      });
    });
  }

  function bindEmptyTrackDrop(track) {
    track.addEventListener('dragover', event => {
      if (!dragContext || dragContext.kind !== 'source') return;
      event.preventDefault();
      track.querySelector('.track-empty').classList.add('drop-replace');
    });
    track.addEventListener('dragleave', () => track.querySelector('.track-empty').classList.remove('drop-replace'));
    track.addEventListener('drop', event => {
      event.preventDefault();
      if (dragContext && dragContext.kind === 'source') {
        post('insertSourceRule', { sourceId: dragContext.id, targetIndex: 0 });
        toast('已创建中段片段');
      }
      finishDrag();
    });
  }

  let pendingUiAction = null, pendingUiTimer = 0;
  function requestWorkflow(command, label, payload = {}) {
    if (state.running || pendingUiAction) return;
    clearTimeout(watermarkSaveTimer); commitWatermark(false);
    $('sourceAudio').pause(); $('previewVideo').pause();
    pendingUiAction = { jobId: Number(state.job?.id || 0), label };
    renderWorkflow();
    post(command, payload);
    clearTimeout(pendingUiTimer);
    pendingUiTimer = setTimeout(() => {
      if (!pendingUiAction) return;
      pendingUiAction = null;
      toast('尚未收到开始处理的状态，请查看运行记录后重试。', true);
      renderWorkflow();
      renderResults(true);
    }, 15000);
  }
  function initializeWorkflow() {
    $('smartDuration').innerHTML = '<option value="source">参考素材 1 时长</option><option value="audio">跟随所选原声</option><option value="fixed">自定义时长</option>';
    if (!$('sourceDurationSummary')) $('smartDurationField').insertAdjacentHTML('afterend', '<p id="sourceDurationSummary" class="source-duration-summary"></p>');
    $('durationInput').onchange = () => {
      const n = Number($('durationInput').value);
      if (!Number.isInteger(n) || n < 1 || n > 600) { toast('请填写 1–600 秒的整数时长', true); renderWorkflow(); return; }
      post('setDuration', { value: n });
    };
    $('generate').onclick = () => requestWorkflow('generate', '正在启动视频生成…');
    $('renderPreview').onclick = () => requestWorkflow('renderPreview', '正在准备预览…');
    $('smartPrepare').onclick = () => requestWorkflow('smartPrepare', '正在更换剪辑…');
    $('cancel').onclick = () => { pendingUiAction = null; clearTimeout(pendingUiTimer); post('cancel'); };
  }
  function renderWorkflow() {
    const smart = state.smart || {}, settings = state.settings || defaultSettings;
    const isSmart = settings.mode === '智能混剪', sources = state.sources || [];
    const busy = !!state.running || !!pendingUiAction;
    const missingSources = sources.filter(s => s.missing).length;
    const readySources = sources.length > 0 && sources.every(s => !s.missing && Number(s.duration) > 0);
    const count = Number(settings.count || 1);
    const durationMode = smart.durationMode || (smart.followAudio ? 'audio' : 'source');
    const input = $('durationInput');
    input.readOnly = isSmart && durationMode !== 'fixed'; input.disabled = busy;
    const awaitingSourceDuration = isSmart && durationMode === 'source' && !(Number(sources[0]?.duration) > 0);
    input.placeholder = awaitingSourceDuration ? '待读取' : '';
    if (document.activeElement !== input) input.value = awaitingSourceDuration ? '' : isSmart && durationMode !== 'fixed' ? smartTime(smart.target || sources[0]?.duration || 0) : Number(settings.durationSeconds || 15);
    if (isSmart) {
      $('smartDuration').value = durationMode;
      $('smartPrepare').hidden = !smart.ready;
      $('smartPrepare').className = 'button secondary';
      $('smartPrepare').textContent = '换一种剪法';
      $('smartPrepare').disabled = busy;
      $('smartVariant').setAttribute('aria-label', '选择剪辑方案');
      document.querySelector('.smart-variant-label').textContent = '剪辑方案';
      if (!smart.count) $('smartVariant').innerHTML = '<option>生成时自动安排</option>';
      $('smartVariant').disabled = busy || !smart.ready;
      if (!busy && !smart.ready) {
        $('smartMessage').textContent = sources.length ? '设置时长后，点击“生成视频”即可；也可以先看预览。' : '导入视频后，设置时长，即可一键生成。';
        if (/失败|没有可|缺少|冲突/.test(smart.message || '')) $('smartMessage').textContent = smart.message;
      } else if (!busy && smart.complete) $('smartMessage').textContent = state.job?.kind === 'generate' && ['completed','partial'].includes(state.job?.state) ? '上次生成已结束，结果见下方。可以调整镜头后再次生成。' : '剪辑方案已就绪，尚未导出。可先看预览，或直接生成视频。';
      $('smartMessage').title = $('smartMessage').textContent;
      const empty = $('smartSegments').querySelector('.smart-empty');
      if (empty && !smart.guidance) empty.innerHTML = '<strong>素材交给我，时长由你决定</strong><small>点击右下角“生成视频”，自动选镜头并导出；也可以先看预览</small>';
      if (busy) {
        $('smartMessage').textContent = pendingUiAction?.label || state.job?.stage || state.status || '正在处理…';
        $('smartMessage').title = $('smartMessage').textContent;
        if (empty) empty.innerHTML = '<strong>正在制作，请稍候</strong><small>下方会显示处理进度，无需再次点击生成</small>';
      }
    }
    const total = sources.reduce((n, s) => n + Number(s.duration || 0), 0);
    const lengths = sources.map(s => Number(s.duration || 0)).filter(n => n > 0);
    $('sourceDurationSummary').textContent = lengths.length ? `已导入 ${sources.length} 个素材 · 可自定义每条成片的时长` : '导入后读取素材，成片时长由你设置';
    $('sourceDurationSummary').title = `素材库累计 ${smartTime(total)} 秒，仅供选片；单个素材 ${smartTime(lengths.length ? Math.min(...lengths) : 0)}–${smartTime(lengths.length ? Math.max(...lengths) : 0)} 秒。`;
    if (isSmart) {
      const target = Number(smart.target || settings.durationSeconds || 0);
      $('generationEstimate').textContent = awaitingSourceDuration ? '导入后参考素材 1 的时长，也可以自定义秒数。' : durationMode === 'source' ? `参考素材 1：${smartTime(sources[0]?.duration)} 秒；可切换为自定义时长。` : durationMode === 'audio' ? '保留所选原声长度，画面自动适配。' : target > total && total > 0 ? `目标 ${smartTime(target)} 秒超过素材总时长；生成前将检查可用画面。` : '按你填写的秒数生成，每条视频时长相同。';
      $('generationEstimate').title = $('generationEstimate').textContent;
    }
    const knownShortage = isSmart && !!smart.coverageKnown && !smart.allowReuse && Number(smart.effectiveDuration || 0) + .01 < Number(smart.target || settings.durationSeconds || 0);
    const shortage = isSmart && (!!smart.needsReuse || knownShortage) && !busy;
    $('smartReuseSetting').checked = !!smart.allowReuse;
    $('smartReuseSetting').disabled = busy;
    $('smartReuse').hidden = !shortage || !smart.canResume || !(Number(smart.effectiveDuration) > 0);
    $('smartReuse').disabled = busy;
    $('smartAddFootage').hidden = !shortage;
    if (isSmart && smart.coverageKnown) {
      $('sourceDurationSummary').textContent = `每条成片 ${smartTime(smart.target)} 秒 · 从 ${sources.length} 个素材中选取画面`;
      $('sourceDurationSummary').title = `素材库累计 ${smartTime(total)} 秒，可供选片约 ${smartTime(smart.effectiveDuration)} 秒；具体筛选结果可在“素材检查”中查看。`;
    }
    if (shortage) {
      $('smartMessage').textContent = `有效画面约 ${smartTime(smart.effectiveDuration)} 秒，目标 ${smartTime(smart.target)} 秒。补充素材、缩短时长或允许循环。`;
      $('smartMessage').title = $('smartMessage').textContent;
      $('smartNotice').classList.add('is-warning');
      const empty = $('smartSegments').querySelector('.smart-empty');
      if (empty && !smart.guidance) empty.innerHTML = '<strong>画面不足，目标时长已保留</strong><small>可补充素材或调整右侧时长；继续使用现有素材，请选择“允许循环并继续”</small>';
      $('generationEstimate').textContent = '目标时长已保留；有效画面不足，等待你的选择。';
    } else if (isSmart && smart.allowReuse) $('generationEstimate').textContent = '已允许画面不足时循环；优先使用未播放片段。';
    else if (isSmart && !smart.coverageKnown && sources.length) $('generationEstimate').textContent += ' 生成时检查有效画面。';
    $('generationEstimate').title = $('generationEstimate').textContent;
    $('generate').textContent = busy ? '正在处理…'  : `生成 ${count} 条视频`;
    $('generate').disabled = busy || !readySources || knownShortage;
    $('generate').title = missingSources ? '先重新定位找不到的素材' : !readySources ? '导入视频并等待读取时长' : knownShortage ? '有效画面不足，请先缩短时长、补充素材或在更多设置中允许循环' : '自动安排镜头并保存视频到输出文件夹';
    $('renderPreview').textContent = busy ? '处理中…' : ['智能混剪','自定义混剪'].includes(state.settings?.mode) ? '查看预览' : '先看预览';
    $('renderPreview').disabled = busy || !readySources || knownShortage;
    $('renderPreview').title = busy ? '任务进行中' : !readySources || knownShortage ? $('generate').title : '生成并播放当前剪辑方案';
    $('cancel').style.display = state.running ? 'inline-flex' : 'none';
    const job = state.job || {}, active = pendingUiAction ? 'pending' : job.state || 'idle';
    const footer = document.querySelector('.footer-bar'); footer.dataset.jobState = active;
    const progress = $('jobProgress'), percent = Math.max(0, Math.min(100, Number(job.percent)));
    const known = !pendingUiAction && Number(job.percent) >= 0 && ['running','completed','partial'].includes(active);
    progress.classList.toggle('is-indeterminate', busy && !known);
    progress.setAttribute('aria-label', '视频处理进度');
    if (known) progress.setAttribute('aria-valuenow', String(percent)); else progress.removeAttribute('aria-valuenow');
    $('progressValue').style.width = known ? `${percent}%` : busy ? '100%' : '0%';
    $('jobPercent').textContent = known ? `${percent}%` : busy ? '处理中' : '';
    $('statusText').textContent = pendingUiAction?.label || job.stage || (sources.length ? '已读取素材，可以开始生成' : '等待导入视频');
    $('resultSummary').textContent = pendingUiAction ? '即将自动分析镜头并处理视频，请稍候。' : job.detail || (sources.length ? '先设置想要的时长和条数，再点击生成视频。' : '导入后自动读取时长，生成过程会在这里显示。');
    if (knownShortage && !busy) {
      $('statusText').textContent = '画面时长不足，请先调整';
      $('resultSummary').textContent = state.audioRhythm?.mode === 'speech' ? '完整原声已保留，请补充画面素材，或在更多设置中允许循环。' : '可使用上方建议时长、补充素材，或在更多设置中允许循环。';
    }
    $('resultSummary').title = $('resultSummary').textContent;
    if (missingSources && !busy) {
      $('statusText').textContent = `有 ${missingSources} 个素材需要重新定位`;
      $('resultSummary').textContent = '剪辑设置已保留，找到原文件后可继续生成。';
      $('resultSummary').title = $('resultSummary').textContent;
      if (isSmart) {
        $('smartMessage').textContent = '点击素材卡片上的“重新定位”，选择原视频的新位置。';
        const empty = $('smartSegments').querySelector('.smart-empty');
        if (empty) empty.innerHTML = '<strong>先找回素材，再继续剪辑</strong><small>素材顺序和设置已保留，无需重新配置</small>';
      }
    }
    $('openLatest').textContent = '播放视频'; $('openOutput').textContent = '打开文件夹';
    const needsNotice = busy || knownShortage || missingSources > 0 || ['failed', 'partial', 'cancelled'].includes(active);
    const ready = readySources && !needsNotice && !['completed'].includes(active);
    footer.classList.toggle('has-notice', needsNotice);
    footer.dataset.ready = String(ready);
    if (ready && active === 'idle') $('statusText').textContent = '已就绪';
    $('statusText').title = $('statusText').textContent;
    $('openLatest').hidden = !state.latestOutput;
    footer.classList.toggle('has-result', ['completed','partial'].includes(active) && job.kind === 'generate' && !!state.latestOutput);
    renderRhythmControls();
    renderImportGuidance();
  }

  let resultsPage = 0, resultsFilter = 'all', resultsScope = 'latest';
  let selectedResultId = '', resultsRenderKey = '', resultsRunningJob = -1, resultsCompletedJob = -1;
  let resultsReturnFocus = null, pendingResultRetry = '', resultsUiError = '';
  let reviewOpen = false, reviewTab = 'issues', reviewPage = 0, reviewRenderKey = '', pendingResultSeek = null;
  function renderPreviewInspection() { $('previewInspection').hidden = !(state.smart?.previewCheck && state.previewUrl && !state.previewDirty && previewIsRendered && $('previewVideo').getAttribute('src') === state.previewUrl); }

  function reviewReport() { return selectedResultId === '__preview' ? state.smart?.previewCheck : state.results?.inspection?.id === selectedResultId ? state.results.inspection : null; }
  function reviewMedia() { return selectedResultId === '__preview' ? { id:'__preview', name:'本次预览', duration:reviewReport()?.duration, available:!!state.previewUrl && !state.previewDirty, mediaUrl:state.previewUrl } : (state.results?.items || []).find(r => r.id === selectedResultId); }
  function openReview(item) {
    selectedResultId = item.id; reviewOpen = true; reviewTab = 'issues'; reviewPage = 0;
    if (item.id !== '__preview') post('inspectResult', { id:item.id });
    openResults();
    if (item.available && item.mediaUrl) resultPlay(item);
    else { const v = $('resultVideo'); v.pause(); v.removeAttribute('src'); v.load(); pendingResultSeek = null; }
    renderReview(true); $('reviewBack').focus();
  }
  function seekResult(time) {
    const item = reviewMedia(), video = $('resultVideo');
    if (!item?.available || !item.mediaUrl || !Number.isFinite(time)) return;
    pendingResultSeek = { url:item.mediaUrl, time:Math.max(0,time) };
    if (video.getAttribute('src') !== item.mediaUrl) { video.src = item.mediaUrl; video.load(); }
    applyResultSeek();
  }
  function applyResultSeek() {
    const v = $('resultVideo'), seek = pendingResultSeek;
    if (!seek || v.getAttribute('src') !== seek.url || v.readyState < 1 || !Number.isFinite(v.duration)) return;
    v.currentTime = Math.min(seek.time, Math.max(0,v.duration - .01)); pendingResultSeek = null;
    $('resultPlayerHint').textContent = `已定位到 ${smartTime(v.currentTime)} 秒 · ${reviewMedia()?.name || ''}`;
    v.play().catch(() => {});
  }
  function renderReview(force = false) {
    $('resultsCards').hidden = reviewOpen; $('resultReview').hidden = !reviewOpen;
    document.querySelector('.results-toolbar').hidden = reviewOpen;
    document.querySelector('.results-bottom .results-pages').hidden = reviewOpen;
    if (!reviewOpen) return;
    const report = reviewReport(), item = reviewMedia(), available = !!item?.available;
    $('reviewTitle').textContent = selectedResultId === '__preview' ? '本次预览 · 检查与取段' : `第 ${item?.number || '—'} 条 · 检查与取段`;
    $('resultPlayerTitle').textContent = selectedResultId === '__preview' ? '本次预览' : `第 ${item?.number || '—'} 条视频`;
    $('resultPlayerEmpty').hidden = available;
    if (!available) { $('resultVideo').pause(); $('resultVideo').removeAttribute('src'); pendingResultSeek = null; $('resultPlayerEmpty').textContent = selectedResultId === '__preview' ? '预览已失效，请重新生成预览' : '文件已移动或删除；仍可查看已保存的检查记录'; }
    const rows = report ? (reviewTab === 'issues' ? report.issues || [] : reviewTab === 'shots' ? report.shots || [] : []) : [];
    const size = window.innerHeight < 650 ? 2 : 4, pages = Math.max(1,Math.ceil(rows.length / size));
    reviewPage = Math.max(0,Math.min(reviewPage,pages - 1));
    $('reviewPage').textContent = `${reviewPage + 1} / ${pages}`; $('reviewPrev').disabled = reviewPage === 0; $('reviewNext').disabled = reviewPage >= pages - 1;
    document.querySelector('.review-pages').hidden = pages <= 1;
    document.querySelectorAll('[data-review-tab]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.reviewTab === reviewTab)));
    const key = JSON.stringify([report,reviewTab,reviewPage,size,available,selectedResultId]);
    if (!force && key === reviewRenderKey) return; reviewRenderKey = key;
    $('reviewSummary').textContent = !report ? selectedResultId === '__preview' ? '设置已更改，请重新生成预览后再检查。' : '正在读取检查记录…' : report.message || '查看已保存的成片取段';
    const empty = text => `<p class="review-empty">${esc(text)}</p>`;
    if (!report) { $('reviewContent').innerHTML = empty(selectedResultId === '__preview' ? '返回编辑页重新生成预览，检查结果会随之更新。' : '请稍候'); return; }
    if (reviewTab === 'comparison') {
      const c = report.comparison;
      $('reviewContent').innerHTML = `<div class="review-comparison"><strong>当前成片</strong><p>${report.shots?.length || 0} 个镜头 · ${report.sourceCount || 0} 个不同素材 · 自身重复取段 ${smartTime(report.repeatedSeconds || 0)} 秒</p>${c ? `<strong>与同批第 ${Number(c.number)} 条取段最接近</strong><p>有 ${smartTime(c.sharedSeconds)} 秒（${Number(c.percent)}%）使用了相同源取段。${c.sameOpening ? '两条视频使用相同开头。' : ''}</p><button class="button secondary" data-review-compare="${esc(c.id)}">查看第 ${Number(c.number)} 条</button>` : `<p>${selectedResultId === '__preview' ? '导出同批多条成片后，可查看它们的取段重合情况。' : '暂无可对比的同批成片；其他成片完成并保存取段后可查看。'}</p>`}<p class="field-help">按素材和时间区间比较；调换顺序仍算相同取段，不代表识别了画面内容。${report.shots?.length ? '' : '此记录未保存镜头明细。'}</p></div>`;
      return;
    }
    if (!rows.length) { $('reviewContent').innerHTML = empty(reviewTab === 'shots' ? '此记录未保存镜头取段明细。' : Number(report.version) < 2 ? '旧记录未保存声音检查与时间定位信息，可播放成片手动确认。' : '未发现连续暗画面或应有声音部分的持续静音。仍建议完整播放，确认剪辑效果。'); return; }
    $('reviewContent').innerHTML = rows.slice(reviewPage * size,(reviewPage + 1) * size).map(row => {
      const title = reviewTab === 'issues' ? row.title : `镜头 ${row.index} · ${row.name}`;
      const detail = reviewTab === 'issues' ? row.source : `原素材 ${smartTime(row.sourceStart)}–${smartTime(row.sourceEnd)} 秒${row.repeatedSeconds > .05 ? ` · 与前面镜头重复 ${smartTime(row.repeatedSeconds)} 秒` : ''}`;
      return `<article class="review-row"><div><strong title="${esc(title)}">${esc(title)}</strong><span>成片 ${smartTime(row.start)}–${smartTime(row.end)} 秒</span><p title="${esc(detail)}">${esc(detail)}</p></div><button class="button secondary" data-review-seek="${Number(row.start)}"${available ? '' : ' disabled'}>播放此处</button></article>`;
    }).join('');
  }

  function openResults() {
    closeCustomSelect(false);
    const dialog = $('resultsDialog');
    if (!dialog.open) { resultsReturnFocus = document.activeElement; dialog.showModal(); }
    renderResults(true);
  }

  function resultPlay(item) {
    if (!item?.available || !item.mediaUrl) { toast('成片已被移动或删除，请检查输出文件夹', true); return; }
    selectedResultId = item.id;
    $('previewVideo').pause(); $('sourceAudio').pause();
    const video = $('resultVideo');
    pendingResultSeek = null;
    if (video.getAttribute('src') !== item.mediaUrl) { video.src = item.mediaUrl; video.load(); }
    $('resultPlayerTitle').textContent = item.id === '__preview' ? '本次预览' : `第 ${item.number} 条视频`;
    $('resultPlayerDuration').textContent = `${smartTime(item.duration)} 秒`;
    $('resultPlayerEmpty').hidden = true;
    $('resultPlayerHint').textContent = item.name;
    $('resultPlayerHint').title = item.name;
    video.play().catch(error => { if (error.name !== 'AbortError' && video.getAttribute('src') === item.mediaUrl) $('resultPlayerHint').textContent = '点击播放器播放按钮即可查看'; });
    renderResults(true);
  }

  function bindResults() {
    $('showResults').onclick = () => { reviewOpen = false; openResults(); };
    $('previewInspection').onclick = () => openReview({ id:'__preview', name:'本次预览', available:!!state.previewUrl && !state.previewDirty, mediaUrl:state.previewUrl, duration:state.smart?.previewCheck?.duration });
    $('reviewBack').onclick = () => { reviewOpen = false; renderResults(true); };
    document.querySelectorAll('[data-review-tab]').forEach(b => b.onclick = () => { reviewTab = b.dataset.reviewTab; reviewPage = 0; renderReview(true); });
    $('reviewPrev').onclick = () => { reviewPage--; renderReview(true); };
    $('reviewNext').onclick = () => { reviewPage++; renderReview(true); };
    $('reviewContent').onclick = event => {
      const seek = event.target.closest('[data-review-seek]');
      if (seek && !seek.disabled) seekResult(Number(seek.dataset.reviewSeek));
      const compare = event.target.closest('[data-review-compare]');
      if (compare) { const item = (state.results?.items || []).find(r => r.id === compare.dataset.reviewCompare); if (item) openReview(item); }
    };
    $('resultVideo').addEventListener('loadedmetadata', applyResultSeek);
    $('closeResults').onclick = () => $('resultsDialog').close();
    $('resultsDialog').addEventListener('close', () => { $('resultVideo').pause(); if (resultsReturnFocus?.isConnected) resultsReturnFocus.focus(); });
    $('resultsScope').onchange = event => { resultsScope = event.target.value; resultsPage = 0; renderResults(true); };
    document.querySelectorAll('[data-result-filter]').forEach(b => b.onclick = () => { resultsFilter = b.dataset.resultFilter; resultsPage = 0; renderResults(true); });
    $('resultsPrev').onclick = () => { resultsPage--; renderResults(true); };
    $('resultsNext').onclick = () => { resultsPage++; renderResults(true); };
    $('resultsCards').onclick = event => {
      const button = event.target.closest('[data-result-action]');
      if (!button || button.disabled) return;
      const item = (state.results?.items || []).find(r => r.id === button.dataset.resultId);
      if (!item) return;
      resultsUiError = '';
      if (button.dataset.resultAction === 'play') resultPlay(item);
      if (button.dataset.resultAction === 'inspect') openReview(item);
      if (button.dataset.resultAction === 'folder') post('openResultFolder', { id: item.id });
      if (button.dataset.resultAction === 'retry') {
        pendingResultRetry = item.id;
        resultsFilter = 'all';
        const rows = (state.results?.items || []).filter(r => resultsScope !== 'latest' || !state.results?.batchId || r.batchId === state.results.batchId);
        resultsPage = Math.floor(Math.max(0, rows.findIndex(r => r.id === item.id)) / (window.innerWidth >= 950 && window.innerHeight >= 600 ? 4 : 2));
        requestWorkflow('retryResult', `正在重试第 ${item.number} 条视频…`, { id: item.id });
        renderResults(true);
      }
    };
    $('resultVideo').addEventListener('error', () => { if ($('resultVideo').getAttribute('src')) $('resultPlayerHint').textContent = '暂时无法播放，请通过“打开位置”检查成片文件。'; });
    window.addEventListener('resize', () => renderResults(true));
  }

  function renderResults(force = false) {
    const results = state.results || {}, all = results.items || [], job = state.job || {};
    renderPreviewInspection();
    $('showResults').textContent = ['智能混剪','自定义混剪'].includes(state.settings?.mode) ? '成片历史' : all.length ? `成片结果 ${all.length}` : '成片结果';
    $('showResults').classList.toggle('has-videos', all.some(r => r.available));
    if (state.running && job.kind === 'generate') resultsRunningJob = job.id;
    if (!pendingUiAction) pendingResultRetry = '';
    if (!state.running && resultsRunningJob === job.id && resultsCompletedJob !== job.id && ['completed','partial','failed','cancelled'].includes(job.state)) {
      resultsCompletedJob = job.id;
      if (all.length) { reviewOpen = false; resultsScope = 'latest'; resultsFilter = 'all'; resultsPage = 0; openResults(); return; }
    }
    if (!$('resultsDialog').open) return;
    renderReview(force);
    if (!results.batchId) resultsScope = 'all';
    const scope = resultsScope === 'latest' ? all.filter(r => r.batchId === results.batchId) : all;
    const items = scope.filter(r => resultsFilter === 'all' || (resultsFilter === 'completed' ? r.state === 'completed' : (['failed','cancelled'].includes(r.state) || r.qualityState === 'warning' || r.state === 'completed' && !r.available)));
    const pageSize = window.innerWidth >= 950 && window.innerHeight >= 600 ? 4 : 2;
    const pages = Math.max(1, Math.ceil(items.length / pageSize));
    resultsPage = Math.max(0, Math.min(resultsPage, pages - 1));
    const success = scope.filter(r => r.state === 'completed').length, failed = scope.filter(r => r.state === 'failed').length;
    const cancelled = scope.filter(r => r.state === 'cancelled').length, waiting = scope.filter(r => ['queued','running'].includes(r.state)).length;
    const reviewCount = scope.filter(r => r.state === 'completed' && r.qualityState === 'warning').length;
    $('resultsSummary').textContent = scope.length ? `${scope.length} 条视频 · 已完成 ${success} 条${reviewCount ? ` · 需检查 ${reviewCount} 条` : ''}${failed ? ` · 失败 ${failed} 条` : ''}${cancelled ? ` · 已取消 ${cancelled} 条` : ''}${waiting ? ` · 待完成 ${waiting} 条` : ''}${state.running && job.kind === 'generate' ? Number(job.percent) >= 0 ? ` · 进度 ${job.percent}%` : ' · 正在处理' : ''}` : '生成的视频会显示在这里';
    $('resultsScope').value = resultsScope;
    $('resultsScope').querySelector('[value="latest"]').disabled = !results.batchId;
    syncCustomSelect($('resultsScope'));
    $('resultsWarning').hidden = !(results.warning || resultsUiError); $('resultsWarning').textContent = resultsUiError || results.warning || '';
    document.querySelectorAll('[data-result-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.resultFilter === resultsFilter)));
    $('resultsPage').textContent = `${resultsPage + 1} / ${pages}`;
    $('resultsPrev').disabled = resultsPage === 0; $('resultsNext').disabled = resultsPage >= pages - 1;
    const visible = items.slice(resultsPage * pageSize, (resultsPage + 1) * pageSize);
    const key = JSON.stringify([visible, selectedResultId, !!state.running, pendingResultRetry, pageSize]);
    if (!force && key === resultsRenderKey) return;
    resultsRenderKey = key; $('resultsCards').dataset.pageSize = pageSize;
    const labels = { completed:'已完成', failed:'生成失败', cancelled:'已取消', queued:'等待生成', running:'正在生成' };
    const action = (r, type, text, disabled, cls = '') => `<button class="button ${cls}" data-result-action="${type}" data-result-id="${esc(r.id)}"${disabled ? ' disabled' : ''}>${text}</button>`;
    $('resultsCards').innerHTML = visible.length ? visible.map(r => `<article class="result-card${r.id === selectedResultId ? ' selected' : ''}" data-state="${esc(r.state)}" data-quality="${esc(r.qualityState || '')}">
      <button class="result-cover" data-result-action="play" data-result-id="${esc(r.id)}" aria-label="播放第 ${r.number} 条视频"${r.available ? '' : ' disabled'}>${r.thumbnail ? `<img src="${esc(r.thumbnail)}" alt="第 ${r.number} 条成片封面">` : `<span>${r.state === 'running' ? '处理中' : r.state === 'queued' ? '等待中' : '暂无封面'}</span>`}${r.available ? '<i>▶</i>' : ''}</button>
      <div class="result-card-copy"><div class="result-card-title"><strong>第 ${r.number} 条视频</strong><span class="result-state">${r.state === 'completed' && !r.available ? '文件不存在' : r.state === 'completed' && r.qualityState === 'warning' ? '需检查' : r.state === 'completed' && r.qualityState === 'passed' ? '检查通过' : labels[r.state] || '待处理'}</span></div><p class="result-filename" title="${esc(r.name)}">${esc(r.name)}</p><p class="result-meta">${smartTime(r.duration)} 秒 · ${esc(r.createdAt || '')}${r.attempts > 1 ? ` · 第 ${r.attempts} 次尝试` : ''}</p><p class="result-error" title="${esc(r.error || r.qualityMessage || '')}">${esc(r.error || r.qualityMessage || (r.state === 'running' ? '正在制作，可关闭此窗口继续等待' : r.state === 'queued' ? '排队中，无需重复点击生成' : '历史成片尚未自动检查'))}</p><p class="result-variations">${esc(r.variations || "")}</p><div class="result-card-actions">${r.state === 'completed' ? action(r,'play','播放',!r.available,'primary') + action(r,'inspect','检查与取段',false,'secondary') + action(r,'folder','位置',!r.available,'secondary') : r.canRetry ? action(r,'retry',pendingResultRetry === r.id ? '正在启动…' : '单独重试',!!state.running || !!pendingResultRetry,'secondary') + '<small>沿用原设置</small>' : '<small>生成进度见页面底部</small>'}</div></div>
    </article>`).join('') : `<div class="results-empty"><strong>${all.length ? '没有符合条件的视频' : '还没有生成记录'}</strong><span>${all.length ? '切换筛选或查看范围' : '完成生成后，可以在这里播放和管理成片'}</span></div>`;
  }

  function renderFooter() {
    const settings = state.settings || defaultSettings;
    $('statusText').textContent = state.status || '等待操作';
    $('resultSummary').textContent = state.resultSummary || '结果摘要：等待导入素材并设置规则';
    $('progressValue').style.width = `${Math.max(0, Math.min(100, Number(state.progress || 0)))}%`;
    $('outputPath').textContent = settings.outputPath || '桌面 / 千川混剪输出';
    $('pickOutput').title = `输出目录：${$('outputPath').textContent}（点击更改）`;
    $('generate').textContent = `开始生成 ${Number(settings.count || 1)} 条成片`;
    $('generate').disabled = !!state.running || !(state.sources && state.sources.length);
    $('cancel').style.display = state.running ? 'inline-flex' : 'none';
    $('previewRules').disabled = !!state.running;
    $('pickVideos').disabled = !!state.running;
    $('pickFolder').disabled = !!state.running;
    $('analyze').disabled = !!state.running;
    $('clearSources').disabled = !!state.running;
    $('openLatest').disabled = !state.latestOutput;
    ['undoTop', 'undoTimeline'].forEach(id => { $(id).disabled = !state.canUndo || !!state.running; });
    ['redoTop', 'redoTimeline'].forEach(id => { $(id).disabled = !state.canRedo || !!state.running; });
  }

  function render() {
    renderHeader();
    renderSources();
    renderRules();
    renderSettings();
    renderAudio();
    renderSequence();
    renderFooter();
    renderWatermark();
    renderMediaPreview(); renderFraming();
    document.querySelectorAll('.edit-column input,.edit-column select,.edit-column .motion-options button,.rule-panel button,.settings-panel input,.settings-panel select').forEach(node => node.disabled = !!state.running);
    $('renderPreview').disabled = !!state.running || !(state.sources || []).length;
    $('renderPreview').textContent = state.running ? '处理中…' : state.previewDirty && state.previewUrl ? '重新生成预览' : '生成预览';
    renderSmart();
    renderWorkflow();
    renderResults();
    renderVariations();
    updatePreviewControls();
    iconsIn();
    enhanceSelects();
    window.CustomRemixUI?.update(state);
  }

  function renderVariations() {
    const settings = state.settings || {}, values = settings.variations || {};
    const speech = settings.mode === '智能混剪' && (state.audioRhythm || {}).mode === 'speech';
    $('variationCount').textContent = '已自动启用';
    $('openVariations').disabled = false;
    document.querySelectorAll('[data-variation]').forEach(item => {
      const protectedItem = speech && ['trim', 'pitch'].includes(item.dataset.variation);
      item.classList.toggle('protected', protectedItem);
      item.querySelector('.variation-check').textContent = protectedItem ? '—' : '✓';
    });
    $('variationProtection').textContent = speech ? '当前为口播模式：自动保留首尾与音高，完整原声保留。' : '固定开头和已锁定的首尾镜头不裁切；静音视频不变调。';
    $('variationPreview').textContent = settings.previewVariations ? `${state.previewDirty ? '上次预览（设置已变化，需重新生成）' : '当前预览'}：${settings.previewVariations}` : '生成预览后，这里显示该条视频实际使用的参数。';
    if (!speech && !$('generationEstimate').textContent.includes('首尾微调')) $('generationEstimate').textContent += ' 首尾微调后可能略短，最多减少 0.6 秒。';
  }

  function openSourceModal(id) {
    const rule = (state.rules || []).find(item => item.id === id);
    if (!rule) return;
    editingRuleId = id;
    const multiple = rule.kind === 'Middle';
    $('sourceModalHint').textContent = multiple ? '中段画面可以同时勾选多条素材' : '开头和固定结尾只能选择一条素材';
    $('sourceChecks').innerHTML = (state.sources || []).map(source => `<label><input type="checkbox" value="${esc(source.id)}" ${rule.sourceIds && rule.sourceIds.includes(source.id) ? 'checked' : ''}>${esc(materialName(source))} · ${esc(source.fileName)}</label>`).join('');
    $('sourceChecks').querySelectorAll('input').forEach(input => input.onchange = () => {
      if (!multiple && input.checked) $('sourceChecks').querySelectorAll('input').forEach(other => { if (other !== input) other.checked = false; });
    });
    $('autoSourceLabel').style.display = rule.kind === 'Ending' ? 'flex' : 'none';
    $('autoSource').checked = !!rule.autoSource;
    $('sourceModal').classList.add('open');
    $('sourceModal').setAttribute('aria-hidden', 'false');
  }

  function closeSourceModal() {
    editingRuleId = '';
    $('sourceModal').classList.remove('open');
    $('sourceModal').setAttribute('aria-hidden', 'true');
  }

  function bind() {
    $('pickVideos').onclick = () => post('pickVideos');
    $('pickFolder').onclick = () => post('pickFolder');
    $('analyze').onclick = () => post('analyze');
    $('clearSources').onclick = () => post('clearSources');
    $('addRule').onclick = () => post('addRule');
    $('applyAll').onchange = event => post('setApplyAll', { value: event.target.checked });
    $('durationSelect').onchange = event => post('setDuration', { value: event.target.value });
    $('countInput').onchange = event => post('setCount', { value: event.target.value });
    $('rhythmSelect').onchange = event => post('setRhythm', { value: event.target.value });
    $('audioSource').onchange = event => { $('sourceAudio').pause(); auditionRequested = false; if (state.audioRhythm) state.audioRhythm.auditionReady = false; state.settings.audioSourceId = event.target.value; renderAudition(); post('setAudioSource', { value: event.target.value }); };
    $('audioScope').onchange = event => post('setAudioScope', { value: event.target.value });
    $('audioLength').onchange = event => post('setAudioLength', { value: event.target.value });
    $('audioFadeIn').onchange = event => post('setAudioFade', { field: 'in', value: event.target.value });
    $('audioFadeOut').onchange = event => post('setAudioFade', { field: 'out', value: event.target.value });
    const updateRange = () => post('setAudioRange', { start: $('audioStart').value, end: $('audioEnd').value });
    $('audioStart').onchange = updateRange;
    $('audioEnd').onchange = updateRange;
    $('previewRules').onclick = () => post('previewRules');
    $('playPreview').onclick = () => { const video = $('previewVideo'); if (video.paused) video.play().catch(() => toast('请先导入素材或生成预览')); else video.pause(); };
    $('generate').onclick = () => post('generate');
    $('cancel').onclick = () => post('cancel');
    $('pickOutput').onclick = () => post('pickOutput');
    $('changeOutput').onclick = () => post('pickOutput');
    $('openOutput').onclick = () => post('openOutput');
    $('openLatest').onclick = () => post('openLatest');
    $('showLog').onclick = () => {
      $('logContent').textContent = (state.logs || []).join('\n') || '暂无运行记录';
      $('logDrawer').classList.add('open');
    };
    $('closeLog').onclick = () => $('logDrawer').classList.remove('open');
    $('closeSourceModal').onclick = closeSourceModal;
    $('cancelSourceModal').onclick = closeSourceModal;
    $('confirmSourceModal').onclick = () => {
      const rule = (state.rules || []).find(item => item.id === editingRuleId);
      if (!rule) return closeSourceModal();
      const sourceIds = [...$('sourceChecks').querySelectorAll('input:checked')].map(input => input.value);
      post('setRuleSources', { id: editingRuleId, sourceIds, autoSource: $('autoSource').checked });
      closeSourceModal();
    };
    $('zoomOut').onclick = () => { timelineZoom = Math.max(.72, timelineZoom - .14); renderSequence(); };
    $('zoomIn').onclick = () => { timelineZoom = Math.min(1.7, timelineZoom + .14); renderSequence(); };
    const undo = () => post('undo');
    const redo = () => post('redo');
    $('undoTop').onclick = undo;
    $('undoTimeline').onclick = undo;
    $('redoTop').onclick = redo;
    $('redoTimeline').onclick = redo;
    $('saveTemplate').onclick = () => post('saveTemplate');
    window.addEventListener('resize', () => {
      clearTimeout(sequenceResizeTimer);
      sequenceResizeTimer = setTimeout(renderSequence, 80);
    });
  }

  let chosenPreviewSource = '';
  let previewIsRendered = false;
  let lastPreviewUrl = '';
  let lastOutputUrl = '';
  let watermarkSaveTimer = 0;
  let auditionContext = null;
  let auditionGain = null;
  let auditionRequested = false;
  function renderRhythmControls() {
    const rhythm = state.audioRhythm || {};
    $('audioBalance').disabled = !!state.running || !!rhythm.auditionBusy;
    $('cutModeSelect').value = rhythm.mode || (state.smart?.speech?.enabled ? 'speech' : 'normal');
    const smartMode = state.settings?.mode === '智能混剪';
    document.querySelector('.audio-cut-field').hidden = !smartMode;
    document.querySelector('.audio-source-row').classList.toggle('has-cut-mode', smartMode);
    const source = sourceById(state.settings?.audioSourceId);
    const audible = !!source?.hasAudio && !source.missing;
    [...$('cutModeSelect').options].forEach(option => { option.disabled = option.value !== 'normal' && !audible; });
    $('cutModeSelect').querySelector('[value="music"]').textContent = state.smart?.guidance?.musicRecommended && rhythm.mode !== 'speech' ? '音乐卡点 · 推荐' : '音乐卡点';
    $('cutModeSelect').disabled = !!state.running || !!pendingUiAction;
    $('cutModeSelect').title = audible ? '普通混剪按节奏切换；音乐卡点跟随节拍；口播讲解在句尾切换。' : '音乐卡点和口播讲解需先选择有原声的素材。';
    if ((state.settings || {}).mode === '智能混剪' && rhythm.mode === 'music' && !state.smart?.needsReuse) {
      const message = rhythm.message || '音乐连续播放；先选好原声，再预览或生成。';
      $('generationEstimate').textContent = message;
      $('generationEstimate').title = message;
    }
    if ((state.settings || {}).mode === '智能混剪' && state.smart?.speech?.enabled && !state.smart?.needsReuse) {
      $('generationEstimate').textContent = '完整保留讲话，在句尾或停顿处切镜头。';
      $('generationEstimate').title = $('generationEstimate').textContent;
    }
  }
  let guidanceTimer = 0, guidanceScheduledKey = '';
  function renderImportGuidance() {
    const smart = state.smart || {}, g = smart.guidance, sources = state.sources || [];
    document.body.classList.toggle('guidance-empty', !!g && state.settings?.mode === '智能混剪' && !smart.ready && !state.running && !pendingUiAction && sources.length > 0);
    if (!g || state.settings?.mode !== '智能混剪') return;
    if (g.busy) guidanceScheduledKey = '';
    if (g.status === 'idle' && g.key && !state.running && !pendingUiAction && !state.audioRhythm?.auditionBusy && guidanceScheduledKey !== g.key) {
      guidanceScheduledKey = g.key; clearTimeout(guidanceTimer);
      guidanceTimer = setTimeout(() => {
        if (state.smart?.guidance?.key === g.key && !state.running && !pendingUiAction && !state.audioRhythm?.auditionBusy) post('smartInspectSources');
        else guidanceScheduledKey = '';
      }, 400);
    }
    const empty = $('smartSegments').querySelector('.smart-empty');
    if (!empty || state.running || pendingUiAction || !sources.length || sources.some(s => s.missing)) return;
    const total = sources.reduce((sum,s) => sum + Number(s.duration || 0),0);
    const target = Number(smart.target || 0), available = Number(smart.effectiveDuration || 0), suggested = Number(g.suggestedDuration || 0);
    const checking = g.busy || g.status === 'idle', known = !!smart.coverageKnown;
    const short = known && !smart.allowReuse && target > available + .01, speech = state.audioRhythm?.mode === 'speech';
    let title = checking ? '正在检查素材，时长仍由你决定' : g.error ? '检查尚未完成，原设置已保留' : available < 1 ? '有效画面不足，请补充素材' : short ? '画面不足，可以缩短时长或补充素材' : '素材已就绪，按你的时长自动选片';
    let detail = g.error || (checking ? g.progress || '正在检查黑屏、重复画面和画面清晰度。' : g.singleVisual ? '只有一组可用画面，优先连续播放；多条成片的差异可能有限。' : g.musicRecommended ? '所选原声有稳定节拍，可以在下方选择“音乐卡点”。' : `按${g.reference || '可用素材与节奏'}，可参考 ${smartTime(suggested)} 秒；右侧时长由你决定。`);
    if (speech && !checking && !g.error) {
      detail = short ? '口播讲解保留完整原声，请补充画面素材。' : '已选择口播讲解，保留完整原声，并在句尾或停顿处切换画面。';
      if (short) title = '画面不足，请为完整口播补充素材';
    }
    const canApply = !checking && !g.error && !speech && suggested >= 1 && Math.abs(target-suggested) > .01;
    const sound = sourceById(state.settings?.audioSourceId);
    if (canApply && sound && Number(sound.duration) > suggested) detail += ` 采用建议后，所选原声将截断至 ${smartTime(suggested)} 秒。`;
    if (canApply && sound && Number(sound.duration) > 0 && Number(sound.duration) < suggested) detail += ' 原声较短，按下方“时长处理”设置补足。';
    const usable = Number(g.usableSources ?? (smart.quality || []).filter(c => c.retained || (c.ranges || []).some(r => !r.warning)).length);
    const html = `<div class="import-guidance" data-status="${checking ? 'checking' : g.error || short || available < 1 ? 'attention' : 'ready'}"><div class="guidance-heading"><span class="guidance-art" aria-hidden="true">${icons.video}</span><div><span class="guidance-eyebrow">本地选片 · 无需联网</span><strong>${esc(title)}</strong></div></div><div class="guidance-metrics"><span title="素材库累计 ${smartTime(total)} 秒，供挑选片段使用">已导入<b>${sources.length}<em>个素材</em></b></span><span title="已排除疑似黑屏、模糊和重复内容，可在素材检查中调整">可用素材<b>${known ? usable + '<em>组</em>' : '待检查'}</b></span><span>${speech ? '每条成片 · 跟随原声' : '每条成片'}<b>${target > 0 ? smartTime(target) + '<em>秒</em>' : '待设置'}</b></span></div><div class="guidance-bottom"><small title="${esc(detail)}">${esc(detail)}</small><div class="guidance-actions">${canApply ? `<button class="button primary" data-guidance="duration">${short ? '缩短至' : '采用参考'} ${smartTime(suggested)} 秒</button>` : ''}<button class="button secondary" data-guidance="add">补充素材</button>${g.error ? '<button class="button quiet" data-guidance="retry">重新检查</button>' : ''}</div></div></div>`;
    if (empty.innerHTML !== html) empty.innerHTML = html;
    $('sourceDurationSummary').textContent = known ? `每条成片 ${smartTime(target)} 秒 · 可从 ${usable} 组素材选片` : `已导入 ${sources.length} 个素材 · ${g.error ? '等待检查' : '正在检查画面'}`;
    $('sourceDurationSummary').title = `素材库累计 ${smartTime(total)} 秒；${known ? '可供选片约 ' + smartTime(available) + ' 秒。' : '待检查可用片段。'} 成片按右侧设置的时长生成。`;
  }
  const watermarkDefaults = { enabled: false, text: '', position: 'top-right', motion: 'fixed', speed: 1, opacity: .6, fontSize: 28 };

  function bindRuleRowsDrag(body) {
    body.querySelectorAll('.rule-row').forEach(row => {
      row.addEventListener('dragstart', event => {
        if (event.target.closest('input,select,button')) { event.preventDefault(); return; }
        startDrag(event, { kind: 'rule', id: row.dataset.ruleId, index: Number(row.dataset.ruleIndex) }, row);
      });
      row.addEventListener('dragend', finishDrag);
      row.addEventListener('dragover', event => {
        if (!dragContext || state.running) return;
        if (dragContext.kind === 'rule' && row.getAttribute('draggable') !== 'true') return;
        event.preventDefault(); row.classList.add(dragContext.kind === 'source' ? 'drop-replace' : 'drop-reorder');
      });
      row.addEventListener('dragleave', event => { if (!row.contains(event.relatedTarget)) row.classList.remove('drop-replace', 'drop-reorder'); });
      row.addEventListener('drop', event => {
        event.preventDefault(); const context = dragContext;
        if (context && !state.running) {
          if (context.kind === 'source') post('setRuleSources', { id: row.dataset.ruleId, sourceIds: [context.id], autoSource: false });
          else if (row.getAttribute('draggable') === 'true') post('reorderRule', { id: context.id, targetIndex: Number(row.dataset.ruleIndex) });
        }
        finishDrag();
      });
    });
  }
  function renderAudition() {
    const settings = state.settings || defaultSettings;
    const source = sourceById(settings.audioSourceId);
    const player = $('sourceAudio');
    const rhythm = state.audioRhythm || {};
    const originalUrl = source && !source.missing && source.hasAudio ? source.mediaUrl || '' : '';
    const processed = !!rhythm.balance && !!rhythm.auditionReady;
    const url = rhythm.balance ? (processed ? rhythm.auditionUrl : '') : originalUrl;
    if (player.getAttribute('src') !== url) {
      player.pause();
      if (url) player.setAttribute('src', url); else player.removeAttribute('src');
      player.load();
    }
    $('audition').disabled = !originalUrl || !!state.running || !!rhythm.auditionBusy;
    $('audioBalance').checked = !!rhythm.balance;
    $('audioBalance').disabled = !!state.running || !!rhythm.auditionBusy;
    const modeHelp = !originalUrl ? '先选择素材原声，再选音乐卡点或口播；普通混剪也支持静音。' : rhythm.mode === 'speech' ? '保留完整原声，在句尾或停顿处切换画面。' : rhythm.mode === 'music' ? '原声连续播放，跟随稳定节拍切画面；不明确时使用普通节奏。' : state.smart?.guidance?.musicRecommended ? '检测到稳定节拍，推荐音乐卡点；也可保留普通混剪。' : '普通混剪按所选节奏切换画面，所选原声连续播放。';
    const help = rhythm.auditionError || (rhythm.balance ? '音量平衡已开启 · 试听前 30 秒，成片完整处理' : state.settings?.mode === '智能混剪' ? modeHelp : '使用所选素材原声，画面顺序不影响音频');
    $('audioHelp').textContent = help; $('audioHelp').title = help;
    document.querySelector('.audio-source-row').title = help;
    $('audioSeek').disabled = !url;
    $('audioVolume').value = String(settings.audioVolume == null ? 1 : settings.audioVolume);
    const volume = processed ? 1 : Number(settings.audioVolume == null ? 1 : settings.audioVolume);
    if (auditionGain) auditionGain.gain.value = volume;
    else player.volume = Math.min(1, volume);
    updateAuditionTime();
    if (rhythm.auditionBusy) $('auditionText').textContent = '处理中…';
    if (auditionRequested && processed && !rhythm.auditionBusy) { auditionRequested = false; $('audition').click(); }
    if (rhythm.auditionError) auditionRequested = false;
  }
  function updateAuditionTime() {
    const audio = $('sourceAudio');
    const source = sourceById((state.settings || {}).audioSourceId);
    const total = Number.isFinite(audio.duration) ? audio.duration : Number(source && source.duration || 0);
    $('audioTime').textContent = `${formatDuration(audio.currentTime)} / ${formatDuration(total)}`;
    $('audioSeek').value = total > 0 ? String(Math.round(audio.currentTime / total * 1000)) : '0';
    $('auditionText').textContent = audio.paused ? '试听' : '暂停';
  }
  function setPreviewMedia(url, rendered) {
    const video = $('previewVideo');
    const changed = (video.getAttribute('src') || '') !== url;
    if (changed || previewIsRendered !== rendered) video.muted = !rendered;
    if (changed) {
      video.pause();
      // A source thumbnail must never cover a different source or rendered output.
      video.removeAttribute('poster');
      if (url) video.setAttribute('src', url); else video.removeAttribute('src');
      video.load();
    }
    previewIsRendered = rendered;
    renderPreviewInspection();
    renderFraming();
    $('previewEmpty').style.display = url ? 'none' : 'flex';
    $('previewTitle').textContent = rendered ? '成片预览' : '画面预览';
    $('previewHint').textContent = rendered
      ? state.previewDirty ? '设置已更改，请重新生成预览' : '已合成原声与水印，可直接播放'
      : url ? '素材画面与水印示意；生成预览可看完整混剪效果' : '点击生成预览，查看实际混剪效果';
  }
  function showSourcePreview(id, play = false) {
    if (play) smartRangeEnd = null;
    const source = sourceById(id);
    if (!source) return;
    if (source.missing) { setPreviewMedia('', false); $('previewHint').textContent = '找不到原视频，请在素材卡片上重新定位'; return; }
    chosenPreviewSource = id;
    const url = source.mediaUrl || '';
    const video = $('previewVideo');
    setPreviewMedia(url, false);
    video.poster = source.thumbnailDataUrl || '';
    $('sourceList').querySelectorAll('.source-card').forEach(card => card.classList.toggle('selected', card.dataset.sourceId === id));
    updateWatermarkPosition();
    renderFraming();
    if (!play) return;
    $('sourceAudio').pause();
    if (!url) { toast('此素材没有可用的本地播放地址，请重新导入', true); return; }
    video.muted = false;
    if (video.ended) video.currentTime = 0;
    // Keep play() in the click/keyboard gesture; no rendering or copying is needed.
    video.play().catch(error => {
      if (error.name === 'AbortError' || video.getAttribute('src') !== url) return;
      toast('本地原视频暂时无法播放，请检查文件是否存在及视频格式', true);
    });
  }
  function renderMediaPreview() {
    if (state.previewUrl && state.previewUrl !== lastPreviewUrl) {
      lastPreviewUrl = state.previewUrl; setPreviewMedia(state.previewUrl, true);
    } else if (state.latestOutputUrl && state.latestOutputUrl !== lastOutputUrl) {
      lastOutputUrl = state.latestOutputUrl; setPreviewMedia(state.latestOutputUrl, true);
    } else if (!previewIsRendered) {
      const source = sourceById(chosenPreviewSource) || (state.sources || [])[0];
      if (source) showSourcePreview(source.id);
      else setPreviewMedia('', false);
    } else if (state.previewDirty) $('previewHint').textContent = '设置已更改，请重新生成预览';
  }
  function renderFraming() {
    const mode = (state.settings || {}).frameMode || 'contain';
    $('frameMode').value = mode;
    const source = sourceById(chosenPreviewSource) || (state.sources || [])[0];
    const warning = source && source.embeddedBlackBars === true;
    $('frameHint').textContent = warning ? (mode === 'cover' ? '铺满会裁切边缘；素材还可能自带黑边。' : '素材可能自带黑边，画面适配不会移除片内黑边。') : mode === 'cover' ? '铺满 9:16 画面，会裁切超出边缘的部分。' : mode === 'blur' ? '保留完整主体，用模糊背景填满空白。' : '保留完整画面，空白处补黑边。';
    $('frameHint').classList.toggle('framing-warning', !!warning);
    $('previewFrame').dataset.framing = previewIsRendered ? 'rendered' : mode;
    $('previewBackdrop').hidden = previewIsRendered || mode !== 'blur' || !$('previewVideo').getAttribute('src');
    drawPreviewBackdrop();
  }
  function drawPreviewBackdrop() {
    const canvas = $('previewBackdrop'), video = $('previewVideo');
    if (!canvas || canvas.hidden) return;
    // Draw the same decoded frame behind the original video; audio still has one player.
    const width = Math.max(2, $('previewFrame').clientWidth), height = Math.max(2, $('previewFrame').clientHeight);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
    const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
    const w = video.videoWidth * scale, h = video.videoHeight * scale;
    const blur = 22 * width / 1080;
    ctx.save(); ctx.filter = `blur(${blur}px)`;
    // Extend only the backdrop past the canvas edge to avoid transparent blur fringes.
    try { ctx.drawImage(video, (width - w) / 2 - blur * 2, (height - h) / 2 - blur * 2, w + blur * 4, h + blur * 4); } catch (_) { }
    ctx.restore();
  }
  function renderWatermark() {
    const settings = Object.assign({}, watermarkDefaults, (state.settings || {}).watermark || {});
    const nodes = { watermarkText: settings.text, watermarkPosition: settings.position, watermarkSpeed: settings.speed, watermarkOpacity: settings.opacity, watermarkFontSize: settings.fontSize };
    Object.entries(nodes).forEach(([id, value]) => { if (document.activeElement !== $(id)) $(id).value = String(value); });
    $('watermarkEnabled').checked = settings.enabled;
    $('watermarkMotions').querySelectorAll('button').forEach(button => {
      const selected = button.dataset.motion === settings.motion;
      button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected));
    });
    $('watermarkEnabled').closest('.watermark-panel').classList.toggle('inactive', !settings.enabled);
    $('watermarkHint').textContent = settings.enabled && !settings.text ? '输入水印文字后，可生成预览或成片' : settings.motion === 'corner' ? '水印在所选角落范围内往返移动' : settings.motion === 'fixed' ? '水印固定显示在所选角落' : '水印保持在画面内，移动至边缘自动折返';
    updateWatermarkPosition();
  }
  function updateWatermarkPosition() {
    const w = Object.assign({}, watermarkDefaults, (state.settings || {}).watermark || {});
    const overlay = $('watermarkOverlay');
    const frame = $('previewFrame');
    overlay.hidden = previewIsRendered || !w.enabled || !w.text || !$('previewVideo').getAttribute('src');
    if (overlay.hidden) return;
    overlay.textContent = w.text;
    const width = frame.clientWidth, height = frame.clientHeight, pad = width * .025;
    overlay.style.fontSize = `${Number(w.fontSize) * width / 360}px`;
    const measured = overlay.offsetWidth;
    if (measured > width * .7) overlay.style.fontSize = `${Number(w.fontSize) * width / 360 * width * .7 / measured}px`;
    overlay.style.opacity = String(w.opacity);
    const dx = Math.max(1, width - overlay.offsetWidth - 2 * pad);
    const dy = Math.max(1, height - overlay.offsetHeight - 2 * pad);
    const right = w.position.endsWith('right'), bottom = w.position.startsWith('bottom');
    let x = right ? width - overlay.offsetWidth - pad : pad;
    let y = bottom ? height - overlay.offsetHeight - pad : pad;
    const t = $('previewVideo').currentTime || 0;
    const bounce = (range, speed) => range - Math.abs((t * speed) % (2 * range) - range);
    if (w.motion === 'horizontal' || w.motion === 'corner') x += (right ? -1 : 1) * bounce(w.motion === 'corner' ? Math.min(dx, width * .18) : dx, width * .05 * Number(w.speed));
    if (w.motion === 'vertical' || w.motion === 'corner') y += (bottom ? -1 : 1) * bounce(w.motion === 'corner' ? Math.min(dy, height * .12) : dy, width * (w.motion === 'corner' ? .035 : .05) * Number(w.speed));
    if (w.position === 'center') {
      x = (width-overlay.offsetWidth)/2; y = (height-overlay.offsetHeight)/2;
      if (w.motion === 'horizontal' || w.motion === 'corner') x += Math.sin(t*Number(w.speed)) * (w.motion === 'corner' ? Math.min(dx,width*.18) : dx)/2;
      if (w.motion === 'vertical' || w.motion === 'corner') y += Math.sin(t*Number(w.speed)) * (w.motion === 'corner' ? Math.min(dy,height*.12) : dy)/2;
    }
    overlay.style.transform = `translate(${x}px, ${y}px)`;
  }
  function commitWatermark(delayed) {
    clearTimeout(watermarkSaveTimer);
    const active = $('watermarkMotions').querySelector('.active');
    const values = {
      enabled: $('watermarkEnabled').checked, text: $('watermarkText').value,
      position: $('watermarkPosition').value, motion: active ? active.dataset.motion : 'fixed',
      speed: Number($('watermarkSpeed').value), opacity: Number($('watermarkOpacity').value),
      fontSize: Math.max(12, Math.min(64, Number($('watermarkFontSize').value) || 28))
    };
    state.settings = Object.assign({}, defaultSettings, state.settings, { watermark: values });
    state.previewDirty = true;
    if (previewIsRendered) {
      const source = sourceById(chosenPreviewSource) || (state.sources || [])[0];
      if (source) showSourcePreview(source.id);
    }
    renderWatermark();
    const save = () => post('setWatermark', values);
    if (delayed) watermarkSaveTimer = setTimeout(save, 350); else save();
  }
  function bindEnhancements() {
    bindPreviewControls();
    $('frameMode').onchange = event => {
      state.settings = Object.assign({}, defaultSettings, state.settings, { frameMode: event.target.value });
      state.previewDirty = true;
      if (previewIsRendered) {
        const source = sourceById(chosenPreviewSource) || (state.sources || [])[0];
        if (source) showSourcePreview(source.id);
      }
      renderFraming();
      post('setFrameMode', { value: event.target.value });
    };
    ['loadeddata', 'seeked', 'pause', 'resize'].forEach(event => $('previewVideo').addEventListener(event, drawPreviewBackdrop));
    window.addEventListener('resize', drawPreviewBackdrop);
    $('audition').onclick = async () => {
      const audio = $('sourceAudio');
      if (!audio.paused) { audio.pause(); return; }
      $('previewVideo').pause();
      const rhythm = state.audioRhythm || {};
      if (rhythm.balance && !rhythm.auditionReady) {
        auditionRequested = true; state.audioRhythm = {...rhythm, auditionBusy: true, auditionError: ''};
        renderAudition(); post('prepareAudioAudition'); return;
      }
      try {
        if (!auditionContext && window.AudioContext) {
          auditionContext = new AudioContext(); auditionGain = auditionContext.createGain();
          auditionContext.createMediaElementSource(audio).connect(auditionGain); auditionGain.connect(auditionContext.destination);
        }
        if (auditionContext) { await auditionContext.resume(); auditionGain.gain.value = rhythm.balance ? 1 : Number((state.settings || {}).audioVolume == null ? 1 : state.settings.audioVolume); audio.volume = 1; }
        await audio.play();
      } catch (_) { toast('此素材暂时无法直接试听，请生成预览检查原声', true); }
    };
    ['timeupdate','loadedmetadata','play','pause','ended'].forEach(event => $('sourceAudio').addEventListener(event, updateAuditionTime));
    $('audioSeek').oninput = () => { const audio = $('sourceAudio'); if (Number.isFinite(audio.duration)) audio.currentTime = audio.duration * Number($('audioSeek').value) / 1000; };
    $('audioVolume').onchange = event => {
      $('sourceAudio').pause(); auditionRequested = false; state.settings.audioVolume = Number(event.target.value);
      if (state.audioRhythm) state.audioRhythm.auditionReady = false;
      renderAudition(); post('setAudioVolume', { value: event.target.value });
    };
    $('audioBalance').onchange = event => {
      $('sourceAudio').pause(); auditionRequested = false;
      state.audioRhythm = {...state.audioRhythm, balance: event.target.checked, auditionReady: false, auditionError: ''};
      renderAudition(); post('setAudioBalance', {value: event.target.checked});
    };
    $('openVariations').onclick = () => { renderVariations(); $('variationsDialog').showModal(); };
    $('closeVariations').onclick = $('doneVariations').onclick = () => $('variationsDialog').close();
    $('watermarkEnabled').onchange = () => commitWatermark(false);
    $('watermarkText').oninput = () => commitWatermark(true);
    ['watermarkPosition','watermarkSpeed','watermarkOpacity','watermarkFontSize'].forEach(id => $(id).onchange = () => commitWatermark(false));
    $('watermarkMotions').querySelectorAll('button').forEach(button => button.onclick = () => {
      $('watermarkMotions').querySelectorAll('button').forEach(other => other.classList.toggle('active', other === button));
      commitWatermark(false);
    });
    $('renderPreview').onclick = () => {
      clearTimeout(watermarkSaveTimer); commitWatermark(false);
      $('sourceAudio').pause(); $('previewVideo').pause();
      post('renderPreview');
    };
    const generate = $('generate').onclick;
    $('generate').onclick = () => { clearTimeout(watermarkSaveTimer); commitWatermark(false); $('sourceAudio').pause(); $('previewVideo').pause(); generate(); };
    ['play','seeked','loadedmetadata','timeupdate'].forEach(event => $('previewVideo').addEventListener(event, updateWatermarkPosition));
    $('previewVideo').addEventListener('play', () => $('sourceAudio').pause());
    $('previewVideo').addEventListener('error', () => { if ($('previewVideo').getAttribute('src')) $('previewHint').textContent = '此素材格式无法直接播放，可生成预览转换后查看'; });
    $('sequenceDetails').addEventListener('toggle', () => { if ($('sequenceDetails').open) renderSequence(); });
    window.addEventListener('resize', updateWatermarkPosition);
    window.addEventListener('resize', () => { renderSmart(); renderWorkflow(); });
    let frameId = 0;
    function animate() { updateWatermarkPosition(); drawPreviewBackdrop(); if (!$('previewVideo').paused) frameId = requestAnimationFrame(animate); }
    $('previewVideo').addEventListener('play', () => { cancelAnimationFrame(frameId); animate(); });
    window.addEventListener('beforeunload', () => { clearTimeout(watermarkSaveTimer); cancelAnimationFrame(frameId); $('sourceAudio').pause(); });
  }


  function updatePreviewControls() {
    const video = $('previewVideo');
    const available = !!video.getAttribute('src') && !video.error;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const current = video.currentTime || 0;
    const time = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
    const play = $('previewToggle');
    const label = video.paused ? '播放画面' : '暂停播放';
    play.disabled = !available;
    play.title = label; play.setAttribute('aria-label', label);
    play.innerHTML = video.paused ? icons.playFill : icons.pause;
    $('previewTime').textContent = `${time(current)} / ${time(duration)}`;
    $('previewSeek').disabled = !available || !duration;
    $('previewSeek').value = duration ? String(Math.round(current / duration * 1000)) : '0';
    $('previewSeek').setAttribute('aria-valuetext', `${time(current)}，共 ${time(duration)}`);
    const mute = $('previewMute');
    mute.disabled = !available;
    mute.setAttribute('aria-pressed', String(video.muted));
    mute.setAttribute('aria-label', video.muted ? '开启声音' : '静音');
    mute.title = video.muted ? '开启声音' : '静音';
    $('previewFullscreen').disabled = !available || !document.fullscreenEnabled;
    $('previewFullscreen').setAttribute('aria-label', document.fullscreenElement ? '退出全屏' : '全屏播放');
  }

  function bindPreviewControls() {
    const video = $('previewVideo');
    $('previewToggle').onclick = () => {
      if (!video.paused) { video.pause(); return; }
      if (video.ended) video.currentTime = 0;
      video.play().catch(() => toast('暂时无法播放，请生成预览后重试', true));
    };
    $('previewSeek').oninput = () => {
      if (!Number.isFinite(video.duration) || !video.duration) return;
      smartRangeEnd = null;
      video.currentTime = video.duration * Number($('previewSeek').value) / 1000;
      updatePreviewControls();
    };
    $('previewMute').onclick = () => { video.muted = !video.muted; };
    $('previewFullscreen').onclick = async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await $('previewPlayer').requestFullscreen();
      } catch (_) { toast('当前窗口暂不支持全屏播放'); }
    };
    ['loadedmetadata', 'durationchange', 'timeupdate', 'play', 'pause', 'ended', 'emptied', 'volumechange', 'error'].forEach(event => video.addEventListener(event, updatePreviewControls));
    document.addEventListener('fullscreenchange', () => {
      updatePreviewControls(); updateWatermarkPosition(); drawPreviewBackdrop();
    });
    updatePreviewControls();
  }


  let smartPage = 0, qualityPage = 0, smartRangeEnd = null, speechPage = 0, speechRenderKey = '', speechAudioEnd = null, speechAudioTimer = null;
  function initializeSmartUI() {
    const panel = document.querySelector('.rule-panel');
    panel.insertAdjacentHTML('beforeend', `<div id="smartEditor" hidden>
      <div class="smart-tools"><label class="smart-variant-label" for="smartVariant">查看成片</label><select id="smartVariant" aria-label="选择要查看的成片"></select><button id="smartPrepare" class="button primary">自动搭配画面</button><button id="smartQuality" class="button quiet">素材检查</button><details id="smartMore" class="smart-more"><summary>更多设置</summary><div class="smart-more-menu"><button id="smartSpeechOpen" class="button quiet">查看识别文字</button><button id="smartUnlockAll" class="button quiet">取消全部固定</button><label class="check-label"><input id="smartReuseSetting" type="checkbox">画面不足时允许循环</label><p>优先使用未播放片段；只在不足时循环。</p></div></details></div>
      <div class="smart-notice" id="smartNotice"><p id="smartMessage" role="status"></p><button id="smartUseAvailable" class="button secondary" hidden></button><button id="smartReuse" class="button secondary" hidden>允许循环并继续</button><button id="smartAddFootage" class="button secondary" hidden>补充素材</button></div>
      <div class="smart-list-head" id="smartListHead"><span>镜头</span><span>画面来源 · 点击播放</span><span>截取时间</span><span>调整画面</span></div>
      <div class="smart-segments" id="smartSegments" aria-label="当前成片的镜头顺序"></div>
      <div class="smart-bottom"><label class="check-label"><input id="smartOpening" type="checkbox">每条使用相同开头</label><div class="smart-pager"><button id="smartPrev" aria-label="上一页镜头">‹</button><span id="smartPage"></span><button id="smartNext" aria-label="下一页镜头">›</button></div></div>
    </div>`);
    document.querySelector('.settings-panel h2').insertAdjacentHTML('afterend', `<label id="smartDurationField" class="smart-duration" hidden><span>时长方式</span><select id="smartDuration"><option value="fixed">固定成片长度</option><option value="audio">跟随所选原声长度</option></select></label>`);
    document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="smartQualityModal" aria-hidden="true"><section class="modal smart-quality-modal" role="dialog" aria-modal="true" aria-labelledby="smartQualityTitle"><div class="modal-head"><h3 id="smartQualityTitle">素材检查</h3><button id="smartQualityClose" aria-label="关闭素材检查">×</button></div><p class="field-help">黑屏检测与每秒抽样清晰度检查仅作辅助。勾选后保留该素材的全部片段；原文件不会被修改。重复文件按内容校验。</p><div id="smartQualityRows"></div><div class="smart-quality-footer"><span id="smartQualityPage"></span><button id="qualityPrev" class="button secondary">上一页</button><button id="qualityNext" class="button secondary">下一页</button></div></section></div>`);
    $('smartPrepare').onclick = () => { smartPage = 0; post('smartPrepare'); };
    $('smartUseAvailable').onclick = () => {
      const smart = state.smart || {};
      if (state.running || !smart.ready || !smart.count) return;
      post('setCount', { value: smart.count });
      toast(`已改为 ${smart.count} 条，可以预览或生成视频`);
    };
    $('smartReuse').onclick = () => requestWorkflow('smartAllowReuse', '正在继续制作…', {value:true,resume:true});
    $('smartReuseSetting').onchange = e => post('smartAllowReuse', {value:e.target.checked});
    $('smartAddFootage').onclick = () => post('pickVideos');
    $('smartSegments').addEventListener('click', e => {
      const action = e.target.closest('[data-guidance]')?.dataset.guidance;
      if (!action || state.running || pendingUiAction) return;
      if (action === 'add') post('pickVideos');
      if (action === 'retry') post('smartInspectSources', {retry:true});
      if (action === 'duration') post('smartApplySuggestedDuration');
    });
    $('smartMore').querySelector('.smart-more-menu').appendChild($('smartOpening').closest('label'));
    $('smartMore').addEventListener('keydown' , e => { if (e.key === 'Escape') { $('smartMore').open = false; $('smartMore').querySelector('summary').focus(); } });
    document.addEventListener('click', e => { if (!$('smartMore').contains(e.target)) $('smartMore').open = false; });
    initializeSpeechUI();
    $('smartVariant').onchange = e => { smartPage = 0; post('smartSelect', { index: Number(e.target.value) }); };
    $('smartDuration').onchange = e => post('smartDuration', { value: e.target.value });
    $('smartOpening').onchange = e => post('smartOpening', { value: e.target.checked });
    $('smartUnlockAll').onclick = () => { $('smartMore').open = false; post('smartUnlockAll'); };
    $('smartPrev').onclick = () => { smartPage--; renderSmart(); };
    $('smartNext').onclick = () => { smartPage++; renderSmart(); };
    $('smartQuality').onclick = () => { qualityPage = 0; renderSmartQuality(); $('smartQualityModal').classList.add('open'); $('smartQualityModal').setAttribute('aria-hidden', 'false'); $('smartQualityClose').focus(); };
    const closeQuality = () => { $('smartQualityModal').classList.remove('open'); $('smartQualityModal').setAttribute('aria-hidden', 'true'); $('smartQuality').focus(); };
    $('smartQualityClose').onclick = closeQuality;
    $('smartQualityModal').addEventListener('keydown', e => {
      if (e.key === 'Escape') closeQuality();
      if (e.key === 'Tab') { const items = [...$('smartQualityModal').querySelectorAll('button:not(:disabled),input:not(:disabled)')]; if (!items.length) return; const i = items.indexOf(document.activeElement); if (e.shiftKey && i === 0) { e.preventDefault(); items.at(-1).focus(); } else if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus(); } }
    });
    $('qualityPrev').onclick = () => { qualityPage--; renderSmartQuality(); };
    $('qualityNext').onclick = () => { qualityPage++; renderSmartQuality(); };
    $('previewVideo').addEventListener('timeupdate', () => { if (smartRangeEnd != null && $('previewVideo').currentTime >= smartRangeEnd) { $('previewVideo').pause(); smartRangeEnd = null; } });
  }
  function smartTime(value) { return Number(value || 0).toFixed(1).replace(/\.0$/, ''); }
  function playSmartSegment(segment) {
    smartRangeEnd = null;
    showSourcePreview(segment.sourceId, false);
    const video = $('previewVideo'), source = sourceById(segment.sourceId);
    if (!source) return;
    const expected = video.getAttribute('src');
    const start = () => { if (video.getAttribute('src') !== expected) return; video.currentTime = Number(segment.start); smartRangeEnd = Number(segment.end); video.muted = false; video.play().catch(() => toast('请点击播放器播放片段')); };
    if (video.readyState >= 1) start(); else video.addEventListener('loadedmetadata', start, { once: true });
    $('previewHint').textContent = `原素材片段 ${smartTime(segment.start)}–${smartTime(segment.end)} 秒；生成预览可看完整成片效果`;
  }
  function renderSmartQuality() {
    const rows = (state.smart?.quality || []).flatMap(c => (c.ranges || []).map(r => ({ ...r, id: c.id, label: c.label, retained: c.retained })));
    const pages = Math.max(1, Math.ceil(rows.length / 5)); qualityPage = Math.max(0, Math.min(qualityPage, pages - 1));
    $('smartQualityRows').innerHTML = rows.slice(qualityPage * 5, qualityPage * 5 + 5).map(r => `<div class="smart-quality-row"><div><strong>${esc(r.label)}</strong><span>${smartTime(r.start)}–${smartTime(r.end)} 秒 · ${esc(r.warning || '可用片段')}</span></div>${r.warning ? `<label><input type="checkbox" data-retain="${esc(r.id)}" ${r.retained ? 'checked' : ''} ${state.running ? 'disabled' : ''}>保留此素材</label>` : '<span class="smart-pass">通过</span>'}</div>`).join('') || '<p class="smart-empty">分析后显示场景和筛选结果</p>';
    $('smartQualityRows').querySelectorAll('[data-retain]').forEach(el => el.onchange = () => post('smartRetain', { id: el.dataset.retain, value: el.checked }));
    $('smartQualityPage').textContent = `${qualityPage + 1} / ${pages}`;
    $('qualityPrev').disabled = qualityPage === 0; $('qualityNext').disabled = qualityPage >= pages - 1;
  }
  function renderSmart() {
    const enabled = state.settings?.mode === '智能混剪', smart = state.smart || {}, segments = smart.segments || [];
    document.body.classList.toggle('smart-mode', enabled);
    $('smartEditor').hidden = !enabled; $('smartDurationField').hidden = !enabled;
    $('smartLockHint').hidden = !enabled || !segments.length;
    $('smartLockHint').textContent = smart.lockedCount > 0 ? `已固定 ${smart.lockedCount} 个镜头，换剪法时保留` : '可固定喜欢的画面，再更换其他镜头';
    document.querySelector('.rule-table-wrap').hidden = enabled; document.querySelector('.rule-toolbar').hidden = enabled;
    if (!enabled) return;
    const pager = $('smartPage').closest('.smart-bottom');
    pager.hidden = segments.length <= 4;
    const availableHeight = $('smartSegments').clientHeight;
    const rowHeight = innerHeight <= 780 ? 44 : innerHeight <= 920 ? 51 : 52;
    let pageSize = availableHeight > 0 ? Math.max(1, Math.min(4, Math.floor(availableHeight / rowHeight))) : 3;
    if (segments.length > pageSize && pager.hidden) {
      pager.hidden = false;
      pageSize = Math.max(1, Math.min(4, Math.floor($('smartSegments').clientHeight / rowHeight)));
    }
    const pages = Math.max(1, Math.ceil(segments.length / pageSize)); smartPage = Math.max(0, Math.min(smartPage, pages - 1));
    const visibleSegments = segments.slice(smartPage * pageSize, smartPage * pageSize + pageSize);
    $('smartSegments').style.setProperty('--smart-rows', Math.max(1, visibleSegments.length));
    const requestedCount = Number(state.settings?.count || 1), shortfall = !!smart.ready && smart.count > 0 && smart.count < requestedCount;
    let message = smart.message || '导入视频后，点击“自动搭配画面”，先看效果再生成。';
    if (!state.sources?.length || message === '先分析素材，生成可查看、可锁定的剪辑方案。') message = '导入视频后，点击“自动搭配画面”，先看效果再生成。';
    message = message.replace('重新分析并编排', '重新搭配画面').replace('查看筛选结果', '打开“素材检查”').replace('锁定片段', '固定画面').replace('解锁后重排', '取消固定后重新搭配');
    if (!state.running && smart.ready) message = shortfall
      ? `计划生成 ${requestedCount} 条，目前可搭配 ${smart.count} 条。可减少条数，或补充不同画面。`
      : `已搭配 ${smart.count} 条成片，可切换查看。满意后点击右侧预览，再开始生成。`;
    $('smartMessage').textContent = message;
    $('smartMessage').title = message;
    $('smartNotice').classList.toggle('is-warning', shortfall);
    $('smartUseAvailable').hidden = !shortfall;
    $('smartUseAvailable').disabled = !!state.running;
    $('smartUseAvailable').textContent = `改为 ${smart.count || 0} 条`;
    $('smartListHead').hidden = !segments.length;
    const segmentHtml = visibleSegments.map(s => {
      const source = sourceById(s.sourceId), name = source ? materialName(source) : '素材', fileName = source?.fileName || s.label || '未命名视频';
      return `<div class="smart-segment"><span class="rule-index ${s.index === 0 ? 'opening' : 'middle'}">${s.index + 1}</span><button class="smart-source" data-smart-play="${s.index}" aria-label="播放第 ${s.index + 1} 个镜头：${esc(name)}，${smartTime(s.start)} 到 ${smartTime(s.end)} 秒" title="${esc(fileName)}"><span class="smart-thumb">${source?.thumbnailDataUrl ? thumbnailMarkup(source) : icons.video}<i>${icons.playFill}</i></span><span class="smart-source-copy"><strong>${esc(name)}</strong><span>${esc(s.reason || fileName)}</span></span></button><div class="smart-timing"><strong>${smartTime(s.start)}–${smartTime(s.end)} 秒</strong><span>使用 ${smartTime(s.duration)} 秒</span></div><div class="smart-row-actions"><button class="smart-lock${s.locked ? ' active' : ''}" data-smart-lock="${s.index}" aria-label="${s.locked ? '取消固定' : '固定'}第 ${s.index + 1} 个镜头" aria-pressed="${!!s.locked}" title="固定后，重新搭配时保留这个画面" ${state.running ? 'disabled' : ''}>${s.locked ? '已固定' : '固定画面'}</button><button class="smart-replace" data-smart-replace="${s.index}" aria-label="更换第 ${s.index + 1} 个镜头画面" ${s.locked || state.running ? 'disabled' : ''}>换画面</button></div></div>`;
    }).join('') || '<div class="smart-empty">让素材自动组成一条视频<small>点击“自动搭配画面”，再逐个查看、固定或更换镜头</small></div>';
    if (visibleSegments.length || !$('smartSegments').querySelector('.smart-empty')) $('smartSegments').innerHTML = segmentHtml;
    $('smartSegments').querySelectorAll('[data-smart-play]').forEach(el => el.onclick = () => playSmartSegment(segments[Number(el.dataset.smartPlay)]));
    $('smartSegments').querySelectorAll('[data-smart-lock]').forEach(el => el.onclick = () => post('smartLock', { index: Number(el.dataset.smartLock) }));
    $('smartSegments').querySelectorAll('[data-smart-replace]').forEach(el => el.onclick = () => post('smartReplace', { index: Number(el.dataset.smartReplace) }));
    $('smartOpening').checked = smart.fixedOpening !== false;
    $('smartPrepare').textContent = state.running ? '正在搭配…' : smart.ready || smart.count ? '重新搭配画面' : '自动搭配画面';
    $('smartPrepare').disabled = !!state.running || !state.sources?.length;
    $('smartUnlockAll').disabled = !!state.running || !smart.lockedCount;
    selectOptions('smartVariant', Array.from({ length: smart.count || 0 }, (_, i) => i), smart.selected || 0, i => i, i => `第 ${i + 1} 条 · 共 ${smart.count} 条`);
    if (!smart.count) $('smartVariant').innerHTML = '<option>等待搭配</option>';
    $('smartVariant').disabled = !!state.running || !smart.ready;
    $('smartDuration').value = smart.followAudio ? 'audio' : 'fixed';
    $('smartPrev').disabled = !!state.running || smartPage === 0; $('smartNext').disabled = !!state.running || smartPage >= pages - 1;
    $('smartPage').textContent = `${smartPage + 1} / ${pages}`;
    $('smartPage').parentElement.hidden = pages === 1;
    $('smartPage').closest('.smart-bottom').hidden = pages === 1;
    $('overviewMeta').textContent = smart.ready ? `${segments.length} 个镜头 · ${smartTime(smart.target)} 秒` : '自动选片 · 搭配画面';
    $('generationEstimate').textContent = smart.audioHint || '所选原声独立于画面顺序';
    $('generationEstimate').title = $('generationEstimate').textContent;
    $('durationSelect').disabled = !!state.running || !!smart.followAudio;
    if (smart.followAudio && smart.ready) selectOptions('durationSelect', [`${smartTime(smart.target)} 秒`], `${smartTime(smart.target)} 秒`);
    $('generate').disabled = !!state.running || !smart.complete;
    $('generate').title = shortfall ? `当前仅搭配出 ${smart.count} 条，请减少生成条数或补充素材后重新搭配` : '';
    if (shortfall && !state.running) $('generate').innerHTML = `${icons.play}<span>请先调整生成条数</span>`;
    $('renderPreview').disabled = !!state.running || !smart.ready;
    if (smart.ready && !state.running) $('renderPreview').textContent = `预览第 ${(smart.selected || 0) + 1} 条成片`;
    if ($('smartQualityModal').classList.contains('open')) renderSmartQuality();
    const speech = smart.speech || {};
    const rhythm = state.audioRhythm || {};
    const cutMode = rhythm.mode || (speech.enabled ? 'speech' : 'normal');
    $('cutModeSelect').value = cutMode;
    $('cutModeSelect').disabled = !!state.running;
    $('smartSpeechOpen').disabled = !!state.running || !speech.ready || !speech.enabled;
    $('smartSpeechOpen').textContent = speech.ready ? `查看识别文字（${speech.sentences?.length || 0} 句）` : '查看识别文字';
    $('smartDuration').disabled = !!state.running || !!speech.enabled;
    $('rhythmSelect').disabled = !!state.running || !!speech.enabled;
    $('rhythmSelect').title = speech.enabled ? '按口播分句时，镜头长度由每句原声决定' : '';
    if (speech.enabled) {
      selectOptions('rhythmSelect', ['按句切换'], '按句切换');
      selectOptions('audioScope', ['整条成片'], '整条成片');
      selectOptions('audioLength', ['原声完整播放'], '原声完整播放');
      $('audioScope').disabled = true; $('audioLength').disabled = true;
      $('rangeField').classList.add('is-hidden'); $('audioFields').classList.remove('has-range');
      $('generationEstimate').textContent = '原声连续播放，在句尾切换画面。切点可在“更多设置”中调整。';
      $('generationEstimate').title = $('generationEstimate').textContent;
    }
    if (cutMode === 'music') {
      selectOptions('audioScope', ['整条成片'], '整条成片'); $('audioScope').disabled = true;
      $('rangeField').classList.add('is-hidden'); $('audioFields').classList.remove('has-range');
      $('generationEstimate').textContent = rhythm.message || '使用所选原声卡点，镜头至少 0.8 秒；节拍不明显时使用普通节奏。';
      $('generationEstimate').title = $('generationEstimate').textContent;
    }
    if ($('speechModal').classList.contains('open')) renderSpeechModal();
  }

  function initializeSpeechUI() {
    document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="speechModal" aria-hidden="true"><section class="modal speech-modal" role="dialog" aria-modal="true" aria-labelledby="speechTitle"><div class="modal-head"><h3 id="speechTitle">识别文字与画面切换</h3><button id="speechClose" aria-label="关闭识别文字">×</button></div><p class="field-help">可修改识别文字和每句结束时间。画面在句尾切换，原声连续播放；修改文字不会改变声音。保存后需重新搭配画面，已固定的画面会取消固定。</p><div id="speechRows"></div><div class="speech-footer"><button id="speechReset" class="button quiet">重新识别</button><span id="speechPage"></span><button id="speechPrev" class="button secondary">上一页</button><button id="speechNext" class="button secondary">下一页</button></div><audio id="sentenceAudio" preload="metadata"></audio></section></div>`);
    $('cutModeSelect').onchange = e => {
      post('setCutMode', {value: e.target.value});
      $('sourceAudio').pause();
    };
    $('smartSpeechOpen').onclick = () => { $('smartMore').open = false; speechPage = 0; speechRenderKey = ''; renderSpeechModal(); $('speechModal').classList.add('open'); $('speechModal').setAttribute('aria-hidden', 'false'); $('speechClose').focus(); };
    const close = () => { $('sentenceAudio').pause(); speechAudioEnd = null; $('speechModal').classList.remove('open'); $('speechModal').setAttribute('aria-hidden', 'true'); $('smartMore').querySelector('summary').focus(); };
    $('speechClose').onclick = close;
    $('speechModal').addEventListener('keydown', e => {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') { const items = [...$('speechModal').querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled)')]; const index = items.indexOf(document.activeElement); if (e.shiftKey && index === 0) { e.preventDefault(); items.at(-1)?.focus(); } else if (!e.shiftKey && index === items.length - 1) { e.preventDefault(); items[0]?.focus(); } }
    });
    $('speechPrev').onclick = () => { speechPage--; speechRenderKey = ''; renderSpeechModal(); };
    $('speechNext').onclick = () => { speechPage++; speechRenderKey = ''; renderSpeechModal(); };
    $('speechReset').onclick = () => { $('sentenceAudio').pause(); post('smartSpeechReset'); };
    const checkEnd = () => { const audio = $('sentenceAudio'); if (speechAudioEnd != null && audio.currentTime >= speechAudioEnd) { const end = speechAudioEnd; speechAudioEnd = null; audio.pause(); audio.currentTime = end; } };
    $('sentenceAudio').addEventListener('timeupdate', checkEnd);
    $('sentenceAudio').addEventListener('playing', () => { clearInterval(speechAudioTimer); speechAudioTimer = setInterval(checkEnd, 25); });
    $('sentenceAudio').addEventListener('pause', () => { clearInterval(speechAudioTimer); speechAudioTimer = null; });
    window.addEventListener('beforeunload', () => $('sentenceAudio').pause());
  }
  function renderSpeechModal() {
    const speech = state.smart?.speech || {}, rows = speech.sentences || [], pages = Math.max(1, Math.ceil(rows.length / 3));
    speechPage = Math.max(0, Math.min(speechPage, pages - 1));
    const key = JSON.stringify([speech.sourceId, speech.revision, speechPage, rows]);
    if (key !== speechRenderKey) {
      speechRenderKey = key;
      $('speechRows').innerHTML = rows.slice(speechPage * 3, speechPage * 3 + 3).map(row => `<div class="speech-row" data-sentence="${row.index}"><div class="speech-row-head"><strong>第 ${row.index + 1} 句</strong><span>${Number(row.start).toFixed(2)}–${Number(row.end).toFixed(2)} 秒</span><button class="button quiet" data-speech-action="listen">试听这句</button></div><textarea class="speech-text" aria-label="第 ${row.index + 1} 句文字" maxlength="500" rows="2">${esc(row.text)}</textarea><div class="speech-edit"><label>句尾 <input class="speech-end" type="number" step="0.01" min="${Number(row.start) + 0.3}" value="${Number(row.end).toFixed(3)}" aria-label="第 ${row.index + 1} 句句尾时间" ${row.index === rows.length - 1 ? 'disabled' : ''}> 秒</label><button class="button secondary" data-speech-action="save">保存</button><button class="button quiet" data-speech-action="merge" ${row.index === rows.length - 1 ? 'disabled' : ''}>合并下句</button><label class="speech-split-label">拆分点 <input class="speech-split" type="number" step="0.01" value="${((row.start + row.end) / 2).toFixed(2)}" aria-label="第 ${row.index + 1} 句拆分时间"></label><button class="button quiet" data-speech-action="split">拆分</button></div></div>`).join('') || '<p class="smart-empty">请关闭此窗口并点击“分析并编排”，识别当前所选原声。</p>';
      $('speechRows').querySelectorAll('[data-speech-action]').forEach(button => button.onclick = () => {
        const container = button.closest('[data-sentence]'), index = Number(container.dataset.sentence), row = rows[index], action = button.dataset.speechAction;
        if (action === 'save') post('smartSpeechEdit', { index, text: container.querySelector('.speech-text').value, end: container.querySelector('.speech-end').value });
        else if (action === 'merge') post('smartSpeechMerge', { index });
        else if (action === 'split') post('smartSpeechSplit', { index, end: container.querySelector('.speech-split').value });
        else {
          const source = sourceById(speech.sourceId), audio = $('sentenceAudio');
          if (!source?.mediaUrl) { toast('原声播放源不可用，请重新导入素材'); return; }
          $('sourceAudio').pause(); $('previewVideo').pause(); audio.pause();
          if (audio.getAttribute('src') !== source.mediaUrl) audio.setAttribute('src', source.mediaUrl);
          const expected = source.mediaUrl;
          const play = () => { if (audio.getAttribute('src') !== expected || !$('speechModal').classList.contains('open')) return; audio.currentTime = Number(row.start); speechAudioEnd = Number(row.end); audio.play().catch(() => toast('原声暂时无法播放，请再次点击试听')); };
          if (audio.readyState >= 1) play(); else audio.addEventListener('loadedmetadata', play, { once: true });
        }
      });
    }
    $('speechPage').textContent = `${speechPage + 1} / ${pages}`;
    $('speechPrev').disabled = !!state.running || speechPage === 0;
    $('speechNext').disabled = !!state.running || speechPage >= pages - 1;
    $('speechReset').disabled = !!state.running || !speech.ready;
    $('speechRows').querySelectorAll('button,input,textarea').forEach(element => {
      const index = Number(element.closest('[data-sentence]').dataset.sentence);
      element.disabled = !!state.running || (index === rows.length - 1 && (element.classList.contains('speech-end') || element.dataset.speechAction === 'merge'));
    });
  }

  initializeSmartUI();
  window.RemixPage = {state:()=>state, escape:esc, icons:iconsIn, iconsMarkup:icons, post, showSource:id=>showSourcePreview(id,true), clock:v=>`${String(Math.floor(v/60)).padStart(2,"0")}:${String(Math.floor(v%60)).padStart(2,"0")}`};
  initializeWorkflow();
  iconsIn();
  bind();
  bindResults();
  render();
  bindEnhancements();
  initializeWorkflow();
  renderWorkflow();

  if (window.chrome && window.chrome.webview) {
    window.chrome.webview.addEventListener('message', event => {
      const message = event.data || {};
      if (message.type === 'state') {
        state = message;
        if (pendingUiAction && (Number(message.job?.id || 0) > pendingUiAction.jobId || message.job?.state === 'failed' || message.job?.state === 'needsInput')) { pendingUiAction = null; clearTimeout(pendingUiTimer); }
        render();
      } else if (message.type === 'toast') {
        if (message.error) { pendingUiAction = null; clearTimeout(pendingUiTimer); if ($('resultsDialog').open) resultsUiError = message.text; renderWorkflow(); renderResults(true); }
        toast(message.text, message.error);
      }
    });
    window.chrome.webview.postMessage({ type: 'ready' });
  }
})();

