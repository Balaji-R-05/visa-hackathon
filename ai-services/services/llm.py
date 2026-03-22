from langchain_groq import ChatGroq
from schemas import (
    DQAnalysisResponse, ChatResponse, ChatMessage
)
from prompt import DQ_PROMPT, CHAT_PROMPT
from core.config import GROQ_MODEL, GROQ_API_KEY
from core.logger import logger

try:
    llm = ChatGroq(
        model=GROQ_MODEL,
        temperature=0.1,
        api_key=GROQ_API_KEY
    )
    
    structured_llm_dq = llm.with_structured_output(DQAnalysisResponse)
    dq_chain = DQ_PROMPT | structured_llm_dq
    
    structured_llm_chat = llm.with_structured_output(ChatResponse)
    chat_chain = CHAT_PROMPT | structured_llm_chat
    
    logger.info(f"🚀 LLMs initialized with model: {GROQ_MODEL}")
except Exception as e:
    logger.error(f"Failed to initialize LLM: {str(e)}")
    raise RuntimeError(f"Failed to initialize LLM: {str(e)}")

def summarize_history(messages: list[ChatMessage]) -> str:
    """
    Simple memory management: keeps only the last 10 messages 
    to prevent context overflow in a hackathon setting.
    """
    if len(messages) > 10:
        logger.info(f"Truncating history from {len(messages)} to 10 messages")
        return "\n".join([f"{m.role}: {m.content}" for m in messages[-10:]])
    return "\n".join([f"{m.role}: {m.content}" for m in messages])
