import asyncio

import pytest
from pydantic import BaseModel

from common import config, llm


class Out(BaseModel):
    value: int


class FakeModel:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.kwargs = None

    def with_structured_output(self, schema, **kwargs):
        self.kwargs = kwargs
        return self

    async def ainvoke(self, prompt):
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def _use(monkeypatch, model):
    monkeypatch.setattr(llm, "get_chat_model", lambda temperature=None, max_tokens=None: model)


def test_retries_unparseable_output_once(monkeypatch):
    model = FakeModel([ValueError("json_validate_failed"), {"value": 3}])
    _use(monkeypatch, model)
    assert asyncio.run(llm.structured_invoke("p", Out)).value == 3
    assert model.kwargs == {"method": "json_schema"}  # strict decoding is opt-in


def test_gives_up_after_retries(monkeypatch):
    _use(monkeypatch, FakeModel([ValueError("bad"), ValueError("still bad")]))
    with pytest.raises(llm.LLMOutputError):
        asyncio.run(llm.structured_invoke("p", Out))


def test_connection_errors_are_not_retried(monkeypatch):
    _use(monkeypatch, FakeModel([RuntimeError("Error code: 429 - rate_limit_exceeded"), {"value": 1}]))
    with pytest.raises(llm.LLMUnavailable):
        asyncio.run(llm.structured_invoke("p", Out))


def test_strict_mode_is_configurable(monkeypatch):
    model = FakeModel([{"value": 1}])
    _use(monkeypatch, model)
    monkeypatch.setattr(config, "LLM_PROVIDER", "groq")
    monkeypatch.setattr(config, "LLM_STRICT_SCHEMA", True)
    asyncio.run(llm.structured_invoke("p", Out))
    assert model.kwargs == {"method": "json_schema", "strict": True}
