"""
Synthetic benchmark runner.

    python -m evaluation.run_synthetic --modes builtin,hybrid --trials 3 --jurisdiction IN
    python -m evaluation.run_synthetic --profiles high --modes builtin --llm-scorer --repeats 3

For each profile x trial (seed = base + trial) the same CSV is assessed in every
rule mode through the live gateway, and each report is compared with the
oracle. With --llm-scorer, the LLM-as-scorer ablation is run on the identical
metadata `--repeats` times to measure score error and run-to-run variance.
"""

import argparse
import json
import time
from datetime import datetime
from pathlib import Path

from evaluation import client, metrics, synthetic

RESULTS = Path(__file__).parent / "results"


def evaluate_report(report: dict, truth, true_scores) -> dict:
    predicted = metrics.report_ratios(report)
    mae, missing = metrics.score_mae(true_scores, report["dimension_scores"])
    rules = report.get("rules") or {}
    derivation = rules.get("derivation") or {}
    return {
        "detection": metrics.detection(truth, predicted),
        "ratio_mae": metrics.ratio_mae(truth, predicted),
        "score_mae": mae,
        "unscored_dimensions": missing,
        "composite_dqs": report["composite_dqs"],
        "dimension_scores": report["dimension_scores"],
        "rules_by_source": rules.get("applied_by_source"),
        "rules_rejected": len(rules.get("rejected", [])),
        "derivation": {k: derivation.get(k) for k in ("model", "latency_ms", "proposed", "accepted_by_deriver", "citation_stats")} if derivation else None,
        "grounding": report.get("grounding"),
        "narrative_source": report.get("narrative_source"),
    }


