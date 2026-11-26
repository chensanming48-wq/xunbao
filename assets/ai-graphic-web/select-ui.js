(function () {
  "use strict";

  var opened = null;

  // Keep each native select as the state/ change-event contract with app.js.
  window.createAiGraphicSelect = function (select) {
    var control = document.createElement("div");
    control.id = select.id + "Control";
    control.className = "graphic-select";
    var trigger = document.createElement("button");
    trigger.type = "button";
    trigger.id = select.id + "Trigger";
    trigger.className = "graphic-select-trigger";
    trigger.setAttribute("role", "combobox");
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", select.id + "Menu");
    var label = select.getAttribute("aria-label") || (select.labels[0] && select.labels[0].textContent) || "请选择";
    trigger.setAttribute("aria-label", label);
    if (select.hasAttribute("aria-describedby")) trigger.setAttribute("aria-describedby", select.getAttribute("aria-describedby"));
    Array.from(select.labels).forEach(function (item) { item.htmlFor = trigger.id; });
    var value = document.createElement("span");
    value.className = "graphic-select-value";
    var chevron = document.createElement("span");
    chevron.className = "graphic-select-chevron";
    chevron.setAttribute("aria-hidden", "true");
    trigger.append(value, chevron);
    var menu = document.createElement("div");
    menu.id = select.id + "Menu";
    menu.className = "graphic-select-menu";
    menu.hidden = true;
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", label);
    var list = menu, search = null, searchRow = null, clearSearch = null, empty = null;
    var queryTokens = [], opensUpward = null;
    if (select.hasAttribute("data-searchable")) {
      var searchingShops = select.getAttribute("data-searchable") === "shop";
      menu.classList.add("searchable");
      menu.setAttribute("role", "dialog");
      menu.setAttribute("aria-label", "选择" + label);
      trigger.removeAttribute("role");
      trigger.setAttribute("aria-haspopup", "dialog");
      searchRow = document.createElement("div");
      searchRow.className = "graphic-select-search-row";
      var searchIcon = document.createElement("span");
      searchIcon.className = "magnifier";
      searchIcon.setAttribute("aria-hidden", "true");
      search = document.createElement("input");
      search.id = select.id + "Search";
      search.type = "text";
      search.className = "graphic-select-search";
      search.placeholder = searchingShops ? "搜索店铺名称" : "搜索计划名称 / ID";
      search.autocomplete = "off";
      search.spellcheck = false;
      search.setAttribute("aria-label", searchingShops ? "搜索店铺名称" : "搜索计划名称或ID");
      search.setAttribute("role", "combobox");
      search.setAttribute("aria-autocomplete", "list");
      search.setAttribute("aria-expanded", "false");
      search.setAttribute("aria-controls", select.id + "Options");
      clearSearch = document.createElement("button");
      clearSearch.id = select.id + "Clear";
      clearSearch.type = "button";
      clearSearch.className = "graphic-select-search-clear";
      clearSearch.textContent = "×";
      clearSearch.title = "清空搜索";
      clearSearch.setAttribute("aria-label", "清空搜索");
      clearSearch.tabIndex = -1;
      clearSearch.hidden = true;
      searchRow.append(searchIcon, search, clearSearch);
      list = document.createElement("div");
      list.id = select.id + "Options";
      list.className = "graphic-select-options";
      list.setAttribute("role", "listbox");
      list.setAttribute("aria-label", label);
      empty = document.createElement("div");
      empty.className = "graphic-select-empty";
      empty.setAttribute("role", "status");
      empty.textContent = searchingShops ? "未找到匹配店铺，试试其他关键词" : "未找到匹配计划，试试其他关键词";
      empty.hidden = true;
      menu.append(searchRow, list, empty);
    }
    select.before(control);
    control.append(select, trigger);
    select.hidden = true;
    select.tabIndex = -1;
    // Outside scrolling panels so the menu and its shadow cannot be clipped.
    document.body.appendChild(menu);
    var signature = "", activeIndex = -1, prefix = "", prefixTime = 0;

    function close() {
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      trigger.removeAttribute("aria-activedescendant");
      if (search) {
        search.setAttribute("aria-expanded", "false");
        search.removeAttribute("aria-activedescendant");
      }
      opensUpward = null;
      if (opened === api) opened = null;
    }

    function position() {
      if (menu.hidden) return;
      var rect = trigger.getBoundingClientRect();
      if (!rect.width || !rect.height) { close(); return; }
      menu.style.width = Math.min(rect.width, window.innerWidth - 16) + "px";
      menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)) + "px";
      var below = window.innerHeight - rect.bottom - 14;
      var above = rect.top - 14;
      var limit = search ? 344 : 284;
      var naturalHeight = search ? searchRow.offsetHeight + list.scrollHeight + empty.offsetHeight + 12 : menu.scrollHeight;
      if (opensUpward === null) opensUpward = below < Math.min(limit, naturalHeight) && above > below;
      menu.style.maxHeight = Math.max(0, Math.min(limit, opensUpward ? above : below)) + "px";
      menu.style.top = (opensUpward ? rect.top - menu.offsetHeight - 6 : rect.bottom + 6) + "px";
    }

    function highlight(index, scroll) {
      activeIndex = index;
      Array.from(list.children).forEach(function (option, i) { option.classList.toggle("active", i === index); });
      var item = list.children[index], focusOwner = search || trigger;
      focusOwner.removeAttribute("aria-activedescendant");
      if (item && !item.hidden && !menu.hidden) {
        focusOwner.setAttribute("aria-activedescendant", item.id);
        if (scroll) item.scrollIntoView({ block: "nearest" });
      }
    }

    function normalize(value) {
      return String(value || "").normalize("NFKC").toLocaleLowerCase().trim();
    }

    function filterOptions(resetScroll) {
      if (!search) return;
      var visible = 0, first = -1;
      Array.from(list.children).forEach(function (item, index) {
        var matches = !queryTokens.length || (item._value !== "" && queryTokens.every(function (token) { return item._searchText.indexOf(token) >= 0; }));
        item.hidden = !matches;
        if (matches && item._value !== "") visible++;
        if (matches && !select.options[index].disabled && first < 0) first = index;
      });
      empty.hidden = visible > 0;
      clearSearch.hidden = !search.value;
      var active = list.children[activeIndex];
      if (!active || active.hidden || select.options[activeIndex].disabled) {
        var selectedItem = list.children[select.selectedIndex];
        activeIndex = selectedItem && !selectedItem.hidden && !select.options[select.selectedIndex].disabled ? select.selectedIndex : first;
      }
      if (resetScroll) list.scrollTop = 0;
    }

    function searchChanged() {
      queryTokens = normalize(search.value).split(/\s+/).filter(Boolean);
      activeIndex = -1;
      filterOptions(true);
      position();
      highlight(activeIndex, true);
    }

    function sync() {
      var options = Array.from(select.options);
      var selected = options[select.selectedIndex];
      value.textContent = selected ? selected.textContent : "请选择";
      trigger.title = value.textContent;
      trigger.disabled = select.disabled;
      if (select.disabled || !trigger.getClientRects().length) close();
      var nextSignature = JSON.stringify(options.map(function (option) { return [option.value, option.textContent, option.disabled]; }));
      if (signature !== nextSignature) {
        var activeValue = list.children[activeIndex] && list.children[activeIndex]._value;
        signature = nextSignature;
        list.replaceChildren();
        options.forEach(function (option, index) {
          var item = document.createElement("div");
          item.id = select.id + "Option" + index;
          item.className = "graphic-select-option";
          item.setAttribute("role", "option");
          item.setAttribute("aria-disabled", String(option.disabled));
          item._value = option.value;
          if (search) item._searchText = normalize(option.textContent + " " + option.value);
          var name = document.createElement("span");
          name.textContent = option.textContent;
          var check = document.createElement("span");
          check.className = "graphic-select-check";
          check.setAttribute("aria-hidden", "true");
          item.append(name, check);
          item.addEventListener("pointermove", function () { if (!option.disabled) highlight(index, false); });
          item.addEventListener("pointerdown", function (event) { event.preventDefault(); });
          item.addEventListener("click", function () { choose(index); });
          list.appendChild(item);
        });
        var retained = options.findIndex(function (option) { return option.value === activeValue; });
        activeIndex = retained >= 0 ? retained : select.selectedIndex;
      }
      Array.from(list.children).forEach(function (item, index) { item.setAttribute("aria-selected", String(index === select.selectedIndex)); });
      filterOptions(false);
      position();
      highlight(activeIndex, false);
    }

    function open() {
      if (search) { search.value = ""; queryTokens = []; }
      sync();
      if (trigger.disabled || !select.options.length) return;
      if (opened && opened !== api) opened.close();
      opened = api;
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      if (search) search.setAttribute("aria-expanded", "true");
      position();
      highlight(Math.max(0, select.selectedIndex), true);
      if (search) search.focus({ preventScroll: true });
    }

    function choose(index) {
      var option = select.options[index];
      if (select.disabled || !option || option.disabled || (list.children[index] && list.children[index].hidden)) return;
      var changed = select.selectedIndex !== index;
      select.selectedIndex = index;
      close();
      sync();
      trigger.focus({ preventScroll: true });
      if (changed) select.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function move(direction, endpoint) {
      var index = endpoint === undefined ? activeIndex + direction : endpoint;
      while (index >= 0 && index < select.options.length) {
        if (!select.options[index].disabled && !list.children[index].hidden) { highlight(index, true); return; }
        index += direction;
      }
    }

    trigger.addEventListener("click", function () { if (menu.hidden) open(); else close(); });
    trigger.addEventListener("keydown", function (event) {
      var key = event.key;
      if (event.isComposing || event.keyCode === 229) return;
      if (key === "Tab") { close(); return; }
      if (key === "Escape") { if (!menu.hidden) { event.preventDefault(); event.stopPropagation(); close(); } return; }
      if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].indexOf(key) >= 0) {
        event.preventDefault();
        if (menu.hidden) { open(); if (key === "Home" || key === "End") move(key === "Home" ? 1 : -1, key === "Home" ? 0 : select.options.length - 1); return; }
        if (key === "Enter" || key === " ") choose(activeIndex);
        else if (key === "Home" || key === "End") move(key === "Home" ? 1 : -1, key === "Home" ? 0 : select.options.length - 1);
        else move(key === "ArrowDown" ? 1 : -1);
      } else if (key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey && !event.isComposing) {
        event.preventDefault();
        if (menu.hidden) open();
        if (search) { search.value = key; searchChanged(); return; }
        prefix = Date.now() - prefixTime > 700 ? key : prefix + key;
        prefixTime = Date.now();
        var index = Array.from(select.options).findIndex(function (option) { return !option.disabled && option.textContent.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase()); });
        if (index >= 0) highlight(index, true);
      }
    });
    if (search) {
      search.addEventListener("input", searchChanged);
      clearSearch.addEventListener("click", function () {
        search.value = "";
        searchChanged();
        search.focus({ preventScroll: true });
      });
      search.addEventListener("keydown", function (event) {
        if (event.isComposing || event.keyCode === 229) return;
        if (event.key === "Escape") {
          event.preventDefault(); event.stopPropagation(); close();
          trigger.focus({ preventScroll: true });
        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          move(event.key === "ArrowDown" ? 1 : -1);
        } else if (event.key === "Enter") {
          event.preventDefault();
          choose(activeIndex);
        } else if (event.key === "Tab") {
          // The popup lives at the end of body; continue from the trigger's
          // position in the form instead of jumping past all upload controls.
          event.preventDefault();
          close();
          var focusable = Array.from(document.querySelectorAll("button, input, select, textarea, a[href], [tabindex]")).filter(function (item) {
            return !item.disabled && item.tabIndex >= 0 && item.getClientRects().length && getComputedStyle(item).visibility !== "hidden";
          });
          var next = focusable[focusable.indexOf(trigger) + (event.shiftKey ? -1 : 1)];
          (next || trigger).focus({ preventScroll: true });
        }
      });
    }
    select.addEventListener("change", sync);
    document.addEventListener("pointerdown", function (event) { if (!control.contains(event.target) && !menu.contains(event.target)) close(); });
    document.addEventListener("focusin", function (event) { if (!control.contains(event.target) && !menu.contains(event.target)) close(); });
    document.addEventListener("scroll", function (event) { if (!menu.contains(event.target)) position(); }, true);
    window.addEventListener("resize", function () { opensUpward = null; position(); });
    window.addEventListener("blur", close);
    var api = { sync: sync, close: close };
    sync();
    return api;
  };
}());
