#![no_main]
use libfuzzer_sys::fuzz_target;
use pathfinder::math::mul_div_down;

// Fuzzing with multiple inputs
fuzz_target!(|data: (u64, u64, u64)| {
    let (a, b, denominator) = data;
    // If denominator is 0, then (a * b) / denominator will overflow
    // If a * b overflows, then (a * b) / a won't equal b
    let (_, overflowed) = a.overflowing_mul(b);
    if (denominator == 0 || overflowed || (a != 0 && (a * b) / a != b )) {
        return;
    }
    // assert_eq!(mul_div_down(a, b, denominator), ((a * b) / denominator) as u64);
    if let Ok(result) = mul_div_down(a as u128, b as u128, denominator as u128) {
        assert_eq!(result, ((a * b) / denominator) as u64);
    }
});