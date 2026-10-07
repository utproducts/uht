#!/usr/bin/env python3
"""
UHT event photo mosaic generator.

Builds a photomosaic of an event's logo from all approved gallery photos:
each grid cell gets the photo whose average color best matches that part of
the logo, then the logo is blended over the top (USSSA style).

Usage:
  python3 tools/mosaic.py --event-id <id> --out mosaic.jpg
  python3 tools/mosaic.py --from-dir ./photos --logo logo.png --out mosaic.jpg

Options:
  --cols 70        tiles across (rows follow logo aspect)
  --cell 48        output pixels per tile
  --overlay 0.45   logo blend strength on top (0..1)
  --tint 0.25      per-tile pull toward the logo color before overlay
"""
import argparse, io, json, math, os, sys, urllib.request
from PIL import Image, ImageEnhance

API = 'https://uht.chad-157.workers.dev'
UA = {'User-Agent': 'Mozilla/5.0'}


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req) as r:
        return r.read()


def load_event_photos(event_id: str, cache: str):
    os.makedirs(cache, exist_ok=True)
    photos, page = [], 1
    while True:
        data = json.loads(fetch(f'{API}/api/photos/events/{event_id}/photos?per_page=120&page={page}'))
        batch = data['data']['photos']
        photos += batch
        if len(batch) < 120:
            break
        page += 1
    paths = []
    for p in photos:
        fp = os.path.join(cache, p['id'] + '.jpg')
        if not os.path.exists(fp):
            try:
                open(fp, 'wb').write(fetch(p['url']))
            except Exception as e:
                print('skip', p['id'], e)
                continue
        paths.append(fp)
    return paths


def avg_color(img: Image.Image):
    small = img.resize((8, 8))
    px = list(small.getdata())
    n = len(px)
    return tuple(sum(c[i] for c in px) / n for i in range(3))


def center_crop_square(img: Image.Image) -> Image.Image:
    w, h = img.size
    s = min(w, h)
    return img.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--event-id')
    ap.add_argument('--from-dir')
    ap.add_argument('--logo', help='logo path or url; defaults to the event logo')
    ap.add_argument('--out', required=True)
    ap.add_argument('--cols', type=int, default=70)
    ap.add_argument('--cell', type=int, default=48)
    ap.add_argument('--overlay', type=float, default=0.45)
    ap.add_argument('--tint', type=float, default=0.25)
    args = ap.parse_args()

    # Tile sources
    if args.from_dir:
        paths = [os.path.join(args.from_dir, f) for f in sorted(os.listdir(args.from_dir))
                 if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    elif args.event_id:
        paths = load_event_photos(args.event_id, f'/tmp/uht-mosaic-{args.event_id}')
    else:
        sys.exit('need --event-id or --from-dir')
    if len(paths) < 4:
        sys.exit(f'only {len(paths)} photos - need more to build a mosaic')
    print(f'{len(paths)} tile photos')

    # Logo
    logo_src = args.logo
    if not logo_src and args.event_id:
        ev = json.loads(fetch(f'{API}/api/events/{args.event_id}'))
        logo_src = ev['data']['logo_url']
    if not logo_src:
        sys.exit('no logo')
    logo_bytes = fetch(logo_src) if logo_src.startswith('http') else open(logo_src, 'rb').read()
    logo = Image.open(io.BytesIO(logo_bytes)).convert('RGBA')
    # Flatten on near-white so background cells read light (like the USSSA sample)
    bg = Image.new('RGBA', logo.size, (243, 244, 246, 255))
    logo_flat = Image.alpha_composite(bg, logo).convert('RGB')

    cols = args.cols
    rows = max(1, round(cols * logo_flat.size[1] / logo_flat.size[0]))
    cell = args.cell
    target = logo_flat.resize((cols, rows))
    tpx = target.load()

    # Tile library: square thumbs + avg colors
    tiles = []
    for fp in paths:
        try:
            im = Image.open(fp).convert('RGB')
            sq = center_crop_square(im).resize((cell, cell))
            tiles.append({'img': sq, 'avg': avg_color(sq), 'used': 0})
        except Exception as e:
            print('bad tile', fp, e)
    print(f'{len(tiles)} usable tiles, grid {cols}x{rows} -> {cols*cell}x{rows*cell}px')

    out = Image.new('RGB', (cols * cell, rows * cell))
    reuse_penalty = 18.0 / max(1, len(tiles) / (cols * rows))
    for y in range(rows):
        for x in range(cols):
            tr, tg, tb = tpx[x, y]
            best, best_d = None, 1e18
            for t in tiles:
                a = t['avg']
                d = (a[0]-tr)**2 + (a[1]-tg)**2 + (a[2]-tb)**2 + t['used'] * reuse_penalty
                if d < best_d:
                    best, best_d = t, d
            best['used'] += 1
            tile = best['img']
            if args.tint > 0:
                tint = Image.new('RGB', (cell, cell), (int(tr), int(tg), int(tb)))
                tile = Image.blend(tile, tint, args.tint)
            out.paste(tile, (x * cell, y * cell))

    # Logo overlay blend
    overlay = logo_flat.resize(out.size)
    final = Image.blend(out, overlay, args.overlay)
    final = ImageEnhance.Contrast(final).enhance(1.05)
    final = ImageEnhance.Color(final).enhance(1.08)
    final.save(args.out, quality=92)
    print('wrote', args.out)


if __name__ == '__main__':
    main()
