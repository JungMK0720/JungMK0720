#!/usr/bin/env python3
"""Draws the static SVGs under assets/: the header and the two project cards.

All text is converted to Pretendard outlines, so the images look the same on every
machine. Needs the Pretendard OTF files (default ~/Library/Fonts, or set PRETENDARD_DIR).

    python3 scripts/make-assets.py
"""
import base64
import os

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

FONT_DIR = os.environ.get("PRETENDARD_DIR", os.path.expanduser("~/Library/Fonts"))
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
ASSETS = os.path.join(ROOT, "assets")

_fonts = {}


def font(weight):
    if weight not in _fonts:
        _fonts[weight] = TTFont(os.path.join(FONT_DIR, f"Pretendard-{weight}.otf"))
    return _fonts[weight]


def fmt(v):
    s = f"{v:.1f}".rstrip("0").rstrip(".")
    return "0" if s in ("", "-0") else s


def advances(text, weight, size, tracking=0.0):
    f = font(weight)
    cmap, glyphs = f.getBestCmap(), f.getGlyphSet()
    scale = size / f["head"].unitsPerEm
    out = []
    for ch in text:
        if ord(ch) not in cmap:
            raise SystemExit(f"Pretendard has no glyph for {ch!r}")
        out.append(glyphs[cmap[ord(ch)]].width * scale + tracking)
    return out


def measure(text, weight, size, tracking=0.0):
    return sum(advances(text, weight, size, tracking)) - (tracking if text else 0)


def text_path(text, weight, size, x, y, tracking=0.0, anchor="start"):
    """Returns (path data, end x). y is the baseline."""
    if anchor != "start":
        w = measure(text, weight, size, tracking)
        x -= w if anchor == "end" else w / 2
    f = font(weight)
    cmap, glyphs = f.getBestCmap(), f.getGlyphSet()
    scale = size / f["head"].unitsPerEm
    pen = SVGPathPen(glyphs, ntos=fmt)
    cursor = x
    for ch in text:
        g = glyphs[cmap[ord(ch)]]
        g.draw(TransformPen(pen, (scale, 0, 0, -scale, cursor, y)))
        cursor += g.width * scale + tracking
    return pen.getCommands(), cursor


def text(s, weight, size, x, y, fill, tracking=0.0, anchor="start", extra=""):
    d, end = text_path(s, weight, size, x, y, tracking, anchor)
    return f'<path fill="{fill}" {extra} d="{d}"/>', end


def png_data_uri(path):
    with open(path, "rb") as fh:
        return "data:image/png;base64," + base64.b64encode(fh.read()).decode()


# ---------------------------------------------------------------- header

HEADER = {
    "light": dict(panel="#F4F6FA", band="#EAF1FC", ink="#162431", body="#394553", muted="#5C6874",
                  accent="#2F6BDB", line="#C3D0E3", node="#FFFFFF", resp="#1FAE5B",
                  bezel="#353C47", rack="#1B1F26", slot="#262B33", vent="#3A4149",
                  led="#34D37A", led2="#4B8DF8", tape="#FFD23F", dash="#111418"),
    "dark": dict(panel="#161B22", band="#1A2436", ink="#E6EDF3", body="#C9D1D9", muted="#8B949E",
                 accent="#8AB8FF", line="#2F4468", node="#0D1117", resp="#3FE08A",
                 bezel="#3D4654", rack="#1F252E", slot="#2A313B", vent="#454D59",
                 led="#3FE08A", led2="#8AB8FF", tape="#FFD23F", dash="#111418"),
}


