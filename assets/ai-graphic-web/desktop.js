// Presentation only: move retained nodes; keep existing handlers, state and confirmation flow.
(() => {
 const q=s=>document.querySelector(s), el=id=>document.getElementById(id);
 const icon=(name)=>{const i=document.createElement('img');i.src='icons/'+name+'.svg';i.alt='';i.className='desktop-icon';return i;};
 const heading=(host,text,name)=>{const h=document.createElement('h2');h.append(icon(name),document.createTextNode(text));host.prepend(h);};
 const right=document.createElement('aside');right.className='plan-right-column';
 const assistant=q('.assistant-panel');assistant.before(right);right.append(assistant);
 const structure=q('.structure-section');structure.classList.add('panel');right.append(structure);
 q('.assistant-content>h2').textContent='AI内容策划';
 q('.assistant-content>h2').prepend(icon('sparkles'));
 q('.plan-credit-heading h2').textContent='内容方案';q('.plan-credit-heading h2').prepend(icon('file-text'));
 q('.title-block h1').prepend(icon('image'));q('.panel-heading-row h2').prepend(icon('image'));
 ['syncProductsButton','parseProductButton'].forEach(id=>el(id).prepend(icon(id==='syncProductsButton'?'refresh-cw':'search')));
 q('.generation-settings-card').classList.add('panel');heading(q('.generation-settings-card'),'生成设置','settings');
 const gallery=document.createElement('section');gallery.className='generation-gallery panel';
 q('.generation-task-heading').before(gallery);heading(gallery,'图片预览','image');gallery.append(el('generationTaskGrid'));
 const upload=el('uploadWorkspace');const copy=q('.upload-copy-summary');upload.append(copy);
 const preflight=q('.upload-preflight-strip');preflight.classList.add('panel');upload.append(preflight);heading(preflight,'上传检查','file-text');
 q('.upload-target-heading h2').textContent='上传设置';q('.upload-target-heading h2').prepend(icon('settings'));
 ['.structure-heading','.upload-section-heading h2','.upload-copy-summary h2'].forEach(s=>q(s).prepend(icon('image')));
 ['planCreditEstimate','generationCreditEstimate'].forEach((id,i)=>{const notice=el(id).parentElement;const footer=el(i?'generationFooter':'contentPlanFooter');footer.insertBefore(notice,footer.lastElementChild);});
 const result=q('.result-card');result.querySelector('h2').textContent='发布结果';result.querySelector('p').id='resultDescription';
 result.querySelector('p').textContent='尚无本次上传结果';result.querySelector('.result-check').replaceWith(icon('file-text'));
 const status=document.createElement('div');status.className='result-status';status.id='resultStatus';result.insertBefore(status,el('returnToUploadButton'));
 window.graphicDesktop={render(state){
   el('resultDescription').textContent=state.upload?.inProgress?'正在上传到千川计划':'以下展示本次上传返回的状态';
   el('resultStatus').textContent=state.upload?.status || '尚无本次上传结果，请先完成图片生成与上传';
 }};
})();
