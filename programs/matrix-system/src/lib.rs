use anchor_lang::prelude::*;
use anchor_lang::solana_program::{self, clock::Clock};
use anchor_spl::token::{self, Token, TokenAccount};
use anchor_spl::associated_token::AssociatedToken;
use chainlink_solana as chainlink;
#[cfg(not(feature = "no-entrypoint"))]
use {solana_security_txt::security_txt};


declare_id!("6XoW7rrA651gNMXmMXtu9GqBRSSCgh41B6YCGzPd9d3h");

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
    name: "Referral Matrix System",
    project_url: "https://matrix.matrix",
    contacts: "email:01010101@matrix.io,discord:01010101,whatsapp:+55123456789",
    policy: "https://github.com/ghost-ai91/matrixv1/blob/main/SECURITY.md",
    preferred_languages: "en",
    source_code: "https://github.com/ghost-ai91/matrixv1/blob/main/programs/matrix-system/src/lib.rs",
    source_revision: env!("GITHUB_SHA", "unknown-revision"),
    source_release: env!("PROGRAM_VERSION", "unknown-version"),
    encryption: "",
    auditors: "",
    acknowledgements: "We thank all security researchers who contributed to the security of our protocol."
}

// Minimum deposit amount in USD (10 dollars in base units - 8 decimals)
const MINIMUM_USD_DEPOSIT: u64 = 10_00000000; // 10 USD with 8 decimals (Chainlink format)

// Maximum price feed staleness (24 hours in seconds)
const MAX_PRICE_FEED_AGE: i64 = 86400;

// Default SOL price in case of stale feed ($100 USD per SOL)
const DEFAULT_SOL_PRICE: i128 = 100_00000000; // $100 with 8 decimals

// Maximum number of upline accounts that can be processed in a single transaction
const MAX_UPLINE_DEPTH: usize = 6;

// Number of Vault A accounts in the remaining_accounts
const VAULT_A_ACCOUNTS_COUNT: usize = 4;

// Constants for strict address verification
pub mod verified_addresses {
    use solana_program::pubkey::Pubkey;
    
    // Meteora Pool address
    pub static POOL_ADDRESS: Pubkey = solana_program::pubkey!("FrQ5KsAgjCe3FFg6ZENri8feDft54tgnATxyffcasuxU");
    
    // Vault A addresses (DONUT token vault)
    pub static A_VAULT: Pubkey = solana_program::pubkey!("4ndfcH16GKY76bzDkKfyVwHMoF8oY75KES2VaAhUYksN");
    pub static A_VAULT_LP: Pubkey = solana_program::pubkey!("CocstBGbeDVyTJWxbWs4docwWapVADAo1xXQSh9RfPMz");
    pub static A_VAULT_LP_MINT: Pubkey = solana_program::pubkey!("6f2FVX5UT5uBtgknc8fDj119Z7DQoLJeKRmBq7j1zsVi");
    pub static A_TOKEN_VAULT: Pubkey = solana_program::pubkey!("6m1wvYoPrwjAnbuGMqpMoodQaq4VnZXRjrzufXnPSjmj");
    
    // Meteora pool addresses (Vault B - SOL)
    pub static B_VAULT_LP: Pubkey = solana_program::pubkey!("HJNs8hPTzs9i6AVFkRDDMFVEkrrUoV7H7LDZHdCWvxn7");
    pub static B_VAULT: Pubkey = solana_program::pubkey!("FERjPVNEa7Udq8CEv68h6tPL46Tq7ieE49HrE2wea3XT");
    pub static B_TOKEN_VAULT: Pubkey = solana_program::pubkey!("HZeLxbZ9uHtSpwZC3LBr4Nubd14iHwz7bRSghRZf5VCG");
    pub static B_VAULT_LP_MINT: Pubkey = solana_program::pubkey!("BvoAjwEDhpLzs3jtu4H72j96ShKT5rvZE9RP1vgpfSM");
    
    // Token addresses
    pub static TOKEN_MINT: Pubkey = solana_program::pubkey!("F1vCKXMix75KigbwZUXkVU97NiE1H2ToopttH67ydqvq");
    pub static WSOL_MINT: Pubkey = solana_program::pubkey!("So11111111111111111111111111111111111111112");
    
    // Chainlink addresses (Devnet)
    pub static CHAINLINK_PROGRAM: Pubkey = solana_program::pubkey!("HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny");
    pub static SOL_USD_FEED: Pubkey = solana_program::pubkey!("99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR");
    
    // CRITICAL SECURITY ADDRESSES 
    pub static METEORA_VAULT_PROGRAM: Pubkey = solana_program::pubkey!("24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi");
    
    // Meteora AMM addresses
    pub static METEORA_AMM_PROGRAM: Pubkey = solana_program::pubkey!("Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB");
    
    // Protocol fee accounts (from Solscan)
    pub static PROTOCOL_TOKEN_B_FEE: Pubkey = solana_program::pubkey!("88fLv3iEY7ubFCjwCzfzA7FsPG8xSBFicSPS8T8fX4Kq");
}

//Admin account
pub mod admin_addresses {
    use solana_program::pubkey::Pubkey;

    pub static MULTISIG_TREASURY: Pubkey = solana_program::pubkey!("9kfwkhwRmjRdcUKd8YBXJKnE5Yux9k111uUSN8zbNCYh");

    pub static AUTHORIZED_INITIALIZER: Pubkey = solana_program::pubkey!("6psmWBYCLTVbX31Aq7BDRCHpd33EN5ihtTWQbb4quDy6");
}

// Program state structure
#[account]
pub struct ProgramState {
    pub owner: Pubkey,
    pub multisig_treasury: Pubkey,
    pub next_upline_id: u32,
    pub next_chain_id: u32,
}

impl ProgramState {
    pub const SIZE: usize = 32 + 32 + 4 + 4; // owner + multisig_treasury + next_upline_id + next_chain_id
}

// Structure to store complete information for each upline
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default, Debug)]
pub struct UplineEntry {
    pub pda: Pubkey,       // PDA of the user account
    pub wallet: Pubkey,    // Original user wallet
}

// Referral upline structure
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ReferralUpline {
    pub id: u32,
    pub depth: u8,
    pub upline: Vec<UplineEntry>, // Stores UplineEntry with all information
}

// Referral matrix structure
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ReferralChain {
    pub id: u32,
    pub slots: [Option<Pubkey>; 3],
    pub filled_slots: u8,
}

// User account structure
#[account]
#[derive(Default)]
pub struct UserAccount {
    pub is_registered: bool,
    pub referrer: Option<Pubkey>,
    pub owner_wallet: Pubkey,           // Account owner's wallet
    pub upline: ReferralUpline,
    pub chain: ReferralChain,
    pub reserved_sol: u64,       // SOL reserved from the second slot
}

impl UserAccount {
    pub const SIZE: usize = 1 + // is_registered
                           1 + 32 + // Option<Pubkey> (1 for is_some + 32 for Pubkey)
                           32 + // owner_wallet
                           4 + 1 + 4 + (MAX_UPLINE_DEPTH * (32 + 32)) + // ReferralUpline
                           4 + (3 * (1 + 32)) + 1 + // ReferralChain
                           8;  // reserved_sol
}

// Error codes
#[error_code]
pub enum ErrorCode {
    #[msg("Referrer account is not registered")]
    ReferrerNotRegistered,

    #[msg("Missing required vault A accounts")]
    MissingVaultAAccounts,
    
    #[msg("Not authorized")]
    NotAuthorized,

    #[msg("Slot account not owned by program")]
    InvalidSlotOwner,

    #[msg("Slot account not registered")]
    SlotNotRegistered,

    #[msg("Insufficient deposit amount")]
    InsufficientDeposit,

    #[msg("Failed to process SOL reserve")]
    SolReserveFailed,

    #[msg("Failed to process referrer payment")]
    ReferrerPaymentFailed,
    
    #[msg("Failed to wrap SOL to WSOL")]
    WrapSolFailed,
    
    #[msg("Failed to unwrap WSOL to SOL")]
    UnwrapSolFailed,
    
    #[msg("Invalid wallet for ATA")]
    InvalidWalletForATA,

    #[msg("Missing required account for upline")]
    MissingUplineAccount,
    
    #[msg("Payment wallet is not a system account")]
    PaymentWalletInvalid,
    
    #[msg("Failed to read price feed")]
    PriceFeedReadFailed,
    
    #[msg("Price feed too old")]
    PriceFeedTooOld,
    
    #[msg("Invalid Chainlink program")]
    InvalidChainlinkProgram,
    
