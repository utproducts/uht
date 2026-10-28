#!/usr/bin/env python3
"""
UHT event photo mosaic pipeline - build, publish, announce.

  python3 scripts/mosaic-build.py <event-slug> [--force] [--no-email]

Steps: fetch event + photos via the API, build the mosaic (every photo as
a tile over the event logo), slice a Leaflet tile pyramid, upload to R2
(mosaic/<slug>/), then send the thank-you announcement email to the full
event audience. Idempotent: refuses to re-publish or re-email unless
--force. Needs: Pillow, wrangler login (repo apps/api), network.

Run from the repo root on the Mac (image work can't run in the Worker).
"""
import io, json, math, os, random, re, subprocess, sys, time, urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = 'https://uht.chad-157.workers.dev/api'
UA = {'User-Agent': 'Mozilla/5.0 (UHT mosaic pipeline)'}
ADMIN_EMAIL = os.environ.get('UHT_ADMIN_EMAIL', 'john@ultimatetournaments.com')
ADMIN_PASS = os.environ.get('UHT_ADMIN_PASS', 'UHT2026!')

TILE, GRID_W, BLEND = 180, 72, 0.46
PYRAMID_TS, LEVELS = 1024, 5


def get(url, headers=None):
    req = urllib.request.Request(url, headers={**UA, **(headers or {})})
    return json.load(urllib.request.urlopen(req))


def post(url, payload, headers=None):
    req = urllib.request.Request(url, method='POST', data=json.dumps(payload).encode(),
                                 headers={**UA, 'Content-Type': 'application/json', **(headers or {})})
    return json.load(urllib.request.urlopen(req))


