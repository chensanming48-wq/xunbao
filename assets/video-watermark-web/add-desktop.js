// Shared presentation for all watermark modes. Native processing and original events stay intact.
window.watermarkAddUi = (() => {
  let initialized=false, picker;
  const q=s=>document.querySelector(s);
  const icon=n=>'<img class="add-icon" alt="" src="add-icons/'+n+'.svg">';
  function html(selector,value){const e=q(selector);if(e.innerHTML!==value)e.innerHTML=value;}
  function text(selector,value){const e=q(selector);if(e.textContent!==value)e.textContent=value;}
  function initialize(){
    if(initialized)return;initialized=true;
    q('.output').append(q('#openOutput'));
    const legends=document.createElement('div');legends.className='preview-legends';
    const resultLegend=q('.pane:last-child .legend');resultLegend.classList.add('result-legend');
    legends.append(q('#sourceLegend'),resultLegend);q('.player').before(legends);
    picker=document.createElement('button');picker.type='button';picker.className='add-video-picker';
    picker.innerHTML='<span class="add-plus">'+icon('plus')+'</span><strong>点击添加视频</strong><span>支持 MP4、MOV、MKV、AVI 等格式</span>';
    picker.onclick=()=>q('#add').click();q('.sources').append(picker);
    q('#methodPicker').onchange=()=>q('[data-key="Method"][data-value="'+q('#methodPicker').value+'"]').click();
    html('#history',icon('clock')+'处理记录');html('#help',icon('book-open')+'使用说明');
    text('#output','更改目录');text('#openOutput','打开文件夹');
    html('.apply > span','<span>应用范围</span><b>当前视频</b>');
    html('#resultStage .empty>span:first-child',icon('video'));
    html('#sourceStage .empty>span:first-child',icon('video'));
    q('#quality').closest('.ui-select').title=q('#qualityHint').textContent;
    text('#sourceStage .empty strong','待导入视频');text('#resultStage .empty strong','待生成预览');
    text('#removeTab','① 去除水印');text('#addTab','② 添加水印');
    text('label[for=position]','水印位置');
  }
  function sync(settings,state,current){
    if(!settings)return;initialize();
    document.body.classList.toggle('add-has-message',Boolean(state?.message&&state.message!=='添加视频，开始处理水印'));
    q('.sources').classList.toggle('add-empty',!state?.items?.length);picker.hidden=Boolean(state?.items?.length);picker.disabled=Boolean(state?.busy);
    text('#pageSubtitle','原视频保留，处理结果另存。');
    text('#settingsTitle',({remove:'去除水印',add:'添加水印',both:'去除后添加'})[settings.Mode]);
    q('#settingsIcon').src='add-icons/'+(settings.Mode==='add'?'image':'eraser')+'.svg';
    text('#resultTitle',settings.Mode==='both'?'最终效果':'处理后');
    text('#previewBadge',current?.Result?'真实处理预览':'尚未生成预览');
    text('#realHint',current?.Result?'当前为真实处理效果':settings.Mode==='both'?'预览包含去除和添加两步效果。':'预览为短片，完整视频在处理后导出。');
    text('#modeSummary',settings.Mode==='both'?'去除后添加 · 保持原比例':'保持原比例');
    const method=q('#methodPicker');method.value=settings.Method;method.disabled=Boolean(state?.busy);
    // Keep the original method buttons as the single command path (including manual drawing).
    if(typeof syncCustomSelect==='function')syncCustomSelect(method);
    q('#quality').title=q('#qualityHint').textContent;
    if(settings.Mode!=='remove')text('#resultLegend','新增水印');
    text('#sizeValue',Math.round(settings.Size*100)+'%');
    html('#detect',q('[data-icon=scan]').innerHTML+(current?.Detected?'重新检测':'检测水印'));
    html('#drawRemove','<span class="region-swatch red"></span>+ 去除区域');
    html('#drawProtect','<span class="region-swatch green"></span>+ 保护区域');
  }
  return {sync,before(){},tab(name){document.body.dataset.settingsTab=name;}};
})();