    #[msg("Invalid price feed")]
    InvalidPriceFeed,
    
    #[msg("Invalid pool address")]
    InvalidPoolAddress,
    
    #[msg("Invalid vault address")]
    InvalidVaultAddress,
    
    #[msg("Invalid token mint address")]
    InvalidTokenMintAddress,
    
    #[msg("Invalid vault program address")]
    InvalidVaultProgram,
    
    #[msg("Invalid AMM program")]
    InvalidAmmProgram,
    
    #[msg("Invalid protocol fee account")]
    InvalidProtocolFeeAccount,
    
    #[msg("Failed to process swap")]
    SwapFailed,
    
    #[msg("Failed to burn tokens")]
    BurnFailed,
    
    #[msg("Failed to read Meteora pool data")]
    PriceMeteoraReadFailed,
    
    #[msg("Meteora pool calculation overflow")]
    MeteoraCalculationOverflow,
}

// Event structure for slot filling
#[event]
pub struct SlotFilled {
    pub slot_idx: u8,     // Slot index (0, 1, 2)
    pub chain_id: u32,    // Chain ID
    pub user: Pubkey,     // User who filled the slot
    pub owner: Pubkey,    // Owner of the matrix
}

// Decimal handling for price display
#[derive(Default)]
pub struct Decimal {
    pub value: i128,
    pub decimals: u32,
}

impl Decimal {
    pub fn new(value: i128, decimals: u32) -> Self {
        Decimal { value, decimals }
    }
}

impl std::fmt::Display for Decimal {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let mut scaled_val = self.value.to_string();
        if scaled_val.len() <= self.decimals as usize {
            scaled_val.insert_str(
                0,
                &vec!["0"; self.decimals as usize - scaled_val.len()].join(""),
            );
            scaled_val.insert_str(0, "0.");
        } else {
            scaled_val.insert(scaled_val.len() - self.decimals as usize, '.');
        }
        f.write_str(&scaled_val)
    }
}

// Helper function to force memory cleanup
fn force_memory_cleanup() {
    // Just create a vector to force a heap allocation
    let _dummy = Vec::<u8>::new();
    // The vector will be automatically freed when it goes out of scope
}

// Function to get SOL/USD price from Chainlink feed
fn get_sol_usd_price<'info>(
    chainlink_feed: &AccountInfo<'info>,
    chainlink_program: &AccountInfo<'info>,
) -> Result<(i128, u32, i64, i64)> { // Returns also the feed_timestamp
    // Get the latest round data
    let round = chainlink::latest_round_data(
        chainlink_program.clone(),
        chainlink_feed.clone(),
    ).map_err(|_| error!(ErrorCode::PriceFeedReadFailed))?;

    // Get the decimals
    let decimals = chainlink::decimals(
        chainlink_program.clone(),
        chainlink_feed.clone(),
    ).map_err(|_| error!(ErrorCode::PriceFeedReadFailed))?;

    // Get current timestamp
    let clock = Clock::get()?;
    let current_timestamp = clock.unix_timestamp;
    
    // Return price, decimals, current time, and feed timestamp
    Ok((round.answer, decimals.into(), current_timestamp, round.timestamp.into()))
}

// Function to calculate minimum SOL deposit based on USD price
fn calculate_minimum_sol_deposit<'info>(
    chainlink_feed: &AccountInfo<'info>, 
    chainlink_program: &AccountInfo<'info>
) -> Result<u64> {
    let (price, decimals, current_timestamp, feed_timestamp) = get_sol_usd_price(chainlink_feed, chainlink_program)?;
    
    // Check if price feed is too old (24 hours)
    let age = current_timestamp - feed_timestamp;
    
    let sol_price_per_unit = if age > MAX_PRICE_FEED_AGE {
        // Use default price of $100 per SOL
        DEFAULT_SOL_PRICE
    } else {
        price
    };
    
    // Convert price to SOL per unit using dynamic decimals
    let price_f64 = sol_price_per_unit as f64 / 10f64.powf(decimals as f64);
    
    // Convert MINIMUM_USD_DEPOSIT from 8 decimals to floating point
    let minimum_usd_f64 = MINIMUM_USD_DEPOSIT as f64 / 1_00000000.0; // Convert from 8 decimals
    
    // Calculate minimum SOL needed
    let minimum_sol_f64 = minimum_usd_f64 / price_f64;
    
    // Convert to lamports (9 decimals for SOL)
    let minimum_lamports = (minimum_sol_f64 * 1_000_000_000.0) as u64;
    
    Ok(minimum_lamports)
}

// Function to strictly verify an address
fn verify_address_strict(provided: &Pubkey, expected: &Pubkey, error_code: ErrorCode) -> Result<()> {
    if provided != expected {
        return Err(error!(error_code));
    }
    Ok(())
}

// Verify Chainlink addresses
fn verify_chainlink_addresses<'info>(
    chainlink_program: &Pubkey,
    chainlink_feed: &Pubkey,
) -> Result<()> {
    verify_address_strict(chainlink_program, &verified_addresses::CHAINLINK_PROGRAM, ErrorCode::InvalidChainlinkProgram)?;
    verify_address_strict(chainlink_feed, &verified_addresses::SOL_USD_FEED, ErrorCode::InvalidPriceFeed)?;
    
    Ok(())
}

// Verify all fixed addresses
fn verify_all_fixed_addresses(
    pool: &Pubkey,
    b_vault: &Pubkey,        
    b_token_vault: &Pubkey,  
    b_vault_lp_mint: &Pubkey, 
    b_vault_lp: &Pubkey,
    token_mint: &Pubkey,
    wsol_mint: &Pubkey,
) -> Result<()> {
    verify_address_strict(pool, &verified_addresses::POOL_ADDRESS, ErrorCode::InvalidPoolAddress)?;
    verify_address_strict(b_vault_lp, &verified_addresses::B_VAULT_LP, ErrorCode::InvalidVaultAddress)?;
    verify_address_strict(b_vault, &verified_addresses::B_VAULT, ErrorCode::InvalidVaultAddress)?;
    verify_address_strict(b_token_vault, &verified_addresses::B_TOKEN_VAULT, ErrorCode::InvalidVaultAddress)?;
    verify_address_strict(b_vault_lp_mint, &verified_addresses::B_VAULT_LP_MINT, ErrorCode::InvalidVaultAddress)?;
    verify_address_strict(token_mint, &verified_addresses::TOKEN_MINT, ErrorCode::InvalidTokenMintAddress)?;
    verify_address_strict(wsol_mint, &verified_addresses::WSOL_MINT, ErrorCode::InvalidTokenMintAddress)?;
    
    Ok(())
}

// Verify vault A addresses
fn verify_vault_a_addresses(
    a_vault: &Pubkey,
    a_vault_lp: &Pubkey,
    a_vault_lp_mint: &Pubkey,
    a_token_vault: &Pubkey
) -> Result<()> {
    verify_address_strict(a_vault, &verified_addresses::A_VAULT, ErrorCode::InvalidVaultAddress)?;
    verify_address_strict(a_vault_lp, &verified_addresses::A_VAULT_LP, ErrorCode::InvalidVaultAddress)?;
    verify_address_strict(a_vault_lp_mint, &verified_addresses::A_VAULT_LP_MINT, ErrorCode::InvalidVaultAddress)?;
    verify_address_strict(a_token_vault, &verified_addresses::A_TOKEN_VAULT, ErrorCode::InvalidVaultAddress)?;
    
    Ok(())
}

// Verify if an account is a valid wallet (system account)
fn verify_wallet_is_system_account<'info>(wallet: &AccountInfo<'info>) -> Result<()> {
    if wallet.owner != &solana_program::system_program::ID {
        return Err(error!(ErrorCode::PaymentWalletInvalid));
    }
    
    Ok(())
}

// Function to reserve SOL for the referrer
fn process_reserve_sol<'info>(
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    let ix = solana_program::system_instruction::transfer(
        &from.key(),
        &to.key(),
        amount
    );
    
    solana_program::program::invoke(
        &ix,
        &[from.clone(), to.clone()],
    ).map_err(|_| error!(ErrorCode::SolReserveFailed))?;
    
    Ok(())
}

// Function process_pay_referrer with explicit lifetimes
fn process_pay_referrer<'info>(
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    amount: u64,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    verify_wallet_is_system_account(to)?;
    
    let ix = solana_program::system_instruction::transfer(
        &from.key(),
        &to.key(),
        amount
    );
    
    // Create a vector of AccountInfo to avoid lifetime problems
    let mut accounts = Vec::with_capacity(2);
    accounts.push(from.clone());
    accounts.push(to.clone());
    
    solana_program::program::invoke_signed(
        &ix,
        &accounts,
        signer_seeds,
    ).map_err(|_| error!(ErrorCode::ReferrerPaymentFailed))?;
    
    Ok(())
}

