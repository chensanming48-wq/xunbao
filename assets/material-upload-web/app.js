(function () {
  "use strict";

  var state = {
    shops: [], plans: [], selectedShop: "", selectedPlan: "", retryCount: 1,
    queue: [], running: false, paused: false,
    captureRunning: false, captureServiceReady: false, captureStage: "等待抓取",
    captureMessage: "只选 1 张测试图后即可抓取官方图片流程", captureRecordCount: 0,
    capturePath: "", canStartCapture: false, captureValidationMessage: "",
    progress: 0, preparingOriginals: false, stage: "等待开始", log: "准备就绪，等待开始任务...",
    serviceReady: false, selectedCount: 0, checks: [
      { ready: false, text: "上传组件尚未接入" },
      { ready: false, text: "目标店铺待确认" },
      { ready: false, text: "目标计划待确认" },
      { ready: false, text: "素材文件待添加" }
    ], canStart: false, validationMessage: ""
  };
  var toastTimer = 0;
  var styledSelects = [];
  var openSelect = null;
  var choosingProduct = false;

  function byId(id) { return document.getElementById(id); }
  function setText(id, value) { var el = byId(id); if (el) el.textContent = value == null ? "" : String(value); }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function asNumber(value, fallback) { var parsed = Number(value); return isFinite(parsed) ? parsed : fallback; }
  function postCommand(command, payload) {
    if (window.chrome && window.chrome.webview) {
      window.chrome.webview.postMessage({ type: "command", command: command, payload: payload || {} });
    }
  }

  function fillSelect(element, values, selected, placeholder, emptyPlaceholder, labels) {
    element.innerHTML = "";
    var empty = document.createElement("option");
    empty.value = "";
    empty.textContent = values.length ? placeholder : (emptyPlaceholder || placeholder);
    element.appendChild(empty);
    values.forEach(function (value) {
      var option = document.createElement("option");
      option.value = value;
      option.textContent = labels && labels[value] ? labels[value] : value;
      element.appendChild(option);
    });
    var target = selected && values.indexOf(selected) >= 0 ? selected : "";
    element.value = target;
  }

  function closeSelect(returnFocus) {
    if (!openSelect) return;
    var previous = openSelect;
    openSelect = null;
    previous.menu.hidden = true;
    previous.root.classList.remove("open");
    previous.trigger.setAttribute("aria-expanded", "false");
    if (returnFocus && !previous.trigger.disabled) previous.trigger.focus();
  }

  function positionSelect(item) {
    var rect = item.trigger.getBoundingClientRect();
    var below = window.innerHeight - rect.bottom - 12;
    var above = rect.top - 12;
    var up = below < 160 && above > below;
    var height = Math.max(60, Math.min(240, up ? above : below));
    var width = Math.min(rect.width, window.innerWidth - 16);
    item.menu.style.width = width + "px";
    item.menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) + "px";
    item.menu.style.maxHeight = height + "px";
    item.menu.style.top = up ? "auto" : (rect.bottom + 5) + "px";
    item.menu.style.bottom = up ? (window.innerHeight - rect.top + 5) + "px" : "auto";
  }

  function openStyledSelect(item, focusOption) {
    if (item.select.disabled) return;
    closeSelect(false);
    openSelect = item;
    item.root.classList.add("open");
    item.trigger.setAttribute("aria-expanded", "true");
    item.menu.hidden = false;
    positionSelect(item);
    var selected = item.menu.querySelector('[aria-selected="true"]') || item.menu.querySelector("button:not(:disabled)");
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
      if (focusOption) selected.focus();
    }
  }

  function refreshStyledSelects() {
    styledSelects.forEach(function (item) {
      var options = Array.from(item.select.options);
      var current = options.find(function (option) { return option.value === item.select.value; });
      item.value.textContent = current ? current.textContent : "请选择";
      item.trigger.title = item.value.textContent;
      item.trigger.disabled = item.select.disabled;
      var fingerprint = JSON.stringify(options.map(function (option) { return [option.value, option.textContent, option.disabled]; }));
      var focused = item.menu.contains(document.activeElement) ? document.activeElement.dataset.value : null;
      if (fingerprint !== item.fingerprint) {
        item.fingerprint = fingerprint;
        item.menu.innerHTML = options.filter(function (option) { return option.value !== ""; }).map(function (option) {
          return '<button type="button" class="ui-select-option" role="option" data-value="' + escapeAttribute(option.value) + '"' + (option.disabled ? ' disabled' : '') + '><span>' + escapeHtml(option.textContent) + '</span><i class="ui-option-check" aria-hidden="true"></i></button>';
        }).join("");
      }
      item.menu.querySelectorAll("button[data-value]").forEach(function (button) {
        var selected = button.dataset.value === item.select.value;
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-selected", selected ? "true" : "false");
        if (focused === button.dataset.value) button.focus();
      });
      if (openSelect === item) {
        if (item.select.disabled || !item.menu.childElementCount) closeSelect(false);
        else positionSelect(item);
      }
    });
  }

  function styleSelect(select) {
    var root = document.createElement("div");
    root.className = "ui-dropdown";
    var trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "ui-select-trigger";
    trigger.id = select.id + "Trigger";
    trigger.setAttribute("aria-label", select.getAttribute("aria-label") || "选择");
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", select.id + "Menu");
    trigger.innerHTML = '<span class="ui-select-value"></span><i class="ui-select-chevron" aria-hidden="true"></i>';
    var menu = document.createElement("div");
    menu.className = "ui-select-menu";
    menu.id = select.id + "Menu";
    menu.hidden = true;
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", select.getAttribute("aria-label") || "选项");
    select.parentNode.insertBefore(root, select);
    root.appendChild(trigger);
    document.body.appendChild(menu);
    select.classList.add("native-select");
    select.setAttribute("aria-hidden", "true");
    select.tabIndex = -1;
    var item = { select: select, root: root, trigger: trigger, menu: menu, value: trigger.querySelector("span"), fingerprint: "" };
    styledSelects.push(item);
    trigger.addEventListener("click", function () { if (openSelect === item) closeSelect(false); else openStyledSelect(item, true); });
    trigger.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); openStyledSelect(item, true); }
      else if (event.key === "Escape") closeSelect(true);
    });
    menu.addEventListener("click", function (event) {
      var option = event.target.closest("button[data-value]");
      if (!option || option.disabled || select.disabled) return;
      var changed = select.value !== option.dataset.value;
      select.value = option.dataset.value;
      closeSelect(true);
      refreshStyledSelects();
      if (changed) select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    menu.addEventListener("keydown", function (event) {
      if (event.key === "Escape") { event.preventDefault(); closeSelect(true); return; }
      if (event.key === "Tab") { closeSelect(true); return; }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      var options = Array.from(menu.querySelectorAll("button:not(:disabled)"));
      if (!options.length) return;
      var index = options.indexOf(document.activeElement);
      index = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
      options[index].focus();
      options[index].scrollIntoView({ block: "nearest" });
    });
  }

  function statusTone(status) {
    status = String(status || "");
    if (status.indexOf("完成") >= 0 || status.indexOf("成功") >= 0) return "success";
    if (status.indexOf("失败") >= 0 || status.indexOf("缺失") >= 0 || status.indexOf("取消") >= 0) return "error";
    if (status.indexOf("暂停") >= 0 || status.indexOf("跳过") >= 0) return "warning";
    return "";
  }

  function previewMarkup(item) {
    var className = item.fileType === "视频" ? "preview video" : "preview";
    if (item.preview) return '<div class="' + className + '"><img alt="" loading="lazy" decoding="async" src="' + item.preview + '"></div>';
    return '<div class="' + className + '"><svg viewBox="0 0 32 32" aria-hidden="true"><rect x="5" y="6" width="22" height="20" rx="2"></rect><path d="M8 22l6-7 4 4 3-3 6 6"></path><circle cx="21" cy="11" r="2"></circle></svg></div>';
  }

  var lastQueueMarkupState = "";
  function renderQueue() {
    var signature = JSON.stringify([state.queue,state.running,state.captureRunning]);
    if (signature === lastQueueMarkupState) return;
    lastQueueMarkupState = signature;
    var queue = asArray(state.queue);
    var body = byId("queueBody");
    body.innerHTML = "";
    if (!queue.length) {
      body.innerHTML = '<div class="empty-queue"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 31V9M16 17l8-8 8 8"></path><path d="M10 29v10h28V29"></path></svg><strong>暂无素材</strong></div>';
    } else {
      queue.forEach(function (item) {
        var row = document.createElement("div");
        row.className = "queue-row";
        row.setAttribute("role", "row");
        var disabled = state.running || state.captureRunning ? " disabled" : "";
        var failure = "";
        if (String(item.status || "").indexOf("失败") >= 0 && item.message) {
          failure = /不在所选计划|在当前计划中不存在/.test(item.message)
            ? "商品与计划不匹配"
            : String(item.message).replace(/^千川计划图片写入失败：|^千川返回失败：/g, "");
        }
        row.innerHTML =
          '<div class="preview-cell"><label class="row-check"><input type="checkbox" data-id="' + item.id + '"' + (item.selected ? " checked" : "") + disabled + '><span class="check-mark" aria-hidden="true"></span></label>' + previewMarkup(item) + '</div>' +
          '<div class="file-cell" title="' + escapeAttribute(item.fileName) + '">' + escapeHtml(item.fileName) + '</div>' +
          '<div class="type-cell">' + escapeHtml(item.fileType) + '</div>' +
          '<div class="size-cell">' + escapeHtml(item.fileSize) + '</div>' +
          '<div class="plan-cell" title="' + escapeAttribute(item.planName) + '">' + escapeHtml(item.planName || "—") + '</div>' +
          '<div class="status-cell"><span class="status-pill ' + statusTone(item.status) + '" title="' + escapeAttribute(item.message || item.status) + '">' + escapeHtml(item.status || "待上传") + '</span>' + (failure ? '<span class="status-error" title="' + escapeAttribute(item.message) + '">' + escapeHtml(failure) + '</span>' : '') + '</div>' +
          '<div class="action-cell"><button class="row-action" data-remove="' + item.id + '" type="button"' + disabled + '>移除</button></div>';
        body.appendChild(row);
      });
    }

    body.querySelectorAll("input[data-id]").forEach(function (checkbox) {
      checkbox.addEventListener("change", function () {
        postCommand("selectItem", { id: checkbox.getAttribute("data-id"), selected: checkbox.checked });
      });
    });
    body.querySelectorAll("button[data-remove]").forEach(function (button) {
      button.addEventListener("click", function () { postCommand("removeItem", { id: button.getAttribute("data-remove") }); });
    });

    var selected = queue.filter(function (item) { return item.selected; }).length;
    setText("queueSummary", "共 " + queue.length + " 个");
    byId("selectAll").checked = queue.length > 0 && selected === queue.length;
    byId("selectAll").indeterminate = selected > 0 && selected < queue.length;
    byId("removeSelected").disabled = state.running || state.captureRunning || selected === 0;
    byId("clearQueue").disabled = state.running || state.captureRunning || queue.length === 0;
  }

  function renderWorkflow() {
    var progress = Math.max(0, Math.min(100, asNumber(state.progress, 0)));
    var active = state.preparingOriginals ? 0 : progress >= 100 ? 3 : progress >= 80 ? 2 : progress >= 18 ? 1 : 0;
    document.querySelectorAll(".workflow-step").forEach(function (step, index) {
      step.classList.toggle("active", index === active);
      step.classList.toggle("complete", index < active || progress >= 100);
    });
    document.querySelectorAll(".workflow-line").forEach(function (line, index) {
      line.classList.toggle("complete", index < active || progress >= 100);
    });
  }

  function render() {
    fillSelect(byId("shopSelect"), asArray(state.shops), state.selectedShop, "选择目标店铺", "暂无可用店铺");
    var planLabels = Object.create(null);
    var options = asArray(state.planOptions);
    options.forEach(function (plan) {
      var duplicate = options.filter(function (other) { return other.label === plan.label; }).length > 1;
      planLabels[plan.value] = (plan.recommended ? "推荐 · " : "") + (duplicate ? plan.value : plan.label);
    });
    fillSelect(byId("planSelect"), asArray(state.plans), state.selectedPlan, "选择计划", "请刷新计划", planLabels);
    byId("retrySelect").value = String(asNumber(state.retryCount, 1));

    var running = state.running === true;
    var paused = state.paused === true;
    var locked = running || state.captureRunning === true;
    var planLocked = state.captureRunning === true || (running && !paused);
    byId("unassociatedHint").hidden = !state.unassociatedImages;
    if (!state.unassociatedImages) choosingProduct = false;
    byId("sourceProductPicker").hidden = !choosingProduct;
    var sourceProducts = asArray(state.sourceProducts);
    var productLabels = Object.create(null);
    sourceProducts.forEach(function (product) { productLabels[product.id] = product.name + " [" + product.id + "]"; });
    fillSelect(byId("uploadProductSelect"), sourceProducts.map(function (p) { return p.id; }), byId("uploadProductSelect").value,
      "选择图片关联的商品", "暂无商品，请先到商品库同步", productLabels);
    byId("uploadProductSelect").disabled = locked;
    byId("applyUploadProduct").disabled = locked || !byId("uploadProductSelect").value;
    byId("openProductCatalog").disabled = locked;
    byId("chooseProduct").disabled = locked;
    byId("planMismatch").hidden = !state.needsProductConfirmation;
    byId("confirmPlanProduct").disabled = planLocked || state.planRefreshing === true;
    byId("planEmpty").hidden = !state.plansEmpty;
    byId("createPlan").disabled = locked;
    byId("planProblem").hidden = !state.planError && !state.needsLogin;
    setText("planProblemText", state.planError || "请先登录千川，再读取店铺计划。");
    byId("loginQianchuan").hidden = !state.needsLogin;
    byId("loginQianchuan").disabled = locked;
    byId("retryPlans").disabled = locked || state.planRefreshing === true || !state.selectedShop;
    byId("shopSelect").disabled = locked || state.planRefreshing === true || !asArray(state.shops).length;
    byId("planSelect").disabled = planLocked || !asArray(state.plans).length;
    byId("retrySelect").disabled = locked;
    refreshStyledSelects();
    byId("refreshPlans").disabled = locked || state.planRefreshing === true || !state.selectedShop;
    setText("refreshPlansLabel", state.planRefreshing ? "正在刷新…" : "刷新计划");

    byId("addFiles").disabled = locked;
    byId("dropZone").disabled = locked;
    byId("selectAll").disabled = locked || !asArray(state.queue).length;


    setText("configSummary", state.configSummary || "请选择目标店铺与计划，添加素材后即可启动任务");

    renderQueue();
    renderWorkflow();

    var progress = Math.max(0, Math.min(100, asNumber(state.progress, 0)));
    byId("progressRing").style.setProperty("--progress", progress);
    setText("progressPercent", progress + "%");
    setText("uploadTally", asArray(state.queue).filter(function(item){return /成功|完成/.test(item.status || "");}).length + "/" + asArray(state.queue).length);
    setText("progressStage", state.stage || (locked ? "上传中" : "等待开始"));
    setText("progressMeta", state.progressMeta || (state.selectedCount + " 个素材待上传"));
    setText("pauseText", state.paused ? "继续任务" : "暂停任务");
    var validationText = String(state.validationMessage || "").trim();
    var startButton = byId("startUpload");
    startButton.disabled = locked;
    startButton.title = '';
    byId("pauseUpload").disabled = !locked;
    byId("cancelUpload").disabled = !locked;
    var details = [state.log, state.stage, state.progressMeta, state.configSummary, state.planRefreshMessage, validationText]
      .concat(asArray(state.checks).map(function (check) { return (check.ready ? '✓ ' : '待确认：') + check.text; }))
      .filter(function (value) { return value && String(value).trim(); });
    setText("logOutput", Array.from(new Set(details)).join('\n'));
    var log = byId("logOutput");
    log.scrollTop = log.scrollHeight;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }
  function escapeAttribute(value) { return escapeHtml(value).replace(/`/g, "&#96;"); }

  function showToast(message, error) {
    var toast = byId("toast");
    toast.textContent = message || "操作已完成";
    toast.className = "toast show" + (error ? " error" : "");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.className = "toast"; }, 2600);
  }

  byId("shopSelect").addEventListener("change", function () { postCommand("selectShop", { value: this.value }); });
  byId("planSelect").addEventListener("change", function () { postCommand("selectPlan", { value: this.value }); });
  byId("retrySelect").addEventListener("change", function () { postCommand("setRetryCount", { value: Number(this.value) }); });
  byId("confirmPlanProduct").addEventListener("click", function () {
    this.disabled = true;
    postCommand("confirmPlanProduct", { scope: state.confirmationScope });
  });
  byId("chooseProduct").addEventListener("click", function () { choosingProduct = !choosingProduct; render(); });
  byId("uploadProductSelect").addEventListener("change", function () { byId("applyUploadProduct").disabled = !this.value; });
  byId("applyUploadProduct").addEventListener("click", function () {
    this.disabled = true;
    postCommand("chooseUploadProduct", { id: byId("uploadProductSelect").value });
  });
  byId("openProductCatalog").addEventListener("click", function () { postCommand("backGenerate"); });
  byId("createPlan").addEventListener("click", function () { postCommand("createPlan"); });
  byId("loginQianchuan").addEventListener("click", function () { postCommand("loginQianchuan"); });
  byId("retryPlans").addEventListener("click", function () {
    this.disabled = true;
    postCommand("refreshPlans");
  });
  byId("refreshPlans").addEventListener("click", function () {
    this.disabled = true;
    setText("refreshPlansLabel", "正在刷新…");
    postCommand("refreshPlans");
  });
  byId("addFiles").addEventListener("click", function () { postCommand("pickFiles"); });
  byId("dropZone").addEventListener("click", function () { postCommand("pickFiles"); });
  byId("selectAll").addEventListener("change", function () { postCommand("selectAll", { selected: this.checked }); });
  byId("removeSelected").addEventListener("click", function () { postCommand("removeSelected"); });
  byId("clearQueue").addEventListener("click", function () { postCommand("clearQueue"); });
  byId("startUpload").addEventListener("click", function () {
    if (state.canStart !== true) {
      var reason = String(state.validationMessage || '').trim() || asArray(state.checks).filter(function (check) { return !check.ready; }).map(function (check) { return check.text; }).join('；') || '请确认目标店铺、计划和图片素材后再开始上传';
      showToast(reason, true);
      return;
    }
    postCommand("startUpload");
  });
  byId("pauseUpload").addEventListener("click", function () { postCommand("pauseUpload"); });
  byId("cancelUpload").addEventListener("click", function () { postCommand("cancelUpload"); });
  byId("openHistory").addEventListener("click", function () { postCommand("openHistory"); });
  ["shopSelect", "planSelect", "retrySelect"].forEach(function (id) { styleSelect(byId(id)); });
  document.addEventListener("click", function (event) {
    if (openSelect && !openSelect.root.contains(event.target) && !openSelect.menu.contains(event.target)) closeSelect(false);
  });
  window.addEventListener("resize", function () { if (openSelect) positionSelect(openSelect); });
  window.addEventListener("scroll", function (event) {
    if (openSelect && event.target !== openSelect.menu && !openSelect.menu.contains(event.target)) positionSelect(openSelect);
  }, true);

  ["dragenter", "dragover"].forEach(function (name) {
    byId("dropZone").addEventListener(name, function (event) { event.preventDefault(); this.classList.add("dragging"); });
  });
  ["dragleave", "drop"].forEach(function (name) {
    byId("dropZone").addEventListener(name, function (event) { event.preventDefault(); this.classList.remove("dragging"); });
  });
  byId("dropZone").addEventListener("drop", function () {
    postCommand("pickFiles");
    showToast("请在系统文件选择框中确认要添加的素材", false);
  });

  if (window.chrome && window.chrome.webview) {
    window.chrome.webview.addEventListener("message", function (event) {
      var message = event.data || {};
      if (message.type === "state") {
        state = Object.assign({}, state, message);
        render();
      } else if (message.type === "toast") {
        showToast(message.text, message.error === true);
      }
    });
    window.chrome.webview.postMessage({ type: "ready" });
  }

  render();
}());
