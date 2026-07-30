import sys; sys.path.insert(0,"/tmp/gen")
from common import *
from logo import mark
MARK_INNER = mark(tile=True).split(">",1)[1].rsplit("</svg>",1)[0]
def markg(x,y,size): return f'<g transform="translate({x},{y}) scale({size/512})">{MARK_INNER}</g>'
def shdefs():
    return ('<filter id="sh" x="-40%" y="-40%" width="180%" height="200%">'
            '<feDropShadow dx="0" dy="30" stdDeviation="34" flood-color="#171A20" flood-opacity="0.32"/></filter>')

def laptop(x,y,w,shot_path, night=False):
    """MacBook-ish frame. w = screen bezel outer width."""
    ar = 729/1568.0
    bez=14; sw=w-bez*2; sh=sw*ar
    H=sh+bez*2
    o=[]
    o.append(f'<g filter="url(#sh)"><rect x="{x}" y="{y}" width="{w}" height="{H}" rx="16" fill="#1B1D22"/></g>')
    o.append(f'<rect x="{x}" y="{y}" width="{w}" height="{H}" rx="16" fill="none" stroke="rgba(255,255,255,0.10)"/>')
    cid=f"lp{abs(hash(shot_path))%99999}"
    o.append(f'<clipPath id="{cid}"><rect x="{x+bez}" y="{y+bez}" width="{sw}" height="{sh}" rx="4"/></clipPath>')
    o.append(f'<g clip-path="url(#{cid})"><image xlink:href="{img64(shot_path)}" x="{x+bez}" y="{y+bez}" width="{sw}" height="{sh}"/></g>')
    o.append(f'<circle cx="{x+w/2}" cy="{y+bez/2}" r="2.6" fill="#3A3D44"/>')
    # base / hinge
    bw=w*1.10; bx=x-(bw-w)/2; by=y+H
    o.append(f'<rect x="{bx}" y="{by}" width="{bw}" height="12" rx="4" fill="#2A2D33"/>')
    o.append(f'<rect x="{bx+bw/2-38}" y="{by}" width="76" height="6" rx="3" fill="#1B1D22"/>')
    o.append(f'<rect x="{bx-8}" y="{by+12}" width="{bw+16}" height="5" rx="2.5" fill="#16181C" opacity="0.55"/>')
    return "".join(o), H+17

def phone(x,y,w,shot_path):
    ar = 819/528.0
    bez=9; sw=w-bez*2; sh=sw*ar; H=sh+bez*2
    o=[]
    cid=f"ph{abs(hash(shot_path))%99999}"
    o.append(f'<g filter="url(#sh)"><rect x="{x}" y="{y}" width="{w}" height="{H}" rx="{w*0.13}" fill="#0C0D0F"/></g>')
    o.append(f'<rect x="{x}" y="{y}" width="{w}" height="{H}" rx="{w*0.13}" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="1.4"/>')
    o.append(f'<clipPath id="{cid}"><rect x="{x+bez}" y="{y+bez}" width="{sw}" height="{sh}" rx="{w*0.10}"/></clipPath>')
    o.append(f'<g clip-path="url(#{cid})"><image xlink:href="{img64(shot_path)}" x="{x+bez}" y="{y+bez}" width="{sw}" height="{sh}"/></g>')
    o.append(f'<rect x="{x+w/2-w*0.15}" y="{y+bez+5}" width="{w*0.30}" height="{w*0.055}" rx="{w*0.028}" fill="#0C0D0F"/>')
    return "".join(o), H

