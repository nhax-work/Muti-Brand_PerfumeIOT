"""Rev A thử nghiệm: tạo kết nối điện, PCB KiCad và bảng linh kiện.

Chạy bằng Python đi kèm KiCad sau khi đã cấu hình KICAD_ROOT.
Không thay thế việc kiểm chứng cơ khí, dòng tải và thử phần cứng.
"""
import os, sys, json, csv, uuid, math
from pathlib import Path

BASE=Path(__file__).resolve().parent
ROOT=Path(os.environ['KICAD_ROOT'])
os.add_dll_directory(str(ROOT/'bin'))
sys.path.insert(0,str(ROOT/'lib/python3/dist-packages'))
import pcbnew as p
print('KiCad Python loaded',p.GetBuildVersion(),flush=True)

OUT=BASE/'rev-a'
OUT.mkdir(exist_ok=True)
LIB=ROOT/'share/kicad/footprints'
board=p.BOARD()
board.GetDesignSettings().SetCopperLayerCount(2)
board.GetDesignSettings().SetBoardThickness(p.FromMM(1.6))
nets={}
components=[]
fps={}

def net(name):
    if name not in nets:
        n=p.NETINFO_ITEM(board,name);board.Add(n);nets[name]=n
    return nets[name]

def xy(x,y):return p.VECTOR2I(p.FromMM(x),p.FromMM(y))

def find(pattern):
    hits=sorted(LIB.glob(pattern))
    if not hits:raise RuntimeError('Missing footprint: '+pattern)
    return hits[0]

def add(ref,value,pattern,x,y,pins,rot=0,notes=''):
    path=find(pattern)
    fp=p.FootprintLoad(str(path.parent),path.stem)
    if fp is None:raise RuntimeError(str(path))
    fp.SetReference(ref);fp.SetValue(value)
    fp.SetPosition(xy(x,y));fp.SetOrientationDegrees(rot)
    fp.Reference().SetTextSize(xy(1,1));fp.Reference().SetTextThickness(p.FromMM(.15))
    fp.Value().SetVisible(False)
    for pad in fp.Pads():
        key=pad.GetNumber()
        if key in pins and pins[key]:pad.SetNet(net(pins[key]))
    board.Add(fp);fps[ref]=fp
    components.append(dict(ref=ref,value=value,footprint=path.parent.stem+':'+path.stem,x=x,y=y,rotation=rot,pins=pins,notes=notes))
    if len(components)%20==0:print('Placed:',len(components),ref,flush=True)
    return fp

RES='Resistor_SMD.pretty/R_0805_2012Metric.kicad_mod'
CAP='Capacitor_SMD.pretty/C_0805_2012Metric.kicad_mod'
DIP20='Package_DIP.pretty/DIP-20_W7.62mm.kicad_mod'
DIP14='Package_DIP.pretty/DIP-14_W7.62mm.kicad_mod'
DIP16='Package_DIP.pretty/DIP-16_W7.62mm.kicad_mod'
TERM='Connector_Phoenix_MSTB.pretty/PhoenixContact_MSTBVA_2,5_2-G-5,08_1x02_P5.08mm_Vertical.kicad_mod'

def r(ref,value,x,y,a,b,rot=0):return add(ref,value,RES,x,y,{'1':a,'2':b},rot)
def c(ref,value,x,y,a,b,rot=0):return add(ref,value,CAP,x,y,{'1':a,'2':b},rot)

# Board outline and mechanical holes, origin in mm at top-left.
for a,b in [((0,0),(240,0)),((240,0),(240,190)),((240,190),(0,190)),((0,190),(0,0))]:
    sh=p.PCB_SHAPE();sh.SetShape(p.SHAPE_T_SEGMENT);sh.SetStart(xy(*a));sh.SetEnd(xy(*b));sh.SetLayer(p.Edge_Cuts);sh.SetWidth(p.FromMM(.05));board.Add(sh)
for i,(x,y) in enumerate([(4,4),(236,4),(4,186),(236,186)],1):
    add('H'+str(i),'M3','MountingHole.pretty/MountingHole_3.2mm_M3.kicad_mod',x,y,{})

