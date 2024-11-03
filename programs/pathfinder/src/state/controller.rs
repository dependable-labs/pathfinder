use anchor_lang::prelude::*;

#[account]
pub struct Controller {
    pub authority: Pubkey,
    pub authority_set: bool,
    pub bump: u8,
}