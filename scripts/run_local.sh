#!/usr/bin/env bash
# Starts every service locally without Docker (Git Bash / Linux / macOS).
#   scripts/run_local.sh            # logs in ./.local-logs
# Prerequisites: services/ai/venv with requirements installed; npm install in
# services/gateway and services/data-plane. LLM settings come from services/ai/.env.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="$ROOT/.local-logs"
mkdir -p "$LOGS"

PY="$ROOT/services/ai/venv/bin/python"
[ -x "$PY" ] || PY="$ROOT/services/ai/venv/Scripts/python"

export POLICY_SERVICE_URL=http://127.0.0.1:8005
export RULE_SERVICE_URL=http://127.0.0.1:8001
export SCORING_SERVICE_URL=http://127.0.0.1:8002
export INSIGHT_SERVICE_URL=http://127.0.0.1:8003
export AUDIT_SERVICE_URL=http://127.0.0.1:8004
export DATA_PLANE_URL=http://127.0.0.1:7000

cd "$ROOT/services/ai"
for svc in rule_service:8001 scoring_service:8002 insight_service:8003 audit_service:8004 policy_service:8005; do
  name=${svc%%:*}; port=${svc##*:}
  nohup "$PY" -m uvicorn "$name.main:app" --host 127.0.0.1 --port "$port" > "$LOGS/$name.log" 2>&1 &
done

cd "$ROOT/services/data-plane" && PORT=7000 nohup node index.js > "$LOGS/data-plane.log" 2>&1 &
cd "$ROOT/services/gateway" && PORT=5000 nohup node index.js > "$LOGS/gateway.log" 2>&1 &

echo "Starting... check http://127.0.0.1:5000/api/health/services (logs in $LOGS)"