left=['3V3','ESP_EN','GPIO36','GPIO39','GPIO34','GPIO35','GPIO32','GPIO33','GPIO25','GPIO26','GPIO27','GPIO14',None,'GND','GPIO13',None,None,None,'5V']
right=['GND','GPIO23','GPIO22',None,None,'GPIO21','GND','GPIO19','GPIO18',None,'GPIO17','GPIO16','GPIO4',None,None,None,None,None,None]
for ref,x,labels in [('JESP_L',14,left),('JESP_R',41.5,right)]:
    add(ref,'ESP32_1x19_SPACING_27.5_ASSUMED','Connector_PinSocket_2.54mm.pretty/PinSocket_1x19_P2.54mm_Vertical.kicad_mod',x,14,{str(i+1):v for i,v in enumerate(labels)},notes='Pinout assumed DevKitC V4; spacing and pin order must be checked against actual board.')

# External PCF8575 module via labeled cable, not a guessed module socket.
pcf=['3V3','GND','GPIO16','GPIO17']+[f'PCF_P0{i}' for i in range(6)]
add('JPCF','PCF8575_EXTERNAL_3V3','Connector_PinHeader_2.54mm.pretty/PinHeader_1x10_P2.54mm_Vertical.kicad_mod',60,14,{str(i+1):n for i,n in enumerate(pcf)},notes='Custom cable pin order; not physical PCF module pin order.')
r('RI2C1','4.7k',49,39,'3V3','GPIO16')
r('RI2C2','4.7k',49,43,'3V3','GPIO17')
c('CPCF','100n',65,14,'3V3','GND')

inv={1:(1,2),2:(3,4),3:(5,6),4:(9,8),5:(11,10),6:(13,12)}
pin5={'7':'GND','14':'5V'}
for i,(a,y) in inv.items():pin5[str(a)]=f'PCF_P0{i-1}';pin5[str(y)]=f'VALVE{i}' if i<6 else 'EXP_READY'
add('U5','SN74AHCT04N',DIP14,70,45,pin5)
for i in range(6):r('RPCF'+str(i),'10k',66,47+3*i,'3V3',f'PCF_P0{i}')
c('CU5','100n',82,44,'5V','GND')

signals1=[f'GPIO{i}' for i in [25,18,19,21,22]]+['VALVE1','VALVE2','VALVE3']
signals2=['VALVE4','VALVE5']+[f'GPIO{i}' for i in [26,23,32,33,13]]+['GND']
for u,x,signals in [(1,90,signals1),(2,125,signals2)]:
    pins={'1':'OE_N','19':'OE_N','10':'GND','20':'5V'}
    for i,n in enumerate(signals,1):
        pins[str(i+1)]=n
        if not(u==2 and i==8):pins[str(19-i)]=f'BUF{u}_{i}'
    add('U'+str(u),'SN74AHCT541N',DIP20,x,15,pins)
    c('CU'+str(u),'100n',x+12,14,'5V','GND')
    c('CB'+str(u),'1u',x+12,18,'5V','GND')
    for i,n in enumerate(signals):
        if n.startswith('GPIO'):r(f'RIN{u}_{i+1}','47k',x-6,17+3*i,n,'GND')

# Independent missing-pulse shutdown. 123 output Q1 is pin 13, /Q1 is pin 4.
wd={'1':'GND','2':'GPIO4','3':'ESP_EN','8':'GND','9':'GND','10':'GND','11':'GND','13':'WD_OK','14':'WD_CNEG','15':'WD_RC','16':'3V3'}
add('U6','CD74HC123E',DIP16,102,51,wd,notes='Retriggerable missing-pulse detector; RC timeout must be measured at 3V3, not assumed from 5V formula.')
c('CU6','100n',114,50,'3V3','GND')
r('RWD','470k_1pct',115,54,'3V3','WD_RC')
c('CWD','1u_X7R',115,58,'WD_RC','WD_CNEG')
r('RHB','10k',97,50,'GPIO4','GND')
r('RRUN','10k',88,52,'GPIO14','GND')

for i,(control,x) in enumerate([('GPIO14',146),('EXP_READY',161),('WD_OK',176)],1):
    collector='OE_N' if i==1 else f'EN_CHAIN{i-1}'
    emitter='GND' if i==3 else f'EN_CHAIN{i}'
    add(f'QEN{i}','2N3904','Package_TO_SOT_THT.pretty/TO-92_Inline_Wide.kicad_mod',x,52,{'1':emitter,'2':f'EN_B{i}','3':collector})
    r(f'RENB{i}','10k',x+1,46,control,f'EN_B{i}')
    r(f'RENP{i}','100k',x+1,59,f'EN_B{i}','GND')
