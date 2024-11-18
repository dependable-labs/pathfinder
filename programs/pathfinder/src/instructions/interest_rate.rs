use anchor_lang::prelude::*;
use anchor_spl::token::*;
use crate::state::*;
use crate::math::*;


#[account]
pub struct Irm {
	pub rateAtTarget: u64
}

#[derive(Accounts)]
pub struct InterestRate<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
	#[account(
        mut,
        seeds = [
            MARKET_SEED_PREFIX,
            market.quote_mint.as_ref(),
        ],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
	#[account(constraint = quote_mint.is_initialized == true)]
    pub quote_mint: Box<Account<'info, Mint>>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + std::mem::size_of::<Irm>(),
        seeds = [
            IRM_SEED_PREFIX,
            market.key().as_ref()
        ],
        bump = irm.bump,
    )]
    pub irm: Account<'info, Irm>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> InterestRate<'info> {
    pub fn handle(ctx: Context<Self>) -> Result<()> {

        let InterestRate {
            user,
            market,
            quote_mint,
            irm,
            token_program,
            system_program,
        } = ctx.accounts;


        let (avgRate, endRateAtTarget) = _get_rate(ctx.market)?;

        irm.rateAtTarget = endRateAtTarget;

        // emit interest rate update event

        Ok(avgRate)
    }

}

pub fn _get_rate(
    market: &mut Account<Market>,
) -> Result<()> { 

        // // Safe "unchecked" cast because the utilization is smaller than 1 (scaled by WAD).
        // int256 utilization =
        //     int256(market.totalSupplyAssets > 0 ? market.totalBorrowAssets.wDivDown(market.totalSupplyAssets) : 0);

        // int256 errNormFactor = utilization > ConstantsLib.TARGET_UTILIZATION
        //     ? WAD - ConstantsLib.TARGET_UTILIZATION
        //     : ConstantsLib.TARGET_UTILIZATION;
        // int256 err = (utilization - ConstantsLib.TARGET_UTILIZATION).wDivToZero(errNormFactor);

        // int256 startRateAtTarget = rateAtTarget[id];

        // int256 avgRateAtTarget;
        // int256 endRateAtTarget;

        // if (startRateAtTarget == 0) {
        //     // First interaction.
        //     avgRateAtTarget = ConstantsLib.INITIAL_RATE_AT_TARGET;
        //     endRateAtTarget = ConstantsLib.INITIAL_RATE_AT_TARGET;
        // } else {
        //     // The speed is assumed constant between two updates, but it is in fact not constant because of interest.
        //     // So the rate is always underestimated.
        //     int256 speed = ConstantsLib.ADJUSTMENT_SPEED.wMulToZero(err);
        //     // market.lastUpdate != 0 because it is not the first interaction with this market.
        //     // Safe "unchecked" cast because block.timestamp - market.lastUpdate <= block.timestamp <= type(int256).max.
        //     int256 elapsed = int256(block.timestamp - market.lastUpdate);
        //     int256 linearAdaptation = speed * elapsed;

        //     if (linearAdaptation == 0) {
        //         // If linearAdaptation == 0, avgRateAtTarget = endRateAtTarget = startRateAtTarget;
        //         avgRateAtTarget = startRateAtTarget;
        //         endRateAtTarget = startRateAtTarget;
        //     } else {
        //         // Formula of the average rate that should be returned to Morpho Blue:
        //         // avg = 1/T * ∫_0^T curve(startRateAtTarget*exp(speed*x), err) dx
        //         // The integral is approximated with the trapezoidal rule:
        //         // avg ~= 1/T * Σ_i=1^N [curve(f((i-1) * T/N), err) + curve(f(i * T/N), err)] / 2 * T/N
        //         // Where f(x) = startRateAtTarget*exp(speed*x)
        //         // avg ~= Σ_i=1^N [curve(f((i-1) * T/N), err) + curve(f(i * T/N), err)] / (2 * N)
        //         // As curve is linear in its first argument:
        //         // avg ~= curve([Σ_i=1^N [f((i-1) * T/N) + f(i * T/N)] / (2 * N), err)
        //         // avg ~= curve([(f(0) + f(T))/2 + Σ_i=1^(N-1) f(i * T/N)] / N, err)
        //         // avg ~= curve([(startRateAtTarget + endRateAtTarget)/2 + Σ_i=1^(N-1) f(i * T/N)] / N, err)
        //         // With N = 2:
        //         // avg ~= curve([(startRateAtTarget + endRateAtTarget)/2 + startRateAtTarget*exp(speed*T/2)] / 2, err)
        //         // avg ~= curve([startRateAtTarget + endRateAtTarget + 2*startRateAtTarget*exp(speed*T/2)] / 4, err)
        //         endRateAtTarget = _newRateAtTarget(startRateAtTarget, linearAdaptation);
        //         int256 midRateAtTarget = _newRateAtTarget(startRateAtTarget, linearAdaptation / 2);
        //         avgRateAtTarget = (startRateAtTarget + endRateAtTarget + 2 * midRateAtTarget) / 4;
        //     }
        // }

        // // Safe "unchecked" cast because avgRateAtTarget >= 0.
        // return (uint256(_curve(avgRateAtTarget, err)), endRateAtTarget);
    }

/// @dev Returns the rate for a given `_rateAtTarget` and an `err`.
/// The formula of the curve is the following:
/// r = ((1-1/C)*err + 1) * rateAtTarget if err < 0
///     ((C-1)*err + 1) * rateAtTarget else.
pub fn _curve(
    rate_at_target: u64,
    err: u64,
) -> Result<()> { 

// function _curve(int256 _rateAtTarget, int256 err) private pure returns (int256) {
    // // Non negative because 1 - 1/C >= 0, C - 1 >= 0.
    // int256 coeff = err < 0 ? WAD - WAD.wDivToZero(ConstantsLib.CURVE_STEEPNESS) : ConstantsLib.CURVE_STEEPNESS - WAD;
    // // Non negative if _rateAtTarget >= 0 because if err < 0, coeff <= 1.
    // return (coeff.wMulToZero(err) + WAD).wMulToZero(int256(_rateAtTarget));
}

/// @dev Returns the new rate at target, for a given `startRateAtTarget` and a given `linearAdaptation`.
/// The formula is: max(min(startRateAtTarget * exp(linearAdaptation), maxRateAtTarget), minRateAtTarget).
// function _newRateAtTarget(int256 startRateAtTarget, int256 linearAdaptation) private pure returns (int256) {
pub fn _new_rate_at_target(
    start_rate_at_target: u64,
    linear_adaptation: u64,
) -> Result<()> { 
    // // Non negative because MIN_RATE_AT_TARGET > 0.
    // return startRateAtTarget.wMulToZero(ExpLib.wExp(linearAdaptation)).bound(
    //     ConstantsLib.MIN_RATE_AT_TARGET, ConstantsLib.MAX_RATE_AT_TARGET
    // );
}



