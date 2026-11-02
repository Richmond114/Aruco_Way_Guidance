"""Lay out each existing ArUco marker at several physical sizes on an A4 PNG.

Install: python -m pip install Pillow
Run:     python demo/print_markers.py
Print generated PNGs at 100% / actual size, without fitting to the page.
"""

import argparse
from pathlib import Path

try:
    from PIL import Image, ImageChops, ImageDraw, ImageFont
except ImportError:
    raise SystemExit("Missing Pillow. Install it with: python -m pip install Pillow")


BASE = Path(__file__).resolve().parent
PAGE_MM = (210, 297)
MARGIN_MM = 10
GAP_MM = 6
HEADER_MM = 22
LABEL_MM = 8
FRAME_MM = 0.3


def positive_number(value):
    import math

    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise argparse.ArgumentTypeError("must be a finite positive number")
    return number


def read_marker(path):
    """Remove the source image's white padding, preserving its black border."""
    with Image.open(path) as image:
        # Composite transparent input over white before converting to black/white.
        rgba = image.convert("RGBA")
        white = Image.new("RGBA", rgba.size, "white")
        white.alpha_composite(rgba)
        binary = white.convert("L").point(lambda p: 0 if p < 128 else 255)
    bounds = ImageChops.invert(binary).getbbox()
    if bounds is None:
        raise ValueError(f"{path.name}: no black marker found")
    marker = binary.crop(bounds)
    if marker.width != marker.height:
        raise ValueError(f"{path.name}: black marker bounds must be square")
    return marker


def layout(sizes, quiet_mm, px):
    """Pack left to right on one A4 sheet; never silently change requested sizes."""
    margin, gap = px(MARGIN_MM), px(GAP_MM)
    x, y = margin, margin + px(HEADER_MM)
    row_height = 0
    placements = []
    quiet, border = px(quiet_mm), max(1, px(FRAME_MM))
    for size_mm in sizes:
        marker_side = px(size_mm)
        outer = marker_side + 2 * (quiet + border)
        cell_height = outer + px(LABEL_MM)
        if outer > px(PAGE_MM[0]) - 2 * margin:
            raise ValueError(f"{size_mm:g} mm marker is too wide for A4 with these margins")
        if x + outer > px(PAGE_MM[0]) - margin:
            x, y = margin, y + row_height + gap
            row_height = 0
        # Reserve 12 mm at the bottom for a print-scale check.
        if y + cell_height > px(PAGE_MM[1]) - margin - px(12):
            raise ValueError("Sizes do not fit on one A4 image. Use fewer or smaller --sizes-mm.")
        placements.append((x, y, outer, marker_side, size_mm))
        x += outer + gap
        row_height = max(row_height, cell_height)
    return placements, quiet, border


def make_sheet(marker, name, sizes, dpi, quiet_mm):
    def px(mm):
        return round(mm * dpi / 25.4)

    placements, quiet, border = layout(sizes, quiet_mm, px)
    sheet = Image.new("L", (px(PAGE_MM[0]), px(PAGE_MM[1])), 255)
    draw = ImageDraw.Draw(sheet)
    title_font = ImageFont.load_default(size=max(12, px(4)))
    label_font = ImageFont.load_default(size=max(10, px(3)))
    draw.text((px(MARGIN_MM), px(MARGIN_MM)), f"ArUco / {name}", font=title_font, fill=0)
    draw.text((px(MARGIN_MM), px(MARGIN_MM + 7)),
              "A4 | Print at 100% / actual size | Sizes = black marker side",
              font=label_font, fill=0)

    for x, y, outer, marker_side, size_mm in placements:
        # The cutting frame is separate from the marker's own black border.
        draw.rectangle((x, y, x + outer - 1, y + outer - 1), outline=0, width=border)
        resized = marker.resize((marker_side, marker_side), Image.Resampling.NEAREST)
        sheet.paste(resized, (x + border + quiet, y + border + quiet))
        draw.text((x, y + outer + px(1)), f"{size_mm:g} x {size_mm:g} mm",
                  font=label_font, fill=0)

    x, y = px(MARGIN_MM), px(PAGE_MM[1] - MARGIN_MM - 4)
    draw.line((x, y, x + px(50), y), fill=0, width=border)
    for endpoint in (x, x + px(50)):
        draw.line((endpoint, y - px(1.5), endpoint, y + px(1.5)), fill=0, width=border)
    draw.text((x + px(54), y - px(2)), "50 mm print-scale check", font=label_font, fill=0)
    return sheet


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input-dir", type=Path, default=BASE / "markers")
    parser.add_argument("--output-dir", type=Path, default=BASE / "print_sheets")
    parser.add_argument("--sizes-mm", type=positive_number, nargs="+", default=[30, 40, 50, 60, 80],
                        help="black marker side lengths in mm (default: 30 40 50 60 80)")
    parser.add_argument("--dpi", type=int, default=300, help="print resolution, 72-1200 (default: 300)")
    parser.add_argument("--quiet-mm", type=positive_number, default=5,
                        help="white gap between marker and cutting frame, at least 3 mm (default: 5)")
    args = parser.parse_args()
    if not 72 <= args.dpi <= 1200:
        parser.error("--dpi must be between 72 and 1200")
    if args.quiet_mm < 3:
        parser.error("--quiet-mm must be at least 3 to separate the cutting frame from the marker")
    paths = sorted(args.input_dir.glob("marker_*.png"))
    if not paths:
        parser.error(f"No marker_*.png images in {args.input_dir}")
    # Validate all inputs and the layout before writing any sheet.
    try:
        layout(args.sizes_mm, args.quiet_mm, lambda mm: round(mm * args.dpi / 25.4))
        markers = [(path, read_marker(path)) for path in paths]
    except (OSError, ValueError) as error:
        parser.error(str(error))
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for path, marker in markers:
        sheet = make_sheet(marker, path.stem, args.sizes_mm, args.dpi, args.quiet_mm)
        output = args.output_dir / f"{path.stem}_A4.png"
        sheet.save(output, dpi=(args.dpi, args.dpi), optimize=True)
        print(f"{output} | {sheet.width} x {sheet.height} px | {args.dpi} DPI")
    print("Print at 100% / actual size. Disable fit-to-page. Check the 50 mm scale with a ruler.")


if __name__ == "__main__":
    main()
