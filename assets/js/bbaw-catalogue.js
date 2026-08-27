"use strict";
(() => {

let records = [];
let worksById = new Map();
let pergamapByRecord = new Map();
let query = "";
let activeFilter = "all";
let requestedRecordId = new URL(location.href).searchParams.get("record");

const body = document.querySelector("#bbaw-table tbody");
const search = document.getElementById("bbaw-q");
const count = document.getElementById("bbaw-count");
const buttons = [...document.getElementById("view-bbaw").querySelectorAll(".controls button")];

function node(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

function otherTranslations(record) {
  return Object.entries(record.translation_columns)
    .filter(([language, listed]) => language !== "english" && listed)
    .map(([language]) => language)
    .join(", ");
}

function addRow(record) {
  const row = document.createElement("tr");
  row.dataset.recordId = record.id;
  if (record.id === requestedRecordId) row.classList.add("catalogue-highlight");
  row.appendChild(node("td", "", record.id));
  const title = row.appendChild(node("td"));
  title.appendChild(node("strong", "", record.title));
  row.appendChild(node("td", "", record.kuhn || "—"));
  const english = record.translation_columns.english;
  const englishCell = row.appendChild(document.createElement("td"));
  if (english) {
    const chip = node("span", "chip full", "listed");
    chip.title = "BBAW's catalogue lists at least one English translation for this work.";
    englishCell.appendChild(chip);
  } else {
    const chip = node("span", "chip unknown", "no entry");
    chip.title = "BBAW's English column has no entry for this work — which is not proof that no translation exists.";
    englishCell.appendChild(chip);
  }
  row.appendChild(node("td", "bbaw-other", otherTranslations(record) || "—"));
  const pergamapCell = row.appendChild(document.createElement("td"));
  const mappings = pergamapByRecord.get(record.id) || [];
  mappings.forEach((mapping, index) => {
    if (index) pergamapCell.appendChild(document.createElement("br"));
    const work = worksById.get(mapping.work_id);
    const link = node("a", "", work ? (work.titles.english || work.titles.latin) : mapping.work_id);
    link.href = `library.html?work=${encodeURIComponent(mapping.work_id)}`;
    pergamapCell.appendChild(link);
    if (mapping.english_status_review) {
      pergamapCell.append(` · ${mapping.english_status_review.status}`);
    }
  });
  if (!mappings.length) pergamapCell.textContent = "—";
  body.appendChild(row);
}

function apply() {
  const normalized = query.toLocaleLowerCase();
  const shown = records.filter((record) => {
    const hasEnglish = record.translation_columns.english;
    if (activeFilter === "english" && !hasEnglish) return false;
    if (activeFilter === "no-english" && hasEnglish) return false;
    const localTitles = (pergamapByRecord.get(record.id) || [])
      .map((mapping) => worksById.get(mapping.work_id))
      .filter(Boolean)
      .map((work) => `${work.titles.latin} ${work.titles.english || ""}`)
      .join(" ");
    const haystack = `${record.title} ${record.kuhn} ${localTitles}`.toLocaleLowerCase();
    return !normalized || haystack.includes(normalized);
  });
  body.replaceChildren();
  shown.forEach(addRow);
  count.textContent = `${shown.length} of ${records.length} BBAW records shown.`;
  if (requestedRecordId) {
    const requested = body.querySelector(`[data-record-id="${CSS.escape(requestedRecordId)}"]`);
    if (requested) requestAnimationFrame(() => requested.scrollIntoView({ block: "center" }));
    requestedRecordId = null;
  }
}

buttons.forEach((button) => button.addEventListener("click", () => {
  activeFilter = button.dataset.f;
  buttons.forEach((item) => {
    const active = item === button;
    item.classList.toggle("on", active);
    item.setAttribute("aria-pressed", String(active));
  });
  apply();
}));

search.addEventListener("input", () => {
  query = search.value.trim();
  apply();
});

Promise.all([
  fetch("data/bbaw-galen-translations.json").then((response) => {
    if (!response.ok) throw new Error(`BBAW index HTTP ${response.status}`);
    return response.json();
  }),
  fetch("data/bbaw-crosswalk.json").then((response) => {
    if (!response.ok) throw new Error(`crosswalk HTTP ${response.status}`);
    return response.json();
  }),
  fetch("data/works.json").then((response) => {
    if (!response.ok) throw new Error(`works HTTP ${response.status}`);
    return response.json();
  }),
])
  .then(([catalogue, crosswalk, works]) => {
    records = catalogue.records;
    worksById = new Map(works.works.map((work) => [work.id, work]));
    crosswalk.mappings.forEach((mapping) => mapping.bbaw_record_ids.forEach((recordId) => {
      if (!pergamapByRecord.has(recordId)) pergamapByRecord.set(recordId, []);
      pergamapByRecord.get(recordId).push(mapping);
    }));
    document.getElementById("record-total").textContent = String(records.length);
    document.getElementById("english-total").textContent = String(
      records.filter((record) => record.translation_columns.english).length
    );
    document.getElementById("retrieved-on").textContent = catalogue.retrieved_on;
    apply();
  })
  .catch((error) => {
    count.textContent = `The BBAW snapshot could not be loaded (${error.message}). `;
    count.classList.add("error");
    const link = node("a", "", "Open the JSON snapshot directly.");
    link.href = "data/bbaw-galen-translations.json";
    count.appendChild(link);
  });

})();
