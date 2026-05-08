import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from telegram import Bot

from app.api import admin as admin_router
from app.api import auth as auth_router
from app.api import debug as debug_router
from app.api import upload as upload_router
from app.bot.runner import run_bot_polling
from app.core.config import cors_origins_list, get_settings
from app.scheduler import shutdown_scheduler, start_scheduler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    bot = Bot(settings.bot_token)
    app.state.telegram_bot = bot

    sched = start_scheduler(bot)
    app.state.scheduler = sched

    bot_thread = threading.Thread(target=run_bot_polling, name="telegram-bot", daemon=True)
    bot_thread.start()
    logger.info("Telegram bot thread started")

    yield

    shutdown_scheduler(sched)


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="AvantaPrint API", lifespan=lifespan)

    origins = cors_origins_list()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins if origins != ["*"] else ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth_router.router)
    app.include_router(upload_router.router)
    app.include_router(admin_router.router)
    app.include_router(debug_router.router)

    @app.get("/api/health")
    def health():
        return {"status": "ok", "service": "AvantaPrint"}

    return app


app = create_app()
