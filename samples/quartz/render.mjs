import {createCanvas,GlobalFonts} from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {out,lattice,timeline,duration,chapters,state,clamp,lerp,smooth,events,growthOrder,centerTetra} from './model.mjs';
import {silicicAcid,condensation} from './chemistry.mjs';
fs.mkdirSync(out,{recursive:true});
GlobalFonts.registerFromPath('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc','KR');
GlobalFonts.registerFromPath('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc','KRB');
GlobalFonts.registerFromPath('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','Latin');
GlobalFonts.registerFromPath('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf','LatinBold');
const W=1080,H=1920,FPS=30,C=createCanvas(W,H),c=C.getContext('2d');
const INK='#eff6f5',MUTED='#a0b4b8',TEAL='#86ddd8',GOLD='#e9bc78',OXY='#a6e8ec';
const E=events();
const txt=(s,x,y,size=30,col=INK,bold=false,align='left')=>{const family=/[가-힣]/.test(s)?(bold?'KRB':'KR'):(bold?'LatinBold':'Latin');c.font=`${size}px ${family}`;c.textAlign=align;c.textBaseline='middle';c.fillStyle=col;c.fillText(s,x,y)};
function circle(x,y,r,col){if(r<=0)return;c.beginPath();c.arc(x,y,r,0,2*Math.PI);c.fillStyle=col;c.fill()}
function line(pts,col,w=1){c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.lineWidth=w;c.lineCap='round';c.lineJoin='round';c.strokeStyle=col;c.stroke()}
function poly(pts,fill,stroke=null,w=1){c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();if(fill){c.fillStyle=fill;c.fill()}if(stroke){c.strokeStyle=stroke;c.lineWidth=w;c.stroke()}}
function rgba(h,a){return `rgba(${parseInt(h.slice(1,3),16)},${parseInt(h.slice(3,5),16)},${parseInt(h.slice(5,7),16)},${clamp(a)})`}
function glow(x,y,r,col,a=.3){const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,rgba(col,a));g.addColorStop(.25,rgba(col,a*.4));g.addColorStop(1,rgba(col,0));circle(x,y,r,g)}
function sphere(x,y,r,col,a=1){c.save();c.globalAlpha=a;const g=c.createRadialGradient(x-r*.35,y-r*.4,1,x,y,r);g.addColorStop(0,'#fffef3');g.addColorStop(.32,col);g.addColorStop(.72,col);g.addColorStop(1,'#143842');circle(x,y,r,g);c.restore()}
const rand=i=>{const a=Math.sin(i*127.1+97.2)*43758.5453;return a-Math.floor(a)};
function project(v,angle=.6,scale=180,cx=540,cy=1020,tilt=.16,distance=10){
 const [x,y,z]=v,xx=x*Math.cos(angle)+z*Math.sin(angle),zz=-x*Math.sin(angle)+z*Math.cos(angle),yy=y*Math.cos(tilt)-zz*Math.sin(tilt),depth=y*Math.sin(tilt)+zz*Math.cos(tilt),p=distance/(distance-depth);
 return [cx+xx*scale*p,cy-yy*scale*p,depth,p];
}
function crystal(cx,cy,scale,angle,growth=1,tilt=.15,opacity=1){
 const radius=.79*(.45+.55*growth),height=2.72*growth,base=-1.45,verts=[];
 for(const y of [base,base+height])for(let j=0;j<6;j++){const a=j*Math.PI/3+Math.PI/6;verts.push([radius*Math.cos(a),y,radius*Math.sin(a)])}
 verts.push([0,base+height+.85*growth,0]);
 const projected=verts.map(v=>project(v,angle,scale,cx,cy,tilt));
 const faces=[];for(let j=0;j<6;j++){let n=(j+1)%6;faces.push({ids:[j,n,n+6,j+6],kind:0,j});faces.push({ids:[j+6,n+6,12],kind:1,j})}
 faces.sort((a,b)=>a.ids.reduce((s,i)=>s+projected[i][2],0)/a.ids.length-b.ids.reduce((s,i)=>s+projected[i][2],0)/b.ids.length);
 c.save();c.globalAlpha=opacity;
 for(const f of faces){const pts=f.ids.map(i=>projected[i]),br=.5+.5*Math.sin(f.j*1.047+angle+1.5),g=c.createLinearGradient(cx-scale,cy-3*scale,cx+scale,cy+2*scale);g.addColorStop(0,`rgba(235,255,253,${.19+br*.43})`);g.addColorStop(.48,`rgba(110,195,202,${.12+br*.21})`);g.addColorStop(1,`rgba(43,83,101,${.35+br*.18})`);poly(pts,g,`rgba(209,249,248,${.17+br*.48})`,1.5);if(f.kind===0&&br>.7){const a=pts[0],b=pts[3];line([[lerp(a[0],pts[1][0],.12),a[1]],[lerp(b[0],pts[2][0],.12),b[1]]],'#e8fffc44',2)}}
 const tip=projected[12];glow(tip[0],tip[1],28,TEAL,.18);
 c.restore();return projected;
}
function background(t){const g=c.createLinearGradient(0,0,W,H);g.addColorStop(0,'#13282c');g.addColorStop(.5,'#08191e');g.addColorStop(1,'#061216');c.fillStyle=g;c.fillRect(0,0,W,H);glow(580,1000,720,TEAL,.055);for(let i=0;i<50;i++)circle(40+rand(i)*1000,400+rand(i+100)*1150+Math.sin(t*.1+i)*5,.6+rand(i+200),rgba('#c5e2dd',.05+rand(i+300)*.09))}
function header(n,title,sub){txt(`MINERAL LAB   /   ${String(n).padStart(2,'0')}`,65,91,22,GOLD,true);line([[65,130],[1015,130]],'#466064',1);title.split('\n').forEach((s,i)=>txt(s,62,220+i*90,73,INK,true));txt(sub,66,title.includes('\n')?410:320,27,MUTED)}
function wrap(s){c.font='42px KR';let lines=[],l='';for(const w of s.split(' ')){if(l&&c.measureText(l+' '+w).width>940){lines.push(l);l=w}else l+=(l?' ':'')+w}if(l)lines.push(l);return lines}
function footer(t){const g=c.createLinearGradient(0,1570,0,H);g.addColorStop(0,'#07141900');g.addColorStop(.3,'#071419f5');g.addColorStop(1,'#071419');c.fillStyle=g;c.fillRect(0,1570,W,350);const a=timeline.segments.find(s=>t>=s.start&&t<s.end+.1);if(a){const ls=wrap(a.text);ls.forEach((s,i)=>txt(s,540,1715-(ls.length-1)*30+i*60,42,INK,false,'center'))}line([[65,1844],[1015,1844]],'#30494d',2);line([[65,1844],[65+950*clamp(t/duration),1844]],GOLD,3);txt('석영 · 원자가 만드는 질서',65,1881,19,MUTED);txt('QUARTZ / SiO₂',1015,1881,20,MUTED,false,'right')}
function rock(cx,cy,rx,ry,seed=0){const pts=[];for(let i=0;i<12;i++){let a=i*Math.PI/6;const r=.83+rand(i+seed)*.2;pts.push([cx+rx*r*Math.cos(a),cy+ry*r*Math.sin(a)])}poly(pts,'#203338','#69818366',1);for(let i=0;i<12;i++)poly([[cx-20,cy-15],pts[i],pts[(i+1)%12]],`rgba(${26+i*2},${43+i*2},${48+i*2},.6)`,'#59717422',1)}
function hero(t,p,ending=false){
 c.save();c.fillStyle='#01070988';c.beginPath();c.ellipse(540,1430,380,55,0,0,2*Math.PI);c.fill();c.restore();rock(530,1410,370,85);
 crystal(320,1230,112,-.8+t*.035,.9,-.25,.7);crystal(765,1240,100,.5+t*.04,.76,.42,.75);
 crystal(550,1110,205,-.45+t*.035,ending?lerp(.93,1,smooth(p)):1,.18,1);
 txt('SiO₂',83,557,61,GOLD,true);txt('규소 + 산소',87,618,28,MUTED);
 if(!ending){line([[275,750],[395,810]],'#a7c6c866',1);txt('자연적으로 자란 결정면',82,712,27,INK);txt('수정 = 투명한 석영',540,1515,32,INK,true,'center')}
 else{txt('작은 결합의 반복이',540,1510,34,INK,true,'center');txt('큰 결정의 모양을 만든다',540,1560,34,GOLD,true,'center')}
}
function dissolved(t,n=36){for(let i=0;i<n;i++){const u=(t*.045+rand(i+20))%1,x=170+740*u,y=900+Math.sin(u*6.3+i*.67)*215+Math.cos(i*3.4)*80;circle(x,y,4+rand(i+6)*4,rgba(i%3?TEAL:GOLD,.22+rand(i+9)*.35));if(i%4===0)circle(x+8,y+4,3,rgba(TEAL,.25))}}
function fluid(t,p){
 c.save();c.beginPath();c.ellipse(540,1015,430,470,-.14,0,2*Math.PI);c.clip();const g=c.createLinearGradient(200,600,850,1400);g.addColorStop(0,'#294a51');g.addColorStop(.5,'#153b44');g.addColorStop(1,'#092a34');c.fillStyle=g;c.fillRect(60,500,960,1050);dissolved(t,80);
 for(let k=0;k<6;k++){const pts=[];for(let u=0;u<1;u+=.02)pts.push([150+780*u,800+k*70+Math.sin(u*5+t*.2+k)*44]);line(pts,'#8cc7c512',1.5)}c.restore();
 for(let i=0;i<22;i++){const a=i*Math.PI/11;rock(540+452*Math.cos(a),1010+478*Math.sin(a),65+rand(i)*35,58+rand(i+5)*25,i*17)}
 txt('암석의 틈',85,515,29,GOLD,true);txt('뜨거운 물',540,690,40,INK,true,'center');txt('녹아 있는 규소 성분',540,1390,30,TEAL,true,'center');txt('용존 성분과 공간은 설명을 위해 단순화',540,1550,22,MUTED,false,'center');
}
function atomPos(i){const [x,y,z]=lattice.atoms[i].p;return [x,z,y]}
function network(t,{single=false,visible=null,scale=75,cx=540,cy=1050,angle=.35,showTetra=false}={}){
 const indices=single?centerTetra:visible?Array.from(visible):lattice.atoms.map((_,i)=>i),set=new Set(indices),proj=new Map(indices.map(i=>[i,project(atomPos(i),angle,scale,cx,cy,.2,20)]));
 if(showTetra){const os=centerTetra.slice(1);for(const face of [[0,1,2],[0,1,3],[0,2,3],[1,2,3]])poly(face.map(j=>proj.get(os[j])), '#8de0d215','#a9e7df66',1.4)}
 const draw=[];
 for(const [a,b] of lattice.bonds)if(set.has(a)&&set.has(b)){const x=proj.get(a),y=proj.get(b);draw.push({z:(x[2]+y[2])/2,fn:()=>{line([x,y],'#0a2025',8);line([x,y],'#a7c9c5aa',4)}})}
 for(const i of indices){const v=proj.get(i),si=lattice.atoms[i].element==='Si',r=(si?20:15)*(scale/75)**.4*v[3];draw.push({z:v[2],fn:()=>sphere(v[0],v[1],r,si?GOLD:OXY,.94)})}
 draw.sort((a,b)=>a.z-b.z).forEach(x=>x.fn());return proj;
}
function legend(y=1515){sphere(185,y,12,GOLD);txt('규소 Si',212,y,26,INK);sphere(555,y,12,OXY);txt('산소 O',582,y,26,INK)}
function molecule(m,{scale=110,cy=1030,angle=.15}={}){
 const points=new Map(m.atoms.map(a=>[a.id,project(a.p,angle,scale,540,cy,.12,20)])),draw=[];
 for(const b of m.bonds){if(b.alpha<.01)continue;const a=points.get(b.a),q=points.get(b.b);draw.push({z:(a[2]+q[2])/2,fn:()=>{line([a,q],rgba('#122a30',b.alpha),9);line([a,q],rgba(b.formed?GOLD:'#c2d7d3',b.alpha*.9),b.formed?5:4)}})}
 for(const a of m.atoms){const q=points.get(a.id),r={Si:25,O:19,H:10}[a.element]*q[3];draw.push({z:q[2],fn:()=>sphere(q[0],q[1],r,{Si:GOLD,O:OXY,H:'#ffffff'}[a.element])})}
 draw.sort((a,b)=>a.z-b.z).forEach(o=>o.fn());return points;
}
function chemistryLegend(y=1510){for(const [x,name,col,r] of [[145,'규소 Si',GOLD,12],[470,'산소 O',OXY,12],[780,'수소 H','#ffffff',8]]){sphere(x,y,r,col);txt(name,x+25,y,25,INK)}}
function species(t,p){molecule(silicicAcid(),{scale:155,cy:1050,angle:.25+p*.55});txt('물속의 규산',540,540,37,INK,true,'center');txt('Si(OH)₄',540,610,43,GOLD,true,'center');txt('자유로운 규소 원자 하나가 떠다니는 모습이 아니에요',540,1420,26,INK,false,'center');chemistryLegend();txt('예: 중성에 가까운 물의 용존 성분 · 원자 크기 단순화',540,1570,22,MUTED,false,'center')}
function reaction(t,p){const m=condensation(p),pts=molecule(m,{scale:112,cy:1000,angle:.12});
 txt(p<.5?'표면의 OH와 규산이 만남':'산소 다리 + 물 분자',540,540,37,INK,true,'center');
 txt('기존 결정 표면',250,725,27,TEAL,true,'center');txt(p<.5?'용존 규산':'이어진 규소–산소 연결',780,725,26,GOLD,true,'center');
 if(m.reaction>.1){const w=pts.get('leavingO');txt('H₂O',w[0]+90,w[1],29,INK,true);txt('주변 물로',w[0]+90,w[1]+43,23,MUTED);}
 if(m.reaction>.9){const b=pts.get('bridgeO');glow(b[0],b[1],55,GOLD,.22);txt('Si–O–Si',285,1280,36,GOLD,true,'center');const event=E.find(e=>e.type==='condense'),dt=t-event.time;if(dt>=0&&dt<.6)glow(b[0],b[1],35+100*dt,GOLD,.55*(1-dt/.6))}
 chemistryLegend(1495);txt('대표적인 표면 축합 반응 · 남은 OH는 후속 반응에 참여',540,1560,22,MUTED,false,'center')}