/// Calculate expected swap output
fn calculate_swap_amount_out<'info>(
    pool: &AccountInfo<'info>,
    a_vault: &AccountInfo<'info>,
    b_vault: &AccountInfo<'info>,
    a_vault_lp: &AccountInfo<'info>,
    b_vault_lp: &AccountInfo<'info>,
    a_vault_lp_mint: &AccountInfo<'info>,
    b_vault_lp_mint: &AccountInfo<'info>,
    amount_in: u64,
) -> Result<u64> {
    const PRECISION_FACTOR: i128 = 1_000_000_000;
    
    // Use separate scopes for each data borrowing to avoid lifetime issues
    let pool_enabled = {
        // Check if pool is enabled
        let pool_data = pool.try_borrow_data()?;
        let enabled_offset = 8 + 225;
        
        if pool_data.len() <= enabled_offset {
            return Err(error!(ErrorCode::PriceMeteoraReadFailed));
        }
        
        pool_data[enabled_offset] != 0
    };
    
    if !pool_enabled {
        msg!("Pool is disabled");
        return Err(error!(ErrorCode::PriceMeteoraReadFailed));
    }
    
    // Read vault A total amount in a separate scope
    let vault_a_total = {
        let vault_data = a_vault.try_borrow_data()?;
        if vault_data.len() < 19 {
            return Err(error!(ErrorCode::PriceMeteoraReadFailed));
        }
        
        u64::from_le_bytes([
            vault_data[11], vault_data[12], vault_data[13], vault_data[14],
            vault_data[15], vault_data[16], vault_data[17], vault_data[18]
        ])
    };
    
    force_memory_cleanup();
    
    // Read vault B total amount in a separate scope
    let vault_b_total = {
        let vault_data = b_vault.try_borrow_data()?;
        if vault_data.len() < 19 {
            return Err(error!(ErrorCode::PriceMeteoraReadFailed));
        }
        
        u64::from_le_bytes([
            vault_data[11], vault_data[12], vault_data[13], vault_data[14],
            vault_data[15], vault_data[16], vault_data[17], vault_data[18]
        ])
    };
    
    force_memory_cleanup();
    
    // Read LP amounts in separate scopes
    let a_vault_lp_amount = {
        let a_data = a_vault_lp.try_borrow_data()?;
        
        if a_data.len() < 72 {
            return Err(error!(ErrorCode::PriceMeteoraReadFailed));
        }
        
        u64::from_le_bytes([
            a_data[64], a_data[65], a_data[66], a_data[67],
            a_data[68], a_data[69], a_data[70], a_data[71]
        ])
    };
    
    force_memory_cleanup();
    
    let b_vault_lp_amount = {
        let b_data = b_vault_lp.try_borrow_data()?;
        
        if b_data.len() < 72 {
            return Err(error!(ErrorCode::PriceMeteoraReadFailed));
        }
        
        u64::from_le_bytes([
            b_data[64], b_data[65], b_data[66], b_data[67],
            b_data[68], b_data[69], b_data[70], b_data[71]
        ])
    };
    
    force_memory_cleanup();
    
    // Read LP supplies in separate scopes
    let a_vault_lp_supply = {
        let a_mint_data = a_vault_lp_mint.try_borrow_data()?;
        
        if a_mint_data.len() < 44 {
            return Err(error!(ErrorCode::PriceMeteoraReadFailed));
        }
        
        u64::from_le_bytes([
            a_mint_data[36], a_mint_data[37], a_mint_data[38], a_mint_data[39],
            a_mint_data[40], a_mint_data[41], a_mint_data[42], a_mint_data[43]
        ])
    };
    
    force_memory_cleanup();
    
    let b_vault_lp_supply = {
        let b_mint_data = b_vault_lp_mint.try_borrow_data()?;
        
        if b_mint_data.len() < 44 {
            return Err(error!(ErrorCode::PriceMeteoraReadFailed));
        }
        
        u64::from_le_bytes([
            b_mint_data[36], b_mint_data[37], b_mint_data[38], b_mint_data[39],
            b_mint_data[40], b_mint_data[41], b_mint_data[42], b_mint_data[43]
        ])
    };
    
    force_memory_cleanup();
    
    // Calculate token amounts
    let token_a_amount = if a_vault_lp_supply == 0 {
        0
    } else {
        let numerator = (a_vault_lp_amount as u128)
            .checked_mul(vault_a_total as u128)
            .ok_or(error!(ErrorCode::MeteoraCalculationOverflow))?;
        
        let result = numerator
            .checked_div(a_vault_lp_supply as u128)
            .ok_or(error!(ErrorCode::MeteoraCalculationOverflow))?;
        
        u64::try_from(result).map_err(|_| error!(ErrorCode::MeteoraCalculationOverflow))?
    };

    let token_b_amount = if b_vault_lp_supply == 0 {
        0
    } else {
        let numerator = (b_vault_lp_amount as u128)
            .checked_mul(vault_b_total as u128)
            .ok_or(error!(ErrorCode::MeteoraCalculationOverflow))?;
        
        let result = numerator
            .checked_div(b_vault_lp_supply as u128)
            .ok_or(error!(ErrorCode::MeteoraCalculationOverflow))?;
        
        u64::try_from(result).map_err(|_| error!(ErrorCode::MeteoraCalculationOverflow))?
    };
    
    msg!("Token amounts - A: {}, B: {}", token_a_amount, token_b_amount);
    
    if token_a_amount == 0 || token_b_amount == 0 {
        return Err(error!(ErrorCode::PriceMeteoraReadFailed));
    }
    
    // Calculate ratio
    let ratio = (token_a_amount as i128)
        .checked_mul(PRECISION_FACTOR)
        .and_then(|n| n.checked_div(token_b_amount as i128))
        .ok_or(error!(ErrorCode::MeteoraCalculationOverflow))?;
    
    // Calculate DONUT tokens
    let donut_tokens = (amount_in as i128)
        .checked_mul(ratio)
        .and_then(|n| n.checked_div(PRECISION_FACTOR))
        .ok_or(error!(ErrorCode::MeteoraCalculationOverflow))?;
    
    if donut_tokens > i128::from(u64::MAX) || donut_tokens < 0 {
        return Err(error!(ErrorCode::MeteoraCalculationOverflow));
    }
    
    let result = donut_tokens as u64;
    
    // Apply 99% slippage tolerance (aceita receber apenas 1% do esperado)
    let minimum_out = result
        .checked_mul(1)  // 1% do valor esperado
        .and_then(|n| n.checked_div(100))
        .ok_or(error!(ErrorCode::MeteoraCalculationOverflow))?;
    
    msg!("Expected output: {} DONUT, Minimum accepted (99% slippage): {} DONUT", result, minimum_out);
    
    Ok(if minimum_out == 0 { 1 } else { minimum_out })
}

