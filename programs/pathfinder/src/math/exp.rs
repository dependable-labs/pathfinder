use anchor_lang::prelude::*;
use crate::math::WAD_INT;

/// @dev ln(2).
/// 0.693_147_180_559_945_309 * WAD_INT;
pub const LN_2_INT: i128 = 693_147_180_559_945_309;

/// @dev ln(1e-18).
/// -41.446_531_673_892_822_312 * WAD_INT;
pub const LN_WEI_INT: i128 = -41_446_531_673_892_822_312;

/// From Original solidity:
/// @dev Above this bound, `wExp` is clipped to avoid overflowing when multiplied with 1 ether.
/// @dev This upper bound corresponds to: ln(type(int256).max / 1e36) (scaled by WAD, floored).
/// 93.859_467_695_000_404_319 * WAD_INT;
// pub const WEXP_UPPER_BOUND: i128 = 93_859_467_695_000_404_319;

/// @dev This upper bound corresponds to: ln(i128::MAX / 1e36)
// pub const WEXP_UPPER_BOUND: i128 = 5_136_628_583_327_409_665;
pub const WEXP_UPPER_BOUND: i128 = 21_700_000_000_000_000_000;

// The value of wExp(`WEXP_UPPER_BOUND`).
// 57716089161558943949701069502944508345128.422502756744429568 * WAD_INT;
// pub const WEXP_UPPER_VALUE: i128 = 57716089161558943949701069502944508345128.422502756744429568 * WAD_INT;
// pub const WEXP_UPPER_VALUE: i128 = 169_612_341_902_420_792_704;
pub const WEXP_UPPER_VALUE: i128 = 2_652_147_089_148_298_802_378_047_488;

/// @dev Returns an approximation of exp.
pub fn w_exp(x: i128) -> Result<i128> {
  // If x < ln(1e-18) then exp(x) < 1e-18 so it is rounded to zero.
  if x < LN_WEI_INT { return Ok(0); }

  // `wExp` is clipped to avoid overflowing when multiplied with 1 ether.
  // if x >= WEXP_UPPER_BOUND { return Ok(WEXP_UPPER_VALUE); }

  // Decompose x as x = q * ln(2) + r with q an integer and -ln(2)/2 <= r <= ln(2)/2.
  // q = x / ln(2) rounded half toward zero.
  let rounding_adjustment = if x < 0 { -(LN_2_INT / 2) } else { LN_2_INT / 2 };
  // Safe unchecked because x is bounded.
  let q = (x + rounding_adjustment) / LN_2_INT;
  // Safe unchecked because |q * ln(2) - x| <= ln(2)/2.
  let r = x - q * LN_2_INT;

  // Compute e^r with a 2nd-order Taylor polynomial.
  // Safe unchecked because |r| < 1e18.
  let exp_r = WAD_INT + r + (r * r) / WAD_INT / 2;

  // Return e^x = 2^q * e^r.
  if q >= 0 {
    Ok(exp_r << q as u128)
  } else {
    Ok(exp_r >> -q as u128)
  }
}
