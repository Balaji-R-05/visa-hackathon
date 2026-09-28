"""
Hybrid clause retrieval: BM25 (always available) fused with dense retrieval
from a persistent ChromaDB collection by reciprocal rank fusion. Retrieval is
restricted to the requested jurisdiction plus GLOBAL.

Embeddings are computed locally: Chroma's bundled ONNX all-MiniLM-L6-v2 by
default, or an Ollama embedding model (POLICY_EMBEDDINGS=ollama). Chroma
telemetry is disabled, so the retrieval layer makes no outbound calls.
"""

import json
import math
import re
from collections import Counter
from pathlib import Path
from typing import Dict, List, Optional

from common import config
from common.logger import logger
from policy_service.corpus import Chunk, load_corpus

TOKEN_RE = re.compile(r"[a-z0-9]+")
STOPWORDS = set("the a an and or of to in for on by with be is are shall may must any as at from that this which such its it not".split())
RRF_K = 60
COLLECTION = "regulations"
ADD_BATCH = 256


def tokenize(text: str) -> List[str]:
    return [t for t in TOKEN_RE.findall(text.lower()) if t not in STOPWORDS and len(t) > 1]


class BM25:
    def __init__(self, docs: List[List[str]], k1: float = 1.5, b: float = 0.75):
        self.k1, self.b = k1, b
        self.tf = [Counter(d) for d in docs]
        self.len = [len(d) for d in docs]
        self.avg = (sum(self.len) / len(docs)) if docs else 0
        df = Counter(t for d in docs for t in set(d))
        n = len(docs)
        self.idf = {t: math.log(1 + (n - c + 0.5) / (c + 0.5)) for t, c in df.items()}

    def scores(self, query: List[str]) -> List[float]:
        out = []
        for tf, dl in zip(self.tf, self.len):
            s = 0.0
            for t in query:
                if t in tf:
                    f = tf[t]
                    s += self.idf[t] * f * (self.k1 + 1) / (f + self.k1 * (1 - self.b + self.b * dl / (self.avg or 1)))
            out.append(s)
        return out


def default_embedding_function():
    from chromadb.utils import embedding_functions as ef

    if config.POLICY_EMBEDDINGS == "ollama":
        return ef.OllamaEmbeddingFunction(url=config.OLLAMA_BASE_URL, model_name=config.OLLAMA_EMBED_MODEL)
    return ef.DefaultEmbeddingFunction()


def embedding_name() -> str:
    if config.POLICY_EMBEDDINGS == "ollama":
        return f"ollama/{config.OLLAMA_EMBED_MODEL}"
    return "chroma/all-MiniLM-L6-v2 (onnx)"