/// Process swap from WSOL to DONUT
fn process_swap_wsol_to_donut<'info>(
    pool: &AccountInfo<'info>,
    user_wallet: &AccountInfo<'info>,
    user_wsol_account: &AccountInfo<'info>,
    user_donut_account: &AccountInfo<'info>,
    a_vault: &AccountInfo<'info>,
    b_vault: &AccountInfo<'info>,
    a_token_vault: &AccountInfo<'info>,
    b_token_vault: &AccountInfo<'info>,
    a_vault_lp_mint: &AccountInfo<'info>,
    b_vault_lp_mint: &AccountInfo<'info>,
    a_vault_lp: &AccountInfo<'info>,
    b_vault_lp: &AccountInfo<'info>,
    protocol_token_fee: &AccountInfo<'info>,
    vault_program: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
    amm_program: &AccountInfo<'info>,
    amount_in: u64,
    minimum_amount_out: u64,
) -> Result<()> {
    msg!("Starting swap: {} WSOL for DONUT (min: {})", amount_in, minimum_amount_out);
    
    // Build swap accounts
    let swap_accounts = vec![
        solana_program::instruction::AccountMeta::new(pool.key(), false),
        solana_program::instruction::AccountMeta::new(user_wsol_account.key(), false),
        solana_program::instruction::AccountMeta::new(user_donut_account.key(), false),
        solana_program::instruction::AccountMeta::new(a_vault.key(), false),
        solana_program::instruction::AccountMeta::new(b_vault.key(), false),
        solana_program::instruction::AccountMeta::new(a_token_vault.key(), false),
        solana_program::instruction::AccountMeta::new(b_token_vault.key(), false),
        solana_program::instruction::AccountMeta::new(a_vault_lp_mint.key(), false),
        solana_program::instruction::AccountMeta::new(b_vault_lp_mint.key(), false),
        solana_program::instruction::AccountMeta::new(a_vault_lp.key(), false),
        solana_program::instruction::AccountMeta::new(b_vault_lp.key(), false),
        solana_program::instruction::AccountMeta::new(protocol_token_fee.key(), false),
        solana_program::instruction::AccountMeta::new_readonly(user_wallet.key(), true),
        solana_program::instruction::AccountMeta::new_readonly(vault_program.key(), false),
        solana_program::instruction::AccountMeta::new_readonly(token_program.key(), false),
    ];
    
    // Swap discriminator: sha256("global:swap")[0..8]
    let mut data = vec![248, 198, 158, 145, 225, 117, 135, 200];
    data.extend_from_slice(&amount_in.to_le_bytes());
    data.extend_from_slice(&minimum_amount_out.to_le_bytes());
    
    let swap_instruction = solana_program::instruction::Instruction {
        program_id: amm_program.key(),
        accounts: swap_accounts,
        data,
    };
    
    // Use Vec for account clones instead of array
    let mut accounts_vec = Vec::with_capacity(15);
    accounts_vec.push(pool.clone());
    accounts_vec.push(user_wsol_account.clone());
    accounts_vec.push(user_donut_account.clone());
    accounts_vec.push(a_vault.clone());
    accounts_vec.push(b_vault.clone());
    accounts_vec.push(a_token_vault.clone());
    accounts_vec.push(b_token_vault.clone());
    accounts_vec.push(a_vault_lp_mint.clone());
    accounts_vec.push(b_vault_lp_mint.clone());
    accounts_vec.push(a_vault_lp.clone());
    accounts_vec.push(b_vault_lp.clone());
    accounts_vec.push(protocol_token_fee.clone());
    accounts_vec.push(user_wallet.clone());
    accounts_vec.push(vault_program.clone());
    accounts_vec.push(token_program.clone());
    
    // Execute swap
    solana_program::program::invoke(
        &swap_instruction,
        &accounts_vec,
    ).map_err(|e| {
        msg!("Swap failed: {:?}", e);
        error!(ErrorCode::SwapFailed)
    })?;
    
    msg!("Swap completed successfully");
    Ok(())
}

/// Process swap and burn
fn process_swap_and_burn<'info>(
    pool: &AccountInfo<'info>,
    user_wallet: &AccountInfo<'info>,
    user_wsol_account: &AccountInfo<'info>,
    user_donut_account: &AccountInfo<'info>,
    a_vault: &AccountInfo<'info>,
    b_vault: &AccountInfo<'info>,
    a_token_vault: &AccountInfo<'info>,
    b_token_vault: &AccountInfo<'info>,
    a_vault_lp_mint: &AccountInfo<'info>,
    b_vault_lp_mint: &AccountInfo<'info>,
    a_vault_lp: &AccountInfo<'info>,
    b_vault_lp: &AccountInfo<'info>,
    token_mint: &AccountInfo<'info>,
    protocol_token_fee: &AccountInfo<'info>,
    vault_program: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
    amm_program: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    // Step 1: Calculate minimum DONUT expected
    let minimum_donut_out = calculate_swap_amount_out(
        pool,
        a_vault,
        b_vault,
        a_vault_lp,
        b_vault_lp,
        a_vault_lp_mint,
        b_vault_lp_mint,
        amount,
    )?;

    // Step 2: Execute swap
    process_swap_wsol_to_donut(
        pool,
        user_wallet,
        user_wsol_account,
        user_donut_account,
        a_vault,
        b_vault,
        a_token_vault,
        b_token_vault,
        a_vault_lp_mint,
        b_vault_lp_mint,
        a_vault_lp,
        b_vault_lp,
        protocol_token_fee,
        vault_program,
        token_program,
        amm_program,
        amount,
        minimum_donut_out,
    )?;

    // Force cleanup after swap
    force_memory_cleanup();

    // Step 3: Get DONUT balance in separate scope
    let donut_balance = {
        let donut_account_data = TokenAccount::try_deserialize(&mut &user_donut_account.data.borrow()[..])?;
        donut_account_data.amount
    };
    
    msg!("DONUT balance after swap: {}", donut_balance);

    // Step 4: Burn DONUT tokens
    if donut_balance > 0 {
        msg!("Burning {} DONUT tokens...", donut_balance);
        
        let burn_ix = spl_token::instruction::burn(
            &token_program.key(),
            &user_donut_account.key(),
            &token_mint.key(),
            &user_wallet.key(),
            &[],
            donut_balance,
        ).map_err(|_| error!(ErrorCode::BurnFailed))?;
        
        // Use Vec for account clones to avoid lifetime issues
        let mut burn_accounts = Vec::with_capacity(3);
        burn_accounts.push(user_donut_account.clone());
        burn_accounts.push(token_mint.clone());
        burn_accounts.push(user_wallet.clone());
        
        solana_program::program::invoke(
            &burn_ix,
            &burn_accounts,
        ).map_err(|e| {
            msg!("Burn failed: {:?}", e);
            error!(ErrorCode::BurnFailed)
        })?;
        
        msg!("✅ Successfully burned {} DONUT tokens", donut_balance);
    } else {
        msg!("⚠️ No DONUT balance to burn");
    }

    Ok(())
}

/// Process the direct referrer's matrix when a new user registers
/// Returns (bool, Pubkey) where:
/// - bool: indicates if the matrix was completed
/// - Pubkey: referrer key for use in recursion
fn process_referrer_chain<'info>(
   user_key: &Pubkey,
   referrer: &mut Account<'_, UserAccount>,
   next_chain_id: u32,
) -> Result<(bool, Pubkey)> {
   let slot_idx = referrer.chain.filled_slots as usize;
   if slot_idx >= 3 {
       return Ok((false, referrer.key())); 
   }

   referrer.chain.slots[slot_idx] = Some(*user_key);

   // Emit slot filled event
   emit!(SlotFilled {
       slot_idx: slot_idx as u8,
       chain_id: referrer.chain.id,
       user: *user_key,
       owner: referrer.key(),
   });

   referrer.chain.filled_slots += 1;

   if referrer.chain.filled_slots == 3 {
       referrer.chain.id = next_chain_id;
       referrer.chain.slots = [None, None, None];
       referrer.chain.filled_slots = 0;

       return Ok((true, referrer.key()));
   }

   Ok((false, referrer.key()))
}

// Accounts for initialize instruction
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + ProgramState::SIZE
    )]
    pub state: Account<'info, ProgramState>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// Accounts for registration without referrer
#[derive(Accounts)]
#[instruction(deposit_amount: u64)]
pub struct RegisterWithoutReferrerDeposit<'info> {
    #[account(mut)]
    pub state: Box<Account<'info, ProgramState>>,

    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(mut)]
    pub user_wallet: Signer<'info>,
    
    #[account(
        init,
        payer = user_wallet,
        space = 8 + UserAccount::SIZE,
        seeds = [b"user_account", user_wallet.key().as_ref()],
        bump
    )]
    pub user: Box<Account<'info, UserAccount>>,

    /// User's WSOL account (will be created)
    #[account(
        init_if_needed,
        payer = user_wallet,
        associated_token::mint = wsol_mint,
        associated_token::authority = user_wallet
    )]
    pub user_wsol_account: Box<Account<'info, TokenAccount>>,
    
    /// Account to receive DONUT tokens (will be created)
    #[account(
        init_if_needed,
        payer = user_wallet,
        associated_token::mint = token_mint,
        associated_token::authority = user_wallet
    )]
    pub user_donut_account: Box<Account<'info, TokenAccount>>,
    
    // WSOL mint
    /// CHECK: This is the fixed WSOL mint address
    pub wsol_mint: AccountInfo<'info>,

    // Deposit Accounts (same logic as Slot 1)
    /// CHECK: Pool account (PDA)
    #[account(mut)]
    pub pool: UncheckedAccount<'info>,

    // Existing accounts for vault B (SOL)
    /// CHECK: Vault account for token B (SOL)
    #[account(mut)]
    pub b_vault: UncheckedAccount<'info>,

    /// CHECK: Token vault account for token B (SOL)
    #[account(mut)]
    pub b_token_vault: UncheckedAccount<'info>,

    /// CHECK: LP token mint for vault B
    #[account(mut)]
    pub b_vault_lp_mint: UncheckedAccount<'info>,

    /// CHECK: LP token account for vault B
    #[account(mut)]
    pub b_vault_lp: UncheckedAccount<'info>,

    /// CHECK: Vault program
    pub vault_program: UncheckedAccount<'info>,

    // TOKEN MINT - Added for base user
    /// CHECK: Token mint for token operations
    #[account(mut)]
    pub token_mint: UncheckedAccount<'info>,
    
    /// CHECK: Protocol fee account for Meteora
    #[account(mut)]
    pub protocol_token_fee: UncheckedAccount<'info>,
    
    /// CHECK: Meteora Dynamic AMM program
    pub amm_program: UncheckedAccount<'info>,

    // Required programs
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

