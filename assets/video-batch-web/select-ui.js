// Blue/white selectors; original select values and native change commands are preserved.
(() => {
  'use strict';
let activeCustomSelect=null,customSelectMenu=null,customSelectEventsBound=false;
const esc=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  function ensureCustomSelectMenu() {
    if (customSelectMenu) return customSelectMenu;
    customSelectMenu = document.createElement('div');
    customSelectMenu.className = 'ui-select-menu';
    customSelectMenu.id = 'videoBatchSelectMenu';
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
        event.stopPropagation();
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
    const fieldLabel = select.getAttribute('aria-label') || [...(select.labels?.[0]?.childNodes || [])].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join('').trim() || '下拉选项';
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
    if (select.disabled || !option || option.disabled) return;
    const changed = select.selectedIndex !== optionIndex;
    select.selectedIndex = optionIndex;
    syncCustomSelect(select);
    if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
    closeCustomSelect(true);
  }

  function enhanceSelects() {
    ensureCustomSelectMenu();
    document.querySelectorAll('select:not([data-ui-enhanced])').forEach(select => {
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
      trigger.id = select.id + 'Trigger';
      trigger.className = 'ui-select-trigger';
      trigger.setAttribute('aria-haspopup', 'listbox');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-controls', 'videoBatchSelectMenu');
      if (select.hasAttribute('aria-describedby')) trigger.setAttribute('aria-describedby', select.getAttribute('aria-describedby'));
      trigger.innerHTML = '<span class="ui-select-value"></span><i class="ui-select-arrow" aria-hidden="true"></i>';
      root.appendChild(trigger);
      [...select.labels].forEach(label => label.addEventListener('click', event => { if (!root.contains(event.target)) { event.preventDefault(); if (!trigger.disabled) trigger.focus(); } }));
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



  document.addEventListener('close', event => {
    if (activeCustomSelect && event.target.contains(activeCustomSelect)) closeCustomSelect(false);
  }, true);
  document.addEventListener('cancel', event => {
    if (activeCustomSelect && event.target.contains(activeCustomSelect)) {
      event.preventDefault(); closeCustomSelect(true);
    }
  }, true);
  window.VideoBatchSelectUi = { refresh: enhanceSelects };
})();
