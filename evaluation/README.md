# Evaluation

All runs go through the live system (gateway → data-plane → Python services), so they
measure the product, not a re-implementation. Start the stack first
(`bash scripts/run_local.sh` or `docker compose up`), then run from the repo root with
the AI venv's Python.

## 1. Synthetic benchmark (`run_synthetic.py`)

```bash
python -m evaluation.run_synthetic --modes builtin --trials 5                     # engine sanity check
python -m evaluation.run_synthetic --profiles clean,medium,high --modes builtin,hybrid \
       --trials 3 --llm-scorer --repeats 3 --pause 30                              # LLM tracks (Groq quota pacing)
```

- **Profiles:** `clean` (a control with no defects), five single-defect profiles (`only_missing`,
  `only_duplicates`, `only_invalid`, `only_format`, `only_temporal`), and mixed `low`/`medium`/`high`.
  Each trial uses seed `base + trial`, and generation is fully deterministic given the seed.
- **Ground truth:** `synthetic.oracle` recomputes, from the final rows, the true violation ratio of every
  (dimension, column) pair in the declared contract (`CONTRACT_SCOPE`), including copies of defective rows made by
  duplication. Clean pairs are true negatives.
- **Metrics:**
  - Detection precision, recall, F1 and specificity at (dimension, column) granularity. Flags outside the
    contract count as false positives.
  - Mean absolute error (MAE) of per-pair violation ratios and of dimension scores against the oracle.
  - For `--llm-scorer`: the same metadata scored by the LLM `--repeats` times, reported as error and run-to-run spread.
  - Paired bootstrap 95% confidence intervals of each mode against `engine/builtin`.
- **Caveat:** the built-in rules and the defect injectors were written by the same authors, so near-perfect built-in
  scores here validate the *implementation*, not generalisation. Generalisation evidence comes from track 2.

## 2. Real datasets from Kaggle (`kaggle.py`)

```bash
pip install kaggle                     # and place your API token at ~/.kaggle/kaggle.json
python -m evaluation.kaggle fetch      # downloads the datasets in MANIFEST into evaluation/data/kaggle (gitignored)
python -m evaluation.kaggle run --modes builtin,hybrid --rows 5000
```

- **As-is audit:** scores, applicability, semantic typing, sensitive-data flags, rules proposed, accepted and
  rejected (with reasons), citation statistics, and stage latency.
- **Semi-synthetic recovery:** each defect type (`missing`, `duplicates`, `case`, `truncate`, `negative`, `future`)
  is injected separately at 5% into columns chosen by engine-independent heuristics. Recovery is the extra
  violations reported ÷ defects injected, per (dimension, column). In `hybrid` mode, the LLM rule set derived on the
  unmodified sample is supplied unchanged to every injected run, so recovery isn't confounded by LLM variation.

Verify each dataset's slug and licence on Kaggle and cite them in the paper. The datasets are stored in the
repository's `data/` folder (gitignored), processed locally, and not redistributed.

Recovery counts the larger of the change in a column's combined violations and the change in any single rule's
violations. A column that already fails one rule on every row (for example, archival timestamps outside the
freshness window) would otherwise hide new defects.

Build the paper's real-data tables from the result files (later runs override earlier ones per dataset and mode):

```bash
python -m evaluation.report_kaggle
```

## Outputs

`evaluation/results/<track>_<timestamp>.json` holds the configuration, one record per scorer × dataset × trial,
and a summary. Paper tables should be generated from these files, not copied by hand.
