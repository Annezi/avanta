from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from telegram import Bot

from app.core.storage import ensure_data_layout, get_admin_chat_ids, list_jobs


def _parse_created_at(s: str) -> datetime | None:
    try:
        # ISO from storage may end with Z or offset
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


async def send_monthly_statistics(bot: Bot) -> None:
    """Report for the previous calendar month (MSK)."""
    tz = ZoneInfo("Europe/Moscow")
    today = datetime.now(tz).date()
    first_this = date(today.year, today.month, 1)
    last_day_prev = first_this - timedelta(days=1)
    first_prev = date(last_day_prev.year, last_day_prev.month, 1)

    start_dt = datetime.combine(first_prev, time.min, tzinfo=tz)
    end_dt = datetime.combine(first_this, time.min, tzinfo=tz)

    chat_ids = get_admin_chat_ids()
    if not chat_ids:
        return

    db, _ = ensure_data_layout()
    jobs = list_jobs(db)

    in_month = []
    for j in jobs:
        dt = _parse_created_at(j.get("created_at", ""))
        if dt is None:
            continue
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=tz)
        dt_msk = dt.astimezone(tz)
        if start_dt <= dt_msk < end_dt:
            in_month.append(j)

    done = sum(1 for j in in_month if j.get("tg_status") == "done")
    waiting = sum(1 for j in in_month if j.get("tg_status") == "awaiting_payment")
    printing = sum(1 for j in in_month if j.get("tg_status") == "printing")
    delivering = sum(1 for j in in_month if j.get("tg_status") == "delivering")

    period = f"{first_prev.isoformat()} - {last_day_prev.isoformat()}"
    text = (
        f"AvantaPrint — статистика за {period}\n\n"
        f"Всего заявок: {len(in_month)}\n"
        f"Реализовано: {done}\n"
        f"Ожидание оплаты: {waiting}\n"
        f"На печати: {printing}\n"
        f"Вручение: {delivering}"
    )

    for chat_id in chat_ids:
        try:
            await bot.send_message(chat_id=chat_id, text=text)
        except Exception:
            continue
