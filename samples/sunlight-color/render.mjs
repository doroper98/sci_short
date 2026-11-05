import {createCanvas,GlobalFonts,loadImage} from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {base,out,bands,clamp,lerp,smooth,timeline,duration,chapters,state,events,transmission} from './model.mjs';

fs.mkdirSync(out,{recursive:true});
GlobalFonts.registerFromPath('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','Sans');
GlobalFonts.registerFromPath('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf','Bold');
GlobalFonts.registerFromPath('/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf','Serif');
const W=1080,H=1920,FPS=30,canvas=createCanvas(W,H),c=canvas.getContext('2d');
const WHITE='#f3f5f5',MUTED='#a3b5c9',BLUE='#69b3ff',RED='#ff8068',GOLD='#f2d8aa';
const ev=events();
function rgba(hex,a=1){let h=hex.replace('#','');return `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${clamp(a)})`}
function txt(s,x,y,size=30,color=WHITE,font='Sans',align='left'){c.fillStyle=color;c.font=`${size}px ${font}`;c.textAlign=align;c.textBaseline='middle';c.fillText(s,x,y)}
function line(pts,col,width=1){c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=col;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke()}
function circle(x,y,r,col){if(r<=0)return;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=col;c.fill()}
function glow(x,y,r,col,a=1){const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,rgba(col,a));g.addColorStop(.18,rgba(col,a*.52));g.addColorStop(1,rgba(col,0));circle(x,y,r,g)}
function sphere(x,y,r,color,alpha=1){c.save();c.globalAlpha=alpha;const g=c.createRadialGradient(x-r*.35,y-r*.4,r*.03,x,y,r);g.addColorStop(0,'#e1f4ff');g.addColorStop(.2,color);g.addColorStop(.68,color);g.addColorStop(1,'#091529');circle(x,y,r,g);c.restore()}
function ring(x,y,r,col,w=1){c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.strokeStyle=col;c.lineWidth=w;c.stroke()}
function label(s,x,y,color=MUTED,align='left',size=24){txt(s,x,y,size,color,'Sans',align)}
function wrap(s,size,maxw){c.font=`${size}px Sans`;const arr=[],words=s.split(' ');let ln='';for(const w of words){if(c.measureText(ln+' '+w).width>maxw&&ln){arr.push(ln);ln=w}else ln+=(ln?' ':'')+w}if(ln)arr.push(ln);return arr}
function arrow(a,b,color,width=2){line([a,b],color,width);const theta=Math.atan2(b[1]-a[1],b[0]-a[0]);line([[b[0]-14*Math.cos(theta-.5),b[1]-14*Math.sin(theta-.5)],b,[b[0]-14*Math.cos(theta+.5),b[1]-14*Math.sin(theta+.5)]],color,width)}
function seed(i){return (Math.sin(i*127.1+91.31)*43758.5453)%1+1}
function rnd(i){return seed(i)%1}
function wave(pts,col,t,wavelength=45,amp=8,width=2,alpha=1){
 const path=[];let offset=0;
 for(let j=0;j<pts.length-1;j++){
  const a=pts[j],b=pts[j+1],dx=b[0]-a[0],dy=b[1]-a[1],d=Math.hypot(dx,dy),nx=-dy/d,ny=dx/d;
  for(let u=0;u<=d;u+=4){const off=Math.sin((offset+u-t*100)/wavelength*Math.PI*2)*amp;path.push([a[0]+dx*u/d+nx*off,a[1]+dy*u/d+ny*off])}
  offset+=d;
 }line(path,rgba(col,alpha),width)
}
function traveling(a,b,t,col,count=5,alpha=1,size=4){
 const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
 for(let k=0;k<count;k++){let q=(t*150/len+k/count)%1;const x=a[0]+q*dx,y=a[1]+q*dy;line([[x-dx/len*18,y-dy/len*18],[x,y]],rgba(col,alpha*.6),size);circle(x,y,size,rgba(col,alpha))}
}
const stars=Array.from({length:95},(_,i)=>({x:rnd(i+1)*W,y:260+rnd(i+300)*1250,r:.6+rnd(i+600)*1.4}));
const globe=await loadImage(path.join(base,'assets/globe.png'));

