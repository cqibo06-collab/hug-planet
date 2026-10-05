# -*- coding: utf-8 -*-
"""心晴分析 PWA 图标：放大镜里的半晴半雨心形"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")
os.makedirs(OUT, exist_ok=True)
SS = 4


def heart_points(cx, cy, scale):
    pts = []
    for i in range(240):
        t = math.radians(i * 360 / 240)
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((cx + x * scale, cy - y * scale))
    return pts


def gradient(size, top, bottom):
    img = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        k = y / (size - 1)
        c = tuple(round(top[i] + (bottom[i] - top[i]) * k) for i in range(3))
        d.line([(0, y), (size, y)], fill=c)
    return img


def make_icon(px, rounded, heart_ratio):
    size = px * SS
    img = gradient(size, (233, 236, 255), (205, 213, 253)).convert("RGBA")
    d = ImageDraw.Draw(img)

    cx, cy = size / 2, size / 2 + 8 * SS
    hs = size * heart_ratio / 32.0
    pts = heart_points(cx, cy, hs)

    # 左半晴（金黄）右半雨（蓝紫）: 颜色层按中线分色，再用爱心形状裁剪
    heart = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(heart).polygon(pts, fill=(255, 255, 255, 255))
    tint = Image.new("RGBA", img.size, (0, 0, 0, 0))
    td = ImageDraw.Draw(tint)
    td.rectangle([0, 0, cx, size], fill=(246, 183, 60, 255))
    td.rectangle([cx, 0, size, size], fill=(139, 157, 245, 255))
    half = Image.new("RGBA", img.size, (0, 0, 0, 0))
    half.paste(tint, (0, 0), mask=heart.split()[3])
    img = Image.alpha_composite(img, half)

    # 中线 + 小太阳和小雨滴记号
    d = ImageDraw.Draw(img)
    d.line([(cx, cy - hs * 14), (cx, cy + hs * 14)], fill=(255, 255, 255), width=max(2, round(6 * SS)))
    # 左上小太阳
    sx, sy, sr = cx - hs * 11, cy - hs * 9, hs * 3.2
    d.ellipse([sx - sr, sy - sr, sx + sr, sy + sr], fill=(255, 244, 214))
    for a in range(8):
        ang = a * math.pi / 4
        x1 = sx + math.cos(ang) * sr * 1.5
        y1 = sy + math.sin(ang) * sr * 1.5
        x2 = sx + math.cos(ang) * sr * 2.2
        y2 = sy + math.sin(ang) * sr * 2.2
        d.line([(x1, y1), (x2, y2)], fill=(255, 244, 214), width=max(1, round(2.2 * SS)))
    # 右下小雨滴
    rx, ry = cx + hs * 11, cy + hs * 8
    rr = hs * 2.6
    d.ellipse([rx - rr, ry - rr, rx + rr, ry + rr], fill=(224, 236, 255))
    d.polygon([(rx - rr * 0.55, ry - rr * 0.9), (rx + rr * 0.55, ry - rr * 0.9), (rx, ry - rr * 1.8)], fill=(224, 236, 255))

    # 放大镜框
    mr = size * 0.40
    ring = size * 0.022
    d.ellipse([size/2 - mr, size/2 - mr, size/2 + mr, size/2 + mr],
              outline=(74, 82, 128), width=round(ring))
    # 手柄
    hx = size/2 + mr * 0.707
    hy = size/2 + mr * 0.707
    hl = size * 0.16
    d.line([(hx, hy), (hx + hl * 0.707, hy + hl * 0.707)], fill=(74, 82, 128), width=round(ring * 1.5))

    if rounded:
        mask = Image.new("L", img.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            [0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=255)
        img.putalpha(mask)

    return img.resize((px, px), Image.LANCZOS)


make_icon(512, rounded=True, heart_ratio=0.60).save(os.path.join(OUT, "icon-512.png"))
make_icon(192, rounded=True, heart_ratio=0.60).save(os.path.join(OUT, "icon-192.png"))
make_icon(512, rounded=False, heart_ratio=0.52).save(os.path.join(OUT, "icon-maskable-512.png"))
make_icon(180, rounded=False, heart_ratio=0.56).save(os.path.join(OUT, "apple-touch-icon.png"))

for f in sorted(os.listdir(OUT)):
    print(f, os.path.getsize(os.path.join(OUT, f)), "bytes")
