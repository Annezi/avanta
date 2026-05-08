from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from app.core.security import require_admin
from app.core.storage import get_admin_chat_ids

router = APIRouter(prefix="/api/debug", tags=["debug"])


class TelegramDebugResponse(BaseModel):
    chat_ids: list[int]
    bot_ready: bool


@router.get("/telegram", response_model=TelegramDebugResponse)
def telegram_debug(_: Annotated[str, Depends(require_admin)], request: Request) -> TelegramDebugResponse:
    bot = getattr(request.app.state, "telegram_bot", None)
    return TelegramDebugResponse(chat_ids=get_admin_chat_ids(), bot_ready=bot is not None)


@router.post("/telegram/test")
async def telegram_test(_: Annotated[str, Depends(require_admin)], request: Request) -> dict[str, Any]:
    bot = getattr(request.app.state, "telegram_bot", None)
    chat_ids = get_admin_chat_ids()
    if bot is None:
        return {"ok": False, "error": "telegram bot is not initialized", "chat_ids": chat_ids}

    delivered: list[int] = []
    failed: list[dict[str, str]] = []
    for cid in chat_ids:
        try:
            await bot.send_message(chat_id=cid, text="AvantaPrint: тестовое уведомление бота.")
            delivered.append(cid)
        except Exception as exc:
            failed.append({"chat_id": str(cid), "error": str(exc)})

    return {"ok": len(delivered) > 0, "chat_ids": chat_ids, "delivered": delivered, "failed": failed}
