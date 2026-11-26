/* Presentation-only viewport fitting and local pagination. Never posts commands. */
(() => {
  'use strict';
  function init() {
    const main = document.querySelector('body > main');
    const header = document.querySelector('.card-shell-header');
    if (!main || !header) return;
    const stage = document.createElement('div');
    stage.className = 'card-stage';
    document.body.prepend(stage);
    stage.append(header, main);
    function fit() {
      stage.style.width = '100%';
      stage.style.height = '100%';
      stage.style.transform = 'none';
      document.documentElement.style.setProperty('--card-scale', 1);
    }
    addEventListener('resize', fit);
    fit();

    // Page through actual DOM nodes, preserving original IDs, selection and
    // handlers. Nothing is removed from the upload queue or generation state.
    const pages = new WeakMap();
    function paginate(host, selector, size, label) {
      if (!host) return;
      let info = pages.get(host);
      if (!info) {
        const nav = document.createElement('nav');
        nav.className = 'card-local-pager';
        nav.setAttribute('aria-label', label);
        nav.innerHTML = '<button type="button" data-step="-1">上一页</button><span></span><button type="button" data-step="1">下一页</button>';
        host.after(nav);
        info = { page: 0, nav };
        pages.set(host, info);
        // Only the persistent queue node has a variable page capacity. Gallery
        // nodes are replaced by existing renders; do not retain observers on them.
        if (typeof size === 'function') new ResizeObserver(() => info.draw && info.draw()).observe(host);
        nav.addEventListener('click', event => {
          const button = event.target.closest('[data-step]');
          if (!button) return;
          info.page += Number(button.dataset.step);
          info.draw();
        });
      }
      const items = Array.from(host.querySelectorAll(selector));
      function draw() {
        const capacity = typeof size === 'function' ? size(host) : size;
        const count = Math.max(1, Math.ceil(items.length / capacity));
        info.page = Math.max(0, Math.min(info.page, count - 1));
        items.forEach((item, index) => item.classList.toggle('card-page-hidden', Math.floor(index / capacity) !== info.page));
        info.nav.hidden = count <= 1;
        const text = `${info.page + 1} / ${count}`;
        if (info.nav.querySelector('span').textContent !== text) info.nav.querySelector('span').textContent = text;
        info.nav.querySelector('[data-step="-1"]').disabled = info.page === 0;
        info.nav.querySelector('[data-step="1"]').disabled = info.page === count - 1;
      }
      info.draw = draw;
      draw();
    }
    function update() {
      paginate(document.querySelector('.gallery .asset-grid'), ':scope > .asset-card', 6, '素材预览分页');
      paginate(document.getElementById('queueBody'), ':scope > .queue-row', host => Math.max(1, Math.floor(host.clientHeight / 54)), '上传队列分页');
      paginate(document.getElementById('assetGrid'), ':scope > .asset-card', 4, '上传详情图片分页');
    }
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; update(); });
    }).observe(document.body, { childList: true, subtree: true });
    update();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
