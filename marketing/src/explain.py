import sys; sys.path.insert(0,"/tmp/gen")
from common import *
from logo import mark
MARK_INNER = mark(tile=True).split(">",1)[1].rsplit("</svg>",1)[0]
def markg(x,y,s): return f'<g transform="translate({x},{y}) scale({s/512})">{MARK_INNER}</g>'
def foot(W,H,night=False):
    fg = NT4 if night else T4
    return (markg(64,H-84,34) +
            txt(108, H-58, "DEADHEAD", size=19, weight=900, fill=NT1 if night else T1, ls=2) +
            txt(W-64, H-58, "game.deadhead.workers.dev", size=17, weight=600, fill=fg, anchor="end"))
def shdefs():
    return ('<filter id="sh2" x="-30%" y="-30%" width="170%" height="190%">'
            '<feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#171A20" flood-opacity="0.20"/></filter>')

# ================= 1. DEADHEAD MILES =================
def ex_miles(W=1600,H=900):
    p=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">']
    p.append('<defs>'+bggrad()+shdefs()+'</defs>')
    p.append(canvasbg(W,H))
    p.append(txt(64, 96, "Every offer gives you three numbers.", size=44, weight=800, fill=T1, ls=-0.9))
    p.append(txt(64, 142, "Only the third one decides whether you made money.", size=27, weight=500, fill=T3))

    # --- the offer row, as the game draws it ---
    p.append(f'<g filter="url(#sh2)">'+rrect(64,190,1472,86,14,"#FFFFFF")+'</g>')
    p.append(rrect(64,190,1472,86,14,"none",stroke="rgba(23,26,32,0.10)"))
    p.append(rrect(64,190,5,86,2.5,ACCENT))
    p.append(txt(98, 226, "HITCHR", size=12, weight=700, fill=T4, ls=1.6))
    p.append(txt(168, 228, "Deep Ellum", size=22, weight=700, fill=T1))
    p.append('<path d="M 296 221 h 22 m -7 -6 l 7 6 l -7 6" fill="none" stroke="'+T3+'" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>')
    p.append(txt(332, 228, "Victory Park", size=22, weight=500, fill=T2))
    p.append(txt(98, 256, "1.3 mi  ·  4 min  ·  0.7 mi deadhead  ·  $17.31 fare less 25%", size=16, weight=500, fill=T3))
    p.append(txt(1502, 240, "$12.98", size=32, weight=800, fill=T1, anchor="end"))

    # --- the drive ---
    y=430
    x0, xp, xd = 190, 640, 1420
    p.append(txt(64, 350, "WHAT YOU ACTUALLY DRIVE", size=13, weight=700, fill=T4, ls=2))
    p.append(f'<line x1="{x0}" y1="{y}" x2="{xp}" y2="{y}" stroke="{IDLE}" stroke-width="14" '
             f'stroke-linecap="round" stroke-dasharray="3 26"/>')
    p.append(f'<line x1="{xp}" y1="{y}" x2="{xd}" y2="{y}" stroke="{ACCENT}" stroke-width="14" stroke-linecap="round"/>')
    for cx,lab,sub,col,filled in [(x0,"CAR IDLE","where it was parked",IDLE,False),
                                  (xp,"PICKUP","meter starts here",ACCENT,True),
                                  (xd,"DROP-OFF","meter stops",ACCENT,True)]:
        p.append(f'<circle cx="{cx}" cy="{y}" r="19" fill="{CANVAS if not filled else col}" stroke="{col}" stroke-width="7"/>')
        p.append(txt(cx, y+56, lab, size=14, weight=700, fill=T2, anchor="middle", ls=1.4))
        p.append(txt(cx, y+78, sub, size=14, weight=500, fill=T4, anchor="middle"))
    p.append(txt((x0+xp)/2, y-34, "0.7 mi  ·  EMPTY", size=19, weight=800, fill=T2, anchor="middle", ls=0.6))
    p.append(txt((x0+xp)/2, y-12, "nobody pays for this", size=15, weight=500, fill=CRIT, anchor="middle"))
    p.append(txt((xp+xd)/2, y-34, "1.3 mi  ·  PAYING", size=19, weight=800, fill=ACCENT2, anchor="middle", ls=0.6))
    p.append(txt((xp+xd)/2, y-12, "the only part on the meter", size=15, weight=500, fill=T3, anchor="middle"))

    # --- the money ---
    my=600
    p.append(txt(64, my-16, "WHAT YOU ACTUALLY KEEP", size=13, weight=700, fill=T4, ls=2))
    total=1472; bw=total; bx=64
    keep = 12.98/17.31
    p.append(rrect(bx,my,bw,64,10,"rgba(23,26,32,0.10)"))
    p.append(rrect(bx,my,bw*keep,64,10,ACCENT))
    p.append(txt(bx+22, my+41, "$12.98  you keep", size=23, weight=700, fill="#FFFFFF"))
    p.append(txt(bx+bw-22, my+40, "$4.33 commission", size=19, weight=600, fill=T3, anchor="end"))
    p.append(txt(bx, my+92, "$17.31 on the meter  ·  Hitchr takes 25%", size=17, weight=500, fill=T3))

    p.append(rrect(64,720,1472,84,14,"rgba(62,106,225,0.08)",stroke="rgba(62,106,225,0.22)"))
    p.append(txt(96, 754, "2.0 miles driven. 0.7 of them for free — 35% of the trip.", size=23, weight=700, fill=T1))
    p.append(txt(96, 782, "Those empty miles come out of the $12.98, not the $17.31. That is a deadhead, and it is what the game is named after.", size=17, weight=500, fill=T2))
    p.append(foot(W,H)); p.append('</svg>')
    return "\n".join(p)