r('ROE','10k',144,40,'5V','OE_N')
add('JSTOP','INTERLOCK_NC_REQUIRED','Connector_PinHeader_2.54mm.pretty/PinHeader_1x02_P2.54mm_Vertical.kicad_mod',187,48,{'1':'WD_OK','2':'WD_LINK'})
# Route watchdog base resistor via physical NC interlock. Opening interlock disables load.
for pad in fps['RENB3'].Pads():
    if pad.GetNumber()=='1':pad.SetNet(net('WD_LINK'))
next(cmp for cmp in components if cmp['ref']=='RENB3')['pins']['1']='WD_LINK'

# External regulated 5 V module connected with separate IN/OUT terminals.
add('J12','12V_INPUT_EXTERNAL_FUSE_5A_REQUIRED',TERM,215,13,{'1':'12V_LOAD','2':'GND'},notes='External DC fuse mandatory upstream; polarity must be verified; no integrated reverse polarity protection.')
add('JBUCK_IN','TO_BUCK_INPUT',TERM,195,26,{'1':'12V_LOAD','2':'GND'})
add('J5','FROM_BUCK_5V',TERM,195,39,{'1':'5V_EXT','2':'GND'})
add('JP5','REMOVE_FOR_USB','Connector_PinHeader_2.54mm.pretty/PinHeader_1x02_P2.54mm_Vertical.kicad_mod',207,42,{'1':'5V_EXT','2':'5V'})
add('DTVS','SMBJ15A','Diode_SMD.pretty/D_SMB.kicad_mod',215,28,{'1':'12V_LOAD','2':'GND'})
add('C12','1000u_35V','Capacitor_THT.pretty/CP_Radial_D12.5mm_P5.00mm.kicad_mod',218,43,{'1':'12V_LOAD','2':'GND'})
add('C5','470u_10V','Capacitor_THT.pretty/CP_Radial_D8.0mm_P3.50mm.kicad_mod',217,58,{'1':'5V','2':'GND'})

# Five buttons; 12 V illumination is on separate load terminals.
for i,gpio in enumerate([27,34,35,36,39],1):
    y=82+(i-1)*19
    add('JBTN'+str(i),'BUTTON_COM_NO','Connector_PinHeader_2.54mm.pretty/PinHeader_1x02_P2.54mm_Vertical.kicad_mod',14,y,{'1':'GND','2':f'GPIO{gpio}'})
    r('RBTN'+str(i),'10k',24,y,'3V3',f'GPIO{gpio}')
    c('CBTN'+str(i),'100n',24,y+5,f'GPIO{gpio}','GND')

channels=[]
sources=[(1,i) for i in range(1,6)]+[(1,6),(1,7),(1,8),(2,1),(2,2)]+[(2,i) for i in range(3,8)]
for group,y,start in [('PUMP',86,1),('VALVE',125,6),('LIGHT',160,11)]:
    for slot in range(1,6):
        n=start+slot-1;x=68+36*(slot-1);u,i=sources[n-1]
        add(f'Q{n}','AOD4184A','Package_TO_SOT_SMD.pretty/TO-252-2.kicad_mod',x,y,{'1':f'GATE{n}','2':f'DRAIN{n}','3':'GND'})
        r(f'RG{n}','1k',x-11,y-9,f'BUF{u}_{i}',f'GATE{n}')
        r(f'RPD{n}','100k',x-9,y+5,f'GATE{n}','GND')
        add(f'J{group}{slot}',f'{group}{slot}_PLUS_MINUS',TERM,x+8,y+10,{'1':'12V_LOAD','2':f'DRAIN{n}'})
        if n<=10:
            add(f'D{n}','SB560_5A_60V','Diode_THT.pretty/D_DO-201AD_P12.70mm_Horizontal.kicad_mod',x+21,y-5,{'1':'12V_LOAD','2':f'DRAIN{n}'},rot=-90,notes='Flyback K to +12V, A to drain. Repetitive current and valve closing time require bench verification.')
        channels.append(dict(channel=n,group=group,slot=slot,x=x,y=y,buffer=f'BUF{u}_{i}'))