def header(theme):
    p = HEADER[theme]
    W, H = 1200, 340
    out = []
    add = out.append
    add(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
        f'role="img" aria-label="Jung Minkyu (정민규), backend developer">')

    tagline = "Every number I report comes with the command that reproduces it."
    tx, ty, tsize = 72, 236, 19
    adv = advances(tagline, "Regular", tsize)
    stops = [0.0]
    for a in adv:
        stops.append(stops[-1] + a)
    per_char = 0.045
    dur = per_char * len(tagline)
    key_times = ";".join(fmt(i / len(tagline)) if i < len(tagline) else "1" for i in range(len(stops)))
    widths = ";".join(fmt(s + 1) for s in stops)
    cursor_x = ";".join(fmt(tx + s + 3) for s in stops)

    add('<defs>'
        f'<clipPath id="card"><rect width="{W}" height="{H}" rx="24"/></clipPath>'
        f'<clipPath id="typed"><rect x="{tx - 2}" y="{ty - 24}" width="0" height="34">'
        f'<animate attributeName="width" values="{widths}" keyTimes="{key_times}" calcMode="discrete" '
        f'dur="{fmt(dur)}s" begin="0.6s" fill="freeze"/></rect></clipPath>'
        '</defs>')
    add(f'<rect width="{W}" height="{H}" rx="24" fill="{p["panel"]}"/>')
    add(f'<g clip-path="url(#card)"><rect x="640" y="-60" width="900" height="160" rx="10" '
        f'fill="{p["band"]}" transform="rotate(-14 1090 20)"/></g>')

    s, end = text("Jung Minkyu", "Bold", 64, 72, 132, p["ink"], tracking=-0.6)
    add(s)
    s, _ = text("정민규", "Medium", 26, end + 18, 132, p["muted"])
    add(s)
    s, _ = text("Backend developer, Java 21 and Spring Boot", "SemiBold", 22, 72, 180, p["body"])
    add(s)

    d, _ = text_path(tagline, "Regular", tsize, tx, ty)
    add(f'<g clip-path="url(#typed)"><path fill="{p["muted"]}" d="{d}"/></g>')
    add(f'<rect x="{tx + 3}" y="{ty - 18}" width="2.5" height="23" rx="1" fill="{p["accent"]}">'
        f'<animate attributeName="x" values="{cursor_x}" keyTimes="{key_times}" calcMode="discrete" '
        f'dur="{fmt(dur)}s" begin="0.6s" fill="freeze"/>'
        f'<animate attributeName="opacity" values="1;0;1" keyTimes="0;0.5;1" calcMode="discrete" '
        f'dur="1.05s" begin="{fmt(0.6 + dur)}s" repeatCount="indefinite"/>'
        '</rect>')

    s, _ = text("Seoul, Korea", "Medium", 15, 72, 288, p["muted"], tracking=0.2)
    add(s)

    # clients sending requests into one server, responses coming back
    entry = (906, 170)
    clients = [(736, 100), (716, 170), (736, 240)]
    for i, (cx, cy) in enumerate(clients):
        add(f'<line x1="{cx}" y1="{cy}" x2="{entry[0]}" y2="{entry[1]}" stroke="{p["line"]}" '
            'stroke-width="2" stroke-dasharray="1 7" stroke-linecap="round"/>')
    for i, (cx, cy) in enumerate(clients):
        begin = f"{fmt(i * 0.75)}s"
        go = f"M{cx},{cy} L{entry[0]},{entry[1]}"
        back = f"M{entry[0]},{entry[1]} L{cx},{cy}"
        add(f'<circle r="4.5" fill="{p["accent"]}" opacity="0">'
            f'<animateMotion path="{go}" dur="2.4s" begin="{begin}" repeatCount="indefinite" '
            'keyPoints="0;1;1" keyTimes="0;0.38;1" calcMode="linear"/>'
            f'<animate attributeName="opacity" values="1;0" keyTimes="0;0.38" calcMode="discrete" '
            f'dur="2.4s" begin="{begin}" repeatCount="indefinite"/></circle>')
        add(f'<circle r="4.5" fill="{p["resp"]}" opacity="0">'
            f'<animateMotion path="{back}" dur="2.4s" begin="{begin}" repeatCount="indefinite" '
            'keyPoints="0;0;1;1" keyTimes="0;0.5;0.88;1" calcMode="linear"/>'
            f'<animate attributeName="opacity" values="0;1;0" keyTimes="0;0.5;0.88" calcMode="discrete" '
            f'dur="2.4s" begin="{begin}" repeatCount="indefinite"/></circle>')
        add(f'<circle cx="{cx}" cy="{cy}" r="11" fill="{p["node"]}" stroke="{p["accent"]}" stroke-width="2"/>')
        add(f'<circle cx="{cx}" cy="{cy - 2.5}" r="3" fill="{p["accent"]}"/>')
        add(f'<path d="M{cx - 5.5},{cy + 6} a5.5,4.5 0 0 1 11,0" fill="{p["accent"]}"/>')

    # the server rack (same shape as the Server Room Simulator mark)
    rx, ry, rw, rh = 912, 52, 196, 236
    add(f'<rect x="{rx}" y="{ry}" width="{rw}" height="{rh}" rx="20" fill="{p["bezel"]}"/>')
    add(f'<rect x="{rx + 8}" y="{ry + 8}" width="{rw - 16}" height="{rh - 16}" rx="14" fill="{p["rack"]}"/>')
    leds = [("2.4s", "0s", "led"), ("3.1s", "0.7s", "led"), ("1.9s", "0.3s", "led"), ("1.2s", "0.1s", "led2")]
    for i, (dur_, begin, led) in enumerate(leds):
        sy = ry + 26 + i * 44
        add(f'<rect x="{rx + 24}" y="{sy}" width="{rw - 48}" height="34" rx="7" fill="{p["slot"]}"/>')
        if i == 0:
            base = sy + 27
            seqs = ["8;18;11;20;8", "14;7;19;10;14", "10;20;6;15;10", "17;9;13;19;17", "6;15;20;9;6"]
            durs = ["1.3s", "1.1s", "1.5s", "0.9s", "1.2s"]
            for k, (seq, dk) in enumerate(zip(seqs, durs)):
                hs = [float(v) for v in seq.split(";")]
                ys = ";".join(fmt(base - h) for h in hs)
                add(f'<rect x="{rx + 36 + k * 9}" y="{fmt(base - hs[0])}" width="5" height="{fmt(hs[0])}" rx="1.5" fill="{p["led2"]}" opacity="0.9">'
                    f'<animate attributeName="height" values="{seq}" dur="{dk}" repeatCount="indefinite"/>'
                    f'<animate attributeName="y" values="{ys}" dur="{dk}" repeatCount="indefinite"/></rect>')
        else:
            for k in range(3):
                add(f'<rect x="{rx + 36}" y="{sy + 10 + k * 6}" width="44" height="2.5" rx="1.25" fill="{p["vent"]}"/>')
        add(f'<circle cx="{rx + rw - 44}" cy="{sy + 17}" r="7" fill="{p[led]}">'
            f'<animate attributeName="opacity" values="1;1;0.25;1;1" keyTimes="0;0.45;0.5;0.55;1" '
            f'dur="{dur_}" begin="{begin}" repeatCount="indefinite"/></circle>')
    tpx, tpy = rx + 30, ry + 208
    add(f'<g transform="rotate(-4 {tpx + 68} {tpy + 18})"><rect x="{tpx}" y="{tpy}" width="136" height="36" fill="{p["tape"]}"/>')
    for dx, w in [(14, 18), (42, 18), (70, 18), (98, 8)]:
        add(f'<rect x="{tpx + dx}" y="{tpy + 13}" width="{w}" height="10" fill="{p["dash"]}"/>')
    add('</g></svg>')
    return "\n".join(out)


