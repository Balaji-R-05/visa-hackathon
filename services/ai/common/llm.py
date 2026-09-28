"""
LLM provider abstraction. Every LLM call in the system goes through
`structured_invoke` (typed output) or `stream_text` (chat), so swapping the
local Ollama model for a hosted one — or disabling LLMs entirely — is a config
change, and tests can monkeypatch a single function.
"""

from typing import AsyncIterator, Optional, Type, TypeVar
from pydantic import BaseModel
from common import config
from common.logger import logger

T = TypeVar("T", bound=BaseModel)


class LLMUnavailable(RuntimeError):
    """The configured provider is disabled, unreachable, or misconfigured."""


class LLMOutputError(RuntimeError):
    """The provider answered but the output did not match the requested schema."""


def model_id() -> Optional[str]:
    if config.LLM_PROVIDER == "ollama":
        return f"ollama/{config.OLLAMA_MODEL}"
    if config.LLM_PROVIDER == "groq":
        return f"groq/{config.GROQ_MODEL}"
    return None


def is_local() -> bool:
    return config.LLM_PROVIDER == "ollama"


def get_chat_model(temperature: Optional[float] = None, max_tokens: Optional[int] = None):
    temp = config.LLM_TEMPERATURE if temperature is None else temperature
    budget = min(max_tokens or config.LLM_MAX_TOKENS, config.LLM_MAX_TOKENS)
    if config.LLM_PROVIDER == "ollama":
        from langchain_ollama import ChatOllama

        return ChatOllama(
            model=config.OLLAMA_MODEL,
            base_url=config.OLLAMA_BASE_URL,
            temperature=temp,
            num_predict=budget,
            client_kwargs={"timeout": config.LLM_TIMEOUT_S},
        )
    if config.LLM_PROVIDER == "groq":
        if not config.GROQ_API_KEY:
            raise LLMUnavailable("LLM_PROVIDER=groq but GROQ_API_KEY is not set")
        from langchain_groq import ChatGroq

        reasoning = {"reasoning_effort": config.LLM_REASONING_EFFORT} if "gpt-oss" in config.GROQ_MODEL else {}
        return ChatGroq(
            model=config.GROQ_MODEL,
            api_key=config.GROQ_API_KEY,
            **reasoning,
            temperature=temp,
            max_tokens=budget,
            timeout=config.LLM_TIMEOUT_S,
        )
    raise LLMUnavailable(f"LLM provider '{config.LLM_PROVIDER}' is disabled")


def _is_connection_error(exc: Exception) -> bool:
    name = type(exc).__name__.lower()
    text = str(exc).lower()
    return any(k in name for k in ("connect", "timeout", "authentication", "permissiondenied")) or any(
        k in text for k in (
            "connection refused", "failed to connect", "timed out", "not found, try pulling",
            "invalid api key", "invalid_api_key", "error code: 401", "error code: 403",
            "rate_limit_exceeded", "error code: 429", "error code: 413",
        )
    )


async def structured_invoke(
    prompt: str, schema: Type[T], temperature: Optional[float] = None, max_tokens: Optional[int] = None
) -> T:
    # Hosted providers count max_tokens against per-minute quotas, so callers size it per task.
    model = get_chat_model(temperature, max_tokens)
    extra = {"strict": True} if config.LLM_PROVIDER == "groq" and config.LLM_STRICT_SCHEMA else {}
    runnable = model.with_structured_output(schema, method="json_schema", **extra)
    last: Exception | None = None
    for attempt in range(1 + config.LLM_OUTPUT_RETRIES):
        try:
            result = await runnable.ainvoke(prompt)
            if result is None:
                raise ValueError("no parseable output")
            return schema.model_validate(result) if isinstance(result, dict) else result
        except Exception as exc:  # provider SDKs raise a wide variety of types
            if _is_connection_error(exc):
                raise LLMUnavailable(f"{model_id()} unreachable: {exc}") from exc
            last = exc
            logger.warning(f"{model_id()} produced unusable {schema.__name__} (attempt {attempt + 1}): {str(exc)[:200]}")
    raise LLMOutputError(f"{model_id()} failed to produce {schema.__name__}: {last}") from last


async def stream_text(prompt: str) -> AsyncIterator[str]:
    model = get_chat_model()
    try:
        async for chunk in model.astream(prompt):
            if chunk.content:
                yield chunk.content
    except Exception as exc:
        logger.error(f"LLM stream failed: {exc}")
        if _is_connection_error(exc):
            raise LLMUnavailable(str(exc)) from exc
        raise


async def text_invoke(prompt: str) -> str:
    model = get_chat_model()
    try:
        return (await model.ainvoke(prompt)).content
    except Exception as exc:
        if _is_connection_error(exc):
            raise LLMUnavailable(str(exc)) from exc
        raise
