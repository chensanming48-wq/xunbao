(() => {
  'use strict';
  const defaults={enabled:false,style:'blur',avatars:[],confidence:.6,expansion:.25,minFace:.015};
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copy=o=>JSON.parse(JSON.stringify({...defaults,...o}));
  let host=null, adapter=null, view={}, draft=null, page=0, returnFocus=null, ownPreview=false, previewSignature='', pendingPreview='', requestedToken='', context='', entryKey='';
  const modal=document.createElement('dialog');modal.className='fm-dialog';modal.setAttribute('aria-labelledby','fmTitle');
  modal.innerHTML=`<header class="fm-modal-heading"><div><h2 id="fmTitle">卡通头像设置</h2><span id="fmSubtitle">选择用于人脸遮挡的头像</span></div><button type="button" data-fm="close" class="fm-close" aria-label="关闭头像设置">×</button></header><div class="fm-body"><section class="fm-gallery-panel"><div class="fm-row"><h3>选择头像</h3><span id="fmSelected" class="fm-badge"></span><button type="button" data-fm="clear" class="fm-link">清空选择</button></div><p class="fm-hint">单选固定使用，多选自动分配。</p><div id="fmGallery" class="fm-gallery"></div><div class="fm-pagination"><button data-fm="previous" aria-label="上一页头像">‹</button><span id="fmPage"></span><button data-fm="next" aria-label="下一页头像">›</button></div><div class="fm-import-row"><button data-fm="import">导入头像</button><small>支持透明PNG</small><span class="fm-hint">多人按所选头像分配，同一跟踪人物保持一致。</span></div></section><section class="fm-preview-panel"><div class="fm-row"><h3>遮挡效果预览</h3><span class="fm-badge" id="fmRatio">9:16</span></div><div class="fm-preview-frame"><video id="fmVideo" controls playsinline preload="metadata"></video><p id="fmEmpty">选好头像后<br>预览当前素材的前5秒</p></div><div class="fm-preview-actions"><button data-fm="preview" id="fmPreview">预览5秒效果</button><label><input id="fmBoxes" type="checkbox">显示检测框</label></div><p class="fm-hint" id="fmSource"></p><p id="fmStatus" role="status" aria-live="polite"></p></section></div><details class="fm-advanced"><summary>高级设置 <span id="fmAdvancedSummary"></span></summary><div class="fm-advanced-fields"><label>检测灵敏度<input data-fm-option="confidence" type="range" min="0.4" max="0.9" step="0.05"><output id="fmConfidence"></output><small>阈值越低，越容易检出，也可能误检</small></label><label>遮挡范围外扩<input data-fm-option="expansion" type="range" min="0" max="0.6" step="0.05"><output id="fmExpansion"></output></label><label>忽略小人脸<input data-fm-option="minFace" type="number" min="0" max="20" step="0.5"><small>占画面高度的百分比；0表示全部遮挡</small></label></div></details><footer class="fm-modal-footer"><div id="fmSelectionSummary"></div><div class="fm-footer-actions"><button data-fm="close">取消</button><button data-fm="apply" class="fm-primary">应用设置</button></div></footer>`;
  document.body.appendChild(modal);
  const $=id=>document.getElementById(id);
  const avatars=()=>view.library?.avatars||[];
  let afterAvatars=null;
  function prepareAvatars(action){
    if(avatars().length&&view.library?.builtInReady!==false){action();return;}
    afterAvatars={action,context};adapter.send('facePrepareAvatars');
  }
  document.addEventListener('component-preparation-state',e=>{if(e.detail.phase==='cancelled')afterAvatars=null;});
  function signature(){return JSON.stringify([context,view.source?.id,draft,$('fmBoxes').checked]);}
  function invalidate(){previewSignature='';pendingPreview='';$('fmVideo').pause();$('fmVideo').removeAttribute('src');$('fmEmpty').hidden=false;}
  function settings(){return copy(view.options);}
  function open(style,advanced=false){
    if((style||settings().style)==='avatar'&&(!avatars().length||view.library?.builtInReady===false)){prepareAvatars(()=>open(style,advanced));return;}
    if(view.busy)return;returnFocus=document.activeElement;draft=settings();if(style)draft.style=style;draft.enabled=true;page=0;
    if(draft.style==='avatar'&&!draft.avatars.length&&avatars().length)draft.avatars=[avatars()[0].id];
    modal.classList.toggle('fm-advanced-only',advanced);
    modal.querySelector('.fm-advanced').hidden=!advanced;
    modal.querySelector('.fm-advanced').open=advanced;
    $('fmBoxes').checked=false;invalidate();renderDialog();modal.showModal();
  }
  function close(){if(ownPreview&&view.busy)adapter.send('cancel');ownPreview=false;$('fmVideo').pause();modal.close();draft=null;returnFocus?.focus();}
  function renderEntry(){
    if(!host)return;const o=settings(), picture=avatars()[0]?.thumbnail;
    const key=JSON.stringify([o,!!view.busy,view.source?.id,avatars().map(a=>[a.id,!!a.pixelThumbnail])]);if(key===entryKey)return;entryKey=key;
    const thumbs=o.avatars.slice(0,3).map(id=>avatars().find(a=>a.id===id)).filter(Boolean);
    if(adapter.moduleSwitch){
      const off=view.busy||!o.enabled;
      const reason=view.busy?'任务进行中，请稍候':!o.enabled?'请先开启人脸遮挡':!view.source?'请先添加一条可用视频':o.style==='avatar'&&!o.avatars.length?'请选择至少一个头像':'';
      host.classList.toggle('fm-module-off',!o.enabled);
      host.classList.toggle('fm-inline-open',o.enabled&&o.style==='avatar');
      host.innerHTML=`<div class="fm-entry-heading"><h3>人脸遮挡</h3><label class="sm-switch" title="${o.enabled?'关闭':'开启'}人脸遮挡"><input type="checkbox" role="switch" aria-label="人脸遮挡" data-fm-enable ${o.enabled?'checked':''} ${view.busy?'disabled':''}><span aria-hidden="true"></span></label></div><fieldset class="sm-module-body" ${off?'disabled':''}><div class="fm-styles">${[['blur','隐私遮挡'],['pixel','像素马赛克'],['avatar','卡通头像']].map(([style,label])=>`<button data-fm-style="${style}" class="fm-style ${style===o.style?'selected':''}" aria-pressed="${style===o.style}">${picture?`<img src="${style==='pixel'?(avatars()[0]?.pixelThumbnail||picture):picture}" class="fm-sample-${style}" alt="">`:''}<span>${label}</span></button>`).join('')}</div>${o.enabled&&o.style==='avatar'?`<section class="fm-inline"><div class="fm-row"><span>选择头像 · 已选 ${o.avatars.length} 个</span><button data-fm="rotateAll" class="fm-link">自动轮换全部头像</button></div><div class="fm-inline-avatars">${avatars().map(a=>`<button data-inline-avatar="${escape(a.id)}" title="${escape(a.name)}" aria-label="${escape(a.name)}" aria-pressed="${o.avatars.includes(a.id)}" class="${o.avatars.includes(a.id)?'selected':''}"><img src="${a.thumbnail}" alt=""></button>`).join('')}</div><small>可多选，同一跟踪人物保持同一头像。</small></section>`:''}<div class="fm-entry-bottom"><button data-fm="advanced" class="fm-link">高级设置</button><span title="${reason}" class="sm-action-tooltip"><button data-fm="previewEntry" title="${reason}" ${reason?'disabled':''}>预览遮挡效果</button></span></div></fieldset>`;
      return;
    }
    host.innerHTML=`<div class="fm-entry-heading"><h3>人脸遮挡</h3><label class="fm-toggle"><input type="checkbox" data-fm-enable ${o.enabled?'checked':''} ${view.busy?'disabled':''}><span></span><b>${o.enabled?'已开启':'可选'}</b></label><span class="fm-entry-help">保护画面中人物隐私</span><button class="fm-link" data-fm="advanced" ${view.busy?'disabled':''}>高级设置</button></div><div class="fm-styles">${[['blur','隐私遮挡'],['pixel','像素马赛克'],['avatar','卡通头像']].map(([style,label])=>`<button data-fm-style="${style}" class="fm-style ${o.enabled&&style===o.style?'selected':''}" aria-pressed="${o.enabled&&style===o.style}" ${view.busy?'disabled':''}>${picture?`<img src="${style==='pixel'?(avatars()[0]?.pixelThumbnail||picture):picture}" class="fm-sample-${style}" alt="">`:''}<span>${label}</span>${style==='avatar'?'<small>选择头像 ›</small>':''}</button>`).join('')}</div><div class="fm-entry-bottom">${o.enabled&&o.style==='avatar'?`<div class="fm-entry-picked">${thumbs.map(a=>`<img src="${a.thumbnail}" alt="${escape(a.name)}">`).join('')}<span>已选${o.avatars.length}个</span><button class="fm-link" data-fm="avatars" ${view.busy?'disabled':''}>更换</button></div>`:'<small>支持自动跟踪，生成前可先检查遮挡效果</small>'}<button data-fm="previewEntry" ${view.busy||!view.source||!o.enabled?'disabled':''}>预览遮挡效果</button></div>`;
  }
  function renderDialog(){
    if(!draft)return;const isAvatar=draft.style==='avatar';modal.classList.toggle('fm-no-gallery',!isAvatar);
    $('fmTitle').textContent=isAvatar?'卡通头像设置':'人脸遮挡设置';$('fmSubtitle').textContent=isAvatar?'选择用于人脸遮挡的头像':draft.style==='pixel'?'像素马赛克':'隐私遮挡';
    if(modal.classList.contains('fm-advanced-only')){$('fmTitle').textContent='人脸遮挡高级设置';$('fmSubtitle').textContent='调整检测与遮挡范围';}
    page=Math.min(page,Math.max(0,Math.ceil(avatars().length/18)-1));
    $('fmSelected').textContent=`已选${draft.avatars.length}个`;
    $('fmGallery').innerHTML=avatars().slice(page*18,page*18+18).map(a=>`<button data-avatar="${escape(a.id)}" aria-pressed="${draft.avatars.includes(a.id)}" class="fm-avatar ${draft.avatars.includes(a.id)?'selected':''}"><img src="${a.thumbnail}" alt=""><span>${escape(a.name)}</span><i aria-hidden="true">✓</i></button>`).join('')||'<p class="fm-hint">暂无可用头像，请导入透明PNG。</p>';
    $('fmPage').textContent=`${page+1} / ${Math.max(1,Math.ceil(avatars().length/18))}`;
    modal.querySelector('[data-fm=previous]').disabled=page===0;modal.querySelector('[data-fm=next]').disabled=(page+1)*18>=avatars().length;
    $('fmSelectionSummary').innerHTML=isAvatar?`<span>已选${draft.avatars.length}个头像</span>${draft.avatars.slice(0,3).map(id=>avatars().find(a=>a.id===id)).filter(Boolean).map(a=>`<img src="${a.thumbnail}" alt="${escape(a.name)}">`).join('')}`:`<span>${draft.style==='pixel'?'像素马赛克':'隐私遮挡'}</span>`;
    for(const el of modal.querySelectorAll('[data-fm-option]'))el.value=el.dataset.fmOption==='minFace'?draft.minFace*100:draft[el.dataset.fmOption];
    $('fmConfidence').textContent=draft.confidence.toFixed(2);$('fmExpansion').textContent=Math.round(draft.expansion*100)+'%';
    $('fmAdvancedSummary').textContent=`灵敏度${draft.confidence} · 外扩${Math.round(draft.expansion*100)}%`;
    updateStatus();
  }
  function updateStatus(){
    if(!draft)return;
    $('fmSource').textContent=view.source?`预览素材：${view.source.name}`:'请先在素材列表中选中视频';$('fmRatio').textContent=view.source?.ratio||'';
    const blocked=view.busy||(draft.style==='avatar'&&!draft.avatars.length);
    $('fmPreview').disabled=blocked||!view.source;modal.querySelector('[data-fm=apply]').disabled=blocked;
    modal.querySelectorAll('[data-avatar],[data-fm-option],[data-fm=import],[data-fm=clear],#fmBoxes').forEach(e=>e.disabled=!!view.busy);
    const lib=view.library||{};
    if(pendingPreview===signature()&&!view.busy&&view.library?.previewToken!==requestedToken&&view.previewUrl){
      $('fmVideo').src=view.previewUrl;$('fmEmpty').hidden=true;previewSignature=pendingPreview;pendingPreview='';ownPreview=false;
    }
    $('fmStatus').textContent=view.busy?`${lib.phase||'正在处理'} · ${Math.round((lib.progress||0)*100)}%`:lib.error||((previewSignature===signature()&&lib.stats)?(lib.reviewMessage||`检测到${lib.stats.tracks}条人脸轨迹 · 已生成遮挡预览，请复核画面`):'');
  }
  function sendPreview(){
    if(!view.source)return;invalidate();pendingPreview=signature();requestedToken=view.library?.previewToken;ownPreview=true;
    adapter.send('facePreview',{options:copy(draft),id:view.source.id,boxes:$('fmBoxes').checked});
  }
  document.addEventListener('click',event=>{
    const root=event.target.closest('.fm-dialog,.fm-entry');if(!root)return;
    if(adapter?.moduleSwitch&&root===host){
      if(view.busy||!settings().enabled)return;
      const choice=event.target.closest('[data-inline-avatar]');
      if(choice){const o=settings(),id=choice.dataset.inlineAvatar;const selected=o.avatars.includes(id)?o.avatars.filter(x=>x!==id):[...o.avatars,id];if(selected.length)adapter.send('faceSet',{options:{...o,avatars:selected}});return;}
      const style=event.target.closest('[data-fm-style]');
      if(style){const apply=()=>{const o=settings(),ids=o.avatars.length?o.avatars:avatars().slice(0,1).map(a=>a.id);adapter.send('faceSet',{options:{...o,style:style.dataset.fmStyle,avatars:ids}});};if(style.dataset.fmStyle==='avatar')prepareAvatars(apply);else apply();return;}
      if(event.target.closest('[data-fm="rotateAll"]')){const ids=avatars().map(a=>a.id);if(ids.length)adapter.send('faceSet',{options:{...settings(),avatars:ids}});return;}
    }
    const a=event.target.closest('[data-avatar]');if(a&&draft&&!view.busy){const id=a.dataset.avatar;draft.avatars=draft.avatars.includes(id)?draft.avatars.filter(x=>x!==id):[...draft.avatars,id];invalidate();renderDialog();return;}
    const style=event.target.closest('[data-fm-style]');if(style&&!view.busy){if(style.dataset.fmStyle==='avatar')open('avatar');else adapter.send('faceSet',{options:{...settings(),enabled:true,style:style.dataset.fmStyle}});return;}
    const action=event.target.closest('[data-fm]')?.dataset.fm;if(!action)return;
    if(action==='close'){close();return;}
    if(view.busy)return;
    if(action==='avatars')open('avatar');
    else if(action==='advanced')open(undefined,true);
    else if(action==='previewEntry')open();
    else if(action==='clear'){draft.avatars=[];invalidate();renderDialog();}
    else if(action==='previous'){page=Math.max(0,page-1);renderDialog();}
    else if(action==='next'){page++;renderDialog();}
    else if(action==='import')adapter.send('faceImport');
    else if(action==='preview')sendPreview();
    else if(action==='apply'){adapter.send('faceSet',{options:copy(draft)});close();}
  });
  document.addEventListener('change',e=>{if(e.target.matches('[data-fm-enable]')){const enabled=e.target.checked;e.target.checked=settings().enabled;adapter.send('faceSet',{options:{...settings(),enabled}});}});
  modal.addEventListener('input',e=>{const key=e.target.dataset.fmOption;if(!key||!draft||!e.target.checkValidity())return;draft[key]=Number(e.target.value)/(key==='minFace'?100:1);invalidate();$('fmConfidence').textContent=draft.confidence.toFixed(2);$('fmExpansion').textContent=Math.round(draft.expansion*100)+'%';$('fmAdvancedSummary').textContent=`灵敏度${draft.confidence} · 外扩${Math.round(draft.expansion*100)}%`;});
  $('fmBoxes').onchange=invalidate;
  modal.addEventListener('cancel',e=>{e.preventDefault();close();});
  window.FaceMaskUI={mount(element,callbacks){host=element;host.classList.add('fm-entry');adapter=callbacks;entryKey='';renderEntry();},update(next){
    const oldContext=context;context=next.context||'';
    if(afterAvatars&&afterAvatars.context!==context)afterAvatars=null;
    if(modal.open&&oldContext!==context)close();
    const oldAvatars=JSON.stringify(view.library?.avatars?.map(a=>a.id));view=next;renderEntry();
    if(afterAvatars&&avatars().length&&view.library?.builtInReady!==false){const action=afterAvatars.action;afterAvatars=null;action();}
    if(modal.open){if(oldAvatars!==JSON.stringify(avatars().map(a=>a.id)))renderDialog();else updateStatus();}
  },open};
})();
