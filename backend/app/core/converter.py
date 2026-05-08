from __future__ import annotations

import io
import subprocess
import tempfile
from pathlib import Path
from typing import Set, Tuple

import fitz  # PyMuPDF
from PIL import Image, ImageOps
from pypdf import PdfReader
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from app.core.config import get_settings

# Printable / allowed (whitelist)
ALLOWED_EXTENSIONS: Set[str] = {
    "pdf",
    "png",
    "jpg",
    "jpeg",
    "gif",
    "bmp",
    "tif",
    "tiff",
    "webp",
    "heic",
    "heif",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "ppt",
    "pptx",
    "odt",
    "ods",
    "odp",
    "rtf",
    "txt",
}

BLOCKED_EXTENSIONS: Set[str] = {
    "exe",
    "bat",
    "cmd",
    "ps1",
    "sh",
    "vbs",
    "msi",
    "dll",
    "scr",
    "js",
    "jar",
    "lnk",
    "com",
    "reg",
    "app",
    "deb",
    "rpm",
}


def is_allowed_file(filename: str) -> bool:
    ext = Path(filename).suffix.lower().lstrip(".")
    if ext in BLOCKED_EXTENSIONS:
        return False
    return ext in ALLOWED_EXTENSIONS


def count_pdf_pages(path: Path) -> int:
    reader = PdfReader(str(path))
    return len(reader.pages)


def _a4_size_pt() -> Tuple[float, float]:
    # reportlab A4 is (width, height) in points, portrait
    w, h = A4
    return float(w), float(h)


def _mm_to_pt(mm: float) -> float:
    return mm * 72.0 / 25.4


def _fit_rect_inside_margins(
    iw: int,
    ih: int,
    page_w: float,
    page_h: float,
    margin_pt: float,
) -> tuple[float, float, float, float]:
    """
    Proportionally fit inside printable area with margins.
    Keeps the full image visible and preserves side/top margins.
    Returns x, y, draw_w, draw_h in PDF point coordinates.
    """
    target_w = max(1.0, page_w - 2 * margin_pt)
    target_h = max(1.0, page_h - 2 * margin_pt)
    scale = min(target_w / iw, target_h / ih)
    draw_w = iw * scale
    draw_h = ih * scale
    x = margin_pt + (target_w - draw_w) / 2
    y = margin_pt + (target_h - draw_h) / 2
    return x, y, draw_w, draw_h


def _fit_by_long_side(
    iw: int,
    ih: int,
    page_w: float,
    page_h: float,
    margin_pt: float,
) -> tuple[float, float, float, float]:
    """
    Scale by long side: content long side equals printable area long side.
    Keeps proportions; short side may crop or letterbox.
    """
    target_w = max(1.0, page_w - 2 * margin_pt)
    target_h = max(1.0, page_h - 2 * margin_pt)
    target_long = max(target_w, target_h)
    src_long = max(iw, ih)
    scale = target_long / src_long
    draw_w = iw * scale
    draw_h = ih * scale
    x = margin_pt + (target_w - draw_w) / 2
    y = margin_pt + (target_h - draw_h) / 2
    return x, y, draw_w, draw_h


def image_to_a4_pdf(src: Path, dst_pdf: Path) -> None:
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        iw, ih = im.size
        # Keep long side vertical for A4 portrait page.
        if iw < ih:
            im = im.rotate(90, expand=True)
            iw, ih = im.size

        page_w, page_h = _a4_size_pt()
        margin_pt = _mm_to_pt(5.0)  # visible 5mm margin from each side

        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=A4)

        ir = ImageReader(im)
        x, y, dw, dh = _fit_by_long_side(iw, ih, page_w, page_h, margin_pt)
        c.saveState()
        path = c.beginPath()
        path.rect(margin_pt, margin_pt, page_w - 2 * margin_pt, page_h - 2 * margin_pt)
        c.clipPath(path, stroke=0, fill=0)
        c.drawImage(ir, x, y, width=dw, height=dh, preserveAspectRatio=True, mask="auto")
        c.restoreState()
        c.showPage()
        c.save()
        dst_pdf.write_bytes(buf.getvalue())


def _pdf_pages_to_a4_vector_safe(src_pdf: Path, dst_pdf: Path) -> None:
    """Render each page preserving original orientation and long-side fitting."""
    src_doc = fitz.open(src_pdf)
    margin_pt = _mm_to_pt(5.0)

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)

    for i in range(len(src_doc)):
        page = src_doc.load_page(i)
        # Keep original orientation for office/PDF pages.
        is_landscape = page.rect.width > page.rect.height
        page_size = (A4[1], A4[0]) if is_landscape else A4
        page_w, page_h = float(page_size[0]), float(page_size[1])
        c.setPageSize((page_w, page_h))
        rotate = 0
        pix = page.get_pixmap(matrix=fitz.Matrix(4, 4).prerotate(rotate), alpha=False)
        pil = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        x, y, dw, dh = _fit_by_long_side(pil.width, pil.height, page_w, page_h, margin_pt)
        c.saveState()
        path = c.beginPath()
        path.rect(margin_pt, margin_pt, page_w - 2 * margin_pt, page_h - 2 * margin_pt)
        c.clipPath(path, stroke=0, fill=0)
        c.drawImage(ImageReader(pil), x, y, width=dw, height=dh, preserveAspectRatio=True, mask="auto")
        c.restoreState()
        c.showPage()

    c.save()
    dst_pdf.write_bytes(buf.getvalue())
    src_doc.close()


def office_to_pdf(src: Path, out_dir: Path) -> Path:
    settings = get_settings()
    soffice = settings.libreoffice_path
    out_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        soffice,
        "--headless",
        "--convert-to",
        "pdf",
        "--outdir",
        str(out_dir),
        str(src),
    ]
    subprocess.run(cmd, check=True, capture_output=True, text=True)
    expected = out_dir / (src.stem + ".pdf")
    if not expected.exists():
        raise RuntimeError(f"LibreOffice did not produce {expected}")
    return expected


def convert_input_to_print_pdf(src: Path, dst_pdf: Path) -> int:
    """
    Convert any supported input to print-ready A4 PDF at dst_pdf.
    Returns page count.
    """
    ext = src.suffix.lower().lstrip(".")

    if ext in {"png", "jpg", "jpeg", "gif", "bmp", "tif", "tiff", "webp", "heic", "heif"}:
        image_to_a4_pdf(src, dst_pdf)
        return count_pdf_pages(dst_pdf)

    if ext == "pdf":
        _pdf_pages_to_a4_vector_safe(src, dst_pdf)
        return count_pdf_pages(dst_pdf)

    if ext in {
        "doc",
        "docx",
        "xls",
        "xlsx",
        "ppt",
        "pptx",
        "odt",
        "ods",
        "odp",
        "rtf",
        "txt",
    }:
        with tempfile.TemporaryDirectory() as td:
            td_path = Path(td)
            intermediate = office_to_pdf(src, td_path)
            _pdf_pages_to_a4_vector_safe(intermediate, dst_pdf)
        return count_pdf_pages(dst_pdf)

    raise ValueError(f"Unsupported extension: {ext}")
