(function (root) {
  "use strict";

  function parseExpiry(value) {
    var raw = value == null ? "" : String(value).trim();
    if (!raw) return NaN;
    var normalized = raw.replace(" ", "T");
    if (/^\d{4}-\d{2}-\d{2}T/.test(normalized) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)) normalized += "Z";
    var parsed = Date.parse(normalized);
    return isNaN(parsed) ? Date.parse(raw) : parsed;
  }

  function resolvePlan(value) {
    var raw = value == null ? "" : String(value).trim();
    var normalized = raw.toLowerCase().replace(/[\s-]+/g, "_");
    if (!raw) return { label: "会员版", tone: "plan-unknown" };
    if (normalized === "register_trial_24h" || raw.indexOf("注册试用") >= 0)
      return { label: "体验版", tone: "plan-trial" };
    if (raw.indexOf("旗舰") >= 0 || /(^|_)flagship($|_)/.test(normalized) || /(^|_)enterprise($|_)/.test(normalized))
      return { label: "旗舰版", tone: "plan-flagship" };
    if (raw.indexOf("高级") >= 0 || /(^|_)advanced($|_)/.test(normalized) || /(^|_)pro($|_)/.test(normalized) || /(^|_)premium($|_)/.test(normalized))
      return { label: "高级版", tone: "plan-advanced" };
    if (raw.indexOf("普及") >= 0 || raw.indexOf("基础") >= 0 || /(^|_)standard($|_)/.test(normalized) || /(^|_)basic($|_)/.test(normalized))
      return { label: "普及版", tone: "plan-standard" };
    if (raw.indexOf("体验") >= 0 || raw.indexOf("试用") >= 0 || /(^|_)trial($|_)/.test(normalized) || /(^|_)experience($|_)/.test(normalized))
      return { label: "体验版", tone: "plan-trial" };
    return { label: raw, tone: "plan-unknown" };
  }

  function status(plan, detail, tone, title) {
    var detailText = detail ? " / " + detail : "";
    return {
      text: plan.label + detailText,
      planText: plan.label,
      detailText: detailText,
      tone: tone,
      planTone: plan.tone,
      title: title
    };
  }

  function format(account, nowValue) {
    var current = account || {};
    var rawPlan = current.membershipPlan == null ? "" : String(current.membershipPlan).trim();
    if (current.membershipActive !== true) {
      return status({ label: "未激活", tone: "plan-unknown" }, "", "inactive", "当前版本尚未激活");
    }
    var plan = resolvePlan(rawPlan);
    var expiresAt = parseExpiry(current.membershipExpiresAt);
    if (isNaN(expiresAt)) {
      return status(plan, "永久有效", "active", rawPlan ? plan.label + " · 永久有效" : "授权永久有效");
    }
    var remaining = expiresAt - Number(nowValue == null ? Date.now() : nowValue);
    var expiresText = new Date(expiresAt).toLocaleString("zh-CN", { hour12: false });
    if (remaining <= 0) {
      return status(plan, "已过期", "expired", (rawPlan ? plan.label + " · " : "") + "已于 " + expiresText + " 到期");
    }
    var remainingDays = Math.max(1, Math.ceil(remaining / 86400000));
    var statusText = remainingDays + "天";
    return status(plan, statusText, "active", (rawPlan ? plan.label + " · " : "") + "有效期至 " + expiresText);
  }

  root.QianchuanMembershipStatus = { parseExpiry: parseExpiry, resolvePlan: resolvePlan, format: format };
}(typeof window !== "undefined" ? window : globalThis));
