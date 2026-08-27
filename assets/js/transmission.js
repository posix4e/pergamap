"use strict";

const LANGUAGE = {
  greek: "Greek",
  arabic: "Arabic",
  latin: "Latin",
  hebrew: "Hebrew",
  english: "English",
  german: "German",
  multilingual: "Multilingual",
};
const RELATION = {
  "commented-on-by-galen": "source text",
  "translation-from-arabic": "from Arabic",
  "translation-from-arabic-or-latin": "Arabic / Latin routes",
  "modern-translation-from-arabic": "modern translation from Arabic",
  "bilingual-edition": "bilingual critical edition",
  "teaching-collection": "teaching collection",
  "galenic-synthesis": "Galenic synthesis",
  "arabic-latin-synthesis": "Arabic–Latin synthesis",
};

const elements = {
  list: document.getElementById("map-list"),
  search: document.getElementById("map-search"),
  filters: [...document.querySelectorAll("[data-map-filter]")],
  status: document.getElementById("map-status"),
  error: document.getElementById("map-error"),
  selectedKicker: document.getElementById("selected-kicker"),
  selectedTitle: document.getElementById("selected-title"),
  selectedSubtitle: document.getElementById("selected-subtitle"),
  selectedLinks: document.getElementById("selected-links"),
  sourceStage: document.getElementById("stage-source"),
  compositionStage: document.getElementById("stage-composition"),
  traditionStage: document.getElementById("stage-tradition"),
  arabicStage: document.getElementById("stage-arabic"),
  laterStage: document.getElementById("stage-later"),
  detailKind: document.getElementById("detail-kind"),
  detailTitle: document.getElementById("detail-title"),
  detailDescription: document.getElementById("detail-description"),
  detailLinks: document.getElementById("detail-links"),
  context: document.getElementById("context-cards"),
  sources: document.getElementById("map-sources"),
};

let branches = [];
let transmission = null;
let sourceById = new Map();
let selectedId = null;
let activeFilter = "all";
let query = "";

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

function appendLink(parent, label, value, className) {
  const url = safeUrl(value);
  if (!url) return;
  const link = node("a", className || "", label);
  link.href = url;
  parent.appendChild(link);
}

function slug(value) {
  return String(value || "record")
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "record";
}

function workTitle(work) {
  return work.titles.english || work.titles.latin;
}

function createBranches(works, manifest) {
  const result = works.map((work) => ({ work, witnesses: [], synthetic: false }));
  const byId = new Map(result.map((branch) => [branch.work.id, branch]));
  const synthetic = new Map();

  manifest.texts.forEach((text) => {
    if (text.work_ids.length) {
      text.work_ids.forEach((id) => byId.get(id)?.witnesses.push(text));
      return;
    }
    const heading = text.kind === "catalogue"
      ? "Ḥunayn's Galen catalogues"
      : text.of_work || text.title_latin || text.title_arabic || text.file;
    const id = text.kind === "catalogue" ? "arabic-catalogues" : `arabic-${slug(heading)}`;
    if (!synthetic.has(id)) {
      synthetic.set(id, {
        synthetic: true,
        witnesses: [],
        work: {
          id,
          titles: { english: heading, latin: text.of_work || text.title_latin || heading },
          survival: { languages: ["arabic"], extent: "unmapped" },
          digital_texts: [],
          english: { status: "unknown" },
          notes: text.kind === "catalogue"
            ? "Historical catalogues of Galen's works, not Galenic treatises."
            : "Arabic source record not yet keyed to a work in works.json.",
        },
      });
    }
    synthetic.get(id).witnesses.push(text);
  });

  return [...result, ...synthetic.values()].map((branch) => {
    branch.receptions = transmission.receptions.filter((reception) =>
      reception.work_ids.includes(branch.work.id)
      || reception.witness_files.some((file) => branch.witnesses.some((witness) => witness.file === file))
    );
    branch.upstream = transmission.upstream.filter((item) => item.work_ids.includes(branch.work.id));
    return branch;
  });
}

function branchHaystack(branch) {
  const work = branch.work;
  const parts = [work.id, work.titles.english, work.titles.latin, work.notes];
  branch.witnesses.forEach((text) => parts.push(
    text.file, text.title_latin, text.title_arabic, text.of_work, text.author, text.kind
  ));
  branch.receptions.forEach((item) => parts.push(item.title, item.language, item.description));
  return parts.filter(Boolean).join(" ").toLocaleLowerCase();
}

