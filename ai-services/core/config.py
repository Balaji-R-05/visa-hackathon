import os
from dotenv import load_dotenv

load_dotenv(override=True)

GROQ_MODEL: str = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
GROQ_API_KEY: str = os.getenv("GROQ_API_KEY")
PORT: int = int(os.getenv("PORT", 8000))
CORS_ORIGINS: list[str] = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://frontend:5173"
).split(",")

if not GROQ_API_KEY or not GROQ_API_KEY.startswith("gsk_"):
    raise RuntimeError("Invalid or missing GROQ_API_KEY. Ensure it starts with 'gsk_'.")
