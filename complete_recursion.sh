#!/bin/bash

# complete_recursion.sh - Script for recursive wallet registration with matrix completion tracking
# Usage: ./complete_recursion.sh [--depth=N] [--total-time=MINUTES] [--referrer=ADDRESS] [INITIAL_REFERRER]

set -e  # Exit on any error

# Configuration defaults
DEPTH=5  # Changed default to 5 for matrix completion cycles
INITIAL_REFERRER="QgNN4aW9hPz4ANP1LqzR2FkDPZo9MzDZxDQ4abovHYv"

CARTEIRAS_DIR="./carteiras"
CONFIG_PATH="./matriz-config.json"
ALT_ADDRESS="FhNUsPQsuoNtLRJQ9HQgSPF6vNDysJvDMnp5HXsr85Jw"
TRANSFER_AMOUNT="0.15"  # SOL amount to transfer to each wallet

# Parse command line arguments - FIXED VERSION
FIXED_REFERRER=""
USE_FIXED_REFERRER=false
TOTAL_TIME_MINUTES=""
USE_INTERVAL_PROCESSING=false
show_help=false

# Process arguments properly
remaining_args=()

for arg in "$@"; do
    case $arg in
        --depth=*)
            DEPTH="${arg#*=}"
            if ! [[ "$DEPTH" =~ ^[0-9]+$ ]]; then
                echo "Error: depth must be a number"
                exit 1
            fi
            # Don't add to remaining_args since it's a flag
            ;;
        --total-time=*)
            TOTAL_TIME_MINUTES="${arg#*=}"
            if ! [[ "$TOTAL_TIME_MINUTES" =~ ^[0-9]+$ ]]; then
                echo "Error: total-time must be a number (minutes)"
                exit 1
            fi
            USE_INTERVAL_PROCESSING=true
            # Don't add to remaining_args since it's a flag
            ;;
        --referrer=*)
            FIXED_REFERRER="${arg#*=}"
            USE_FIXED_REFERRER=true
            # Don't add to remaining_args since it's a flag
            ;;
        -h|--help)
            show_help=true
            ;;
        *)
            # This is a positional argument
            remaining_args+=("$arg")
            ;;
    esac
done

