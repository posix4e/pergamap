"use strict";

// The shelf: every catalogued work as a spine, coloured by translation status.
const shelf = document.getElementById("shelf");
const caption = document.getElementById("shelf-caption");
const error = document.getElementById("stats-error");

// Deterministic pseudo-height from the work id, so the shelf is stable.
function spineHeight(id) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.codePointAt(0)) % 997;
  return 52 + (h % 41); // 52–92 px
}

fetch("data/works.json")
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then((data) => {
    if (data.schema_version !== 2 || !Array.isArray(data.works)) {
      throw new Error("Unsupported catalogue schema");
    }
    const frag = document.createDocumentFragment();
    const counts = { none: 0, partial: 0, full: 0, unknown: 0 };
    const order = { none: 0, partial: 1, unknown: 2, full: 3 };
    const works = [...data.works].sort(
      (a, b) => order[a.english.status] - order[b.english.status],
    );
    for (const work of works) {
      const status = work.english.status;
      counts[status] = (counts[status] || 0) + 1;
      const spine = document.createElement("a");
      spine.className = `spine ${status}`;
      spine.style.height = `${spineHeight(work.id)}px`;
      spine.href = `library.html?work=${encodeURIComponent(work.id)}`;
      const title = work.titles.english || work.titles.latin;
      spine.title = `${title} — ${status === "none" ? "no English known" : status}`;
      spine.tabIndex = -1;
      frag.appendChild(spine);
    }
    shelf.appendChild(frag);
    caption.replaceChildren();
    const strong = (n, label) => {
      const b = document.createElement("b");
      b.textContent = `${n} ${label}`;
      return b;
    };
    caption.append(
      `Each spine is one of ${data.works.length} works. `,
      strong(counts.none, "have no English translation known"),
      `, ${counts.partial} are partial, ${counts.full} translated, ${counts.unknown} unresearched. `,
    );
    const link = document.createElement("a");
    link.href = "library.html";
    link.textContent = "Open the library →";
    caption.append(link);
  })
  .catch(() => {
    error.hidden = false;
  });
