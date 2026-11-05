import fs from 'node:fs';
export const annual=JSON.parse(fs.readFileSync(new URL('./data/korea-annual-2025.json',import.meta.url)));
export const sources=[
 {id:'nuclear',name:'원자력',color:'#8569b8',tile:0,side:0,row:0,process:'핵분열 열 → 증기 → 발전기'},
 {id:'coal',name:'석탄',color:'#7d8797',tile:1,side:0,row:1,process:'연소 열 → 증기 → 발전기'},
 {id:'gas',name:'가스 · LNG',color:'#e98d56',tile:2,side:0,row:2,process:'가스터빈 + 증기터빈'},
 {id:'oil',name:'유류',color:'#ad7c62',tile:6,side:0,row:3,process:'연소 → 엔진·터빈 → 발전기'},
 {id:'solar',name:'태양광',color:'#e7b535',tile:3,side:1,row:0,process:'햇빛 → 태양전지 → 인버터'},
 {id:'wind',name:'풍력',color:'#37a99b',tile:4,side:1,row:1,process:'바람 → 회전날개 → 발전기'},
 {id:'hydro',name:'일반수력',color:'#499bd0',tile:5,side:1,row:2,process:'물의 흐름 → 수차 → 발전기'},
 {id:'other_renewable',name:'바이오·기타재생',color:'#80a65c',tile:7,side:1,row:3,process:'대표: 바이오 연소 → 발전기'},
];
export const phases=[
 ['자정, 전기는 계속 흐릅니다','밤에도 필요한 전기를 공급합니다.','원자력과 화력은 밤에도 전기를 만듭니다.','수요가 줄어도 공급은 멈추지 않습니다.'],
 ['새벽, 다음 수요를 준비합니다','양수는 물을 올리고, 저장량은 늘어납니다.','저장은 전기를 새로 만드는 발전원이 아닙니다.','충전한 에너지를 다른 시간에 사용합니다.'],
 ['아침, 도시가 깨어납니다','수요가 늘면 조절 가능한 발전이 따라갑니다.','가스 복합발전은 두 터빈을 함께 사용합니다.','가스터빈의 배기가스 열도 다시 활용합니다.'],
 ['오전, 태양광이 커집니다','햇빛과 바람의 변화가 출력에 반영됩니다.','태양광은 빛을 전기로 직접 바꿉니다.','풍력은 바람으로 날개와 발전기를 돌립니다.'],
 ['한낮, 생산과 저장을 함께','낮에 생산한 전기 일부를 저장합니다.','ESS와 양수가 충전되면 전력 수요가 늘어납니다.','이 모형은 생산·소비·저장을 함께 맞춥니다.'],
 ['오후, 해가 낮아집니다','태양광 감소에 다른 발전이 대응합니다.','태양광이 줄면 가스·수력 등이 출력을 보완합니다.','실제 운전은 날씨와 설비 상태에 따라 달라집니다.'],
 ['저녁, 저장한 전기가 나옵니다','양수와 ESS가 전력망으로 공급합니다.','양수는 물을 내려 터빈을 돌립니다.','ESS는 저장한 전기를 인버터로 내보냅니다.'],
 ['밤, 다시 균형을 맞춥니다','다음 날까지 전기의 흐름은 이어집니다.','유류·바이오 등 여러 방식도 함께 공급합니다.','매 순간 공급과 수요를 맞추는 것이 핵심입니다.'],
];
export const duration=90,fps=30;
export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const hump=(h,a,b)=>h>a&&h<b?Math.sin(Math.PI*(h-a)/(b-a)):0;
const gauss=(h,c,w)=>Math.exp(-.5*((h-c)/w)**2);
function raw(id,h){
 switch(id){
 case 'nuclear':return 1+.004*Math.cos(h/24*Math.PI*2);
 case 'coal':return .90+.08*gauss(h,9,2.8)+.17*gauss(h,19,3.2);
 case 'gas':return .64+.38*gauss(h,9,2.5)+.32*gauss(h,14,2.8)+.70*gauss(h,19.4,2.3);
 case 'solar':return Math.max(0,Math.sin(Math.PI*(h-6)/12))*(h>=6&&h<=18?1:0)**1.4;
 case 'wind':return .85+.20*Math.sin(h*.52+.9)+.12*Math.sin(h*1.1);
 case 'hydro':return .45+.6*gauss(h,9,1.8)+1.1*gauss(h,19,2);
 case 'oil':return .7+.75*gauss(h,19,2);
 default:return 1+.025*Math.sin(h*.34);
 }
}
const N=1440,dt=24/N;
const scales=Object.fromEntries(sources.map(s=>{let integral=0;for(let i=0;i<N;i++)integral+=(raw(s.id,i*dt)+raw(s.id,(i+1)*dt))*dt/2;return [s.id,annual.generation[s.id]*1000/365/integral];}));
const pumped={capacity:18,energy:5,eta:.88},ess={capacity:6,energy:1.5,eta:.95};
export const series=[];
for(let i=0;i<=N;i++){
 const h=i*dt,power=Object.fromEntries(sources.map(s=>[s.id,raw(s.id,h)*scales[s.id]]));
 const pumpCharge=1.5*hump(h,0,5)+1.1*hump(h,10,15),pumpDischarge=2*hump(h,17,22);
 const essCharge=1.3*hump(h,10,15),essDischarge=1.15*hump(h,17,22);
 if(i>0){const prev=series[i-1];pumped.energy+=dt*((prev.pumpCharge+pumpCharge)/2*pumped.eta-(prev.pumpDischarge+pumpDischarge)/2/.9);ess.energy+=dt*((prev.essCharge+essCharge)/2*ess.eta-(prev.essDischarge+essDischarge)/2/ess.eta);}
 const generation=Object.values(power).reduce((a,b)=>a+b,0),charge=pumpCharge+essCharge,discharge=pumpDischarge+essDischarge;
 series.push({h,power,generation,demand:generation+discharge-charge,charge,discharge,pumpCharge,pumpDischarge,essCharge,essDischarge,pumpEnergy:pumped.energy,essEnergy:ess.energy,pumpSoc:pumped.energy/pumped.capacity,essSoc:ess.energy/ess.capacity});
}
export function sample(h){let i=clamp(h/24*N,0,N),a=series[Math.floor(i)],b=series[Math.min(N,Math.floor(i)+1)],p=i-Math.floor(i),r={};for(const k of Object.keys(a))if(k==='power')r.power=Object.fromEntries(sources.map(s=>[s.id,a.power[s.id]*(1-p)+b.power[s.id]*p]));else r[k]=a[k]*(1-p)+b[k]*p;return r;}
export function hour(t){return clamp((t-5)/3,0,24);}
export function validate(){
 let residual=0;
 for(const r of series){residual=Math.max(residual,Math.abs(r.generation+r.discharge-r.demand-r.charge));for(const s of sources)if(r.power[s.id]<0)throw Error('Negative generation');if(r.pumpSoc<0||r.pumpSoc>1||r.essSoc<0||r.essSoc>1)throw Error('Storage bounds');if((r.h<6||r.h>18)&&r.power.solar>1e-10)throw Error('Night solar');}
 const energy={};for(const s of sources){let sum=0;for(let i=1;i<series.length;i++)sum+=(series[i-1].power[s.id]+series[i].power[s.id])*dt/2;const target=annual.generation[s.id]*1000/365;if(Math.abs(sum-target)>1e-7)throw Error('Annual-share calibration');energy[s.id]=sum;}
 if(residual>1e-9)throw Error('Power balance');
 return {status:'passed',model:'Illustrative 24-hour scenario, not measured KPX dispatch',steps:series.length,max_balance_error_GW:residual,daily_generation_GWh:energy,pumped_capacity_GWh:18,ess_capacity_GWh:6,storage_capacities_are_hypothetical:true,transmission_losses:'omitted',pumped_efficiency:{charge:.88,discharge:.9},ess_efficiency:{charge:.95,discharge:.95}};
}