write("explainer-deadhead-miles", ex_miles(), 1600, 900)

# ================= 2. TARIFF CLOCK =================
CITIES=[("AUSTIN","Austin Energy",   dict(peak=0.34, mid=0.19, off=0.11,  peakFrom=16,peakTo=21,offFrom=23,offTo=7)),
        ("DALLAS","Oncor",           dict(peak=0.31, mid=0.17, off=0.09,  peakFrom=16,peakTo=21,offFrom=23,offTo=7)),
        ("MIAMI", "Florida Power & Light", dict(peak=0.26,mid=0.15,off=0.09, peakFrom=12,peakTo=21,offFrom=22,offTo=7)),
        ("TAMPA", "TECO",            dict(peak=0.22, mid=0.13, off=0.075, peakFrom=14,peakTo=20,offFrom=23,offTo=7)),
        ("ORLANDO","Orlando Utilities Commission", dict(peak=0.15,mid=0.115,off=0.085,peakFrom=16,peakTo=21,offFrom=23,offTo=7)),
        ("SAN FRANCISCO","PG&E  \u00b7  EV2-A", dict(peak=0.62,mid=0.42,off=0.31, peakFrom=16,peakTo=21,offFrom=23,offTo=7))]
def band(h,p):
    if p["peakFrom"]<=h<p["peakTo"]: return "peak"
    if h>=p["offFrom"] or h<p["offTo"]: return "off"
    return "mid"

