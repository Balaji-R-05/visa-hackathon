"""
PII firewall applied to every payload before it reaches an LLM.

The data-plane already strips raw values, so under normal operation this finds
nothing; it exists as defense in depth (a new connector or a user-supplied
dataset name could still smuggle an email or card number into a prompt) and
its report makes the "no raw values reach the model" claim checkable.
"""

import re
from typing import Any, Dict, Tuple

_LUHN_CANDIDATE = re.compile(r"(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)")

PATTERNS = {
    "email": re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"),
    "tax_id_pan": re.compile(r"\b(?!AAAAA9999A\b)[A-Z]{5}[0-9]{4}[A-Z]\b"),  # the format mask itself is not a PAN
    "aadhaar": re.compile(r"(?<!\d)\d{4}[ -]?\d{4}[ -]?\d{4}(?!\d)"),
    "phone": re.compile(r"(?<![\w.])\+\d[\d -]{8,14}\d(?!\d)"),
    "url_secret": re.compile(r"(?i)([?&](?:key|token|apikey|api_key|secret|password|sig|signature)=)[^&\s]+"),
}


def _luhn(digits: str) -> bool:
    total, double = 0, False
    for ch in reversed(digits):
        d = ord(ch) - 48
        if double:
            d = d * 2 - 9 if d > 4 else d * 2
        total += d
        double = not double
    return total % 10 == 0


# Format masks from the profiler ("aaaa99@aaaaa.aaa", "AAAAA9999A") carry no content.
MASK_RE = re.compile(r"^[Aa9\W_]*(?:…\(\d+\))?$")


def redact_text(text: str, counts: Dict[str, int]) -> str:
    if MASK_RE.match(text):
        return text
    def card(match: re.Match) -> str:
        digits = re.sub(r"\D", "", match.group(0))
        if 13 <= len(digits) <= 19 and _luhn(digits):
            counts["card_pan"] = counts.get("card_pan", 0) + 1
            return "[REDACTED:card_pan]"
        return match.group(0)

    text = _LUHN_CANDIDATE.sub(card, text)
    for kind, pattern in PATTERNS.items():
        if kind == "url_secret":
            text, n = pattern.subn(lambda m: m.group(1) + "[REDACTED]", text)
        else:
            text, n = pattern.subn(f"[REDACTED:{kind}]", text)
        if n:
            counts[kind] = counts.get(kind, 0) + n
    return text


def redact(payload: Any) -> Tuple[Any, Dict[str, int]]:
    """
    Returns a redacted deep copy of `payload` and counts of what was removed.
    """
    counts: Dict[str, int] = {}

    def walk(node: Any) -> Any:
        if isinstance(node, str):
            return redact_text(node, counts)
        if isinstance(node, dict):
            return {walk(k) if isinstance(k, str) else k: walk(v) for k, v in node.items()}
        if isinstance(node, list):
            return [walk(v) for v in node]
        return node
    return walk(payload), counts
