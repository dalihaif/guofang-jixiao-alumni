# -*- coding: utf-8 -*-
"""
把 source 文件夹里的原始照片处理成网页可用的图片：
  assets/photos/xxx.jpg       主图（最长边 <=1500px，质量 86）
  assets/photos/thumb/xxx.jpg 缩略图（宽 <=480px，质量 80）
命名统一改为英文短名，方便在 HTML / JS 中引用。
"""
import os
from PIL import Image, ImageOps

BASE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'photos')
SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '..', '高清照片')
os.makedirs(os.path.join(BASE, 'thumb'), exist_ok=True)

# 源文件 -> 目标英文名
MAP = {
    '民族村合影.jpg':                    'minzu-1994',
    '微信图片_20250301072352.jpg':       'shilin-1994',
    '图片1.jpg':                         'shilongba-a',
    '图片2.jpg':                         'shilongba-b',
    '图片3.jpg':                         'shilongba-c',
    '图片4.jpg':                         'shilongba-d',
    '全.jpg':                            'quanzhenglin',
    '微信图片_20250301073118.jpg':       'waterfall',
    '微信图片_20250301072402.jpg':       'snackbar',
    '微信图片_20250301072511.jpg':       'banquet',
    '微信图片_20250301001404.jpg':       'gather-2025',
    '微信图片_20250301001411.jpg':       'selfie-2025',
    '微信图片_20250301012058.jpg':       'tea-2025',
    '微信图片_20250301012105.jpg':       'guitar-2025a',
    '微信图片_20250301012111.jpg':       'solo-2025a',
    '微信图片_20250301073032.jpg':       'newyear-2025',
    '微信图片_20250301073045.jpg':       'guitar-2025b',
    '微信图片_20250301073052.jpg':       'portrait-2025',
    '微信图片_20250301073105.jpg':       'feast-2023',
}

def save(im, path, max_side, q):
    if max(im.size) > max_side:
        r = max_side / max(im.size)
        im = im.resize((max(1, round(im.width * r)), max(1, round(im.height * r))), Image.LANCZOS)
    im.convert('RGB').save(path, 'JPEG', quality=q, optimize=True, progressive=True)
    return os.path.getsize(path)

total = 0
for src, dst in MAP.items():
    sp = os.path.join(SRC, src)
    if not os.path.exists(sp):
        print('  [跳过] 找不到', src)
        continue
    im = ImageOps.exif_transpose(Image.open(sp))
    a = save(im.copy(), os.path.join(BASE, dst + '.jpg'), 1500, 86)
    b = save(im.copy(), os.path.join(BASE, 'thumb', dst + '.jpg'), 480, 80)
    total += a + b
    print('  %-16s %5d x %-5d  -> %s.jpg  (%.0fKB + %.0fKB)' % (
        src, im.width, im.height, dst, a / 1024, b / 1024))

print('\n共 %d 张，合计约 %.1f MB' % (len(MAP), total / 1024 / 1024))
