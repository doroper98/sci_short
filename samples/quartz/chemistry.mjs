// Representative silanol condensation, not a unique elementary quartz-growth pathway.
// Existing surface: SiO4 fragment with three connections to omitted bulk structure.
// Dissolved species: neutral H4SiO4, one common species near neutral pH.
const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
const add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,s)=>a.map(v=>v*s),mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const rotate=(v,a)=>[v[0]*Math.cos(a)-v[1]*Math.sin(a),v[0]*Math.sin(a)+v[1]*Math.cos(a),v[2]];
// An illustrative bent silanol group, Si-O-H ~115 degrees; not a linear O-H extension.
const hydroxyl=d=>{let n=[d[1],-d[0],0],len=Math.hypot(...n);if(len<.01){n=[0,d[2],-d[1]];len=Math.hypot(...n)}n=mul(n,1/len);return add(mul(d,Math.cos(65*Math.PI/180)),mul(n,Math.sin(65*Math.PI/180)))};
export const tetraDirections=[[-1,0,0],...[0,1,2].map(i=>[1/3,Math.sqrt(8)/3*Math.cos(i*Math.PI*2/3),Math.sqrt(8)/3*Math.sin(i*Math.PI*2/3)])];
export function silicicAcid(){
 const atoms=[{id:'Si',element:'Si',p:[0,0,0]}],bonds=[];
 tetraDirections.forEach((d,i)=>{const o=mul(d,1.62);atoms.push({id:`O${i}`,element:'O',p:o},{id:`H${i}`,element:'H',p:add(o,mul(hydroxyl(d),.96))});bonds.push({a:'Si',b:`O${i}`,alpha:1},{a:`O${i}`,b:`H${i}`,alpha:1})});
 return {atoms,bonds};
}
export function condensation(p){
 const approach=smooth((p-.08)/.4),reaction=smooth((p-.37)/.30),angle=36*Math.PI/180;
 const surface=[-2.7,.1,0],bridge=add(surface,[1.62,0,0]),target=add(bridge,[1.62*Math.cos(angle),1.62*Math.sin(angle),0]);
 const incoming=mix([2.8,.1,0],target,approach),phi=angle*approach;
 const water=[-.1,-2.5,.8],half=52.25*Math.PI/180;
 const h1=add(water,[.96*Math.cos(half),.96*Math.sin(half),0]),h2=add(water,[.96*Math.cos(half),-.96*Math.sin(half),0]);
 const leaving0=add(incoming,rotate([-1.62,0,0],phi));
 const atoms=[{id:'surfaceSi',element:'Si',p:surface},{id:'bridgeO',element:'O',p:bridge},{id:'surfaceH',element:'H',p:mix(add(bridge,mul(hydroxyl([1,0,0]),.96)),h1,reaction)},{id:'newSi',element:'Si',p:incoming},{id:'leavingO',element:'O',p:mix(leaving0,water,reaction)},{id:'leavingH',element:'H',p:mix(add(leaving0,mul(rotate(hydroxyl([-1,0,0]),phi),.96)),h2,reaction)}];
 const bonds=[{a:'surfaceSi',b:'bridgeO',alpha:1},{a:'bridgeO',b:'surfaceH',alpha:1-reaction},{a:'newSi',b:'leavingO',alpha:1-reaction},{a:'leavingO',b:'leavingH',alpha:1},{a:'bridgeO',b:'newSi',alpha:reaction,formed:true},{a:'leavingO',b:'surfaceH',alpha:reaction}];
 tetraDirections.slice(1).forEach((d,i)=>{
  const sd=[-d[0],d[1],d[2]],surfaceO=add(surface,mul(sd,1.62));atoms.push({id:`bulkO${i}`,element:'O',p:surfaceO});bonds.push({a:'surfaceSi',b:`bulkO${i}`,alpha:1});
  const rd=rotate(d,phi),o=add(incoming,mul(rd,1.62)),h=add(o,mul(rotate(hydroxyl(d),phi),.96));atoms.push({id:`newO${i}`,element:'O',p:o},{id:`newH${i}`,element:'H',p:h});bonds.push({a:'newSi',b:`newO${i}`,alpha:1},{a:`newO${i}`,b:`newH${i}`,alpha:1});
 });
 return {atoms,bonds,reaction};
}
export function validateChemistry(){
 for(const p of [0,.2,.5,.8,1]){const m=condensation(p),counts={};m.atoms.forEach(a=>counts[a.element]=(counts[a.element]||0)+1);if(counts.Si!==2||counts.O!==8||counts.H!==5)throw Error('Reaction atom count changed')}
 for(const p of [0,1]){const m=condensation(p);for(const id of ['surfaceSi','newSi']){if(m.bonds.filter(b=>b.alpha>.999&&(b.a===id||b.b===id)).length!==4)throw Error('Silicon coordination must be four')}for(const a of m.atoms.filter(a=>a.element==='H')){if(m.bonds.filter(b=>b.alpha>.999&&(b.a===a.id||b.b===a.id)).length!==1)throw Error('Hydrogen valence error')}}
 const end=condensation(1);if(end.bonds.filter(b=>b.alpha>.999&&(b.a==='bridgeO'||b.b==='bridgeO')).length!==2)throw Error('Shared oxygen must bridge two silicon atoms');
 const positions=Object.fromEntries(end.atoms.map(a=>[a.id,a.p]));
 const angle=(a,o,b)=>{const u=a.map((v,i)=>v-o[i]),v=b.map((w,i)=>w-o[i]);return Math.acos(u.reduce((s,w,i)=>s+w*v[i],0)/(Math.hypot(...u)*Math.hypot(...v)))*180/Math.PI};
 const waterAngle=angle(positions.surfaceH,positions.leavingO,positions.leavingH),bridgeAngle=angle(positions.surfaceSi,positions.bridgeO,positions.newSi);
 if(Math.abs(waterAngle-104.5)>.001||Math.abs(bridgeAngle-144)>.001)throw Error('Illustrative bond angle mismatch');
 return {conserved:{Si:2,O:8,H:5},siliconCoordination:4,sharedOxygenNeighbors:2,waterAngleDegrees:waterAngle,illustrativeBridgeAngleDegrees:bridgeAngle};
}
