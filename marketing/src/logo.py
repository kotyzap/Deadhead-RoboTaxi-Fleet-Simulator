import sys; sys.path.insert(0,"/tmp/gen")
from common import *

# ---------- the mark: a route where part of it is empty ----------
def mark(size=512, night=False, tile=True):
    s=size; k=s/512
    tilefill = BAR
    # route path: dashed (deadhead) then solid (paid), ending in a pin
    p=[]
    p.append(f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{s}" height="{s}" viewBox="0 0 512 512">')
    p.append('<defs>'+bggrad(night=True)+'</defs>')
    if tile:
        p.append(f'<rect width="512" height="512" rx="112" fill="{tilefill}"/>')
        p.append(f'<rect width="512" height="512" rx="112" fill="url(#bga)"/>')
    # empty leg (dashed, dim) -> transition dot -> paid leg (solid, accent)
    p.append(f'<path d="M 96 372 C 150 372 168 300 214 288" fill="none" stroke="{NT4}" '
             f'stroke-width="26" stroke-linecap="round" stroke-dasharray="4 46"/>')
    p.append(f'<path d="M 214 288 C 268 274 286 168 400 152" fill="none" stroke="{ACCENT}" '
             f'stroke-width="26" stroke-linecap="round"/>')
    # start dot (car, empty)
    p.append(f'<circle cx="96" cy="372" r="30" fill="{tilefill if tile else CANVAS}" stroke="{NT4}" stroke-width="18"/>')
    # pickup node
    p.append(f'<circle cx="214" cy="288" r="26" fill="{ACCENT}"/>')
    p.append(f'<circle cx="214" cy="288" r="10" fill="{tilefill if tile else CANVAS}"/>')
    # destination
    p.append(f'<circle cx="400" cy="152" r="34" fill="{ACCENT}"/>')
    p.append(f'<path d="M 386 152 l 10 12 l 20 -24" fill="none" stroke="#fff" stroke-width="12" '
             f'stroke-linecap="round" stroke-linejoin="round"/>')
    p.append('</svg>')
    return "\n".join(p)

write("logo-mark", mark(), 512, 512)
write("logo-mark-1024", mark(), 512, 512, scale=2)
write("favicon-256", mark(), 512, 512, scale=0.5)

# ---------- wordmark ----------
def wordmark(night=False, tagline=True, w=880, h=290):
    fg  = NT1 if night else T1
    sub = NT3 if night else T3
    p=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">']
    p.append('<defs>'+bggrad(night=night)+'</defs>')
    p.append(canvasbg(w,h,night))
    # mark, scaled to 132px, at left
    m = mark(tile=True)
    inner = m.split(">",1)[1].rsplit("</svg>",1)[0]
    p.append(f'<g transform="translate(56,{h/2-66}) scale({132/512})">{inner}</g>')
    if night:
        p.append(f'<rect x="56" y="{h/2-66}" width="132" height="132" rx="29" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="1.5"/>')
    x = 56+132+44
    p.append(txt(x, h/2-4, "DEADHEAD", size=68, weight=900, fill=fg, ls=4.5))
    if tagline:
        p.append(txt(x+2, h/2+44, "A ROBOTAXI FLEET SIMULATOR", size=19.5, weight=600, fill=sub, ls=4.2))
    p.append('</svg>')
    return "\n".join(p)

write("logo-wordmark-light", wordmark(False), 880, 290)
write("logo-wordmark-dark",  wordmark(True),  880, 290)
