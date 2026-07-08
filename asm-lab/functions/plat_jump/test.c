/* Unit driver for plat_jump. $0308+i*4 = ref_jumping ref_jmp_up asm_jumping asm_jmp_up */
extern unsigned char pad, prev_pad, jumping, jmp_up;
void plat_jump_ref(void);
void plat_jump_asm(void);
#define NC 6
static const unsigned char pds[NC] = {0x08,0x08,0x08,0x00,0x0C,0x08};
static const unsigned char pvs[NC] = {0x00,0x08,0x00,0x00,0x04,0x04};
static const unsigned char jus[NC] = {0,   0,   1,   0,   0,   0};
static void seed(unsigned char i){ pad=pds[i]; prev_pad=pvs[i]; jumping=jus[i]; jmp_up=3; }
void main(void){
    volatile unsigned char *buf=(unsigned char*)0x0300;
    unsigned char i,mism=0,firstBad=0xFF;
    for(i=0;i<NC;i++){
        unsigned char rj,rm,aj,am;
        seed(i); plat_jump_ref(); rj=jumping; rm=jmp_up;
        seed(i); plat_jump_asm(); aj=jumping; am=jmp_up;
        buf[8+i*4+0]=rj; buf[8+i*4+1]=rm; buf[8+i*4+2]=aj; buf[8+i*4+3]=am;
        if(rj!=aj||rm!=am){mism++; if(firstBad==0xFF)firstBad=i;}
    }
    buf[1]=NC; buf[2]=mism; buf[3]=firstBad; buf[0]=0xAA;
    for(;;){}
}
