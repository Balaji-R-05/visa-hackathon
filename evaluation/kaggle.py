"""
Real-data track on public Kaggle financial datasets.

    python -m evaluation.kaggle fetch            # needs the Kaggle CLI and ~/.kaggle/kaggle.json
    python -m evaluation.kaggle run --modes builtin,hybrid --rows 5000

Real data has no ground truth, so each dataset is evaluated two ways:
1. As-is audit: scores, rules proposed/accepted/rejected, citations, sensitive-data
   flags and latency on the unmodified sample.
2. Semi-synthetic recovery: one known defect type at a time is injected into the
   same sample (seeded), and recovery = extra violations the system reports /
   defects injected, per (dimension, column). The LLM rule set derived on the
   unmodified sample is supplied unchanged to every injected run, so recovery
   differences come from the data, not from run-to-run LLM variation.

The injector picks columns with its own simple heuristics, independent of the
engine's semantic typing, so the engine is not graded against its own view of
the schema. Data is processed locally; only the Kaggle download touches the network.
"""

import argparse
import csv
import io
import json
import random
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Tuple

from evaluation import client

# Datasets are stored in the repository's top-level data/ folder (gitignored; not redistributed).
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
RESULTS = Path(__file__).parent / "results"

# Verify each slug and its licence on kaggle.com before publishing results; cite each dataset in the paper.
MANIFEST = [
    {"name": "card_fraud_simulated", "slug": "kartik2112/fraud-detection", "file": "fraudTest.csv", "jurisdiction": "US",
     "why": "card numbers, names, DOB, addresses, US ZIP codes: PCI/PII detection and US rule pack"},
    {"name": "bank_transactions", "slug": "valakhorasani/bank-transaction-dataset-for-fraud-detection", "file": "*.csv", "jurisdiction": "GLOBAL",
     "why": "IDs, amounts, two timestamps, device/IP fields: timeliness and cross-date rules"},
    {"name": "paysim", "slug": "ealaxi/paysim1", "file": "*.csv", "jurisdiction": "GLOBAL",
     "why": "balances before/after each transfer: LLM-derived cross-column rules"},
    {"name": "creditcard_pca", "slug": "mlg-ulb/creditcardfraud", "file": "creditcard.csv", "jurisdiction": "EU",
     "why": "anonymised numeric features: few rules apply, tests dimension applicability"},
    {"name": "aml_transactions", "slug": "ealtman2019/ibm-transactions-for-anti-money-laundering-aml", "file": "HI-Small_Trans.csv", "jurisdiction": "US",
     "why": "account-to-account transfers with currencies and payment formats: AML framing"},
]

INJECT_RATE = 0.05
DATE_FORMATS = ["%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y %H:%M", "%m/%d/%Y %H:%M", "%Y/%m/%d %H:%M"]
AMOUNT_NAME = re.compile(r"(amount|amt|price|value|balance|fee|total)", re.I)


def fetch(names=None):
    """Downloads via the Kaggle API; needs ~/.kaggle/kaggle.json or KAGGLE_USERNAME/KAGGLE_KEY."""
    from kaggle.api.kaggle_api_extended import KaggleApi

    api = KaggleApi()
    api.authenticate()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for d in MANIFEST:
        if names and d["name"] not in names:
            continue
        target = DATA_DIR / d["name"]
        if any(target.glob("*.csv")):
            print(f"[skip] {d['name']} already downloaded")
            continue
        target.mkdir(parents=True, exist_ok=True)
        print(f"[get ] {d['slug']} -> {target}")
        if "*" in d["file"]:
            api.dataset_download_files(d["slug"], path=str(target), unzip=True, quiet=False)
        else:
            api.dataset_download_file(d["slug"], d["file"], path=str(target), quiet=False)
            for z in target.glob("*.zip"):
                import zipfile

                with zipfile.ZipFile(z) as zf:
                    zf.extractall(target)
                z.unlink()


