#!/usr/bin/env python3
"""Generate sy-note-books app icon: book + code + sunlight + 书昀"""
from PIL import Image, ImageDraw, ImageFont
import math

SIZE = 1024
img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# --- 1. 圆角矩形背景（蓝紫渐变）---
bg_mask = Image.new('L', (SIZE, SIZE), 0)
bg_draw = ImageDraw.Draw(bg_mask)
RADIUS = 200
bg_draw.rounded_rectangle([0, 0, SIZE, SIZE], radius=RADIUS, fill=255)

bg = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
for y in range(SIZE):
    for x in range(SIZE):
        t = (x + y) / (2 * SIZE)
        r = int(92 + t * (126 - 92))    # 5C -> 7E
        g = int(107 + t * (87 - 107))   # 6B -> 57
        b = int(192 + t * (194 - 192))  # C0 -> C2
        bg.putpixel((x, y), (r, g, b, 255))
img.paste(bg, mask=bg_mask)

# --- 2. 太阳（右上角，昀=日光）---
sun_cx, sun_cy = 810, 170
sun_r = 50
# 光晕
for i in range(3, 0, -1):
    glow_r = sun_r + i * 25
    glow_alpha = 30 * i
    draw.ellipse(
        [sun_cx - glow_r, sun_cy - glow_r, sun_cx + glow_r, sun_cy + glow_r],
        fill=(255, 213, 79, glow_alpha)
    )
# 太阳主体
draw.ellipse(
    [sun_cx - sun_r, sun_cy - sun_r, sun_cx + sun_r, sun_cy + sun_r],
    fill=(255, 213, 79)
)
draw.ellipse(
    [sun_cx - 35, sun_cy - 35, sun_cx + 35, sun_cy + 35],
    fill=(255, 238, 88)
)
# 光芒
for angle in range(0, 360, 45):
    rad = math.radians(angle)
    x1 = sun_cx + math.cos(rad) * 68
    y1 = sun_cy + math.sin(rad) * 68
    length = 22 if angle % 90 == 0 else 16
    x2 = sun_cx + math.cos(rad) * (68 + length)
    y2 = sun_cy + math.sin(rad) * (68 + length)
    width = 9 if angle % 90 == 0 else 6
    alpha = 255 if angle % 90 == 0 else 160
    ray_overlay = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    ray_draw = ImageDraw.Draw(ray_overlay)
    ray_draw.line([(x1, y1), (x2, y2)], fill=(255, 213, 79, alpha), width=width)
    img = Image.alpha_composite(img, ray_overlay)
    draw = ImageDraw.Draw(img)

# --- 3. 书本阴影 ---
draw.rounded_rectangle(
    [115, 248, 915, 752], radius=12,
    fill=(26, 35, 126, 80)
)

# --- 4. 左页 ---
draw.rounded_rectangle(
    [120, 240, 488, 740], radius=8,
    fill=(255, 255, 255), outline=(224, 224, 224), width=2
)

# --- 5. 右页 ---
draw.rounded_rectangle(
    [536, 240, 904, 740], radius=8,
    fill=(255, 255, 255), outline=(224, 224, 224), width=2
)

# --- 6. 书脊 ---
draw.rectangle(
    [488, 240, 536, 740],
    fill=(232, 234, 246), outline=(197, 202, 233), width=1
)

# --- 7. 左页文字行 ---
y = 280
draw.rounded_rectangle([150, y, 290, y + 13], radius=6, fill=(121, 134, 203))  # 标题
y += 33
draw.rounded_rectangle([150, y, 380, y + 9], radius=4, fill=(176, 190, 197))
y += 24
draw.rounded_rectangle([150, y, 360, y + 9], radius=4, fill=(207, 216, 220))
y += 24
draw.rounded_rectangle([150, y, 390, y + 9], radius=4, fill=(207, 216, 220))
y += 24
draw.rounded_rectangle([150, y, 340, y + 9], radius=4, fill=(207, 216, 220))
y += 36
draw.rounded_rectangle([150, y, 280, y + 11], radius=5, fill=(149, 117, 205))  # 子标题
y += 28
draw.rounded_rectangle([150, y, 380, y + 9], radius=4, fill=(176, 190, 197))
y += 24
draw.rounded_rectangle([150, y, 370, y + 9], radius=4, fill=(207, 216, 220))
y += 24
draw.rounded_rectangle([150, y, 395, y + 9], radius=4, fill=(207, 216, 220))
y += 24
draw.rounded_rectangle([150, y, 350, y + 9], radius=4, fill=(207, 216, 220))
y += 24
draw.rounded_rectangle([150, y, 385, y + 9], radius=4, fill=(207, 216, 220))
y += 24
draw.rounded_rectangle([150, y, 310, y + 9], radius=4, fill=(207, 216, 220))
y += 24
draw.rounded_rectangle([150, y, 375, y + 9], radius=4, fill=(207, 216, 220))
y += 24
draw.rounded_rectangle([150, y, 360, y + 9], radius=4, fill=(207, 216, 220))
y += 24
draw.rounded_rectangle([150, y, 390, y + 9], radius=4, fill=(207, 216, 220))

