extern unsigned char pad, prev_pad, jumping, jmp_up;
void smb_jump_ref(void);
void smb_jump_asm(void);
#define NC 10
static const unsigned char pds[NC] = {0x08,0x48,0x80,0x08,0x08,0x00,0x00,0x40,0x88,0xC8};
static const unsigned char pvs[NC] = {0x00,0x00,0x00,0x08,0x00,0x00,0x00,0x00,0x00,0x00};
static const unsigned char jus[NC] = {   0,   0,   0,   0,   1,   1,   1,   1,   0,   0};
static const unsigned char jms[NC] = {   3,   3,   3,   3,  10,  10,   3,  10,   3,   3};
static void seed(unsigned char i){ pad=pds[i]; prev_pad=pvs[i]; jumping=jus[i]; jmp_up=jms[i]; }
void main(void){
    volatile unsigned char *buf=(unsigned char*)0x0300;
    unsigned char i,mism=0,firstBad=0xFF;
    for(i=0;i<NC;i++){ unsigned char rj,rm,aj,am;
        seed(i); smb_jump_ref(); rj=jumping; rm=jmp_up;
        seed(i); smb_jump_asm(); aj=jumping; am=jmp_up;
        buf[8+i*4+0]=rj; buf[8+i*4+1]=rm; buf[8+i*4+2]=aj; buf[8+i*4+3]=am;
        if(rj!=aj||rm!=am){mism++; if(firstBad==0xFF)firstBad=i;} }
    buf[1]=NC; buf[2]=mism; buf[3]=firstBad; buf[0]=0xAA;
    for(;;){}
}