def sample_rows(path: Path, n: int, seed: int) -> Tuple[List[str], List[dict]]:
    """Reservoir sample of n rows (seeded) so large files never load fully."""
    rng = random.Random(seed)
    reservoir: List[dict] = []
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            if i < n:
                reservoir.append(row)
            else:
                j = rng.randint(0, i)
                if j < n:
                    reservoir[j] = row
        return list(reader.fieldnames or []), reservoir


def to_csv(columns: List[str], rows: List[dict]) -> bytes:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=columns, lineterminator="\n", extrasaction="ignore")
    w.writeheader()
    w.writerows(rows)
    return buf.getvalue().encode()


# --- injection (engine-independent heuristics) -------------------------------

def _values(rows, col):
    return [r[col] for r in rows if r.get(col, "").strip()]


def _parse_date(v: str):
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(v.strip(), fmt), fmt
        except ValueError:
            continue
    return None, None


def _is_num(v: str) -> bool:
    try:
        float(v)
        return True
    except ValueError:
        return False


def candidates(columns: List[str], rows: List[dict]) -> Dict[str, List[str]]:
    c: Dict[str, List[str]] = {"missing": [], "case": [], "truncate": [], "negative": [], "future": []}
    for col in columns:
        vals = _values(rows, col)
        if len(vals) < 0.5 * len(rows):
            continue
        c["missing"].append(col)
        distinct = set(vals)
        alpha = [v for v in vals if re.fullmatch(r"[A-Za-z][A-Za-z _-]*", v)]
        if 2 <= len(distinct) <= 50 and len(alpha) == len(vals) and all(v == v.upper() or v == v.lower() for v in distinct):
            c["case"].append(col)
        lengths = [len(v) for v in vals]
        top = max(set(lengths), key=lengths.count)
        if len(distinct) > 50 and lengths.count(top) / len(vals) >= 0.9 and top >= 6 and not all(_is_num(v) for v in vals):
            c["truncate"].append(col)
        if AMOUNT_NAME.search(col) and all(_is_num(v) for v in vals) and min(float(v) for v in vals) >= 0:
            c["negative"].append(col)
        parsed = [_parse_date(v)[0] for v in vals[:200]]
        if sum(p is not None for p in parsed) >= 0.95 * len(parsed):
            c["future"].append(col)
    return c


def inject(columns, rows, defect: str, seed: int) -> Tuple[List[dict], List[dict]]:
    """Returns (new rows, injections) where each injection is {dimension, column, count}."""
    rng = random.Random(seed)
    rows = [dict(r) for r in rows]
    cand = candidates(columns, rows)
    injections = []

    def pick_rows(col):
        idx = [i for i, r in enumerate(rows) if r.get(col, "").strip()]
        return rng.sample(idx, max(1, int(INJECT_RATE * len(idx)))) if idx else []

    if defect == "duplicates":
        k = int(INJECT_RATE * len(rows))
        rows += [dict(rng.choice(rows)) for _ in range(k)]
        injections.append({"dimension": "Uniqueness", "column": "(all columns)", "count": k})
    elif defect == "missing" and cand["missing"]:
        for col in rng.sample(cand["missing"], min(2, len(cand["missing"]))):
            chosen = pick_rows(col)
            for i in chosen:
                rows[i][col] = ""
            injections.append({"dimension": "Completeness", "column": col, "count": len(chosen)})
    elif defect == "case" and cand["case"]:
        col = rng.choice(cand["case"])
        dominant_upper = sum(v == v.upper() for v in _values(rows, col)) >= len(_values(rows, col)) / 2
        chosen = pick_rows(col)
        for i in chosen:
            rows[i][col] = rows[i][col].lower() if dominant_upper else rows[i][col].upper()
        injections.append({"dimension": "Consistency", "column": col, "count": len(chosen)})
    elif defect == "truncate" and cand["truncate"]:
        col = rng.choice(cand["truncate"])
        chosen = pick_rows(col)
        for i in chosen:
            rows[i][col] = rows[i][col][:3]
        injections.append({"dimension": "Consistency", "column": col, "count": len(chosen)})
    elif defect == "negative" and cand["negative"]:
        col = rng.choice(cand["negative"])
        chosen = [i for i in pick_rows(col) if float(rows[i][col]) > 0]
        for i in chosen:
            rows[i][col] = "-" + rows[i][col]
        injections.append({"dimension": "Validity", "column": col, "count": len(chosen)})
    elif defect == "future" and cand["future"]:
        col = rng.choice(cand["future"])
        chosen = pick_rows(col)
        for i in chosen:
            _, fmt = _parse_date(rows[i][col])
            if fmt:
                rows[i][col] = (datetime.now() + timedelta(days=rng.randint(30, 365))).strftime(fmt)
        injections.append({"dimension": "Timeliness", "column": col, "count": len(chosen)})
    return rows, injections