def evaluate_llm_scorer(scored: dict, truth, true_scores) -> dict:
    predicted = {}
    for issue in scored.get("data_quality_issues", []):
        for col in issue.get("affected_columns") or []:
            predicted[(issue["dimension"], col)] = 1.0  # binary: the LLM only names columns
    mae, missing = metrics.score_mae(true_scores, scored["dimension_scores"])
    return {
        "detection": metrics.detection(truth, predicted),
        "score_mae": mae,
        "unscored_dimensions": missing,
        "composite_dqs": scored["composite_dqs"],
        "dimension_scores": scored["dimension_scores"],
        "latency_ms": scored.get("latency_ms"),
        "model": scored.get("model"),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--profiles", default=",".join(synthetic.PROFILES))
    ap.add_argument("--modes", default="builtin,hybrid")
    ap.add_argument("--trials", type=int, default=3)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--rows", type=int, default=1000)
    ap.add_argument("--jurisdiction", default="IN")
    ap.add_argument("--narrative", action="store_true", help="also generate and grounding-check narratives")
    ap.add_argument("--llm-scorer", action="store_true", help="run the LLM-as-scorer ablation on the same metadata")
    ap.add_argument("--repeats", type=int, default=3, help="LLM-as-scorer repetitions per dataset")
    ap.add_argument("--pause", type=float, default=0.0, help="seconds between LLM-bound jobs (provider quotas)")
    args = ap.parse_args()

    RESULTS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = RESULTS / f"synthetic_{stamp}.json"
    records = []
    config = vars(args) | {"started": stamp}

    for profile in args.profiles.split(","):
        for trial in range(args.trials):
            seed = args.seed + trial
            now = datetime.now()
            rows = synthetic.generate(profile, seed, args.rows, now)
            truth = synthetic.oracle(rows, now)
            true_scores = synthetic.oracle_dimension_scores(truth)
            csv_bytes = synthetic.to_csv(rows)
            name = f"synthetic_{profile}_{seed}.csv"
            print(f"[{profile} seed={seed}] {len(rows)} rows")
            metadata = None
            for mode in args.modes.split(","):
                started = time.perf_counter()
                try:
                    job = client.assess_with_retry(csv_bytes, name, args.jurisdiction, mode, args.narrative)
                except RuntimeError as exc:
                    # e.g. the provider's daily quota ran out: record it and keep going
                    records.append({"profile": profile, "seed": seed, "scorer": f"engine/{mode}", "failed": True, "error": str(exc)[:300]})
                    print(f"  engine/{mode:8} FAILED ({str(exc)[:80]})")
                    continue
                result = evaluate_report(job["report"], truth, true_scores)
                result["wall_ms"] = round((time.perf_counter() - started) * 1000)
                result["timings_ms"] = job.get("timings_ms")
                metadata = metadata or job.get("metadata")
                records.append({"profile": profile, "seed": seed, "scorer": f"engine/{mode}", **result})
                d = result["detection"]
                print(f"  engine/{mode:8} F1={d['f1']} P={d['precision']} R={d['recall']} score_MAE={result['score_mae']:.4f} DQS={result['composite_dqs']}")
                if mode != "builtin" and args.pause:
                    time.sleep(args.pause)
            if args.llm_scorer and metadata:
                for rep in range(args.repeats):
                    try:
                        scored = client.llm_score(metadata)
                    except RuntimeError as exc:
                        # An unusable answer after retries is an outcome of LLM-as-scorer, not a harness error.
                        records.append({"profile": profile, "seed": seed, "scorer": "llm-as-scorer", "repeat": rep,
                                        "failed": True, "error": str(exc)[:300]})
                        print(f"  llm-scorer#{rep} FAILED ({str(exc)[:80]})")
                        continue
                    result = evaluate_llm_scorer(scored, truth, true_scores)
                    records.append({"profile": profile, "seed": seed, "scorer": "llm-as-scorer", "repeat": rep, **result})
                    d = result["detection"]
                    print(f"  llm-scorer#{rep} F1={d['f1']} score_MAE={result['score_mae']:.4f} DQS={result['composite_dqs']}")
                    if args.pause:
                        time.sleep(args.pause)
            records[-1]["truth_scores"] = true_scores
            out_path.write_text(json.dumps({"config": config, "records": records}, indent=1, default=str))

    summary = summarize(records)
    out_path.write_text(json.dumps({"config": config, "records": records, "summary": summary}, indent=1, default=str))
    print_summary(summary)
    print(f"\nSaved {out_path}")


def summarize(records):
    summary = {}
    scorers = sorted({r["scorer"] for r in records})
    for profile in dict.fromkeys(r["profile"] for r in records):
        summary[profile] = {}
        for scorer in scorers:
            attempts = [r for r in records if r["profile"] == profile and r["scorer"] == scorer]
            rs = [r for r in attempts if not r.get("failed")]
            if not attempts:
                continue
            if not rs:
                summary[profile][scorer] = {"attempts": len(attempts), "failures": len(attempts)}
                continue
            summary[profile][scorer] = {
                "attempts": len(attempts),
                "failures": len(attempts) - len(rs),
                "f1": metrics.summarize(r["detection"]["f1"] for r in rs),
                "precision": metrics.summarize(r["detection"]["precision"] for r in rs),
                "recall": metrics.summarize(r["detection"]["recall"] for r in rs),
                "specificity": metrics.summarize(r["detection"]["specificity"] for r in rs),
                "score_mae": metrics.summarize(r["score_mae"] for r in rs),
                "composite_dqs": metrics.summarize(r["composite_dqs"] for r in rs),
            }
            if scorer == "llm-as-scorer":
                # run-to-run spread on identical metadata
                by_seed = {}
                for r in rs:
                    by_seed.setdefault(r["seed"], []).append(r["composite_dqs"])
                summary[profile][scorer]["composite_std_same_input"] = metrics.summarize(
                    metrics.summarize(v)["std"] for v in by_seed.values() if len(v) > 1
                )
    all_scorers = {s: [r for r in records if r["scorer"] == s and not r.get("failed")] for s in scorers}
    if "engine/builtin" in all_scorers:
        base = {(r["profile"], r["seed"]): r for r in all_scorers["engine/builtin"]}
        for s, rs in all_scorers.items():
            if s == "engine/builtin":
                continue
            pairs = [(r, base[(r["profile"], r["seed"])]) for r in rs if (r["profile"], r["seed"]) in base and r.get("repeat", 0) == 0]
            summary.setdefault("_paired_vs_builtin", {})[s] = {
                "f1": metrics.paired_bootstrap([a["detection"]["f1"] or 0 for a, _ in pairs], [b["detection"]["f1"] or 0 for _, b in pairs]),
                "score_mae": metrics.paired_bootstrap([a["score_mae"] for a, _ in pairs], [b["score_mae"] for _, b in pairs]),
            }
    return summary


def print_summary(summary):
    print("\n" + "=" * 96)
    print(f"{'profile':<16}{'scorer':<18}{'F1':>14}{'precision':>14}{'recall':>14}{'score MAE':>18}")
    print("-" * 96)
    fmt = lambda s, p=3: "-" if s["mean"] is None else f"{s['mean']:.{p}f}±{s['std']:.{p}f}"
    for profile, by in summary.items():
        if profile.startswith("_"):
            continue
        for scorer, m in by.items():
            if "f1" not in m:
                print(f"{profile:<16}{scorer:<18}{'all ' + str(m['attempts']) + ' attempts failed':>60}")
                continue
            failed = f"  ({m['failures']}/{m['attempts']} failed)" if m.get("failures") else ""
            print(f"{profile:<16}{scorer:<18}{fmt(m['f1']):>14}{fmt(m['precision']):>14}{fmt(m['recall']):>14}{fmt(m['score_mae'], 4):>18}{failed}")
    for scorer, cmp in summary.get("_paired_vs_builtin", {}).items():
        print(f"\n{scorer} vs engine/builtin (paired, 95% bootstrap CI): "
              f"dF1={cmp['f1']['mean_diff']} CI={cmp['f1']['ci95']}; dMAE={cmp['score_mae']['mean_diff']} CI={cmp['score_mae']['ci95']}")


if __name__ == "__main__":
    main()
