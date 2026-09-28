"""
Seeded synthetic payments benchmark with an independent ground-truth oracle.

The generator injects known defects; the oracle then recomputes, from the final
rows, the true violation ratio for every (dimension, column) pair under the
benchmark's declared data contract. Clean columns and non-injected dimensions
are true negatives, so a scorer that flags everything is penalized.
"""

import csv
import io
import random
import re
import string
from datetime import datetime, timedelta
from typing import Dict, List, Tuple

COLUMNS = [
    "transaction_id", "customer_id", "amount", "currency", "txn_timestamp", "merchant_name",
    "payment_method", "status", "pan_number", "email", "kyc_address",
]
CURRENCIES = ["INR", "USD", "EUR", "GBP"]
MERCHANTS = ["Amazon India", "Flipkart", "Swiggy", "Zomato", "PhonePe", "Paytm", "BigBasket", "Myntra",
             "BookMyShow", "MakeMyTrip", "Reliance Digital", "Croma", "DMart", "Uber India", "Ola"]
FRESHNESS_DAYS = 365
MAX_CLEAN_AGE_DAYS = 330  # clean rows stay well inside the window even if scored weeks later

# Profiles: rates per defect type. Single-defect profiles isolate one dimension each.
PROFILES: Dict[str, Dict[str, float]] = {
    "clean":      {"missing": 0, "duplicates": 0, "invalid": 0, "format": 0, "temporal": 0},
    "only_missing":    {"missing": 0.10, "duplicates": 0, "invalid": 0, "format": 0, "temporal": 0},
    "only_duplicates": {"missing": 0, "duplicates": 0.10, "invalid": 0, "format": 0, "temporal": 0},
    "only_invalid":    {"missing": 0, "duplicates": 0, "invalid": 0.10, "format": 0, "temporal": 0},
    "only_format":     {"missing": 0, "duplicates": 0, "invalid": 0, "format": 0.10, "temporal": 0},
    "only_temporal":   {"missing": 0, "duplicates": 0, "invalid": 0, "format": 0, "temporal": 0.10},
    "low":    {"missing": 0.05, "duplicates": 0.02, "invalid": 0.03, "format": 0.05, "temporal": 0.03},
    "medium": {"missing": 0.15, "duplicates": 0.10, "invalid": 0.08, "format": 0.12, "temporal": 0.10},
    "high":   {"missing": 0.30, "duplicates": 0.25, "invalid": 0.15, "format": 0.20, "temporal": 0.20},
}

# Declared contract: which columns each dimension applies to.
CONTRACT_SCOPE = {
    "Completeness": COLUMNS,
    "Validity": ["amount", "currency", "txn_timestamp", "pan_number", "email"],
    "Consistency": ["transaction_id", "customer_id", "currency", "merchant_name", "payment_method", "status", "pan_number"],
    "Timeliness": ["txn_timestamp"],
    "Accuracy": ["amount"],
    "Integrity": ["transaction_id", "currency"],
}
ISO = set(CURRENCIES) | {"JPY", "AUD", "CAD", "CHF", "CNY", "SGD", "AED"}
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")


def _clean_row(rng: random.Random, i: int, now: datetime) -> dict:
    merchant = rng.choice(MERCHANTS)
    ts = now - timedelta(days=rng.randint(0, MAX_CLEAN_AGE_DAYS), seconds=rng.randint(0, 86399))
    return {
        "transaction_id": f"TXN{i:06d}",
        "customer_id": f"CUST{rng.randint(1000, 9999)}",
        "amount": f"{rng.uniform(10.0, 50000.0):.2f}",
        "currency": rng.choice(CURRENCIES),
        "txn_timestamp": ts.strftime("%Y-%m-%d %H:%M:%S"),
        "merchant_name": merchant,
        "payment_method": rng.choice(["UPI", "Credit Card", "Debit Card", "Net Banking"]),
        "status": rng.choice(["SUCCESS", "SUCCESS", "SUCCESS", "FAILED", "PENDING"]),
        "pan_number": "".join(rng.choices(string.ascii_uppercase, k=5)) + "".join(rng.choices(string.digits, k=4)) + rng.choice(string.ascii_uppercase),
        "email": f"{merchant.lower().replace(' ', '.')}{rng.randint(1, 99)}@{rng.choice(['gmail.com', 'yahoo.com', 'outlook.com', 'company.co.in'])}",
        "kyc_address": f"{rng.randint(1, 999)}, {rng.choice(['MG Road', 'Brigade Road', 'Park Street', 'Connaught Place', 'Bandra'])}, {rng.choice(['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Kolkata'])}",
    }


