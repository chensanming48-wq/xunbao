(function () {
  "use strict";
  var accountInput = document.getElementById("accountInput");
  var passwordInput = document.getElementById("passwordInput");
  var rememberInput = document.getElementById("rememberInput");
  var loginForm = document.getElementById("loginForm");
  var loginButton = document.getElementById("loginButton");
  var formMessage = document.getElementById("formMessage");
  var passwordToggle = document.getElementById("passwordToggle");
  var registerModal = document.getElementById("registerModal");
  var registerForm = document.getElementById("registerForm");
  var registerPhone = document.getElementById("registerPhone");
  var registerCode = document.getElementById("registerCode");
  var requestCodeButton = document.getElementById("requestCodeButton");
  var registerPassword = document.getElementById("registerPassword");
  var registerConfirm = document.getElementById("registerConfirm");
  var registerMessage = document.getElementById("registerMessage");
  var registerSubmit = document.getElementById("registerSubmit");
  var registrationCodeDialog = document.getElementById("registrationCodeDialog");
  var registrationCodeValue = document.getElementById("registrationCodeValue");
  var cloudLoginModal = document.getElementById("cloudLoginModal");
  var cloudLoginForm = document.getElementById("cloudLoginForm");
  var cloudLoginPhone = document.getElementById("cloudLoginPhone");
  var cloudLoginCode = document.getElementById("cloudLoginCode");
  var cloudLoginDescription = document.getElementById("cloudLoginDescription");
  var cloudLoginMessage = document.getElementById("cloudLoginMessage");
  var cloudLoginSubmit = document.getElementById("cloudLoginSubmit");
  var cloudLoginClose = document.getElementById("cloudLoginClose");
  var loginCodeButton = document.getElementById("loginCodeButton");
  var busy = false;
  var codeRequestBusy = false;
  var codeCountdownTimer = 0;
  var codeCountdownRemaining = 0;
  var codeRequestedPhone = "";
  var loginCodeRequestBusy = false;
  var loginCodeCountdownTimer = 0;
  var loginCodeCountdownRemaining = 0;
  var mainlandPhonePattern = /^1[3-9]\d{9}$/;

  function post(message) { if (window.chrome && window.chrome.webview) window.chrome.webview.postMessage(message); }
  function showMessage(text, tone) {
    formMessage.textContent = text || "";
    formMessage.dataset.tone = tone || "info";
    formMessage.classList.toggle("is-visible", Boolean(text));
  }
  function setBusy(value, message) {
    busy = Boolean(value);
    loginButton.disabled = busy;
    registerSubmit.disabled = busy;
    cloudLoginSubmit.disabled = busy;
    cloudLoginClose.disabled = busy;
    refreshCodeButton();
    refreshLoginCodeButton();
    document.querySelector(".button-label").textContent = busy ? "正在验证…" : "登 录";
    cloudLoginSubmit.textContent = busy ? "正在验证…" : "验证并登录";
    if (busy) showMessage("", "info");
  }
  function isBrandAdministrator(value) {
    const account = String(value || "").toLowerCase();
    return account === "chuangbao" || Boolean(window.desktopBrand && window.desktopBrand.adminAccount && account === window.desktopBrand.adminAccount.toLowerCase());
  }
  function validate(account, password) {
    if (!mainlandPhonePattern.test(account.trim()) && !isBrandAdministrator(account.trim())) return "请输入正确的 11 位手机号码";
    if (!password) return "请输入登录密码";
    if (password.length < 6) return "密码至少需要 6 位";
    return "";
  }
  function showRegisterMessage(text, tone) {
    registerMessage.textContent = text || "";
    registerMessage.dataset.tone = tone || "error";
  }
  function refreshCodeButton() {
    if (busy || codeRequestBusy) {
      requestCodeButton.disabled = true;
      requestCodeButton.textContent = codeRequestBusy ? "正在获取…" : "获取验证码";
      return;
    }
    if (codeCountdownRemaining > 0) {
      requestCodeButton.disabled = true;
      requestCodeButton.textContent = codeCountdownRemaining + " 秒后重试";
      return;
    }
    requestCodeButton.disabled = false;
    requestCodeButton.textContent = "获取验证码";
  }
  function stopCodeCountdown() {
    if (codeCountdownTimer) window.clearInterval(codeCountdownTimer);
    codeCountdownTimer = 0;
    codeCountdownRemaining = 0;
    refreshCodeButton();
  }
  function startCodeCountdown(seconds, phone) {
    stopCodeCountdown();
    codeRequestedPhone = phone || "";
    codeCountdownRemaining = Math.max(1, Number(seconds) || 60);
    refreshCodeButton();
    codeCountdownTimer = window.setInterval(function () {
      codeCountdownRemaining -= 1;
      if (codeCountdownRemaining <= 0) stopCodeCountdown();
      else refreshCodeButton();
    }, 1000);
  }
  function showCloudLoginMessage(text, tone) {
    cloudLoginMessage.textContent = text || "";
    cloudLoginMessage.dataset.tone = tone || "error";
  }
  function refreshLoginCodeButton() {
    if (busy || loginCodeRequestBusy) {
      loginCodeButton.disabled = true;
      loginCodeButton.textContent = loginCodeRequestBusy ? "正在获取…" : "获取验证码";
      return;
    }
    if (loginCodeCountdownRemaining > 0) {
      loginCodeButton.disabled = true;
      loginCodeButton.textContent = loginCodeCountdownRemaining + " 秒后重试";
      return;
    }
    loginCodeButton.disabled = false;
    loginCodeButton.textContent = "获取验证码";
  }
  function stopLoginCodeCountdown() {
    if (loginCodeCountdownTimer) window.clearInterval(loginCodeCountdownTimer);
    loginCodeCountdownTimer = 0;
    loginCodeCountdownRemaining = 0;
    refreshLoginCodeButton();
  }
  function startLoginCodeCountdown(seconds) {
    stopLoginCodeCountdown();
    loginCodeCountdownRemaining = Math.max(1, Number(seconds) || 60);
    refreshLoginCodeButton();
    loginCodeCountdownTimer = window.setInterval(function () {
      loginCodeCountdownRemaining -= 1;
      if (loginCodeCountdownRemaining <= 0) stopLoginCodeCountdown();
      else refreshLoginCodeButton();
    }, 1000);
  }
  function openCloudLogin(phone, message) {
    registerModal.hidden = true;
    if (registrationCodeDialog.open) registrationCodeDialog.close();
    loginCodeRequestBusy = false;
    stopLoginCodeCountdown();
    cloudLoginPhone.value = phone || "";
    cloudLoginCode.value = "";
    cloudLoginDescription.textContent = message || "为了保护账号安全，请重新验证注册手机号。";
    showCloudLoginMessage("", "info");
    cloudLoginModal.hidden = false;
    refreshLoginCodeButton();
    window.setTimeout(function () { loginCodeButton.focus(); }, 30);
  }
  function closeCloudLogin(notifyHost) {
    if (busy) return;
    cloudLoginModal.hidden = true;
    cloudLoginCode.value = "";
    loginCodeRequestBusy = false;
    stopLoginCodeCountdown();
    if (notifyHost) post({ type: "cancelCloudLogin" });
    accountInput.focus();
  }
  function validateRegistration(phone, code, password, confirmPassword) {
    if (!phone) return "请输入手机号码";
    if (!mainlandPhonePattern.test(phone)) return "请输入正确的 11 位手机号码";
    if (!/^\d{6}$/.test(code)) return "请输入 6 位数字验证码";
    if (!password) return "请设置登录密码";
    if (password.length < 6) return "密码至少需要 6 位";
    if (password !== confirmPassword) return "两次输入的密码不一致";
    return "";
  }
  function openRegister() {
    var loginAccount = accountInput.value.trim();
    registerPhone.value = mainlandPhonePattern.test(loginAccount) ? loginAccount : "";
    registerCode.value = "";
    registerPassword.value = "";
    registerConfirm.value = "";
    showRegisterMessage("", "info");
    registerModal.hidden = false;
    window.setTimeout(function () { registerPhone.focus(); }, 30);
  }
  function closeRegister() {
    if (busy) return;
    registerModal.hidden = true;
    if (registrationCodeDialog.open) registrationCodeDialog.close();
    accountInput.focus();
  }

  registrationCodeDialog.addEventListener("close", function () {
    registrationCodeValue.textContent = "";
    if (!registerModal.hidden) registerCode.focus();
  });

  loginForm.addEventListener("submit", function (event) {
    event.preventDefault();
    if (busy) return;
    var account = accountInput.value.trim();
    var password = passwordInput.value;
    var error = validate(account, password);
    if (error) { showMessage(error, "error"); (account ? passwordInput : accountInput).focus(); return; }
    setBusy(true, "正在安全验证…");
    post({ type: "login", account: account, password: password, remember: rememberInput.checked });
  });
  registerForm.addEventListener("submit", function (event) {
    event.preventDefault();
    if (busy) return;
    var phone = registerPhone.value.trim();
    var verificationCode = registerCode.value.trim();
    var password = registerPassword.value;
    var confirmPassword = registerConfirm.value;
    var error = validateRegistration(phone, verificationCode, password, confirmPassword);
    if (error) { showRegisterMessage(error, "error"); return; }
    busy = true;
    registerSubmit.disabled = true;
    refreshCodeButton();
    registerSubmit.textContent = "正在创建账号…";
    showRegisterMessage("", "info");
    post({ type: "register", phone: phone, verificationCode: verificationCode, password: password, confirmPassword: confirmPassword, remember: rememberInput.checked });
  });
  cloudLoginForm.addEventListener("submit", function (event) {
    event.preventDefault();
    if (busy) return;
    var verificationCode = cloudLoginCode.value.trim();
    if (!/^\d{6}$/.test(verificationCode)) {
      showCloudLoginMessage("请输入 6 位数字验证码", "error");
      cloudLoginCode.focus();
      return;
    }
    setBusy(true, "正在验证登录手机号…");
    showCloudLoginMessage("正在验证，请稍候…", "info");
    post({ type: "completeCloudLogin", verificationCode: verificationCode });
  });
  requestCodeButton.addEventListener("click", function () {
    if (busy || codeRequestBusy || codeCountdownRemaining > 0) return;
    var phone = registerPhone.value.trim();
    if (!mainlandPhonePattern.test(phone)) {
      showRegisterMessage("请输入正确的 11 位手机号码", "error");
      registerPhone.focus();
      return;
    }
    codeRequestBusy = true;
    showRegisterMessage("正在发送短信验证码…", "info");
    refreshCodeButton();
    post({ type: "requestVerificationCode", phone: phone });
  });
  loginCodeButton.addEventListener("click", function () {
    if (busy || loginCodeRequestBusy || loginCodeCountdownRemaining > 0) return;
    if (!mainlandPhonePattern.test(cloudLoginPhone.value.trim())) {
      showCloudLoginMessage("登录手机号无效，请返回后重新登录", "error");
      return;
    }
    loginCodeRequestBusy = true;
    showCloudLoginMessage("正在发送短信验证码…", "info");
    refreshLoginCodeButton();
    post({ type: "requestLoginVerificationCode" });
  });
  passwordToggle.addEventListener("click", function () {
    var reveal = passwordInput.type === "password";
    passwordInput.type = reveal ? "text" : "password";
    passwordToggle.classList.toggle("is-visible", reveal);
    passwordToggle.setAttribute("aria-label", reveal ? "隐藏密码" : "显示密码");
    passwordToggle.title = reveal ? "隐藏密码" : "显示密码";
    passwordInput.focus();
  });
  document.getElementById("minimizeButton").addEventListener("click", function () { post({ type: "minimize" }); });
  document.getElementById("closeButton").addEventListener("click", function () { post({ type: "close" }); });
  document.getElementById("forgotButton").addEventListener("click", function () { if (!busy) window.chuangbaoOpenReset(); });
  document.getElementById("registerButton").addEventListener("click", openRegister);
  document.getElementById("registerClose").addEventListener("click", closeRegister);
  registerModal.addEventListener("mousedown", function (event) { if (event.target === registerModal) closeRegister(); });
  cloudLoginClose.addEventListener("click", function () { closeCloudLogin(true); });
  cloudLoginModal.addEventListener("mousedown", function (event) { if (event.target === cloudLoginModal) closeCloudLogin(true); });
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if (registrationCodeDialog.open) {
      event.preventDefault();
      registrationCodeDialog.close();
      return;
    }
    if (!cloudLoginModal.hidden) { event.preventDefault(); closeCloudLogin(true); }
    else if (!registerModal.hidden) { event.preventDefault(); closeRegister(); }
  });
  document.querySelectorAll("[data-drag-region]").forEach(function (region) { region.addEventListener("mousedown", function (event) { if (event.button === 0) post({ type: "dragStart" }); }); });
  [accountInput, passwordInput].forEach(function (input) { input.addEventListener("input", function () { showMessage("", "info"); }); });
  accountInput.addEventListener("input", function () {
    var value = accountInput.value.trim();
    // Allow typing the owner's explicit administrator exception progressively.
    accountInput.value = value && ("chuangbao".indexOf(value.toLowerCase()) === 0 || Boolean(window.desktopBrand && window.desktopBrand.adminAccount && window.desktopBrand.adminAccount.toLowerCase().indexOf(value.toLowerCase()) === 0))
      ? value : value.replace(/\D/g, "").slice(0, 11);
  });
  [registerPhone, registerCode].forEach(function (input) {
    input.addEventListener("input", function () {
      input.value = input.value.replace(/\D/g, "").slice(0, Number(input.maxLength) || 64);
      showRegisterMessage("", "info");
      if (input === registerPhone && codeRequestedPhone && input.value !== codeRequestedPhone) {
        codeRequestedPhone = "";
        registerCode.value = "";
        stopCodeCountdown();
      }
    });
  });
  [registerPassword, registerConfirm].forEach(function (input) { input.addEventListener("input", function () { showRegisterMessage("", "info"); }); });
  cloudLoginCode.addEventListener("input", function () {
    cloudLoginCode.value = cloudLoginCode.value.replace(/\D/g, "").slice(0, 6);
    showCloudLoginMessage("", "info");
  });

  window.chuangbaoHostReceive = function (message) {
    if (!message || typeof message.type !== "string") return;
    if (window.chuangbaoResetReceive(message)) return;
    if (message.type === "initialState") {
      var rememberedPhoneIsValid = mainlandPhonePattern.test(message.account || "") || isBrandAdministrator(message.account);
      accountInput.value = rememberedPhoneIsValid ? message.account : "";
      passwordInput.value = rememberedPhoneIsValid ? (message.password || "") : "";
      rememberInput.checked = Boolean(message.remember);
      window.setTimeout(function () { (accountInput.value ? passwordInput : accountInput).focus(); }, 50);
    } else if (message.type === "busy") {
      setBusy(Boolean(message.busy), message.message || "");
    } else if (message.type === "notice") {
      showMessage(message.message || "", message.tone || "info");
    } else if (message.type === "loginResult") {
      setBusy(false, "");
      showMessage(message.message || "", message.success ? "success" : "error");
    } else if (message.type === "cloudLoginRequired") {
      setBusy(false, "");
      openCloudLogin(message.phone || "", message.message || "");
    } else if (message.type === "loginVerificationCodeResult") {
      loginCodeRequestBusy = false;
      showCloudLoginMessage(message.message || "", message.success ? "success" : "error");
      if (message.success) {
        startLoginCodeCountdown(message.resendSeconds || 60);
        cloudLoginCode.focus();
      } else {
        refreshLoginCodeButton();
      }
    } else if (message.type === "cloudLoginResult") {
      setBusy(false, "");
      if (message.success) {
        showCloudLoginMessage(message.message || "手机号验证成功", "success");
        cloudLoginModal.hidden = true;
      } else if (message.sessionEstablished) {
        closeCloudLogin(false);
        showMessage(message.message || "云端登录已更新，请重试", "error");
      } else {
        showCloudLoginMessage(message.message || "手机号验证失败", "error");
        cloudLoginCode.focus();
      }
    } else if (message.type === "activationResult") {
      setBusy(false, "");
      showMessage(message.message || "", message.success ? "success" : "error");
    } else if (message.type === "verificationCodeResult") {
      codeRequestBusy = false;
      if (message.phone && message.phone !== registerPhone.value.trim()) {
        showRegisterMessage("手机号已更改，请为当前手机号重新获取验证码", "info");
        refreshCodeButton();
        return;
      }
      showRegisterMessage(message.message || "", message.success ? "success" : "error");
      if (message.success) {
        startCodeCountdown(message.resendSeconds || 60, registerPhone.value.trim());
        if (!registerModal.hidden) {
          var sentCode = String(message.code || "").trim();
          if (/^\d{6}$/.test(sentCode)) {
            registerCode.value = sentCode;
            registrationCodeValue.textContent = sentCode;
            if (!registrationCodeDialog.open) registrationCodeDialog.showModal();
          }
        }
        if (!registrationCodeDialog.open) registerCode.focus();
      } else {
        refreshCodeButton();
      }
    } else if (message.type === "registerResult") {
      busy = false;
      registerSubmit.disabled = false;
      refreshCodeButton();
      registerSubmit.textContent = "注册并进入创爆";
      showRegisterMessage(message.message || "", message.success ? "success" : "error");
    }
  };
  document.getElementById("activateMembershipButton").addEventListener("click", function () {
    post({ type: "activateLicense" });
  });
  post({ type: "ready" });
})();
