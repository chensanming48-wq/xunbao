(function () {
  "use strict";

  var currentState = {
    products: [],
    shops: [],
    selected: null,
    goal: "商品种草",
    direction: "痛点切入",
    pageCount: 6,
    directions: [],
    structure: [],
    sellingPoints: [],
    targetAudience: "等待选择商品",
    titleSuggestions: [],
    analysisStatus: "选择商品后点击按钮开始分析",
    analysisReady: false,
    analysisInProgress: false,
    canContinue: false,
    hasProduct: false,
    nativeStage: 0,
    generation: {
      pageCount: 6,
      ratio: "1:1 方图",
      structureSummary: "封面1张 · 痛点1张 · 卖点1张 · 细节1张 · 场景1张 · 引导1张",
      style: "AI推荐视觉风格",
      tasks: [],
      completedCount: 0,
      progress: 0,
      inProgress: false,
      preparing: false,
      hasFailure: false,
      publishTitle: "这款商品，真实亮点清晰呈现",
      publishBody: "围绕商品的真实外观和已确认信息组织整套图文内容。",
      publishHashtags: [],
      canEditPublish: false,
      canRewritePublish: false,
      canStart: false,
      status: "等待开始生成",
      actionText: "开始生成6张图片"
    },
    upload: { shop: "", productKey: "", plans: [], planName: "", planId: "", targetReady: false,
      imagesReady: false, copyReady: false, ready: false, completedCount: 0 }
  };
  var toastTimer = 0;
  var advancePending = false;
  var commandBusy = false;
  var editingPublishCopy = false;
  var musicController = null;
  var uploadShopRequestId = 0;
  var uploadShopPending = null;
  function graphicUnitPrice() { var p = currentState.graphicUnitPrice; return p != null && Number.isFinite(Number(p)) && Number(p) >= 0 ? Number(p) : null; }
  var pendingCreditConfirmation = null;
  var generationSubmissionPending = false;
  var graphicSelects = {};

  // A resumed job can create a new job for pages still missing after delivery.
  // Quote its maximum missing-page cost instead of promising a free recovery.
  function graphicCreditQuote() {
    var generation = currentState.generation || {};
    var count = Number(generation.pageCount || currentState.pageCount);
    if (!Number.isInteger(count) || count < 1 || count > 12) return null;
    if (Number(generation.completedCount) >= count) return { count: 0, total: 0 };
    if (graphicUnitPrice() == null) return null;
    var tasks = generation.tasks || [];
    var completed = tasks.filter(function (task) { return task.completed === true; }).length;
    var remaining = count - Math.min(count, completed);
    return { count: remaining, total: remaining * graphicUnitPrice(),
      resume: !!generation.hasFailure || completed > 0,
      recovering: generation.actionText === "继续获取已有图片" };
  }

  function graphicCreditContext() {
    var generation = currentState.generation || {}, product = currentState.selected || {};
    return JSON.stringify([product.key, product.id, product.shop, currentState.nativeStage,
      currentState.goal, currentState.direction, currentState.pageCount, generation.pageCount,
      generation.ratio, generation.displayKey, generation.actionText, graphicCreditQuote()]);
  }

  function renderGraphicCreditNotice() {
    var count = Number(currentState.pageCount) || 6;
    document.querySelectorAll(".graphic-credit-notice>strong").forEach(function(el) { el.textContent = graphicUnitPrice() == null ? "价格待获取" : graphicUnitPrice() + " 算力 / 张"; });
    byId("graphicCreditUnit").textContent = graphicUnitPrice() == null ? "价格待获取" : graphicUnitPrice() + " 算力 / 张";
    byId("planCreditEstimate").textContent = graphicUnitPrice() == null ? "预计消耗待获取" : "生成 " + count + " 张，预计扣除 " + count * graphicUnitPrice() + " 算力";
    var quote = graphicCreditQuote();
    byId("generationCreditEstimate").textContent = !quote ? "价格或生成数量待获取" : quote.count === 0
      ? "图片已生成，进入上传不提交新的生图任务"
      : quote.recovering ? "恢复已有任务；若需补图，最多 " + quote.count + " 张 / " + quote.total + " 算力"
      : (quote.resume ? "补充生成 " : "生成 ") + quote.count + " 张，预计扣除 " + quote.total + " 算力";
  }

  function closeGraphicCreditConfirmation() {
    var pending = pendingCreditConfirmation;
    pendingCreditConfirmation = null;
    if (byId("graphicCreditDialog").open) byId("graphicCreditDialog").close();
    if (pending && pending.origin && pending.origin.isConnected) pending.origin.focus({ preventScroll: true });
  }

  function validateGraphicCreditConfirmation() {
    var generation = currentState.generation || {};
    if (pendingCreditConfirmation && (pendingCreditConfirmation.context !== graphicCreditContext() ||
        !currentState.selected || !generation.canStart || generation.inProgress || generation.preparing || commandBusy)) {
      closeGraphicCreditConfirmation();
      showToast("商品或生成设置已变化，请重新确认张数和算力。", true);
    }
    renderGraphicCreditNotice();
  }

  function requestGraphicGeneration() {
    var generation = currentState.generation || {};
    if (!currentState.selected || !generation.canStart || commandBusy || selectionPendingKey ||
        generation.inProgress || generation.preparing || generationSubmissionPending || pendingCreditConfirmation) return;
    var quote = graphicCreditQuote();
    if (!quote) { showToast("价格或生成数量尚未获取，请稍后重试。", true); return; }
    if (editingPublishCopy) {
      byId("editPublishCopyButton").click();
      if (editingPublishCopy) return;
    }
    if (quote.count === 0) { post({ type: "startGeneration" }); return; }
    pendingCreditConfirmation = { context: graphicCreditContext(), origin: document.activeElement };
    byId("graphicCreditTitle").textContent = quote.recovering ? "继续生成费用确认" : "生成图文图片扣费确认";
    byId("graphicCreditDescription").textContent = quote.recovering
      ? "将先获取已有任务的图片；如果仍有缺图，会补充生成。下方为补图费用上限，请确认后继续。"
      : quote.resume ? "已完成的图片会保留，仅对本次补充生成的图片确认费用。"
      : "生成图片需要消耗算力，请确认本次生成数量和费用。";
    byId("graphicCreditCount").textContent = (quote.recovering ? "最多 " : "") + quote.count + " 张";
    byId("graphicCreditTotalLabel").textContent = quote.recovering ? "预计最多扣除" : "预计扣除";
    byId("graphicCreditTotal").textContent = quote.total + " 算力";
    byId("confirmGraphicCredit").textContent = quote.recovering
      ? "确认继续，最多 " + quote.total + " 算力" : "确认生成，扣除 " + quote.total + " 算力";
    byId("confirmGraphicCredit").disabled = false;
    byId("graphicCreditDialog").showModal();
    byId("cancelGraphicCredit").focus({ preventScroll: true });
  }

  function confirmGraphicGeneration() {
    if (!pendingCreditConfirmation || generationSubmissionPending) return;
    validateGraphicCreditConfirmation();
    if (!pendingCreditConfirmation) return;
    generationSubmissionPending = true;
    byId("confirmGraphicCredit").disabled = true;
    closeGraphicCreditConfirmation();
    renderGenerationSummary();
    post({ type: "startGeneration" });
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function post(message) {
    if (message.type === "openDraft" && window.aiGraphicDraftLibrary) {
      window.aiGraphicDraftLibrary.open();
      return;
    }
    if (window.chrome && window.chrome.webview) {
      window.chrome.webview.postMessage(message);
    }
  }

  function text(value, fallback) {
    var normalized = value === null || value === undefined ? "" : String(value).trim();
    return normalized || (fallback || "");
  }

  function makePlaceholderImage(altText) {
    var placeholder = document.createElement("img");
    placeholder.className = "product-placeholder-image";
    placeholder.alt = altText || "商品图片占位图";
    placeholder.src = "product-placeholder.svg";
    return placeholder;
  }

  function makeImage(imageUrl, altText) {
    if (!imageUrl) return makePlaceholderImage(altText);
    var image = document.createElement("img");
    image.alt = altText || "商品图片";
    image.decoding = "async";
    image.src = imageUrl;
    image.addEventListener("error", function () {
      if (image.parentNode) image.parentNode.replaceChild(makePlaceholderImage(altText), image);
    });
    return image;
  }

  function renderShopFilter() {
    var select = byId("shopFilter");
    var access = currentState.shopAccess;
    if (access) {
      var options = [{ value: "", label: "全部店铺" }].concat(access.options || []);
      var accessSignature = JSON.stringify(options);
      if (select._shopsSignature !== accessSignature) {
        select._shopsSignature = accessSignature;
        select.replaceChildren();
        options.forEach(function (shop) {
          var option = document.createElement("option"); option.value = shop.value; option.textContent = shop.label; select.appendChild(option);
        });
      }
      select.value = access.selectedKey || "";
      graphicSelects.shopFilter.sync();
      byId("syncProductsButton").disabled = !access.canSync || access.syncing || commandBusy;
      return;
    }
    // No session inventory: do not promote historical catalog shops to logged-in options.
    select.replaceChildren(new Option("全部店铺", ""));
    graphicSelects.shopFilter.sync();
    byId("syncProductsButton").disabled = true;
  }

  var productItems = new Map();
  var requestedProductThumbnails = new Set(), queuedProductThumbnails = new Set(), thumbnailRequestFrame = 0;
  function requestProductThumbnail(product) {
    if (!product || product.image) return;
    var identity = product.key + '|' + product.imageVersion;
    if (requestedProductThumbnails.has(identity)) return;
    requestedProductThumbnails.add(identity); queuedProductThumbnails.add(product.key);
    if (!thumbnailRequestFrame) thumbnailRequestFrame = requestAnimationFrame(function () {
      thumbnailRequestFrame = 0;
      var keys = Array.from(queuedProductThumbnails); queuedProductThumbnails.clear();
      for (var offset = 0; offset < keys.length; offset += 20) post({type:'productThumbnails', keys:keys.slice(offset, offset + 20)});
    });
  }
  var productThumbnailObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) { if (entry.isIntersecting && !entry.target.classList.contains('is-hidden')) requestProductThumbnail(entry.target._product); });
  }, {root:byId('productList'),rootMargin:'100px 0px'});
  var selectionPendingKey = "";
  var selectionQueuedKey = "";

  function updateRetainedImage(host, url, alt) {
    var source = url || "product-placeholder.svg";
    var image = host.querySelector("img");
    if (!image) {
      image = document.createElement("img");
      image.decoding = "async";
      image.addEventListener("error", function () {
        if (image.getAttribute("src") !== "product-placeholder.svg") image.src = "product-placeholder.svg";
      });
      host.appendChild(image);
    }
    image.alt = alt || "商品图片";
    if (host._imageSource !== source) { image.src = source; host._imageSource = source; }
  }

  function renderProductSelection() {
    var selectedKey = selectionQueuedKey || selectionPendingKey || (currentState.selected ? currentState.selected.key : "");
    productItems.forEach(function (item, key) {
      var selected = key === selectedKey;
      item.classList.toggle("selected", selected);
      item.setAttribute("aria-pressed", selected ? "true" : "false");
      item.querySelector(".selected-mark").classList.toggle("is-hidden", !selected);
    });
  }

  function requestProductSelection(key) {
    if (commandBusy || (!selectionPendingKey && currentState.selected && currentState.selected.key === key)) return;
    if (selectionPendingKey) {
      selectionQueuedKey = key;
      renderProductSelection();
      return;
    }
    selectionPendingKey = key;
    renderProductSelection();
    post({ type: "selectProduct", key: key });
  }

  function finishProductSelection(message) {
    if (message.key !== selectionPendingKey) return;
    selectionPendingKey = "";
    var next = selectionQueuedKey;
    selectionQueuedKey = "";
    renderProductSelection();
    if (next && (!currentState.selected || currentState.selected.key !== next)) requestProductSelection(next);
  }

  var productStatus = "selling", productPage = 1, productPageSize = 6;
  function renderProductList() {
    var host = byId("productList");
    var query = text(byId("productSearch").value).toLocaleLowerCase("zh-CN");
    var shop = byId("shopFilter").value;
    var filter = shop + "|" + query + "|" + productStatus;
    if (host._filter !== filter) { productPage = 1; host._filter = filter; }
    var access = currentState.shopAccess;
    var allowed = new Set((access && access.options || []).filter(function(s) { return !shop || s.value === shop; }).map(function (s) { return String(s.shopId); }));
    var matching = (currentState.products || []).filter(function(p) {
      var status = /warehouse|仓库|下架/i.test(p.status || '') ? 'warehouse' : 'selling';
      return allowed.has(String(p.shopId)) && status === productStatus && (!query || (text(p.name)+' '+text(p.id)).toLocaleLowerCase('zh-CN').includes(query));
    });
    var pages = Math.max(1, Math.ceil(matching.length / productPageSize));
    productPage = Math.max(1, Math.min(productPage, pages));
    var visibleKeys = new Set(matching.slice((productPage-1)*productPageSize, productPage*productPageSize).map(function(p) { return p.key; }));
    byId('productTotal').textContent = '共 ' + matching.length + ' 条';
    byId('productPage').textContent = productPage + '/' + pages;
    byId('productPrevious').disabled = productPage <= 1;
    byId('productNext').disabled = productPage >= pages;
    var retained = new Set(), position = host.firstElementChild, visible = 0;
    (currentState.products || []).forEach(function (product) {
      var item = productItems.get(product.key);
      if (!item) {
        item = document.createElement("div");
        item.className = "product-item";
        item.setAttribute("role", "button");
        item.setAttribute("tabindex", "0");
        item.innerHTML = '<div class="product-thumb"></div><div class="product-info"><div class="product-name"></div><p class="product-meta product-id"></p><p class="product-meta product-shop"><span class="product-price"></span><span class="product-sale-status"></span></p></div><span class="selected-mark is-hidden"><svg class="check-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l4 4L19 6"/></svg></span>';
        item.addEventListener("click", function () { requestProductSelection(item._product.key); });
        item.addEventListener("keydown", function (event) {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); item.click(); }
        });
        productItems.set(product.key, item);
      }
      item._product = product;
      retained.add(product.key);
      var name = text(product.name, "未命名商品"), nameNode = item.querySelector(".product-name");
      if (nameNode.textContent !== name) nameNode.textContent = name;
      nameNode.title = name;
      var priceNode = item.querySelector(".product-price"), priceText = text(product.price, "价格待同步");
      if (priceNode.textContent !== priceText) priceNode.textContent = priceText;
      var saleNode = item.querySelector(".product-sale-status"), saleText = /warehouse|仓库|下架/i.test(product.status || '') ? '仓库中' : '售卖中';
      if (saleNode.textContent !== saleText) saleNode.textContent = saleText;
      var idNode = item.querySelector(".product-id"), idText = "ID：" + text(product.id, "—");
      if (idNode.textContent !== idText) idNode.textContent = idText;
      updateRetainedImage(item.querySelector(".product-thumb"), product.image, name);
      var matches = visibleKeys.has(product.key);
      item.classList.toggle("is-hidden", !matches);
      if (matches) visible += 1;
      if (item !== position) host.insertBefore(item, position);
      position = item.nextElementSibling;
      productThumbnailObserver.observe(item);
    });
    productItems.forEach(function (item, key) {
      if (!retained.has(key)) { productThumbnailObserver.unobserve(item); item.remove(); productItems.delete(key); }
    });
    var empty = host.querySelector(".empty-list");
    if (!visible) {
      if (!empty) { empty = document.createElement("div"); empty.className = "empty-list"; host.appendChild(empty); }
      empty.textContent = currentState.shopAccess && currentState.shopAccess.removed ? "店铺已移除，请选择其他店铺。" : currentState.catalogLoading ? "正在读取本地商品…" : currentState.products.length ? "没有匹配的商品，请更换搜索条件。" : "当前店铺还没有本地商品，点击“刷新”同步商品库。";
    } else if (empty) empty.remove();

    renderProductSelection();
  }

  function renderSelectedProduct() {
    var selected = currentState.selected;
    requestProductThumbnail(selected);
    var placeholder = byId("selectedPlaceholder");
    var content = byId("selectedProductContent");
    var copy = byId("selectedCopy");
    var imageHost = byId("selectedImageWrap");
    content.classList.remove("is-hidden");
    if (!selected) {
      placeholder.classList.remove("is-hidden");
      copy.classList.add("is-hidden");
      updateRetainedImage(imageHost, "", "等待选择商品");
      return;
    }
    placeholder.classList.add("is-hidden");
    copy.classList.remove("is-hidden");
    updateRetainedImage(imageHost, selected.image, selected.name);
    byId("selectedName").textContent = text(selected.name, "未命名商品");
    byId("selectedName").title = byId("selectedName").textContent;
    byId("selectedShop").textContent = text(selected.shop, "未命名店铺");
    byId("selectedId").textContent = text(selected.id, "—");
  }

  function renderGoals() {
    var selected = !!currentState.selected;
    document.querySelectorAll("[data-goal]").forEach(function (button) {
      var isCurrent = button.getAttribute("data-goal") === currentState.goal;
      button.classList.toggle("selected", isCurrent && selected);
      button.disabled = !selected;
    });
  }

  function renderDirections() {
    var host = byId("directionOptions");
    var directions = currentState.directions || [];
    var selectedProduct = !!currentState.selected;
    var signature = JSON.stringify([directions, selectedProduct, currentState.direction]);
    if (host._signature === signature) return;
    host._signature = signature;
    host.replaceChildren();
    directions.forEach(function (direction, index) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "direction-card" + (selectedProduct && direction.name === currentState.direction ? " selected" : "");
      button.disabled = !selectedProduct;
      button.addEventListener("click", function () {
        post({ type: "setPlan", goal: currentState.goal, direction: direction.name });
      });

      var titleRow = document.createElement("div");
      titleRow.className = "direction-title-row";
      var number = document.createElement("span");
      number.className = "direction-index";
      number.textContent = String(index + 1).padStart(2, "0");
      var title = document.createElement("span");
      title.className = "direction-name";
      title.textContent = text(direction.name, "内容方向");
      titleRow.append(number, title);

      var description = document.createElement("p");
      description.className = "direction-description";
      description.textContent = text(direction.description, "结合真实商品信息生成内容结构。");
      var meta = document.createElement("div");
      meta.className = "direction-meta";
      meta.textContent = (direction.pageCount || 6) + "张图文｜" + text(direction.layout, "图文并重");
      button.append(titleRow, description, meta);
      host.appendChild(button);
    });
  }

  function renderStructure() {
    var host = byId("structureTable");
    var pages = currentState.structure || [];
    var signature = JSON.stringify([pages, currentState.pageCount, !!currentState.selected]);
    if (host._signature === signature) return;
    host._signature = signature;
    byId("structureCountHint").textContent = currentState.selected
      ? "共 " + (Number(currentState.pageCount) || pages.length) + " 张" : "";
    host.replaceChildren();
    if (!pages.length) {
      var empty = document.createElement("div");
      empty.className = "structure-row";
      empty.textContent = "选择商品后生成图文结构";
      host.appendChild(empty);
      return;
    }
    pages.forEach(function (page, index) {
      var row = document.createElement("div");
      row.className = "structure-row";
      var number = document.createElement("span");
      number.className = "structure-number";
      number.textContent = page.index || index + 1;
      var role = document.createElement("span");
      role.className = "structure-role";
      role.textContent = text(page.role, "内容页");
      var copy = document.createElement("span");
      copy.className = "structure-copy";
      copy.textContent = text(page.copy || page.title, "基于真实商品信息生成页面内容");
      copy.title = text(page.title) + (page.copy ? "｜" + page.copy : "");
      row.append(number, role, copy);
      host.appendChild(row);
    });
  }

  var assistantSignature = "";
  function renderAssistant() {
    var signature = JSON.stringify([currentState.analysisStatus, currentState.analysisReady, currentState.analysisInProgress,
      currentState.sellingPoints, currentState.targetAudience, currentState.titleSuggestions, !!currentState.selected]);
    if (assistantSignature === signature) return;
    assistantSignature = signature;
    byId("analysisStatus").textContent = text(currentState.analysisStatus, "选择商品后点击按钮开始分析");
    var statusCard = byId("analysisStatusCard");
    statusCard.classList.toggle("ready", !!currentState.analysisReady);

    var pointsHost = byId("sellingPoints");
    pointsHost.replaceChildren();
    var points = currentState.sellingPoints || [];
    if (!points.length) {
      var empty = document.createElement("span");
      empty.className = "empty-inline";
      empty.textContent = currentState.analysisInProgress
        ? "正在提炼真实卖点…"
        : currentState.selected
          ? "点击底部按钮，自动提炼商品卖点"
          : "等待选择商品";
      pointsHost.appendChild(empty);
    } else {
      points.forEach(function (point) {
        var tag = document.createElement("span");
        tag.className = "selling-tag";
        tag.textContent = point;
        tag.title = point;
        pointsHost.appendChild(tag);
      });
    }

    byId("targetAudience").textContent = text(currentState.targetAudience, "等待选择商品");

    var titlesHost = byId("titleSuggestions");
    titlesHost.replaceChildren();
    var titles = currentState.titleSuggestions || [];
    if (!titles.length) {
      var placeholder = document.createElement("div");
      placeholder.className = "suggestion-placeholder";
      placeholder.textContent = currentState.analysisInProgress
        ? "AI正在生成标题建议…"
        : currentState.selected
          ? "点击底部按钮，自动分析并准备标题"
          : "选择商品后生成标题建议";
      titlesHost.appendChild(placeholder);
    } else {
      titles.forEach(function (title) {
        var suggestion = document.createElement("div");
        suggestion.className = "title-suggestion";
        suggestion.textContent = title;
        titlesHost.appendChild(suggestion);
      });
    }

    var reanalyzeButton = byId("reanalyzeProductButton");
    reanalyzeButton.classList.toggle("is-hidden", !currentState.analysisReady);
    reanalyzeButton.disabled = !!currentState.analysisInProgress;
  }

  function renderFooter() {
    var hasProduct = !!currentState.selected;
    byId("saveStatus").textContent = hasProduct ? "方案已自动保存" : "选择商品后自动保存方案";
    byId("saveDraftButton").disabled = !hasProduct;
    byId("nextButton").disabled = !hasProduct || advancePending || commandBusy || !!currentState.analysisInProgress;
    byId("nextButton").title = hasProduct ? currentState.planFailureReason || "" : "请先在左侧选择真实商品";
    byId("nextButton").firstChild.nodeValue = (advancePending || currentState.analysisInProgress)
      ? (currentState.analysisInProgress ? "正在分析商品… " : "正在准备图文… ")
      : hasProduct
      ? (currentState.planFailureReason ? "重试并继续（" + (currentState.pageCount || 6) + "张） "
          : "下一步：生成" + (currentState.pageCount || 6) + "张图文 ")
      : "请先选择商品 ";
  }

  function renderStageVisibility() {
    var stage = currentState.selected ? Math.max(0, Math.min(3, Number(currentState.nativeStage) || 0)) : 0;
    byId("contentPlanWorkspace").classList.toggle("is-hidden", stage !== 0);
    byId("contentPlanFooter").classList.toggle("is-hidden", stage !== 0);
    byId("generationWorkspace").classList.toggle("is-hidden", stage !== 1);
    byId("generationFooter").classList.toggle("is-hidden", stage !== 1);
    byId("uploadWorkspace").classList.toggle("is-hidden", stage !== 2);
    byId("uploadFooter").classList.toggle("is-hidden", stage !== 2);
    byId("resultWorkspace").classList.toggle("is-hidden", stage !== 3);
    byId("resultFooter").classList.toggle("is-hidden", stage !== 3);
    Object.keys(graphicSelects).forEach(function (id) { graphicSelects[id].sync(); });

    [1, 2, 3, 4].forEach(function (number) {
      var step = byId("step" + number);
      var stageNumber = number - 1;
      step.classList.toggle("active", stageNumber === stage);
      step.classList.toggle("completed", stageNumber < stage);
      var blocked = stageNumber > 0 && !currentState.selected;
      step.setAttribute("aria-disabled", String(blocked));
      step.title = blocked ? "请先在左侧选择真实商品" : "";
    });
  }

  function renderCountOptions(id) {
    var host = byId(id);
    var generation = currentState.generation || {};
    var count = Number(currentState.pageCount || generation.pageCount) || 6;
    var locked = !!generation.inProgress || !!generation.preparing;
    var presets = [3, 6, 9, 12];
    if (!host.dataset.initialized) {
      presets.forEach(function (value) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "segment-button";
        button.dataset.count = value;
        button.textContent = value + "张";
        button.addEventListener("click", function () {
          editingPublishCopy = false;
          post({ type: "setGenerationCount", count: value });
        });
        host.appendChild(button);
      });
      host.dataset.initialized = "true";
    }
    host.querySelectorAll("button").forEach(function (button) {
      var selected = Number(button.dataset.count) === count;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
      button.disabled = locked;
    });

  }

  function renderGenerationOptions() {
    var generation = currentState.generation || {};
    var locked = !!generation.inProgress || !!generation.preparing;
    renderCountOptions("generationCountOptions");
    renderCountOptions("planCountOptions");

    var ratioHost = byId("generationRatioOptions");
    ratioHost.replaceChildren();
    ["3:4 竖图", "9:16 竖图", "1:1 方图", "4:3 横图"].forEach(function (ratio) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "segment-button" + (generation.ratio === ratio ? " selected" : "");
      button.textContent = ratio;
      button.disabled = locked;
      button.addEventListener("click", function () {
        post({ type: "setGenerationRatio", ratio: ratio });
      });
      ratioHost.appendChild(button);
    });
    byId("generationStructureSummary").textContent = text(generation.structureSummary, "AI已自动编排图文结构");
    byId("rearrangeGenerationButton").disabled = locked || !currentState.selected;
  }

  var generationCards = Object.create(null);
  var generationCardDisplayKey = null;

  function renderGenerationTasks() {
    var generation = currentState.generation || {};
    var tasks = generation.tasks || [];
    var host = byId("generationTaskGrid");
    var count = Number(generation.pageCount) || tasks.length || 6;
    var displayKey = generation.displayKey || (currentState.selected && currentState.selected.key) || "empty";
    if (generationCardDisplayKey !== displayKey) {
      generationCards = Object.create(null);
      generationCardDisplayKey = displayKey;
      host.replaceChildren();
    }
    byId("generationTaskTitle").textContent = count + "张图片的画面任务";
    byId("generationTaskHint").textContent = currentState.selected
      ? "生成后逐张显示图片，可双击查看大图"
      : "当前为页面预览；选择真实商品后会生成真实画面任务";
    var ratioClass = "ratio-1-1";
    if (String(generation.ratio || "").indexOf("3:4") === 0) ratioClass = "ratio-3-4";
    else if (String(generation.ratio || "").indexOf("9:16") === 0) ratioClass = "ratio-9-16";
    else if (String(generation.ratio || "").indexOf("4:3") === 0) ratioClass = "ratio-4-3";
    host.className = "generation-task-grid count-" + count +
      (count === 4 ? " count-6" : count === 7 || count === 8 ? " count-9" : count === 10 || count === 11 ? " count-12" : "") + " " + ratioClass;
    var empty = host.querySelector(".generation-task-empty");
    if (tasks.length && empty) empty.remove();
    var retained = Object.create(null);
    tasks.forEach(function (task, position) {
      var index = Number(task.index);
      if (!Number.isFinite(index)) index = position;
      var key = String(index);
      retained[key] = true;
      var card = generationCards[key];
      if (!card) {
        card = document.createElement("article");
        card.className = "generation-task-card";
        card.innerHTML = '<div class="task-card-header"><span class="task-preview-number"></span><span class="task-card-role"></span></div>' +
          '<div class="task-preview"></div><div class="task-card-copy"><div class="task-card-detail-row"><span class="task-card-detail-label">场景</span><p class="task-card-description"></p></div>' +
          '<div class="task-card-progress"><div class="task-card-progress-heading"><span>生成进度</span><div class="task-card-progress-actions"><strong class="task-card-progress-value"></strong>' +
          '<button type="button" class="task-edit-button">编辑图片</button></div></div>' +
          '<div class="task-card-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100"><span></span></div></div></div>';
        card._preview = card.querySelector(".task-preview");
        card._edit = card.querySelector(".task-edit-button");
        card._openable = false;
        card._preview.addEventListener("dblclick", function (event) {
          if (!card._openable) return;
          event.preventDefault();
          post({ type: "previewGenerationImage", index: index });
        });
        card._preview.addEventListener("keydown", function (event) {
          if (event.key !== "Enter" || !card._openable) return;
          event.preventDefault();
          post({ type: "previewGenerationImage", index: index });
        });
        card._edit.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          if (!card._edit.disabled) post({ type: "editGenerationImage", index: index });
        });
        generationCards[key] = card;
      }
      var number = text(task.number, String(position + 1).padStart(2, "0"));
      var role = text(task.role, "内容页");
      card.setAttribute("aria-label", number + " " + role + "画面任务");
      card.querySelector(".task-preview-number").textContent = number;
      card.querySelector(".task-card-role").textContent = role;
      card.querySelector(".task-card-description").textContent = text(task.description, "根据这一页的画面职责生成内容");
      var imageUrl = task.image || "";
      if (card._imageUrl !== imageUrl) {
        if (imageUrl) {
          card._preview.replaceChildren(makeImage(imageUrl, role));
        } else {
          var placeholder = document.createElement("div");
          placeholder.className = "task-pending-placeholder";
          placeholder.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><rect x="7" y="7" width="34" height="34" rx="5"/><circle cx="31" cy="17" r="3"/><path d="m9 34 10-11 8 8 5-5 7 8"/></svg><strong class="task-pending-status"></strong><span>生成后的图片将在这里显示</span>';
          card._preview.replaceChildren(placeholder);
        }
        card._imageUrl = imageUrl;
      }
      var pendingStatus = card._preview.querySelector(".task-pending-status");
      if (pendingStatus) pendingStatus.textContent = text(task.status, "待生成");
      card._openable = !!task.completed && !!task.image;
      card._preview.classList.toggle("is-openable", card._openable);
      card._preview.tabIndex = card._openable ? 0 : -1;
      card._preview.title = card._openable ? "双击查看大图" : "";
      card._preview.setAttribute("aria-label", number + "号图片" + (card._openable ? "，双击查看大图" : ""));
      card._edit.hidden = !card._openable;
      card._edit.disabled = !card._openable || !!generation.inProgress;
      card._edit.setAttribute("aria-label", "编辑第" + number + "张图片的字体和文字");
      var status = text(task.status, "待生成");
      var running = status === "生成中…" || status === "原图保存中" || status === "已出图，质检中";
      var preparing = status === "正在编排";
      var queued = status === "队列中";
      var retry = /失败|重试|未通过/.test(status);
      var progress = task.completed ? 100 : Math.max(0, Math.min(95, Number(task.progress) || (task.previewReady ? 80 : 0)));
      card.querySelector(".task-card-progress").className = "task-card-progress" +
        (task.completed ? " completed" : retry ? " retry" : running ? " running" : queued ? " queued" : preparing ? " preparing" : "");
      card.querySelector(".task-card-progress-value").textContent = task.completed ? "100%" :
        (status === "生成中…" ? "生成中" : status === "待生成" ? "0%" : preparing ? "准备中" : status);
      var track = card.querySelector(".task-card-progress-track");
      track.setAttribute("aria-label", number + "号图片生成进度");
      track.setAttribute("aria-valuetext", task.completed ? "原图已保存" : status);
      track.setAttribute("aria-valuenow", String(progress));
      track.firstElementChild.style.width = progress + "%";
      if (host.children[position] !== card) host.insertBefore(card, host.children[position] || null);
    });
    Object.keys(generationCards).forEach(function (key) {
      if (!retained[key]) { generationCards[key].remove(); delete generationCards[key]; }
    });
    if (!tasks.length && !empty) {
      empty = document.createElement("div");
      empty.className = "empty-list generation-task-empty";
      empty.textContent = "正在准备整套图文的画面任务…";
      host.appendChild(empty);
    }
  }

  function resizePublishTitle() {
    var input = byId("publishTitleInput");
    if (!input.clientWidth) return;
    var key = input.value + "|" + input.clientWidth;
    if (input.dataset.sizeKey === key) return;
    input.dataset.sizeKey = key;
    input.style.height = "auto";
    input.style.height = Math.max(66, input.scrollHeight + 2) + "px";
  }

  function updatePublishCopyCounters() {
    resizePublishTitle();
    byId("publishTitleCount").textContent = byId("publishTitleInput").value.length;
    byId("publishBodyCount").textContent = byId("publishBodyInput").value.length;
  }

  function setPublishCopyEditing(editing) {
    editingPublishCopy = !!editing;
    var titleInput = byId("publishTitleInput");
    var bodyInput = byId("publishBodyInput");
    titleInput.readOnly = !editingPublishCopy;
    bodyInput.readOnly = !editingPublishCopy;
    var editButton = byId("editPublishCopyButton");
    var editButtonLabel = editButton.querySelector(".copy-action-label");
    if (editButtonLabel) {
      editButtonLabel.textContent = editingPublishCopy ? "保存" : "编辑文案";
    } else {
      editButton.textContent = editingPublishCopy ? "保存" : "编辑文案";
    }
    editButton.classList.toggle("active", editingPublishCopy);
    if (editingPublishCopy) {
      titleInput.focus();
      titleInput.setSelectionRange(titleInput.value.length, titleInput.value.length);
    }
  }

  function renderGenerationSummary() {
    var generation = currentState.generation || {};
    byId("publishCopyRule").textContent = (generation.pageCount || 6) + "张图片 = 1套图文 = 1组标题与内容";

    if (!editingPublishCopy) {
      byId("publishTitleInput").value = text(generation.publishTitle, "这款商品，真实亮点清晰呈现");
      byId("publishBodyInput").value = text(generation.publishBody, "围绕商品的真实外观和已确认信息组织整套图文内容。");
      setPublishCopyEditing(false);
    }
    updatePublishCopyCounters();

    var hashtagsHost = byId("publishHashtags");
    hashtagsHost.replaceChildren();
    var hashtags = generation.publishHashtags || [];
    var isLegacyPreviewTopics = hashtags.length === 2 &&
      hashtags.indexOf("#抖音图文") >= 0 &&
      hashtags.indexOf("#好物推荐") >= 0;

    hashtags.forEach(function (hashtag) {
      var chip = document.createElement("span");
      chip.textContent = text(hashtag);
      hashtagsHost.appendChild(chip);
    });

    byId("cyclePublishTitleButton").disabled = !generation.canEditPublish;
    byId("rewritePublishCopyButton").disabled = !generation.canRewritePublish;
    byId("editPublishCopyButton").disabled = !generation.canEditPublish;
    byId("generationStatus").textContent = text(generation.status, "等待开始生成");
    byId("generationProgressText").textContent = (generation.completedCount || 0) + " / " + (generation.pageCount || 6);
    byId("generationProgressBar").style.width = Math.max(0, Math.min(100, Number(generation.progress) || 0)) + "%";
    byId("cancelGenerationButton").classList.toggle("is-hidden", !generation.inProgress);

    var startButton = byId("startGenerationButton");
    startButton.disabled = !currentState.selected || !generation.canStart || generationSubmissionPending;
    startButton.title = currentState.selected ? "" : "请先选择真实商品";
    startButton.replaceChildren(document.createTextNode((currentState.selected ? text(generation.actionText, "开始生成" + (generation.pageCount || 6) + "张图片") : "请先选择商品") + " "));
    var arrow = document.createElement("span");
    arrow.textContent = "〉";
    startButton.appendChild(arrow);
  }

  function renderGeneration() {
    validateGraphicCreditConfirmation();
    renderGenerationOptions();
    renderGenerationTasks();
    renderGenerationSummary();
  }

  function ratioShortLabel(ratio) {
    return text(ratio, "1:1 方图").replace(/\s+/g, "");
  }

  var uploadCardKey = "";
  function layoutUploadGallery() {
    var grid = byId("uploadPreviewGrid"), gallery = grid.parentElement;
    if (!gallery.clientWidth || !gallery.clientHeight) return;
    var count = grid.children.length || 3;
    var cols = count > 9 ? 4 : 3, rows = Math.ceil(count / cols);
    var match = String((currentState.generation || {}).ratio || "1:1").match(/(\d+)\s*:\s*(\d+)/);
    var ratio = match ? Number(match[1]) / Number(match[2]) : 1;
    var gap = count > 6 ? 10 : 14;
    var available = gallery.clientHeight - 4;
    var width = Math.min((gallery.clientWidth - gap * (cols - 1) - 4) / cols,
      ((available - gap * (rows - 1)) / rows - 34) * ratio, count === 3 ? 290 : 230);
    width = Math.max(36, Math.floor(width));
    grid.classList.toggle("compact-tiles", width < 95);
    grid.style.setProperty("--upload-columns", cols);
    grid.style.setProperty("--upload-card-width", width + "px");
    grid.style.setProperty("--upload-image-height", Math.floor(width / ratio) + "px");
    grid.style.setProperty("--upload-gap", gap + "px");
  }

  function renderUploadPreview() {
    var generation = currentState.generation || {};
    var tasks = generation.tasks || [], count = Number(generation.pageCount) || tasks.length || 6;
    byId("uploadRuleText").textContent = count + " 张图片 · " + ratioShortLabel(generation.ratio) + " · 1 套千川图文";
    var host = byId("uploadPreviewGrid");
    host.className = "upload-preview-grid upload-count-" + count;
    var key = text(generation.displayKey) + "|" + count;
    if (uploadCardKey !== key) { host.replaceChildren(); uploadCardKey = key; }
    tasks.slice(0, count).forEach(function (task, index) {
      var card = host.children[index];
      if (!card) {
        card = document.createElement("article");
        card.className = "upload-preview-card";
        card.innerHTML = '<span class="upload-preview-number"></span><div class="upload-image-wrap"></div><div class="upload-image-ready"><span aria-hidden="true"></span><strong></strong></div>';
        host.appendChild(card);
      }
      card.querySelector(".upload-preview-number").textContent = String(index + 1).padStart(2, "0");
      var imageWrap = card.querySelector(".upload-image-wrap"), imageUrl = task.image || "";
      if (card._imageUrl !== imageUrl) {
        if (imageUrl) imageWrap.replaceChildren(makeImage(imageUrl, "第 " + (index + 1) + " 张生成图片"));
        else {
          var empty = document.createElement("div");
          empty.className = "upload-pending-image";
          empty.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="7" y="7" width="34" height="34" rx="5"/><circle cx="31" cy="17" r="3"/><path d="m9 34 10-11 8 8 5-5 7 8"/></svg><span>等待 AI 生成</span>';
          imageWrap.replaceChildren(empty);
        }
        card._imageUrl = imageUrl;
      }
      var ready = !!task.completed && !!imageUrl, status = card.querySelector(".upload-image-ready");
      status.classList.toggle("pending", !ready);
      var statusIcon = ready ? '<svg class="check-icon" viewBox="0 0 24 24"><path d="M5 12l4 4L19 6"/></svg>' : "·";
      if (card._ready !== ready) { status.firstElementChild.innerHTML = statusIcon; card._ready = ready; }
      status.querySelector("strong").textContent = ready ? (index === 0 ? "封面 · 已就绪" : "已就绪") : text(task.status, "等待生成");
    });
    while (host.children.length > count) host.lastElementChild.remove();
    layoutUploadGallery();
  }

  function renderUploadSummary() {
    var generation = currentState.generation || {};
    var count = Number(generation.pageCount) || 6;
    byId("uploadCopyIntro").textContent = count + "张图片共同使用以下标题、内容和话题";
    byId("uploadPublishTitle").textContent = text(generation.publishTitle, "这款商品，真实亮点清晰呈现");
    var body = text(generation.publishBody, "围绕商品的真实外观和已确认信息组织整套图文内容。");
    byId("uploadPublishBody").textContent = body;
    byId("showUploadBodyButton").textContent = "查看全文";
    byId("showUploadBodyButton").classList.remove("is-hidden");
    var tags = byId("uploadPublishHashtags");
    tags.replaceChildren();
    (generation.publishHashtags || []).slice(0, 6).forEach(function (hashtag) {
      var chip = document.createElement("span");
      chip.textContent = text(hashtag);
      tags.appendChild(chip);
    });
  }

  function renderUploadSettings() {
    var upload = currentState.upload || {}, generation = currentState.generation || {};
    if (musicController) musicController.render();
    var music = upload.music || { mode: "none", ready: true };
    var musicPending = musicController && musicController.pending();
    var shopSelect = byId("uploadShopSelect"), shops = upload.shops || (upload.shop ? [upload.shop] : []);
    var shopSignature = JSON.stringify(shops);
    if (shopSelect._signature !== shopSignature) {
      shopSelect.replaceChildren();
      var emptyShop = document.createElement("option"); emptyShop.value = "";
      emptyShop.textContent = "请选择上传店铺"; shopSelect.appendChild(emptyShop);
      shops.forEach(function (shop) {
        var option = document.createElement("option"); option.value = shop; option.textContent = shop;
        shopSelect.appendChild(option);
      });
      shopSelect._signature = shopSignature;
    }
    var switching = !!uploadShopPending;
    shopSelect.value = switching ? uploadShopPending.shop : text(upload.shop);
    shopSelect.title = shopSelect.value;
    shopSelect.disabled = switching || musicPending || !!upload.plansRefreshing || !!upload.inProgress || !upload.productKey || !shops.length;
    var plans = upload.plans || [], select = byId("uploadPlanSelect");
    var signature = JSON.stringify([upload.productKey, upload.shop, plans]);
    if (select._signature !== signature) {
      select.replaceChildren();
      var placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = plans.length ? "请选择千川计划" : "暂无可用计划，请刷新";
      select.appendChild(placeholder);
      plans.forEach(function (plan) {
        var option = document.createElement("option"); option.value = plan.id; option.textContent = plan.name; select.appendChild(option);
      });
      select._signature = signature;
    }
    select.value = text(upload.planId);
    select.disabled = switching || !!upload.plansRefreshing || !!upload.inProgress || !plans.length;
    graphicSelects.uploadShopSelect.sync();
    graphicSelects.uploadPlanSelect.sync();
    byId("uploadPlanDetail").textContent = upload.planId ? text(upload.planName) + " · 计划 ID：" + upload.planId :
      plans.length ? "选择该店铺已有的千川计划" : "请先登录该店铺并同步千川计划";
    var refresh = byId("refreshUploadPlansButton");
    refresh.disabled = switching || !upload.shop || !!upload.plansRefreshing || !!upload.inProgress;
    refresh.textContent = upload.plansRefreshing ? "正在刷新…" : "刷新计划";
    var count = Number(generation.pageCount) || 6;
    var checks = [
      [!!upload.imagesReady, "图片 " + (Number(upload.completedCount) || 0) + "/" + count],
      [!!upload.copyReady, upload.copyReady ? "文案已准备" : "文案待完善"],
      [!!music.ready, music.mode === "none" ? "不配乐" : music.ready ? "配乐已选" : "配乐待确认"],
      [!!upload.targetReady, upload.targetReady ? "计划已选择" : "计划待确认"]
    ];
    var list = byId("preflightList"); list.replaceChildren();
    checks.forEach(function (check) {
      var item = document.createElement("li"); item.className = check[0] ? "ready" : "pending";
      item.innerHTML = '<span aria-hidden="true">' + (check[0] ? '<svg class="check-icon" viewBox="0 0 24 24"><path d="M5 12l4 4L19 6"/></svg>' : "·") + '</span><strong></strong>';
      item.querySelector("strong").textContent = check[1]; list.appendChild(item);
    });
    byId("cancelAtlasUploadButton").classList.toggle("is-hidden", !upload.inProgress);
    byId("uploadReadyBanner").textContent = upload.status || (upload.ready ? "已准备好，可将整套图文上传到所选计划" :
      !upload.imagesReady ? "图片生成完成后即可上传" : !upload.copyReady ? "请返回上一步完善图文标题和内容" : !music.ready ? "请确认背景音乐，也可以选择不配乐" : "请选择有效计划，或刷新店铺计划列表");
    var startButton = byId("startAutoUploadButton"); startButton.disabled = switching || musicPending || !music.ready || !upload.ready;
    startButton.firstChild.nodeValue = upload.inProgress ? "正在上传到千川计划… " : upload.ready && music.ready ? "上传到千川计划 " : !upload.imagesReady ? "请先完成全部图片 " : !upload.copyReady ? "请先完善图文文案 " : !music.ready ? "请确认背景音乐 " : "请选择千川计划 ";
  }

  function renderUpload() {
    renderUploadPreview();
    renderUploadSummary();
    renderUploadSettings();
  }

  function renderAll() {
    validateGraphicCreditConfirmation();
    if (musicController) musicController.render();
    renderStageVisibility();
    renderShopFilter();
    renderProductList();
    renderSelectedProduct();
    renderCountOptions("planCountOptions");
    renderGoals();
    renderDirections();
    renderStructure();
    renderAssistant();
    renderFooter();
    var stage = Number(currentState.nativeStage) || 0;
    if (stage === 1) renderGeneration();
    if (stage === 2) renderUpload();
    if (window.graphicDesktop) window.graphicDesktop.render(currentState);
  }

  function setBusy(busy, message) {
    if (busy) Object.keys(graphicSelects).forEach(function (id) { graphicSelects[id].close(); });
    byId("busyText").textContent = text(message, "正在处理…");
    byId("busyLayer").classList.toggle("is-hidden", !busy);
  }

  function showToast(message, isError) {
    var toast = byId("toast");
    toast.textContent = text(message, "操作已完成");
    toast.classList.toggle("error", !!isError);
    toast.classList.remove("is-hidden");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.classList.add("is-hidden");
    }, 2600);
  }

  function setTutorialVisible(visible) {
    byId("tutorialModal").classList.toggle("is-hidden", !visible);
  }

  function wireEvents() {
    ["shopFilter", "uploadShopSelect", "uploadPlanSelect"].forEach(function (id) {
      graphicSelects[id] = window.createAiGraphicSelect(byId(id));
    });
    byId("shopFilter").addEventListener("change", function () {
      if (currentState.shopAccess) {
        byId("syncProductsButton").disabled = true;
        post({ type: "selectShop", shopKey: byId("shopFilter").value });
      } else renderProductList();
    });
    document.querySelectorAll('[data-product-status]').forEach(function(button) { button.addEventListener('click', function() {
      productStatus = button.dataset.productStatus;
      document.querySelectorAll('[data-product-status]').forEach(function(b) { b.classList.toggle('active', b === button); });
      renderProductList();
    }); });
    byId('productPrevious').addEventListener('click', function() { productPage--; renderProductList(); });
    byId('productNext').addEventListener('click', function() { productPage++; renderProductList(); });
    byId("productSearch").addEventListener("input", renderProductList);
    byId("syncProductsButton").addEventListener("click", function () {
      post({ type: "syncProducts", shopKey: byId("shopFilter").value });
    });
    byId("parseProductButton").addEventListener("click", function () {
      var input = text(byId("productLink").value);
      if (!input) {
        showToast("请先粘贴商品链接或输入商品ID。", true);
        return;
      }
      post({ type: "parseProduct", input: input });
    });
    byId("productLink").addEventListener("keydown", function (event) {
      if (event.key === "Enter") byId("parseProductButton").click();
    });

    document.querySelectorAll("[data-goal]").forEach(function (button) {
      button.addEventListener("click", function () {
        post({
          type: "setPlan",
          goal: button.getAttribute("data-goal"),
          direction: currentState.direction
        });
      });
    });
    byId("reanalyzeProductButton").addEventListener("click", function () {
      post({ type: "reanalyzeProduct" });
    });
    byId("saveDraftButton").addEventListener("click", function () {
      post({ type: "saveDraft" });
    });
    byId("draftBoxButton").addEventListener("click", function () {
      post({ type: "openDraft" });
    });
    byId("nextButton").addEventListener("click", function () {
      if (selectionPendingKey) return;
      if (!currentState.selected || advancePending || commandBusy || currentState.analysisInProgress) return;
      advancePending = !!currentState.selected;
      renderFooter();
      post({ type: "next" });
    });
    function returnToContentPlan() {
      editingPublishCopy = false;
      post({ type: "backToContentPlan" });
    }
    byId("backToPlanButton").addEventListener("click", returnToContentPlan);
    byId("generationBackButton").addEventListener("click", returnToContentPlan);
    function navigateToStage(stage) {
      if (stage > 0 && !currentState.selected) {
        showToast("请先在左侧选择真实商品，再进入下一步。", true);
        return;
      }
      if (Number(currentState.nativeStage) !== stage) post({ type: "openStage", stage: stage });
    }
    byId("step1").addEventListener("click", function () { navigateToStage(0); });
    byId("step2").addEventListener("click", function () { navigateToStage(1); });
    byId("step3").addEventListener("click", function () { navigateToStage(2); });
    byId("step4").addEventListener("click", function () { navigateToStage(3); });
    byId("rearrangeGenerationButton").addEventListener("click", function () {
      editingPublishCopy = false;
      post({ type: "rearrangeGeneration" });
    });
    byId("generationSaveDraftButton").addEventListener("click", function () {
      post({ type: "saveDraft" });
    });
    byId("startGenerationButton").addEventListener("click", requestGraphicGeneration);
    byId("confirmGraphicCredit").addEventListener("click", confirmGraphicGeneration);
    byId("cancelGraphicCredit").addEventListener("click", closeGraphicCreditConfirmation);
    byId("closeGraphicCredit").addEventListener("click", closeGraphicCreditConfirmation);
    byId("graphicCreditDialog").addEventListener("cancel", function (event) {
      event.preventDefault(); closeGraphicCreditConfirmation();
    });
    byId("graphicCreditDialog").addEventListener("click", function (event) {
      if (event.target === byId("graphicCreditDialog")) closeGraphicCreditConfirmation();
    });
    byId("cancelGenerationButton").addEventListener("click", function () {
      post({ type: "cancelGeneration" });
    });
    byId("editPublishCopyButton").addEventListener("click", function () {
      if (!editingPublishCopy) {
        setPublishCopyEditing(true);
        return;
      }
      var title = text(byId("publishTitleInput").value);
      if (!title) {
        showToast("整套图文标题不能为空。", true);
        byId("publishTitleInput").focus();
        return;
      }
      var body = text(byId("publishBodyInput").value);
      if (!body) {
        showToast("整套图文的发布内容不能为空。", true);
        byId("publishBodyInput").focus();
        return;
      }
      setPublishCopyEditing(false);
      post({ type: "updatePublishCopy", title: title, body: body });
    });
    byId("cyclePublishTitleButton").addEventListener("click", function () {
      setPublishCopyEditing(false);
      post({ type: "cyclePublishTitle" });
    });
    byId("rewritePublishCopyButton").addEventListener("click", function () {
      setPublishCopyEditing(false);
      post({ type: "rewritePublishCopy" });
    });
    byId("publishTitleInput").addEventListener("input", updatePublishCopyCounters);
    byId("publishTitleInput").addEventListener("keydown", function (event) {
      if (event.key === "Enter") event.preventDefault();
    });
    window.addEventListener("resize", resizePublishTitle);
    byId("publishBodyInput").addEventListener("input", updatePublishCopyCounters);

    function backToGeneration() { if (musicController) musicController.close(); post({ type: "openStage", stage: 1 }); }
    byId("backToGenerationTopButton").addEventListener("click", backToGeneration);
    byId("backToGenerationCopyButton").addEventListener("click", backToGeneration);
    byId("backToGenerationButton").addEventListener("click", backToGeneration);
    byId("returnToUploadButton").addEventListener("click", function () { post({ type: "openStage", stage: 2 }); });
    byId("resultBackButton").addEventListener("click", function () { post({ type: "openStage", stage: 2 }); });
    byId("openDraftAfterResultButton").addEventListener("click", function () { post({ type: "openDraft" }); });
    byId("uploadShopSelect").addEventListener("change", function () {
      var upload = currentState.upload || {}, shop = byId("uploadShopSelect").value;
      if (uploadShopPending || upload.inProgress || upload.plansRefreshing || !shop || shop === upload.shop) {
        renderUploadSettings(); return;
      }
      uploadShopPending = { shop: shop, requestId: String(++uploadShopRequestId) };
      if (musicController) musicController.close();
      renderUploadSettings();
      post({ type: "selectUploadShop", shop: shop, productKey: upload.productKey,
        requestId: uploadShopPending.requestId });
    });
    byId("uploadPlanSelect").addEventListener("change", function () {
      if (uploadShopPending) return;
      var upload = currentState.upload || {};
      var selected = (upload.plans || []).find(function (plan) { return plan.id === byId("uploadPlanSelect").value; });
      post({ type: "selectUploadPlan", shop: upload.shop, productKey: upload.productKey,
        planName: selected ? selected.name : "", planId: selected ? selected.id : "" });
    });
    byId("cancelAtlasUploadButton").addEventListener("click", function () { post({ type: "cancelAtlasUpload" }); });
    byId("refreshUploadPlansButton").addEventListener("click", function () { post({ type: "refreshUploadPlans" }); });
    if (window.ResizeObserver) new ResizeObserver(layoutUploadGallery).observe(byId("uploadPreviewGrid").parentElement);
    window.addEventListener("resize", layoutUploadGallery);
    byId("uploadSaveDraftButton").addEventListener("click", function () { post({ type: "saveDraft" }); });
    byId("startAutoUploadButton").addEventListener("click", function () { if (musicController) musicController.close(); post({ type: "startAutoUpload" }); });

    byId("tutorialButton").addEventListener("click", function () { setTutorialVisible(true); });
    byId("closeTutorialButton").addEventListener("click", function () { setTutorialVisible(false); });
    byId("gotItButton").addEventListener("click", function () { setTutorialVisible(false); });
    byId("tutorialModal").addEventListener("click", function (event) {
      if (event.target === byId("tutorialModal")) setTutorialVisible(false);
    });
    byId("useLegacyButton").addEventListener("click", function () {
      setTutorialVisible(false);
      post({ type: "useLegacy" });
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") setTutorialVisible(false);
    });
  }

  if (window.chrome && window.chrome.webview) {
    window.chrome.webview.addEventListener("message", function (event) {
      var message = event.data || {};
      if (message.type === "state") {
        if (message.products) {
          var previousProducts = new Map((currentState.products || []).map(function (p) { return [p.key,p]; }));
          message.products.forEach(function (p) { var previous=previousProducts.get(p.key); if (!p.image && previous && previous.imageVersion===p.imageVersion) p.image=previous.image; });
        }
        if (message.selected && !message.selected.image) {
          var selectedPrevious=(message.products || currentState.products || []).find(function (p) { return p.key===message.selected.key && p.imageVersion===message.selected.imageVersion; });
          if (selectedPrevious) message.selected.image=selectedPrevious.image;
        }
        currentState = Object.assign({}, currentState, message);
        if ((currentState.generation || {}).inProgress || (currentState.generation || {}).preparing || Number(currentState.nativeStage) !== 1) generationSubmissionPending = false;
        renderAll();
      } else if (message.type === "shopAccess") {
        currentState.shopAccess = message.shopAccess;
        renderShopFilter();
        renderProductList();
      } else if (message.type === "productThumbnail") {
        (currentState.products || []).forEach(function (p) { if(p.key===message.key && p.imageVersion===message.imageVersion) p.image=message.image; });
        var item=productItems.get(message.key);
        if(item && item._product.imageVersion===message.imageVersion) updateRetainedImage(item.querySelector('.product-thumb'),message.image,item._product.name);
        if(currentState.selected && currentState.selected.key===message.key && currentState.selected.imageVersion===message.imageVersion) {
          currentState.selected.image=message.image;
          updateRetainedImage(byId('selectedImageWrap'),message.image,currentState.selected.name);
        }
      } else if (message.type === "productSelectionResult") {
        finishProductSelection(message);
      } else if (message.type === "uploadShopSelectionResult") {
        if (!uploadShopPending || String(message.requestId) !== uploadShopPending.requestId) return;
        uploadShopPending = null;
        currentState.upload = message.upload || currentState.upload;
        renderUploadSettings();
      } else if (message.type === "uploadState") {
        currentState.upload = message.upload || {};
        renderUploadSettings();
      } else if (message.type === "musicResult") {
        if (musicController) musicController.receive(message);
      } else if (message.type === "analysisProgress") {
        currentState.analysisInProgress = !!message.analysisInProgress;
        currentState.analysisStatus = text(message.analysisStatus, "正在分析真实商品数据");
        byId("analysisStatus").textContent = currentState.analysisStatus;
        byId("busyText").textContent = currentState.analysisStatus;
        renderFooter();
        byId("reanalyzeProductButton").disabled = currentState.analysisInProgress;
      } else if (message.type === "generationState") {
        currentState.nativeStage = message.nativeStage;
        var incoming = message.generation;
        if (incoming) {
          var previous = currentState.generation || {};
          var sameDisplay = incoming.displayKey === previous.displayKey;
          incoming.tasks = (incoming.tasks || []).map(function (task) {
            if (Object.prototype.hasOwnProperty.call(task, "image")) return task;
            var prior = sameDisplay && (previous.tasks || []).find(function (item) { return Number(item.index) === Number(task.index); });
            return Object.assign({}, task, { image: prior ? prior.image : "" });
          });
          currentState.generation = incoming;
          if (incoming.inProgress || incoming.preparing || Number(currentState.nativeStage) !== 1) generationSubmissionPending = false;
        }
        if (message.upload) currentState.upload = message.upload;
        renderStageVisibility();
        renderGeneration();
        if (currentState.nativeStage === 2) renderUpload();
        if (window.graphicDesktop) window.graphicDesktop.render(currentState);
      } else if (message.type === "busy") {
        commandBusy = !!message.busy;
        if (currentState.shopAccess) renderShopFilter();
        if (!commandBusy) generationSubmissionPending = false;
        validateGraphicCreditConfirmation();
        if (Number(currentState.nativeStage) === 1) renderGenerationSummary();
        if (!commandBusy) advancePending = false;
        renderFooter();
        setBusy(commandBusy, message.text);
      } else if (message.type === "toast") {
        showToast(message.text, message.error);
      }
    });
  }

  musicController = window.createAiGraphicMusic({
    state: function () { return currentState; }, post: post, toast: showToast,
    switching: function () { return !!uploadShopPending; },
    applyUpload: function (upload) { if (upload) currentState.upload = upload; },
    renderUpload: renderUploadSettings
  });
  wireEvents();
  renderAll();
  requestAnimationFrame(function () { requestAnimationFrame(function () { post({ type: "ready" }); }); });
}());
