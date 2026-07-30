import sys; sys.path.insert(0,"/tmp/gen")
from common import *
from logo import mark

MARK_INNER = mark(tile=True).split(">",1)[1].rsplit("</svg>",1)[0]
def markg(x,y,size):
    return f'<g transform="translate({x},{y}) scale({size/512})">{MARK_INNER}</g>'

def lockup(x,y,size=44,fg=T1,sub=T3,tag=True,ls=2.6,fs=32):
    o=[markg(x,y,size)]
    o.append(txt(x+size+16, y+size*0.52, "DEADHEAD", size=fs, weight=900, fill=fg, ls=ls))
    if tag:
        o.append(txt(x+size+17, y+size*0.52+20, "A ROBOTAXI FLEET SIMULATOR", size=11, weight=600, fill=sub, ls=2.4))
    return "".join(o)

def shadowdefs():
    return ('<filter id="sh" x="-30%" y="-30%" width="170%" height="180%">'
            '<feDropShadow dx="0" dy="22" stdDeviation="26" flood-color="#171A20" flood-opacity="0.30"/></filter>'
            '<filter id="sh2" x="-30%" y="-30%" width="170%" height="180%">'
            '<feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#171A20" flood-opacity="0.22"/></filter>')

def playchip(x,y,w=None,dark=False):
    label="game.deadhead.workers.dev"
    w = w or 420
    o=[rrect(x,y,w,60,30,ACCENT)]
    o.append(f'<path d="M {x+30} {y+20} l 18 10 l -18 10 z" fill="#fff"/>')
    o.append(txt(x+62, y+38, "Play free in your browser", size=21, weight=700, fill="#FFFFFF"))
    return "".join(o)

