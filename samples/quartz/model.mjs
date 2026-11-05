import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateChemistry} from './chemistry.mjs';
export const base=path.dirname(fileURLToPath(import.meta.url));
export const out=path.resolve(base,'../../outputs/quartz');
export const script=JSON.parse(fs.readFileSync(path.join(base,'script.json')));
export const lattice=JSON.parse(fs.readFileSync(path.join(base,'assets/lattice.json')));
export const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export const lerp=(a,b,q)=>a+(b-a)*q;
export const smooth=q=>{q=clamp(q);return q*q*(3-2*q)};
const file=path.join(out,'timeline.json');
let provisional;{
 let time=1.2;const segments=script.segments.map((s,index)=>{const d=s.text.replace(/[\s.,?!。，]/g,'').length/5.5;const r={...s,index,start:time,end:time+d};time+=d+s.gap;return r});
 provisional={provisional:true,duration:time+.6,segments};
}
export const timeline=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):provisional;
export const duration=timeline.duration;
export const chapters=[];
for(const s of timeline.segments){let c=chapters.at(-1);if(!c||c.id!==s.scene){c={id:s.scene,start:s.start-.15,end:s.end+s.gap};chapters.push(c)}else c.end=s.end+s.gap}
chapters[0].start=0;chapters.at(-1).end=duration;
export function state(t){const ch=chapters.find(c=>t<c.end)||chapters.at(-1);return {ch,p:clamp((t-ch.start)/(ch.end-ch.start))}}
export const growthOrder=[...lattice.tetrahedra].sort((a,b)=>Math.hypot(...lattice.atoms[a[0]].p)-Math.hypot(...lattice.atoms[b[0]].p));
export const centerTetra=growthOrder[0];
export function events(){
 const arr=[];
 const g=chapters.find(c=>c.id==='grow');
 for(let i=0;i<growthOrder.length;i++)arr.push({type:'attach',time:g.start+.4+(g.end-g.start-1.1)*i/(growthOrder.length-1),tetra:i,note:[261.63,329.63,392][i%3]});
 const n=chapters.find(c=>c.id==='network');
 for(let i=0;i<6;i++)arr.push({type:'repeat',time:n.start+1.3+i*(n.end-n.start-2.4)/6,note:[261.63,329.63,392][i%3]});
 const r=chapters.find(c=>c.id==='reaction');
 if(r)arr.push({type:'condense',time:r.start+(r.end-r.start)*.67,note:523.25});
 return arr;
}
if(process.argv.includes('--validate')){
 const assert=(v,m)=>{if(!v)throw Error(m)};
 const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
 for(const tet of lattice.tetrahedra){assert(tet.length===5,'Four oxygen neighbors');assert(lattice.atoms[tet[0]].element==='Si','Tetrahedron center must be silicon');for(const i of tet.slice(1)){assert(lattice.atoms[i].element==='O','Vertex must be oxygen');const d=dist(lattice.atoms[i].p,lattice.atoms[tet[0]].p);assert(d>1.5&&d<1.8,'Si-O bond length outside expected range')}}
 for(const a of lattice.atoms){const count=lattice.bonds.filter(([i,j])=>lattice.atoms[i]===a||lattice.atoms[j]===a).length;assert(count<=(a.element==='Si'?4:2),'Invalid quartz coordination')}
 assert(duration<120,'Film exceeds two minutes');
 assert(timeline.segments.every((s,i)=>s.end>s.start&&(!i||s.start>=timeline.segments[i-1].end)),'Caption overlap');
 assert(events().every(e=>e.time>=0&&e.time<duration),'Events outside film');
 console.log(JSON.stringify({duration,provisional:timeline.provisional,atoms:lattice.atoms.length,tetrahedra:lattice.tetrahedra.length,events:events().length,surfaceReaction:validateChemistry()},null,2));
}
