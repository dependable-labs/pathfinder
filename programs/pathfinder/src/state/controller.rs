use anchor_lang::prelude::*;

#[account]
pub struct Controller {
    pub authority: Pubkey,
    pub authority_set: bool,
    pub bump: u8,
}

// impl Controller {
//     pub const LEN: usize = 8 + // discriminator
//         32 + // authority
//         4 + (32 * 10) + // markets (vector with max 10 markets)
//         1; // bump
// } 