# Common manual high-current trunks. No power current is routed through ESP sockets.
def trace(name,points,width=2,layer=p.F_Cu):
    for a,b in zip(points,points[1:]):
        if a==b:continue
        t=p.PCB_TRACK(board);t.SetStart(xy(*a));t.SetEnd(xy(*b));t.SetWidth(p.FromMM(width));t.SetLayer(layer);t.SetNet(net(name));t.SetLocked(True);board.Add(t)

def padpos(ref,num):
    a=next(a for a in fps[ref].Pads() if a.GetNumber()==str(num)).GetPosition()
    return (p.ToMM(a.x),p.ToMM(a.y))

def via(name,x,y,size=1.8,drill=.9):
    v=p.PCB_VIA(board);v.SetPosition(xy(x,y));v.SetWidth(p.FromMM(size));v.SetDrill(p.FromMM(drill));v.SetViaType(p.VIATYPE_THROUGH);v.SetLayerPair(p.F_Cu,p.B_Cu);v.SetNet(net(name));v.SetLocked(True);board.Add(v)

trace('12V_LOAD',[(237,13),(237,180)],4)
trace('12V_LOAD',[padpos('J12',1),(215,8),(229,8),(229,13),(237,13)],3)
trace('GND',[(51,71),(51,178)],4,p.B_Cu)
trace('GND',[padpos('J12',2),(228,13),(228,70),(51,70),(51,71)],4,p.B_Cu)
for row in [86,125,160]:
    trace('12V_LOAD',[(60,row+20),(237,row+20)],3)
    trace('GND',[(51,row+14),(220,row+14)],3,p.B_Cu)
for ch in channels:
    n=ch['channel'];x=ch['x'];y=ch['y'];ref=f'J{ch["group"]}{ch["slot"]}'
    qd=padpos('Q'+str(n),2);qs=padpos('Q'+str(n),3);jp=padpos(ref,1);jn=padpos(ref,2)
    trace('12V_LOAD',[jp,(jp[0],y+20)],2)
    trace(f'DRAIN{n}',[qd,(jn[0],y),(jn[0],jn[1])],2)
    trace('GND',[qs,(qs[0],y+9)],2)
    via('GND',qs[0],y+9)
    trace('GND',[(qs[0],y+9),(qs[0],y+14)],2,p.B_Cu)
    if n<=10:
        k=padpos('D'+str(n),1);a=padpos('D'+str(n),2)
        trace('12V_LOAD',[k,(k[0],y-13)],2)
        trace(f'DRAIN{n}',[(jn[0],y+6),(a[0],y+6),a],2)
for row in [86,125]:trace('12V_LOAD',[(60,row-13),(237,row-13)],3)

# Power connections to external buck and bulk capacitors, kept wider than signals.
for ref,padnum in [('JBUCK_IN',2),('J5',2),('C12',2),('C5',2)]:
    a=padpos(ref,padnum);trace('GND',[a,(228,a[1])],1.5,p.B_Cu)
trace('12V_LOAD',[padpos('JBUCK_IN',1),(195,20),(215,20),padpos('J12',1)],1.5)
a=padpos('DTVS',1);trace('12V_LOAD',[a,(a[0],21),(237,21)],1.5)
a=padpos('DTVS',2);trace('GND',[a,(223,28)],1.5);via('GND',223,28)
trace('GND',[(223,28),(228,28)],1.5,p.B_Cu)
trace('12V_LOAD',[padpos('C12',1),(218,36),(237,36)],1.5)
trace('5V_EXT',[padpos('J5',1),(195,33),(207,33),padpos('JP5',1)],1.2)
trace('5V',[padpos('JP5',2),(207,50),(217,50),padpos('C5',1)],1.2)

# No-copper antenna area. This is a conservative placeholder, not measured board outline.
rule=p.ZONE(board);rule.SetIsRuleArea(True);rule.SetLayerSet(p.LSET.AllCuMask())
rule.SetDoNotAllowTracks(True);rule.SetDoNotAllowVias(True);rule.SetDoNotAllowCopperPour(True)
poly=rule.Outline();poly.NewOutline()
for x,y in [(8,0),(47,0),(47,9),(8,9)]:poly.Append(p.FromMM(x),p.FromMM(y))
board.Add(rule)

