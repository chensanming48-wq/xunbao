(() => {
  'use strict';
  if (window.desktopBrand?.id !== 'shunbao' || window.top !== window || window.__shunbaoOneCutInstalled) return;
  const actions = document.querySelector('.page-header .header-actions');
  const refresh = document.getElementById('refreshPlans');
  if (!actions || !refresh) return;
  window.__shunbaoOneCutInstalled = true;
  // Move the original button: app.js retains its listener, loading label and
  // disabled rules. A CSS icon survives the host's textContent updates.
  refresh.classList.remove('inline-plan-refresh');
  refresh.classList.add('outline-button', 'shunbao-plan-refresh');
  actions.appendChild(refresh);
})();
