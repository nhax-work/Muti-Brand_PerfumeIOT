"""Đọc lại Gerber/Excellon bằng Gerbonara và đóng gói bản thử nghiệm."""
from pathlib import Path
import sys,json,hashlib,warnings,csv,collections,zipfile
from html import escape

BASE=Path(__file__).resolve().parent
B=BASE/'rev-a'
sys.path.insert(0,str(BASE/'.tools/python'))
import gerbonara,resvg_py

with warnings.catch_warnings(record=True) as notes:
    warnings.simplefilter('always')
    stack=gerbonara.LayerStack.open(B/'gerber')
    layer_counts={' '.join(k):len(v.objects) for k,v in stack.graphic_layers.items()}
    pth=len(stack.drill_pth.objects);npth=len(stack.drill_npth.objects)
    bounds=stack.board_bounds()
    for side in ['top','bottom']:
        svg=str(stack.to_pretty_svg(side=side,margin=2))
        (B/f'gerber-{side}.svg').write_text(svg,encoding='utf-8')
        png=resvg_py.svg_to_bytes(svg_string=svg,width=1800,dpi=96,background='#ffffff')
        (B/f'gerber-{side}.png').write_bytes(png)
        print('Read and rendered exported Gerber:',side,flush=True)
    parser_notes=sorted(set(str(w.message) for w in notes if 'paste' not in str(w.message)))

expected={('top','copper'),('bottom','copper'),('top','mask'),('bottom','mask'),('top','silk'),('bottom','silk'),('mechanical','outline')}
assert set(stack.graphic_layers)==expected
assert pth==308 and npth==4
assert layer_counts['mechanical outline']==4
assert abs(bounds[1][0]-bounds[0][0]-240.05)<.001
assert abs(bounds[1][1]-bounds[0][1]-190.05)<.001
job=json.loads((B/'gerber/scentstation-rev-a-job.gbrjob').read_text(encoding='utf-8'))
assert job['GeneralSpecs']['LayerNumber']==2
assert job['GeneralSpecs']['BoardThickness']==1.6
assert [x['Thickness'] for x in job['MaterialStackup'] if x['Type']=='Copper']==[.07,.07]
audit=json.loads((B/'board-audit.json').read_text(encoding='utf-8'))
erc=json.loads((B/'erc-final.json').read_text(encoding='utf-8'))
drc=json.loads((B/'drc-final.json').read_text(encoding='utf-8'))
erc_items=[v for sh in erc['sheets'] for v in sh['violations']]
assert audit['passed'] and not erc_items and not drc['violations'] and not drc['unconnected_items']

result={'release_status':'ENGINEERING_SAMPLE_NOT_PRODUCTION_RELEASED','board_mm':[240,190],'board_thickness_mm':1.6,'copper_um_each_side':70,'esp_socket_spacing_mm_assumed':27.5,'components':audit['component_count'],'connected_pins_matched_schematic_model_pcb':audit['model_connected_pins'],'nets':audit['net_count'],'track_segments':audit['track_segments'],'vias':audit['vias'],'kicad_version':'9.0.9','drc_violations':0,'drc_unconnected_items':0,'erc_violations':0,'independent_reader':'Gerbonara 1.5.0','gerber_layer_objects':layer_counts,'excellon_pth_holes':pth,'excellon_npth_holes':npth,'outline_bounds_with_stroke_mm':bounds,'parser_notes':parser_notes,'remaining_physical_checks':['Measure ESP socket spacing and verify carrier pinout against DevKitC V4 assumption.','Verify actual module VCC/VDD bypass and all I2C pull-ups at 3V3.','Verify component package, connector mates, capacitor dimensions and assembly clearances.','Bench-test VGS, power startup/current, copper heating, load turn-off transients and diode/TVS temperatures.','Measure watchdog timing, verify firmware interlocks and calibrate pump/valve timing.']}
(B/'KIEM_TRA.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')

# 1:1 mechanical paper template; ruler must be checked before using it to measure.
svg=['<svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="85mm" viewBox="0 0 80 85">','<rect width="80" height="85" fill="white"/>','<style>text{font-family:Arial,sans-serif;font-size:2.3px}</style>', '<text x="4" y="4">ESP32 • MẪU GIẤY 1:1 • CHƯA XÁC NHẬN</text>', '<text x="4" y="8">In Actual size / 100%; kiểm tra thước 50 mm.</text>']
for x in [20,47.5]:
    for i in range(19):
        y=15+i*2.54
        svg.append(f'<circle cx="{x}" cy="{y}" r="0.5" stroke="black" stroke-width="0.15" fill="none"/>')