class PolicyIndex:
    def __init__(self, corpus_dir: Path, index_dir: Path, embedding_function=None, embed_name: Optional[str] = None):
        self.corpus_dir, self.index_dir = corpus_dir, index_dir
        self.chunks: List[Chunk] = []
        self.bm25: Optional[BM25] = None
        self.collection = None
        self.embed_model: Optional[str] = None
        self._ef = embedding_function
        self._embed_name = embed_name

    # --- chroma ---
    def _client(self):
        import chromadb
        from chromadb.config import Settings

        return chromadb.PersistentClient(path=str(self.index_dir / "chroma"), settings=Settings(anonymized_telemetry=False))

    def _embedding_function(self):
        return self._ef if self._ef is not None else default_embedding_function()

    # --- build / load ---
    def build(self, embed: bool = True) -> Dict:
        self.chunks = load_corpus(self.corpus_dir)
        self.bm25 = BM25([tokenize(f"{c.title} {c.label} {c.text}") for c in self.chunks])
        self.collection, self.embed_model = None, None
        self.index_dir.mkdir(parents=True, exist_ok=True)
        if embed and self.chunks:
            try:
                client = self._client()
                try:
                    client.delete_collection(COLLECTION)
                except Exception:
                    pass  # first build
                collection = client.create_collection(
                    COLLECTION, embedding_function=self._embedding_function(), metadata={"hnsw:space": "cosine"}
                )
                for start in range(0, len(self.chunks), ADD_BATCH):
                    batch = self.chunks[start:start + ADD_BATCH]
                    collection.add(
                        ids=[c.id for c in batch],
                        documents=[f"{c.title}. {c.label}. {c.text}" for c in batch],
                        metadatas=[{"jurisdiction": c.jurisdiction, "code": c.code, "label": c.label, "authority": c.authority} for c in batch],
                    )
                self.collection = collection
                self.embed_model = self._embed_name or embedding_name()
            except Exception as exc:
                logger.warning(f"Dense index unavailable ({exc}); retrieval is lexical-only")
        (self.index_dir / "chunks.json").write_text(
            json.dumps({"embed_model": self.embed_model, "chunks": [c.to_dict() for c in self.chunks]}), encoding="utf-8"
        )
        return self.stats()

    def load(self) -> bool:
        path = self.index_dir / "chunks.json"
        if not path.exists():
            return False
        data = json.loads(path.read_text(encoding="utf-8"))
        self.chunks = [Chunk(**c) for c in data["chunks"]]
        self.bm25 = BM25([tokenize(f"{c.title} {c.label} {c.text}") for c in self.chunks])
        self.embed_model = data.get("embed_model")
        self.collection = None
        if self.embed_model:
            try:
                collection = self._client().get_collection(COLLECTION, embedding_function=self._embedding_function())
                if collection.count() == len(self.chunks):
                    self.collection = collection
                else:
                    logger.warning("Chroma collection is out of date with chunks.json; reindex to restore dense retrieval")
            except Exception as exc:
                logger.warning(f"Could not open Chroma collection ({exc}); retrieval is lexical-only")
        if self.collection is None:
            self.embed_model = None
        return True

    def ensure(self):
        if self.bm25 is None and not self.load():
            self.build(embed=True)

    def stats(self) -> Dict:
        by_j: Dict[str, int] = Counter(c.jurisdiction for c in self.chunks)
        docs = sorted({(c.jurisdiction, c.code, c.title, c.authority) for c in self.chunks})
        return {
            "chunks": len(self.chunks),
            "by_jurisdiction": dict(by_j),
            "documents": [{"jurisdiction": j, "code": code, "title": t, "authority": a} for j, code, t, a in docs],
            "retrieval": "hybrid" if self.collection is not None else "lexical",
            "vector_store": "chromadb" if self.collection is not None else None,
            "embed_model": self.embed_model,
        }

    # --- retrieval ---
    def retrieve(self, queries: List[str], jurisdiction: str, k: int = 8) -> Dict:
        self.ensure()
        allowed = sorted({jurisdiction.upper(), "GLOBAL"})
        candidates = [i for i, c in enumerate(self.chunks) if c.jurisdiction in allowed]
        if not candidates:
            return {"clauses": [], "retrieval": "none"}

        fused: Dict[int, float] = Counter()
        position = {c.id: i for i, c in enumerate(self.chunks)}
        for q in queries:
            bm = self.bm25.scores(tokenize(q))
            ranked = sorted((i for i in candidates if bm[i] > 0), key=lambda i: -bm[i])
            for rank, i in enumerate(ranked[: k * 3]):
                fused[i] += 1 / (RRF_K + rank + 1)

        mode = "lexical"
        if self.collection is not None:
            try:
                res = self.collection.query(
                    query_texts=queries,
                    n_results=min(k * 3, len(candidates)),
                    where={"jurisdiction": {"$in": allowed}},
                )
                for ids in res["ids"]:
                    for rank, cid in enumerate(ids):
                        if cid in position:
                            fused[position[cid]] += 1 / (RRF_K + rank + 1)
                mode = "hybrid"
            except Exception as exc:
                logger.warning(f"Dense retrieval failed ({exc}); lexical results only")

        top = sorted(fused.items(), key=lambda x: -x[1])[:k]
        return {
            "clauses": [{**self.chunks[i].to_dict(), "score": round(s, 5)} for i, s in top],
            "retrieval": mode,
        }
