"""
Configuration shared by the Python services, read from the environment (and a
local .env when present). Nothing here is required: with no LLM configured the
services still run, and LLM-dependent steps fall back to deterministic output.
"""

import logging
import os
from dotenv import dotenv_values, load_dotenv

# Real environment variables win over .env (so compose files and per-run
# experiment settings behave as expected); tests skip .env entirely.
if not os.getenv("DQS_SKIP_DOTENV"):
    _file = dotenv_values()
    load_dotenv(override=False)
    if _file.get("GROQ_API_KEY") and os.environ.get("GROQ_API_KEY") != _file["GROQ_API_KEY"]:
        logging.getLogger("assay").warning(
            "GROQ_API_KEY from the process environment overrides the value in .env; "
            "remove the environment variable if that key is stale."
        )

PORT: int = int(os.getenv("PORT", 8000))

# ollama (default, local — no data leaves the machine) | groq (hosted) | none
LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "ollama").strip().lower()
LLM_TEMPERATURE: float = float(os.getenv("LLM_TEMPERATURE", "0"))
LLM_TIMEOUT_S: float = float(os.getenv("LLM_TIMEOUT_S", "600"))
LLM_MAX_TOKENS: int = int(os.getenv("LLM_MAX_TOKENS", "8192"))
# Reasoning models (gpt-oss) spend output budget on hidden reasoning; "low" keeps
# structured answers inside hosted per-minute token quotas.
LLM_REASONING_EFFORT: str = os.getenv("LLM_REASONING_EFFORT", "low")
# Provider-side strict schema decoding (Groq). Off by default: with gpt-oss it can
# reject the model's own output (json_validate_failed); Pydantic validates either way.
LLM_STRICT_SCHEMA: bool = os.getenv("LLM_STRICT_SCHEMA", "false").lower() == "true"
LLM_OUTPUT_RETRIES: int = int(os.getenv("LLM_OUTPUT_RETRIES", "1"))

OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "qwen2.5:7b-instruct")
OLLAMA_EMBED_MODEL: str = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")

GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL: str = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

CORS_ORIGINS: list[str] = [o for o in os.getenv("CORS_ORIGINS", "").split(",") if o]

# Shared secret for service-to-service calls; when set, every non-health request
# must carry it in the X-Internal-Token header.
INTERNAL_SERVICE_TOKEN: str = os.getenv("INTERNAL_SERVICE_TOKEN", "")

AUDIT_LOG_PATH: str = os.getenv("AUDIT_LOG_PATH", "audit/audit_log.jsonl")

# Regulation corpus for the policy-service, and where rule-service finds it.
POLICY_CORPUS_DIR: str = os.getenv("POLICY_CORPUS_DIR", "policy_corpus")
POLICY_INDEX_DIR: str = os.getenv("POLICY_INDEX_DIR", "policy_index")
POLICY_SERVICE_URL: str = os.getenv("POLICY_SERVICE_URL", "http://localhost:8005")
# Dense embeddings for the Chroma regulation index: "onnx" (Chroma's local
# all-MiniLM-L6-v2, default) or "ollama" (OLLAMA_EMBED_MODEL).
POLICY_EMBEDDINGS: str = os.getenv("POLICY_EMBEDDINGS", "onnx").strip().lower()
