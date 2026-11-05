"""Create a shaded globe from Natural Earth land geometry; clouds are illustrative."""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

BASE=Path(__file__).resolve().parent
W,H=2048,1024
mask=Image.new("L",(W,H))
d=ImageDraw.Draw(mask)
data=json.loads((BASE/"assets/land.geojson").read_text())
for f in data["features"]:
    g=f["geometry"]
    polys=g["coordinates"] if g["type"]=="MultiPolygon" else [g["coordinates"]]
    for p in polys:
        for i,ring in enumerate(p):
            pts=[((lon+180)/360*W,(90-lat)/180*H) for lon,lat in ring]
            d.polygon(pts,fill=255 if i==0 else 0)
land=np.asarray(mask)/255
rng=np.random.default_rng(42)
noise=np.zeros((H,W))
for scale,weight in [(16,.52),(32,.26),(64,.13),(128,.09)]:
    a=Image.fromarray((rng.random((scale//2,scale))*255).astype("uint8"))
    noise+=np.asarray(a.resize((W,H),Image.Resampling.BICUBIC))/255*weight
size=1000
yy,xx=np.mgrid[:size,:size]
x=(xx-size/2)/(size*.494);y=(yy-size/2)/(size*.494)
inside=x*x+y*y<=1
z=np.sqrt(np.clip(1-x*x-y*y,0,1))
# Camera looks toward the Atlantic/Africa. Geographic outline is authentic;
# relief and clouds are illustrative and not live satellite data.
lon=np.arctan2(x,z)+np.deg2rad(10)
lat=np.arcsin(np.clip(-y,-1,1))
u=((lon+np.pi)/(2*np.pi)*W).astype(int)%W
v=np.clip(((np.pi/2-lat)/np.pi*H).astype(int),0,H-1)
L=land[v,u];N=noise[v,u]
light=.13+.87*np.maximum(0,-x*.4-y*.6+z*.68)
rgb=np.zeros((size,size,3))
for k,(o,l) in enumerate(zip([12,48,77],[52,98,83])):
    rgb[:,:,k]=(o*(1-L)+(l+(N-.5)*35)*L)*light
cloud=np.clip((N-.56)*4,0,.72)*(np.cos(lat)**.4)
for k in range(3):rgb[:,:,k]=rgb[:,:,k]*(1-cloud)+195*light*cloud
rim=(1-z)**4
rgb+=rim[:,:,None]*np.array([15,40,65])
rgba=np.dstack((np.clip(rgb,0,255).astype("uint8"),inside.astype("uint8")*255))
Image.fromarray(rgba).save(BASE/"assets/globe.png")
print(BASE/"assets/globe.png")
