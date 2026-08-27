import hashlib
import json
import pathlib
import re
import tempfile
import unittest

from tools import validate


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n")


class ValidatorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp.name)
        (self.root / "translations" / "chunks").mkdir(parents=True)
        (self.root / "sources" / "arabic").mkdir(parents=True)
        self.works = {
            "schema_version": 2,
            "updated": "2026-08-09",
            "status": "preliminary",
            "sources": [
                {
                    "id": "catalogue",
                    "title": "Catalogue",
                    "url": "https://example.test/catalogue",
                    "accessed": "2026-08-09",
                }
            ],
            "works": [
                {
                    "id": "tlg001",
                    "urn": "urn:cts:greekLit:tlg0057.tlg001",
                    "titles": {"latin": "Opus", "english": "Work"},
                    "kuhn": "I",
                    "survival": {"languages": ["greek"], "extent": "unspecified"},
                    "digital_texts": [
                        {"language": "greek", "provider": "Example", "url": "https://example.test/text"}
                    ],
                    "english": {
                        "status": "partial",
                        "citations": [
                            {"label": "A translation", "url": "https://example.test/translation", "scope": "partial"}
                        ],
                        "basis": {
                            "kind": "catalogue-listed",
                            "searched": [
                                {"source": "Example catalogue", "url": "https://example.test/catalogue",
                                 "date": "2026-08-09", "result": "listing found"}
                            ],
                        },
                        "verification": {
                            "status": "checked",
                            "checked_on": "2026-08-09",
                            "source_ids": ["catalogue"],
                        },
                    },
                    "notes": None,
                }
            ],
        }
        self.registry = {
            "schema_version": 2,
            "updated": "2026-08-09",
            "chunks": [
                {
                    "id": "sample-1",
                    "work": "tlg001",
                    "kuhn_range": "1.1–1.2",
                    "status": "draft",
                    "file": "translations/chunks/sample-1.json",
                }
            ],
        }
        self.packet = {
            "schema_version": 2,
            "id": "sample-1",
            "work": "tlg001",
            "kuhn_range": "1.1–1.2",
            "status": "draft",
            "contributors": {"translator": {"name": "Translator"}, "reviewer": None},
            "source": {
                "text_url": "https://example.test/source.xml",
                "upstream_commit": "a" * 40,
                "retrieved_on": "2026-08-09",
                "sha256": "b" * 64,
                "edition": "Edition",
                "license": "CC BY-SA 4.0",
            },
            "segments": [
                {
                    "kuhn": "1.1",
                    "grc": "λόγος",
                    "eng": "account",
                    "rationale": "Context supports this rendering.",
                    "refs": ["Edition, p. 1"],
                    "notes": "",
                }
            ],
        }
        self.xml_path = self.root / "sources" / "arabic" / "sample.xml"
        self.xml_path.write_text("<TEI><text>نص</text></TEI>\n")
        digest = hashlib.sha256(self.xml_path.read_bytes()).hexdigest()
        self.manifest = {
            "schema_version": 2,
            "description": "Fixture",
            "source": {
                "id": "dcgas",
                "title": "DCGAS",
                "url": "https://example.test/",
                "license": "CC BY-SA 4.0",
                "retrieved_on": "2026-08-09",
                "url_pattern": "https://example.test/{stem}.xml",
            },
            "counts": {"translation": 1, "summary": 0, "catalogue": 0},
            "duplicates": [],
            "texts": [
                {
                    "file": "sample.xml",
                    "kind": "translation",
                    "author": "Galen",
                    "title_latin": "Opus",
                    "title_arabic": None,
                    "of_work": "Opus",
                    "work_ids": ["tlg001"],
                    "arabic_characters": 3,
                    "edition_ids": [],
                    "source_url": "https://example.test/sample.xml",
                    "source_sha256": digest,
                    "local_sha256": digest,
                    "local_changes": [],
                }
            ],
        }
        self.transmission = {
            "schema_version": 1,
            "updated": "2026-08-10",
            "status": "curated",
            "methodology": {
                "scope": "Fixture scope",
                "direct_relation": "Fixture direct relation",
                "influence_relation": "Fixture influence relation",
                "work_identity": "Fixture work identity distinction",
                "surviving_tradition": "Fixture surviving tradition distinction",
                "translation_route": "Fixture translation-route distinction",
            },
            "sources": [
                {
                    "id": "transmission-source",
                    "title": "Transmission source",
                    "publisher": "Example",
                    "url": "https://example.test/transmission",
                    "accessed": "2026-08-10",
                }
            ],
            "upstream": [],
            "receptions": [
                {
                    "id": "later-version",
                    "title": "Later version",
                    "date": "12th century",
                    "language": "latin",
                    "kind": "translation",
                    "relation": "translation-from-arabic",
                    "certainty": "documented",
                    "work_ids": ["tlg001"],
                    "witness_files": ["sample.xml"],
                    "description": "A source-backed fixture route.",
                    "url": "https://example.test/later",
                    "source_ids": ["transmission-source"],
                }
            ],
            "context": [],
        }
        self.save()

    def tearDown(self):
        self.temp.cleanup()

    def save(self):
        write_json(self.root / "data" / "works.json", self.works)
        write_json(self.root / "data" / "chunks.json", self.registry)
        write_json(self.root / "translations" / "chunks" / "sample-1.json", self.packet)
        write_json(self.root / "sources" / "arabic" / "manifest.json", self.manifest)
        write_json(self.root / "data" / "transmission.json", self.transmission)

    def assert_error_contains(self, phrase):
        errors = validate.validate(self.root)
        self.assertTrue(any(phrase in error for error in errors), errors)

    def test_valid_fixture(self):
        self.assertEqual(validate.validate(self.root), [])

    def test_duplicate_work_id(self):
        self.works["works"].append(dict(self.works["works"][0]))
        self.save()
        self.assert_error_contains("duplicate work id")

    def test_missing_packet_file(self):
        self.registry["chunks"][0]["file"] = "translations/chunks/missing.json"
        self.save()
        self.assert_error_contains("file is missing")

    def test_unsafe_url(self):
        self.works["works"][0]["digital_texts"][0]["url"] = "javascript:alert(1)"
        self.save()
        self.assert_error_contains("unsafe or invalid URL")

    def test_english_status_may_not_cite_this_project(self):
        self.works["works"][0]["english"]["citations"][0]["url"] = (
            "https://pergamap.com/translations/chunk?id=cml-1-1"
        )
        self.save()
        self.assert_error_contains("may not cite this project")

    def test_basis_is_required(self):
        del self.works["works"][0]["english"]["basis"]
        self.save()
        self.assert_error_contains("english.basis.kind is required")

    def test_basis_kind_must_be_known(self):
        self.works["works"][0]["english"]["basis"]["kind"] = "vibes"
        self.save()
        self.assert_error_contains("english.basis.kind is required")

    def test_catalogue_basis_requires_a_search_record(self):
        self.works["works"][0]["english"]["basis"]["searched"] = []
        self.save()
        self.assert_error_contains("requires at least one searched entry")

    def test_search_record_requires_a_date(self):
        del self.works["works"][0]["english"]["basis"]["searched"][0]["date"]
        self.save()
        self.assert_error_contains("a valid date is required")

    def test_search_record_requires_a_result(self):
        del self.works["works"][0]["english"]["basis"]["searched"][0]["result"]
        self.save()
        self.assert_error_contains("result is required")

    def test_model_recall_may_not_claim_a_search(self):
        self.works["works"][0]["english"]["basis"]["kind"] = "model-recall"
        self.save()
        self.assert_error_contains("nothing was consulted")

    def test_registry_packet_drift(self):
        self.packet["status"] = "reviewed"
        self.packet["contributors"]["reviewer"] = {"name": "Reviewer"}
        self.save()
        self.assert_error_contains("registry/packet status mismatch")

    def test_missing_translator(self):
        self.packet["contributors"]["translator"] = None
        self.save()
        self.assert_error_contains("requires translator attribution")

    def test_incomplete_reviewed_packet(self):
        self.registry["chunks"][0]["status"] = "reviewed"
        self.packet["status"] = "reviewed"
        self.packet["contributors"]["reviewer"] = {"name": "Reviewer"}
        self.packet["segments"][0]["eng"] = ""
        self.packet["segments"][0]["rationale"] = ""
        self.packet["segments"][0]["refs"] = []
        self.save()
        errors = validate.validate(self.root)
        self.assertTrue(any("empty English segment" in error for error in errors), errors)
        self.assertTrue(any("requires rationale" in error for error in errors), errors)
        self.assertTrue(any("requires citations" in error for error in errors), errors)

    def test_checksum_mismatch(self):
        self.manifest["texts"][0]["local_sha256"] = "0" * 64
        self.save()
        self.assert_error_contains("local checksum mismatch")

    def test_malformed_xml(self):
        self.xml_path.write_text("<TEI><text></TEI>\n")
        digest = hashlib.sha256(self.xml_path.read_bytes()).hexdigest()
        self.manifest["texts"][0]["source_sha256"] = digest
        self.manifest["texts"][0]["local_sha256"] = digest
        self.save()
        self.assert_error_contains("XML is not well-formed")

    def test_transmission_unknown_work(self):
        self.transmission["receptions"][0]["work_ids"] = ["missing-work"]
        self.save()
        self.assert_error_contains("work_ids contains an unknown work")

    def test_transmission_unknown_witness(self):
        self.transmission["receptions"][0]["witness_files"] = ["missing.xml"]
        self.save()
        self.assert_error_contains("witness_files contains an unknown Arabic file")

    def test_transmission_requires_route_methodology(self):
        self.transmission["methodology"]["translation_route"] = ""
        self.save()
        self.assert_error_contains("methodology is incomplete")

    def test_repository_data_is_valid(self):
        self.assertEqual(validate.validate(validate.ROOT), [])

    def test_repository_crosswalk_covers_every_work(self):
        works = json.loads((validate.ROOT / "data" / "works.json").read_text())["works"]
        mappings = json.loads((validate.ROOT / "data" / "bbaw-crosswalk.json").read_text())["mappings"]
        self.assertEqual({work["id"] for work in works}, {mapping["work_id"] for mapping in mappings})
        self.assertEqual(sum(bool(mapping["bbaw_record_ids"]) for mapping in mappings), 100)

    def test_crosswalk_rejects_missing_and_unknown_mappings(self):
        write_json(
            self.root / "data/bbaw-crosswalk.json",
            {
                "schema_version": 1,
                "updated": "2026-08-12",
                "status": "curated",
                "methodology": "Curated by title and edition reference.",
                "mappings": [
                    {
                        "work_id": "missing-work",
                        "bbaw_record_ids": ["999"],
                        "relation": "same-work",
                    }
                ],
            },
        )
        errors = []
        validate.validate_bbaw_crosswalk(self.root, {"known-work"}, {"001"}, errors)
        self.assertTrue(any("unknown work_id" in error for error in errors))
        self.assertTrue(any("unknown BBAW record" in error for error in errors))
        self.assertTrue(any("missing work mappings" in error for error in errors))

    def test_crosswalk_rejects_unmarked_record_reuse(self):
        write_json(
            self.root / "data/bbaw-crosswalk.json",
            {
                "schema_version": 1,
                "updated": "2026-08-12",
                "status": "curated",
                "methodology": "Curated by title and edition reference.",
                "mappings": [
                    {"work_id": "one", "bbaw_record_ids": ["001"], "relation": "same-work"},
                    {"work_id": "two", "bbaw_record_ids": ["001"], "relation": "same-work"},
                ],
            },
        )
        errors = []
        validate.validate_bbaw_crosswalk(self.root, {"one", "two"}, {"001"}, errors)
        self.assertTrue(any("reused without grouped relations" in error for error in errors))

    def test_ballot_candidates_are_checked_against_sources(self):
        document = json.loads((validate.ROOT / "data" / "works.json").read_text())
        works = {work["id"]: work for work in document["works"]}
        for work_id in ("tlg045", "tlg064", "tlg076", "tlg078"):
            english = works[work_id]["english"]
            self.assertEqual(english["verification"]["status"], "checked")
            self.assertGreaterEqual(english["verification"]["checked_on"], "2026-08-12")
            self.assertIn("bbaw-galen-translations", english["verification"]["source_ids"])
            self.assertIn(english["basis"]["kind"], {"catalogue-listed", "publication-verified"})
            self.assertTrue(
                any(
                    entry["date"] == "2026-08-12" and "BBAW" in entry["source"]
                    for entry in english["basis"]["searched"]
                ),
                f"{work_id}: no dated BBAW catalogue check recorded",
            )

    def test_shortlist_excludes_works_already_translated(self):
        """A candidate with a full English translation must come off the ballot.

        The catalogue check alone once put On the Differences of Fevers on the
        shortlist, because BBAW indexes published translations and Ware's 1928
        Edinburgh thesis was never published. This is that mistake in CI.
        """
        roadmap = (validate.ROOT / "roadmap.html").read_text()
        section = roadmap.split("<h2>Phase 2")[1].split("<h2>")[0]
        candidates = re.findall(r"library\.html\?work=(tlg\d+)", section)
        self.assertTrue(candidates, "no shortlist candidates found in roadmap.html")
        document = json.loads((validate.ROOT / "data" / "works.json").read_text())
        works = {work["id"]: work for work in document["works"]}
        for work_id in candidates:
            english = works[work_id]["english"]
            self.assertNotEqual(
                english["status"],
                "full",
                f"{work_id} is on the shortlist but already has a full English translation",
            )


if __name__ == "__main__":
    unittest.main()
