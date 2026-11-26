(function () {
  'use strict';
  var root, host, platform, quota, title, steps, notice, failure, retry, statusBar, back, current, send, signature = '', quotaPending = false;
  function node(tag, cls, text) { var n = document.createElement(tag); n.className = cls || ''; if (text) n.textContent = text; return n; }
  function viewport() {
    if (!root || root.hidden || !current) return;
    var r = host.getBoundingClientRect(), bridge = window.chrome && window.chrome.webview;
    if (!bridge) return;
    // Keep the official surface visible during loading and failures.
    var visible = current.hostReady && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
    bridge.postMessage({version: 1, type: 'loginWizardViewport', id: current.id,
      x: Math.max(0, r.left), y: Math.max(0, r.top), width: visible ? r.width : 0,
      height: visible ? r.height : 0, viewportWidth: innerWidth, viewportHeight: innerHeight});
  }
  function command(name) {
    if (!current || current.busy && name !== 'loginWizardClose' || !send) return;
    var id = current.id; retry.disabled = back.disabled = true;
    Promise.resolve(send(name, id)).catch(function () {
      if (!current || current.id !== id) return;
      failure.textContent = '操作未完成，请稍后重试；登录资料和已有数据已保留。';
      failure.hidden = false;
    }).finally(function () { if (current && current.id === id) { retry.disabled = !!current.busy; back.disabled = false; } });
  }
  function setup() {
    if (root) return;
    root = node('section', 'aui-workspace login-wizard'); root.id = 'account-login-wizard'; root.hidden = true;
    var header = node('header', 'aui-workspace-header'); title = node('h1');
    back = node('button', 'aui-button', '返回账户页'); back.type = 'button'; back.addEventListener('click', function () { command('loginWizardClose'); });
    header.append(title, back); root.appendChild(header);
    var split = node('div', 'aui-wizard'), left = node('section', 'aui-panel login-wizard-platform');
    platform = left;
    var toolbar = node('div', 'login-wizard-toolbar');
    toolbar.appendChild(node('h2', '', '官方登录页面'));
    [['缩小','out'],['放大','in'],['适应窗口','fit']].forEach(function (item) {
      var button = node('button','aui-button',item[0]); button.type='button';
      button.title = item[0] + '（也可按 Ctrl + 滚轮调整）';
      button.addEventListener('click',function () {
        var bridge=window.chrome&&window.chrome.webview;
        if(current&&current.hostReady&&bridge) bridge.postMessage({version:1,type:'loginWizardZoom',id:current.id,action:item[1]});
      }); toolbar.appendChild(button);
    });
    left.appendChild(toolbar);
    host = node('div', 'login-wizard-host'); host.id = 'account-login-wizard-host'; host.setAttribute('aria-label', '官方登录浏览器');
    left.appendChild(host);
    steps = node('section', 'aui-panel aui-steps'); split.append(left, steps); root.appendChild(split);
    quota = node('section', 'aui-panel login-wizard-quota'); quota.hidden = true; split.insertBefore(quota, steps);
    notice = node('p', 'aui-notice'); notice.setAttribute('role', 'status'); root.appendChild(notice);
    failure = node('p', 'aui-notice error'); failure.setAttribute('role', 'status');
    retry = node('button', 'aui-button', '重试当前步骤'); retry.type = 'button'; retry.addEventListener('click', function () { command('loginWizardRetry'); });
    statusBar = node('div','login-wizard-status'); statusBar.append(failure,retry); left.insertBefore(statusBar,host);
    document.body.appendChild(root);
    new ResizeObserver(viewport).observe(host);
    window.addEventListener('resize', viewport); window.addEventListener('scroll', viewport, true);
  }
  function quotaCommand(name, key) {
    if (!current || !current.quota || current.quota.busy || quotaPending || !send) return;
    var id = current.id; quotaPending = true; renderQuota();
    Promise.resolve(send(name, id, key || '')).catch(function () {
      if (current && current.id === id) { failure.textContent = '操作结果暂未确认，请重试查询。不会自动重复释放。'; failure.hidden = false; }
    }).finally(function () { quotaPending = false; if (current && current.id === id) renderQuota(); });
  }
  function renderQuota() {
    var q = current && current.quota;
    quota.hidden = !q; platform.hidden = !!q;
    if (!q) return;
    quota.replaceChildren();
    quota.appendChild(node('h2', '', '核对名额，继续本次添加'));
    quota.appendChild(node('p', 'aui-notice', '当前服务器使用共享名额。以下是服务器已占用项；释放后会重新核对空位，再继续本次添加。'));
    if (q.used != null) quota.appendChild(node('p', '', '已占用 ' + q.used + (q.limit == null ? '' : ' / ' + q.limit)));
    (q.items || []).forEach(function (item) {
      var row = node('div', 'login-quota-row'), name = node('span', '', item.displayName || '名称待同步');
      name.title = item.displayName || '名称待同步'; row.appendChild(name);
      var button = node('button', 'aui-button', '释放'); button.type = 'button';
      button.disabled = !!q.busy || quotaPending || !!q.resolving;
      button.addEventListener('click', function () { quotaCommand('loginQuotaChoose', item.key); });
      row.appendChild(button); quota.appendChild(row);
    });
    var chosen = (q.items || []).find(function (item) { return item.key === q.selectedKey; });
    if (chosen) {
      var confirm = node('div', 'aui-notice login-quota-confirm');
      confirm.appendChild(node('p', '', '确认释放“' + chosen.displayName + '”？会影响使用该会员的其他电脑。只释放这一项，本机数据保留。'));
      [['取消','loginQuotaCancel'],['确认释放并继续','loginQuotaConfirm']].forEach(function (pair) {
        var button = node('button','aui-button',pair[0]); button.type = 'button'; button.disabled = !!q.busy || quotaPending;
        button.addEventListener('click',function () { quotaCommand(pair[1]); }); confirm.appendChild(button);
      }); quota.appendChild(confirm);
    }
    if (q.error) { var error = node('p', 'aui-notice error', q.error); error.setAttribute('role','alert'); quota.appendChild(error); }
    var status = node('p','aui-notice',q.busy ? '正在核对服务器状态…' : q.resolving ? '释放结果尚未确认，请重试查询。' : '请选择要释放的项目；返回账户页可取消本次添加。');
    status.setAttribute('role','status'); quota.appendChild(status);
    var refresh = node('button','aui-button','重试查询'); refresh.type = 'button'; refresh.disabled = !!q.busy || quotaPending;
    refresh.addEventListener('click',function () { quotaCommand('loginQuotaRefresh'); }); quota.appendChild(refresh);
  }
  function render(state, sender) {
    send = sender; var w = state.loginWizard;
    var banner = document.getElementById('account-login-inline-notice');
    if (state.loginInlineNotice && !banner) {
      banner = node('p', 'aui-notice'); banner.id = 'account-login-inline-notice'; banner.setAttribute('role', 'status');
      document.getElementById('app').prepend(banner);
    }
    if (banner) { banner.textContent = state.loginInlineNotice || ''; banner.hidden = !state.loginInlineNotice; }
    if (!w || !w.active) {
      if (root && !root.hidden) { root.hidden = true; document.getElementById('app').hidden = false; }
      current = null; signature = ''; quotaPending = false; return;
    }
    setup(); current = w; root.hidden = false; document.getElementById('app').hidden = true;
    var other = document.getElementById('aui-workspace'); if (other) other.hidden = true;
    // Retain the native host DOM throughout state updates; QR/browser navigation
    // must not be reset by every account refresh or progress tick.
    var next = JSON.stringify(w);
    if (signature !== next) {
      signature = next; title.textContent = w.kind === 'creator' ? '登录达人' : w.kind === 'qianchuan' ? '登录千川' : '登录店铺';
      var names = w.kind === 'creator' ? ['扫码登录', '确认达人', '同步完成'] : ['扫码登录', w.kind === 'qianchuan' ? '确认主体' : '确认店铺', '选择千川账户', '同步完成'];
      var index = {preparing: 0, login: 0, identity: 1, select: 2, sync: names.length - 1, success: names.length}[w.stage];
      if (w.stage === 'failed' || w.stage === 'preparing' || w.stage === 'quota') index = typeof w.stepIndex === 'number' ? w.stepIndex : 0;
      steps.replaceChildren(); names.forEach(function (name, i) {
        var row = node('div', 'aui-step ' + (i < index ? 'success' : i === index ? (w.stage === 'failed' ? 'failure' : 'current') : 'pending'));
        row.appendChild(node('span', 'aui-step-number', i < index ? '✓' : String(i + 1)));
        var copy = node('div'); copy.appendChild(node('h2', '', name));
        copy.appendChild(node('p', '', i < index ? '已完成' : i === index ? w.stage === 'failed' ? '请看下方提示' : '正在进行' : '等待前一步完成'));
        row.appendChild(copy); steps.appendChild(row);
      });
      notice.textContent = w.quota ? '名额不足时可在下方处理，完成后自动继续本次添加。' : w.stage === 'success' ? '登录和同步完成，正在返回账户页…' : w.notice || '';
      host.textContent = w.hostReady ? '' : w.stage === 'sync' ? '同步中' : w.stage === 'success' ? '已同步' : w.stage === 'failed' ? '同步失败' : '正在打开登录页…';
      failure.textContent = w.browserError || w.error || (w.browserLoading ? '正在打开官方登录页…' : ''); failure.hidden = !failure.textContent;
      statusBar.hidden = !failure.textContent; statusBar.classList.toggle('is-loading', !!w.browserLoading && !w.browserError && !w.error);
      retry.textContent = w.browserError ? '重试' : '重试当前步骤';
      retry.hidden = w.stage !== 'failed' && !w.browserError; retry.disabled = !!w.busy; back.disabled = false;

    }
    renderQuota();
    requestAnimationFrame(viewport);
  }
  window.QianchuanLoginWizard = {render: render};
})();
