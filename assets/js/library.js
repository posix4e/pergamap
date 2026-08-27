"use strict";
(() => {

// View router for the library's three registers. Hash picks the view;
// ?work= and ?record= deep links (inherited from the old standalone pages)
// imply their view when no hash is present.
const VIEWS = ["works", "witnesses", "bbaw"];

function currentView() {
  const hash = location.hash.replace("#", "");
  if (VIEWS.includes(hash)) return hash;
  const params = new URL(location.href).searchParams;
  if (params.get("record")) return "bbaw";
  return "works";
}

function show(view) {
  for (const name of VIEWS) {
    const section = document.getElementById(`view-${name}`);
    const tab = document.getElementById(`tab-${name}`);
    const on = name === view;
    if (section) section.hidden = !on;
    if (tab) if (on) { tab.setAttribute("aria-current", "true"); } else { tab.removeAttribute("aria-current"); }
  }
}

show(currentView());
window.addEventListener("hashchange", () => show(currentView()));

})();