function matches(branch) {
  const languages = branch.work.survival.languages || [];
  if (activeFilter === "arabic" && !branch.witnesses.length) return false;
  if (activeFilter === "international" && !branch.receptions.length) return false;
  if (activeFilter === "arabic-only" && !(branch.synthetic || (languages.includes("arabic") && !languages.includes("greek")))) return false;
  return !query || branchHaystack(branch).includes(query);
}

function renderList() {
  const shown = branches.filter(matches).sort((a, b) => workTitle(a.work).localeCompare(workTitle(b.work)));
  elements.list.replaceChildren();
  if (!shown.length) {
    elements.list.appendChild(node("p", "empty-map", "No branch matches those filters."));
    elements.status.textContent = `0 of ${branches.length} entries shown.`;
    return;
  }

  shown.forEach((branch) => {
    const button = node("button", "map-list-item");
    button.type = "button";
    button.dataset.workId = branch.work.id;
    button.setAttribute("aria-pressed", String(branch.work.id === selectedId));
    if (branch.work.id === selectedId) button.classList.add("selected");
    button.appendChild(node("strong", "", workTitle(branch.work)));
    if (branch.work.titles.latin !== workTitle(branch.work)) {
      button.appendChild(node("span", "map-list-latin", branch.work.titles.latin));
    }
    const badges = button.appendChild(node("span", "map-list-badges"));
    if (branch.witnesses.length) badges.appendChild(node("span", "mini-badge arabic", `${branch.witnesses.length} Arabic`));
    if (branch.receptions.length) badges.appendChild(node("span", "mini-badge later", `${branch.receptions.length} later`));
    if (!branch.witnesses.length && !branch.receptions.length) badges.appendChild(node("span", "mini-badge quiet", "catalogue only"));
    button.addEventListener("click", () => selectBranch(branch.work.id, true));
    elements.list.appendChild(button);
  });
  elements.status.textContent = `${shown.length} of ${branches.length} entries shown.`;

  if (!shown.some((branch) => branch.work.id === selectedId)) selectBranch(shown[0].work.id, false);
}

function relationshipLabel(item) {
  return RELATION[item.relation] || item.relation || item.kind || "record";
}

function sourceLinks(ids) {
  return (ids || []).map((id) => sourceById.get(id)).filter(Boolean);
}

function setDetail(item) {
  elements.detailKind.textContent = item.kicker || relationshipLabel(item);
  elements.detailTitle.textContent = item.title;
  elements.detailDescription.textContent = item.description;
  elements.detailLinks.replaceChildren();
  if (item.url) appendLink(elements.detailLinks, item.urlLabel || "Open text or record ↗", item.url, "detail-primary");
  if (item.localUrl) appendLink(elements.detailLinks, "Open local TEI", item.localUrl);
  if (item.sourceUrl) appendLink(elements.detailLinks, "Open source TEI ↗", item.sourceUrl);
  sourceLinks(item.source_ids).forEach((source) => appendLink(elements.detailLinks, source.title, source.url));
}

function treeButton(item, classes) {
  const button = node("button", `tree-node ${classes || ""}`.trim());
  button.type = "button";
  button.appendChild(node("span", "tree-relation", item.meta || relationshipLabel(item)));
  button.appendChild(node("strong", "", item.title));
  if (item.subtitle) button.appendChild(node("span", "tree-subtitle", item.subtitle));
  if (item.routePath) button.appendChild(node("span", "tree-route", item.routePath));
  if (item.local) button.appendChild(node("span", "local-marker", "Held by Pergamap"));
  button.addEventListener("click", () => {
    document.querySelectorAll(".tree-node.selected").forEach((candidate) => candidate.classList.remove("selected"));
    button.classList.add("selected");
    setDetail(item);
  });
  return button;
}

function emptyStage(container, text) {
  container.replaceChildren(node("p", "tree-empty", text));
}

function compositionDetail(branch) {
  const work = branch.work;
  return {
    title: `${workTitle(work)} — work identity`,
    kicker: "ancient composition",
    meta: "attributed work · 2nd–3rd c.",
    subtitle: "Originally composed in Greek; no autograph survives",
    description: "This node identifies the work attributed to Galen. It is not a manuscript, a translation, or a modern edition. The next node reports the languages in which the textual tradition now survives.",
  };
}

