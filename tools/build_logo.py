# -*- coding: utf-8 -*-
"""
把「国防钳七」徽章原图（白底 JPG）处理成网站可用的透明底 PNG / ICO。

做法：
  1. 从四边向内做「连通域扩散」，只把与画布边缘相连的近白像素变透明，
     徽章内部的白色（银色高光）不受影响。
  2. 对透明区边缘一圈的浅灰抗锯齿像素做半透明羽化，避免深色页头上出现白边。
  3. 按内容裁切留白，再等比缩放出各个尺寸。

输入：C:/Users/Administrator/.workbuddy/clipboard-images/clipboard-2026-10-03T06-37-40-886Z-affe794e.jpg
输出：assets/img/logo.png(512)  logo-256.png  favicon.ico  apple-touch-icon.png
"""
import os
import sys
import numpy as np
from PIL import Image

SRC = r"C:/Users/Administrator/.workbuddy/clipboard-images/clipboard-2026-10-03T06-37-40-886Z-affe794e.jpg"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "img")
os.makedirs(OUT, exist_ok=True)

WHITE = 238          # 认定为「背景白」的通道下限
HALO = 176           # 边缘羽化时，通道下限（低于此值认为已是徽章本体，保持不透明）
BORDER_PAD = 0.015   # 裁切后四周留白比例


def dilate(m):
    """8 邻域膨胀（纯 numpy 移位实现）"""
    out = m.copy()
    out[1:, :] |= m[:-1, :]
    out[:-1, :] |= m[1:, :]
    out[:, 1:] |= m[:, :-1]
    out[:, :-1] |= m[:, 1:]
    out[1:, 1:] |= m[:-1, :-1]
    out[:-1, :-1] |= m[1:, 1:]
    out[1:, :-1] |= m[:-1, 1:]
    out[:-1, 1:] |= m[1:, :-1]
    return out


def main():
    if not os.path.exists(SRC):
        print("找不到原图：", SRC)
        sys.exit(1)

    im = Image.open(SRC).convert("RGBA")
    a = np.array(im)
    rgb = a[:, :, :3].astype(np.int16)
    mn = rgb.min(axis=2)                      # 每像素三通道最小值
    h, w = mn.shape
    print("原图尺寸：%dx%d" % (w, h))

    # 1) 近白掩膜
    near_white = mn >= WHITE

    # 2) 只保留与画布四边连通的近白区域 → 背景
    seed = np.zeros_like(near_white)
    seed[0, :] = near_white[0, :]
    seed[-1, :] = near_white[-1, :]
    seed[:, 0] = near_white[:, 0]
    seed[:, -1] = near_white[:, -1]
    if not seed.any():                        # 兜底：四角取一小块
        seed[:8, :8] = near_white[:8, :8]

    bg = seed
    for i in range(4000):
        grown = dilate(bg) & near_white
        if np.array_equal(grown, bg):
            print("扩散收敛，迭代 %d 次，背景占比 %.1f%%" % (i, bg.mean() * 100))
            break
        bg = grown

    # 3) 边缘羽化：与背景相邻、且还比较亮的像素做半透明
    ring = dilate(bg) & (~bg) & (mn >= HALO)
    alpha = np.full((h, w), 255, dtype=np.float64)
    alpha[bg] = 0
    # 亮度越接近白 → 越透明（255 → 0，HALO → 255）
    alpha[ring] = np.clip((255.0 - mn[ring]) * 255.0 / (255.0 - HALO), 0, 255)
    a[:, :, 3] = alpha.astype(np.uint8)
    a[bg, 3] = 0

    logo = Image.fromarray(a, "RGBA")

    # 4) 按实际内容裁切（去四周空白），再补一点点内边距
    bbox = logo.split()[3].point(lambda v: 255 if v > 12 else 0).getbbox()
    print("内容边界：", bbox)
    logo = logo.crop(bbox)
    side = max(logo.size)
    pad = int(side * BORDER_PAD)
    canvas_side = side + pad * 2
    square = Image.new("RGBA", (canvas_side, canvas_side), (0, 0, 0, 0))
    square.paste(logo, ((canvas_side - logo.width) // 2, (canvas_side - logo.height) // 2), logo)

    # 5) 输出各种尺寸
    square.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "logo.png"), optimize=True)
    square.resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, "logo-256.png"), optimize=True)
    square.resize((128, 128), Image.LANCZOS).save(os.path.join(OUT, "logo-128.png"), optimize=True)

    ico = square.resize((256, 256), Image.LANCZOS)
    ico.save(os.path.join(OUT, "favicon.ico"),
             sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

    # iOS 图标：垫白底，避免系统自动补黑
    ios = Image.new("RGBA", (180, 180), (255, 255, 255, 255))
    ios.paste(square.resize((180, 180), Image.LANCZOS), (0, 0), square.resize((180, 180), Image.LANCZOS))
    ios.convert("RGB").save(os.path.join(OUT, "apple-touch-icon.png"), optimize=True)

    # 分享卡片（og:image）用白底大图，社交平台不认透明底
    og = Image.new("RGB", (600, 600), (255, 255, 255))
    og.paste(square.resize((600, 600), Image.LANCZOS), (0, 0), square.resize((600, 600), Image.LANCZOS))
    og.save(os.path.join(OUT, "logo-share.jpg"), quality=90)

    for f in ("logo.png", "logo-256.png", "logo-128.png", "favicon.ico",
              "apple-touch-icon.png", "logo-share.jpg"):
        p = os.path.join(OUT, f)
        print("  %-22s %6.1f KB" % (f, os.path.getsize(p) / 1024.0))
    print("完成 →", OUT)


if __name__ == "__main__":
    main()
