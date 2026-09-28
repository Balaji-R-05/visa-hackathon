"""
Builds the real-data tables for the paper from evaluation/results/kaggle_*.json.

    python -m evaluation.report_kaggle                 # prints a summary and LaTeX rows
    python -m evaluation.report_kaggle --files a.json b.json

Runs are merged per (dataset, mode), later files taking precedence. Only runs that
record per-rule recovery ("detected_rule") are used for recovery, since the earlier
union-only metric under-counts defects on columns that already failed every row.
"""

import argparse
import glob
import json
import os
from collections import defaultdict

from evaluation.kaggle import MANIFEST

DEFECT_ORDER = ["missing", "duplicates", "case", "truncate", "negative", "future"]
LABELS = {"card_fraud_simulated": "Card fraud (simulated)", "bank_transactions": "Bank transactions",
          "paysim": "PaySim", "creditcard_pca": "Credit card (PCA)", "aml_transactions": "AML transactions"}


def load(files):
    merged = {}
    for path in sorted(files, key=os.path.getmtime):
        data = json.load(open(path, encoding="utf-8"))
        for name, entry in data.get("datasets", {}).items():
            for mode, m in entry.get("modes", {}).items():
                if m.get("failed"):
                    continue
                rec = m.get("recovery", [])
                if rec and not any("detected_rule" in r for r in rec if "skipped" not in r):
                    continue  # superseded union-only metric
                merged[(name, mode)] = {"entry": entry, **m, "file": os.path.basename(path)}
    return merged


def recovery_cell(runs, mode, defect):
    run = runs.get(mode)
    if not run:
        return None
    rows = [r for r in run["recovery"] if r["defect"] == defect and "skipped" not in r]
    if not rows:
        return "n/a"
    injected = sum(r["count"] for r in rows)
    found = sum(min(r["detected_delta"], r["count"]) for r in rows)
    return found, injected


def fmt(cell):
    if cell is None:
        return "--"
    if cell == "n/a":
        return "n/a"
    found, injected = cell
    return f"{found / injected:.2f}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--files", nargs="*")
    args = ap.parse_args()
    files = args.files or glob.glob(os.path.join(os.path.dirname(__file__), "results", "kaggle_*.json"))
    merged = load(files)
    by_ds = defaultdict(dict)
    for (name, mode), run in merged.items():
        by_ds[name][mode] = run

    print("Recovery (found / injected), built-in | hybrid")
    for d in MANIFEST:
        runs = by_ds.get(d["name"], {})
        if not runs:
            continue
        cells = []
        for defect in DEFECT_ORDER:
            b, h = recovery_cell(runs, "builtin", defect), recovery_cell(runs, "hybrid", defect)
            cells.append(f"{defect}={fmt(b)}|{fmt(h)}")
        print(f"  {d['name']:22} " + "  ".join(cells))

    print("\nAs-is audit")
    for d in MANIFEST:
        runs = by_ds.get(d["name"], {})
        for mode in ("builtin", "hybrid"):
            run = runs.get(mode)
            if not run:
                continue
            a = run["as_is"]
            der = a.get("derivation") or {}
            fired = [r for r in a.get("llm_rules", []) if r["violations"]]
            print(f"  {d['name']:22} {mode:8} DQS={a['composite_dqs']:.4f} N/A={a['not_applicable']} rules={a['rules_by_source']} "
                  f"rejected={len(a['rules_rejected'])} llm_fired_on_clean={len(fired)} derive_ms={der.get('latency_ms')} [{run['file']}]")

    print("\nLaTeX rows (built-in / hybrid):")
    for d in MANIFEST:
        runs = by_ds.get(d["name"], {})
        if not runs:
            continue
        cols = []
        for defect in DEFECT_ORDER:
            b, h = fmt(recovery_cell(runs, "builtin", defect)), fmt(recovery_cell(runs, "hybrid", defect))
            cols.append(f"{b}/{h}")
        print(f"{LABELS[d['name']]} & " + " & ".join(cols) + r" \\")


if __name__ == "__main__":
    main()
