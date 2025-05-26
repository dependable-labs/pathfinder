use anchor_lang::solana_program::{
    entrypoint::{HEAP_LENGTH, HEAP_START_ADDRESS},
    msg,
}; 
use std::mem::size_of;

pub struct MemoryTracker {
    initial_heap_pointer: usize,
}

impl MemoryTracker {
    pub fn new() -> Self {
        // Get the current heap pointer position
        let initial_heap_pointer = unsafe {
            *(HEAP_START_ADDRESS as usize as *mut usize)
        };
        
        Self {
            initial_heap_pointer,
        }
    }

    pub fn log_memory_usage(&self, label: &str) {
        let current_heap_pointer = unsafe {
            *(HEAP_START_ADDRESS as usize as *mut usize)
        };
        
        let used_memory = if current_heap_pointer == 0 {
            // If pointer is 0, we're at the start
            0
        } else {
            // Calculate how much memory has been used
            (HEAP_START_ADDRESS as usize + HEAP_LENGTH) - current_heap_pointer
        };

        msg!("[Memory Usage] {}: {} bytes used", label, used_memory);
    }
}