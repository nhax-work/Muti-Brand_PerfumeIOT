"""Xuất schematic nối bằng nhãn net và sơ đồ SVG từ cùng design.json của PCB."""
from pathlib import Path
from html import escape
import json,uuid
BASE=Path(__file__).resolve().parent/'rev-a'
d=json.loads((BASE/'design.json').read_text(encoding='utf-8'))
comps=[c for c in d['components'] if c['pins']]
lib=['EESchema-LIBRARY Version 2.4','#encoding utf-8']
sch=['EESchema Schematic File Version 4','LIBS:RevA','EELAYER 29 0','EELAYER END',
     '$Descr A0 46811 33110','encoding utf-8','Sheet 1 1','Title "ScentStation Rev A - ENGINEERING SAMPLE"',
     'Date "2026-10-19"','Rev "A - UNVERIFIED HARDWARE"','Comp "CapstoneProject"',
     'Comment1 "Net-label schematic; same pin-net model as PCB. Not production released."',
     'Comment2 "ESP DevKitC V4 pinout assumed; 27.5 mm socket spacing must be measured."','$EndDescr']

def name(ref,pin,net):
    if ref in ('U1','U2'):
        n=int(pin)
        return {1:'/OE1',19:'/OE2',10:'GND',20:'VCC'}.get(n,'A'+str(n-1) if 2<=n<=9 else 'Y'+str(19-n))
    if ref=='U5':return {1:'1A',2:'1Y',3:'2A',4:'2Y',5:'3A',6:'3Y',7:'GND',8:'4Y',9:'4A',10:'5Y',11:'5A',12:'6Y',13:'6A',14:'VCC'}[int(pin)]
    if ref=='U6':return {1:'/1A',2:'1B',3:'/1CLR',8:'GND',9:'/2A',10:'2B',11:'/2CLR',13:'1Q',14:'1CEXT',15:'1REXT_CEXT',16:'VCC'}[int(pin)]
    if ref.startswith('QEN'):return {'1':'E','2':'B','3':'C'}[pin]
    if ref.startswith('Q'):return {'1':'G','2':'D','3':'S'}[pin]
    if ref.startswith('D'):return {'1':'K','2':'A'}[pin]
    return net or 'NC'

svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="'+str(((len(comps)+3)//4)*365+100)+'">',
     '<rect width="100%" height="100%" fill="#f8fafc"/>',
     '<style>text{font-family:Arial,sans-serif;font-size:13px;fill:#0f172a}.head{font-size:17px;font-weight:bold}</style>',
     '<text x="25" y="30" class="head">ScentStation Rev A — sơ đồ kết nối từng chân (cùng net điện với PCB)</text>',
     '<text x="25" y="56">Bản thử nghiệm; GPIO/socket ESP và linh kiện thực tế chưa được xác nhận. Tên net trùng nhau nối điện với nhau.</text>']
