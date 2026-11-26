(() => {
  'use strict';
  const panel=document.createElement('section');
  panel.className='component-preparation';panel.hidden=true;panel.setAttribute('aria-label','组件准备');
  panel.innerHTML='<div><strong data-cp-title></strong><p data-cp-detail role="status" aria-live="polite"></p><progress max="100" value="0" aria-label="组件下载进度"></progress></div><div class="component-preparation-actions"><button type="button" data-cp-retry>重试</button><button type="button" data-cp-cancel>取消准备</button></div>';
  document.body.appendChild(panel);
  const title=panel.querySelector('[data-cp-title]'),detail=panel.querySelector('[data-cp-detail]'),bar=panel.querySelector('progress'),retry=panel.querySelector('[data-cp-retry]'),cancel=panel.querySelector('[data-cp-cancel]');
  const send=command=>window.chrome?.webview?.postMessage({type:'componentCommand',command});
  retry.onclick=()=>send('retry');cancel.onclick=()=>send('cancel');
  function render(message){
    if(message?.type!=='componentPreparation')return;
    const phase=message.phase,c=message.component||{},failed=phase==='failed';
    document.dispatchEvent(new CustomEvent('component-preparation-state',{detail:{phase}}));
    panel.hidden=['ready','cancelled'].includes(phase);
    if(panel.hidden)return;
    // Keep retry/cancel reachable when preparation was requested from a dialog.
    const container=document.querySelector('dialog[open]')||document.body;
    if(panel.parentNode!==container)container.appendChild(panel);
    const size=Number.isFinite(c.totalBytes)?(c.totalBytes/1000000).toFixed(2):null;
    const percent=Number.isFinite(c.percent)?Math.max(0,Math.min(100,c.percent)):0;
    title.textContent=failed?'组件准备未完成':`正在准备${c.name?'组件 '+c.name:'组件'}${size?' '+size+' MB':''}，进度 ${percent}%`;
    detail.textContent=failed?(message.error||c.error||'准备失败，请检查网络与磁盘空间后重试。'):phase==='verifying'?'正在校验组件，完成后自动继续。':'可以取消准备；已下载的内容会保留供下次续传。';
    bar.value=percent;bar.hidden=failed;retry.hidden=!failed;cancel.textContent=failed?'暂不准备':'取消准备';
  }
  window.chrome?.webview?.addEventListener('message',e=>render(e.data));
})();
