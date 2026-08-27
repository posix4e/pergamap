# Provenance and licensing notices

Pergamap's original site text, catalogue arrangement, metadata, and project translations are available under the [Creative Commons Attribution-ShareAlike 4.0 International License](LICENSE). Project citation metadata names `posix4e`; individual translation packets record their own contributor and reviewer attribution.

## Source texts

- Greek TEI is supplied by [First1KGreek](https://github.com/OpenGreekAndLatin/First1KGreek) under the license stated upstream. Every generated packet records an immutable upstream commit, retrieval date, and SHA-256 checksum.
- Karl Gottlob Kühn's nineteenth-century *Claudii Galeni Opera Omnia* is public domain. Scan providers retain their own site terms and metadata rights.
- Vendored Arabic TEI comes from the [Digital Corpus for Graeco-Arabic Studies](https://www.graeco-arabic-studies.org/) under CC BY-SA 4.0. The Arabic manifest records source URLs and full source/local checksums. One file has a documented markup-only repair that leaves its textual content unchanged.
- The BBAW/CMG Galen translation page is summarized as a dated metadata index in `data/bbaw-galen-translations.json`. The index attributes the Berlin-Brandenburg Academy of Sciences and Humanities, links to the authoritative page, and records the source HTML checksum. It retains record identifiers, titles, Kühn references, and presence flags—not BBAW's bibliographic strings. BBAW's published content remains subject to its own terms and outside Pergamap's CC license.

Bibliographic facts and citations remain attributable to their authors and publishers. Pergamap's CC license does not replace or broaden third-party permissions.

The transmission map's later-language relationships cite the scholarly repositories, specialist databases, and library catalogues named in `data/transmission.json`. The social-preview artwork for that page was generated for Pergamap with OpenAI image generation and is distributed with the project's original site content.

## Typefaces

- **EB Garamond** (Georg Duffner and Octavio Pardo) and **Amiri** (Khaled Hosny), both vendored as woff2 subsets in `assets/fonts/`, are used under the SIL Open Font License 1.1. The fonts remain under their own license, separate from this repository's content license.
