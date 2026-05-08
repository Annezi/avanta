from telegram import Update
from telegram.ext import ContextTypes

from app.bot.messages import build_order_keyboard, format_order_caption
from app.core.config import get_settings
from app.core.storage import (
    add_admin_chat_id,
    ensure_data_layout,
    get_job,
    remove_admin_chat_id,
    update_job,
)


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    settings = get_settings()
    args = context.args or []
    if not args or args[0] != settings.bot_registration_secret:
        await update.effective_message.reply_text(
            "Доступ запрещён. Используйте /start <секрет>.",
        )
        return

    chat = update.effective_chat
    if chat is None:
        return

    added = add_admin_chat_id(chat.id)
    if added:
        await update.effective_message.reply_text(
            "Этот чат подключен к уведомлениям AvantaPrint.",
        )
    else:
        await update.effective_message.reply_text(
            "Этот чат уже подключен к уведомлениям.",
        )


async def cmd_stop(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    settings = get_settings()
    args = context.args or []
    if not args or args[0] != settings.bot_registration_secret:
        await update.effective_message.reply_text("Неверный секрет.")
        return

    chat = update.effective_chat
    if chat is None:
        return

    removed = remove_admin_chat_id(chat.id)
    if removed:
        await update.effective_message.reply_text("Чат отключен от уведомлений.")
    else:
        await update.effective_message.reply_text("Этот чат не был подключен.")


def _parse_callback(data: str) -> tuple[str | None, str | None]:
    """Returns (job_id, action) where action is next|prev."""
    if not data.startswith("o:"):
        return None, None
    body = data[2:]
    idx = body.rfind(":")
    if idx <= 0:
        return None, None
    job_id = body[:idx]
    action = body[idx + 1 :]
    return job_id, action


ORDER_FLOW = ("awaiting_payment", "printing", "delivering", "done")


def _actor_label(update: Update) -> str:
    user = update.effective_user
    if user is None:
        return "неизвестно"
    if user.username:
        return f"@{user.username}"
    full_name = " ".join([x for x in [user.first_name, user.last_name] if x]).strip()
    if full_name:
        return full_name
    return str(user.id)


async def on_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if query is None or query.data is None:
        return
    await query.answer()

    job_id, action = _parse_callback(query.data)
    if not job_id or action not in ("next", "prev"):
        return

    db, _ = ensure_data_layout()
    job = get_job(db, job_id)
    if not job:
        await query.edit_message_text("Заявка не найдена (возможно удалена).")
        return

    status = job.get("tg_status", "awaiting_payment")
    if status == "done":
        return

    try:
        idx = ORDER_FLOW.index(status)
    except ValueError:
        idx = 0

    if action == "next":
        new_idx = min(idx + 1, len(ORDER_FLOW) - 1)
    else:
        new_idx = max(idx - 1, 0)
    new_status = ORDER_FLOW[new_idx]
    actor = _actor_label(update)

    stage_by = {
        "payment_by": job.get("payment_by", ""),
        "printed_by": job.get("printed_by", ""),
        "delivered_by": job.get("delivered_by", ""),
    }

    # Record who closed the stage. If moved back, clear subsequent stage markers.
    if action == "next":
        if status == "awaiting_payment" and new_status == "printing":
            stage_by["payment_by"] = actor
        elif status == "printing" and new_status == "delivering":
            stage_by["printed_by"] = actor
        elif status == "delivering" and new_status == "done":
            stage_by["delivered_by"] = actor
    else:
        if status == "printing" and new_status == "awaiting_payment":
            stage_by["payment_by"] = ""
            stage_by["printed_by"] = ""
            stage_by["delivered_by"] = ""
        elif status == "delivering" and new_status == "printing":
            stage_by["printed_by"] = ""
            stage_by["delivered_by"] = ""
        elif status == "done" and new_status == "delivering":
            stage_by["delivered_by"] = ""

    files_meta = [
        {"name": f["name"], "pages": f["pages"]} for f in job.get("files", [])
    ]
    caption = format_order_caption(
        job_id=job_id,
        files_meta=files_meta,
        total_pages=job["total_pages"],
        total_rub=job["total_rub"],
        status_key=new_status if new_status != "done" else "done",
        stage_by=stage_by,
    )

    if new_status == "done":
        await query.edit_message_text(caption, parse_mode="HTML")
        update_job(db, job_id, {"tg_status": "done", **stage_by})
        return

    keyboard = build_order_keyboard(job_id, new_status)
    await query.edit_message_text(
        caption,
        reply_markup=keyboard,
        parse_mode="HTML",
    )
    update_job(db, job_id, {"tg_status": new_status, **stage_by})
