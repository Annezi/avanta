import asyncio
import logging
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from telegram import Bot

from app.bot.stats import send_monthly_statistics
from app.core.config import get_settings
from app.core.storage import ensure_data_layout, purge_old_jobs

logger = logging.getLogger(__name__)

_scheduler: Optional[BackgroundScheduler] = None


def _run_async(coro):
    asyncio.run(coro)


def start_scheduler(bot: Bot) -> BackgroundScheduler:
    global _scheduler
    settings = get_settings()
    sched = BackgroundScheduler(timezone="Europe/Moscow")

    def purge_job():
        db, jobs_root = ensure_data_layout()
        n = purge_old_jobs(db, jobs_root, settings.retention_days)
        if n:
            logger.info("Purged %s old job(s)", n)

    def monthly_job():
        try:
            _run_async(send_monthly_statistics(bot))
        except Exception:
            logger.exception("Monthly statistics failed")

    sched.add_job(purge_job, "cron", hour=3, minute=0)
    sched.add_job(monthly_job, "cron", day=1, hour=12, minute=0)
    sched.start()
    _scheduler = sched
    return sched


def shutdown_scheduler(sched: BackgroundScheduler) -> None:
    sched.shutdown(wait=False)