# ---------------------------------------------------------------- project cards

CARD = {
    "light": dict(bg="#FFFFFF", border="#E1E6EE", ink="#162431", body="#394553", muted="#5C6874",
                  faint="#8B96A5", accent="#2F6BDB", line="#E6EAF0", track="#EEF2F7",
                  bad="#F04452", good="#2F6BDB", on_bad="#FFFFFF"),
    "dark": dict(bg="#0D1117", border="#30363D", ink="#E6EDF3", body="#C9D1D9", muted="#8B949E",
                 faint="#6E7681", accent="#8AB8FF", line="#21262D", track="#161B22",
                 bad="#FF6B78", good="#8AB8FF", on_bad="#0D1117"),
}
CW, CH = 446, 400


def card_open(p, label):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
            f'viewBox="0 0 {CW} {CH}" width="{CW}" height="{CH}" role="img" aria-label="{label}">'
            f'<rect x="0.5" y="0.5" width="{CW - 1}" height="{CH - 1}" rx="12" fill="{p["bg"]}" stroke="{p["border"]}"/>')


def fade(begin, inner):
    return (f'<g opacity="0">{inner}<animate attributeName="opacity" from="0" to="1" '
            f'dur="0.45s" begin="{begin}s" fill="freeze"/></g>')


def srs_chart(theme):
    p = CARD[theme]
    out = [card_open(p, "Max tick time with 100 players: 537 ms before, 28.7 ms after")]
    add = out.append
    add(text("Max tick time, 100 players", "SemiBold", 20, 26, 50, p["ink"])[0])
    add(text("15-second load test, tick budget 100 ms", "Regular", 14.5, 26, 76, p["muted"])[0])

    x0, span, full = 26, 394, 600.0
    px = lambda ms: span * ms / full
    budget = x0 + px(100)

    add(text("Before", "Medium", 14.5, 26, 128, p["muted"])[0])
    w_before = px(537)
    add(f'<rect x="{x0}" y="138" width="0" height="38" rx="7" fill="{p["bad"]}">'
        f'<animate attributeName="width" from="0" to="{fmt(w_before)}" dur="1s" begin="0.3s" fill="freeze" '
        'calcMode="spline" keySplines="0.2 0.8 0.2 1" keyTimes="0;1"/></rect>')
    add(fade(1.1, text("537 ms", "Bold", 19, x0 + w_before - 14, 164, p["on_bad"], anchor="end")[0]))

    add(text("After, with sends moved off the tick thread", "Medium", 14.5, 26, 218, p["muted"])[0])
    w_after = px(28.7)
    add(f'<rect x="{x0}" y="228" width="0" height="38" rx="7" fill="{p["good"]}">'
        f'<animate attributeName="width" from="0" to="{fmt(w_after)}" dur="0.6s" begin="1.4s" fill="freeze" '
        'calcMode="spline" keySplines="0.2 0.8 0.2 1" keyTimes="0;1"/></rect>')
    add(f'<line x1="{fmt(budget)}" y1="134" x2="{fmt(budget)}" y2="282" stroke="{p["accent"]}" '
        'stroke-width="1.6" stroke-dasharray="2 5" stroke-linecap="round"/>')
    halo = f'stroke="{p["bg"]}" stroke-width="7" stroke-linejoin="round" paint-order="stroke"'
    add(fade(1.8, text("28.7 ms", "Bold", 19, x0 + w_after + 12, 254, p["ink"], extra=halo)[0]))
    add(text("100 ms budget", "Medium", 12.5, budget + 8, 290, p["accent"])[0])

    add(f'<line x1="26" y1="312" x2="{CW - 26}" y2="312" stroke="{p["line"]}"/>')
    rows = [("Command to screen, p99", "101 ms"), ("Ticks over budget", "0")]
    for i, (k, v) in enumerate(rows):
        y = 344 + i * 32
        add(fade(2.1 + i * 0.15, text(k, "Regular", 14.5, 26, y, p["muted"])[0]
                 + text(v, "SemiBold", 16, CW - 26, y, p["ink"], anchor="end")[0]))
    add('</svg>')
    return "\n".join(out)


