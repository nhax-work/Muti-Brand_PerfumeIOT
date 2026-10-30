"""Đối chiếu từng chân PCB với model thiết kế và netlist từ Eeschema."""
from pathlib import Path
import json,xml.etree.ElementTree as ET,collections,os
import pcbnew as p
REV=os.environ.get('SCENT_REV','a')
B=Path(__file__).resolve().parent/f'rev-{REV}'
d=json.loads((B/'design.json').read_text(encoding='utf-8'))
b=p.LoadBoard(str(B/f'scentstation-rev-{REV}.kicad_pcb'))
fps={x.GetReference():x for x in b.GetFootprints()}
model={(c['ref'],str(pin)):n for c in d['components'] for pin,n in c['pins'].items() if n}
actual={(fp.GetReference(),pad.GetNumber()):pad.GetNetname() for fp in b.GetFootprints() for pad in fp.Pads() if pad.GetNumber() and pad.GetNetname()}
xml=ET.parse(B/'schematic.net').getroot()
schematic={(node.attrib['ref'],node.attrib['pin']):n.attrib['name'].removeprefix('/') for n in xml.findall('./nets/net') if not n.attrib['name'].startswith('unconnected-') for node in n.findall('node') if not node.attrib['ref'].startswith('#')}
errors=[]
for key,n in model.items():
    if actual.get(key)!=n:errors.append(['pcb',key,n,actual.get(key)])
    if schematic.get(key)!=n:errors.append(['schematic',key,n,schematic.get(key)])
for key,n in actual.items():
    if key not in model:errors.append(['unexpected connected PCB pad',key,n])
values={c['ref']:c['value'] for c in d['components']}
for ref,value in values.items():
    if fps[ref].GetValue()!=value:errors.append(['value',ref,value,fps[ref].GetValue()])
left=fps['JESPL1'].GetPosition();right=fps['JESPR1'].GetPosition()
spacing=p.ToMM(right.x-left.x)
if abs(spacing-d['esp_spacing_mm'])>.001:errors.append(['socket spacing',spacing,d['esp_spacing_mm']])
for n in range(1,16):
    fp=fps['Q'+str(n)];pins={a.GetNumber():a.GetNetname() for a in fp.Pads() if a.GetNumber()}
    if pins!={'1':f'GATE{n}','2':f'DRAIN{n}','3':'GND'}:errors.append(['MOSFET pin mapping',n,pins])
for n in range(1,11):
    pins={a.GetNumber():a.GetNetname() for a in fps['D'+str(n)].Pads()}
    if pins!={'1':'12V_LOAD','2':f'DRAIN{n}'}:errors.append(['flyback polarity',n,pins])
r={'tool':'KiCad pcbnew + Eeschema XML netlist','kicad_version':p.GetBuildVersion(),'model_connected_pins':len(model),'pcb_connected_pins':len(actual),'schematic_connected_pins_without_flags':len(schematic),'component_count':len(fps),'net_count':len(set(actual.values())),'esp_spacing_mm_assumed':spacing,'track_segments':sum(not isinstance(t,p.PCB_VIA) for t in b.GetTracks()),'vias':sum(isinstance(t,p.PCB_VIA) for t in b.GetTracks()),'errors':errors,'passed':not errors,'limitations':['Checks model consistency, not whether the physical ESP board matches the assumed DevKitC V4 pinout.','No bench validation of power, thermal behavior, watchdog, flow or valve timing.']}
(B/'board-audit.json').write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(r,ensure_ascii=False,indent=2))
if errors:raise SystemExit(1)
