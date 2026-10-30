"""Tạo PCB bố trí linh kiện chưa đi dây và ảnh xem trước; không tạo Gerber."""
from pathlib import Path
import csv
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent / 'pcb-nhap'
ROOT.mkdir(exist_ok=True)
W, H, GAP = 180.0, 140.0, 27.5
pcb = ['(kicad_pcb (version 20240108) (generator "pcbnew")',
       '(general (thickness 1.6)) (paper "A4")',
       '(layers (0 "F.Cu" signal) (31 "B.Cu" signal) (36 "B.SilkS" user "b.silkscreen") (37 "F.SilkS" user "f.silkscreen") (38 "B.Mask" user) (39 "F.Mask" user) (44 "Edge.Cuts" user) (46 "B.CrtYd" user "b.courtyard") (47 "F.CrtYd" user "f.courtyard"))',
       '(setup (pad_to_mask_clearance 0)) (net 0 "")']
S, M = 7, 65
im = Image.new('RGB', (int(W*S+2*M), int(H*S+2*M+110)), '#f1f5f9')
draw = ImageDraw.Draw(im)
font_path = 'C:/Windows/Fonts/arial.ttf'
font = ImageFont.truetype(font_path, 15)
small = ImageFont.truetype(font_path, 12)
title = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 24)
rows=[]

def pt(x,y): return (M+x*S,M+y*S)
def rectangle(x,y,w,h,fill,outline='#334155'):
    draw.rectangle([pt(x,y),pt(x+w,y+h)],fill=fill,outline=outline,width=2)
def label(x,y,s,f=font,fill='#0f172a'):
    draw.text(pt(x,y),s,font=f,fill=fill)
def text(x,y,s,size=1.3):
    safe=s.replace('"','')
    pcb.append(f'(gr_text "{safe}" (at {x} {y}) (layer "F.SilkS") (effects (font (size {size} {size}) (thickness 0.2))))')
def block(ref,x,y,w,h,value):
    # Graphic only: no implied pad geometry for an unselected package.
    pcb.append(f'(footprint "Draft:{ref}_PLACEHOLDER" (layer "F.Cu") (at {x} {y}) (attr board_only exclude_from_pos_files exclude_from_bom)'
               f' (fp_text reference "{ref}" (at 0 {-h/2-1.5}) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))'
               f' (fp_text value "TBD_{value}" (at 0 0) (layer "F.SilkS") (effects (font (size 0.8 0.8) (thickness 0.12))))'
               f' (fp_rect (start {-w/2} {-h/2}) (end {w/2} {h/2}) (stroke (width 0.2) (type default)) (fill none) (layer "F.SilkS")))')
    rectangle(x-w/2,y-h/2,w,h,'#ffedd5')
    label(x-w/2+1,y-h/2+1,ref,small)
    label(x-w/2+1,y-h/2+4,value,small)
    rows.append([ref,value,x,y,'Placeholder: không có pad'])

def connector(ref,x,y,count,pitch=2.54,vertical=True,value='HEADER_DRAFT'):
    pcb.append(f'(footprint "Draft:{ref}" (layer "F.Cu") (at {x} {y}) (attr through_hole)'
               f' (fp_text reference "{ref}" (at 0 -3) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))'
               f' (fp_text value "{value}" (at 0 -5) (layer "F.SilkS") (effects (font (size 0.8 0.8) (thickness 0.12))))')
    for i in range(count):
        px,py=(0,i*pitch) if vertical else (i*pitch,0)
        shape='rect' if i==0 else 'circle'
        pcb.append(f'(pad "{i+1}" thru_hole {shape} (at {px} {py}) (size 1.8 1.8) (drill 1) (layers "*.Cu" "*.Mask"))')
        a,b=pt(x+px,y+py)
        draw.ellipse((a-5,b-5,a+5,b+5),fill='#fbbf24',outline='#78350f',width=2)
    pcb.append(')')
    rows.append([ref,value,x,y,f'{count} pad; pitch {pitch}; footprint tạm'])