# ---- 1. laptop alone (day) ----
def m_laptop(night=False, W=1800, H=1150):
    shot = os.path.join(SCR, "console-wide-night.jpg" if night else "console-wide-day.jpg")
    p=[f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{W}" height="{H}" viewBox="0 0 {W} {H}">']
    p.append('<defs>'+bggrad(night=night)+shdefs()+'</defs>')
    p.append(canvasbg(W,H,night))
    g,hh = laptop(160, 210, W-320, shot, night)
    p.append(g); p.append('</svg>')
    return "\n".join(p)
write("mockup-laptop-day",  m_laptop(False), 1800, 1150)
write("mockup-laptop-night",m_laptop(True),  1800, 1150)

# ---- 2. phone alone ----
def m_phone(W=900,H=1400):
    p=[f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{W}" height="{H}" viewBox="0 0 {W} {H}">']
    p.append('<defs>'+bggrad()+shdefs()+'</defs>')
    p.append(canvasbg(W,H))
    g,hh = phone(255, 120, 390, os.path.join(SCR,"console-mobile-night.jpg"))
    p.append(g); p.append('</svg>')
    return "\n".join(p)
write("mockup-phone", m_phone(), 900, 1400)

# ---- 3. hero duo: laptop + phone + wordmark ----
def m_duo(W=2000,H=1200):
    p=[f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{W}" height="{H}" viewBox="0 0 {W} {H}">']
    p.append('<defs>'+bggrad()+shdefs()+'</defs>')
    p.append(canvasbg(W,H))
    p.append(markg(120,96,64))
    p.append(txt(204, 140, "DEADHEAD", size=46, weight=900, fill=T1, ls=4))
    p.append(txt(206, 166, "A ROBOTAXI FLEET SIMULATOR", size=15, weight=600, fill=T3, ls=3.4))
    p.append(txt(120, 268, "One screen. Six cars. Six real cities.", size=44, weight=800, fill=T1, ls=-0.9))
    p.append(txt(120, 314, "Phone, laptop, ultrawide — the layout reworks itself. No install, no account.", size=21, weight=500, fill=T3))
    g,_ = laptop(120, 400, 1420, os.path.join(SCR,"console-wide-day.jpg"))
    p.append(g)
    g2,_ = phone(1560, 356, 330, os.path.join(SCR,"console-mobile-night.jpg"))
    p.append(g2)
    p.append(txt(120, 1140, "game.deadhead.workers.dev", size=24, weight=700, fill=ACCENT2))
    p.append('</svg>')
    return "\n".join(p)
write("mockup-hero-duo", m_duo(), 2000, 1200)

# ---- 4. itch banner 1920x620 ----
def itch_banner(W=1920,H=620):
    p=[f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{W}" height="{H}" viewBox="0 0 {W} {H}">']
    p.append('<defs>'+bggrad()+shdefs()+
             f'<clipPath id="bshot"><rect x="1010" y="86" width="836" height="403" rx="14"/></clipPath></defs>')
    p.append(canvasbg(W,H))
    p.append(f'<g filter="url(#sh)"><rect x="1010" y="86" width="836" height="403" rx="14" fill="#fff"/></g>')
    p.append(f'<g clip-path="url(#bshot)"><image xlink:href="{img64(os.path.join(SCR,"console-wide-day.jpg"))}" x="1010" y="86" width="836" height="403" preserveAspectRatio="xMidYMid slice"/></g>')
    p.append(f'<rect x="1010" y="86" width="836" height="403" rx="14" fill="none" stroke="rgba(23,26,32,0.14)"/>')
    p.append(markg(88,80,68))
    p.append(txt(176, 128, "DEADHEAD", size=50, weight=900, fill=T1, ls=4.5))
    p.append(txt(178, 156, "A ROBOTAXI FLEET SIMULATOR", size=15, weight=600, fill=T3, ls=3.4))
    p.append(txt(88, 288, "You never touch a steering wheel.", size=44, weight=800, fill=T1, ls=-0.9))
    p.append(txt(88, 344, "You are the person the driver got", size=44, weight=800, fill=T1, ls=-0.9))
    p.append(txt(88, 400, "replaced by, and the job is harder.", size=44, weight=800, fill=ACCENT2, ls=-0.9))
    p.append(txt(88, 466, "Free  ·  browser  ·  no install  ·  no account  ·  no ads", size=20, weight=500, fill=T3))
    p.append('</svg>')
    return "\n".join(p)
write("itch-banner", itch_banner(), 1920, 620)

# ---- 5. itch cover 630x500 ----
def itch_cover(W=630,H=500):
    p=[f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{W}" height="{H}" viewBox="0 0 {W} {H}">']
    p.append('<defs>'+bggrad()+shdefs()+
             '<clipPath id="cv"><rect x="34" y="238" width="562" height="196" rx="10"/></clipPath></defs>')
    p.append(canvasbg(W,H))
    p.append(markg(34,34,58))
    p.append(txt(108, 74, "DEADHEAD", size=34, weight=900, fill=T1, ls=3))
    p.append(txt(109, 96, "A ROBOTAXI FLEET SIMULATOR", size=10.5, weight=600, fill=T3, ls=2.4))
    p.append(txt(34, 158, "Six cars. Six cities.", size=34, weight=800, fill=T1, ls=-0.7))
    p.append(txt(34, 196, "One honest spreadsheet.", size=34, weight=800, fill=ACCENT2, ls=-0.7))
    p.append(f'<g clip-path="url(#cv)"><image xlink:href="{img64(os.path.join(SCR,"console-wide-day.jpg"))}" x="34" y="238" width="562" height="262"/></g>')
    p.append(f'<rect x="34" y="238" width="562" height="196" rx="10" fill="none" stroke="rgba(23,26,32,0.14)"/>')
    p.append(txt(34, 470, "FREE  ·  IN YOUR BROWSER  ·  NO INSTALL", size=12, weight=700, fill=T3, ls=1.8))
    p.append('</svg>')
    return "\n".join(p)
write("itch-cover", itch_cover(), 630, 500)


# ---- the day-one garage, in a laptop ----
def m_garage(W=1800,H=1150):
    p=[f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{W}" height="{H}" viewBox="0 0 {W} {H}">']
    p.append('<defs>'+bggrad()+shdefs()+'</defs>')
    p.append(canvasbg(W,H))
    g,_ = laptop(160, 210, W-320, os.path.join(SCR,"garage-day-one.jpg"))
    p.append(g); p.append('</svg>')
    return "\n".join(p)
write("mockup-garage-dayone", m_garage(), 1800, 1150)
