#!/usr/bin/env python3
"""Count a Greek stem across a pinned text, so a numeric claim can be rechecked.

Claims like "the stem appears 1,262 times in this work" are the useful kind: not
a matter of interpretation, and wrong or right in a way anyone can settle in ten
seconds. This makes settling it ten seconds' work.

Diacritics are stripped before matching, because the same word is accented
differently by position and an accent-sensitive count would silently undercount.

Usage:
  python3 tools/count_stem.py --work tlg076 --stem φαρμακ δηλητηρι θανασιμ
"""
import argparse, hashlib, pathlib, re, sys, unicodedata, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache"
PIN = "bfea9acd07ee1b7cea70cdd927c8f092d5637695"
TEI = ("https://raw.githubusercontent.com/OpenGreekAndLatin/First1KGreek/"
       f"{PIN}/data/tlg0057/{{w}}/tlg0057.{{w}}.1st1K-grc1.xml")


def bare(text):
    return "".join(c for c in unicodedata.normalize("NFD", text) if not unicodedata.combining(c))


def text_for(work):
    CACHE.mkdir(exist_ok=True)
    path = CACHE / f"{work}.xml"
    if not path.exists():
        print(f"fetching {TEI.format(w=work)}", file=sys.stderr)
        with urllib.request.urlopen(TEI.format(w=work)) as response:
            path.write_text(unicodedata.normalize("NFC", response.read().decode("utf-8")))
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--work", required=True)
    ap.add_argument("--stem", nargs="+", required=True)
    args = ap.parse_args()

    path = text_for(args.work)
    raw = path.read_text(encoding="utf-8")
    words = bare(re.sub(r"<[^>]+>", " ", raw))
    print(f"{args.work}  sha256 {hashlib.sha256(path.read_bytes()).hexdigest()[:16]}  "
          f"pinned {PIN[:12]}")
    for stem in args.stem:
        hits = re.findall(r"\b" + re.escape(bare(stem)) + r"\w*", words)
        print(f"  {stem}- : {len(hits):6d}")


if __name__ == "__main__":
    main()
