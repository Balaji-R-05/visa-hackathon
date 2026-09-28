"""
Numeric faithfulness check for generated text.

Every number an LLM writes about a report must match a number the engine
produced (a count, a ratio, a score, a weight). Numbers inside regulatory
citations ("BCBS 239 Principle 4", "Art. 5(1)(d)"), years, finding ids and
small integers (column counts, priorities) are not treated as claims.
"""

import re
from typing import Iterable, List, Set, Tuple

from common.schemas import DQSReport, GroundingReport

CITATION_RE = re.compile(
    r"(?ix)"
    r"\b(?:ISO(?:/IEC)?\s*\d+(?:[-:]\d+)*"
    r"|BCBS\s*\d+"
    r"|PCI\s*DSS(?:\s*v?\d+(?:\.\d+)*)?"
    r"|Req(?:uirement)?s?\.?\s*\d+(?:\.\d+)*"
    r"|Principles?\s*\d+(?:\s*(?:,|and|&)\s*\d+)*"
    r"|Recommendations?\s*\d+"
    r"|Art(?:icle)?s?\.?\s*\d+(?:\(\w+\))*"
    r"|s\.\s*\d+(?:\(\w+\))*"
    r"|Section\s*\d+(?:\(\w+\))*"
    r"|(?:19|20)\d{2}"
    r"|F\d+"
    r"|\d+\s*CFR\s*\d+)"
)
NUMBER_RE = re.compile(r"(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(\s*%)?")

PCT_TOL = 0.15      # percentage points
ROUNDING_TOL = 1.0  # percentage points: an unverified claim this close to a true value is a rounding
FRAC_TOL = 0.0015   # absolute, for values written in [0, 1]
SMALL_INT_MAX = 12  # "3 columns", "priority 1", "7 dimensions" are not claims


def allowed_numbers(report: DQSReport) -> Tuple[Set[int], List[float]]:
    ints: Set[int] = {report.dataset.get("row_count", 0), report.dataset.get("column_count", 0)}
    fracs: List[float] = [report.composite_dqs]
    for d in report.dimensions:
        ints.update({d.checked, d.violations})
        fracs.extend([d.weight, d.base_weight] + ([d.score] if d.score is not None else []))
        if d.score is not None:
            fracs.append(1 - d.score)
        for e in d.evidence:
            ints.update({e.checked, e.violations, e.checked - e.violations})
            fracs.append(e.violation_ratio)
            fracs.append(1 - e.violation_ratio)
    for f in report.findings:
        ints.update({f.checked, f.violations})
        fracs.extend([f.violation_ratio, f.impact])
    for a in report.remediation_actions:
        if a.expected_gain is not None:
            fracs.append(a.expected_gain)
    fw = report.governance.get("freshness_window_days") if report.governance else None
    for r in (report.rules or {}).get("applied", []):
        ints.update({r.get("checked", 0), r.get("violations", 0)})
    if fw:
        ints.add(int(fw))
    ints.add(365)
    return ints, fracs


def extract_claims(text: str) -> List[Tuple[str, float, bool, bool]]:
    """Returns (literal, value, is_percent, has_decimal) for each numeric claim."""
    cleaned = CITATION_RE.sub(" ", text)
    claims = []
    for m in NUMBER_RE.finditer(cleaned):
        whole, dec, pct = m.group(1), m.group(2) or "", bool(m.group(3))
        value = float(whole.replace(",", "") + dec)
        if not pct and not dec and value <= SMALL_INT_MAX:
            continue
        claims.append((m.group(0).strip(), value, pct, bool(dec)))
    return claims


def _matches(value: float, pct: bool, has_dec: bool, ints: Set[int], fracs: List[float]) -> bool:
    if pct:
        return any(abs(value - f * 100) <= PCT_TOL for f in fracs)
    if has_dec and value <= 1:
        return any(abs(value - f) <= FRAC_TOL for f in fracs)
    if has_dec:  # e.g. "88.9" without a % sign
        return any(abs(value - f * 100) <= PCT_TOL for f in fracs)
    return int(value) in ints


def verify(texts: Iterable[str], report: DQSReport) -> GroundingReport:
    ints, fracs = allowed_numbers(report)
    total = 0
    verified = 0
    unverified: List[str] = []
    rounded: List[str] = []
    for text in texts:
        for literal, value, pct, has_dec in extract_claims(text or ""):
            total += 1
            if _matches(value, pct, has_dec, ints, fracs):
                verified += 1
                continue
            unverified.append(literal)
            if pct and any(abs(value - f * 100) <= ROUNDING_TOL for f in fracs):
                rounded.append(literal)
    return GroundingReport(
        numeric_claims=total,
        verified=verified,
        unverified_claims=list(dict.fromkeys(unverified)),
        rounded_claims=list(dict.fromkeys(rounded)),
        score=(verified / total) if total else None,
    )


def report_texts(report: DQSReport) -> List[str]:
    """All free text in a report that a reader might take as a factual claim."""
    texts = [report.executive_summary]
    texts += [d.narrative or "" for d in report.dimensions]
    texts += [d.explanation for d in report.dimensions]
    texts += [a.action + " " + a.description for a in report.remediation_actions]
    texts += report.regulatory_compliance_risks
    return texts