def ex_tariff(W=1600,H=900):
    p=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">']
    p.append('<defs>'+bggrad()+shdefs()+'</defs>')
    p.append(canvasbg(W,H))
    p.append(txt(64, 92, "Six cities. Six real utilities.", size=44, weight=800, fill=T1, ls=-0.9))
    p.append(txt(64, 138, "Charge at 4am is a strategy in four of them, barely worth it in a fifth, and not the cheap answer at all in the sixth.", size=21, weight=500, fill=T3))
    COL={"off":CHARGE,"mid":"#B9BDC4","peak":CRIT}
    x0=290; x1=1420; bw=(x1-x0)/24
    ytop=206; rowh=100
    # hour axis
    for h in range(0,25,3):
        xx=x0+h*bw
        p.append(f'<line x1="{xx}" y1="{ytop-14}" x2="{xx}" y2="{ytop+rowh*4+56}" stroke="rgba(255,255,255,0.07)"/>')
        p.append(txt(xx, ytop-24, f"{h:02d}", size=13, weight=600, fill=T4, anchor="middle"))
    for i,(city,util,pw) in enumerate(CITIES):
        y=ytop+i*rowh
        p.append(txt(64, y+30, city, size=19 if len(city)>9 else 21, weight=800, fill=T1, ls=1.2))
        p.append(txt(64, y+50, util, size=13, weight=500, fill=T4))
        for h in range(24):
            b=band(h,pw)
            p.append(f'<rect x="{x0+h*bw}" y="{y}" width="{bw-1.5}" height="42" rx="2" fill="{COL[b]}" opacity="0.92"/>')
        p.append(txt(x1+22, y+19, f"{pw['off']*100:.1f}".rstrip('0').rstrip('.')+"c", size=17, weight=800, fill=CHARGE))
        p.append(txt(x1+22, y+40, f"{pw['peak']*100:.0f}c", size=17, weight=800, fill=CRIT))
    p.append(txt(x1+22, ytop-24, "off / peak", size=12, weight=700, fill=T4, ls=1))
    # legend
    ly=ytop+rowh*4+72
    for j,(lab,c) in enumerate([("OFF-PEAK",CHARGE),("SHOULDER","#5A5E68"),("PEAK",CRIT)]):
        lx=64+j*190
        p.append(rrect(lx,ly,18,18,4,c))
        p.append(txt(lx+28, ly+15, lab, size=14, weight=700, fill=T2, ls=1.2))
    p.append(txt(x1+22, ly+15, "colour shows each city's own bands, not absolute price", size=12.5, weight=500, fill=T4, anchor="end"))
    p.append(rrect(64,730,1472,72,14,"rgba(255,255,255,0.05)",stroke="rgba(255,255,255,0.10)"))
    p.append(txt(96, 762, "Austin's evening peak is five hours. FPL's is nine, and it starts at noon.", size=21, weight=700, fill=NT1))
    p.append(txt(96, 788, "Austin swings 3.1× between off-peak and peak. Orlando swings 1.8×, so overnight charging barely repays the wait. Published utility rates throughout.", size=15.5, weight=500, fill=NT3))
    p.append(foot(W,H)); p.append('</svg>')
    return "\n".join(p)
write("explainer-tariff-clock", ex_tariff(), 1600, 900)

# ================= 3. THE MIDNIGHT BILL =================
def ex_midnight(W=1600,H=900):
    p=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">']
    p.append('<defs>'+bggrad()+shdefs()+'</defs>')
    p.append(canvasbg(W,H))
    p.append(txt(64, 96, "Your cars earn while you watch them.", size=44, weight=800, fill=T1, ls=-0.9))
    p.append(txt(64, 142, "They bill you whether you watched or not.", size=44, weight=800, fill=CRIT, ls=-0.9))
    p.append(txt(64, 190, "You are the remote operator. Clock off and the fleet parks — and midnight still arrives.", size=21, weight=500, fill=T3))

    x0=64; x1=1210; bw=(x1-x0)/24; y=290
    p.append(txt(64, 262, "ONE DAY, ONE CAR", size=13, weight=700, fill=T4, ls=2))
    for h in range(24):
        earning = 17 <= h < 23
        p.append(f'<rect x="{x0+h*bw}" y="{y}" width="{bw-2}" height="72" rx="3" '
                 f'fill="{ACCENT if earning else "rgba(23,26,32,0.12)"}"/>')
    for h in range(0,25,3):
        p.append(txt(x0+h*bw, y+96, f"{h:02d}", size=13, weight=600, fill=T4, anchor="middle"))
    p.append(txt(x0+20*bw, y-14, "6 h  CLOCKED ON", size=15, weight=800, fill=ACCENT2, anchor="middle", ls=0.8))
    p.append(txt(x0+8*bw, y-14, "18 h  PARKED, EARNING NOTHING", size=15, weight=700, fill=T4, anchor="middle", ls=0.8))
    p.append(f'<line x1="{x1+14}" y1="{y-18}" x2="{x1+14}" y2="{y+86}" stroke="{CRIT}" stroke-width="3" stroke-dasharray="6 6"/>')
    p.append(txt(x1+30, y+16, "MIDNIGHT", size=14, weight=800, fill=CRIT, ls=1.4))
    p.append(txt(x1+30, y+40, "the bill lands", size=14, weight=500, fill=T3))
    p.append(txt(x1+30, y+72, "every day", size=14, weight=500, fill=T3))

    # cost card
    cy=470
    p.append(f'<g filter="url(#sh2)">'+rrect(64,cy,700,300,16,"#FFFFFF")+'</g>')
    p.append(rrect(64,cy,700,300,16,"none",stroke="rgba(23,26,32,0.10)"))
    p.append(txt(96, cy+40, "WHAT A CAB OWES AT MIDNIGHT", size=13, weight=700, fill=T4, ls=1.8))
    rows=[("Fixed cost, whatever it did","$82.00"),
          ("Finance instalment","$19.80"),
          ("…or the rental meter instead","$75.00")]
    for i,(l,v) in enumerate(rows):
        ry=cy+86+i*44
        p.append(txt(96, ry, l, size=18, weight=500, fill=T2))
        p.append(txt(732, ry, v, size=20, weight=700, fill=T1 if i<2 else ATTN, anchor="end"))
        p.append(f'<line x1="96" y1="{ry+16}" x2="732" y2="{ry+16}" stroke="rgba(23,26,32,0.08)"/>')
    p.append(txt(96, cy+238, "It moved for six of those twenty-four hours.", size=19, weight=700, fill=CRIT))
    p.append(txt(96, cy+264, "Cab, the cheapest car in the game.", size=14.5, weight=500, fill=T4))

    # quote card
    p.append(f'<g filter="url(#sh2)">'+rrect(800,cy,736,300,16,"rgba(255,255,255,0.72)")+'</g>')
    p.append(rrect(800,cy,736,300,16,"none",stroke="rgba(23,26,32,0.10)"))
    p.append(rrect(800,cy,5,300,2.5,ACCENT))
    p.append(txt(836, cy+42, "PAOLO  ·  MESSAGE 14 OF 14", size=13, weight=700, fill=ACCENT2, ls=1.6))
    p.append(txt(836, cy+104, "You worked six hours.", size=27, weight=700, fill=T1))
    p.append(txt(836, cy+142, "The car was billed for twenty-four.", size=27, weight=700, fill=T1))
    p.append(txt(836, cy+196, "Your margin was you, sitting there for free.", size=21, weight=500, fill=T2))
    p.append(txt(836, cy+226, "And there's only one of you.", size=21, weight=500, fill=T2))
    p.append(foot(W,H)); p.append('</svg>')
    return "\n".join(p)
