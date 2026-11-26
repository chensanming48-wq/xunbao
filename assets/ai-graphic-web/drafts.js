(function () {
  "use strict";
  var session = "", rows = [], selected = "", filter = "all", loading = false, busy = false;
  var thumbs = new Map(), requested = new Set(), observer, origin, preview = null, previewRequest = 0;
  var deletion = null;
  function el(tag, cls, value) { var e = document.createElement(tag); if (cls) e.className = cls; if (value != null) e.textContent = value; return e; }
  function icon(name) { var i = el("img", "draft-icon"); i.src = "icons/" + name + ".svg"; i.alt = ""; return i; }
  function button(label, cls, fn, image) { var b = el("button", cls); b.type = "button"; if (image) b.appendChild(icon(image)); b.appendChild(document.createTextNode(label)); b.addEventListener("click", fn); return b; }
  function send(type, extra) {
    if (window.chrome && window.chrome.webview) window.chrome.webview.postMessage(Object.assign({ type: type, session: session }, extra || {}));
  }
  var dialog = el("dialog", "draft-library"); dialog.setAttribute("aria-labelledby", "draftLibraryTitle");
  dialog.innerHTML = '<header class="draft-heading"><div><h2 id="draftLibraryTitle">AI图文草稿箱</h2><p>找到已生成的图片，继续完成你的图文</p></div><button type="button" class="draft-icon-button" id="draftClose" aria-label="关闭草稿箱"><img class="draft-icon" src="icons/x.svg" alt=""></button></header><div class="draft-toolbar"><label class="draft-search"><img class="draft-icon" src="icons/search.svg" alt=""><input id="draftSearch" type="search" placeholder="搜索商品或店铺" aria-label="搜索商品或店铺"></label><div class="draft-filters" role="group" aria-label="图片状态"></div><select class="draft-sort" id="draftSort" aria-label="草稿排序"><option value="new">保存时间从新到旧</option><option value="old">保存时间从旧到新</option></select><button type="button" class="draft-icon-button" id="draftRefresh" aria-label="刷新草稿"><img class="draft-icon" src="icons/refresh-cw.svg" alt=""></button></div><div class="draft-list" id="draftList" aria-label="草稿作品列表"></div><footer class="draft-location"><img src="icons/folder.svg" alt=""><div class="draft-location-copy"><strong id="draftLocationTitle">当前作品的图片位置</strong><div class="draft-path"><input id="draftPath" readonly aria-label="本地保存位置"><button type="button" class="draft-icon-button" id="draftCopyPath" aria-label="复制保存位置"><img class="draft-icon" src="icons/copy.svg" alt=""></button></div><p id="draftLocationNote"></p><p id="draftFeedback" class="draft-feedback" role="status" aria-live="polite"></p></div><button type="button" id="draftOpenFolder" class="draft-button"><img class="draft-icon" src="icons/folder.svg" alt=""><span>打开图片文件夹</span></button></footer>';
  document.body.appendChild(dialog);
  var list = dialog.querySelector("#draftList"), search = dialog.querySelector("#draftSearch"), sort = dialog.querySelector("#draftSort");
  var path = dialog.querySelector("#draftPath"), openFolder = dialog.querySelector("#draftOpenFolder"), feedback = dialog.querySelector("#draftFeedback");
  var viewer = el("dialog", "draft-viewer"); viewer.setAttribute("aria-labelledby", "draftViewerTitle");
  viewer.innerHTML = '<header class="draft-heading"><div><h2 id="draftViewerTitle">查看图片</h2><p id="draftViewerName"></p></div><button type="button" id="draftViewerClose" class="draft-icon-button" aria-label="关闭图片预览"><img class="draft-icon" src="icons/x.svg" alt=""></button></header><div class="draft-viewer-stage"><img id="draftLargeImage" alt=""><p id="draftImageStatus" role="status">正在读取图片…</p></div><footer class="draft-viewer-footer"><div class="draft-viewer-nav"><button type="button" class="draft-button" id="draftPrevious">上一张</button><span id="draftImageCounter"></span><button type="button" class="draft-button" id="draftNext">下一张</button></div><button type="button" class="draft-button" id="draftViewFolder"><img class="draft-icon" src="icons/folder.svg" alt="">打开图片文件夹</button></footer>';
  document.body.appendChild(viewer);
  var confirmDialog = el("dialog", "draft-confirm"); confirmDialog.setAttribute("aria-labelledby", "draftDeleteTitle");
  confirmDialog.innerHTML = '<h2 id="draftDeleteTitle">删除这份草稿？</h2><p id="draftDeleteName"></p><p>这份草稿和其中已保存的图片将一起删除，无法撤销。</p><footer><button type="button" class="draft-button" id="draftDeleteCancel">取消</button><button type="button" class="draft-button danger" id="draftDeleteConfirm">删除草稿和图片</button></footer>';
  document.body.appendChild(confirmDialog);
  function current() { return rows.find(function (r) { return r.id === selected; }); }
  function message(value) { feedback.textContent = value || ""; }
  function show() { if (!dialog.open) { origin = document.activeElement; dialog.showModal(); search.focus(); } }
  function close() { if (viewer.open) viewer.close(); if (confirmDialog.open) confirmDialog.close(); dialog.close(); if (origin && origin.isConnected) origin.focus(); }
  function load() { session = String(Date.now()) + ":" + Math.random().toString(36).slice(2); loading = true; busy = false; rows = []; thumbs.clear(); requested.clear(); message(""); render(); send("draftList"); }
  function select(id) { selected = id; list.querySelectorAll(".draft-row").forEach(function (e) { e.classList.toggle("is-selected", e.dataset.id === id); }); updateLocation(); }
  function updateLocation() {
    var r = current(), hasImages = r && r.count > 0;
    path.value = r ? (hasImages ? r.imageDirectory : r.directory) : "";
    path.title = path.value;
    dialog.querySelector("#draftLocationTitle").textContent = r ? (hasImages ? "当前作品的图片位置" : "当前草稿的保存位置") : "选择一份草稿，查看保存位置";
    dialog.querySelector("#draftLocationNote").textContent = r ? (hasImages ? "图片已保存在这台电脑 · 仅显示当前选中作品的位置" : r.error || (r.missing ? "原图片文件未找到，请检查是否移动或删除" : "方案已保存在这台电脑，尚未生成图片")) : "";
    openFolder.querySelector("span").textContent = hasImages ? "打开图片文件夹" : "打开草稿文件夹";
    openFolder.disabled = !r || busy; dialog.querySelector("#draftCopyPath").disabled = !r;
  }
  function requestThumbs(id) { if (!requested.has(id)) { requested.add(id); send("draftThumbnails", { id: id }); } }
  function imageElement(src, fallback) { var i = el("img"); i.alt = ""; i.src = src || "icons/image.svg"; i.addEventListener("error", function () { if (!i.src.endsWith("/icons/image.svg")) i.src = "icons/image.svg"; }); if (fallback) i.alt = fallback; return i; }
  function renderImages(row, data) {
    var r = rows.find(function (x) { return x.id === row.dataset.id; }); if (!r) return;
    var cover = row.querySelector(".draft-cover"), strip = row.querySelector(".draft-strip");
    cover.replaceChildren(imageElement(data && data.cover, r.name));
    if (!r.count) cover.appendChild(el("span", "draft-cover-label", data && data.cover ? "商品参考图" : "暂无图片"));
    if (strip) {
      strip.replaceChildren();
      var shown = Math.min(r.count, 4);
      for (var n = 0; n < shown; n++) {
        (function (index) {
          var b = button("", "draft-mini", function (e) { e.stopPropagation(); view(r, index); });
          b.setAttribute("aria-label", "查看第 " + (r.slots[index] + 1) + " 张图片");
          b.appendChild(imageElement(data && data.images && data.images[index]));
          // The last visible thumbnail represents itself and all remaining pages.
          if (index === 3 && r.count > 4) b.appendChild(el("span", "", "+" + (r.count - 3)));
          strip.appendChild(b);
        }(n));
      }
    }
  }
  function render() {
    if (observer) observer.disconnect();
    var query = search.value.trim().toLocaleLowerCase();
    var visible = rows.filter(function (r) { return (filter === "all" || (filter === "images" ? r.count > 0 : !r.count)) && (r.name + " " + r.shop + " " + r.productId).toLocaleLowerCase().includes(query); });
    visible.sort(function (a,b) { return sort.value === "old" ? a.order - b.order : b.order - a.order; });
    if (!visible.some(function (r) { return r.id === selected; })) selected = visible.length ? visible[0].id : "";
    var tabs = dialog.querySelector(".draft-filters"); tabs.replaceChildren();
    [["all","全部",rows.length],["images","已有图片",rows.filter(function (r) { return r.count > 0; }).length],["plan","暂无图片",rows.filter(function (r) { return !r.count; }).length]].forEach(function (v) {
      var b = button(v[1] + "（" + v[2] + "）", "", function () { filter = v[0]; render(); }); b.setAttribute("aria-pressed", String(filter === v[0])); tabs.appendChild(b);
    });
    list.replaceChildren();
    if (loading || !visible.length) {
      var empty = el("div", "draft-empty");
      empty.appendChild(el("h3", "", loading ? "正在读取本机草稿…" : rows.length ? "没有找到匹配的草稿" : "还没有保存的草稿"));
      empty.appendChild(el("p", "", loading ? "已有图片会保留在原来的文件夹中" : rows.length ? "试试其他商品名称，或切换图片状态" : "选择商品后会自动保存方案；生成图片后，也会保存在这里。"));
      if (!loading) empty.appendChild(button(rows.length ? "清除筛选" : "返回创作", "draft-button", rows.length ? function () { search.value = ""; filter = "all"; render(); } : close));
      list.appendChild(empty);
    }
    visible.forEach(function (r) {
      var row = el("article", "draft-row" + (selected === r.id ? " is-selected" : "")); row.dataset.id = r.id; row.addEventListener("click", function () { select(r.id); });
      var cover = button("", "draft-cover", function () { select(r.id); if (r.count) view(r, 0); }); cover.setAttribute("aria-label", r.count ? "查看“" + r.name + "”的图片" : "选择“" + r.name + "”"); row.appendChild(cover);
      var info = el("div", "draft-info"); var title = el("h3", "", r.name); title.title = r.name; info.appendChild(title); info.appendChild(el("p", "draft-meta", r.shop)); info.appendChild(el("p", "draft-meta", "保存时间：" + r.updated)); row.appendChild(info);
      var output = el("div", "draft-output");
      if (r.count) output.appendChild(el("div", "draft-strip"));
      output.appendChild(el("p", "draft-progress " + (r.count ? (r.count < r.total ? "partial" : "") : "plan"), r.error ? "草稿无法读取" : r.count ? "已生成 " + r.count + "/" + r.total + " 张" : r.missing ? "图片文件未找到" : "未生成图片"));
      output.appendChild(el("p", "draft-note", r.error || (r.missing ? "部分图片缺失，请检查保存文件夹" : r.count ? r.count < r.total ? "已有图片可查看，剩余可继续生成" : "图片已保存，可查看或继续编辑" : r.hasPlan ? "方案已保存，尚未生成图片" : "商品已保存，可继续完善方案"))); row.appendChild(output);
      var actions = el("div", "draft-row-actions");
      if (r.count) actions.appendChild(button("查看图片", "draft-button primary", function () { view(r, 0); }, "image"));
      var edit = button(r.count === r.total && r.count ? "继续编辑" : "继续创作", "draft-button" + (r.count ? "" : " primary"), function () { select(r.id); busy = true; message("正在恢复草稿…"); render(); send("draftRestore", { id: r.id }); }, "edit-3"); edit.disabled = busy || !!r.error; actions.appendChild(edit); row.appendChild(actions);
      var more = el("div", "draft-more"); var menu = el("div", "draft-menu"); menu.hidden = true;
      var trigger = button("", "draft-icon-button", function (e) { e.stopPropagation(); var wasHidden = menu.hidden; list.querySelectorAll(".draft-menu").forEach(function (m) { m.hidden = true; }); menu.hidden = !wasHidden; }); trigger.appendChild(icon("more-horizontal")); trigger.setAttribute("aria-label", "更多草稿操作");
      var remove = button("删除草稿", "", function () { menu.hidden = true; deletion = r; confirmDialog.querySelector("#draftDeleteName").textContent = r.name + " · " + r.updated; confirmDialog.showModal(); confirmDialog.querySelector("#draftDeleteCancel").focus(); }); remove.disabled = busy || r.isCurrent; if (r.isCurrent) remove.title = "当前正在编辑此草稿，请先切换作品"; menu.appendChild(remove); more.append(trigger, menu); row.appendChild(more); list.appendChild(row); renderImages(row, thumbs.get(r.id));
    });
    if (window.IntersectionObserver) {
      observer = new IntersectionObserver(function (entries) { entries.forEach(function (e) { if (e.isIntersecting) { requestThumbs(e.target.dataset.id); observer.unobserve(e.target); } }); }, { root: list, rootMargin: "160px" });
      list.querySelectorAll(".draft-row").forEach(function (r) { observer.observe(r); });
    } else visible.slice(0,8).forEach(function (r) { requestThumbs(r.id); });
    updateLocation();
  }
  function view(r, index) { select(r.id); preview = { row:r, index:index }; if (!viewer.open) viewer.showModal(); readImage(); }
  function readImage() {
    var r = preview.row, index = preview.index; previewRequest++;
    viewer.querySelector("#draftViewerName").textContent = r.name;
    viewer.querySelector("#draftImageCounter").textContent = (index + 1) + " / " + r.count;
    viewer.querySelector("#draftPrevious").disabled = index <= 0; viewer.querySelector("#draftNext").disabled = index >= r.count - 1;
    viewer.querySelector("#draftLargeImage").hidden = true;
    var s = viewer.querySelector("#draftImageStatus"); s.hidden = false; s.textContent = "正在读取图片…";
    send("draftImage", { id:r.id, slot:r.slots[index], requestId:previewRequest });
  }
  function receive(data) {
    if (!data || data.session !== session) return;
    if (data.type === "draftList") { loading = false; rows = data.items || []; render(); if (data.error) message(data.error); }
    if (data.type === "draftThumbnails") { thumbs.set(data.id, data); list.querySelectorAll(".draft-row").forEach(function (r) { if (r.dataset.id === data.id) renderImages(r, data); }); }
    if (data.type === "draftImage" && preview && viewer.open && data.requestId === previewRequest && preview.row.id === data.id) {
      var im = viewer.querySelector("#draftLargeImage"), status = viewer.querySelector("#draftImageStatus");
      if (data.image) { im.src = data.image; im.alt = preview.row.name + " 第" + (preview.row.slots[preview.index] + 1) + "张"; im.hidden = false; status.hidden = true; }
      else { status.hidden = false; status.textContent = data.error || "图片无法读取，请打开文件夹检查原文件"; }
    }
    if (data.type === "draftResult") {
      message(data.text);
      if (data.action === "copy" || data.action === "folder") return;
      busy = false;
      if (data.success && data.action === "restore") close();
      else if (data.success && data.action === "delete") load();
      else render();
    }
  }
  dialog.querySelector("#draftClose").addEventListener("click", close);
  dialog.addEventListener("cancel", function (e) { if (busy) e.preventDefault(); });
  dialog.querySelector("#draftRefresh").addEventListener("click", function () { if (!busy) load(); });
  search.addEventListener("input", render); sort.addEventListener("change", render);
  openFolder.addEventListener("click", function () { var r = current(); if (r) send("draftFolder", { id:r.id }); });
  dialog.querySelector("#draftCopyPath").addEventListener("click", function () { var r = current(); if (r) send("draftCopyPath", { id:r.id }); });
  viewer.querySelector("#draftViewFolder").addEventListener("click", function () { if (preview) send("draftFolder", { id:preview.row.id }); });
  viewer.querySelector("#draftViewerClose").addEventListener("click", function () { viewer.close(); });
  viewer.querySelector("#draftPrevious").addEventListener("click", function () { if (preview && preview.index > 0) { preview.index--; readImage(); } });
  viewer.querySelector("#draftNext").addEventListener("click", function () { if (preview && preview.index < preview.row.count - 1) { preview.index++; readImage(); } });
  viewer.addEventListener("keydown", function (e) { if (e.key === "ArrowLeft") viewer.querySelector("#draftPrevious").click(); if (e.key === "ArrowRight") viewer.querySelector("#draftNext").click(); });
  viewer.querySelector("#draftLargeImage").addEventListener("error", function () { this.hidden = true; var s=viewer.querySelector("#draftImageStatus"); s.hidden=false; s.textContent="图片无法显示，请打开文件夹检查原文件"; });
  confirmDialog.querySelector("#draftDeleteCancel").addEventListener("click", function () { confirmDialog.close(); deletion = null; });
  confirmDialog.querySelector("#draftDeleteConfirm").addEventListener("click", function () { if (!deletion || busy) return; var id = deletion.id; deletion = null; confirmDialog.close(); busy = true; render(); send("draftDelete", { id:id }); });
  if (window.chrome && window.chrome.webview) window.chrome.webview.addEventListener("message", function (e) { receive(e.data); });
  window.aiGraphicDraftLibrary = { open: function () { show(); load(); } };
}());
