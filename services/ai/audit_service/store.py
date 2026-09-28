"""
Append-only, hash-chained audit log (JSON Lines).

Each entry stores the SHA-256 of the previous entry, so editing or deleting any
past line breaks every hash after it and `verify()` reports the first bad line.
Entries hold identifiers, fingerprints, scores and model ids — never data values.
"""

import hashlib
import json
import os
import threading
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

GENESIS = "0" * 64


def _hash(entry: Dict[str, Any]) -> str:
    body = {k: v for k, v in entry.items() if k != "entry_hash"}
    return hashlib.sha256(json.dumps(body, sort_keys=True, separators=(",", ":"), default=str).encode()).hexdigest()


class AuditLog:
    def __init__(self, path: str):
        self.path = path
        self._lock = threading.Lock()
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)

    def _entries(self) -> List[Dict[str, Any]]:
        if not os.path.exists(self.path):
            return []
        with open(self.path, encoding="utf-8") as f:
            return [json.loads(line) for line in f if line.strip()]

    def _last_hash(self) -> str:
        last = None
        if os.path.exists(self.path):
            with open(self.path, encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        last = line
        return json.loads(last)["entry_hash"] if last else GENESIS

    def append(self, event: str, data: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            entry = {
                "audit_id": str(uuid.uuid4()),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "event": event,
                "data": data,
                "prev_hash": self._last_hash(),
            }
            entry["entry_hash"] = _hash(entry)
            with open(self.path, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, sort_keys=True, default=str) + "\n")
            return entry

    def list(self, limit: int = 50, dataset_id: Optional[str] = None) -> List[Dict[str, Any]]:
        entries = self._entries()
        if dataset_id:
            entries = [e for e in entries if e.get("data", {}).get("dataset_id") == dataset_id]
        return entries[-limit:][::-1]

    def verify(self) -> Dict[str, Any]:
        prev = GENESIS
        entries = self._entries()
        for i, e in enumerate(entries):
            if e.get("prev_hash") != prev or _hash(e) != e.get("entry_hash"):
                return {"valid": False, "entries": len(entries), "first_invalid_line": i + 1}
            prev = e["entry_hash"]
        return {"valid": True, "entries": len(entries), "head": prev}
