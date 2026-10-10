#!/usr/bin/env python3
"""Regenerate the app icons (rainbow gradient + white sine wave). Needs Pillow.

Usage: python3 tools/make-icons.py
iOS applies its own rounded mask, so the apple-touch-icon is full-bleed and opaque.
"""
import colorsys
import math
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"


def render(size, safe=1.0):
    ss = 3  # supersample for a smooth wave edge
    n = size * ss
    img = Image.new("RGB", (n, n))
    px = img.load()
    for x in range(n):
        r, g, b = colorsys.hls_to_rgb((x / n) * (300 / 360), 0.52, 0.68)
        for y in range(n):
            shade = 1 - 0.45 * max(0, (y / n - 0.5) * 2)  # darker towards the bottom, like the app
            px[x, y] = (int(r * 255 * shade), int(g * 255 * shade), int(b * 255 * shade))
    d = ImageDraw.Draw(img)
    pad = n * (1 - safe) / 2 + n * 0.14
    width = max(2, int(n * 0.06))
    r = width / 2
    # stamp overlapping discs along the curve — avoids the spiky joins of a polyline
    for i in range(1601):
        t = i / 1600
        x = pad + t * (n - 2 * pad)
        y = n / 2 - math.sin(t * 2 * math.pi * 1.5) * n * 0.16 * safe
        d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 255, 255))
    return img.resize((size, size), Image.LANCZOS)


OUT.mkdir(exist_ok=True)
render(180).save(OUT / "apple-touch-icon.png")
render(192).save(OUT / "icon-192.png")
render(512).save(OUT / "icon-512.png")
render(512, safe=0.8).save(OUT / "icon-maskable-512.png")  # Android maskable: art kept inside the safe zone
print("wrote", sorted(p.name for p in OUT.glob("*.png")))
