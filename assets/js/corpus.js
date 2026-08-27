"use strict";
(() => {

const CHIP = { none: "no English", full: "translated", partial: "partial", unknown: "unknown" };
const LANGUAGE = { greek: "Greek", arabic: "Arabic", latin: "Latin" };
// What was actually done to establish the row, said plainly. "recalled" used to
// render as "unverified", which reads like a formality rather than a warning.
const BASIS = {
  "model-recall": "no source consulted — recalled, not checked",
  "catalogue-listed": "translation catalogue checked; publication not inspected",
  "publication-verified": "translation itself consulted",
};
let works = [];
let draftsByWork = new Map();
let bbawByWork = new Map();
let activeFilter = "all";
let query = "";
let requestedWorkId = new URL(location.href).searchParams.get("work");

const root = document.getElementById("view-works");
const body = root.querySelector("#works-table tbody");
const count = root.querySelector("#works-count");
const search = root.querySelector("#works-q");
const buttons = [...root.querySelectorAll(".controls button")];

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

function addRow(work) {
  const row = document.createElement("tr");
  row.dataset.workId = work.id;
  if (work.id === requestedWorkId) row.classList.add("catalogue-highlight");
  const titleCell = row.appendChild(document.createElement("td"));
  const mapLink = node("a", "", work.titles.english || work.titles.latin);
  mapLink.href = `transmission.html?work=${encodeURIComponent(work.id)}`;
  const title = document.createElement("strong");
  title.appendChild(mapLink);
  titleCell.appendChild(title);
  if (work.titles.english) {
    titleCell.appendChild(document.createElement("br"));
    titleCell.appendChild(node("span", "lat", work.titles.latin));
  }
  if (work.notes) titleCell.appendChild(node("span", "ref", work.notes));
  row.appendChild(node("td", "", work.kuhn || "—"));

  const languages = (work.survival.languages || []).map((language) => LANGUAGE[language] || language);
  const survival = languages.length ? languages.join(", ") : work.survival.extent;
  row.appendChild(node("td", "", survival || "unknown"));

  const englishCell = row.appendChild(document.createElement("td"));
  englishCell.appendChild(node("span", `chip ${work.english.status}`, CHIP[work.english.status] || work.english.status));
  const basis = work.english.basis || {};
  const basisLabel = BASIS[basis.kind];
  if (basisLabel) englishCell.appendChild(node("span", "conf", ` · ${basisLabel}`));
  (basis.searched || []).forEach((entry) => {
    englishCell.appendChild(node("span", "ref", `Searched ${entry.source}, ${entry.date}: ${entry.result}.`));
  });
  (draftsByWork.get(work.id) || []).forEach((chunk) => {
    const draft = node("span", "ref");
    const link = node("a", "", `Pergamap draft: ${chunk.kuhn_range || chunk.id} (${chunk.status})`);
    link.href = `translations/chunk.html?id=${encodeURIComponent(chunk.id)}`;
    draft.appendChild(link);
    englishCell.appendChild(draft);
  });
  const bbaw = bbawByWork.get(work.id);
  if (bbaw) {
    const reference = node("span", "ref");
    const link = node("a", "", `BBAW record ${bbaw.recordIds.join(", ")}`);
    link.href = `library.html?record=${encodeURIComponent(bbaw.recordIds[0])}`;
    reference.appendChild(link);
    if (bbaw.review) reference.append(` · ${bbaw.review.status}`);
    englishCell.appendChild(reference);
  }
  work.english.citations.forEach((citation) => {
    const reference = node("span", "ref");
    const url = citation.url && safeUrl(citation.url);
    if (url) {
      const link = node("a", "", citation.label);
      link.href = url;
      reference.appendChild(link);
    } else {
      reference.textContent = citation.label;
    }
    englishCell.appendChild(reference);
  });

  const textCell = row.appendChild(document.createElement("td"));
  const digital = work.digital_texts.find((item) => safeUrl(item.url));
  if (digital) {
    const link = node("a", "", digital.language === "greek" ? "Greek" : "Text");
    link.href = safeUrl(digital.url);
    textCell.appendChild(link);
  } else {
    textCell.textContent = "—";
  }
  body.appendChild(row);
}

function apply() {
  const normalized = query.toLocaleLowerCase();
  const shown = works.filter((work) => {
    if (activeFilter === "arabic" && !work.survival.languages.some((value) => ["arabic", "latin"].includes(value)) && work.survival.extent !== "fragments") return false;
    if (["none", "partial", "full", "unknown"].includes(activeFilter) && work.english.status !== activeFilter) return false;
    const haystack = `${work.titles.latin || ""} ${work.titles.english || ""}`.toLocaleLowerCase();
    return !normalized || haystack.includes(normalized);
  });
  body.replaceChildren();
  shown.forEach(addRow);
  count.textContent = `${shown.length} of ${works.length} works shown.`;
  if (requestedWorkId) {
    const requestedRow = body.querySelector(`[data-work-id="${CSS.escape(requestedWorkId)}"]`);
    if (requestedRow) requestAnimationFrame(() => requestedRow.scrollIntoView({ block: "center" }));
    requestedWorkId = null;
  }
}

// Drafts and the BBAW crosswalk are separate evidence layers; neither silently
// changes the editorial conclusions stored in works.json.
Promise.all([
  fetch("data/chunks.json").then((response) => (response.ok ? response.json() : null)).catch(() => null),
  fetch("data/bbaw-crosswalk.json").then((response) => (response.ok ? response.json() : null)).catch(() => null),
]).then(([registry, crosswalk]) => {
    const entries = Array.isArray(registry) ? registry : (registry && registry.chunks) || [];
    entries.forEach((chunk) => {
      if (!chunk.work) return;
      if (!draftsByWork.has(chunk.work)) draftsByWork.set(chunk.work, []);
      draftsByWork.get(chunk.work).push(chunk);
    });
    ((crosswalk && crosswalk.mappings) || []).forEach((mapping) => {
      if (!mapping.bbaw_record_ids.length) return;
      bbawByWork.set(mapping.work_id, {
        recordIds: mapping.bbaw_record_ids,
        review: mapping.english_status_review || null,
      });
    });
  })
  .then(() => fetch("data/works.json"))
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then((documentData) => {
    if (documentData.schema_version !== 2 || !Array.isArray(documentData.works)) throw new Error("Unsupported catalogue schema");
    works = [...documentData.works].sort((a, b) => (a.titles.english || a.titles.latin).localeCompare(b.titles.english || b.titles.latin));
    apply();
  })
  .catch(() => {
    count.textContent = "The catalogue could not be loaded. The raw JSON remains available on GitHub.";
    count.classList.add("error");
  });

search.addEventListener("input", (event) => {
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
