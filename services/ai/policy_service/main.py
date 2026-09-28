"""
policy-service: retrieval over jurisdiction-specific regulation documents
(RBI, GDPR, AML/FATF, PCI DSS, ...) so derived rules can cite the clause they
enforce. Runs fully locally (BM25 + optional Ollama embeddings).
"""

from pathlib import Path
from typing import List

from pydantic import BaseModel, Field

from common import config
from common.health import create_app
from policy_service.index import PolicyIndex

app = create_app("policy-service", "1.0.0", "Jurisdiction-aware regulation retrieval for rule derivation.")
index = PolicyIndex(Path(config.POLICY_CORPUS_DIR), Path(config.POLICY_INDEX_DIR))


class RetrieveRequest(BaseModel):
    queries: List[str] = Field(min_length=1, max_length=20)
    jurisdiction: str = "GLOBAL"
    k: int = Field(default=8, ge=1, le=30)


@app.post("/policies/retrieve")
async def retrieve(req: RetrieveRequest):
    return index.retrieve(req.queries, req.jurisdiction, req.k)


@app.post("/policies/reindex")
async def reindex(embed: bool = True):
    return index.build(embed=embed)


@app.get("/policies/stats")
async def stats():
    index.ensure()
    return index.stats()
