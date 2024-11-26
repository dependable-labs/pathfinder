use anchor_lang::prelude::*;
use crate::state::*;
use crate::math::*;
use crate::error::*;

/// Curve steepness (scaled by WAD).
/// Curve steepness = 4.
pub const CURVE_STEEPNESS: i128 = 4 * WAD_INT;

pub const YEAR_SECONDS: i128 = 365 * 24 * 60 * 60;

/// Adjustment speed per second (scaled by WAD).
/// The speed is per second, so the rate moves at a speed of ADJUSTMENT_SPEED * err each second
/// (while being continuously compounded).
/// Adjustment speed = 50/year.
pub const ADJUSTMENT_SPEED: i128 = 50 * WAD_INT / YEAR_SECONDS;

/// Target utilization (scaled by WAD).
/// Target utilization = 90%.
pub const TARGET_UTILIZATION: i128 = 9 * WAD_INT / 10;

/// Initial rate at target per second (scaled by WAD).
/// Initial rate at target = 4% (rate between 1% and 16%).
pub const INITIAL_RATE_AT_TARGET: i128 = 4 * WAD_INT / 100 / YEAR_SECONDS;

/// Minimum rate at target per second (scaled by WAD).
/// Minimum rate at target = 0.1% (minimum rate = 0.025%).
pub const MIN_RATE_AT_TARGET: i128 = WAD_INT / 1000 / YEAR_SECONDS;

/// Maximum rate at target per second (scaled by WAD).
/// Maximum rate at target = 200% (maximum rate = 800%).
pub const MAX_RATE_AT_TARGET: i128 = 2 * WAD_INT / YEAR_SECONDS;


pub fn get_rate(
    market: &mut Account<Market>,
) -> Result<(u64, u64)> { 

    // Safe "unchecked" cast because the utilization is smaller than 1 (scaled by WAD).
    let utilization: i128 = if market.total_quote > 0 {
        w_div_down(market.total_borrow_assets, market.total_quote)? as i128
    } else {
        0
    };

    // The normalization factor is used to scale the error and helps in adjusting the interest rate
    // in a way that is proportional to how far the current utilization is from the target utilization.
    let err_norm_factor:i128 = if utilization > TARGET_UTILIZATION {
        WAD_INT - TARGET_UTILIZATION
    } else {
        TARGET_UTILIZATION
    };
    
    // The error is the difference between the current utilization and the target utilization,
    let err = w_div_to_zero(utilization - TARGET_UTILIZATION, err_norm_factor)?;

    let start_rate_at_target: i128 = market.rate_at_target as i128;

    let avg_rate_at_target:i128;
    let end_rate_at_target:i128;

    if start_rate_at_target == 0 {
        // First interaction.
        avg_rate_at_target = INITIAL_RATE_AT_TARGET;
        end_rate_at_target = INITIAL_RATE_AT_TARGET;
    } else {
        // The speed is assumed constant between two updates, but it is in fact not constant because of interest.
        // So the rate is always underestimated.
        // rate of change (how quickly the interest rate should adjust)
        let speed: i128 = w_mul_to_zero(ADJUSTMENT_SPEED,err)?;

        let clock = Clock::get()?;
        let current_timestamp = clock.unix_timestamp as u64;

        // market.lastUpdate != 0 because it is not the first interaction with this market.
        // Safe "unchecked" cast because block.timestamp - market.lastUpdate <= block.timestamp <= type(int256).max.
        let elapsed: i128 = (current_timestamp - market.last_accrual_timestamp) as i128;
        let linear_adaptation: i128 = speed.checked_mul(elapsed).ok_or(MarketError::MathOverflow)?;

        if linear_adaptation == 0 {
            // If linearAdaptation == 0, avgRateAtTarget = endRateAtTarget = startRateAtTarget;
            avg_rate_at_target = start_rate_at_target;
            end_rate_at_target = start_rate_at_target;
        } else {
            // Formula of the average rate that should be returned to Morpho Blue:
            // avg = 1/T * ∫_0^T curve(startRateAtTarget*exp(speed*x), err) dx
            // The integral is approximated with the trapezoidal rule:
            // avg ~= 1/T * Σ_i=1^N [curve(f((i-1) * T/N), err) + curve(f(i * T/N), err)] / 2 * T/N
            // Where f(x) = startRateAtTarget*exp(speed*x)
            // avg ~= Σ_i=1^N [curve(f((i-1) * T/N), err) + curve(f(i * T/N), err)] / (2 * N)
            // As curve is linear in its first argument:
            // avg ~= curve([Σ_i=1^N [f((i-1) * T/N) + f(i * T/N)] / (2 * N), err)
            // avg ~= curve([(f(0) + f(T))/2 + Σ_i=1^(N-1) f(i * T/N)] / N, err)
            // avg ~= curve([(startRateAtTarget + endRateAtTarget)/2 + Σ_i=1^(N-1) f(i * T/N)] / N, err)
            // With N = 2:
            // avg ~= curve([(startRateAtTarget + endRateAtTarget)/2 + startRateAtTarget*exp(speed*T/2)] / 2, err)
            // avg ~= curve([startRateAtTarget + endRateAtTarget + 2*startRateAtTarget*exp(speed*T/2)] / 4, err)
            end_rate_at_target = _new_rate_at_target(start_rate_at_target, linear_adaptation)?;

            let mid_linear = linear_adaptation
                .checked_div(2)
                .ok_or(MarketError::MathOverflow)?;

            let mid_rate_at_target = _new_rate_at_target(start_rate_at_target, mid_linear)?;

            let weighted_sum = start_rate_at_target + end_rate_at_target + 2 * mid_rate_at_target;

            avg_rate_at_target = weighted_sum
                .checked_div(4)
                .ok_or(MarketError::MathOverflow)?;
        }
    }

    // Safe "unchecked" cast because avgRateAtTarget >= 0.
    Ok((_curve(avg_rate_at_target, err)? as u64, end_rate_at_target as u64))
}

