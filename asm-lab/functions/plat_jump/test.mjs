import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, makeReporter } from '../../harness/nes.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pds=[0x08,0x08,0x08,0x00,0x0C,0x08], pvs=[0x00,0x08,0x00,0x00,0x04,0x04], jus=[0,0,1,0,0,0];
const model=(pad,pv,ju)=>{ let jm=3; if(((pad&0x08)&&!(pv&0x08))&&!ju){ju=1;jm=20;} return [ju,jm]; };
const r=makeReporter('plat_jump unit');
const h=boot(path.join(__dirname,'..','..','build','pjmp.nes'));
if(!h.frameUntil(0x0300,0xAA)){r.bad('driver did not finish');r.done();}
const n=h.rd(0x0301);
r.eq('case count',n,pds.length); r.eq('mismatch count',h.rd(0x0302),0);
let ok=true;
for(let i=0;i<n;i++){
  const rj=h.rd(0x0308+i*4),rm=h.rd(0x0309+i*4),aj=h.rd(0x030A+i*4),am=h.rd(0x030B+i*4);
  const [wj,wm]=model(pds[i],pvs[i],jus[i]);
  if(!(aj===rj&&am===rm&&rj===wj&&rm===wm)){ok=false;r.bad(`case ${i} pad=${pds[i].toString(16)} prev=${pvs[i].toString(16)} j=${jus[i]}: ref=(${rj},${rm}) asm=(${aj},${am}) model=(${wj},${wm})`);}
}
if(ok) r.ok(`all ${n} cases: asm == ref == model (UP-edge take-off, UP-held no-op, already-jumping, UP-not-pressed)`);
r.done('plat_jump: ASM candidate is behaviourally identical to the C reference.');