write("explainer-midnight-bill", ex_midnight(), 1600, 900)

# ================= 4. THE SIX-CITY CHAIN =================
CHAIN=[("AUSTIN","Austin Energy","Supervised","17","$40,000","the tutorial, and a real five-hour evening peak","#3E6AE1"),
       ("DALLAS","Oncor","Unsupervised","24","$60,000","no monitor at all. 34 stalls at 325 kW","#B0722A"),
       ("MIAMI","FPL","Unsupervised","16","$50,000","tiny box, no airport, nine-hour peak","#C0398B"),
       ("TAMPA","TECO","Unsupervised","14","$45,000","Miami mirrored. 7.5c power, after dark","#1D8E9E"),
       ("ORLANDO","OUC","Unsupervised","14","$42,000","the thinnest town, beside an airport it can't serve","#7A5AC4"),
       ("SAN FRANCISCO","PG&E","Supervised","1","$38,000","one car, because there is one of you","#187A4A")]

def ex_chain(W=1600,H=900):
    p=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">']
    p.append('<defs>'+bggrad()+shdefs()+'</defs>')
    p.append(canvasbg(W,H))
    p.append(txt(64, 94, "Six cities. You have to earn each one.", size=44, weight=800, fill=T1, ls=-0.9))
    p.append(txt(64, 138, "Clock off a full shift and the next city unlocks. One company, one bank, six real places — you do not leave a city, you add one.", size=20, weight=500, fill=T3))
    x0=64; gap=22; cw=(W-128-gap*5)/6; ytop=204; ch=386
    for i,(city,util,permit,cap,goal,note,col) in enumerate(CHAIN):
        x=x0+i*(cw+gap); last = i==len(CHAIN)-1
        fill = "#FFFFFF" if not last else "rgba(24,122,74,0.07)"
        p.append(f'<g filter="url(#sh2)">'+rrect(x,ytop,cw,ch,16,fill)+'</g>')
        p.append(rrect(x,ytop,cw,ch,16,"none",stroke=(col if last else "rgba(23,26,32,0.10)"),sw=2 if last else 1))
        p.append(rrect(x,ytop,cw,6,3,col))
        p.append(txt(x+20, ytop+44, f"CITY {i+1}", size=11.5, weight=700, fill=T4, ls=1.6))
        for j,w in enumerate(city.split()):
            p.append(txt(x+20, ytop+78+j*24, w, size=21 if len(w)<10 else 18, weight=800, fill=T1, ls=-0.3))
        yy = ytop + 78 + len(city.split())*24 + 18
        for lab,val in [("UTILITY",util),("PERMIT",permit),("FLEET CAP",cap),("GOAL",goal)]:
            c = col if (lab=="FLEET CAP" and last) else (T1 if lab in("GOAL","FLEET CAP") else T2)
            p.append(txt(x+20, yy, lab, size=10.5, weight=700, fill=T4, ls=1.3))
            big = 26 if (lab=="FLEET CAP" and last) else (17 if lab=="GOAL" else 15)
            p.append(txt(x+20, yy+(26 if big>20 else 20), val, size=big,
                         weight=800 if lab in("GOAL","FLEET CAP") else 500, fill=c))
            yy += (56 if big>20 else 46)
        p.append(f'<line x1="{x+20}" y1="{yy-14}" x2="{x+cw-20}" y2="{yy-14}" stroke="rgba(23,26,32,0.08)"/>')
        words=note.split(); lines=[]; cur=""
        for w in words:
            if len(cur+" "+w)>26: lines.append(cur); cur=w
            else: cur=(cur+" "+w).strip()
        lines.append(cur)
        for j,l in enumerate(lines[:4]):
            p.append(txt(x+20, yy+12+j*17, l, size=12.5, weight=500, fill=T3))
        if i<len(CHAIN)-1:
            ax=x+cw+gap/2; ay=ytop+ch/2
            p.append(f'<circle cx="{ax}" cy="{ay}" r="11" fill="{CANVAS}" stroke="rgba(23,26,32,0.14)"/>')
            p.append(f'<path d="M {ax-4} {ay} h 8 m -3.5 -3.5 l 3.5 3.5 l -3.5 3.5" fill="none" stroke="{T3}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>')
    p.append(rrect(64,650,1472,68,14,"rgba(62,106,225,0.08)",stroke="rgba(62,106,225,0.22)"))
    p.append(txt(96, 680, "The gate is a finished shift, not a bank balance.", size=20, weight=700, fill=T1))
    p.append(txt(96, 705, "Every locked tab is visible from the first boot, and Paolo has something to say about each one. Phoenix and Las Vegas sit at the end, dashed — nobody has launched there, so neither has the game.", size=15, weight=500, fill=T2))
    p.append(txt(64, 772, "AND THE CITIES YOU LEAVE KEEP BILLING YOU", size=12.5, weight=700, fill=T4, ls=1.8))
    p.append(txt(64, 802, "A rented car parked in Miami still owes its fixed cost at midnight while you work Tampa. Three days unpaid and the lender takes it.", size=17.5, weight=700, fill=T1))
    p.append(foot(W,H)); p.append('</svg>')
    return "\n".join(p)
