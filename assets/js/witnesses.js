"use strict";
(() => {

const KIND = { translation: "translation", summary: "summary", catalogue: "catalogue" };
const EDITION = {
  edKuhn: "Kühn", edKuhn17b: "Kühn XVIIb", edKuhn18a: "Kühn XVIIIa", edSalim: "Sālim",
  edIskandar: "Iskandar", edLyons: "Lyons", edBadawi: "Badawī", edBach: "Bachmann",
  edBerg: "Bergsträsser", edBies: "Biesterfeldt", edMeyer: "Meyerhof", edMuller: "Müller",
};
let texts = [];
let activeFilter = "all";
let query = "";
const wroot = document.getElementById("view-witnesses");
const body = wroot.querySelector("#wit-table tbody");
const count = wroot.querySelector("#wit-count");
const buttons = [...wroot.querySelectorAll(".controls button")];

function node(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

function safeUrl(value) {
  try {
    const parsed = new URL(value, document.baseURI);
    return parsed.origin === location.origin || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function addRow(text) {
  const row = document.createElement("tr");
  const titleCell = row.appendChild(document.createElement("td"));
  const heading = text.title_latin || text.title_arabic || text.file;
  titleCell.appendChild(node("strong", "", heading));
  if (text.title_latin && text.title_arabic) titleCell.appendChild(node("span", "ref", text.title_arabic));
  if (text.author && text.author !== "Galen") titleCell.appendChild(node("span", "ref", text.author));
  const kindCell = row.appendChild(document.createElement("td"));
  kindCell.appendChild(node("span", "chip unknown", KIND[text.kind] || text.kind));
  row.appendChild(node("td", "lat", text.of_work || "—"));
  row.appendChild(node("td", "lat", (text.edition_ids || []).map((id) => EDITION[id] || id).join(", ") || "—"));
  row.appendChild(node("td", "", text.arabic_characters ? `${Math.round(text.arabic_characters / 1000)}k chars` : "—"));
  const files = row.appendChild(document.createElement("td"));
  if (/^[a-z0-9_.-]+\.xml$/.test(text.file)) {
    const local = node("a", "", "TEI");
    local.href = `sources/arabic/${encodeURIComponent(text.file)}`;
    files.appendChild(local);
  }
  const sourceUrl = safeUrl(text.source_url);
  if (sourceUrl) {
    files.append(" · ");
    const source = node("a", "", "source");
    source.href = sourceUrl;
    files.appendChild(source);
  }
  body.appendChild(row);
}

function apply() {
  const normalized = query.toLocaleLowerCase();
  const shown = texts.filter((text) => {
    if (activeFilter !== "all" && text.kind !== activeFilter) return false;
    const haystack = `${text.title_latin || ""} ${text.title_arabic || ""} ${text.of_work || ""} ${text.author || ""} ${text.file}`.toLocaleLowerCase();
    return !normalized || haystack.includes(normalized);
  });
  body.replaceChildren();
  shown.forEach(addRow);
  count.textContent = `${shown.length} of ${texts.length} files shown.`;
}

fetch("sources/arabic/manifest.json")
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then((manifest) => {
    if (manifest.schema_version !== 2 || !Array.isArray(manifest.texts)) throw new Error("Unsupported manifest schema");
    texts = [...manifest.texts].sort((a, b) => (a.title_latin || a.file).localeCompare(b.title_latin || b.file));
    document.getElementById("s-transl").textContent = String(manifest.counts.translation);
    document.getElementById("s-summ").textContent = String(manifest.counts.summary);
    document.getElementById("s-cat").textContent = String(manifest.counts.catalogue);
    const parts = new Set((manifest.duplicates || []).flatMap((duplicate) => duplicate.parts || []));
    const total = texts.filter((text) => !parts.has(text.file)).reduce((sum, text) => sum + text.arabic_characters, 0);
    document.getElementById("s-chars").textContent = `${(total / 1e6).toFixed(1)}M`;
    apply();
  })
  .catch(() => {
    count.textContent = "The witness manifest could not be loaded. The raw manifest remains available on GitHub.";
    count.classList.add("error");
  });

wroot.querySelector("#wit-q").addEventListener("input", (event) => {
  query = event.target.value;
  apply();
});
buttons.forEach((button) => button.addEventListener("click", () => {
  buttons.forEach((candidate) => {
    const selected = candidate === button;
    candidate.classList.toggle("on", selected);
    candidate.setAttribute("aria-pressed", String(selected));
  });
  activeFilter = button.dataset.f;
  apply();
}));

})();
