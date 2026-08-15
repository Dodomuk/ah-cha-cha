#!/usr/bin/env python3
"""
차차 마스코트 스프라이트 시트를 포즈별 투명 PNG로 분리한다.

원본은 3x3 그리드에 하늘색 배경이 깔린 1024x1024 PNG다.
배경 제거는 단순 색상 임계값이 아니라 **테두리에서 연결된 영역만** 지운다.
캐릭터 안쪽의 하늘색 요소(반짝임, 물음표, zZ)를 같이 지워버리지 않기 위함.

    python3 scripts/slice-mascot.py

입력  public/mascot/mascot_example.png
출력  public/mascot/poses/chacha-{pose}.png (+ .webp)
"""

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "public" / "mascot" / "mascot_example.png"
OUT_DIR = ROOT / "public" / "mascot" / "poses"

# 거터(흰 구분선)를 뺀 각 타일의 경계. detect_gutters()로 확인한 값
TILE_BOUNDS = [(0, 338), (344, 679), (685, 1023)]

# 타일 안쪽으로 물릴 여백. 거터의 안티에일리어싱된 흰 픽셀이 1~2px 남는데,
# 흰색은 배경 하늘색과 멀어서 투명 처리되지 않고 그대로 살아남는다.
# 그러면 bbox가 타일 전체로 잡혀 trim이 무의미해진다
INSET = 5

# 그리드 순서대로의 포즈 이름
POSES = [
    "greet",      # 양팔 벌려 인사 — 홈 idle
    "surprised",  # 깜짝 놀람
    "crying",     # 울음 — 현재 미사용
    "angry",      # 화남 — 현재 미사용
    "sleeping",   # 잠 — 빈 상태
    "puzzled",    # 갸웃 + 물음표 — 정보 부족
    "excited",    # 신남/점프 — 검사 중(임시)
    "worried",    # 걱정 — 주의
    "wink",       # 윙크 — 이상 없음
]

BACKGROUND = np.array([173, 213, 255])
# 배경 + 안티에일리어싱 경계까지 포함하는 색상 거리. 히스토그램상 20~40 구간이
# 비어 있어(0.86%) 이 사이 어디를 잘라도 결과가 같다
TOLERANCE = 45


def detect_gutters(pixels: np.ndarray) -> None:
    """타일 경계가 바뀐 원본을 받았을 때 확인용."""
    white = (pixels > 235).all(axis=2)
    for axis, label in ((0, "열"), (1, "행")):
        ratio = white.mean(axis=axis)
        runs, start = [], None
        for i, value in enumerate(ratio):
            if value >= 0.85 and start is None:
                start = i
            elif value < 0.85 and start is not None:
                if i - start >= 3:
                    runs.append((start, i - 1))
                start = None
        print(f"거터({label}): {runs}")


def background_mask(tile: np.ndarray) -> np.ndarray:
    """테두리에서 연결된 배경 픽셀만 True로 반환한다."""
    height, width = tile.shape[:2]
    near_bg = np.sqrt(((tile - BACKGROUND) ** 2).sum(axis=2)) < TOLERANCE

    mask = np.zeros((height, width), dtype=bool)
    queue = deque()

    # 네 변의 배경 픽셀을 전부 시드로 넣는다. 모서리 하나만 쓰면
    # 캐릭터가 변에 닿아 배경이 갈라진 경우 한쪽이 남는다
    for x in range(width):
        for y in (0, height - 1):
            if near_bg[y, x] and not mask[y, x]:
                mask[y, x] = True
                queue.append((y, x))
    for y in range(height):
        for x in (0, width - 1):
            if near_bg[y, x] and not mask[y, x]:
                mask[y, x] = True
                queue.append((y, x))

    while queue:
        y, x = queue.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < height and 0 <= nx < width:
                if near_bg[ny, nx] and not mask[ny, nx]:
                    mask[ny, nx] = True
                    queue.append((ny, nx))
    return mask


def main() -> None:
    source = Image.open(SOURCE).convert("RGB")
    pixels = np.asarray(source).astype(int)
    detect_gutters(pixels)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    index = 0
    for top, bottom in TILE_BOUNDS:
        for left, right in TILE_BOUNDS:
            pose = POSES[index]
            index += 1

            tile = pixels[
                top + INSET : bottom + 1 - INSET,
                left + INSET : right + 1 - INSET,
            ]
            transparent = background_mask(tile)

            rgba = np.dstack(
                [tile, np.where(transparent, 0, 255)],
            ).astype(np.uint8)
            image = Image.fromarray(rgba, mode="RGBA")

            # 남은 여백을 잘라 포즈마다 크기가 제각각인 캔버스를 없앤다
            bbox = image.getbbox()
            if bbox:
                image = image.crop(bbox)

            png = OUT_DIR / f"chacha-{pose}.png"
            image.save(png, optimize=True)
            image.save(OUT_DIR / f"chacha-{pose}.webp", quality=90, method=6)
            print(f"  {pose:10s} {image.width:3d}x{image.height:3d}  {png.name}")


if __name__ == "__main__":
    main()
