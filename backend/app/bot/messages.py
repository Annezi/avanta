from typing import Any, Dict, List

from telegram import InlineKeyboardButton, InlineKeyboardMarkup

STATUS_LABELS = {
    "awaiting_payment": ("Шаг 1/3", "Ожидание оплаты"),
    "printing": ("Шаг 2/3", "Печать"),
    "delivering": ("Шаг 3/3", "Вручение"),
    "done": ("Готово", "Заказ завершён"),
}


def format_order_caption(
    *,
    job_id: str,
    files_meta: List[Dict[str, Any]],
    total_pages: int,
    total_rub: int,
    status_key: str,
    stage_by: Dict[str, str] | None = None,
) -> str:
    step, title = STATUS_LABELS.get(status_key, ("", status_key))
    stage_by = stage_by or {}
    lines = [
        f"AvantaPrint — новый заказ",
        f"Папка: <code>{job_id}</code>",
        "",
        f"{step} — {title}",
        "",
        "Файлы:",
    ]
    for f in files_meta:
        lines.append(f"• {f['name']} — {f['pages']} стр.")
    lines.extend(
        [
            "",
            f"Всего страниц: {total_pages}",
            f"Сумма: {total_rub} ₽",
            "",
            "1) Проверить оплату от клиента",
            "2) Напечатать заказ",
            "3) Отдать клиенту",
        ]
    )
    if stage_by:
        lines.extend(
            [
                "",
                "Кто закрыл этап:",
                f"Оплата: {stage_by.get('payment_by', '—')}",
                f"Печать: {stage_by.get('printed_by', '—')}",
                f"Вручение: {stage_by.get('delivered_by', '—')}",
            ]
        )
    return "\n".join(lines)


def build_order_keyboard(job_id: str, status_key: str) -> InlineKeyboardMarkup:
    """callback_data kept short; job_id may contain underscores."""
    base = f"o:{job_id}"

    if status_key == "awaiting_payment":
        rows = [
            [InlineKeyboardButton("Заказ оплачен", callback_data=f"{base}:next")],
        ]
    elif status_key == "printing":
        rows = [
            [InlineKeyboardButton("Заказ напечатан", callback_data=f"{base}:next")],
            [InlineKeyboardButton("К прошлому этапу", callback_data=f"{base}:prev")],
        ]
    elif status_key == "delivering":
        rows = [
            [InlineKeyboardButton("Реализовано", callback_data=f"{base}:next")],
            [InlineKeyboardButton("К прошлому этапу", callback_data=f"{base}:prev")],
        ]
    else:
        rows = []

    return InlineKeyboardMarkup(rows)
