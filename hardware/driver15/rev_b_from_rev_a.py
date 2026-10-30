"""Rev B: cập nhật khoảng cách socket ESP từ 27,5 sang 25 mm theo số đo người dùng."""
from pathlib import Path
import pcbnew as p,json,csv,shutil
ROOT=Path(__file__).resolve().parent;A=ROOT/'rev-a';B=ROOT/'rev-b';B.mkdir(exist_ok=True)
for old,new in [('scentstation-rev-a.kicad_pro','scentstation-rev-b.kicad_pro'),('scentstation-rev-a.kicad_sch','scentstation-rev-b.kicad_sch'),('RevA.kicad_sym','RevA.kicad_sym'),('sym-lib-table','sym-lib-table'),('fp-lib-table','fp-lib-table'),('pin-net.csv','pin-net.csv')]:
    s=(A/old).read_text(encoding='utf-8-sig').replace('scentstation-rev-a','scentstation-rev-b').replace('Rev A','Rev B').replace('27.5_ASSUMED','25_MEASURED')
    (B/new).write_text(s,encoding='utf-8')
b=p.LoadBoard(str(A/'scentstation-rev-a.kicad_pcb'))
fps={f.GetReference():f for f in b.GetFootprints()}
right=fps['JESPR1'];oldx=right.GetPosition().x
right.SetPosition(p.VECTOR2I(p.FromMM(39),right.GetPosition().y))
def xy(x,y):return p.VECTOR2I(p.FromMM(x),p.FromMM(y))
for ref in ['JESPL1','JESPR1']:fps[ref].SetValue('ESP32_1x19_SPACING_25_MEASURED')
for pad in right.Pads():
    if not pad.GetNetname():continue
    a=pad.GetPosition();old=p.VECTOR2I(oldx,a.y)
    t=p.PCB_TRACK(b);t.SetStart(a);t.SetEnd(old);t.SetWidth(p.FromMM(.3));t.SetLayer(p.F_Cu);t.SetNet(pad.GetNet());b.Add(t)
    v=p.PCB_VIA(b);v.SetPosition(old);v.SetWidth(p.FromMM(.8));v.SetDrill(p.FromMM(.4));v.SetViaType(p.VIATYPE_THROUGH);v.SetLayerPair(p.F_Cu,p.B_Cu);v.SetNet(pad.GetNet());b.Add(v)
for x in b.GetDrawings():
    if isinstance(x,p.PCB_TEXT):
        text=x.GetText().replace('REV A','REV B').replace('ESP 27.5mm ASSUMED','ESP 25mm USER MEASURED')
        x.SetText(text)
b.BuildListOfNets();b.GetConnectivity().Build(b);p.ZONE_FILLER(b).Fill(b.Zones())
p.SaveBoard(str(B/'scentstation-rev-b.kicad_pcb'),b)
d=json.loads((A/'design.json').read_text(encoding='utf-8'));d['esp_spacing_mm']=25;d['esp_spacing_source']='User measurement, 2026-10-20'
for c in d['components']:
    if c['ref']=='JESPR1':c['x']=39
    if c['ref'] in ('JESPR1','JESPL1'):c['value']='ESP32_1x19_SPACING_25_MEASURED'
(B/'design.json').write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
for filename in ['BOM.csv','BOM-grouped.csv']:
    if filename=='BOM-grouped.csv':continue
    with (B/filename).open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.writer(f);w.writerow(['Reference','Value','Footprint','X_mm','Y_mm','Rotation','Notes'])
        for c in d['components']:w.writerow([c[k] for k in ['ref','value','footprint','x','y','rotation','notes']])
print('Rev B: left row 14 mm, right row 39 mm; center-to-center spacing 25 mm.')
