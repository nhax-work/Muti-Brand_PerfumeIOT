"""Bỏ các đoạn vướng socket mới và xuất DSN để route lại vùng ESP."""
from pathlib import Path
import json,pcbnew as p,sys
B=Path(__file__).resolve().parent/'rev-b';f=B/'scentstation-rev-b.kicad_pcb'
b=p.LoadBoard(str(f));r=json.loads((B/'drc-final.json').read_text(encoding='utf-8'))
bad=set()
for v in r['violations']:
    if v['severity']=='error' or v['type']=='via_dangling':
        bad.update(i['uuid'] for i in v['items'])
removed=[]
for t in list(b.GetTracks()):
    if t.m_Uuid.AsString() in bad:removed.append(t.GetNetname());b.Remove(t)
    else:t.SetLocked(True)
b.BuildListOfNets();p.ZONE_FILLER(b).Fill(b.Zones());p.SaveBoard(str(f),b)
sys.path.insert(0,str(B.parent/'.tools/python'))
import sexpdata as sp
tree=sp.loads(f.read_text(encoding='utf-8'))
tree=[x for x in tree if not(isinstance(x,list) and x and str(x[0])=='zone' and not any(isinstance(y,list) and y and str(y[0])=='keepout' for y in x))]
temp=B/'routing-only-no-plane.kicad_pcb';temp.write_text(sp.dumps(tree),encoding='utf-8')
routeboard=p.LoadBoard(str(temp))
assert p.ExportSpecctraDSN(routeboard,str(B/'scentstation-rev-b.dsn'))
file=B/'scentstation-rev-b.dsn';s=file.read_text(encoding='utf-8')
s=s.replace('(width 200)','(width 300)').replace('(clearance 200)','(clearance 300)').replace('(clearance 50 (type smd_smd))','(clearance 300 (type smd_smd))')
s=s.replace('Via[0-1]_600:300_um','Via[0-1]_800:400_um').replace('(shape (circle F.Cu 600))','(shape (circle F.Cu 800))').replace('(shape (circle B.Cu 600))','(shape (circle B.Cu 800))')
# Skip GND in the router: it is already connected by the real board's copper plane.
head,tail=s.split('(class kicad_default',1)
classhead,classtail=tail.split('(circuit',1)
classhead=' '.join(x for x in classhead.split() if x!='GND')+'\n'
s=head+'(class kicad_default'+classhead+'(circuit'+classtail
s=s.replace('  )\n  (wiring','    (class GROUND GND (circuit (use_via "Via[0-1]_800:400_um")) (rule (width 300) (clearance 300)))\n  )\n  (wiring')
file.write_text(s,encoding='utf-8')
print('Removed local conflicts:',len(removed),sorted(set(removed)))
