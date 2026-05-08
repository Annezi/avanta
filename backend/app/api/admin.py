import io
import zipfile
from pathlib import Path
from typing import Annotated, List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from app.core.security import require_admin
from app.core.storage import ensure_data_layout, get_job, list_jobs
from app.core.storage import delete_jobs as storage_delete_jobs

router = APIRouter(prefix="/api/folders", tags=["admin"])


class FolderSummary(BaseModel):
    id: str
    created_at: str
    total_pages: int
    total_rub: int
    color: str
    paper: str
    tg_status: str


class FolderDetail(BaseModel):
    id: str
    created_at: str
    files: List[dict]
    print_pdfs: List[str]
    raw_files: List[str]
    total_pages: int
    total_rub: int


class DeleteBody(BaseModel):
    ids: List[str]


@router.get("", response_model=List[FolderSummary])
def list_folders(_: Annotated[str, Depends(require_admin)]) -> List[FolderSummary]:
    db, _ = ensure_data_layout()
    out: List[FolderSummary] = []
    for j in list_jobs(db):
        out.append(
            FolderSummary(
                id=j["id"],
                created_at=j["created_at"],
                total_pages=j["total_pages"],
                total_rub=j["total_rub"],
                color=j.get("color", "bw"),
                paper=j.get("paper", "a4"),
                tg_status=j.get("tg_status", "awaiting_payment"),
            )
        )
    return out


@router.get("/{job_id}", response_model=FolderDetail)
def folder_detail(
    job_id: str,
    _: Annotated[str, Depends(require_admin)],
) -> FolderDetail:
    db, jobs_root = ensure_data_layout()
    job = get_job(db, job_id)
    if not job:
        raise HTTPException(404, detail="Not found")
    print_dir = jobs_root / job_id / "print"
    pdfs = sorted([p.name for p in print_dir.glob("*.pdf")]) if print_dir.is_dir() else []
    raw_dir = jobs_root / job_id / "raw"
    raws = sorted([p.name for p in raw_dir.iterdir() if p.is_file()]) if raw_dir.is_dir() else []
    return FolderDetail(
        id=job["id"],
        created_at=job["created_at"],
        files=job["files"],
        print_pdfs=pdfs,
        raw_files=raws,
        total_pages=job["total_pages"],
        total_rub=job["total_rub"],
    )


@router.get("/{job_id}/zip")
def download_zip(
    job_id: str,
    _: Annotated[str, Depends(require_admin)],
):
    db, jobs_root = ensure_data_layout()
    job = get_job(db, job_id)
    if not job:
        raise HTTPException(404, detail="Not found")
    print_dir = jobs_root / job_id / "print"
    if not print_dir.is_dir():
        raise HTTPException(404, detail="Print folder missing")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for pdf in sorted(print_dir.glob("*.pdf")):
            zf.write(pdf, arcname=pdf.name)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{job_id}.zip"',
        },
    )


@router.get("/{job_id}/files/{filename}")
def download_file(
    job_id: str,
    filename: str,
    _: Annotated[str, Depends(require_admin)],
):
    db, jobs_root = ensure_data_layout()
    job = get_job(db, job_id)
    if not job:
        raise HTTPException(404, detail="Not found")
    safe = Path(filename).name
    path = jobs_root / job_id / "print" / safe
    if not path.is_file():
        raise HTTPException(404, detail="File not found")
    return FileResponse(path, filename=safe, media_type="application/pdf")


@router.get("/{job_id}/raw/{filename}")
def download_raw_file(
    job_id: str,
    filename: str,
    _: Annotated[str, Depends(require_admin)],
):
    db, jobs_root = ensure_data_layout()
    job = get_job(db, job_id)
    if not job:
        raise HTTPException(404, detail="Not found")
    safe = Path(filename).name
    path = jobs_root / job_id / "raw" / safe
    if not path.is_file():
        raise HTTPException(404, detail="File not found")
    return FileResponse(path, filename=safe, media_type="application/octet-stream")


@router.get("/{job_id}/raw-zip")
def download_raw_zip(
    job_id: str,
    _: Annotated[str, Depends(require_admin)],
):
    db, jobs_root = ensure_data_layout()
    job = get_job(db, job_id)
    if not job:
        raise HTTPException(404, detail="Not found")
    raw_dir = jobs_root / job_id / "raw"
    if not raw_dir.is_dir():
        raise HTTPException(404, detail="Raw folder missing")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in sorted(raw_dir.iterdir()):
            if f.is_file():
                zf.write(f, arcname=f.name)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{job_id}-raw.zip"',
        },
    )


@router.delete("", status_code=204)
def delete_folders(
    body: DeleteBody,
    _: Annotated[str, Depends(require_admin)],
) -> None:
    db, jobs_root = ensure_data_layout()
    storage_delete_jobs(db, body.ids, jobs_root)
