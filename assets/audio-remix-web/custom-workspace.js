(() => {
  'use strict';
  const api=window.RemixPage, $=id=>document.getElementById(id), esc=api.escape;
  let state=api.state(), active=false, smart=false, tableKey='', audioChoice='', previewRequested=false;
  const preview=document.querySelector('.preview-panel'), previewHome=document.createComment('preview-home');
  preview.before(previewHome);
  const root=document.createElement('section');root.id='customWorkspace';root.hidden=true;
  root.innerHTML=`<div class="cm-top"><section class="panel cm-import"><div id="cmPlan"></div><h2>2　导入素材</h2><button id="cmImport" class="cm-drop"><span class="cm-plus" data-icon="plus"></span><strong>导入多个视频素材</strong><small>导入后可在下方按片段设置素材与剪辑规则</small></button><div id="cmSources" class="cm-sources" hidden></div></section><div id="cmPreview"></div></div>
  <section class="panel cm-rules"><header><div><h2><span data-icon="grip"></span>自定义片段编排</h2><p id="cmRuleHint"></p></div><div><button id="cmAdd" class="button secondary"><span data-icon="plus"></span>添加片段</button><span id="cmCount" class="cm-badge"></span></div></header><div class="cm-table-head"><span>片段内容</span><span>使用素材</span><span>时长</span><span>剪辑规则</span><span>操作</span></div><div id="cmRows" class="cm-rows" tabindex="0" aria-label="自定义片段，可向下滚动查看"></div></section>
  <div class="cm-settings"><section class="panel cm-sound"><h2><span data-icon="volume"></span>3　声音设置</h2><label class="cm-line"><span>成片声音</span><select id="cmAudio" aria-label="成片声音"></select><button id="cmUpload" class="button secondary">上传MP3</button></label><label class="cm-line"><span>音量</span><select id="cmVolume" aria-label="音量">${[0,.5,1,1.5,2].map(v=>`<option value="${v}">${v*100}%</option>`).join('')}</select></label><div class="cm-line"><span>音频预览</span><div class="cm-audio-player"><button id="cmAudioPlay" aria-label="播放音频预览" data-icon="playFill"></button><input id="cmAudioSeek" aria-label="音频预览进度" type="range" min="0" max="1000" value="0"><time id="cmAudioTime">00:00</time></div></div><p id="cmAudioStatus" role="status"></p><audio id="cmAudioPlayer" preload="metadata"></audio></section>
  <section class="panel cm-watermark"><h2><span data-icon="edit"></span>4　水印设置</h2><label class="cm-line"><span>水印文字</span><input id="cmWatermarkText" maxlength="40" placeholder="输入品牌名称" aria-label="水印文字"></label><div class="cm-watermark-middle"><label>水印位置<select id="cmPosition" aria-label="水印位置">${[['top-left','左上角'],['top-right','右上角'],['bottom-left','左下角'],['bottom-right','右下角'],['center','居中']].map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label><label>运动方式<select id="cmMotion" aria-label="运动方式">${[['fixed','固定位置'],['corner','角落内移动'],['vertical','上下移动'],['horizontal','左右移动']].map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label></div><div class="cm-watermark-bottom"><label>不透明度<select id="cmOpacity" aria-label="不透明度">${[.2,.4,.6,.8,1].map(v=>`<option value="${v}">${v*100}%</option>`).join('')}</select></label><label>移动速度<select id="cmSpeed" aria-label="移动速度"><option value="0.5">慢</option><option value="1">中等</option><option value="2">快</option></select></label><label>文字大小<select id="cmFont" aria-label="文字大小">${[20,24,28,32,36,48].map(v=>`<option>${v}</option>`).join('')}</select></label></div></section>
  <section class="panel cm-output-settings"><h2><span data-icon="video"></span>5　成片设置</h2><label class="cm-line"><span>视频比例</span><select id="cmRatio" aria-label="视频比例">${['9:16','16:9','4:3','3:4'].map(v=>`<option>${v}</option>`).join('')}</select></label><div class="cm-line"><span id="cmDurationLabel">成片时长</span><div id="cmDurationControl" class="cm-duration-control"><select id="cmDurationMode" aria-label="成片时长选项"><option value="source">和视频1时长一致</option><option value="fixed">自定义时长</option></select><div id="cmDurationField" hidden><input id="cmDuration" type="number" min="1" max="600" step="1" aria-label="自定义时长（秒）"><span aria-hidden="true">秒</span></div></div></div><label class="cm-line"><span>生成条数</span><select id="cmQuantity" aria-label="生成条数">${[1,3,5,10].map(v=>`<option value="${v}">${v}条</option>`).join('')}</select></label></section></div>
  <footer class="panel cm-footer"><strong>输出目录</strong><input id="cmOutput" aria-label="输出目录路径"><button id="cmChangeOutput" class="button secondary">更改目录</button><button id="cmOpenOutput" class="button secondary">打开目录</button><button id="cmGenerate" class="button primary">生成视频</button><button id="cmCancel" class="button secondary" hidden>取消任务</button><p id="cmJob" role="status" hidden></p></footer>`;
  const content=document.createElement('div');content.className='cm-scroll';content.tabIndex=0;content.setAttribute('role','region');content.setAttribute('aria-label','剪辑设置滚动区');
  while(root.firstElementChild&&root.firstElementChild.tagName!=='FOOTER')content.append(root.firstElementChild);
  root.prepend(content);
  document.querySelector('.app').append(root);api.icons(root);
  const post=(command,payload={})=>api.post(command,payload);
  function setValue(id,value){const e=$(id),v=String(value??'');if(e.tagName==='SELECT'&&v&&![...e.options].some(o=>o.value===v)){const label=['cmVolume','cmOpacity'].includes(id)?Math.round(Number(v)*100)+'%':v;e.add(new Option(label,v));}if(document.activeElement!==e)e.value=v;}
  function option(v,label,selected){return `<option value="${esc(v)}"${String(v)===String(selected)?' selected':''}>${esc(label)}</option>`;}
  const smartEditor=$('smartEditor'), smartHome=document.createComment('smart-editor-home');
  smartEditor.before(smartHome);
  const smartDetails=document.createElement('details');smartDetails.id='cmSmartDetails';smartDetails.hidden=true;
  smartDetails.innerHTML='<summary>剪辑详情与素材检查</summary>';root.querySelector('.cm-import').append(smartDetails);
  // Retain the established advanced controls and their listeners below imported material.
  const smartExtras=['.source-actions','.audio-panel','.framing-settings','#openVariations'].map(selector=>{
    const element=document.querySelector(selector),home=document.createComment('smart-control-home');
    element.before(home);return {element,home};
  });
  function show(){
    smart=state.settings?.mode==='智能混剪';
    const on=(smart||state.settings?.mode==='自定义混剪')&&!window.SuperMixUI?.active;
    active=on;root.hidden=!on;
    document.body.classList.toggle('custom-workspace-active',on);
    document.body.classList.toggle('smart-reference-active',on&&smart);
    const bar=$('superModeBar');
    if(on){
      if(smart){document.querySelector('.header').after(bar);smartDetails.append(smartEditor);smartExtras.forEach(x=>smartDetails.append(x.element));}
      else {$('cmPlan').append(bar);smartHome.after(smartEditor);smartExtras.forEach(x=>x.home.after(x.element));}
      $('cmPreview').append(preview);
      render();
    }else{
      if(bar.parentElement!==document.querySelector('.app'))document.querySelector('.header').after(bar);
      if(preview.parentElement!==previewHome.parentElement)previewHome.after(preview);
      smartHome.after(smartEditor);smartExtras.forEach(x=>x.home.after(x.element));dropdown.close();
    }
  }
  function render(){
    const s=state.settings||{},sources=state.sources||[],rules=state.rules||[],busy=!!state.running,w=s.watermark||{};
    const durationMode=smart?(state.smart?.durationMode||'source'):(s.customFollowSource===false?'fixed':'source');
    const ratio=s.outputRatio||'9:16',parts=ratio.split(':').map(Number);
    root.style.setProperty('--smart-preview-ratio',parts.length===2&&parts.every(v=>v>0)?parts[0]/parts[1]:9/16);
    root.querySelector('.cm-import>h2').innerHTML=smart?`<span data-icon="folder">${api.iconsMarkup.folder}</span>1　导入素材`:'2　导入素材';
    for(const [section,icon,label,number] of [['.cm-sound','volume','声音设置',2],['.cm-watermark','edit','水印设置',3],['.cm-output-settings','video','成片设置',4]])
      root.querySelector(section+' h2').innerHTML=`<span data-icon="${icon}">${api.iconsMarkup[icon]}</span>${smart?number:number+1}　${label}`;
    $('cmImport').querySelector('small').textContent=smart?'自动挑选素材，搭配生成成片':'导入后可在下方按片段设置素材与剪辑规则';
    root.querySelector('.cm-footer>strong').innerHTML=(smart?'<span class="cm-output-icon">'+api.iconsMarkup.folder+'</span>':'')+'输出目录';
    $('cmOutput').placeholder=smart?'桌面 / 千川混剪输出':'';
    $('cmMotion').options[0].text=smart?'固定':'固定位置';
    $('cmQuantity').querySelectorAll('option').forEach(o=>o.text=o.value+(smart?' 条':'条'));
    smartDetails.hidden=!smart||!sources.length;
    if(smart&&state.job?.state==='needsInput')smartDetails.open=true;
    $('cmDurationMode').options[0].text='和视频1时长一致';
    const audioDuration=$('cmDurationMode').querySelector('[value="audio"]');
    if(smart&&!audioDuration)$('cmDurationMode').add(new Option('跟随音频时长','audio'));
    else if(!smart&&audioDuration)audioDuration.remove();
    $('showResults').textContent='成片历史';$('renderPreview').textContent=busy?'处理中…':'查看预览';$('previewEmpty').innerHTML=`${api.iconsMarkup.playFill}<span>导入后查看预览</span>`;
    const k=JSON.stringify([rules,sources.map(x=>[x.id,x.fileName]),busy]);
    if(k!==tableKey){tableKey=k;const scroll=$('cmRows').scrollTop;$('cmRows').innerHTML=rules.map((r,i)=>{const kind=r.kind==='Opening'?'开头画面':r.kind==='Ending'?'结尾画面':'中段画面';const auto=r.autoSource||!r.sourceIds?.length;const legacy=!auto&&r.sourceIds.length>1;const range=r.kind==='Opening'?['start','end']:r.kind==='Middle'?['minimum','maximum']:['duration'];return `<div class="cm-rule" data-rule="${esc(r.id)}"><strong><b>${i+1}</b>${kind}</strong><select data-cm-source="${esc(r.id)}" aria-label="第${i+1}段使用素材">${option('__auto','自动选择',auto?'__auto':r.sourceIds[0])}${sources.map((v,n)=>option(v.id,`视频${n+1} · ${v.fileName}`,auto?'__auto':r.sourceIds[0])).join('')}${legacy?'<option selected disabled>原方案 · '+r.sourceIds.length+'个素材</option>':''}</select><div class="cm-times">${range.map((f,n)=>`${n?'<span>—</span>':''}<input data-cm-time="${f}" data-id="${esc(r.id)}" aria-label="第${i+1}段${f==='start'?'开始时间':f==='end'?'结束时间':f==='minimum'?'最短时长':f==='maximum'?'最长时长':'时长'}" type="number" min="0" step="0.1" value="${Number(r[f])}">`).join('')}<span>秒</span></div><span class="cm-rule-tag">${r.kind==='Opening'?'固定开头':r.kind==='Ending'?'固定结尾':'随机混剪'}</span><select data-cm-action="${esc(r.id)}" aria-label="第${i+1}段操作" ${r.kind!=='Middle'?'disabled':''}><option value="">${r.kind==='Middle'?'操作':'保留'}</option><option value="up">上移</option><option value="down">下移</option><option value="delete">删除</option></select></div>`;}).join('');$('cmRows').scrollTop=scroll;}
    $('cmCount').textContent=`共${rules.length}段`;$('cmRuleHint').textContent=`共${rules.length}段，中间片段在此区域内滚动查看；开头和结尾固定保留`;
    const audio=s.audioSourceId==='__custom_mp3'?'__custom_mp3':audioChoice==='__custom_mp3'&&!s.customAudioPath?'__custom_mp3':sources.some(v=>v.id===s.audioSourceId)?s.audioSourceId:'__mute';
    $('cmAudio').innerHTML=option('__mute','成片静音',audio)+option('__custom_mp3','自定义MP3',audio)+(sources[0]?option(sources[0].id,'视频1原音',audio):'<option disabled>视频1原音</option>');if(audio!=='__mute'&&audio!=='__custom_mp3'&&audio!==sources[0]?.id){const legacyAudio=new Option('原方案 · '+(sources.find(v=>v.id===audio)?.fileName||'音频'),audio,true,true);$('cmAudio').add(legacyAudio);}$('cmUpload').hidden=!smart&&audio!=='__custom_mp3';$('cmUpload').textContent=smart?'上传 MP3':'上传MP3';
    setValue('cmVolume',s.audioVolume??1);setValue('cmWatermarkText',w.text||'');setValue('cmPosition',w.position||'top-right');setValue('cmMotion',w.motion||'fixed');setValue('cmOpacity',w.opacity??.6);setValue('cmSpeed',w.speed??1);setValue('cmFont',w.fontSize??28);
    setValue('cmRatio',s.outputRatio||'9:16');setValue('cmDurationMode',durationMode);$('cmDurationField').hidden=durationMode!=='fixed';$('cmDurationControl').classList.toggle('is-custom',durationMode==='fixed');if($('cmDuration').getAttribute('aria-invalid')!=='true')setValue('cmDuration',s.durationSeconds||30);setValue('cmQuantity',s.count||3);setValue('cmOutput',s.outputPath||'');
    $('cmSources').hidden=!sources.length;$('cmImport').classList.toggle('has-sources',!!sources.length);
    $('cmSources').innerHTML=sources.map((v,n)=>`<button class="cm-source-card" data-cm-preview="${esc(v.id)}" title="视频${n+1} · ${esc(v.fileName)}"><span class="cm-source-picture">${v.thumbnailDataUrl?`<img src="${esc(v.thumbnailDataUrl)}" alt="视频${n+1}完整画面">`:'<span class="cm-source-placeholder">暂无封面</span>'}<span class="cm-source-duration">${esc(v.durationText||api.clock(v.duration||0))}</span></span><span class="cm-source-name">视频${n+1} · ${esc(v.fileName)}</span></button>`).join('')+(sources.length?'<button class="cm-source-add" data-cm-import title="添加视频"><span class="cm-add-symbol">＋</span><span>添加视频</span></button>':'');
    if(smart)$('cmSources').querySelectorAll('[data-cm-preview]').forEach(card=>{
      const tile=document.createElement('div');tile.className='cm-source-tile';card.before(tile);tile.append(card);
      const remove=document.createElement('button');remove.className='cm-source-remove';remove.dataset.cmRemove=card.dataset.cmPreview;
      remove.textContent='×';remove.setAttribute('aria-label','移除'+card.title);tile.append(remove);
    });
    root.querySelectorAll('input,select,button').forEach(e=>{if(!e.closest('.preview-panel, #cmSmartDetails')&&!e.matches('[data-cm-action]'))e.disabled=busy;});root.querySelectorAll('[data-cm-action]').forEach(e=>e.disabled=busy||rules.find(r=>r.id===e.dataset.cmAction)?.kind!=='Middle');
    if(smart&&state.smart?.speech?.enabled){$('cmDurationMode').disabled=true;$('cmDuration').disabled=true;}
    const invalidDuration=durationMode==='fixed'&&!$('cmDuration').checkValidity();$('cmGenerate').disabled=invalidDuration||busy||!sources.length||sources.some(x=>x.missing||!(x.duration>0))||!s.outputPath||audio==='__custom_mp3'&&!s.customAudioPath;$('cmGenerate').title=invalidDuration?'请输入1～600秒的整数时长':busy?'任务进行中':!sources.length?'请先导入素材':!s.outputPath?'请选择输出目录':audio==='__custom_mp3'&&!s.customAudioPath?'请先上传MP3':'';$('cmCancel').hidden=!busy;$('cmCancel').disabled=false;
    const job=state.job||{};$('cmJob').hidden=!busy&&(!['failed','partial','completed','needsInput'].includes(job.state)||job.kind==='analyze'&&job.state==='completed');$('cmJob').textContent=[job.stage,job.detail].filter(Boolean).join(' · ');
    const a=state.audioRhythm||{};$('cmAudioPlay').disabled=busy||audio==='__mute'||(audio==='__custom_mp3'&&!s.customAudioPath)||!!a.auditionBusy;$('cmAudioStatus').textContent=a.auditionError|| (a.auditionBusy?'正在准备音频预览…':'');
    if(a.auditionReady&&a.auditionUrl&&$('cmAudioPlayer').getAttribute('src')!==a.auditionUrl){$('cmAudioPlayer').src=a.auditionUrl;if(previewRequested){previewRequested=false;$('cmAudioPlayer').play().catch(()=>{});}}
    dropdown.sync();
  }
  root.addEventListener('change',e=>{const el=e.target;if(el.dataset.cmTime)post('updateRule',{id:el.dataset.id,field:el.dataset.cmTime,value:el.value});else if(el.dataset.cmSource)post('setCustomRuleSource',{id:el.dataset.cmSource,value:el.value});else if(el.dataset.cmAction){if(el.value==='delete')post('removeRule',{id:el.dataset.cmAction});else if(el.value)post('moveRule',{id:el.dataset.cmAction,direction:el.value==='up'?-1:1});el.value='';}});
  $('cmImport').onclick=()=>post('pickVideos');$('cmAdd').onclick=()=>post('addRule');$('cmSources').onclick=e=>{const remove=e.target.closest('[data-cm-remove]');if(remove){post('removeSource',{id:remove.dataset.cmRemove});return;}if(e.target.closest('[data-cm-import]')){post('pickVideos');return;}const b=e.target.closest('[data-cm-preview]');if(b)api.showSource(b.dataset.cmPreview);};
  $('cmAudio').onchange=e=>{audioChoice=e.target.value;$('cmAudioPlayer').pause();if(audioChoice!=='__custom_mp3'||state.settings?.customAudioPath)post('setAudioSource',{value:audioChoice});render();};$('cmUpload').onclick=()=>post('pickCustomMp3');$('cmVolume').onchange=e=>post('setAudioVolume',{value:e.target.value});
  function watermark(){post('setWatermark',{enabled:!!$('cmWatermarkText').value.trim(),text:$('cmWatermarkText').value,position:$('cmPosition').value,motion:$('cmMotion').value,opacity:$('cmOpacity').value,speed:$('cmSpeed').value,fontSize:$('cmFont').value});}
  ['cmWatermarkText','cmPosition','cmMotion','cmOpacity','cmSpeed','cmFont'].forEach(id=>$(id).onchange=watermark);
  $('cmRatio').onchange=e=>post('setOutputRatio',{value:e.target.value});$('cmDurationMode').onchange=e=>{const value=e.target.value;if(smart){state.smart=state.smart||{};state.smart.durationMode=value;}else state.settings.customFollowSource=value==='source';$('cmDurationField').hidden=value!=='fixed';$('cmDurationControl').classList.toggle('is-custom',value==='fixed');post(smart?'smartDuration':'setCustomDurationMode',{value});};$('cmDuration').required=true;$('cmDuration').oninput=e=>{e.target.setAttribute('aria-invalid',String(!e.target.checkValidity()));render();};$('cmDuration').onchange=e=>{if(!e.target.checkValidity()){e.target.reportValidity();return;}e.target.removeAttribute('aria-invalid');post('setDuration',{value:e.target.value});};$('cmDuration').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();e.target.blur();}else if(e.key==='Escape'){e.target.value=String(state.settings.durationSeconds||30);e.target.removeAttribute('aria-invalid');e.target.blur();render();}else if(e.key==='F4'||e.altKey&&e.key==='ArrowDown'){e.preventDefault();dropdown.open($('cmDurationMode'));}};$('cmQuantity').onchange=e=>post('setCount',{value:e.target.value});$('cmOutput').onchange=e=>post('setCustomOutput',{value:e.target.value});$('cmChangeOutput').onclick=()=>post('pickOutput');$('cmOpenOutput').onclick=()=>post('openOutput');$('cmGenerate').onclick=()=>post('generate');$('cmCancel').onclick=()=>post('cancel');
  $('cmAudioPlay').onclick=()=>{const a=$('cmAudioPlayer');if(!a.paused){a.pause();return;}if(state.audioRhythm?.auditionReady)a.play().catch(()=>{});else{previewRequested=true;post('prepareAudioAudition');}};
  $('cmAudioPlayer').ontimeupdate=()=>{const a=$('cmAudioPlayer');$('cmAudioTime').textContent=api.clock(a.currentTime);$('cmAudioSeek').value=a.duration?Math.round(a.currentTime/a.duration*1000):0;};$('cmAudioSeek').oninput=e=>{const a=$('cmAudioPlayer');if(Number.isFinite(a.duration))a.currentTime=a.duration*Number(e.target.value)/1000;};
  // Keep the native selects and their existing change handlers as the value source.
  // A shared top-layer list avoids OS popup styling and clipped panel boundaries.
  const dropdown=(()=>{
    const menu=document.createElement('div');menu.id='cmSelectMenu';menu.className='cm-select-menu';menu.hidden=true;menu.setAttribute('role','listbox');menu.setAttribute('popover','manual');document.body.append(menu);
    let select=null,index=-1,signature='',search='',searchAt=0;
    const options=()=>select?[...select.options]:[];
    const enabled=o=>!!o&&!o.disabled&&!o.hidden&&!o.closest('optgroup:disabled');
    function close(){if(select){select.setAttribute('aria-expanded','false');select.removeAttribute('aria-activedescendant');}if(menu.matches(':popover-open'))menu.hidePopover();menu.hidden=true;select=null;search='';}
    function position(){if(!select)return;const b=select.getBoundingClientRect(),below=innerHeight-b.bottom-8,above=b.top-8,up=below<Math.min(menu.scrollHeight,280)&&above>below;const height=Math.max(0,Math.min(280,(up?above:below)-8));menu.style.width=Math.min(Math.max(b.width,180),innerWidth-16)+'px';menu.style.maxHeight=height+'px';menu.style.left=Math.max(8,Math.min(b.left,innerWidth-menu.getBoundingClientRect().width-8))+'px';menu.style.top=(up?b.top-menu.getBoundingClientRect().height-6:b.bottom+6)+'px';menu.dataset.direction=up?'up':'down';}
    function highlight(next){index=next;[...menu.children].forEach((e,i)=>{e.classList.toggle('is-active',i===index);});const item=menu.children[index];if(item){select.setAttribute('aria-activedescendant',item.id);item.scrollIntoView({block:'nearest'});}}
    function draw(){signature=JSON.stringify(options().map(o=>[o.text,o.value,o.disabled,o.hidden,enabled(o)]).concat([select.selectedIndex]));menu.replaceChildren();options().forEach((o,i)=>{const item=document.createElement('div');item.id='cmSelectOption'+i;item.className='cm-select-option';item.setAttribute('role','option');item.setAttribute('aria-selected',String(i===select.selectedIndex));item.setAttribute('aria-disabled',String(!enabled(o)));item.hidden=o.hidden;item.dataset.index=i;item.textContent=o.text;item.title=o.text;menu.append(item);});menu.setAttribute('aria-label',select.getAttribute('aria-label')||'选择选项');}
    function open(el){if(el.disabled)return;close();select=el;select.focus({preventScroll:true});select.setAttribute('aria-expanded','true');draw();menu.hidden=false;if(menu.showPopover)menu.showPopover();position();highlight(enabled(options()[select.selectedIndex])?select.selectedIndex:options().findIndex(enabled));}
    function choose(i){const el=select,o=options()[i];if(!el||!o||!enabled(o))return;close();el.selectedIndex=i;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));if(el.isConnected){if(el.id==='cmDurationMode'&&el.value==='fixed'){$('cmDuration').focus({preventScroll:true});$('cmDuration').select();}else el.focus({preventScroll:true});}}
    function sync(){root.querySelectorAll('select').forEach(el=>{if(el.closest('#cmSmartDetails'))return;el.setAttribute('aria-haspopup','listbox');el.setAttribute('aria-controls',menu.id);el.setAttribute('aria-expanded',String(el===select));});if(!select)return;if(!select.isConnected||select.disabled||root.hidden){close();return;}const next=JSON.stringify(options().map(o=>[o.text,o.value,o.disabled,o.hidden,enabled(o)]).concat([select.selectedIndex]));if(signature!==next){draw();position();highlight(select.selectedIndex);}}
    root.addEventListener('pointerdown',e=>{const el=e.target.closest('select:not(#cmSmartDetails select)');if(!el||el.disabled||e.button!==0)return;e.preventDefault();if(select===el)close();else open(el);});
    root.addEventListener('click',e=>{if(e.target.closest('select:not(#cmSmartDetails select)'))e.preventDefault();});
    root.addEventListener('keydown',e=>{const el=e.target.closest('select:not(#cmSmartDetails select)');if(!el||el.disabled)return;if(e.key==='F4'){e.preventDefault();if(select===el)close();else open(el);return;}if(e.key==='Tab'){close();return;}if(e.key==='Escape'){if(select){e.preventDefault();e.stopPropagation();close();}return;}const navigation=['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(e.key),typing=e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey;if(!navigation&&!typing)return;e.preventDefault();if(select!==el){open(el);if(['Enter',' ','ArrowDown','ArrowUp'].includes(e.key))return;}if(e.key==='Enter'||e.key===' '){choose(index);return;}const ids=options().map((o,i)=>enabled(o)?i:-1).filter(i=>i>=0);if(!ids.length)return;if(e.key==='Home')highlight(ids[0]);else if(e.key==='End')highlight(ids[ids.length-1]);else if(e.key==='ArrowDown'||e.key==='ArrowUp'){const at=ids.indexOf(index);highlight(ids[Math.max(0,Math.min(ids.length-1,at+(e.key==='ArrowDown'?1:-1)))]);}else if(typing){search=Date.now()-searchAt<700?search+e.key:e.key;searchAt=Date.now();const found=ids.find(i=>options()[i].text.toLocaleLowerCase().startsWith(search.toLocaleLowerCase()));if(found!==undefined)highlight(found);}});
    menu.addEventListener('pointerdown',e=>e.preventDefault());
    menu.addEventListener('pointermove',e=>{const item=e.target.closest('[data-index]');if(item&&enabled(options()[Number(item.dataset.index)]))highlight(Number(item.dataset.index));});
    menu.addEventListener('click',e=>{const item=e.target.closest('[data-index]');if(item)choose(Number(item.dataset.index));});
    document.addEventListener('pointerdown',e=>{if(select&&e.target!==select&&!menu.contains(e.target))close();},true);
    document.addEventListener('focusin',e=>{if(select&&e.target!==select&&!menu.contains(e.target))close();});
    document.addEventListener('scroll',e=>{if(select&&!menu.contains(e.target))close();},true);
    window.addEventListener('resize',close);document.addEventListener('fullscreenchange',close);
    return {sync,close,open};
  })();
  window.CustomRemixUI={update(next){state=next;show();},modeChanged:show};show();
})();