function traditionDetail(branch) {
  const work = branch.work;
  const languages = work.survival.languages || [];
  const labels = languages.map((language) => LANGUAGE[language] || language);
  const greekSurvives = languages.includes("greek");
  const digital = work.digital_texts.find((item) => languages.includes(item.language) && safeUrl(item.url));
  const survival = labels.length ? labels.join(", ") : "not yet recorded";
  const catalogueNote = work.notes ? ` Catalogue note: ${work.notes}` : "";
  return {
    title: greekSurvives ? "Later Greek manuscript tradition" : "Greek manuscript survival not listed",
    kicker: "surviving textual tradition",
    meta: greekSurvives ? "Greek survives in later copies" : "Greek not listed as a survival language",
    subtitle: `Survival recorded in: ${survival}`,
    description: greekSurvives
      ? `The Greek work survives through manuscripts copied after Galen, not through his original document. A linked digital Greek text is a modern presentation of an edited manuscript tradition.${catalogueNote}`
      : `Pergamap does not list Greek among this work's survival languages; that is not proof that no Greek fragment exists. The recorded survival in ${survival} does not reveal whether a translation was made directly from Greek or through an intermediary such as Syriac.${catalogueNote}`,
    url: digital?.url,
    urlLabel: digital ? `Open modern digital ${LANGUAGE[digital.language] || digital.language} text ↗` : undefined,
  };
}

function witnessDetail(text) {
  const title = text.title_latin || text.of_work || text.title_arabic || text.file;
  const extent = text.arabic_characters ? `${text.arabic_characters.toLocaleString()} Arabic characters` : "extent not counted";
  const role = text.kind === "summary" ? "Arabic summary or epitome" : text.kind === "catalogue" ? "Arabic historical catalogue" : "Arabic translation";
  return {
    title,
    kicker: role,
    meta: text.kind === "catalogue" ? "catalogue record" : "source route not yet encoded",
    subtitle: [text.kind, text.author && text.author !== "Galen" ? text.author : text.title_arabic].filter(Boolean).join(" · "),
    routePath: text.kind === "translation"
      ? "Greek → Arabic OR Greek → Syriac → Arabic"
      : text.kind === "summary"
        ? "Source text → intermediary? → Arabic summary"
        : "Historical catalogue—not a translation",
    description: text.kind === "catalogue"
      ? `${role}; ${extent}. This is evidence about the catalogue of Galen's works, not a translated Galenic text.`
      : `${role}; ${extent}. ${text.of_work ? `Connected in the manifest to ${text.of_work}.` : "No Galenic work title is assigned in the manifest."} Pergamap does not yet encode the source language or intermediary for this file, so this node claims no direct Greek-to-Arabic path.`,
    local: true,
    localUrl: `sources/arabic/${encodeURIComponent(text.file)}`,
    sourceUrl: text.source_url,
  };
}

function renderBranch(branch) {
  const work = branch.work;
  const languages = (work.survival.languages || []).map((language) => LANGUAGE[language] || language).join(", ");
  elements.selectedKicker.textContent = branch.synthetic ? "Arabic record outside the keyed catalogue" : `Catalogue ID ${work.id}`;
  elements.selectedTitle.textContent = workTitle(work);
  elements.selectedSubtitle.textContent = `${work.titles.latin}${languages ? ` · survives in ${languages}` : ""}`;
  elements.selectedLinks.replaceChildren();
  if (!branch.synthetic) appendLink(elements.selectedLinks, "Open in library", `library.html?work=${encodeURIComponent(work.id)}`);
  work.digital_texts.forEach((digital) => appendLink(
    elements.selectedLinks,
    (work.survival.languages || []).includes(digital.language)
      ? `${digital.provider} — modern digital ${LANGUAGE[digital.language] || digital.language} text ↗`
      : `${digital.provider} — ${LANGUAGE[digital.language] || digital.language} catalogue record ↗`,
    digital.url
  ));

  elements.sourceStage.replaceChildren();
  if (branch.upstream.length) {
    branch.upstream.forEach((item) => elements.sourceStage.appendChild(treeButton({
      ...item,
      kicker: "earlier source",
      meta: item.date,
      subtitle: LANGUAGE[item.language] || item.language,
    }, "upstream")));
  } else {
    emptyStage(elements.sourceStage, "No earlier source work is encoded for this branch.");
  }

  elements.compositionStage.replaceChildren();
  elements.traditionStage.replaceChildren();
  if (branch.synthetic) {
    emptyStage(elements.compositionStage, "No matching work identity in the current catalogue.");
    emptyStage(elements.traditionStage, "No survival-language record is available for this unmapped Arabic file.");
  } else {
    elements.compositionStage.appendChild(treeButton(compositionDetail(branch), "composition selected"));
    elements.traditionStage.appendChild(treeButton(traditionDetail(branch), "tradition"));
  }

  elements.arabicStage.replaceChildren();
  if (branch.witnesses.length) {
    branch.witnesses.forEach((text) => elements.arabicStage.appendChild(treeButton(witnessDetail(text), "arabic route-uncertain")));
  } else {
    const laterUsesArabic = branch.receptions.some((item) => String(item.relation).includes("arabic"));
    emptyStage(
      elements.arabicStage,
      laterUsesArabic
        ? "No Arabic file for this work is held locally; the later branch is documented from an external Arabic witness or edition."
        : "No Arabic file for this work is held in the local manifest."
    );
  }

  elements.laterStage.replaceChildren();
  if (branch.receptions.length) {
    branch.receptions.forEach((item) => elements.laterStage.appendChild(treeButton({
      ...item,
      kicker: `${LANGUAGE[item.language] || item.language} ${item.kind}`,
      meta: relationshipLabel(item),
      subtitle: item.date,
    }, `later ${item.language}`)));
  } else {
    emptyStage(elements.laterStage, "No later-language branch has yet been added to the curated map.");
  }

  const initial = branch.synthetic && branch.witnesses.length ? witnessDetail(branch.witnesses[0]) : compositionDetail(branch);
  setDetail(initial);
}

