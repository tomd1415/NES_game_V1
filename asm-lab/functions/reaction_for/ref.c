/* C reference for reaction_for, from behaviour.c. Small 2D-table lookup:
 * sprite_reactions is 2 sprites x 8 behaviour ids. Both args are unsigned char.
 * The driver fills sprite_reactions with a distinctive pattern before testing.
 */
#define REACT_IGNORE 0

unsigned char sprite_reactions[16];   /* driver-filled */

unsigned char rf_ref(unsigned char sprite_idx, unsigned char behaviour_id) {
    if (behaviour_id >= 8) return REACT_IGNORE;
    if (sprite_idx >= 2) return REACT_IGNORE;
    return sprite_reactions[((unsigned int)sprite_idx << 3) | behaviour_id];
}
