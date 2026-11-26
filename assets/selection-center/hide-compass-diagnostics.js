(() => {
  'use strict';

  // [v5.4存活标记] 证明本脚本被注入
  try { localStorage.setItem('cba_hide_alive', new Date().toISOString() + ' top=' + (window.top === window)); } catch (_e) {}
  if (window.top !== window || window.__CHUANGBAO_HIDE_COMPASS_DIAGNOSTICS_V1__) return;
  Object.defineProperty(window, '__CHUANGBAO_HIDE_COMPASS_DIAGNOSTICS_V1__', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  // OEM builds rename UI text, while protected scripts retain their original
  // branding. Match the diagnostic wording without depending on a brand name.
  const diagnosticTitle = '罗盘接口诊断';
  const overrideBadgeText = '已改写罗盘权限参数';
  const hiddenMarker = 'data-chuangbao-compass-diagnostic-hidden';

  const hideDiagnosticElement = element => {
    if (!(element instanceof HTMLElement) || element.hasAttribute(hiddenMarker)) return false;
    const content = String(element.textContent || '');
    const position = element.style.position || getComputedStyle(element).position;
    if (position !== 'fixed') return false;
    const isPanel = content.includes(diagnosticTitle) && element.querySelectorAll('button').length >= 2;
    const isOverrideBadge = content.includes(overrideBadgeText);
    if (!isPanel && !isOverrideBadge) return false;
    element.setAttribute(hiddenMarker, '1');
    element.setAttribute('aria-hidden', 'true');
    element.style.setProperty('display', 'none', 'important');
    return true;
  };

  const hideWithin = root => {
    if (!root) return;
    if (root.nodeType === Node.ELEMENT_NODE && hideDiagnosticElement(root)) return;
    if (!root.querySelectorAll) return;
    for (const element of root.querySelectorAll('div')) {
      hideDiagnosticElement(element);
    }
  };

  const install = () => {
    const root = document.documentElement;
    if (!root) return false;
    hideWithin(root);
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) hideWithin(node);
      }
    });
    observer.observe(root, { childList: true, subtree: true });
    return true;
  };

  if (!install()) {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  }
})();
