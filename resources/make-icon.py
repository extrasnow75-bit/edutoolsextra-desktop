"""Draw the app icon: a Boise State blue tile with a white course page and an orange check.

Run from the project root:

    python resources/make-icon.py

Writes resources/icon.png (512px, for macOS) and resources/icon.ico (16-256px, for Windows).
Standard library only, like Canvas Extractor Tools' icon script, so it never needs an install.
Shapes are sampled 4x4 per pixel to smooth the edges. Edit the constants to change the design.
"""

import struct
import zlib
from pathlib import Path

BLUE = (0x00, 0x33, 0xA0)
WHITE = (0xFF, 0xFF, 0xFF)
ORANGE = (0xD6, 0x43, 0x09)
LINE = (0x9F, 0xB3, 0xDB)

# Geometry on a 64-unit square.
TILE_R = 12.0
PAGE = (14.0, 11.0, 44.0, 52.0, 3.5)  # x0, y0, x1, y1, corner radius
LINES = [(19.0, 19.0, 39.0, 22.5), (19.0, 27.0, 39.0, 30.5), (19.0, 35.0, 31.0, 38.5)]
CHECK_C, CHECK_R = (45.0, 45.0), 12.5


def in_round_rect(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def near_segment(x, y, ax, ay, bx, by, w):
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
    px, py = ax + t * dx, ay + t * dy
    return (x - px) ** 2 + (y - py) ** 2 <= (w / 2) ** 2


def colour_at(x, y):
    """The colour at (x, y) on the 64-unit tile, or None for transparent."""
    if not in_round_rect(x, y, 0, 0, 64, 64, TILE_R):
        return None
    cx, cy = CHECK_C
    d2 = (x - cx) ** 2 + (y - cy) ** 2
    if d2 <= CHECK_R ** 2:
        if near_segment(x, y, 39.0, 45.5, 43.5, 50.0, 3.6) or near_segment(x, y, 43.5, 50.0, 51.5, 40.5, 3.6):
            return WHITE
        return ORANGE
    if d2 <= (CHECK_R + 2.2) ** 2:
        return BLUE  # a ring of tile colour so the check stands off the page
    if in_round_rect(x, y, *PAGE):
        for (x0, y0, x1, y1) in LINES:
            if in_round_rect(x, y, x0, y0, x1, y1, 1.6):
                return LINE
        return WHITE
    return BLUE


def render(size):
    rows = []
    n = 4
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(n):
                for sx in range(n):
                    c = colour_at((px + (sx + 0.5) / n) * 64 / size, (py + (sy + 0.5) / n) * 64 / size)
                    if c:
                        acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; acc[3] += 255
            k = n * n
            a = acc[3] // k
            row += bytes([acc[0] // max(1, acc[3] // 255), acc[1] // max(1, acc[3] // 255), acc[2] // max(1, acc[3] // 255), a] if a else [0, 0, 0, 0])
        rows.append(bytes(row))
    raw = b''.join(rows)

    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xFFFFFFFF)

    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')


def main():
    here = Path(__file__).parent
    (here / 'icon.png').write_bytes(render(512))
    sizes = [16, 24, 32, 48, 64, 128, 256]
    pngs = [render(s) for s in sizes]
    header = struct.pack('<HHH', 0, 1, len(sizes))
    offset = 6 + 16 * len(sizes)
    entries = b''
    for s, data in zip(sizes, pngs):
        entries += struct.pack('<BBBBHHII', s % 256, s % 256, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
    (here / 'icon.ico').write_bytes(header + entries + b''.join(pngs))
    print('Wrote icon.png and icon.ico')


if __name__ == '__main__':
    main()
