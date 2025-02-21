#![no_main]
use libfuzzer_sys::fuzz_target;
use pathfinder::math::mul_div_down;

// Fuzzing with multiple inputs
fuzz_target!(|data: (u128, u128, u128)| {
    let (a, b, denominator) = data;
    if denominator == 0 || (a != 0 && (a * b) / a != b) {
        return;
    }
    // assert_eq!(mul_div_down(a, b, denominator), ((a * b) / denominator) as u64);
    if let Ok(result) = mul_div_down(a, b, denominator) {
        assert_eq!(result, ((a * b) / denominator) as u64);
    }
});