// Structure for registration with SOL in a single transaction
// Now includes Chainlink accounts and remaining_accounts
#[derive(Accounts)]
#[instruction(deposit_amount: u64)]
pub struct RegisterWithSolDeposit<'info> {
    #[account(mut)]
    pub state: Box<Account<'info, ProgramState>>,

    #[account(mut)]
    pub user_wallet: Signer<'info>,

    // Reference accounts
    #[account(mut)]
    pub referrer: Box<Account<'info, UserAccount>>,
    
    #[account(mut)]
    pub referrer_wallet: SystemAccount<'info>,

    // User account
    #[account(
        init,
        payer = user_wallet,
        space = 8 + UserAccount::SIZE,
        seeds = [b"user_account", user_wallet.key().as_ref()],
        bump
    )]
    pub user: Box<Account<'info, UserAccount>>,

    // New WSOL ATA account
    #[account(
        init,
        payer = user_wallet,
        associated_token::mint = wsol_mint,
        associated_token::authority = user_wallet
    )]
    pub user_wsol_account: Box<Account<'info, TokenAccount>>,
    
    // Account to receive DONUT tokens
    #[account(
        init_if_needed,
        payer = user_wallet,
        associated_token::mint = token_mint,
        associated_token::authority = user_wallet
    )]
    pub user_donut_account: Account<'info, TokenAccount>,
    
    // WSOL mint
    /// CHECK: This is the fixed WSOL mint address
    pub wsol_mint: AccountInfo<'info>,

    // Deposit Accounts (Slot 1 and 3)
    /// CHECK: Pool account (PDA)
    #[account(mut)]
    pub pool: UncheckedAccount<'info>,

    // Existing accounts for vault B (SOL)
    /// CHECK: Vault account for token B (SOL)
    #[account(mut)]
    pub b_vault: UncheckedAccount<'info>,

    /// CHECK: Token vault account for token B (SOL)
    #[account(mut)]
    pub b_token_vault: UncheckedAccount<'info>,

    /// CHECK: LP token mint for vault B
    #[account(mut)]
    pub b_vault_lp_mint: UncheckedAccount<'info>,

    /// CHECK: LP token account for vault B
    #[account(mut)]
    pub b_vault_lp: UncheckedAccount<'info>,

    /// CHECK: Vault program
    pub vault_program: UncheckedAccount<'info>,

    // Accounts for SOL reserve (Slot 2)
    #[account(
        mut,
        seeds = [b"program_sol_vault"],
        bump
    )]
    pub program_sol_vault: SystemAccount<'info>,
    
    // TOKEN MINT
    /// CHECK: Token mint for token operations
    #[account(mut)]
    pub token_mint: UncheckedAccount<'info>,
    
    /// CHECK: Protocol fee account for Meteora
    #[account(mut)]
    pub protocol_token_fee: UncheckedAccount<'info>,
    
    /// CHECK: Meteora Dynamic AMM program
    pub amm_program: UncheckedAccount<'info>,

    // Required programs
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[program]
pub mod referral_system {
    use super::*;

  // Initialize program state
pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    if ctx.accounts.owner.key() != admin_addresses::AUTHORIZED_INITIALIZER {
        return Err(error!(ErrorCode::NotAuthorized));
    }

    let state = &mut ctx.accounts.state;
    state.owner = ctx.accounts.owner.key();
    state.multisig_treasury = admin_addresses::MULTISIG_TREASURY;
    state.next_upline_id = 1;
    state.next_chain_id = 1;
    
    Ok(())
}

// Corrigido com lifetimes explícitos para resolver o problema
pub fn register_without_referrer<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, RegisterWithoutReferrerDeposit<'info>>, 
    deposit_amount: u64
) -> Result<()> {
    // Verify if the caller is the multisig treasury
    if ctx.accounts.owner.key() != ctx.accounts.state.multisig_treasury {
        return Err(error!(ErrorCode::NotAuthorized));
    }
   
    // STRICT VERIFICATION OF ALL ADDRESSES
    verify_all_fixed_addresses(
        &ctx.accounts.pool.key(),
        &ctx.accounts.b_vault.key(),
        &ctx.accounts.b_token_vault.key(),
        &ctx.accounts.b_vault_lp_mint.key(),
        &ctx.accounts.b_vault_lp.key(),
        &ctx.accounts.token_mint.key(),
        &ctx.accounts.wsol_mint.key(),
    )?;
    
    // CRITICAL: Validate vault program
    verify_address_strict(
        &ctx.accounts.vault_program.key(), 
        &verified_addresses::METEORA_VAULT_PROGRAM, 
        ErrorCode::InvalidVaultProgram
    )?;
    
    // Validate AMM program
    verify_address_strict(
        &ctx.accounts.amm_program.key(),
        &verified_addresses::METEORA_AMM_PROGRAM,
        ErrorCode::InvalidAmmProgram
    )?;
    
    // Validate protocol fee account - using TOKEN_B_FEE since we're swapping WSOL
    verify_address_strict(
        &ctx.accounts.protocol_token_fee.key(),
        &verified_addresses::PROTOCOL_TOKEN_B_FEE,
        ErrorCode::InvalidProtocolFeeAccount
    )?;

    // Use global upline ID
    let state = &mut ctx.accounts.state;
    let upline_id = state.next_upline_id;
    let chain_id = state.next_chain_id;

    state.next_upline_id += 1;
    state.next_chain_id += 1;

    // Create new user data
    let user = &mut ctx.accounts.user;

    // Initialize user data with an empty upline structure
    user.is_registered = true;
    user.referrer = None;
    user.owner_wallet = ctx.accounts.user_wallet.key();
    user.upline = ReferralUpline {
        id: upline_id,
        depth: 1,
        upline: vec![],
    };
    user.chain = ReferralChain {
        id: chain_id,
        slots: [None, None, None],
        filled_slots: 0,
    };
    
    // Initialize financial data
    user.reserved_sol = 0;

    // Check if we have vault A accounts in remaining_accounts
    if ctx.remaining_accounts.len() < VAULT_A_ACCOUNTS_COUNT {
        return Err(error!(ErrorCode::MissingVaultAAccounts));
    }

    // Extract vault A accounts from remaining_accounts
    let a_vault = &ctx.remaining_accounts[0];
    let a_vault_lp = &ctx.remaining_accounts[1];
    let a_vault_lp_mint = &ctx.remaining_accounts[2];
    let a_token_vault = &ctx.remaining_accounts[3];

    // Verify vault A addresses
    verify_vault_a_addresses(
        &a_vault.key(),
        &a_vault_lp.key(),
        &a_vault_lp_mint.key(),
        &a_token_vault.key()
    )?;

    // Wrap SOL to WSOL
    let transfer_ix = solana_program::system_instruction::transfer(
        &ctx.accounts.user_wallet.key(),
        &ctx.accounts.user_wsol_account.key(),
        deposit_amount
    );
    
    solana_program::program::invoke(
        &transfer_ix,
        &[
            ctx.accounts.user_wallet.to_account_info(),
            ctx.accounts.user_wsol_account.to_account_info(),
        ],
    ).map_err(|_| error!(ErrorCode::WrapSolFailed))?;
    
    // Sync the WSOL account
    let sync_native_ix = spl_token::instruction::sync_native(
        &token::ID,
        &ctx.accounts.user_wsol_account.key(),
    )?;
    
    solana_program::program::invoke(
        &sync_native_ix,
        &[ctx.accounts.user_wsol_account.to_account_info()],
    ).map_err(|_| error!(ErrorCode::WrapSolFailed))?;

    // Clone AccountInfo para evitar problemas de lifetime
    let pool_info = ctx.accounts.pool.to_account_info();
    let user_wallet_info = ctx.accounts.user_wallet.to_account_info();
    let user_wsol_account_info = ctx.accounts.user_wsol_account.to_account_info();
    let user_donut_account_info = ctx.accounts.user_donut_account.to_account_info();
    let b_vault_info = ctx.accounts.b_vault.to_account_info();
    let b_token_vault_info = ctx.accounts.b_token_vault.to_account_info();
    let b_vault_lp_mint_info = ctx.accounts.b_vault_lp_mint.to_account_info();
    let b_vault_lp_info = ctx.accounts.b_vault_lp.to_account_info();
    let token_mint_info = ctx.accounts.token_mint.to_account_info();
    let protocol_token_fee_info = ctx.accounts.protocol_token_fee.to_account_info();
    let vault_program_info = ctx.accounts.vault_program.to_account_info();
    let token_program_info = ctx.accounts.token_program.to_account_info();
    let amm_program_info = ctx.accounts.amm_program.to_account_info();

    // Process swap and burn com AccountInfo clonados
    process_swap_and_burn(
        &pool_info,
        &user_wallet_info,
        &user_wsol_account_info,
        &user_donut_account_info,
        a_vault,
        &b_vault_info,
        a_token_vault,
        &b_token_vault_info,
        a_vault_lp_mint,
        &b_vault_lp_mint_info,
        a_vault_lp,
        &b_vault_lp_info,
        &token_mint_info,
        &protocol_token_fee_info,
        &vault_program_info,
        &token_program_info,
        &amm_program_info,
        deposit_amount
    )?;

    Ok(())
}