# ============ CARD 1 — the main OG card ============
def card_main(W=1200,H=630):
    shot = img64(os.path.join(SCR,"console-wide-day.jpg"))
    p=[f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{W}" height="{H}" viewBox="0 0 {W} {H}">']
    p.append('<defs>'+bggrad()+shadowdefs()+
             '<clipPath id="cshot"><rect x="632" y="150" width="536" height="258" rx="12"/></clipPath></defs>')
    p.append(canvasbg(W,H))
    # screenshot, bleeding off the right
    p.append(f'<g filter="url(#sh)"><rect x="632" y="150" width="536" height="258" rx="12" fill="#fff"/></g>')
    p.append(f'<g clip-path="url(#cshot)"><image xlink:href="{shot}" x="632" y="150" width="536" height="258"/></g>')
    p.append(f'<rect x="632" y="150" width="536" height="258" rx="12" fill="none" stroke="rgba(23,26,32,0.14)"/>')
    shot2 = img64(os.path.join(SCR,"console-mobile-night.jpg"))
    p.append('<clipPath id="cph"><rect x="1000" y="330" width="150" height="233" rx="14"/></clipPath>')
    p.append(f'<g filter="url(#sh)"><rect x="994" y="324" width="162" height="245" rx="20" fill="#0C0D0F"/></g>')
    p.append(f'<g clip-path="url(#cph)"><image xlink:href="{shot2}" x="1000" y="330" width="150" height="233"/></g>')
    # left column
    p.append(lockup(64,56,46))
    p.append(txt(64, 236, "Six cars.", size=54, weight=800, fill=T1, ls=-1.2))
    p.append(txt(64, 296, "Six real cities.", size=54, weight=800, fill=T1, ls=-1.2))
    p.append(txt(64, 356, "One very honest", size=54, weight=800, fill=T1, ls=-1.2))
    p.append(txt(64, 416, "spreadsheet.", size=54, weight=800, fill=ACCENT2, ls=-1.2))
    p.append(txt(64, 470, "Your cars bill you at midnight whether they moved or not.", size=19, weight=500, fill=T3))
    p.append(playchip(64, 506))
    p.append(txt(64, 598, "FREE  ·  NO INSTALL  ·  NO ACCOUNT  ·  NO ADS  ·  GAME.DEADHEAD.WORKERS.DEV", size=13, weight=700, fill=T4, ls=2))
    p.append('</svg>')
    return "\n".join(p)

write("og-card-main", card_main(), 1200, 630)

# ============ CARD 2 — the numbers ============
def card_numbers(W=1200,H=630):
    p=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">']
    p.append('<defs>'+bggrad()+shadowdefs()+'</defs>')
    p.append(canvasbg(W,H))
    p.append(lockup(64,52,44))
    p.append(txt(64, 190, "The numbers are real.", size=52, weight=800, fill=T1, ls=-1.1))
    p.append(txt(64, 232, "That is the difficulty setting.", size=52, weight=800, fill=ACCENT2, ls=-1.1))
    stats=[("9","trims, on a spec ladder\nthat matches the real one"),
           ("6","real Robotaxi geofences,\nnot reskins"),
           ("6","real utilities' time-of-use\ntariffs, hour by hour"),
           ("0","installs, accounts, ads\nor paywalls")]
    x0=64; gap=24; cw=(W-128-gap*3)/4
    for i,(n,l) in enumerate(stats):
        x=x0+i*(cw+gap)
        p.append(f'<g filter="url(#sh2)">'+rrect(x,300,cw,196,16,"rgba(255,255,255,0.80)")+'</g>')
        p.append(rrect(x,300,cw,196,16,"none",stroke="rgba(23,26,32,0.10)"))
        p.append(txt(x+24, 388, n, size=72, weight=900, fill=T1, ls=-2))
        for j,line in enumerate(l.split("\n")):
            p.append(txt(x+24, 428+j*22, line, size=15.5, weight=500, fill=T3))
    p.append(txt(64, 566, "A 72 kW charging site is slow here because it genuinely is.", size=19, weight=500, fill=T2))
    p.append(txt(64, 596, "game.deadhead.workers.dev", size=19, weight=700, fill=ACCENT2))
    p.append('</svg>')
    return "\n".join(p)

write("og-card-numbers", card_numbers(), 1200, 630)

# ============ CARD 3 — the trilemma ============
def card_dayone(W=1200,H=630):
    p=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">']
    p.append('<defs>'+bggrad()+shadowdefs()+'</defs>')
    p.append(canvasbg(W,H))
    p.append(lockup(64,50,44))
    p.append(txt(64, 184, "$500 and no car.", size=52, weight=800, fill=T1, ls=-1.2))
    p.append(txt(64, 226, "The cheapest one is $30,000. You are renting, and you can afford one.", size=22, weight=500, fill=T3))
    cols=[("BUY OUTRIGHT","$30,000","sixty times your bank balance","OUT OF REACH",T4,True),
          ("FINANCE","$5,000","down plus lender's reserve","OUT OF REACH",T4,True),
          ("RENT ONE","$389","signing plus runway, Cab","THE ONLY DOOR",ACCENT,False)]
    x0=64; gap=22; cw=(W-128-gap*2)/3
    for i,(h,big,unit,tag,c,dim) in enumerate(cols):
        x=x0+i*(cw+gap)
        fill = "rgba(255,255,255,0.42)" if dim else "rgba(255,255,255,0.92)"
        p.append(f'<g filter="url(#sh2)">'+rrect(x,268,cw,262,18,fill)+'</g>')
        p.append(rrect(x,268,cw,262,18,"none",stroke="rgba(23,26,32,0.10)"))
        p.append(rrect(x,268,cw,5,2.5,c))
        p.append(txt(x+26, 314, h, size=13, weight=700, fill=c, ls=2))
        p.append(txt(x+26, 376, big, size=46, weight=900, fill=T4 if dim else T1, ls=-1.5))
        p.append(txt(x+26, 402, unit, size=14.5, weight=500, fill=T4 if dim else T3))
        ty=436
        if dim:
            p.append(rrect(x+26,ty,150,26,13,"rgba(23,26,32,0.07)"))
            p.append(txt(x+40, ty+18, tag, size=11.5, weight=700, fill=T4, ls=1.4))
            p.append(txt(x+26, ty+56, "You have $500.", size=15, weight=500, fill=T4))
        else:
            p.append(rrect(x+26,ty,150,26,13,"rgba(62,106,225,0.14)"))
            p.append(txt(x+42, ty+18, tag, size=11.5, weight=700, fill=ACCENT2, ls=1.4))
            p.append(txt(x+26, ty+56, "$75 rent plus two days' runway.", size=15, weight=500, fill=T2))
            p.append(txt(x+26, ty+78, "A second one needs $703.", size=15, weight=500, fill=T2))
    p.append(txt(64, 566, "Day one is not a strategy. It is a single choice.", size=22, weight=700, fill=T1))
    p.append(txt(64, 598, "Axiom Cab, hour one  \u00b7  game.deadhead.workers.dev", size=16, weight=500, fill=T3))
    p.append('</svg>')
    return "\n".join(p)

write("og-card-dayone", card_dayone(), 1200, 630)

def card_sf(W=1200,H=630):
    SFA="#187A4A"; SFT="#2ECC81"
    p=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">']
    p.append(f'''<defs>
<radialGradient id="sga" cx="15%" cy="-10%" r="80%">
  <stop offset="0%" stop-color="{SFT}" stop-opacity="0.24"/><stop offset="60%" stop-color="{SFT}" stop-opacity="0"/>
</radialGradient>
<radialGradient id="sgb" cx="100%" cy="10%" r="80%">
  <stop offset="0%" stop-color="{ACCENT}" stop-opacity="0.14"/><stop offset="55%" stop-color="{ACCENT}" stop-opacity="0"/>
</radialGradient>'''+shadowdefs()+'</defs>')
    p.append(f'<rect width="{W}" height="{H}" fill="{CANVAS}"/>')
    p.append(f'<rect width="{W}" height="{H}" fill="url(#sga)"/><rect width="{W}" height="{H}" fill="url(#sgb)"/>')
    p.append(lockup(64,50,44))
    p.append(rrect(64,148,214,28,14,"rgba(24,122,74,0.10)",stroke="rgba(24,122,74,0.28)"))
    p.append(txt(82, 167, "CITY SIX  \u00b7  SAN FRANCISCO", size=12, weight=700, fill=SFA, ls=1.6))
    p.append(txt(64, 250, "Five cities teach you", size=46, weight=800, fill=T1, ls=-1))
    p.append(txt(64, 300, "to run a fleet.", size=46, weight=800, fill=T1, ls=-1))
    p.append(txt(64, 358, "The sixth gives you one car", size=46, weight=800, fill=SFA, ls=-1))
    p.append(txt(64, 408, "and puts you in it.", size=46, weight=800, fill=SFA, ls=-1))
    p.append(txt(64, 460, "The real Bay Area service runs with a safety driver aboard. The driver is you.", size=17.5, weight=500, fill=T3))
    facts=[("1","car. Fleet cap, not a\nsuggestion."),
           ("1\u00d7","speed, locked. No\nfast-forward."),
           ("$250","a day, for the seat.\nOnly if you clock on."),
           ("62c","peak per kWh. PG&E.\nOff-peak is 31c.")]
    x0=64; gap=16; cw=(W-128-gap*3)/4
    for i,(n,l) in enumerate(facts):
        x=x0+i*(cw+gap)
        p.append(f'<g filter="url(#sh2)">'+rrect(x,500,cw,92,12,"rgba(255,255,255,0.80)")+'</g>')
        p.append(rrect(x,500,cw,92,12,"none",stroke="rgba(23,26,32,0.10)"))
        p.append(txt(x+18, 536, n, size=30, weight=900, fill=T1, ls=-1))
        for j,line in enumerate(l.split("\n")):
            p.append(txt(x+18, 556+j*17, line, size=12.5, weight=500, fill=T3))
    p.append(txt(W-64, 612, "game.deadhead.workers.dev", size=15, weight=600, fill=T4, anchor="end"))
    p.append('</svg>')
    return "\n".join(p)

write("og-card-sf", card_sf(), 1200, 630)


