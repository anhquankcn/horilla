"""
Generate PWA icons for HNH Travel HRM.
Outputs: pwa/frontend/public/icons/{icon-192.png, icon-512.png, apple-touch-icon.png}
"""
import os, struct, zlib
from PIL import Image, ImageDraw, ImageFont

OUT_DIR = os.path.join(os.path.dirname(__file__), "frontend", "public", "icons")
os.makedirs(OUT_DIR, exist_ok=True)

NAVY      = (20,  43, 111)   # #142B6F
NAVY_DARK = (10,  22,  65)   # #0a1641
RED       = (192, 34,  43)   # #c0222b
GOLD      = (212,160,  23)   # #d4a017
WHITE     = (255, 255, 255)

def load_font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    candidates = (
        ["segoeuib.ttf", "seguibl.ttf", "arialbd.ttf", "calibrib.ttf", "DejaVuSans-Bold.ttf"]
        if bold else
        ["segoeui.ttf", "arial.ttf", "calibri.ttf", "DejaVuSans.ttf"]
    )
    for name in candidates:
        for d in [
            "C:/Windows/Fonts",
            "/usr/share/fonts/truetype/dejavu",
            "/usr/share/fonts",
        ]:
            path = os.path.join(d, name)
            if os.path.exists(path):
                return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)

def draw_rounded_rect(draw: ImageDraw.ImageDraw, box, radius: int, fill):
    x0, y0, x1, y1 = box
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=fill)

def create_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    r = size // 5   # corner radius

    # ── Background: navy gradient-ish (dark top → lighter bottom) ──
    for y in range(size):
        t = y / size
        c = tuple(int(NAVY_DARK[i] + (NAVY[i] - NAVY_DARK[i]) * t) for i in range(3))
        draw.rectangle([0, y, size - 1, y], fill=(*c, 255))
    # Clip to rounded rect by masking
    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=255)
    img.putalpha(mask)

    draw = ImageDraw.Draw(img)

    # ── Red accent stripe at top ──
    stripe_h = max(4, size // 18)
    # Draw only inside rounded corners: fill corners with navy first
    draw.rectangle([0, 0, size - 1, stripe_h + r], fill=(*NAVY_DARK, 255))
    mask2 = Image.new("L", (size, size), 0)
    m2d = ImageDraw.Draw(mask2)
    m2d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=255)
    img.putalpha(mask2)
    draw = ImageDraw.Draw(img)
    # Red stripe (clipped to rounded rect via overpaint of corners)
    draw.rectangle([r, 0, size - 1 - r, stripe_h], fill=(*RED, 255))
    draw.rounded_rectangle([0, 0, size - 1, stripe_h + r], radius=r, fill=(*NAVY_DARK, 255))
    # Simple approach: just draw stripe in the safe zone
    stripe_top = size // 16
    stripe_bot = stripe_top + stripe_h
    draw.rectangle([0, stripe_top, size - 1, stripe_bot], fill=(*RED, 255))

    # ── "HNH" main text ──
    main_fs = int(size * 0.34)
    main_font = load_font(main_fs, bold=True)
    main_text = "HNH"
    bbox = draw.textbbox((0, 0), main_text, font=main_font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (size - tw) // 2 - bbox[0]
    ty = int(size * 0.30)
    draw.text((tx, ty), main_text, font=main_font, fill=(*WHITE, 255))

    # ── "TRAVEL" subtitle ──
    sub_fs = int(size * 0.095)
    sub_font = load_font(sub_fs, bold=False)
    sub_text = "TRAVEL"
    sbbox = draw.textbbox((0, 0), sub_text, font=sub_font)
    sw = sbbox[2] - sbbox[0]
    sx = (size - sw) // 2 - sbbox[0]
    sy = ty + th + int(size * 0.04)
    draw.text((sx, sy), sub_text, font=sub_font, fill=(*GOLD, 230))

    # ── Gold dot accent ──
    dot_r = max(3, size // 50)
    dot_x = size // 2
    dot_y = sy + (sbbox[3] - sbbox[1]) + int(size * 0.055)
    draw.ellipse([dot_x - dot_r, dot_y - dot_r, dot_x + dot_r, dot_y + dot_r],
                 fill=(*GOLD, 200))

    return img


for sz, name in [(192, "icon-192.png"), (512, "icon-512.png"), (180, "apple-touch-icon.png")]:
    icon = create_icon(sz)
    out_path = os.path.join(OUT_DIR, name)
    icon.save(out_path, "PNG")
    print(f"  OK {name}  ({sz}x{sz})")

print(f"\nIcons saved to: {OUT_DIR}")
