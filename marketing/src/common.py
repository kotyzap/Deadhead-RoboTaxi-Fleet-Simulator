import base64, os, subprocess
import cairosvg

_MARKETING_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(_MARKETING_DIR, "img")
SCR = os.path.join(_MARKETING_DIR, "screens")
os.makedirs(OUT, exist_ok=True)

# --- Deadhead palette (lifted from deadhead.html) ---
CANVAS   = "#EDEFF2"
NIGHT    = "#14161B"
T1       = "#171A20"; T2="#393C41"; T3="#5C5E62"; T4="#8A8D93"
ACCENT   = "#3E6AE1"; ACCENT2="#2F55C4"; ACCENT_HI="#4B77E8"
CHARGE   = "#1F8A4C"; ATTN="#B87503"; CRIT="#C0392B"; IDLE="#8E8E8E"
NT1      = "#F2F2F4"; NT2="#D3D5D9"; NT3="#9A9DA4"; NT4="#6D7078"
BAR      = "#0C0D0F"

FONT = "Inter"
def f(w):
    return {400:"Inter",500:"Inter Medium",600:"Inter SemiBold",
            700:"Inter",800:"Inter ExtraBold",900:"Inter Black"}[w]
def fw(w):
    return "bold" if w==700 else "normal"

def img64(path):
    with open(path,"rb") as fh:
        b=base64.b64encode(fh.read()).decode()
    mime = "image/png" if path.lower().endswith(".png") else "image/jpeg"
    return f"data:{mime};base64,{b}"

def write(name, svg, w, h, scale=1):
    sp = os.path.join(OUT, name+".svg")
    with open(sp,"w") as fh: fh.write(svg)
    cairosvg.svg2png(bytestring=svg.encode(), write_to=os.path.join(OUT,name+".png"),
                     output_width=int(w*scale), output_height=int(h*scale))
    print("wrote", name, f"{int(w*scale)}x{int(h*scale)}")

def txt(x,y,s,size=16,weight=400,fill=T1,anchor="start",ls=0,opacity=1,family=None):
    fam = family or f(weight)
    ex = f' letter-spacing="{ls}"' if ls else ""
    op = f' opacity="{opacity}"' if opacity!=1 else ""
    s = (s.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;"))
    return (f'<text x="{x}" y="{y}" font-family="{fam}" font-size="{size}" '
            f'font-weight="{fw(weight)}" fill="{fill}" text-anchor="{anchor}"{ex}{op}>{s}</text>')

def rrect(x,y,w,h,r,fill,stroke=None,sw=1,opacity=1):
    st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}"{st} opacity="{opacity}"/>'

def bggrad(id="bg", night=False):
    a = "0.20" if night else "0.16"
    b = "0.12" if night else "0.10"
    return f'''
<radialGradient id="{id}a" cx="15%" cy="-10%" r="80%">
  <stop offset="0%" stop-color="{ACCENT}" stop-opacity="{a}"/>
  <stop offset="60%" stop-color="{ACCENT}" stop-opacity="0"/>
</radialGradient>
<radialGradient id="{id}b" cx="100%" cy="0%" r="75%">
  <stop offset="0%" stop-color="{CHARGE}" stop-opacity="{b}"/>
  <stop offset="55%" stop-color="{CHARGE}" stop-opacity="0"/>
</radialGradient>'''

def canvasbg(w,h,night=False,id="bg"):
    base = NIGHT if night else CANVAS
    return (f'<rect width="{w}" height="{h}" fill="{base}"/>'
            f'<rect width="{w}" height="{h}" fill="url(#{id}a)"/>'
            f'<rect width="{w}" height="{h}" fill="url(#{id}b)"/>')
