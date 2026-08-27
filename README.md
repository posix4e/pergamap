# Pergamap

**Much of Galen remains inaccessible in English.** Galen of Pergamon (129 – c. 216 CE) is the largest surviving author of Greco-Roman antiquity, with millions of words preserved. This project is:

1. **An atlas** — [`data/works.json`](data/works.json) tracks the corpus: known survival languages, digitized texts, English translations, citations, and verification status. The [interactive transmission map](https://pergamap.com/transmission) joins all 108 records to the local Arabic manifest and a curated set of source-backed Hebrew, Latin, German, English, and digital branches stored in [`data/transmission.json`](data/transmission.json). Broader Galenic influence is kept visually distinct from direct textual descent.
2. **A roadmap** — a phased plan for translating the untranslated, with targets picked by public vote.
3. **A working translation** — published chunk by chunk with the source text alongside, starting with Book 1 of *On the Composition of Drugs According to Places* (baldness cures, hair dyes, dandruff, lice — Kühn XII 378 ff.), which has waited ~1,800 years for English.

Live site: https://pergamap.com/

## Data honesty

The schema-v2 catalogue is explicitly marked `preliminary`. Every entry carries an `english.verification.status` field:

- `checked` — verified against sources during this project
- `recalled` — from general scholarship, **needs a citation check**
- `unknown` — nobody has checked yet; a great first contribution

The translation-status data is a living draft. If you find an error, [open an issue](https://github.com/posix4e/pergamap/issues) with your source — that's the project working as intended. Structured citations are preserved even when an older record has only a display label rather than complete bibliographic fields.

The [BBAW/CMG catalogue browser](https://pergamap.com/library#bbaw) loads a local metadata index refreshed weekly from the authoritative catalogue. The import records BBAW record numbers, titles, Kühn references, language-column presence, retrieval date, and source checksum; it does not republish BBAW's bibliographic strings or automatically change Pergamap's editorial status fields. A curated crosswalk connects the two catalogues, and CI requires every disagreement about English coverage to carry an explicit review note.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md): verify a catalog entry, vote on the first campaign, or claim a translation chunk.

## Sources & licenses

- Greek texts: [First1KGreek](https://github.com/OpenGreekAndLatin/First1KGreek), pinned per translation packet; many are digitized from Kühn, *Claudii Galeni Opera Omnia* (1821–33, public domain; [scans](https://archive.org/details/b29339339_0012) via Wellcome Library).
- Arabic texts: [Digital Corpus for Graeco-Arabic Studies](https://www.graeco-arabic-studies.org/) (CC BY-SA 4.0), with source and local checksums in the manifest.
- Modern translation catalogue: [BBAW/CMG Galenus — Übersetzungen](https://cmg.bbaw.de/startseite/arbeitsmittel/werkverzeichnisse/galenus-uebersetzungen/), loaded as an attributed metadata index with bibliography retained on the authoritative site.
- Site content and translations: [CC BY-SA 4.0](LICENSE). See [NOTICE.md](NOTICE.md) for provenance boundaries.