DEFECTS = ["missing", "duplicates", "case", "truncate", "negative", "future"]


def violations(report: dict) -> Dict[Tuple[str, str], int]:
    """Union violations per (dimension, column), as scored."""
    out: Dict[Tuple[str, str], int] = {}
    for d in report.get("dimensions", []):
        for e in d.get("evidence", []):
            out[(d["dimension"], e["column"])] = max(out.get((d["dimension"], e["column"]), 0), e["violations"])
    return out


def rule_violations(report: dict) -> Dict[Tuple[str, str], Dict[str, int]]:
    """Violations of each individual rule per (dimension, column). A column that already fails
    one rule for every row (e.g. all timestamps stale) hides new defects in the union count;
    the per-rule count still shows them (e.g. newly future-dated values)."""
    out: Dict[Tuple[str, str], Dict[str, int]] = {}
    for r in (report.get("rules") or {}).get("applied", []):
        out.setdefault((r["dimension"], r["column"]), {})[r["id"]] = r["violations"]
    return out


def detected(before: dict, after: dict, key) -> Tuple[int, int]:
    """(union delta, largest single-rule delta) for one injected (dimension, column)."""
    union = after[0].get(key, 0) - before[0].get(key, 0)
    rules_after, rules_before = after[1].get(key, {}), before[1].get(key, {})
    per_rule = max((v - rules_before.get(rid, 0) for rid, v in rules_after.items()), default=0)
    return union, per_rule


def as_is_summary(job: dict) -> dict:
    r = job["report"]
    rules = r.get("rules") or {}
    md = job.get("metadata") or {}
    return {
        "composite_dqs": r["composite_dqs"],
        "grade": r["grade"],
        "dimension_scores": r["dimension_scores"],
        "not_applicable": [d["dimension"] for d in r["dimensions"] if not d["applicable"]],
        "rules_by_source": rules.get("applied_by_source"),
        "rules_rejected": [{"type": x["rule"].get("type"), "column": x["rule"].get("column"), "reason": x["reason"]} for x in rules.get("rejected", [])],
        "derivation": rules.get("derivation"),
        "semantic_types": {c["column_name"]: c.get("semantic_type") for c in md.get("columns", [])},
        "sensitive_columns": (md.get("compliance_flags") or {}).get("sensitive_columns"),
        "prohibited_data": (md.get("compliance_flags") or {}).get("prohibited_data"),
        "findings": len(r.get("findings", [])),
        "timings_ms": job.get("timings_ms"),
        "grounding": r.get("grounding"),
        "evidence": {d["dimension"]: [{k: e[k] for k in ("column", "check", "checked", "violations")} for e in d.get("evidence", [])]
                     for d in r["dimensions"]},
        "llm_rules": [{k: x.get(k) for k in ("id", "dimension", "type", "column", "description", "regulation", "checked", "violations")}
                      for x in rules.get("applied", []) if x.get("source") == "llm"],
        "optional_columns": rules.get("optional_columns", []),
    }


