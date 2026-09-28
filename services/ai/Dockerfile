# One image for all Python services; SERVICE selects the entrypoint:
# rule_service | scoring_service | insight_service | audit_service | policy_service
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SERVICE=scoring_service \
    PORT=8000

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Writable state lives in volumes; create the mount points owned by the app user
# so named volumes inherit that ownership.
RUN useradd -m appuser && mkdir -p /app/audit /app/policy_index && chown -R appuser /app/audit /app/policy_index
USER appuser

# Bake Chroma's local ONNX embedding model into the image so containers never download at runtime.
RUN python -c "from chromadb.utils.embedding_functions import DefaultEmbeddingFunction as E; E()(['warm up'])"

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD curl -fs http://localhost:${PORT}/health || exit 1
CMD ["sh", "-c", "uvicorn ${SERVICE}.main:app --host 0.0.0.0 --port ${PORT}"]
