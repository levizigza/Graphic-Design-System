"""Patch the exact Open PATH PRO employer flyer PNG with correct OpenPath info."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import numpy as np

root = Path(
    r"C:\Users\levyz\OneDrive\Microsoft Copilot Chat Files\Documents\Graphic Design System\jobs\openpath-employer-flyer"
)
ref_path = Path(
    r"C:\Users\levyz\.cursor\projects\c-Users-levyz-OneDrive-Microsoft-Copilot-Chat-Files-Documents-Graphic-Design-System\assets\openpath-employer-flyer-preview.png"
)
logo_path = root / "assets" / "OpenPath-Logo-horizontal.JPG"
qr_path = root / "assets" / "qr-employer-contact.png"

out_png = root / "exports" / "OpenPath-Employer-Flyer-V2-exact.png"
out_jpg = root / "exports" / "OpenPath-Employer-Flyer-V2-exact.jpg"
out_letter = root / "exports" / "OpenPath-Employer-Flyer-V2-exact-letter.jpg"
out_pdf = root / "exports" / "OpenPath-Employer-Flyer-V2-exact.pdf"
out_prev = root / "exports" / "OpenPath-Employer-Flyer-V2-exact-preview.jpg"

im = Image.open(ref_path).convert("RGB")
arr = np.array(im)
w, h = im.size
paper = tuple(int(x) for x in arr[30, 500])
navy = (1, 30, 68)
draw = ImageDraw.Draw(im)

# --- Logo: cover OPEN PATH PRO lockup, paste official horizontal logo ---
draw.rectangle((24, 24, 500, 108), fill=paper)
logo = Image.open(logo_path).convert("RGB")
la = np.array(logo)
mask = ~((la[:, :, 0] > 248) & (la[:, :, 1] > 248) & (la[:, :, 2] > 248))
ys = np.where(mask.any(axis=1))[0]
xs = np.where(mask.any(axis=0))[0]
logo = logo.crop((max(0, xs[0] - 2), max(0, ys[0] - 2), min(logo.width, xs[-1] + 3), min(logo.height, ys[-1] + 3)))
target_h = 66
logo = logo.resize((int(logo.width * (target_h / logo.height)), target_h), Image.Resampling.LANCZOS)
im.paste(logo, (36, 33))

# --- Contact lines: keep gold icons, replace text only ---
text_left = 108
text_right = 735
# Icon-centered contact rows measured on the 1024x1536 PNG
contact_rows = [
    (1384, 1410),  # phone
    (1416, 1442),  # email
    (1448, 1474),  # website
    (1480, 1510),  # address
]
for top, bottom in contact_rows:
    draw.rectangle((text_left, top, text_right, min(bottom, h - 1)), fill=navy)

fp = r"C:\Windows\Fonts\segoeui.ttf"
if not Path(fp).exists():
    fp = r"C:\Windows\Fonts\arial.ttf"
font = ImageFont.truetype(fp, 20)
font_md = ImageFont.truetype(fp, 18)
font_sm = ImageFont.truetype(fp, 15)

contacts = [
    ("(587) 392-5044", (255, 255, 255), font, 1398),
    ("info@openpathplacementagency.com", (223, 193, 92), font_md, 1429),
    ("openpathplacementagency.com", (223, 193, 92), font_md, 1461),
    ("#10, 3745 Memorial Dr E, Calgary, AB T2A 6V4", (255, 255, 255), font_sm, 1494),
]
for txt, color, f, cy in contacts:
    bbox = draw.textbbox((0, 0), txt, font=f)
    th = bbox[3] - bbox[1]
    draw.text((text_left, cy - th // 2), txt, fill=color, font=f)

# --- QR inside gold frame (measured ~750-911, 1350-1492) ---
# Place QR on the white pad inside the gold border without covering the border
qr_pad = (762, 1362, 900, 1500)
x0, y0, x1, y1 = qr_pad
draw.rectangle((x0, y0, x1, y1), fill=(255, 255, 255))
inset = 6
qw = (x1 - x0) - 2 * inset
qr = Image.open(qr_path).convert("RGB").resize((qw, qw), Image.Resampling.LANCZOS)
im.paste(qr, (x0 + inset, y0 + inset))

im.save(out_png)
im.save(out_jpg, quality=96)
letter = im.resize((2550, 3300), Image.Resampling.LANCZOS)
letter.save(out_letter, quality=95)
letter.save(out_pdf, "PDF", resolution=300.0)
prev = im.copy()
prev.thumbnail((720, 1080))
prev.save(out_prev, quality=92)
print("OK", out_png)
print("PDF", out_pdf)
