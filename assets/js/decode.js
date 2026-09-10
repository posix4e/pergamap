"use strict";

// A second skin for the whole site, and no button anywhere that offers it.
//
// The keys are the words the reading run teaches. Finish it and you have twenty
// of them; type any one and the edition turns into the thing underneath. That is
// the joke and the argument at once — nothing here is hidden from anybody, but
// you do have to look, and the reward for looking is not a secret, it is
// vocabulary.
//
// Keys are the transliterations in data/cards/*.json, folded the way somebody
// would actually type them: no macrons, no spaces. Adding a word to a card must
// add a key here, and a test in tests/test_validate.py fails if it does not --
// the feather card shipped with three words that quietly opened nothing.
const KEYS = [
  "alopex", "alopekia", "ophiasis", "psilothron", "pteron", "phaneros",
  "pharmakon", "deleterion", "thanasimos", "anameno", "chorismethodou",
  "basanizo", "ophelein", "blaptein", "alypia", "bibliotheke", "bios",
  "techne", "kairos", "oxys", "oligochronion", "pseudesdoxa", "enarges",
];

// Somebody who has just met φάρμακον will type "pharmacon", because English
// gave them pharmacy and pharmaceutical long before anyone mentioned kappa.
// Transliteration is a scholarly convention and fingers do not know it, so the
// matcher forgives the places where the conventions actually disagree: c/k,
// y/u, ph/f. Applied to both sides, so nothing is lost — and checked against all
// 193 catalogue titles, none of which collides with a key.
function fold(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z]/g, "")
    .replace(/ph/g, "f")
    .replace(/ch/g, "kh")
    .replace(/c/g, "k")
    .replace(/y/g, "u");
}

const FOLDED = KEYS.map(fold);
const BUFFER = 32;  // comfortably longer than any key, so folding never splits a digraph
const STORE = "pergamap.decode";

let typed = "";

function apply(on) {
  document.body.classList.toggle("decode", on);
  try {
    if (on) localStorage.setItem(STORE, "1");
    else localStorage.removeItem(STORE);
  } catch {
    /* private window; the mode simply will not be remembered */
  }
}

function announce(on) {
  const existing = document.getElementById("decode-note");
  if (existing) existing.remove();
  const note = document.createElement("p");
  note.id = "decode-note";
  note.textContent = on
    ? "decoded — use a key again to put it back"
    : "back to the edition";
  document.body.appendChild(note);
  setTimeout(() => note.remove(), 3600);
}

// Ignore typing that is going somewhere: search boxes, and anything a
// modifier key is involved in.
function isTargetEditable(event) {
  const el = event.target;
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  );
}

// Somebody told "type one, anywhere on this site" will click the obvious text
// box and type there — and the keydown path below deliberately ignores inputs so
// that searching still works. So the search field is a key too, and the failed
// search is the discovery: nothing matches pharmakon in a catalogue of Latin
// titles, and then the lights go out.
//
// Matched on the whole field value, not as a suffix: searching for a real title
// must never trip this by accident.
document.addEventListener("input", (event) => {
  const el = event.target;
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return;
  const value = fold(el.value);
  if (!value || !FOLDED.includes(value)) return;
  el.value = "";
  el.dispatchEvent(new Event("input", { bubbles: true }));  // let the page's own filter recover
  const on = !document.body.classList.contains("decode");
  apply(on);
  announce(on);
});

// The reading run hands the same switch to a finger: a decoded word is a key
// whether you type it or tap it, and a phone has no keyboard to type it with.
document.addEventListener("pergamap:decode", () => {
  const on = !document.body.classList.contains("decode");
  apply(on);
  announce(on);
});

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (isTargetEditable(event)) return;
  if (event.key.length !== 1 || !/[a-zA-Z]/.test(event.key)) return;
  typed = (typed + event.key.toLowerCase()).slice(-BUFFER);
  if (!FOLDED.some((key) => fold(typed).endsWith(key))) return;
  typed = "";
  const on = !document.body.classList.contains("decode");
  apply(on);
  announce(on);
});

try {
  if (localStorage.getItem(STORE) === "1") document.body.classList.add("decode");
} catch {
  /* nothing to restore */
}
