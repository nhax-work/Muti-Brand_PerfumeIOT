"""Bổ sung carrier ESP minh họa vào GLB KiCad (exporter không hỗ trợ WRL)."""
from pathlib import Path
import struct,json,re,os
REV=os.environ.get('SCENT_REV','a')
B=Path(__file__).resolve().parent/f'rev-{REV}'/'3d'
center_x=14+json.loads((B.parent/'design.json').read_text(encoding='utf-8'))['esp_spacing_mm']/2
f=B/'scentstation-web.glb';raw=f.read_bytes()
jl,jt=struct.unpack_from('<II',raw,12)
j=json.loads(raw[20:20+jl]);bl,bt=struct.unpack_from('<II',raw,20+jl)
data=bytearray(raw[28+jl:28+jl+bl])
assert len(j['buffers'])==1 and jt==0x4e4f534a and bt==0x004e4942

vertices=[];normals=[];indices=[]
faces=[((1,0,0),[(.5,-.5,-.5),(.5,.5,-.5),(.5,.5,.5),(.5,-.5,.5)]),
       ((-1,0,0),[(-.5,-.5,.5),(-.5,.5,.5),(-.5,.5,-.5),(-.5,-.5,-.5)]),
       ((0,1,0),[(-.5,.5,-.5),(-.5,.5,.5),(.5,.5,.5),(.5,.5,-.5)]),
       ((0,-1,0),[(-.5,-.5,.5),(-.5,-.5,-.5),(.5,-.5,-.5),(.5,-.5,.5)]),
       ((0,0,1),[(.5,-.5,.5),(.5,.5,.5),(-.5,.5,.5),(-.5,-.5,.5)]),
       ((0,0,-1),[(-.5,-.5,-.5),(-.5,.5,-.5),(.5,.5,-.5),(.5,-.5,-.5)])]
for n,vs in faces:
    start=len(vertices);vertices.extend(vs);normals.extend([n]*4)
    indices.extend(start+i for i in [0,1,2,0,2,3])

def accessor(values,fmt,typ,count,target,component,bounds=None):
    while len(data)%4:data.append(0)
    off=len(data);binary=struct.pack('<'+fmt*len(values),*values);data.extend(binary)
    vi=len(j['bufferViews']);j['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':len(binary),'target':target})
    a={'bufferView':vi,'componentType':component,'count':count,'type':typ}
    if bounds:a.update(min=bounds[0],max=bounds[1])
    ai=len(j['accessors']);j['accessors'].append(a);return ai
vp=accessor([v for x in vertices for v in x],'f','VEC3',24,34962,5126,([-.5]*3,[.5]*3))
vn=accessor([v for x in normals for v in x],'f','VEC3',24,34962,5126)
ix=accessor(indices,'H','SCALAR',36,34963,5123,([0],[23]))
source=(B/'esp-carrier-illustration.wrl').read_text(encoding='utf-8')
pattern=r'Transform \{ translation ([\d. -]+) children \[ Shape \{ appearance Appearance \{ material Material \{ diffuseColor ([\d. ]+).*?geometry Box \{ size ([\d. ]+) \}'
boxes=re.findall(pattern,source)
meshes={}
for i,(center,color,size) in enumerate(boxes):
    center=list(map(float,center.split()));size=list(map(float,size.split()));color=tuple(map(float,color.split()))
    if color not in meshes:
        mat=len(j['materials']);j['materials'].append({'name':'ESP illustration '+str(color),'pbrMetallicRoughness':{'baseColorFactor':[*color,1],'metallicFactor':.2 if max(color)>.5 else 0,'roughnessFactor':.6},'doubleSided':False})
        mi=len(j['meshes']);j['meshes'].append({'name':'ESP illustrative box','primitives':[{'attributes':{'POSITION':vp,'NORMAL':vn},'indices':ix,'material':mat}]});meshes[color]=mi
    node={'name':f'ESP_CARRIER_ILLUSTRATION_{i+1}','mesh':meshes[color],
          'translation':[(center_x+center[0])/1000,(1.56+center[2])/1000,(34.5-center[1])/1000],
          'scale':[size[0]/1000,size[2]/1000,size[1]/1000]}
    ni=len(j['nodes']);j['nodes'].append(node);j['nodes'][0]['children'].append(ni)
j['asset'].setdefault('extras',{})['preview_note']='ESP carrier is an unverified dimensional illustration; PCF8575 and buck remain external. Not for mechanical or manufacturing approval.'
j['buffers'][0]['byteLength']=len(data)
while len(data)%4:data.append(0)
text=json.dumps(j,separators=(',',':')).encode('utf-8')
while len(text)%4:text+=b' '
total=12+8+len(text)+8+len(data)
out=struct.pack('<III',0x46546c67,2,total)+struct.pack('<II',len(text),0x4e4f534a)+text+struct.pack('<II',len(data),0x004e4942)+data
f.write_bytes(out)
assert len(boxes)==48,len(boxes)
assert len(out)==struct.unpack_from('<I',out,8)[0]
print('Web GLB completed:',len(out),'bytes;',len(boxes),'ESP carrier shapes; all geometry embedded.')
