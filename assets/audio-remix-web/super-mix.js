(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = (v, digits=1) => Number(v || 0).toLocaleString('zh-CN', {maximumFractionDigits:digits});
  const clock = v => `${String(Math.floor(Number(v || 0)/60)).padStart(2,'0')}:${String(Math.floor(Number(v || 0)%60)).padStart(2,'0')}`;
  const mb = v => number(Number(v)/1024/1024,0);
  let state = null, renderKey = '', previewId = '', wasRenderedPreview = false;
  const bridge = window.chrome?.webview;
  function post(command,payload={}) { if (!bridge) { notify('请在创爆主程序中使用文件选择和生成'); return; } bridge.postMessage({type:'superCommand',command,payload}); }
  function current() { return state?.project.products.find(p=>p.id===state.project.selectedId); }
  function notify(text) { $('smNotice').textContent=text; $('smNotice').hidden=false; }
  const modeBar = document.createElement('section'); modeBar.className='sm-modes panel'; modeBar.id='superModeBar';
  const modes=$('modeTabs'); if (!modes) return;
  modeBar.innerHTML='<h2 class="cm-plan-title">1　选择方案</h2>';
  modeBar.appendChild(modes); document.querySelector('.header').after(modeBar);
  const root=document.createElement('div'); root.id='superWorkspace'; root.className='sm-root'; root.hidden=true;
  root.innerHTML=`<div id="smNotice" role="status" hidden></div><main class="sm-grid"><section class="panel sm-top"><div id="smPlan"></div><div id="smMaterials"></div></section><section id="smPackaging" class="panel sm-packaging"></section><div id="smSoundWatermark"></div><section class="panel sm-preview"><h2>画面预览</h2><div class="sm-preview-stage"><div id="smVideoFrame"><video id="smVideo" controls playsinline preload="metadata"></video><span id="smWatermark" aria-hidden="true"></span><div id="smVideoEmpty"><span aria-hidden="true">▶</span><p>导入后查看预览</p></div></div></div><button data-sm-action="preview" class="button secondary sm-wide">查看预览</button><span id="smRatio" hidden></span><p id="smPreviewHint" hidden></p></section><section id="smSettings" class="panel sm-settings"></section></main><footer class="sm-footer panel"><strong>输出目录</strong><input id="smOutputPath" data-sm-action="pickOutput" class="sm-path" readonly aria-label="输出目录" placeholder="请选择输出目录"><button data-sm-action="pickOutput" class="button secondary">更改目录</button><button data-sm-action="openOutput" class="button secondary">打开目录</button><button id="smStart" data-sm-action="start" class="button primary">生成视频</button><button id="smCancel" data-sm-action="cancel" class="button secondary" hidden>取消任务</button></footer></div>`;
  document.querySelector('.app').appendChild(root);
  document.body.insertAdjacentHTML('beforeend',`<dialog id="smResults" class="sm-dialog"><div class="sm-heading"><h2>超级混剪 · 成片结果</h2><button data-sm-close="smResults" aria-label="关闭">关闭</button></div><p id="smResultsSummary"></p><div class="sm-results-scroll"><table><thead><tr><th>商品 / 序号</th><th>状态</th><th>进度 / 剩余</th><th>时长</th><th>操作</th></tr></thead><tbody id="smResultRows"></tbody></table></div><details open><summary>运行记录</summary><pre id="smLogs"></pre></details></dialog><dialog id="smRename" class="sm-dialog sm-small"><form method="dialog"><h2>重命名商品</h2><input id="smName" maxlength="60" required aria-label="商品名称"><div class="sm-dialog-actions"><button value="cancel">取消</button><button id="smRenameSave" type="button" class="button primary">保存</button></div></form></dialog><dialog id="smAssets" class="sm-dialog sm-small"><div class="sm-heading"><h2>素材库与全局设置</h2><button data-sm-close="smAssets">关闭</button></div><div id="smAssetContent"></div></dialog>`);
  function markModes() {
    modes.querySelectorAll('[data-mode]').forEach(b=>{const selected=api.active?b.dataset.mode==='超级混剪':b.dataset.mode===lastLegacyMode;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));});
    if(api.active){$('showResults').textContent='成片历史';const title=document.querySelector('.title-block');if(title&&!title.querySelector('.sm-header-hint'))title.insertAdjacentHTML('beforeend','<span class="sm-header-hint">先选方案，再导入素材</span>');}
  }
  let lastLegacyMode='智能混剪';
  const api=window.SuperMixUI={active:false,enter(){
    api.active=true; document.body.classList.add('super-active'); root.hidden=false; markModes();
    for(const id of ['previewVideo','sourceAudio','resultVideo']) $(id)?.pause();
    window.CustomRemixUI?.modeChanged(); $('smPlan').append(modeBar); post('ready'); render();
  },leave(){dropdown.close();api.active=false;document.querySelector('.header').after(modeBar);document.body.classList.remove('super-active');root.hidden=true;$('smVideo').pause();markModes();window.CustomRemixUI?.modeChanged();}};
  document.querySelector('.header').addEventListener('click',e=>{if(!api.active)return; const target=e.target.closest('button');if(!target)return;
    if(target.id==='showResults'){e.preventDefault();e.stopImmediatePropagation();renderResults();$('smResults').showModal();}
    if(target.id==='saveTemplate'){e.preventDefault();e.stopImmediatePropagation();post('saveTemplate');}
  },true);
  const actionButton=(action,label,extra='')=>`<button class="button secondary" data-sm-action="${action}" ${extra}>${label}</button>`;
  const select=(field,options,value)=>`<select data-sm-field="${field}" aria-label="${field}">${options.map(([v,l])=>`<option value="${esc(v)}"${String(value)===String(v)?' selected':''}>${esc(l)}</option>`).join('')}</select>`;
  const input=(field,value,extra='')=>`<input data-sm-field="${field}" value="${esc(value)}" ${extra}>`;
  const moduleSwitch=(field,checked,label)=>`<label class="sm-switch" title="${checked?'关闭':'开启'}${label}"><input role="switch" aria-label="${label}" type="checkbox" data-sm-field="${field}"${checked?' checked':''}><span aria-hidden="true"></span></label>`;
  const toggle=(field,checked,label)=>`<label class="sm-check"><input type="checkbox" data-sm-field="${field}"${checked?' checked':''}>${label}</label>`;
  const segment=(field,values,value)=>`<div class="sm-segments">${values.map(([v,label])=>`<button data-sm-set="${field}" data-value="${esc(v)}" aria-pressed="${v===value}" class="${v===value?'selected':''}">${label}</button>`).join('')}</div>`;
  const ratio=m=>{if(!m?.height)return '';let v=m.width/m.height;return Math.abs(v-9/16)<.06?'9:16':Math.abs(v-16/9)<.06?'16:9':`${m.width}:${m.height}`;};
  function mediaCard(m,index,image=false) {
    return `<article class="sm-media ${m.valid?'':'invalid'}" title="${esc(m.error||m.name)}"><button class="sm-delete" data-sm-action="removeMedia" data-id="${m.id}" aria-label="删除${esc(m.name)}">×</button><button class="sm-thumbnail" data-sm-preview="${m.id}" aria-label="预览${esc(m.name)}">${m.thumbnail?`<img src="${esc(m.thumbnail)}" alt="${esc(m.name)}">`:'<span>素材检查未通过</span>'}<span class="sm-stamp">${image?(m.white?'白底':'非白底'):clock(m.duration)}</span></button><strong>${index+1}. ${esc(m.name)}</strong><small>${m.width}×${m.height}${image?'':` · ${ratio(m)}`}</small>${m.valid?'':`<span class="sm-error">${esc(m.error||'不参与组合')}</span>`}</article>`;
  }
  function render() {
    if(!state){$('smMaterials').innerHTML='<div class="sm-empty">正在连接超级混剪…</div>';return;}
    const p=current(); if(!p)return;
    const e=state.estimates[p.id]||{};
    const key=JSON.stringify([state.project,state.estimates,state.assets,state.warnings]);
    if(key!==renderKey && !root.contains(document.activeElement?.closest('input:focus,select:focus'))){
      renderKey=key;
      $('smMaterials').innerHTML=`<h2>2　导入素材</h2><div class="sm-source-strip ${p.videos.length?'has-media':''}">${p.videos.length?p.videos.map((m,i)=>mediaCard(m,i)).join(''):''}<button data-sm-action="pickVideos" class="sm-drop ${p.videos.length?'sm-add-more':''}"><span class="sm-plus">＋</span><strong>${p.videos.length?'导入素材':'导入主视频和补充素材'}</strong>${p.videos.length?'':'<small>上传后将按素材顺序组合生成多条混剪成片</small>'}</button></div>
      <div class="sm-optional"><section class="sm-option-card"><div class="sm-option-heading"><span class="sm-icon gold" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4l6 6M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z"/></svg></span><h3>黄金开场</h3>${toggle('introEnabled',p.introEnabled,'启用专属开场')}${actionButton('pickIntros','添加开场视频',p.intros.length>=3||!p.introEnabled?'disabled':'')}</div>${p.intros.length?`<fieldset class="sm-module-body sm-intro-body" ${p.introEnabled?'':'disabled'}><div class="sm-intros">${p.intros.map(m=>`<div class="sm-intro" title="${esc(m.error||m.name)}">${m.thumbnail?`<img src="${esc(m.thumbnail)}" alt="">`:''}<label>截取秒数<input aria-label="${esc(m.name)}截取秒数" data-intro-id="${m.id}" type="number" min="0.1" max="${Math.min(10,m.duration)}" step="0.1" value="${m.introSeconds}"></label><button data-sm-action="removeMedia" data-id="${m.id}" aria-label="删除开场视频">×</button></div>`).join('')}</div></fieldset>`:''}</section>
      <section class="sm-option-card"><div class="sm-option-heading"><span class="sm-icon blue" aria-hidden="true">▣</span><h3>商品图</h3><small>可选</small>${actionButton('pickImages','添加图片',p.images.length>=5?'disabled':'')}<label class="sm-image-mode">展示方式${select('imageMode',[['hybrid','混合'],['tail','片尾展示'],['insert','随机穿插']],p.imageMode==='overlay'?'insert':p.imageMode)}</label></div>${p.images.length?`<div class="sm-images">${p.images.map((m,i)=>mediaCard(m,i,true)).join('')}</div>`:''}</section></div>`;
      $('smPackaging').innerHTML=`<div class="sm-strength"><h2>3　包装设置</h2><div class="sm-strength-row"><span>包装强度</span>${segment('strength',[['subtle','轻微'],['balanced','均衡'],['bold','明显']],p.strength)}</div><p class="sm-help">仅调整转场、调色、贴纸、商品卡片与音乐的变化幅度</p></div><div id="smFaceMask"></div>`;
      FaceMaskUI.mount($('smFaceMask'),{send:(command,payload={})=>post(command,{...payload,productId:current().id})});
      const music=state.assets.filter(a=>a.category==='bgm');
      const chosen=music.find(a=>a.id===p.musicId), musicMode=p.musicId==='random'?'random':chosen?.imported?'imported':'library';
      $('smSoundWatermark').innerHTML=`<section class="panel sm-sound"><h2><span class="sm-icon purple" aria-hidden="true">♪</span>4　声音设置</h2><div class="sm-sound-tools">${toggle('originalAudio',p.originalAudio,'保留原声')}${toggle('musicEnabled',p.musicEnabled,'启用音乐')}${actionButton('importMusic','导入音乐')}</div><fieldset class="sm-module-body" ${p.musicEnabled?'':'disabled'}><label class="sm-field sm-music-picker"><span>背景音乐</span><select data-sm-music-mode aria-label="背景音乐"><option value="random" ${musicMode==='random'?'selected':''}>素材库随机</option><option value="library" ${musicMode==='library'?'selected':''}>选择素材库音乐</option><option value="imported" ${musicMode==='imported'?'selected':''}>使用已导入音乐</option></select>${chosen?`<button class="sm-selected-music" data-sm-action="chooseMusic" title="${esc(chosen.name)}">${esc(chosen.name)} ›</button>`:''}</label><label class="sm-field sm-volume"><span class="sm-field-title">音乐音量 <strong>${number(p.musicVolume*100,0)}%</strong></span>${input('musicVolume',p.musicVolume,'type="range" min="0" max="1" step="0.01" aria-label="音乐音量"')}</label><p class="sm-help">人声时自动降低音乐</p></fieldset><span class="sm-music-error" role="status">${p.musicEnabled&&!music.length?'素材库为 0 首，请导入音乐或关闭背景音乐':''}</span></section>
      <section class="panel sm-watermark"><h2><span class="sm-icon green" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4l6 6M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z"/></svg></span>5　水印设置</h2><div class="sm-watermark-fields"><label class="sm-field sm-watermark-text">水印文字${input('watermarkText',p.watermarkText,'maxlength="16" placeholder="最多16字"')}</label><label class="sm-field sm-watermark-color">颜色<span class="sm-color-control">${input('watermarkColor',p.watermarkColor,'type="color" aria-label="水印颜色"')}<output>${esc(p.watermarkColor.toUpperCase())}</output></span></label><label class="sm-field">不透明度${select('watermarkOpacity',[20,30,40,60,80,100].map(v=>[v,v+'%']),Math.round(p.watermarkOpacity*100))}</label><label class="sm-field">字号${select('watermarkSize',[24,32,40,48,56,64].map(v=>[v,v+'']),p.watermarkSize)}</label><label class="sm-field sm-watermark-position">起始位置${select('watermarkPosition',[['topLeft','左上角'],['topRight','右上角'],['bottomLeft','左下角'],['bottomRight','右下角'],['center','居中']],p.watermarkPosition||'topRight')}</label></div></section>`;
      $('smSettings').innerHTML=`<h2><span class="sm-icon gold" aria-hidden="true">▣</span>6　成片设置</h2><label class="sm-field sm-inline-field"><span>目标时长</span>${segment('targetPreset',[[15,'15秒'],[30,'30秒'],[45,'45秒'],[60,'60秒']],p.customTarget?null:p.target)}</label><div class="sm-target-row"><label class="sm-field sm-inline-field"><span>自定义</span>${input('target',p.target,'type="number" min="10" max="300" step="0.1" aria-label="自定义秒数"')}<span>秒</span></label><span class="sm-help ${e.shortfall?'sm-error':''}" title="${e.shortfall?'超过可用时长，将按实际时长生成':''}">当前素材最多支持 ${number(e.maximumDuration)} 秒</span></div><label class="sm-field sm-inline-field"><span>截取方式</span>${select('cutMode',[['start','素材开头'],['middle','素材中间'],['end','素材结尾'],['random','随机截取']],p.cutMode||'start')}</label><label class="sm-field sm-inline-field"><span>生成数量</span>${segment('countMode',[['recommended',`推荐 ${e.recommended||0}`],['maximum',`最多 ${e.maximum||0}`],['custom','自定义']],p.countMode)}${p.countMode==='custom'?input('count',p.count,`type="number" min="1" max="${e.maximum||1}" aria-label="生成数量"`):''}</label>`;
      $('smOutputPath').value=state.project.outputDirectory||'';
      if(previewId&&!p.videos.some(m=>m.id===previewId))previewId='';
      if(!previewId){const first=p.videos.find(m=>m.valid);if(first)setVideo(first.id);else clearVideo();}
    }
    renderStatus(); updateWatermark(); dropdown.sync();
    const selected=p.videos.find(x=>x.id===previewId)||p.videos.find(x=>x.valid);
    FaceMaskUI.update({context:p.id,options:p.faceMask,library:state.faceMask,busy:state.busy,previewUrl:state.facePreviewUrl,source:selected?{id:selected.id,name:selected.name,ratio:ratio(selected)}:null});
    const face=$('smFaceMask'), heading=face.querySelector('.fm-entry-heading');
    if(p.faceMask?.enabled&&!heading?.querySelector('[data-sm-face-off]'))heading?.insertAdjacentHTML('beforeend','<button data-sm-face-off class="sm-face-off" title="关闭人脸遮挡" aria-label="关闭人脸遮挡">关闭</button>');
  }
  function clearVideo(){previewId='';$('smVideo').removeAttribute('src');$('smVideoEmpty').hidden=false;}
  function setVideo(id){previewId=id;wasRenderedPreview=false;$('smVideo').src=`https://audio-remix-media.chuangbao.local/media/super-${encodeURIComponent(id)}`;$('smVideoEmpty').hidden=true;const m=current()?.videos.find(x=>x.id===id);$('smRatio').textContent=ratio(m);$('smPreviewHint').textContent='素材预览；生成预览可查看完整混剪效果';updateWatermark();}
  function updateWatermark(){const p=current(), el=$('smWatermark'), frame=$('smVideoFrame');if(!p)return;el.hidden=!p.watermarkEnabled||!p.watermarkText||wasRenderedPreview;el.textContent=p.watermarkText;el.style.color=p.watermarkColor;el.style.opacity=p.watermarkOpacity;const pos=p.watermarkPosition||'topRight';el.style.left=pos.endsWith('Left')?'5%':'auto';el.style.right=pos.endsWith('Right')?'5%':'auto';el.style.top=pos.startsWith('top')?'5%':'auto';el.style.bottom=pos.startsWith('bottom')?'5%':'auto';el.style.transform=pos==='center'?'translate(-50%,-50%)':'';if(pos==='center'){el.style.left='50%';el.style.top='50%';}el.style.fontSize=`${Math.max(8,p.watermarkSize*frame.clientWidth/(ratio(p.videos.find(m=>m.valid))==='16:9'?1920:1080))}px`;}
  new ResizeObserver(updateWatermark).observe($('smVideoFrame'));
  function configurationReason(p,output=false){
    const e=state.estimates[p.id]||{},music=state.assets.filter(a=>a.category==='bgm');
    if(state.busy)return '任务进行中，请等待完成或取消';
    if([...root.querySelectorAll('input[type=number]')].some(el=>!el.disabled&&!el.checkValidity()))return '请检查秒数和生成数量的输入范围';
    if(e.error)return e.error;
    if(!e.count)return '请添加至少2条可用视频并检查成片设置';
    if(p.introEnabled&&!p.intros.some(x=>x.valid))return '黄金开场已开启，请添加可用开场视频';
    if(p.musicEnabled&&!music.length)return '背景音乐素材库为0首，请导入音乐或关闭背景音乐';
    if(p.musicEnabled&&p.musicId!=='random'&&!music.some(x=>x.id===p.musicId))return '所选音乐不可用，请重新选择';
    if(p.watermarkEnabled&&!p.watermarkText.trim())return '水印已开启，请填写水印文字';
    if(p.faceMask?.enabled&&p.faceMask.style==='avatar'&&!p.faceMask.avatars?.length)return '请选择至少一个卡通头像';
    if(output&&!state.project.outputDirectory)return '请先选择输出目录';
    return '';
  }
  function disableWithReason(el,reason){
    if(!el)return;el.disabled=!!reason;el.title=reason;
    if(!el.parentElement.classList.contains('sm-action-tooltip')){const wrap=document.createElement('span');wrap.className='sm-action-tooltip';el.before(wrap);wrap.append(el);}
    el.parentElement.title=reason;
  }
  function renderStatus(){
    root.classList.toggle('sm-has-status',!!(state?.busy||state?.error));
    if(!state)return;const p=current(),e=state.estimates[p.id]||{},count=e.count||0,size=e.estimatedBytes||0;
    $('smStart').textContent='生成视频';$('smCancel').hidden=!state.busy;
    root.querySelectorAll('[data-sm-field],[data-sm-set],[data-intro-id],[data-sm-music-mode]').forEach(el=>el.disabled=!!state.busy);
    root.querySelectorAll('[data-sm-action]').forEach(el=>{if(!['openOutput','cancel','showAssets'].includes(el.dataset.smAction)&&el.id!=='smStart')el.disabled=!!state.busy;});
    const intro=root.querySelector('.sm-intro-body'),sound=root.querySelector('.sm-sound .sm-module-body'),water=root.querySelector('.sm-watermark .sm-module-body');
    if(intro)intro.disabled=state.busy||!p.introEnabled;if(sound)sound.disabled=state.busy||!p.musicEnabled;if(water)water.disabled=state.busy;
    const addIntro=root.querySelector('[data-sm-action="pickIntros"]');if(addIntro)addIntro.disabled=state.busy||!p.introEnabled||p.intros.length>=3;
    const addImage=root.querySelector('[data-sm-action=pickImages]');if(addImage)addImage.disabled=state.busy||p.images.length>=5;
    disableWithReason($('smStart'),configurationReason(p,true));
    disableWithReason(root.querySelector('[data-sm-action="preview"]'),configurationReason(p));
    document.querySelectorAll('#superModeBar [data-mode]').forEach(el=>{if(state.busy)el.disabled=false;});
    if(state.previewUrl&&state.previewUrl!==$('smVideo').dataset.rendered){$('smVideo').dataset.rendered=state.previewUrl;$('smVideo').src=state.previewUrl;$('smVideoEmpty').hidden=true;wasRenderedPreview=true;$('smPreviewHint').textContent='实际生成预览 · 包含当前配方的声音、商品图与水印';}
    if($('smResults').open)renderResults();
  }
  function renderResults(){
    if(!state)return;const rows=state.outputs;
    $('smResultsSummary').textContent=`${state.phase} · 共${state.outputTotal||rows.length}条 · 成功${rows.filter(x=>x.status==='成功').length} · 降级${rows.filter(x=>x.status==='已降级').length} · 失败${rows.filter(x=>x.status==='失败').length} · 需复核${rows.filter(x=>x.warning).length}`;
    $('smResultRows').innerHTML=rows.map(o=>`<tr><td>${esc(o.productName)} / ${o.index}</td><td class="${o.status==='失败'?'sm-error':''}">${esc(o.status)}${o.lowSpec?' · 低配模式':''}${o.durationShortfall?'<br><small>时长不足</small>':''}${o.error?`<small class="sm-error">${esc(o.error)}</small>`:''}</td><td><progress max="1" value="${o.progress}"></progress><small>${number(o.progress*100,0)}% ${o.eta>0?`· 约${clock(o.eta)}`:''}</small></td><td>${number(o.duration)}秒<br><small>${mb(o.size)}MB</small></td><td>${['成功','已降级'].includes(o.status)?actionButton('openResult','播放',`data-id="${o.recipeId}"`):''}${actionButton('openReport','任务报告',`data-id="${o.recipeId}"`)}</td></tr>`).join('')||'<tr><td colspan="5">生成后显示逐条进度、校验状态和任务报告</td></tr>';
    let issue=$('smResultIssue');if(!issue){issue=document.createElement('p');issue.id='smResultIssue';issue.className='sm-error';$('smResultsSummary').after(issue);}issue.textContent=state.error||'';issue.hidden=!state.error;
    for(const [index,row] of rows.entries())if(row.warning){const cell=$('smResultRows').rows[index]?.cells[1];if(cell){const warning=document.createElement('small');warning.className='sm-review';warning.textContent='需复核：'+row.warning;cell.append(warning);}}
    $('smLogs').textContent=state.logs.join('\n');
    let summary=$('smDiversity');if(!summary){summary=document.createElement('details');summary.id='smDiversity';$('smResultsSummary').after(summary);}
    summary.innerHTML='<summary>组合多样性统计</summary>'+(state.diversity||[]).map(({productName,statistics:s})=>`<p><strong>${esc(productName)}</strong> · 平均集合重合度 ${number(s.averageJaccard*100)}% · 最大 ${number(s.maximumJaccard*100)}%</p><p>重复集合成品对：${s.repeatedPairs.length?esc(s.repeatedPairs.join('、')):'无'}</p><div class="sm-results-scroll"><table><thead><tr><th>素材</th><th>使用次数</th><th>首镜次数</th></tr></thead><tbody>${s.modules.map(m=>`<tr><td>${esc(state.project.products.flatMap(p=>p.videos).find(v=>v.id===m.id)?.name||m.id)}</td><td>${m.uses}</td><td>${m.openings}</td></tr>`).join('')}</tbody></table></div>`).join('');
  }
  function showAssets(){const p=state.project;$('smAssetContent').innerHTML=`<p class="sm-help">素材须有商业使用授权。校验失败的文件不会用于生成。</p><div class="sm-dialog-actions">${actionButton('importMusic','导入音乐')}${actionButton('importSticker','导入透明贴纸')}</div><p>${esc(state.warnings.join('；'))}</p><label class="sm-check"><input type="checkbox" data-sm-global="parallel"${p.parallel?' checked':''}>允许并发（硬件编码且CPU≥8线程时2路）</label><label class="sm-check"><input type="checkbox" data-sm-global="lowSpec"${p.lowSpec?' checked':''}>低配模式（24fps、单任务，关闭贴纸和角标）</label><p class="sm-help">${state.lowSpecSuggested?'当前电脑建议开启低配模式。':''}实际编码器：${esc(state.encoder)} · 实际并发${state.concurrency}</p><label class="sm-field">缓存目录<button data-sm-action="pickCache">${esc(p.cacheDirectory)}</button></label><details><summary>从服务器更新素材包</summary><p class="sm-help">输入可信来源提供的HTTPS地址及SHA256；全部文件校验通过后切换版本，保留旧版。</p><label class="sm-field">素材包地址<input type="url" data-sm-global="assetUpdateUrl" value="${esc(p.assetUpdateUrl)}"></label><label class="sm-field">SHA256<input data-sm-global="assetUpdateSha256" value="${esc(p.assetUpdateSha256)}" maxlength="64"></label>${actionButton('updateAssets','下载并校验更新')}</details>`;$('smAssets').showModal();}
  function chooseMusic(mode){
    const list=state.assets.filter(a=>a.category==='bgm'&&(mode==='imported'?a.imported:!a.imported));
    $('smAssetContent').innerHTML=`<h3>${mode==='imported'?'使用已导入音乐':'选择素材库音乐'}</h3>${list.length?`<div class="sm-track-list">${list.map(a=>`<button data-sm-track="${esc(a.id)}">${esc(a.name)}${a.id===current().musicId?' ✓':''}</button>`).join('')}</div>`:'<p class="sm-help">暂无可用音乐，请先导入音乐。</p>'}${actionButton('importMusic','导入音乐')}`;
    $('smAssets').showModal();
  }
  document.addEventListener('click',e=>{const b=e.target.closest('[data-sm-track]');if(b){post('set',{productId:current().id,field:'musicId',value:b.dataset.smTrack});$('smAssets').close();}});
  $('smAssets').addEventListener('close',()=>{renderKey='';render();});
  // The shared legacy mode renderer may relocate the plan cards after a native state update.
  new MutationObserver(()=>{if(!api.active)return;if(modeBar.parentElement!==$('smPlan'))$('smPlan').append(modeBar);if($('showResults').textContent!=='成片历史')$('showResults').textContent='成片历史';}).observe(document.querySelector('.app'),{childList:true,subtree:true});
  let renameId='';
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-sm-face-off]')){post('faceSet',{productId:current().id,options:{...current().faceMask,enabled:false}});return;}
    const close=event.target.closest('[data-sm-close]');if(close){$(close.dataset.smClose).close();return;}
    const preview=event.target.closest('[data-sm-preview]');if(preview){const p=current(), m=p?.videos.find(x=>x.id===preview.dataset.smPreview);if(m?.valid){setVideo(m.id);render();}return;}
    const set=event.target.closest('[data-sm-set]');if(set){post('set',{productId:current().id,field:set.dataset.smSet,value:set.dataset.value});return;}
    const button=event.target.closest('[data-sm-action]');if(!button)return;
    const action=button.dataset.smAction;if(action==='chooseMusic'){chooseMusic(state.assets.find(a=>a.id===current().musicId)?.imported?'imported':'library');return;}if(action==='showAssets'){showAssets();return;}
    if(action==='renameProduct'){renameId=button.dataset.productId;$('smName').value=state.project.products.find(p=>p.id===renameId)?.name||'';$('smRename').showModal();$('smName').focus();return;}
    post(action,{productId:button.dataset.productId||current()?.id,id:button.dataset.id||''});
    if(action==='start'){$('smResults').showModal();renderResults();}
  });
  $('smRenameSave').onclick=()=>{post('renameProduct',{productId:renameId,name:$('smName').value});$('smRename').close();};
  document.addEventListener('change',event=>{const el=event.target;if(el.matches('[data-sm-music-mode]')){if(el.value==='random')post('set',{productId:current().id,field:'musicId',value:'random'});else chooseMusic(el.value);return;}if(el.dataset.smField){if(el.type==='checkbox'){current()[el.dataset.smField]=el.checked;renderKey='';el.blur();render();}post('set',{productId:current().id,field:el.dataset.smField,value:el.type==='checkbox'?el.checked:el.dataset.smField==='watermarkOpacity'?Number(el.value)/100:el.value});}else if(el.dataset.introId)post('introSeconds',{productId:current().id,id:el.dataset.introId,value:el.value});else if(el.dataset.smGlobal)post('global',{field:el.dataset.smGlobal,value:el.type==='checkbox'?el.checked:el.value});});
  document.addEventListener('focusout',()=>setTimeout(()=>{if(api.active)render();},0));
  const liveTimers=new Map();
  document.addEventListener('input',event=>{
    const el=event.target, field=el.dataset.smField;
    if(!['watermarkOpacity','watermarkSize','watermarkColor','watermarkText','musicVolume','target','count'].includes(field))return;if(!el.checkValidity()){renderStatus();return;}
    const p=current(); if(!p)return;
    const value=field==='watermarkOpacity'?Number(el.value)/100:['watermarkSize','musicVolume','target','count'].includes(field)?Number(el.value):el.value;
    p[field]=value;if(field==='watermarkText')p.watermarkEnabled=!!value.trim();if(field==='target'){p.customTarget=true;root.querySelectorAll('[data-sm-set=targetPreset]').forEach(b=>{b.classList.remove('selected');b.setAttribute('aria-pressed','false');});} updateWatermark(); renderStatus();
    if(field==='watermarkColor'){const text=el.parentElement.querySelector('output');if(text)text.textContent=value.toUpperCase();}
    if(field==='musicVolume'){const readout=el.closest('.sm-volume')?.querySelector('.sm-field-title strong');if(readout)readout.textContent=`${number(value*100,0)}%`;}
    const key=p.id+field;clearTimeout(liveTimers.get(key));
    liveTimers.set(key,setTimeout(()=>{post('set',{productId:p.id,field,value});liveTimers.delete(key);},250));
  });
  if(bridge)bridge.addEventListener('message',event=>{const message=event.data||{};if(message.type==='superState'){state=message;render();}else if(message.type==='state'){lastLegacyMode=message.settings?.mode||lastLegacyMode;markModes();}else if(message.type==='toast'&&api.active){notify(message.text);}});
  const dropdown=(()=>{
    const menu=document.createElement('div');menu.id='smSelectMenu';menu.className='cm-select-menu';menu.hidden=true;menu.setAttribute('role','listbox');menu.setAttribute('popover','manual');document.body.append(menu);
    let select=null,index=-1,signature='',search='',searchAt=0;
    const options=()=>select?[...select.options]:[];
    const enabled=o=>!!o&&!o.disabled&&!o.hidden&&!o.closest('optgroup:disabled');
    function close(){if(select){select.setAttribute('aria-expanded','false');select.removeAttribute('aria-activedescendant');}if(menu.matches(':popover-open'))menu.hidePopover();menu.hidden=true;select=null;search='';}
    function position(){if(!select)return;const b=select.getBoundingClientRect(),below=innerHeight-b.bottom-8,above=b.top-8,up=below<Math.min(menu.scrollHeight,280)&&above>below;const height=Math.max(0,Math.min(280,(up?above:below)-8));menu.style.width=Math.min(Math.max(b.width,180),innerWidth-16)+'px';menu.style.maxHeight=height+'px';menu.style.left=Math.max(8,Math.min(b.left,innerWidth-menu.getBoundingClientRect().width-8))+'px';menu.style.top=(up?b.top-menu.getBoundingClientRect().height-6:b.bottom+6)+'px';menu.dataset.direction=up?'up':'down';}
    function highlight(next){index=next;[...menu.children].forEach((e,i)=>{e.classList.toggle('is-active',i===index);});const item=menu.children[index];if(item){select.setAttribute('aria-activedescendant',item.id);item.scrollIntoView({block:'nearest'});}}
    function draw(){signature=JSON.stringify(options().map(o=>[o.text,o.value,o.disabled,o.hidden,enabled(o)]).concat([select.selectedIndex]));menu.replaceChildren();options().forEach((o,i)=>{const item=document.createElement('div');item.id='smSelectOption'+i;item.className='cm-select-option';item.setAttribute('role','option');item.setAttribute('aria-selected',String(i===select.selectedIndex));item.setAttribute('aria-disabled',String(!enabled(o)));item.hidden=o.hidden;item.dataset.index=i;item.textContent=o.text;item.title=o.text;menu.append(item);});menu.setAttribute('aria-label',select.getAttribute('aria-label')||'选择选项');}
    function open(el){if(el.matches(':disabled'))return;close();select=el;select.focus({preventScroll:true});select.setAttribute('aria-expanded','true');draw();menu.hidden=false;if(menu.showPopover)menu.showPopover();position();highlight(enabled(options()[select.selectedIndex])?select.selectedIndex:options().findIndex(enabled));}
    function choose(i){const el=select,o=options()[i];if(!el||!o||!enabled(o))return;close();el.selectedIndex=i;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));if(el.isConnected){el.focus({preventScroll:true});}}
    function sync(){root.querySelectorAll('select').forEach(el=>{el.setAttribute('aria-haspopup','listbox');el.setAttribute('aria-controls',menu.id);el.setAttribute('aria-expanded',String(el===select));});if(!select)return;if(!select.isConnected||select.matches(':disabled')||root.hidden){close();return;}const next=JSON.stringify(options().map(o=>[o.text,o.value,o.disabled,o.hidden,enabled(o)]).concat([select.selectedIndex]));if(signature!==next){draw();position();highlight(select.selectedIndex);}}
    root.addEventListener('pointerdown',e=>{const el=e.target.closest('select');if(!el||el.matches(':disabled')||e.button!==0)return;e.preventDefault();if(select===el)close();else open(el);});
    root.addEventListener('click',e=>{if(e.target.closest('select'))e.preventDefault();});
    root.addEventListener('keydown',e=>{const el=e.target.closest('select');if(!el||el.matches(':disabled'))return;if(e.key==='F4'){e.preventDefault();if(select===el)close();else open(el);return;}if(e.key==='Tab'){close();return;}if(e.key==='Escape'){if(select){e.preventDefault();e.stopPropagation();close();}return;}const navigation=['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(e.key),typing=e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey;if(!navigation&&!typing)return;e.preventDefault();if(select!==el){open(el);if(['Enter',' ','ArrowDown','ArrowUp'].includes(e.key))return;}if(e.key==='Enter'||e.key===' '){choose(index);return;}const ids=options().map((o,i)=>enabled(o)?i:-1).filter(i=>i>=0);if(!ids.length)return;if(e.key==='Home')highlight(ids[0]);else if(e.key==='End')highlight(ids[ids.length-1]);else if(e.key==='ArrowDown'||e.key==='ArrowUp'){const at=ids.indexOf(index);highlight(ids[Math.max(0,Math.min(ids.length-1,at+(e.key==='ArrowDown'?1:-1)))]);}else if(typing){search=Date.now()-searchAt<700?search+e.key:e.key;searchAt=Date.now();const found=ids.find(i=>options()[i].text.toLocaleLowerCase().startsWith(search.toLocaleLowerCase()));if(found!==undefined)highlight(found);}});
    menu.addEventListener('pointerdown',e=>e.preventDefault());
    menu.addEventListener('pointermove',e=>{const item=e.target.closest('[data-index]');if(item&&enabled(options()[Number(item.dataset.index)]))highlight(Number(item.dataset.index));});
    menu.addEventListener('click',e=>{const item=e.target.closest('[data-index]');if(item)choose(Number(item.dataset.index));});
    document.addEventListener('pointerdown',e=>{if(select&&e.target!==select&&!menu.contains(e.target))close();},true);
    document.addEventListener('focusin',e=>{if(select&&e.target!==select&&!menu.contains(e.target))close();});
    document.addEventListener('scroll',e=>{if(select&&!menu.contains(e.target))close();},true);
    window.addEventListener('resize',close);document.addEventListener('fullscreenchange',close);
    return {sync,close,open};
  })();
  // Kept separate from the legacy project's mode setting and undo/template format.
})();
