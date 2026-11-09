#!/usr/bin/env python3
"""Draw simple original PNGs. Not the X logo."""

import pathlib
import struct
import zlib

ROOT = pathlib.Path(__file__).resolve().parents[1] / "src" / "icons"


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path: pathlib.Path, width: int, height: int, rgba: bytes) -> None:
    raw = b"".join(b"\x00" + rgba[y * width * 4 : (y + 1) * width * 4] for y in range(height))
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


def draw(size: int) -> bytes:
    buf = bytearray(size * size * 4)
    radius = max(2, size // 6)
    bg = (31, 61, 54, 255)
    paper = (244, 240, 230, 255)
    ink = (31, 41, 51, 255)
    copper = (196, 107, 58, 255)

    def setp(x: int, y: int, color: tuple[int, int, int, int]) -> None:
        if 0 <= x < size and 0 <= y < size:
            i = (y * size + x) * 4
            buf[i : i + 4] = bytes(color)

    for y in range(size):
        for x in range(size):
            dx = dy = 0
            if x < radius and y < radius:
                dx, dy = radius - 1 - x, radius - 1 - y
            elif x >= size - radius and y < radius:
                dx, dy = x - (size - radius), radius - 1 - y
            elif x < radius and y >= size - radius:
                dx, dy = radius - 1 - x, y - (size - radius)
            elif x >= size - radius and y >= size - radius:
                dx, dy = x - (size - radius), y - (size - radius)
            if dx * dx + dy * dy > radius * radius:
                setp(x, y, (0, 0, 0, 0))
            else:
                setp(x, y, bg)

    margin = max(2, size // 8)
    for y in range(margin, size - margin):
        for x in range(margin, size - margin):
            setp(x, y, paper)

    def rect(x0: int, y0: int, x1: int, y1: int, color: tuple[int, int, int, int]) -> None:
        for y in range(y0, y1):
            for x in range(x0, x1):
                setp(x, y, color)

    left = margin + max(2, size // 10)
    width = size - margin * 2 - max(4, size // 5)
    thickness = max(1, size // 16)
    gap = max(3, size // 8)
    top = margin + max(3, size // 6)
    for i in range(3):
        y = top + i * gap
        rect(left, y, left + width, y + thickness, ink)

    side = max(3, size // 5)
    pad = max(1, size // 16)
    rect(size - margin - side - pad, size - margin - side - pad, size - margin - pad, size - margin - pad, copper)
    return bytes(buf)


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    for size in (16, 32, 48, 128):
        rgba = draw(size)
        write_png(ROOT / f"icon{size}.png", size, size, rgba)


if __name__ == "__main__":
    main()