function selectBranch(id, updateUrl) {
  const branch = branches.find((candidate) => candidate.work.id === id);
  if (!branch) return;
  selectedId = id;
  renderBranch(branch);
  document.querySelectorAll(".map-list-item").forEach((button) => {
    const selected = button.dataset.workId === id;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  if (updateUrl) {
    const url = new URL(location.href);
    url.searchParams.set("work", id);
    history.replaceState(null, "", url);
  }
}

function renderContext() {
  elements.context.replaceChildren();
  transmission.context.forEach((item) => {
    const card = node("article", "context-card");
    card.appendChild(node("p", "context-relation", relationshipLabel(item)));
    card.appendChild(node("h3", "", item.title));
    card.appendChild(node("p", "context-date", `${item.date} · ${LANGUAGE[item.language] || item.language}`));
    card.appendChild(node("p", "", item.description));
    appendLink(card, "Read the supporting record ↗", item.url);
    elements.context.appendChild(card);
  });
}

function renderSources() {
  elements.sources.replaceChildren();
  transmission.sources.forEach((source) => {
    const link = node("a", "source-card");
    link.href = safeUrl(source.url);
    link.appendChild(node("strong", "", source.title));
    link.appendChild(node("span", "", source.publisher));
    elements.sources.appendChild(link);
  });
}

Promise.all([
  fetch("data/works.json").then((response) => {
    if (!response.ok) throw new Error(`works: HTTP ${response.status}`);
    return response.json();
  }),
  fetch("sources/arabic/manifest.json").then((response) => {
    if (!response.ok) throw new Error(`manifest: HTTP ${response.status}`);
    return response.json();
  }),
  fetch("data/transmission.json").then((response) => {
    if (!response.ok) throw new Error(`transmission: HTTP ${response.status}`);
    return response.json();
  }),
])
  .then(([worksDocument, manifest, transmissionDocument]) => {
    if (worksDocument.schema_version !== 2 || !Array.isArray(worksDocument.works)) throw new Error("Unsupported works schema");
    if (manifest.schema_version !== 2 || !Array.isArray(manifest.texts)) throw new Error("Unsupported manifest schema");
    if (transmissionDocument.schema_version !== 1 || !Array.isArray(transmissionDocument.receptions)) throw new Error("Unsupported transmission schema");
    transmission = transmissionDocument;
    sourceById = new Map(transmission.sources.map((source) => [source.id, source]));
    branches = createBranches(worksDocument.works, manifest);

    document.getElementById("map-work-count").textContent = String(worksDocument.works.length);
    document.getElementById("map-arabic-count").textContent = String(manifest.texts.length);
    document.getElementById("map-linked-count").textContent = String(manifest.texts.filter((text) => text.work_ids.length).length);
    document.getElementById("map-branch-count").textContent = String(transmission.receptions.length);

    renderContext();
    renderSources();
    const requested = new URL(location.href).searchParams.get("work");
    selectedId = branches.some((branch) => branch.work.id === requested) ? requested : "tlg007";
    renderList();
    selectBranch(selectedId, false);
  })
  .catch(() => {
    elements.status.textContent = "The interactive map could not be loaded.";
    elements.status.classList.add("error");
    elements.error.hidden = false;
  });

elements.search.addEventListener("input", (event) => {
  query = event.target.value.trim().toLocaleLowerCase();
  renderList();
});

elements.filters.forEach((button) => button.addEventListener("click", () => {
  activeFilter = button.dataset.mapFilter;
  elements.filters.forEach((candidate) => {
    const selected = candidate === button;
    candidate.classList.toggle("on", selected);
    candidate.setAttribute("aria-pressed", String(selected));
  });
  renderList();
}));
