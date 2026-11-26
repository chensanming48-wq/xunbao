'use strict';
const $=id=>document.getElementById(id);
const icons={erase:'M14 3l7 7-10 10H6l-4-4L14 3z M8 9l7 7 M10 20h12',image:'M3 3h18v18H3z M3 17l6-6 4 4 3-3 5 5 M14 7h.01',swap:'M3 7h17l-4-4 M21 17H4l4 4',scan:'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5 M8 8h8v8H8z',box:'M4 4h3 M11 4h3 M18 4h2v3 M20 11v3 M20 18v2h-3 M13 20h-3 M6 20H4v-3 M4 13v-3',video:'M3 5h13v14H3z M16 10l5-3v10l-5-3',sparkles:'M12 2l2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8z',play:'M7 3l14 9-14 9z',pause:'M7 4v16 M17 4v16',expand:'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5',folder:'M3 6h6l2 3h10l-3 11H2V6z M3 9h18'};
function icon(name){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[name]||icons.box}"/></svg>`;}
document.querySelectorAll('[data-icon]').forEach(x=>x.innerHTML=icon(x.dataset.icon));
let state=null,settings=null,current=null,detections=[],detectionUrl='',queueKey='',drawMode='',drawing=null,dragging=null,selectedRegion=-1,timeCustom=false;
let settingsTab='remove',queuePage=0,regionPage=0,historyPage=0;
let activeCustomSelect=null,customSelectMenu=null,customSelectEventsBound=false;
const esc=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  function ensureCustomSelectMenu() {
    if (customSelectMenu) return customSelectMenu;
    customSelectMenu = document.createElement('div');
    customSelectMenu.className = 'ui-select-menu';
    customSelectMenu.id = 'watermarkSelectMenu';
    customSelectMenu.setAttribute('role', 'listbox');
    customSelectMenu.hidden = true;
    customSelectMenu.addEventListener('click', event => {
      const optionButton = event.target.closest('.ui-select-option');
      if (!optionButton || !activeCustomSelect || optionButton.disabled) return;
      chooseCustomSelectOption(activeCustomSelect, Number(optionButton.dataset.optionIndex));
    });
    customSelectMenu.addEventListener('keydown', event => {
      if (!activeCustomSelect) return;
      const options = [...customSelectMenu.querySelectorAll('.ui-select-option:not(:disabled)')];
      const currentIndex = options.indexOf(document.activeElement);
      if (event.key === 'Escape') {
        event.preventDefault();
        closeCustomSelect(true);
        return;
      }
      if (event.key === 'Tab') {
        // Restore the field before the browser advances to its adjacent control.
        closeCustomSelect(true);
        return;
      }
      let nextIndex = -1;
      if (event.key === 'ArrowDown') nextIndex = Math.min(options.length - 1, currentIndex + 1);
      if (event.key === 'ArrowUp') nextIndex = Math.max(0, currentIndex < 0 ? options.length - 1 : currentIndex - 1);
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = options.length - 1;
      if (nextIndex >= 0) {
        event.preventDefault();
        options[nextIndex].focus();
      }
    });
    document.body.appendChild(customSelectMenu);
    return customSelectMenu;
  }

  function syncCustomSelect(select) {
    if (!select) return;
    const root = select.closest('.ui-select');
    if (!root) return;
    const trigger = root.querySelector('.ui-select-trigger');
    const valueNode = root.querySelector('.ui-select-value');
    const selected = select.selectedOptions && select.selectedOptions[0] || select.options[select.selectedIndex];
    valueNode.textContent = selected ? selected.textContent : '';
    trigger.disabled = !!select.disabled;
    root.classList.toggle('is-disabled', !!select.disabled);
    const fieldLabel = select.getAttribute('aria-label') || select.labels?.[0]?.querySelector(':scope > span')?.textContent || select.labels?.[0]?.textContent.trim() || '下拉选项';
    trigger.setAttribute('aria-label', `${fieldLabel}：${valueNode.textContent}`);
    trigger.title = selected ? selected.textContent : '';
    trigger.style.fontSize = getComputedStyle(select).fontSize;
    if (activeCustomSelect === select && customSelectMenu && !customSelectMenu.hidden) {
      if (select.disabled || !trigger.getClientRects().length) { closeCustomSelect(false); return; }
      renderCustomSelectMenu(select);
      positionCustomSelectMenu(select);
    }
  }

  function renderCustomSelectMenu(select) {
    const menu = ensureCustomSelectMenu();
    const html = [...select.options].map((option, index) => {
      const selected = index === select.selectedIndex;
      return `<button type="button" tabindex="-1" class="ui-select-option${selected ? ' is-selected' : ''}" role="option" aria-selected="${selected}" data-option-index="${index}"${option.disabled ? ' disabled' : ''}><span>${esc(option.textContent)}</span><i aria-hidden="true">✓</i></button>`;
    }).join('');
    // Native state updates must not destroy the option currently used by the keyboard.
    if (menu._optionsHtml === html) return;
    const focusedIndex = menu.contains(document.activeElement) ? document.activeElement.dataset.optionIndex : null;
    menu.innerHTML = html;
    menu._optionsHtml = html;
    if (focusedIndex != null) menu.querySelector(`[data-option-index="${focusedIndex}"]:not(:disabled)`)?.focus({preventScroll:true});
  }

  function positionCustomSelectMenu(select) {
    if (!select || !customSelectMenu || customSelectMenu.hidden) return;
    const trigger = select.closest('.ui-select').querySelector('.ui-select-trigger');
    const triggerRect = trigger.getBoundingClientRect();
    if (!trigger.getClientRects().length) { closeCustomSelect(false); return; }
    customSelectMenu.style.fontSize = getComputedStyle(trigger).fontSize;
    customSelectMenu.style.width = `${Math.min(innerWidth - 16, Math.max(88, triggerRect.width))}px`;
    const below = innerHeight - triggerRect.bottom - 12, above = triggerRect.top - 12;
    const desiredHeight = Math.min(288, select.options.length * 36 + 12);
    const openAbove = below < desiredHeight && above > below;
    customSelectMenu.style.maxHeight = `${Math.max(36, Math.min(288, openAbove ? above : below))}px`;
    customSelectMenu.style.left = '0px';
    customSelectMenu.style.top = '0px';
    const menuRect = customSelectMenu.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(Math.max(margin, triggerRect.left), Math.max(margin, innerWidth - menuRect.width - margin));
    const belowTop = triggerRect.bottom + 4;
    const top = openAbove
      ? Math.max(margin, triggerRect.top - menuRect.height - 4)
      : Math.min(belowTop, innerHeight - menuRect.height - margin);
    customSelectMenu.style.left = `${Math.round(left)}px`;
    customSelectMenu.style.top = `${Math.round(Math.max(margin, top))}px`;
  }

  function openCustomSelect(select) {
    if (!select || select.disabled) return;
    if (activeCustomSelect === select && customSelectMenu && !customSelectMenu.hidden) {
      closeCustomSelect(true);
      return;
    }
    closeCustomSelect(false);
    activeCustomSelect = select;
    const root = select.closest('.ui-select');
    const trigger = root.querySelector('.ui-select-trigger');
    root.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    renderCustomSelectMenu(select);
    const menu = ensureCustomSelectMenu();
    // A modal dialog's top layer excludes menus mounted on document.body.
    (select.closest('dialog[open]') || document.body).appendChild(menu);
    menu.setAttribute('aria-label', trigger.getAttribute('aria-label'));
    menu.hidden = false;
    menu.classList.add('is-open');
    menu.dataset.selectId = select.id;
    positionCustomSelectMenu(select);
    const selected = menu.querySelector('.ui-select-option.is-selected:not(:disabled)') || menu.querySelector('.ui-select-option:not(:disabled)');
    if (selected) { selected.focus({ preventScroll: true }); selected.scrollIntoView({block:'nearest'}); }
  }

  function closeCustomSelect(focusTrigger) {
    if (!activeCustomSelect) return;
    const select = activeCustomSelect;
    const root = select.closest('.ui-select');
    const trigger = root && root.querySelector('.ui-select-trigger');
    if (root) root.classList.remove('is-open');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    if (customSelectMenu) {
      customSelectMenu.classList.remove('is-open');
      customSelectMenu.hidden = true;
      customSelectMenu.innerHTML = '';
      customSelectMenu._optionsHtml = null;
      delete customSelectMenu.dataset.selectId;
    }
    activeCustomSelect = null;
    if (focusTrigger && trigger) trigger.focus({ preventScroll: true });
  }

  function chooseCustomSelectOption(select, optionIndex) {
    const option = select.options[optionIndex];
    if (select.disabled || !option || option.disabled) return;
    const changed = select.selectedIndex !== optionIndex;
    select.selectedIndex = optionIndex;
    syncCustomSelect(select);
    if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
    closeCustomSelect(true);
  }

  function enhanceSelects() {
    ensureCustomSelectMenu();
    document.querySelectorAll('select:not([data-ui-enhanced])').forEach(select => {
      select.dataset.uiEnhanced = 'true';
      select.classList.add('ui-select-native');
      select.setAttribute('aria-hidden', 'true');
      select.tabIndex = -1;
      const root = document.createElement('div');
      root.className = 'ui-select';
      root.dataset.selectId = select.id;
      select.parentNode.insertBefore(root, select);
      root.appendChild(select);
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.id = select.id + 'Trigger';
      trigger.className = 'ui-select-trigger';
      trigger.setAttribute('aria-haspopup', 'listbox');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-controls', 'watermarkSelectMenu');
      if (select.hasAttribute('aria-describedby')) trigger.setAttribute('aria-describedby', select.getAttribute('aria-describedby'));
      trigger.innerHTML = '<span class="ui-select-value"></span><i class="ui-select-arrow" aria-hidden="true"></i>';
      root.appendChild(trigger);
      [...select.labels].forEach(label => label.addEventListener('click', event => { event.preventDefault(); if (!trigger.disabled) trigger.focus(); }));
      trigger.addEventListener('click', () => openCustomSelect(select));
      trigger.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openCustomSelect(select);
        }
      });
      select.addEventListener('change', () => syncCustomSelect(select));
      syncCustomSelect(select);
    });
    document.querySelectorAll('select[data-ui-enhanced]').forEach(syncCustomSelect);
    if (!customSelectEventsBound) {
      customSelectEventsBound = true;
      document.addEventListener('pointerdown', event => {
        if (!activeCustomSelect) return;
        const root = activeCustomSelect.closest('.ui-select');
        if (!root.contains(event.target) && !customSelectMenu.contains(event.target)) closeCustomSelect(false);
      });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && activeCustomSelect) {
          event.preventDefault();
          closeCustomSelect(true);
        }
      });
      document.addEventListener('scroll', () => positionCustomSelectMenu(activeCustomSelect), true);
      window.addEventListener('resize', () => { closeCustomSelect(false); document.querySelectorAll('select[data-ui-enhanced]').forEach(syncCustomSelect); });
    }
  }


