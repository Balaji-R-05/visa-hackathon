"""Metrics comparing a DQS report (or an LLM-scored response) with ground truth."""

import random
import statistics
from typing import Dict, Iterable, List, Optional, Tuple

Truth = Dict[Tuple[str, str], Tuple[int, int]]


def report_ratios(report: dict) -> Dict[Tuple[str, str], float]:
    """(dimension, column) -> violation ratio as measured by the engine's evidence."""
    out: Dict[Tuple[str, str], float] = {}
    for d in report.get("dimensions", []):
        for e in d.get("evidence", []):
            key = (d["dimension"], e["column"])
            out[key] = max(out.get(key, 0.0), e["violation_ratio"])
    return out


def detection(truth: Truth, predicted: Dict[Tuple[str, str], float], eps: float = 0.0) -> dict:
    """Cell-level (dimension, column) detection with true negatives.

    Keys the scorer assessed but the contract does not cover count as false
    positives when flagged (the scorer raised an alarm the contract says is
    clean) and are otherwise ignored.
    """
    tp = fp = fn = tn = 0
    false_pos, false_neg = [], []
    for key, (v, c) in truth.items():
        actual = c > 0 and v / c > eps
        flagged = predicted.get(key, 0.0) > eps
        tp += actual and flagged
        fn += actual and not flagged
        fp += flagged and not actual
        tn += not actual and not flagged
        if flagged and not actual:
            false_pos.append(f"{key[0]}:{key[1]}")
        if actual and not flagged:
            false_neg.append(f"{key[0]}:{key[1]}")
    outside = [f"{k[0]}:{k[1]}" for k, r in predicted.items() if k not in truth and r > eps]
    extra_fp = len(outside)
    fp += extra_fp
    false_pos += outside
    precision = tp / (tp + fp) if tp + fp else None
    recall = tp / (tp + fn) if tp + fn else None
    f1 = 2 * precision * recall / (precision + recall) if precision and recall else (0.0 if tp + fp + fn else None)
    return {
        "tp": tp, "fp": fp, "fn": fn, "tn": tn, "fp_outside_contract": extra_fp,
        "false_positives": false_pos, "false_negatives": false_neg,
        "precision": precision, "recall": recall, "f1": f1,
        "specificity": tn / (tn + fp) if tn + fp else None,
    }


def ratio_mae(truth: Truth, predicted: Dict[Tuple[str, str], float]) -> float:
    errs = [abs((v / c if c else 0.0) - predicted.get(key, 0.0)) for key, (v, c) in truth.items()]
    return sum(errs) / len(errs)


def score_mae(true_scores: Dict[str, float], scores: Dict[str, Optional[float]]) -> Tuple[float, List[str]]:
    """Mean absolute error over dimensions; a dimension the scorer left unscored counts as missing."""
    errs, missing = [], []
    for dim, t in true_scores.items():
        s = scores.get(dim)
        if s is None:
            missing.append(dim)
            continue
        errs.append(abs(t - s))
    return (sum(errs) / len(errs) if errs else float("nan")), missing


def summarize(values: Iterable[Optional[float]]) -> dict:
    xs = [v for v in values if v is not None and v == v]
    if not xs:
        return {"mean": None, "std": None, "n": 0}
    return {"mean": statistics.mean(xs), "std": statistics.stdev(xs) if len(xs) > 1 else 0.0, "n": len(xs)}


def paired_bootstrap(a: List[float], b: List[float], iters: int = 5000, seed: int = 7) -> dict:
    """95% CI of mean(a - b) over paired trials."""
    diffs = [x - y for x, y in zip(a, b) if x is not None and y is not None]
    if not diffs:
        return {"mean_diff": None, "ci95": None, "n": 0}
    rng = random.Random(seed)
    means = sorted(statistics.mean(rng.choices(diffs, k=len(diffs))) for _ in range(iters))
    return {"mean_diff": statistics.mean(diffs), "ci95": [means[int(0.025 * iters)], means[int(0.975 * iters)]], "n": len(diffs)}
