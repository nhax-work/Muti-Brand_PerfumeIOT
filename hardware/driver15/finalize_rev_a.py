"""Nhập kết quả route, nối GND cục bộ, đổ đồng và chuẩn hóa reference."""
import os,json,csv,re,sys
from pathlib import Path
import pcbnew as p
BASE=Path(__file__).resolve().parent/'rev-a'
f=BASE/'scentstation-rev-a.kicad_pcb'
b=p.LoadBoard(str(f))
if '--import-ses' in sys.argv:
    if not p.ImportSpecctraSES(b,str(BASE/'scentstation-rev-a.ses')):raise RuntimeError('SES import failed')
fps={fp.GetReference():fp for fp in b.GetFootprints()}
nets={n.GetNetname():n for n in b.GetNetsByNetcode().values()}
def xy(x,y):return p.VECTOR2I(p.FromMM(x),p.FromMM(y))
def pos(ref,num):
    pt=next(z for z in fps[ref].Pads() if z.GetNumber()==str(num)).GetPosition()
    return (p.ToMM(pt.x),p.ToMM(pt.y))
def trace(a,z,width,name='GND',layer=p.F_Cu):
    t=p.PCB_TRACK(b);t.SetStart(xy(*a));t.SetEnd(xy(*z));t.SetWidth(p.FromMM(width));t.SetLayer(layer);t.SetNet(nets[name]);b.Add(t)

# Make local gate pull-down returns explicit instead of leaving them to autorouter.
for n in range(1,16):
    a=pos('RPD'+str(n),2);s=pos('Q'+str(n),3)
    trace(a,(s[0],a[1]),.3)

for t in b.GetTracks():
    if isinstance(t,p.PCB_VIA):continue
    if p.ToMM(t.GetWidth())<.25:t.SetWidth(p.FromMM(.25))
    a=t.GetStart();z=t.GetEnd();name=t.GetNetname()
    if name=='12V_LOAD' and abs(p.ToMM(a.x)-60)<.01 and abs(p.ToMM(z.x)-237)<.01:
        y=p.ToMM(a.y);t.SetStart(xy(89 if y in (73,112) else 76,y))
    if name=='GND' and abs(p.ToMM(a.x)-51)<.01:
        if abs(p.ToMM(z.x)-220)<.01:t.SetEnd(xy(206.96,p.ToMM(z.y)))
        elif abs(p.ToMM(z.y)-178)<.01:t.SetEnd(xy(51,174))

zone=p.ZONE(b);zone.SetLayer(p.B_Cu);zone.SetNet(nets['GND'])
zone.SetLocalClearance(p.FromMM(.3));zone.SetMinThickness(p.FromMM(.25))
zone.SetPadConnection(p.ZONE_CONNECTION_FULL)
outline=zone.Outline();outline.NewOutline()
for x,y in [(.75,.75),(239.25,.75),(239.25,189.25),(.75,189.25)]:outline.Append(p.FromMM(x),p.FromMM(y))
b.Add(zone)

d=json.loads((BASE/'design.json').read_text(encoding='utf-8'))
renames={}
for fp in b.GetFootprints():
    old=fp.GetReference();new=re.sub('[^A-Za-z0-9]','',old)
    if not new[-1].isdigit():new+='1'
    renames[old]=new;fp.SetReference(new)
    if new.startswith('H'):fp.Reference().SetVisible(False)
    a=fp.GetPosition();x=p.ToMM(a.x);y=p.ToMM(a.y)
    if new.startswith(('RIN','RPCF')):fp.Reference().SetPosition(xy(x-4.5,y))
    elif new in ('RI2C1','RI2C2'):fp.Reference().SetPosition(xy(x,y+1.9))
    elif new.startswith(('JPUMP','JVALVE','JLIGHT')):fp.Reference().SetPosition(xy(x+2.54,y+14))
    elif new=='JBUCKIN1':fp.Reference().SetPosition(xy(185,26))
for c in d['components']:c['ref']=renames[c['ref']]
assert len(set(renames.values()))==len(renames)
(BASE/'reference-map.json').write_text(json.dumps(renames,indent=2),encoding='utf-8')
(BASE/'design.json').write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
with (BASE/'BOM.csv').open('w',encoding='utf-8-sig',newline='') as fcsv:
    w=csv.writer(fcsv);w.writerow(['Reference','Value','Footprint','X_mm','Y_mm','Rotation','Notes'])
    for c in d['components']:w.writerow([c[k] for k in ['ref','value','footprint','x','y','rotation','notes']])
with (BASE/'pin-net.csv').open('w',encoding='utf-8-sig',newline='') as fcsv:
    w=csv.writer(fcsv);w.writerow(['Reference','Pad','Net'])
    for c in d['components']:
        for pad,n in c['pins'].items():w.writerow([c['ref'],pad,n or 'NC'])

# Move the long prototype warning off exposed diode pads.
for item in b.GetDrawings():
    if isinstance(item,p.PCB_TEXT) and item.GetText().startswith('ESP 27.5mm'):
        item.SetPosition(xy(125,188));item.SetTextSize(xy(.9,.9))

print('Filling bottom GND zone',flush=True)
b.BuildListOfNets();b.GetConnectivity().Build(b)
p.ZONE_FILLER(b).Fill(b.Zones())
p.SaveBoard(str(f),b)
s=f.read_text(encoding='utf-8')
stack='''(stackup
 (layer "F.SilkS" (type "Top Silk Screen"))
 (layer "F.Paste" (type "Top Solder Paste"))
 (layer "F.Mask" (type "Top Solder Mask") (thickness 0.01))
 (layer "F.Cu" (type "copper") (thickness 0.07))
 (layer "dielectric 1" (type "core") (thickness 1.44) (material "FR4") (epsilon_r 4.5) (loss_tangent 0.02))
 (layer "B.Cu" (type "copper") (thickness 0.07))
 (layer "B.Mask" (type "Bottom Solder Mask") (thickness 0.01))
 (layer "B.Paste" (type "Bottom Solder Paste"))
 (layer "B.SilkS" (type "Bottom Silk Screen"))
 (copper_finish "HASL lead-free") (dielectric_constraints no))'''
s=s.replace('(setup','(setup '+stack,1)
f.write_text(s,encoding='utf-8')
print('Saved routed PCB with GND plane and normalized references',flush=True)
