"""Tạo bộ thử nghiệm Rev B 1 oz riêng và kiểm chứng file xuất."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import sys
import warnings
import zipfile

BASE = Path(__file__).resolve().parent
SRC = BASE / 'rev-b'
OUT = BASE / 'rev-b-1oz'
TOOLS = BASE / '.tools'
os.environ['KICAD_CONFIG_HOME'] = str(TOOLS / 'config')
os.environ['KICAD_DOCUMENTS_HOME'] = str(TOOLS / 'documents')
sys.path.insert(0, str(TOOLS / 'python'))
import gerbonara
import resvg_py

OUT.mkdir(exist_ok=True)
G = OUT / 'gerber'
G.mkdir(exist_ok=True)
name = 'scentstation-rev-b'
keep = [name + ext for ext in ['.kicad_sch', '.kicad_pro']] + ['RevA.kicad_sym', 'sym-lib-table', 'fp-lib-table', 'BOM.csv', 'BOM-grouped.csv', 'pin-net.csv', 'design.json', 'reference-map.json', 'schematic.net', 'erc-final.json', 'board-audit.json', 'DANH_GIA_DONG_1OZ.md', 'power-1oz-audit.json']
for filename in keep:
    shutil.copyfile(SRC / filename, OUT / filename)
assessment = OUT / 'DANH_GIA_DONG_1OZ.md'
assessment.write_text('> Ghi chú bộ 1 oz: nội dung bên dưới là đánh giá trước khi chuyển đổi. Bộ này đã được xuất riêng với đồng 35 µm mỗi mặt và DRC mới trong `drc-final.json`; xem `KIEM_TRA.json` và `HUONG_DAN_REV_B_1OZ.md`. Các hạn chế kiểm chứng nhiệt vẫn áp dụng.\n\n' + assessment.read_text(encoding='utf-8'), encoding='utf-8')
pcb = (SRC / (name + '.kicad_pcb')).read_text(encoding='utf-8')
assert pcb.count('(thickness 0.07)') == 2
assert pcb.count('(thickness 1.44)') == 1
pcb = pcb.replace('(thickness 0.07)', '(thickness 0.035)').replace('(thickness 1.44)', '(thickness 1.51)')
board = OUT / (name + '.kicad_pcb')
board.write_text(pcb, encoding='utf-8')
guide = (SRC / 'HUONG_DAN_REV_B.md').read_text(encoding='utf-8').replace('70 µm mỗi mặt (2 oz)', '35 µm mỗi mặt (1 oz)')
guide += '\n## Biến thể 1 oz — 26/10/2026\n\nChỉ đổi stackup: đồng 35 µm mỗi mặt, lõi 1,51 mm để giữ tổng dày 1,6 mm kể cả solder mask. Không thay đường đồng, via, sơ đồ hoặc BOM. Đây là mẫu thử cho chế độ một bơm + một van; chưa xác nhận dòng khởi động, nhiệt và mạ lỗ. Xem DANH_GIA_DONG_1OZ.md. Dùng ZIP có tên 1oz; không dùng thông số 2 oz của bộ cũ. Mạ bề mặt giữ HASL không chì theo hồ sơ KiCad.\n'
(OUT / 'HUONG_DAN_REV_B_1OZ.md').write_text(guide, encoding='utf-8')

def run(args):
    proc = subprocess.run([str(TOOLS / 'kicad/bin/kicad-cli.exe'), *args], capture_output=True, text=True, encoding='utf-8', errors='replace')
    if proc.returncode:
        raise RuntimeError(proc.stdout + proc.stderr)
    print(proc.stdout, flush=True)

run(['pcb', 'drc', '--format', 'json', '-o', str(OUT / 'drc-final.json'), str(board)])
drc = json.loads((OUT / 'drc-final.json').read_text(encoding='utf-8'))
assert not drc['violations'] and not drc['unconnected_items']
run(['pcb', 'export', 'gerbers', '--layers', 'F.Cu,B.Cu,F.Mask,B.Mask,F.Silkscreen,B.Silkscreen,Edge.Cuts', '--subtract-soldermask', '-o', str(G), str(board)])
run(['pcb', 'export', 'drill', '--excellon-separate-th', '--generate-map', '--map-format', 'svg', '--generate-report', '--report-path', str(OUT / 'drill-report.txt'), '-o', str(G), str(board)])
job = json.loads((G / (name + '-job.gbrjob')).read_text(encoding='utf-8'))
assert [x['Thickness'] for x in job['MaterialStackup'] if x['Type'] == 'Copper'] == [.035, .035]
assert job['GeneralSpecs']['BoardThickness'] == 1.6
assert job['GeneralSpecs']['LayerNumber'] == 2

with warnings.catch_warnings(record=True) as notes:
    warnings.simplefilter('always')
    stack = gerbonara.LayerStack.open(G)
    original = gerbonara.LayerStack.open(SRC / 'gerber')
    counts = {' '.join(k): len(v.objects) for k, v in stack.graphic_layers.items()}
    assert counts == {' '.join(k): len(v.objects) for k, v in original.graphic_layers.items()}
    assert len(stack.drill_pth.objects) == 315 and len(stack.drill_npth.objects) == 4
    assert stack.board_bounds() == original.board_bounds()
    for side in ['top', 'bottom']:
        svg = str(stack.to_pretty_svg(side=side, margin=2))
        (OUT / f'gerber-{side}.svg').write_text(svg, encoding='utf-8')
        (OUT / f'gerber-{side}.png').write_bytes(resvg_py.svg_to_bytes(svg_string=svg, width=1800, dpi=96, background='#ffffff'))

# Chứng minh hình học không đổi: bỏ header metadata, so sánh toàn bộ lệnh vẽ/khoan.
geometry_equal = {}
for exported in G.iterdir():
    if exported.suffix.lower() not in ['.gtl', '.gbl', '.gts', '.gbs', '.gto', '.gbo', '.gm1', '.drl']:
        continue
    def commands(path):
        return [line for line in path.read_text(encoding='utf-8').splitlines() if not line.startswith(('G04', '%TF.', ';'))]
    geometry_equal[exported.name] = commands(exported) == commands(SRC / 'gerber' / exported.name)
assert all(geometry_equal.values()), geometry_equal
result = json.loads((SRC / 'KIEM_TRA.json').read_text(encoding='utf-8'))
result.update({'variant': 'Rev B 1 oz', 'copper_um_each_side': 35, 'review_date': '2026-10-26', 'drc_violations': 0, 'drc_unconnected_items': 0, 'gerber_layer_objects': counts, 'geometry_commands_equal_to_2oz': geometry_equal, 'thermal_validation': 'NOT_BENCH_VALIDATED', 'intended_operation': 'One pump and one valve at a time plus logic/lights; total current and startup require measurement', 'parser_notes': sorted(set(str(w.message) for w in notes))})
for dest in [OUT / 'KIEM_TRA.json', G / 'KIEM_TRA.json']:
    dest.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
readme = '''SCENTSTATION REV B 1 OZ — MẪU THỬ, CHƯA DUYỆT SẢN XUẤT
PCB đơn 240 x 190 mm; 2 lớp; FR4; tổng dày 1,6 mm.
ĐỒNG HOÀN THIỆN YÊU CẦU: 35 µm / 1 oz MỖI MẶT.
Mạ bề mặt: HASL không chì theo Gerber job. Mask xanh, chữ trắng.
Khoan PTH/NPTH tách riêng, đơn vị mm, cùng gốc với Gerber.
GTL/GBL: đồng; GTS/GBS: mask; GTO/GBO: chữ; GM1: outline.
DRC bản 1 oz: 0 vi phạm, 0 kết nối thiếu. Đọc lại đủ 7 lớp, 315 lỗ PTH, 4 lỗ NPTH.
Đường đồng và via giữ nguyên Rev B 2 oz, không gia cường thêm.
Chế độ dự kiến: một bơm + một van cùng lúc; chưa kiểm chứng nhiệt/dòng khởi động.
Xưởng cần xác nhận chiều dày đồng hoàn thiện và mạ thành lỗ.
Vẫn cần đối chiếu socket/pinout ESP, linh kiện thực và thử phần cứng.
Firmware hiện tại chưa hỗ trợ bo Rev B. Cầu chì và buck nằm ngoài bo.
'''
(G / 'README_TRUOC_KHI_DAT_IN.txt').write_text(readme, encoding='utf-8')
checks = '\n'.join(hashlib.sha256(f.read_bytes()).hexdigest() + '  ' + f.name for f in sorted(G.iterdir()) if f.is_file() and f.name != 'SHA256SUMS.txt') + '\n'
(G / 'SHA256SUMS.txt').write_text(checks, encoding='utf-8')
for filename, files in [
    ('ScentStation_RevB_1oz_Gerber_THU_NGHIEM.zip', [(f, f.name) for f in sorted(G.iterdir()) if f.is_file()]),
    ('ScentStation_RevB_1oz_HO_SO_DAY_DU.zip', [(f, str(f.relative_to(OUT))) for f in sorted(OUT.rglob('*')) if f.is_file() and f.suffix != '.zip']),
]:
    with zipfile.ZipFile(OUT / filename, 'w', zipfile.ZIP_DEFLATED) as archive:
        for source, dest in files:
            archive.write(source, dest)
    with zipfile.ZipFile(OUT / filename) as archive:
        assert archive.testzip() is None
print('PASS: 1 oz stackup, DRC, independent Gerber/drill reader, geometry parity, ZIP integrity', flush=True)
