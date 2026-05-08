"""Telegram polling in a background thread (separate event loop from FastAPI)."""

import asyncio

from telegram.ext import Application, CallbackQueryHandler, CommandHandler

from app.bot.handlers import cmd_start, cmd_stop, on_callback
from app.core.config import get_settings


def build_application() -> Application:
    settings = get_settings()
    app = Application.builder().token(settings.bot_token).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("stop", cmd_stop))
    app.add_handler(CallbackQueryHandler(on_callback))
    return app


def run_bot_polling() -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    app = build_application()
    app.run_polling(drop_pending_updates=True, close_loop=True)
