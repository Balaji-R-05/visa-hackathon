import hmac
from contextlib import asynccontextmanager
from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from common import config, llm
from common.exceptions import setup_exception_handlers
from common.logger import logger

PUBLIC_PATHS = {"/health", "/docs", "/openapi.json"}


def internal_headers() -> dict:
    """Headers for calls to sibling services."""
    return {"x-internal-token": config.INTERNAL_SERVICE_TOKEN} if config.INTERNAL_SERVICE_TOKEN else {}


def create_app(name: str, version: str, description: str) -> FastAPI:
    """Builds a service app with the shared health route, CORS, error handling
    and (when INTERNAL_SERVICE_TOKEN is set) service-to-service authentication."""

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        logger.info(f"{name} v{version} starting (llm={llm.model_id() or 'disabled'})")
        yield
        logger.info(f"{name} shutting down")

    app = FastAPI(title=name, version=version, description=description, lifespan=lifespan)

    if config.CORS_ORIGINS:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=config.CORS_ORIGINS,
            allow_credentials=False,
            allow_methods=["GET", "POST"],
            allow_headers=["*"],
        )

    @app.middleware("http")
    async def internal_auth(request: Request, call_next):
        if config.INTERNAL_SERVICE_TOKEN and request.url.path not in PUBLIC_PATHS:
            supplied = request.headers.get("x-internal-token", "")
            if not hmac.compare_digest(supplied, config.INTERNAL_SERVICE_TOKEN):
                return JSONResponse(status_code=401, content={"error": "missing or invalid internal token"})
        return await call_next(request)

    setup_exception_handlers(app)

    router = APIRouter(tags=["Health"])

    @router.get("/health")
    async def health():
        return {
            "status": "healthy",
            "service": name,
            "version": version,
            "llm": llm.model_id(),
            "llm_local": llm.is_local(),
        }

    app.include_router(router)
    return app