# Handle positional arguments
if [[ "$USE_FIXED_REFERRER" == false && "$show_help" == false && ${#remaining_args[@]} -gt 0 ]]; then
    INITIAL_REFERRER="${remaining_args[0]}"
fi

# Calculate interval timing if total-time is provided
INTERVAL_SECONDS=0
if [[ "$USE_INTERVAL_PROCESSING" == true ]]; then
    # Convert minutes to seconds and divide by 36
    TOTAL_SECONDS=$((TOTAL_TIME_MINUTES * 60))
    INTERVAL_SECONDS=$((TOTAL_SECONDS / 36))
    
    if [[ $INTERVAL_SECONDS -lt 1 ]]; then
        INTERVAL_SECONDS=1  # Minimum 1 second interval
    fi
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 COMPLETE RECURSION SCRIPT STARTED${NC}"
echo -e "${BLUE}======================================${NC}"
if [[ "$USE_FIXED_REFERRER" == true ]]; then
    echo -e "🔧 Mode: FIXED REFERRER (all wallets → same referrer)"
    echo -e "👥 Fixed Referrer: ${FIXED_REFERRER}"
    echo -e "⚠️  RECURSIVE LOGIC DISABLED - Using fixed referrer for ALL wallets"
else
    echo -e "🔧 Mode: RECURSIVE (changing referrers by level)"
    echo -e "📊 Depth: ${DEPTH} levels"
    echo -e "👥 Initial Referrer: ${INITIAL_REFERRER}"
fi
echo -e "💰 Transfer Amount: ${TRANSFER_AMOUNT} SOL per wallet"

if [[ "$USE_INTERVAL_PROCESSING" == true ]]; then
    echo -e "${CYAN}⏰ INTERVAL PROCESSING ENABLED${NC}"
    echo -e "${CYAN}⏱️  Total Time: ${TOTAL_TIME_MINUTES} minutes${NC}"
    echo -e "${CYAN}⏳ Interval: ${INTERVAL_SECONDS} seconds between each 3-depth batch${NC}"
    echo -e "${CYAN}📊 Total Intervals: 36 (${TOTAL_TIME_MINUTES} min ÷ 36)${NC}"
fi
echo ""

# Function to extract public key from wallet JSON file
extract_pubkey() {
    local wallet_file="$1"
    if [[ ! -f "$wallet_file" ]]; then
        echo -e "${RED}❌ Wallet file not found: $wallet_file${NC}"
        return 1
    fi
    
    # Create a temporary Node.js script to extract the public key
    node -e "
        const { Keypair } = require('@solana/web3.js');
        const fs = require('fs');
        try {
            const secretKey = JSON.parse(fs.readFileSync('$wallet_file', 'utf8'));
            const keypair = Keypair.fromSecretKey(new Uint8Array(secretKey));
            console.log(keypair.publicKey.toString());
        } catch (error) {
            console.error('Error extracting pubkey:', error.message);
            process.exit(1);
        }
    "
}

# Function to get all wallet files sorted numerically
get_wallet_files() {
    find "$CARTEIRAS_DIR" -name "carteira*.json" | sort -V
}

# Function to transfer SOL to all wallets
transfer_sol_to_wallets() {
    echo -e "${YELLOW}💸 TRANSFERRING SOL TO ALL WALLETS...${NC}"
    
    local wallet_files=($(get_wallet_files))
    local total_wallets=${#wallet_files[@]}
    
    echo -e "📋 Found ${total_wallets} wallet files"
    
    for wallet_file in "${wallet_files[@]}"; do
        local wallet_name=$(basename "$wallet_file")
        echo -e "  💰 Processing ${wallet_name}..."
        
        # Extract destination address
        local dest_address=$(extract_pubkey "$wallet_file")
        if [[ $? -ne 0 ]]; then
            echo -e "${RED}❌ Failed to extract address from $wallet_name${NC}"
            continue
        fi
        
        echo -e "    📍 Address: $dest_address"
        
        # Transfer SOL
        echo -e "    💸 Transferring ${TRANSFER_AMOUNT} SOL..."
        if solana transfer "$dest_address" "$TRANSFER_AMOUNT" --allow-unfunded-recipient; then
            echo -e "    ${GREEN}✅ Transfer successful${NC}"
        else
            echo -e "    ${RED}❌ Transfer failed${NC}"
        fi
        
        echo ""
    done
    
    echo -e "${GREEN}✅ SOL TRANSFER PHASE COMPLETED${NC}"
    echo ""
}

# Function to register a wallet with referrer
register_wallet() {
    local wallet_path="$1"
    local referrer_address="$2"
    local wallet_name=$(basename "$wallet_path")
    
    echo -e "  🔄 Registering ${wallet_name} with referrer: ${referrer_address}"
    
    if node referv5.js "$wallet_path" "$CONFIG_PATH" "$referrer_address" "$ALT_ADDRESS"; then
        echo -e "    ${GREEN}✅ Registration successful${NC}"
        return 0
    else
        echo -e "    ${RED}❌ Registration failed${NC}"
        return 1
    fi
}

# Function to wait for interval
wait_for_interval() {
    local batch_number=$1
    local description="$2"
    
    if [[ "$USE_INTERVAL_PROCESSING" == true ]]; then
        echo -e "${CYAN}⏳ Batch ${batch_number}: ${description}${NC}"
        echo -e "${CYAN}⏱️  Waiting ${INTERVAL_SECONDS} seconds before next batch...${NC}"
        
        # Show countdown
        for ((i=INTERVAL_SECONDS; i>0; i--)); do
            echo -ne "\r${CYAN}⏰ Next batch in: ${i}s ${NC}"
            sleep 1
        done
        echo -e "\r${GREEN}✅ Interval complete - proceeding...${NC}                    "
        echo ""
    fi
}

# Function to register all wallets with fixed referrer - UPDATED WITH INTERVALS
register_all_with_fixed_referrer() {
    echo -e "${YELLOW}🔄 REGISTERING ALL WALLETS WITH FIXED REFERRER...${NC}"
    echo -e "${RED}⚠️  IMPORTANT: Using FIXED referrer for ALL registrations${NC}"
    
    local wallet_files=($(get_wallet_files))
    local total_wallets=${#wallet_files[@]}
    local successful_registrations=0
    
    echo -e "📋 Total wallets available: ${total_wallets}"
    echo -e "👥 Using FIXED referrer: ${FIXED_REFERRER}"
    echo -e "🚫 Recursive logic: DISABLED"
    echo ""
    
    # Process wallets in batches of 3 if interval processing is enabled
    if [[ "$USE_INTERVAL_PROCESSING" == true ]]; then
        local batch_size=3
        local batch_count=$(((total_wallets + batch_size - 1) / batch_size))
        
        echo -e "${CYAN}📦 Processing in ${batch_count} batches of ${batch_size} wallets each${NC}"
        echo ""
        
        for ((batch=0; batch<batch_count; batch++)); do
            local start_idx=$((batch * batch_size))
            local end_idx=$((start_idx + batch_size))
            if [[ $end_idx -gt $total_wallets ]]; then
                end_idx=$total_wallets
            fi
            
            echo -e "${BLUE}📦 BATCH $((batch + 1))/${batch_count}: Wallets $((start_idx + 1))-${end_idx}${NC}"
            
            for ((i=start_idx; i<end_idx; i++)); do
                local current_wallet="${wallet_files[$i]}"
                local wallet_name=$(basename "$current_wallet")
                
                echo -e "  📍 WALLET $((i+1))/${total_wallets}: ${wallet_name}"
                echo -e "  👥 Referrer: ${FIXED_REFERRER} (FIXED - NO CHANGES)"
                
                if register_wallet "$current_wallet" "$FIXED_REFERRER"; then
                    successful_registrations=$((successful_registrations + 1))
                    echo -e "    ${GREEN}✅ Registration successful with FIXED referrer${NC}"
                else
                    echo -e "    ${RED}❌ Registration failed${NC}"
                    echo -e "    ${YELLOW}⚠️ Continuing with next wallet...${NC}"
                fi
                echo ""
            done
            
            # Wait for interval before next batch (except for last batch)
            if [[ $((batch + 1)) -lt $batch_count ]]; then
                wait_for_interval $((batch + 1)) "Wallets $((start_idx + 1))-${end_idx} completed"
            fi
        done
    else
        # Original processing without intervals
        for ((i=0; i<total_wallets; i++)); do
            local current_wallet="${wallet_files[$i]}"
            local wallet_name=$(basename "$current_wallet")
            
            echo -e "${BLUE}📍 WALLET $((i+1))/${total_wallets}: ${wallet_name}${NC}"
            echo -e "👥 Referrer: ${FIXED_REFERRER} (FIXED - NO CHANGES)"
            
            if register_wallet "$current_wallet" "$FIXED_REFERRER"; then
                successful_registrations=$((successful_registrations + 1))
                echo -e "    ${GREEN}✅ Registration successful with FIXED referrer${NC}"
            else
                echo -e "    ${RED}❌ Registration failed${NC}"
                echo -e "    ${YELLOW}⚠️ Continuing with next wallet...${NC}"
            fi
            
            echo ""
        done
    fi
    
    echo -e "${GREEN}✅ FIXED REFERRER REGISTRATION COMPLETED${NC}"
    echo -e "📊 Successful registrations: ${successful_registrations}/${total_wallets}"
    echo -e "👥 ALL registrations used referrer: ${FIXED_REFERRER}"
}

# Function to run recursive registration - UPDATED WITH INTERVALS
run_recursive_registration() {
    echo -e "${YELLOW}🔄 STARTING RECURSIVE REGISTRATION...${NC}"
    
    local wallet_files=($(get_wallet_files))
    local total_wallets=${#wallet_files[@]}
    local wallet_index=0
    
    echo -e "📋 Total wallets available: ${total_wallets}"
    echo -e "🎯 Target depth: ${DEPTH} levels"
    echo ""
    
    local batch_counter=1
    
    # Level 1: Register carteira1 with initial referrer
    echo -e "${BLUE}📍 LEVEL 1${NC}"
    if [[ $wallet_index -ge $total_wallets ]]; then
        echo -e "${RED}❌ Not enough wallets for level 1${NC}"
        return 1
    fi
    
    local current_wallet="${wallet_files[$wallet_index]}"
    register_wallet "$current_wallet" "$INITIAL_REFERRER"
    
    # Get address of carteira1 to use as referrer for next level
    local current_referrer=$(extract_pubkey "$current_wallet")
    wallet_index=$((wallet_index + 1))
    
    echo -e "🔑 New referrer for next level: $current_referrer"
    echo ""
    
    # Wait after level 1 if using intervals
    if [[ "$USE_INTERVAL_PROCESSING" == true ]]; then
        wait_for_interval $batch_counter "Level 1 completed"
        batch_counter=$((batch_counter + 1))
    fi
    
    # Levels 2 to DEPTH-1: Register 2 wallets per level (slots 1 and 2)
    for ((level=2; level<DEPTH; level++)); do
        echo -e "${BLUE}📍 LEVEL $level${NC}"
        
        # Register 2 wallets with current referrer
        for ((slot=1; slot<=2; slot++)); do
            if [[ $wallet_index -ge $total_wallets ]]; then
                echo -e "${RED}❌ Not enough wallets for level $level, slot $slot${NC}"
                return 1
            fi
            
            current_wallet="${wallet_files[$wallet_index]}"
            echo -e "  🎯 Slot $slot:"
            register_wallet "$current_wallet" "$current_referrer"
            wallet_index=$((wallet_index + 1))
            
            # For slot 2, get the address to use as referrer for next level
            if [[ $slot -eq 2 ]]; then
                current_referrer=$(extract_pubkey "$current_wallet")
                echo -e "  🔑 New referrer for next level: $current_referrer"
            fi
        done
        echo ""
        
        # Wait after every 3 levels or after completing this level if using intervals
        if [[ "$USE_INTERVAL_PROCESSING" == true && $((level % 3)) -eq 1 ]]; then
            wait_for_interval $batch_counter "Level $level completed"
            batch_counter=$((batch_counter + 1))
        fi
    done
    
    # Final level: Register all 3 slots
    echo -e "${BLUE}📍 LEVEL $DEPTH (FINAL - ALL 3 SLOTS)${NC}"
    
    for ((slot=1; slot<=3; slot++)); do
        if [[ $wallet_index -ge $total_wallets ]]; then
            echo -e "${RED}❌ Not enough wallets for final level, slot $slot${NC}"
            return 1
        fi
        
        current_wallet="${wallet_files[$wallet_index]}"
        echo -e "  🎯 Slot $slot:"
        register_wallet "$current_wallet" "$current_referrer"
        wallet_index=$((wallet_index + 1))
    done
    
    echo ""
    echo -e "${GREEN}✅ RECURSIVE REGISTRATION COMPLETED${NC}"
    echo -e "📊 Total wallets used: $wallet_index"
    echo -e "📊 Total wallets available: $total_wallets"
    
    if [[ "$USE_INTERVAL_PROCESSING" == true ]]; then
        echo -e "${CYAN}⏰ Total processing time: ~${TOTAL_TIME_MINUTES} minutes${NC}"
        echo -e "${CYAN}📊 Intervals used: $((batch_counter - 1))${NC}"
    fi
}

# Function to show summary
show_summary() {
    echo -e "${BLUE}📋 REGISTRATION SUMMARY${NC}"
    echo -e "${BLUE}=======================${NC}"
    
    local wallet_files=($(get_wallet_files))
    local registered_count=0
    
    for wallet_file in "${wallet_files[@]}"; do
        local wallet_name=$(basename "$wallet_file")
        local wallet_address=$(extract_pubkey "$wallet_file")
        
        # Try to check if wallet is registered (this is a simplified check)
        echo -e "📄 ${wallet_name}: ${wallet_address}"
        registered_count=$((registered_count + 1))
    done
    
    echo ""
    echo -e "${GREEN}✅ PROCESS COMPLETED${NC}"
    echo -e "📊 Total wallets processed: $registered_count"
}

# Main execution
main() {
    # Check prerequisites
    if ! command -v solana &> /dev/null; then
        echo -e "${RED}❌ Solana CLI not found. Please install it first.${NC}"
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js not found. Please install it first.${NC}"
        exit 1
    fi
    
    if [[ ! -f "referv5.js" ]]; then
        echo -e "${RED}❌ referv5.js not found in current directory${NC}"
        exit 1
    fi
    
    if [[ ! -d "$CARTEIRAS_DIR" ]]; then
        echo -e "${RED}❌ Carteiras directory not found: $CARTEIRAS_DIR${NC}"
        exit 1
    fi
    
    local available_wallets=$(find "$CARTEIRAS_DIR" -name "carteira*.json" | wc -l)
    
    if [[ "$USE_FIXED_REFERRER" == true ]]; then
        echo -e "📊 Available wallets: $available_wallets"
        echo -e "🎯 Mode: All wallets will use the same referrer"
    else
        # Calculate minimum required wallets for recursive mode
        local min_wallets=$((1 + 2 * (DEPTH - 2) + 3))  # 1 + 2*(depth-2) + 3
        
        echo -e "📊 Required wallets: $min_wallets"
        echo -e "📊 Available wallets: $available_wallets"
        
        if [[ $available_wallets -lt $min_wallets ]]; then
            echo -e "${RED}❌ Not enough wallets available. Need at least $min_wallets wallets for depth $DEPTH${NC}"
            exit 1
        fi
    fi
    
    echo ""
    
    # Ask for confirmation
    if [[ "$USE_FIXED_REFERRER" == true ]]; then
        echo -e "${YELLOW}⚠️  This will register ALL $available_wallets wallets with the same referrer.${NC}"
    else
        echo -e "${YELLOW}⚠️  This will register wallets recursively with changing referrers.${NC}"
    fi
    echo -e "${YELLOW}   Make sure you have enough SOL in your default wallet.${NC}"
    read -p "Continue? (y/N): " -n 1 -r
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}❌ Operation cancelled${NC}"
        exit 0
    fi
    
    echo ""
    
    # Execute phases
    # transfer_sol_to_wallets
    
    if [[ "$USE_FIXED_REFERRER" == true ]]; then
        register_all_with_fixed_referrer
    else
        run_recursive_registration
    fi
    
    # show_summary
}

# Show usage if help requested
if [[ "$show_help" == true ]]; then
    echo "Usage: $0 [--depth=N] [--total-time=MINUTES] [--referrer=ADDRESS] [INITIAL_REFERRER]"
    echo ""
    echo "Parameters:"
    echo "  --depth=N            Number of levels for recursive mode (default: 2)"
    echo "  --total-time=MINUTES Total time in minutes for interval processing (divides by 36)"
    echo "  --referrer=ADDRESS   Use fixed referrer for ALL wallets (ignores recursive logic)"
    echo "  INITIAL_REFERRER     Initial referrer address for recursive mode"
    echo "                       (default: 6xRvuzuXw76k7JMkk7fL1TZLJR8SFbnM43xCwWJmwkUP)"
    echo ""
    echo "Examples:"
    echo "  $0                                      # Recursive mode with defaults (depth=2)"
    echo "  $0 --depth=4                           # Recursive mode with 4 levels"
    echo "  $0 --depth=3 CustomReferrer            # 3 levels with custom initial referrer"
    echo "  $0 --referrer=ABC...123                # Fixed referrer mode (all wallets → ABC...123)"
    echo "  $0 --total-time=50                     # 50 minutes total, ~83s intervals (50÷36=1.39min)"
    echo "  $0 --depth=5 --total-time=30           # 5 levels with 30 minutes interval processing"
    echo "  $0 --referrer=ABC...123 --total-time=60 # Fixed referrer with 60 minutes intervals"
    echo ""
    echo "Interval Processing:"
    echo "  - When --total-time=X is provided, the script divides X minutes by 36"
    echo "  - Each 3-depth batch processing waits for the calculated interval"
    echo "  - Example: --total-time=36 means 1 minute between each batch"
    echo "  - Example: --total-time=72 means 2 minutes between each batch"
    echo ""
    echo "Modes:"
    echo "  RECURSIVE MODE:"
    echo "    - Uses changing referrers across levels"
    echo "    - Required wallets formula: 1 + 2*(depth-2) + 3"
    echo "    - Level 1: 1 wallet"
    echo "    - Levels 2 to depth-1: 2 wallets each"
    echo "    - Final level: 3 wallets"
    echo ""
    echo "  FIXED REFERRER MODE:"
    echo "    - All wallets register with the same referrer"
    echo "    - Uses all available wallets"
    echo "    - Simpler logic, no depth limitations"
    echo "    - With --total-time: processes in batches of 3 wallets"
    exit 0
fi

# Run main function
main "$@" 