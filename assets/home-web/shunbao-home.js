(() => {
  'use strict';
  if (window.desktopBrand?.id !== 'shunbao' || window.top !== window || window.__shunbaoHomeInstalled) return;
  window.__shunbaoHomeInstalled = true;
  document.title = '账户概览';
  const dashboard = document.querySelector('.dashboard');
  if (dashboard) dashboard.setAttribute('aria-label', '账户概览');
  document.querySelector('.headline')?.remove();
  // Keep the displayed identity and membership countdown; the account is no longer a menu.
  const oldAccount = document.getElementById('accountMenuButton');
  if (oldAccount) {
    const account = document.createElement('div');
    account.id = oldAccount.id;
    account.className = 'account-summary shunbao-account-summary';
    while (oldAccount.firstChild) account.append(oldAccount.firstChild);
    account.querySelector('.account-chevron')?.remove();
    oldAccount.replaceWith(account);
  }
  document.getElementById('accountDropdown')?.remove();
  const actions = document.querySelector('.header-actions');
  const purchase = document.getElementById('purchaseEntryButton');
  if (actions && purchase) actions.append(purchase);

  function update() {
    // TutorialUi injects asynchronously and owns its original click handler.
    const tutorial = document.getElementById('cb-watch-tutorial');
    if (actions && tutorial && tutorial.parentElement !== actions) {
      tutorial.classList.add('purchase-entry', 'shunbao-tutorial');
      actions.append(tutorial);
    }
    document.querySelectorAll('#shopRows tr').forEach(row => {
      const cell = row.lastElementChild;
      if (!cell || cell.querySelector('.shunbao-delete')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'row-action shunbao-delete';
      button.textContent = '删除';
      button.addEventListener('click', () => {
        const key = row.dataset.key || '';
        if (key && key.length <= 80) window.chrome?.webview?.postMessage({ type: 'storeDelete', key });
      });
      cell.append(button);
    });
    document.querySelectorAll('#shopRows tr').forEach(row => {
      const button = row.querySelector('.shunbao-delete');
      if (button) button.setAttribute('aria-label', '删除店铺：' + (row.firstElementChild?.textContent || '未命名店铺'));
      const sync = row.children[row.children.length - 2]?.querySelector('.status');
      let originalStatus = '';
      try { originalStatus = JSON.parse(row.dataset.signature || '{}').syncStatus || ''; } catch {}
      if (sync && originalStatus === '消耗未返回，显示上次数据') {
        sync.title = originalStatus;
        if (sync.textContent !== '已同步') sync.textContent = '已同步';
        sync.className = 'status good';
      } else if (sync && sync.title === '消耗未返回，显示上次数据') {
        sync.removeAttribute('title');
      }
    });
  }
  update();
  // Watch replacement rows, pagination, filtering and delayed tutorial mounting.
  new MutationObserver(update).observe(document.querySelector('.dashboard'), { childList: true, subtree: true });
})();