svg += ['<path d="M20 12 V10 H47.5 V12" stroke="black" stroke-width="0.15" fill="none"/>','<text x="26" y="13">27,5 mm tạm</text>','<text x="4" y="68">19 chân mỗi hàng; pitch 2,54 mm.</text>','<path d="M10 77 H60" stroke="black" stroke-width="0.2"/>']
for i in range(11):
    x=10+i*5
    svg += [f'<path d="M{x} 75 V79" stroke="black" stroke-width="0.15"/>',f'<text x="{x-1}" y="82">{i*5}</text>']
svg.append('</svg>')
(B/'mau-do-socket-ESP-1-1.svg').write_text('\n'.join(svg),encoding='utf-8')

# Procurement grouping keeps the detailed per-reference BOM intact.
d=json.loads((B/'design.json').read_text(encoding='utf-8'))
groups=collections.defaultdict(list)
for c in d['components']:groups[(c['value'],c['footprint'])].append(c['ref'])
with (B/'BOM-grouped.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.writer(f);w.writerow(['Value','Footprint','Quantity','References'])
    for (value,fp),refs in sorted(groups.items()):w.writerow([value,fp,len(refs),' '.join(refs)])

readme='''SCENTSTATION REV A — ENGINEERING SAMPLE — CHƯA DUYỆT SẢN XUẤT

Bo 240 x 190 mm; 2 lớp; FR4 1.6 mm; đồng 70 um / 2 oz mỗi mặt.
Các file khoan dùng mm và cùng gốc tuyệt đối với Gerber. PTH và NPTH tách riêng.
GTL/GBL: đồng; GTS/GBS: solder mask; GTO/GBO: silkscreen; GM1: outline.
Chỉ một outline kín. D356 là netlist kiểm điện, không phải lớp đồng.

Đã chạy KiCad 9.0.9: DRC 0 vi phạm, 0 kết nối thiếu; ERC 0 vi phạm.
Đã đối chiếu 381 chân có net giữa schematic, model và PCB.
Đã đọc lại 7 lớp Gerber và 308 lỗ PTH + 4 lỗ NPTH bằng Gerbonara.

CHƯA gửi đặt in trước khi kiểm tra socket ESP 27.5 mm đang giả định, pinout
ESP đang giả định theo DevKitC V4, package và đầu nối thực tế. Module PCF8575
có VCC/VDD: phải xác minh cấu hình logic và pull-up I2C ở 3.3 V.
Chưa đo dòng khởi động, nhiệt, VGS, xung tắt tải, timeout watchdog hoặc liều xịt.
Firmware Arduino hiện tại chưa hỗ trợ bo Rev A; cần sửa theo tài liệu đi kèm.
Cầu chì DC đầu vào và module buck 12 V -> 5 V nằm bên ngoài bo.

Kiểm tra tự động không thay thế kiểm chứng nguyên lý và thử nghiệm phần cứng.
Xem HUONG_DAN_REV_A.md trong bộ hồ sơ đầy đủ để biết mọi giả định và kết nối.
'''
(B/'gerber/README_TRUOC_KHI_DAT_IN.txt').write_text(readme,encoding='utf-8')
(B/'gerber/KIEM_TRA.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')

files=[x for x in (B/'gerber').iterdir() if x.is_file() and x.name!='SHA256SUMS.txt']
checks='\n'.join(hashlib.sha256(x.read_bytes()).hexdigest()+'  '+x.name for x in sorted(files))+'\n'
(B/'gerber/SHA256SUMS.txt').write_text(checks,encoding='utf-8')
gerber_zip=B/'ScentStation_RevA_Gerber_THU_NGHIEM.zip'
with zipfile.ZipFile(gerber_zip,'w',zipfile.ZIP_DEFLATED) as z:
    for x in sorted((B/'gerber').iterdir()):
        if x.is_file():z.write(x,x.name)

keep=['scentstation-rev-a.kicad_pcb','scentstation-rev-a.kicad_sch','scentstation-rev-a.kicad_pro','RevA.kicad_sym','sym-lib-table','fp-lib-table','BOM.csv','BOM-grouped.csv','pin-net.csv','design.json','reference-map.json','schematic.net','board-audit.json','erc-final.json','drc-final.json','KIEM_TRA.json','drill-report.txt','HUONG_DAN_REV_A.md','gerber-top.png','gerber-bottom.png','gerber-top.svg','gerber-bottom.svg','assembly-front.svg','assembly-front.png','so-do-tung-chan.svg','mau-do-socket-ESP-1-1.svg']
with zipfile.ZipFile(B/'ScentStation_RevA_HO_SO_DAY_DU.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name in keep:z.write(B/name,name)
    for x in sorted((B/'gerber').iterdir()):
        if x.is_file():z.write(x,'gerber/'+x.name)
    for name in ['build_rev_a.py','finalize_rev_a.py','export_schematic_rev_a.py','audit_rev_a.py','verify_exports_rev_a.py']:z.write(BASE/name,'scripts/'+name)
print('PASS: DRC, ERC, pin/net parity, Gerber/Excellon parse, ZIP packages',flush=True)
