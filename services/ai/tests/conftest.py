import json
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Tests never reach a real model; LLM calls are monkeypatched where needed.
os.environ["DQS_SKIP_DOTENV"] = "1"
os.environ["LLM_PROVIDER"] = "none"
os.environ.pop("INTERNAL_SERVICE_TOKEN", None)

FIXTURE = ROOT / "tests" / "fixtures" / "payments_metadata.json"


@pytest.fixture
def raw_metadata() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


@pytest.fixture
def metadata(raw_metadata):
    from common.schemas import ExtractedMetadata

    return ExtractedMetadata.model_validate(raw_metadata)


@pytest.fixture
def report(metadata):
    from scoring_service.engine import score

    return score(metadata)
