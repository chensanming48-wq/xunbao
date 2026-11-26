(function () {
  'use strict';
  var modal = document.getElementById('resetModal');
  var form = document.getElementById('resetForm');
  var phone = document.getElementById('resetPhone');
  var code = document.getElementById('resetCode');
  var password = document.getElementById('resetPassword');
  var confirm = document.getElementById('resetConfirm');
  var send = document.getElementById('resetCodeButton');
  var submit = document.getElementById('resetSubmit');
  var close = document.getElementById('resetClose');
  var message = document.getElementById('resetMessage');
  var pending = null;
  var timeout = 0;
  var cooldownUntil = 0;
  var timer = 0;
  var requestedPhone = '';
  var sequence = 0;
  function notice(text, tone) { message.textContent = text; message.dataset.tone = tone || 'error'; }
  function refresh() {
    var seconds = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
    send.disabled = Boolean(pending) || seconds > 0;
    send.textContent = pending && pending.kind === 'code' ? '正在发送…' : seconds ? seconds + ' 秒后重试' : '获取短信';
    [phone, code, password, confirm, submit, close].forEach(function (el) { el.disabled = Boolean(pending); });
    submit.textContent = pending && pending.kind === 'reset' ? '正在验证并重设…' : '确认重设密码';
    if (!seconds && timer) { clearInterval(timer); timer = 0; }
  }
  function finish() { clearTimeout(timeout); timeout = 0; pending = null; refresh(); }
  function request(kind, payload) {
    if (!window.chrome || !window.chrome.webview) { notice('请在创爆客户端内使用短信找回密码'); return; }
    pending = { kind: kind, id: String(Date.now()) + '-' + (++sequence), phone: phone.value.trim() };
    payload.requestId = pending.id;
    refresh();
    timeout = setTimeout(function () { finish(); notice('服务器响应超时，请稍后重试；若已收到短信，可直接输入验证码。'); }, 45000);
    try { window.chrome.webview.postMessage(payload); }
    catch (_) { finish(); notice('请求未能发送，请重新打开登录窗口'); }
  }
  function hide() {
    if (pending) return;
    modal.hidden = true;
    code.value = password.value = confirm.value = '';
    document.getElementById('forgotButton').focus();
  }
  window.chuangbaoOpenReset = function () {
    if (pending) return;
    var account = document.getElementById('accountInput').value.trim();
    if (/^1[3-9]\d{9}$/.test(account)) phone.value = account;
    if (phone.value !== requestedPhone) code.value = '';
    password.value = confirm.value = '';
    notice('', 'info'); modal.hidden = false; refresh(); phone.focus();
  };
  close.addEventListener('click', hide);
  modal.addEventListener('mousedown', function (event) { if (event.target === modal) hide(); });
  modal.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); hide(); }
    if (event.key !== 'Tab') return;
    var controls = Array.from(modal.querySelectorAll('button,input')).filter(function (el) { return !el.disabled; });
    if (!controls.length) { event.preventDefault(); return; }
    var first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  [phone, code].forEach(function (input) { input.addEventListener('input', function () {
    input.value = input.value.replace(/\D/g, '').slice(0, input.maxLength);
    if (input === phone && phone.value !== requestedPhone) code.value = '';
    notice('', 'info');
  }); });
  send.addEventListener('click', function () {
    if (pending || cooldownUntil > Date.now()) return;
    if (!/^1[3-9]\d{9}$/.test(phone.value.trim())) { notice('请输入正确的 11 位手机号码'); phone.focus(); return; }
    notice('正在发送短信验证码…', 'info');
    request('code', { type: 'requestPasswordResetCode', phone: phone.value.trim() });
  });
  form.addEventListener('submit', function (event) {
    event.preventDefault(); if (pending) return;
    if (!/^1[3-9]\d{9}$/.test(phone.value.trim())) { notice('请输入正确的 11 位手机号码'); phone.focus(); return; }
    if (!/^\d{6}$/.test(code.value)) { notice('请输入 6 位短信验证码'); code.focus(); return; }
    if (password.value.length < 6 || password.value.length > 128) { notice('新密码需要 6～128 位'); password.focus(); return; }
    if (password.value !== confirm.value) { notice('两次输入的密码不一致'); confirm.focus(); return; }
    notice('正在验证手机号并重设密码…', 'info');
    request('reset', { type: 'resetPassword', phone: phone.value.trim(), verificationCode: code.value, password: password.value, confirmPassword: confirm.value });
  });
  window.chuangbaoResetReceive = function (result) {
    if (!result || !/^passwordReset(Code)?Result$/.test(result.type)) return false;
    if (!pending || result.requestId !== pending.id) return true;
    var completed = pending;
    finish();
    notice(result.message || '请稍后重试', result.success ? 'success' : 'error');
    if (completed.kind === 'code' && result.success) {
      requestedPhone = completed.phone;
      cooldownUntil = Date.now() + Math.max(1, Number(result.resendSeconds) || 60) * 1000;
      if (timer) clearInterval(timer);
      timer = setInterval(refresh, 250); refresh(); code.focus();
    } else if (completed.kind === 'reset' && result.success) {
      hide();
      document.getElementById('accountInput').value = result.phone || completed.phone;
      document.getElementById('passwordInput').value = '';
      document.getElementById('rememberInput').checked = false;
      window.chuangbaoHostReceive({ type: 'notice', tone: 'success', message: '密码已重设，请使用新密码登录。' });
      document.getElementById('passwordInput').focus();
    }
    return true;
  };
})();