function bg(t){
 const g=c.createLinearGradient(0,0,700,H);g.addColorStop(0,'#101c30');g.addColorStop(.45,'#07111f');g.addColorStop(1,'#050b13');c.fillStyle=g;c.fillRect(0,0,W,H);
 for(const s of stars)circle(s.x+Math.sin(t*.02)*5,s.y,s.r,rgba('#b7d6ef',.12+.12*Math.sin(t*.3+s.x)));
 glow(940,800,620,BLUE,.035);
}
function header(kicker,title,sub=''){
 txt(kicker,70,94,22,GOLD,'Bold');line([[70,126],[1010,126]],'#425167',1);
 const lines=title.split('\n');lines.forEach((v,i)=>txt(v,66,213+i*81,70,WHITE,'Bold'));
 if(sub)txt(sub,70,235+lines.length*81,25,MUTED);
}
function footer(t){
 const active=timeline.segments.find(s=>t>=s.start&&t<s.end+.12);
 const grd=c.createLinearGradient(0,1540,0,H);grd.addColorStop(0,'#070e1800');grd.addColorStop(.35,'#070e18ee');grd.addColorStop(1,'#070e18');c.fillStyle=grd;c.fillRect(0,1540,W,380);
 if(active){
  const lines=wrap(active.text,41,920);const yy=1715-(lines.length-1)*29;
  lines.forEach((s,i)=>txt(s,540,yy+i*58,41,WHITE,'Sans','center'));
 }
 line([[70,1848],[1010,1848]],'#28374a',2);line([[70,1848],[70+940*clamp(t/duration),1848]],GOLD,3);
 txt('SCI / LIGHT & ATMOSPHERE',70,1883,17,MUTED);
 txt('ONE SUN. TWO COLORS.',1010,1883,17,MUTED,'Sans','right');
}
function sun(x,y,r,rgb){
 const col='#'+rgb.map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('');
 glow(x,y,r*5,col,.25);glow(x,y,r*2,col,.35);
 const g=c.createRadialGradient(x-r*.2,y-r*.3,0,x,y,r);g.addColorStop(0,'#fff8e9');g.addColorStop(.4,col);g.addColorStop(1,col);circle(x,y,r,g);
}
function landscape(t,st,closing=false){
 const q=smooth((65-st.elevation)/63),top=420,bottom=1455,horizon=1160;
 c.save();c.beginPath();c.roundRect(45,top,990,bottom-top,28);c.clip();
 const mix=(a,b)=>a.map((x,i)=>Math.round(lerp(x,b[i],q)));
 const cs=a=>`rgb(${a.join(',')})`;
 const g=c.createLinearGradient(0,top,0,horizon+180);
 g.addColorStop(0,cs(mix([32,87,140],[22,29,61])));
 g.addColorStop(.65,cs(mix([103,170,205],[158,76,76])));
 g.addColorStop(1,cs(mix([199,220,223],[255,172,102])));c.fillStyle=g;c.fillRect(45,top,990,1100);
 const sx=lerp(645,780,q),sy=lerp(625,1120,q);sun(sx,sy,lerp(46,52,q),st.rgb);
 // Atmosphere haze and mountains occupy successive depth planes.
 for(let layer=0;layer<4;layer++){
  const pts=[[30,1600]];for(let x=30;x<1060;x+=8){const yy=1180+layer*58-55*Math.sin(x*.006+layer*.6)-24*Math.sin(x*.019+layer*.9);pts.push([x,yy])}pts.push([1060,1600]);
  c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=['#455e71','#304657','#223342','#152732'][layer];c.fill();
 }
 // Reflections drift on foreground water; never suggest that the Sun itself changed.
 const water=c.createLinearGradient(0,1320,0,1500);water.addColorStop(0,'#294956');water.addColorStop(1,'#101c29');c.fillStyle=water;c.fillRect(45,1355,990,150);
 for(let k=0;k<55;k++){const y=1360+k*2.1,x=sx+Math.sin(k*2.4+t*.4)*22,w=10+k*.8;line([[x-w,y],[x+w,y]],rgba(q>.5?'#e8a179':'#99c2d7',.13),1.3)}
 c.restore();
 txt(closing?'THE JOURNEY CHANGES THE MIX':q<.5?'HIGH SUN':'LOW SUN',84,490,24,WHITE,'Bold');
 txt(closing?'One star. Different paths.':q<.5?'A nearly white disk':'An orange-red disk',84,535,25,'#d8e3ed');
 if(!closing){label('SIMULATED VIEW  /  COLORS ARE ILLUSTRATIVE',70,1501,MUTED,'left',19)}
}
function spectrum(t,st){
 const ys=bands.map((_,i)=>645+i*119),split=clamp(st.p*2.4);
 glow(180,980,150,'#ffffff',.14);
 sun(150,980,40,[255,249,235]);
 line([[210,980],[350,980]],'#ffffffaa',14);traveling([210,980],[350,980],t,'#ffffff',3,1,5);
 for(let i=0;i<bands.length;i++){
  const b=bands[i],y=lerp(980,ys[i],smooth(split));
  const pts=[[350,980],[565,y],[850,y]];
  line(pts,rgba(b.color,.2),14);wave(pts,b.color,t,lerp(72,35,i/5),8,2.8,.95);
  traveling([565,y],[850,y],t+i*.2,b.color,3,.9,4);
  txt(b.name,900,y-12,22,b.color,'Bold');
  txt(`${b.nm} nm`,900,y+20,20,MUTED);
 }
 txt('A MIXTURE OF WAVELENGTHS',70,465,25,GOLD,'Bold');
 label('Colors separated here for explanation.',70,1467);
 label('They travel together in sunlight.',70,1507);
}
const molecules=Array.from({length:31},(_,i)=>({x:130+rnd(i+40)*820,y:620+rnd(i+500)*650,z:rnd(i+1000),a:rnd(i)*6.28}));
function scattering(t,st){
 // Perspective slab, front/back molecules and ray paths share the same visual volume.
 const drift=Math.sin(t*.1)*16;
 const back=[[175+drift,590],[900+drift,680],[900+drift,1225],[175+drift,1135]];
 const front=[[95,700],[820,790],[820,1335],[95,1245]];
 c.beginPath();[...back,back[0]].forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.fillStyle='#335d8910';c.fill();line([...back,back[0]],'#52739930',1);
 for(let i=0;i<4;i++)line([back[i],front[i]],'#52739925',1);
 const drawM=(m,i)=>{
  const x=m.x+Math.sin(t*.35+m.a)*7,y=m.y+Math.cos(t*.28+m.a)*7,r=7+m.z*7;
  line([[x-r*.6,y-r*.2],[x+r*.7,y+r*.2]],rgba('#9cb9cf',.12+m.z*.3),5);
  sphere(x-r*.65,y-r*.3,r,'#42627a',.18+m.z*.5);sphere(x+r*.65,y+r*.3,r*.82,'#536e87',.18+m.z*.5);
 };
 molecules.filter(m=>m.z<.5).forEach(drawM);
 const origin=[100,890],hit=[460,890],target=[955,605];
 wave([origin,hit],BLUE,t,39,11,3.5);
 wave([hit,target],BLUE,t,39,11,3.2,.9);
 traveling(origin,hit,t,BLUE,3,.9,4);traveling(hit,target,t,BLUE,4,.9,4);
 // A minority forward component remains; red also scatters weakly.
 line([hit,[960,890]],rgba(BLUE,.12),2);
 wave([[100,1130],[970,1130]],RED,t,55,11,3.5,.95);traveling([100,1130],[970,1130],t,RED,6,1,4);
 line([[630,1130],[880,1310]],rgba(RED,.19),2);
 for(const event of ev.filter(e=>e.scene===st.ch.id)){
  const dt=t-event.time;if(dt>=0&&dt<1.25){
   const pos=event.band===4?hit:[630,1130],b=bands[event.band];
   glow(pos[0],pos[1],45+dt*70,b.color,(1-dt/1.25)*.5);ring(pos[0],pos[1],12+dt*55,rgba(b.color,(1-dt/1.25)*.7),1.4);
  }
 }
 sphere(hit[0],hit[1],23,'#7b9fbc');sphere(hit[0]+22,hit[1]+12,18,'#5f7f9b');
 molecules.filter(m=>m.z>=.5).forEach(drawM);
 txt('BLUE / SHORTER WAVELENGTH',90,527,23,BLUE,'Bold');
 arrow([420,610],[457,852],'#9db3cc',1.4);label('Air molecule',395,584,WHITE,'center');
 txt('MORE REDIRECTED',778,550,22,BLUE,'Bold','center');
 txt('RED / LONGER WAVELENGTH',90,1420,23,RED,'Bold');
 label('More remains in the direct beam',90,1462);
 if(st.p>.52)txt('Rayleigh scattering',70,1537,35,WHITE,'Serif');
 label('SCHEMATIC  /  SIZES & MOTION SLOWED',70,1600,MUTED,'left',18);
}
function earth(t,st){
 const cx=475,cy=1075,r=330,ar=412,obs=[cx,cy-r];
 const atmosphere=c.createRadialGradient(cx,cy,r*.97,cx,cy,ar);
 atmosphere.addColorStop(0,'#5cbbff65');atmosphere.addColorStop(.12,'#459fe45a');atmosphere.addColorStop(.5,'#3b85cd26');atmosphere.addColorStop(1,'#518ce500');circle(cx,cy,ar,atmosphere);
 ring(cx,cy,ar-9,'#6fb5ef28',1);
 c.drawImage(globe,cx-r,cy-r,r*2,r*2);
 // Orbital mesh supports depth without implying literal atmospheric layers.
 c.save();c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.clip();
 for(let j=-2;j<=2;j++){c.beginPath();c.ellipse(cx,cy+j*85,r*Math.sqrt(1-(j*.23)**2),38,0,0,Math.PI*2);c.strokeStyle='#91c9ed12';c.lineWidth=1;c.stroke()}
 c.restore();
 const h=st.elevation*Math.PI/180,dir=[Math.cos(h),-Math.sin(h)];
 // Intersection of illustrative expanded atmospheric shell with observer's ray.
 // Observer is at the top of the sphere; solve |(0,-r)+s*d|=ar.
 const s=-r*Math.sin(h)+Math.sqrt(ar*ar-r*r*Math.cos(h)**2);
 const entry=[obs[0]+s*dir[0],obs[1]+s*dir[1]];
 const sourceDistance=Math.min(560,(990-obs[0])/dir[0],(obs[1]-450)/Math.sin(h));
 const source=[obs[0]+sourceDistance*dir[0],obs[1]+sourceDistance*dir[1]];
 const [sx,sy]=source;
 sun(sx,sy,29,[255,248,233]);
 line([[sx,sy],entry],'#fff4db55',8);traveling([sx,sy],entry,t,'#fff4e6',4,.8,3);
 const rgb='#'+st.rgb.map(v=>v.toString(16).padStart(2,'0')).join('');
 const beam=c.createLinearGradient(...entry,...obs);
 for(let i=0;i<=4;i++){const q=i/4,vals=[650,550,460].map(n=>transmission(n,st.elevation)**q),max=Math.max(...vals);beam.addColorStop(q,`rgb(${vals.map(v=>Math.round(255*(v/max)**(1/2.2))).join(',')})`)}
 line([entry,obs],'#eff2e82b',17);line([entry,obs],beam,5);traveling(entry,obs,t,rgb,4,.9,3);
 // Scattering branches along the route, strongest at low elevation.
 for(let i=1;i<7;i++){
  const q=i/8,x=lerp(entry[0],obs[0],q),y=lerp(entry[1],obs[1],q);
  const end=[x+25*Math.cos(i*2),y-50-i*6];const a=clamp(st.mass/16,.2,.8);
  line([[x,y],end],rgba(BLUE,a*.4),1.5);traveling([x,y],end,t+i*.3,BLUE,2,a,2.3);
 }
 // Observer is visibly attached to the same surface point throughout.
 glow(obs[0],obs[1],32,'#fff1c4',.25);circle(obs[0],obs[1]-16,6,WHITE);
 line([[obs[0],obs[1]-9],[obs[0],obs[1]+8]],WHITE,3);
 line([[obs[0]-8,obs[1]+12],[obs[0],obs[1]+4],[obs[0]+8,obs[1]+12]],WHITE,3);
 label('OBSERVER',obs[0]-25,obs[1]-44,WHITE,'right',19);
 if(st.ch.id==='sky'){
  for(let k=0;k<4;k++){
   const from=[cx-220+k*130,cy-r-70-Math.sin(k)*70];
   line([from,obs],rgba(BLUE,.35),2);traveling(from,obs,t+k*.3,BLUE,3,.85,3);
  }
  label('Scattered light from the sky',540,490,BLUE,'center',30);
 }else{
  txt(st.elevation>30?'SHORT PATH':'LONG PATH',70,484,28,st.elevation>30?BLUE:RED,'Bold');
  txt(`${st.elevation.toFixed(0)}°`,990,489,66,WHITE,'Sans','right');
  label('SUN ELEVATION',990,541,MUTED,'right',18);
  label('Atmosphere',930,969,BLUE,'right');line([[925,998],[870,1018]],'#7aaacf55',1);
 }
 txt('DIRECT LIGHT REACHING THE OBSERVER',70,1452,23,GOLD,'Bold');
 spectrumBars(st,70,1495,940,88);
 label('Atmosphere enlarged. Colors illustrative.',70,1625,MUTED,'left',18);
}
function spectrumBars(st,x,y,w,h){
 const bw=(w-5*16)/6;
 bands.forEach((b,i)=>{
  c.fillStyle='#243246';c.fillRect(x+i*(bw+16),y,bw,h);
  const a=st.trans[i],hh=h*a;c.fillStyle=b.color;c.fillRect(x+i*(bw+16),y+h-hh,bw,hh);
  txt(b.name,x+i*(bw+16)+bw/2,y+h+24,16,MUTED,'Bold','center');
 });
}
function listening(t,st){
 const high=st.elevation>30;
 const ch=ev.filter(e=>e.type==='chord').find(e=>t>=e.time&&t<e.time+e.duration);
 const pulse=ch?Math.sin(clamp((t-ch.time)/ch.duration)*Math.PI):0;
 txt('A SOUND MODEL OF THE COLOR MIX',70,466,23,GOLD,'Bold');
 txt(high?'SHORT PATH':'LONG PATH',540,591,45,high?BLUE:RED,'Bold','center');
 const centerY=1000;
 bands.forEach((b,i)=>{
  const x=135+i*162,a=st.trans[i],r=19+37*a;
  line([[x,760],[x,1305]],'#314057',1);
  glow(x,centerY,r*3,b.color,.12+pulse*a*.28);
  sphere(x,centerY,r,b.color,.2+.8*a);
  for(let k=0;k<3;k++)ring(x,centerY,r+18+k*19+pulse*15,rgba(b.color,(.08+pulse*.14)*a),1);
  txt(b.name,x,1373,18,b.color,'Bold','center');
  // Amplitude follows the same attenuation used for the audio chord.
  const pts=[];for(let xx=-58;xx<=58;xx+=3)pts.push([x+xx,1190+Math.sin(xx*.15-t*7)*a*(14+14*pulse)]);
  line(pts,b.color,2);
 });
 label(high?'A fuller mixture reaches you.':'The blue component becomes much weaker.',540,1460,WHITE,'center',30);
 label('Tones represent colors. Light is not audible.',540,1530,MUTED,'center',23);
}
function conclusion(t,st){
 landscape(t,st,true);
 txt('LONGER PATH',70,1530,28,GOLD,'Bold');txt('LESS BLUE IN DIRECT LIGHT',70,1576,28,WHITE,'Bold');
}
const titles={
 opening:['01 / THE QUESTION','One Sun.\nTwo colors.','Why does sunset look red?'],
 spectrum:['02 / INSIDE SUNLIGHT','White is a mixture.','Follow the colors through the air.'],
 scatter:['03 / A MOLECULAR DETOUR','Blue scatters\nmore strongly.','Same light. A new direction.'],
 sky:['04 / TWO WAYS TO SEE LIGHT','Blue sky.\nDirect sunlight.','Where does the scattered light go?'],
 high:['05 / HIGH IN THE SKY','A shorter journey.','Much of the color mixture remains.'],
 low:['06 / TOWARD THE HORIZON','More air.\nA warmer mix.','Watch the path grow.'],
 listen:['07 / HEAR THE DIFFERENCE','A changing mixture.','Color represented with sound.'],
 conclusion:['08 / THE ANSWER','Same Sun.\nDifferent journey.','The atmosphere changes what reaches us.']
};
function frame(t){
 bg(t);const st=state(t),[kick,title,sub]=titles[st.ch.id];header(kick,title,sub);
 c.save();
 // Short fade on incoming visual content; captions retain their own timing.
 c.globalAlpha=st.ch.start===0?1:lerp(.15,1,smooth((t-st.ch.start)/.5));
 if(st.ch.id==='opening')landscape(t,st);
 else if(st.ch.id==='spectrum')spectrum(t,st);
 else if(st.ch.id==='scatter')scattering(t,st);
 else if(['sky','high','low'].includes(st.ch.id))earth(t,st);
 else if(st.ch.id==='listen')listening(t,st);
 else conclusion(t,st);
 c.restore();footer(t);
}
if(process.argv.includes('--video')){
 const preview=process.argv.includes('--sample'),start=preview?chapters.find(x=>x.id==='low').start:0;
 const length=preview?7:duration;
 const filename=preview?'visual-sample.mp4':'visual.mp4';
 const ff=spawn('ffmpeg',['-y','-v','warning','-f','rawvideo','-pix_fmt','rgba','-s',`${W}x${H}`,'-r',String(FPS),'-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-vf','scale=in_range=full:out_range=tv:out_color_matrix=bt709','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv','-movflags','+faststart',path.join(out,filename)],{stdio:['pipe','inherit','inherit']});
 let err;ff.stdin.on('error',e=>{err=e});const finished=once(ff,'close');
 for(let i=0;i<Math.ceil(length*FPS);i++){
  if(err)throw err;frame(start+i/FPS);
  const pixels=c.getImageData(0,0,W,H).data;
  if(!ff.stdin.write(Buffer.from(pixels.buffer,pixels.byteOffset,pixels.byteLength)))await once(ff.stdin,'drain');
  if(i%(FPS*10)===0)console.log(`Rendered ${(i/FPS).toFixed(0)} / ${length.toFixed(1)} seconds`);
 }
 ff.stdin.end();const [code]=await finished;if(code!==0)throw Error(`ffmpeg exit ${code}`);
 console.log(path.join(out,filename));
}else{
 for(const ch of chapters){const t=ch.start+(ch.end-ch.start)*.64;frame(t);fs.writeFileSync(path.join(out,`${ch.id}.png`),canvas.toBuffer('image/png'));}
 fs.writeFileSync(path.join(out,'sound-events.json'),JSON.stringify({duration,events:ev},null,2));
 console.log(`Wrote ${chapters.length} preview frames.`);
}