def run(args):
    RESULTS.mkdir(parents=True, exist_ok=True)
    out_path = RESULTS / f"kaggle_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    results = {"config": vars(args), "datasets": {}}
    names = set(args.datasets.split(",")) if args.datasets else None
    for d in MANIFEST:
        if names and d["name"] not in names:
            continue
        files = sorted((DATA_DIR / d["name"]).glob(d["file"]))
        if not files:
            print(f"[miss] {d['name']}: nothing in {DATA_DIR / d['name']}; run `python -m evaluation.kaggle fetch` first")
            continue
        columns, rows = sample_rows(files[0], args.rows, args.seed)
        print(f"\n== {d['name']} ({files[0].name}): {len(rows)} sampled rows, {len(columns)} columns, jurisdiction {d['jurisdiction']}")
        entry = {"source": d, "file": files[0].name, "rows": len(rows), "columns": columns, "modes": {}}
        base_csv = to_csv(columns, rows)
        for mode in args.modes.split(","):
            try:
                baseline = client.assess_with_retry(base_csv, f"{d['name']}.csv", d["jurisdiction"], mode, args.narrative)
            except RuntimeError as exc:
                # e.g. the provider's daily quota ran out: record it and continue with the next mode/dataset
                entry["modes"][mode] = {"failed": True, "error": str(exc)[:300]}
                print(f"  [{mode}] FAILED: {str(exc)[:100]}")
                continue
            mode_entry = {"as_is": as_is_summary(baseline), "recovery": []}
            print(f"  [{mode}] as-is DQS={baseline['report']['composite_dqs']} rules={mode_entry['as_is']['rules_by_source']}")
            approved = None
            if mode != "builtin":
                ev = baseline["metadata"]["rule_evaluation"]
                approved = json.dumps({
                    "rules": [r for r in ev["rules"] if r["source"] == "llm"],
                    "optional_columns": ev.get("optional_columns", []),
                })
            before = (violations(baseline["report"]), rule_violations(baseline["report"]))
            for defect in DEFECTS:
                inj_rows, injections = inject(columns, rows, defect, args.seed)
                if not injections:
                    mode_entry["recovery"].append({"defect": defect, "skipped": "no candidate column"})
                    continue
                job = client.assess_with_extra(to_csv(columns, inj_rows), f"{d['name']}_{defect}.csv", d["jurisdiction"], mode, False, approved)
                after = (violations(job["report"]), rule_violations(job["report"]))
                for inj in injections:
                    key = (inj["dimension"], inj["column"])
                    union, per_rule = detected(before, after, key)
                    found = max(union, per_rule)
                    mode_entry["recovery"].append({
                        "defect": defect, **inj, "detected_union": union, "detected_rule": per_rule, "detected_delta": found,
                        "recovery": max(0.0, min(1.0, found / inj["count"])) if inj["count"] else None,
                        "assessed": key in after[0],
                    })
                    print(f"    {defect:10} {inj['dimension']:12} {inj['column'][:24]:24} injected={inj['count']:5} "
                          f"detected={found:5} (union {union}, best rule {per_rule})")
            entry["modes"][mode] = mode_entry
        results["datasets"][d["name"]] = entry
        out_path.write_text(json.dumps(results, indent=1, default=str))
    print(f"\nSaved {out_path}")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch")
    f.add_argument("--datasets", default="")
    r = sub.add_parser("run")
    r.add_argument("--datasets", default="")
    r.add_argument("--modes", default="builtin,hybrid")
    r.add_argument("--rows", type=int, default=5000)
    r.add_argument("--seed", type=int, default=42)
    r.add_argument("--narrative", action="store_true")
    args = ap.parse_args()
    if args.cmd == "fetch":
        fetch(set(args.datasets.split(",")) if args.datasets else None)
    else:
        run(args)


if __name__ == "__main__":
    sys.exit(main())
