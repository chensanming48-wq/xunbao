(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const defaults = {Mode:'dedup',Ratio:'9:16',Fit:'contain',Method:'random',Priority:'quality',Gpu:'auto',Copies:3,Strength:2,Concurrency:8,EncodingSpeed:'quality',Audio:false,Frames:false,Brightness:.02,Contrast:.03,Saturation:.04,Crop:.02,Speed:.008,HookFolder:'',CaptionLines:[],UseHook:false,UseCaption:false,UseHue:true,UseNoise:true,UseTrim:true,UsePitch:true,UseGop:true,AllowMirror:true};
  let state = {settings:defaults,items:[],busy:false,previewCopy:1,selectedId:'',output:'',message:'正在连接本地视频引擎…',toolsReady:false};
  let connected = false, tableKey = '', toastTimer;
  let shownCompletion = '';
  try { shownCompletion = sessionStorage.getItem('videoBatchCompletion') || ''; } catch {}
  function showCompletion(){
    const result=state.completion;
    if(state.busy||!result||!result.id||result.id===shownCompletion)return;
    shownCompletion=result.id;try{sessionStorage.setItem('videoBatchCompletion',shownCompletion);}catch{}
    $('exportResultTitle').textContent=result.outcome==='success'?(result.reviewCount?'已生成，请复核遮挡画面':'生成成功'):result.outcome==='partial'?'部分视频生成完成':'生成失败';
    $('exportResultMessage').textContent=result.outcome==='success'?'已成功生成 '+result.succeeded+' 个视频。':'成功 '+result.succeeded+' 个，失败 '+result.failed+' 个。请查看素材列表中的失败原因。';
    if(Number.isFinite(result.elapsedSeconds)&&result.elapsedSeconds>=0){$('exportResultMessage').textContent+=' 总用时 '+result.elapsedSeconds.toFixed(1)+' 秒。';if(result.firstOutputSeconds>0)$('exportResultMessage').textContent+=' 首条成片 '+result.firstOutputSeconds.toFixed(1)+' 秒。';}
    $('exportResultPath').textContent=result.output||'';
    let details=$('exportResultDetails');if(!details){details=document.createElement('div');details.id='exportResultDetails';details.className='processing-issues';$('exportResultMessage').after(details);}
    renderIssues(details,result.details||state.items.map(m=>({name:m.Name,error:m.Error,warning:m.Warning})));
    if(!$('exportResult').open)$('exportResult').showModal();
  }
  function renderIssues(container,rows){
    container.replaceChildren();
    for(const row of rows){
      if(!row.error&&!row.warning)continue;
      const item=document.createElement('p');item.className=row.error?'processing-error':'processing-review';
      item.textContent=(row.name||'素材')+'：'+[row.error,row.warning].filter(Boolean).join('；');container.append(item);
    }
    container.hidden=!container.childElementCount;
  }
  let automationPending = false, automationRequest = '';
  const automaticKeys = ['UseHue','UseNoise','UseTrim','UsePitch','UseGop','AllowMirror'];
  function automaticSettings(settings){const next={...settings,Mode:settings.Mode==='creative'?'dedup':settings.Mode,Method:'random'};for(const key of automaticKeys)next[key]=true;return next;}
  function needsAutomation(settings){return settings.Mode==='creative'||settings.Method!=='random'||automaticKeys.some(key=>settings[key]!==true);}
  function syncAutomation(){
    automationPending=needsAutomation(state.settings);
    if(!automationPending){automationRequest='';return;}
    if(!connected||state.busy){if(state.busy)automationRequest='';return;}
    const next=automaticSettings(state.settings),key=JSON.stringify(next);
    if(key===automationRequest)return;
    automationRequest=key;send('settings',next);
  }
  const send = (command,payload={}) => { if (!connected) return toast('本地引擎未连接，请在创爆软件中打开此页面。'); window.chrome.webview.postMessage({type:'command',command,payload}); };
  function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6000);}
  const effective = () => state.settings.Mode === 'ratio' ? 1 : state.settings.Copies;
  function setSetting(key,value){if(state.busy||automationPending)return;const next=automaticSettings({...state.settings,[key]:value});send('settings',next);if(next.Mode!=='creative'){state.settings=next;render();}}
  function time(seconds){const n=Math.max(0,Math.round(seconds||0));return Math.floor(n/60).toString().padStart(2,'0')+':'+(n%60).toString().padStart(2,'0');}
  function updateInput(id,value){if(document.activeElement!==$(id))$(id).value=value;}
  function setVideo(video,url){url=url||'';if(video.dataset.url===url)return;video.pause();video.dataset.url=url;if(url)video.src=url;else video.removeAttribute('src');video.load();}
  function outputLabel(path){
    if(!path)return '尚未选择输出目录';
    const normalized=path.replace(/\\/g,'/').replace(/\/$/,'');
    const desktop=normalized.match(/(?:^|\/)(?:Desktop|桌面)(?:\/(.*))?$/i);
    if(desktop)return '桌面'+(desktop[1]?' / '+desktop[1].split('/').join(' / '):'');
    const parts=normalized.split('/').filter(Boolean);
    return parts.length===1&&/:$/.test(parts[0])?parts[0]+'\\':parts[parts.length-1]||path;
  }
  function render(){
    const s=state.settings,copies=effective(),total=state.items.length*copies,ratioOnly=s.Mode==='ratio',creative=s.Mode==='creative';
    document.querySelectorAll('[data-setting]').forEach(b=>{const active=String(s[b.dataset.setting])===b.dataset.value;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));b.disabled=state.busy;});
    updateInput('gpu',s.Gpu==='cpu'?'cpu':'auto');updateInput('mode',ratioOnly?'ratio':'dedup');
    updateInput('copies',copies);updateInput('encodingSpeed',s.EncodingSpeed==='speed'?'speed':'quality');
    document.querySelectorAll('.settings-column input,.settings-column button,.settings-column select').forEach(e=>e.disabled=state.busy||automationPending);
    const copiesLocked=!connected||state.busy||automationPending||ratioOnly;
    $('copies').disabled=copiesLocked;
    $('minus').disabled=copiesLocked||copies<=1;
    $('plus').disabled=copiesLocked||copies>=200;
    $('copiesHint').textContent=ratioOnly?'仅调整比例，每个视频输出 1 个':'可输入 1–200 个';
    $('sourceCount').textContent=state.items.length+' 个';
    $('outputName').textContent=outputLabel(state.output);$('outputName').title=state.output||'';
    $('outputPath').textContent=state.output||'选择保存视频的位置';$('outputPath').title=state.output||'';
    $('message').textContent=state.message==='添加视频，开始制作第一个版本'?'':state.message||'';$('message').title=state.message||'';$('runTitle').textContent=state.busy?(state.previewing?'正在生成预览':'正在处理素材'):(state.items.length+' 个源视频 × '+copies+' 个 = 共 '+total+' 个');
    $('start').textContent=state.busy&&!state.previewing?'正在生成…':'开始生成 '+total+' 个视频';
    $('start').disabled=!connected||state.busy||automationPending||!state.items.length||!state.output||!state.toolsReady||total>5000;
    $('cancel').disabled=!state.busy;$('openOutput').disabled=!(state.lastRun||state.output);$('history').disabled=!state.lastRun;
    for(const id of ['add','output','previewAdd'])$(id).disabled=!connected||state.busy;
    $('preview').disabled=state.busy||automationPending||!state.items.length||!connected;$('preview').textContent=state.previewing?'正在生成…':'生成效果预览';
    const selected=state.items.find(x=>x.Id===state.selectedId)||state.items[0];
    const hasPreview=!!state.previewResult,pending=!!state.effectPreviewing,hasSource=!!state.sourceUrl,showResult=hasPreview||pending;
    $('previewEmpty').hidden=hasSource||hasPreview;$('compare').hidden=!hasSource&&!hasPreview;$('playback').hidden=!hasPreview;
    $('compare').classList.toggle('source-only',!showResult);$('resultFigure').hidden=!showResult;
    $('resultPending').hidden=!pending||hasPreview;$('resultVideo').hidden=!hasPreview;
    $('resultProgress').textContent=pending?(state.message||'正在准备处理…'):'';
    const original=$('originalVideo'),sourceUrl=state.previewOriginal||state.sourceUrl||'';
    if(original.dataset.url!==sourceUrl)$('sourcePlaybackError').hidden=true;
    original.controls=!hasPreview;original.muted=hasPreview;if(!hasPreview)original.playbackRate=1;
    original.poster=selected?.Thumbnail||'';
    setVideo(original,sourceUrl);setVideo($('resultVideo'),state.previewResult);
    $('resultCaption').textContent='处理后 · '+(s.Ratio==='source'?'原比例':s.Ratio);$('previewHint').textContent=hasPreview?'前 6 秒 · 当前副本参数与导出一致':pending?'原视频可继续播放，处理完成后将在右侧显示效果。':hasSource?'正在查看原视频 · 点击生成效果预览，对比处理后的画面。':'导入视频后即可查看原视频。';
    $('actualParameters').hidden=!state.previewKey;
    if(state.previewKey){try{const p=JSON.parse(state.previewKey);$('parameterText').textContent=creative?'钩子：'+(p.HookFile||'无')+' · 文案：'+(p.Caption||'无')+' · 色相 '+p.Hue.toFixed(2)+'° · 噪点 '+p.Noise+' · 掐头/去尾 '+p.TrimStart.toFixed(3)+' / '+p.TrimEnd.toFixed(3)+' 秒 · 音高 '+p.Pitch.toFixed(4)+'× · GOP '+(p.Gop||'默认')+' · 镜像 '+(p.Mirror?'开启':'关闭'):'亮度 '+p.Brightness.toFixed(4)+' · 对比度 '+p.Contrast.toFixed(4)+' · 饱和度 '+p.Saturation.toFixed(4)+' · 速度 '+p.Speed.toFixed(4)+'× · 裁切 '+(p.Crop*100).toFixed(2)+'% · 音量 '+p.Volume.toFixed(4)+'×'+(p.Profile?' · 噪点 '+p.Noise+' · '+p.OutputFps+' fps · GOP '+p.Gop+' · 关键帧 '+(p.ForcedKeyFrames||'无额外关键帧'):'');}catch{}}
    const faceSource=state.items.find(x=>x.Id===state.selectedId)||state.items[0];
    FaceMaskUI.update({context:'video-batch',options:state.settings.FaceMask,library:state.faceMask,busy:state.busy,previewUrl:state.facePreviewUrl,source:faceSource?{id:faceSource.Id,name:faceSource.Name,ratio:faceSource.Width>faceSource.Height?'16:9':'9:16'}:null});
    $('batchFaceMask').querySelector('.fm-entry-bottom>small')?.remove();
    const faceHeading=$('batchFaceMask').querySelector('.fm-entry-heading');
    const faceAdvanced=$('batchFaceMask').querySelector('[data-fm="advanced"]');
    const facePreview=$('batchFaceMask').querySelector('[data-fm="previewEntry"]');
    if(faceHeading&&faceAdvanced&&facePreview){
      let actions=faceHeading.querySelector('.batch-face-actions');
      if(!actions){actions=document.createElement('div');actions.className='batch-face-actions';faceHeading.append(actions);}
      actions.append(faceAdvanced,facePreview);
    }

    renderAvatarSamples();
    renderSettingsLayout();renderRows(copies,s.Ratio);
    window.VideoBatchSelectUi.refresh();
    showCompletion();
  }
  function renderAvatarSamples(){
    const host=$('batchFaceMask'),library=state.faceMask?.avatars||[],options=state.settings.FaceMask||{};
    const selected=options.enabled&&options.style==='avatar'?(options.avatars||[]):[];
    const samples=[...library.filter(a=>selected.includes(a.id)),...library.filter(a=>!selected.includes(a.id))].slice(0,6);
    let row=host.querySelector('.batch-avatar-row');
    if(!samples.length){row?.remove();return;}
    if(!row){row=document.createElement('div');row.className='batch-avatar-row';row.setAttribute('aria-label','卡通头像示例');host.append(row);}
    const key=JSON.stringify([samples.map(a=>[a.id,a.thumbnail,a.name]),selected,state.busy]);if(row.dataset.key===key)return;row.dataset.key=key;
    const label=document.createElement('span');label.className='batch-avatar-label';label.textContent='卡通头像';
    const strip=document.createElement('div');strip.className='batch-avatar-samples';
    for(const a of samples){
      const button=document.createElement('button');button.className='batch-avatar-chip';button.dataset.fm='avatars';button.disabled=!!state.busy;button.classList.toggle('selected',selected.includes(a.id));button.title=a.name;button.setAttribute('aria-label','打开头像选择：'+a.name);
      const img=document.createElement('img');img.src=a.thumbnail;img.alt='';button.append(img);strip.append(button);
    }
    const more=document.createElement('button');more.className='fm-link batch-avatar-more';more.dataset.fm='avatars';more.disabled=!!state.busy;more.textContent='更多';more.setAttribute('aria-label','查看更多卡通头像');
    row.replaceChildren(label,strip,more);
  }
  function renderSettingsLayout(){
    document.body.dataset.mode=state.settings.Mode;
    document.body.dataset.compact='true';
    $('dedupSettings').hidden=state.settings.Mode==='ratio';
  }
  function renderRows(copies,ratio){
    let issues=$('sourceIssues');if(!issues){issues=document.createElement('div');issues.id='sourceIssues';issues.className='processing-issues';issues.setAttribute('aria-live','polite');$('sourceStrip').after(issues);}
    renderIssues(issues,state.items.map(m=>({name:m.Name,error:m.Error,warning:m.Warning})));
    const hasItems=state.items.length>0;
    $('add').hidden=hasItems;$('sourceStrip').hidden=!hasItems;
    $('addMore').disabled=!connected||state.busy;
    document.querySelector('.source-card').classList.toggle('has-items',hasItems);
    const key=JSON.stringify([state.items,state.selectedId,state.busy,copies,ratio]);if(key===tableKey){updateSourceNavigation();return;}tableKey=key;
    const focusId=document.activeElement?.closest('[data-media-id]')?.dataset.mediaId;
    const focusRemove=document.activeElement?.classList.contains('source-remove');
    const frag=document.createDocumentFragment();
    for(const m of state.items){
      const selected=m.Id===(state.selectedId||state.items[0]?.Id);
      const card=document.createElement('article');card.className='source-video-card';card.dataset.mediaId=m.Id;card.classList.toggle('selected',selected);
      const choose=document.createElement('button');choose.className='source-choose';choose.disabled=state.busy;choose.setAttribute('aria-label','查看 '+m.Name);choose.setAttribute('aria-pressed',String(selected));choose.onclick=()=>send('select',{id:m.Id});
      const frame=document.createElement('span');frame.className='source-poster';
      if(m.Thumbnail){const img=document.createElement('img');img.src=m.Thumbnail;img.alt='';img.loading='lazy';frame.append(img);}else{const label=document.createElement('span');label.className='source-no-thumbnail';label.textContent='视频';frame.append(label);}
      const duration=document.createElement('span');duration.className='source-duration';duration.textContent=time(m.Duration);frame.append(duration);
      const name=document.createElement('span');name.className='source-name';name.textContent=m.Name;name.title=m.Name;
      choose.title=m.Name+' · '+m.Width+' × '+m.Height+' · '+copies+' 份 · '+(ratio==='source'?'原比例':ratio)+(m.HasAudio?'':' · 无音轨');choose.append(frame,name);
      const status=document.createElement('span');status.className='source-status'+(m.Status==='已完成'?' done':m.Error?' error':'');status.textContent=m.Status==='处理中'?Math.round((m.Progress||0)*100)+'%':m.Status;status.title=m.Error||m.Status;
      if(m.Warning&&!m.Error&&m.Status!=='处理中'){status.textContent='需复核';status.title=m.Warning;}
      const remove=document.createElement('button');remove.className='source-remove';remove.textContent='×';remove.title='移除视频';remove.setAttribute('aria-label','移除 '+m.Name);remove.disabled=state.busy;remove.onclick=()=>send('remove',{id:m.Id});
      card.append(choose,status,remove);frag.append(card);
    }
    const scroll=$('sourceStrip').scrollLeft;$('items').replaceChildren(frag);$('sourceStrip').scrollLeft=scroll;updateSourceNavigation();
    if(focusId){const card=Array.from($('items').children).find(e=>e.dataset.mediaId===focusId);card?.querySelector(focusRemove?'.source-remove':'.source-choose')?.focus({preventScroll:true});}
  }
  document.querySelectorAll('[data-setting]').forEach(b=>b.onclick=()=>setSetting(b.dataset.setting,b.dataset.setting==='Strength'?Number(b.dataset.value):b.dataset.value));
  for(const id of ['add','output','openOutput','start','cancel','preview'])$(id).onclick=()=>{if((id==='start'||id==='preview')&&(automationPending||needsAutomation(state.settings))){syncAutomation();return;}send(id);};
  $('gpu').onchange=()=>setSetting('Gpu',$('gpu').value);$('mode').onchange=()=>setSetting('Mode',$('mode').value);
  $('encodingSpeed').onchange=()=>setSetting('EncodingSpeed',$('encodingSpeed').value);
  function updateSourceNavigation(){
    const strip=$('sourceStrip'),max=Math.max(0,strip.scrollWidth-strip.clientWidth);
    $('sourceNavigation').hidden=strip.hidden||max<2;
    $('sourceBack').disabled=strip.scrollLeft<2;$('sourceForward').disabled=strip.scrollLeft>=max-2;
  }
  $('sourceStrip').addEventListener('scroll',updateSourceNavigation,{passive:true});
  for(const [id,direction] of [['sourceBack',-1],['sourceForward',1]])$(id).onclick=()=>$('sourceStrip').scrollBy({left:direction*$('sourceStrip').clientWidth*.85,behavior:'smooth'});
  $('addMore').onclick=()=>send('add');
  $('history').onclick=()=>send('openOutput');$('previewAdd').onclick=()=>send('add');
  $('exportResultClose').onclick=()=>$('exportResult').close();
  $('exportResultOpen').onclick=()=>{send('openOutput');$('exportResult').close();};
  $('originalVideo').muted=true;
  $('play').onclick=async()=>{const a=$('originalVideo'),b=$('resultVideo');if(b.paused){try{await b.play();let hook=0;try{hook=JSON.parse(state.previewKey).HookDuration||0;}catch{}if(state.settings.Mode!=='creative'||b.currentTime>=hook)await a.play();}catch{toast('预览尚未准备好，请稍后播放。');}}else{a.pause();b.pause();}};
  $('seek').oninput=()=>{const b=$('resultVideo');if(Number.isFinite(b.duration))b.currentTime=b.duration*Number($('seek').value)/1000;};
  const syncPlayback=()=>{
    if(!state.previewResult)return;
    const a=$('originalVideo'),b=$('resultVideo');let p={Speed:1};try{p=JSON.parse(state.previewKey);}catch{}
    if(Number.isFinite(b.duration)){
      const creative=state.settings.Mode==='creative',hook=creative?(p.HookDuration||0):0;
      const sourceTime=Math.max(0,Math.min(a.duration||0,creative?Math.max(0,b.currentTime-hook)+(p.TrimStart||0):b.currentTime*p.Speed));
      if(Math.abs(a.currentTime-sourceTime)>.12)a.currentTime=sourceTime;
      if(creative){if(b.paused||b.currentTime<hook)a.pause();else if(a.paused&&!a.ended)a.play().catch(()=>{});}
      $('seek').value=b.currentTime/b.duration*1000;$('playTime').textContent=time(b.currentTime)+' / '+time(b.duration);
    }a.playbackRate=p.Speed;$('play').textContent=b.paused?'播放':'暂停';
  };
  for(const event of ['timeupdate','loadedmetadata','play','pause'])$('resultVideo').addEventListener(event,syncPlayback);
  $('resultVideo').addEventListener('ended',()=>{$('originalVideo').pause();syncPlayback();});
  $('originalVideo').addEventListener('error',()=>{$('sourcePlaybackError').hidden=!$('originalVideo').dataset.url;});
  $('fullscreen').onclick=()=>{$('compare').requestFullscreen().catch(()=>toast('当前窗口无法进入全屏。'));};
  window.addEventListener('resize',()=>requestAnimationFrame(()=>{renderSettingsLayout();renderRows(effective(),state.settings.Ratio);}));
  $('minus').onclick=()=>setSetting('Copies',Math.max(1,state.settings.Copies-1));$('plus').onclick=()=>setSetting('Copies',Math.min(200,state.settings.Copies+1));
  const commitCopies=()=>{if($('copies').disabled)return;const n=Number($('copies').value);if(!Number.isInteger(n)||n<1||n>200){toast('每条生成份数为 1–200。');$('copies').value=state.settings.Copies;return;}if(n!==state.settings.Copies)setSetting('Copies',n);};
  $('copies').onchange=commitCopies;$('copies').onblur=commitCopies;
  $('copies').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();commitCopies();}};
  if(window.chrome&&window.chrome.webview){connected=true;window.chrome.webview.addEventListener('message',e=>{const data=e.data;if(data.type==='state'){state={...state,...data,settings:{...defaults,...data.settings}};syncAutomation();render();}else if(data.type==='toast'){toast(data.text);}});window.chrome.webview.postMessage({type:'ready'});}
  FaceMaskUI.mount($('batchFaceMask'),{send});
  render();
})();
