import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

from tinydb import Query, TinyDB

from app.core.config import get_settings

OrderStatus = Literal[
    "awaiting_payment",
    "printing",
    "delivering",
    "done",
]


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_data_layout() -> tuple[TinyDB, Path]:
    settings = get_settings()
    data_dir = Path(settings.data_dir).resolve()
    jobs_root = data_dir / "jobs"
    data_dir.mkdir(parents=True, exist_ok=True)
    jobs_root.mkdir(parents=True, exist_ok=True)
    db_path = data_dir / "db.json"
    db = TinyDB(str(db_path))
    return db, jobs_root


def admin_chat_file() -> Path:
    settings = get_settings()
    return Path(settings.data_dir).resolve() / "admin.json"


def get_admin_chat_ids() -> List[int]:
    forced = _forced_chat_ids()
    path = admin_chat_file()
    if not path.exists():
        return forced
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return forced

    # Backward compatibility: old format {"chat_id": 123}
    if isinstance(data, dict) and "chat_id" in data:
        try:
            return sorted(set([int(data["chat_id"]), *forced]))
        except (TypeError, ValueError):
            return sorted(set(forced))

    chats = data.get("chat_ids") if isinstance(data, dict) else None
    if not isinstance(chats, list):
        return sorted(set(forced))

    out: List[int] = []
    for cid in chats:
        try:
            out.append(int(cid))
        except (TypeError, ValueError):
            continue
    return sorted(set([*out, *forced]))


def _forced_chat_ids() -> List[int]:
    settings = get_settings()
    raw = settings.telegram_forced_chat_ids.strip()
    if not raw:
        return []
    out: List[int] = []
    for part in raw.split(","):
        p = part.strip()
        if not p:
            continue
        try:
            cid = int(p)
            out.append(cid)
            # Common Telegram migration case: supergroup id may require -100 prefix.
            if cid < 0 and not str(cid).startswith("-100"):
                out.append(int(f"-100{abs(cid)}"))
        except ValueError:
            continue
    return sorted(set(out))


def _save_admin_chat_ids(chat_ids: List[int]) -> None:
    path = admin_chat_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"chat_ids": sorted(set(chat_ids))}, indent=2),
        encoding="utf-8",
    )


def add_admin_chat_id(chat_id: int) -> bool:
    chat_ids = get_admin_chat_ids()
    if chat_id in chat_ids:
        return False
    chat_ids.append(chat_id)
    _save_admin_chat_ids(chat_ids)
    return True


def remove_admin_chat_id(chat_id: int) -> bool:
    chat_ids = get_admin_chat_ids()
    if chat_id not in chat_ids:
        return False
    chat_ids = [cid for cid in chat_ids if cid != chat_id]
    _save_admin_chat_ids(chat_ids)
    return True


def new_job_id() -> str:
    # Folder name: date and time of submission
    return datetime.now().strftime("%Y-%m-%d_%H-%M-%S")


def insert_job(
    db: TinyDB,
    job_id: str,
    *,
    color: str,
    paper: str,
    files_meta: List[Dict[str, Any]],
    total_pages: int,
    total_rub: int,
    tg_message_id: Optional[int],
) -> None:
    table = db.table("jobs")
    table.insert(
        {
            "id": job_id,
            "created_at": _utc_now_iso(),
            "color": color,
            "paper": paper,
            "files": files_meta,
            "total_pages": total_pages,
            "total_rub": total_rub,
            "tg_status": "awaiting_payment",
            "tg_message_id": tg_message_id,
        }
    )


def get_job(db: TinyDB, job_id: str) -> Optional[Dict[str, Any]]:
    table = db.table("jobs")
    Job = Query()
    rows = table.search(Job.id == job_id)
    return rows[0] if rows else None


def list_jobs(db: TinyDB) -> List[Dict[str, Any]]:
    table = db.table("jobs")
    return sorted(table.all(), key=lambda j: j.get("created_at", ""), reverse=True)


def update_job(db: TinyDB, job_id: str, patch: Dict[str, Any]) -> bool:
    table = db.table("jobs")
    Job = Query()
    return bool(table.update(patch, Job.id == job_id))


def delete_jobs(db: TinyDB, job_ids: List[str], jobs_root: Path) -> int:
    table = db.table("jobs")
    Job = Query()
    removed = 0
    for jid in job_ids:
        table.remove(Job.id == jid)
        folder = jobs_root / jid
        if folder.exists():
            shutil.rmtree(folder, ignore_errors=True)
        removed += 1
    return removed


def purge_old_jobs(db: TinyDB, jobs_root: Path, retention_days: int) -> int:
    from datetime import timedelta

    jobs_table = db.table("jobs")
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    old: List[str] = []
    for doc in jobs_table.all():
        try:
            created = datetime.fromisoformat(doc["created_at"].replace("Z", "+00:00"))
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            if created < cutoff:
                old.append(doc["id"])
        except (KeyError, ValueError):
            continue
    if not old:
        return 0
    delete_jobs(db, old, jobs_root)
    return len(old)
