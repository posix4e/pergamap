#!/usr/bin/env python3
"""Align a Greek work with its Arabic version at Kühn page and lemma level.

The two traditions are held in different digitisations that do not share a page
vocabulary. First1KGreek marks Kühn pages with bare numbers that restart at a
volume boundary; the DCGAS Arabic marks `edRef="#edKuhn"` with a sequential
index over the same span of Kühn pages. Neither states the volume.

The alignment is therefore positional, and it is only sound when both sides
carry the same number of page anchors — which is checked, not assumed. Where the
counts disagree the work is reported as unaligned rather than aligned by guess.

Usage:
  python3 tools/align_kuhn.py --work tlg092 \
      --arabic sources/arabic/gal_inhippaphor-transl-ar1.xml \
      --volumes XVIIb:345 XVIIIa:1
"""
import argparse, hashlib, json, pathlib, re, sys, unicodedata, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache"
PIN = "bfea9acd07ee1b7cea70cdd927c8f092d5637695"
TEI = ("https://raw.githubusercontent.com/OpenGreekAndLatin/First1KGreek/"
       f"{PIN}/data/tlg0057/{{w}}/tlg0057.{{w}}.1st1K-grc1.xml")


def sha256(path):
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


def greek_text(work):
    CACHE.mkdir(exist_ok=True)
    path = CACHE / f"{work}.xml"
    if not path.exists():
        with urllib.request.urlopen(TEI.format(w=work)) as r:
            path.write_text(unicodedata.normalize("NFC", r.read().decode("utf-8")))
    return path


def greek_pages(path):
    """Kühn page anchors in document order, as bare integers."""
    text = pathlib.Path(path).read_text(encoding="utf-8")
    return [int(n) for n in re.findall(r'<pb[^>]*\bn="(\d+)"', text)]


def arabic_pages(path):
    """DCGAS Kühn-referenced anchors, in document order."""
    text = pathlib.Path(path).read_text(encoding="utf-8")
    return [int(n) for _, n in
            re.findall(r'<pb[^>]*edRef="#(edKuhn[^"]*)"[^>]*\bn="(\d+)"', text)]


def lemmata(path):
    text = pathlib.Path(path).read_text(encoding="utf-8")
    return [int(n) for n in re.findall(r'<quote type="lemma"[^>]*\bn="(\d+)"', text)]


def split_volumes(pages):
    """Cut the page sequence where the number falls, i.e. at a volume boundary."""
    runs, start = [], 0
    for i in range(1, len(pages)):
        if pages[i] < pages[i - 1]:
            runs.append((start, i))
            start = i
    runs.append((start, len(pages)))
    return runs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", required=True, help="First1KGreek work id, e.g. tlg092")
    ap.add_argument("--arabic", required=True, help="path to the DCGAS Arabic TEI")
    ap.add_argument("--volumes", nargs="+", required=True,
                    help="Kühn volume labels in order, as LABEL:FIRSTPAGE (e.g. XVIIb:345)")
    args = ap.parse_args()

    gpath = greek_text(args.work)
    apath = ROOT / args.arabic
    gp, apg = greek_pages(gpath), arabic_pages(apath)

    report = {
        "work": args.work,
        "method": "positional alignment of Kühn page anchors; the Arabic index is "
                  "sequential over the same span, so anchor i corresponds to Greek "
                  "page i in document order. Sound only where the anchor counts agree.",
        "sources": {
            "greek": {"url": TEI.format(w=args.work), "pinned_commit": PIN,
                      "sha256": sha256(gpath), "anchors": len(gp)},
            "arabic": {"file": args.arabic, "sha256": sha256(apath), "anchors": len(apg)},
        },
    }

    if len(gp) != len(apg):
        report.update(aligned=False, pages=[],
                      reason=f"anchor counts differ ({len(gp)} Greek, {len(apg)} Arabic); "
                             "positional alignment would be a guess")
        print(f"UNALIGNED {args.work}: {len(gp)} Greek anchors vs {len(apg)} Arabic", file=sys.stderr)
    else:
        runs = split_volumes(gp)
        labels = [v.split(":")[0] for v in args.volumes]
        if len(runs) != len(labels):
            sys.exit(f"found {len(runs)} volume run(s) in the Greek but {len(labels)} label(s) given")
        for (s, e), spec in zip(runs, args.volumes):
            label, first = spec.split(":")
            if gp[s] != int(first):
                sys.exit(f"volume {label} starts at Greek page {gp[s]}, not {first}")
        vol_of = {}
        for (s, e), label in zip(runs, labels):
            for i in range(s, e):
                vol_of[i] = label
        report.update(
            aligned=True,
            volumes=[{"label": l, "first": gp[s], "last": gp[e - 1], "pages": e - s}
                     for (s, e), l in zip(runs, labels)],
            pages=[{"arabic": apg[i], "kuhn_volume": vol_of[i], "kuhn_page": gp[i]}
                   for i in range(len(gp))],
        )

    lem = lemmata(apath)
    glem = lemmata(gpath)
    agree = sorted(set(glem)) == sorted(set(lem))
    report["lemmata"] = {
        "greek_count": len(set(glem)),
        "numbering_agrees": agree,
        "arabic_numbered": len(lem),
        "note": "Both digitisations mark numbered Hippocratic lemmata. Where "
                "numbering_agrees is true the two carry identical lemma-number sets; "
                "number-to-number identity of the underlying text is a separate claim, "
                "to be tested by collation rather than asserted from markup.",
    }

    out = ROOT / "data" / "alignments" / f"{args.work}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=1))
    n = len(report.get("pages", []))
    print(f"wrote {out.relative_to(ROOT)}: {n} page alignments, {len(lem)} Arabic lemmata")


if __name__ == "__main__":
    main()
