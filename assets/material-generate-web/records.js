(function () {
  'use strict';
  const bridge = window.chrome && window.chrome.webview;
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const icon = name => `<img class="records-icon" src="record-icons/${name}.svg" alt="" aria-hidden="true">`;
  const page = document.createElement('section');
  page.id = 'generationRecords'; page.className = 'records-page'; page.hidden = true;
  page.setAttribute('aria-label', '生成记录');
  page.innerHTML = `<header class="records-toolbar"><div class="records-heading"><h1>生成记录</h1><span id="recordsSummary" role="status"></span></div><div class="records-tools"><label class="records-search">${icon('search')}<input id="recordsSearch" type="search" placeholder="搜索商品名称 / ID" aria-label="搜索生成记录"></label><select id="recordsShop" aria-label="按店铺筛选生成记录"><option>全部店铺</option></select><button id="recordsRefresh" class="records-button">${icon('refresh-cw')}刷新</button><button id="recordsBack" class="records-button records-back">${icon('arrow-left')}返回素材生成</button></div></header>
    <div id="recordsError" class="records-error" role="alert" hidden></div>
    <div class="records-table-wrap"><table class="records-table"><colgroup><col class="record-time-col"><col class="record-preview-col"><col><col class="record-config-col"><col class="record-status-col"><col class="record-action-col"></colgroup><thead><tr><th scope="col">生成时间</th><th scope="col">素材预览</th><th scope="col">商品信息</th><th scope="col">生成配置</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead><tbody id="recordsRows"></tbody></table><div id="recordsEmpty" class="records-empty" hidden></div></div>
    <footer class="records-pagination"><span id="recordsCount"></span><nav aria-label="生成记录分页"><button id="recordsPrevious" class="records-page-button" aria-label="上一页">${icon('chevron-left')}</button><span id="recordsPage" aria-current="page"></span><button id="recordsNext" class="records-page-button" aria-label="下一页">${icon('chevron-right')}</button><select id="recordsPageSize" aria-label="每页记录数量"><option value="10">10条/页</option><option value="20">20条/页</option></select></nav></footer>`;
  document.body.appendChild(page);
  const details = document.createElement('dialog'); details.className = 'record-details'; details.setAttribute('aria-labelledby','recordDetailsTitle');
  document.body.appendChild(details);
  const el = id => document.getElementById(id);
  let history = { rows: [], loading: false, error: '' }, visible = false, optimisticOpen = false, optimisticClose = false;
  let pageIndex = 1, pageSize = 10, search = '', shop = '全部店铺', storeSignature = '', dataSignature = '', busy = false;
  const requestedPreviews = new Set();
  const post = (command, payload) => { if (bridge) bridge.postMessage({type:'command',command,payload:payload || {}}); };
  function show(value) {
    visible = value; page.hidden = !value;
    document.body.classList.toggle('records-open', value);
    if (!value && details.open) details.close();
  }
  function open() { optimisticOpen = true; optimisticClose = false; show(true); history.loading = true; render(); }
  function close() { optimisticClose = true; optimisticOpen = false; show(false); post('closeRecords'); }
  function update(state) {
    const incoming = state.generationHistory;
    if (incoming) {
      history = incoming;
      if (incoming.visible) optimisticOpen = false;
      if (!incoming.visible) optimisticClose = false;
      show((!!incoming.visible || optimisticOpen) && !optimisticClose);
    }
    busy = !!(state.generationBusy || state.analysisBusy || state.planBusy);
    if (visible) render();
    return visible;
  }
  function filteredRows() {
    const query = search.trim().toLocaleLowerCase();
    return (history.rows || []).filter(row => (shop === '全部店铺' || row.shop === shop) && (!query || [row.name,row.productId,row.shop,row.id].join(' ').toLocaleLowerCase().includes(query)));
  }
  function dateParts(value) {
    const match = String(value || '').match(/^(\d{4}-\d\d-\d\d)[T ](\d\d:\d\d)(?::\d\d)?/);
    return match ? [match[1],match[2]] : [String(value || '未记录时间'),''];
  }
  function rowMarkup(row) {
    const dates = dateParts(row.createdAt), completed = Math.max(0,Number(row.completed)||0), total = Math.max(1,Number(row.requested)||1);
    const states = {completed:['success','check-circle-fill','已完成'],partial:['partial','alert-circle','部分完成'],failed:['failed','x-circle','生成失败'],interrupted:['failed','alert-circle','已中断'],running:['running','loader','生成中'],queued:['waiting','clock','排队中']};
    const status = states[row.status] || ['waiting','clock',row.statusText || '未知状态'];
    const hasImage = /^data:image\/(jpeg|png|webp);base64,/.test(row.preview || '');
    const progress = row.status === 'running' ? `<small class="record-progress">${Math.max(0,Math.min(100,Number(row.progress)||0))}%</small>` : '';
    return `<td class="record-time"><span>${escape(dates[0])}</span><span>${escape(dates[1])}</span></td><td><button class="record-preview" data-record-view="${escape(row.id)}" aria-label="查看${escape(row.name || '商品')}生成结果" ${busy ? 'disabled' : ''}>${hasImage ? `<img class="record-thumb" src="${escape(row.preview)}" alt="生成素材预览">` : `<span class="record-image-pending">${icon('image')}<small>${completed ? '预览加载中' : '待生成'}</small></span>`}<span class="record-image-count">${completed}张</span></button></td>
      <td class="record-product"><button class="record-product-name" data-record-details="${escape(row.id)}" title="${escape(row.name || '未命名商品')} · 点击查看任务详情">${escape(row.name || '未命名商品')}</button><span class="record-shop" title="${escape(row.shopLabel || row.shop)}">${escape(row.shopLabel || row.shop || '店铺未识别')}</span></td>
      <td class="record-config"><span title="${escape(row.style)}">${escape(row.style || '未记录风格')}</span><small>${escape(row.aspect || '未记录比例')} · ${escape(row.quality || '—')}</small></td>
      <td><div class="record-status ${status[0]}" title="${escape(row.error || '')}">${icon(status[1])}<span>${escape(status[2])} <b>${completed}/${total}</b></span></div>${progress}</td>
      <td><div class="record-actions"><button class="records-button record-view" data-record-view="${escape(row.id)}" ${busy ? 'disabled title="当前任务执行中，完成后可切换查看"' : ''}>查看结果</button><button class="record-folder" data-record-folder="${escape(row.id)}">${icon('folder')}打开目录</button></div></td>`;
  }
  function render() {
    const all = history.rows || [], active = all.filter(row => row.status === 'running' || row.status === 'queued').length;
    el('recordsSummary').textContent = all.length ? `共 ${all.length} 个任务 · ${active} 个生成中` : history.loading ? '正在读取任务记录…' : '共 0 个任务';
    el('recordsRefresh').disabled = !!history.loading;
    el('recordsRefresh').setAttribute('aria-busy', String(!!history.loading));
    el('recordsError').hidden = !history.error; el('recordsError').textContent = history.error || '';
    const shops = Array.from(new Set(all.map(row => row.shop).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'zh-CN'));
    const nextStoreSignature = JSON.stringify(shops);
    if (storeSignature !== nextStoreSignature) {
      storeSignature = nextStoreSignature;
      if (shop !== '全部店铺' && !shops.includes(shop)) { shop = '全部店铺'; pageIndex = 1; }
      el('recordsShop').innerHTML = ['全部店铺',...shops].map(value=>`<option value="${escape(value)}">${escape(value)}</option>`).join('');
      el('recordsShop').value = shop;
    }
    const filtered = filteredRows(), pages = Math.max(1,Math.ceil(filtered.length/pageSize));
    pageIndex = Math.min(pageIndex,pages);
    const rows = filtered.slice((pageIndex-1)*pageSize,pageIndex*pageSize);
    const signature = JSON.stringify([rows,busy]);
    if (signature !== dataSignature) {
      dataSignature = signature;
      const tbody = el('recordsRows');
      const previous = new Map(Array.from(tbody.children).map(row=>[row.dataset.recordId,row]));
      rows.forEach((row,index)=>{
        let node = previous.get(row.id);
        if (!node) { node=document.createElement('tr'); node.dataset.recordId=row.id; }
        const markup=rowMarkup(row);
        if (node._recordMarkup !== markup) { node.innerHTML=markup; node._recordMarkup=markup; }
        if (tbody.children[index] !== node) tbody.insertBefore(node,tbody.children[index] || null);
        previous.delete(row.id);
      });
      previous.forEach(node=>node.remove());
    }
    el('recordsEmpty').hidden = rows.length > 0;
    el('recordsEmpty').textContent = history.loading && !all.length ? '正在读取生成记录…' : history.error && !all.length ? '暂时无法读取记录，请点击刷新重试' : all.length ? '没有匹配的记录，试试其他商品名称或店铺' : '暂无生成记录，完成素材生成后可在这里查看';
    el('recordsCount').textContent = filtered.length === all.length ? `共 ${all.length} 条记录` : `找到 ${filtered.length} 条，共 ${all.length} 条记录`;
    el('recordsPage').textContent = `${pageIndex} / ${pages}`;
    el('recordsPrevious').disabled = pageIndex <= 1;
    el('recordsNext').disabled = pageIndex >= pages;
    const ids = rows.filter(row=>!row.preview && Number(row.completed)>0 && !requestedPreviews.has(row.id)).map(row=>row.id);
    ids.forEach(id=>requestedPreviews.add(id));
    if (ids.length) post('recordThumbnails',{ids});
  }
  function showDetails(id) {
    const row=(history.rows || []).find(item=>item.id===id); if (!row) return;
    details.innerHTML=`<div class="record-detail-header"><h2 id="recordDetailsTitle">任务详情</h2><button class="record-detail-close" aria-label="关闭任务详情">${icon('x')}</button></div><h3>${escape(row.name || '未命名商品')}</h3><dl>${[['商品店铺',row.shopLabel || row.shop],['商品 ID',row.productId],['任务编号',row.id],['生成时间',row.createdAt],['生成配置',[row.style,row.aspect,row.quality].filter(Boolean).join(' · ')],['任务状态',row.statusText],['提示',row.error]].filter(pair=>pair[1]).map(pair=>`<dt>${pair[0]}</dt><dd>${escape(pair[1])}</dd>`).join('')}</dl>`;
    details.querySelector('.record-detail-close').onclick=()=>details.close(); details.showModal();
  }
  el('recordsSearch').addEventListener('input',event=>{ search=event.target.value;pageIndex=1;render(); });
  el('recordsShop').addEventListener('change',event=>{shop=event.target.value;pageIndex=1;render();});
  el('recordsRefresh').onclick=()=>{requestedPreviews.clear();history.loading=true;render();post('refreshRecords');};
  el('recordsBack').onclick=close;
  el('recordsPrevious').onclick=()=>{pageIndex=Math.max(1,pageIndex-1);render();};
  el('recordsNext').onclick=()=>{pageIndex++;render();};
  el('recordsPageSize').onchange=event=>{pageSize=Number(event.target.value);pageIndex=1;render();};
  page.addEventListener('click',event=>{
    const target=event.target.closest('[data-record-view],[data-record-folder],[data-record-details]'); if (!target || target.disabled) return;
    if (target.dataset.recordDetails) showDetails(target.dataset.recordDetails);
    else if (target.dataset.recordView) post('viewRecord',{id:target.dataset.recordView});
    else post('openRecordFolder',{id:target.dataset.recordFolder});
  });
  details.addEventListener('click',event=>{if(event.target===details) details.close();});
  window.MaterialRecords = {open,update};
})();