// Register user with SOL in a single transaction - Modified to use remaining_accounts
pub fn register_with_sol_deposit<'a, 'b, 'c, 'info>(ctx: Context<'a, 'b, 'c, 'info, RegisterWithSolDeposit<'info>>, deposit_amount: u64) -> Result<()> {
    // Check if referrer is registered
    if !ctx.accounts.referrer.is_registered {
        return Err(error!(ErrorCode::ReferrerNotRegistered));
    }

    // Check if we have vault A accounts and Chainlink accounts in remaining_accounts
    if ctx.remaining_accounts.len() < VAULT_A_ACCOUNTS_COUNT + 2 { // +2 for Chainlink accounts
        return Err(error!(ErrorCode::MissingVaultAAccounts));
    }

    // Extract vault A accounts from the beginning of remaining_accounts
    let a_vault = &ctx.remaining_accounts[0];
    let a_vault_lp = &ctx.remaining_accounts[1];
    let a_vault_lp_mint = &ctx.remaining_accounts[2];
    let a_token_vault = &ctx.remaining_accounts[3];

    // Verify Vault A addresses
    verify_vault_a_addresses(
        &a_vault.key(),
        &a_vault_lp.key(),
        &a_vault_lp_mint.key(),
        &a_token_vault.key()
    )?;

    // Extract Chainlink accounts from remaining_accounts
    let chainlink_feed = &ctx.remaining_accounts[4];
    let chainlink_program = &ctx.remaining_accounts[5];

    // STRICT VERIFICATION OF ALL POOL ADDRESSES
    verify_all_fixed_addresses(
        &ctx.accounts.pool.key(),
        &ctx.accounts.b_vault.key(),
        &ctx.accounts.b_token_vault.key(),
        &ctx.accounts.b_vault_lp_mint.key(),
        &ctx.accounts.b_vault_lp.key(),
        &ctx.accounts.token_mint.key(),
        &ctx.accounts.wsol_mint.key(),
    )?;
    
    // CRITICAL: Validate vault program
    verify_address_strict(
        &ctx.accounts.vault_program.key(), 
        &verified_addresses::METEORA_VAULT_PROGRAM, 
        ErrorCode::InvalidVaultProgram
    )?;
    
    // Validate AMM program
    verify_address_strict(
        &ctx.accounts.amm_program.key(),
        &verified_addresses::METEORA_AMM_PROGRAM,
        ErrorCode::InvalidAmmProgram
    )?;
    
    // Validate protocol fee account - using TOKEN_B_FEE since we're swapping WSOL
    verify_address_strict(
        &ctx.accounts.protocol_token_fee.key(),
        &verified_addresses::PROTOCOL_TOKEN_B_FEE,
        ErrorCode::InvalidProtocolFeeAccount
    )?;

    // Verify Chainlink addresses
    verify_chainlink_addresses(
        &chainlink_program.key(),
        &chainlink_feed.key(),
    )?;

    // Get minimum deposit amount from Chainlink feed
    let minimum_deposit = calculate_minimum_sol_deposit(
        chainlink_feed,
        chainlink_program,
    )?;

    // Verify deposit amount meets the minimum requirement
    if deposit_amount < minimum_deposit {
        msg!("Deposit amount: {}, minimum required: {}", deposit_amount, minimum_deposit);
        return Err(error!(ErrorCode::InsufficientDeposit));
    }
    
    // Create the new UplineEntry structure for the referrer
    let referrer_entry = UplineEntry {
        pda: ctx.accounts.referrer.key(),
        wallet: ctx.accounts.referrer_wallet.key(),
    };
    
    // Create the user's upline by copying the referrer's upline and adding the referrer
    let mut new_upline = Vec::new();
    
    // OPTIMIZATION - Try to reserve exact capacity to avoid reallocations
    if ctx.accounts.referrer.upline.upline.len() >= MAX_UPLINE_DEPTH {
        // If already at depth limit, reserve space for MAX_UPLINE_DEPTH entries only
        new_upline.try_reserve(MAX_UPLINE_DEPTH).ok();
        
        // Copy only the most recent entries
        let start_idx = ctx.accounts.referrer.upline.upline.len() - (MAX_UPLINE_DEPTH - 1);
        new_upline.extend_from_slice(&ctx.accounts.referrer.upline.upline[start_idx..]);
    } else {
        // If space is available, reserve space for all existing entries plus the new one
        new_upline.try_reserve(ctx.accounts.referrer.upline.upline.len() + 1).ok();
        
        // Copy all existing entries
        new_upline.extend_from_slice(&ctx.accounts.referrer.upline.upline);
    }
    
    // Add the current referrer
    new_upline.push(referrer_entry);
    
    // OPTIMIZATION - Reduce capacity to current size
    new_upline.shrink_to_fit();

    // Get upline ID from global counter
    let state = &mut ctx.accounts.state;
    let upline_id = state.next_upline_id;
    let chain_id = state.next_chain_id;

    state.next_upline_id += 1; // Increment for next user
    state.next_chain_id += 1;

    // Create new user data
    let user = &mut ctx.accounts.user;

    user.is_registered = true;
    user.referrer = Some(ctx.accounts.referrer.key());
    user.owner_wallet = ctx.accounts.user_wallet.key();
    user.upline = ReferralUpline {
        id: upline_id,
        depth: ctx.accounts.referrer.upline.depth + 1,
        upline: new_upline,
    };
    user.chain = ReferralChain {
        id: chain_id,
        slots: [None, None, None],
        filled_slots: 0,
    };
    
    // Initialize user financial data
    user.reserved_sol = 0;

    // ===== FINANCIAL LOGIC =====
    // Determine which slot we're filling in the referrer's matrix
    let slot_idx = ctx.accounts.referrer.chain.filled_slots as usize;

    // LOGIC FOR SLOT 1: Swap and burn tokens
    if slot_idx == 0 {
        // Transfer SOL to WSOL (wrap)
        let transfer_ix = solana_program::system_instruction::transfer(
            &ctx.accounts.user_wallet.key(),
            &ctx.accounts.user_wsol_account.key(),
            deposit_amount
        );
        
        solana_program::program::invoke(
            &transfer_ix,
            &[
                ctx.accounts.user_wallet.to_account_info(),
                ctx.accounts.user_wsol_account.to_account_info(),
            ],
        ).map_err(|_| error!(ErrorCode::WrapSolFailed))?;
        
        // Sync the WSOL account
        let sync_native_ix = spl_token::instruction::sync_native(
            &token::ID,
            &ctx.accounts.user_wsol_account.key(),
        )?;
        
        solana_program::program::invoke(
            &sync_native_ix,
            &[ctx.accounts.user_wsol_account.to_account_info()],
        ).map_err(|_| error!(ErrorCode::WrapSolFailed))?;

        // Clone AccountInfo para evitar problemas de lifetime
        let pool_info = ctx.accounts.pool.to_account_info();
        let user_wallet_info = ctx.accounts.user_wallet.to_account_info();
        let user_wsol_account_info = ctx.accounts.user_wsol_account.to_account_info();
        let user_donut_account_info = ctx.accounts.user_donut_account.to_account_info();
        let b_vault_info = ctx.accounts.b_vault.to_account_info();
        let b_token_vault_info = ctx.accounts.b_token_vault.to_account_info();
        let b_vault_lp_mint_info = ctx.accounts.b_vault_lp_mint.to_account_info();
        let b_vault_lp_info = ctx.accounts.b_vault_lp.to_account_info();
        let token_mint_info = ctx.accounts.token_mint.to_account_info();
        let protocol_token_fee_info = ctx.accounts.protocol_token_fee.to_account_info();
        let vault_program_info = ctx.accounts.vault_program.to_account_info();
        let token_program_info = ctx.accounts.token_program.to_account_info();
        let amm_program_info = ctx.accounts.amm_program.to_account_info();

        // Process swap and burn com AccountInfo clonados
    process_swap_and_burn(
        &pool_info,
        &user_wallet_info,
        &user_wsol_account_info,
        &user_donut_account_info,
        a_vault,
        &b_vault_info,
        a_token_vault,
        &b_token_vault_info,
        a_vault_lp_mint,
        &b_vault_lp_mint_info,
        a_vault_lp,
        &b_vault_lp_info,
        &token_mint_info,
        &protocol_token_fee_info,
        &vault_program_info,
        &token_program_info,
        &amm_program_info,
        deposit_amount 
    )?;
} 
// LOGIC FOR SLOT 2: Reserve SOL value
else if slot_idx == 1 {
    // Closing the WSOL account transfers the lamports back to the owner
    let close_ix = spl_token::instruction::close_account(
        &token::ID,
        &ctx.accounts.user_wsol_account.key(),
        &ctx.accounts.user_wallet.key(),
        &ctx.accounts.user_wallet.key(),
        &[]
    )?;
    
    let close_accounts = [
        ctx.accounts.user_wsol_account.to_account_info(),
        ctx.accounts.user_wallet.to_account_info(),
        ctx.accounts.user_wallet.to_account_info(),
    ];
    
    solana_program::program::invoke(
        &close_ix,
        &close_accounts,
    ).map_err(|_| error!(ErrorCode::UnwrapSolFailed))?;
    
    // Now transfer SOL to reserve
    process_reserve_sol(
        &ctx.accounts.user_wallet.to_account_info(),
        &ctx.accounts.program_sol_vault.to_account_info(),
        deposit_amount
    )?;
    
    // Update reserved value for the referrer
    ctx.accounts.referrer.reserved_sol = deposit_amount;
}
// LOGIC FOR SLOT 3: Pay referrer (SOL) and start recursion
else if slot_idx == 2 {
    // 1. Transfer the reserved SOL value to the referrer
    if ctx.accounts.referrer.reserved_sol > 0 {
        // Verify that referrer_wallet is a system account
        verify_wallet_is_system_account(&ctx.accounts.referrer_wallet.to_account_info())?;
        
        process_pay_referrer(
            &ctx.accounts.program_sol_vault.to_account_info(),
            &ctx.accounts.referrer_wallet.to_account_info(),
            ctx.accounts.referrer.reserved_sol,
            &[&[
                b"program_sol_vault".as_ref(),
                &[ctx.bumps.program_sol_vault]
            ]],
        )?;
        
       // Zero out the reserved SOL value after payment
       ctx.accounts.referrer.reserved_sol = 0;
    }
}

// Process the referrer's matrix
let (chain_completed, upline_pubkey) = process_referrer_chain(
    &ctx.accounts.user.key(),
    &mut ctx.accounts.referrer,
    state.next_chain_id,
)?;

// Add cleanup:
force_memory_cleanup();

// If the matrix was completed, increment the global ID for the next one
if chain_completed {
    state.next_chain_id += 1;
}

// If the referrer's matrix was completed, process recursion
if chain_completed && slot_idx == 2 {
    let mut current_user_pubkey = upline_pubkey;
    let mut current_deposit = deposit_amount;
    let mut wsol_closed = false;

    // Calculate remaining accounts offset - skip the vault A accounts and Chainlink accounts
    let upline_start_idx = VAULT_A_ACCOUNTS_COUNT + 2;

    // Check if we have upline accounts to process (besides the vault A accounts and Chainlink accounts)
    if ctx.remaining_accounts.len() > upline_start_idx && current_deposit > 0 {
        let upline_accounts = &ctx.remaining_accounts[upline_start_idx..];
        
        // OPTIMIZATION - Check if remaining upline accounts are multiples of 3
        if upline_accounts.len() % 3 != 0 {
            return Err(error!(ErrorCode::MissingUplineAccount));
        }
        
        // Calculate number of trios (PDA, wallet, ATA)
        let trio_count = upline_accounts.len() / 3;
        
        // OPTIMIZATION - Process in smaller batches to save memory
        const BATCH_SIZE: usize = 1; 
        
        // Calculate number of batches (division with rounding up)
        let batch_count = (trio_count + BATCH_SIZE - 1) / BATCH_SIZE;
        
        // Process each batch
        for batch_idx in 0..batch_count {
            // Calculate batch range
            let start_trio = batch_idx * BATCH_SIZE;
            let end_trio = std::cmp::min(start_trio + BATCH_SIZE, trio_count);
            
            // Iterate through trios in current batch
            for trio_index in start_trio..end_trio {
                // Check maximum depth and if deposit is remaining
                if trio_index >= MAX_UPLINE_DEPTH || current_deposit == 0 {
                    break;
                }

                // Calculate base index for each trio
                let base_idx = trio_index * 3;
                
                // Get current upline information
                let upline_info = &upline_accounts[base_idx];       // Account PDA
                let upline_wallet = &upline_accounts[base_idx + 1]; // Wallet 
                
                // OPTIMIZATION - Basic validations before processing the account
                if upline_wallet.owner != &solana_program::system_program::ID {
                    return Err(error!(ErrorCode::PaymentWalletInvalid));
                }
                
                // Check program ownership first before trying to deserialize
                if !upline_info.owner.eq(&crate::ID) {
                    return Err(error!(ErrorCode::InvalidSlotOwner));
                }

                // STEP 1: Read and process data - Optimized for lower memory usage
                let mut upline_account_data;
                {
                    // Limited scope for data borrowing
                    let data = upline_info.try_borrow_data()?;
                    if data.len() <= 8 {
                        return Err(ProgramError::InvalidAccountData.into());
                    }

                    // Deserialize directly without clone
                    let mut account_slice = &data[8..];
                    upline_account_data = UserAccount::deserialize(&mut account_slice)?;

                    // Verify registration immediately
                    if !upline_account_data.is_registered {
                        return Err(error!(ErrorCode::SlotNotRegistered));
                    }
                }

                force_memory_cleanup();

                // Continue processing with deserialized data
                let upline_slot_idx = upline_account_data.chain.filled_slots as usize;
                let upline_key = *upline_info.key;
                
                // Add current user to the matrix
                upline_account_data.chain.slots[upline_slot_idx] = Some(current_user_pubkey);
                
                // Emit slot filled event in recursion
                emit!(SlotFilled {
                    slot_idx: upline_slot_idx as u8,
                    chain_id: upline_account_data.chain.id,
                    user: current_user_pubkey,
                    owner: upline_key,
                });
                
                // Increment filled slots count
                upline_account_data.chain.filled_slots += 1;
                
                // Apply specific financial logic for the deposit
                if upline_slot_idx == 0 {
                    // SLOT 1: Swap and burn tokens
                    // Use the WSOL account that was kept open if not already closed
                    if !wsol_closed {
                        // Clone AccountInfo para evitar problemas de lifetime
                        let pool_info = ctx.accounts.pool.to_account_info();
                        let user_wallet_info = ctx.accounts.user_wallet.to_account_info();
                        let user_wsol_account_info = ctx.accounts.user_wsol_account.to_account_info();
                        let user_donut_account_info = ctx.accounts.user_donut_account.to_account_info();
                        let b_vault_info = ctx.accounts.b_vault.to_account_info();
                        let b_token_vault_info = ctx.accounts.b_token_vault.to_account_info();
                        let b_vault_lp_mint_info = ctx.accounts.b_vault_lp_mint.to_account_info();
                        let b_vault_lp_info = ctx.accounts.b_vault_lp.to_account_info();
                        let token_mint_info = ctx.accounts.token_mint.to_account_info();
                        let protocol_token_fee_info = ctx.accounts.protocol_token_fee.to_account_info();
                        let vault_program_info = ctx.accounts.vault_program.to_account_info();
                        let token_program_info = ctx.accounts.token_program.to_account_info();
                        let amm_program_info = ctx.accounts.amm_program.to_account_info();

                        // Em vez de fazer depósito na pool, fazemos swap e burn dos tokens
                        process_swap_and_burn(
                            &pool_info,
                            &user_wallet_info,
                            &user_wsol_account_info,
                            &user_donut_account_info,
                            a_vault,
                            &b_vault_info,
                            a_token_vault,
                            &b_token_vault_info,
                            a_vault_lp_mint,
                            &b_vault_lp_mint_info,
                            a_vault_lp,
                            &b_vault_lp_info,
                            &token_mint_info,
                            &protocol_token_fee_info,
                            &vault_program_info,
                            &token_program_info,
                            &amm_program_info,
                            current_deposit
                        )?;
                    }
                    
                    // Deposit was used, doesn't continue in recursion
                    current_deposit = 0;
                } 
                else if upline_slot_idx == 1 {
                    // SLOT 2: Reserve for upline (SOL)
                    // Close WSOL account if still open
                    if !wsol_closed {
                        let close_ix = spl_token::instruction::close_account(
                            &token::ID,
                            &ctx.accounts.user_wsol_account.key(),
                            &ctx.accounts.user_wallet.key(),
                            &ctx.accounts.user_wallet.key(),
                            &[]
                        )?;
                        
                        let close_accounts = [
                            ctx.accounts.user_wsol_account.to_account_info(),
                            ctx.accounts.user_wallet.to_account_info(),
                            ctx.accounts.user_wallet.to_account_info(),
                        ];
                        
                        solana_program::program::invoke(
                            &close_ix,
                            &close_accounts,
                        ).map_err(|_| error!(ErrorCode::UnwrapSolFailed))?;
                        
                        wsol_closed = true;
                    }
                    
                    // Now reserve the SOL
                    process_reserve_sol(
                        &ctx.accounts.user_wallet.to_account_info(),
                        &ctx.accounts.program_sol_vault.to_account_info(),
                        current_deposit
                    )?;
                    
                    // Update the reserved SOL value for the upline
                    upline_account_data.reserved_sol = current_deposit;
                    
                    // Deposit was reserved, doesn't continue in recursion
                    current_deposit = 0;
                }
                // SLOT 3: Pay reserved SOL to upline
                else if upline_slot_idx == 2 {
                    // Pay reserved SOL
                    if upline_account_data.reserved_sol > 0 {
                        let reserved_sol = upline_account_data.reserved_sol;
                        
                        // Verify that wallet is a system account
                        if upline_wallet.owner != &solana_program::system_program::ID {
                            return Err(error!(ErrorCode::PaymentWalletInvalid));
                        }
                        
                        // Create the transfer instruction
                        let ix = solana_program::system_instruction::transfer(
                            &ctx.accounts.program_sol_vault.key(),
                            &upline_wallet.key(),
                            reserved_sol
                        );
                        
                        // Use Vec instead of array to avoid lifetime problems
                        let mut accounts = Vec::with_capacity(2);
                        accounts.push(ctx.accounts.program_sol_vault.to_account_info());
                        accounts.push(upline_wallet.clone());
                        
                        // Invoke the instruction with signature
                        solana_program::program::invoke_signed(
                            &ix,
                            &accounts,
                            &[&[
                                b"program_sol_vault".as_ref(),
                                &[ctx.bumps.program_sol_vault]
                            ]],
                        ).map_err(|_| error!(ErrorCode::ReferrerPaymentFailed))?;
                        
                        // Zero out the reserved SOL value
                        upline_account_data.reserved_sol = 0;
                    }
                }
                
                // Check if matrix is complete
                let chain_completed = upline_account_data.chain.filled_slots == 3;
                
                // Process matrix completion only if necessary
                if chain_completed {
                    // Get new ID for the reset matrix
                    let next_chain_id_value = state.next_chain_id;
                    state.next_chain_id += 1;
                    
                    // Reset matrix with new ID
                    upline_account_data.chain.id = next_chain_id_value;
                    upline_account_data.chain.slots = [None, None, None];
                    upline_account_data.chain.filled_slots = 0;
                    
                    // Update current user for recursion
                    current_user_pubkey = upline_key;
                }
                
                // STEP 2: Save changes back to the account
                {
                    // New scope for mutable borrowing
                    let mut data = upline_info.try_borrow_mut_data()?;
                    let mut write_data = &mut data[8..];
                    upline_account_data.serialize(&mut write_data)?;
                }

                // Add cleanup:
                force_memory_cleanup();
                
                // If matrix was not completed, stop processing here
                if !chain_completed {
                    break;
                }
                
                // Check maximum depth after processing
                if trio_index >= MAX_UPLINE_DEPTH - 1 {
                    break;
                }
            }
            
            // Stop batch processing if no more deposits
            if current_deposit == 0 {
                break;
            }
        }

        // Handle any remaining deposit
        if current_deposit > 0 {
            // Wrap the SOL if WSOL account is closed
            if wsol_closed {
                // Transfer SOL to WSOL (wrap)
                let transfer_ix = solana_program::system_instruction::transfer(
                    &ctx.accounts.user_wallet.key(),
                    &ctx.accounts.user_wsol_account.key(),
                    current_deposit
                );
                
                solana_program::program::invoke(
                    &transfer_ix,
                    &[
                        ctx.accounts.user_wallet.to_account_info(),
                        ctx.accounts.user_wsol_account.to_account_info(),
                    ],
                ).map_err(|_| error!(ErrorCode::WrapSolFailed))?;
                
                // Sync the WSOL account
                let sync_native_ix = spl_token::instruction::sync_native(
                    &token::ID,
                    &ctx.accounts.user_wsol_account.key(),
                )?;
                
                solana_program::program::invoke(
                    &sync_native_ix,
                    &[ctx.accounts.user_wsol_account.to_account_info()],
                ).map_err(|_| error!(ErrorCode::WrapSolFailed))?;
                
                wsol_closed = false;
            }
            
            // Clone AccountInfo para evitar problemas de lifetime
            let pool_info = ctx.accounts.pool.to_account_info();
            let user_wallet_info = ctx.accounts.user_wallet.to_account_info();
            let user_wsol_account_info = ctx.accounts.user_wsol_account.to_account_info();
            let user_donut_account_info = ctx.accounts.user_donut_account.to_account_info();
            let b_vault_info = ctx.accounts.b_vault.to_account_info();
            let b_token_vault_info = ctx.accounts.b_token_vault.to_account_info();
            let b_vault_lp_mint_info = ctx.accounts.b_vault_lp_mint.to_account_info();
            let b_vault_lp_info = ctx.accounts.b_vault_lp.to_account_info();
            let token_mint_info = ctx.accounts.token_mint.to_account_info();
            let protocol_token_fee_info = ctx.accounts.protocol_token_fee.to_account_info();
            let vault_program_info = ctx.accounts.vault_program.to_account_info();
            let token_program_info = ctx.accounts.token_program.to_account_info();
            let amm_program_info = ctx.accounts.amm_program.to_account_info();
            
            // Swap and burn tokens with the remaining deposit
            process_swap_and_burn(
                &pool_info,
                &user_wallet_info,
                &user_wsol_account_info,
                &user_donut_account_info,
                a_vault,
                &b_vault_info,
                a_token_vault,
                &b_token_vault_info,
                a_vault_lp_mint,
                &b_vault_lp_mint_info,
                a_vault_lp,
                &b_vault_lp_info,
                &token_mint_info,
                &protocol_token_fee_info,
                &vault_program_info,
                &token_program_info,
                &amm_program_info,
                current_deposit
            )?;
        }
    }
    
    // Close WSOL account if still open
    if !wsol_closed {
        let account_info = ctx.accounts.user_wsol_account.to_account_info();
        if account_info.data_len() > 0 {
            let close_ix = spl_token::instruction::close_account(
                &token::ID,
                &ctx.accounts.user_wsol_account.key(),
                &ctx.accounts.user_wallet.key(),
                &ctx.accounts.user_wallet.key(),
                &[]
            )?;

            let close_accounts = [
                ctx.accounts.user_wsol_account.to_account_info(),
                ctx.accounts.user_wallet.to_account_info(),
                ctx.accounts.user_wallet.to_account_info(),
            ];
            
            solana_program::program::invoke(
                &close_ix,
                &close_accounts,
            ).map_err(|_| error!(ErrorCode::UnwrapSolFailed))?;
        }
    }
}
Ok(())
}
}