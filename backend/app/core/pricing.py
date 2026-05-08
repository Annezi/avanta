from typing import Literal

PaperFormat = Literal["a4", "a3"]
ColorMode = Literal["bw", "color"]

# Prices per printed sheet (plan)
PRICES = {
    ("bw", "a4"): 20,
    ("bw", "a3"): 40,
    ("color", "a4"): 50,
    ("color", "a3"): 100,
}


def total_rub(total_pages: int, color: ColorMode, paper: PaperFormat) -> int:
    if total_pages <= 0:
        return 0
    rate = PRICES[(color, paper)]
    return total_pages * rate
