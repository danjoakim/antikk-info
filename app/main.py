"""FastAPI-appen: kobler sammen database, ruter og frontend."""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.config import Settings, settings as default_settings
from app.db.database import init_db
from app.routes.analyze import router

STATIC_DIR = Path(__file__).resolve().parent / "static"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or default_settings

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        init_db(settings.db_path)
        yield

    app = FastAPI(title="Lommeur-appen", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.include_router(router)
    # Monteres sist, så /api-rutene vinner.
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
    return app


app = create_app()
