import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from common import llm
from common.governance import redact
from common.logger import logger
from common.schemas import ChatMessage, ChatRequest, ChatResponse
from insight_service.prompts import CHAT_PROMPT, SUMMARIZE_PROMPT

router = APIRouter(prefix="/chat", tags=["Chat"])

HISTORY_LIMIT = 10
CONTEXT_KEYS = (
    "dataset", "composite_dqs", "grade", "scoring_profile", "dimension_scores", "dimensions", "findings",
    "remediation_actions", "regulatory_compliance_risks", "executive_summary", "rules",
)


def _context(audit_context: dict) -> str:
    """Report fields relevant to Q&A, without per-rule evidence lists, redacted."""
    ctx = {k: audit_context.get(k) for k in CONTEXT_KEYS if k in audit_context}
    for d in ctx.get("dimensions") or []:
        if isinstance(d, dict):
            d.pop("evidence", None)
    if isinstance(ctx.get("rules"), dict):
        ctx["rules"] = {k: v for k, v in ctx["rules"].items() if k != "applied"}
    redacted, _ = redact(ctx)
    return json.dumps(redacted, default=str)


async def summarize_history(messages: list[ChatMessage]) -> str:
    if not messages:
        return ""
    history = "\n".join(f"{m.role}: {m.content}" for m in messages)
    if len(messages) <= HISTORY_LIMIT:
        return history
    try:
        return "Summary of earlier conversation: " + await llm.text_invoke(SUMMARIZE_PROMPT.format(chat_history=history))
    except Exception as exc:
        logger.error(f"Summarization failed ({exc}); truncating history")
        return "\n".join(f"{m.role}: {m.content}" for m in messages[-HISTORY_LIMIT:])


async def _prompt(request: ChatRequest) -> str:
    return CHAT_PROMPT.format(
        audit_context=_context(request.audit_context),
        chat_history=await summarize_history(request.messages),
        user_input=request.user_input,
    )


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest):
    try:
        return ChatResponse(content=await llm.text_invoke(await _prompt(request)))
    except llm.LLMUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"LLM unavailable: {exc}")


@router.post("/stream")
async def chat_stream(request: ChatRequest):
    async def events():
        try:
            async for chunk in llm.stream_text(await _prompt(request)):
                yield f"data: {json.dumps({'content': chunk})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as exc:
            logger.error(f"Stream error: {exc}")
            yield f"data: {json.dumps({'error': 'The assistant is unavailable right now.'})}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream")
