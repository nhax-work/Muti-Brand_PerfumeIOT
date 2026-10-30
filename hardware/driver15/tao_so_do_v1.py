"""Tạo sơ đồ chức năng SVG và bảng kênh để rà soát, không xuất Gerber."""
from pathlib import Path
from html import escape
import csv
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="1120" viewBox="0 0 1500 1120">',
'''<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L9,3 L0,6" fill="none" stroke="#475569"/></marker></defs>
<rect width="1500" height="1120" fill="#f8fafc"/>
<style>text{font-family:Arial,sans-serif;fill:#172033} .title{font-size:30px;font-weight:700}.sub{font-size:16px;fill:#475569}.head{font-size:19px;font-weight:700}.body{font-size:16px}.wire{fill:none;stroke:#475569;stroke-width:2;marker-end:url(#arrow)}</style>''']

def txt(x, y, value, cls='body'):
    parts.append(f'<text x="{x}" y="{y}" class="{cls}">{escape(value)}</text>')

def box(x, y, w, h, title, lines, color='#e0f2fe'):
    parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{color}" stroke="#94a3b8"/>')
    txt(x+18, y+30, title, 'head')
    for i, line in enumerate(lines):
        txt(x+18, y+59+i*25, line)

def wire(points):
    parts.append(f'<polyline points="{points}" class="wire"/>')

txt(40, 48, 'ScentStation • Bo điều khiển V1', 'title')
txt(40, 78, '5 bơm + 5 van + 5 đèn + 5 nút | ESP32-WROOM-32D | Không dùng load cell', 'sub')
box(40,105,1420,58,'BẢN RÀ SOÁT CHỨC NĂNG — chưa đi dây PCB, chưa xuất Gerber',[], '#fef3c7')
box(40,195,280,145,'Nguồn vào 12 VDC',['J_PWR → cầu chì F1','Chống ngược cực / TVS: TBD','Tụ bus: 1000 µF / 25 V*'])
box(390,195,300,145,'Nguồn logic',['Buck 12 V → 5 V: TBD','5 V → ESP / AHCT541','3V3 → PCF8575'])
box(760,195,340,145,'Bus +12V_LOAD',['Tới chân 1 của 15 đầu tải','Âm tải → Drain MOSFET','GND công suất về nguồn'])
box(1150,195,310,145,'Ngắt nguồn tải',['Dừng khẩn DC: TBD','Đo dòng khởi động bơm','F1 5 A: chưa chốt'])
wire('320,235 390,235'); wire('320,310 350,310 350,360 930,360 930,340')
box(40,400,360,230,'ESP32 • giữ chân đang dùng',['Bơm: 25 / 18 / 19 / 21 / 22','Đèn: 26 / 23 / 32 / 33 / 13','Nút: 27 / 34 / 35 / 36 / 39','I²C: SDA16 / SCL17','RUN_REQUEST: GPIO14'])
box(460,400,350,230,'PCF8575 • 3V3 • 0x20',['P00..04 → U5 đảo → VAN1..5','P05 → U5 đảo → EXP_READY','SDA/SCL: kéo lên 3V3 4,7 kΩ*','U5 AHCT04: 5 V, 6 cổng đảo','Pxx=1: tắt; Pxx=0: bật'])
box(880,400,580,230,'U1 / U2 • SN74AHCT541 • nguồn 5 V',['U1 A1..5: BƠM1..5 | A6..8: VAN1..3','U2 A1..2: VAN4..5 | A3..7: ĐÈN1..5','U2 A8 → GND; Y8 không nối','15 ngõ ra → RG 1 kΩ* → Gate MOSFET','/OE chung: kéo lên 5 V = vô hiệu tải'])
wire('400,458 460,458'); wire('810,465 880,465')
wire('400,420 425,420 425,375 1170,375 1170,400')
box(40,680,440,185,'Cho phép tải • mặc định TẮT',['RUN_REQUEST AND EXP_READY','→ 2 NPN nối tiếp kéo /OE xuống','Gate mỗi MOSFET kéo xuống 10 kΩ*','Watchdog độc lập: chưa chọn'])
box(540,680,460,185,'Một kênh tải ×15',['+12V_LOAD → tải → Drain AOD4184A','Source → GND_PWR; Gate ← buffer','Bơm/van: diode song song tải','Cathode → +12V; Anode → Drain'])
box(1060,680,400,185,'5 đầu nối nút',['COM → GND; NO → GPIO nút','NO kéo lên 3V3 qua 10 kΩ','NC không nối','LED 12 V dùng kênh đèn riêng'])
wire('1170,630 1170,655 770,655 770,680')
wire('260,680 260,655 1435,655 1435,630')
box(40,910,1420,165,'Cần chốt trước khi sản xuất',['* Giá trị ứng viên, phải đo kiểm. Chưa có sơ đồ EDA, ERC, layout hoặc DRC.',
'Chọn buck, bảo vệ nguồn, diode bơm, watchdog và đầu nối; đo socket ESP, kích thước bo và dòng tải.',
'Firmware hiện tại chưa điều khiển van / MCP / RUN_REQUEST. Không cắm bo theo sơ đồ này để chạy ngay.',
'Chi tiết kết nối và trình tự khởi động: THIET_KE_V1.md | Bảng kênh: kenh-v1.csv'], '#fff7ed')
parts.append('</svg>')
svg = '\n'.join(parts)
ET.fromstring(svg)
(ROOT/'so-do-v1.svg').write_text(svg, encoding='utf-8')
rows=[]
for kind, sources, firstq, driverpins, prefix in [
    ('Bơm',[f'GPIO{x}' for x in [25,18,19,21,22]],1,[(1,i) for i in range(1,6)],'P'),
    ('Van',[f'U5.Y{i+1} (PCF.P0{i} đảo)' for i in range(5)],6,[(1,6),(1,7),(1,8),(2,1),(2,2)],'V'),
    ('Đèn',[f'GPIO{x}' for x in [26,23,32,33,13]],11,[(2,i) for i in range(3,8)],'L')]:
    for i,(source,(u,a)) in enumerate(zip(sources,driverpins),1):
        q=firstq+i-1
        rows.append([kind,i,source,f'U{u}.A{a}',f'U{u}.Y{a}',f'RG{q}',f'Q{q}',f'J_{prefix}{i}', '+12V_LOAD','Drain',f'D{q}' if q<=10 else 'Không áp dụng tải LED'])
assert len(rows)==15 and len({r[6] for r in rows})==15
assert len({r[3] for r in rows})==15 and len({r[2] for r in rows})==15
with (ROOT/'kenh-v1.csv').open('w', encoding='utf-8-sig', newline='') as f:
    writer=csv.writer(f)
    writer.writerow(['Loại','Slot','Nguồn tín hiệu','Đầu vào buffer','Đầu ra buffer','Điện trở Gate','MOSFET','Đầu nối','Chân 1','Chân 2','Diode'])
    writer.writerows(rows)
print('Đã tạo SVG hợp lệ XML và 15 kênh không trùng chân/kênh driver.')
