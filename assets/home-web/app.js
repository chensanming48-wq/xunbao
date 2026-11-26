(function () {
  "use strict";

  var PAGE_SIZE = 6;
  var state = {
    period: "Today",
    account: { name: "软件账号", identifier: "未登录", points: "—", canRecharge: false, membershipActive: false, membershipText: "未激活", membershipPlan: "", membershipExpiresAt: "" },
    metrics: { balance: "—", gmv: "¥0.00", spend: "¥0.00", roi: "—", healthy: 0, total: 0, pending: 0 },
    trend: [], trendEmptyMessage: "同步数据后展示经营趋势", pending: [], stores: [], lastUpdated: "--:--"
  };
  var page = 1;
  var toastTimer = 0;
  var membershipCountdownTimer = 0;
  var activationInProgress = false;
  var activationRequired = false;
  var modalReturnFocus = null;
  var trendChartModel = null;
  var trendHoverIndex = 0;
  var renderedSections = Object.create(null);


  // Technical capability and freshness details belong in diagnostics, not a page-wide banner.
  function updateConsoleCapabilityBanner() {
    var obsolete = document.getElementById('console-freshness-banner');
    if (obsolete) obsolete.remove();
    var banner = document.getElementById('console-capability-banner');
    if (banner) banner.remove();
  }
  function renderChangedSection(key, value, render) {
    var signature = JSON.stringify(value);
    if (renderedSections[key] === signature) return;
    render();
    renderedSections[key] = signature;
  }

  function byId(id) { return document.getElementById(id); }
  function text(id, value) { var el = byId(id); if (el) el.textContent = value == null ? "" : String(value); }
  function post(message) {
    if (window.chrome && window.chrome.webview) window.chrome.webview.postMessage(message);
  }
  function escapeText(value) { return value == null ? "" : String(value); }

  function metricNoteText(value) {
    var note = value == null ? "" : String(value).trim();
    var match = note.match(/^(较(?:昨日同期|昨日|前日|前7天|前30天))(?:·\d+家)?[:：]?\s*/);
    var label = match ? match[1] : "较昨日同期";
    var detail = match ? note.substring(match[0].length).trim() : note;
    return label + ": " + (detail || "暂无可比数据");
  }

  function setMetricNote(id, value, tone) {
    var element = byId(id);
    var note = metricNoteText(value);
    element.textContent = note;
    element.className = note.indexOf("▲") >= 0 ? "positive" :
      note.indexOf("▼") >= 0 ? "negative" :
      tone === "positive" ? "positive" : tone === "negative" ? "negative" : "";
  }

  function updateMembershipStatus() {
    var authorizationSummary = byId("authorizationSummary");
    var authorizationLabel = byId("authorizationLabel");
    var activationStatus = byId("activationStatus");
    if (!activationStatus) return;
    var status = window.QianchuanMembershipStatus.format(state.account || {}, Date.now());
    var activated = status.tone !== "inactive";
    if (authorizationSummary) authorizationSummary.classList.toggle("activated", activated);
    if (authorizationLabel) authorizationLabel.hidden = activated;
    text("activationPlanName", status.planText);
    var remainingText = status.detailText.replace(/^\s*\/\s*/, "");
    if (/^\d+天$/.test(remainingText)) remainingText = "剩余 " + remainingText.replace("天", " 天");
    text("activationStatusDetail", remainingText);
    var detail = byId("activationStatusDetail");
    if (detail) detail.hidden = !status.detailText;
    activationStatus.className = "activation-status " + status.tone + " " + status.planTone;
    activationStatus.title = status.title;
    activationStatus.setAttribute("aria-label", "授权状态：" + status.text + "。" + status.title);
  }

  function ensureMembershipCountdown() {
    if (membershipCountdownTimer) return;
    membershipCountdownTimer = window.setInterval(updateMembershipStatus, 60000);
  }

  function setAccountMenuOpen(open) {
    var button = byId("accountMenuButton");
    var menu = byId("accountDropdown");
    if (!button || !menu) return;
    var expanded = !!open;
    button.setAttribute("aria-expanded", expanded ? "true" : "false");
    menu.hidden = !expanded;
  }

  function renderHeader() {
    var account = state.account || {};
    text("accountName", account.name || "软件账号");
    text("accountId", account.identifier || "未登录");
    text("accountDropdownIdentifier", account.identifier || "未登录");
    text("pointsValue", account.points == null || account.points === "" ? "待同步" : account.points);
    var pointsValue = byId("pointsValue");
    if (pointsValue) pointsValue.title = account.pointsDescription || "";
    updateMembershipStatus();
    ensureMembershipCountdown();
  }

  function renderMetrics() {
    var metric = state.metrics || {};
    text("metricBalance", metric.balance || "—");
    byId("metricBalance").title = metric.balance || "—";
    text("metricBalanceNote", metric.balanceNote || "同步后展示账户余额");
    byId("metricBalanceNote").title = metric.balanceNote || "同步后展示账户余额";
    text("metricGmv", metric.gmv || "¥0.00");
    text("metricSpend", metric.spend || "¥0.00");
    text("metricRoi", metric.roi || "—");
    text("metricHealthy", (metric.healthy || 0) + " / " + (metric.total || 0));
    setMetricNote("metricGmvNote", metric.gmvNote, metric.gmvTone);
    setMetricNote("metricSpendNote", metric.spendNote, metric.spendTone);
    setMetricNote("metricRoiNote", metric.roiNote || "数据不足", metric.roiTone);
    var pending = Number(metric.pending || 0);
    var healthyNote = byId("metricHealthyNote");
    healthyNote.textContent = metric.total ? (pending ? pending + "个店铺待处理" : "全部店铺状态正常") : "暂无店铺";
    healthyNote.className = pending ? "warning" : pending === 0 && metric.total ? "positive" : "";
  }

  function svgNode(name, attributes) {
    var node = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.keys(attributes || {}).forEach(function (key) { node.setAttribute(key, attributes[key]); });
    return node;
  }

  function formatTrendMoney(value) {
    var amount = Number(value || 0);
    if (!isFinite(amount)) amount = 0;
    return "¥" + amount.toLocaleString("zh-CN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function hideTrendTooltip() {
    var tooltip = byId("trendTooltip");
    if (tooltip) {
      tooltip.hidden = true;
      tooltip.setAttribute("aria-hidden", "true");
    }
    if (!trendChartModel) return;
    [trendChartModel.guide, trendChartModel.gmvHover, trendChartModel.spendHover].forEach(function (node) {
      if (node) node.style.display = "none";
    });
  }

  function showTrendTooltip(index) {
    if (!trendChartModel || !trendChartModel.data.length) return;
    index = Math.max(0, Math.min(trendChartModel.data.length - 1, Number(index) || 0));
    trendHoverIndex = index;
    var item = trendChartModel.data[index] || {};
    var gmvPoint = trendChartModel.gmvPoints[index];
    var spendPoint = trendChartModel.spendPoints[index];
    var svg = byId("trendSvg");
    var chart = byId("trendChart");
    var tooltip = byId("trendTooltip");
    if (!gmvPoint || !spendPoint || !svg || !chart || !tooltip) return;

    trendChartModel.guide.setAttribute("x1", gmvPoint.x);
    trendChartModel.guide.setAttribute("x2", gmvPoint.x);
    trendChartModel.guide.style.display = "";
    trendChartModel.gmvHover.setAttribute("cx", gmvPoint.x);
    trendChartModel.gmvHover.setAttribute("cy", gmvPoint.y);
    trendChartModel.gmvHover.style.display = "";
    trendChartModel.spendHover.setAttribute("cx", spendPoint.x);
    trendChartModel.spendHover.setAttribute("cy", spendPoint.y);
    trendChartModel.spendHover.style.display = "";

    text("trendTooltipLabel", item.label || "当前时段");
    text("trendTooltipGmv", formatTrendMoney(item.gmv));
    text("trendTooltipSpend", formatTrendMoney(item.spend));
    tooltip.hidden = false;
    tooltip.setAttribute("aria-hidden", "false");
    tooltip.className = "chart-tooltip";

    var svgRect = svg.getBoundingClientRect();
    var chartRect = chart.getBoundingClientRect();
    var x = svgRect.left - chartRect.left + gmvPoint.x / 760 * svgRect.width;
    var pointY = Math.min(gmvPoint.y, spendPoint.y);
    var y = svgRect.top - chartRect.top + pointY / 205 * svgRect.height;
    var horizontalPadding = 8;
    var tooltipWidth = tooltip.offsetWidth;
    var tooltipHeight = tooltip.offsetHeight;
    if (x - tooltipWidth / 2 < horizontalPadding) tooltip.classList.add("edge-start");
    else if (x + tooltipWidth / 2 > chart.clientWidth - horizontalPadding) tooltip.classList.add("edge-end");
    if (y - tooltipHeight - 12 < 0) {
      tooltip.classList.add("below");
      tooltip.style.top = Math.min(chart.clientHeight - tooltipHeight - 4, y + 12) + "px";
    } else {
      tooltip.style.top = (y - 12) + "px";
    }
    tooltip.style.left = Math.max(horizontalPadding, Math.min(chart.clientWidth - horizontalPadding, x)) + "px";
    chart.setAttribute("aria-label", (item.label || "当前时段") +
      "，成交金额" + formatTrendMoney(item.gmv) +
      "，广告消耗" + formatTrendMoney(item.spend));
  }

  function showTrendTooltipFromPointer(event) {
    if (!trendChartModel || !trendChartModel.data.length) return;
    var svg = byId("trendSvg");
    var rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    var svgX = (event.clientX - rect.left) / rect.width * 760;
    var relative = (svgX - trendChartModel.left) /
      Math.max(1, trendChartModel.right - trendChartModel.left);
    var index = trendChartModel.data.length === 1
      ? 0
      : Math.round(relative * (trendChartModel.data.length - 1));
    showTrendTooltip(index);
  }

  function renderChart() {
    var svg = byId("trendSvg");
    var empty = byId("chartEmpty");
    hideTrendTooltip();
    trendChartModel = null;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var data = Array.isArray(state.trend) ? state.trend : [];
    text("chartEmptyMessage", state.trendEmptyMessage || "同步数据后展示经营趋势");
    if (!data.length) { empty.style.display = "flex"; return; }
    empty.style.display = "none";

    var left = 54, right = 744, top = 12, bottom = 171;
    var values = [];
    data.forEach(function (item) { values.push(Number(item.gmv || 0), Number(item.spend || 0)); });
    var max = Math.max.apply(Math, values.concat([1]));
    for (var row = 0; row <= 4; row++) {
      var y = top + (bottom - top) * row / 4;
      svg.appendChild(svgNode("line", { x1: left, y1: y, x2: right, y2: y, stroke: "#e5ebf4", "stroke-width": "1" }));
      var label = svgNode("text", { x: left - 9, y: y + 4, fill: "#8593aa", "font-size": "11", "text-anchor": "end" });
      label.textContent = formatAxis(max * (4 - row) / 4);
      svg.appendChild(label);
    }

    var width = right - left;
    function pointsFor(field) {
      return data.map(function (item, index) {
        var x = data.length === 1 ? left + width / 2 : left + width * index / (data.length - 1);
        var y = bottom - (bottom - top) * Number(item[field] || 0) / max;
        return { x: x, y: y };
      });
    }
    function pathFrom(points) { return points.map(function (point, index) { return (index ? "L" : "M") + point.x.toFixed(1) + " " + point.y.toFixed(1); }).join(" "); }
    function drawSeries(field, color) {
      var points = pointsFor(field);
      svg.appendChild(svgNode("path", { d: pathFrom(points), fill: "none", stroke: color, "stroke-width": "2.5", "stroke-linecap": "round", "stroke-linejoin": "round" }));
      points.forEach(function (point) { svg.appendChild(svgNode("circle", { cx: point.x, cy: point.y, r: "3.2", fill: "#fff", stroke: color, "stroke-width": "2" })); });
      return points;
    }
    var gmvPoints = drawSeries("gmv", "#2f73ed");
    var spendPoints = drawSeries("spend", "#18b978");

    data.forEach(function (item, index) {
      var x = data.length === 1 ? left + width / 2 : left + width * index / (data.length - 1);
      var label = svgNode("text", { x: x, y: 197, fill: "#7d8da7", "font-size": "11", "text-anchor": "middle" });
      label.textContent = item.label || "";
      svg.appendChild(label);
    });

    var guide = svgNode("line", { y1: top, y2: bottom, stroke: "#9eb6db", "stroke-width": "1", "stroke-dasharray": "3 3" });
    var gmvHover = svgNode("circle", { r: "5", fill: "#fff", stroke: "#2f73ed", "stroke-width": "2.5" });
    var spendHover = svgNode("circle", { r: "5", fill: "#fff", stroke: "#18b978", "stroke-width": "2.5" });
    guide.style.display = gmvHover.style.display = spendHover.style.display = "none";
    guide.style.pointerEvents = gmvHover.style.pointerEvents = spendHover.style.pointerEvents = "none";
    svg.appendChild(guide);
    svg.appendChild(gmvHover);
    svg.appendChild(spendHover);
    trendChartModel = {
      data: data,
      left: left,
      right: right,
      gmvPoints: gmvPoints,
      spendPoints: spendPoints,
      guide: guide,
      gmvHover: gmvHover,
      spendHover: spendHover
    };
  }

  function formatAxis(value) {
    if (value >= 10000) return (value / 10000).toFixed(value >= 100000 ? 0 : 1) + "万";
    if (value >= 1000) return (value / 1000).toFixed(1) + "k";
    if (value >= 10) return Math.round(value).toString();
    return Number(value).toFixed(2);
  }

  function syncTimedOut(shop) { return shop.syncStatus === '同步失败'; }

  function renderPending() {
    var list = byId("pendingList");
    list.innerHTML = "";
    var timeoutStores = (state.stores || []).filter(syncTimedOut);
    var items = (Array.isArray(state.pending) ? state.pending : []).map(function (item) {
      if (!timeoutStores.length || !/^\d+个店铺等待数据同步$/.test(item.text || '')) return item;
      var remaining = Math.max(0, Number(item.count || 0) - timeoutStores.length);
      return Object.assign({}, item, { count: remaining, text: remaining + '个店铺等待数据同步' });
    }).filter(function (item) { return Number(item.count || 0) > 0; });
    items = timeoutStores.map(function (shop) {
      return { count: 1, icon: '!', tone: 'orange', retry: true, key: shop.key,
        text: (shop.name || '未命名店铺') + '同步失败',
        note: '重新同步', detail: '' };
    }).concat(items).slice(0, 3);
    if (!items.length) {
      list.innerHTML = '<div class="all-clear"><span>✓</span><strong>暂无待处理事项</strong></div>';
      return;
    }
    items.forEach(function (item) {
      var row = document.createElement(item.retry ? "button" : "div");
      row.className = "pending-item";
      if (item.retry) {
        row.type = 'button';
        row.classList.add('pending-retry');
        row.title = '重新同步';
        row.disabled = byId('refreshStores').disabled || !item.key;
        row.addEventListener('click', function () { post({ type: 'storeAction', key: item.key }); });
      }
      var tone = item.tone === "orange" ? "orange" : item.tone === "green" ? "green" : "blue";
      row.innerHTML = '<span class="pending-icon ' + tone + '">' + escapeText(item.icon || "!") + '</span>' +
        '<span><strong></strong><small></small></span><span class="pending-arrow">›</span>';
      row.querySelector("strong").textContent = item.text || (item.count + "个店铺待处理");
      row.querySelector("small").textContent = item.note || "请尽快处理，以保证数据连续";
      list.appendChild(row);
    });
  }

  function uniqueValues(items, field) {
    var seen = {};
    return items.map(function (item) { return item[field] || ""; }).filter(function (value) {
      if (!value || seen[value]) return false;
      seen[value] = true; return true;
    });
  }

  function syncSelect(selectId, values, placeholder) {
    var select = byId(selectId);
    var current = select.value;
    var signature = JSON.stringify(values);
    if (select.dataset.optionsSignature === signature) return;
    select.dataset.optionsSignature = signature;
    select.innerHTML = "";
    var first = document.createElement("option"); first.value = ""; first.textContent = placeholder; select.appendChild(first);
    values.forEach(function (value) { var option = document.createElement("option"); option.value = value; option.textContent = value; select.appendChild(option); });
    select.value = values.indexOf(current) >= 0 ? current : "";
    syncFilterSelectUi(select.closest("[data-filter-select]"));
  }

  function filterSelectParts(control) {
    return control ? {
      source: control.querySelector(".filter-select-source"),
      trigger: control.querySelector(".filter-select-trigger"),
      label: control.querySelector(".filter-select-label"),
      menu: control.querySelector(".filter-select-menu")
    } : null;
  }

  function filterSelectOptions(control) {
    var parts = filterSelectParts(control);
    return parts ? Array.prototype.slice.call(parts.menu.querySelectorAll("button[data-value]")) : [];
  }

  function syncFilterSelectUi(control) {
    var parts = filterSelectParts(control);
    if (!parts || !parts.source || !parts.trigger || !parts.label || !parts.menu) return;
    var selectedValue = parts.source.value;
    var selectedOption = Array.prototype.slice.call(parts.source.options).filter(function (option) {
      return option.value === selectedValue;
    })[0] || parts.source.options[0];
    parts.label.textContent = selectedOption ? selectedOption.textContent : "";
    parts.trigger.title = selectedOption ? selectedOption.textContent : "";
    parts.menu.innerHTML = "";
    Array.prototype.forEach.call(parts.source.options, function (sourceOption) {
      var option = document.createElement("button");
      var optionLabel = document.createElement("span");
      var check = document.createElement("span");
      var selected = sourceOption.value === selectedValue;
      option.type = "button";
      option.className = "filter-select-option" + (selected ? " selected" : "");
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", selected ? "true" : "false");
      option.setAttribute("tabindex", "-1");
      option.dataset.value = sourceOption.value;
      optionLabel.textContent = sourceOption.textContent;
      check.className = "filter-select-check";
      check.setAttribute("aria-hidden", "true");
      check.textContent = "✓";
      option.appendChild(optionLabel);
      option.appendChild(check);
      parts.menu.appendChild(option);
    });
  }

  function setFilterSelectOpen(control, open, focusPreference) {
    var parts = filterSelectParts(control);
    if (!parts) return;
    open = !!open;
    if (open) {
      document.querySelectorAll("[data-filter-select].open").forEach(function (other) {
        if (other !== control) setFilterSelectOpen(other, false);
      });
      setAccountMenuOpen(false);
    }
    parts.menu.hidden = !open;
    control.classList.toggle("open", open);
    parts.trigger.setAttribute("aria-expanded", open ? "true" : "false");
    if (!open || !focusPreference) return;
    var options = filterSelectOptions(control);
    if (!options.length) return;
    var target = focusPreference === "last"
      ? options[options.length - 1]
      : options.filter(function (option) { return option.getAttribute("aria-selected") === "true"; })[0] || options[0];
    target.focus();
  }

  function closeFilterSelects(returnFocus) {
    document.querySelectorAll("[data-filter-select].open").forEach(function (control) {
      var parts = filterSelectParts(control);
      setFilterSelectOpen(control, false);
      if (returnFocus && parts) parts.trigger.focus();
    });
  }

  function moveFilterSelectFocus(control, direction) {
    var options = filterSelectOptions(control);
    if (!options.length) return;
    var currentIndex = options.indexOf(document.activeElement);
    var nextIndex = currentIndex < 0 ? 0 : (currentIndex + direction + options.length) % options.length;
    options[nextIndex].focus();
  }

  function chooseFilterSelect(control, value) {
    var parts = filterSelectParts(control);
    if (!parts) return;
    var exists = Array.prototype.some.call(parts.source.options, function (option) { return option.value === value; });
    if (!exists) return;
    var changed = parts.source.value !== value;
    parts.source.value = value;
    syncFilterSelectUi(control);
    setFilterSelectOpen(control, false);
    parts.trigger.focus();
    if (changed) parts.source.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function initializeFilterSelects() {
    document.querySelectorAll("[data-filter-select]").forEach(function (control) {
      var parts = filterSelectParts(control);
      if (!parts) return;
      syncFilterSelectUi(control);
      parts.source.addEventListener("change", function () { syncFilterSelectUi(control); });
      parts.trigger.addEventListener("click", function () { setFilterSelectOpen(control, parts.menu.hidden); });
      parts.trigger.addEventListener("keydown", function (event) {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        setFilterSelectOpen(control, true, event.key === "ArrowUp" ? "last" : "selected");
      });
      parts.menu.addEventListener("click", function (event) {
        var option = event.target.closest("button[data-value]");
        if (option) chooseFilterSelect(control, option.dataset.value || "");
      });
      parts.menu.addEventListener("keydown", function (event) {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          moveFilterSelectFocus(control, event.key === "ArrowDown" ? 1 : -1);
          return;
        }
        if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          var options = filterSelectOptions(control);
          if (options.length) options[event.key === "Home" ? 0 : options.length - 1].focus();
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          var activeOption = event.target.closest("button[data-value]");
          if (!activeOption) return;
          event.preventDefault();
          chooseFilterSelect(control, activeOption.dataset.value || "");
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setFilterSelectOpen(control, false);
          parts.trigger.focus();
        } else if (event.key === "Tab") {
          setFilterSelectOpen(control, false);
        }
      });
    });
  }

  function statusTone(value, kind) {
    var text = String(value || "");
    if (/已掉线/.test(text)) return "bad";
    if (/正常|已同步|成功|完成/.test(text)) return "good";
    if (/失效|失败|未登录|未同步|错误/.test(text)) return "bad";
    if (/登录中|同步中|刷新中|读取中|确认中/.test(text)) return "sync";
    if (/验证|等待|待/.test(text)) return "wait";
    return kind === "login" ? "muted" : "wait";
  }

  function filteredStores() {
    var query = byId("shopSearch").value.trim().toLowerCase();
    var login = byId("loginFilter").value;
    var sync = byId("syncFilter").value;
    return (state.stores || []).filter(function (shop) {
      return (!query || String(shop.name || "").toLowerCase().indexOf(query) >= 0) &&
        (!login || shop.loginStatus === login) && (!sync || shop.syncStatus === sync);
    });
  }

  function renderStores(resetOptions) {
    byId('shopRows').closest('.store-card').classList.toggle('has-sync-timeout', (state.stores || []).some(syncTimedOut));
    var stores = Array.isArray(state.stores) ? state.stores : [];
    if (resetOptions) {
      syncSelect("loginFilter", uniqueValues(stores, "loginStatus"), "登录状态");
      syncSelect("syncFilter", uniqueValues(stores, "syncStatus"), "同步状态");
    }
    var filtered = filteredStores().sort(function(a,b){ return Number(!!b.freshnessStopped)-Number(!!a.freshnessStopped); });
    var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    byId("pagination").closest(".store-card").classList.toggle("has-pages", totalPages > 1);
    if (page > totalPages) page = totalPages;
    var current = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    var body = byId("shopRows");
    var existing = Object.create(null);
    Array.prototype.forEach.call(body.children, function (row) { existing[row.dataset.key] = row; });
    var retained = [];
    current.forEach(function (shop) {
      var key = String(shop.key || shop.name || "");
      var row = existing[key];
      var actionClass = /确认|验证/.test(shop.action || "") ? " confirm" : "";
      if (!row) {
        row = document.createElement("tr");
        row.dataset.key = key;
        row.innerHTML = '<td class="shop-name"></td><td></td><td></td><td></td><td></td>' +
        '<td><span class="status ' + statusTone(shop.loginStatus, "login") + '"></span></td>' +
        '<td><span class="status ' + statusTone(shop.syncStatus, "sync") + '"></span></td>' +
        '<td><button class="row-action' + actionClass + '" type="button"></button></td>';
        row.querySelector("button").addEventListener("click", function () { post({ type: "storeAction", key: row.dataset.key }); });
      }
      retained.push(row);
      var signature = JSON.stringify(shop);
      if (row.dataset.signature === signature) return;
      row.dataset.signature = signature;
      var cells = row.querySelectorAll("td");
      cells[0].textContent = shop.name || "未命名店铺";
      cells[1].textContent = shop.balance || "—";
      cells[1].title = shop.balance || "—";
      cells[2].textContent = shop.gmv || "—";
      cells[3].textContent = shop.spend || "—";
      cells[4].textContent = shop.roi || "—";
      cells[5].querySelector("span").textContent = shop.loginStatus || "未知";
      cells[6].querySelector("span").textContent = shop.syncStatus || "未同步";
      cells[5].querySelector("span").className = "status " + statusTone(shop.loginStatus, "login");
      cells[6].querySelector("span").className = "status " + statusTone(shop.syncStatus, "sync");
      var syncLabel = cells[6].querySelector('span');
      var timeNote = cells[6].querySelector('.sync-cache-time');
      syncLabel.removeAttribute('title');
      if (timeNote) timeNote.remove();
      var action = cells[7].querySelector("button");
      action.className = "row-action" + actionClass;
      action.textContent = shop.action || "打开店铺";
      action.disabled = shop.actionEnabled === false || shop.action === "登录中";
    });
    Array.prototype.slice.call(body.children).forEach(function (row) {
      if (retained.indexOf(row) < 0) body.removeChild(row);
    });
    retained.forEach(function (row, index) {
      if (body.children[index] !== row) body.insertBefore(row, body.children[index] || null);
    });
    byId("tableEmpty").style.display = current.length ? "none" : "grid";
    text("shopCount", "共" + stores.length + "家店铺");
    text("lastUpdated", "最近更新 " + (state.lastUpdated || "--:--"));
    text("pageSummary", filtered.length ? "显示第 " + ((page - 1) * PAGE_SIZE + 1) + "–" + Math.min(page * PAGE_SIZE, filtered.length) + " 家，共 " + filtered.length + " 家" : "每页最多显示 " + PAGE_SIZE + " 家店铺");
    renderPagination(totalPages);
  }

  function renderPagination(totalPages) {
    var host = byId("pagination");
    var signature = page + ":" + totalPages;
    if (host.dataset.signature === signature) return;
    host.dataset.signature = signature;
    host.innerHTML = "";
    if (totalPages <= 1) return;
    function add(label, target, active, disabled) {
      var button = document.createElement("button");
      button.className = "page-button" + (active ? " active" : "");
      button.type = "button"; button.textContent = label; button.disabled = disabled;
      button.addEventListener("click", function () { page = target; renderStores(false); });
      host.appendChild(button);
    }
    add("‹", Math.max(1, page - 1), false, page === 1);
    for (var index = 1; index <= totalPages; index++) add(String(index), index, index === page, false);
    add("›", Math.min(totalPages, page + 1), false, page === totalPages);
  }

  function renderPeriods() {
    document.querySelectorAll(".period").forEach(function (button) { button.classList.toggle("active", button.getAttribute("data-period") === state.period); });
  }

  function renderAll() {
    updateConsoleCapabilityBanner();
    renderChangedSection("header", state.account, renderHeader);
    renderChangedSection("metrics", state.metrics, renderMetrics);
    renderChangedSection("period", state.period, renderPeriods);
    renderChangedSection("trend", [state.period, state.trend, state.trendEmptyMessage], renderChart);
    renderChangedSection("pending", [state.pending, state.stores], renderPending);
    renderStores(true);
  }

  function setBusy(message) {
    var layer = byId("busyLayer");
    var storeSyncMessage = message.operation === "storeSync";
    if (storeSyncMessage || (!message.busy && byId("refreshStores").classList.contains("syncing"))) {
      setStoreSyncInProgress(!!message.busy);
    }
    layer.classList.toggle("visible", !!message.busy && !storeSyncMessage);
    text("busyText", message.text || "正在处理…");
  }

  function setStoreSyncInProgress(syncing) {
    var button = byId("refreshStores");
    button.classList.toggle("syncing", !!syncing);
    button.disabled = !!syncing;
    button.setAttribute("aria-busy", syncing ? "true" : "false");
    document.querySelectorAll('.pending-retry').forEach(function (item) { item.disabled = !!syncing; });
  }

  function showToast(message) {
    var toast = byId("toast");
    toast.textContent = message.text || "";
    toast.className = "toast visible" + (message.error ? " error" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.className = "toast"; }, 3200);
  }

  function setActivationFeedback(message, success) {
    var feedback = byId("activationFeedback");
    feedback.textContent = message || "";
    feedback.classList.toggle("success", success === true);
  }

  function setActivationInProgress(inProgress) {
    activationInProgress = !!inProgress;
    var button = byId("activateNowButton");
    var input = byId("activationCodeInput");
    button.disabled = activationInProgress;
    input.disabled = activationInProgress;
    byId("membershipTab").disabled = activationInProgress;
    byId("computeTab").disabled = activationInProgress;
    button.textContent = activationInProgress ? "正在激活…" : "立即激活";
  }

  function openPurchaseModal(required) {
    activationRequired = activationRequired || required === true;
    var layer = byId("purchaseModal");
    modalReturnFocus = document.activeElement;
    window.QianchuanRechargeCenter.selectTab("membership");
    document.querySelector(".dashboard").setAttribute("inert", "");
    layer.classList.add("open");
    layer.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    post({ type: "purchaseModalVisibility", open: true });
    setActivationFeedback("", false);
    byId("activationCodeInput").closest(".activation-code-field").classList.remove("invalid");
    window.setTimeout(function () { byId("activationCodeInput").focus(); }, 20);
  }

  function closePurchaseModal(explicitClose) {
    if (activationInProgress) return;
    if (activationRequired) {
      if (explicitClose === true) post({ type: "closeRequiredActivation" });
      return;
    }
    var layer = byId("purchaseModal");
    layer.classList.remove("open");
    layer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    document.querySelector(".dashboard").removeAttribute("inert");
    post({ type: "purchaseModalVisibility", open: false });
    if (modalReturnFocus && typeof modalReturnFocus.focus === "function") modalReturnFocus.focus();
  }

  function requestLicenseActivation() {
    if (activationInProgress) return;
    var input = byId("activationCodeInput");
    var field = input.closest(".activation-code-field");
    var code = input.value.trim();
    field.classList.remove("invalid");
    setActivationFeedback("", false);
    if (code.length < 16) {
      field.classList.add("invalid");
      setActivationFeedback("请输入完整激活码（至少 16 位）", false);
      input.focus();
      return;
    }
    if (code.length > 160) {
      field.classList.add("invalid");
      setActivationFeedback("激活码格式不正确，请检查后重试", false);
      input.focus();
      return;
    }
    setActivationInProgress(true);
    post({ type: "activateLicenseCode", code: code });
  }

  function handleLicenseActivationResult(message) {
    setActivationInProgress(false);
    var success = message.success === true && message.membershipActive === true;
    setActivationFeedback(message.message || (success ? "激活成功" : "激活失败，请检查激活码后重试"), success);
    if (success) {
      activationRequired = false;
      if (!state.account) state.account = {};
      state.account.membershipActive = message.membershipActive === true;
      state.account.membershipPlan = message.planName || message.planCode || "";
      state.account.membershipExpiresAt = message.expiresAt || "";
      state.account.membershipText = state.account.membershipActive ? "已激活" : "未激活";
      renderHeader();
      byId("activationCodeInput").value = "";
      window.setTimeout(closePurchaseModal, 850);
      return;
    }
    var field = byId("activationCodeInput").closest(".activation-code-field");
    field.classList.add("invalid");
    byId("activationCodeInput").focus();
    byId("activationCodeInput").select();
  }

  function trapModalFocus(event) {
    if (event.key !== "Tab" || !byId("purchaseModal").classList.contains("open")) return;
    var controls = Array.prototype.slice.call(byId("purchaseModal").querySelectorAll("button:not([disabled]), input:not([disabled])")).filter(function (control) { return control.tabIndex >= 0 && control.getClientRects().length > 0; });
    if (!controls.length) return;
    var first = controls[0];
    var last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  document.querySelectorAll(".period").forEach(function (button) {
    button.addEventListener("click", function () { post({ type: "setPeriod", period: button.getAttribute("data-period") }); });
  });
  byId("refreshStores").addEventListener("click", function () {
    if (this.disabled) return;
    setStoreSyncInProgress(true);
    post({ type: "refresh" });
  });
  byId("accountMenuButton").addEventListener("click", function () {
    setAccountMenuOpen(this.getAttribute("aria-expanded") !== "true");
  });
  byId("accountDropdownPurchase").addEventListener("click", function () {
    setAccountMenuOpen(false);
    byId("accountMenuButton").focus();
    openPurchaseModal();
  });
  byId("purchaseEntryButton").addEventListener("click", openPurchaseModal);
  byId("purchaseModalClose").addEventListener("click", function () { closePurchaseModal(true); });
  byId("purchaseContactSupport").addEventListener("click", function () { post({ type: "contactSupport" }); });
  byId("purchaseModal").addEventListener("click", function (event) { if (event.target === event.currentTarget) closePurchaseModal(); });
  byId("activateNowButton").addEventListener("click", requestLicenseActivation);
  byId("activationCodeInput").addEventListener("input", function () {
    this.closest(".activation-code-field").classList.remove("invalid");
    setActivationFeedback("", false);
  });
  byId("activationCodeInput").addEventListener("keydown", function (event) {
    if (event.key === "Enter") { event.preventDefault(); requestLicenseActivation(); }
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && document.querySelector("[data-filter-select].open")) {
      closeFilterSelects(true);
      return;
    }
    if (event.key === "Escape" && byId("accountMenuButton").getAttribute("aria-expanded") === "true") {
      setAccountMenuOpen(false);
      byId("accountMenuButton").focus();
    }
    if (event.key === "Escape" && byId("purchaseModal").classList.contains("open")) closePurchaseModal();
    trapModalFocus(event);
  });
  document.addEventListener("click", function (event) {
    var wrap = byId("accountMenuWrap");
    if (wrap && !wrap.contains(event.target)) setAccountMenuOpen(false);
    document.querySelectorAll("[data-filter-select].open").forEach(function (control) {
      if (!control.contains(event.target)) setFilterSelectOpen(control, false);
    });
  });
  byId("shopSearch").addEventListener("input", function () { page = 1; renderStores(false); });
  byId("loginFilter").addEventListener("change", function () { page = 1; renderStores(false); });
  byId("syncFilter").addEventListener("change", function () { page = 1; renderStores(false); });
  byId("trendChart").addEventListener("pointermove", showTrendTooltipFromPointer);
  byId("trendChart").addEventListener("pointerleave", hideTrendTooltip);
  byId("trendChart").addEventListener("focus", function () { showTrendTooltip(trendHoverIndex); });
  byId("trendChart").addEventListener("blur", hideTrendTooltip);
  byId("trendChart").addEventListener("keydown", function (event) {
    if (!trendChartModel || !trendChartModel.data.length ||
      (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    showTrendTooltip(trendHoverIndex + (event.key === "ArrowRight" ? 1 : -1));
  });

  if (window.chrome && window.chrome.webview) {
    window.chrome.webview.addEventListener("message", function (event) {
      var message = event.data || {};
      if (message.type === "state") {
        state = message;
        renderAll();
        if (activationRequired && !activationInProgress && state.account && state.account.membershipActive === true) {
          activationRequired = false;
          closePurchaseModal();
        }
      }
      else if (message.type === "openPurchaseModal") openPurchaseModal(message.required === true);
      else if (message.type === "busy") setBusy(message);
      else if (message.type === "toast") showToast(message);
      else if (message.type === "licenseActivationResult") handleLicenseActivationResult(message);
    });
  }

  initializeFilterSelects();
  window.addEventListener("resize", function () { closeFilterSelects(false); });
  renderAll();
  post({ type: "ready" });
}());
