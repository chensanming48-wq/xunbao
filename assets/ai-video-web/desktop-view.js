// Presentation only. The packaged application owns all state, validation and commands.
export function videoWorkspace(r, C, s) {
  const h = (type, props, ...children) => r.jsx(type, {...props, children: children.length === 0 ? undefined : children.length === 1 ? children[0] : children});
  const icon = (name, color = '') => name==='UploadIcon' ? h('img',{src:'https://ai-product-card-ui.chuangbao.local/upload.svg',alt:'',className:'video-icon '+color}) : ['Settings','Edit','Play'].includes(name) ? h('img',{src:'./icons/'+({Settings:'sliders-horizontal',Edit:'pencil',Play:'circle-play'}[name])+'.svg',alt:'',className:'video-icon '+color}) : h(C[name], {size:18, className:'video-icon '+color});
  const heading = (name, text, color='') => h('h2', {}, icon(name,color), text);
  const button = (text, action, name, props={}) => h('button', {type:'button', className:'button', onClick:action, ...props}, name && icon(name), text);
  const field = (label, value, onChange, options, disabled=false) => h(C.Select, {label,value,onChange,options,disabled});
  const commerce = s.category === 'commerce', textMode = s.mode === '文生视频', humanMode = s.mode === '模特带货';
  const frameMode = s.mode === '首帧生视频';
  const sourcePreview = commerce && s.preview === 'source';
  const history = () => s.modal('history');
  const upload = (item,label,onFiles,onRemove,video=false) => h(C.Upload, {item,label,onFiles,onRemove,video});
  const material = h('section', {className:'materials-card panel', hidden:textMode},
    // Keep the picker mounted across mode switches: no catalogue refetch/remount flash.
    h('div',{className:'human-picker-slot',hidden:!humanMode},h(C.HumanPicker,{
      value:s.human,onChange:s.setHuman,connection:s.connection,disabled:!!s.busy || !humanMode,
      renderUpload:(item,choose)=>upload(item,'模特图',files=>s.imageFile(files,choose),()=>choose(null))
    })),
    !humanMode && h('div',{className:'section-heading'},heading('UploadIcon','1　上传素材','teal')),
    commerce ? h('div',{className:'material-grid'},
      h('div',{className:'reference-slot'},upload(s.reference,'参考视频',s.videoFile,()=>s.setReference(null),true)),
      h('div',{className:'product-grid'},
        ...s.products.map((item,index)=>r.jsx(C.Upload,{
          item,label:'商品图 '+(index+1),onFiles:files=>s.imageFile(files,value=>s.setProducts(items=>items.map((x,i)=>i===index?value:x))),
          onRemove:()=>s.setProducts(items=>items.filter((x,i)=>i!==index))
        },item.url)),
        s.products.length<3 && h('button',{className:'add-product',type:'button',onClick:()=>s.productInput.current.click(),onDragOver:e=>e.preventDefault(),onDrop:e=>{e.preventDefault();s.addProducts([...e.dataTransfer.files]);}},
          icon('ImageIcon'),h('span',{},'上传商品图'),h('small',{},'最多 3 张')),
        h('input',{hidden:true,multiple:true,type:'file',accept:'image/*',ref:s.productInput,onChange:e=>{s.addProducts([...e.target.files]);e.target.value='';}}))) :
      h('div',{className:'creative-upload'},upload(s.frame,frameMode?'首帧图片':'参考图片',files=>s.imageFile(files,s.setFrame),()=>s.setFrame(null)),
        h('div',{className:'image-guidance'},h('h3',{},frameMode?'以这张图片作为视频开场':'让商品图片动起来'),
          h('p',{},frameMode?'首帧决定开场画面与主体外观':'根据参考图片生成动态画面'),h('p',{},'在下方描述希望呈现的动作与镜头变化'),
          h('div',{className:'image-advice'},h('strong',{},'图片建议'),h('p',{},'主体完整、画面清晰、背景简洁')))));
  const prompt = h('section',{className:'prompt-field panel'},
    h('div',{className:'section-heading'},h('label',{htmlFor:'prompt'},icon('Edit','purple'),textMode?'1　描述视频':'2　生成要求'),h('span',{className:'counter'},s.prompt.length+' / 2000')),
    h('textarea',{id:'prompt',value:s.prompt,maxLength:2000,onChange:e=>s.setPrompt(e.target.value),placeholder:textMode?'描述主体、场景、人物动作和镜头运动\n\n例如：一位模特站在米白色背景前展示商品，\n镜头从全身缓慢推近，突出商品细节与质感。':commerce?'描述商品、人物动作与使用场景\n说明需要保留的外观、细节和参考视频动作':'描述画面变化、运动方向和镜头动作\n说明需要保留的主体外观与背景细节'}),
    textMode && h('div',{className:'prompt-advice'},h('strong',{},'描述建议'),h('div',{},...['主体与动作','场景与光线','镜头与节奏','需要保留的细节'].map(text=>button(text,()=>{
      s.setPrompt((s.prompt+(s.prompt?'\n':'')+text+'：').slice(0,2000));document.getElementById('prompt')?.focus();
    })))));
  const settings = h('section',{className:'settings panel','aria-busy':s.loading},
    h('div',{className:'section-heading'},heading('Settings','生成设置','gold')),
    s.connectionError && h('div',{className:'connection-feedback',role:'alert'},h('button',{className:'connection-reason',title:s.connectionError,onClick:()=>s.modal('about')},s.connectionError),button('重新连接',s.reconnect)),
    h('div',{className:'setting-grid'},
      field('模型',s.modelId,s.selectModel,s.models.length?s.models.map(m=>[m.id,m.modelName]):[['',s.connectionError?'模型加载失败':'加载可用模型…']],!s.models.length||s.connection!=='ready'),
      field('时长',s.duration,s.setDuration,s.options(s.selectedModel,'duration').map(x=>[x,x+' 秒']),!s.modelsReady),
      field('画面比例',s.ratio,s.setRatio,s.options(s.selectedModel,'ratio'),!s.modelsReady),
      field('清晰度',s.resolution,s.setResolution,s.options(s.selectedModel,'resolution'),!s.modelsReady)));
  const footer = h('footer',{className:'generate-footer panel'},
    s.error && h('p',{className:'validation',role:'alert'},icon('Warning'),s.error),
    h('span',{className:'estimate'},icon('Settings','gold'),h('span',{},'预计消耗'),h('strong',{},s.estimate===null?'提交前确认':s.estimate+' 算力')),
    button(s.busy||'确认费用并生成',s.prepare,null,{className:'button primary',disabled:!!s.busy||!s.modelsReady||!s.selectedModel}));
  return h('main',{className:'video-desktop card-stage', 'data-mode':s.mode},
    h('header',{className:'page-header panel'},h('div',{},h('h1',{},'AI 视频'),h('p',{},'把商品素材变成带货视频')),button('生成记录',()=>{history();s.refresh();},'History',{className:'button video-history'})),
    h('section',{className:'creation-toolbar panel','aria-label':'视频模式'},
      h('div',{className:'mode-field'},icon('Settings','purple'),field('视频类型',s.category,s.setCategory,[['commerce','电商带货'],['creative','创意视频']],!!s.busy)),
      h('div',{className:'mode-field'},icon(commerce?'Human':'Edit',commerce?'orange':'teal'),field('生成方式',s.mode,s.setMode,s.modes[s.category],!!s.busy))),
    h('div',{className:'work-grid '+(textMode?'text-mode':humanMode?'human-mode':'asset-mode')+(s.busy?' is-working':'')},
      h('section',{className:'create-card'},material,prompt,settings,footer),
      h('aside',{className:'result-column'},
        h('section',{className:'preview-card panel'},
          h('div',{className:'preview-header'},heading('Play','效果预览','teal'),commerce?h('div',{className:'preview-tabs'},
            button('原视频',()=>s.setPreview('source'),null,{'aria-pressed':sourcePreview,className:'button '+(sourcePreview?'active':'')}),
            button('生成效果',()=>s.setPreview('result'),null,{'aria-pressed':!sourcePreview,className:'button '+(!sourcePreview?'active':'')})):h('strong',{className:'result-label'},'生成效果')),
          h(C.Player,{source:sourcePreview?s.reference?.url:s.selected?.url,poster:sourcePreview?s.reference?.poster:s.selected?.poster,label:sourcePreview?'参考视频':'生成视频',notify:s.notify}),
          h('div',{className:'result-actions'},button('下载视频',()=>s.download(s.selected),'Download',{disabled:sourcePreview||!s.selected?.url}),button(s.saved.some(x=>x.id===s.selected?.id)?'已保存到素材库':'保存到素材库',()=>s.save(s.selected),'Save',{disabled:sourcePreview||!s.selected?.url}))),
        h('section',{className:'recent-card panel'},h('div',{className:'section-heading'},heading('History','最近生成','purple'),button('查看全部',history,'Next',{className:'text-button'})),
          h('div',{className:'recent-grid'},!s.tasks.length&&h('p',{className:'no-tasks'},'暂无生成记录'),...s.tasks.slice(0,2).map(task=>r.jsx('article',{className:'recent-item',children:[
            button(task.poster?h('img',{src:task.poster,alt:task.title}):icon('Video'),()=>s.previewTask(task),null,{className:'recent-thumb','aria-label':'预览'+task.title}),
            h('div',{},button(task.title,()=>s.previewTask(task),null,{className:'recent-title'}),h('p',{},task.ratio+' · '+task.duration+'秒 · '+task.resolution),h('span',{className:'task-status '+task.status},s.statusLabels[task.status]),h('small',{},task.time),task.error&&h('p',{className:'recent-error',title:task.error},task.error)),
            button('查看',history,null,{className:'text-button','aria-label':'查看'+task.title+'任务'})]},task.id)))))));
}
