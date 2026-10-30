"""Đọc PCB Rev B và thống kê đường công suất; không sửa thiết kế."""
from pathlib import Path
import collections
import json
import os
TOOLS = Path(__file__).resolve().parent / '.tools'
os.environ['KICAD_CONFIG_HOME'] = str(TOOLS / 'config')
os.environ['KICAD_DOCUMENTS_HOME'] = str(TOOLS / 'documents')
import pcbnew as p
import sys
sys.path.insert(0, str(TOOLS / 'python'))
from shapely.geometry import LineString, Point
from shapely.ops import unary_union

BASE = Path(__file__).resolve().parent / 'rev-b'
b = p.LoadBoard(str(BASE / 'scentstation-rev-b.kicad_pcb'))
def point(v):
    return [round(p.ToMM(v.x), 4), round(p.ToMM(v.y), 4)]

result = {'copper_assessment_um': 35, 'nets': {}, 'zones': [], 'pads': []}
for t in b.GetTracks():
    name = t.GetNetname()
    if name not in ('12V_LOAD', 'GND', '5V', '5V_EXT', '3V3') and not name.startswith('DRAIN'):
        continue
    net = result['nets'].setdefault(name, {'tracks': [], 'vias': []})
    if isinstance(t, p.PCB_VIA):
        net['vias'].append({'at': point(t.GetPosition()), 'diameter_mm': p.ToMM(t.GetWidth(p.F_Cu)), 'drill_mm': p.ToMM(t.GetDrillValue())})
    else:
        net['tracks'].append({'start': point(t.GetStart()), 'end': point(t.GetEnd()), 'width_mm': round(p.ToMM(t.GetWidth()), 4), 'length_mm': round(p.ToMM(t.GetLength()), 4), 'layer': b.GetLayerName(t.GetLayer())})
for z in b.Zones():
    result['zones'].append({'net': z.GetNetname(), 'layer': b.GetLayerName(z.GetLayer()), 'pad_connection': int(z.GetPadConnection()), 'min_thickness_mm': p.ToMM(z.GetMinThickness())})
for fp in b.GetFootprints():
    if any(pad.GetNetname() in result['nets'] for pad in fp.Pads()):
        for pad in fp.Pads():
            result['pads'].append({'ref': fp.GetReference(), 'pad': pad.GetNumber(), 'net': pad.GetNetname(), 'at': point(pad.GetPosition()), 'size_mm': point(pad.GetSize()), 'drill_mm': point(pad.GetDrillSize())})
for name, net in result['nets'].items():
    widths = collections.defaultdict(float)
    for t in net['tracks']:
        widths[t['width_mm']] += t['length_mm']
    net['length_by_width_mm'] = {str(w): round(length, 3) for w, length in sorted(widths.items())}
    print(name, net['length_by_width_mm'], 'vias', net['vias'] if name.startswith('DRAIN') else len(net['vias']))
result['screening_1oz_external_10C_A'] = {str(w): round(.048 * 10**.44 * ((w/.0254)*(.035/.0254))**.725, 3) for w in [.25,.3,.5,1,1.5,2,3,4]}
wide = unary_union([LineString([t['start'], t['end']]).buffer(t['width_mm']/2) for t in result['nets']['12V_LOAD']['tracks'] if t['width_mm'] >= 1 and t['layer'] == 'F.Cu'])
result['wide_12V_geometry_check'] = {
    'method': 'Union of top-layer tracks >= 1 mm; pad center coverage, not thermal simulation',
    'connected_regions': len(wide.geoms) if hasattr(wide, 'geoms') else 1,
    'uncovered_pad_centers': [pad for pad in result['pads'] if pad['net'] == '12V_LOAD' and wide.distance(Point(pad['at'])) > .001],
}
(BASE / 'power-1oz-audit.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print('ZONES', result['zones'])
print('IPC2221_SCREENING', result['screening_1oz_external_10C_A'])
