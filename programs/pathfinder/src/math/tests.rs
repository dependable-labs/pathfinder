use super::*;

#[cfg(test)]
mod tests {
    use std::char::MAX;

    use crate::MAX_RATE_AT_TARGET;

    use super::*;

    // #[test]
    // fn test_calculate_total_assets() {
    //     assert_eq!(calculate_total_assets(0).unwrap(), 1);
    //     assert_eq!(calculate_total_assets(100).unwrap(), 101);
    //     assert_eq!(calculate_total_assets(u64::MAX).unwrap(), u64::MAX as u128 + 1);
    // }
    // #[test]
    // fn test_calculate_total_shares() {
    //     assert_eq!(calculate_total_shares(0).unwrap(), 1_000_000);
    //     assert_eq!(calculate_total_shares(100).unwrap(), 1_000_100);

    //     let result = calculate_total_shares(u64::MAX).unwrap();
    //     let expected = (u64::MAX as u128) + 1_000_000;
    //     assert_eq!(result, expected);
    // }

    #[test]
    fn test_to_shares_down() {

        // Test with zero assets
        assert_eq!(to_shares_down(0, 100, 1000).unwrap(), 0);

        // Test with one asset
        assert_eq!(to_shares_down(1, 0, 0).unwrap(), 1_000_000);
    }

    #[test]
    fn test_to_assets_down() {
        // Test with zero shares
        assert_eq!(to_assets_down(0, 100, 1000).unwrap(), 0);

        // Test with one share
        assert_eq!(to_assets_down(1, 0, 0).unwrap(), 0);

        // Test with one share, large total_assets
        assert_eq!(to_assets_down(1, u64::MAX, 1000).unwrap(), 18_428_315_757_951);

    }

    #[test]
    fn test_to_shares_up() {
        // Test with zero assets
        assert_eq!(to_shares_up(0, 100, 100_000_000).unwrap(), 0);

        // Test with zero assets
        assert_eq!(to_shares_up(10, 100, 100_000_000).unwrap(), 10_000_000);
    }

    #[test]
    fn test_to_assets_up() {
        // Test with zero shares
        assert_eq!(to_assets_up(0, 100, 100_000_000).unwrap(), 0);

        // Test with equal assets and shares
        assert_eq!(to_assets_up(100, 100, 100_000_000).unwrap(), 1);
    }

    #[test]
    #[should_panic(expected = "MathOverflow")]
    fn test_overflow() {
        // This should cause an overflow
        to_shares_down(u64::MAX, 1, u64::MAX).unwrap();
    }


    #[test]
    fn test_front_running_empty_vault() {
        // Initial state of the vault (empty)
        let mut total_assets = 0;
        let mut total_shares = 0;

        // Upcoming large deposit
        let large_deposit = 1_000_000_000; // 1 billion

        // Attacker's small deposit to front-run
        let attacker_deposit = 1; // Minimum possible deposit

        // Step 1: Attacker front-runs with a minimal deposit
        let attacker_shares = to_shares_down(attacker_deposit, total_assets, total_shares).unwrap();
        println!("Attacker deposit: {}, shares received: {}", attacker_deposit, attacker_shares);

        // Update total assets and shares
        total_assets += attacker_deposit;
        total_shares += attacker_shares;

        // Step 2: Large deposit comes in
        let large_deposit_shares = to_shares_down(large_deposit, total_assets, total_shares).unwrap();
        println!("Large deposit: {}, shares received: {}", large_deposit, large_deposit_shares);

        // Update total assets and shares
        total_assets += large_deposit;
        total_shares += large_deposit_shares;

        // Step 3: Calculate the share of the vault owned by the attacker
        println!("Attacker's shares: {}", attacker_shares);
        println!("Total shares: {}", total_shares);
        println!("Attacker's ownership fraction: {} / {}", attacker_shares, total_shares);

        // Step 4: Attacker withdraws
        let attacker_assets = to_assets_down(attacker_shares, total_assets, total_shares).unwrap();
        assert_eq!(attacker_assets, attacker_deposit, "Attacker should receive the same assets as he deposited");

        // Update total assets and shares
        total_assets -= attacker_assets;
        total_shares -= attacker_shares;

        // Step 5: Depositor withdraws
        let large_depositor_assets = to_assets_down(large_deposit_shares, total_assets, total_shares).unwrap();
        assert_eq!(large_depositor_assets, large_deposit, "Large depositor should receive the same assets as he deposited");
    }


// #[test]
// fn test_w_exp() {
//     let mut x = WAD_INT; // Start at 1.0
//     let mut last_successful = 0_i128;
//     let mut last_successful_result = 0_i128;
//     let mut iterations = 0;

//     println!("Starting test with WAD_INT = {}", WAD_INT);

//     const YEAR_SECONDS: i128 = 365 * 24 * 60 * 60;
//     let increment = WAD_INT / 20; // Increment by 0.5
//     const MAX_RATE_AT_TARGET: i128 = 2 * WAD_INT / YEAR_SECONDS;

//     while x < i128::MAX / 2 {
//         iterations += 1;
        
//         let result = std::panic::catch_unwind(|| {
//             println!("x value: {}", x);
            
//             let exp = w_exp(x).unwrap();

//             println!("exp value: {}", exp);
//             w_mul_to_zero(exp, MAX_RATE_AT_TARGET).unwrap()
//         });

//         match result {
//             Ok(exp_result) => {
//                 // Validate that result is positive and reasonable
//                 if exp_result <= 0 {
//                     println!("\nINVALID RESULT FOUND (negative or zero)!");
//                     println!("At x = {} ({}WAD)", x, (x as f64) / (WAD_INT as f64));
//                     println!("Result = {} ({}WAD)", exp_result, (exp_result as f64) / (WAD_INT as f64));
//                     break;
//                 }

//                 last_successful = x;
//                 last_successful_result = exp_result;
                
//                 if iterations % 10 == 0 {
//                     println!("Success at x = {} ({}WAD)", 
//                         x, 
//                         (x as f64) / (WAD_INT as f64)
//                     );
//                     println!("Result = {} ({}WAD)", 
//                         exp_result,
//                         (exp_result as f64) / (WAD_INT as f64)
//                     );
//                 }
                
//                 x = x.saturating_add(increment);
//             },
//             _ => {
//                 println!("\nOVERFLOW FOUND!");
//                 println!("Last successful x: {} ({}WAD)", 
//                     last_successful,
//                     (last_successful as f64) / (WAD_INT as f64)
//                 );
//                 println!("Last successful result: {} ({}WAD)", 
//                     last_successful_result,
//                     (last_successful_result as f64) / (WAD_INT as f64)
//                 );
//                 println!("Failing x: {} ({}WAD)", 
//                     x,
//                     (x as f64) / (WAD_INT as f64)
//                 );
//                 println!("max rate at target: {} ", MAX_RATE_AT_TARGET);
//                 break;
//             }
//         }
//         }
//     }


    #[test]
    fn test_upper_bound_exp() {
        let result = w_exp(WEXP_UPPER_BOUND).unwrap();
        assert_eq!(result, WEXP_UPPER_VALUE);
    }
}