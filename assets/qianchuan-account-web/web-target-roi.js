/* Web-session-only adapter for the handed-off confirmation UI. Native revalidates everything. */
(function () {
  "use strict";
  var current = {}, send;
  function validate(request) {
    var p = (current.plans || []).find(function (item) { return item.id === request.planId && String(item.uiKey || item.id) === request.uiKey; });
    if (current.officialSelected) throw new Error("此入口仅支持网页登录的计划，官方账户不能通过此入口修改；本次没有提交。");
    if (current.selectedAccountKey !== request.accountKey) throw new Error("当前账户已切换，请在目标账户重新打开确认条；本次没有提交。");
    if (!p || !/^\d{6,32}$/.test(p.id || "")) throw new Error("当前计划已变化或计划 ID 未核实，请刷新计划后重新打开确认条；本次没有提交。");
    if (!/^\d{6,32}$/.test(p.webTargetRoiAdvertiserId || "") || p.webTargetRoiAdvertiserId !== request.advertiserId)
      throw new Error("千川广告账户绑定已变化或尚未核实，请完成账户选择并同步计划；本次没有提交。");
    if (String(p.targetRoiValue) !== String(request.expectedValue)) throw new Error("平台目标 ROI 已变化，请重新打开确认条核对当前值；本次没有提交。");
    if (typeof request.expectedEnabled !== "boolean" || typeof p.deliveryEnabled !== "boolean")
      throw new Error("计划投放状态尚未核实，请刷新计划确认是暂停还是投放中；本次没有提交。");
    if (p.deliveryEnabled !== request.expectedEnabled) throw new Error("计划启停状态已变化，请重新打开确认条核对状态；本次没有提交。");
    if (p.webTargetRoiEditable !== true)
      throw new Error(p.webTargetRoiBlockReason || "计划修改安全检查未完成，请刷新计划；仍失败请导出诊断，本次没有提交。");
    return { accountKey: request.accountKey, advertiserId: request.advertiserId, planId: request.planId,
      expectedValue: String(request.expectedValue), value: String(request.value), expectedEnabled: request.expectedEnabled };
  }
  window.QianchuanWebTargetRoi = { render: function (state, sender) {
    current = state || {}; send = sender;
    window.QianchuanAccountUi.connectTargetRoi(function (request) {
      return Promise.resolve().then(function () { var payload = validate(request); return send(payload.planId, payload); });
    });
  } };
})();
