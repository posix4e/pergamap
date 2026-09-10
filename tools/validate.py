#!/usr/bin/env python3
"""Validate Pergamap's versioned catalogue, packets, and vendored witnesses.

The validator uses only the Python standard library and performs no network
access. ``validate()`` returns a list of errors for unit tests; the command-line
entry point prints those errors and exits non-zero when any invariant fails.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import pathlib
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter
from urllib.parse import urlparse


ROOT = pathlib.Path(__file__).resolve().parent.parent
STATUSES = {"open", "claimed", "draft", "reviewed"}
ENGLISH_STATUSES = {"none", "full", "partial", "unknown"}
CONFIDENCE = {"checked", "recalled", "unknown"}
# How a row's English status was established, weakest first. "model-recall" means
# nothing was consulted; "catalogue-listed" means a catalogue of translations was
# searched; "publication-verified" means the translation itself was seen.
BASIS_KINDS = {"model-recall", "catalogue-listed", "publication-verified"}
LANGUAGES = {"greek", "arabic", "latin"}
TRANSMISSION_LANGUAGES = LANGUAGES | {"hebrew", "english", "german", "multilingual"}
TRANSMISSION_RELATIONS = {
    "commented-on-by-galen",
    "translation-from-arabic",
    "translation-from-arabic-or-latin",
    "modern-translation-from-arabic",
    "bilingual-edition",
    "teaching-collection",
    "galenic-synthesis",
    "arabic-latin-synthesis",
}
TRANSMISSION_KINDS = {"translation", "edition", "digital-project"}
BBAW_COLUMNS = {"german", "english", "french", "italian", "spanish", "other"}
EXTENTS = {"unspecified", "full", "partial", "fragments", "unknown"}
HEX40 = re.compile(r"^[0-9a-f]{40}$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")
SAFE_ID = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def load_json(path: pathlib.Path, errors: list[str], label: str):
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        errors.append(f"{label}: file is missing")
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"{label}: cannot read JSON: {exc}")
    return None


def is_date(value: object) -> bool:
    try:
        dt.date.fromisoformat(str(value))
        return True
    except ValueError:
        return False


def is_safe_url(value: object, *, allow_local: bool = False) -> bool:
    if not isinstance(value, str) or not value.strip():
        return False
    parsed = urlparse(value)
    if parsed.scheme:
        return parsed.scheme == "https" and bool(parsed.netloc)
    return allow_local and not value.startswith(("//", "/")) and ".." not in pathlib.PurePosixPath(value).parts


def inside(root: pathlib.Path, relative: object) -> pathlib.Path | None:
    if not isinstance(relative, str) or not relative:
        return None
    candidate = (root / relative).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        return None
    return candidate


def validate_works(root: pathlib.Path, errors: list[str]):
    path = root / "data" / "works.json"
    doc = load_json(path, errors, "data/works.json")
    if not isinstance(doc, dict):
        if doc is not None:
            errors.append("data/works.json: root must be an object")
        return set(), set(), 0
    if doc.get("schema_version") != 2:
        errors.append("data/works.json: schema_version must be 2")
    if doc.get("status") != "preliminary":
        errors.append("data/works.json: status must be 'preliminary'")
    if not is_date(doc.get("updated")):
        errors.append("data/works.json: updated must be an ISO date")

    source_ids: set[str] = set()
    sources = doc.get("sources")
    if not isinstance(sources, list):
        errors.append("data/works.json: sources must be a list")
        sources = []
    for index, source in enumerate(sources):
        label = f"data/works.json source {index}"
        if not isinstance(source, dict):
            errors.append(f"{label}: must be an object")
            continue
        sid = source.get("id")
        if not isinstance(sid, str) or not SAFE_ID.fullmatch(sid):
            errors.append(f"{label}: invalid id {sid!r}")
        elif sid in source_ids:
            errors.append(f"data/works.json: duplicate source id {sid!r}")
        else:
            source_ids.add(sid)
        if not source.get("title"):
            errors.append(f"{label}: missing title")
        if not is_safe_url(source.get("url")):
            errors.append(f"{label}: unsafe or invalid URL {source.get('url')!r}")
        if not is_date(source.get("accessed")):
            errors.append(f"{label}: accessed must be an ISO date")

    works = doc.get("works")
    if not isinstance(works, list):
        errors.append("data/works.json: works must be a list")
        return set(), source_ids, 0
    work_ids: set[str] = set()
    for index, work in enumerate(works):
        if not isinstance(work, dict):
            errors.append(f"data/works.json work {index}: must be an object")
            continue
        wid = work.get("id", f"<work {index}>")
        label = f"data/works.json {wid}"
        if not isinstance(wid, str) or not SAFE_ID.fullmatch(wid):
            errors.append(f"{label}: invalid id")
        elif wid in work_ids:
            errors.append(f"data/works.json: duplicate work id {wid!r}")
        else:
            work_ids.add(wid)
        titles = work.get("titles")
        if not isinstance(titles, dict) or not titles.get("latin"):
            errors.append(f"{label}: titles.latin is required")
        survival = work.get("survival")
        if not isinstance(survival, dict):
            errors.append(f"{label}: survival must be an object")
        else:
            languages = survival.get("languages")
            if not isinstance(languages, list) or any(language not in LANGUAGES for language in languages):
                errors.append(f"{label}: survival.languages contains an invalid language")
            if survival.get("extent") not in EXTENTS:
                errors.append(f"{label}: invalid survival.extent {survival.get('extent')!r}")
        digital_texts = work.get("digital_texts")
        if not isinstance(digital_texts, list):
            errors.append(f"{label}: digital_texts must be a list")
        else:
            for text_index, digital in enumerate(digital_texts):
                if not isinstance(digital, dict) or not digital.get("provider") or not digital.get("language"):
                    errors.append(f"{label}: digital_texts[{text_index}] is incomplete")
                elif not is_safe_url(digital.get("url")):
                    errors.append(f"{label}: digital_texts[{text_index}] has unsafe or invalid URL")

        english = work.get("english")
        if not isinstance(english, dict):
            errors.append(f"{label}: english must be an object")
            continue
        status = english.get("status")
        if status not in ENGLISH_STATUSES:
            errors.append(f"{label}: invalid english.status {status!r}")
        citations = english.get("citations")
        if not isinstance(citations, list):
            errors.append(f"{label}: english.citations must be a list")
            citations = []
        if status in {"full", "partial"} and not citations:
            errors.append(f"{label}: {status} English status requires a citation")
        for citation_index, citation in enumerate(citations):
            c_label = f"{label} citation {citation_index}"
            if not isinstance(citation, dict) or not citation.get("label"):
                errors.append(f"{c_label}: label is required")
                continue
            if citation.get("scope") not in {"full", "partial", "unspecified"}:
                errors.append(f"{c_label}: invalid scope {citation.get('scope')!r}")
            if citation.get("url") is not None and not is_safe_url(citation.get("url")):
                errors.append(f"{c_label}: unsafe or invalid URL {citation.get('url')!r}")
            url = citation.get("url") or ""
            if "pergamap.com" in url:
                errors.append(
                    f"{c_label}: a work's English status may not cite this project. "
                    "Project drafts are recorded in data/chunks.json, not as evidence "
                    "about the published record")
        basis = english.get("basis")
        if not isinstance(basis, dict) or basis.get("kind") not in BASIS_KINDS:
            errors.append(
                f"{label}: english.basis.kind is required and must be one of "
                f"{sorted(BASIS_KINDS)} — every status must say how it was established")
        else:
            searched = basis.get("searched")
            if not isinstance(searched, list):
                errors.append(f"{label}: english.basis.searched must be a list")
            elif basis["kind"] in {"catalogue-listed", "publication-verified"}:
                if not searched:
                    errors.append(
                        f"{label}: basis {basis['kind']!r} requires at least one "
                        "searched entry recording what was consulted and when")
                for search_index, entry in enumerate(searched):
                    s_label = f"{label} basis.searched {search_index}"
                    if not isinstance(entry, dict):
                        errors.append(f"{s_label}: must be an object")
                        continue
                    if not entry.get("source"):
                        errors.append(f"{s_label}: source is required")
                    if not is_date(entry.get("date")):
                        errors.append(f"{s_label}: a valid date is required")
                    if not entry.get("result"):
                        errors.append(f"{s_label}: result is required")
            elif basis["kind"] == "model-recall" and searched:
                errors.append(
                    f"{label}: basis 'model-recall' means nothing was consulted; "
                    "record a searched entry only under a higher basis kind")
        verification = english.get("verification")
        if not isinstance(verification, dict) or verification.get("status") not in CONFIDENCE:
            errors.append(f"{label}: invalid english.verification")
            continue
        refs = verification.get("source_ids")
        if not isinstance(refs, list) or any(ref not in source_ids for ref in refs):
            errors.append(f"{label}: verification references an unknown source id")
        if verification.get("status") == "checked" and not is_date(verification.get("checked_on")):
            errors.append(f"{label}: checked verification requires checked_on")
    return work_ids, source_ids, len(works)


def validate_chunks(root: pathlib.Path, work_ids: set[str], errors: list[str]) -> int:
    registry_path = root / "data" / "chunks.json"
    registry = load_json(registry_path, errors, "data/chunks.json")
    if not isinstance(registry, dict):
        if registry is not None:
            errors.append("data/chunks.json: root must be an object")
        return 0
    if registry.get("schema_version") != 2:
        errors.append("data/chunks.json: schema_version must be 2")
    if not is_date(registry.get("updated")):
        errors.append("data/chunks.json: updated must be an ISO date")
    entries = registry.get("chunks")
    if not isinstance(entries, list):
        errors.append("data/chunks.json: chunks must be a list")
        return 0

    ids: set[str] = set()
    registry_files: set[pathlib.Path] = set()
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            errors.append(f"data/chunks.json entry {index}: must be an object")
            continue
        cid = entry.get("id", f"<entry {index}>")
        label = f"data/chunks.json {cid}"
        if not isinstance(cid, str) or not SAFE_ID.fullmatch(cid):
            errors.append(f"{label}: invalid id")
        elif cid in ids:
            errors.append(f"data/chunks.json: duplicate chunk id {cid!r}")
        else:
            ids.add(cid)
        if entry.get("work") not in work_ids:
            errors.append(f"{label}: work {entry.get('work')!r} is not in works.json")
        if entry.get("status") not in STATUSES:
            errors.append(f"{label}: invalid status {entry.get('status')!r}")
        if not entry.get("kuhn_range"):
            errors.append(f"{label}: kuhn_range is required")
        packet_path = inside(root, entry.get("file"))
        if packet_path is None or packet_path.suffix != ".json":
            errors.append(f"{label}: unsafe or invalid packet path {entry.get('file')!r}")
            continue
        if packet_path in registry_files:
            errors.append(f"data/chunks.json: duplicate packet file {entry.get('file')!r}")
        registry_files.add(packet_path)
        packet = load_json(packet_path, errors, f"{label} packet")
        if not isinstance(packet, dict):
            continue
        if packet.get("schema_version") != 2:
            errors.append(f"{label}: packet schema_version must be 2")
        for field in ("id", "work", "kuhn_range", "status"):
            if packet.get(field) != entry.get(field):
                errors.append(f"{label}: registry/packet {field} mismatch")
        contributors = packet.get("contributors")
        if not isinstance(contributors, dict):
            errors.append(f"{label}: contributors must be an object")
            contributors = {}
        translator = contributors.get("translator")
        reviewer = contributors.get("reviewer")
        if packet.get("status") in {"draft", "reviewed"} and (
            not isinstance(translator, dict) or not translator.get("name")
        ):
            errors.append(f"{label}: draft/reviewed packet requires translator attribution")
        if packet.get("status") == "reviewed" and (
            not isinstance(reviewer, dict) or not reviewer.get("name")
        ):
            errors.append(f"{label}: reviewed packet requires reviewer attribution")
        source = packet.get("source")
        if not isinstance(source, dict):
            errors.append(f"{label}: source must be an object")
        else:
            if not is_safe_url(source.get("text_url")):
                errors.append(f"{label}: source.text_url is unsafe or invalid")
            if not HEX40.fullmatch(str(source.get("upstream_commit", ""))):
                errors.append(f"{label}: source.upstream_commit must be a 40-character hash")
            if not is_date(source.get("retrieved_on")):
                errors.append(f"{label}: source.retrieved_on must be an ISO date")
            if not HEX64.fullmatch(str(source.get("sha256", ""))):
                errors.append(f"{label}: source.sha256 must be a full SHA-256")
            for field in ("edition", "license"):
                if not source.get(field):
                    errors.append(f"{label}: source.{field} is required")
        segments = packet.get("segments")
        if not isinstance(segments, list) or not segments:
            errors.append(f"{label}: packet requires segments")
            continue
        for segment_index, segment in enumerate(segments):
            s_label = f"{label} segment {segment_index}"
            if not isinstance(segment, dict):
                errors.append(f"{s_label}: must be an object")
                continue
            for field in ("kuhn", "grc", "eng", "rationale", "refs", "notes"):
                if field not in segment:
                    errors.append(f"{s_label}: missing {field}")
            if not str(segment.get("grc", "")).strip():
                errors.append(f"{s_label}: Greek text is empty")
            if not isinstance(segment.get("refs"), list):
                errors.append(f"{s_label}: refs must be a list")
            if packet.get("status") in {"draft", "reviewed"}:
                if not str(segment.get("eng", "")).strip():
                    errors.append(f"{s_label}: translated packet has an empty English segment")
                if not str(segment.get("rationale", "")).strip():
                    errors.append(f"{s_label}: translated packet requires rationale")
                if not segment.get("refs"):
                    errors.append(f"{s_label}: translated packet requires citations")

    packet_dir = root / "translations" / "chunks"
    actual_files = {path.resolve() for path in packet_dir.glob("*.json")} if packet_dir.exists() else set()
    for undeclared in sorted(actual_files - registry_files):
        errors.append(f"{undeclared.name}: packet file has no registry entry")
    return len(entries)


def validate_arabic(root: pathlib.Path, work_ids: set[str], errors: list[str]) -> set[str]:
    directory = root / "sources" / "arabic"
    manifest_path = directory / "manifest.json"
    if not manifest_path.exists():
        return set()
    manifest = load_json(manifest_path, errors, "sources/arabic/manifest.json")
    if not isinstance(manifest, dict):
        return set()
    if manifest.get("schema_version") != 2:
        errors.append("sources/arabic/manifest.json: schema_version must be 2")
    source = manifest.get("source")
    if not isinstance(source, dict):
        errors.append("sources/arabic/manifest.json: source must be an object")
    else:
        if not is_safe_url(source.get("url")):
            errors.append("sources/arabic/manifest.json: source URL is unsafe or invalid")
        if not is_date(source.get("retrieved_on")):
            errors.append("sources/arabic/manifest.json: retrieved_on must be an ISO date")
        if not source.get("license"):
            errors.append("sources/arabic/manifest.json: source license is required")
    texts = manifest.get("texts")
    if not isinstance(texts, list):
        errors.append("sources/arabic/manifest.json: texts must be a list")
        return set()
    declared: set[str] = set()
    kinds: Counter[str] = Counter()
    for index, entry in enumerate(texts):
        if not isinstance(entry, dict):
            errors.append(f"Arabic manifest entry {index}: must be an object")
            continue
        filename = entry.get("file", f"<entry {index}>")
        label = f"Arabic manifest {filename}"
        if not isinstance(filename, str) or pathlib.PurePosixPath(filename).name != filename or not filename.endswith(".xml"):
            errors.append(f"{label}: unsafe or invalid filename")
            continue
        if filename in declared:
            errors.append(f"Arabic manifest: duplicate filename {filename!r}")
        declared.add(filename)
        kind = entry.get("kind")
        if kind not in {"translation", "summary", "catalogue"}:
            errors.append(f"{label}: invalid kind {kind!r}")
        else:
            kinds[kind] += 1
        refs = entry.get("work_ids")
        if not isinstance(refs, list) or any(ref not in work_ids for ref in refs):
            errors.append(f"{label}: work_ids contains an unknown work")
        if not is_safe_url(entry.get("source_url")):
            errors.append(f"{label}: source_url is unsafe or invalid")
        source_hash = str(entry.get("source_sha256", ""))
        local_hash = str(entry.get("local_sha256", ""))
        if not HEX64.fullmatch(source_hash):
            errors.append(f"{label}: source_sha256 must be a full SHA-256")
        if not HEX64.fullmatch(local_hash):
            errors.append(f"{label}: local_sha256 must be a full SHA-256")
        changes = entry.get("local_changes")
        if not isinstance(changes, list):
            errors.append(f"{label}: local_changes must be a list")
            changes = []
        if source_hash != local_hash and not changes:
            errors.append(f"{label}: changed local file requires a local_changes record")
        if source_hash == local_hash and changes:
            errors.append(f"{label}: local_changes recorded but source and local hashes match")
        path = directory / filename
        if not path.exists():
            errors.append(f"{label}: file is missing")
            continue
        actual_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual_hash != local_hash:
            errors.append(f"{label}: local checksum mismatch")
        try:
            ET.parse(path)
        except ET.ParseError as exc:
            errors.append(f"{label}: XML is not well-formed: {exc}")
    actual = {path.name for path in directory.glob("*.xml")}
    for filename in sorted(actual - declared):
        errors.append(f"Arabic witness {filename}: file is missing from manifest")
    for filename in sorted(declared - actual):
        errors.append(f"Arabic manifest {filename}: declared file is missing")
    expected_counts = manifest.get("counts")
    if not isinstance(expected_counts, dict):
        errors.append("sources/arabic/manifest.json: counts must be an object")
    else:
        for kind in ("translation", "summary", "catalogue"):
            if expected_counts.get(kind) != kinds[kind]:
                errors.append(
                    f"sources/arabic/manifest.json: {kind} count is {expected_counts.get(kind)!r}, expected {kinds[kind]}"
                )
    return declared


def validate_transmission(
    root: pathlib.Path, work_ids: set[str], witness_files: set[str], errors: list[str]
) -> int:
    path = root / "data" / "transmission.json"
    document = load_json(path, errors, "data/transmission.json")
    if not isinstance(document, dict):
        if document is not None:
            errors.append("data/transmission.json: root must be an object")
        return 0
    if document.get("schema_version") != 1:
        errors.append("data/transmission.json: schema_version must be 1")
    if document.get("status") != "curated":
        errors.append("data/transmission.json: status must be 'curated'")
    if not is_date(document.get("updated")):
        errors.append("data/transmission.json: updated must be an ISO date")
    methodology = document.get("methodology")
    if not isinstance(methodology, dict) or any(
        not methodology.get(field)
        for field in (
            "scope",
            "direct_relation",
            "influence_relation",
            "work_identity",
            "surviving_tradition",
            "translation_route",
        )
    ):
        errors.append("data/transmission.json: methodology is incomplete")

    source_ids: set[str] = set()
    sources = document.get("sources")
    if not isinstance(sources, list) or not sources:
        errors.append("data/transmission.json: sources must be a non-empty list")
        sources = []
    for index, source in enumerate(sources):
        label = f"data/transmission.json source {index}"
        if not isinstance(source, dict):
            errors.append(f"{label}: must be an object")
            continue
        sid = source.get("id")
        if not isinstance(sid, str) or not SAFE_ID.fullmatch(sid):
            errors.append(f"{label}: invalid id {sid!r}")
        elif sid in source_ids:
            errors.append(f"data/transmission.json: duplicate source id {sid!r}")
        else:
            source_ids.add(sid)
        for field in ("title", "publisher"):
            if not source.get(field):
                errors.append(f"{label}: {field} is required")
        if not is_safe_url(source.get("url")):
            errors.append(f"{label}: unsafe or invalid URL {source.get('url')!r}")
        if not is_date(source.get("accessed")):
            errors.append(f"{label}: accessed must be an ISO date")

    node_ids: set[str] = set()

    def validate_common(item, label: str, allowed_relations: set[str]):
        if not isinstance(item, dict):
            errors.append(f"{label}: must be an object")
            return False
        item_id = item.get("id")
        if not isinstance(item_id, str) or not SAFE_ID.fullmatch(item_id):
            errors.append(f"{label}: invalid id {item_id!r}")
        elif item_id in node_ids:
            errors.append(f"data/transmission.json: duplicate node id {item_id!r}")
        else:
            node_ids.add(item_id)
        for field in ("title", "date", "description"):
            if not item.get(field):
                errors.append(f"{label}: {field} is required")
        if item.get("language") not in TRANSMISSION_LANGUAGES:
            errors.append(f"{label}: invalid language {item.get('language')!r}")
        if item.get("relation") not in allowed_relations:
            errors.append(f"{label}: invalid relation {item.get('relation')!r}")
        if not is_safe_url(item.get("url")):
            errors.append(f"{label}: unsafe or invalid URL {item.get('url')!r}")
        refs = item.get("source_ids")
        if not isinstance(refs, list) or not refs:
            errors.append(f"{label}: source_ids must be a non-empty list")
        elif any(ref not in source_ids for ref in refs):
            errors.append(f"{label}: source_ids contains an unknown source")
        return True

    upstream = document.get("upstream")
    if not isinstance(upstream, list):
        errors.append("data/transmission.json: upstream must be a list")
        upstream = []
    for index, item in enumerate(upstream):
        label = f"data/transmission.json upstream {index}"
        if not validate_common(item, label, {"commented-on-by-galen"}):
            continue
        refs = item.get("work_ids")
        if not isinstance(refs, list) or not refs or any(ref not in work_ids for ref in refs):
            errors.append(f"{label}: work_ids contains an unknown work")

    receptions = document.get("receptions")
    if not isinstance(receptions, list):
        errors.append("data/transmission.json: receptions must be a list")
        receptions = []
    direct_relations = {
        "translation-from-arabic",
        "translation-from-arabic-or-latin",
        "modern-translation-from-arabic",
        "bilingual-edition",
    }
    for index, item in enumerate(receptions):
        label = f"data/transmission.json reception {index}"
        if not validate_common(item, label, direct_relations):
            continue
        if item.get("kind") not in TRANSMISSION_KINDS:
            errors.append(f"{label}: invalid kind {item.get('kind')!r}")
        if item.get("certainty") != "documented":
            errors.append(f"{label}: certainty must be 'documented'")
        refs = item.get("work_ids")
        if not isinstance(refs, list) or not refs or any(ref not in work_ids for ref in refs):
            errors.append(f"{label}: work_ids contains an unknown work")
        files = item.get("witness_files")
        if not isinstance(files, list) or any(filename not in witness_files for filename in files):
            errors.append(f"{label}: witness_files contains an unknown Arabic file")

    context = document.get("context")
    if not isinstance(context, list):
        errors.append("data/transmission.json: context must be a list")
        context = []
    influence_relations = {"teaching-collection", "galenic-synthesis", "arabic-latin-synthesis"}
    for index, item in enumerate(context):
        validate_common(item, f"data/transmission.json context {index}", influence_relations)
    return len(receptions)


def validate_bbaw(root: pathlib.Path, errors: list[str]) -> set[str]:
    path = root / "data" / "bbaw-galen-translations.json"
    if not path.exists():
        return set()
    document = load_json(path, errors, "data/bbaw-galen-translations.json")
    if not isinstance(document, dict):
        return set()
    label = "data/bbaw-galen-translations.json"
    if document.get("schema_version") != 1:
        errors.append(f"{label}: schema_version must be 1")
    if not is_date(document.get("retrieved_on")):
        errors.append(f"{label}: retrieved_on must be an ISO date")
    source = document.get("source")
    if not isinstance(source, dict):
        errors.append(f"{label}: source must be an object")
    else:
        for field in ("publisher", "title"):
            if not source.get(field):
                errors.append(f"{label}: source.{field} is required")
        for field in ("url", "terms_url"):
            if not is_safe_url(source.get(field)):
                errors.append(f"{label}: source.{field} is unsafe or invalid")
        if not HEX64.fullmatch(str(source.get("sha256", ""))):
            errors.append(f"{label}: source.sha256 must be a full SHA-256")
    records = document.get("records")
    if not isinstance(records, list):
        errors.append(f"{label}: records must be a list")
        return set()
    if len(records) < 100:
        errors.append(f"{label}: expected at least 100 records")
    if document.get("record_count") != len(records):
        errors.append(f"{label}: record_count does not match records")
    ids: set[str] = set()
    for index, record in enumerate(records):
        r_label = f"{label} record {index}"
        if not isinstance(record, dict):
            errors.append(f"{r_label}: must be an object")
            continue
        record_id = record.get("id")
        if not isinstance(record_id, str) or not re.fullmatch(r"[0-9]{3}", record_id):
            errors.append(f"{r_label}: invalid BBAW record id {record_id!r}")
        elif record_id in ids:
            errors.append(f"{label}: duplicate BBAW record id {record_id!r}")
        else:
            ids.add(record_id)
        for field in ("title", "kuhn"):
            if not isinstance(record.get(field), str) or not record[field].strip():
                errors.append(f"{r_label}: {field} is required")
        columns = record.get("translation_columns")
        if not isinstance(columns, dict) or set(columns) != BBAW_COLUMNS:
            errors.append(f"{r_label}: translation_columns must contain all six language flags")
        elif any(not isinstance(value, bool) for value in columns.values()):
            errors.append(f"{r_label}: translation column flags must be booleans")
    return ids


def validate_bbaw_crosswalk(
    root: pathlib.Path, work_ids: set[str], bbaw_ids: set[str], errors: list[str]
) -> int:
    path = root / "data" / "bbaw-crosswalk.json"
    if not path.exists():
        if bbaw_ids:
            errors.append("data/bbaw-crosswalk.json: file is missing")
        return 0
    document = load_json(path, errors, "data/bbaw-crosswalk.json")
    if not isinstance(document, dict):
        return 0
    label = "data/bbaw-crosswalk.json"
    if document.get("schema_version") != 1:
        errors.append(f"{label}: schema_version must be 1")
    if document.get("status") != "curated":
        errors.append(f"{label}: status must be 'curated'")
    if not is_date(document.get("updated")):
        errors.append(f"{label}: updated must be an ISO date")
    if not isinstance(document.get("methodology"), str) or not document["methodology"].strip():
        errors.append(f"{label}: methodology is required")
    mappings = document.get("mappings")
    if not isinstance(mappings, list):
        errors.append(f"{label}: mappings must be a list")
        return 0

    mapped_work_ids: set[str] = set()
    record_uses: dict[str, list[dict]] = {}
    for index, mapping in enumerate(mappings):
        m_label = f"{label} mapping {index}"
        if not isinstance(mapping, dict):
            errors.append(f"{m_label}: must be an object")
            continue
        work_id = mapping.get("work_id")
        if not isinstance(work_id, str) or work_id not in work_ids:
            errors.append(f"{m_label}: unknown work_id {work_id!r}")
        elif work_id in mapped_work_ids:
            errors.append(f"{label}: duplicate work_id {work_id!r}")
        else:
            mapped_work_ids.add(work_id)
        refs = mapping.get("bbaw_record_ids")
        if not isinstance(refs, list) or any(
            not isinstance(ref, str) or ref not in bbaw_ids for ref in refs
        ):
            errors.append(f"{m_label}: bbaw_record_ids contains an unknown BBAW record")
            refs = []
        if len(refs) != len(set(refs)):
            errors.append(f"{m_label}: duplicate BBAW record id")
        relation = mapping.get("relation")
        if relation == "same-work" and len(refs) != 1:
            errors.append(f"{m_label}: same-work requires exactly one BBAW record")
        elif relation == "part-of-grouped-record" and not refs:
            errors.append(f"{m_label}: grouped relation requires a BBAW record")
        elif relation == "not-found" and refs:
            errors.append(f"{m_label}: not-found may not reference a BBAW record")
        elif relation not in {"same-work", "part-of-grouped-record", "not-found"}:
            errors.append(f"{m_label}: invalid relation {relation!r}")
        note = mapping.get("note")
        if relation in {"part-of-grouped-record", "not-found"} and (
            not isinstance(note, str) or not note.strip()
        ):
            errors.append(f"{m_label}: {relation} requires a note")
        for ref in refs:
            record_uses.setdefault(ref, []).append(mapping)
        review = mapping.get("english_status_review")
        if review is not None and (
            not isinstance(review, dict)
            or review.get("status") not in {"needs-source-check", "explained"}
            or not isinstance(review.get("note"), str)
            or not review["note"].strip()
        ):
            errors.append(f"{m_label}: english_status_review is incomplete")
        elif review is not None and not refs:
            errors.append(f"{m_label}: english_status_review requires a BBAW record")

    missing = work_ids - mapped_work_ids
    if missing:
        errors.append(f"{label}: missing work mappings for {sorted(missing)}")
    for record_id, uses in record_uses.items():
        if len(uses) > 1 and any(use.get("relation") != "part-of-grouped-record" for use in uses):
            errors.append(
                f"{label}: BBAW record {record_id!r} is reused without grouped relations"
            )
    return len(mappings)


STANDINGS = {"yes", "received", "defensible", "no"}


def validate_cards(root: pathlib.Path, errors: list[str]) -> None:
    """Question sets for the reading cards.

    The cards ask a reader to commit before being told anything, so the one rule
    worth enforcing is that every option earns its place: each must say what it
    is worth and why. An option with no explanation is a distractor, and a
    distractor teaches nothing.
    """
    directory = root / "data" / "cards"
    for path in sorted(directory.glob("*.json")) if directory.exists() else []:
        label = f"data/cards/{path.name}"
        deck = load_json(path, errors, label)
        if not isinstance(deck, dict):
            continue
        if deck.get("schema_version") != 1:
            errors.append(f"{label}: schema_version must be 1")
        cards = deck.get("cards")
        if not isinstance(cards, list) or not cards:
            errors.append(f"{label}: cards must be a non-empty list")
            continue
        seen: set[str] = set()
        for card in cards:
            cid = card.get("id") if isinstance(card, dict) else None
            if not isinstance(cid, str) or not SAFE_ID.match(cid):
                errors.append(f"{label}: every card needs an id")
                continue
            if cid in seen:
                errors.append(f"{label}: duplicate card id {cid}")
            seen.add(cid)
            for field in ("eyebrow", "question", "reveal"):
                if not str(card.get(field) or "").strip():
                    errors.append(f"{label}: card {cid} must have a {field}")
            options = card.get("options")
            if not isinstance(options, list) or len(options) < 2:
                errors.append(f"{label}: card {cid} needs at least two options")
                continue
            for option in options:
                name = option.get("label") if isinstance(option, dict) else None
                if not str(name or "").strip():
                    errors.append(f"{label}: card {cid} has an option with no label")
                    continue
                if option.get("standing") not in STANDINGS:
                    errors.append(
                        f"{label}: card {cid} option {name!r}: standing must be one of {sorted(STANDINGS)}"
                    )
                if not str(option.get("response") or "").strip():
                    errors.append(
                        f"{label}: card {cid} option {name!r} has no response. "
                        "An option with no explanation is a distractor, and a distractor teaches nothing"
                    )
            if not any(o.get("standing") in {"yes", "received"} for o in options if isinstance(o, dict)):
                errors.append(f"{label}: card {cid} offers no defensible answer at all")
            for link in card.get("links") or []:
                if not is_safe_url(link.get("href"), allow_local=True):
                    errors.append(f"{label}: card {cid} has an unsafe link")


def validate(root: pathlib.Path = ROOT) -> list[str]:
    errors: list[str] = []
    work_ids, _, _ = validate_works(root, errors)
    validate_chunks(root, work_ids, errors)
    witness_files = validate_arabic(root, work_ids, errors)
    validate_transmission(root, work_ids, witness_files, errors)
    bbaw_ids = validate_bbaw(root, errors)
    validate_bbaw_crosswalk(root, work_ids, bbaw_ids, errors)
    validate_cards(root, errors)
    return errors


def main() -> None:
    errors = validate()
    if errors:
        print(f"FAIL: {len(errors)} problem(s)")
        for error in errors:
            print(" -", error)
        raise SystemExit(1)
    works = json.loads((ROOT / "data" / "works.json").read_text())["works"]
    chunks = json.loads((ROOT / "data" / "chunks.json").read_text())["chunks"]
    manifest = json.loads((ROOT / "sources" / "arabic" / "manifest.json").read_text())
    bbaw = json.loads((ROOT / "data" / "bbaw-galen-translations.json").read_text())
    print(
        f"OK: {len(works)} works, {len(chunks)} chunks, "
        f"{len(manifest['texts'])} Arabic witnesses, and {len(bbaw['records'])} BBAW records validated"
    )


if __name__ == "__main__":
    main()