pcb.append(f'(gr_rect (start 0 0) (end {W} {H}) (stroke (width 0.05) (type default)) (fill none) (layer "Edge.Cuts"))')
rectangle(0,0,W,H,'#e2eee8')
for x,y in [(4,4),(176,4),(4,136),(176,136)]:
    pcb.append(f'(footprint "Draft:M3" (layer "F.Cu") (at {x} {y}) (attr board_only exclude_from_pos_files exclude_from_bom) (pad "" np_thru_hole circle (at 0 0) (size 3.2 3.2) (drill 3.2) (layers "*.Cu" "*.Mask")))')
    a,b=pt(x,y);draw.ellipse((a-11,b-11,a+11,b+11),fill='#f1f5f9',outline='#64748b')
rectangle(7,7,35.5,54,'#dbeafe')
rectangle(7,0,35.5,8,'#fecaca')
label(8,1,'VÙNG ANTENNA*',small)
connector('JESP_L',11,11,19)
connector('JESP_R',11+GAP,11,19)
label(14,24,'ESP32',font)
label(14,29,'38 chân',font)
label(14,36,'27,5 mm*',small)
label(9,62,'*Chưa đo board thực',small)
block('U3',60,18,24,22,'PCF module')
connector('J_PCF',79,9,10,value='PCF_CABLE')
block('U5',60,43,20,12,'AHCT04')
block('U1',94,43,24,12,'AHCT541')
block('U2',127,43,24,12,'AHCT541')
block('EN',158,43,20,12,'OE + WDT')
block('BUCK',150,17,34,22,'12V -> 5V')
block('PROTECT',111,17,27,22,'FUSE TVS')
connector('J_PWR',86,9,2,5.08,False,'12V_IN_DRAFT')
for group,y in [('BOM',78),('VAN',103),('DEN',128)]:
    for i in range(5):
        x=48+28*i
        q=(0 if group=='BOM' else 5 if group=='VAN' else 10)+i+1
        block(f'Q{q}',x,y-9,10,8,'DPAK')
        connector(f'J_{group}{i+1}',x-2.54,y,2,5.08,False,'LOAD_5.08_DRAFT')
        if q<=10: block(f'D{q}',x+9,y-9,7,8,'DIO')
        label(x-9,y+2,f'{group} {i+1}',small)
        text(x,y+5,f'{group}{i+1}',1)
for i in range(5):
    connector(f'J_BTN{i+1}',10,77+11*i,2,2.54,False,'BUTTON')
    label(8,80+11*i,f'Nút {i+1}',small)
text(95,58,'DRAFT - UNROUTED - NOT FOR FABRICATION',1.5)
text(96,63,'180 x 140 mm / ESP spacing 27.5 mm ASSUMED',1)
label(52,55,'BẢN NHÁP • CHƯA ĐI DÂY',font)
label(52,60,'Không dùng đặt in; khối màu cam chưa có footprint.',small)
pcb.append(')')
content='\n'.join(pcb)
# Structural checks only, not a substitute for parsing/DRC in KiCad.
assert content.count('(')==content.count(')')
assert len([r for r in rows if r[0].startswith('J_') and any(t in r[0] for t in ['BOM','VAN','DEN'])])==15
assert len([r for r in rows if r[0].startswith('Q')])==15
(ROOT/'scentstation-draft.kicad_pcb').write_text(content,encoding='utf-8')
with (ROOT/'vi-tri-linh-kien.csv').open('w',encoding='utf-8-sig',newline='') as f:
    writer=csv.writer(f);writer.writerow(['Reference','Loại','X_mm','Y_mm','Trạng thái']);writer.writerows(rows)
draw.text((M,15),'SCENTSTATION • BỐ TRÍ PCB NHÁP V1',font=title,fill='#0f172a')
draw.text((M,M+H*S+18),'180 × 140 mm tạm chọn | ESP socket 27,5 mm giả định | PCF8575 nối qua đầu dây',font=font,fill='#0f172a')
draw.text((M,M+H*S+43),'Chưa có net điện, chưa đi dây, chưa kiểm ERC/DRC. Vị trí linh kiện và đầu nối có thể thay đổi.',font=font,fill='#9a3412')
im.save(ROOT/'bo-tri-pcb-nhap.png')
print('Created editable placement draft, placement CSV and PNG; no Gerbers generated.')
