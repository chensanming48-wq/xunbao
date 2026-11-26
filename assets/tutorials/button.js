(() => {
  'use strict';
  if (window.top !== window || window.__cbTutorialButtonInstalled) return;
  window.__cbTutorialButtonInstalled = true;
  const button = document.createElement('button');
  button.id = 'cb-watch-tutorial';
  button.type = 'button';
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="2" y="5" width="15" height="14" rx="2"></rect><path d="m17 9 5-3v12l-5-3"></path><path d="m8 9 5 3-5 3Z"></path></svg><span>观看教程</span>';
  button.setAttribute('aria-label', '观看当前功能的视频教程');
  // Match the one-cut output-directory action on every trusted feature page.
  // Inline styles work with local pages that disallow injected style elements.
  Object.assign(button.style, { boxSizing:'border-box', display:'inline-flex', alignItems:'center', justifyContent:'center',
    height:'38px', width:'120px', minWidth:'120px', padding:'0 17px', marginLeft:'10px', border:'1px solid #79a6ff',
    borderRadius:'9px', background:'rgba(255,255,255,.92)', color:'#1765f2',
    fontFamily:'"Microsoft YaHei UI","Microsoft YaHei",sans-serif', fontSize:'14px', lineHeight:'20px',
    fontWeight:'650', whiteSpace:'nowrap', cursor:'pointer', flexShrink:'0', gap:'8px',
    boxShadow:'none', appearance:'none', transition:'background .15s ease, border-color .15s ease, transform .15s ease' });
  const icon = button.querySelector('svg');
  Object.assign(icon.style, { width:'19px', height:'19px', flexShrink:'0', fill:'none', stroke:'currentColor',
    strokeWidth:'1.8', strokeLinecap:'round', strokeLinejoin:'round', pointerEvents:'none' });
  Object.assign(button.querySelector('span').style, { font:'inherit', color:'inherit', pointerEvents:'none' });
  button.addEventListener('mouseenter', () => { button.style.background = '#f3f7ff'; button.style.borderColor = '#3e7cf4'; });
  button.addEventListener('mouseleave', () => { button.style.background = 'rgba(255,255,255,.92)'; button.style.borderColor = '#79a6ff'; button.style.transform = ''; });
  button.addEventListener('mousedown', () => { button.style.transform = 'translateY(1px)'; });
  button.addEventListener('mouseup', () => { button.style.transform = ''; });
  button.addEventListener('focus', () => { button.style.outline = '2px solid rgba(23,101,242,.34)'; button.style.outlineOffset = '2px'; });
  button.addEventListener('blur', () => { button.style.outline = ''; button.style.outlineOffset = ''; });
  button.addEventListener('click', event => {
    event.preventDefault(); event.stopPropagation();
    window.chrome?.webview?.postMessage({ type:'cb-tutorial-open' });
  });
  function mount() {
    if (button.isConnected) return;
    const old = document.getElementById('tutorialButton');
    if (old) { const label = old.querySelector('span'); if (label) label.textContent = '操作说明'; }
    let header = document.querySelector('.page-header, .topbar, .native-header, .window-header, .intro-row, header.header');
    if (!header) {
      const workflow = document.getElementById('workflow');
      if (!workflow) return;
      header = document.getElementById('cb-tutorial-workflow-row');
      if (!header) {
        header = document.createElement('div'); header.id = 'cb-tutorial-workflow-row';
        Object.assign(header.style, { display:'flex', alignItems:'center', minWidth:'0' });
        workflow.before(header); header.append(workflow);
        workflow.style.flex = '1'; workflow.style.minWidth = '0';
      }
    }
    if (header.classList.contains('native-header')) {
      header.style.position = 'relative';
      Object.assign(button.style, { position:'absolute', right:'0', top:'0' });
      const title = header.querySelector('h1');
      if (title) title.style.paddingRight = '136px';
      header.append(button);
      return;
    }
    if (header.classList.contains('window-header')) {
      header.style.gridTemplateColumns = '56px minmax(0,1fr) 0px auto auto auto';
      const reset = header.querySelector('#resetButton');
      if (reset) header.insertBefore(button, reset); else header.append(button);
      return;
    }
    const actions = header.querySelector('.header-actions, .native-header-actions, .header-tools');
    if (header.querySelector('.headline') && actions) {
      // Keep the tutorial vertically centered with the account card in normal flow.
      const tools = document.createElement('div');
      tools.className = 'home-header-tools';
      Object.assign(tools.style, { display:'flex', alignItems:'center', gap:'16px', minWidth:'0', flexShrink:'0' });
      button.style.marginLeft = '0';
      header.append(tools);
      tools.append(actions, button);
      return;
    }
    if (actions && location.hostname === 'auto-plan.chuangbao.local') actions.style.marginLeft = 'auto';
    const target = actions || header;
    // Header action rows already provide their own gap; do not double it.
    if (parseFloat(getComputedStyle(target).columnGap) > 0) button.style.marginLeft = '0';
    target.append(button);
  }
  let scheduled = false;
  new MutationObserver(() => {
    if (button.isConnected || scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; mount(); });
  }).observe(document.documentElement, { childList:true, subtree:true });
  mount();
})();