def r2_put(key, path, ctype):
    env = {k: v for k, v in os.environ.items() if k != 'CLOUDFLARE_API_TOKEN'}
    r = subprocess.run(['npx', 'wrangler', 'r2', 'object', 'put', f'uht-assets/{key}',
                        '--file', path, '--content-type', ctype],
                       cwd=os.path.join(REPO, 'apps', 'api'), env=env,
                       capture_output=True, text=True)
    return 'Upload complete' in (r.stdout + r.stderr)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    force = '--force' in sys.argv
    no_email = '--no-email' in sys.argv
    if not args:
        sys.exit('usage: mosaic-build.py <event-slug> [--force] [--no-email]')
    slug = args[0]

    # Idempotency: a published meta.json means this mosaic already shipped
    try:
        urllib.request.urlopen(urllib.request.Request(
            f'{API}/assets/mosaic/{slug}/meta.json', headers=UA))
        if not force:
            print(f'SKIP: mosaic already published for {slug} (use --force to rebuild)')
            return
    except Exception:
        pass

    ev = get(f'{API}/events/{slug}')['data']
    event_id, name = ev['id'], ev['name']
    year = str(ev.get('start_date', ''))[:4]
    location = f"{ev.get('city','')}, {ev.get('state','')}".strip(', ')
    print(f'event: {name} ({event_id})')

    work = os.path.expanduser(f'~/.uht-mosaics/{slug}')
    os.makedirs(f'{work}/originals', exist_ok=True)
    os.makedirs(f'{work}/tiles', exist_ok=True)

    # Photos
    photos, page = [], 1
    while True:
        r = get(f'{API}/photos/events/{event_id}/photos?page={page}&per_page=120')
        batch = r['data']['photos']
        photos += batch
        if len(photos) >= r['data']['total'] or not batch:
            break
        page += 1
    print(f'photos: {len(photos)}')
    if len(photos) < 12:
        sys.exit(f'ABORT: only {len(photos)} photos - not enough for a mosaic')

    from PIL import Image, ImageOps, ImageEnhance, ImageDraw, ImageFont
    Image.MAX_IMAGE_PIXELS = None

    tiles = []
    for p in photos:
        f = f"{work}/originals/{p['id']}.jpg"
        if not os.path.exists(f):
            try:
                urllib.request.urlretrieve_called = True
                req = urllib.request.Request(p['url'], headers=UA)
                open(f, 'wb').write(urllib.request.urlopen(req).read())
            except Exception:
                continue
        try:
            im = Image.open(f).convert('RGB')
            im = ImageOps.exif_transpose(im)
            im = ImageOps.fit(im, (TILE, TILE), Image.LANCZOS)
            px = im.resize((1, 1), Image.LANCZOS).getpixel((0, 0))
            tiles.append((im, px))
        except Exception:
            continue
    print(f'tiles ready: {len(tiles)}')

    # Target: event logo on near-black
    logo_url = ev.get('logo_url')
    if not logo_url:
        sys.exit('ABORT: event has no logo_url for the mosaic target')
    req = urllib.request.Request(logo_url, headers=UA)
    logo = Image.open(io.BytesIO(urllib.request.urlopen(req).read())).convert('RGBA')
    BG = (8, 10, 16)
    bg = Image.new('RGBA', logo.size, BG + (255,))
    bg.alpha_composite(logo)
    target = bg.convert('RGB')

    random.seed(7)
    grid_h = round(GRID_W * target.height / target.width)
    W, H = GRID_W * TILE, grid_h * TILE
    cells = target.resize((GRID_W, grid_h), Image.LANCZOS).load()

    def dist(a, b):
        return (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2

    mosaic = Image.new('RGB', (W, H))
    last_row = [None] * GRID_W
    for gy in range(grid_h):
        prev = None
        for gx in range(GRID_W):
            tc = cells[gx, gy]
            ranked = sorted(range(len(tiles)), key=lambda i: dist(tiles[i][1], tc))
            pool = [i for i in ranked[:12] if i != prev and i != last_row[gx]] or ranked[:3]
            pick = random.choice(pool[:8])
            blended = Image.blend(tiles[pick][0], Image.new('RGB', (TILE, TILE), tc), BLEND)
            blended = ImageEnhance.Contrast(blended).enhance(1.06)
            mosaic.paste(blended, (gx * TILE, gy * TILE))
            prev = pick
            last_row[gx] = pick

    BAND = 640
    out = Image.new('RGB', (W, H + BAND), BG)
    out.paste(mosaic, (0, 0))
    d = ImageDraw.Draw(out)
    f1 = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 250)
    f2 = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 122)
    line1 = f'{name} {year}'.upper()
    line2 = f'{location.upper()}  ·  MADE FROM {len(tiles)} FAMILY PHOTOS  ·  ULTIMATE HOCKEY TOURNAMENTS'
    while d.textlength(line1, font=f1) > W - 400 and f1.size > 120:
        f1 = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', f1.size - 10)
    d.text(((W - d.textlength(line1, font=f1)) / 2, H + 95), line1, font=f1, fill=(212, 175, 55))
    d.text(((W - d.textlength(line2, font=f2)) / 2, H + 410), line2, font=f2, fill=(205, 214, 228))

    full = f'{work}/full.jpg'
    out.save(full, quality=90)
    out.resize((1400, round(1400 * out.height / out.width)), Image.LANCZOS)\
       .save(f'{work}/preview.jpg', quality=85)
    print('mosaic built:', out.size)

    # Pyramid
    SW, SH = out.size
    count = 0
    for z in range(LEVELS):
        scale = 2 ** (LEVELS - 1 - z)
        w, h = math.ceil(SW / scale), math.ceil(SH / scale)
        im = out.resize((w, h), Image.LANCZOS) if scale > 1 else out
        for ty in range(math.ceil(h / PYRAMID_TS)):
            for tx in range(math.ceil(w / PYRAMID_TS)):
                t = im.crop((tx * PYRAMID_TS, ty * PYRAMID_TS,
                             min((tx + 1) * PYRAMID_TS, w), min((ty + 1) * PYRAMID_TS, h)))
                t.save(f'{work}/tiles/{z}_{tx}_{ty}.jpg', quality=82)
                count += 1
    json.dump({'width': SW, 'height': SH, 'tileSize': PYRAMID_TS,
               'levels': LEVELS, 'photos': len(tiles)},
              open(f'{work}/tiles/meta.json', 'w'))
    print('pyramid tiles:', count)

    # Upload (meta.json LAST - it's the published flag)
    failed = []
    names = sorted(os.listdir(f'{work}/tiles'))
    names.remove('meta.json')
    names += ['preview.jpg', 'full.jpg', 'meta.json']
    for fn in names:
        src = f'{work}/tiles/{fn}' if fn not in ('preview.jpg', 'full.jpg') else f'{work}/{fn}'
        ct = 'application/json' if fn.endswith('.json') else 'image/jpeg'
        ok = r2_put(f'mosaic/{slug}/{fn}', src, ct) or r2_put(f'mosaic/{slug}/{fn}', src, ct)
        if not ok:
            failed.append(fn)
    if failed:
        sys.exit(f'ABORT before email: {len(failed)} uploads failed: {failed[:5]}')
    print('uploaded all files')

    if no_email:
        print('done (email skipped)')
        return

    tok = post(f'{API}/auth/login', {'email': ADMIN_EMAIL, 'password': ADMIN_PASS})['data']['token']
    auth = {'Authorization': f'Bearer {tok}'}
    sent, skip = 0, 0
    while True:
        r = post(f'{API}/email/mosaic/{event_id}/send', {'skip': skip}, auth)['data']
        sent += r['sent']
        if skip + r['sent'] >= r['recipients'] or r['sent'] == 0:
            total = r['recipients']
            break
        skip += r['sent']
        time.sleep(2)
    print(f'EMAIL SENT: {sent}/{total} recipients')


if __name__ == '__main__':
    main()
