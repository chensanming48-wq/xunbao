(function (root) {
  "use strict";
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
      if (!values.length) return rows.length ? "—" : money ? "¥0" : "0";
      var sum = values.reduce(function (s, v) { return s + (money ? Math.round(v * 100) : v); }, 0);
      return money ? "¥" + (sum / 100).toLocaleString("zh-CN", {minimumFractionDigits: 2, maximumFractionDigits: 2}) : sum.toLocaleString("zh-CN");
    }
    var status = "百应近7日 · 已汇总 " + valid.length + "/" + rows.length + " 个达人";
    if (sourceTime) status += " · 来源更新 " + new Date(sourceTime * 1000).toLocaleDateString("zh-CN", {timeZone: "Asia/Shanghai"});
    return {
      accountCount: String(rows.length), normalCount: String(rows.filter(function (a) { return a.buyinVerified === true; }).length),
      gmv: total("buyinGmv", true), orders: total("buyinOrders", false), customers: total("buyinCustomers", false), commission: total("buyinCommission", true),
      accountCountNote: "已接入达人账号（同一身份去重）", normalCountNote: "百应登录已校验",
      gmvNote: status + "；结算有效成交金额", ordersNote: status + "；结算有效成交订单量",
      customersNote: status + "；各账号成交人数合计，未跨账号去重",
      commissionNote: status + "；预估佣金收入，仅计入单位明确的数据，不含提现余额",
      summaryNote: status
    };
  }
  root.CreatorBuyinSummary = { summarize: summarize };
  if (typeof module !== "undefined" && module.exports) module.exports = root.CreatorBuyinSummary;
})(typeof window === "undefined" ? globalThis : window);
