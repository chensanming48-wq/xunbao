(function(){
  "use strict";

  const paths={
    calculator:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8v3H8zM8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
    "calculator-small":'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8v3H8zM8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
    refresh:'<path d="M20 11a8 8 0 1 0-2.34 5.66"/><path d="M20 4v7h-7"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>',
    percent:'<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2"/><circle cx="17" cy="17" r="2"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
    ad:'<path d="M5 7h12.5A2.5 2.5 0 0 1 20 9.5V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11"/><path d="M3 8l14-4v4M15.5 12H20v4h-4.5a2 2 0 0 1 0-4Z"/>',
    platform:'<path d="M4 10h16M6 10v8m4-8v8m4-8v8m4-8v8M3 20h18M12 3l9 5H3l9-5Z"/>',
    lightbulb:'<path d="M9 18h6M10 22h4"/><path d="M8 15c-1.3-1-2-2.7-2-4.5a6 6 0 1 1 12 0c0 1.8-.7 3.5-2 4.5-.8.6-1 1.2-1 2H9c0-.8-.2-1.4-1-2Z"/>',
    copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
    chevron:'<path d="m7 10 5 5 5-5"/>'
  };

  const $=id=>document.getElementById(id);
  const legacyFields=["salePrice","productCost","freight","insurance","platformFee","refundRate"];
  const fields=legacyFields.concat(["commissionPercent","serviceFee"]);
  const legacyCalculationKey='chuangbao.roi-calculator.saved-result.v1';
  const savedCalculationKey='chuangbao.roi-calculator.saved-result.v2';
  let mode="merchant",lastResult=null,targetRoi=0,timer=0;

  function svg(name){return '<svg viewBox="0 0 24 24" aria-hidden="true">'+(paths[name]||paths.info)+'</svg>';}
  document.querySelectorAll('[data-icon]').forEach(node=>{node.innerHTML=svg(node.dataset.icon);});

  function post(type,extra){
    if(window.chrome&&window.chrome.webview){
      window.chrome.webview.postMessage(Object.assign({type:type},extra||{}));
    }
  }

  function numberValue(id){
    const value=Number($(id).value);
    return Number.isFinite(value)?clamp(value,0,Number($(id).max)||100000000):0;
  }

  function updateMode(){
    const creator=mode==='creator';
    document.querySelector('.roi-app').dataset.version=mode;
    document.querySelectorAll('[data-version]').forEach(node=>{
      node.hidden=node.dataset.version!==mode;
      node.querySelectorAll('input,select').forEach(input=>{input.disabled=node.hidden;});
    });
    document.querySelectorAll('.mode-card').forEach(button=>{
      const active=button.dataset.mode===mode;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    });
    $('headerDescription').textContent=creator?'输入带货佣金与退货参数，实时测算最低不亏投放线':'输入商品成本与售后参数，实时测算最低不亏投放线';
    $('contextText').textContent=creator?'支付 GMV ÷ 广告消耗；退货订单不计佣金，平台服务费按佣金扣除。':'支付 GMV ÷ 广告消耗；退货订单不计收入与扣点，运费按已发生费用计入。';
    $('incomeSectionTitle').textContent=creator?'商品售价与佣金':'商品收入与成本';
    $('adMetricLabel').textContent=creator?'预估佣金 / 单':'可承受广告费 / 单';
    $('feeMetricLabel').textContent=creator?'结算佣金 / 单':'预计平台扣点';
    $('marginMetricLabel').textContent=creator?'预估 ROI':'推广前毛利率';
    $('marginMetricLabel').title=creator?'1 ÷ 佣金比例，未扣平台服务费及退货影响；投放请参考上方最低保本 ROI。':'可承受广告费 ÷ 商品售价';
    $('formulaValueLabel').textContent=creator?'结算佣金 / 单':'可承受广告费';
  }

  function money(value){
    if(Math.abs(value)<.005)value=0;
    return (value<0?'-¥':'¥')+Math.abs(value).toFixed(2);
  }

  function moneyAbs(value){
    const amount=Math.abs(value);
    return amount<.005?'¥0.00':'¥'+amount.toFixed(2);
  }

  function ceil2(value){return Math.ceil(value*100-1e-10)/100;}
  function floor2(value){return Math.floor(value*100)/100;}
  function clamp(value,min,max){return Math.min(max,Math.max(min,value));}

  function setDecisionState(kind,label,icon){
    const status=$('decisionStatus');
    status.classList.remove('valid','invalid','scenario-loss','scenario-even','scenario-profit');
    if(kind==='invalid')status.classList.add('invalid');
    if(kind==='loss'||kind==='even'||kind==='profit')status.classList.add('valid','scenario-'+kind);
    status.querySelector('i').textContent=icon;
    status.querySelector('b').textContent=label;
  }

  function updateScenario(){
    const slider=$('roiSlider');
    if(!lastResult||!lastResult.valid||slider.disabled)return;

    const min=Number(slider.min),max=Number(slider.max);
    targetRoi=clamp(Number(slider.value)||lastResult.safeRoi,min,max);
    slider.value=targetRoi.toFixed(2);

    const estimatedAdSpend=lastResult.sale/targetRoi;
    const estimatedProfit=lastResult.maxAdSpend-estimatedAdSpend;
    const position=max>min?(targetRoi-min)/(max-min)*100:50;
    slider.style.setProperty('--thumb-color',estimatedProfit<-.005?'#d34f43':(estimatedProfit>.005?'var(--green)':'var(--blue)'));
    slider.setAttribute('aria-valuetext','目标 ROI '+targetRoi.toFixed(2)+'，预计广告消耗 '+money(estimatedAdSpend)+'，'+(estimatedProfit<-.005?'预计亏损 '+moneyAbs(estimatedProfit):(estimatedProfit>.005?'预计盈利 '+moneyAbs(estimatedProfit):'预计盈亏平衡')));
    slider.title=slider.getAttribute('aria-valuetext');

    $('resultMeaning').textContent='目标 ROI '+targetRoi.toFixed(2)+' · 预计广告消耗 '+money(estimatedAdSpend);
    $('resultMeaning').style.color=estimatedProfit<-.005?'#b33e36':(estimatedProfit>.005?'var(--green)':'var(--blue)');

    if(estimatedProfit<-.005){
      setDecisionState('loss','亏损 '+moneyAbs(estimatedProfit),'↓');
      $('usageTip').textContent='目标 ROI 低于保本线 '+lastResult.safeRoi.toFixed(2)+'，预计每单亏损 '+moneyAbs(estimatedProfit)+'；请提高目标 ROI 或降低成本。';
    }else if(estimatedProfit>.005){
      setDecisionState('profit','盈利 '+moneyAbs(estimatedProfit),'↑');
      $('usageTip').textContent='目标 ROI 已达到保本线 '+lastResult.safeRoi.toFixed(2)+'，预计每单盈利 '+moneyAbs(estimatedProfit)+'；请结合实际转化数据留出安全余量。';
    }else{
      setDecisionState('even','盈亏平衡','=');
      $('usageTip').textContent='目标 ROI '+targetRoi.toFixed(2)+'，预计每单盈亏按分取整为 ¥0.00；保本线 '+lastResult.safeRoi.toFixed(2)+'。';
    }

    lastResult.targetRoi=targetRoi;
    lastResult.estimatedAdSpend=estimatedAdSpend;
    lastResult.estimatedProfit=estimatedProfit;
    lastResult.sliderPosition=position;
  }

  function configureScenario(pending){
    const slider=$('roiSlider');
    const marker=$('breakEvenMarker');
    const label=$('breakEvenLabel');
    if(!lastResult.valid){
      slider.disabled=true;
      slider.value='1.00';
      slider.style.setProperty('--thumb-color','var(--blue)');
      slider.removeAttribute('aria-valuetext');
      marker.hidden=true;
      label.textContent=pending?'盈亏平衡线':'暂无保本线';
      $('resultMeaning').style.color='';
      const creator=mode==='creator';
      $('resultMeaning').textContent=pending?(creator?'填写售价和佣金比例后，即可拖动模拟目标 ROI':'填写售价和成本后，即可拖动模拟目标 ROI'):(creator?'当前无可用结算佣金，请调整佣金比例、服务费或退货率':'当前成本已达到或超过预计有效收入，请调整经营参数');
      if(pending){
        setDecisionState('pending','待测算','●');
        $('usageTip').textContent='请先完善经营参数，再拖动目标 ROI 测算预计盈利或亏损。';
      }else{
        setDecisionState('invalid','无法保本','!');
        $('usageTip').textContent=creator?'结算佣金为零，无法覆盖广告费用；请检查佣金比例、服务费和退货率。':'当前没有正数保本线，请先提高售价或降低商品成本、扣点与退货率。';
      }
      return;
    }

    const min=floor2(Math.max(.1,lastResult.safeRoi*.4));
    const max=ceil2(Math.max(lastResult.safeRoi*2.5,lastResult.safeRoi+1));
    slider.min=min.toFixed(2);
    slider.max=max.toFixed(2);
    slider.step='0.01';
    slider.disabled=false;
    targetRoi=lastResult.safeRoi;
    slider.value=targetRoi.toFixed(2);
    const markerPosition=max>min?(lastResult.safeRoi-min)/(max-min)*100:50;
    marker.hidden=false;
    marker.style.left=markerPosition.toFixed(3)+'%';
    marker.title='保本 ROI '+lastResult.safeRoi.toFixed(2);
    label.textContent='保本 '+lastResult.safeRoi.toFixed(2);
    updateScenario();
  }

  function calculate(){
    const creator=mode==='creator';
    const sale=numberValue('salePrice');
    const cost=creator?0:numberValue('productCost');
    const freight=creator?0:numberValue('freight');
    const insurance=creator?0:numberValue('insurance');
    const platformPercent=numberValue(creator?'serviceFee':'platformFee');
    const commissionPercent=numberValue('commissionPercent');
    const grossCommission=sale*commissionPercent/100;
    const estimatedRoi=commissionPercent>0?100/commissionPercent:0;
    const refundPercent=Math.min(100,numberValue('refundRate'));
    const platformRate=platformPercent/100;
    const refundRate=refundPercent/100;
    const successRate=1-refundRate;
    const platformFee=successRate*(creator?grossCommission:sale)*platformRate;
    const expectedProductCost=$('returnCostMode').value==='resell'?successRate*cost:cost;
    const preAdCost=platformFee+expectedProductCost+freight+insurance;
    const maxAdSpend=successRate*(creator?grossCommission:sale)-preAdCost;
    const margin=sale>0?maxAdSpend/sale*100:0;
    const valid=sale>0&&maxAdSpend>0;
    const safeRoi=valid?ceil2(sale/maxAdSpend):0;
    const pending=sale<=0||(creator&&commissionPercent<=0);

    $('breakEvenRoi').textContent=valid?safeRoi.toFixed(2):(pending?'请输入信息':'无法保本');
    $('breakEvenRoi').classList.toggle('invalid',!valid);

    $('maxAdSpend').textContent=money(creator?grossCommission:maxAdSpend);
    $('maxAdSpend').style.color=maxAdSpend>=0?'var(--text)':'#d44d43';
    $('platformFeeValue').textContent=money(creator?maxAdSpend:platformFee);
    $('marginValue').textContent=creator?(sale>0&&estimatedRoi>0?estimatedRoi.toFixed(2):'—'):margin.toFixed(2)+'%';

    const modeFormula=$('returnCostMode').value==='resell'
      ?'(1-'+refundPercent.toFixed(2)+'%)×['+sale.toFixed(2)+'×(1-'+platformPercent.toFixed(2)+'%)-'+cost.toFixed(2)+']'
      :'(1-'+refundPercent.toFixed(2)+'%)×['+sale.toFixed(2)+'×(1-'+platformPercent.toFixed(2)+'%)]-'+cost.toFixed(2);
    $('formulaValue').textContent=creator?sale.toFixed(2)+'×'+commissionPercent.toFixed(2)+'%×(1−'+platformPercent.toFixed(2)+'%)×(1−'+refundPercent.toFixed(2)+'%)='+maxAdSpend.toFixed(2):modeFormula+'-'+freight.toFixed(2)+'-'+insurance.toFixed(2)+'='+maxAdSpend.toFixed(2);
    $('formulaRoi').textContent=(creator?'1÷['+commissionPercent.toFixed(2)+'%×(1−'+platformPercent.toFixed(2)+'%)×(1−'+refundPercent.toFixed(2)+'%)]':sale.toFixed(2)+'÷'+maxAdSpend.toFixed(2))+'='+(valid?safeRoi.toFixed(2):(pending?'待输入':'无法保本'))+'（向上取两位）';
    ['formulaValue','formulaRoi'].forEach(id=>{$(id).title=$(id).textContent;});
    lastResult={
      sale:sale,cost:cost,freight:freight,insurance:insurance,
      platformPercent:platformPercent,refundPercent:refundPercent,
      platformFee:platformFee,preAdCost:preAdCost,maxAdSpend:maxAdSpend,
      margin:margin,safeRoi:safeRoi,valid:valid,
      mode:mode,commissionPercent:commissionPercent,grossCommission:grossCommission,estimatedRoi:estimatedRoi
    };
    configureScenario(pending);
  }

  function showToast(text,error){
    const toast=$('toast');
    toast.textContent=text;
    toast.classList.toggle('error',!!error);
    toast.classList.add('show');
    clearTimeout(timer);
    timer=setTimeout(()=>toast.classList.remove('show'),2400);
  }

  function saveCalculationAndClose(){
    const inputs={};
    fields.forEach(id=>{inputs[id]=numberValue(id);});
    const snapshot={
      version:2,inputs:inputs,mode:mode,returnCostMode:$('returnCostMode').value,
      targetRoi:lastResult&&lastResult.valid?Number($('roiSlider').value):0,
      savedAt:new Date().toISOString()
    };
    try{
      // This origin uses the calculator's persistent WebView2 profile. Finish
      // the synchronous write before the native bridge disposes the window.
      localStorage.setItem(savedCalculationKey,JSON.stringify(snapshot));
    }catch(error){
      showToast('保存失败，请检查本机存储空间后重试，当前数据仍保留在窗口中。',true);
      return;
    }
    post('close');
  }

  function restoreSavedCalculation(){
    try{
      const saved=localStorage.getItem(savedCalculationKey)||localStorage.getItem(legacyCalculationKey);
      if(!saved)return;
      let snapshot=JSON.parse(saved);
      if(snapshot&&snapshot.version===1&&snapshot.inputs&&['resell','lost'].includes(snapshot.mode)&&
        legacyFields.every(id=>Number.isFinite(snapshot.inputs[id])&&snapshot.inputs[id]>=0)){
        snapshot=Object.assign({},snapshot,{
          version:2,mode:'merchant',returnCostMode:snapshot.mode,
          inputs:Object.assign({},snapshot.inputs,{commissionPercent:0,serviceFee:0})
        });
      }
      // Validate the complete record before changing any of the input fields.
      if(!snapshot||snapshot.version!==2||!snapshot.inputs||
        !['merchant','creator'].includes(snapshot.mode)||!['resell','lost'].includes(snapshot.returnCostMode)||
        !Number.isFinite(snapshot.targetRoi)||snapshot.targetRoi<0||
        !fields.every(id=>Number.isFinite(snapshot.inputs[id])&&snapshot.inputs[id]>=0)){
        throw new Error('Invalid saved ROI calculation');
      }
      fields.forEach(id=>{$(id).value=String(snapshot.inputs[id]);});
      mode=snapshot.mode;
      $('returnCostMode').value=snapshot.returnCostMode;
      fields.forEach(id=>{$(id).value=numberValue(id).toFixed(2);});
      updateMode();
      calculate();
      if(lastResult.valid&&snapshot.targetRoi>0)setSliderValue(snapshot.targetRoi);
      showToast('已恢复上次保存的计算结果。',false);
    }catch(error){
      showToast('未能读取上次保存的数据，原记录已保留，请重新计算后保存。',true);
    }
  }

  fields.forEach(id=>{
    const input=$(id);
    input.addEventListener('input',calculate);
    input.addEventListener('blur',()=>{
      const original=Number(input.value);
      const value=numberValue(id);
      input.value=value.toFixed(2);
      // Formatting an unchanged field must not reset a restored target ROI.
      if(numberValue(id)!==original)calculate();
    });
  });
  document.querySelectorAll('.mode-card').forEach(button=>button.addEventListener('click',()=>{
    mode=button.dataset.mode;
    updateMode();
    calculate();
  }));
  $('returnCostMode').addEventListener('change',calculate);

  const roiSlider=$('roiSlider');
  const roiSliderShell=$('roiSliderShell');
  let draggingRoiSlider=false;

  function setSliderValue(value){
    const min=Number(roiSlider.min),max=Number(roiSlider.max),step=Number(roiSlider.step)||.01;
    const rounded=Math.round(clamp(value,min,max)/step)*step;
    roiSlider.value=clamp(rounded,min,max).toFixed(2);
    updateScenario();
  }

  function setSliderFromPointer(event){
    if(roiSlider.disabled)return;
    const rect=roiSlider.getBoundingClientRect();
    const ratio=clamp((event.clientX-rect.left)/rect.width,0,1);
    setSliderValue(Number(roiSlider.min)+ratio*(Number(roiSlider.max)-Number(roiSlider.min)));
  }

  roiSlider.addEventListener('input',updateScenario);
  roiSlider.addEventListener('keydown',event=>{
    if(roiSlider.disabled)return;
    const step=Number(roiSlider.step)||.01;
    let next=Number(roiSlider.value);
    if(event.key==='ArrowLeft'||event.key==='ArrowDown')next-=step;
    else if(event.key==='ArrowRight'||event.key==='ArrowUp')next+=step;
    else if(event.key==='PageDown')next-=step*10;
    else if(event.key==='PageUp')next+=step*10;
    else if(event.key==='Home')next=Number(roiSlider.min);
    else if(event.key==='End')next=Number(roiSlider.max);
    else return;
    event.preventDefault();
    setSliderValue(next);
  });
  roiSliderShell.addEventListener('pointerdown',event=>{
    if(roiSlider.disabled)return;
    draggingRoiSlider=true;
    roiSlider.focus();
    setSliderFromPointer(event);
    event.preventDefault();
  });
  window.addEventListener('pointermove',event=>{
    if(draggingRoiSlider)setSliderFromPointer(event);
  });
  window.addEventListener('pointerup',()=>{draggingRoiSlider=false;});
  window.addEventListener('pointercancel',()=>{draggingRoiSlider=false;});

  $('formulaToggle').addEventListener('click',()=>{
    const card=$('formulaCard');
    const collapsed=card.classList.toggle('collapsed');
    $('formulaToggle').setAttribute('aria-expanded',String(!collapsed));
  });

  $('resetButton').addEventListener('click',()=>{
    fields.forEach(id=>$(id).value='0.00');
    $('returnCostMode').value='resell';
    updateMode();
    calculate();
    $('salePrice').focus();
    showToast('数据已重置',false);
  });

  $('copyButton').addEventListener('click',()=>{
    if(!lastResult)calculate();
    else updateScenario();
    const result=lastResult;
    post('copyResult',{text:
      '创爆 ROI 测算结果（'+(mode==='creator'?'达人版':'商家版')+'）\r\n保本ROI：'+(result.valid?result.safeRoi.toFixed(2):'无法保本')+
      '\r\n商品售价：'+money(result.sale)+
      '\r\n预计退货率：'+result.refundPercent.toFixed(2)+'%'+
      (mode==='creator'?'\r\n佣金比例：'+result.commissionPercent.toFixed(2)+'%'+
      '\r\n平台服务费率：'+result.platformPercent.toFixed(2)+'%'+
      '\r\n预估佣金：'+money(result.grossCommission)+
      '\r\n结算佣金：'+money(result.maxAdSpend)+
      '\r\n预估ROI（未扣费及退货）：'+(result.estimatedRoi>0?result.estimatedRoi.toFixed(2):'无'):
      '\r\n预计平台扣点：'+money(result.platformFee)+
      '\r\n退货成本：'+($('returnCostMode').value==='resell'?'可回收':'全部损失')+
      '\r\n预计推广前总成本：'+money(result.preAdCost)+
      '\r\n推广前毛利率：'+result.margin.toFixed(2)+'%')+
      '\r\n可承受广告费/单：'+money(result.maxAdSpend)+
      (result.valid?'\r\n目标投放ROI：'+result.targetRoi.toFixed(2)+
      '\r\n目标ROI预计广告消耗：'+money(result.estimatedAdSpend)+
      '\r\n目标ROI预计结果：'+(Math.abs(result.estimatedProfit)<.005?'盈亏平衡 ¥0.00':(result.estimatedProfit>0?'盈利 ':'亏损 ')+moneyAbs(result.estimatedProfit)):'')});
  });

  $('closeButton').addEventListener('click',()=>post('close'));
  $('doneButton').addEventListener('click',saveCalculationAndClose);
  $('windowHeader').addEventListener('mousedown',event=>{
    if(event.button===0&&!event.target.closest('button'))post('dragWindow');
  });

  if(window.chrome&&window.chrome.webview){
    window.chrome.webview.addEventListener('message',event=>{
      const message=event.data||{};
      if(message.type==='toast')showToast(message.text,message.error);
    });
  }

  // Layout by the CSS viewport that WebView2 actually exposes. Native window
  // pixels and CSS pixels differ under Windows DPI scaling, so using only the
  // monitor size leaves gaps such as 621~680px where fixed rows get clipped.
  const roiApp=document.querySelector('.roi-app');
  let viewportFrame=0;
  function updateLayoutDensity(){
    viewportFrame=0;
    const width=document.documentElement.clientWidth||window.innerWidth;
    const height=document.documentElement.clientHeight||window.innerHeight;
    let density='regular';
    if(width<=900||height<=620)density='ultra-compact';
    else if(width<=980||height<=680)density='compact';
    else if(width<=1120||height<=780)density='comfortable';
    if(roiApp.dataset.density!==density)roiApp.dataset.density=density;
  }
  function scheduleLayoutDensity(){
    if(viewportFrame)return;
    viewportFrame=requestAnimationFrame(updateLayoutDensity);
  }
  window.addEventListener('resize',scheduleLayoutDensity);
  if('ResizeObserver' in window){
    const viewportObserver=new ResizeObserver(scheduleLayoutDensity);
    viewportObserver.observe(document.documentElement);
  }
  updateLayoutDensity();

  updateMode();
  calculate();
  restoreSavedCalculation();
  setTimeout(()=>{$('salePrice').focus();},80);
  post('ready');
}());
