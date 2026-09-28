# Assay Python services

One code base and one Docker image for five FastAPI services; `SERVICE` selects which
one runs (`uvicorn ${SERVICE}.main:app`).

| Package | Port (local) | Role | Uses an LLM |
|---|---|---|---|
| `rule_service` | 8001 | Derive DSL rules from column profiles and retrieved regulation clauses; validate proposals and citations | yes |
| `scoring_service` | 8002 | Deterministic DQS: dimension applicability, weights, pooled scores, findings, improvement pathway | never |
| `insight_service` | 8003 | Explanations and recommendations with numeric grounding checks; chat; Markdown export; LLM-as-scorer ablation | yes |
| `audit_service` | 8004 | Append-only, hash-chained audit log with verification | no |
| `policy_service` | 8005 | Clause-aware regulation corpus and hybrid retrieval (BM25 + Ollama embeddings) | embeddings only |

`common/` holds configuration, the LLM provider abstraction (`groq`, `ollama` or `none`), the PII redactor,
the shared app factory (health, CORS, internal-token authentication) and the Pydantic contracts shared with
the data-plane.

## Development

```bash
python -m venv venv && venv/Scripts/pip install -r requirements.txt    # venv/bin on Linux/macOS
cp .env.example .env                                                    # choose LLM_PROVIDER and add keys
venv/Scripts/python -m pytest -q
venv/Scripts/python -m uvicorn scoring_service.main:app --port 8002
```

Real environment variables take precedence over `.env`. If an old `GROQ_API_KEY` is set in your shell
environment, the services log a warning at startup; remove the stale variable.

The regulation corpus lives in `policy_corpus/`; see its README for the documents to add.
