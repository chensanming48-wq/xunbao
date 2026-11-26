(function () {
  "use strict";

  var tabs = [document.getElementById("membershipTab"), document.getElementById("computeTab")];
  var panels = [document.getElementById("membershipPanel"), document.getElementById("computePanel")];
  var packages = Array.prototype.slice.call(document.querySelectorAll(".rc-package"));

  function selectTab(name, focus) {
    var index = name === "compute" ? 1 : 0;
    tabs.forEach(function (tab, i) {
      tab.classList.toggle("active", i === index);
      tab.setAttribute("aria-selected", i === index ? "true" : "false");
      tab.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
    });
    if (focus) tabs[index].focus();
  }

  tabs.forEach(function (tab, index) {
    tab.addEventListener("click", function () { selectTab(index ? "compute" : "membership"); });
    tab.addEventListener("keydown", function (event) {
      var next;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") next = 1 - index;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = 1;
      else return;
      event.preventDefault();
      selectTab(next ? "compute" : "membership", true);
    });
  });

  function selectPackage(button) {
    packages.forEach(function (item) {
      var selected = item === button;
      item.classList.toggle("selected", selected);
      item.setAttribute("aria-checked", selected ? "true" : "false");
      item.tabIndex = selected ? 0 : -1;
    });
    document.getElementById("computeAmount").textContent = "¥" + button.getAttribute("data-amount");
    document.getElementById("computeTotal").textContent = button.getAttribute("data-amount");
    document.getElementById("computeCredits").textContent = Number(button.getAttribute("data-credits")).toLocaleString("en-US");
    document.getElementById("computeDiscount").textContent = button.getAttribute("data-discount");
    // Prices are display-only until a server-backed order and payment service is connected.
    // Never create payment codes, orders, or local wallet changes from these values.
  }

  packages.forEach(function (button, index) {
    button.addEventListener("click", function () { selectPackage(button); });
    button.addEventListener("keydown", function (event) {
      var next = index;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % packages.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index + packages.length - 1) % packages.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = packages.length - 1;
      else return;
      event.preventDefault();
      selectPackage(packages[next]);
      packages[next].focus();
    });
  });

  window.QianchuanRechargeCenter = { selectTab: selectTab };
}());
