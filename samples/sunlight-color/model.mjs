import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const base=path.dirname(fileURLToPath(import.meta.url));
export const out=path.resolve(base,'../../outputs/sunlight-color');
export const script=JSON.parse(fs.readFileSync(path.join(base,'script.json'),'utf8'));
export const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export const lerp=(a,b,q)=>a+(b-a)*q;
export const smooth=q=>{q=clamp(q);return q*q*(3-2*q)};
export const bands=[
 {name:'RED',nm:650,color:'#ff715e',note:220},
 {name:'ORANGE',nm:610,color:'#ffad62',note:277.18},
 {name:'YELLOW',nm:580,color:'#ffe995',note:329.63},
 {name:'GREEN',nm:530,color:'#7de7b6',note:440},
 {name:'BLUE',nm:460,color:'#63aeff',note:554.37},
 {name:'VIOLET',nm:420,color:'#ae91ff',note:659.25}
];
// Kasten & Young (1989) relative optical air mass, apparent elevation in degrees.
// Molecular attenuation only. Not a full atmosphere or colorimetric Sun simulation.
export function airMass(h){return 1/(Math.sin(h*Math.PI/180)+.50572*(h+6.07995)**-1.6364)}
export function transmission(nm,h){return Math.exp(-.1*(550/nm)**4*airMass(h))}
export function sunRGB(h){
 const v=[650,550,460].map(n=>transmission(n,h)); const m=Math.max(...v);
 return v.map(x=>Math.round(255*(x/m)**(1/2.2)));
}
export function getTimeline(){
 const p=path.join(out,'timeline.json');
 if(fs.existsSync(p)) return JSON.parse(fs.readFileSync(p,'utf8'));
 let time=1.2;
 const segments=script.segments.map((s,i)=>{const duration=s.text.split(/\s+/).length/2.65;const r={...s,index:i,start:time,end:time+duration};time+=duration+s.gap;return r});
 return {provisional:true,duration:time+.6,segments};
}
export const timeline=getTimeline();
export const duration=timeline.duration;
export const chapters=[];
for(const s of timeline.segments){let ch=chapters.at(-1);if(!ch||ch.id!==s.scene){ch={id:s.scene,start:s.start-.2,end:s.end+s.gap};chapters.push(ch)}else ch.end=s.end+s.gap}
chapters[0].start=0;chapters.at(-1).end=duration;
export function state(t){
 const ch=chapters.find(c=>t<c.end)||chapters.at(-1);
 const p=clamp((t-ch.start)/(ch.end-ch.start));
 let elevation=65;
 if(ch.id==='opening')elevation=lerp(65,2,smooth((p-.28)/.5));
 if(ch.id==='low')elevation=lerp(65,2,smooth(p/.68));
 if(ch.id==='listen')elevation=t<timeline.segments[18].start?65:2;
 if(ch.id==='conclusion')elevation=2;
 return {ch,p,elevation,mass:airMass(elevation),trans:bands.map(b=>transmission(b.nm,elevation)),rgb:sunRGB(elevation)};
}
// Each visible molecular scattering flash uses these events; audio reads the same list.
export function events(){
 const ev=[];
 for(const ch of chapters){
  if(ch.id==='scatter'||ch.id==='sky'){
   for(let t=ch.start+.7,k=0;t<ch.end-.6;t+=1.65,k++)ev.push({type:'scatter',time:t,band:k%5===4?0:4,seed:k,scene:ch.id});
  }
 }
 for(const index of [17,18]){
  const s=timeline.segments[index]; ev.push({type:'chord',time:s.end+.18,elevation:index===17?65:2,duration:1.1});
 }
 return ev;
}
if(process.argv.includes('--validate')){
 const assert=(v,m)=>{if(!v)throw Error(m)};
 assert(airMass(2)>airMass(65),'Low Sun must have greater air mass');
 assert(transmission(460,2)<transmission(650,2),'Blue must attenuate more');
 for(let h=2;h<=90;h++)for(const b of bands)assert(transmission(b.nm,h)>0&&transmission(b.nm,h)<=1,'Transmission range');
 assert(timeline.segments.every((s,i)=>s.end>s.start&&(!i||s.start>=timeline.segments[i-1].end)),'Caption overlaps');
 for(const e of events().filter(e=>e.type==='chord')){
  assert(state(e.time).elevation===e.elevation,'Audio and visual condition differ');
  assert(!timeline.segments.some(s=>e.time<s.end&&e.time+e.duration>s.start),'Listening chord overlaps narration');
 }
 assert(duration<120,'Film must be under two minutes');
 console.log(JSON.stringify({duration,provisional:!!timeline.provisional,airMassHigh:airMass(65),airMassLow:airMass(2),blueToRedScatteringRatio:(650/460)**4,events:events().length},null,2));
}
