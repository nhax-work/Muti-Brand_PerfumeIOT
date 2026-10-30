from pathlib import Path
import os,subprocess,shutil
base=Path('hardware/driver15').resolve(); b=base/'rev-b'; k=base/'.tools/kicad'; cli=k/'bin/kicad-cli.exe'
os.environ['KICAD_CONFIG_HOME']=str(base/'.tools/config');os.environ['KICAD_DOCUMENTS_HOME']=str(base/'.tools/documents')
f=b/'scentstation-rev-b.kicad_pcb';g=b/'gerber';g.mkdir(exist_ok=True)
for args in [ ['gerbers','--layers','F.Cu,B.Cu,F.Mask,B.Mask,F.Silkscreen,B.Silkscreen,Edge.Cuts','--subtract-soldermask','-o',str(g)], ['drill','--excellon-separate-th','--generate-map','--map-format','svg','--generate-report','--report-path',str(b/'drill-report.txt'),'-o',str(g)], ['ipc2581','--help'] ]:
 if args[0]=='ipc2581':continue
 r=subprocess.run([str(cli),'pcb','export',*args,str(f)],capture_output=True,text=True); print(r.stdout,flush=True);assert r.returncode==0,r.stderr
r=subprocess.run([str(cli),'pcb','export','svg','--layers','F.Fab,F.Silkscreen,Edge.Cuts','--mode-single','--fit-page-to-board','--exclude-drawing-sheet','-o',str(b/'assembly-front.svg'),str(f)],capture_output=True,text=True);assert r.returncode==0,r.stderr
for name in ['reference-map.json','so-do-tung-chan.svg']:
 shutil.copyfile(base/'rev-a'/name,b/name)
s=(base/'rev-a/HUONG_DAN_REV_A.md').read_text(encoding='utf-8').replace('Rev A','Rev B').replace('REV_A','REV_B').replace('RevA','RevB').replace('rev-a','rev-b').replace('19/10/2026','20/10/2026').replace('khoảng cách hai hàng tạm 27,5 mm','khoảng cách tâm hai hàng 25 mm theo phép đo người dùng').replace('27,5 mm','25 mm').replace('27.5 mm','25 mm')
s+='\n## Thay đổi Rev B\n\nĐổi khoảng cách tâm hai hàng socket ESP32 từ 27,5 mm sang 25 mm theo phép đo người dùng ngày 20/10/2026. Hàng trái x=14 mm, hàng phải x=39 mm; đi lại các đường vướng. Pinout carrier vẫn cần đối chiếu; khoảng cách 25 mm không xác nhận thứ tự chân. Các phần công suất và phân công chân giữ theo Rev A.\n'
(b/'HUONG_DAN_REV_B.md').write_text(s,encoding='utf-8')
print('EXPORTS DONE',flush=True)
