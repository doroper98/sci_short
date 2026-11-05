import {createCanvas,loadImage,GlobalFonts} from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {sources,annual,series,sample,hour,phases,duration,fps,clamp,validate} from './model.mjs';
const base=path.dirname(fileURLToPath(import.meta.url)),out=path.resolve(base,'../../outputs/korea-power-day');
fs.mkdirSync(out,{recursive:true});
GlobalFonts.registerFromPath('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc','Korean');
GlobalFonts.registerFromPath('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc','KoreanBold');
const W=1080,H=1350,canvas=createCanvas(W,H),c=canvas.getContext('2d');
const atlas=await loadImage(path.join(base,'assets/power-atlas.png'));
const ac=createCanvas(atlas.width,atlas.height),ax=ac.getContext('2d');ax.drawImage(atlas,0,0);
const pixels=ax.getImageData(0,0,atlas.width,atlas.height).data;
const bounds=Array.from({length:12},(_,tile)=>{const x0=Math.round(tile%4*atlas.width/4),x1=Math.round((tile%4+1)*atlas.width/4),y0=Math.round(Math.floor(tile/4)*atlas.height/3),y1=Math.round((Math.floor(tile/4)+1)*atlas.height/3);let a=x1,b=y1,d=x0,e=y0;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(pixels[(y*atlas.width+x)*4+3]>24){a=Math.min(a,x);b=Math.min(b,y);d=Math.max(d,x);e=Math.max(e,y);}return [a,b,d-a+1,e-b+1];});
const INK='#122b40',MUTED='#637888',GREEN='#168878',BG='#f3f6f6';
function text(s,x,y,size=25,color=INK,bold=false,align='left',max=0){
 c.save();c.fillStyle=color;c.textAlign=align;c.textBaseline='middle';c.font=`${size}px ${bold?'KoreanBold':'Korean'}`;
 if(max)while(c.measureText(s).width>max&&size>16){size--;c.font=`${size}px ${bold?'KoreanBold':'Korean'}`;}
 c.fillText(s,x,y);c.restore();
}
function round(x,y,w,h,r=16,fill='white',stroke=null){c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke();}}
function line(points,color,width=1){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke();}
function circle(x,y,r,color){c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=color;c.fill();}
function glow(x,y,r,color){const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');circle(x,y,r,g);}
function sprite(tile,x,y,w,h,alpha=1){const [sx,sy,sw,sh]=bounds[tile],scale=Math.min(w/sw,h/sh),dw=sw*scale,dh=sh*scale;c.save();c.globalAlpha=alpha;c.drawImage(atlas,sx,sy,sw,sh,x+(w-dw)/2,y+(h-dh)/2,dw,dh);c.restore();}
function flow(points,color,p,t,reverse=false){
 if(p<.015){line(points,'#d9e2e5',1.4);return;}
 c.save();c.globalAlpha=.25;line(points,color,Math.min(4,1+p*.11));c.restore();
 const lens=points.slice(1).map((b,i)=>Math.hypot(b[0]-points[i][0],b[1]-points[i][1])),len=lens.reduce((a,b)=>a+b,0);
 for(let k=0;k<Math.ceil(len/49);k++){
  let d=((t*57+k*49)%len+len)%len;if(reverse)d=len-d;
  for(let i=0;i<lens.length;i++){if(d<=lens[i]){const a=points[i],b=points[i+1],q=d/lens[i];circle(a[0]+(b[0]-a[0])*q,a[1]+(b[1]-a[1])*q,2.3+Math.min(1.5,p*.045),color);break;}d-=lens[i];}
 }
}
function timeLabel(h){let m=Math.round(h*60);return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;}
function weather(h,t){
 const day=clamp(Math.sin((h-6)/12*Math.PI)),x=277,y=185;
 if(day>.05){glow(x,y,50,'#fbe9ab99');circle(x,y,19,'#edbb45');for(let j=0;j<8;j++){let a=j*Math.PI/4+t*.04;line([[x+Math.cos(a)*27,y+Math.sin(a)*27],[x+Math.cos(a)*35,y+Math.sin(a)*35]],'#e8bd59',2);}}
 else{circle(x,y,24,'#a9bbd0');circle(x+10,y-9,22,'#e7edf4');for(const [dx,dy] of [[-34,-22],[31,25],[38,-18]])circle(x+dx,y+dy,2,'#92a7bf');}
}
function plant(s,r,t,h){
 const x=s.side?710:40,y=284+s.row*164,w=330,ph=Math.min(7,Math.floor(h/3));
 const focus=[['nuclear','coal'],[],['gas'],['solar','wind'],['solar'],['hydro','gas'],['gas','hydro'],['oil','other_renewable']][ph].includes(s.id);
 c.save();c.shadowColor='#19344b0b';c.shadowBlur=15;c.shadowOffsetY=5;round(x,y,w,150,15,'#ffffff');c.restore();
 round(x,y,w,150,15,null,focus?s.color+'aa':'#dfe7e8');
 round(x+14,y+16,4,26,2,s.color);text(s.name,x+27,y+29,27,INK,true,'left',w-42);
 const value=r.power[s.id],normalized=value/(annual.generation[s.id]*1000/8760);
 glow(x+106,y+88,90,s.color+(focus?'20':'0c'));
 sprite(s.tile,x+10,y+40,181,80,s.id==='solar'&&value<.05?.42:1);
 text('GW · 예시',x+248,y+63,17,MUTED,false,'center');text(value.toFixed(1),x+248,y+91,35,s.color,true,'center');
 if(s.id==='wind'){
  const wx=x+304,wy=y+87;c.save();c.translate(wx,wy);c.rotate(t*(1.1+value));for(let k=0;k<3;k++){c.rotate(Math.PI*2/3);line([[0,0],[0,-10]],s.color,2.5);}circle(0,0,2.4,s.color);c.restore();
 }
 text(s.process,x+16,y+132,18,MUTED,false,'left',w-32);
 const length=296*clamp(normalized/1.8);round(x+17,y+146,296,2,1,'#edf0f1');round(x+17,y+146,Math.max(2,length),2,1,s.color);
 if(value>.03)circle(x+17+(t*36%(Math.max(10,length))),y+147,3,s.color);
}
function storage(kind,r,t){
 const pump=kind==='pump',x=425,y=pump?702:814,w=230,h=101,tile=pump?8:9;
 const charge=pump?r.pumpCharge:r.essCharge,discharge=pump?r.pumpDischarge:r.essDischarge,soc=pump?r.pumpSoc:r.essSoc;
 const active=charge>.03||discharge>.03,color=charge>.03?'#3d9d91':discharge>.03?'#bd8650':'#8799a4';
 round(x,y,w,h,13,'#ffffffd9',active?color+'66':'#dce5e6');sprite(tile,x-2,y+8,95,79);
 text(pump?'양수':'ESS',x+105,y+23,25,INK,true);text(charge>.03?`충전 ${charge.toFixed(1)} GW`:discharge>.03?`방전 ${discharge.toFixed(1)} GW`:'대기',x+105,y+52,17,color,true);
 round(x+104,y+73,105,8,4,'#e1e9e8');round(x+104,y+73,Math.max(2,105*soc),8,4,color);text(`${Math.round(soc*100)}%`,x+218,y+88,14,MUTED,false,'right');
 if(pump)flow([[540,658],[403,658],[403,752],[425,752]],color,Math.max(charge,discharge)*4,t,discharge>charge);
 else flow([[540,658],[677,658],[677,864],[655,864]],color,Math.max(charge,discharge)*4,t,discharge>charge);
}
function graph(h,r,t){
 const gx=77,gy=1090,gw=962,gh=126,max=100,yy=v=>gy+gh-v/max*gh;
 for(const v of [0,50,100]){line([[gx,yy(v)],[gx+gw,yy(v)]],'#dbe4e6',1);text(String(v),gx-12,yy(v),15,MUTED,false,'right');}
 text('GW',gx-10,gy-20,15,MUTED,false,'right');
 const stop=Math.floor(h/24*(series.length-1));
 let floors=new Array(stop+1).fill(0);
 for(const s of sources){
  c.beginPath();for(let i=0;i<=stop;i++){const x=gx+series[i].h/24*gw,y=yy(floors[i]+series[i].power[s.id]);i?c.lineTo(x,y):c.moveTo(x,y);}
  for(let i=stop;i>=0;i--)c.lineTo(gx+series[i].h/24*gw,yy(floors[i]));c.closePath();c.fillStyle=s.color;c.globalAlpha=.83;c.fill();c.globalAlpha=1;
  for(let i=0;i<=stop;i++)floors[i]+=series[i].power[s.id];
 }
 const pts=series.filter((_,i)=>i<=stop&&i%3===0).map(d=>[gx+d.h/24*gw,yy(d.demand)]);if(pts.length>1)line(pts,INK,2.4);
 const x=gx+h/24*gw;line([[x,gy-3],[x,gy+gh+4]],'#203c52',1.2);circle(x,yy(r.demand),4,INK);
 for(const v of [0,6,12,18,24])text(String(v).padStart(2,'0'),gx+v/24*gw,gy+gh+17,16,MUTED,false,'center');
 const note=t>=77?'하루 전체 · 설명용 출력 곡선':'시간에 따라 쌓이는 발전원별 출력';text(note,gx+4,gy-19,18,MUTED);line([[790,gy-19],[817,gy-19]],INK,2);text('소비 수요',825,gy-19,17,INK);
}
function header(t,h){
 text('대한민국 전기의 하루',42,55,49,INK,true);text('KOREA / 24 HOURS',1038,48,18,GREEN,true,'right');
 text('2025 연간 구성 참고  ·  시간대 출력은 설명용 모형',45,103,24,MUTED);
 round(40,140,1000,112,19,'#e7edf4');
 text(timeLabel(h),60,183,67,INK,true);text('KST · 한국 시간',63,230,17,MUTED);weather(h,t);
 let ph=phases[Math.min(7,Math.floor(h/3))];
 if(t<5)ph=['24시간, 전기를 만드는 연결','발전원과 저장장치의 역할을 함께 봅니다.'];
 if(t>=77&&t<83)ph=['작은 비중에도 다양한 발전 방식','통계 분류와 실제 발전 기술은 다를 수 있습니다.'];
 if(t>=83)ph=['하루 내내, 공급과 수요의 균형','발전 · 송전 · 소비 · 저장이 함께 움직입니다.'];
 text(ph[0],326,180,32,INK,true,'left',685);text(ph[1],327,221,22,MUTED,false,'left',680);
}
function technicalDetails(t){
 round(40,1030,1000,204,18,'#eef3f3','#c9dcd8');
 text('추가로 알아둘 국내 발전 방식',64,1060,26,INK,true);
 const details=[['바이오·폐기물','연소 열 → 증기 → 발전기','#80a65c'],['연료전지','수소·산소 반응 → 전기','#4f9eab'],['조력','조수의 높이 차 → 터빈','#499bd0']];
 for(let i=0;i<3;i++){
  let x=64+i*329;round(x,1090,300,119,12,'white');circle(x+22,1115,7,details[i][2]);text(details[i][0],x+39,1115,25,INK,true);
  text(details[i][1],x+15,1152,18,MUTED,false,'left',275);flow([[x+18,1181],[x+280,1181]],details[i][2],8,t+i);
 }
}
function render(t){
 canvas.width=W;
 const h=hour(t),r=sample(h),day=clamp(Math.sin((h-6)/12*Math.PI));
 c.fillStyle=BG;c.fillRect(0,0,W,H);
 const sky=c.createLinearGradient(0,240,0,950);sky.addColorStop(0,day>.05?'#fff4d929':'#cadbef55');sky.addColorStop(1,'#f3f6f600');c.fillStyle=sky;c.fillRect(0,252,W,690);
 header(t,h);
 for(const s of sources){const y=284+s.row*164+78;flow(s.side?[[710,y],[677,y],[677,650],[540,650]]:[[370,y],[403,y],[403,650],[540,650]],s.color,r.power[s.id],t+s.row*.3);}
 glow(540,476,165,day>.05?'#e3ca7b22':'#7ba7d329');
 text('전력망',540,311,32,INK,true,'center');text('생산 → 송전 → 소비',540,346,18,MUTED,false,'center');
 sprite(10,405,368,270,189);
 // Light reaching the city represents consumption, not literal electron travel.
 flow([[540,651],[540,556]],GREEN,r.demand/3,t);
 round(436,561,208,75,13,'#f3f6f6ed');text('소비 수요 · 예시',540,579,18,MUTED,false,'center');text(`${r.demand.toFixed(1)} GW`,540,612,35,INK,true,'center');
 circle(540,651,15,'#d6eae5');circle(540,651,6,GREEN);text('전력의 흐름',540,680,16,MUTED,false,'center');
 for(const s of sources)plant(s,r,t,h);
 storage('pump',r,t);storage('ess',r,t);text('저장 용량·운전 모두 예시',540,929,16,MUTED,false,'center');
 const columns=[[59,'총 발전',`${r.generation.toFixed(1)} GW`],[396,'저장',r.charge>.02?`충전 ${r.charge.toFixed(1)} GW`:r.discharge>.02?`방전 ${r.discharge.toFixed(1)} GW`:'대기'],[747,'소비 수요',`${r.demand.toFixed(1)} GW`]];
 round(40,953,1000,72,14,INK);
 for(const [x,l,v] of columns){text(l,x,974,17,'#adbdc7');text(v,x,1003,27,'white',true);}text('예시값',1020,978,16,'#adbdc7',false,'right');
 sources.forEach((s,i)=>{const x=55+i*126;circle(x,1047,4.5,s.color);text(s.id==='other_renewable'?'기타재생':s.id==='nuclear'?'원자력':s.id==='gas'?'가스':s.name,x+11,1047,16,MUTED,false,'left',111);});
 graph(h,r,t);
 let ph=phases[Math.min(7,Math.floor(h/3))],cap=[ph[2],ph[3]];
 if(t<5)cap=['발전소에서 만든 전기가 전력망을 지나 도시로 갑니다.','한국의 발전 구성을 바탕으로 만든 하루 설명 모형입니다.'];
 if(t>=77&&t<83){technicalDetails(t);cap=['연료전지는 터빈 대신 전기화학 반응을 이용합니다.','조력은 밀물과 썰물의 높이 차를 활용합니다.'];}
 if(t>=83)cap=[`2025년 연간 발전량 ${annual.total.toFixed(2)} TWh · 원자력 ${(annual.generation.nuclear/annual.total*100).toFixed(1)}% · 석탄 ${(annual.generation.coal/annual.total*100).toFixed(1)}%`,`가스 ${(annual.generation.gas/annual.total*100).toFixed(1)}% · 태양광 ${(annual.generation.solar/annual.total*100).toFixed(1)}% · 나머지 ${(100-(annual.generation.nuclear+annual.generation.coal+annual.generation.gas+annual.generation.solar)/annual.total*100).toFixed(1)}%`];
 text(cap[0],540,1265,25,INK,true,'center',1000);text(cap[1],540,1300,23,MUTED,false,'center',1000);
 text('연간 통계: OWID / Ember 등  ·  실측 하루 아님  ·  송전손실 제외',540,1334,16,MUTED,false,'center');
 round(40,1346,1000*clamp(t/duration),3,1,GREEN);
 if(t<.65){c.fillStyle=`rgba(243,246,246,${1-t/.65})`;c.fillRect(0,0,W,H);}
 return canvas;
}
const validation=validate();fs.writeFileSync(path.join(out,'model-validation.json'),JSON.stringify(validation,null,2));
fs.writeFileSync(path.join(out,'hourly-model.json'),JSON.stringify(Array.from({length:25},(_,h)=>sample(h)),null,2));
if(!process.argv.includes('--video')){
 for(const [name,t] of [['night',9],['morning',27],['noon',44],['evening',63],['methods',80],['summary',87]]){render(t);fs.writeFileSync(path.join(out,`${name}.png`),canvas.toBuffer('image/png'));}
 console.log('Six review frames created.',validation.status);
}else{
 const ff=spawn('ffmpeg',['-hide_banner','-loglevel','warning','-y','-f','image2pipe','-vcodec','mjpeg','-framerate',String(fps),'-i','pipe:0','-vf','scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p','-an','-c:v','libx264','-preset','fast','-crf','19','-threads','3','-r',String(fps),'-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-movflags','+faststart',path.join(out,'picture.mp4')],{stdio:['pipe','inherit','inherit']});
 const start=Date.now();
 for(let i=0;i<duration*fps;i++){render(i/fps);if(!ff.stdin.write(canvas.toBuffer('image/jpeg',92)))await once(ff.stdin,'drain');if(i%300===0)console.log(`${i}/${duration*fps} frames, ${((Date.now()-start)/1000).toFixed(1)}s elapsed`);}
 ff.stdin.end();const [code]=await once(ff,'exit');if(code!==0)throw Error(`ffmpeg exited ${code}`);console.log('Rendered picture.mp4');
}
