# Génère les icônes provisoires de l'app (l'icône définitive viendra en phase 4).
# Charte : symbole Wasabi sur fond Noir, avec marge de sécurité pour la version
# masquable. Aperçu « DEV » : couleurs inversées. Python pur, aucune dépendance.
import math
import os
import struct
import zlib

WASABI = (0xC5, 0xF1, 0x35)
NOIR = (0x0E, 0x0F, 0x0C)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets")

# Feuille = intersection de deux cercles, couchée sur la diagonale.
L, D = 0.50, 0.36
R = math.hypot(L, D)
S = math.sqrt(0.5)


def dans_feuille(x, y):
    u, v = (x + y) * S, (y - x) * S          # repère tourné de 45°
    if math.hypot(u, v - D) > R or math.hypot(u, v + D) > R:
        return False
    return abs(v) > 0.028 or u > 0.18         # nervure : fente dans la moitié basse


def png(path, size, fond, symbole, ss=3):
    rows = bytearray()
    for py in range(size):
        rows.append(0)
        for px in range(size):
            n = 0
            for sy in range(ss):
                for sx in range(ss):
                    x = ((px + (sx + 0.5) / ss) / size) * 2 - 1
                    y = 1 - ((py + (sy + 0.5) / ss) / size) * 2
                    n += dans_feuille(x, y)
            a = n / (ss * ss)
            rows.extend(round(f + (s - f) * a) for f, s in zip(fond, symbole))

    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)))
        f.write(chunk(b"IDAT", zlib.compress(bytes(rows), 9)))
        f.write(chunk(b"IEND", b""))


for size in (180, 192, 512):
    png(os.path.join(OUT, f"icon-{size}.png"), size, NOIR, WASABI)
    png(os.path.join(OUT, f"icon-{size}-dev.png"), size, WASABI, NOIR)
print("ok")