/// @dev Returns the rate for a given `_rateAtTarget` and an `err`.
/// The formula of the curve is the following:
/// r = ((1-1/C)*err + 1) * rateAtTarget if err < 0
///     ((C-1)*err + 1) * rateAtTarget else.
pub fn _curve(
    rate_at_target: i128,
    err: i128,
) -> Result<i128> { 
    // Non negative because 1 - 1/C >= 0, C - 1 >= 0.
    let coeff = if err < 0 { 
        WAD_INT - w_div_to_zero(WAD_INT,CURVE_STEEPNESS)?
    } else {
        CURVE_STEEPNESS - WAD_INT
    };

    // Non negative if _rateAtTarget >= 0 because if err < 0, coeff <= 1.
    let adjustment_factor = w_mul_to_zero(coeff, err)? + WAD_INT;
    let result = w_mul_to_zero(adjustment_factor, rate_at_target)?;
    Ok(result)
}

/// @dev Returns the new rate at target, for a given `startRateAtTarget` and a given `linearAdaptation`.
/// The formula is: max(min(startRateAtTarget * exp(linearAdaptation), maxRateAtTarget), minRateAtTarget).
pub fn _new_rate_at_target(
    start_rate_at_target: i128,
    linear_adaptation: i128,
) -> Result<i128> {
    // Non negative because MIN_RATE_AT_TARGET > 0.
    let result = w_mul_to_zero(start_rate_at_target, w_exp(linear_adaptation)?)?;
    msg!("result: {}", result);
    msg!("MIN_RATE_AT_TARGET: {}", MIN_RATE_AT_TARGET);
    msg!("MAX_RATE_AT_TARGET: {}", MAX_RATE_AT_TARGET);

    bound(result, MIN_RATE_AT_TARGET, MAX_RATE_AT_TARGET)
    // Ok(start_rate_at_target)
}