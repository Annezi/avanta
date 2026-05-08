from pathlib import Path
from typing import Annotated, List, Literal

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel
import logging

from app.bot.messages import build_order_keyboard, format_order_caption
from app.core.converter import convert_input_to_print_pdf, is_allowed_file
from app.core.pricing import total_rub
from app.core.storage import (
    ensure_data_layout,
    get_admin_chat_ids,
    insert_job,
    new_job_id,
    update_job,
)

router = APIRouter(prefix="/api", tags=["upload"])
logger = logging.getLogger(__name__)


class FileInfo(BaseModel):
    name: str
    pages: int


class UploadResponse(BaseModel):
    job_id: str
    files: List[FileInfo]
    total_pages: int
    total_rub: int


@router.post("/upload", response_model=UploadResponse)
async def upload_files(
    request: Request,
    files: Annotated[List[UploadFile], File(...)],
    color: Annotated[Literal["bw", "color"], Form()],
    paper: Annotated[Literal["a4", "a3"], Form()],
) -> UploadResponse:
    if not files:
        raise HTTPException(400, detail="No files")

    db, jobs_root = ensure_data_layout()
    job_id = new_job_id()
    raw_dir = jobs_root / job_id / "raw"
    print_dir = jobs_root / job_id / "print"
    raw_dir.mkdir(parents=True, exist_ok=True)
    print_dir.mkdir(parents=True, exist_ok=True)

    files_meta: List[dict] = []
    total_pages = 0
    idx = 0

    for upload in files:
        name = Path(upload.filename or "file").name
        if not is_allowed_file(name):
            raise HTTPException(400, detail=f"File type not allowed: {name}")

        safe_name = f"{idx}_{name}"
        idx += 1
        dest_raw = raw_dir / safe_name
        content = await upload.read()
        dest_raw.write_bytes(content)

        out_pdf = print_dir / f"{Path(safe_name).stem}.pdf"
        try:
            pages = convert_input_to_print_pdf(dest_raw, out_pdf)
        except Exception as e:
            raise HTTPException(
                500,
                detail=f"Could not process {name}: {e!s}",
            ) from e

        display_name = name
        files_meta.append({"name": display_name, "pages": pages, "print_name": out_pdf.name})
        total_pages += pages

    amount = total_rub(total_pages, color, paper)

    insert_job(
        db,
        job_id,
        color=color,
        paper=paper,
        files_meta=[{"name": f["name"], "pages": f["pages"]} for f in files_meta],
        total_pages=total_pages,
        total_rub=amount,
        tg_message_id=None,
    )

    bot = getattr(request.app.state, "telegram_bot", None)
    chat_ids = get_admin_chat_ids()
    if bot is not None and chat_ids:
        caption = format_order_caption(
            job_id=job_id,
            files_meta=files_meta,
            total_pages=total_pages,
            total_rub=amount,
            status_key="awaiting_payment",
            stage_by={
                "payment_by": "",
                "printed_by": "",
                "delivered_by": "",
            },
        )
        keyboard = build_order_keyboard(job_id, "awaiting_payment")

        first_message_id = None
        failed_chat_ids: list[int] = []
        for chat_id in chat_ids:
            try:
                msg = await bot.send_message(
                    chat_id=chat_id,
                    text=caption,
                    reply_markup=keyboard,
                    parse_mode="HTML",
                )
                if first_message_id is None:
                    first_message_id = msg.message_id
            except Exception as exc:
                failed_chat_ids.append(chat_id)
                logger.warning("Telegram send failed for chat_id=%s: %s", chat_id, exc)
                continue

        if first_message_id is not None:
            update_job(db, job_id, {"tg_message_id": first_message_id})
        else:
            logger.error(
                "No Telegram notifications were delivered for job_id=%s; attempted chat_ids=%s failed=%s",
                job_id,
                chat_ids,
                failed_chat_ids,
            )

    return UploadResponse(
        job_id=job_id,
        files=[FileInfo(name=f["name"], pages=f["pages"]) for f in files_meta],
        total_pages=total_pages,
        total_rub=amount,
    )