def generate(profile: str, seed: int, rows: int = 1000, now: datetime | None = None) -> List[dict]:
    rates = PROFILES[profile]
    rng = random.Random(seed)
    now = now or datetime.now()
    data = [_clean_row(rng, i, now) for i in range(rows)]

    for row in data:
        for col in ("customer_id", "amount", "kyc_address", "email"):
            if rng.random() < rates["missing"]:
                row[col] = ""
    for row in data:
        if row["amount"] and rng.random() < rates["invalid"]:
            row["amount"] = f"{-abs(float(row['amount'])):.2f}"
    for row in data:
        if rng.random() < rates["format"]:
            row["currency"] = row["currency"].lower()
        if rng.random() < rates["format"]:
            row["pan_number"] = row["pan_number"][:3]
    for row in data:
        r = rng.random()
        if r < rates["temporal"] / 2:
            row["txn_timestamp"] = (now + timedelta(days=rng.randint(30, 365))).strftime("%Y-%m-%d %H:%M:%S")
        elif r < rates["temporal"]:
            row["txn_timestamp"] = (now - timedelta(days=rng.randint(1100, 2000))).strftime("%Y-%m-%d %H:%M:%S")
    dupes = [dict(rng.choice(data)) for _ in range(int(rows * rates["duplicates"]))]
    return data + dupes


def to_csv(rows: List[dict]) -> bytes:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=COLUMNS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue().encode()


# --- oracle -----------------------------------------------------------------

def _is_number(v: str) -> bool:
    try:
        float(v)
        return True
    except ValueError:
        return False


def _parse(v: str):
    try:
        return datetime.strptime(v, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None


VALIDATORS = {
    "amount": lambda v: _is_number(v) and float(v) >= 0,
    "currency": lambda v: v.strip().upper() in ISO,
    "txn_timestamp": lambda v: _parse(v) is not None,
    "pan_number": lambda v: bool(PAN_RE.match(v.strip())),
    "email": lambda v: bool(EMAIL_RE.match(v.strip())),
}
CANONICAL = {  # the representation each consistency-scoped column is supposed to use
    "currency": lambda v: v == v.upper(),
    "pan_number": lambda v: len(v) == 10,
}


def oracle(rows: List[dict], now: datetime | None = None) -> Dict[Tuple[str, str], Tuple[int, int]]:
    """
    True (violations, checked) for every (dimension, column) in the contract, plus Uniqueness.
    """
    now = now or datetime.now()
    n = len(rows)
    truth: Dict[Tuple[str, str], Tuple[int, int]] = {}
    for col in CONTRACT_SCOPE["Completeness"]:
        truth[("Completeness", col)] = (sum(1 for r in rows if not r[col].strip()), n)
    for col in CONTRACT_SCOPE["Validity"]:
        present = [r[col] for r in rows if r[col].strip()]
        truth[("Validity", col)] = (sum(1 for v in present if not VALIDATORS[col](v)), len(present))
    for col in CONTRACT_SCOPE["Consistency"]:
        present = [r[col] for r in rows if r[col].strip()]
        check = CANONICAL.get(col, lambda v: True)
        truth[("Consistency", col)] = (sum(1 for v in present if not check(v)), len(present))
    stamps = [d for d in (_parse(r["txn_timestamp"]) for r in rows) if d]
    bad = sum(1 for d in stamps if d > now + timedelta(days=1) or (now - d).days > FRESHNESS_DAYS)
    truth[("Timeliness", "txn_timestamp")] = (bad, len(stamps))
    truth[("Accuracy", "amount")] = (0, sum(1 for r in rows if r["amount"].strip()))
    truth[("Integrity", "transaction_id")] = (0, n)
    truth[("Integrity", "currency")] = (0, sum(1 for r in rows if r["amount"].strip()))
    distinct = len({tuple(r[c] for c in COLUMNS) for r in rows})
    truth[("Uniqueness", "(all columns)")] = (n - distinct, n)
    return truth


def oracle_dimension_scores(truth: Dict[Tuple[str, str], Tuple[int, int]]) -> Dict[str, float]:
    scores: Dict[str, float] = {}
    for dim in {d for d, _ in truth}:
        items = [v for (d, _), v in truth.items() if d == dim]
        if dim == "Uniqueness":
            scores[dim] = 1 - max(v / c for v, c in items if c)
        else:
            checked = sum(c for _, c in items)
            scores[dim] = 1 - sum(v for v, _ in items) / checked if checked else 1.0
    return scores
