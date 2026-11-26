(function () {
  "use strict";

  var VERSION = 1;
  var bridge = window.chrome && window.chrome.webview ? window.chrome.webview : null;
  var state = {
    metrics: {}, accounts: [], plans: [], actions: [], logs: [],
    selectedAccountKey: "", planPeriod: "今日", lastUpdated: "等待同步",
    planFallbackActive: false, planFallbackDate: "", planFreshnessMessage: "",
    planEmptyMessage: ""
  };
  var accountKind = "all";
  var creatorDetailKey = "";
  var groupByShop=false;
  var officialPreviousTab=null;
  var initialStoreSelectionChecked = false;

  function isUnnamedLoginRecord(account) {
    if (!account || state.pageMode === "alliance" || state.pageMode === "creator-qianchuan") return false;
    if (/^(正常|登录成功)$/.test(text(account.loginStatus, ""))) return false;
    var name = text(account.name, "").trim();
    if (name && !/^(?:(?:账户|千川账户|达人)\d+|未命名(?:店铺|账户)|店铺登录|千川登录|达人登录)$/.test(name)) return false;
    if (text(account.advertiserId, "").trim()) return false;
    return ![account.rawBalance, account.rawGmv, account.rawSpend].some(function (value) { return typeof value === "number" && Number.isFinite(value); });
  }

  function accountFullName(account) {
    if (state.pageMode === "alliance") return text(account && account.name, "未命名账户");
    var id = text(account && account.advertiserId, "").trim();
    var candidates = account && account.isOfficialOnly === true
      ? [account.officialAccountName, account.advertiserName, account.name]
      : [account && account.name, account && account.advertiserName, account && account.officialAccountName];
    var name = candidates.map(function (value) { return text(value, "").trim(); }).find(function (value) {
      return value && value !== id && !/^(?:未命名(?:店铺|账户)|千川账户|名称待同步)$/.test(value);
    });
    return name || "名称待同步";
  }

  function accountNameTitle(account) {
    var id = text(account && account.advertiserId, "").trim();
    return accountFullName(account) + (id ? "\n千川 ID：" + id : "");
  }

  function accountDisplayName(account) {
    if (!isUnnamedLoginRecord(account)) {
      var name = accountFullName(account);
      var id = text(account && account.advertiserId, "").trim();
      var duplicate = state.pageMode !== "alliance" && array(state.accounts).some(function (other) {
        return other.key !== account.key && !isUnnamedLoginRecord(other) && accountFullName(other) === name;
      });
      if (duplicate && id) return name + " · " + id.slice(-4);
      return name;
    }
    return account.accountKind === "creator" ? "达人登录" : account.isQianchuanOnly === true ? "千川登录" : "店铺登录";
  }

  function accountRecordMatches(account) {
    if (state.pageMode === "creator-qianchuan") {
      // advertiserId is emitted by the host only after binding is confirmed.
      // Keep unfinished login records on disk; they are not investment accounts.
      return !!account && account.accountKind !== "creator" &&
        /^(正常|登录成功)$/.test(text(account.loginStatus, "")) &&
        /^\d+$/.test(text(account.advertiserId, "").trim());
    }
    if (state.pageMode === "alliance") return true;
    return !isUnnamedLoginRecord(account);
  }

  function initializeAccountRecordView() {
    if (state.pageMode === "alliance" || state.pageMode === "creator-qianchuan") return;
    var accounts = array(state.accounts);
    if (!accounts.length) return;
    var selected = accounts.find(function (account) { return account.key === state.selectedAccountKey; });
    if (!initialStoreSelectionChecked) {
      initialStoreSelectionChecked = true;
      var firstStore = accounts.find(function (account) { return !isUnnamedLoginRecord(account) && /^(正常|登录成功)$/.test(text(account.loginStatus, "")); });
      if (selected && isUnnamedLoginRecord(selected) && firstStore && bridge)
        selectAccountByExactKey(firstStore.key);
    }
  }


  var allianceLoginFilter = "all";
  var qianchuanPlanFilter = "all";
  var qianchuanPlanPage = 1;
  var qianchuanPlanPageSize = 10;
  var qianchuanScopeKey = "";
  var qianchuanScopeRequest = 0;
  var qianchuanScopePending = false;
  var lastPageMode = "accounts";
  var accountOrderStorageKey = "qianchuan-account-order-v2";
  var accountOrder = loadAccountOrder();


  // Technical capability and freshness details belong in diagnostics, not a page-wide banner.
  function updateConsoleCapabilityBanner() {
    var obsolete = document.getElementById('console-freshness-banner');
    if (obsolete) obsolete.remove();
    var banner = document.getElementById('console-capability-banner');
    if (banner) banner.remove();
  }
  function loadAccountOrder() {
    try {
      var saved = window.localStorage.getItem(accountOrderStorageKey);
      var parsed = JSON.parse(saved || "[]");
      return Array.isArray(parsed) ? parsed.filter(function (key) { return typeof key === "string" && key; }) : [];
    } catch (error) {
      return [];
    }
  }

  function saveAccountOrder() {
    try { window.localStorage.setItem(accountOrderStorageKey, JSON.stringify(accountOrder)); } catch (error) {}
  }

  function accountOrderKey(account) {
    return text(account && account.key, "").trim();
  }

  function isInitialNewAccountCandidate(account) {
    var status = text(account && account.loginStatus, "");
    var action = text(account && account.action, "");
    var name = text(account && account.name, "");
    return /待选择账户|选择账户|选择千川/.test(status + " " + action) || /^千川账户\d+$/.test(name);
  }

  function orderAccounts(accounts) {
    var rows = array(accounts).slice();
    var byKey = Object.create(null);
    var present = Object.create(null);
    var ordered = [];
    var changed = false;
    rows.forEach(function (account) {
      var key = accountOrderKey(account);
      if (!key || byKey[key]) return;
      byKey[key] = account;
    });
    var hasKnownCurrentOrder = accountOrder.some(function (key) { return !!byKey[key]; });
    if (!hasKnownCurrentOrder) {
      rows = rows.filter(function (account) { return !isInitialNewAccountCandidate(account); })
        .concat(rows.filter(isInitialNewAccountCandidate));
    }
    // Creator and single-account views contain only a subset. Keep the saved
    // positions of other stores until the complete account-management snapshot.
    var completeScope = !state.pageMode || state.pageMode === "accounts";
    accountOrder = accountOrder.filter(function (key) {
      if (!byKey[key]) return !completeScope;
      if (present[key]) return false;
      present[key] = true;
      ordered.push(byKey[key]);
      return true;
    });
    rows.forEach(function (account) {
      var key = accountOrderKey(account);
      if (!key || present[key]) return;
      present[key] = true;
      accountOrder.push(key);
      ordered.push(account);
      changed = true;
    });
    if (changed) saveAccountOrder();
    return ordered.concat(rows.filter(function (account) { return !accountOrderKey(account); }));
  }
  function kindMatches(account) {
    if (state.pageMode === "creator-qianchuan" && !accountRecordMatches(account)) return false;
    return accountKind === "all" || (account.accountKind || "merchant") === accountKind;
  }
  function selectedInScope() {
    return array(state.accounts).some(function (a) { return a.key === state.selectedAccountKey && kindMatches(a); });
  }
  function qianchuanPlanMatchesFilter(plan, filter) {
    var status = text(plan && plan.deliveryStatus, "");
    var profit = text(plan && plan.profitStatus, "");
    // Delivery state and profit are independent: a paused plan can also be a loss.
    var paused = !!plan && plan.deliveryEnabled === false || /暂停/.test(status);
    var running = !!plan && plan.deliveryEnabled === true || /投放中|已开启/.test(status);
    if (filter === "all") return true;
    if (filter === "paused") return paused;
    if (filter === "running") return running;
    if (filter === "roi-error") return /异常|亏损/.test(profit + " " + status);
    return !paused && !running;
  }
  function scopedMetrics() {
    if (state.pageMode === "creator-qianchuan") return creatorQianchuanMetrics();
    if (accountKind === "all") return state.metrics || {};
    var scoped = array(state.accounts).filter(kindMatches);
    if (state.pageMode === "creator-qianchuan" && qianchuanScopeKey)
      scoped = scoped.filter(function (account) { return account.key === qianchuanScopeKey; });
    var valid = scoped.filter(function (a) { return Number.isFinite(a.rawSpend) && Number.isFinite(a.rawGmv); });
    var balanceRows = scoped.filter(function (a) { return Number.isFinite(a.rawBalance); });
    var spend = valid.reduce(function (v,a) { return v + a.rawSpend; },0);
    var gmv = valid.reduce(function (v,a) { return v + a.rawGmv; },0);
    var profitPlans = 0;
    var lossPlans = 0;
    scoped.forEach(function (account) {
      var planStatus = text(account.planStatus, "");
      var match = planStatus.match(/(\d+)\s*个盈利\s*[\/／]\s*(\d+)\s*个亏损/);
      if (match) { profitPlans += Number(match[1]); lossPlans += Number(match[2]); }
    });
    var pending = scoped.filter(function (account) { return /待处理|需要|已掉线|未登录|登录失败|待确认/.test(text(account.loginStatus, "")); }).length;
    function money(n) { return "¥" + n.toLocaleString("zh-CN", {minimumFractionDigits:2,maximumFractionDigits:2}); }
    var normalCount = scoped.filter(function (a) { return /^(正常|登录成功)$/.test(a.loginStatus); }).length;
    return { accountCount: String(scoped.length), spend:valid.length ? money(spend) : "—", gmv:valid.length ? money(gmv) : "—",
      roi:spend > 0 ? (gmv / spend).toFixed(2) : "—",
      balance:balanceRows.length ? money(balanceRows.reduce(function (v,a) { return v+a.rawBalance; },0)) : "—",
      normal:normalCount + " / " + scoped.length, normalCount: String(normalCount),
      normalCountNote: scoped.length ? "占比 " + (normalCount / scoped.length * 100).toFixed(1) + "%" : "暂无账户",
      profitPlans: String(profitPlans), lossPlans: String(lossPlans), pending: String(pending) };
  }
  function creatorQianchuanPlans() {
    // The host provides the current account's plan snapshot, never an all-account list.
    // Do not attach a stale snapshot to an unverified/newly selected account.
    return selectedInScope() ? array(state.plans).filter(function (plan) {
      return !plan.accountKey || plan.accountKey === state.selectedAccountKey;
    }) : [];
  }
  function creatorQianchuanMetrics() {
    var accounts = array(state.accounts).filter(kindMatches);
    var plans = creatorQianchuanPlans();
    var metrics = {accountCount:String(accounts.length), normalCount:String(accounts.length),
      profitPlans:String(plans.filter(function (plan) { return plan.profitStatus === "盈利"; }).length),
      lossPlans:String(plans.filter(function (plan) { return qianchuanPlanMatchesFilter(plan, "roi-error"); }).length),
      pending:String(plans.filter(function (plan) { return qianchuanPlanMatchesFilter(plan, "other"); }).length)};
    function sum(field) {
      if (!plans.length) return "—";
      var values = plans.map(function (plan) { return moneySortValue(plan[field]); });
      return values.some(function (value) { return value === null; }) ? "—" :
        values.reduce(function (total, value) { return total + value; }, 0).toLocaleString("zh-CN", {minimumFractionDigits:2,maximumFractionDigits:2});
    }
    metrics.spend = sum("spend"); metrics.gmv = sum("netGmv");
    var spend = moneySortValue(metrics.spend), netGmv = moneySortValue(metrics.gmv);
    metrics.roi = spend > 0 && netGmv !== null ? (netGmv / spend).toFixed(2) : "—";
    return metrics;
  }
  function renderCreatorControls() {
    var mode = state.pageMode || "accounts";
    if (mode !== lastPageMode) {
      creatorDetailKey = "";
      accountKind = mode === "alliance" ? "creator" : mode === "creator-qianchuan" ? "merchant" : "all";
      allianceLoginFilter = "all";
      qianchuanPlanFilter = "all";
      qianchuanPlanPage = 1;
      qianchuanScopeKey = "";
      qianchuanScopePending = false;
      qianchuanScopeRequest++;
      if (mode === "creator-qianchuan") activeTab = "plans";
      lastPageMode = mode;
    }
    var alliance = mode === "alliance";
    var qianchuanPage = mode === "creator-qianchuan";
    document.body.classList.toggle("alliance-mode", alliance);
    document.body.classList.toggle("creator-qianchuan-mode", qianchuanPage);
    document.body.classList.toggle("shunbao-account-layout", !alliance && !qianchuanPage &&
      !!window.desktopBrand && window.desktopBrand.id === "shunbao");
    var accountTabs = document.querySelector(".account-kind-tabs");
    var accountToolbar = document.querySelector(".account-toolbar");
    var headerActions = document.querySelector(".native-header-actions");
    var accountFilterControls = document.querySelector(".account-filter-controls");
    var accountSearchInput = document.getElementById("account-search");
    var accountControls = [accountSearchInput ? accountSearchInput.closest(".native-search") : null,
      document.getElementById("login-filter-control")];
    if (alliance) accountControls.forEach(function (control) { if (control) accountToolbar.appendChild(control); });
    else if (accountFilterControls) accountControls.forEach(function (control) { if (control) accountFilterControls.appendChild(control); });
    var syncButton = document.getElementById("sync-all");
    if ((alliance || qianchuanPage) && headerActions && syncButton) headerActions.insertBefore(syncButton, document.getElementById("qianchuan-period-switch"));
    else if (accountFilterControls && syncButton) accountFilterControls.appendChild(syncButton);
    var allianceHint = document.getElementById("alliance-inline-hint");
    if (allianceHint) allianceHint.hidden = !alliance;
    var betaBadge = document.getElementById("creator-alliance-beta");
    var pageTitle = document.querySelector(".native-header h1");
    if (betaBadge) betaBadge.hidden = !alliance;
    if (pageTitle) {
      pageTitle.textContent = alliance ? "账号管理" : qianchuanPage ? "千川投放" : "千川账户";
      if (betaBadge) pageTitle.appendChild(betaBadge);
    }
    document.querySelector(".native-header p").textContent = alliance
      ? "管理达人账号与自动读取的千川账户"
      : qianchuanPage
        ? "管理千川账户、投放计划与目标 ROI"
        : "统一查看商家与达人账户数据，选择账户管理投放计划";
    if (nodes.overviewTitle) nodes.overviewTitle.textContent = alliance ? "达人账号汇总数据" : qianchuanPage ? "千川投放概览" : "投放账户概览";
    if (nodes.accountSectionHeading) nodes.accountSectionHeading.textContent = alliance ? "达人账号列表" : qianchuanPage ? "千川账户列表" : "千川账户管理";
    var accountSectionSubtitle = document.getElementById("account-section-subtitle");
    if (accountSectionSubtitle) accountSectionSubtitle.textContent = alliance
      ? "查看达人经营数据与自动读取的千川账户"
      : "选择账户，查看经营数据与同步状态";
    var diagnosisTitle = document.querySelector(".diagnosis-title-group h2");
    if (diagnosisTitle) diagnosisTitle.textContent = qianchuanPage ? "投放计划" : "当前账户投放计划";
    var qianchuanControls = document.getElementById("qianchuan-plan-controls");
    if (qianchuanControls) qianchuanControls.hidden = !qianchuanPage;
    var accountNameHeading = document.getElementById("account-name-heading");
    var accountLoginHeading = document.getElementById("account-login-heading");
    var accountBalanceHeading = document.getElementById("account-balance-heading");
    var accountPlanHeading = document.getElementById("account-plan-heading");
    if (accountNameHeading) accountNameHeading.textContent = alliance ? "达人账号" : "账户名称";
    if (accountLoginHeading) accountLoginHeading.textContent = alliance ? "抖音号" : "登录状态";
    if (accountBalanceHeading) accountBalanceHeading.textContent = alliance ? "登录状态" : "账户余额";
    var accountGmvHeading = document.getElementById("account-gmv-heading");
    var accountSpendHeading = document.getElementById("account-spend-heading");
    var accountRoiHeading = document.getElementById("account-roi-heading");
    var accountExtraHeading = document.getElementById("account-extra-heading");
    if (accountGmvHeading) accountGmvHeading.querySelector(".sort-label")
      ? accountGmvHeading.querySelector(".sort-label").textContent = alliance ? "同步状态" : "今日成交额"
      : accountGmvHeading.textContent = alliance ? "同步状态" : "今日成交额";
    if (accountSpendHeading) accountSpendHeading.querySelector(".sort-label")
      ? accountSpendHeading.querySelector(".sort-label").textContent = alliance ? "成交金额" : "今日消耗"
      : accountSpendHeading.textContent = alliance ? "成交金额" : "今日消耗";
    if (accountRoiHeading) accountRoiHeading.textContent = alliance ? "订单量" : "ROI";
    if (accountExtraHeading) accountExtraHeading.textContent = alliance ? "佣金收入" : "—";
    var accountHeaderRow = document.querySelector(".account-table thead tr");
    if (accountHeaderRow) {
      if (alliance && !accountExtraHeading) {
        accountExtraHeading = document.createElement("th");
        accountExtraHeading.id = "account-extra-heading";
        accountExtraHeading.textContent = "佣金收入";
        accountHeaderRow.insertBefore(accountExtraHeading, accountHeaderRow.lastElementChild);
      } else if (!alliance && accountExtraHeading) {
        accountExtraHeading.remove();
        accountExtraHeading = null;
      }
    }
    if (accountPlanHeading) accountPlanHeading.textContent = alliance ? "成交人数" : "计划状态";
    document.querySelectorAll('[data-sort-key="gmv"] .sort-label').forEach(function (label) {
      label.textContent = alliance ? "同步状态" : "今日成交额";
    });
    document.querySelectorAll('[data-sort-key="spend"] .sort-label').forEach(function (label) {
      label.textContent = alliance ? "成交金额" : "今日消耗";
    });
    var creatorAccounts = array(state.accounts).filter(function (a) { return a.accountKind === "creator"; });
    var loggedInCreators = creatorAccounts.filter(function (a) { return CreatorBuyinSummary.loginState(a) === "valid"; }).length;
    var abnormalCreators = creatorAccounts.filter(function (a) { return CreatorBuyinSummary.loginPresentation(a).abnormal; }).length;
    document.querySelectorAll("[data-account-kind]").forEach(function (button) {
      var kind = button.dataset.accountKind;
      var label;
      var count;
      var pressed;
      if (alliance) {
        label = kind === "all" ? "全部达人" : kind === "merchant" ? "已登录" : "登录异常";
        count = kind === "all" ? creatorAccounts.length : kind === "merchant" ? loggedInCreators : abnormalCreators;
        pressed = (kind === "all" ? "all" : kind === "merchant" ? "normal" : "error") === allianceLoginFilter;
      } else {
        label = kind === "all" ? "全部账户" : kind === "merchant" ? "商家账户" : "达人账户";
        count = array(state.accounts).filter(accountRecordMatches).filter(function (a) { return kind === "all" || (a.accountKind || "merchant") === kind; }).length;
        pressed = kind === accountKind;
      }
      var labelNode = Array.prototype.filter.call(button.childNodes, function (child) { return child.nodeType === 3; })[0];
      if (labelNode) labelNode.nodeValue = label + " ";
      button.setAttribute("aria-pressed", String(pressed));
      button.querySelector("span").textContent = count;
    });
    var creator = array(state.accounts).find(function (a) { return a.key === state.selectedAccountKey && a.accountKind === "creator" && kindMatches(a); });
    document.getElementById("creator-actions").hidden = alliance || accountKind !== "creator";
    document.getElementById("creator-selected").textContent = creator ? creator.name : "请先选择一个达人账户";
    ["creator-buyin","creator-compass","creator-qianchuan"].forEach(function (id) { document.getElementById(id).disabled = !creator; });
    var creatorQianchuanButton = document.getElementById("creator-qianchuan");
    if (creatorQianchuanButton) creatorQianchuanButton.textContent = "打开千川";
    var qianchuanLoginButton = document.getElementById("add-qianchuan-account");
    if (qianchuanLoginButton) {
      qianchuanLoginButton.hidden = false;
      (qianchuanLoginButton.querySelector(".login-entry-title") || qianchuanLoginButton).textContent = alliance || qianchuanPage ? "登录千川账户" : "登录千川";
      qianchuanLoginButton.classList.toggle("primary", !alliance);
    }
    var creatorLoginButton = document.getElementById("add-creator-account");
    if (creatorLoginButton) {
      (creatorLoginButton.querySelector(".login-entry-title") || creatorLoginButton).textContent = alliance ? "登录达人账号" : "登录达人";
      creatorLoginButton.classList.toggle("primary", alliance);
    }
    var addAccountButton = document.getElementById("add-account");
    if (addAccountButton) addAccountButton.hidden = alliance || qianchuanPage;
    var officialEntry = document.getElementById("official-authorize");
    // Browser login stays first; optional future official entry stays after creator login.
    renderQianchuanScope();
    var syncLabel = document.getElementById("sync-all-label");
    if (syncLabel) syncLabel.textContent = alliance || qianchuanPage ? "同步数据" : "同步全部";
    var hint = document.getElementById("qianchuan-hint");
    if (hint) hint.hidden = !qianchuanPage;
    var statusStrip = document.getElementById("qianchuan-status-strip");
    if (statusStrip) statusStrip.hidden = !qianchuanPage;
    var planStatusTabs = document.getElementById("qianchuan-plan-tabs");
    if (planStatusTabs) {
      planStatusTabs.hidden = !qianchuanPage;
      var qianchuanPlans = creatorQianchuanPlans();
      Array.prototype.forEach.call(planStatusTabs.querySelectorAll("button[data-qianchuan-plan-filter]"), function (button) {
        var filter = button.dataset.qianchuanPlanFilter;
        var count = qianchuanPlans.filter(function (plan) { return qianchuanPlanMatchesFilter(plan, filter); }).length;
        button.setAttribute("aria-selected", String(filter === qianchuanPlanFilter));
        button.querySelector("strong").textContent = String(count);
      });
    }
    var statusValues = qianchuanPage ? scopedMetrics() : {};
    var profitCount = document.getElementById("qianchuan-profit-count");
    var lossCount = document.getElementById("qianchuan-loss-count");
    var pendingCount = document.getElementById("qianchuan-pending-count");
    if (profitCount) profitCount.textContent = text(statusValues.profitPlans, "0");
    if (lossCount) lossCount.textContent = text(statusValues.lossPlans, "0");
    if (pendingCount) pendingCount.textContent = text(statusValues.pending, "0");
    document.querySelector(".diagnosis-card").classList.toggle("no-account-in-scope", !qianchuanPage && !selectedInScope());
  }
  var activeTab = "plans";
  var tableSort = {
    accounts: { key: "", direction: "desc" },
    plans: { key: "spend", direction: "desc" }
  };
  var targetRoiEditKey = "";
  var targetRoiEditDraft = "";
  var targetRoiEditOriginal = "";
  var targetRoiSubmittingKey = "";
  var targetRoiSubmittingValue = "";
  var deliveryPending = null;
  var deleteMode = false;
  var deleteSelected = new Set();
  var deleteContext = "";
  var deletePending = null;
  var deleteReview = null;
  var suppressTargetRoiBlur = false;
  var contextAccountKey = "";
  var requestSequence = 0;
  var pendingRequests = Object.create(null);
  var inFlightCommands = Object.create(null);
  var renderedSections = Object.create(null);

  function renderChangedSection(key, value, renderSection) {
    var signature = JSON.stringify(value);
    if (renderedSections[key] === signature) return;
    renderSection();
    renderedSections[key] = signature;
  }

  // Only layout preferences; never alter account/plan data on a resize.
  var responsiveChoices = { overview: null, accounts: null };
  var floatingMenuFrame = 0;
  function updateCompactSections() {
    var shortWindow = window.innerHeight <= 760;
    ["overview", "accounts"].forEach(function (name) {
      var card = document.getElementById(name === "overview" ? "overview-card" : "account-card");
      var button = document.getElementById(name === "overview" ? "toggle-overview" : "toggle-accounts");
      var defaultCollapsed = window.innerHeight <= (name === "overview" ? 660 : 560);
      var collapsed = shortWindow && (responsiveChoices[name] === null ? defaultCollapsed : responsiveChoices[name]);
      card.dataset.collapsed = collapsed ? "true" : "false";
      button.setAttribute("aria-expanded", collapsed ? "false" : "true");
      button.textContent = (collapsed ? "展开" : "收起") + (name === "overview" ? "概览" : "店铺");
    });
  }

  function placeFloatingMenu(menu, trigger, preferredWidth) {
    if (!menu || menu.hidden || !trigger) return;
    var rect = trigger.getBoundingClientRect();
    var width = Math.min(Math.max(rect.width, preferredWidth || 190), window.innerWidth - 16);
    var below = Math.max(0, window.innerHeight - rect.bottom - 14);
    var above = Math.max(0, rect.top - 14);
    var useAbove = below < 180 && above > below;
    var room = Math.max(32, useAbove ? above : below);
    menu.style.width = width + "px";
    menu.style.minWidth = "0";
    menu.style.maxHeight = Math.min(238, room) + "px";
    menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) + "px";
    menu.style.top = (useAbove ? Math.max(8, rect.top - menu.getBoundingClientRect().height - 6) : rect.bottom + 6) + "px";
  }

  function refreshFloatingMenus() {

    document.querySelectorAll("[data-custom-select].open").forEach(function (control) {
      var parts = customSelectParts(control);
      var rect = parts.trigger.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) { setCustomSelectOpen(control, false); return; }
      placeFloatingMenu(parts.menu, parts.trigger, 200);
    });
    if (!nodes.accountPicker.hidden) {
      var storeRect = nodes.selectedAccountTrigger.getBoundingClientRect();
      if (storeRect.bottom <= 0 || storeRect.top >= window.innerHeight) setAccountPickerOpen(false);
      else placeFloatingMenu(nodes.accountPicker, nodes.selectedAccountTrigger, 300);
    }
    if (nodes.moreMenu.open) {
      var summary = nodes.moreMenu.querySelector("summary");
      var summaryRect = summary.getBoundingClientRect();
      if (summaryRect.bottom <= 0 || summaryRect.top >= window.innerHeight) nodes.moreMenu.open = false;
      else placeFloatingMenu(nodes.moreMenu.querySelector(".more-menu-list"), summary, 180);
    }
  }

  function queueFloatingMenus() {
    if (floatingMenuFrame) return;
    floatingMenuFrame = window.requestAnimationFrame(function () { floatingMenuFrame = 0; refreshFloatingMenus(); });
  }

  var nodes = {
    app: document.getElementById("app"),
    metrics: document.getElementById("metrics"),
    allianceMetrics: document.getElementById("alliance-metrics"),
    creatorMetrics: document.getElementById("creator-metrics"),
    qianchuanMetrics: document.getElementById("qianchuan-metrics"),
    overviewTitle: document.getElementById("overview-title"),
    overviewAccountCount: document.getElementById("overview-account-count"),
    accountSectionHeading: document.getElementById("account-section-heading"),
    lastUpdated: document.getElementById("last-updated"),
    accountSearch: document.getElementById("account-search"),
    loginFilter: document.getElementById("login-filter"),
    loginFilterControl: document.getElementById("login-filter-control"),
    loginFilterTrigger: document.getElementById("login-filter-trigger"),
    loginFilterLabel: document.getElementById("login-filter-label"),
    loginFilterMenu: document.getElementById("login-filter-menu"),
    accountRows: document.getElementById("account-rows"),
    accountEmpty: document.getElementById("account-empty"),
    storeSelector: document.getElementById("store-selector"),
    selectedAccountTrigger: document.getElementById("selected-account-trigger"),
    accountPicker: document.getElementById("account-picker"),
    selectedAccountName: document.getElementById("selected-account-name"),
    selectedAccountStatus: document.getElementById("selected-account-status"),
    syncSelected: document.getElementById("sync-selected"),
    openSelected: document.getElementById("open-selected"),
    planTools: document.getElementById("plan-tools"),
    planSearch: document.getElementById("plan-search"),
    planTypeFilter: document.getElementById("plan-type-filter"),
    periodSwitch: document.getElementById("period-switch"),
    qianchuanPeriodSwitch: document.getElementById("qianchuan-period-switch"),
    plansPanel: document.getElementById("plans-panel"),
    actionsPanel: document.getElementById("actions-panel"),
    logsPanel: document.getElementById("logs-panel"),
    planRows: document.getElementById("plan-rows"),
    planEmpty: document.getElementById("plan-empty"),
    planEmptyMessage: document.getElementById("plan-empty-message"),
    planFreshness: document.getElementById("plan-freshness"),
    actionRows: document.getElementById("action-rows"),
    actionEmpty: document.getElementById("action-empty"),
    runLogs: document.getElementById("run-logs"),
    moreMenu: document.getElementById("more-menu"),
    accountContextMenu: document.getElementById("account-context-menu"),
    contextAccountName: document.getElementById("context-account-name"),
    deleteAccountAction: document.getElementById("delete-account-action"),
    busyOverlay: document.getElementById("busy-overlay"),
    busyText: document.getElementById("busy-text"),
    toastRegion: document.getElementById("toast-region"),
    bridgeStatus: document.getElementById("bridge-status")
  };

  var metricDefinitions = [
    { key: "balance", label: "账户总余额", icon: "wallet", color: "#3f7cf1", soft: "#eaf2ff", note: "已同步账户余额" },
    { key: "gmv", label: "今日成交额", icon: "coins", color: "#12a85a", soft: "#e9f8ef", note: "仅汇总今日支付成交额" },
    { key: "spend", label: "今日总消耗", icon: "megaphone", color: "#3f7cf1", soft: "#eaf2ff", note: "仅汇总今日有效数据" },
    { key: "todayProfit", label: "今日盈利", icon: "profit", color: "#12a85a", soft: "#e9f8ef", valueColor: "#12a85a", note: "预估值，仅供参考" },
    { key: "roi", label: "综合ROI", icon: "gauge", color: "#7c55f5", soft: "#f0ebff", note: "支付成交额 ÷ 消耗" },
    { key: "normal", label: "正常账户", icon: "store", color: "#12a85a", soft: "#e9f8ef", note: "登录状态正常" },
    { key: "profitPlans", label: "盈利计划", icon: "trendUp", color: "#12a85a", soft: "#e9f8ef", valueColor: "#12a85a", note: "高于保本ROI" },
    { key: "lossPlans", label: "亏损计划", icon: "trendDown", color: "#f04438", soft: "#fff0ed", valueColor: "#ea580c", note: "低于保本ROI" }
  ];

  var creatorMetricDefinitions = [
    { key: "accountCount", label: "达人账号", icon: "users", asset: "team-fill.svg", color: "#0863ff", soft: "#e3efff", note: "已接入达人账号" },
    { key: "normalCount", label: "已登录", icon: "shield", asset: "shield-check-fill.svg", color: "#10b56a", soft: "#e3f7ee", note: "登录状态正常" },
    { key: "gmv", label: "成交金额", icon: "coins", asset: "database-2-fill.svg", color: "#10b56a", soft: "#e3f7ee", note: "已同步有效成交额" },
    { key: "orders", label: "订单量", icon: "trendUp", asset: "line-chart-fill.svg", color: "#8b4dff", soft: "#f0e9ff", note: "已同步有效订单" },
    { key: "customers", label: "成交人数", icon: "store", asset: "store-2-fill.svg", color: "#ff7900", soft: "#fff0e1", note: "待接口同步" },
    { key: "commission", label: "佣金收入", icon: "profit", asset: "coins-fill.svg", color: "#ff7900", soft: "#fff0e1", note: "待接口同步" }
  ];

  var creatorQianchuanMetricDefinitions = [
    { key: "balance", label: "账户余额", icon: "wallet", color: "#3f7cf1", soft: "#eaf2ff", note: "已同步千川余额" },
    { key: "gmv", label: "今日成交额", icon: "coins", color: "#12a85a", soft: "#e9f8ef", note: "已绑定账户有效成交额" },
    { key: "spend", label: "今日消耗", icon: "megaphone", color: "#f97316", soft: "#fff2e8", note: "已绑定账户有效消耗" },
    { key: "roi", label: "综合ROI", icon: "gauge", color: "#7c55f5", soft: "#f0ebff", note: "总成交额 ÷ 总消耗" },
    { key: "profitPlans", label: "盈利计划", icon: "trendUp", color: "#12a85a", soft: "#e9f8ef", valueColor: "#12a85a", note: "高于保本ROI" },
    { key: "lossPlans", label: "投流异常", icon: "trendDown", color: "#f04438", soft: "#fff0ed", valueColor: "#ea580c", note: "亏损或数据异常计划" }
  ];

  var qianchuanMetricDefinitions = [
    { key: "accountCount", label: "千川账户", icon: "store", color: "#3f7cf1", soft: "#eaf2ff", note: "账户总数" },
    { key: "normalCount", label: "已登录", icon: "shield", color: "#12a85a", soft: "#e9f8ef", note: "可正常读取投放数据" },
    { key: "spend", label: "计划消耗", icon: "megaphone", color: "#f97316", soft: "#fff2e8", note: "当前账户、所选周期的已加载计划" },
    { key: "gmv", label: "计划净成交额", icon: "coins", color: "#12a85a", soft: "#e9f8ef", note: "当前账户、所选周期的已加载计划" },
    { key: "roi", label: "净成交 ROI", icon: "gauge", color: "#7c55f5", soft: "#f0ebff", note: "同一份计划的净成交额 ÷ 消耗" }
  ];

  var metricIconMarkup = {
    wallet: '<path d="M4 7.5h14a2 2 0 0 1 2 2v8.5H5.5A2.5 2.5 0 0 1 3 15.5v-9A2.5 2.5 0 0 1 5.5 4H17v3.5"></path><path d="M15 11h5v4h-5a2 2 0 0 1 0-4Z"></path><circle cx="16.5" cy="13" r=".7"></circle>',
    coins: '<ellipse cx="12" cy="6" rx="6.5" ry="2.7"></ellipse><path d="M5.5 6v4c0 1.5 2.9 2.7 6.5 2.7s6.5-1.2 6.5-2.7V6"></path><path d="M5.5 10v4c0 1.5 2.9 2.7 6.5 2.7s6.5-1.2 6.5-2.7v-4"></path><path d="M5.5 14v3.5c0 1.5 2.9 2.7 6.5 2.7s6.5-1.2 6.5-2.7V14"></path>',
    megaphone: '<path d="M4 10h4l10-4v12L8 14H4v-4Z"></path><path d="M8 14l1.5 5h3L11 15"></path><path d="M20 9.5a4 4 0 0 1 0 5"></path>',
    profit: '<ellipse cx="8" cy="16.5" rx="4.5" ry="1.8"></ellipse><path d="M3.5 16.5V20c0 1 2 1.8 4.5 1.8s4.5-.8 4.5-1.8v-3.5"></path><path d="m11 14 4-4 2.5 2.5L21 8"></path><path d="M17 8h4v4"></path>',
    gauge: '<path d="M4 18a8.5 8.5 0 1 1 16 0"></path><path d="M12 12l4-3"></path><circle cx="12" cy="12" r="1.2"></circle><path d="M6.5 16h11"></path>',
    users: '<circle cx="9" cy="8" r="3"></circle><path d="M3.5 19a5.5 5.5 0 0 1 11 0"></path><circle cx="16.5" cy="9" r="2.5"></circle><path d="M14.5 19a4.5 4.5 0 0 1 6-4.2"></path>',
    store: '<path d="M4 10h16l-1.5-5h-13L4 10Z"></path><path d="M5.5 10v9h13v-9"></path><path d="M9 19v-5h6v5"></path><path d="M7.5 10v2M12 10v2M16.5 10v2"></path>',
    trendUp: '<path d="M4 20V5M4 20h16"></path><path d="m7 16 4-4 3 2 6-7"></path><path d="M16 7h4v4"></path>',
    trendDown: '<path d="M4 4v15M4 19h16"></path><path d="m7 8 4 4 3-2 6 7"></path><path d="M16 17h4v-4"></path>',
    shield: '<path d="M12 3 19 6v5c0 4.7-2.8 8.1-7 10-4.2-1.9-7-5.3-7-10V6l7-3Z"></path><path d="m8.5 12 2.3 2.3 4.7-5"></path>',
    alert: '<path d="M12 3 21 19H3L12 3Z"></path><path d="M12 9v4"></path><path d="M12 16h.01"></path>',
    link: '<path d="M10 13.5 14 9.5"></path><path d="M7.5 16.5 5.8 18.2a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0"></path><path d="m16.5 7.5 1.7-1.7a3.5 3.5 0 0 1 5 5l-3 3a3.5 3.5 0 0 1-5 0"></path>'
  };

  function text(value, fallback) {
    if (value === null || value === undefined || value === "") return fallback === undefined ? "—" : fallback;
    return String(value);
  }

  function array(value) { return Array.isArray(value) ? value : []; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function moneySortValue(value) {
    var normalized = text(value, "").replace(/[¥￥,，\s]/g, "");
    if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
    var numeric = Number(normalized);
    return isFinite(numeric) ? numeric : null;
  }

  function sortTableRows(rows, table) {
    var sort = tableSort[table];
    if (!sort.key && table === "accounts" && state.pageMode !== "alliance") {
      return rows.map(function(row,index){return {row:row,index:index,s:moneySortValue(row.spend),b:moneySortValue(row.balance)};}).sort(function(a,b){
        var az=a.s===0&&a.b===0,bz=b.s===0&&b.b===0;
        if(az!==bz)return az?1:-1;
        return (b.s===null?-1:b.s)-(a.s===null?-1:a.s) || (b.b===null?-1:b.b)-(a.b===null?-1:a.b) || a.index-b.index;
      }).map(function(item){return item.row;});
    }
    if (!sort.key) return rows;
    return rows.map(function (row, index) {
      return { row: row, index: index, value: moneySortValue(row[sort.key]) };
    }).sort(function (a, b) {
      if (a.value === null) return b.value === null ? a.index - b.index : 1;
      if (b.value === null) return -1;
      var difference = sort.direction === "asc" ? a.value - b.value : b.value - a.value;
      return difference || a.index - b.index;
    }).map(function (item) { return item.row; });
  }

  function renderSortHeaders(table) {
    var sort = tableSort[table];
    document.querySelectorAll('[data-sort-table="' + table + '"]').forEach(function (button) {
      var active = button.dataset.sortKey === sort.key;
      var direction = active ? sort.direction : "none";
      var label = button.querySelector(".sort-label").textContent;
      var next = active && sort.direction === "desc" ? "从低到高" : "从高到低";
      button.dataset.sortOrder = direction;
      button.closest("th").setAttribute("aria-sort", direction === "none" ? "none" :
        (direction === "asc" ? "ascending" : "descending"));
      button.title = "点击按" + label + next + "排序";
      button.setAttribute("aria-label", label + (active ? "，当前" +
        (direction === "asc" ? "从低到高" : "从高到低") : "") + "；" + button.title);
    });
  }

  function element(tag, className, content) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined && content !== null) node.textContent = String(content);
    return node;
  }

  function createMetricIcon(name, asset) {
    var node = element("span", "metric-icon");
    node.setAttribute("aria-hidden", "true");
    if (asset) {
      var glyph = element("span", "metric-library-glyph");
      glyph.style.setProperty("--metric-glyph", 'url("icons/' + asset + '")');
      node.appendChild(glyph);
      return node;
    }
    node.innerHTML = '<svg viewBox="0 0 24 24">' + (metricIconMarkup[name] || metricIconMarkup.wallet) + '</svg>';
    return node;
  }

  function statusTone(value) {
    var valueText = text(value, "");
    if (/正常|盈利|投放中|运行中|成功|已启用/.test(valueText)) return "good";
    if (/已同步|放量|控成本/.test(valueText)) return "info";
    if (/失败|失效|亏损|错误|不一致|未绑定|未设置/.test(valueText)) return "bad";
    if (/登录中|同步中|确认中|处理中|等待|验证|待重试|未登录/.test(valueText)) return "warn";
    return "neutral";
  }

  function accountStatusTone(value, kind) {
    var valueText = text(value, "").trim();
    if (kind === "login") {
      if (/失败|失效|未登录|待确认|验证|不一致|错误/.test(valueText)) return "bad";
      return /正常|登录成功|登录中/.test(valueText) ? "good" : "bad";
    }
    if (/失败|失效|未同步|等待|待安全验证|不一致|错误|未登录|待重试/.test(valueText)) return "bad";
    return /已同步|同步中|正在同步|正在连接|排队中|处理中|刷新中|自动重试中|正在验证|正在确认/.test(valueText)
      ? "good"
      : "bad";
  }

  function setStatus(node, value, tone) {
    node.className = "native-status " + (tone || statusTone(value));
    node.textContent = text(value, "未知");
  }

  function post(message) {
    if (!bridge) {
      showToast("当前页面未连接桌面程序，操作不可用。", true);
      return false;
    }
    message.version = VERSION;
    bridge.postMessage(message);
    return true;
  }

  function executeCommand(command, key, value) {
    if (deletePending && command !== "deletePlans") {
      showToast("正在删除计划，请等待结果后再操作。", true);
      return Promise.reject(new Error("正在删除计划"));
    }
    if (["deletePlans","setPlanDelivery","renamePlan","setTargetRoi"].indexOf(command)>=0) return Promise.reject(new Error("本版千川账户页仅支持读取投放数据"));
    var guarded = command === "syncAll" || command === "syncAccount" || command === "primaryAction" || command === "recoverLoginPlan" || command === "manageShopSlots";
    var operationKey = command + ":" + (key || "");
    if (guarded && inFlightCommands[operationKey]) return inFlightCommands[operationKey];
    var requestId = "qca-" + Date.now().toString(36) + "-" + (++requestSequence).toString(36);
    var request = new Promise(function (resolve, reject) {
      pendingRequests[requestId] = { resolve: resolve, reject: reject };
      if (!post({
        type: "command", requestId: requestId, command: command || "", key: key || "", value: value || "", accountKey: state.selectedAccountKey || ""
      })) {
        delete pendingRequests[requestId];
        reject(new Error("桌面桥接不可用"));
      }
    });
    if (guarded) {
      inFlightCommands[operationKey] = request;
      updateSyncButtons();
      var release = function () {
        if (inFlightCommands[operationKey] === request) delete inFlightCommands[operationKey];
        updateSyncButtons();
      };
      request.then(release, release);
    }
    return request;
  }

  function updateSyncButtons() {
    var syncing = !!state.syncAllInProgress || Object.keys(inFlightCommands).some(function (key) {
      return key.indexOf("syncAll:") === 0 || key.indexOf("syncAccount:") === 0;
    });
    var button = document.getElementById("sync-all");
    if (button) {
      button.disabled = syncing;
      button.setAttribute("aria-busy", syncing ? "true" : "false");
    }
    if (nodes.syncSelected) {
      nodes.syncSelected.disabled = syncing || !selectedAccount();
      nodes.syncSelected.setAttribute("aria-busy", syncing ? "true" : "false");
    }
  }

  function renderMetricCards(container, definitions, metrics) {
    clear(container);
    var compact = definitions === metricDefinitions;
    container.classList.toggle("compact-overview", compact);
    var progress = String(state.officialSummaryProgress || "").match(/正在获取账户数据\s*(\d+)\s*\/\s*(\d+)/);
    var loadingMoney = compact && progress && Number(progress[1]) < Number(progress[2]);
    var syncNote=document.getElementById("overview-sync-note");
    if (syncNote && container === nodes.metrics) syncNote.hidden = !loadingMoney;
    definitions.forEach(function (definition) {
      var card = element("article", "metric-card");
      card.style.setProperty("--metric", definition.color);
      card.style.setProperty("--metric-soft", definition.soft);
      card.style.setProperty("--metric-value", definition.valueColor || "#0f1f3d");
      var label = element("div", "metric-label");
      label.appendChild(createMetricIcon(definition.icon, definition.asset));
      label.appendChild(element("span", "", definition.label));
      card.appendChild(label);

      var value = element("div", "metric-value", text(metrics[definition.key], "—"));
      if (definitions === creatorMetricDefinitions && metrics[definition.key] === "—")
        value.appendChild(element("small", "creator-summary-unsynced", "未同步"));
      if (definition.asset && value.textContent.length > 10) {
        value.classList.add("metric-value-long");
        value.title = value.textContent;
      }
      if (definition.key === "todayProfit") {
        var numeric = Number(metrics.todayProfitValue || 0);
        if (numeric < 0) value.style.setProperty("--metric-value", "#ef4d2f");
      }
      card.appendChild(value);
      if (loadingMoney && /^(balance|gmv|spend|todayProfit)$/.test(definition.key)) {
        var spinner=element("span", "metric-loading");
        spinner.setAttribute("role", "status");
        spinner.setAttribute("aria-label", "账户数据加载中");
        spinner.title="账户数据尚未加载完整";
        value.appendChild(spinner);
      }
      if (compact && /^(todayProfit|profitPlans|lossPlans)$/.test(definition.key)) {
        card.title=({todayProfit:"预估值，仅供参考",profitPlans:"高于保本ROI",lossPlans:"低于保本ROI"})[definition.key]+"；按已设置保本ROI的计划统计，"+(Number(metrics.unsetRoiCount)||0)+" 个计划未设置保本ROI";
        card.tabIndex=0;
        card.setAttribute("aria-label",definition.label+"："+value.textContent+"。"+card.title);
      }
      var omitCreatorNote = definitions === creatorMetricDefinitions &&
        (definition.key === "accountCount" || definition.key === "normalCount");
      if (!compact && !omitCreatorNote) {
        var noteText=text(metrics[definition.key + "Note"], definition.note);
        var note=element("div", "metric-note", noteText);
        note.title=noteText;
        if (/^(todayProfit|profitPlans|lossPlans)$/.test(definition.key)) {
          note.classList.add("profit-stat-note");
          note.textContent=noteText.replace(/ · /g,"\n");
        }
        card.appendChild(note);
      }
      container.appendChild(card);
    });
  }

  function renderMetrics() {
    var alliance = state.pageMode === "alliance";
    var qianchuanPage = state.pageMode === "creator-qianchuan";
    var values = alliance ? CreatorBuyinSummary.summarize(array(state.accounts)) : scopedMetrics();
    nodes.metrics.hidden = false;
    nodes.allianceMetrics.hidden = true;
    if (alliance) {
      renderMetricCards(nodes.metrics, creatorMetricDefinitions, values);
      return;
    }
    if (!qianchuanPage) {
      var added = array(state.accounts).filter(kindMatches).filter(function (a) { return !isUnnamedLoginRecord(a); });
      values = Object.assign({}, values, { normal: added.filter(function (a) { return /^(正常|登录成功)$/.test(a.loginStatus); }).length + " / " + added.length });
      values.unsetRoiCount=added.reduce(function(n,a){return n+(Number(a.unsetRoiCount)||0);},0);
      if (state.officialEnabled) {
        var counted=added.filter(function(a){return a.profitStatReady===true;}).length;
        var unset=added.reduce(function(n,a){return n+(Number(a.unsetRoiCount)||0);},0);
        var profitNote="已设置保本ROI的计划"+(counted<added.length?" · 已统计 "+counted+"/"+added.length+" 个账户":"")+(unset?" · "+unset+" 个计划未设置保本ROI":"");
        ["todayProfit","profitPlans","lossPlans"].forEach(function(k){values[k+"Note"]=profitNote;});
      }
    }
    renderMetricCards(nodes.metrics, qianchuanPage ? qianchuanMetricDefinitions : metricDefinitions, values);
  }

  function accountMatches(account) {
    if (!kindMatches(account) || !accountRecordMatches(account)) return false;
    if (state.pageMode === "alliance") {
      var creatorLogin = CreatorBuyinSummary.loginPresentation(account);
      if (allianceLoginFilter === "normal" && creatorLogin.state !== "valid") return false;
      if (allianceLoginFilter === "error" && !creatorLogin.abnormal) return false;
    }
    var search = (nodes.accountSearch.value || "").trim().toLocaleLowerCase();
    if (search) {
      var haystack = [accountDisplayName(account), account.name, account.officialAccountName, account.advertiserName, account.advertiserId, account.douyinId]
        .map(function (item) { return text(item, "").toLocaleLowerCase(); }).join(" ");
      if (haystack.indexOf(search) < 0) return false;
    }

    var loginText = text(account.loginStatus, "");
    var loginFilter = nodes.loginFilter.value;
    if (state.pageMode === "alliance") {
      if (loginFilter === "normal") return creatorLogin.state === "valid";
      if (loginFilter === "attention") return creatorLogin.state !== "valid" && creatorLogin.state !== "checking";
      if (loginFilter === "loggedOut") return creatorLogin.abnormal || creatorLogin.state === "notLoggedIn";
      return true;
    }
    if (loginFilter === "normal" && loginText !== "正常" && loginText !== "登录成功") return false;
    if (loginFilter === "attention" && /^(正常|登录成功)$/.test(loginText)) return false;
    if (loginFilter === "loggedOut" && !/未登录|已掉线/.test(loginText)) return false;

    return true;
  }

  function appendCell(row, content, className, title) {
    var cell = element("td", className || "");
    if (content && content.nodeType) cell.appendChild(content);
    else cell.textContent = text(content, "—");
    if (title) cell.title = title;
    row.appendChild(cell);
    return cell;
  }

  function accountOperationText(account) {
    var operation = text(account.action, "查看");
    if (operation === "登录" || operation === "登录千川") return "登录";
    if (operation === "登录中") return "登录中";
    if (/选择千川账户/.test(operation)) return "选择千川账户";
    if (/重新|失效/.test(operation)) return "重新登录";
    if (operation === "打开店铺" || operation === "查看详情") return "查看";
    return operation;
  }

  function renderAccountPlanStatus(value) {
    var valueText = text(value, "等待同步");
    var match = valueText.match(/^\s*(\d+\s*个盈利)\s*[\/／]\s*(\d+\s*个亏损)\s*$/);
    if (valueText === "授权失败" || valueText === "同步失败") return element("span", "native-status bad", valueText);
    if (!match) return element("span", "account-plan-status-neutral", valueText);

    var status = element("span", "account-plan-status");
    status.appendChild(element("span", "account-plan-profit", match[1]));
    status.appendChild(element("span", "account-plan-separator", " / "));
    status.appendChild(element("span", "account-plan-loss", match[2]));
    status.setAttribute("aria-label", valueText);
    return status;
  }

  function accountManagementCountNote(accounts) {
    var normal = accounts.filter(function (a) { return /^(正常|登录成功)$/.test(a.loginStatus); }).length;
    var pending = accounts.length - normal;
    return "已登录 " + normal + " 个" + (pending ? " · 待处理 " + pending + " 个" : "");
  }

  function appendCreatorMetric(container, account, key, money) {
    var metric = CreatorBuyinSummary.metric(account, key, money);
    container.appendChild(element("span", "creator-metric-value", metric.text));
    if (metric.note) container.appendChild(element("small", "creator-unsynced", metric.note));
  }

  function creatorDetailId(key) { return "creator-detail-" + encodeURIComponent(key); }

  function renderCreatorDetail(account, row) {
    var detailRow = element("tr", "creator-detail-row");
    var cell = element("td");
    cell.colSpan = 10;
    var panel = element("section", "creator-detail");
    panel.id = creatorDetailId(account.key);
    panel.setAttribute("aria-label", accountDisplayName(account) + "的数据详情");
    var heading = element("div", "creator-detail-heading");
    heading.appendChild(element("strong", "", accountDisplayName(account) + " · 数据详情"));
    var actions = element("div", "creator-detail-actions");
    [["打开百应", "openCreatorBuyin"], [account.buyinSyncing ? "同步中…" : "同步数据", "syncCreatorAccount"]].forEach(function (action) {
      var button = element("button", "operation-link", action[0]);
      button.type = "button"; button.dataset.command = action[1]; button.dataset.key = account.key;
      button.disabled = !!account.buyinSyncing;
      actions.appendChild(button);
    });
    heading.appendChild(actions); panel.appendChild(heading);
    var metrics = element("div", "creator-detail-metrics");
    [["结算有效成交金额", "buyinGmv", true], ["结算有效成交订单量", "buyinOrders", false],
      ["结算有效成交人数", "buyinCustomers", false], ["预估佣金收入", "buyinCommission", true],
      ["可提现佣金", "buyinWithdraw", true]].forEach(function (definition) {
      var metric = element("div"); metric.appendChild(element("div", "creator-detail-label", definition[0]));
      appendCreatorMetric(metric, account, definition[1], definition[2]); metrics.appendChild(metric);
    });
    panel.appendChild(metrics);
    panel.appendChild(element("p", "creator-detail-note", "来源：百应官方首页 · 近7日。" + text(account.dataUpdatedAt, "尚未同步") + "。预估佣金与可提现佣金分别展示。"));
    if (account.buyinError) panel.appendChild(element("p", "creator-detail-note", account.buyinError));
    cell.appendChild(panel); detailRow.appendChild(cell);
    row.parentNode.insertBefore(detailRow, row.nextSibling);
  }

  function renderAccounts() {
    var accounts = array(state.accounts);
    var alliance = state.pageMode === "alliance";
    var selectionHint = document.getElementById("account-selection-hint");
    if (selectionHint) selectionHint.hidden = alliance || !accounts.some(function (account) {
      return !account.hasOfficial && account.accountKind !== "creator" &&
        (accountOperationText(account) === "选择账户" ||
          /待选择千川账户|待选择账户|需手动选择/.test(text(account.loginStatus, "")));
    });
    var filtered = sortTableRows(accounts.filter(accountMatches), "accounts");
    renderSortHeaders("accounts");
    var selectedKey = text(state.selectedAccountKey, "");
    nodes.accountEmpty.hidden = filtered.length > 0;
    nodes.overviewAccountCount.hidden = !alliance && state.pageMode !== "creator-qianchuan";
    nodes.overviewAccountCount.textContent = nodes.overviewAccountCount.hidden ? ""
      : alliance ? CreatorBuyinSummary.summarize(accounts).summaryNote
      : accountManagementCountNote(accounts.filter(kindMatches));
    if (!alliance && state.pageMode !== "creator-qianchuan")
      nodes.accountRows.parentNode.querySelector("thead th").textContent = "序号";

    var grouping=groupByShop && (!state.pageMode||state.pageMode==="accounts");
    function groupKey(a){return a.shopGroupId&&a.shopGroupName ? String(a.shopGroupId):"";}
    if(grouping)filtered.sort(function(a,b){var x=groupKey(a),y=groupKey(b);return !x&&y?1:x&&!y?-1:x.localeCompare(y);});
    Array.prototype.forEach.call(nodes.accountRows.querySelectorAll(".shop-group-row, .creator-detail-row"),function(row){row.remove();});
    var existing = Object.create(null);
    Array.prototype.forEach.call(nodes.accountRows.children, function (row) { existing[row.dataset.accountKey] = row; });
    var retained = [];
    filtered.forEach(function (account, index) {
      var accountKey = text(account.key, "");
      var isSelected = !!accountKey && accountKey === selectedKey;
      var row = existing[accountKey];
      if (!row) {
        row = document.createElement("tr");
        row.dataset.accountKey = accountKey;
        for (var column = 0; column < (alliance ? 10 : 9); column++) row.appendChild(element("td"));
        row.cells[2].appendChild(element("span"));
        var button = element("button", "operation-link");
        button.type = "button";
        button.dataset.command = "primaryAction";
        button.dataset.key = accountKey;
        row.cells[alliance ? 9 : 8].appendChild(button);
      }
      var desiredCellCount = alliance ? 10 : 9;
      while (row.cells.length < desiredCellCount) row.appendChild(element("td"));
      while (row.cells.length > desiredCellCount) row.deleteCell(row.cells.length - 1);
      // Preserve the action button when an unchanged row skips rendering below.
      if (!alliance && row.cells[8].firstChild && row.cells[8].firstChild.nodeName !== "BUTTON") clear(row.cells[8]);
      if (!row.cells[alliance ? 9 : 8].firstChild) {
        var actionButton = element("button", "operation-link");
        actionButton.type = "button";
        actionButton.dataset.command = "primaryAction";
        actionButton.dataset.key = accountKey;
        row.cells[alliance ? 9 : 8].appendChild(actionButton);
      }
      retained.push(row);
      var displayAccountName = accountDisplayName(account);
      var signature = JSON.stringify([state.pageMode, alliance, account, index, isSelected, displayAccountName, creatorDetailKey]);
      if (row.dataset.signature === signature) return;
      row.dataset.signature = signature;
      row.setAttribute("aria-selected", isSelected ? "true" : "false");
      row.classList.toggle("selected", isSelected);
      var cells = row.cells;
      function cellText(column, value) {
        var valueText = text(value);
        if (cells[column].textContent !== valueText) cells[column].textContent = valueText;
      }
      cellText(0, index + 1);
      if (!alliance) {
        clear(cells[0]);
        var accountOrder = element("span", "account-order");
        accountOrder.appendChild(element("span", "account-order-number", index + 1));
        cells[0].appendChild(accountOrder);
      }
      clear(cells[1]);
      var accountTitle = element("div", "account-name-line");
      if (alliance) accountTitle.appendChild(element("span", "creator-avatar"));
      var accountName = element("strong", "", displayAccountName);
      accountName.title = accountNameTitle(account);
      accountTitle.appendChild(accountName);
      cells[1].appendChild(accountTitle);
      if(account.officialSummaryNotice) cells[1].appendChild(element("div","account-refresh-failure",account.officialSummaryNotice));
      if(account.summaryFailure) cells[1].appendChild(element("div","account-refresh-failure",account.summaryFailure));
      var conciseSync = /^(同步中|已同步|同步失败)$/.test(account.syncStatus || "") && !alliance && !account.isOfficialOnly;
      if(account.accountNotice && !(conciseSync && account.accountNotice === account.syncStatus)) cells[1].appendChild(element("div","account-selection-notice",account.accountNotice));
      cells[1].title = accountNameTitle(account);
      var dataHint = "数据更新时间：" + text(account.dataUpdatedAt, "尚未更新") + (account.buyinError ? "；" + account.buyinError : "");
      if (account.dataUpdateFailed)
        dataHint += "；数据更新未完成，请同步重试。";
      var isBound = !!text(account.advertiserId, "").trim() || /已绑定|当前千川/.test(text(account.binding, ""));
      if (alliance) {
        clear(cells[2]);
        var douyin = text(account.douyinId || account.awemeId || account.douyinName || account.handle, "—");
        cells[2].textContent = douyin;
        clear(cells[3]);
        var loginStatusCell = element("span");
        var creatorLogin = CreatorBuyinSummary.loginPresentation(account);
        setStatus(loginStatusCell, creatorLogin.label, creatorLogin.tone);
        cells[3].appendChild(loginStatusCell);
        clear(cells[4]);
        var syncText = element("span", "account-binding-line");
        setStatus(syncText, account.syncStatus, account.buyinError ? "bad" : account.buyinVerified ? "good" : "neutral");
        syncText.title = text(account.buyinError, "") || dataHint;
        cells[4].appendChild(syncText);
        [[5, "buyinGmv", true], [6, "buyinOrders", false], [7, "buyinCustomers", false], [8, "buyinCommission", true]].forEach(function (metric) {
          clear(cells[metric[0]]); appendCreatorMetric(cells[metric[0]], account, metric[1], metric[2]);
        });
      } else {
        if (!cells[2].firstChild || cells[2].firstChild.nodeName !== "SPAN") {
          clear(cells[2]);
          cells[2].appendChild(element("span"));
        }
        var loginStatus = cells[2].firstChild;
        setStatus(loginStatus, account.isOfficialOnly ? "登录成功" : account.loginStatus === "正常" ? "登录成功" : account.loginStatus, accountStatusTone(account.loginStatus, "login"));
        cellText(3, text(account.balance).replace(/[¥￥]/g, ""));
      }
      if (!alliance) {
        cellText(4, text(account.gmv).replace(/[¥￥]/g, ""));
        cellText(5, text(account.spend).replace(/[¥￥]/g, ""));
        cellText(6, account.roi);
      }
      [alliance ? 4 : 3, 4, 5, 6, 7, 8].forEach(function (column) { cells[column].title = dataHint; });
      if (!alliance && cells[7].dataset.value !== text(account.planStatus, "")) {
        clear(cells[7]);
        cells[7].appendChild(renderAccountPlanStatus(account.planStatus));
        cells[7].dataset.value = text(account.planStatus, "");
      }
      if (!alliance) cells[7].title = text(account.planStatusHint, "") || text(account.planStatus, "");
      var operation = cells[alliance ? 9 : 8].firstChild;
      operation.dataset.command = account.hasOfficial ? "officialRefresh" : alliance ? "viewCreatorData" : "primaryAction";
      var operationText = alliance
        ? (creatorDetailKey === accountKey ? "收起数据" : "查看数据")
        : account.hasOfficial ? "刷新" : accountOperationText(account);
      if (!alliance && account.recoveryAction) {
        operation.dataset.command = "recoverLoginPlan";
        operationText = account.recoveryText;
      }
      if (operation.textContent !== operationText) operation.textContent = operationText;
      operation.disabled = alliance ? false : !account.actionEnabled;
      if (alliance) {
        operation.setAttribute("aria-expanded", String(creatorDetailKey === accountKey));
        operation.setAttribute("aria-controls", creatorDetailId(accountKey));
      } else {
        operation.removeAttribute("aria-expanded"); operation.removeAttribute("aria-controls");
      }
      if (!alliance && account.recoveryAction) operation.disabled = false;
      var operationCell = cells[alliance ? 9 : 8];
      var loginAction = operationCell.querySelector(".creator-login-action");
      if (loginAction) loginAction.remove();
      if (alliance && creatorLogin.state !== "valid" && creatorLogin.state !== "checking") {
        loginAction = element("button", "operation-link creator-login-action", creatorLogin.abnormal ? "重新登录" : creatorLogin.state === "unverified" ? "校验登录" : "登录百应");
        loginAction.type = "button"; loginAction.dataset.key = accountKey;
        loginAction.dataset.command = creatorLogin.state === "unverified" ? "syncCreatorAccount" : "openCreatorBuyin";
        loginAction.disabled = !!account.buyinSyncing;
        operationCell.appendChild(loginAction);
      }
      var deleteButton = operationCell.querySelector(".account-delete-direct");
      var directDelete = !alliance && state.pageMode !== "creator-qianchuan" &&
        !!window.desktopBrand && window.desktopBrand.id === "shunbao";
      if (directDelete) {
        if (!deleteButton) {
          deleteButton = element("button", "operation-link account-delete-direct", "删除店铺");
          deleteButton.type = "button";
          operationCell.appendChild(deleteButton);
        }
        deleteButton.dataset.command = "removeAccount";
        deleteButton.dataset.key = accountKey;
        deleteButton.disabled = !account.canRemove;
        deleteButton.title = account.canRemove ? "删除店铺：" + accountDisplayName(account) : "当前账户暂不可删除";
        deleteButton.setAttribute("aria-label", deleteButton.title);
      } else if (deleteButton) operationCell.removeChild(deleteButton);
      row.title = account.canRemove ? "右键可删除此账户" : "";
    });
    Array.prototype.slice.call(nodes.accountRows.children).forEach(function (row) {
      if (retained.indexOf(row) < 0) nodes.accountRows.removeChild(row);
    });
    retained.forEach(function (row, index) {
      if (nodes.accountRows.children[index] !== row)
        nodes.accountRows.insertBefore(row, nodes.accountRows.children[index] || null);
    });
    if (alliance && creatorDetailKey) {
      var detailIndex = filtered.findIndex(function (account) { return account.key === creatorDetailKey; });
      if (detailIndex >= 0) renderCreatorDetail(filtered[detailIndex], retained[detailIndex]);
      else creatorDetailKey = "";
    }
    if(grouping){var last=null;filtered.forEach(function(account,index){var key=groupKey(account);if(key!==last){var header=document.createElement("tr");header.className="shop-group-row";var cell=document.createElement("td");cell.colSpan=9;cell.textContent=(key?account.shopGroupName:"待关联店铺")+" · "+filtered.filter(function(a){return groupKey(a)===key;}).length+" 个账户";header.appendChild(cell);nodes.accountRows.insertBefore(header,retained[index]);last=key;}});}
    if(window.QianchuanAccountUi)window.QianchuanAccountUi.decorateAccounts();
  }

  function customSelectParts(control) {
    return control ? {
      source: control.querySelector(".custom-select-source"),
      trigger: control.querySelector(".custom-select-trigger"),
      label: control.querySelector(".custom-select-label") || control.querySelector(".custom-select-trigger > span:first-child"),
      menu: control.querySelector(".custom-select-menu")
    } : null;
  }

  function customSelectOptions(control) {
    var parts = customSelectParts(control);
    return parts ? Array.prototype.slice.call(parts.menu.querySelectorAll("button[data-value]")) : [];
  }

  function syncCustomSelectUi(control) {
    var parts = customSelectParts(control);
    if (!parts || !parts.source || !parts.trigger || !parts.label || !parts.menu) return;
    var selectedValue = parts.source.value;
    var selectedOption = Array.prototype.slice.call(parts.source.options).filter(function (option) {
      return option.value === selectedValue;
    })[0] || parts.source.options[0];
    parts.label.textContent = selectedOption ? selectedOption.textContent : "";
    parts.trigger.title = selectedOption ? selectedOption.textContent : "";
    parts.menu.innerHTML = "";
    Array.prototype.forEach.call(parts.source.options, function (sourceOption) {
      var option = element("button", "custom-select-option" + (sourceOption.value === selectedValue ? " selected" : ""));
      var optionLabel = element("span", "", sourceOption.textContent);
      var check = element("span", "custom-select-check", "✓");
      var selected = sourceOption.value === selectedValue;
      option.type = "button";
      option.dataset.value = sourceOption.value;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", selected ? "true" : "false");
      option.setAttribute("tabindex", "-1");
      check.setAttribute("aria-hidden", "true");
      option.appendChild(optionLabel);
      option.appendChild(check);
      parts.menu.appendChild(option);
    });
  }

  function setCustomSelectOpen(control, open, focusPreference) {
    var parts = customSelectParts(control);
    if (!parts) return;
    open = !!open;
    if (open) {
      document.querySelectorAll("[data-custom-select].open").forEach(function (other) {
        if (other !== control) setCustomSelectOpen(other, false);
      });
      setAccountPickerOpen(false);
    }
    parts.menu.hidden = !open;
    control.classList.toggle("open", open);
    parts.trigger.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) placeFloatingMenu(parts.menu, parts.trigger, 200);
    if (!open || !focusPreference) return;
    var options = customSelectOptions(control);
    if (!options.length) return;
    var target = focusPreference === "last"
      ? options[options.length - 1]
      : options.filter(function (option) { return option.getAttribute("aria-selected") === "true"; })[0] || options[0];
    target.focus();
  }

  function closeCustomSelects(returnFocus) {
    document.querySelectorAll("[data-custom-select].open").forEach(function (control) {
      var parts = customSelectParts(control);
      setCustomSelectOpen(control, false);
      if (returnFocus && parts) parts.trigger.focus();
    });
  }

  function moveCustomSelectFocus(control, direction) {
    var options = customSelectOptions(control);
    if (!options.length) return;
    var currentIndex = options.indexOf(document.activeElement);
    var nextIndex = currentIndex < 0 ? 0 : (currentIndex + direction + options.length) % options.length;
    options[nextIndex].focus();
  }

  function chooseCustomSelect(control, value) {
    var parts = customSelectParts(control);
    if (!parts) return;
    var exists = Array.prototype.some.call(parts.source.options, function (option) { return option.value === value; });
    if (!exists) return;
    var changed = parts.source.value !== value;
    parts.source.value = value;
    syncCustomSelectUi(control);
    setCustomSelectOpen(control, false);
    parts.trigger.focus();
    if (changed) parts.source.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function initializeCustomSelects() {
    document.querySelectorAll("[data-custom-select]").forEach(function (control) {
      var parts = customSelectParts(control);
      if (!parts) return;
      syncCustomSelectUi(control);
      parts.source.addEventListener("change", function () { syncCustomSelectUi(control); });
      parts.trigger.addEventListener("click", function () {
        setCustomSelectOpen(control, parts.menu.hidden);
      });
      parts.trigger.addEventListener("keydown", function (event) {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        setCustomSelectOpen(control, true, event.key === "ArrowUp" ? "last" : "selected");
      });
      parts.menu.addEventListener("click", function (event) {
        var option = event.target.closest("button[data-value]");
        if (option) chooseCustomSelect(control, option.dataset.value || "");
      });
      parts.menu.addEventListener("keydown", function (event) {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          moveCustomSelectFocus(control, event.key === "ArrowDown" ? 1 : -1);
          return;
        }
        if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          var options = customSelectOptions(control);
          if (options.length) options[event.key === "Home" ? 0 : options.length - 1].focus();
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          var activeOption = event.target.closest("button[data-value]");
          if (!activeOption) return;
          event.preventDefault();
          chooseCustomSelect(control, activeOption.dataset.value || "");
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setCustomSelectOpen(control, false);
          parts.trigger.focus();
        } else if (event.key === "Tab") {
          setCustomSelectOpen(control, false);
        }
      });
    });
  }

  function accountByExactKey(key) {
    key = text(key, "").trim();
    return array(state.accounts).filter(function (account) {
      return text(account.key, "") === key;
    })[0] || null;
  }

  function closeAccountContextMenu() {
    contextAccountKey = "";
    if (!nodes.accountContextMenu) return;
    nodes.accountContextMenu.hidden = true;
    nodes.contextAccountName.textContent = "未命名店铺";
    nodes.contextAccountName.title = "";
    nodes.deleteAccountAction.dataset.key = "";
    nodes.deleteAccountAction.setAttribute("aria-label", "删除此店铺");
    nodes.deleteAccountAction.title = "";
  }

  function openAccountContextMenu(account, clientX, clientY) {
    closeAccountContextMenu();
    if (!account || !account.canRemove) {
      showToast("至少保留一个账户，当前账户不能删除。", true);
      return;
    }
    contextAccountKey = text(account.key, "").trim();
    if (!contextAccountKey) {
      showToast("无法识别要删除的账户，请刷新后重试。", true);
      return;
    }
    var displayAccountName = accountDisplayName(account);
    nodes.contextAccountName.textContent = displayAccountName;
    nodes.contextAccountName.title = displayAccountName;
    nodes.deleteAccountAction.dataset.key = contextAccountKey;
    nodes.deleteAccountAction.setAttribute("aria-label", "删除店铺：" + displayAccountName);
    nodes.deleteAccountAction.title = "删除店铺：" + displayAccountName;
    nodes.accountContextMenu.hidden = false;
    nodes.accountContextMenu.style.left = "0px";
    nodes.accountContextMenu.style.top = "0px";
    var rect = nodes.accountContextMenu.getBoundingClientRect();
    var left = Math.max(8, Math.min(Number(clientX) || 0, window.innerWidth - rect.width - 8));
    var top = Math.max(8, Math.min(Number(clientY) || 0, window.innerHeight - rect.height - 8));
    nodes.accountContextMenu.style.left = left + "px";
    nodes.accountContextMenu.style.top = top + "px";
    nodes.deleteAccountAction.focus();
  }

  function selectedAccount() {
    var selectedKey = text(state.selectedAccountKey, "");
    return array(state.accounts).filter(function (account) {
      return text(account.key, "") === selectedKey;
    })[0] || null;
  }

  function createStorePickerIcon() {
    var icon = element("span", "store-picker-icon");
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = '<svg viewBox="0 0 24 24">' + metricIconMarkup.store + '</svg>';
    return icon;
  }

  function renderAccountPicker() {
    clear(nodes.accountPicker);
    var selectedKey = text(state.selectedAccountKey, "");
    array(state.accounts).filter(kindMatches).filter(accountRecordMatches).forEach(function (account) {
      var key = text(account.key, "");
      var selected = !!key && key === selectedKey;
      var option = element("button", "store-picker-option" + (selected ? " selected" : ""));
      option.type = "button";
      option.dataset.accountKey = key;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", selected ? "true" : "false");
      option.appendChild(createStorePickerIcon());

      var copy = element("span", "store-picker-copy");
      copy.appendChild(element("strong", "", accountDisplayName(account)));
      copy.title = accountNameTitle(account);
      option.title = accountNameTitle(account);
      var accountStatus = element("span");
      setStatus(accountStatus, text(account.loginStatus, "未知"), accountStatusTone(account.loginStatus, "login"));
      copy.appendChild(accountStatus);
      option.appendChild(copy);
      var check = element("span", "store-picker-check");
      check.setAttribute("aria-hidden", "true");
      check.innerHTML = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10L8 14L16 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="miter"/></svg>';
      option.appendChild(check);
      nodes.accountPicker.appendChild(option);
    });
  }

  function renderQianchuanScope() {
    var control = document.getElementById("qianchuan-scope-control");
    if (!control) return;
    control.hidden = state.pageMode !== "creator-qianchuan";
    if (control.hidden) { setCustomSelectOpen(control, false); return; }
    var parts = customSelectParts(control);
    var accounts = array(state.accounts).filter(kindMatches);
    qianchuanScopeKey = accounts.some(function (account) { return account.key === state.selectedAccountKey; }) ? state.selectedAccountKey : "";
    var signature = JSON.stringify([qianchuanScopeKey, accounts.map(function (account) { return [account.key, account.name]; })]);
    if (control.dataset.signature !== signature) {
      clear(parts.source);
      var placeholder = element("option", "", "请选择千川账户（" + accounts.length + "个）");
      placeholder.value = ""; placeholder.disabled = true; parts.source.appendChild(placeholder);
      accounts.forEach(function (account) {
        var option = element("option", "", accountDisplayName(account));
        option.value = account.key; parts.source.appendChild(option);
      });
      parts.source.value = qianchuanScopeKey;
      syncCustomSelectUi(control);
      control.dataset.signature = signature;
    }
    parts.trigger.disabled = qianchuanScopePending || !!deletePending || !!targetRoiSubmittingKey;
    parts.trigger.setAttribute("aria-busy", qianchuanScopePending ? "true" : "false");
    if (!parts.menu.hidden) placeFloatingMenu(parts.menu, parts.trigger, 300);
  }

  function changeQianchuanScope(key) {
    var control = document.getElementById("qianchuan-scope-control");
    var parts = customSelectParts(control);
    // Keep the previous scope until the host confirms the account switch.
    parts.source.value = qianchuanScopeKey;
    syncCustomSelectUi(control);
    if (state.pageMode !== "creator-qianchuan" || qianchuanScopePending || deletePending || targetRoiSubmittingKey) return;
    if (!key) return;
    if (key === state.selectedAccountKey) {
      qianchuanScopeKey = key;
      render();
      return;
    }
    if (array(state.accounts).filter(function (account) { return kindMatches(account) && account.key === key; }).length !== 1) return;
    var request = ++qianchuanScopeRequest;
    qianchuanScopePending = true;
    renderQianchuanScope();
    executeCommand("selectAccount", key, "").then(function () {
      if (request !== qianchuanScopeRequest || state.pageMode !== "creator-qianchuan") return;
      qianchuanScopePending = false;
      if (state.selectedAccountKey === key) qianchuanScopeKey = key;
      render();
    }).catch(function (error) {
      if (request !== qianchuanScopeRequest) return;
      qianchuanScopePending = false;
      render();
      showToast(error && error.message ? error.message : "账户切换失败，请重试", true);
    });
  }

  function setAccountPickerOpen(open, focusPreference) {
    open = !!open && array(state.accounts).length > 0;
    nodes.accountPicker.hidden = !open;
    nodes.storeSelector.classList.toggle("open", open);
    nodes.selectedAccountTrigger.setAttribute("aria-expanded", open ? "true" : "false");
    if (!open) return;
    renderAccountPicker();
    placeFloatingMenu(nodes.accountPicker, nodes.selectedAccountTrigger, 300);
    if (!focusPreference) return;
    var options = Array.prototype.slice.call(nodes.accountPicker.querySelectorAll("button[data-account-key]"));
    if (!options.length) return;
    var target = focusPreference === "last"
      ? options[options.length - 1]
      : options.filter(function (option) { return option.getAttribute("aria-selected") === "true"; })[0] || options[0];
    target.focus();
    window.requestAnimationFrame(function () {
      if (target.scrollIntoView) target.scrollIntoView({ block: "nearest" });
    });
  }

  function moveAccountPickerFocus(direction) {
    var options = Array.prototype.slice.call(nodes.accountPicker.querySelectorAll("button[data-account-key]"));
    if (!options.length) return;
    var currentIndex = options.indexOf(document.activeElement);
    var nextIndex = currentIndex < 0 ? 0 : (currentIndex + direction + options.length) % options.length;
    options[nextIndex].focus();
  }

  function selectAccountByExactKey(key) {
    key = text(key, "").trim();
    if (key && key === text(state.selectedAccountKey, "").trim()) return;
    var matches = array(state.accounts).filter(function (account) {
      return text(account.key, "") === key;
    });
    if (!key || matches.length !== 1) {
      showToast("无法唯一识别所点击的店铺，请刷新后重试。", true);
      return;
    }
    executeCommand("selectAccount", key, "").catch(function (error) {
      showToast(error && error.message ? error.message : "店铺切换未完成，请重试。", true);
    });
  }

  function renderSelectedAccount() {
    var account = selectedAccount();
    var enabled = !!account;
    nodes.selectedAccountName.textContent = enabled ? accountDisplayName(account) : "尚未选择";
    nodes.selectedAccountName.title = enabled ? accountNameTitle(account) : "";
    var badgeStatus = enabled ? text(account.badgeStatus, "已选") : "等待选择";
    nodes.selectedAccountStatus.textContent = badgeStatus;
    nodes.selectedAccountStatus.className = "store-badge-status " + statusTone(badgeStatus);
    updateSyncButtons();
    nodes.openSelected.disabled = !enabled || !account.actionEnabled;
    nodes.syncSelected.dataset.key = enabled ? text(account.key, "") : "";
    nodes.openSelected.dataset.key = enabled ? text(account.key, "") : "";
    nodes.selectedAccountTrigger.disabled = array(state.accounts).length === 0;
    nodes.selectedAccountTrigger.title = enabled ? "点击切换计划店铺" : "点击选择计划店铺";
    nodes.selectedAccountTrigger.setAttribute("aria-label", enabled
      ? "当前计划店铺：" + accountDisplayName(account) + "，点击切换"
      : "选择计划店铺");
    renderChangedSection("picker", [accountKind, state.selectedAccountKey, array(state.accounts).map(function (item) {
      return [item.key, accountDisplayName(item), accountNameTitle(item), item.loginStatus];
    })], renderAccountPicker);
  }

  function planMatches(plan) {
    if(plan.isOfficial) {var officialSearch=(nodes.planSearch.value||"").trim().toLocaleLowerCase();return !officialSearch || [plan.name,plan.id,plan.deliveryStatus].join(" ").toLocaleLowerCase().includes(officialSearch);}
    var deliveryType = text(plan.deliveryType, "");
    if (state.pageMode === "creator-qianchuan" && !qianchuanPlanMatchesFilter(plan, qianchuanPlanFilter)) return false;
    if (activeTab === "volume" && deliveryType !== "放量投放") return false;
    if (activeTab === "cost" && deliveryType !== "控成本投放") return false;
    if (activeTab === "multiply" && deliveryType !== "乘方投放") return false;
    var typeFilter = nodes.planTypeFilter.value;
    if (typeFilter === "volume" && deliveryType !== "放量投放") return false;
    if (typeFilter === "cost" && deliveryType !== "控成本投放") return false;
    if (typeFilter === "multiply" && deliveryType !== "乘方投放") return false;
    if (typeFilter === "other" && (deliveryType === "放量投放" || deliveryType === "控成本投放" || deliveryType === "乘方投放")) return false;
    var search = (nodes.planSearch.value || "").trim().toLocaleLowerCase();
    if (!search) return true;
    return [plan.name, plan.id, plan.deliveryStatus, plan.deliveryType]
      .map(function (item) { return text(item, "").toLocaleLowerCase(); })
      .join(" ").indexOf(search) >= 0;
  }

  function beginPlanNameEdit(container) {
    if (!container || container.dataset.editable !== "true" || container.querySelector("input.plan-name-inline")) return;
    var planId = container.dataset.planId || "";
    var uiKey = container.dataset.uiKey || "";
    var title = container.querySelector("strong");
    if (!planId || !title) {
      showToast("当前计划缺少稳定计划ID，不能修改名称。", true);
      return;
    }

    var originalName = (title.textContent || "").trim();
    var input = element("input", "plan-name-inline");
    input.type = "text";
    input.maxLength = 80;
    input.value = originalName;
    input.setAttribute("aria-label", "修改计划名称");
    input.title = "Enter 保存，Esc 取消";
    title.hidden = true;
    container.insertBefore(input, title);
    input.focus();
    input.select();

    var completed = false;
    function restore() {
      if (!container.isConnected) return;
      if (input.parentNode) input.parentNode.removeChild(input);
      title.hidden = false;
    }
    function finish(shouldSave) {
      if (completed) return;
      completed = true;
      if (!shouldSave) {
        restore();
        return;
      }

      var nextName = (input.value || "").replace(/\s+/g, " ").trim();
      if (!nextName) {
        restore();
        showToast("计划名称不能为空。", true);
        return;
      }
      if (nextName === originalName) {
        restore();
        return;
      }

      input.disabled = true;
      executeCommand("renamePlan", planId, nextName)
        .then(function () {
          var plan = findPlan(uiKey);
          if (plan) {
            plan.name = nextName;
            plan.isCustomName = nextName !== text(plan.sourceName, nextName);
          }
          if (!container.isConnected) return;
          title.textContent = nextName;
          container.classList.toggle("custom-name", !!(plan && plan.isCustomName));
          container.title = "双击修改计划名称";
          restore();
        })
        .catch(function () { restore(); });
    }

    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish(false);
      }
    });
    input.addEventListener("blur", function () { finish(true); });
  }

  function targetRoiCooldownSeconds(plan) {
    var endText = text(plan && plan.targetRoiNextEditableAtUtc, "");
    var endMilliseconds = endText ? Date.parse(endText) : NaN;
    if (!Number.isFinite(endMilliseconds)) return 0;
    return Math.max(0, Math.ceil((endMilliseconds - Date.now()) / 1000));
  }

  function targetRoiCooldownText(plan) {
    var seconds = targetRoiCooldownSeconds(plan);
    if (seconds <= 0) return "";
    var minutes = Math.floor(seconds / 60);
    var remainder = seconds % 60;
    return "倒计时 " + String(minutes).padStart(2, "0") + ":" +
      String(remainder).padStart(2, "0");
  }

  function canEditTargetRoiNow(plan) {
    return false;
  }

  function updateTargetRoiCountdowns() {
    Array.prototype.forEach.call(
      nodes.planRows.querySelectorAll("[data-target-roi-ui-key]"),
      function (container) {
        var plan = findPlan(container.dataset.targetRoiUiKey || "");
        if (!plan) return;
        var countdown = container.querySelector(".target-roi-countdown");
        var editControl = container.querySelector(".target-roi-value, .target-roi-inline");
        var countdownText = targetRoiCooldownText(plan);
        var submitting = text(plan.uiKey, "") === targetRoiSubmittingKey;
        if (countdown) {
          countdown.textContent = submitting ? "提交中…" : countdownText;
          countdown.hidden = !submitting && !countdownText;
          countdown.classList.toggle("pending", submitting || !!plan.targetRoiVerificationPending);
        }
        if (editControl) {
          editControl.disabled = submitting || !canEditTargetRoiNow(plan);
          editControl.title = countdownText
            ? "参考提示：" + countdownText + "；仍可直接修改，提交结果以千川平台为准"
            : text(plan.targetRoiEditMessage, "点击直接修改目标 ROI");
        }
      });
  }

  function compactPlanBudget(value) {
    var raw = text(value, "—"), clean = raw.replace(/[¥￥,\s]/g, "");
    if (!/^\d+(?:\.\d+)?$/.test(clean)) return raw;
    var number = Number(clean);
    return Number.isFinite(number) ? number.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : raw;
  }

  var breakEvenRoiPending = Object.create(null);

  function breakEvenRoiInput(plan) {
    var input = element("input", "roi-inline");
    input.type = "number";
    input.min = "0.01";
    input.max = "9999";
    input.step = "0.01";
    input.placeholder = plan.breakEvenRoiConflict ? "设置冲突" : "未设置";
    input.value = plan.breakEvenRoiValue && Number(plan.breakEvenRoiValue) > 0
      ? String(plan.breakEvenRoiValue) : "";
    input.dataset.savedValue = input.value;
    input.dataset.planId = text(plan.id, "");
    input.dataset.accountKey = text(state.selectedAccountKey, "");
    input.disabled = !plan.canEditRoi || !!breakEvenRoiPending[input.dataset.accountKey + "|" + input.dataset.planId];
    input.setAttribute("aria-label", text(plan.name, "当前计划") + "的保本ROI");
    input.title = "保本ROI由你设置并保留。预估利润＝广告消耗×（平台净成交ROI÷保本ROI－1）；回车或离开保存，清空取消。";
    if (plan.breakEvenRoiConflict) input.title = "多份历史网页设置不同且没有官方值，请确认保本ROI；原记录仍保留。";
    return input;
  }

  function officialMetadataKey(plan) { return text(plan.advertiserId,state.selectedAccountKey)+"|"+text(plan.id,""); }
  function renderOfficialMetadata(host,plan) {
    var signature=JSON.stringify([plan.metadataStatus,plan.metadata,plan.metadataError]);
    if(host.dataset.signature===signature)return;
    host.dataset.signature=signature;clear(host);
    var meta=plan.metadata||{},pending=/^(queued|loading|retrying)$/.test(plan.metadataStatus||"");
    function associatedName() {
      var names=array(meta.awemes).map(function(record){return text(record.aweme_name,"");}).filter(function(name){return !!name;});
      var name=element("span","official-shop-name",names.length?names.join(" / "):"店铺信息待接入");
      name.title=names.length?"计划关联抖音号："+names.join(" / ")+"（非已核实的店铺归属）":"服务器尚未提供已核实的店铺归属";
      return name;
    }
    function item(kind,record) {
      var product=kind==="product",id=text(record[product?"product_id":"aweme_id"],"");
      var name=text(record[product?"product_name":"aweme_name"],"");
      var line=element("div","official-meta-item "+kind),picture=element("span","official-meta-picture",product?"商品":"抖音");
      var url=record[product?"product_image":"aweme_avatar"];
      try {var parsed=new URL(url);if(parsed.protocol==="https:"&&!parsed.username&&!parsed.password){
        var image=document.createElement("img");image.alt=product?"商品缩略图":"抖音号头像";image.loading="lazy";image.referrerPolicy="no-referrer";
        image.addEventListener("error",function(){image.remove();});image.src=parsed.href;picture.appendChild(image);
      }}catch(e){}
      line.appendChild(picture);
      var label=name||(product?"商品":"抖音号")+(id?" · "+id.slice(-4):"");
      var copy=element("span","official-meta-label",label);copy.title=name||("暂未返回名称"+(record.detail_status==="unavailable_in_date_range"?"：所选日期内无商品消耗记录":""));var details=element("span","official-product-copy");details.appendChild(copy);details.appendChild(associatedName());line.appendChild(details);host.appendChild(line);
    }
    array(meta.products).forEach(function(r){item("product",r);});
    if(pending||!plan.metadataStatus)host.appendChild(element("span","official-meta-placeholder","商品信息加载中…"));
    else if(plan.metadataStatus==="failed")host.appendChild(element("span","official-meta-placeholder","补充信息暂未加载，可稍后刷新"));
    else {
      if(!array(meta.products).length)host.appendChild(element("span","official-meta-placeholder","未关联商品"));
      if(!array(meta.products).length)host.appendChild(associatedName());
      if(meta.partial)host.appendChild(element("span","official-meta-placeholder","部分信息暂不可用"));
    }
  }
  function updateOfficialMetadata() {
    var plans={};array(state.plans).forEach(function(p){if(p.isOfficial)plans[officialMetadataKey(p)]=p;});
    nodes.planRows.querySelectorAll(".official-plan-metadata").forEach(function(host){var p=plans[host.dataset.key];if(p)renderOfficialMetadata(host,p);});
  }
  function planStructure() {
    return array(state.plans).map(function(p){if(!p.isOfficial)return p;var row=Object.assign({},p);delete row.metadata;delete row.metadataStatus;delete row.metadataError;return row;});
  }

  function renderPlans(discardBreakEvenDraftKey) {

    var activeBreakEvenInput = document.activeElement;
    var breakEvenDraft = activeBreakEvenInput && nodes.planRows.contains(activeBreakEvenInput) &&
      activeBreakEvenInput.matches("input.roi-inline[data-plan-id]") &&
      activeBreakEvenInput.dataset.accountKey === text(state.selectedAccountKey, "") &&
      activeBreakEvenInput.dataset.accountKey + "|" + activeBreakEvenInput.dataset.planId !== discardBreakEvenDraftKey &&
      !breakEvenRoiPending[activeBreakEvenInput.dataset.accountKey + "|" + activeBreakEvenInput.dataset.planId]
        ? { planId: activeBreakEvenInput.dataset.planId, value: activeBreakEvenInput.value,
          badInput: activeBreakEvenInput.validity.badInput || activeBreakEvenInput.dataset.badInput === "true" } : null;
    var activeTargetRoiInput = nodes.planRows.querySelector("input.target-roi-inline");
    var restoreTargetRoiFocus = !!(activeTargetRoiInput && document.activeElement === activeTargetRoiInput);
    if (activeTargetRoiInput &&
        text(activeTargetRoiInput.dataset.key, "") === targetRoiEditKey) {
      targetRoiEditDraft = activeTargetRoiInput.value || "";
    }
    suppressTargetRoiBlur = true;
    clear(nodes.planRows);
    var qianchuanPage = state.pageMode === "creator-qianchuan";
    var filteredPlans = selectedInScope() ? sortTableRows((qianchuanPage ? creatorQianchuanPlans() : array(state.plans)).filter(planMatches), "plans") : [];
    var plans;
    var planPagination = document.getElementById("qianchuan-plan-pagination");
    if (qianchuanPage) {
      var totalPlanPages = Math.max(1, Math.ceil(filteredPlans.length / qianchuanPlanPageSize));
      qianchuanPlanPage = Math.min(Math.max(1, qianchuanPlanPage), totalPlanPages);
      plans = filteredPlans.slice((qianchuanPlanPage - 1) * qianchuanPlanPageSize,
        qianchuanPlanPage * qianchuanPlanPageSize);
      renderQianchuanPagination(filteredPlans.length, totalPlanPages);
      if (planPagination) planPagination.hidden = false;
    } else {
      qianchuanPlanPage = 1;
      plans = filteredPlans;
      if (planPagination) planPagination.hidden = true;
    }
    var multiplyOnly = activeTab === "multiply" || nodes.planTypeFilter.value === "multiply";
    var hasMultiply = plans.some(function (plan) { return plan.deliveryType === "乘方投放"; });
    document.getElementById("plan-orders-heading").textContent = multiplyOnly ? "净成交订单数" : "订单数";
    renderSortHeaders("plans");
    document.querySelector('[data-sort-table="plans"][data-sort-key="gmv"] .sort-label').textContent = state.officialSelected || multiplyOnly ? "整体成交" : "支付成交额";
    document.getElementById("plan-cpa-heading").textContent = multiplyOnly ? "订单成本" : "成交成本";
    document.getElementById("plan-roi-heading").textContent = state.officialSelected ? "支付ROI" : "净成交ROI";
    nodes.planEmpty.hidden = plans.length > 0;
    if (plans.length > 0 && !state.officialSelected && selectedInScope()) {
      var paintKey = state.selectedAccountKey;
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        var account = array(state.accounts).find(function(a) { return a.key === paintKey; });
        if (state.selectedAccountKey === paintKey && account && account.flowRound &&
            nodes.planRows.dataset.paintedRound !== paintKey + account.flowRound) {
          nodes.planRows.dataset.paintedRound = paintKey + account.flowRound;
          post({type:"plansPainted", key:paintKey});
        }
      }); });
    }
    var officialRetry=document.getElementById("official-plan-retry");
    officialRetry.hidden=!(state.officialSelected && state.officialPlanRetryAvailable && selectedInScope() && array(state.plans).length===0);
    if (plans.length === 0 && nodes.planEmptyMessage) {
      nodes.planEmptyMessage.textContent = !selectedInScope() ? "请在上方选择账户，再查看计划或调整 ROI" : array(state.plans).length > 0
        ? "当前筛选条件没有匹配的计划"
        : text(state.planEmptyMessage, "等待同步：当前账户尚未获得通过校验的真实计划数据");
    }

    if(state.officialSelected) plans=filteredPlans=selectedInScope()?array(state.plans).filter(planMatches):[];
    plans.forEach(function (plan) {
      if(plan.isOfficial) {
        var officialRow=document.createElement("tr");
        var officialName=element("div","official-plan-content");officialName.appendChild(element("strong","",plan.name));
        officialName.appendChild(element("span","official-plan-id","ID 尾号："+text(plan.id,"").slice(-4)));
        var metadata=element("div","official-plan-metadata");metadata.dataset.key=officialMetadataKey(plan);renderOfficialMetadata(metadata,plan);
        appendCell(officialRow,officialName,"",plan.name);
        appendCell(officialRow,metadata,"official-product-column");
        appendCell(officialRow,compactPlanBudget(plan.dailyBudget),"official-amount-column plan-budget-cell",text(plan.dailyBudget,"—"));
        appendCell(officialRow,plan.netGmv||"—","official-amount-column");
        var officialStatus=element("span");setStatus(officialStatus,plan.deliveryStatus);
        appendCell(officialRow,officialStatus);
        [plan.spend,plan.gmv,plan.orders,plan.cpa,plan.roi,plan.targetRoi].forEach(function(v){appendCell(officialRow,v||"—");});
        appendCell(officialRow,breakEvenRoiInput(plan));
        appendCell(officialRow,plan.estimatedProfit||"—");
        var officialProfit=element("span");setStatus(officialProfit,plan.profitStatus||"数据不足");appendCell(officialRow,officialProfit);
        appendCell(officialRow,"只读");
        officialRow.querySelectorAll("td").forEach(function(cell){if(!cell.title)cell.title=cell.textContent;});
        nodes.planRows.appendChild(officialRow);return;
      }
      var row = document.createElement("tr");
      var displayName = text(plan.name, "未命名计划");
      var isCustomName = plan.isCustomName === true ||
        displayName !== text(plan.sourceName, displayName);
      var name = element("div", "plan-name-cell" +
        (plan.canEditName ? " editable" : "") +
        (isCustomName ? " custom-name" : ""));
      name.dataset.planId = text(plan.id, "");
      name.dataset.uiKey = text(plan.uiKey, "");
      name.dataset.editable = plan.canEditName ? "true" : "false";
      if (plan.canEditName) name.title = "双击修改计划名称";
      var planTitle=element("strong", "", displayName);planTitle.title=displayName;name.appendChild(planTitle);
      name.appendChild(element("span", "", document.body.classList.contains("browser-default") ? "ID 尾号："+text(plan.id, "").slice(-4) : text(plan.date, "未取得统计日期")));
      if (plan.deliveryType === "乘方投放") {
        var multiplyButton = element("button", "multiply-data-button", "乘方数据");
        multiplyButton.type = "button";
        multiplyButton.dataset.multiplyKey = text(plan.uiKey, "");
        multiplyButton.title = "查看综合成本、净成交、佣金等15项乘方指标";
        name.appendChild(multiplyButton);
      }
      if (qianchuanPage) {
        var selectedPlanAccount = array(state.accounts).filter(function (account) {
          return account.key === state.selectedAccountKey;
        })[0];
        var planAccountLabel = text(plan.accountName, selectedPlanAccount ? selectedPlanAccount.name : "千川账户");
        appendCell(row, planAccountLabel, "", planAccountLabel);
      }
      appendCell(row, name, "", displayName);

      if (!qianchuanPage) {
        var product=element("div", "browser-product");
        var productName=element("strong", "", text(plan.product, "商品信息待同步"));productName.title=productName.textContent;
        product.appendChild(productName);var shop=element("span", "", text(plan.accountName, "店铺信息待同步"));shop.title=shop.textContent;product.appendChild(shop);
        appendCell(row, product, "official-product-column");
        appendCell(row, compactPlanBudget(plan.budget), "official-amount-column plan-budget-cell", text(plan.budget, "—"));
        appendCell(row, text(plan.netGmv, "—"), "official-amount-column", "千川网页净成交额（1小时退款口径）；未返回时显示 —");
      }
      var deliveryStatus = element("span");
      setStatus(
        deliveryStatus,
        plan.deliveryStatus,
        plan.deliveryStatus === "登录后确认"
          ? "bad"
          : (plan.deliveryStatusCurrent === false ? "warn" : undefined));
      var deliveryStatusHint = text(plan.deliveryStatusHint, "");
      if (deliveryStatusHint) {
        deliveryStatus.title = deliveryStatusHint;
        deliveryStatus.setAttribute(
          "aria-label",
          text(plan.deliveryStatus, "状态待确认") + "；" + deliveryStatusHint);
      }
      appendCell(row, deliveryStatus, "plan-delivery-cell");
      appendCell(row, plan.spend);
      appendCell(row, qianchuanPage ? text(plan.netGmv, "—") : plan.gmv);
      function metricCell(value, multiplyLabel, ordinaryLabel) {
        var multiply = plan.deliveryType === "乘方投放";
        appendCell(row, value, "", multiply ? multiplyLabel : ordinaryLabel);
      }
      metricCell(plan.orders, "净成交订单数", "整体成交订单数");
      if (!qianchuanPage) metricCell(plan.cpa, "综合订单成本", "整体成交订单成本");
      metricCell(plan.roi, "净成交ROI（千川网页值）", "净成交ROI（千川网页值）");

      appendCell(row, plan.targetRoi, "target-roi-table-cell");

      if (qianchuanPage) {
        appendCell(row, breakEvenRoiInput(plan));
        var qianchuanProfitStatus = element("span");
        setStatus(qianchuanProfitStatus, plan.profitStatus);
        appendCell(row, qianchuanProfitStatus);
        var qianchuanDetail = element("button", "qianchuan-detail-button", "查看详情");
        qianchuanDetail.type = "button";
        qianchuanDetail.dataset.command = "loadPlanDetail";
        qianchuanDetail.dataset.key = text(plan.id, "");
        qianchuanDetail.title = "查看计划详情";
        appendCell(row, qianchuanDetail);
        nodes.planRows.appendChild(row);
        return;
      }

      appendCell(row, breakEvenRoiInput(plan));

      var profitClass = text(plan.profitStatus, "") === "盈利" ? "profit" :
        (text(plan.profitStatus, "") === "亏损" ? "loss" : "");
      appendCell(row, plan.estimatedProfit, profitClass);
      var profitStatus = element("span");
      setStatus(profitStatus, plan.profitStatus);
      appendCell(row, profitStatus);


      nodes.planRows.appendChild(row);
    });
    suppressTargetRoiBlur = false;
    if (breakEvenDraft) {
      var roiInputs = nodes.planRows.querySelectorAll("input.roi-inline[data-plan-id]");
      for (var roiIndex = 0; roiIndex < roiInputs.length; roiIndex++) {
        if (roiInputs[roiIndex].dataset.planId !== breakEvenDraft.planId || roiInputs[roiIndex].disabled) continue;
        roiInputs[roiIndex].value = breakEvenDraft.value;
        roiInputs[roiIndex].dataset.badInput = String(breakEvenDraft.badInput);
        roiInputs[roiIndex].focus({ preventScroll: true });
        break;
      }
    }
    if (restoreTargetRoiFocus && targetRoiEditKey) {
      window.requestAnimationFrame(function () { focusTargetRoiInlineEditor(targetRoiEditKey, false); });
    }
    if(window.QianchuanAccountUi)window.QianchuanAccountUi.decoratePlans();
  }

  function renderActions() {
    clear(nodes.actionRows);
    var actions = array(state.actions);
    nodes.actionEmpty.hidden = actions.length > 0;
    actions.forEach(function (item) {
      var row = document.createElement("tr");
      appendCell(row, item.time);
      appendCell(row, item.mode);
      appendCell(row, item.planName, "", text(item.planName, ""));
      appendCell(row, item.action, "", text(item.action, ""));
      appendCell(row, item.reason, "", text(item.reason, ""));
      nodes.actionRows.appendChild(row);
    });
  }

  function renderLogs() {
    var logs = array(state.logs);
    nodes.runLogs.textContent = logs.length ? logs.join("\n") : "暂无运行日志";
  }

  function renderPeriod() {
    var period = text(state.planPeriod, "今日");
    document.querySelectorAll(".period-switch").forEach(function (switchNode) {
      Array.prototype.forEach.call(switchNode.querySelectorAll("button"), function (button) {
        var selected = button.dataset.period === period;
        button.classList.toggle("active", selected);
        button.setAttribute("aria-pressed", selected ? "true" : "false");
      });
    });
  }

  function renderQianchuanPagination(total, pageCount) {
    var countLabel = document.getElementById("qianchuan-plan-count");
    var pageNumbers = document.getElementById("qianchuan-page-numbers");
    var previous = document.getElementById("qianchuan-page-prev");
    var next = document.getElementById("qianchuan-page-next");
    if (countLabel) countLabel.textContent = "共 " + total + " 个计划 · 每页 " + qianchuanPlanPageSize + " 条";
    if (previous) previous.disabled = qianchuanPlanPage <= 1;
    if (next) next.disabled = qianchuanPlanPage >= pageCount;
    if (!pageNumbers) return;
    clear(pageNumbers);
    var pages = [];
    if (pageCount <= 7) {
      for (var page = 1; page <= pageCount; page++) pages.push(page);
    } else {
      pages = [1];
      var first = Math.max(2, qianchuanPlanPage - 1);
      var last = Math.min(pageCount - 1, qianchuanPlanPage + 1);
      if (first > 2) pages.push("…");
      for (var current = first; current <= last; current++) pages.push(current);
      if (last < pageCount - 1) pages.push("…");
      pages.push(pageCount);
    }
    pages.forEach(function (page) {
      if (page === "…") {
        pageNumbers.appendChild(element("span", "page-ellipsis", "…"));
        return;
      }
      var button = element("button", page === qianchuanPlanPage ? "active" : "", String(page));
      button.type = "button";
      button.dataset.page = String(page);
      button.setAttribute("aria-current", page === qianchuanPlanPage ? "page" : "false");
      pageNumbers.appendChild(button);
    });
  }

  function renderTabs() {
    Array.prototype.forEach.call(nodes.moreMenu.querySelectorAll("button[data-tab]"), function (button) {
      button.classList.toggle("active", button.dataset.tab === activeTab);
    });
    var planTab = activeTab === "plans" || activeTab === "volume" || activeTab === "cost" || activeTab === "multiply";
    nodes.plansPanel.hidden = !planTab;
    nodes.actionsPanel.hidden = activeTab !== "actions";
    nodes.logsPanel.hidden = activeTab !== "logs";
  }

  function renderOfficialControls() {
    if(state.officialSelected) document.querySelector('[data-sort-table="plans"][data-sort-key="gmv"] .sort-label').textContent="整体成交";
    var enabled=!!state.officialEnabled && (!state.pageMode || state.pageMode==="accounts");
    if(enabled && state.officialSelected) {if(officialPreviousTab===null)officialPreviousTab=activeTab;activeTab="plans";}
    else if(officialPreviousTab!==null) {activeTab=officialPreviousTab;officialPreviousTab=null;}
    document.body.classList.toggle("official-integrated",enabled);
    document.body.classList.toggle("browser-default",!enabled && (!state.pageMode || state.pageMode==="accounts"));
    document.body.classList.toggle("official-readonly",enabled && !!state.officialSelected);
    var groupingButton=document.getElementById("official-group-shops");groupingButton.hidden=true;groupByShop=false;groupingButton.setAttribute("aria-pressed",String(groupByShop));
    var entry=document.getElementById("official-authorize");entry.hidden=!enabled;
    entry.querySelector(".login-entry-title").textContent=state.officialClosed?"功能内测中":"官方授权";
    var loading=enabled && !state.officialClosed && !!state.officialInitialLoading;
    var loadingDialog=document.getElementById("official-loading-dialog");
    if(loading && !loadingDialog.open)loadingDialog.showModal();
    else if(!loading && loadingDialog.open)loadingDialog.close();
    var message=document.getElementById("official-message");message.hidden=!enabled||loading||!state.officialMessage;message.textContent=state.officialMessage||"";
    document.getElementById("official-done").hidden=!enabled||!state.officialWaiting;
    var updated=document.getElementById("official-update");updated.hidden=!enabled;updated.textContent=state.officialSummaryProgress||("官方数据更新："+(state.officialUpdatedAt||"尚未更新"));
    updated.title="官方账户成交、消耗采用今日商品全域口径；同一广告主已有网页数据时保留网页数据，汇总不重复计入。余额为实时可用余额。";
    var selected=array(state.accounts).find(function(a){return a.key===state.selectedAccountKey;});
    var switcher=document.getElementById("official-source-switch");switcher.hidden=!enabled||!selected||!selected.hasOfficial||selected.isOfficialOnly;
    document.getElementById("official-source-api").classList.toggle("active",!!state.officialSelected);
    document.getElementById("official-source-web").classList.toggle("active",!state.officialSelected);
    document.getElementById("official-scope").hidden=!enabled||!state.officialSelected;
    var planUpdated=document.getElementById("official-plan-updated");
    planUpdated.hidden=!enabled||!state.officialSelected||!state.officialPlanUpdated;
    planUpdated.textContent=state.officialPlanUpdated||"";

  }
  document.getElementById("official-loading-dialog").addEventListener("cancel",function(event){event.preventDefault();});
  var accountModeNoticeShown = {};
  function render() {
    window.QianchuanAccountUi.prepare(state);
    document.getElementById("manage-shop-slots").hidden = true; // Recovery is offered only inside the add/login flow.
    updateConsoleCapabilityBanner();
    renderCreatorControls();
    renderOfficialControls();
    if (state.accountModeNotice && state.accountModeNoticeKey && !accountModeNoticeShown[state.accountModeNoticeKey]) {
      accountModeNoticeShown[state.accountModeNoticeKey] = true;
      showToast(state.accountModeNotice, false);
      executeCommand("acknowledgeAccountModeNotice", state.accountModeNoticeKey, "").catch(function () {});
    }
    var buyinTimes = array(state.accounts).filter(function (a) { return a.accountKind === "creator" && a.buyinCapturedAt; }).map(function (a) { return Date.parse(a.buyinCapturedAt); }).filter(Number.isFinite);
    nodes.lastUpdated.textContent = state.pageMode === "alliance" ? (buyinTimes.length ? new Date(Math.max.apply(null, buyinTimes)).toLocaleString("zh-CN", {month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}) : "尚未同步百应") : text(state.lastUpdated, "等待同步");
    if (nodes.planFreshness) {
      nodes.planFreshness.textContent = text(
        state.planFreshnessMessage,
        "按千川网页净成交ROI与客户设置的保本ROI判断盈亏；缺失或零消耗显示数据不足");
      nodes.planFreshness.classList.toggle("fallback", !!state.planFallbackActive);
      if (state.pageMode === "creator-qianchuan") {
        nodes.planFreshness.textContent = "设置保本ROI，自动判断盈亏 · 与千川账户同步";
        nodes.planFreshness.classList.remove("fallback");
      }
    }
    renderChangedSection("metrics", [state.pageMode, state.metrics, accountKind, qianchuanScopeKey, state.accounts, state.officialSummaryProgress], renderMetrics);
    renderAccounts();
    renderChangedSection("selected", [state.pageMode, accountKind, state.selectedAccountKey, state.accounts], renderSelectedAccount);
    renderChangedSection("period", state.planPeriod, renderPeriod);
    renderTabs();
    renderChangedSection("plans", [state.pageMode, accountKind, state.selectedAccountKey, state.planPeriod, planStructure(),
      state.planEmptyMessage, state.officialPlanRetryAvailable, state.planFallbackActive, activeTab, nodes.planSearch.value,
      nodes.planTypeFilter.value, qianchuanPlanFilter, tableSort.plans, targetRoiEditKey, targetRoiSubmittingKey, state.deleteOutcome], renderPlans);
    updateOfficialMetadata();
    updateTargetRoiCountdowns();
    renderChangedSection("actions", state.actions, renderActions);
    renderChangedSection("logs", state.logs, renderLogs);
    nodes.app.setAttribute("aria-busy", "false");
    nodes.bridgeStatus.textContent = "已连接桌面程序";
    window.QianchuanAccountUi.render(state);
    if (window.QianchuanLoginWizard) window.QianchuanLoginWizard.render(state, function (command, id, value) { return executeCommand(command, id, value || ""); });
    if (window.QianchuanWebTargetRoi) window.QianchuanWebTargetRoi.render(state, function (id, input) {
      return executeCommand("setWebTargetRoi", id, JSON.stringify(input));
    });
  }

  document.querySelectorAll("[data-account-kind]").forEach(function (button) {
    button.addEventListener("click", function () {
      if (deletePending || targetRoiSubmittingKey) return;
      suppressTargetRoiBlur = true; targetRoiEditKey = ""; targetRoiEditDraft = "";
      if (state.pageMode === "alliance") {
        allianceLoginFilter = button.dataset.accountKind === "all" ? "all" : button.dataset.accountKind === "merchant" ? "normal" : "error";
        accountKind = "creator";
      } else {
        accountKind = button.dataset.accountKind;
      }
      render(); suppressTargetRoiBlur = false;
    });
  });
  document.getElementById("official-group-shops").addEventListener("click",function(){groupByShop=!groupByShop;renderOfficialControls();renderAccounts();});
  document.getElementById("official-authorize").addEventListener("click",function(){executeCommand("officialAuthorize","","").catch(function(){});});
  document.getElementById("official-plan-retry").addEventListener("click",function(){executeCommand("officialRetryPlans","","").catch(function(){});});
  document.getElementById("official-done").addEventListener("click",function(){executeCommand("officialDone","","").catch(function(){});});
  document.getElementById("official-source-api").addEventListener("click",function(){var a=array(state.accounts).find(function(a){return a.key===state.selectedAccountKey;});if(a)executeCommand("officialSelect",a.officialId,"").catch(function(){});});
  document.getElementById("official-source-web").addEventListener("click",function(){executeCommand("selectAccount",state.selectedAccountKey,"").catch(function(){});});
  document.getElementById("add-creator-account").addEventListener("click", function () { executeCommand("addCreatorAccount", "", "").catch(function () {}); });
  [["creator-buyin","openCreatorBuyin"],["creator-compass","openCreatorCompass"],["creator-qianchuan","primaryAction"]].forEach(function (entry) {
    document.getElementById(entry[0]).addEventListener("click", function () { executeCommand(entry[1], state.selectedAccountKey, "").catch(function () {}); });
  });

  function findPlan(uiKey) {
    return array(state.plans).filter(function (plan) {
      return text(plan.uiKey, "") === text(uiKey, "");
    })[0] || null;
  }

  function findTargetRoiInlineEditor(uiKey) {
    var inputs = nodes.planRows.querySelectorAll("input.target-roi-inline[data-key]");
    for (var index = 0; index < inputs.length; index++) {
      if (text(inputs[index].dataset.key, "") === text(uiKey, "")) return inputs[index];
    }
    return null;
  }

  function focusTargetRoiInlineEditor(uiKey, selectAll) {
    var input = findTargetRoiInlineEditor(uiKey);
    if (!input || input.disabled) return;
    input.focus();
    if (selectAll) input.select();
  }

  function beginTargetRoiEdit(uiKey) {
    var plan = findPlan(uiKey);
    if (!plan || !canEditTargetRoiNow(plan) || targetRoiSubmittingKey) return;
    targetRoiEditKey = text(plan.uiKey, "");
    targetRoiEditDraft = plan.targetRoiValue && Number(plan.targetRoiValue) > 0
      ? String(plan.targetRoiValue)
      : "";
    targetRoiEditOriginal = targetRoiEditDraft;
    renderPlans();
    window.requestAnimationFrame(function () {
      focusTargetRoiInlineEditor(targetRoiEditKey, true);
    });
  }

  function cancelTargetRoiEdit(input) {
    if (!input || text(input.dataset.key, "") !== targetRoiEditKey) return;
    var uiKey = targetRoiEditKey;
    targetRoiEditKey = "";
    targetRoiEditDraft = "";
    targetRoiEditOriginal = "";
    renderPlans();
    window.requestAnimationFrame(function () {
      var buttons = nodes.planRows.querySelectorAll("button.target-roi-value[data-key]");
      for (var index = 0; index < buttons.length; index++) {
        if (text(buttons[index].dataset.key, "") !== uiKey) continue;
        buttons[index].focus();
        break;
      }
    });
  }

  function saveBreakEvenRoi(input) {
    if (!input || input.disabled || suppressTargetRoiBlur) return;
    var planId = input.dataset.planId || "";
    var accountKey = input.dataset.accountKey || "";
    if (!accountKey || accountKey !== text(state.selectedAccountKey, "")) {
      showToast("当前账户已经切换，请重新选择计划后设置保本ROI。", true);
      renderPlans();
      return;
    }
    if (!planId) {
      showToast("当前计划缺少稳定计划ID，不能保存。", true);
      return;
    }
    var value = (input.value || "").trim();
    var pendingKey = accountKey + "|" + planId;
    var badInput = input.validity.badInput || input.dataset.badInput === "true";
    if (breakEvenRoiPending[pendingKey]) return;
    if (!badInput && (value === input.dataset.savedValue ||
        (value && input.dataset.savedValue && Number(value) === Number(input.dataset.savedValue)))) return;
    if (badInput || (value && (!Number.isFinite(Number(value)) || Number(value) <= 0))) {
      showToast("请输入大于0的保本ROI。", true);
      input.value = input.dataset.savedValue || "";
      input.dataset.badInput = "false";
      return;
    }
    breakEvenRoiPending[pendingKey] = true;
    input.disabled = true;
    executeCommand("setBreakEvenRoi", planId, value)
      .catch(function () {})
      .finally(function () {
        delete breakEvenRoiPending[pendingKey];
        renderPlans(pendingKey);
      });
  }

  function saveTargetRoi(planId, value) {
    if (!planId) {
      showToast("当前计划缺少稳定计划ID，不能修改目标 ROI。", true);
      return null;
    }
    value = (value || "").trim();
    var numericValue = Number(value);
    if (!value || !Number.isFinite(numericValue) || numericValue < 0.01 || numericValue > 10000) {
      showToast("目标 ROI 必须在 0.01 到 10000 之间。", true);
      return null;
    }
    if (Math.abs(numericValue * 100 - Math.round(numericValue * 100)) > 0.000001) {
      showToast("目标 ROI 最多保留两位小数。", true);
      return null;
    }
    return executeCommand("setTargetRoi", planId, String(numericValue));
  }

  function submitTargetRoiEdit(input) {
    if (!input || input.disabled || targetRoiSubmittingKey) return;
    var uiKey = text(input.dataset.key, "");
    var plan = findPlan(uiKey);
    if (!plan || uiKey !== targetRoiEditKey) return;
    var draft = (input.value || "").trim();
    var original = targetRoiEditOriginal;
    if (!draft) {
      cancelTargetRoiEdit(input);
      return;
    }
    if (draft && original && Number(draft) === Number(original)) {
      targetRoiEditKey = "";
      targetRoiEditDraft = "";
      targetRoiEditOriginal = "";
      renderPlans();
      return;
    }
    var request = saveTargetRoi(text(plan.id, ""), draft);
    if (!request) {
      window.setTimeout(function () { focusTargetRoiInlineEditor(uiKey, true); }, 0);
      return;
    }

    targetRoiEditKey = "";
    targetRoiEditDraft = "";
    targetRoiEditOriginal = "";
    targetRoiSubmittingKey = uiKey;
    targetRoiSubmittingValue = String(Number(draft));
    renderPlans();
    request.then(function () {
      targetRoiSubmittingKey = "";
      targetRoiSubmittingValue = "";
      renderPlans();
    }).catch(function () {
      targetRoiSubmittingKey = "";
      targetRoiSubmittingValue = "";
      // The host publishes the latest authoritative platform state before a
      // failed result. Never restore the rejected draft: doing so makes an
      // unsaved value look like the platform's current target ROI.
      targetRoiEditKey = "";
      targetRoiEditDraft = "";
      targetRoiEditOriginal = "";
      renderPlans();
    });
  }

  function setBusy(busy, message) {
    if (targetRoiSubmittingKey || /修改平台目标 ROI/.test(text(message, ""))) {
      nodes.busyOverlay.hidden = true;
      nodes.app.setAttribute("aria-busy", busy ? "true" : "false");
      return;
    }
    nodes.busyOverlay.hidden = !busy;
    nodes.busyText.textContent = text(message, "正在处理，请稍候…");
    nodes.app.setAttribute("aria-busy", busy ? "true" : "false");
  }

  function showToast(message, isError) {
    if (!message) return;
    // Keep the latest outcome visible; repeated clicks must not cover the page
    // with a stack of identical completion messages.
    clear(nodes.toastRegion);
    var toast = element("div", "toast" + (isError ? " error" : ""), message);
    nodes.toastRegion.appendChild(toast);
    window.setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, isError ? 6500 : 3600);
  }

  function handleResult(message) {
    var requestId = text(message.requestId, "");
    var pending = pendingRequests[requestId];
    if (!pending) return;
    delete pendingRequests[requestId];
    if (message.success) pending.resolve(message);
    else pending.reject(new Error(text(message.error, "操作未完成")));
  }

  function handleBridgeMessage(event) {
    var message = event && event.data ? event.data : {};
    if (Number(message.version) !== VERSION) return;
    if (message.type === "state") {
      if (state.selectedAccountKey !== message.selectedAccountKey) {
        suppressTargetRoiBlur = true;
        targetRoiEditKey = ""; targetRoiEditDraft = ""; targetRoiEditOriginal = "";
        qianchuanPlanPage = 1;
      }
      var previousContextAccount = contextAccountKey ? accountByExactKey(contextAccountKey) : null;
      state = message;
      state.accounts = orderAccounts(state.accounts);
        initializeAccountRecordView();
      if (state.pageMode === "creator-qianchuan" && qianchuanScopeKey && !qianchuanScopePending)
        qianchuanScopeKey = state.selectedAccountKey || "";
      var nextContextAccount = contextAccountKey ? accountByExactKey(contextAccountKey) : null;
      if (contextAccountKey && (!nextContextAccount || !nextContextAccount.canRemove ||
          !previousContextAccount || nextContextAccount.name !== previousContextAccount.name)) closeAccountContextMenu();
      var editingTargetRoiPlan = targetRoiEditKey ? findPlan(targetRoiEditKey) : null;
      if (targetRoiEditKey && (!editingTargetRoiPlan || !canEditTargetRoiNow(editingTargetRoiPlan))) {
        targetRoiEditKey = "";
        targetRoiEditDraft = "";
        targetRoiEditOriginal = "";
      }
      render();
      return;
    }
    if (message.type === "busy") { setBusy(!!message.busy, message.text); return; }
    if (message.type === "toast") { showToast(text(message.text, ""), !!message.error); return; }
    if (message.type === "result") handleResult(message);
  }

  document.getElementById("add-account").addEventListener("click", function () {
    executeCommand("addAccount", "", "").catch(function () {});
  });
  document.getElementById("add-qianchuan-account").addEventListener("click", function () {
    executeCommand("addQianchuanAccount", "", "").catch(function () {});
  });
  document.getElementById("sync-all").addEventListener("click", function () {
    executeCommand(state.pageMode === "alliance" ? "syncCreatorAccounts" : "syncAll", "", "").catch(function () {});
  });
  document.getElementById("qianchuan-plan-tabs").addEventListener("click", function (event) {
    var button = event.target.closest("button[data-qianchuan-plan-filter]");
    if (!button) return;
    qianchuanPlanFilter = button.dataset.qianchuanPlanFilter;
    qianchuanPlanPage = 1;
    render();
  });
  document.getElementById("qianchuan-page-prev").addEventListener("click", function () {
    qianchuanPlanPage = Math.max(1, qianchuanPlanPage - 1);
    renderPlans();
  });
  document.getElementById("qianchuan-page-next").addEventListener("click", function () {
    qianchuanPlanPage += 1;
    renderPlans();
  });
  document.getElementById("qianchuan-page-numbers").addEventListener("click", function (event) {
    var button = event.target.closest("button[data-page]");
    if (!button) return;
    qianchuanPlanPage = Number(button.dataset.page) || 1;
    renderPlans();
  });
  document.getElementById("qianchuan-hint-close").addEventListener("click", function () {
    document.getElementById("qianchuan-hint").hidden = true;
  });
  document.getElementById("qianchuan-period-switch").addEventListener("click", function (event) {
    var button = event.target.closest("button[data-period]");
    if (!button) return;
    executeCommand("setPeriod", "", button.dataset.period).catch(function () {});
  });
  nodes.syncSelected.addEventListener("click", function () {
    executeCommand("syncAccount", this.dataset.key || "", "").catch(function () {});
  });
  nodes.openSelected.addEventListener("click", function () {
    executeCommand("primaryAction", this.dataset.key || "", "").catch(function () {});
  });

  document.getElementById("qianchuan-scope-source").addEventListener("change", function () { changeQianchuanScope(this.value); });

  [nodes.accountSearch, nodes.loginFilter].forEach(function (node) {
    node.addEventListener(node.tagName === "INPUT" ? "input" : "change", function () {
      renderAccounts();
    });
  });
  nodes.planSearch.addEventListener("input", function () { qianchuanPlanPage = 1; renderPlans(); });
  nodes.planTypeFilter.addEventListener("change", function () { qianchuanPlanPage = 1; renderPlans(); });

  document.querySelectorAll("[data-sort-table]").forEach(function (button) {
    button.addEventListener("click", function (event) {
      var table = button.dataset.sortTable;
      var sort = tableSort[table];
      var arrow = event.target.closest("[data-sort-direction]");
      sort.direction = arrow ? arrow.dataset.sortDirection :
        (sort.key === button.dataset.sortKey && sort.direction === "desc" ? "asc" : "desc");
      sort.key = button.dataset.sortKey;
      if (table === "accounts") renderAccounts();
      else renderPlans();
    });
  });

  nodes.selectedAccountTrigger.addEventListener("click", function () {
    closeCustomSelects(false);
    setAccountPickerOpen(nodes.accountPicker.hidden, "selected");
  });
  nodes.selectedAccountTrigger.addEventListener("keydown", function (event) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    setAccountPickerOpen(true, event.key === "ArrowUp" ? "last" : "selected");
  });
  nodes.accountPicker.addEventListener("click", function (event) {
    var option = event.target.closest("button[data-account-key]");
    if (!option) return;
    var key = option.dataset.accountKey || "";
    setAccountPickerOpen(false);
    nodes.selectedAccountTrigger.focus();
    if (key !== text(state.selectedAccountKey, "")) selectAccountByExactKey(key);
  });
  nodes.accountPicker.addEventListener("keydown", function (event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveAccountPickerFocus(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      var options = nodes.accountPicker.querySelectorAll("button[data-account-key]");
      if (options.length) options[event.key === "Home" ? 0 : options.length - 1].focus();
    }
  });
  document.addEventListener("click", function (event) {
    document.querySelectorAll("[data-custom-select].open").forEach(function (control) {
      if (!control.contains(event.target)) setCustomSelectOpen(control, false);
    });
    if (!nodes.accountPicker.hidden && !nodes.storeSelector.contains(event.target)) setAccountPickerOpen(false);
    if (!nodes.accountContextMenu.hidden && !nodes.accountContextMenu.contains(event.target)) closeAccountContextMenu();
  });

  nodes.periodSwitch.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-period]");
    if (!button || button.dataset.period === state.planPeriod) return;
    executeCommand("setPeriod", "", button.dataset.period).catch(function () {});
  });

  nodes.moreMenu.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-tab]");
    if (!button) return;
    activeTab = button.dataset.tab;
    nodes.moreMenu.open = false;
    renderTabs();
    renderPlans();
  });

  nodes.accountRows.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-command]");
    if (button) {
      if (state.pageMode === "alliance" && button.dataset.command === "viewCreatorData") {
        creatorDetailKey = creatorDetailKey === button.dataset.key ? "" : button.dataset.key;
        renderAccounts();
        return;
      }
      executeCommand(button.dataset.command, button.dataset.key || "", "").catch(function () {});
      return;
    }
    var row = event.target.closest("tr[data-account-key]");
    if (row) selectAccountByExactKey(row.dataset.accountKey || "");
  });
  nodes.accountRows.addEventListener("contextmenu", function (event) {
    var row = event.target.closest("tr[data-account-key]");
    if (!row) return;
    event.preventDefault();
    event.stopPropagation();
    openAccountContextMenu(accountByExactKey(row.dataset.accountKey || ""), event.clientX, event.clientY);
  });
  nodes.deleteAccountAction.addEventListener("click", function () {
    var key = contextAccountKey || this.dataset.key || "";
    closeAccountContextMenu();
    if (!key) {
      showToast("无法识别要删除的账户，请刷新后重试。", true);
      return;
    }
    executeCommand("removeAccount", key, "").catch(function () {});
  });
  document.addEventListener("contextmenu", function (event) {
    if (!nodes.accountRows.contains(event.target)) closeAccountContextMenu();
  });
  window.addEventListener("resize", function () {
    closeAccountContextMenu();
    closeCustomSelects(false);
  });
  document.addEventListener("scroll", closeAccountContextMenu, true);

  nodes.planRows.addEventListener("click", function (event) {
    var detailButton = event.target.closest("button[data-command='loadPlanDetail']");
    if (detailButton) {
      executeCommand("loadPlanDetail", detailButton.dataset.key || "", "").catch(function () {});
      return;
    }
    var targetRoiButton = event.target.closest("button[data-command='editTargetRoi']");
    if (targetRoiButton) {
      beginTargetRoiEdit(targetRoiButton.dataset.key || "");
    }
  });
  nodes.planRows.addEventListener("change", function (event) {
    var input = event.target.closest("input.roi-inline[data-plan-id]");
    if (input) saveBreakEvenRoi(input);
  });
  nodes.planRows.addEventListener("input", function (event) {
    var breakEvenInput = event.target.closest("input.roi-inline[data-plan-id]");
    if (breakEvenInput) breakEvenInput.dataset.badInput = String(breakEvenInput.validity.badInput);
    var input = event.target.closest("input.target-roi-inline[data-key]");
    if (input && text(input.dataset.key, "") === targetRoiEditKey) {
      targetRoiEditDraft = input.value || "";
    }
  });
  nodes.planRows.addEventListener("keydown", function (event) {
    var roiInput = event.target.closest("input.roi-inline[data-plan-id]");
    if (roiInput && (event.key === "Enter" || event.key === "Escape")) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Enter") saveBreakEvenRoi(roiInput);
      else { roiInput.value = roiInput.dataset.savedValue || ""; roiInput.dataset.badInput = "false"; roiInput.blur(); }
      return;
    }
    var input = event.target.closest("input.target-roi-inline[data-key]");
    if (!input) return;
    if (event.key === "Enter") {
      event.preventDefault();
      submitTargetRoiEdit(input);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelTargetRoiEdit(input);
    }
  });
  nodes.planRows.addEventListener("focusout", function (event) {
    var input = event.target.closest("input.target-roi-inline[data-key]");
    if (!input || suppressTargetRoiBlur) return;
    submitTargetRoiEdit(input);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !nodes.accountContextMenu.hidden) {
      closeAccountContextMenu();
      return;
    }
    if (event.key === "Escape" && !nodes.accountPicker.hidden) {
      setAccountPickerOpen(false);
      nodes.selectedAccountTrigger.focus();
      return;
    }
    if (event.key === "Escape" && document.querySelector("[data-custom-select].open")) {
      closeCustomSelects(true);
      return;
    }
  });

  nodes.planRows.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-multiply-key]");
    if (!button) return;
    var plan = findPlan(button.dataset.multiplyKey);
    if (!plan || plan.deliveryType !== "乘方投放") return;
    var dialog = document.getElementById("multiply-metrics-dialog");
    document.getElementById("multiply-metrics-title").textContent = text(plan.name, "乘方计划");
    document.getElementById("multiply-metrics-scope").textContent = text(plan.date, "") + " · 乘方期间数据 · " + text(plan.deliveryStatus, "");
    var settings = document.getElementById("multiply-plan-settings");
    clear(settings);
    [["计划ID", plan.id], ["每日预算", plan.budget], ["综合营销ROI目标", plan.targetRoi],
      ["商品", plan.product], ["抖音号", plan.multiplyAccounts]].forEach(function (pair) {
      settings.appendChild(element("dt", "", pair[0]));
      settings.appendChild(element("dd", "", text(pair[1], "—")));
    });
    var values = document.getElementById("multiply-metrics-values");
    clear(values);
    array(plan.multiplyMetrics).forEach(function (metric) {
      var item = element("div", "multiply-metric-item");
      item.appendChild(element("dt", "", text(metric.label, "")));
      item.appendChild(element("dd", "", text(metric.value, "—")));
      values.appendChild(item);
    });
    dialog.showModal();
  });

  window.setInterval(updateTargetRoiCountdowns, 1000);
  ["overview", "accounts"].forEach(function (name) {
    document.getElementById(name === "overview" ? "toggle-overview" : "toggle-accounts").addEventListener("click", function () {
      responsiveChoices[name] = this.getAttribute("aria-expanded") === "true";
      updateCompactSections();
      queueFloatingMenus();
    });
  });
  nodes.moreMenu.addEventListener("toggle", queueFloatingMenus);
  window.addEventListener("resize", function () { updateCompactSections(); queueFloatingMenus(); });
  document.addEventListener("scroll", queueFloatingMenus, true);
  updateCompactSections();
  initializeCustomSelects();

  if (bridge) {
    bridge.addEventListener("message", handleBridgeMessage);
    post({ type: "ready" });
  } else {
    nodes.bridgeStatus.textContent = "未连接桌面程序";
    nodes.app.setAttribute("aria-busy", "false");
    render();
    window.setTimeout(function () { showToast("请从创爆桌面软件打开千川账户页面。", true); }, 300);
  }
})();
