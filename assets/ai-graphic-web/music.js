(function () {
  "use strict";
  window.createAiGraphicMusic = function (api) {
    var pending = {}, sequence = 0, lanes = {}, context = "", selectionKey = "";
    var catalog = { items: [], page: 1, hasMore: false }, source = "platform", catalogBusy = false;
    var mutation = false, open = false, returnFocus = null, activeTrack = "", playing = false, previewBusy = false;
    var audio = document.getElementById("musicAudioPlayer");
    function el(id) { return document.getElementById(id); }
    function upload() { return api.state().upload || {}; }
    function music() { return upload().music || { mode: "none", ready: true }; }
    function key() { var u = upload(); return (u.shop || "") + "|" + (u.productKey || ""); }
    function duration(seconds) { seconds = Math.max(0, Math.floor(Number(seconds) || 0)); return seconds ? Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0") : ""; }
    function icon(button, paused) { button.querySelector("img").src = "icons/" + (paused ? "pause" : "play") + ".svg"; }
    function stop() {
      lanes.preview = ""; previewBusy = false; activeTrack = ""; playing = false;
      audio.pause(); audio.removeAttribute("src"); audio.load(); updatePlayer();
    }
    function send(type, data, lane) {
      var u = upload(), id = String(++sequence);
      pending[id] = { type: type, context: key(), lane: lane, data: data || {} };
      lanes[lane] = id;
      if (lane === "mutation") mutation = true;
      api.post(Object.assign({ type: type, requestId: id, shop: u.shop, productKey: u.productKey }, data || {}));
      render(); api.renderUpload();
    }
    function setDialog(visible) {
      if (visible === open) return;
      open = visible; el("musicLibraryModal").classList.toggle("is-hidden", !visible);
      if (visible) { returnFocus = document.activeElement; el("musicLibraryModal").querySelector("[role=dialog]").focus(); }
      else { lanes.catalog = ""; catalogBusy = false; stop(); if (returnFocus && returnFocus.isConnected && !returnFocus.disabled) returnFocus.focus(); }
    }
    function loadCatalog(page, refresh) {
      stop(); catalogBusy = true; catalog = { items: [], page: page, hasMore: false };
      el("musicSearchInput").value = ""; el("musicCatalogStatus").textContent = "正在读取音乐库…";
      renderCatalog(); send("musicCatalog", { source: source, page: page, refresh: !!refresh }, "catalog");
    }
    function showLibrary() {
      if (mutation || upload().inProgress || api.switching()) return;
      if (!upload().targetReady) { api.toast("请先选择上传店铺和目标计划，再打开音乐库。", true); return; }
      source = music().source === "mine" ? "mine" : "platform";
      setDialog(true); loadCatalog(1, false);
    }
    function preview(id, trackKey) {
      if (trackKey === activeTrack && (playing || previewBusy)) { stop(); return; }
      stop(); activeTrack = trackKey; previewBusy = true; updatePlayer();
      send("musicPreview", { id: id || "" }, "preview");
    }
    function updatePlayer() {
      var selected = activeTrack === "selected";
      icon(el("musicPlayButton"), selected && playing);
      el("musicPlayButton").setAttribute("aria-label", selected && playing ? "暂停背景音乐" : selected && previewBusy ? "正在准备试听" : "试听背景音乐");
      el("musicPlayButton").classList.toggle("is-loading", selected && previewBusy);
      el("musicCatalogList").querySelectorAll("[data-preview-id]").forEach(function (button) {
        var active = activeTrack === button.dataset.previewId;
        icon(button, active && playing);
        button.setAttribute("aria-label", (active && playing ? "暂停 " : "试听 ") + button.dataset.trackName);
        button.classList.toggle("is-loading", active && previewBusy);
      });
    }
    function renderCatalog() {
      el("musicLibraryContext").textContent = (upload().shop || "") + " · 整套图文共用一首音乐";
      el("musicPlatformTab").setAttribute("aria-pressed", source === "platform");
      el("musicMineTab").setAttribute("aria-pressed", source === "mine");
      el("musicCatalogRefreshButton").disabled = catalogBusy || mutation;
      el("musicPlatformTab").disabled = mutation; el("musicMineTab").disabled = mutation;
      el("musicPreviousPage").disabled = catalogBusy || mutation || catalog.page <= 1;
      el("musicNextPage").disabled = catalogBusy || mutation || !catalog.hasMore;
      el("musicCatalogPage").textContent = "第 " + catalog.page + " 页";
      var query = el("musicSearchInput").value.trim().toLocaleLowerCase();
      var items = catalog.items.filter(function (item) { return item.name.toLocaleLowerCase().indexOf(query) >= 0; });
      var list = el("musicCatalogList"); list.replaceChildren(); list.setAttribute("aria-busy", catalogBusy);
      items.forEach(function (item) {
        var row = document.createElement("div"); row.className = "music-catalog-row";
        var play = document.createElement("button"); play.type = "button"; play.className = "music-play-button";
        play.innerHTML = '<img src="icons/play.svg" alt="">'; play.dataset.previewId = item.id; play.dataset.trackName = item.name;
        play.addEventListener("click", function () { preview(item.id, item.id); });
        var copy = document.createElement("div"); copy.className = "music-track-copy";
        var name = document.createElement("strong"); name.textContent = item.name; name.title = item.name;
        var meta = document.createElement("span"); meta.textContent = [duration(item.duration), source === "mine" ? "我的音频" : "千川音乐"].filter(Boolean).join(" · ");
        copy.append(name, meta);
        var choose = document.createElement("button"); choose.type = "button"; choose.className = "compact-outline-button";
        var selected = music().mode === "library" && music().id === item.id;
        choose.textContent = selected ? "已选择" : "选择"; choose.disabled = mutation;
        choose.setAttribute("aria-label", "选择 " + item.name); row.classList.toggle("selected", selected);
        choose.addEventListener("click", function () { stop(); send("musicSelect", { id: item.id }, "mutation"); });
        row.append(play, copy, choose); list.appendChild(row);
      });
      if (!catalogBusy && !items.length && !el("musicCatalogStatus").textContent) el("musicCatalogStatus").textContent = query ? "本页没有匹配的音乐，可清空搜索或翻页查看。" : "当前没有可选音乐，可刷新或选择本地音频。";
      updatePlayer();
    }
    function render() {
      var u = upload(), m = music(), next = key();
      var selected = [m.mode, m.id, m.name].join("|");
      if (context !== next || selectionKey !== selected) { stop(); selectionKey = selected; }
      if (context !== next) { context = next; pending = {}; lanes = {}; mutation = false; setDialog(false); }
      if (Number(api.state().nativeStage) !== 2) { setDialog(false); if (activeTrack) stop(); el("uploadBodyModal").classList.add("is-hidden"); }
      var locked = mutation || !!u.inProgress || api.switching() || !u.productKey;
      ["musicNoneButton", "musicLibraryButton", "musicLocalButton", "musicReplaceButton", "musicRemoveButton"].forEach(function (id) { el(id).disabled = locked; });
      el("musicNoneButton").setAttribute("aria-pressed", m.mode === "none");
      el("musicLibraryButton").setAttribute("aria-pressed", m.mode === "library");
      el("musicLocalButton").setAttribute("aria-pressed", m.mode === "local");
      el("musicEmptyState").classList.toggle("is-hidden", !!m.selected);
      el("musicSelectedCard").classList.toggle("is-hidden", !m.selected);
      el("musicSelectedName").textContent = m.name || "已选背景音乐";
      el("musicSelectedName").title = m.name || "";
      el("musicSelectedMeta").textContent = [duration(m.duration), m.mode === "local" ? "本地音频" : m.source === "mine" ? "我的音频" : "千川音乐库", "点击左侧试听"].filter(Boolean).join(" · ");
      el("musicPlayButton").disabled = locked || !m.ready;
      el("musicSharedHint").textContent = "整套 " + ((api.state().generation || {}).pageCount || 6) + " 张图共用";
      el("musicStatus").textContent = mutation ? "正在保存配乐设置…" : m.message || "";
      el("musicStatus").classList.toggle("has-error", !m.ready && !!m.message);
      updatePlayer();
    }
    function receive(message) {
      var id = String(message.requestId), request = pending[id]; delete pending[id];
      if (!request || request.context !== key() || lanes[request.lane] !== id) return;
      if (request.lane === "mutation") mutation = false;
      if (request.lane === "catalog") catalogBusy = false;
      if (!message.success) {
        if (request.lane === "preview") stop();
        if (request.lane === "catalog") { el("musicCatalogStatus").textContent = message.message || "音乐库读取失败，请刷新重试。"; renderCatalog(); }
        else if (message.message || request.type !== "musicLocal") api.toast(message.message || "配乐设置未生效，请重试。", true);
      } else if (request.lane === "mutation") {
        api.applyUpload(message.upload); stop(); if (request.type === "musicSelect") setDialog(false);
      } else if (request.lane === "catalog") {
        catalog = message.catalog || { items: [], page: 1, hasMore: false };
        el("musicCatalogStatus").textContent = ""; renderCatalog();
      } else if (request.lane === "preview") {
        if (!/^https:\/\//i.test(message.url || "")) { stop(); api.toast("试听地址无效，请重新选择音乐。", true); return; }
        audio.src = message.url;
        audio.play().catch(function () { if (lanes.preview !== id) return; stop(); api.toast("暂时无法试听，请刷新音乐库或检查音频文件后重试。", true); });
      }
      render(); api.renderUpload();
    }
    el("musicNoneButton").addEventListener("click", function () { stop(); send("musicMode", { mode: "none" }, "mutation"); });
    el("musicRemoveButton").addEventListener("click", function () { stop(); send("musicMode", { mode: "none" }, "mutation"); });
    el("musicLibraryButton").addEventListener("click", showLibrary);
    function chooseLocal() { stop(); send("musicLocal", {}, "mutation"); }
    el("musicLocalButton").addEventListener("click", chooseLocal);
    el("musicReplaceButton").addEventListener("click", function () { if (music().mode === "local") chooseLocal(); else showLibrary(); });
    el("musicPlayButton").addEventListener("click", function () { preview("", "selected"); });
    el("closeMusicLibraryButton").addEventListener("click", function () { setDialog(false); });
    el("musicLibraryModal").addEventListener("click", function (event) { if (event.target === el("musicLibraryModal")) setDialog(false); });
    el("musicPlatformTab").addEventListener("click", function () { source = "platform"; loadCatalog(1, false); });
    el("musicMineTab").addEventListener("click", function () { source = "mine"; loadCatalog(1, false); });
    el("musicCatalogRefreshButton").addEventListener("click", function () { loadCatalog(catalog.page, true); });
    el("musicPreviousPage").addEventListener("click", function () { loadCatalog(catalog.page - 1, false); });
    el("musicNextPage").addEventListener("click", function () { loadCatalog(catalog.page + 1, false); });
    el("musicSearchInput").addEventListener("input", function () { if (!catalogBusy) { el("musicCatalogStatus").textContent = ""; renderCatalog(); } });
    audio.addEventListener("playing", function () { playing = true; previewBusy = false; updatePlayer(); });
    audio.addEventListener("pause", function () { playing = false; updatePlayer(); });
    audio.addEventListener("ended", stop);
    audio.addEventListener("error", function () { if (activeTrack && !previewBusy) { stop(); api.toast("试听中断，请检查网络或重新选择音频。", true); } });
    window.addEventListener("beforeunload", stop);
    var bodyFocus;
    function closeBody() { el("uploadBodyModal").classList.add("is-hidden"); if (bodyFocus && bodyFocus.isConnected) bodyFocus.focus(); }
    el("showUploadBodyButton").addEventListener("click", function () {
      var g = api.state().generation || {}; bodyFocus = document.activeElement;
      el("uploadFullTitle").textContent = g.publishTitle || ""; el("uploadFullBody").textContent = g.publishBody || "";
      el("uploadBodyModal").classList.remove("is-hidden"); el("uploadBodyModal").querySelector("[role=dialog]").focus();
    });
    el("closeUploadBodyButton").addEventListener("click", closeBody);
    el("uploadBodyModal").addEventListener("click", function (event) { if (event.target === el("uploadBodyModal")) closeBody(); });
    document.addEventListener("keydown", function (event) {
      var dialog = open ? el("musicLibraryModal") : !el("uploadBodyModal").classList.contains("is-hidden") ? el("uploadBodyModal") : null;
      if (!dialog) return;
      if (event.key === "Escape") { event.preventDefault(); if (open) setDialog(false); else closeBody(); }
      if (event.key === "Tab") {
        var focusable = Array.from(dialog.querySelectorAll("button:not(:disabled), input:not(:disabled)")).filter(function (node) { return node.getClientRects().length; });
        var first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !focusable.includes(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    });
    return { render: render, receive: receive, pending: function () { return mutation; }, stop: stop, close: function () { setDialog(false); stop(); } };
  };
}());
