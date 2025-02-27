#![no_main]
use libfuzzer_sys::fuzz_target;
use pathfinder::math::*;

// Fuzzing with multiple inputs
// fuzz_target!(|data: i128| {
//   let x = data;

//   if let Ok(result) = w_exp(x) {
//       assert_eq!(result, ((a * b) / denominator) as u64);
//   }
// });

/// @dev ln(1e-9) truncated at 2 decimal places.
const LN_GWEI_INT: i128 = -20_720_000_000_000_000_000;

fuzz_target!(|data: i128| {
  // Bound the input between LN_WEI_INT and LN_GWEI_INT
  let x = if data < LN_WEI_INT {
      LN_WEI_INT
  } else if data > LN_GWEI_INT {
      LN_GWEI_INT
  } else {
      data
  };

  if let Ok(result) = w_exp(x) {
      // For very small inputs, result should be close to 0
      assert!(result <= 1e10 as i128, 
          "exp result {} for input {} exceeds tolerance", 
          result, x);
  }
});


// Test that w_exp returns >= WAD_INT for positive inputs
fuzz_target!(|data: i128| {
    // Bound input between 0 and i128::MAX
    let x = bound(data, 0, i128::MAX);

    if let Ok(result) = w_exp(x) {
        assert!(result >= WAD_INT,
            "exp result {} for positive input {} should be >= WAD_INT",
            result, x);
    }
});

// Test that w_exp returns <= WAD_INT for negative inputs  
fuzz_target!(|data: i128| {
    // Bound input between i128::MIN and 0
    let x = bound(data, i128::MIN, 0);

    if let Ok(result) = w_exp(x) {
        assert!(result <= WAD_INT,
            "exp result {} for negative input {} should be <= WAD_INT", 
            result, x);
    }
});

// testWExpTooLarge
fuzz_target!(|data: i128| {
    // Bound the input between WEXP_UPPER_BOUND and i128::MAX
    let x = bound(data, WEXP_UPPER_BOUND, i128::MAX);

    if let Ok(result) = w_exp(x) {
        assert_eq!(result, WEXP_UPPER_VALUE,
            "exp result {} for large input {} should equal WEXP_UPPER_VALUE",
            result, x);
    }
});

pub fn _wExpUnbounded(x: i128) -> i128 {
  // Decompose x as x = q * ln(2) + r with q an integer and -ln(2)/2 <= r <= ln(2)/2.
  // q = x / ln(2) rounded half toward zero.
  let roundingAdjustment = (x < 0) ? -(ExpLib.LN_2_INT / 2) : (ExpLib.LN_2_INT / 2);
  // Safe unchecked because x is bounded.
  let q = (x + roundingAdjustment) / ExpLib.LN_2_INT;
  // Safe unchecked because |q * ln(2) - x| <= ln(2)/2.
  let r = x - q * ExpLib.LN_2_INT;

  // Compute e^r with a 2nd-order Taylor polynomial.
  // Safe unchecked because |r| < 1e18.
  let expR = WAD_INT + r + (r * r) / WAD_INT / 2;

  // Return e^x = 2^q * e^r.
  if (q >= 0) return expR << uint256(q);
  else return expR >> uint256(-q);
}