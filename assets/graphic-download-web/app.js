(function () {
  'use strict';

  var state = { tasks: [], shops: [], plans: [], summary: {}, inputStats: {}, busy: false, autoUpload: true };
  var taskFilter = 'all';
  var taskListMarkup = null;
  var inputTimer = 0;
  var titleTimer = 0;
  var contentTimer = 0;
  var pendingTitle = null;
  var pendingContent = null;
  var toastTimer = 0;
  var detailTaskId = '';
  var detailImageLimit = 12;
  var detailRenderSignature = '';
  var openUiSelect = null;
  var $ = function (id) { return document.getElementById(id); };

  function send(command, payload) {
    if (['selectTask', 'startAutomatic', 'downloadOnly', 'retryFailed', 'parseBatch', 'clearFinished'].indexOf(command) >= 0) {
      flushTextEdits();
    }
    if (window.chrome && window.chrome.webview) {
      window.chrome.webview.postMessage({ type: 'command', command: command, payload: payload || {} });
    }
  }

  function flushTextEdits() {
    clearTimeout(titleTimer);
    clearTimeout(contentTimer);
    var title = pendingTitle;
    var content = pendingContent;
    pendingTitle = null;
    pendingContent = null;
    if (title) send('updateTitle', title);
    if (content) send('updateContent', content);
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function clamp(value, minimum, maximum) {
    value = Number(value) || 0;
    return Math.max(minimum, Math.min(maximum, value));
  }

  function localInputStats(value) {
    var matches = String(value || '').match(/https?:\/\/[^\s，,；;]+/gi) || [];
    var entered = Math.min(matches.length, Number(state.batchLimit) || 100);
    var unique = {};
    var validOccurrences = 0;
    var duplicate = 0;
    matches.slice(0, entered).forEach(function (candidate) {
      try {
        var parsed = new URL(candidate.replace(/[.。)）\]】]+$/, ''));
        var host = parsed.hostname.toLowerCase();
        var validHost = host === 'douyin.com' || /\.douyin\.com$/.test(host);
        if (!validHost) return;
        validOccurrences++;
        var key = parsed.href.toLowerCase();
        if (unique[key]) duplicate++; else unique[key] = true;
      } catch (_) { }
    });
    return { entered: entered, valid: Object.keys(unique).length, duplicate: duplicate, invalid: Math.max(0, entered - validOccurrences) };
  }

  function setOptions(element, items, value, placeholder, getValue, getText) {
    var html = '<option value="">' + esc(placeholder) + '</option>';
    (items || []).forEach(function (item) {
      var optionValue = getValue ? getValue(item) : item;
      var optionText = getText ? getText(item) : item;
      html += '<option value="' + esc(optionValue) + '"' + (String(optionValue) === String(value) ? ' selected' : '') + '>' + esc(optionText) + '</option>';
    });
    if (element.dataset.optionsMarkup !== html) { element.innerHTML = html; element.dataset.optionsMarkup = html; }
    syncUiSelect(element);
  }

  function uiSelectOptions(root) {
    return Array.prototype.slice.call(root.querySelectorAll('.ui-select-option'));
  }

  function syncUiSelect(select) {
    var root = select && select.closest ? select.closest('.ui-select') : null;
    if (!root) return;
    var trigger = root.querySelector('.ui-select-trigger');
    var valueNode = root.querySelector('.ui-select-value');
    var menu = root.querySelector('.ui-select-menu');
    var selectedIndex = Math.max(0, select.selectedIndex);
    var selectedOption = select.options[selectedIndex] || select.options[0];
    var selectedText = selectedOption ? selectedOption.textContent : '';
    valueNode.textContent = selectedText;
    trigger.title = selectedText;
    trigger.disabled = !!select.disabled;
    root.classList.toggle('placeholder', !select.value);

    var html = '';
    Array.prototype.forEach.call(select.options, function (option, index) {
      var selected = index === selectedIndex;
      var optionId = root.id + '-option-' + index;
      html += '<button class="ui-select-option' + (selected ? ' selected' : '') + '"' +
        ' type="button" role="option" tabindex="-1" id="' + esc(optionId) + '"' +
        ' data-value="' + esc(option.value) + '" aria-selected="' + (selected ? 'true' : 'false') + '"' +
        (option.disabled ? ' disabled' : '') + ' title="' + esc(option.textContent) + '">' +
        esc(option.textContent) + '</button>';
    });
    if (menu.dataset.optionsMarkup !== html) { menu.innerHTML = html; menu.dataset.optionsMarkup = html; }
    if (root === openUiSelect) setUiSelectActive(root, selectedIndex);
  }

  function setUiSelectActive(root, index) {
    var options = uiSelectOptions(root);
    if (!options.length) return;
    index = clamp(index, 0, options.length - 1);
    options.forEach(function (option, optionIndex) {
      option.classList.toggle('active', optionIndex === index);
    });
    var trigger = root.querySelector('.ui-select-trigger');
    trigger.setAttribute('aria-activedescendant', options[index].id);
    if (root.classList.contains('open')) options[index].scrollIntoView({ block: 'nearest' });
  }

  function activeUiSelectIndex(root) {
    var options = uiSelectOptions(root);
    var activeIndex = options.findIndex(function (option) { return option.classList.contains('active'); });
    if (activeIndex >= 0) return activeIndex;
    var selectedIndex = options.findIndex(function (option) { return option.classList.contains('selected'); });
    return selectedIndex >= 0 ? selectedIndex : 0;
  }

  function positionUiSelectMenu(root) {
    var trigger = root.querySelector('.ui-select-trigger');
    var menu = root.querySelector('.ui-select-menu');
    root.classList.remove('drop-up');
    var rect = trigger.getBoundingClientRect();
    var availableBelow = window.innerHeight - rect.bottom - 12;
    var availableAbove = rect.top - 12;
    var desiredHeight = Math.min(menu.scrollHeight, 240);
    if (availableBelow < Math.min(desiredHeight, 150) && availableAbove > availableBelow) {
      root.classList.add('drop-up');
    }
  }

  function closeUiSelectMenu(root, restoreFocus) {
    root = root || openUiSelect;
    if (!root) return;
    var trigger = root.querySelector('.ui-select-trigger');
    var menu = root.querySelector('.ui-select-menu');
    root.classList.remove('open', 'drop-up');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    menu.hidden = true;
    if (openUiSelect === root) openUiSelect = null;
    if (restoreFocus) trigger.focus();
  }

  function openUiSelectMenu(root) {
    if (!root || root.classList.contains('open')) return;
    if (openUiSelect && openUiSelect !== root) closeUiSelectMenu(openUiSelect, false);
    var trigger = root.querySelector('.ui-select-trigger');
    var menu = root.querySelector('.ui-select-menu');
    if (trigger.disabled) return;
    openUiSelect = root;
    root.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    menu.hidden = false;
    positionUiSelectMenu(root);
    setUiSelectActive(root, activeUiSelectIndex(root));
  }

  function chooseUiSelectOption(root, option) {
    if (!root || !option || option.disabled) return;
    var select = root.querySelector('.native-select');
    select.value = option.getAttribute('data-value') || '';
    syncUiSelect(select);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    closeUiSelectMenu(root, true);
  }

  function render() {
    if (document.activeElement !== $('batchInput')) $('batchInput').value = state.inputText || '';
    $('processMode').value = state.autoUpload ? 'automatic' : 'download';
    syncUiSelect($('processMode'));
    setOptions($('shopSelect'), state.shops, state.shopName, '请选择已登录店铺');
    setOptions($('planSelect'), state.plans, state.planName, state.planRefreshInProgress ? '正在读取计划…' : '请选择千川计划');
    var directory = state.outputDirectory || '';
    $('outputDirectory').textContent = directory || '请选择下载目录';
    $('outputDirectory').title = directory;

    var localStats = localInputStats($('batchInput').value);
    var localInputChanged = $('batchInput').value !== (state.inputText || '');
    var hasRunnable = !!state.canRunSelection || (localInputChanged && localStats.valid > 0);
    $('startBatch').disabled = !!state.busy || !hasRunnable || (!!state.autoUpload && !state.canStartAuto);
    $('startBatch').querySelector('span').textContent = state.busy ? '正在批量处理' : '开始批量处理';
    $('cancelAll').classList.toggle('hidden', !state.busy);
    $('startBatch').classList.toggle('hidden', !!state.busy);

    renderTasks();
    renderDetail();
    renderTaskDetail();
    renderProgress();
  }

  function statusClass(task) {
    if (task.status === 'parsed' || task.status === 'downloaded' || task.status === 'completed') return 'done';
    if (task.status === 'failed' || task.status === 'cancelled') return 'failed';
    return '';
  }

  function compactStatus(task) {
    if (task.status === 'completed') return '上传成功';
    if (task.status === 'downloaded') return '已下载';
    if (task.status === 'failed') return '处理失败';
    if (task.status === 'cancelled') return '已取消';
    if (task.status === 'uploading') return '上传中';
    if (task.status === 'downloading') return '下载中';
    if (task.status === 'resolving') return '解析中';
    return '待处理';
  }

  function renderTasks() {
    var allTasks = state.tasks || [];
    var groups = { all: allTasks, active: [], completed: [], failed: [] };
    allTasks.forEach(function (task) {
      if (['failed', 'cancelled'].indexOf(task.status) >= 0) groups.failed.push(task);
      else if (['completed', 'downloaded'].indexOf(task.status) >= 0) groups.completed.push(task);
      else if (['queued', 'resolving', 'downloading', 'uploading'].indexOf(task.status) >= 0) groups.active.push(task);
    });
    var tasks = groups[taskFilter] || allTasks;
    [['All', 'all'], ['Failed', 'failed']].forEach(function (pair) {
      $('show' + pair[0] + 'Tasks').classList.toggle('active', taskFilter === pair[1]);
      $('show' + pair[0] + 'Tasks').setAttribute('aria-pressed', String(taskFilter === pair[1]));
    });
    var list = $('taskList');
    if (!tasks.length) {
      var empty = '<div class="empty-state"><img class="line-icon" src="icons/image-fill.svg" alt=""><span>' + (taskFilter === 'failed' ? '暂无失败任务' : '暂无图文预览') + '</span></div>';
      if (taskListMarkup !== empty) { list.innerHTML = empty; taskListMarkup = empty; }
      return;
    }

    var html = '';
    tasks.forEach(function (task) {
      var previews = (task.previews || []).slice(0, 3).map(function (source, index) {
        return '<span class="preview-image"><img src="' + esc(source) + '" loading="lazy" decoding="async" alt="第' + (index + 1) + '张图片"></span>';
      }).join('');
      var more = Math.max(0, (task.imageCount || 0) - 3);
      if (more > 0) previews = previews.replace(/<\/span>$/, '<span class="preview-more">+' + more + '</span></span>');
      if (!previews) previews = '<span class="preview-more waiting">解析中</span>';
      html += '<article class="task-row ' + (String(task.id) === String(state.selectedTaskId) ? 'active' : '') + '" data-id="' + esc(task.id) + '">' +
        '<input class="task-check" type="checkbox" ' + (task.selected ? 'checked' : '') + ' aria-label="选择任务">' +
        '<div class="task-content">' + ((task.previews || [])[0] ? '<img class="task-cover" src="' + esc(task.previews[0]) + '" alt="" loading="lazy" decoding="async">' : '<img class="task-cover placeholder" src="icons/image.svg" alt="">') +
        '<div class="task-main"><div class="task-title" title="' + esc(task.title || '等待解析') + '">' + esc(task.title || '等待解析') + '</div><div class="task-meta">' + esc(task.error || task.musicTitle || (task.hasMusic ? '含作品音乐 · 标题与内容已提取' : '标题与内容随图集保存')) + '</div></div></div>' +
        '<div class="preview-strip">' + previews + '</div>' +
        '<span class="image-count">' + (task.imageCount || 0) + ' 张</span>' +
        '<div class="task-state" title="' + esc(task.error || task.statusText || '等待处理') + '"><span class="status-chip ' + statusClass(task) + '">' + esc(compactStatus(task)) + '</span></div>' +
        '<button class="view-detail" type="button" aria-label="查看该图文的本地图片详情">查看详情</button>' +
        '</article>';
    });
    if (taskListMarkup === html) return;
    taskListMarkup = html;
    list.innerHTML = html;

    Array.prototype.forEach.call(list.querySelectorAll('.task-row'), function (row) {
      row.addEventListener('click', function (event) {
        var id = row.getAttribute('data-id');
        if (event.target.classList.contains('task-check')) {
          send('setTaskSelected', { id: id, value: event.target.checked });
          event.stopPropagation();
          return;
        }
        send('selectTask', { id: id });
      });
      var detailButton = row.querySelector('.view-detail');
      if (detailButton) {
        detailButton.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          openTaskDetail(row.getAttribute('data-id'));
        });
      }
    });
  }

  function renderDetail() {
    var task = state.selectedTask;
    var enabled = !!task;
    var editable = enabled && !state.busy && task.status !== 'completed';
    $('titleInput').disabled = !editable;
    $('contentInput').disabled = !editable;
    if (document.activeElement !== $('titleInput')) $('titleInput').value = enabled ? (task.title || '') : '';
    if (document.activeElement !== $('contentInput')) $('contentInput').value = enabled ? (task.content || '') : '';
    $('detailCard').classList.toggle('has-task', enabled);
  }

  function openTaskDetail(id) {
    detailTaskId = String(id || '');
    detailImageLimit = 0;
    detailRenderSignature = '';
    $('taskDetailModal').classList.remove('hidden');
    $('taskDetailModal').setAttribute('aria-hidden', 'false');
    document.body.classList.add('task-detail-open');
    renderTaskDetail();
    if (!state.selectedTask || String(state.selectedTask.id) !== detailTaskId) send('selectTask', { id: detailTaskId });
    setTimeout(function () { $('closeTaskDetail').focus(); }, 0);
  }

  function closeTaskDetail() {
    detailTaskId = '';
    detailRenderSignature = '';
    $('taskDetailModal').classList.add('hidden');
    $('taskDetailModal').setAttribute('aria-hidden', 'true');
    document.body.classList.remove('task-detail-open');
  }

  function normalizeDetailImages(task) {
    if (task && Array.isArray(task.detailImages) && task.detailImages.length) return task.detailImages;
    return (task && task.previews || []).map(function (source, index) {
      return { index: index + 1, src: source, local: false, fileName: '', fallback: '' };
    });
  }

  function renderTaskDetail() {
    if (!detailTaskId || $('taskDetailModal').classList.contains('hidden')) return;
    var task = state.selectedTask && String(state.selectedTask.id) === detailTaskId ? state.selectedTask : null;
    if (!task) {
      var loadingCard = $('taskDetailModal').querySelector('.task-detail-card');
      if (loadingCard) loadingCard.classList.remove('compact');
      $('taskDetailGallery').classList.remove('three-column', 'multi-row');
      $('taskDetailTitle').textContent = '正在读取作品详情…';
      $('taskDetailMeta').innerHTML = '<span>正在加载任务信息</span>';
      $('taskDetailSource').className = 'task-detail-source remote';
      $('taskDetailSource').textContent = '正在检查本地图片，请稍候…';
      $('taskDetailGallery').innerHTML = '<div class="task-detail-empty">正在读取图片列表…</div>';
      $('taskDetailCount').textContent = '正在加载';
      $('openTaskDetailFolder').classList.add('hidden');
      $('loadMoreTaskDetail').classList.add('hidden');
      return;
    }

    var images = normalizeDetailImages(task);
    var localCount = Number(task.localImageCount) || images.filter(function (image) { return !!image.local; }).length;
    if (detailImageLimit <= 0) detailImageLimit = localCount > 0 ? 12 : 6;
    var visibleImages = images.slice(0, detailImageLimit);
    var detailCard = $('taskDetailModal').querySelector('.task-detail-card');
    if (detailCard) detailCard.classList.toggle('compact', visibleImages.length > 0 && images.length <= 4);
    var detailGallery = $('taskDetailGallery');
    detailGallery.classList.toggle('three-column', visibleImages.length >= 6);
    detailGallery.classList.toggle('multi-row', visibleImages.length >= 6);
    var signature = [
      detailTaskId,
      detailImageLimit,
      task.title || '',
      images.map(function (image) { return [image.src || '', image.local ? '1' : '0'].join(':'); }).join('|')
    ].join('::');

    $('taskDetailTitle').textContent = task.title || '未命名图文作品';
    $('taskDetailMeta').innerHTML =
      '<span>作者：' + esc(task.author || '未提取') + '</span>' +
      '<span>状态：' + esc(task.statusText || '等待处理') + '</span>' +
      '<span>音乐：' + esc(task.musicTitle || (task.hasMusic ? '已识别' : '无背景音乐')) + '</span>' +
      '<span>创建：' + esc(task.createdAt || '未知') + '</span>';
    var allLocal = localCount > 0 && localCount >= images.length;
    $('taskDetailSource').className = 'task-detail-source' + (allLocal ? '' : ' remote');
    $('taskDetailSource').textContent = allLocal
      ? '已从下载目录读取全部 ' + localCount + ' 张本地图片；双击图片可用系统看图软件打开原文件。'
      : (localCount > 0
        ? '已从下载目录读取本地图片 ' + localCount + ' 张；本地图片可双击打开，其余 ' + Math.max(0, images.length - localCount) + ' 张暂用远程预览。'
        : '当前任务尚未下载图片；先按需显示最多 6 张远程预览，开始处理后会逐张自动切换为本地图片。');
    $('taskDetailCount').textContent = '本地 ' + localCount + ' / 共 ' + images.length + ' 张 · 已显示 ' + visibleImages.length + ' 张';
    $('openTaskDetailFolder').classList.toggle('hidden', !(localCount > 0 && task.outputDirectory));
    $('loadMoreTaskDetail').classList.toggle('hidden', visibleImages.length >= images.length);

    if (signature === detailRenderSignature) return;
    detailRenderSignature = signature;
    if (!visibleImages.length) {
      detailGallery.innerHTML = '<div class="task-detail-empty">当前任务还没有可预览的图片。<br>完成解析或下载后会自动显示。</div>';
      return;
    }

    detailGallery.innerHTML = visibleImages.map(function (image, position) {
      var number = Number(image.index) || position + 1;
      var local = !!image.local;
      return '<figure class="task-detail-image ' + (local ? 'local-image' : 'remote') + '" data-file-name="' + esc(image.fileName || '') + '" title="' +
        (local ? '双击使用系统看图软件打开本地原文件' : '图片尚未下载，当前为远程预览') + '">' +
        '<b>' + String(number).padStart(2, '0') + '</b>' +
        '<i>' + (local ? '本地图片' : '远程预览') + '</i>' +
        '<img src="' + esc(image.src || '') + '" data-fallback="' + esc(image.fallback || '') + '" loading="' + (position < 6 ? 'eager' : 'lazy') + '" decoding="async" draggable="false" alt="第' + number + '张图文图片">' +
        '</figure>';
    }).join('');

    Array.prototype.forEach.call(detailGallery.querySelectorAll('img'), function (image) {
      image.addEventListener('error', function () {
        var fallback = image.getAttribute('data-fallback') || '';
        if (fallback && image.getAttribute('data-fallback-used') !== 'true') {
          image.setAttribute('data-fallback-used', 'true');
          image.src = fallback;
          var card = image.closest('.task-detail-image');
          if (card) {
            card.classList.add('remote');
            card.classList.remove('local-image');
            card.title = '本地文件读取失败，当前使用远程预览';
            var badge = card.querySelector('i');
            if (badge) badge.textContent = '远程兜底';
          }
          return;
        }
        var owner = image.closest('.task-detail-image');
        if (owner) owner.classList.add('load-error');
      });
    });

    Array.prototype.forEach.call(detailGallery.querySelectorAll('.task-detail-image'), function (card) {
      card.addEventListener('dblclick', function () {
        if (!card.classList.contains('local-image')) {
          toast('该图片尚未下载到本地，完成下载后即可双击打开。', false);
          return;
        }
        send('openTaskImage', { id: detailTaskId, fileName: card.getAttribute('data-file-name') || '' });
      });
    });
  }

  function getProgressTask() {
    var tasks = state.tasks || [];
    return tasks.find(function (task) { return ['queued', 'resolving', 'downloading', 'uploading'].indexOf(task.status) >= 0; }) || state.selectedTask || tasks[0] || null;
  }

  function renderProgress() {
    var tasks = (state.tasks || []).filter(function (task) { return task.selected; });
    if (!tasks.length) tasks = state.tasks || [];
    var processed = tasks.filter(function (task) { return ['downloaded', 'completed', 'failed', 'cancelled'].indexOf(task.status) >= 0; }).length;
    var task = getProgressTask();
    var percent = tasks.length ? Math.round(tasks.reduce(function (sum, item) { return sum + clamp(item.progress, 0, 100); }, 0) / tasks.length) : 0;
    $('batchProgressText').textContent = '批量任务 ' + processed + '/' + tasks.length;
    $('progressPercent').textContent = percent + '%';
    $('progressBar').style.width = percent + '%';
    $('progressBar').parentElement.setAttribute('aria-valuenow', String(percent));
  }

  function toast(message, error) {
    var element = $('toast');
    element.textContent = message || '';
    element.className = 'toast show' + (error ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { element.className = 'toast'; }, 3000);
  }

  $('batchInput').addEventListener('input', function () {
    var value = this.value;
    var stats = localInputStats(value);
    var hasRunnable = stats.valid > 0 || !!state.canRunSelection;
    $('startBatch').disabled = !!state.busy || !hasRunnable || (!!state.autoUpload && !state.canStartAuto);
    clearTimeout(inputTimer);
    inputTimer = setTimeout(function () { send('setInput', { value: value }); }, 280);
  });

  $('clearInput').addEventListener('click', function () {
    clearTimeout(inputTimer);
    $('batchInput').value = '';
    send('setInput', { value: '' });
  });

  $('importTxt').addEventListener('click', function () {
    clearTimeout(inputTimer);
    send('importTxt', { currentValue: $('batchInput').value });
  });

  $('showAllTasks').addEventListener('click', function () { taskFilter = 'all'; renderTasks(); });
  $('showFailedTasks').addEventListener('click', function () { taskFilter = 'failed'; renderTasks(); });
  $('closeTaskDetail').addEventListener('click', closeTaskDetail);
  $('taskDetailBackdrop').addEventListener('click', closeTaskDetail);
  $('loadMoreTaskDetail').addEventListener('click', function () {
    detailImageLimit += 12;
    detailRenderSignature = '';
    renderTaskDetail();
  });
  $('openTaskDetailFolder').addEventListener('click', function () {
    if (detailTaskId) send('openTaskOutput', { id: detailTaskId });
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && detailTaskId) closeTaskDetail();
  });

  document.addEventListener('click', function (event) {
    var option = event.target.closest ? event.target.closest('.ui-select-option') : null;
    if (option) {
      chooseUiSelectOption(option.closest('.ui-select'), option);
      return;
    }
    var trigger = event.target.closest ? event.target.closest('.ui-select-trigger') : null;
    if (trigger) {
      var root = trigger.closest('.ui-select');
      if (root.classList.contains('open')) closeUiSelectMenu(root, false);
      else openUiSelectMenu(root);
      return;
    }
    if (openUiSelect && !openUiSelect.contains(event.target)) closeUiSelectMenu(openUiSelect, false);
  });

  document.addEventListener('keydown', function (event) {
    var trigger = event.target.closest ? event.target.closest('.ui-select-trigger') : null;
    if (!trigger) return;
    var root = trigger.closest('.ui-select');
    var key = event.key;
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      var wasOpen = root.classList.contains('open');
      if (!wasOpen) openUiSelectMenu(root);
      else setUiSelectActive(root, activeUiSelectIndex(root) + (key === 'ArrowDown' ? 1 : -1));
      return;
    }
    if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
      event.preventDefault();
      if (!root.classList.contains('open')) openUiSelectMenu(root);
      else chooseUiSelectOption(root, uiSelectOptions(root)[activeUiSelectIndex(root)]);
      return;
    }
    if (key === 'Home' || key === 'End') {
      if (!root.classList.contains('open')) return;
      event.preventDefault();
      var options = uiSelectOptions(root);
      setUiSelectActive(root, key === 'Home' ? 0 : options.length - 1);
      return;
    }
    if (key === 'Escape' && root.classList.contains('open')) {
      event.preventDefault();
      closeUiSelectMenu(root, true);
      return;
    }
    if (key === 'Tab' && root.classList.contains('open')) closeUiSelectMenu(root, false);
  });

  document.addEventListener('focusin', function (event) {
    if (openUiSelect && !openUiSelect.contains(event.target)) closeUiSelectMenu(openUiSelect, false);
  });
  window.addEventListener('resize', function () {
    if (openUiSelect) closeUiSelectMenu(openUiSelect, false);
  });

  $('shopSelect').addEventListener('change', function () { send('setShop', { value: this.value }); });
  $('planSelect').addEventListener('change', function () { send('setPlan', { value: this.value }); });
  $('processMode').addEventListener('change', function () {
    state.autoUpload = this.value === 'automatic';
    render();
    send('setAutoUpload', { value: state.autoUpload });
  });

  $('titleInput').addEventListener('input', function () {
    if (!state.selectedTask || state.busy || state.selectedTask.status === 'completed') return;
    var value = this.value;
    clearTimeout(titleTimer);
    pendingTitle = { id: state.selectedTask.id, value: value };
    titleTimer = setTimeout(flushTextEdits, 300);
  });

  $('contentInput').addEventListener('input', function () {
    if (!state.selectedTask || state.busy || state.selectedTask.status === 'completed') return;
    var value = this.value;
    clearTimeout(contentTimer);
    pendingContent = { id: state.selectedTask.id, value: value };
    contentTimer = setTimeout(flushTextEdits, 300);
  });

  $('titleInput').addEventListener('change', flushTextEdits);
  $('contentInput').addEventListener('change', flushTextEdits);

  [
    ['chooseOutput', 'chooseOutput'],
    ['openOutput', 'openOutput'],
    ['cancelAll', 'cancelAll']
  ].forEach(function (pair) {
    $(pair[0]).addEventListener('click', function () { send(pair[1], {}); });
  });

  $('startBatch').addEventListener('click', function () {
    clearTimeout(inputTimer);
    send($('processMode').value === 'automatic' ? 'startAutomatic' : 'downloadOnly', { inputText: $('batchInput').value });
  });

  if (window.chrome && window.chrome.webview) {
    window.chrome.webview.addEventListener('message', function (event) {
      var message = event.data || {};
      if (message.type === 'state') { state = message; render(); }
      else if (message.type === 'toast') toast(message.message, !!message.error);
    });
    window.chrome.webview.postMessage({ type: 'ready' });
  } else {
    render();
    toast('页面桥接未连接', true);
  }
})();
