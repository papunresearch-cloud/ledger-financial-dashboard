"""Generate multi-resolution Windows .ico asset for Ledger desktop & installer."""
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw


def build_ledger_icon(output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    size = 512
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded dark emerald tile matching Ledger brand-mark (#102d2b)
    pad = 24
    radius = 112
    draw.rounded_rectangle(
        [pad, pad, size - pad, size - pad],
        radius=radius,
        fill=(16, 45, 43, 255),
        outline=(22, 139, 114, 255),
        width=12,
    )

    # Subtle inner highlight ring
    draw.rounded_rectangle(
        [pad + 18, pad + 18, size - pad - 18, size - pad - 18],
        radius=radius - 16,
        outline=(56, 189, 155, 65),
        width=4,
    )

    # Activity pulse line matching Ledger's Lucide Activity mark (#d6f27c)
    points = [
        (104, 272),
        (172, 272),
        (214, 154),
        (276, 368),
        (332, 212),
        (366, 272),
        (408, 272),
    ]
    draw.line(points, fill=(214, 242, 124, 255), width=32, joint="curve")
    for px, py in points:
        r = 16
        draw.ellipse([px - r, py - r, px + r, py + r], fill=(214, 242, 124, 255))

    # Signature accent dot (#168b72 / bright mint #34d399) at bottom-right
    dot_r = 22
    dot_cx, dot_cy = 394, 386
    draw.ellipse(
        [dot_cx - dot_r, dot_cy - dot_r, dot_cx + dot_r, dot_cy + dot_r],
        fill=(52, 211, 153, 255),
    )

    png_path = output_path.with_suffix(".png")
    img.resize((256, 256), Image.Resampling.LANCZOS).save(png_path, format="PNG")
    img.save(
        output_path,
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )


if __name__ == "__main__":
    target = Path(__file__).resolve().parent / "assets" / "Ledger.ico"
    build_ledger_icon(target)
    print(f"Generated {target}")
