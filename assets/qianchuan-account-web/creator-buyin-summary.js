(function (root) {
  "use strict";
  // Login evidence is independent of metrics. Cached identity and transport
  // failures alone are neither a live login nor proof of expiration.
  function loginState(account) {
    if (/^(valid|expired|checking|rejected|unverified|notLoggedIn)$/.test(account.buyinLoginState || "")) return account.buyinLoginState;
    if (account.buyinLoginVerified === true) return "valid";
    if (/登录.*失效|登录.*过期/.test(account.loginStatus || "")) return "expired";
    if (account.buyinSyncing) return "checking";
    return account.buyinIdentity ? "unverified" : "notLoggedIn";
  }
  function loginPresentation(account) {
    var status = loginState(account);
    return {
      state: status,
      label: {valid: "● 已登录", expired: "登录已失效，请重新登录", checking: "校验中…",
        rejected: "达人身份不匹配，请重新登录", unverified: "尚未校验", notLoggedIn: "尚未登录"}[status],
      tone: status === "valid" ? "good" : status === "expired" || status === "rejected" ? "bad" : "neutral",
      abnormal: status === "expired" || status === "rejected"
    };
  }
  function metric(account, key, money) {
    var value = account[key];
    var available = account.buyinVerified === true && !account.buyinError && Number.isFinite(value) && value >= 0;
    return {available: available, text: available
      ? (money ? "¥" : "") + value.toLocaleString("zh-CN", money ? {minimumFractionDigits: 2, maximumFractionDigits: 2} : {})
      : "—", note: available ? "" : "未同步"};
  }
  function summarize(accounts, now) {
    now = now === undefined ? Date.now() : now;
    var creators = accounts.filter(function (a) { return a.accountKind === "creator"; });
    var unique = new Map();
    creators.forEach(function (a) {
      var key = a.buyinIdentity || a.key;
      var old = unique.get(key);
      if (!old || (a.buyinVerified && !old.buyinVerified) ||
        (a.buyinVerified === old.buyinVerified && Date.parse(a.buyinCapturedAt) > Date.parse(old.buyinCapturedAt))) unique.set(key, a);
    });
    var rows = Array.from(unique.values());
    var valid = rows.filter(function (a) {
      var age = now - Date.parse(a.buyinCapturedAt);
      return a.buyinVerified === true && !a.buyinError && a.buyinIdentity && a.buyinPeriod === 2 &&
        age >= -60000 && age <= 86400000 && Number.isFinite(a.buyinUpdateTime) && a.buyinUpdateTime > 0;
    });
    var sourceTime = valid.reduce(function (n, a) { return Math.max(n, a.buyinUpdateTime); }, 0);
    valid = valid.filter(function (a) { return a.buyinUpdateTime === sourceTime; });
    function total(key, money) {
      var values = valid.map(function (a) { return a[key]; }).filter(function (v) { return Number.isFinite(v) && v >= 0; });
      if (!values.length) return "—";
      var sum = values.reduce(function (s, v) { return s + (money ? Math.round(v * 100) : v); }, 0);
      return money ? "¥" + (sum / 100).toLocaleString("zh-CN", {minimumFractionDigits: 2, maximumFractionDigits: 2}) : sum.toLocaleString("zh-CN");
    }
    var status = "百应近7日 · 已汇总 " + valid.length + "/" + rows.length + " 个达人";
    if (sourceTime) status += " · 来源更新 " + new Date(sourceTime * 1000).toLocaleDateString("zh-CN", {timeZone: "Asia/Shanghai"});
    function note(key, description) {
      var count = valid.filter(function (a) { return Number.isFinite(a[key]) && a[key] >= 0; }).length;
      return (count ? "已同步 " + count + "/" + rows.length + " 个达人" + (count < rows.length ? "，其余未同步" : "") : "未同步") + "；" + description;
    }
    return {
      accountCount: String(rows.length), normalCount: String(rows.filter(function (a) { return loginState(a) === "valid"; }).length),
      gmv: total("buyinGmv", true), orders: total("buyinOrders", false), customers: total("buyinCustomers", false), commission: total("buyinCommission", true),
      accountCountNote: "已接入达人账号（同一身份去重）", normalCountNote: "百应登录已校验",
      gmvNote: note("buyinGmv", "结算有效成交金额"), ordersNote: note("buyinOrders", "结算有效成交订单量"),
      customersNote: note("buyinCustomers", "各账号成交人数合计，未跨账号去重"),
      commissionNote: note("buyinCommission", "预估佣金收入，不含提现余额"),
      summaryNote: status
    };
  }
  root.CreatorBuyinSummary = { summarize: summarize, loginState: loginState, loginPresentation: loginPresentation, metric: metric };
  if (typeof module !== "undefined" && module.exports) module.exports = root.CreatorBuyinSummary;
})(typeof window === "undefined" ? globalThis : window);
