import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { boot, makeReporter } from '../../harness/nes.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pds=[0x08,0x48,0x80,0x08,0x08,0x00,0x00,0x40,0x88,0xC8];
const pvs=[0x00,0x00,0x00,0x08,0x00,0x00,0x00,0x00,0x00,0x00];
const jus=[0,0,0,0,1,1,1,1,0,0], jms=[3,3,3,3,10,10,3,10,3,3];
function model(pad,pv,ju,jm){
  if(((pad&0x08)&&!(pv&0x08) || (pad&0x80)&&!(pv&0x80)) && !ju){ ju=1; jm=20; if(pad&0x40) jm+=8; }
  if(ju && jm>4 && !(pad&0x88)) jm=4;
  return [ju,jm];
}
const r=makeReporter('smb_jump unit');
const h=boot(path.join(__dirname,'..','..','build','smbj.nes'));
if(!h.frameUntil(0x0300,0xAA)){r.bad('driver did not finish');r.done();}
const n=h.rd(0x0301); r.eq('case count',n,pds.length); r.eq('mismatch count',h.rd(0x0302),0);
let ok=true;
for(let i=0;i<n;i++){ const rj=h.rd(0x0308+i*4),rm=h.rd(0x0309+i*4),aj=h.rd(0x030A+i*4),am=h.rd(0x030B+i*4);
  const [wj,wm]=model(pds[i],pvs[i],jus[i],jms[i]);
  if(!(aj===rj&&am===rm&&rj===wj&&rm===wm)){ok=false;r.bad(`case ${i} pad=${pds[i].toString(16)} prev=${pvs[i].toString(16)} j=${jus[i]} jm=${jms[i]}: ref=(${rj},${rm}) asm=(${aj},${am}) model=(${wj},${wm})`);} }
if(ok) r.ok(`all ${n} cases: asm == ref == model (UP-edge, A-edge, run-boost, held-no-edge, already-jumping, variable-cut, cut-not-applied)`);
r.done('smb_jump: ASM candidate is behaviourally identical to the C reference.');
