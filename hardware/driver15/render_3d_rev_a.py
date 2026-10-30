"""Tạo bản PCB chỉ phục vụ xem 3D, không sửa bản Gerber đã xuất."""
from pathlib import Path
import os,subprocess,json,hashlib,re
import pcbnew as p

BASE=Path(__file__).resolve().parent
K=Path(os.environ['KICAD_ROOT'])
REV=os.environ.get('SCENT_REV','a')
B=BASE/f'rev-{REV}';OUT=B/'3d';OUT.mkdir(exist_ok=True)
profile=json.loads((B/'design.json').read_text(encoding='utf-8'))
spacing=profile['esp_spacing_mm'];center_x=14+spacing/2
source=B/f'scentstation-rev-{REV}.kicad_pcb'
before=hashlib.sha256(source.read_bytes()).hexdigest()
b=p.LoadBoard(str(source))

# Nominal carrier and small parts for visual context, not a verified DevKit model.
w=['#VRML V2.0 utf8','WorldInfo { title "ESP carrier illustration - dimensions unverified" }',
   'Transform { scale 0.3937007874 0.3937007874 0.3937007874 children [']
def box(center,size,color):
    w.append('Transform { translation %s children [ Shape { appearance Appearance { material Material { diffuseColor %s specularColor 0.15 0.15 0.15 shininess 0.35 } } geometry Box { size %s } } ] }'%(' '.join(map(str,center)),' '.join(map(str,color)),' '.join(map(str,size))))
box((0,0,10.8),(spacing+6,60,1.6),(.045,.06,.065))
box((0,-28,13.0),(8,6,2.8),(.65,.66,.69))
box((0,-31.05,13.0),(6.8,.12,1.8),(.035,.035,.035))
box((0,-11,12.3),(5,5,1.4),(.04,.04,.04))
box((8,-16,12.4),(6,4,1.6),(.04,.04,.04))
for x in [-9,9]:
    box((x,-23,12.1),(4,3,1),(.58,.6,.62))
    box((x,-23,12.85),(2.4,1.6,.5),(.06,.06,.06))
box((11,-24,12.1),(1.5,1.0,1),(.8,.03,.02))
for x in [-spacing/2,spacing/2]:
    for i in range(19):box((x,20.5-i*2.54,8.7),(.64,.64,3.4),(.68,.55,.25))
w.append('] }')
(OUT/'esp-carrier-illustration.wrl').write_text('\n'.join(w),encoding='utf-8')
fp=p.FOOTPRINT(b);fp.SetReference('ESP_PREVIEW_ONLY');fp.SetValue('UNVERIFIED_CARRIER_ILLUSTRATION')
fp.SetPosition(p.VECTOR2I(p.FromMM(center_x),p.FromMM(34.5)))
fp.Reference().SetVisible(False);fp.Value().SetVisible(False)
model=p.FP_3DMODEL();model.m_Filename=str((OUT/'esp-carrier-illustration.wrl').resolve());fp.Add3DModel(model);b.Add(fp)

# Use the actual KiCad WROOM package model over the illustrative carrier.
rf=p.FOOTPRINT(b);rf.SetReference('WROOM_PREVIEW_ONLY');rf.SetValue('ESP32_WROOM_PACKAGE')
rf.SetPosition(p.VECTOR2I(p.FromMM(center_x),p.FromMM(17.5)))
rf.Reference().SetVisible(False);rf.Value().SetVisible(False)
model=p.FP_3DMODEL();model.m_Filename=str(K/'share/kicad/3dmodels/RF_Module.3dshapes/ESP32-WROOM-32.step');model.m_Offset=p.VECTOR3D(0,0,11.6);rf.Add3DModel(model);b.Add(rf)

# Copy models beside the preview so this file opens without this machine's tool path.
models=OUT/'models';models.mkdir(exist_ok=True)
missing=[]
for fp in b.GetFootprints():
    for m in fp.Models():
        fn=m.m_Filename.replace('${KICAD9_3DMODEL_DIR}',str(K/'share/kicad/3dmodels'))
        path=Path(fn)
        if not path.exists():missing.append([fp.GetReference(),fn]);continue
        if path.suffix.lower()=='.step':
            import shutil
            dst=models/path.name
            if not dst.exists():shutil.copyfile(path,dst)
            m.m_Filename='${KIPRJMOD}/models/'+path.name
        else:m.m_Filename='${KIPRJMOD}/'+path.name
assert not missing,missing
preview=OUT/'scentstation-assembly-preview.kicad_pcb';p.SaveBoard(str(preview),b)
def relative_model(match):
    filename=re.split(r'[\\/]',match.group(1))[-1]
    rel='esp-carrier-illustration.wrl' if filename.endswith('.wrl') else 'models/'+filename
    assert (OUT/rel).exists(),rel
    return '(model "${KIPRJMOD}/'+rel+'"'
preview.write_text(re.sub(r'\(model "([^"]+)"',relative_model,preview.read_text(encoding='utf-8')),encoding='utf-8')
assert hashlib.sha256(source.read_bytes()).hexdigest()==before
(OUT/'README.md').write_text(f'''# Hình 3D lắp linh kiện — Rev {REV.upper()}

Ảnh được render bằng KiCad từ bản sao PCB Rev A và mô hình linh kiện KiCad. Không thay đổi PCB hoặc Gerber gốc.

ESP32 được thêm để minh họa trạng thái cắm vào socket: carrier, USB và linh kiện nhỏ trên carrier là mô hình gần đúng; package ESP32-WROOM dùng model thư viện KiCad. Khoảng cách socket {spacing} mm theo dữ liệu bản thiết kế; bề rộng, chiều dài carrier và chiều cao lắp chưa được đối chiếu board thực. Không dùng ảnh này để kết luận đã kiểm tra va chạm cơ khí.

Module PCF8575 và buck 12V→5V nối ngoài bo qua JPCF1/JBUCKIN1/J5 nên không được vẽ như linh kiện gắn trực tiếp lên carrier. Đầu nối Phoenix trên bo mới gồm header PCB; đầu cắm dây ghép rời và dây không được mô phỏng.

File `scentstation-assembly-preview.kicad_pcb` chỉ dành cho 3D Viewer; không xuất Gerber từ bản này. Thư mục `models/` và file WRL đi kèm cần được giữ cùng thư mục để mở lại.
''',encoding='utf-8')
print('Preview PCB created; all component models found; source PCB unchanged.',flush=True)

env=os.environ.copy();env['KICAD9_3DMODEL_DIR']=str(K/'share/kicad/3dmodels')
views=[('3d-isometric.png','45,0,30'),('3d-other-angle.png','35,0,-35'),('3d-top.png','0,0,0')]
for filename,angles in views:
    args=[str(K/'bin/kicad-cli.exe'),'pcb','render','--width','1800','--height','1400','--quality','high','--background','opaque','--floor','--rotate',angles,'--zoom','0.85','-o',str(OUT/filename),str(preview)]
    print('Render',filename,flush=True)
    result=subprocess.run(args,env=env,capture_output=True,text=True,encoding='utf-8',errors='replace')
    (OUT/(filename+'.log')).write_text(result.stdout+'\n'+result.stderr,encoding='utf-8')
    print('exit',result.returncode,(result.stdout+result.stderr)[-600:],flush=True)
    if result.returncode:raise SystemExit(result.returncode)