for j,c in enumerate(comps):
    ref=c['ref'];pins=list(c['pins'].items());n=len(pins);h=max(200,(n+1)*100)
    lib += [f'# {ref}',f'DEF {ref} {ref.rstrip("0123456789") or "X"} 0 20 Y Y 1 F N',
            f'F0 "{ref}" 0 {h//2+120} 50 H V C CNN',f'F1 "{c["value"]}" 0 {-h//2-120} 45 H V C CNN',
            'DRAW',f'S -450 {h//2} 450 {-h//2} 0 1 10 f']
    x=2100+(j%8)*5600;y=1500+(j//8)*1700
    # Tall symbols get a separate widely spaced page grid to avoid overlapping 20-pin blocks.
    y=2100+(j//8)*1800
    # Compress symbol pin pitch for large pin-count connectors to fit the A0 sheet.
    pitch=55 if n>15 else 75
    hh=max(200,(n+1)*pitch)
    lib[-1]=f'S -450 {hh//2} 450 {-hh//2} 0 1 10 f'
    lib[-4]=f'F0 "{ref}" 0 {hh//2+120} 50 H V C CNN'
    lib[-3]=f'F1 "{c["value"]}" 0 {-hh//2-120} 45 H V C CNN'
    sch += ['$Comp',f'L RevA:{ref} {ref}',f'U 1 1 {uuid.uuid4().hex[:8].upper()}',f'P {x} {y}',
            f'F 0 "{ref}" H {x} {y-hh//2-120} 50 0000 C CNN',
            f'F 1 "{c["value"]}" H {x} {y+hh//2+120} 45 0000 C CNN',
            f'F 2 "{c["footprint"]}" H {x} {y} 50 0001 C CNN',f'\t1 {x} {y}','\t1 0 0 -1','$EndComp']
    sx=25+(j%4)*445;sy=90+(j//4)*365
    svg += [f'<rect x="{sx}" y="{sy}" width="425" height="345" rx="6" fill="white" stroke="#94a3b8"/>',
            f'<text x="{sx+12}" y="{sy+24}" class="head">{escape(ref+" • "+c["value"])}</text>']
    for i,(pin,net) in enumerate(pins):
        py=(n-1)*pitch//2-i*pitch;pn=name(ref,pin,net)
        lib.append(f'X {pn} {pin} -650 {py} 200 R 35 35 1 1 P')
        yy=y-py
        if net:
            sch += ['Wire Wire Line',f'\t{x-650} {yy} {x-1300} {yy}',f'Text Label {x-1300} {yy} 2 35 ~ 0',net]
        else:sch += [f'NoConn ~ {x-650} {yy}']
        svg += [f'<text x="{sx+12}" y="{sy+47+i*14}">{escape(pin+" "+pn+" → "+(net or "NC"))}</text>']
    lib += ['ENDDRAW','ENDDEF']
lib.append('#End Library');sch.append('$EndSCHEMATC');svg.append('</svg>')
(BASE/'so-do-tung-chan.svg').write_text('\n'.join(svg),encoding='utf-8')
print('Generated full pin/net SVG:',len(comps),'components')

# Modern self-contained schematic: embeds symbols, so it does not depend on
# legacy symbol-table resolution when opened on another computer.
def uid():return str(uuid.uuid4())
def q(s):return json.dumps(str(s),ensure_ascii=False)
def electrical(cmp,pin):
    ref=cmp['ref'];n=int(pin);net=cmp['pins'].get(pin)
    if ref in ('U1','U2'):
        if n in (10,20):return 'power_in'
        return 'input' if n in (1,19) or 2<=n<=9 else 'output'
    if ref=='U5':
        if n in (7,14):return 'power_in'
        return 'input' if n in (1,3,5,9,11,13) else 'output'
    if ref=='U6':
        if n in (8,16):return 'power_in'
        if n in (1,2,3,9,10,11):return 'input'
        if n in (4,5,12,13):return 'output'
        return 'passive'
    if ref.startswith('JESP'):
        if net=='3V3':return 'power_out'
        if net in ('5V','GND'):return 'power_in'
        return 'passive' # socket models carrier, not every internal ESP circuit
    if ref=='J5':return 'power_out' if n==1 else 'passive'
    if ref=='J12':return 'power_out'
    if ref.startswith('JPCF'):
        if n in (1,2):return 'power_in'
        if n in (3,4):return 'bidirectional'
        return 'open_collector'
    return 'passive'
root=uid()
new=['(kicad_sch (version 20250114) (generator "eeschema")',f'(uuid {root}) (paper "A0")',
     '(title_block (title "ScentStation Rev A - Engineering Sample") (date "2026-10-19") (rev "A"))','(lib_symbols']
instances=[]
comps_by_ref={c['ref']:c for c in comps}
comps_by_ref['U2']['pins'].setdefault('11',None)
for i in [4,5,6,7,12]:comps_by_ref['U6']['pins'].setdefault(str(i),None)
for j,cmp in enumerate(comps):
    ref=cmp['ref'];pins=list(cmp['pins'].items());n=len(pins);pitch=1.27;hh=max(5,(n+1)*pitch/2)
    new += [f'(symbol {q("RevA:"+ref)} (pin_names (offset 0.5)) (in_bom yes) (on_board yes)',
            f'(property "Reference" "X" (at 0 {hh+2} 0) (effects (font (size 1 1))))',
            f'(property "Value" {q(cmp["value"])} (at 0 {-hh-2} 0) (effects (font (size 1 1))))',
            f'(symbol {q(ref+"_0_1")} (rectangle (start -10 {hh}) (end 10 {-hh}) (stroke (width 0.254) (type default)) (fill (type background))))',
            f'(symbol {q(ref+"_1_1")}']
    x=round(45.72+(j%8)*142.24,4);y=round(38.1+(j//8)*44.45,4)
    instuid=uid()
    inst=[f'(symbol (lib_id {q("RevA:"+ref)}) (at {x} {y} 0) (unit 1) (in_bom yes) (on_board yes) (dnp no) (uuid {instuid})',
          f'(property "Reference" {q(ref)} (at {x} {y-hh-2} 0) (effects (font (size 1.1 1.1))))',
          f'(property "Value" {q(cmp["value"])} (at {x} {y+hh+2} 0) (effects (font (size 1 1))))',
          f'(property "Footprint" {q(cmp["footprint"])} (at {x} {y} 0) (effects (font (size 1 1)) hide))']
    for i,(pin,net) in enumerate(pins):
        py=round((n//2-i)*pitch,4);yy=round(y-py,4)
        try:pn=name(ref,pin,net)
        except KeyError:pn='NC'
        pn=pn or 'NC'
        new.append(f'(pin {electrical(cmp,pin)} line (at -15.24 {py} 0) (length 5.24) (name {q(pn)} (effects (font (size 0.8 0.8)))) (number {q(pin)} (effects (font (size 0.8 0.8)))))')
        inst.append(f'(pin {q(pin)} (uuid {uid()}))')
        if net:
            instances += [f'(wire (pts (xy {round(x-15.24,4)} {yy}) (xy {round(x-25.4,4)} {yy})) (stroke (width 0) (type default)) (uuid {uid()}))',
                          f'(label {q(net)} (at {round(x-25.4,4)} {yy} 0) (effects (font (size 0.8 0.8)) (justify left bottom)) (uuid {uid()}))']
        else:instances.append(f'(no_connect (at {round(x-15.24,4)} {yy}) (uuid {uid()}))')
    new.append('))')
    inst += [f'(instances (project "scentstation-rev-a" (path "/{root}" (reference {q(ref)}) (unit 1))))',')']
    instances.extend(inst)
new += ['(symbol "RevA:PWR_FLAG" (pin_names (offset 0)) (in_bom no) (on_board no)'
        ' (property "Reference" "#FLG" (at 0 1 0) (effects (font (size 1 1))))'
        ' (property "Value" "PWR_FLAG" (at 0 -1 0) (effects (font (size 1 1))))'
        ' (symbol "PWR_FLAG_1_1" (pin power_out line (at 0 0 90) (length 0) (name "pwr" (effects (font (size 1 1)))) (number "1" (effects (font (size 1 1)))))))']
new.append(')')
flaguid=uid()
instances += [f'(symbol (lib_id "RevA:PWR_FLAG") (at 1117.6 800.1 0) (unit 1) (in_bom no) (on_board no) (dnp no) (uuid {flaguid})'
              f' (property "Reference" "#FLG01" (at 1117.6 798.1 0) (effects (font (size 1 1))))'
              f' (property "Value" "5V_AFTER_JP5" (at 1117.6 802.1 0) (effects (font (size 1 1))))'
              f' (pin "1" (uuid {uid()}))'
              f' (instances (project "scentstation-rev-a" (path "/{root}" (reference "#FLG01") (unit 1)))))',
              f'(label "5V" (at 1117.6 800.1 0) (effects (font (size 0.8 0.8)) (justify left bottom)) (uuid {uid()}))']
new.extend(instances);new.append(')')
(BASE/'scentstation-rev-a.kicad_sch').write_text('\n'.join(new),encoding='utf-8')
print('Generated self-contained modern KiCad schematic.')

# Also publish the library used for ERC's symbol consistency checks.
import sys
sys.path.insert(0,str(BASE.parent/'.tools/python'))
import sexpdata as sexp
tree=sexp.loads((BASE/'scentstation-rev-a.kicad_sch').read_text(encoding='utf-8'))
symbols=next(x for x in tree if isinstance(x,list) and x and str(x[0])=='lib_symbols')[1:]
for sym in symbols:sym[1]=sym[1].removeprefix('RevA:')
(BASE/'RevA.kicad_sym').write_text(sexp.dumps([sexp.Symbol('kicad_symbol_lib'),[sexp.Symbol('version'),20241209],[sexp.Symbol('generator'),'kicad_symbol_editor'],*symbols]),encoding='utf-8')
(BASE/'sym-lib-table').write_text('(sym_lib_table (version 7) (lib (name "RevA")(type "KiCad")(uri "${KIPRJMOD}/RevA.kicad_sym")(options "")(descr "Rev A symbols")))',encoding='utf-8')
names=sorted(set(c['footprint'].split(':')[0] for c in d['components']))
(BASE/'fp-lib-table').write_text('(fp_lib_table (version 7) '+' '.join('(lib (name "'+n+'")(type "KiCad")(uri "${KICAD9_FOOTPRINT_DIR}/'+n+'.pretty")(options "")(descr ""))' for n in names)+')',encoding='utf-8')
