# Evaluation datasets

Public financial datasets from Kaggle, downloaded here by the evaluation harness.
They are licensed by their owners and are not committed to this repository
(everything in this folder except this README is gitignored).

```bash
# one-time: create an API token at kaggle.com → Settings → API → "Create New Token",
# then save it as %USERPROFILE%\.kaggle\kaggle.json (or set KAGGLE_USERNAME / KAGGLE_KEY)
services/ai/venv/Scripts/python -m pip install -r evaluation/requirements.txt
services/ai/venv/Scripts/python -m evaluation.kaggle fetch                 # all datasets in the manifest
services/ai/venv/Scripts/python -m evaluation.kaggle fetch --datasets paysim
```

Each dataset lands in `data/<name>/`. The manifest (slugs, files, jurisdictions and
the reason each was chosen) is in `evaluation/kaggle.py`. Some datasets require
accepting their terms on the Kaggle website before the API will serve them. Cite
each dataset you use in the paper.