function origins(t,p){
 const blend=smooth((p-.08)/.65);crystal(540,1060,190,.5+t*.025,1,.17,1-blend*.82);
 c.save();c.globalAlpha=blend;network(t,{scale:63,angle:.5+t*.025,cy:1050});c.restore();
 txt('겉모양에서 원자 배열로',540,550,30,GOLD,true,'center');legend();
}
function seed(t,p){
 dissolved(t,36);const q=smooth((p-.35)/.5);
 for(const [k,x,y] of [[0,250,850],[1,850,1180]]){const a=Math.max(0,Math.sin(p*6+k));for(let j=0;j<6;j++){let r=lerp(10,65,1-a),an=j*Math.PI/3;circle(x+Math.cos(an)*r,y+Math.sin(an)*r,7,rgba(TEAL,a*.6))}}
 const nucleus=new Set(growthOrder.slice(0,3).flat());glow(540,1040,170,TEAL,q*.2);network(t,{visible:nucleus,scale:lerp(25,58,q),cy:1050,angle:.5+t*.02});
 txt(p<.45?'작은 무리는 다시 흩어지기도 해요':'안정된 핵에서 성장 시작',540,575,36,INK,true,'center');txt('과포화: 녹여 둘 수 있는 양보다 성분이 많은 상태',540,1430,28,GOLD,false,'center');txt('핵 형성 과정 · 시간과 크기 단순화',540,1510,22,MUTED,false,'center');
}
function growing(t,p){
 const es=E.filter(e=>e.type==='attach'),done=es.filter(e=>e.time<=t),visible=new Set();for(const e of done)for(const i of growthOrder[e.tetra])visible.add(i);
 if(!visible.size)centerTetra.forEach(i=>visible.add(i));
 const angle=.43,scale=68,proj=network(t,{visible,scale,angle});
 for(const e of es){let dt=t-e.time;if(dt>-.7&&dt<.55){const a=growthOrder[e.tetra][0],pos=project(atomPos(a),angle,scale,540,1050,.2,20),q=smooth((dt+.7)/.7);if(dt<0){const x=lerp(pos[0]+(a%2?190:-190),pos[0],q),y=lerp(pos[1]-150,pos[1],q);sphere(x,y,10,GOLD,.7);circle(x+10,y+3,5,OXY)}else glow(pos[0],pos[1],55,TEAL,(1-dt/.55)*.45)}}
 txt('표면에 결합 → 같은 배열을 이어감',540,548,33,INK,true,'center');legend();txt('결합 사건을 소리로 표현 · 실제 원자 소리 아님',540,1570,21,MUTED,false,'center');
}
function tetra(t,p){const angle=.4+p*.6;network(t,{single:true,scale:150,angle,showTetra:true,cy:1060});txt('규소 1개 + 주변 산소 4개',540,540,35,GOLD,true,'center');txt('사면체',540,1420,42,INK,true,'center');legend(1505);txt('원자는 구로, 결합은 막대로 표현',540,1570,22,MUTED,false,'center')}
function latticeScene(t,p){network(t,{scale:lerp(70,65,smooth(p/.5)),angle:.5+p*.5,cy:1030});txt(p>.64?'결정의 핵심은 장거리 규칙성':'산소를 공유하는 연결망',540,545,35,INK,true,'center');if(p>.64)txt('결합이 있어도 불규칙한 배열이면 비정질',540,600,25,GOLD,false,'center');legend();txt('실제 석영 원자 좌표를 이용한 부분 구조',540,1570,22,MUTED,false,'center')}
function facets(t,p){
 const growth=lerp(.5,1,smooth(p)),a=.35+p*.35;crystal(540,1110,210,a,growth,.15);
 if(p>.32){c.save();c.globalAlpha=.35;crystal(540,1110,210,a,Math.max(.1,growth-.10),.15);c.restore()}
 txt('면마다 다른 성장 속도',540,545,35,INK,true,'center');line([[835,900],[714,960]],'#c6e7df66',1.5);txt('결정면',850,860,27,INK,false,'right');txt('육각기둥 · 끝의 여러 면',540,1490,33,GOLD,true,'center');txt('외형 단순화 · 실제 성장 시간은 압축',540,1560,22,MUTED,false,'center');
}
function compare(t,p){
 line([[540,600],[540,1450]],'#698b8b33',1);txt('성장할 공간이 충분',280,575,30,GOLD,true,'center');txt('서로 맞닿으며 성장',800,575,30,GOLD,true,'center');
 rock(270,1375,180,55);crystal(270,1110,120,.45,1,.18);
 const verts=[];for(let row=0;row<5;row++){verts.push([]);for(let col=0;col<4;col++)verts[row].push([650+col*105+(rand(row*9+col)-.5)*55,800+row*125+(rand(row*13+col+17)-.5)*65])}
 for(let row=0;row<4;row++)for(let col=0;col<3;col++){const a=verts[row][col],b=verts[row][col+1],d=verts[row+1][col],e=verts[row+1][col+1],light=.15+rand(row*3+col)*.3;poly([a,b,e,d],rgba(TEAL,light),'#badfda77',2);line([a,e],'#c9e8df22',1)}
 c.save();c.beginPath();c.arc(800,1190,105,0,Math.PI*2);c.clip();circle(800,1190,105,'#0d242be8');network(t,{visible:new Set(growthOrder.slice(0,3).flat()),scale:27,cx:800,cy:1190,angle:.5});c.restore();txt('내부 확대',800,1335,22,MUTED,false,'center');
 txt('뚜렷한 결정면',275,1505,29,INK,true,'center');txt('불규칙한 알갱이',805,1505,29,INK,true,'center');txt('겉모양이 달라도 내부에는 결정 질서가 있어요',540,1570,24,MUTED,false,'center');
}
const defs={hero:[1,'수정은 어떻게\n자랄까?','깎지 않아도 생기는 기하학'],origin:[2,'비밀은\n원자 배열에','눈에 보이는 모양보다 훨씬 작은 세계'],fluid:[3,'물속에서 시작된\n결정의 재료','여러 형성 경로 중 열수 성장을 따라갑니다'],seed:[4,'작은 씨앗이\n안정되는 순간','핵 형성 · NUCLEATION'],grow:[5,'한 번의 결합,\n다음 결합','기존 결정의 배열이 다음 성장을 이끕니다'],tetra:[6,'규소를 둘러싼\n네 개의 산소','석영 내부의 기본적인 연결 구조'],network:[7,'같은 규칙으로\n이어지는 질서','작은 사면체들이 삼차원으로 연결됩니다'],facets:[8,'안의 질서가\n밖의 모양으로','결정 구조와 성장 조건이 함께 만듭니다'],compare:[9,'모든 결정이\n뾰족한 건 아니에요','성장할 공간도 겉모양에 영향을 줍니다'],end:[10,'자연이 만드는\n규칙적인 모양','작은 원자의 결합에서 시작된 결정']};
defs.species=[0,'물에 녹아 있는\n분자의 모습','용액의 성분과 고체 결정은 다릅니다'];
defs.reaction=[0,'산소 하나가\n두 규소를 잇는 순간','원자의 수를 보존하며 결합이 바뀝니다'];
function frame(t){background(t);const {ch,p}=state(t);const [,title,sub]=defs[ch.id];header(chapters.indexOf(ch)+1,title,sub);if(ch.id==='hero')hero(t,p);else if(ch.id==='origin')origins(t,p);else if(ch.id==='fluid')fluid(t,p);else if(ch.id==='species')species(t,p);else if(ch.id==='reaction')reaction(t,p);else if(ch.id==='seed')seed(t,p);else if(ch.id==='grow')growing(t,p);else if(ch.id==='tetra')tetra(t,p);else if(ch.id==='network')latticeScene(t,p);else if(ch.id==='facets')facets(t,p);else if(ch.id==='compare')compare(t,p);else hero(t,p,true);footer(t)}
if(process.argv.includes('--video')){
 const sample=process.argv.includes('--sample'),start=sample?chapters.find(c=>c.id==='grow').start:0,len=sample?7:duration;
 const ff=spawn('ffmpeg',['-y','-v','warning','-f','rawvideo','-pix_fmt','rgba','-s',`${W}x${H}`,'-r',String(FPS),'-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-vf','scale=in_range=full:out_range=tv:out_color_matrix=bt709','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv','-movflags','+faststart',path.join(out,sample?'sample.mp4':'visual.mp4')],{stdio:['pipe','inherit','inherit']});let err;ff.stdin.on('error',e=>err=e);const ended=once(ff,'close');
 for(let i=0;i<Math.ceil(len*FPS);i++){if(err)throw err;frame(start+i/FPS);const a=c.getImageData(0,0,W,H).data;if(!ff.stdin.write(Buffer.from(a.buffer,a.byteOffset,a.byteLength)))await once(ff.stdin,'drain');if(i%(FPS*10)===0)console.log(`Rendered ${i/FPS} / ${len.toFixed(1)} seconds`)}ff.stdin.end();const [code]=await ended;if(code)throw Error(`ffmpeg ${code}`);
}else{for(const ch of chapters){frame(ch.start+(ch.end-ch.start)*.66);fs.writeFileSync(path.join(out,`${ch.id}.png`),C.toBuffer('image/png'))}fs.writeFileSync(path.join(out,'sound-events.json'),JSON.stringify({duration,events:E},null,2));console.log(`Rendered ${chapters.length} chapter previews.`)}
