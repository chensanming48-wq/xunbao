(() => {
  'use strict';
  const page = document.body.dataset.cardPage;
  const icon = name => `<img class="card-icon" src="${['upload','record'].includes(name)?'../ai-product-card-ui/':'../ai-graphic-web/icons/'}${name}.svg" alt="">`;
  const header = document.createElement('header');
  // The runtime tutorial injector recognizes topbar/header-tools. Keep its
  // button out of the workflow grid, which has no spare layout row.
  header.className = 'card-shell-header topbar';
  header.innerHTML = `<div class="card-heading"><img class="card-brand" data-brand-logo src="../branding/logo-mark.png" alt="品牌标志"><h1>AI商品卡</h1></div>
    <div class="card-header-actions header-tools"><button class="card-button primary" data-card-command="cardSync">${icon('refresh-cw')}<span data-card-sync-label>同步商品</span></button><button class="card-button" data-card-command="cardOutput">${icon('folder')}打开输出目录</button></div>
    <nav class="card-tabs" aria-label="AI商品卡页面">${[['generate','素材生成','image'],['upload','上传千川','upload'],['history','上传记录','record']].map(([key,label,asset],index)=>`<button class="card-tab${page===key?' active':''}" data-card-tab="${index}" ${page===key?'aria-current="page"':''}>${icon(asset)}${label}</button>`).join('')}</nav>`;
  document.body.prepend(header);
  const bridge = window.chrome && window.chrome.webview;
  if (bridge) bridge.addEventListener('message', event => {
    const data = event.data || {};
    if (data.type !== 'state') return;
    requestAnimationFrame(() => requestAnimationFrame(() => bridge.postMessage({type:'cardPainted'})));
    const syncing = data.cardProductSyncing === true || data.productSyncing === true;
    header.querySelector('[data-card-command="cardSync"]').disabled = syncing;
    header.querySelector('[data-card-sync-label]').textContent = syncing ? '正在同步…' : '同步商品';
  });
  header.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || (!button.hasAttribute('data-card-tab') && !button.hasAttribute('data-card-command'))) return;
    const bridge = window.chrome && window.chrome.webview;
    if (!bridge) return;
    bridge.postMessage({type:'command',command:button.hasAttribute('data-card-tab')?'cardTab':button.dataset.cardCommand,payload:button.hasAttribute('data-card-tab')?{value:Number(button.dataset.cardTab)}:{}});
  });
})();
