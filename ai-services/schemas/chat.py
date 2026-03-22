from pydantic import BaseModel, Field
from typing import List
from .analysis import DQAnalysisResponse

class ChatMessage(BaseModel):
    role: str = Field(description="Role of the message sender (user or bot)")
    content: str = Field(description="Content of the message")

class ChatRequest(BaseModel):
    audit_context: DQAnalysisResponse = Field(description="The data quality analysis context for the chatbot")
    messages: List[ChatMessage] = Field(description="The conversation history")
    user_input: str = Field(description="The new message from the user")

class ChatResponse(BaseModel):
    role: str = Field(default="assistant", description="Role of the responder")
    content: str = Field(description="AI-generated response based on the audit context")