# --- 8. 右页代码块 ---
code_x, code_y = 565, 268
code_w, code_h = 313, 170
draw.rounded_rectangle(
    [code_x, code_y, code_x + code_w, code_y + code_h],
    radius=10, fill=(232, 234, 246), outline=(197, 202, 233), width=2
)
# 行号区域
draw.rounded_rectangle(
    [code_x, code_y, code_x + 40, code_y + code_h],
    radius=10, fill=(197, 202, 233, 100)
)

cy = code_y + 22
for _ in range(5):
    draw.rounded_rectangle([code_x + 14, cy, code_x + 30, cy + 7], radius=3, fill=(159, 168, 218, 180))
    cy += 28

# 代码内容
cx = code_x + 52
cy = code_y + 20
draw.rounded_rectangle([cx, cy, cx + 60, cy + 8], radius=4, fill=(126, 87, 194))       # purple keyword
draw.rounded_rectangle([cx + 66, cy, cx + 156, cy + 8], radius=4, fill=(159, 168, 218, 130))
cy += 28
draw.rounded_rectangle([cx, cy, cx + 50, cy + 8], radius=4, fill=(66, 165, 245))        # blue func
draw.rounded_rectangle([cx + 56, cy, cx + 146, cy + 8], radius=4, fill=(144, 202, 249, 130))
cy += 28
draw.rounded_rectangle([cx + 15, cy, cx + 145, cy + 8], radius=4, fill=(102, 187, 106))  # green string
cy += 28
draw.rounded_rectangle([cx, cy, cx + 70, cy + 8], radius=4, fill=(255, 167, 38))         # orange return
draw.rounded_rectangle([cx + 76, cy, cx + 156, cy + 8], radius=4, fill=(144, 202, 249, 130))
cy += 28
draw.rounded_rectangle([cx, cy, cx + 110, cy + 8], radius=4, fill=(189, 189, 189, 160))  # gray comment

# 右页下方文字
ry = 468
for w in [290, 265, 310, 235, 280, 255, 305, 210, 275, 195]:
    draw.rounded_rectangle([565, ry, 565 + w, ry + 9], radius=4, fill=(207, 216, 220))
    ry += 24

# --- 9. 「书昀」文字 ---
try:
    font = ImageFont.truetype("/usr/share/fonts/google-noto-cjk/NotoSansCJK-Black.ttc", 120)
except:
    try:
        font = ImageFont.truetype("/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc", 120)
    except:
        try:
            # Search for any Noto Sans CJK SC font
            import subprocess
            result = subprocess.run(['fc-match', '-f', '%{file}', 'Noto Sans CJK SC Black'], capture_output=True, text=True)
            font_path = result.stdout.strip()
            if font_path:
                font = ImageFont.truetype(font_path, 120)
            else:
                raise RuntimeError("No CJK font found")
        except:
            font = ImageFont.load_default()

# 居中绘制文字
text = "书昀"
bbox = draw.textbbox((0, 0), text, font=font)
tw = bbox[2] - bbox[0]
text_x = (SIZE - tw) // 2
text_y = 800

# 文字阴影
shadow_offset = 3
draw.text((text_x + shadow_offset, text_y + shadow_offset), text, font=font, fill=(26, 35, 126, 120))
# 文字主体
draw.text((text_x, text_y), text, font=font, fill=(255, 255, 255))

# --- 保存 ---
img.save('/home/zhipeng/workspace/desktop-soft/my-note-book/src-tauri/icons/icon-1024.png')
print("icon-1024.png saved")

# 生成各尺寸
for size, name in [(512, 'icon-512.png'), (256, 'icon-256.png'), (128, 'icon-128.png'), (32, 'icon-32.png')]:
    resized = img.resize((size, size), Image.LANCZOS)
    resized.save(f'/home/zhipeng/workspace/desktop-soft/my-note-book/src-tauri/icons/{name}')
    print(f"{name} saved ({size}x{size})")

# 复制到 Tauri 标准命名
BASE = '/home/zhipeng/workspace/desktop-soft/my-note-book/src-tauri/icons'
img.save(f'{BASE}/icon.png')
img.resize((512, 512), Image.LANCZOS).save(f'{BASE}/512x512.png')
img.resize((256, 256), Image.LANCZOS).save(f'{BASE}/256x256.png')
img.resize((128, 128), Image.LANCZOS).save(f'{BASE}/128x128.png')
img.resize((32, 32), Image.LANCZOS).save(f'{BASE}/32x32.png')
print("All Tauri icons generated!")
