import re

from fastapi.testclient import TestClient

from policy_service.corpus import chunk_document
from policy_service.index import PolicyIndex

KYC_DOC = """# code: RBI_KYC
# title: Master Direction - Know Your Customer
# authority: official
Chapter 1 Preliminary
Section 16 Customer Due Diligence
1. Regulated entities shall obtain and verify the proof of address of every customer.
2. Records of identity shall be preserved for five years.
Section 46 Record keeping
Regulated entities shall maintain records of all transactions.
"""

GDPR_DOC = """# code: GDPR
Article 5 Principles
1. Personal data shall be accurate and, where necessary, kept up to date.
Article 32 Security of processing
Pseudonymisation and encryption of personal data.
"""


def test_clause_chunking_keeps_paragraphs_with_their_article():
    chunks = chunk_document(KYC_DOC, "IN", "IN/kyc.txt")
    ids = [c.id for c in chunks]
    assert ids == ["RBI_KYC:Chapter 1", "RBI_KYC:Section 16", "RBI_KYC:Section 46"]
    assert "proof of address" in chunks[1].text and "five years" in chunks[1].text
    assert chunks[1].title == "Master Direction - Know Your Customer" and chunks[1].authority == "official"


def _index(tmp_path):
    corpus = tmp_path / "corpus"
    (corpus / "IN").mkdir(parents=True)
    (corpus / "EU").mkdir()
    (corpus / "IN" / "kyc.txt").write_text(KYC_DOC, encoding="utf-8")
    (corpus / "EU" / "gdpr.txt").write_text(GDPR_DOC, encoding="utf-8")
    ix = PolicyIndex(corpus, tmp_path / "index")
    ix.build(embed=False)
    return ix


def test_retrieval_is_restricted_to_jurisdiction(tmp_path):
    ix = _index(tmp_path)
    india = ix.retrieve(["customer address proof verification"], "IN", k=5)
    assert india["retrieval"] == "lexical"
    assert india["clauses"][0]["id"] == "RBI_KYC:Section 16"
    assert all(c["jurisdiction"] in ("IN", "GLOBAL") for c in india["clauses"])

    eu = ix.retrieve(["personal data accurate kept up to date"], "EU", k=5)
    assert eu["clauses"][0]["id"] == "GDPR:Article 5"
    assert ix.retrieve(["anything"], "US")["clauses"] == []


def test_index_persists_and_reloads(tmp_path):
    ix = _index(tmp_path)
    fresh = PolicyIndex(ix.corpus_dir, ix.index_dir)
    assert fresh.load() and fresh.stats()["chunks"] == ix.stats()["chunks"]


def test_policy_endpoints(tmp_path, monkeypatch):
    from policy_service import main

    monkeypatch.setattr(main, "index", _index(tmp_path))
    client = TestClient(main.app)
    stats = client.get("/policies/stats").json()
    assert stats["by_jurisdiction"] == {"IN": 3, "EU": 2}
    res = client.post("/policies/retrieve", json={"queries": ["record keeping of transactions"], "jurisdiction": "IN", "k": 2})
    assert res.status_code == 200 and res.json()["clauses"][0]["id"] == "RBI_KYC:Section 46"


class HashEmbedding:
    """Deterministic bag-of-words embedding so tests exercise Chroma without downloading a model."""

    DIM = 64

    def __call__(self, input):
        import hashlib

        vectors = []
        for text in input:
            v = [0.0] * self.DIM
            for tok in re.findall(r"[a-z]+", text.lower()):
                v[int(hashlib.md5(tok.encode()).hexdigest(), 16) % self.DIM] += 1.0
            vectors.append(v)
        return vectors

    @staticmethod
    def name():
        return "test-hash"

    def embed_query(self, input):
        return self(input)

    def is_legacy(self):
        return True


def test_chroma_hybrid_retrieval_and_persistence(tmp_path):
    corpus = tmp_path / "corpus"
    (corpus / "IN").mkdir(parents=True)
    (corpus / "EU").mkdir()
    (corpus / "IN" / "kyc.txt").write_text(KYC_DOC, encoding="utf-8")
    (corpus / "EU" / "gdpr.txt").write_text(GDPR_DOC, encoding="utf-8")
    ix = PolicyIndex(corpus, tmp_path / "index", embedding_function=HashEmbedding(), embed_name="test-hash")
    stats = ix.build(embed=True)
    assert stats["retrieval"] == "hybrid" and stats["vector_store"] == "chromadb"

    res = ix.retrieve(["verify proof of address of customer"], "IN", k=3)
    assert res["retrieval"] == "hybrid"
    assert res["clauses"][0]["id"] == "RBI_KYC:Section 16"
    assert all(c["jurisdiction"] in ("IN", "GLOBAL") for c in res["clauses"])  # metadata filter holds for dense hits too

    reopened = PolicyIndex(corpus, tmp_path / "index", embedding_function=HashEmbedding(), embed_name="test-hash")
    assert reopened.load() and reopened.stats()["retrieval"] == "hybrid"
    assert reopened.retrieve(["personal data accurate"], "EU", k=1)["clauses"][0]["id"] == "GDPR:Article 5"