MATE = [
    ("finmate", "FinMATE", "Securities: investor profile, glossary, quizzes"),
    ("ohmybank", "Oh My Bank", "Banking: deposit, savings and loan simulation"),
    ("capimate", "CapiMATE", "Capital: repayment schedules, overdue handling"),
    ("cardmate", "CardMATE", "Cards: benefits calculated from spending"),
]


def mate_card(theme):
    p = CARD[theme]
    out = [card_open(p, "MATE series: FinMATE, Oh My Bank, CapiMATE, CardMATE")]
    add = out.append
    add(text("MATE series", "SemiBold", 20, 26, 50, p["ink"])[0])
    add(text("Four finance learning services, one structure", "Regular", 14.5, 26, 76, p["muted"])[0])
    for i, (key, name, desc) in enumerate(MATE):
        y = 102 + i * 58
        mark = png_data_uri(os.path.join(ASSETS, "marks", f"{key}.png"))
        inner = (f'<image x="26" y="{y}" width="42" height="42" href="{mark}" xlink:href="{mark}"/>'
                 + text(name, "SemiBold", 17, 84, y + 18, p["ink"])[0]
                 + text(desc, "Regular", 13.5, 84, y + 38, p["muted"])[0])
        add(fade(0.25 + i * 0.18, inner))
    add(f'<line x1="26" y1="340" x2="{CW - 26}" y2="340" stroke="{p["line"]}"/>')
    add(fade(1.1, text("Shared docs (UR, FR, NFR, ADR), DB strategy and auth", "Regular", 13.5, 26, 370, p["muted"])[0]))
    add('</svg>')
    return "\n".join(out)


if __name__ == "__main__":
    jobs = {"header": header, "srs-chart": srs_chart, "mate-card": mate_card}
    for name, fn in jobs.items():
        for theme in ("light", "dark"):
            path = os.path.join(ASSETS, f"{name}-{theme}.svg")
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(fn(theme))
            print(f"{os.path.relpath(path, ROOT):32s} {os.path.getsize(path) // 1024:4d} KB")
