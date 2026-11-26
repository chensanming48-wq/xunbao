(function () {
  "use strict";

  var state = {
    input: "",
    recognizedCount: 0,
    rejectedCount: 0,
    overflow: false,
    maxInputCount: 500,
    maxConcurrency: 2,
    uploadConcurrencyPerAccount: 5,
    performanceMode: "smart",
    videoAdaptationEnabled: false,
    videoAdaptationMode: "disabled",
    planTitleMode: "existing",
    planTitleManualText: "",
    maxRetries: 2,
    cleanupLocalAfterSuccess: false,
    forcePublicFetch: false,
    outputDirectory: "",
    shops: [],
    deliveryTypes: [],
    plans: [],
    plansRefreshing: false,
    plansRefreshMessage: "点击“刷新计划”获取最新计划",
    plansLastSyncedAt: "",
    selectedShop: "",
    selectedDeliveryType: "",
    selectedPlan: "",
    uploadTargetReady: false,
    uploadAccountReady: false,
    plansSynchronized: false,
    canSelectDeliveryType: false,
    canSelectPlan: false,
    uploadTargetCode: "shop_required",
    uploadTargetMessage: "无需绑定店铺，可直接下载原视频；绑定店铺后可开启自动上传",
    uploadTargetTone: "info",
    uploadSessionStatus: "not_checked",
    uploadSessionReady: false,
    uploadSessionMessage: "请选择店铺和计划后检查上传会话。",
    uploadSessionCheckedAt: "",
    uploadSessionCanCheck: false,
    autoUpload: false,
    resolverReady: false,
    resolverMessage: "正在检查解析服务",
    running: false,
    uploading: false,
    canDownload: false,
    canStartAutomatic: false,
    submittingBackgroundBatch: false,
    backgroundEnabled: false,
    backgroundSubmission: null,
    workflowStep: 0,
    tasks: [],
    counters: {
      all: 0,
      downloading: 0,
      pending: 0,
      uploading: 0,
      completed: 0,
      failed: 0
    },
    pauseAllText: "全部继续",
    canPauseAll: false,
    canRetryFailed: false,
    canClearFinished: false
  };
  var activeFilter = "all";
  var taskRowsById = Object.create(null);
  var lastEmptyTaskFilter = null;
  var toastTimer = 0;
  var inputTimer = 0;
  var inputDirty = false;
  var pendingInputValues = [];
  var openUiSelect = null;
  var activeBackgroundEventId = "";
  var dismissedBackgroundEvents = Object.create(null);
  var settingsDraft = null;
  var settingsSavePending = false;
  var settingsTrigger = null;
  var autoUploadConfirmation = null;
  var pendingTargetSelection = null;
  var videoAdaptationConfirmation = null;
  var titleSettingsDraft = null;
  var titleSettingsDirty = false;
  var titleSettingsTimer = 0;
  var lastPlanRefreshRequestAt = 0;

  function byId(id) {
    return document.getElementById(id);
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function asNumber(value, fallback) {
    var result = Number(value);
    return Number.isFinite(result) ? result : fallback;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function setText(id, value) {
    var element = byId(id);
    if (element) element.textContent = value == null ? "" : String(value);
  }

  function postCommand(command, payload) {
    if (!window.chrome || !window.chrome.webview) return;
    window.chrome.webview.postMessage({
      type: "command",
      command: command,
      payload: payload || {}
    });
  }

  function requestPlanRefresh() {
    var now = Date.now();
    if (state.plansRefreshing === true || now - lastPlanRefreshRequestAt < 1000) return;
    lastPlanRefreshRequestAt = now;
    postCommand("refreshPlans", { force: true });
  }

  function renderPlanRefreshCancellation(refreshButton, controlsLocked) {
    var cancel = byId("cancelPlanRefresh");
    if (!cancel) {
      cancel = document.createElement("button");
      cancel.id = "cancelPlanRefresh";
      cancel.type = "button";
      cancel.textContent = "取消等待";
      cancel.title = "退出当前等待；后台只读查询保留，再次刷新会复用该请求";
      cancel.addEventListener("click", function () { postCommand("cancelPlanRefresh"); });
    }
    cancel.className = refreshButton.className;
    if (cancel.parentNode !== refreshButton.parentNode || refreshButton.nextSibling !== cancel)
      refreshButton.parentNode.insertBefore(cancel, refreshButton.nextSibling);
    cancel.hidden = state.plansRefreshing !== true;
    cancel.style.display = cancel.hidden ? "none" : "";
    cancel.disabled = controlsLocked;
  }

  function normalizedInput(value) {
    return String(value == null ? "" : value).replace(/\r\n?/g, "\n");
  }

  function acceptLinkInputState(message) {
    if (!Object.prototype.hasOwnProperty.call(message, "input")) return;
    var input = byId("linkInput");
    var hostValue = normalizedInput(message.input);
    var acknowledged = pendingInputValues.indexOf(hostValue);
    if (acknowledged >= 0) pendingInputValues.splice(0, acknowledged + 1);
    // Focus alone is not an edit: selection-center imports must remain visible.
    // Keep actual edits until the host has acknowledged the latest draft.
    if (inputDirty && pendingInputValues.length === 0 && input.value === hostValue) {
      inputDirty = false;
      window.clearTimeout(inputTimer);
    }
  }

  function syncLinkInput() {
    var input = byId("linkInput");
    var hostValue = normalizedInput(state.input);
    if (!inputDirty && input.value !== hostValue) input.value = hostValue;
  }

  function flushLinkInput() {
    window.clearTimeout(inputTimer);
    if (!inputDirty) return;
    var value = byId("linkInput").value;
    if (pendingInputValues.length === 0 && value === normalizedInput(state.input)) {
      inputDirty = false;
      return;
    }
    if (pendingInputValues.length && pendingInputValues[pendingInputValues.length - 1] === value) return;
    pendingInputValues.push(value);
    postCommand("setInput", { value: value });
  }

  function fillSelect(element, values, selected, emptyText, includePlaceholder) {
    values = asArray(values).map(function (value) { return String(value || ""); }).filter(Boolean);
    var current = element.value;
    var signature = values.join("\u001f") + "|" + emptyText + "|" + (includePlaceholder === true ? "placeholder" : "direct");
    if (element.getAttribute("data-signature") !== signature) {
      element.innerHTML = "";
      if (!values.length || includePlaceholder === true) {
        var empty = document.createElement("option");
        empty.value = "";
        empty.textContent = emptyText;
        element.appendChild(empty);
      }
      values.forEach(function (value) {
        var option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        element.appendChild(option);
      });
      element.setAttribute("data-signature", signature);
    }
    // An explicit empty host selection is authoritative, not a request to keep
    // the old visual label (which would hide a plan_required state).
    var target = selected == null ? current : selected;
    if (target && values.indexOf(target) >= 0) element.value = target;
    else if (!values.length || includePlaceholder === true) element.value = "";
    syncUiSelect(element);
  }

  function closeUiSelect(shell, restoreFocus) {
    if (!shell) return;
    var trigger = shell.querySelector(".ui-select-trigger");
    var menu = shell.querySelector(".ui-select-menu");
    shell.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
    menu.hidden = true;
    if (openUiSelect === shell) openUiSelect = null;
    var search = shell.querySelector(".ui-select-search");
    if (search) {
      search.value = "";
      filterUiSelectOptions(shell);
    }
    if (restoreFocus && !trigger.disabled) trigger.focus();
  }

  function openUiSelectShell(shell, focusDirection) {
    var select = shell.querySelector("select");
    var trigger = shell.querySelector(".ui-select-trigger");
    var menu = shell.querySelector(".ui-select-menu");
    if (select.disabled || trigger.disabled) return;
    if (openUiSelect && openUiSelect !== shell) closeUiSelect(openUiSelect, false);
    shell.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
    menu.hidden = false;
    openUiSelect = shell;
    var search = shell.querySelector(".ui-select-search");
    if (search) {
      filterUiSelectOptions(shell);
      shell.querySelector("[data-ui-select-options]").scrollTop = 0;
    }
    positionUiSelectMenu(shell);
    if (focusDirection || search) {
      window.requestAnimationFrame(function () {
        if (!shell.classList.contains("open")) return;
        if (search && !focusDirection) {
          search.focus({ preventScroll: true });
          return;
        }
        var options = visibleUiSelectOptions(menu);
        if (!options.length) return;
        var selectedIndex = options.findIndex(function (option) { return option.classList.contains("selected"); });
        var targetIndex = selectedIndex >= 0 ? selectedIndex : (focusDirection < 0 ? options.length - 1 : 0);
        options[targetIndex].focus();
      });
    }
  }

  // Geometry only: a menu must stay inside the actual WebView CSS viewport,
  // including after the compact page starts scrolling. Selection is unchanged.
  function positionUiSelectMenu(shell) {
    if (!shell || !shell.classList.contains("open")) return;
    var trigger = shell.querySelector(".ui-select-trigger");
    var menu = shell.querySelector(".ui-select-menu");
    var rect = trigger.getBoundingClientRect();
    var viewportWidth = document.documentElement.clientWidth;
    var viewportHeight = document.documentElement.clientHeight;
    var inset = 8;
    var gap = 6;
    var width = Math.min(Math.max(rect.width, 180), Math.max(1, viewportWidth - inset * 2));
    var below = Math.max(0, viewportHeight - rect.bottom - gap - inset);
    var above = Math.max(0, rect.top - gap - inset);
    var openAbove = below < 180 && above > below;
    var available = openAbove ? above : below;
    var maxHeight = shell.querySelector(".ui-select-search") ? 300 : 220;
    menu.style.width = width + "px";
    menu.style.maxHeight = Math.min(maxHeight, available) + "px";
    menu.style.left = Math.max(inset, Math.min(rect.left, viewportWidth - width - inset)) + "px";
    var height = Math.min(menu.scrollHeight + 2, maxHeight, available);
    menu.style.top = (openAbove ? Math.max(inset, rect.top - gap - height) : rect.bottom + gap) + "px";
  }

  function visibleUiSelectOptions(menu) {
    return Array.from(menu.querySelectorAll(".ui-select-option")).filter(function (item) {
      return !item.hidden;
    });
  }

  function normalizePlanSearch(value) {
    return String(value || "").normalize("NFKC").toLowerCase();
  }

  function filterUiSelectOptions(shell) {
    var search = shell.querySelector(".ui-select-search");
    if (!search) return;
    var keywords = normalizePlanSearch(search.value).trim().split(/\s+/).filter(Boolean);
    var select = shell.querySelector("select");
    var matches = 0;
    shell.querySelectorAll(".ui-select-option").forEach(function (item) {
      var option = select.options[Number(item.getAttribute("data-option-index"))];
      var title = normalizePlanSearch(item.textContent);
      var matched = keywords.every(function (keyword) { return title.indexOf(keyword) >= 0; });
      // Keep the original option indices so a filtered click selects the exact host plan.
      item.hidden = keywords.length > 0 && (!option.value || !matched);
      if (!item.hidden && option.value) matches += 1;
    });
    shell.querySelector(".ui-select-search-clear").hidden = search.value.length === 0;
    shell.querySelector(".ui-select-empty").hidden = !keywords.length || matches > 0;
    if (shell.classList.contains("open")) positionUiSelectMenu(shell);
  }

  function syncUiSelect(select) {
    if (!select) return;
    var shell = select.closest("[data-ui-select]");
    if (!shell) return;
    var trigger = shell.querySelector(".ui-select-trigger");
    var valueCopy = shell.querySelector(".ui-select-value");
    var menu = shell.querySelector(".ui-select-menu");
    var optionList = menu.querySelector("[data-ui-select-options]") || menu;
    var options = Array.from(select.options);
    var signature = options.map(function (option) {
      return option.value + "\u001e" + option.textContent;
    }).join("\u001f");

    if (optionList.getAttribute("data-signature") !== signature) {
      var hadOptionFocus = optionList.contains(document.activeElement);
      optionList.innerHTML = "";
      options.forEach(function (option, index) {
        var item = document.createElement("button");
        item.className = "ui-select-option";
        item.type = "button";
        item.setAttribute("role", "option");
        item.setAttribute("data-option-index", String(index));
        item.textContent = option.textContent;
        item.title = option.textContent;
        optionList.appendChild(item);
      });
      optionList.setAttribute("data-signature", signature);
      var search = menu.querySelector(".ui-select-search");
      if (hadOptionFocus && search && shell.classList.contains("open")) search.focus({ preventScroll: true });
    }

    var selectedOption = select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
    var displayText = selectedOption ? selectedOption.textContent : "";
    valueCopy.textContent = displayText;
    trigger.title = displayText;
    trigger.disabled = select.disabled;
    Array.from(menu.querySelectorAll(".ui-select-option")).forEach(function (item, index) {
      var selected = index === select.selectedIndex;
      item.classList.toggle("selected", selected);
      item.setAttribute("aria-selected", selected ? "true" : "false");
    });
    filterUiSelectOptions(shell);
    if (select.disabled && shell.classList.contains("open")) closeUiSelect(shell, false);
    else if (shell.classList.contains("open")) positionUiSelectMenu(shell);
  }

  function moveUiSelectFocus(menu, direction) {
    var options = visibleUiSelectOptions(menu);
    if (!options.length) return;
    var current = options.indexOf(document.activeElement);
    var next = current < 0 ? (direction < 0 ? options.length - 1 : 0) : (current + direction + options.length) % options.length;
    options[next].focus();
  }

  function initializeUiSelects() {
    document.querySelectorAll("[data-ui-select]").forEach(function (shell) {
      var select = shell.querySelector("select");
      var trigger = shell.querySelector(".ui-select-trigger");
      var menu = shell.querySelector(".ui-select-menu");
      var optionList = menu.querySelector("[data-ui-select-options]") || menu;
      var search = menu.querySelector(".ui-select-search");
      trigger.setAttribute("aria-controls", optionList.id);
      if (search) {
        search.addEventListener("input", function () {
          filterUiSelectOptions(shell);
          optionList.scrollTop = 0;
        });
        menu.querySelector(".ui-select-search-clear").addEventListener("click", function () {
          search.value = "";
          filterUiSelectOptions(shell);
          optionList.scrollTop = 0;
          search.focus({ preventScroll: true });
        });
      }

      trigger.addEventListener("click", function () {
        if (shell.classList.contains("open")) closeUiSelect(shell, false);
        else openUiSelectShell(shell, 0);
      });
      trigger.addEventListener("keydown", function (event) {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          openUiSelectShell(shell, event.key === "ArrowUp" ? -1 : 1);
        } else if (event.key === "Escape" && shell.classList.contains("open")) {
          event.preventDefault();
          closeUiSelect(shell, true);
        }
      });
      menu.addEventListener("click", function (event) {
        var item = event.target.closest(".ui-select-option");
        if (!item || item.hidden || select.disabled) return;
        var index = Number(item.getAttribute("data-option-index"));
        if (!Number.isInteger(index) || index < 0 || index >= select.options.length) return;
        var changed = select.selectedIndex !== index;
        select.selectedIndex = index;
        syncUiSelect(select);
        closeUiSelect(shell, true);
        if (changed) select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      menu.addEventListener("keydown", function (event) {
        if (event.isComposing || event.keyCode === 229) return;
        var inSearch = event.target === search;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          moveUiSelectFocus(menu, event.key === "ArrowDown" ? 1 : -1);
        } else if (event.key === "Home" || event.key === "End") {
          if (inSearch) return;
          event.preventDefault();
          var options = visibleUiSelectOptions(menu);
          if (options.length) options[event.key === "Home" ? 0 : options.length - 1].focus();
        } else if (event.key === "Enter" && inSearch) {
          event.preventDefault();
          var matches = visibleUiSelectOptions(menu).filter(function (item) {
            return !!select.options[Number(item.getAttribute("data-option-index"))].value;
          });
          if (matches.length) matches[0].click();
        } else if (event.key === "Escape") {
          event.preventDefault();
          closeUiSelect(shell, true);
        } else if (event.key === "Tab") {
          // Move out relative to the trigger instead of leaving focus in a hidden popup.
          closeUiSelect(shell, true);
        }
      });
      select.addEventListener("change", function () { syncUiSelect(select); });
      syncUiSelect(select);
    });

    document.addEventListener("pointerdown", function (event) {
      if (openUiSelect && !openUiSelect.contains(event.target)) closeUiSelect(openUiSelect, false);
    });
    window.addEventListener("blur", function () {
      if (openUiSelect) closeUiSelect(openUiSelect, false);
    });
    window.addEventListener("resize", function () {
      if (openUiSelect) closeUiSelect(openUiSelect, false);
    });
    document.querySelector(".one-cut-page").addEventListener("scroll", function () {
      if (openUiSelect) closeUiSelect(openUiSelect, false);
    });
  }

  function taskGroup(task) {
    var status = String(task.status || "");
    if (status === "UploadCompleted") return "completed";
    if (status === "Completed" || status === "UploadPending" || status === "Uploading") return "uploading";
    if (status === "Failed" || status === "UploadFailed" || status === "Cancelled") return "failed";
    return "downloading";
  }

  function taskMatchesFilter(task) {
    if (activeFilter === "all") return true;
    return taskGroup(task) === activeFilter;
  }

  function displayTaskStage(task) {
    var stage = String(task.stage || "等待中");
    // Background hosts report resolving rows as Downloading; use their stage too.
    if (task.status === "Resolving" || /^(等待)?(自有解析|备用解析|本地解析|旧版解析|备用 API( 解析)?)$/.test(stage)) return "解析中";
    if (stage === "后台下载中") return "下载中";
    if (task.status === "Uploading" && /^(后台上传中|等待绑定确认|添加到已选计划)$/.test(stage)) return "添加到已选计划";
    if ((task.status === "Completed" || task.status === "UploadPending") &&
        /^(下载完成|等待上传|待上传)$/.test(stage)) return "上传中";
    return stage;
  }

  function statusTone(task) {
    var status = String(task.status || "");
    if (status === "UploadCompleted") return "success";
    if (status === "Failed" || status === "UploadFailed" || status === "Cancelled") return "error";
    if (status === "Paused" || status === "Completed" || status === "UploadPending") return "warning";
    return "";
  }

  // Only verified codes / known messages become customer-facing reasons. Never
  // expose supplier responses, credentials or guess deletion/binding from failure.
  function explicitFailureStage(task, displayError, stage) {
    var message = String(task.error || displayError || "").trim();
    var code = String(task.errorCode || "");
    // A precise current failure wins over a stale/general error message.
    if (/^(视频尺寸错误|视频信息不完整|视频已被删除，无法获取。)$/.test(stage) ||
        /^(手填标题|计划初始标题)/.test(stage)) return stage;
    if (displayError === "试用下载额度已用完" ||
        /试用(?:的\s*\d+\s*次)?\s*下载额度已用完/.test(message))
      return "试用下载额度已用完";
    if (/视频尺寸错误/.test(message) || code === "VIDEO_DIMENSIONS_INVALID")
      return "视频尺寸错误";
    if (/^视频信息不完整：缺少/.test(message) || code === "VIDEO_METADATA_INCOMPLETE")
      return "视频信息不完整";
    if (/^千川未接受视频与初始标题：仅支持商品卡方图和达人优选视频[。！! ]?$/.test(message))
      return "计划不接受当前素材类型";
    if (/无商城流量权限，无法添加商品卡素材/.test(message))
      return "无商城流量权限，无法添加商品卡素材";
    var reasons = {
      PLAN_TITLE_REQUIRED: "计划缺少可用标题",
      PLAN_MATERIAL_LIMIT: "计划素材数量达到上限",
      ORIGINAL_TITLE_UNAVAILABLE: "首条标题获取失败",
      PLAN_DETAIL_REQUIRED: "计划信息不完整",
      PLAN_AWEME_REQUIRED: "未取得计划绑定的抖音号",
      PLAN_AWEME_ID_INVALID: "计划抖音号标识无效",
      REMOTE_PLAN_NOT_ADDED: "已核实视频未加入计划",
      RECOVERY_VIDEO_MISMATCH: "核实的视频与当前任务不一致",
      ACCOUNT_NOT_FOUND: "未找到上传账户",
      CDN_REDIRECT_REJECTED: "视频下载地址跳转校验未通过"
    };
    if (Object.prototype.hasOwnProperty.call(reasons, code)) return reasons[code];
    if (/^(PLAN_MANUAL_TITLE_INVALID|PLAN_INITIAL_TITLE_INVALID)$/.test(code) &&
        /^(手填标题|计划初始标题)/.test(stage)) return stage;
    if (code === "WRITE_RESULT_UNCONFIRMED" || task.resultUncertain === true)
      return task.hasUploadedVideo === true ? "加入计划结果待核实" : "上传结果待核实";
    if (/^(PLAN_UPDATE_TIMEOUT|PLAN_CONFIRMATION_TIMEOUT)$/.test(code))
      return "加入计划超时";
    if (code === "PLAN_QUEUE_TIMEOUT")
      return task.hasUploadedVideo === true ? "加入计划排队超时" : "计划检查超时";
    if (code === "SESSION_RECOVERY_EXHAUSTED") return "上传会话恢复超时";
    if (code === "BROWSER_WORK_TIMEOUT") {
      if (task.uploadStage === "wait_plan_queue") return "加入计划排队超时";
      if (task.uploadStage === "transfer_video") return "文件上传超时";
      return "自动处理等待超时";
    }
    // Preserve precise native title / plan errors. Generic errors must admit
    // missing evidence instead of suggesting that repeated retries will fix it.
    if (/^(下载失败|上传失败|失败|暂未取得视频，请稍后重试|疑似搬运)$/.test(stage)) {
      if (/游客(?:会话|解析)未返回作品(?:原画数据|下载信息)/.test(message))
        return "未取得视频下载信息";
      if (code === "RESOLUTION_EXHAUSTED" ||
          /暂未取得视频|解析达到总等待时限|解析暂时不可用|解析通道均未成功|两个通道均未取得视频/.test(message))
        return "视频解析失败，具体原因待核实";
      if (task.hasUploadedVideo === true) return "加入计划失败，具体原因待核实";
      return task.retryStage === "Upload" || task.status === "UploadFailed"
        ? "上传失败，具体原因待核实" : "下载失败，具体原因待核实";
    }
    return stage;
  }

  // Presentation only: durable task state, retries and upload receipts stay intact.
  function taskStatusPresentation(task, displayError, noVideoAddress) {
    var status = String(task.status || "");
    var stage = noVideoAddress ? "没有视频下载地址" : displayTaskStage(task);
    var detail = "";
    var tone = "active";
    var icon = "loader";
    var transfer = false;
    var uploaded = stage === "视频已上传，等待加入计划" || stage === "视频已上传，排队加入计划";
    if (status === "UploadCompleted") {
      stage = "已加入计划"; tone = "success"; icon = "check";
      detail = displayError || "已加入目标计划";
    } else if (status === "Failed" || status === "UploadFailed" || status === "Cancelled") {
      tone = "error"; icon = "alert";
      if (!noVideoAddress && (!task.stage || stage === "等待中"))
        stage = status === "Cancelled" ? "已取消" : status === "UploadFailed" ? "上传失败" : "下载失败";
      // Only explicit deletion evidence may use the deletion label.
      if (status === "Failed" || status === "UploadFailed") {
        if (/^(作品|视频)已被删除，无法获取。?$/.test(stage))
          stage = "视频已被删除，无法获取。";
        else if (/^(下载失败|上传失败)$/.test(stage) &&
            /^视频信息不完整：缺少/.test(String(task.error || displayError || "").trim()))
          stage = "视频信息不完整";
        else if (/^(下载失败|上传失败|暂未取得视频，请稍后重试)$/.test(stage) &&
            /两个通道均未取得视频|解析达到总等待时限|暂未取得视频，请稍后重试/.test(String(task.error || displayError || "")))
          stage = "暂未取得视频，请稍后重试";
        stage = explicitFailureStage(task, displayError, stage);
      }
      detail = displayError;
    } else if (task.accountOffline === true) {
      stage = "等待重新登录"; tone = "waiting"; icon = "clock";
      detail = displayError || "账户已掉线，请重新登录";
    } else if (status === "Paused") {
      tone = "waiting"; icon = "clock"; detail = displayError || "任务已暂停";
    } else if (uploaded) {
      stage = "排队加入计划中";
      tone = "waiting"; icon = "clock";
      detail = displayError || "正在处理加入计划，完成后自动更新";
    } else if (stage === "排队上传中") {
      tone = "waiting"; icon = "clock";
    } else if (stage === "文件上传中" || stage === "本地直传千川" || stage === "传输至API服务") {
      stage = "文件上传中";
      detail = "按实际传输字节显示，尚未确认千川接收"; transfer = true;
    } else if (stage === "等待千川处理") {
      detail = "文件发送完成，正在等待千川确认";
    } else if (stage === "等待API通道") {
      tone = "waiting"; icon = "clock"; detail = displayError || "等待后核实任务状态";
    } else if (/排队加入计划|等待计划处理/.test(stage)) {
      stage = "排队加入计划中"; tone = "waiting"; icon = "clock";
      detail = "视频已上传";
    } else if (/等待计划检查/.test(stage)) {
      tone = "waiting"; icon = "clock"; detail = "等待目标计划检查";
    } else if (stage === "添加到已选计划" || /加入计划中/.test(stage)) {
      var registering = /登记素材/.test(String(task.progressText || ""));
      stage = registering ? "登记素材中" : "加入计划中";
      detail = registering ? "正在登记上传结果" : "正在提交素材";
    } else if (status === "Completed" || status === "UploadPending") {
      tone = "waiting"; icon = "clock";
      if (/^(上传中|下载完成|等待上传|待上传)$/.test(stage)) {
        stage = "排队上传中";
      } else {
        detail = displayError;
      }
    } else if (/上传视频中/.test(stage) ||
        (status === "Uploading" && stage === "上传中")) {
      stage = "文件上传中"; detail = "正在传输视频"; transfer = true;
    } else if (/下载中/.test(stage)) {
      detail = "正在保存原视频"; transfer = true;
    } else if (stage === "解析中") {
      detail = "正在获取视频信息";
    } else if (/检查上传准备/.test(stage)) {
      detail = "正在准备上传";
    }
    // Full diagnostics remain in task records; the row shows the safe reason.
    var compact = tone !== "error";
    detail = "";
    return { stage: stage, detail: detail, tone: tone, icon: icon,
      compact: compact, uploaded: uploaded, showProgress: transfer || uploaded || stage === "等待千川处理" || status === "UploadCompleted" };
  }

  function displayVideoTitle(task) {
    var title = String(task.title || "").trim();
    var placeholder = !title || /^(抖音视频_\d{10,30}|原视频_\d{8}_\d{6})$/.test(title) ||
      title === "等待获取视频信息" || /^后台素材 #\d+（等待获取视频信息）$/.test(title);
    if (!placeholder) return title;
    var pending = task.status === "Waiting" || task.status === "Resolving" ||
      (task.status === "Downloading" && /解析|后台排队/.test(String(task.stage || "")));
    return pending ? "等待获取视频信息" : "未获取到原标题";
  }

  function previewMarkup(task) {
    if (task.cover) {
      return '<span class="video-thumb"><img alt="" src="' + escapeAttribute(task.cover) + '"></span>';
    }
    return '<span class="video-thumb"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h11.5A1.5 1.5 0 0 1 17 8v8a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 16V8A1.5 1.5 0 0 1 4 6.5Z"></path><path d="m17 10 4-2v8l-4-2"></path><path d="m8.5 10 3.5 2-3.5 2Z"></path></svg></span>';
  }

  // Keep resolver diagnostics in task data and normalize customer-facing copy here.
  // Preserve unrelated network, account, and upload errors.
  function displayTaskError(error, task) {
    var message = String(error || "").trim();
    if (!message) return "";
    if (/试用(?:的\s*\d+\s*次)?\s*下载额度已用完/.test(message))
      return "试用下载额度已用完";
    // V1.37 hosts can attach this account-wide pause reason to already completed
    // background rows. Preserve real task/cleanup errors and all pending-row warnings.
    if (task && task.background === true && task.status === "UploadCompleted" &&
        message.indexOf("千川后台会话连续 ") === 0 &&
        message.indexOf("已暂停该账号上传") >= 0) return "";
    // A failed anonymous resolution does not prove a work was deleted.
    // Preserve specific visibility feedback even inside a channel summary.
    if (message.indexOf("正在审核或仅作者可见") >= 0)
      return "游客模式暂时无法下载该作品，请检查作品可见范围后重试";
    if (message.indexOf("该抖音作品已删除或已不可访问") >= 0)
      return "游客模式暂时无法获取该作品，请确认链接后重试";
    if (message.indexOf("暂未取得视频，请稍后重试") === 0 ||
        message.indexOf("您的观看视频不存在") === 0 ||
        message.indexOf("三个解析通道均未成功。") === 0 ||
        message.indexOf("三通道解析超过总等待时间") === 0)
      return "暂未取得视频，请稍后重试";
    if (message.indexOf("备用解析无法读取该作品，") === 0 ||
        message === "备用解析未返回视频下载地址") return "没有视频下载地址";
    return message.indexOf("游客会话未返回作品原画数据") >= 0 ||
      message.indexOf("游客会话未返回作品下载信息") >= 0 ||
      message.indexOf("游客解析未返回作品下载信息") >= 0
      ? "未取得视频下载信息"
      : message;
  }

  function taskDisplayPriority(task) {
    var status = String(task.status || "");
    // Terminal/paused rows may still carry the last transfer stage or percentage.
    if (status === "UploadCompleted") return 6;
    if (status === "Failed" || status === "UploadFailed" || status === "Cancelled") return 5;
    if (status === "Paused" || task.accountOffline === true) return 4;
    var presentation = taskStatusPresentation(task, "", false);
    var rawStage = String(task.stage || "");
    if (presentation.tone === "waiting" || /排队|等待|待上传/.test(rawStage)) return 3;
    if (presentation.stage === "文件上传中") return 0;
    if (presentation.stage === "下载中") return 1;
    if (status === "Uploading" || status === "Resolving" || status === "Downloading") return 2;
    return 3;
  }

  function sortTasksForDisplay(tasks) {
    // Sort only the view, never the host's execution queue. Progress updates do
    // not affect rank; equal ranks retain the host's original enqueue order.
    return tasks.map(function (task, index) {
      return { task: task, index: index, priority: taskDisplayPriority(task) };
    }).sort(function (a, b) {
      return a.priority - b.priority || a.index - b.index;
    }).map(function (entry) { return entry.task; });
  }

  function renderTasks() {
    var body = byId("taskBody");
    var tasks = sortTasksForDisplay(asArray(state.tasks).filter(taskMatchesFilter));
    if (tasks.length && body.firstElementChild && body.firstElementChild.classList.contains("empty-tasks")) body.innerHTML = "";
    var visibleTaskRowCount = Math.max(1, Math.min(5, tasks.length || 1));
    body.style.setProperty("--visible-task-row-count", String(visibleTaskRowCount));
    body.style.setProperty("--task-row-gap-total", String((visibleTaskRowCount - 1) * 4) + "px");

    if (!tasks.length) {
      taskRowsById = Object.create(null);
      if (lastEmptyTaskFilter === activeFilter) return;
      lastEmptyTaskFilter = activeFilter;
      body.innerHTML =
        '<div class="empty-tasks">' +
        '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 31V9"></path><path d="m16 17 8-8 8 8"></path><path d="M10 29v10h28V29"></path></svg>' +
        '<strong>' + (activeFilter === "all" ? "暂无下载任务" : "当前筛选下暂无任务") + '</strong>' +
        '<span>' + (activeFilter === "all" ? "粘贴视频链接并开始获取后，任务会显示在这里" : "可切换其他状态查看任务") + '</span>' +
        '</div>';
      return;
    }

    lastEmptyTaskFilter = null;
    var liveIds = Object.create(null);
    tasks.forEach(function (task, index) { liveIds[String(task.id || "row:" + index)] = true; });
    Object.keys(taskRowsById).forEach(function (id) {
      if (!liveIds[id]) { taskRowsById[id].row.remove(); delete taskRowsById[id]; }
    });
    var cursor = body.firstElementChild;
    tasks.forEach(function (task, index) {
      var id = String(task.id || "row:" + index);
      var entry = taskRowsById[id];
      if (!entry) entry = taskRowsById[id] = { row: document.createElement("div"), markup: null };
      var row = entry.row;
      row.className = "task-row";
      if (task.background === true) row.classList.add("background-task-row");
      row.setAttribute("role", "row");
      var displayError = displayTaskError(task.error, task);
      var errorDetail = displayError ? String(task.error || displayError) : "";
      var noVideoAddress = task.status === "Failed" && displayError === "没有视频下载地址";
      var presentation = taskStatusPresentation(task, displayError, noVideoAddress);
      var displayStage = presentation.stage;
      // Full diagnostics stay in task records, never in customer-facing tooltips.
      row.removeAttribute("title");
      var title = displayVideoTitle(task);
      var author = (task.author
        ? (task.background === true ? task.author : "@" + task.author)
        : (task.subtitle || ""));
      var progress = Math.max(0, Math.min(100, asNumber(task.progress, 0)));
      var progressText = task.progressText || (progress + "%");
      if (presentation.uploaded) { progress = 100; progressText = "上传 100%"; }
      var actionDisabled = task.canOperate === false ? " disabled" : "";
      var deleteDisabled = task.canDelete === false ? " disabled" : "";
      var operation = String(task.operation || "—");
      var operationMarkup = operation === "—"
        ? '<span class="row-action-placeholder" aria-hidden="true">—</span>'
        : '<button class="row-action" type="button" data-task-action="' + escapeAttribute(task.id) + '"' + actionDisabled + '>' + escapeHtml(operation) + '</button>';
      var markup =
        '<div class="video-cell" role="cell">' + previewMarkup(task) +
          '<span class="video-copy"><strong class="copy-task-title" data-copy-title="' + escapeAttribute(task.id) + '" tabindex="0" role="button" aria-label="双击复制完整视频标题" title="双击复制完整标题：' + escapeAttribute(title) + '">' + escapeHtml(title) + '</strong><small title="' + escapeAttribute(author) + '">' + escapeHtml(author) + '</small></span></div>' +
        '<div class="task-status-cell" role="cell"><span class="task-status ' + presentation.tone + '">' +
          '<span class="task-status-icon ' + presentation.icon + '" aria-hidden="true"></span><span class="task-status-copy"><strong>' + escapeHtml(displayStage) + '</strong>' +
          (presentation.detail ? '<small>' + escapeHtml(presentation.detail) + '</small>' : '') + '</span></span></div>' +
        '<div class="target-copy" role="cell"><strong title="' + escapeAttribute(task.shop || "—") + '">' + escapeHtml(task.shop || "—") + '</strong><small title="' + escapeAttribute(task.plan || "未选择计划") + '">' + escapeHtml(task.plan || "未选择计划") + '</small></div>' +
        '<div role="cell">' + escapeHtml(task.size || "—") + '</div>' +
        '<div class="progress-cell' + (presentation.tone === 'success' ? ' success' : '') + '" role="cell">' +
          (presentation.showProgress ? '<progress class="progress-track" max="100" value="' + Math.round(progress) + '" aria-label="当前进度 ' + Math.round(progress) + '%"></progress><span>' + escapeHtml(progressText) + '</span>' : '<span class="progress-placeholder">—</span>') + '</div>' +
        '<div class="row-actions" role="cell">' + operationMarkup + '<button class="row-delete" type="button" data-task-delete="' + escapeAttribute(task.id) + '"' + deleteDisabled + '>删除</button></div>';
      if (entry.markup !== markup) { row.innerHTML = markup; entry.markup = markup; }
      if (row !== cursor) body.insertBefore(row, cursor);
      cursor = row.nextElementSibling;
    });

  }

  // Stable delegated listeners survive row updates without repeated bindings.
  function initializeTaskActions() {
    var body = byId("taskBody");
    function copyTitle(event) {
      var title = event.target.closest("[data-copy-title]");
      if (!title || !body.contains(title)) return;
      event.preventDefault();
      event.stopPropagation();
      postCommand("copyTaskTitle", { id: title.getAttribute("data-copy-title") });
    }
    body.addEventListener("dblclick", copyTitle);
    body.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") copyTitle(event);
    });
    body.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-task-action], button[data-task-delete]");
      if (!button || !body.contains(button) || button.disabled) return;
      var deleting = button.hasAttribute("data-task-delete");
      postCommand(deleting ? "deleteTask" : "taskAction", {
        id: button.getAttribute(deleting ? "data-task-delete" : "data-task-action")
      });
    });
  }

  function renderWorkflow() {
    var hostStep = Math.max(0, Math.min(3, asNumber(state.workflowStep, 0)));
    // The host keeps its existing internal four-stage contract. Present both
    // preparation and transfer as adding to the already selected plan.
    var active = hostStep === 3 ? 2 : hostStep > 0 ? 1 : 0;
    document.querySelectorAll(".workflow-step").forEach(function (step, index) {
      step.classList.toggle("active", index === active);
      step.classList.toggle("complete", index < active);
    });
  }

  function renderCounters() {
    var tasks = asArray(state.tasks);
    var counters = { downloading: 0, uploading: 0, completed: 0, failed: 0 };
    tasks.forEach(function (task) { counters[taskGroup(task)] += 1; });
    setText("countAll", tasks.length);
    setText("countDownloading", counters.downloading);
    setText("countUploading", counters.uploading);
    setText("countCompleted", counters.completed);
    setText("countFailed", counters.failed);
  }

  function renderBackgroundSubmission() {
    var modal = byId("backgroundSubmissionModal");
    var submission = state.backgroundSubmission;
    var eventId = submission && String(submission.eventId || submission.batchId || "");
    if (!submission || !eventId || dismissedBackgroundEvents[eventId]) {
      modal.hidden = true;
      document.body.classList.remove("background-modal-open");
      activeBackgroundEventId = "";
      return;
    }

    var displayName = String(submission.displayName || submission.targetPlanName || "当前计划");
    setText("backgroundModalTitle", displayName + "已转入后台");
    setText("backgroundModalSubtitle", asNumber(submission.materialCount, 0) + " 条素材任务已安全保存并进入后台队列");
    setText("backgroundAccountName", submission.accountName || "—");
    setText("backgroundPlanName", submission.targetPlanName || "—");
    setText("backgroundMaterialCount", asNumber(submission.materialCount, 0) + " 条");
    setText("backgroundBatchId", submission.batchShortId || submission.batchId || "—");
    modal.hidden = false;
    document.body.classList.add("background-modal-open");
    if (activeBackgroundEventId !== eventId) {
      activeBackgroundEventId = eventId;
      window.setTimeout(function () { byId("continueOtherPlan").focus(); }, 20);
    }
  }

  function closeBackgroundSubmission(command) {
    var submission = state.backgroundSubmission;
    var eventId = submission && String(submission.eventId || submission.batchId || "");
    if (eventId) dismissedBackgroundEvents[eventId] = true;
    byId("backgroundSubmissionModal").hidden = true;
    document.body.classList.remove("background-modal-open");
    activeBackgroundEventId = "";
    if (command) postCommand(command);
  }

  function showBackgroundTasksInline() {
    // The task list is the single source of truth for progress. Do not move the
    // root document here: the page uses a fixed viewport grid, so scrolling the
    // task card into view clips the title and header actions.
    activeFilter = "all";
    document.querySelectorAll(".task-filters button").forEach(function (candidate) {
      candidate.classList.toggle("active", candidate.getAttribute("data-filter") === "all");
    });
    closeBackgroundSubmission("viewBackgroundTasks");
    showToast("后台任务已显示在视频信息列表");
  }

  function boundedNumber(value, minimum, maximum, fallback) {
    var number = Math.round(asNumber(value, fallback));
    if (!Number.isFinite(number)) number = fallback;
    return Math.max(minimum, Math.min(maximum, number));
  }

  function normalizePerformanceMode(value) {
    value = String(value || "").trim().toLowerCase();
    return value === "stable" || value === "custom" ? value : "smart";
  }

  function performanceModeCopy(value) {
    var mode = normalizePerformanceMode(value);
    if (mode === "stable") return { label: "稳定模式", status: "单路保护 · 会话优先" };
    if (mode === "custom") return { label: "自定义模式", status: "按自定义并发执行" };
    return { label: "智能极速模式", status: "会话预热 · 自动提速" };
  }

  function closePerformanceModeMenu(restoreFocus) {
    var menu = byId("performanceModeMenu");
    var button = byId("performanceModeButton");
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (restoreFocus && button) button.focus();
  }

  function renderPerformanceMode() {
    var mode = normalizePerformanceMode(state.performanceMode);
    var copy = performanceModeCopy(mode);
    setText("performanceModeLabel", copy.label);
    setText("performanceStatus", copy.status);
    byId("performanceModeButton").title = mode === "smart"
      ? "会话稳定时自动提速；出现会话重试会自动收敛为单路"
      : mode === "stable" ? "优先保证千川会话稳定" : "使用下载与上传设置中的自定义并发";
    document.querySelectorAll("[data-performance-mode]").forEach(function (button) {
      button.setAttribute("aria-checked", button.getAttribute("data-performance-mode") === mode ? "true" : "false");
    });
  }

  function renderVideoAdaptation() {
    var enabled = state.videoAdaptationEnabled === true && String(state.videoAdaptationMode || "").toLowerCase() === "crop-9-16";
    var toggle = byId("videoAdaptationToggle");
    toggle.setAttribute("aria-checked", enabled ? "true" : "false");
    toggle.title = enabled
      ? "已开启：下载完成前适配为合规 9:16 尺寸，保留原文件名；符合上传规格的视频不重复处理"
      : "关闭：保留原视频尺寸，不进行 9:16 适配";
  }

  function uploadSessionStatusCopy(status) {
    switch (String(status || "not_checked").toLowerCase()) {
      case "ready": return "已就绪";
      case "checking": return "检查中";
      case "disabled": return "未启用";
      case "login_required": return "需登录";
      case "security_verification_required": return "需验证";
      case "account_mismatch": return "需切换账号";
      case "account_unavailable": return "暂不可用";
      case "session_unavailable": return "暂不可用";
      default: return "待检查";
    }
  }

  function activeUploadPresentation() {
    // Activity is not a new session proof. Never match by display names or hide
    // an explicit login/security/error state behind another account's uploads.
    var status = String(state.uploadSessionStatus || "not_checked").toLowerCase();
    if (state.autoUpload === false || state.uploadTargetReady !== true ||
        (status !== "not_checked" && status !== "ready") ||
        !state.selectedUploadAccountId || !state.selectedUploadPlanId) return null;
    var active = (state.tasks || []).filter(function (task) {
      return task.background === true && task.status === "Uploading" &&
        task.accountId === state.selectedUploadAccountId && task.targetPlanId === state.selectedUploadPlanId;
    });
    if (!active.length) return null;
    return active.some(function (task) { return task.stage === "后台上传中"; })
      ? "后台正在上传，目标计划已锁定。"
      : "视频已传输，正在确认素材与计划绑定。";
  }

  function renderUploadSession(controlsLocked) {
    var status = String(state.uploadSessionStatus || "not_checked").toLowerCase();
    var check = byId("checkUploadSession");
    var targetLock = byId("uploadTargetLock");
    var actionRow = byId("uploadActionRow");
    if (!targetLock || !check) return;
    var detail = state.uploadSessionMessage || "请选择店铺和计划后检查上传会话。";
    var proofLabel = "检查通过";
    check.textContent = status === "checking" ? "检查中" : status === "ready" ? "重新检查" : "重试检查";
    // A basic check confirms the selected session; upload preparation still runs before writing.
    // Keep an explicit recheck reachable without changing the selected plan.
    check.hidden = state.uploadSessionCode === "SHARED_ACCOUNT_READY" ||
      String(state.selectedUploadAccountId || "").indexOf("onecut-api:") === 0 ||
      state.uploadSessionCode === "ONECUT_INSPECTION_ONLY";
    check.disabled = state.uploadSessionCanCheck !== true || status === "checking";
    check.title = detail;
    var targetSummary = [state.selectedShop, state.selectedDeliveryType, state.selectedPlan]
      .map(function (value) { return String(value || "").trim(); })
      .filter(Boolean)
      .join(" · ");
    var lockCopy = status === "ready" && targetSummary
      ? (state.uploadSessionCode === "SHARED_ACCOUNT_READY" ? "已同步 · " + state.selectedPlan : state.uploadSessionCode === "BASIC_READY" ? "基础检查通过 · " + state.selectedPlan : detail.indexOf("下载后校验") >= 0 ? "检查通过 · 下载后校验原标题" : detail.indexOf("已填写") >= 0 ? "检查通过 · 将补充已填标题" : "上传准备完成 · " + state.selectedPlan)
      : status === "checking"
      ? "正在检查上传条件，请稍候…"
      : state.uploadSessionCode === "ONECUT_INSPECTION_ONLY" || state.uploadSessionCode === "CHECK_TIMEOUT" || state.uploadSessionCode === "CHECK_CANCELLED" || state.uploadTargetReady !== true || (status !== "not_checked" && status !== "disabled")
      ? detail
      : !state.selectedShop
      ? "请先选择店铺，再选择投放方式和计划"
      : !state.selectedDeliveryType
      ? "完成投放方式选择后，即可选择计划"
      : !state.selectedPlan
      ? "选择目标计划后将自动校验上传准备"
      : "选中计划后自动检查，通过后即可开始。";
    var activity = null; // Task activity cannot replace the selected target readiness.
    targetLock.hidden = state.autoUpload === false;
    if (actionRow) actionRow.classList.toggle("local-download", state.autoUpload === false);
    targetLock.className = "upload-target-lock status-" + (activity ? "uploading" : status);
    setText("uploadTargetLockText", lockCopy);
    targetLock.title = detail;
  }

  function createSettingsDraft() {
    return {
      maxInputCount: boundedNumber(state.maxInputCount, 100, 5000, 500),
      maxConcurrency: boundedNumber(state.maxConcurrency, 1, 10, 2),
      uploadConcurrencyPerAccount: boundedNumber(state.uploadConcurrencyPerAccount, 1, 10, 5),
      performanceMode: normalizePerformanceMode(state.performanceMode),
      maxRetries: boundedNumber(state.maxRetries, 0, 3, 2),
      autoUpload: state.autoUpload !== false,
      cleanupLocalAfterSuccess: state.cleanupLocalAfterSuccess === true,
      forcePublicFetch: state.forcePublicFetch === true,
      outputDirectory: state.outputDirectory || "请选择原视频保存文件夹"
    };
  }

  function setSettingsToggle(id, value) {
    var toggle = byId(id);
    if (toggle) toggle.setAttribute("aria-checked", value ? "true" : "false");
  }

  function syncDownloadSettingsModal(resetInputValues) {
    var modal = byId("downloadSettingsModal");
    if (!settingsDraft || !modal || modal.hidden) return;
    var outputDirectory = state.outputDirectory || settingsDraft.outputDirectory || "请选择原视频保存文件夹";
    settingsDraft.outputDirectory = outputDirectory;
    // The open dialog owns its edits. Background progress/state messages must
    // not restore the saved values (or interrupt a temporarily empty input).
    // Seed controls only when opening, or normalize explicitly before saving.
    if (resetInputValues === true) {
      byId("settingsMaxInputCount").value = String(settingsDraft.maxInputCount);
      byId("settingsMaxConcurrency").value = String(settingsDraft.maxConcurrency);
      byId("settingsUploadConcurrency").value = String(settingsDraft.uploadConcurrencyPerAccount);
      byId("settingsMaxRetries").value = String(settingsDraft.maxRetries);
    }
    setSettingsToggle("settingsAutoUploadToggle", settingsDraft.autoUpload);
    setSettingsToggle("settingsCleanupToggle", settingsDraft.cleanupLocalAfterSuccess);
    setSettingsToggle("settingsForcePublicFetchToggle", settingsDraft.forcePublicFetch);
    setText("settingsOutputDirectory", outputDirectory);
    byId("settingsOutputDirectory").title = outputDirectory;
    var isCustom = settingsDraft.performanceMode === "custom";
    byId("settingsMaxConcurrency").disabled = false;
    byId("settingsUploadConcurrency").disabled = !isCustom;
    byId("settingsMaxConcurrency").title = "可设置 1–10 个同时下载任务，保存后用于后续新增任务";
    byId("settingsUploadConcurrency").title = isCustom ? "" : "请先在主界面选择“自定义模式”";
  }

  function openDownloadSettingsModal(trigger) {
    settingsDraft = createSettingsDraft();
    settingsSavePending = false;
    settingsTrigger = trigger || document.activeElement;
    byId("downloadSettingsModal").hidden = false;
    document.body.classList.add("download-settings-open");
    syncDownloadSettingsModal(true);
    window.setTimeout(function () { byId("settingsMaxInputCount").focus(); }, 20);
  }

  function closeDownloadSettingsModal(restoreFocus) {
    var modal = byId("downloadSettingsModal");
    if (modal) modal.hidden = true;
    document.body.classList.remove("download-settings-open");
    settingsDraft = null;
    settingsSavePending = false;
    if (restoreFocus !== false && settingsTrigger && typeof settingsTrigger.focus === "function") settingsTrigger.focus();
    settingsTrigger = null;
  }

  function toggleSettingsValue(key, id) {
    if (!settingsDraft) return;
    settingsDraft[key] = !settingsDraft[key];
    setSettingsToggle(id, settingsDraft[key]);
  }

  function readSettingsNumber(id, minimum, maximum, fallback) {
    var value = byId(id).value;
    return String(value).trim() === "" ? fallback : boundedNumber(value, minimum, maximum, fallback);
  }

  function bindSettingsNumber(id, key, minimum, maximum) {
    var control = byId(id);
    function rememberEdit() {
      if (!settingsDraft || String(control.value).trim() === "") return;
      settingsDraft[key] = boundedNumber(control.value, minimum, maximum, settingsDraft[key]);
    }
    control.addEventListener("input", rememberEdit);
    control.addEventListener("change", rememberEdit);
  }

  function titleModeForInput(mode, text) {
    return mode === "original" ? "original" : (String(text || "").trim() ? "manual" : "existing");
  }

  function currentTitleSettings() {
    if (!titleSettingsDraft) {
      titleSettingsDraft = {
        planTitleMode: titleModeForInput(state.planTitleMode, state.planTitleManualText),
        planTitleManualText: String(state.planTitleManualText || "")
      };
    }
    return {
      planTitleMode: titleSettingsDraft.planTitleMode,
      planTitleManualText: titleSettingsDraft.planTitleManualText
    };
  }

  function saveTitleSettings() {
    window.clearTimeout(titleSettingsTimer);
    var payload = currentTitleSettings();
    if (window.chrome && window.chrome.webview) postCommand("setTitleSettings", payload);
    else {
      state = Object.assign({}, state, payload);
      titleSettingsDirty = false;
    }
  }

  function titleModeCopy(mode) {
    if (mode === "manual") return {
      hint: "仅计划无可用标题时，用手动输入的内容补一条；已有标题不新增。",
      confirmation: "已有可用标题时直接复用，不重复创建。仅当目标计划无可用标题时，使用你手动输入的内容补充一条标题；不会为每个视频分别新增标题。",
      confirmButton: "按此方式开启上传"
    };
    if (mode === "original") return {
      hint: "仅计划无可用标题时，用本批首条视频的原始标题补一条；已有标题不新增。",
      confirmation: "已有可用标题时直接复用，不重复创建。仅当目标计划无可用标题时，使用本批首条视频的原始标题补充一条；不会为每个视频分别新增标题。",
      confirmButton: "按此方式开启上传"
    };
    return {
      hint: "仅计划无可用标题时，请先在千川创建标题；本功能不会自动补标题。",
      confirmation: "目标千川计划需已有可用标题。此方式只上传视频，不会自动创建标题；计划未设置标题可能导致加入计划失败。已有标题直接复用，无需重复创建。",
      confirmButton: "我已创建标题，开启上传"
    };
  }

  function renderTitleSettings(controlsLocked) {
    var draft = currentTitleSettings();
    var original = byId("planTitleUseOriginal");
    original.checked = draft.planTitleMode === "original";
    original.disabled = controlsLocked === true;
    var manual = byId("planTitleManualText");
    if (document.activeElement !== manual && manual.value !== draft.planTitleManualText) manual.value = draft.planTitleManualText;
    manual.disabled = controlsLocked === true || original.checked;
    var copy = titleModeCopy(draft.planTitleMode);
    setText("autoUploadHint", copy.hint);
    setText("settingsAutoUploadDescription", copy.hint);
  }

  function acceptTitleSettingsState(message) {
    if (!Object.prototype.hasOwnProperty.call(message, "planTitleMode") &&
        !Object.prototype.hasOwnProperty.call(message, "planTitleManualText")) return;
    var incoming = {
      planTitleMode: titleModeForInput(state.planTitleMode, state.planTitleManualText),
      planTitleManualText: String(state.planTitleManualText || "")
    };
    var draft = currentTitleSettings();
    if (incoming.planTitleMode === draft.planTitleMode && incoming.planTitleManualText === draft.planTitleManualText) {
      titleSettingsDirty = false;
    } else if (!titleSettingsDirty && document.activeElement !== byId("planTitleManualText")) {
      titleSettingsDraft = incoming;
    }
  }

  function requestAutoUploadConfirmation(origin, trigger) {
    if (autoUploadConfirmation) return;
    var copy = titleModeCopy(currentTitleSettings().planTitleMode);
    setText("autoUploadConfirmationMessage", copy.confirmation);
    setText("autoUploadConfirmationConfirm", copy.confirmButton);
    autoUploadConfirmation = { origin: origin, trigger: trigger, draft: settingsDraft };
    byId("autoUploadConfirmationModal").hidden = false;
    byId("autoUploadConfirmationCancel").focus();
  }

  function setVideoAdaptationEnabled(enabled) {
    if (window.chrome && window.chrome.webview) postCommand("setVideoAdaptation", { enabled: enabled });
    else {
      state.videoAdaptationEnabled = enabled;
      state.videoAdaptationMode = enabled ? "crop-9-16" : "disabled";
      render();
    }
    showToast(enabled ? "已开启 9:16 自动适配；仅影响之后新增批次" : "已关闭 9:16 自动适配；仅影响之后新增批次");
  }

  function requestVideoAdaptationConfirmation(trigger) {
    if (videoAdaptationConfirmation) return;
    videoAdaptationConfirmation = { trigger: trigger };
    byId("videoAdaptationConfirmationModal").hidden = false;
    byId("videoAdaptationConfirmationCancel").focus();
  }

  function closeVideoAdaptationConfirmation(confirmed) {
    var pending = videoAdaptationConfirmation;
    if (!pending) return;
    videoAdaptationConfirmation = null;
    byId("videoAdaptationConfirmationModal").hidden = true;
    if (confirmed) setVideoAdaptationEnabled(true);
    if (pending.trigger && typeof pending.trigger.focus === "function") pending.trigger.focus();
  }

  function closeAutoUploadConfirmation(confirmed) {
    var pending = autoUploadConfirmation;
    if (!pending) return;
    autoUploadConfirmation = null;
    byId("autoUploadConfirmationModal").hidden = true;
    if (confirmed) {
      if (pending.origin === "settings") {
        if (settingsDraft && settingsDraft === pending.draft) {
          settingsDraft.autoUpload = true;
          setSettingsToggle("settingsAutoUploadToggle", true);
        }
      } else {
        setAutoUploadEnabled(true);
      }
    }
    if (pending.trigger && typeof pending.trigger.focus === "function") pending.trigger.focus();
  }

  function setAutoUploadEnabled(enabled) {
    window.clearTimeout(titleSettingsTimer);
    if (window.chrome && window.chrome.webview) {
      // Save the title choice and switch together. Render the saved host state,
      // so an earlier poll cannot undo an optimistic switch animation.
      postCommand("setAutoUpload", Object.assign({ value: enabled }, enabled ? currentTitleSettings() : {}));
      return;
    }
    if (enabled) saveTitleSettings();
    state.autoUpload = enabled;
    setSettingsToggle("autoUploadToggle", enabled);
    // Keep the action row populated while the host completes its revalidation.
    renderUploadSession(false);
    var primaryCopy = byId("startAutomatic").querySelector("span");
    if (primaryCopy) primaryCopy.textContent = enabled
      ? "开始下载并自动上传"
      : "开始下载（仅下载）";
  }

  function saveDownloadSettings() {
    if (!settingsDraft) return;
    settingsDraft.maxInputCount = readSettingsNumber("settingsMaxInputCount", 100, 5000, settingsDraft.maxInputCount);
    settingsDraft.maxConcurrency = readSettingsNumber("settingsMaxConcurrency", 1, 10, settingsDraft.maxConcurrency);
    settingsDraft.uploadConcurrencyPerAccount = readSettingsNumber("settingsUploadConcurrency", 1, 10, settingsDraft.uploadConcurrencyPerAccount);
    settingsDraft.maxRetries = readSettingsNumber("settingsMaxRetries", 0, 3, settingsDraft.maxRetries);
    syncDownloadSettingsModal(true);

    var titleSettings = currentTitleSettings();
    var payload = {
      maxInputCount: settingsDraft.maxInputCount,
      maxConcurrency: settingsDraft.maxConcurrency,
      uploadConcurrencyPerAccount: settingsDraft.uploadConcurrencyPerAccount,
      performanceMode: settingsDraft.performanceMode,
      maxRetries: settingsDraft.maxRetries,
      autoUpload: settingsDraft.autoUpload,
      cleanupLocalAfterSuccess: settingsDraft.cleanupLocalAfterSuccess,
      forcePublicFetch: settingsDraft.forcePublicFetch
    };
    payload.planTitleMode = titleSettings.planTitleMode;
    payload.planTitleManualText = titleSettings.planTitleManualText;
    if (window.chrome && window.chrome.webview) {
      settingsSavePending = true;
      postCommand("saveDownloadSettings", payload);
      return;
    }

    state = Object.assign({}, state, payload);
    closeDownloadSettingsModal(false);
    render();
    showToast("下载与上传设置已保存");
  }

  function render() {
    syncLinkInput();

    var recognizedText = "已识别 " + asNumber(state.recognizedCount, 0) + " 条链接";
    if (asNumber(state.rejectedCount, 0) > 0) recognizedText += "，无效 " + asNumber(state.rejectedCount, 0) + " 条";
    setText("recognizedCount", recognizedText);
    setText("inputWarning", state.overflow ? "最多处理 " + asNumber(state.maxInputCount, 500) + " 条" : "");
    setText("outputPath", state.outputDirectory || "请选择原视频保存文件夹");
    setText("watchedFolderPath", state.outputDirectory || "尚未绑定下载文件夹");
    renderPerformanceMode();
    renderVideoAdaptation();

    var shopSelect = byId("shopSelect");
    var deliveryTypeSelect = byId("deliveryTypeSelect");
    var planSelect = byId("planSelect");
    fillSelect(shopSelect, state.shops, state.selectedShop, state.apiAccountsLoading === true ? "正在读取API账户…" : state.apiAccountMessage || "暂无已登录店铺");
    fillSelect(deliveryTypeSelect, state.deliveryTypes, state.selectedDeliveryType, "选择投放方式");
    // Existing plans stay usable while the host refreshes. Opening or searching
    // the selector is local; only the explicit refresh button requests a sync.
    var emptyPlanText = !state.selectedShop
      ? "请先选择店铺"
      : !state.selectedDeliveryType
      ? "请先选择投放方式"
      : asArray(state.plans).length
      ? "请选择目标千川计划"
      : state.plansRefreshing === true
      ? "正在同步最新计划…"
      : state.plansSynchronized !== true
      ? "计划尚未同步"
      : "暂无" + state.selectedDeliveryType + "计划";
    fillSelect(planSelect, state.plans, state.selectedPlan, emptyPlanText, true);
    var controlsLocked = state.running === true || state.uploading === true || state.submittingBackgroundBatch === true;
    byId("videoAdaptationToggle").disabled = controlsLocked;
    shopSelect.disabled = controlsLocked || !asArray(state.shops).length;
    deliveryTypeSelect.disabled = controlsLocked || state.canSelectDeliveryType !== true || !asArray(state.deliveryTypes).length;
    planSelect.disabled = controlsLocked || state.canSelectPlan !== true || !asArray(state.plans).length;
    var planSelectShell = planSelect.closest("[data-ui-select]");
    if (planSelectShell) {
      var prerequisiteMissing = !state.selectedShop || !state.selectedDeliveryType || state.canSelectPlan !== true;
      planSelectShell.classList.toggle("prerequisite-locked", planSelect.disabled && prerequisiteMissing);
      planSelectShell.setAttribute("data-plan-locked-reason", prerequisiteMissing ? emptyPlanText : "");
    }
    var refreshPlans = byId("refreshPlans");
    var accountRefresh = !state.selectedShop && !!state.apiAccountMessage;
    refreshPlans.disabled = controlsLocked || (accountRefresh
      ? state.apiAccountsLoading === true || state.apiAccountsCanRefresh !== true
      : state.apiPlansCanRefresh === false || state.plansRefreshing === true || !state.selectedShop || (state.canRefreshPlans !== true && state.uploadAccountReady !== true));
    refreshPlans.textContent = accountRefresh ? (state.apiAccountsLoading === true ? "读取账户中…" : "刷新账户") : state.plansRefreshing === true ? "同步中…" : "刷新计划";
    renderPlanRefreshCancellation(refreshPlans, controlsLocked);
    refreshPlans.title = state.apiPlanNotice || (state.plansRefreshMessage && state.plansRefreshMessage !== "打开计划列表时会自动同步"
      ? state.plansRefreshMessage : "点击后从千川获取最新计划；搜索和选择计划无需重新同步");
    var planLabel = byId("planSelectLabel");
    planLabel.textContent = state.apiPlanNotice ? "选择计划（缓存）" : "选择计划";
    planLabel.title = state.apiPlanNotice || "";
    syncUiSelect(shopSelect);
    syncUiSelect(deliveryTypeSelect);
    syncUiSelect(planSelect);
    renderTitleSettings(controlsLocked);

    var targetPanel = byId("autoUploadOption");
    targetPanel.classList.remove("target-info", "target-warning", "target-error", "target-success");
    var activity = null;
    targetPanel.classList.add("target-" + (activity ? "info" : state.uploadTargetTone || "warning"));
    var targetMessage = accountRefresh ? state.apiAccountMessage : activity ? activity + " 新任务启动时会自动校验。" : state.uploadTargetMessage || "请先确认店铺和千川计划";
    setText("uploadTargetMessage", targetMessage);
    setText("automaticUploadHeading", state.autoUpload === false ? "按计划自动识别" : "已识别上传目标");
    var uploadStatus = accountRefresh ? targetMessage : state.uploadTargetReady !== true && state.selectedShop && state.uploadTargetCode !== "plan_required"
      ? targetMessage
      : state.apiPlanNotice ? state.apiPlanNotice
      : state.autoUpload === false ? "请选择计划，下载后自动上传" : "上传并添加到所选计划";
    var clearPlan = byId("clearUploadPlan");
    clearPlan.hidden = !state.selectedPlan;
    clearPlan.disabled = controlsLocked || !!pendingTargetSelection;
    setText("autoUploadStatus", uploadStatus);
    byId("autoUploadStatus").title = state.apiPlanNotice ? uploadStatus + "；" + targetMessage : targetMessage;
    byId("autoUploadStatus").classList.toggle("is-download-only", state.autoUpload === false);
    targetPanel.title = targetMessage;
    renderUploadSession(controlsLocked);

    var toggle = byId("autoUploadToggle");
    toggle.setAttribute("aria-checked", state.autoUpload !== false ? "true" : "false");
    toggle.disabled = controlsLocked || (state.uploadAccountReady !== true && state.autoUpload === false);
    byId("autoUploadHint").hidden = state.autoUpload === false;
    byId("linkInput").disabled = state.running === true;
    var automaticButton = byId("startAutomatic");
    automaticButton.disabled = !!pendingTargetSelection || state.canStartAutomatic !== true ||
      (state.autoUpload !== false && state.uploadSessionReady !== true);
    var automaticButtonCopy = automaticButton.querySelector("span");
    if (automaticButtonCopy) {
      automaticButtonCopy.textContent = state.running === true ? "下载任务进行中…"
        : state.submittingBackgroundBatch === true ? "正在提交任务…"
        : state.autoUpload !== false && state.uploadSessionStatus === "checking"
        ? "正在检查上传条件…"
        : state.autoUpload !== false
        ? "开始下载并自动上传"
        : "开始下载";
    }
    automaticButton.title = state.running === true
      ? "当前下载任务正在执行，可在下方查看进度或暂停"
      : automaticButton.disabled
      ? (state.recognizedCount > 0 ? state.uploadTargetMessage || "请先完成上传设置" : "请先粘贴有效的抖音视频链接")
      : state.autoUpload !== false
        ? "下载完成后自动上传到所选千川计划"
        : "无需绑定店铺或选择计划，原视频直接保存到本机";

    setText("pauseAll", state.pauseAllText || "全部继续");
    byId("pauseAll").disabled = state.canPauseAll !== true;
    byId("clearFinished").disabled = state.canClearFinished !== true;

    renderCounters();
    renderWorkflow();
    renderTasks();
    renderBackgroundSubmission();
    syncDownloadSettingsModal();
    if (settingsSavePending) {
      closeDownloadSettingsModal(false);
      showToast("下载与上传设置已保存");
    }
  }

  function showToast(message, error) {
    var toast = byId("toast");
    toast.textContent = message || "操作已完成";
    toast.className = "toast show" + (error ? " error" : "");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.className = "toast"; }, 2700);
  }

  byId("linkInput").addEventListener("input", function () {
    inputDirty = true;
    window.clearTimeout(inputTimer);
    inputTimer = window.setTimeout(flushLinkInput, 160);
  });
  byId("linkInput").addEventListener("blur", flushLinkInput);

  byId("downloadSettings").addEventListener("click", function () { openDownloadSettingsModal(this); });
  byId("openOutputDirectory").addEventListener("click", function () { postCommand("openOutputDirectory"); });
  byId("chooseOutputDirectory").addEventListener("click", function () { postCommand("chooseOutputDirectory"); });
  byId("outputPath").addEventListener("click", function () { postCommand("chooseOutputDirectory"); });
  byId("watchedFolder").addEventListener("click", function () { postCommand("chooseOutputDirectory"); });
  byId("watchedFolderIcon").addEventListener("click", function () { postCommand("chooseOutputDirectory"); });
  byId("videoAdaptationToggle").addEventListener("click", function () {
    var enabled = this.getAttribute("aria-checked") !== "true";
    if (enabled) requestVideoAdaptationConfirmation(this);
    else setVideoAdaptationEnabled(false);
  });
  byId("performanceModeButton").addEventListener("click", function () {
    var menu = byId("performanceModeMenu");
    var open = menu.hidden === true;
    menu.hidden = !open;
    this.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      var selected = menu.querySelector('[data-performance-mode][aria-checked="true"]');
      if (selected) selected.focus();
    }
  });
  document.querySelectorAll("[data-performance-mode]").forEach(function (button) {
    button.addEventListener("click", function () {
      var mode = normalizePerformanceMode(this.getAttribute("data-performance-mode"));
      closePerformanceModeMenu(false);
      if (window.chrome && window.chrome.webview) postCommand("setPerformanceMode", { value: mode });
      else {
        state.performanceMode = mode;
        render();
      }
      showToast("已切换为" + performanceModeCopy(mode).label + "；仅影响之后新增批次");
    });
  });
  function selectUploadTarget(command, field, value) {
    pendingTargetSelection = { field: field, value: value, token: String(Date.now()) + "-" + Math.random().toString(36).slice(2) };
    state.canStartAutomatic = false;
    state.uploadSessionReady = false;
    state.uploadSessionStatus = "checking";
    state.uploadSessionMessage = "正在检查所选计划…";
    byId("startAutomatic").disabled = true;
    postCommand(command, { value: value, selectionToken: pendingTargetSelection.token });
  }
  byId("shopSelect").addEventListener("change", function () { selectUploadTarget("selectShop", "selectedShop", this.value); });
  byId("deliveryTypeSelect").addEventListener("change", function () { selectUploadTarget("selectDeliveryType", "selectedDeliveryType", this.value); });
  byId("planSelect").addEventListener("change", function () { selectUploadTarget("selectPlan", "selectedPlan", this.value); });
  byId("clearUploadPlan").addEventListener("click", function () { selectUploadTarget("selectPlan", "selectedPlan", ""); });
  byId("refreshPlans").addEventListener("click", requestPlanRefresh);
  byId("checkUploadSession").addEventListener("click", function () {
    if (this.disabled) return;
    postCommand("checkUploadSession", { force: true });
  });
  byId("autoUploadToggle").disabled = true;
  byId("settingsAutoUploadToggle").closest(".download-settings-row").hidden = true;
  byId("planTitleUseOriginal").addEventListener("change", function () {
    currentTitleSettings();
    titleSettingsDraft.planTitleMode = titleModeForInput(this.checked ? "original" : "existing", titleSettingsDraft.planTitleManualText);
    titleSettingsDirty = true;
    renderTitleSettings(false);
    saveTitleSettings();
  });
  byId("planTitleManualText").addEventListener("input", function () {
    currentTitleSettings();
    titleSettingsDraft.planTitleManualText = this.value;
    titleSettingsDraft.planTitleMode = titleModeForInput("existing", this.value);
    titleSettingsDirty = true;
    renderTitleSettings(false);
    window.clearTimeout(titleSettingsTimer);
    titleSettingsTimer = window.setTimeout(saveTitleSettings, 350);
  });
  byId("planTitleManualText").addEventListener("blur", saveTitleSettings);
  byId("startAutomatic").addEventListener("click", function () {
    flushLinkInput();
    window.clearTimeout(titleSettingsTimer);
    postCommand("startAutomatic", currentTitleSettings());
  });
  byId("pauseAll").addEventListener("click", function () { postCommand("togglePauseAll"); });
  byId("exportTaskDiagnostics").addEventListener("click", function () { postCommand("exportTaskDiagnostics"); });
  byId("clearFinished").addEventListener("click", function () { postCommand("clearFinished"); });
  byId("backgroundModalClose").addEventListener("click", function () { closeBackgroundSubmission("dismissBackgroundSubmission"); });
  byId("viewBackgroundTasks").addEventListener("click", showBackgroundTasksInline);
  byId("continueOtherPlan").addEventListener("click", function () {
    closeBackgroundSubmission("continueOtherPlan");
    window.setTimeout(function () { byId("linkInput").focus(); }, 80);
  });
  byId("backgroundSubmissionModal").addEventListener("click", function (event) {
    if (event.target === this) closeBackgroundSubmission("dismissBackgroundSubmission");
  });
  byId("downloadSettingsClose").addEventListener("click", function () { closeDownloadSettingsModal(); });
  byId("downloadSettingsCancel").addEventListener("click", function () { closeDownloadSettingsModal(); });
  byId("settingsAutoUploadToggle").addEventListener("click", function () {
    if (!settingsDraft) return;
    if (!settingsDraft.autoUpload) requestAutoUploadConfirmation("settings", this);
    else toggleSettingsValue("autoUpload", "settingsAutoUploadToggle");
  });
  bindSettingsNumber("settingsMaxInputCount", "maxInputCount", 100, 5000);
  bindSettingsNumber("settingsMaxConcurrency", "maxConcurrency", 1, 10);
  bindSettingsNumber("settingsUploadConcurrency", "uploadConcurrencyPerAccount", 1, 10);
  bindSettingsNumber("settingsMaxRetries", "maxRetries", 0, 3);
  byId("settingsForcePublicFetchToggle").addEventListener("click", function () {
    toggleSettingsValue("forcePublicFetch", "settingsForcePublicFetchToggle");
  });
  byId("settingsCleanupToggle").addEventListener("click", function () {
    toggleSettingsValue("cleanupLocalAfterSuccess", "settingsCleanupToggle");
  });
  byId("chooseSettingsOutputDirectory").addEventListener("click", function () {
    postCommand("chooseOutputDirectory");
  });
  byId("downloadSettingsSave").addEventListener("click", saveDownloadSettings);
  byId("downloadSettingsModal").addEventListener("click", function (event) {
    if (event.target === this) closeDownloadSettingsModal();
  });
  byId("videoAdaptationConfirmationConfirm").addEventListener("click", function () { closeVideoAdaptationConfirmation(true); });
  byId("videoAdaptationConfirmationCancel").addEventListener("click", function () { closeVideoAdaptationConfirmation(false); });
  byId("videoAdaptationConfirmationClose").addEventListener("click", function () { closeVideoAdaptationConfirmation(false); });
  byId("videoAdaptationConfirmationModal").addEventListener("click", function (event) {
    if (event.target === this) closeVideoAdaptationConfirmation(false);
  });
  byId("autoUploadConfirmationConfirm").addEventListener("click", function () { closeAutoUploadConfirmation(true); });
  byId("autoUploadConfirmationCancel").addEventListener("click", function () { closeAutoUploadConfirmation(false); });
  byId("autoUploadConfirmationModal").addEventListener("click", function (event) {
    if (event.target === this) closeAutoUploadConfirmation(false);
  });
  document.addEventListener("keydown", function (event) {
    if (videoAdaptationConfirmation) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeVideoAdaptationConfirmation(false);
      } else if (event.key === "Tab") {
        event.preventDefault();
        var videoCancel = byId("videoAdaptationConfirmationCancel");
        var videoConfirm = byId("videoAdaptationConfirmationConfirm");
        (document.activeElement === videoCancel ? videoConfirm : videoCancel).focus();
      }
      return;
    }
    if (autoUploadConfirmation) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAutoUploadConfirmation(false);
      } else if (event.key === "Tab") {
        event.preventDefault();
        var cancel = byId("autoUploadConfirmationCancel");
        var confirm = byId("autoUploadConfirmationConfirm");
        (document.activeElement === cancel ? confirm : cancel).focus();
      }
      return;
    }
    if (event.key === "Escape" && !byId("downloadSettingsModal").hidden) {
      event.preventDefault();
      closeDownloadSettingsModal();
      return;
    }
    if (event.key === "Escape" && !byId("backgroundSubmissionModal").hidden) {
      event.preventDefault();
      closeBackgroundSubmission("dismissBackgroundSubmission");
      return;
    }
    if (event.key === "Escape" && !byId("performanceModeMenu").hidden) {
      event.preventDefault();
      closePerformanceModeMenu(true);
    }
  });

  document.addEventListener("click", function (event) {
    var control = byId("performanceModeButton").closest(".performance-mode-control");
    if (control && !control.contains(event.target)) closePerformanceModeMenu(false);
  });

  document.querySelectorAll(".task-filters button").forEach(function (button) {
    button.addEventListener("click", function () {
      activeFilter = button.getAttribute("data-filter") || "all";
      document.querySelectorAll(".task-filters button").forEach(function (candidate) {
        candidate.classList.toggle("active", candidate === button);
      });
      renderTasks();
    });
  });

  initializeTaskActions();
  initializeUiSelects();

  if (window.chrome && window.chrome.webview) {
    window.chrome.webview.addEventListener("message", function (event) {
      var message = event.data || {};
      if (message.type === "state") {
        if (pendingTargetSelection) {
          if (message.uploadTargetSelectionToken !== pendingTargetSelection.token) return;
          pendingTargetSelection = null;
        }
        var planContextChanged =
          (Object.prototype.hasOwnProperty.call(message, "selectedShop") && message.selectedShop !== state.selectedShop) ||
          (Object.prototype.hasOwnProperty.call(message, "selectedDeliveryType") && message.selectedDeliveryType !== state.selectedDeliveryType);
        if (planContextChanged) closeUiSelect(byId("planSelect").closest("[data-ui-select]"), false);
        state = Object.assign({}, state, message);
        acceptLinkInputState(message);
        acceptTitleSettingsState(message);
        render();
      } else if (message.type === "toast") {
        showToast(message.text, message.error === true);
      }
    });
    window.chrome.webview.postMessage({ type: "ready" });
  } else {
    state = Object.assign({}, state, {
      outputDirectory: "C:\\Users\\67676\\Videos\\创爆素材\\一刀不剪",
      shops: ["好物脑洞局"],
      deliveryTypes: ["放量投放", "控成本投放", "乘方投放"],
      plans: ["1.94"],
      selectedShop: "好物脑洞局",
      selectedDeliveryType: "控成本投放",
      selectedPlan: "1.94",
      uploadTargetReady: true,
      uploadAccountReady: true,
      plansSynchronized: true,
      canSelectDeliveryType: true,
      canSelectPlan: true,
      uploadTargetCode: "ready",
      uploadTargetMessage: "千川登录、广告主与目标计划已校验，可开始下载并自动上传。",
      uploadTargetTone: "success",
      uploadSessionStatus: "ready",
      uploadSessionReady: true,
      uploadSessionMessage: "千川登录、广告主与目标计划已校验，可开始下载并自动上传。",
      uploadSessionCheckedAt: "刚刚",
      uploadSessionCanCheck: true,
      autoUpload: true,
      resolverReady: true,
      resolverMessage: "创爆原视频解析服务已接入",
      canStartAutomatic: true,
      workflowStep: 3,
      tasks: [{
        id: "browser-preview",
        title: "负重手环 手脚通用 ~ #负重手环 #负重训…",
        author: "小何财富尖尖jo",
        cover: "",
        status: "UploadCompleted",
        stage: "全部完成",
        shop: "好物脑洞局",
        plan: "鞋子",
        size: "28.8 MB",
        progress: 100,
        progressText: "100%",
        operation: "打开目录",
        canOperate: true,
        error: ""
      }],
      counters: { all: 1, downloading: 0, pending: 0, uploading: 0, completed: 1, failed: 0 },
      canClearFinished: true
    });
  }

  render();
}());
