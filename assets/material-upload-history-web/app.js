(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const state = { records: [], stores: [], page: 1, pageSize: 10, active: null, selected: new Set(), toastTimer: 0 };
  const bridge = window.chrome && window.chrome.webview;
  let renderGeneration = 0;
  let lastRecordSignature = '';
  let lastStoreSignature = '';
  const command = (name, payload = {}) => bridge && bridge.postMessage({ type: 'command', command: name, payload });
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const normalize = (value) => String(value ?? '').toLocaleLowerCase('zh-CN');

  function statusClass(status) {
    if (status.includes('成功')) return 'success';
    if (status.includes('失败')) return 'failed';
    if (status.includes('上传中')) return 'running';
    if (status.includes('重试') || status.includes('暂停')) return 'waiting';
    return 'cancelled';
  }
  function splitTime(value) {
    const parts = String(value || '').split(' ');
    if (parts.length < 2) return [value || '--', ''];
    const today = new Date();
    const y = today.getFullYear(), m = String(today.getMonth()+1).padStart(2,'0'), d = String(today.getDate()).padStart(2,'0');
    const label = parts[0] === `${y}-${m}-${d}` ? '今天' : parts[0];
    return [label, parts.slice(1).join(' ')];
  }
  function previewHtml(record) {
    const items = record.items || [];
    const shown = items.slice(0, 3);
    const thumbs = shown.map(item => item.preview
      ? `<img class="thumb" loading="lazy" decoding="async" src="${escapeHtml(item.preview)}" alt="">`
      : `<span class="thumb">${escapeHtml(item.fileType || '素材')}</span>`).join('');
    const extra = items.length > 3 ? `<span class="preview-more">+${items.length - 3}</span>` : '';
    return `<div class="preview-stack" data-open-batch="${escapeHtml(record.id)}" tabindex="0" title="查看本上传计划的全部 ${items.length} 张图片">${thumbs}${extra}<span class="preview-count">共${items.length}张</span></div>`;
  }
  function filteredRecords() {
    const query = normalize($('searchInput').value.trim());
    const store = $('storeFilter').value, status = $('statusFilter').value, type = $('typeFilter').value;
    const days = Number($('rangeFilter').value || 0);
    const cutoff = days ? Date.now() - days * 86400000 : 0;
    return state.records.filter(record => {
      const haystack = normalize([record.fileName, record.shop, record.plan, record.remark, ...(record.items || []).map(i => i.fileName)].join(' '));
      if (query && !haystack.includes(query)) return false;
      if (store && record.shop !== store) return false;
      if (status && !String(record.status || '').includes(status)) return false;
      if (type && !String(record.type || '').includes(type)) return false;
      if (cutoff && record.time) { const when = new Date(String(record.time).replace(' ', 'T')).getTime(); if (Number.isFinite(when) && when < cutoff) return false; }
      return true;
    });
  }
  function renderTable() {
    document.querySelectorAll('[data-status-filter]').forEach(button => {
      const active = button.dataset.statusFilter === $('statusFilter').value;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const records = filteredRecords();
    const pages = Math.max(1, Math.ceil(records.length / state.pageSize));
    state.page = Math.min(state.page, pages);
    const start = (state.page - 1) * state.pageSize;
    const visible = records.slice(start, start + state.pageSize);
    $('recordCount').textContent = `共${records.length}条记录`;
    $('selectionHint').textContent = '已选择 0 个上传计划';
    $('emptyState').classList.toggle('visible', records.length === 0);
    $('recordsBody').innerHTML = visible.map(record => {
      const time = splitTime(record.time);
      const action = record.canRetry
        ? `<button class="link-button" data-retry="${escapeHtml(record.id)}">重新上传</button>`
        : `<button class="link-button" data-folder="${escapeHtml(record.id)}">打开位置</button>`;
      return `<tr>
        <td class="time-cell">${escapeHtml(time[0])}<small>${escapeHtml(time[1])}</small></td>
        <td>${previewHtml(record)}</td>
        <td class="file-cell" title="${escapeHtml(record.fileName)}">${escapeHtml(record.fileName)}<small>${record.count} 张图片</small></td>
        <td>${escapeHtml(record.count)} 张</td><td title="${escapeHtml(record.shop)}">${escapeHtml(record.shop || '--')}</td>
        <td title="${escapeHtml(record.plan)}">${escapeHtml(record.plan || '--')}</td>
        <td><span class="status ${statusClass(String(record.status || ''))}">${escapeHtml(record.status)}</span></td>
        <td title="${escapeHtml(record.remark)}">${escapeHtml(record.remark || '--')}</td>
        <td><div class="row-actions"><button class="link-button" data-open-batch="${escapeHtml(record.id)}">查看详情</button>${action}</div></td>
      </tr>`;
    }).join('');
    renderPagination(pages);
  }
  function renderPagination(pages) {
    const host = $('paginationButtons');
    const values = [];
    values.push(`<button class="page-nav" data-page="${Math.max(1, state.page - 1)}" ${state.page === 1 ? 'disabled' : ''}>上一页</button>`);

    let pageItems;
    if (pages <= 7) {
      pageItems = Array.from({ length: pages }, (_, index) => index + 1);
    } else if (state.page <= 3) {
      pageItems = [1, 2, 3, 'ellipsis', pages];
    } else if (state.page >= pages - 2) {
      pageItems = [1, 'ellipsis', pages - 2, pages - 1, pages];
    } else {
      pageItems = [1, 'ellipsis', state.page - 1, state.page, state.page + 1, 'ellipsis', pages];
    }

    for (const item of pageItems) {
      if (item === 'ellipsis') {
        values.push('<span class="page-ellipsis" aria-hidden="true">…</span>');
      } else {
        values.push(`<button data-page="${item}" class="${item === state.page ? 'current' : ''}" ${item === state.page ? 'aria-current="page"' : ''}>${item}</button>`);
      }
    }

    values.push(`<button class="page-nav" data-page="${Math.min(pages, state.page + 1)}" ${state.page === pages ? 'disabled' : ''}>下一页</button>`);
    host.innerHTML = values.join('');
  }
  function updateState(data) {
    const recordSignature = JSON.stringify(data.records || []);
    const storeSignature = JSON.stringify(data.stores || []);
    const recordsChanged = recordSignature !== lastRecordSignature;
    state.records = Array.isArray(data.records) ? data.records : [];
    state.stores = Array.isArray(data.stores) ? data.stores : [];
    $('totalStat').textContent = data.total || 0; $('successStat').textContent = data.success || 0;
    $('failedStat').textContent = data.failed || 0; $('runningStat').textContent = data.running || 0;
    $('updatedAt').textContent = data.updatedAt || '--:--';
    const selectedStore = $('storeFilter').value;
    if (storeSignature !== lastStoreSignature) {
      $('storeFilter').innerHTML = '<option value="">全部店铺</option>' + state.stores.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
      if (state.stores.includes(selectedStore)) $('storeFilter').value = selectedStore;
    }
    if (recordsChanged || $('storeFilter').value !== selectedStore) renderTable();
    if (recordsChanged && state.active) { const fresh = state.records.find(r => r.id === state.active.id); if (fresh) { state.active = fresh; renderModal(); } }
    lastRecordSignature = recordSignature;
    lastStoreSignature = storeSignature;
    notifyRendered();
  }
  function notifyRendered() {
    if (!bridge) return;
    const generation = ++renderGeneration;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (generation !== renderGeneration) return;
      const shell = document.querySelector('.page-shell');
      const bounds = shell ? shell.getBoundingClientRect() : { width: 0, height: 0 };
      const expectedRows = Math.min(filteredRecords().length, state.pageSize);
      bridge.postMessage({
        type: 'rendered',
        viewportWidth: document.documentElement.clientWidth,
        viewportHeight: document.documentElement.clientHeight,
        shellWidth: Math.round(bounds.width),
        shellHeight: Math.round(bounds.height),
        rowCount: document.querySelectorAll('#recordsBody tr').length,
        expectedRows
      });
    }));
  }
  function openModal(batchId) {
    const record = state.records.find(r => r.id === batchId); if (!record) return;
    state.active = record; state.selected = new Set((record.items || []).filter(i => i.exists).map(i => i.id));
    renderModal(); $('previewModal').classList.add('open'); $('previewModal').setAttribute('aria-hidden','false');
  }
  function closeModal() { $('previewModal').classList.remove('open'); $('previewModal').setAttribute('aria-hidden','true'); state.active = null; state.selected.clear(); }
  function renderModal() {
    const record = state.active; if (!record) return;
    const items = record.items || [];
    $('modalTitle').textContent = `本上传计划全部图片（${items.length}张）`;
    $('modalSubtitle').textContent = `${record.time || ''} · ${record.shop || '--'} · ${record.plan || '--'}`;
    $('assetGrid').innerHTML = items.map((item, index) => {
      const checked = state.selected.has(item.id), media = item.preview
        ? `<img loading="lazy" decoding="async" src="${escapeHtml(item.preview)}" alt="${escapeHtml(item.fileName)}">`
        : `<div class="asset-missing">${item.fileType === '视频' ? '视频素材' : '无可用预览'}</div>`;
      return `<article class="asset-card ${checked ? 'selected' : ''}">
        <div class="asset-preview">${media}<input class="asset-check" type="checkbox" data-select-item="${escapeHtml(item.id)}" ${checked ? 'checked' : ''} ${item.exists ? '' : 'disabled'}></div>
        <div class="asset-info"><strong title="${escapeHtml(item.fileName)}">${index + 1}. ${escapeHtml(item.fileName)}</strong>
        <div class="asset-meta"><span>${escapeHtml(item.fileType)}</span><span>${escapeHtml(item.fileSize)}</span></div>
        <div class="asset-actions"><span class="status ${statusClass(String(item.status || ''))}">${escapeHtml(item.status)}</span>${item.exists ? `<button class="link-button" data-download-item="${escapeHtml(item.id)}">下载</button>` : '<span class="unavailable">文件已移动</span>'}</div></div>
      </article>`;
    }).join('');
    const available = items.filter(i => i.exists);
    $('modalSelectAll').checked = available.length > 0 && available.every(i => state.selected.has(i.id));
    $('modalSelectAll').indeterminate = state.selected.size > 0 && !$('modalSelectAll').checked;
    $('modalSelectedCount').textContent = `已选择 ${state.selected.size} 个，共 ${items.length} 个`;
    $('downloadSelectedButton').disabled = state.selected.size === 0;
    $('downloadAllButton').disabled = available.length === 0;
  }
  function toast(text, error = false) { const el = $('toast'); el.textContent = text; el.classList.toggle('error', error); el.classList.add('show'); clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => el.classList.remove('show'), 2600); }
  document.addEventListener('click', (event) => {
    const filter = event.target.closest('[data-status-filter]');
    if (filter) { $('statusFilter').value = filter.dataset.statusFilter; state.page = 1; renderTable(); return; }
    const open = event.target.closest('[data-open-batch]'); if (open) { openModal(open.dataset.openBatch); return; }
    const retry = event.target.closest('[data-retry]'); if (retry) { command('retryBatch',{batchId:retry.dataset.retry}); return; }
    const folder = event.target.closest('[data-folder]'); if (folder) { command('openFolder',{batchId:folder.dataset.folder}); return; }
    const download = event.target.closest('[data-download-item]'); if (download && state.active) { command('downloadItem',{batchId:state.active.id,itemId:download.dataset.downloadItem}); return; }
    const page = event.target.closest('[data-page]'); if (page && !page.disabled) { state.page = Number(page.dataset.page); renderTable(); }
  });
  document.addEventListener('change', (event) => {
    if (event.target.matches('#storeFilter,#statusFilter,#typeFilter,#rangeFilter')) { state.page = 1; renderTable(); }
    if (event.target.matches('[data-select-item]')) { event.target.checked ? state.selected.add(event.target.dataset.selectItem) : state.selected.delete(event.target.dataset.selectItem); renderModal(); }
  });
  $('searchInput').addEventListener('input', () => { state.page = 1; renderTable(); });
  $('pageSize').addEventListener('change', () => { state.pageSize = Number($('pageSize').value); state.page = 1; renderTable(); });
  $('refreshButton').onclick = () => command('refreshHistory'); $('exportButton').onclick = () => command('exportHistory'); $('clearButton').onclick = () => command('clearHistory');
  $('modalClose').onclick = closeModal; $('modalCancel').onclick = closeModal; $('previewModal').onclick = e => { if (e.target === $('previewModal')) closeModal(); };
  $('modalSelectAll').onchange = () => { if (!state.active) return; state.selected = $('modalSelectAll').checked ? new Set(state.active.items.filter(i => i.exists).map(i => i.id)) : new Set(); renderModal(); };
  $('downloadSelectedButton').onclick = () => state.active && command('downloadItems',{batchId:state.active.id,itemIds:[...state.selected]});
  $('downloadAllButton').onclick = () => state.active && command('downloadAll',{batchId:state.active.id});
  $('openFolderButton').onclick = () => state.active && command('openFolder',{batchId:state.active.id});
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && state.active) closeModal(); });

  if (bridge) { bridge.addEventListener('message', event => { const data = event.data || {}; if (data.type === 'state') updateState(data); else if (data.type === 'probeRender') notifyRendered(); else if (data.type === 'toast') toast(data.text || '操作未完成', !!data.error); }); bridge.postMessage({type:'ready'}); }

  else updateState({records:[],stores:[],total:0,success:0,failed:0,running:0,updatedAt:'--:--'});
})();
