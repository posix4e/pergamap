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
const rail = document.getElementById("rail");
const decodedBox = document.getElementById("decoded");
const decoded = [];
let deck = null;
let deckId = "aph-1-1";
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
  rail.hidden = false;
  const step = Math.min(at + 1, deck.cards.length);
  rail.querySelector(".step").textContent = `pass ${String(step).padStart(2, "0")}`;
  rail.querySelector(".bar i").style.width = `${(at / deck.cards.length) * 100}%`;
  rail.querySelector(".count").textContent = `${decoded.length} decoded`;
}

// Words are kept, not scored. The counter is the one honest progress bar here:
// every entry is a word you could now pick out of a page of Greek.
function keep(card) {
  let added = false;
  for (const word of card.words || []) {
    if (decoded.some((w) => w.gr === word.gr)) continue;
    decoded.push(word);
    added = true;
  }
  return added;
}

function renderDecoded(freshFrom) {
  if (!decoded.length) return;
  decodedBox.hidden = false;
  decodedBox.replaceChildren();
  decodedBox.appendChild(node("p", "head", `decoded — ${decoded.length}`));
  const list = decodedBox.appendChild(node("ul"));
  for (const word of decoded) {
    const fresh = (freshFrom || []).some((w) => w.gr === word.gr);
    const item = list.appendChild(node("li", fresh ? "fresh" : ""));
    const button = item.appendChild(node("button", "key"));
    button.type = "button";
    button.title = word.tr;
    const glyph = button.appendChild(node("b", "", word.gr));
    glyph.lang = "grc";
    button.appendChild(node("span", "", word.en));
    button.addEventListener("click", () => {
      document.dispatchEvent(new CustomEvent("pergamap:decode"));
    });
  }
}

function renderCard() {
  root.replaceChildren();
  const card = deck.cards[at];
  progress();

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
        keep(card);
        renderCard();
        renderDecoded(card.words);
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

// A result you can paste into the comments under the video that sent you here.
// Spoiler-free: the squares say how you did, never what the answers were. The
// colours are the deck's own vocabulary — a card with two defensible readings
// gives a yellow, and that is not a failure, it is the point of that card.
const MARK = { yes: "🟩", received: "🟩", defensible: "🟨", no: "⬜" };

function shareText() {
  const marks = deck.cards.map((card) => {
    const option = card.options[answered.get(card.id)];
    return option ? MARK[option.standing] || "⬜" : "⬜";
  }).join("");
  const where = deckId === "aph-1-1" ? "pergamap.com/read" : `pergamap.com/read?deck=${deckId}`;
  return [
    deck.share || deck.title || "Pergamap",
    marks,
    `${decoded.length} words of Greek I did not have an hour ago`,
    where,
  ].join("\n");
}

function renderEnd() {
  rail.hidden = true;
  root.replaceChildren();
  root.appendChild(node("h1", "", "You can just read it"));
  root.appendChild(node("p", "lead",
    `${decoded.length} words you did not have an hour ago. Not translated for you — picked out, in context, with the reason attached.`));

  const box = root.appendChild(node("div", "notice"));
  box.appendChild(node("p", "", "That is the whole trick, and there is no second part to it. The ancient world is not sealed. It is written down, in quantity, in languages that take work — and the work is ordinary: look at the word, ask what the sentence needs, check who edited the text, notice when someone is telling you a thing they have not verified. Galen was doing exactly that about hot compresses in the second century, and getting cross about it."));
  box.appendChild(node("p", "", "Almost none of this man is in English. A hundred and eight works, and for ninety-three of them nobody has yet opened a single source to find out whether a translation exists — including us, which is why every row says so."));

  const share = root.appendChild(node("p", "ask"));
  const copy = share.appendChild(node("button", "chip full", "Copy my result"));
  copy.type = "button";
  copy.addEventListener("click", () => {
    navigator.clipboard.writeText(shareText()).then(
      () => { copy.textContent = "copied — paste it under the video"; },
      () => { copy.textContent = "could not copy"; }
    );
  });
  const preview = root.appendChild(node("pre", "share", shareText()));
  preview.setAttribute("aria-label", "your result");

  const links = root.appendChild(node("p", "ask"));
  for (const [label, href] of [
    ["See what nobody has checked", "library.html"],
    ["The passage in full, Greek and Arabic", "translations/aphorisms-1-1.html"],
    ["Again", "read.html"],
  ]) {
    const a = links.appendChild(node("a", "chip", label));
    a.href = href;
  }
  renderDecoded([]);
  // The only place the second skin is ever mentioned, and only to someone who
  // has earned the words that open it.
  decodedBox.appendChild(node("p", "head hint", "the words are keys. tap one — or type one, anywhere on this site."));
}

async function main() {
  try {
    const asked = new URL(location.href).searchParams.get("deck");
    deckId = asked && /^[a-z0-9][a-z0-9-]*$/.test(asked) ? asked : "aph-1-1";
    deck = await fetch(`data/cards/${deckId}.json`).then((r) => r.json());
  } catch {
    root.appendChild(node("p", "error", "That set of questions could not be loaded. They are plain JSON under data/cards/."));
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