function syncCustomSelects(){document.querySelectorAll('select[data-ui-enhanced]').forEach(syncCustomSelect);}
const splitSettings=()=>false; // Shared fixed-height UI always uses the two-step settings tabs.
const modeNames={both:'去除后添加',remove:'仅去除水印',add:'仅添加水印'};
const queuePageSize=()=>window.innerWidth<1100?2:3;
const regionPageSize=()=>settings?.Mode==='both'||window.innerHeight<850?1:window.innerHeight<1000?2:3;
function pager(prefix,page,total){const pages=Math.max(1,total);$(prefix+'Pager').hidden=pages<=1;$(prefix+'PageLabel').textContent=`${page+1} / ${pages}`;$(prefix+'Prev').disabled=Boolean(state?.busy)||page<=0;$(prefix+'Next').disabled=Boolean(state?.busy)||page>=pages-1;}
function renderSettingsTabs(){
 watermarkAddUi.tab(settingsTab);
 const both=settings.Mode==='both';let stacked=both&&splitSettings();
 document.body.dataset.mode=settings.Mode;document.body.classList.toggle('stacked-settings',stacked);
 $('settingsTabs').hidden=!both||stacked;
 $('removeSection').hidden=settings.Mode==='add'||(both&&!stacked&&settingsTab!=='remove');
 $('addSection').hidden=settings.Mode==='remove'||(both&&!stacked&&settingsTab!=='add');
 if(stacked&&document.querySelector('.settings').scrollHeight>document.querySelector('.settings').clientHeight+1){
  stacked=false;document.body.classList.remove('stacked-settings');$('settingsTabs').hidden=false;
  $('removeSection').hidden=settingsTab!=='remove';$('addSection').hidden=settingsTab!=='add';
 }
 $('addNumber').textContent=both?'02':'01';
 ['remove','add'].forEach(name=>{$(name+'Tab').setAttribute('aria-selected',String(settingsTab===name));$(name+'Tab').tabIndex=settingsTab===name?0:-1;});
 syncCustomSelects();
 requestAnimationFrame(resizeFrames);
}
const bridge=window.chrome?.webview;
const clone=x=>JSON.parse(JSON.stringify(x));
const send=(command,payload={})=>{if(bridge)bridge.postMessage({type:'command',command,payload});else toast('请从创爆软件中打开此页面。');};
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,5000);}
const sec=n=>{n=Math.max(0,Math.floor(Number(n)||0));return(n>=3600?`${Math.floor(n/3600)}:`:'')+`${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;};
const fmt=n=>Number(n||0).toFixed(1).replace(/\.0$/,'');
function dimensions(){let w=current?.Media.Width||16,h=current?.Media.Height||9;w*=current?.Media.Sar||1;const r=Math.abs((current?.Media.Rotation||0)%180);return r>45&&r<135?[h,w]:[w,h];}
function commit(){if(!settings)return;if(selectedRegion>=0)regionPage=Math.floor((selectedRegion+(current?.Detected&&settings.Method==='auto'&&current.DetectionCount?1:0))/regionPageSize());send('settings',settings);if(current)current.Result='';renderSettings();renderPreview();}
function setSource(el,url){if(el.dataset.src!==url){el.pause();el.dataset.src=url||'';if(url){el.src=url;el.load();}else{el.removeAttribute('src');el.load();}}}
function updateState(next){
 const oldId=current?.Media.Id;state=next;current=state.items.find(x=>x.Media.Id===state.selectedId)||null;
 if(!dragging&&!drawing)settings=clone(state.settings);
 if(oldId!==current?.Media.Id){selectedRegion=-1;regionPage=0;drawMode='';timeCustom=Boolean(settings.Start||settings.End);const index=state.items.findIndex(x=>x.Media.Id===state.selectedId);if(index>=0)queuePage=Math.floor(index/queuePageSize());}
 document.body.classList.toggle('busy',state.busy);
 renderSettings();renderQueue();renderPreview();
 $('count').textContent=`${state.items.length} 个`;$('summary').textContent=state.items.length?`已选择 ${state.items.length} 个视频`:'尚未添加视频';
 $('modeSummary').textContent=modeNames[settings.Mode]+' · 保持原比例';
 $('startLabel').textContent=`开始处理${state.items.length?' '+state.items.length+' 个视频':''}`;
 $('message').textContent=state.message;$('message').title=state.message;$('outputPath').textContent=state.output||'请选择输出目录';$('outputPath').title=state.output;
 $('progress').hidden=!state.busy;$('progress').value=state.progress;$('previewBadge').textContent=current?.Result?'真实处理预览':'布局预览';$('previewBadge').classList.toggle('real',Boolean(current?.Result));
 document.querySelectorAll('button,input,select').forEach(el=>{if(el.closest('dialog')||['help','history','openOutput'].includes(el.id))return;el.disabled=state.busy;});
 $('cancel').disabled=!state.busy;
 ['detect','preview','drawRemove','drawProtect','applyAll','chooseImage','play','timeline','fullscreen'].forEach(id=>$(id).disabled=state.busy||!current);
 $('start').disabled=state.busy||!state.items.length||!state.output||!state.toolsReady;
 $('openOutput').disabled=!state.output;
 pager('queue',queuePage,Math.ceil(state.items.length/queuePageSize()));pager('region',regionPage,Math.ceil((settings.Regions.length+(current?.Detected&&settings.Method==='auto'&&current.DetectionCount?1:0))/regionPageSize()));
 syncCustomSelects();
 if($('historyDialog').open)renderHistory();
 watermarkAddUi.sync(settings,state,current);
 const url=current?.DetectionUrl||'';
 if(url!==detectionUrl){detectionUrl=url;detections=[];if(url)fetch(url).then(r=>{if(!r.ok)throw Error('检测区域读取失败');return r.json();}).then(x=>{if(detectionUrl===url){detections=x;renderBoxes();}}).catch(e=>toast(e.message));}
}
function renderSettings(){
 watermarkAddUi.before(settings);
 if(!settings)return;
 document.querySelectorAll('button[data-key]').forEach(b=>b.classList.toggle('active',settings[b.dataset.key]===b.dataset.value));
 document.querySelectorAll('input[data-key],select[data-key]').forEach(el=>{if(document.activeElement!==el)el.value=settings[el.dataset.key];});
 renderSettingsTabs();$('textFields').hidden=settings.Kind!=='text';$('imageFields').hidden=settings.Kind!=='image';
 $('pageSubtitle').textContent=({both:'去除旧水印，添加品牌标识，一次完成。',remove:'识别视频水印，修复画面，原视频保留。',add:'添加文字或图片水印，统一视频品牌标识。'})[settings.Mode];
 $('resultTitle').textContent=settings.Mode==='add'?'添加水印后':'处理后';
 $('resultLegend').textContent=settings.Mode==='remove'?'修复后':'新增水印';
 $('opacityValue').textContent=Math.round(settings.Opacity*100)+'%';$('qualityHint').textContent=settings.Quality==='ai'?'本机 AI 修复，先检查识别框，再生成预览。':'快速修复适合纯色、纹理简单的背景。';
 $('detectionSummary').textContent=current?.Detected?(current.DetectionCount?`检测到 ${current.DetectionCount} 段识别区域`:'未检测到区域'):'尚未检测水印与字幕';
 $('detect').textContent=current?.Detected?'↻ 重新检测':'↻ 检测水印';$('detect').hidden=settings.Method!=='auto';
 $('imageName').textContent=current?.ImageUrl?'重新选择水印图片':'选择 PNG / JPG 水印图片';
 if(settings.Start||settings.End)timeCustom=true;
 $('timeMode').value=timeCustom?'custom':'all';$('timeFields').hidden=!timeCustom;
 if(document.activeElement!==$('startTime'))$('startTime').value=settings.Start;
 if(document.activeElement!==$('endTime'))$('endTime').value=settings.End;
 renderRegions();renderBoxes();renderSettingsTabs();
 watermarkAddUi.sync(settings,state,current);
}
function renderRegions(){
 const root=$('regions');root.replaceChildren();
 const auto=Boolean(current?.Detected&&settings.Method==='auto'&&current.DetectionCount),size=regionPageSize(),total=settings.Regions.length+(auto?1:0);
 regionPage=Math.max(0,Math.min(regionPage,Math.max(0,Math.ceil(total/size)-1)));const first=regionPage*size,last=first+size;
 if(auto&&first===0){
   const row=document.createElement('div');row.className='region';const input=document.createElement('input');input.type='checkbox';input.checked=settings.AutoEnabled;input.setAttribute('aria-label','启用自动识别区域');input.onchange=()=>{settings.AutoEnabled=input.checked;commit();};
   const sw=document.createElement('i');sw.className='swatch';const label=document.createElement('span');label.textContent=`自动识别区域 · ${current.DetectionCount} 段`;row.append(input,sw,label);root.append(row);
 }
 settings.Regions.forEach((r,i)=>{if(i+(auto?1:0)<first||i+(auto?1:0)>=last)return;const row=document.createElement('div');row.className='region'+(r.protect?' protect':'')+(i===selectedRegion?' selected':'');row.tabIndex=0;row.setAttribute('role','button');row.setAttribute('aria-label','编辑区域 '+(i+1));row.onkeydown=e=>{if(e.target===row&&(e.key==='Enter'||e.key===' ')){e.preventDefault();selectedRegion=i;renderRegions();}};
   const input=document.createElement('input');input.type='checkbox';input.checked=r.enabled;input.setAttribute('aria-label','启用区域 '+(i+1));input.onchange=()=>{r.enabled=input.checked;commit();};input.onclick=e=>e.stopPropagation();
   const sw=document.createElement('i');sw.className='swatch';const label=document.createElement('span');label.textContent=`${r.protect?'保护':'去除'}区域 ${i+1} · ${sec(r.start)}–${sec(Math.min(r.end,current?.Media.Duration||r.end))}`;
   const del=document.createElement('button');del.textContent='×';del.setAttribute('aria-label','删除区域 '+(i+1));del.onclick=e=>{e.stopPropagation();settings.Regions.splice(i,1);selectedRegion=-1;commit();};row.onclick=()=>{selectedRegion=i;renderRegions();};row.append(input,sw,label,del);root.append(row);
 });
 pager('region',regionPage,Math.ceil(total/size));
 const r=settings.Regions[selectedRegion];$('regionTime').hidden=!r;if(r){if(document.activeElement!==$('regionStart'))$('regionStart').value=r.start;if(document.activeElement!==$('regionEnd'))$('regionEnd').value=Math.min(r.end,current?.Media.Duration||r.end);}
}
function renderQueue(){
 const size=queuePageSize();queuePage=Math.max(0,Math.min(queuePage,Math.max(0,Math.ceil(state.items.length/size)-1)));pager('queue',queuePage,Math.ceil(state.items.length/size));
 const key=JSON.stringify(state.items.map(x=>[x.Media.Id,x.Media.Status,x.Media.Error]))+state.selectedId+':'+queuePage+':'+size;if(queueKey===key)return;queueKey=key;$('queue').replaceChildren();
 state.items.slice(queuePage*size,(queuePage+1)*size).forEach(item=>{const m=item.Media,tile=document.createElement('div');tile.className='tile'+(m.Id===state.selectedId?' active':'');tile.tabIndex=state.busy?-1:0;tile.setAttribute('role','button');tile.setAttribute('aria-label','选择视频 '+m.Name);tile.onclick=()=>{if(!state.busy)send('select',{id:m.Id});};tile.onkeydown=e=>{if(e.target===tile&&(e.key==='Enter'||e.key===' ')){e.preventDefault();tile.click();}};
   const img=document.createElement('img');img.className='thumb';img.src=m.Thumbnail;img.alt='';const duration=document.createElement('span');duration.className='duration';duration.textContent=sec(m.Duration);
   const name=document.createElement('div');name.className='name';name.textContent=m.Name;name.title=m.Name;
   const status=document.createElement('div');status.className='resultStatus'+(m.Error?' failed':'');status.textContent=m.Status;status.title=m.Error||m.Status;
   const del=document.createElement('button');del.className='delete';del.textContent='×';del.setAttribute('aria-label','移除 '+m.Name);del.onclick=e=>{e.stopPropagation();send('remove',{id:m.Id});};tile.append(img,duration,del,name,status);$('queue').append(tile);
 });
 $('queueHint').textContent=state.items.length?`当前 ${queuePage*size+1}–${Math.min((queuePage+1)*size,state.items.length)} / ${state.items.length} 个`:'原视频保留，结果另存。';$('queueHint').hidden=false;
}
function renderPreview(){
 $('selectedName').textContent=current?.Media.Name||'';
 ['source','result'].forEach(type=>{const exists=Boolean(current?.Original);$(type+'Frame').hidden=!exists;$(type+'Stage').querySelector('.empty').hidden=exists;});
 setSource($('originalVideo'),current?.Original||'');setSource($('resultVideo'),current?.Result||current?.Original||'');
 $('resultPoster').hidden=true;$('originalVideo').muted=false;$('resultVideo').muted=true;
 $('timeline').max=Math.max(0,(current?.Media.Duration||1)-.04);
 if(document.activeElement!==$('timeline'))$('timeline').value=(current?.PreviewStart||0)+($('originalVideo').currentTime||0);
 $('timeLabel').textContent=`${sec(Number($('timeline').value))} / ${sec(current?.Media.Duration)}`;
 $('realHint').textContent=current?.Result?'当前为真实处理效果':settings.Mode==='add'?'生成预览后查看实际水印效果。':'生成预览后查看真实修复效果。';
 resizeFrames();renderStamp();renderBoxes();
 watermarkAddUi.sync(settings,state,current);
}
function resizeFrames(){
 const [w,h]=dimensions();['source','result'].forEach(type=>{const box=$(type+'Stage'),frame=$(type+'Frame');const scale=Math.min(box.clientWidth/w,box.clientHeight/h);frame.style.width=w*scale+'px';frame.style.height=h*scale+'px';});renderStamp();
}
function renderStamp(){
 const el=$('stamp');if(!settings||!current){el.hidden=true;return;}
 const t=(current.PreviewStart||0)+($('originalVideo').currentTime||0),s=settings;
 el.hidden=s.Mode==='remove'||t<s.Start||(s.End>0&&t>=s.End);if(el.hidden)return;
 const frame=$('resultFrame'),[w]=dimensions(),width=frame.clientWidth;
 el.style.left=(s.X*100)+'%';el.style.top=(s.Y*100)+'%';el.style.width=s.Kind==='image'?`${s.Size*100}%`:'max-content';el.style.maxWidth='95%';
 $('stampText').hidden=s.Kind!=='text';$('stampImage').hidden=s.Kind!=='image';
 $('stampText').textContent=s.Text||'输入水印文字';$('stampText').style.fontSize=Math.max(3,s.FontSize*width/1080)+'px';$('stampText').style.color=s.Color;
 if($('stampImage').dataset.src!==(current.ImageUrl||'')){$('stampImage').dataset.src=current.ImageUrl||'';if(current.ImageUrl)$('stampImage').src=current.ImageUrl;else $('stampImage').removeAttribute('src');}
 $('stampText').style.opacity=current.Result?'0':s.Opacity;$('stampImage').style.opacity=current.Result?'0':s.Opacity;
 // Keep drag handles inside the actual picture, independent of letterboxing.
 el.style.left=Math.max(0,Math.min(s.X*width,width-el.offsetWidth))+'px';el.style.top=Math.max(0,Math.min(s.Y*frame.clientHeight,frame.clientHeight-el.offsetHeight))+'px';
}
function renderBoxes(){
 const root=$('sourceOverlays');root.replaceChildren();if(!settings||settings.Mode==='add')return;
 const t=(current?.PreviewStart||0)+($('originalVideo').currentTime||0);
 const add=(r,label)=>{if(!r.enabled||t<r.start||t>=r.end)return;const d=document.createElement('div');d.className='box'+(r.protect?' protect':'');Object.assign(d.style,{left:r.x*100+'%',top:r.y*100+'%',width:r.w*100+'%',height:r.h*100+'%'});if(label){const b=document.createElement('b');b.textContent=label;d.append(b);}root.append(d);};
 if(settings.Method==='auto'&&settings.AutoEnabled)detections.filter(r=>r.start<=t&&r.end>t).slice(0,100).forEach(r=>add(r,''));
 settings.Regions.forEach((r,i)=>add(r,(r.protect?'保护 ':'去除 ')+(i+1)));
}
document.querySelectorAll('button[data-key]').forEach(b=>b.onclick=()=>{settings[b.dataset.key]=b.dataset.value;if(b.dataset.key==='Mode'){drawMode='';drawing=null;$('drawBox').hidden=true;$('sourceFrame').classList.remove('drawing');}if(b.dataset.key==='Method'&&b.dataset.value==='manual')setDraw(false);commit();});
['remove','add'].forEach(name=>{$(name+'Tab').onclick=()=>{settingsTab=name;renderSettingsTabs();};$(name+'Tab').onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();settingsTab=e.key==='Home'?'remove':e.key==='End'?'add':settingsTab==='remove'?'add':'remove';renderSettingsTabs();$(settingsTab+'Tab').focus();}};});
['queue','region'].forEach(prefix=>['Prev','Next'].forEach(direction=>$(prefix+direction).onclick=()=>{if(state?.busy)return;const delta=direction==='Prev'?-1:1;if(prefix==='queue'){queuePage+=delta;renderQueue();}else{regionPage+=delta;selectedRegion=-1;renderRegions();}}));
window.addEventListener('resize',()=>{if(!state)return;queueKey='';renderSettingsTabs();renderQueue();renderRegions();});
document.querySelectorAll('input[data-key],select[data-key]').forEach(el=>el.addEventListener('change',()=>{const v=['number','range'].includes(el.type)?Number(el.value):el.value;settings[el.dataset.key]=v;commit();}));
['add','folder','output','cancel','openOutput','detect','preview','start','applyAll'].forEach(id=>$(id).onclick=()=>send(id));
 $('chooseImage').onclick=()=>send('image');
function setDraw(protect){if(!current?.Original){toast('请先添加视频。');return;}drawMode=protect?'protect':'remove';$('sourceFrame').classList.add('drawing');$('drawHint').textContent=protect?'在原视频上拖动，框出要保留的区域。':'在原视频上拖动，框出要去除的区域。';}
$('drawRemove').onclick=()=>setDraw(false);$('drawProtect').onclick=()=>setDraw(true);
const point=(e,frame)=>{const b=frame.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-b.left)/b.width)),y:Math.max(0,Math.min(1,(e.clientY-b.top)/b.height))};};
$('sourceFrame').addEventListener('pointerdown',e=>{if(!drawMode||state.busy)return;const p=point(e,$('sourceFrame'));drawing={...p,pointer:e.pointerId};$('sourceFrame').setPointerCapture(e.pointerId);$('originalVideo').pause();$('resultVideo').pause();$('drawBox').hidden=false;$('drawBox').className=drawMode==='protect'?'protect':'';});
$('sourceFrame').addEventListener('pointermove',e=>{if(!drawing)return;const p=point(e,$('sourceFrame'));Object.assign($('drawBox').style,{left:Math.min(p.x,drawing.x)*100+'%',top:Math.min(p.y,drawing.y)*100+'%',width:Math.abs(p.x-drawing.x)*100+'%',height:Math.abs(p.y-drawing.y)*100+'%'});});
$('sourceFrame').addEventListener('pointerup',e=>{if(!drawing)return;const p=point(e,$('sourceFrame')),x=Math.min(p.x,drawing.x),y=Math.min(p.y,drawing.y),w=Math.abs(p.x-drawing.x),h=Math.abs(p.y-drawing.y);if(w>.005&&h>.005){settings.Regions.push({x,y,w,h,start:0,end:current.Media.Duration,protect:drawMode==='protect',enabled:true});selectedRegion=settings.Regions.length-1;}drawing=null;drawMode='';$('drawBox').hidden=true;$('sourceFrame').classList.remove('drawing');$('drawHint').textContent='保护区域中的商品文字与信息会保留。';commit();});
$('sourceFrame').addEventListener('pointercancel',()=>{drawing=null;drawMode='';$('drawBox').hidden=true;});
$('stamp').addEventListener('pointerdown',e=>{if(state.busy)return;e.preventDefault();const p=point(e,$('resultFrame'));dragging={x:p.x-settings.X,y:p.y-settings.Y};$('stamp').setPointerCapture(e.pointerId);});
$('stamp').addEventListener('pointermove',e=>{if(!dragging)return;const p=point(e,$('resultFrame')),f=$('resultFrame'),s=$('stamp');settings.X=Math.max(0,Math.min(1-s.offsetWidth/f.clientWidth,p.x-dragging.x));settings.Y=Math.max(0,Math.min(1-s.offsetHeight/f.clientHeight,p.y-dragging.y));if(current.Result){current.Result='';setSource($('resultVideo'),current.Original);}renderStamp();});
$('stamp').addEventListener('pointerup',()=>{if(dragging){dragging=null;commit();}});
$('stamp').addEventListener('pointercancel',()=>{dragging=null;commit();});
$('stamp').addEventListener('keydown',e=>{const d={ArrowLeft:[-.01,0],ArrowRight:[.01,0],ArrowUp:[0,-.01],ArrowDown:[0,.01]}[e.key];if(d){e.preventDefault();settings.X=Math.max(0,Math.min(1,settings.X+d[0]));settings.Y=Math.max(0,Math.min(1,settings.Y+d[1]));commit();}});
$('regionSave').onclick=()=>{const r=settings.Regions[selectedRegion];if(!r)return;const start=Number($('regionStart').value),end=Number($('regionEnd').value);if(!(end>start)||start<0||end>current.Media.Duration+.01){toast('请输入视频时长内的有效区域时段。');return;}r.start=start;r.end=end;commit();};
$('timeMode').onchange=()=>{timeCustom=$('timeMode').value==='custom';if(!timeCustom){settings.Start=0;settings.End=0;}else{settings.End=current?.Media.Duration||5;}commit();};
$('position').onchange=()=>{const p=$('position').value;if(p==='custom')return;const f=$('resultFrame'),s=$('stamp'),right=Math.max(.02,1-s.offsetWidth/f.clientWidth-.04),bottom=Math.max(.02,1-s.offsetHeight/f.clientHeight-.04);const positions={tl:[.04,.04],tr:[right,.04],bl:[.04,bottom],br:[right,bottom],center:[(1-s.offsetWidth/f.clientWidth)/2,(1-s.offsetHeight/f.clientHeight)/2]};[settings.X,settings.Y]=positions[p];commit();};
$('timeline').oninput=()=>{$('timeLabel').textContent=`${sec($('timeline').value)} / ${sec(current?.Media.Duration)}`;};
$('timeline').onchange=()=>send('seek',{time:Number($('timeline').value)});
$('play').onclick=()=>{const a=$('originalVideo'),b=$('resultVideo');if(a.paused){if(a.ended){a.currentTime=0;b.currentTime=0;}b.currentTime=a.currentTime;a.play().catch(e=>toast('原视频暂时无法播放：'+e.message));b.play().catch(()=>{});}else{a.pause();b.pause();}};
$('originalVideo').addEventListener('timeupdate',()=>{const t=(current?.PreviewStart||0)+$('originalVideo').currentTime;if(document.activeElement!==$('timeline'))$('timeline').value=t;$('timeLabel').textContent=`${sec(t)} / ${sec(current?.Media.Duration)}`;if(Math.abs($('resultVideo').currentTime-$('originalVideo').currentTime)>.2)$('resultVideo').currentTime=$('originalVideo').currentTime;renderStamp();renderBoxes();});
['play','pause','ended'].forEach(name=>$('originalVideo').addEventListener(name,()=>{$('play').innerHTML=icon($('originalVideo').paused?'play':'pause');if(name==='ended')$('resultVideo').pause();}));
$('originalVideo').addEventListener('loadedmetadata',resizeFrames);$('resultVideo').addEventListener('loadedmetadata',()=>{$('resultVideo').currentTime=$('originalVideo').currentTime||0;renderStamp();});
$('stampImage').onload=renderStamp;
$('fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else $('resultVideo').requestFullscreen().catch(()=>toast('当前环境不支持全屏。'));};
$('help').onclick=()=>$('helpDialog').showModal();$('closeHelp').onclick=()=>$('helpDialog').close();
function renderHistory(){
 const items=state?.items||[],size=5,pages=Math.max(1,Math.ceil(items.length/size));historyPage=Math.max(0,Math.min(historyPage,pages-1));
 const list=$('historyList');list.replaceChildren();
 if(!items.length){const p=document.createElement('p');p.className='history-empty';p.textContent='暂无处理记录，添加视频后开始处理。';list.append(p);}
 items.slice(historyPage*size,(historyPage+1)*size).forEach(item=>{const row=document.createElement('div');row.className='history-row';const name=document.createElement('strong'),detail=document.createElement('span'),status=document.createElement('span');name.textContent=item.Media.Name;name.title=item.Media.Name;detail.textContent=item.Media.Error||item.Media.LastOutput||'尚未生成成片';detail.title=detail.textContent;detail.className='hint';status.textContent=item.Media.Status||'待处理';status.className='record-status';row.append(name,status,detail);list.append(row);});
 $('historyPageLabel').textContent=`${historyPage+1} / ${pages}`;$('historyPrev').disabled=historyPage<=0;$('historyNext').disabled=historyPage>=pages-1;$('historyOutput').disabled=!state?.output;
}
$('history').onclick=()=>{historyPage=0;renderHistory();$('historyDialog').showModal();};
$('closeHistory').onclick=()=>$('historyDialog').close();
$('historyPrev').onclick=()=>{historyPage--;renderHistory();};$('historyNext').onclick=()=>{historyPage++;renderHistory();};
$('historyOutput').onclick=()=>send('openOutput');
new ResizeObserver(resizeFrames).observe($('sourceStage'));
enhanceSelects();
if(bridge){bridge.addEventListener('message',e=>{if(e.data.type==='state')updateState(e.data);if(e.data.type==='toast')toast(e.data.text);});bridge.postMessage({type:'ready'});}else{$('message').textContent='等待连接创爆本地引擎';}
