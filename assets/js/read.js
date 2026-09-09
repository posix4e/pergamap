"use strict";

// A card asks you to commit before it tells you anything. That is the whole
// mechanic: an answer you have guessed at is an answer you argue with, and a
// reader who has argued with one line has read it in a way watching cannot
// reproduce.
//
// Where the honest answer is "two readings are defensible", the card says so.
// STANDING is the vocabulary for that, and no card has a single correct option
// unless the sources actually support one.
const STANDING = {
  yes: ["full", "correct"],
  received: ["full", "how it is usually read"],
  defensible: ["partial", "defensible"],
  no: ["none", "not this"],
};

const root = document.getElementById("run");
let deck = null;
let at = 0;
let answered = new Map(); // card id -> chosen option index

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function safeUrl(value) {
  try {
    const parsed = new URL(value, document.baseURI);
    return parsed.origin === location.origin || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function paragraphs(parent, text, className) {
  for (const part of String(text).split("\n\n")) {
    if (part.trim()) parent.appendChild(node("p", className, part.trim()));
  }
}

function progress() {
  const bar = node("p", "crumb");
  bar.appendChild(node("span", "", `${Math.min(at + 1, deck.cards.length)} of ${deck.cards.length}`));
  return bar;
}

function renderCard() {
  root.replaceChildren();
  const card = deck.cards[at];
  root.appendChild(progress());

  const section = root.appendChild(node("section", "locus"));
  section.appendChild(node("p", "tag", card.eyebrow));
  if (card.setup) paragraphs(section, card.setup);

  if (card.greek) {
    const line = section.appendChild(node("div", "pair"));
    const grc = line.appendChild(node("div", "grc", card.greek));
    grc.lang = "grc";
  }
  if (card.translit) section.appendChild(node("p", "crumb", card.translit));
  if (card.gloss) section.appendChild(node("p", "crumb", card.gloss));

  section.appendChild(node("h2", "", card.question));

  const chosen = answered.get(card.id);
  const list = section.appendChild(node("div", "choices"));
  card.options.forEach((option, index) => {
    const picked = chosen === index;
    const [tone, label] = STANDING[option.standing] || ["unknown", ""];
    if (chosen === undefined) {
      const button = list.appendChild(node("button", "choice", option.label));
      button.type = "button";
      button.addEventListener("click", () => {
        answered.set(card.id, index);
        renderCard();
      });
    } else {
      const row = list.appendChild(node("div", `choice shown${picked ? ` picked tone-${tone}` : ""}`));
      row.appendChild(node("b", "", option.label));
      row.appendChild(node("span", `chip ${tone}`, picked ? `you chose this — ${label}` : label));
      row.appendChild(node("p", "crumb", option.response));
    }
  });

  if (chosen !== undefined) {
    const reveal = section.appendChild(node("div", "notice"));
    paragraphs(reveal, card.reveal);
    for (const link of card.links || []) {
      const href = safeUrl(link.href);
      if (!href) continue;
      const p = reveal.appendChild(node("p", "crumb"));
      const a = p.appendChild(node("a", "", `${link.label} →`));
      a.href = href;
    }
    const nav = section.appendChild(node("p", "ask"));
    const next = nav.appendChild(node("button", "chip full", at + 1 < deck.cards.length ? "next" : "finish"));
    next.type = "button";
    next.addEventListener("click", () => {
      at += 1;
      if (at < deck.cards.length) renderCard();
      else renderEnd();
      window.scrollTo(0, 0);
    });
  }
}

function renderEnd() {
  root.replaceChildren();
  root.appendChild(node("h1", "", "You read it yourself"));

  const scored = deck.cards.filter((card) => {
    const option = card.options[answered.get(card.id)];
    return option && (option.standing === "yes" || option.standing === "received");
  }).length;
  root.appendChild(node("p", "lead",
    `${scored} of ${deck.cards.length} where you landed on a reading the sources support — which matters less than the fact that you now know why the other options were there.`));

  const box = root.appendChild(node("div", "notice"));
  box.appendChild(node("p", "", "Four things you can now do to any claim about an ancient text, including ours:"));
  const kit = box.appendChild(node("ul", ""));
  for (const line of [
    "Ask which sense of the word the sentence actually needs. A word with a range has no secret true meaning — and you can count the uses.",
    "Ask which edition the Greek comes from, edited by whom, from which manuscripts.",
    "Ask whether two witnesses are really independent, or whether one is reading the other.",
    "Ask whether the person telling you has published anything they later had to take back.",
  ]) {
    kit.appendChild(node("li", "", line));
  }
  box.appendChild(node("p", "", "None of that requires Greek. It is the ordinary carefulness that keeps a confident claim honest, and it works just as well pointed at this site as at anyone else."));

  const links = root.appendChild(node("p", "ask"));
  for (const [label, href] of [
    ["The passage in full, Greek and Arabic", "translations/aphorisms-1-1.html"],
    ["What is and isn't translated", "library.html"],
    ["Play again", "read.html"],
  ]) {
    const a = links.appendChild(node("a", "chip", label));
    a.href = href;
  }
}

async function main() {
  try {
    deck = await fetch("data/cards/aph-1-1.json").then((r) => r.json());
  } catch {
    root.appendChild(node("p", "error", "The questions could not be loaded. They are plain JSON at data/cards/aph-1-1.json."));
    return;
  }
  if (!deck || deck.schema_version !== 1 || !Array.isArray(deck.cards) || !deck.cards.length) {
    root.appendChild(node("p", "error", "The question set is in a format this page does not know how to read."));
    return;
  }
  const intro = node("div");
  intro.appendChild(node("h1", "", deck.title));
  intro.appendChild(node("p", "lead", deck.lead));
  intro.appendChild(node("p", "crumb", deck.note));
  root.appendChild(intro);
  const start = root.appendChild(node("p", "ask"));
  const button = start.appendChild(node("button", "chip full", `Start — ${deck.cards.length} questions`));
  button.type = "button";
  button.addEventListener("click", renderCard);
}

main();
