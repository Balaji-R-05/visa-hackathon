from fastapi import FastAPI
from routers import dq, chat, health
from core.logger import logger
from core.config import PORT

app = FastAPI(
    title="DQS-AI Agent",
    description="Data Quality Service powered by GenAI",
    version="1.3.0"
)

app.include_router(health.router)
app.include_router(dq.router)
app.include_router(chat.router)

@app.on_event("startup")
async def startup_event():
    logger.info("🚀 DQS-AI Agent starting up...")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)