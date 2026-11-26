/* Presentation only. Native owns authentication, quotas and all business commands. */
(function () {
  "use strict";
  var current = {}, adapter = null, panel, periodHome, lastPanelSignature = "", roiAdapter = null, roiDraft = null, roiBar = null, roiCountdownTimer = null;
  var shortViewport = window.matchMedia("(max-height:799px)"), shortAccountsExpanded = false, shortAccountsButton;
  function shortWindowPresentation() {
    var card=document.getElementById('account-card');
    if(!card||!shortAccountsButton)return;
    card.classList.toggle('aui-accounts-expanded',shortAccountsExpanded);
    shortAccountsButton.textContent=shortAccountsExpanded?'收起账户（显示 3 行）':'展开全部账户';
    shortAccountsButton.setAttribute('aria-expanded',String(shortAccountsExpanded));
    shortAccountsButton.hidden=document.querySelectorAll('#account-rows tr[data-account-key]').length<=3;
    document.querySelectorAll('#plan-rows tr').forEach(function(row){
      var name=row.querySelector('.plan-name-cell strong');if(!name||row.cells.length!==14)return;
      if(!name.hasAttribute('data-full-name-title'))name.dataset.fullNameTitle=name.title||name.textContent;
      var hint=name.dataset.fullNameTitle;
      if(shortViewport.matches&&document.body.classList.contains('aui-desktop'))hint+='\n支付成交额：'+row.cells[6].textContent.trim()+'\n订单数：'+row.cells[7].textContent.trim()+'\n成交成本：'+row.cells[8].textContent.trim();
      name.title=hint;row.cells[0].title=hint;
    });
  }
  shortViewport.addEventListener('change',shortWindowPresentation);
  var paths = {
    image: "M3 3h18v18H3zM3 16l5-5 5 5 3-3 5 5M8 7h.01",
    edit: "m4 16-1 5 5-1L20 8l-4-4L4 16M14 6l4 4M3 23h18",
    shop: "M4 10v10h16V10M3 10l2-6h14l2 6M3 10c0 4 5 4 5 0 0 4 8 4 8 0 0 4 5 4 5 0M9 20v-6h6v6",
    chart: "M4 20V10M10 20V4M16 20V8M22 20V2",
    user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-3c0-6 16-6 16 0v3z",
    refresh: "M20 7A8 8 0 1 0 21 14M20 2v6h-6",
    check: "m5 12 4 4L20 5", info: "M12 8v1M12 12v5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
    back: "m10 5-7 7 7 7M3 12h18", trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"
  };
  function el(tag, cls, text) { var n = document.createElement(tag); n.className = cls || ""; if (text !== undefined) n.textContent = text; return n; }
  function icon(name) { var n = document.createElementNS("http://www.w3.org/2000/svg", "svg"), p = document.createElementNS(n.namespaceURI,"path"); n.setAttribute("viewBox","0 0 24 24"); n.setAttribute("class","aui-icon"); n.setAttribute("aria-hidden","true"); p.setAttribute("d",paths[name] || paths.info); n.appendChild(p); return n; }
  function button(text, name, action) { var b = el("button","aui-button"); b.type = "button"; if(name)b.appendChild(icon(name)); b.appendChild(el("span","",text)); if(action)b.addEventListener("click",function(e){e.stopPropagation();action(e);}); return b; }
  function type(a) { return a.accountKind === "creator" ? "达人账户" : a.isQianchuanOnly ? "千川账户" : "商家账户"; }
  function list() { return Array.isArray(current.accounts) ? current.accounts : []; }
  function assets() { var a=(current.accountUi||{}).assets;return Array.isArray(a)?a:[]; }
  function assetFor(a) { return a.accountKind === "creator" ? null : assets().find(function(x){return x.key === a.key;}) || null; }
  function can(asset, action) { return !!(adapter && asset && !list().some(function(a){return a.key===asset.key&&a.accountKind==="creator";}) && asset.revision !== undefined && Array.isArray(asset.allowedActions) && asset.allowedActions.indexOf(action) >= 0); }
  function dispatch(action, asset) {
    // Re-read the latest projection at click time; never mutate authoritative state.
    var fresh = assets().find(function(x){return asset && x.key === asset.key;});
    if (!can(fresh, action)) return;
    Promise.resolve(adapter({action:action,key:fresh.key,revision:fresh.revision})).catch(function(){notice("操作未完成，请等待客户端返回最新状态后重试。",true);});
  }
  function notice(text, error) { var n = document.getElementById("aui-notice"); if(!n){n=el("div","aui-notice");n.id="aui-notice";n.setAttribute("role","status");panel.prepend(n);} n.textContent=text;n.classList.toggle("error",!!error); }
  function setup() {
    if (panel) return;
    panel=el("section","aui-workspace");panel.hidden=true;panel.id="aui-workspace";document.body.appendChild(panel);
    periodHome=document.createComment("original period control position");var period=document.getElementById("period-switch");period.parentNode.insertBefore(periodHome,period);
    shortAccountsButton=button('展开全部账户',null,function(){shortAccountsExpanded=!shortAccountsExpanded;shortWindowPresentation();});
    shortAccountsButton.id='aui-expand-accounts';shortAccountsButton.setAttribute('aria-controls','account-list-viewport');
    document.getElementById('account-card').appendChild(shortAccountsButton);
  }
  function close() { panel.hidden=true;document.getElementById("app").hidden=false;lastPanelSignature=""; }
  function header(title) { var h=el("header","aui-workspace-header");h.appendChild(el("h1","",title));h.appendChild(button("返回账户页","back",close));panel.appendChild(h); }
  function show(kind) {
    // Quota recovery belongs to the native add/login flow, never a standalone page.
    if (kind === "quota") return;
    panel.replaceChildren();lastPanelSignature="";panel.dataset.view=kind;panel.hidden=false;document.getElementById("app").hidden=true;
    renderWizard();
  }
  function renderWizard() {
    var w=(current.accountUi||{}).wizard || {},creator=w.kind==="creator";header(creator?"登录达人":w.kind==="qianchuan"?"登录千川":"登录店铺");
    var split=el("div","aui-wizard"),host=el("section","aui-panel aui-platform-host");host.id="aui-platform-host";
    host.appendChild(el("h2","",w.kind==="shop"?"抖店官方登录页面":creator?"百应官方登录页面":"千川官方登录 / 账户选择页面"));
    host.appendChild(el("div","aui-host-placeholder","官方页面由客户端在此承载，使用现有登录会话。"));
    host.appendChild(el("p","aui-notice",w.hostReady?"请在左侧官方页面完成操作。":"等待客户端接入嵌入式登录页面；此处不生成二维码、不新建登录会话。"));split.appendChild(host);
    var right=el("section","aui-panel aui-steps"),names=creator?["扫码登录","确认达人","同步完成"]:["扫码登录",w.kind==="qianchuan"?"确认主体":"确认店铺","选择千川账户","同步完成"];
    names.forEach(function(n,i){var s=(w.steps||[])[i]||{},row=el("div","aui-step "+(["current","success","failure"].indexOf(s.state)>=0?s.state:"pending"));row.appendChild(el("span","aui-step-number",s.state==="success"?"✓":String(i+1)));var copy=el("div");copy.appendChild(el("h2","",n));copy.appendChild(el("p","",s.message||"等待前一步完成"));row.appendChild(copy);right.appendChild(row);});split.appendChild(right);panel.appendChild(split);
    panel.appendChild(el("p","aui-notice",w.notice||"登录进度和失败原因由客户端返回，已完成步骤保留。"));
  }
  function decorateRows() {
    if(current.pageMode && current.pageMode!=="accounts")return;
    var heading=document.querySelector(".account-table thead th");if(heading)heading.textContent="账户类型";
    document.querySelectorAll("#account-rows tr[data-account-key]").forEach(function(row){
      var a=list().find(function(x){return x.key===row.dataset.accountKey;});if(!a)return;
      // Reuse the existing plan-status cell without changing native commands
      // or the column indexes used by other account pages.
      var planSync=/^(已同步|同步中|同步失败)$/.test(a.syncStatus||'')?a.syncStatus:'—';
      var planSyncBadge=el('span','aui-plan-sync '+(planSync==='已同步'?'good':planSync==='同步失败'?'bad':'neutral'),planSync);
      row.cells[7].replaceChildren(planSyncBadge);row.cells[7].title=planSync;
      var badge=row.cells[0].querySelector('.aui-type');if(!badge){badge=el('span','aui-type');row.cells[0].replaceChildren(badge);}badge.textContent=type(a);badge.dataset.kind=a.accountKind==='creator'?'creator':a.isQianchuanOnly?'qianchuan':'merchant';
      var asset=assetFor(a),operation=row.cells[8]&&row.cells[8].firstElementChild;
      row.dataset.auiSource=JSON.stringify([asset,!!adapter]);row.dataset.slotState=asset?asset.state:"";
      if(a.accountKind==="creator") {
        // Creator precedence also covers creator accounts marked isQianchuanOnly.
        if(operation&&/名额|升级套餐|一键恢复/.test(operation.textContent)) {operation.textContent=a.buyinLoginVerified?"查看":"去登录";operation.disabled=true;operation.title="等待客户端提供达人登录操作";}
        if(/名额/.test(row.cells[2].textContent)){row.cells[2].textContent=a.buyinLoginVerified?"登录成功":"未登录";}
        row.querySelectorAll(".account-selection-notice").forEach(function(n){if(/名额|升级套餐/.test(n.textContent))n.remove();});
      } else if(asset) {
        var signature=JSON.stringify([asset,!!adapter]);
        if(row.dataset.auiSignature!==signature||!row.querySelector(".aui-slot-status")){
          row.dataset.auiSignature=signature;
          var labels={released:"名额被释放",quota_exceeded:"名额已满（超出套餐）",type_unverified:"账户类型待核实",unselected:"需要选择千川账户"};
          var label=labels[asset.state];if(label){var status=el("span","aui-slot-status",label);row.cells[2].replaceChildren(status);
            if(asset.state==="released")row.cells[2].appendChild(el("div","aui-release-detail",(asset.releasedAt||"释放时间待同步")+" · 来源："+(asset.sourceComputer||"待同步")));
            if(asset.state==="released") {row.cells[8].replaceChildren();var actions=[["一键恢复","restore"]];actions.forEach(function(entry){var b=button(entry[0],entry[1]==="restore"?"refresh":null,function(){dispatch(entry[1],asset);});b.disabled=!can(asset,entry[1]);if(b.disabled)b.title="等待客户端接通名额接口";row.cells[8].appendChild(b);});}
          }
        }
      }
      if(operation&&operation.classList.contains('operation-link')&&!a.recoveryAction) {
        if(/选择.*账户/.test(operation.textContent))operation.textContent='选择账户';
        else if(/登录/.test(operation.textContent))operation.textContent='去登录';
        else if(a.loginStatus==='正常'||a.loginStatus==='登录成功'||a.buyinLoginVerified){operation.textContent='查看计划';operation.dataset.command=a.hasOfficial?'officialSelect':'selectAccount';operation.dataset.key=a.hasOfficial?a.officialId:a.key;}
      }
      row.querySelectorAll('.account-refresh-failure,.account-selection-notice').forEach(function(n){if(n.textContent!=='!'){n.title=n.textContent;n.setAttribute('aria-label',n.textContent);n.textContent='!';}});
      row.cells[2].title=row.cells[2].textContent;
    });
    shortWindowPresentation();
  }
  function planForKey(key) { return (current.plans||[]).find(function(p){return String(p.uiKey||p.id)===key;}); }
  function closeRoi() { if(roiCountdownTimer!==null){clearInterval(roiCountdownTimer);roiCountdownTimer=null;}roiDraft=null;if(roiBar)roiBar.remove();roiBar=null; }
  function roiMessage(text) { if(roiBar)roiBar.querySelector('.aui-roi-message').textContent=text; }
  function updateRoiCountdown() {
    if(!roiDraft||!roiBar)return;
    var p=planForKey(roiDraft.key),end=Date.parse(p&&p.targetRoiNextEditableAtUtc||''),node=roiBar.querySelector('.aui-roi-countdown');
    var seconds=Number.isFinite(end)?Math.min(3600,Math.max(0,Math.ceil((end-Date.now())/1000))):0;
    node.hidden=seconds===0||!!(p&&p.targetRoiVerificationPending);
    node.textContent=seconds>0?'建议间隔倒计时 '+String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')+'；仍可确认修改。':'';
  }
  function openRoi(key) {
    var p=planForKey(key);if(!p)return;closeRoi();
    roiDraft={key:key,accountKey:current.selectedAccountKey,planId:String(p.id),currentValue:String(p.targetRoiValue||p.targetRoi||'—'),advertiserId:p.webTargetRoiAdvertiserId,expectedEnabled:p.deliveryEnabled,pending:false,nativeConfirmed:false};
    roiBar=el('section','aui-roi-bar');roiBar.setAttribute('aria-label','调整目标 ROI');
    var title=el('strong','aui-roi-title');title.appendChild(icon('edit'));title.appendChild(el('span','','调整目标 ROI · '+p.name));roiBar.appendChild(title);
    roiBar.title='账户 '+(p.accountName||current.selectedAccountKey)+' · '+(roiDraft.advertiserId||'待核实')+'；计划 ID：'+roiDraft.planId;
    roiBar.appendChild(el('span','aui-roi-current','当前 '+roiDraft.currentValue));roiBar.appendChild(el('span','aui-roi-arrow','→'));
    var label=el('label','','新目标 ROI'),input=el('input');input.id='aui-target-roi';input.type='number';input.min='0.01';input.step='0.01';input.value=Number(p.targetRoi)>0?p.targetRoi:'';label.htmlFor=input.id;roiBar.appendChild(label);roiBar.appendChild(input);
    roiBar.appendChild(button('取消',null,closeRoi));var confirm=button('确认调整',null,submitRoi);confirm.classList.add('primary');roiBar.appendChild(confirm);
    var blocked=p.webTargetRoiEditable===false&&p.webTargetRoiBlockReason;
    var message=el('p','aui-roi-message',blocked||(p.deliveryEnabled===false?'仅修改目标 ROI，不开启计划；提交后回读确认。':'修改后立即生效，可能影响消耗速度'));confirm.disabled=!!blocked;message.setAttribute('role','status');title.appendChild(message);title.appendChild(el('p','aui-roi-countdown'));document.querySelector('.diagnosis-card').appendChild(roiBar);updateRoiCountdown();roiCountdownTimer=setInterval(updateRoiCountdown,1000);input.focus({preventScroll:true});input.select();
  }
  function submitRoi() {
    if(!roiDraft||roiDraft.pending)return;var p=planForKey(roiDraft.key),input=roiBar.querySelector('input'),value=Number(input.value);
    if(!p||current.selectedAccountKey!==roiDraft.accountKey){roiMessage('账户或计划已变化，请重新选择计划。');return;}
    if(!input.value||!Number.isFinite(value)||value<=0||value>10000||!input.checkValidity()){roiMessage('请输入大于 0 的有效 ROI，最多两位小数。');input.focus();return;}
    if(String(p.targetRoiValue||p.targetRoi)!==roiDraft.currentValue){roiMessage('当前 ROI 已更新，请取消后重新打开确认条。');return;}
    if(!roiAdapter){roiMessage('目标 ROI 提交接口尚未接入，请等待客户端完成接入。当前值未修改。');return;}
    var draft=roiDraft;draft.pending=true;draft.requestedValue=value;roiBar.querySelector('.primary').disabled=true;input.disabled=true;roiMessage('正在提交，请等待客户端回读确认…');
    Promise.resolve().then(function(){return roiAdapter({action:'setTargetRoi',accountKey:draft.accountKey,planId:draft.planId,uiKey:draft.key,expectedValue:draft.currentValue,value:value,advertiserId:draft.advertiserId,expectedEnabled:draft.expectedEnabled});}).then(function(){if(roiDraft!==draft)return;draft.nativeConfirmed=true;roiMessage('已提交，等待客户端回读确认；当前值尚未更新。');pencils();}).catch(function(error){if(roiDraft!==draft)return;draft.pending=false;input.disabled=false;roiBar.querySelector('.primary').disabled=true;roiMessage('调整未完成：'+(error&&error.message||'请核对最新数据后重试。'));});
  }
  function pencils() {
    if(current.pageMode && current.pageMode!=='accounts')return;
    document.querySelectorAll('#plan-rows tr').forEach(function(row){
      if(row.cells.length<14)return;var name=row.querySelector('.plan-name-cell'),meta=row.querySelector('.official-plan-metadata');
      var key=name?(name.dataset.uiKey||name.dataset.planId):null;if(!key&&meta){var p=(current.plans||[]).find(function(p){return String(p.advertiserId||current.selectedAccountKey)+'|'+p.id===meta.dataset.key;});key=p&&String(p.uiKey||p.id);}
      var target=row.cells[10];if(key&&!target.querySelector('.aui-pencil')){var pencil=button('','edit',function(){openRoi(key);});pencil.className='aui-pencil';pencil.title='编辑目标 ROI';pencil.setAttribute('aria-label','编辑目标 ROI');target.appendChild(pencil);}
      var input=row.cells[11].querySelector('input.roi-inline');if(input&&!row.cells[11].querySelector('.aui-pencil')){var b=button('','edit',function(){input.focus();input.select();});b.className='aui-pencil';b.disabled=input.disabled;b.title='编辑保本 ROI';b.setAttribute('aria-label','编辑保本 ROI');row.cells[11].appendChild(b);}
      var profit=row.cells[13].querySelector('span');if(profit){profit.className='aui-profit '+(profit.textContent==='盈利'?'gain':profit.textContent==='亏损'?'loss':'unknown');}
      var product=row.querySelector('.browser-product'),plan=key&&planForKey(key);
      if(product&&!product.querySelector('.aui-product-picture')){var picture=el('span','aui-product-picture');var source=plan&&plan.productImageUrl;
        var placeholder=el('span','aui-product-placeholder');placeholder.appendChild(icon('image'));placeholder.title='商品图片未提供';placeholder.setAttribute('aria-label','商品图片未提供');picture.appendChild(placeholder);
        try{var url=new URL(source,location.href);if(source&&((url.protocol==='https:'&&!url.username&&!url.password)||url.protocol==='data:'&&/^data:image\/(png|jpeg|webp);base64,/i.test(source))){var image=el('img');image.alt='商品缩略图';image.referrerPolicy='no-referrer';image.addEventListener('load',function(){placeholder.hidden=true;});image.addEventListener('error',function(){image.remove();placeholder.hidden=false;});image.src=url.href;picture.appendChild(image);}}catch(ignore){}
        var copy=el('div','aui-product-copy');while(product.firstChild)copy.appendChild(product.firstChild);product.appendChild(picture);product.appendChild(copy);
      }
    });
    document.querySelectorAll('.plan-table th,.plan-table td,.current-store-badge').forEach(function(n){if(!n.title)n.title=n.textContent.trim();});
    shortWindowPresentation();
    if(roiDraft){var fresh=planForKey(roiDraft.key);if(current.selectedAccountKey!==roiDraft.accountKey||!fresh){closeRoi();return;}
      if(!roiDraft.pending&&!roiDraft.nativeConfirmed&&(String(fresh.targetRoiValue||fresh.targetRoi)!==roiDraft.currentValue||fresh.deliveryEnabled!==roiDraft.expectedEnabled||fresh.webTargetRoiAdvertiserId!==roiDraft.advertiserId)){closeRoi();return;}
      if(roiDraft.pending&&roiDraft.nativeConfirmed&&Number(fresh.targetRoi)===roiDraft.requestedValue){closeRoi();return;}
    }
  }
  function render(state) {
    current=state;setup();var active=!state.pageMode||state.pageMode==="accounts";document.body.classList.toggle("aui-desktop",active);document.body.classList.toggle('aui-standard-plan',active&&!state.officialSelected);
    var period=document.getElementById("period-switch"),headerActions=document.querySelector(".native-header-actions");
    if(!active){closeRoi();if(period.parentNode===headerActions)periodHome.parentNode.insertBefore(period,periodHome.nextSibling);close();return;}
    if(period.parentNode!==headerActions)headerActions.insertBefore(period,headerActions.querySelector(".last-sync-label"));
    document.getElementById("manage-shop-slots").hidden=true;
    decorateRows();pencils();updateRoiCountdown();
    if(!panel.hidden){var signature=JSON.stringify(state.accountUi||{});if(signature!==lastPanelSignature){panel.replaceChildren();renderWizard();lastPanelSignature=signature;}}
  }
  function prepare(state) {
    current=state;
    document.querySelectorAll("#account-rows tr[data-account-key]").forEach(function(row){var a=list().find(function(x){return x.key===row.dataset.accountKey;});if(!a)return;var signature=JSON.stringify([assetFor(a),!!adapter]);if(row.dataset.auiSource!==signature){if(row.cells[8]&&row.cells[8].querySelector(".aui-button"))row.cells[8].replaceChildren();delete row.dataset.signature;row.dataset.auiSource=signature;delete row.dataset.auiSignature;}});
  }
  window.QianchuanAccountUi={prepare:prepare,render:render,show:show,close:close,accountType:type,decorateAccounts:decorateRows,decoratePlans:pencils,
    connectTargetRoi:function(handler){roiAdapter=typeof handler==="function"?handler:null;},
    connect:function(handler){adapter=typeof handler==="function"?handler:null;render(current);}};
})();