def text(s,x,y,size=1.2,layer=p.F_SilkS):
    t=p.PCB_TEXT(board);t.SetText(s);t.SetPosition(xy(x,y));t.SetTextSize(xy(size,size));t.SetTextThickness(p.FromMM(.18));t.SetLayer(layer);board.Add(t)

text('SCENTSTATION REV A - ENGINEERING SAMPLE',118,73,1.8)
text('ESP 27.5mm ASSUMED / VERIFY PINOUT / NOT RELEASED FOR PRODUCTION',120,77,1)
text('12V INPUT: EXTERNAL 5A FUSE REQUIRED',187,8,1)
text('REMOVE JP5 WHEN USB POWERS ESP',181,66,1)
text('ANTENNA - NO COPPER',27,5,1)
for ch in channels:
    text(f'{ch["group"]} {ch["slot"]}: +12 / SW-',ch['x']+8,ch['y']+17,.9)
for i,label in enumerate(pcf):text(f'{i+1}:{label}',53,14+i*2.54,.8)

board.BuildListOfNets();board.GetConnectivity().Build(board)
print('Connectivity built',flush=True)
filename=OUT/'scentstation-rev-a.kicad_pcb'
p.SaveBoard(str(filename),board)
ok=p.ExportSpecctraDSN(board,str(OUT/'scentstation-rev-a.dsn'))
dsnfile=OUT/'scentstation-rev-a.dsn'
dsn=dsnfile.read_text(encoding='utf-8')
dsn=dsn.replace('(width 200)','(width 300)').replace('(clearance 200)','(clearance 300)').replace('(clearance 50 (type smd_smd))','(clearance 300 (type smd_smd))')
dsn=dsn.replace('Via[0-1]_600:300_um','Via[0-1]_800:400_um').replace('(shape (circle F.Cu 600))','(shape (circle F.Cu 800))').replace('(shape (circle B.Cu 600))','(shape (circle B.Cu 800))')
dsn=dsn.replace('(class kicad_default 12V_LOAD 3V3 5V 5V_EXT','(class kicad_default 12V_LOAD')
dsn=dsn.replace('  )\n  (wiring','    (class LogicPower 3V3 5V 5V_EXT (circuit (use_via "Via[0-1]_800:400_um")) (rule (width 800) (clearance 300)))\n  )\n  (wiring')
dsnfile.write_text(dsn,encoding='utf-8')
print('Board:',filename,'DSN:',ok,'components:',len(components),'nets:',len(nets),flush=True)
(OUT/'design.json').write_text(json.dumps(dict(components=components,channels=channels,nets=list(nets),board_mm=[240,190],esp_spacing_mm=27.5),ensure_ascii=False,indent=2),encoding='utf-8')
with (OUT/'BOM.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.writer(f);w.writerow(['Reference','Value','Footprint','X_mm','Y_mm','Rotation','Notes'])
    for cmp in components:w.writerow([cmp[k] for k in ['ref','value','footprint','x','y','rotation','notes']])
with (OUT/'pin-net.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.writer(f);w.writerow(['Reference','Pad','Net'])
    for cmp in components:
        for pad,n in cmp['pins'].items():w.writerow([cmp['ref'],pad,n or 'NC'])

# Minimal project rules loaded by KiCad DRC and DSN export on subsequent load.
project={'meta':{'filename':'scentstation-rev-a.kicad_pro','version':1},'net_settings':{'classes':[{'name':'Default','clearance':.3,'track_width':.3,'via_diameter':.8,'via_drill':.4,'bus_width':12,'diff_pair_width':.3,'diff_pair_gap':.3,'diff_pair_via_gap':.3,'wire_width':6,'line_style':0,'pcb_color':'rgba(0, 0, 0, 0.000)','schematic_color':'rgba(0, 0, 0, 0.000)'}],'meta':{'version':4},'netclass_assignments':{},'netclass_patterns':[]},'board':{'design_settings':{'rules':{'min_clearance':.25,'min_track_width':.25,'min_via_diameter':.7,'min_through_hole_diameter':.3,'min_hole_clearance':.25,'min_copper_edge_clearance':.5},'rule_severities':{}}}}
(OUT/'scentstation-rev-a.kicad_pro').write_text(json.dumps(project,indent=2),encoding='utf-8')
