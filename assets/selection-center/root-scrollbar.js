(() => {
  'use strict';

  const host = String(location.hostname || '').toLowerCase();
  if (host !== 'compass.jinritemai.com') return;
  if (window.__CHUANGBAO_ROOT_SCROLLBAR_V1__) return;
  Object.defineProperty(window, '__CHUANGBAO_ROOT_SCROLLBAR_V1__', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  const styleId = 'chuangbao-hide-compass-root-scrollbar-v1';
  const install = () => {
    if (!document.documentElement || document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      html,body{
        scrollbar-width:none!important;
        -ms-overflow-style:none!important;
        scrollbar-gutter:auto!important;
      }
      html::-webkit-scrollbar,body::-webkit-scrollbar{
        width:0!important;
        height:0!important;
        display:none!important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  };

  if (document.documentElement) install();
  else document.addEventListener('readystatechange', install, { once: true });
})();