write("explainer-city-chain", ex_chain(), 1600, 900)

# ================= 5. SAN FRANCISCO — soloSeat =================
def ex_sf(W=1600,H=900):
    SFA="#187A4A"; SFT="#2ECC81"
    p=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">']
    p.append(f'''<defs>
<radialGradient id="ga" cx="12%" cy="-10%" r="80%">
  <stop offset="0%" stop-color="{SFT}" stop-opacity="0.24"/><stop offset="60%" stop-color="{SFT}" stop-opacity="0"/>
</radialGradient>
<radialGradient id="gb" cx="100%" cy="8%" r="80%">
  <stop offset="0%" stop-color="{ACCENT}" stop-opacity="0.13"/><stop offset="55%" stop-color="{ACCENT}" stop-opacity="0"/>
</radialGradient>'''+shdefs()+'</defs>')
    p.append(f'<rect width="{W}" height="{H}" fill="{CANVAS}"/><rect width="{W}" height="{H}" fill="url(#ga)"/><rect width="{W}" height="{H}" fill="url(#gb)"/>')
    p.append(rrect(64,52,232,28,14,"rgba(24,122,74,0.10)",stroke="rgba(24,122,74,0.28)"))
    p.append(txt(84, 71, "CITY SIX  ·  SAN FRANCISCO", size=12, weight=700, fill=SFA, ls=1.6))
    p.append(txt(64, 148, "The sixth city takes the fleet away.", size=44, weight=800, fill=T1, ls=-0.9))
    p.append(txt(64, 190, "The real Bay Area service runs with a safety driver in the seat. The driver is you — not an employee, not a line on a payroll.", size=19, weight=500, fill=T3))
    cards=[("FLEET CAP","1","You cannot be in two seats at once. SF has no\nfleet. It has one car, because it has one of you."),
           ("SIM SPEED","1×  LOCKED","Every other city runs at 4× or 20×. You cannot\nfast-forward through a job you are sitting in."),
           ("THE STIPEND","$250 / day","Axiom pays for the seat — but only on a day you\nactually clocked on. Against $38,000, an offset.")]
    y=246; ch=118
    for i,(lab,big,body) in enumerate(cards):
        yy=y+i*(ch+16)
        p.append(f'<g filter="url(#sh2)">'+rrect(64,yy,940,ch,14,"rgba(255,255,255,0.82)")+'</g>')
        p.append(rrect(64,yy,940,ch,14,"none",stroke="rgba(23,26,32,0.10)"))
        p.append(rrect(64,yy,5,ch,2.5,SFA))
        p.append(txt(100, yy+34, lab, size=12, weight=700, fill=SFA, ls=1.6))
        p.append(txt(100, yy+80, big, size=36, weight=900, fill=T1, ls=-1))
        for j,l in enumerate(body.split("\n")):
            p.append(txt(370, yy+56+j*24, l, size=16, weight=500, fill=T2))
    px=1036; pw=500
    p.append(f'<g filter="url(#sh2)">'+rrect(px,y,pw,384,14,"rgba(255,255,255,0.82)")+'</g>')
    p.append(rrect(px,y,pw,384,14,"none",stroke="rgba(23,26,32,0.10)"))
    p.append(txt(px+30, y+38, "PG&E EV2-A  ·  AND NO CHEAP HOUR", size=12, weight=700, fill=SFA, ls=1.4))
    bars=[("SF off-peak",0.31,SFA),("SF peak",0.62,CRIT),
          ("Austin peak",0.34,"#B9BDC4"),("Dallas peak",0.31,"#B9BDC4"),
          ("Miami peak",0.26,"#B9BDC4"),("Tampa peak",0.22,"#B9BDC4"),("Orlando peak",0.15,"#B9BDC4")]
    bx=px+30; bw=pw-60-96; mx=0.62
    for i,(lab,v,c) in enumerate(bars):
        by=y+70+i*42
        p.append(txt(bx, by+14, lab, size=13.5, weight=700 if i<2 else 500, fill=T1 if i<2 else T3))
        p.append(rrect(bx+128,by+2,bw-118,16,8,"rgba(23,26,32,0.07)"))
        p.append(rrect(bx+128,by+2,(bw-118)*(v/mx),16,8,c))
        p.append(txt(px+pw-30, by+15, f"{v*100:.0f}c", size=14, weight=800, fill=T1 if i<2 else T4, anchor="end"))
    p.append(f'<line x1="{bx+128+(bw-118)*(0.31/mx)}" y1="{y+66}" x2="{bx+128+(bw-118)*(0.31/mx)}" y2="{y+366}" stroke="{SFA}" stroke-width="1.5" stroke-dasharray="4 5" opacity="0.75"/>')
    p.append(rrect(64,700,1472,76,14,"rgba(24,122,74,0.07)",stroke="rgba(24,122,74,0.22)"))
    p.append(txt(96, 730, "Five cities teach you to run a fleet. The sixth gives you one car and puts you in it.", size=21, weight=700, fill=T1))
    p.append(txt(96, 756, "The CPUC has said on the record that this is not an autonomous vehicle service — the operator holds the same class of permit a limousine company does. The hostile regulator is real, not invented.", size=14.5, weight=500, fill=T2))
    p.append(foot(W,H)); p.append('</svg>')
    return "\n".join(p)
write("explainer-sf-soloseat", ex_sf(), 1600, 900)
