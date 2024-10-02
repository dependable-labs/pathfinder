use super::*;


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_total_assets() {
        assert_eq!(calculate_total_assets(&0).unwrap(), 1);
        assert_eq!(calculate_total_assets(&100).unwrap(), 101);
        assert_eq!(calculate_total_assets(&u64::MAX).unwrap(), u64::MAX as u128 + 1);
    }
    #[test]
    fn test_calculate_total_shares() {
        assert_eq!(calculate_total_shares(&0).unwrap(), 1_000_000);
        assert_eq!(calculate_total_shares(&100).unwrap(), 1_000_100);

        let result = calculate_total_shares(&u64::MAX).unwrap();
        let expected = (u64::MAX as u128) + 1_000_000;
        assert_eq!(result, expected);
    }

    #[test]
    fn test_to_shares_down() {

        // Test with zero assets
        assert_eq!(to_shares_down(&0, &100, &1000).unwrap(), 0);

        // Test with one asset
        assert_eq!(to_shares_down(&1, &0, &0).unwrap(), 1_000_000);
    }

    #[test]
    fn test_to_assets_down() {
        // Test with zero shares
        assert_eq!(to_assets_down(&0, &100, &1000).unwrap(), 0);

        // Test with one share
        assert_eq!(to_assets_down(&1, &0, &0).unwrap(), 0);

        // Test with one share, large total_assets
        assert_eq!(to_assets_down(&1, &u64::MAX, &1000).unwrap(), 18_428_315_757_951);

    }

    #[test]
    fn test_to_shares_up() {
        // Test with zero assets
        assert_eq!(to_shares_up(&0, &100, &100_000_000).unwrap(), 0);

        // Test with zero assets
        assert_eq!(to_shares_up(&10, &100, &100_000_000).unwrap(), 10_000_000);
    }

    #[test]
    fn test_to_assets_up() {
        // Test with zero shares
        assert_eq!(to_assets_up(&0, &100, &100_000_000).unwrap(), 0);

        // Test with equal assets and shares
        assert_eq!(to_assets_up(&100, &100, &100_000_000).unwrap(), 1);
    }

    #[test]
    #[should_panic(expected = "MathOverflow")]
    fn test_overflow() {
        // This should cause an overflow
        to_shares_down(&u64::MAX, &1, &u64::MAX).unwrap();
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
        let attacker_shares = to_shares_down(&attacker_deposit, &total_assets, &total_shares).unwrap();
        println!("Attacker deposit: {}, shares received: {}", attacker_deposit, attacker_shares);

        // Update total assets and shares
        total_assets += attacker_deposit;
        total_shares += attacker_shares;

        // Step 2: Large deposit comes in
        let large_deposit_shares = to_shares_down(&large_deposit, &total_assets, &total_shares).unwrap();
        println!("Large deposit: {}, shares received: {}", large_deposit, large_deposit_shares);

        // Update total assets and shares
        total_assets += large_deposit;
        total_shares += large_deposit_shares;

        // Step 3: Calculate the share of the vault owned by the attacker
        println!("Attacker's shares: {}", attacker_shares);
        println!("Total shares: {}", total_shares);
        println!("Attacker's ownership fraction: {} / {}", attacker_shares, total_shares);

        // Step 4: Attacker withdraws
        let attacker_assets = to_assets_down(&attacker_shares, &total_assets, &total_shares).unwrap();
        assert_eq!(attacker_assets, attacker_deposit, "Attacker should receive the same assets as he deposited");

        // Update total assets and shares
        total_assets -= attacker_assets;
        total_shares -= attacker_shares;

        // Step 5: Depositor withdraws
        let large_depositor_assets = to_assets_down(&large_deposit_shares, &total_assets, &total_shares).unwrap();
        assert_eq!(large_depositor_assets, large_deposit, "Large depositor should receive the same assets as he deposited");
    }
}