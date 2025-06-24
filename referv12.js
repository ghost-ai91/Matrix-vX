// register-v11-optimized.js - Complete Optimized Client Script
const { 
  Connection, 
  Keypair, 
  PublicKey, 
  TransactionMessage, 
  VersionedTransaction,
  ComputeBudgetProgram,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  AddressLookupTableProgram,
  Transaction
} = require('@solana/web3.js');
const { AnchorProvider, Program, BN, Wallet } = require('@coral-xyz/anchor');
const fs = require('fs');

// ============================================
// CONSTANTS AND ADDRESSES
// ============================================

// System Constants
const WEEK_DURATION_SECONDS = 12000; // 20 minutes for test
const MAX_RETRIES = 5;
const ALT_CHECK_INTERVAL = 3000; // 3 seconds
const ALT_MAX_ATTEMPTS = 20;
const TRANSACTION_TIMEOUT = 90000; // 90 seconds

// Sysvar Instructions
const SYSVAR_INSTRUCTIONS_PUBKEY = new PublicKey('Sysvar1nstructions1111111111111111111111111');

// Verified Addresses
const VERIFIED_ADDRESSES = {
  // Pool Meteora
  POOL_ADDRESS: new PublicKey("FrQ5KsAgjCe3FFg6ZENri8feDft54tgnATxyffcasuxU"),
  
  // Vault A (DONUT)
  A_VAULT: new PublicKey("4ndfcH16GKY76bzDkKfyVwHMoF8oY75KES2VaAhUYksN"),
  A_VAULT_LP: new PublicKey("CocstBGbeDVyTJWxbWs4docwWapVADAo1xXQSh9RfPMz"),
  A_VAULT_LP_MINT: new PublicKey("6f2FVX5UT5uBtgknc8fDj119Z7DQoLJeKRmBq7j1zsVi"),
  A_TOKEN_VAULT: new PublicKey("6m1wvYoPrwjAnbuGMqpMoodQaq4VnZXRjrzufXnPSjmj"),
  
  // Vault B (SOL)
  B_VAULT_LP: new PublicKey("HJNs8hPTzs9i6AVFkRDDMFVEkrrUoV7H7LDZHdCWvxn7"),
  B_VAULT: new PublicKey("FERjPVNEa7Udq8CEv68h6tPL46Tq7ieE49HrE2wea3XT"),
  B_TOKEN_VAULT: new PublicKey("HZeLxbZ9uHtSpwZC3LBr4Nubd14iHwz7bRSghRZf5VCG"),
  B_VAULT_LP_MINT: new PublicKey("BvoAjwEDhpLzs3jtu4H72j96ShKT5rvZE9RP1vgpfSM"),
  
  // Tokens
  TOKEN_MINT: new PublicKey("F1vCKXMix75KigbwZUXkVU97NiE1H2ToopttH67ydqvq"),
  WSOL_MINT: new PublicKey("So11111111111111111111111111111111111111112"),
  
  // Meteora Programs
  METEORA_VAULT_PROGRAM: new PublicKey("24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi"),
  METEORA_AMM_PROGRAM: new PublicKey("Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB"),
  
  // Protocol Fees
  PROTOCOL_TOKEN_B_FEE: new PublicKey("88fLv3iEY7ubFCjwCzfzA7FsPG8xSBFicSPS8T8fX4Kq"),
  
  // Chainlink (Devnet)
  CHAINLINK_PROGRAM: new PublicKey("HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny"),
  SOL_USD_FEED: new PublicKey("99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR"),
  
  // Airdrop Program
  AIRDROP_PROGRAM_ID: new PublicKey("7QuDdyvjUGEqtsHhLR15YhNz1KXeBJ9SycVPEu1g8P4i"),
};

// System Programs
const SPL_TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

// Discriminators
const REGISTER_USER_DISCRIMINATOR = Buffer.from([2, 241, 150, 223, 99, 214, 116, 97]);
const NOTIFY_MATRIX_COMPLETION_DISCRIMINATOR = Buffer.from([88, 30, 2, 65, 55, 218, 137, 194]);

// Account counts for remaining_accounts
const VAULT_A_ACCOUNTS_COUNT = 4;
const CHAINLINK_ACCOUNTS_COUNT = 2;
const AIRDROP_ACCOUNTS_COUNT = 7;

// ============================================
// UTILITY FUNCTIONS
// ============================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getAssociatedTokenAddress(mint, owner) {
  const [address] = PublicKey.findProgramAddressSync(
    [
      owner.toBuffer(),
      SPL_TOKEN_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return address;
}

function createATAInstruction(payer, ataAddress, owner, mint) {
  return new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ataAddress, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }
    ],
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    data: Buffer.from([])
  });
}

// ============================================
// ALT FUNCTIONS
// ============================================

async function waitForALT(connection, lookupTableAddress, expectedCount, maxAttempts = ALT_MAX_ATTEMPTS) {
  console.log(`\n⏳ Waiting for ALT to be ready with ${expectedCount} addresses...`);
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const lookupTableAccount = await connection.getAddressLookupTable(lookupTableAddress);
      
      if (lookupTableAccount.value) {
        const addressCount = lookupTableAccount.value.state.addresses.length;
        console.log(`  📊 Attempt ${i + 1}/${maxAttempts}: ${addressCount}/${expectedCount} addresses`);
        
        if (addressCount === expectedCount) {
          console.log(`  ✅ ALT is ready!`);
          return lookupTableAccount.value;
        }
      }
    } catch (error) {
      console.log(`  ⚠️ Error checking ALT: ${error.message}`);
    }
    
    if (i < maxAttempts - 1) {
      await sleep(ALT_CHECK_INTERVAL);
    }
  }
  
  throw new Error(`ALT not ready after ${maxAttempts} attempts`);
}

async function createAndPopulateLookupTable(connection, wallet, addresses) {
  console.log("\n🏗️ CREATING AND POPULATING ADDRESS LOOKUP TABLE...");
  console.log(`📊 Total unique addresses to add: ${addresses.length}`);
  
  try {
    // Get current slot
    const slot = await connection.getSlot('confirmed');
    console.log(`📍 Current slot: ${slot}`);
    
    // Create lookup table
    const [createInstruction, lookupTableAddress] = AddressLookupTableProgram.createLookupTable({
      authority: wallet.publicKey,
      payer: wallet.publicKey,
      recentSlot: slot,
    });
    
    console.log(`🔑 ALT Address: ${lookupTableAddress.toString()}`);
    
    // Create and send creation transaction
    const createTableTx = new Transaction().add(createInstruction);
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    createTableTx.recentBlockhash = blockhash;
    createTableTx.feePayer = wallet.publicKey;
    
    const signedCreateTx = await wallet.signTransaction(createTableTx);
    const createTxId = await connection.sendRawTransaction(signedCreateTx.serialize(), {
      skipPreflight: false,
      maxRetries: MAX_RETRIES,
    });
    
    console.log(`✅ Creation transaction sent: ${createTxId}`);
    console.log(`🔍 Explorer: https://explorer.solana.com/tx/${createTxId}?cluster=devnet`);
    
    // Wait for confirmation
    console.log("⏳ Waiting for creation confirmation...");
    await connection.confirmTransaction(createTxId, 'confirmed');
    console.log("✅ ALT created successfully!");
    
    // Wait a bit for propagation
    await sleep(3000);
    
    // Add addresses in batches
    const BATCH_SIZE = 20;
    const extendTxIds = [];
    
    console.log(`\n📝 Adding ${addresses.length} addresses in batches of ${BATCH_SIZE}...`);
    
    for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
      const batch = addresses.slice(i, i + BATCH_SIZE);
      const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(addresses.length / BATCH_SIZE);
      
      console.log(`\n📦 Processing batch ${batchIndex}/${totalBatches} (${batch.length} addresses)...`);
      
      const extendInstruction = AddressLookupTableProgram.extendLookupTable({
        payer: wallet.publicKey,
        authority: wallet.publicKey,
        lookupTable: lookupTableAddress,
        addresses: batch,
      });
      
      const extendTableTx = new Transaction().add(extendInstruction);
      const { blockhash: extendBlockhash } = await connection.getLatestBlockhash('confirmed');
      extendTableTx.recentBlockhash = extendBlockhash;
      extendTableTx.feePayer = wallet.publicKey;
      
      const signedExtendTx = await wallet.signTransaction(extendTableTx);
      
      let retries = 3;
      while (retries > 0) {
        try {
          const extendTxId = await connection.sendRawTransaction(signedExtendTx.serialize(), {
            skipPreflight: true,
            maxRetries: 3,
          });
          
          console.log(`  ✅ Batch ${batchIndex} transaction sent: ${extendTxId}`);
          extendTxIds.push(extendTxId);
          
          // Wait for confirmation
          await connection.confirmTransaction(extendTxId, 'processed');
          break;
        } catch (error) {
          retries--;
          if (retries > 0) {
            console.log(`  ⚠️ Error in batch ${batchIndex}, retrying...`);
            await sleep(2000);
          } else {
            throw error;
          }
        }
      }
      
      // Pause between batches
      if (i + BATCH_SIZE < addresses.length) {
        await sleep(2000);
      }
    }
    
    // Wait for full ALT to be ready
    const lookupTableAccount = await waitForALT(connection, lookupTableAddress, addresses.length);
    
    console.log(`🎉 ALT created and populated successfully!`);
    
    return {
      lookupTableAddress,
      lookupTableAccount,
      createTxId,
      extendTxIds,
    };
    
  } catch (error) {
    console.error("❌ Error creating/populating ALT:", error);
    throw error;
  }
}

// ============================================
// ADDRESS COLLECTION FUNCTIONS
// ============================================

function collectAllAddressesForALT(
  walletPublicKey,
  referrerAddress,
  referrerPDA,
  userPDA,
  programSolVault,
  userWsolAccount,
  userDonutAccount,
  stateAddress,
  matrixProgramId,
  remainingAccounts
) {
  console.log("\n📋 COLLECTING ALL ADDRESSES FOR ALT...");
  
  const allAddresses = new Set();
  
  // Main instruction accounts
  console.log("  ➕ Adding main instruction accounts...");
  const mainAccounts = [
    stateAddress,
    walletPublicKey,
    referrerPDA,
    referrerAddress,
    userPDA,
    userWsolAccount,
    userDonutAccount,
    VERIFIED_ADDRESSES.WSOL_MINT,
    VERIFIED_ADDRESSES.POOL_ADDRESS,
    VERIFIED_ADDRESSES.B_VAULT,
    VERIFIED_ADDRESSES.B_TOKEN_VAULT,
    VERIFIED_ADDRESSES.B_VAULT_LP_MINT,
    VERIFIED_ADDRESSES.B_VAULT_LP,
    VERIFIED_ADDRESSES.METEORA_VAULT_PROGRAM,
    programSolVault,
    VERIFIED_ADDRESSES.TOKEN_MINT,
    VERIFIED_ADDRESSES.PROTOCOL_TOKEN_B_FEE,
    VERIFIED_ADDRESSES.METEORA_AMM_PROGRAM,
    SPL_TOKEN_PROGRAM_ID,
    SystemProgram.programId,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    SYSVAR_RENT_PUBKEY
  ];
  
  mainAccounts.forEach(addr => {
    if (addr) allAddresses.add(addr.toString());
  });
  
  // Add ALL remaining accounts
  console.log(`  ➕ Adding ${remainingAccounts.length} remaining accounts...`);
  remainingAccounts.forEach(acc => {
    if (acc && acc.pubkey) {
      allAddresses.add(acc.pubkey.toString());
    }
  });
  
  // Convert to array of PublicKey
  const uniqueAddresses = Array.from(allAddresses).map(addr => new PublicKey(addr));
  
  console.log(`  📊 Total unique addresses collected: ${uniqueAddresses.length}`);
  
  return uniqueAddresses;
}

// ============================================
// AIRDROP FUNCTIONS
// ============================================

async function isUserRegisteredInAirdrop(connection, userWallet) {
  const [userAccountPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_account", "utf8"), userWallet.toBuffer()],
    VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
  );
  
  try {
    const userAccountInfo = await connection.getAccountInfo(userAccountPda);
    return userAccountInfo !== null && userAccountInfo.owner.equals(VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID);
  } catch (error) {
    console.log(`⚠️ Error checking airdrop registration: ${error.message}`);
    return false;
  }
}

async function registerUserInAirdrop(connection, walletKeypair) {
  console.log("\n🪂 REGISTERING USER IN AIRDROP PROGRAM...");
  
  if (await isUserRegisteredInAirdrop(connection, walletKeypair.publicKey)) {
    console.log("✅ User already registered in airdrop program");
    return true;
  }
  
  const [programStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("program_state", "utf8")],
    VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
  );
  
  const [userAccountPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_account", "utf8"), walletKeypair.publicKey.toBuffer()],
    VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
  );
  
  const instructions = [];
  
  // Add compute budget
  instructions.push(ComputeBudgetProgram.setComputeUnitLimit({
    units: 500_000
  }));
  
  instructions.push(ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: 100000
  }));
  
  // Create register instruction
  const registerInstruction = new TransactionInstruction({
    programId: VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID,
    keys: [
      { pubkey: programStatePda, isSigner: false, isWritable: true },
      { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: userAccountPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: REGISTER_USER_DISCRIMINATOR
  });
  
  instructions.push(registerInstruction);
  
  try {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    
    const messageV0 = new TransactionMessage({
      payerKey: walletKeypair.publicKey,
      recentBlockhash: blockhash,
      instructions
    }).compileToV0Message();
    
    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([walletKeypair]);
    
    console.log("📤 Sending airdrop registration transaction...");
    const txid = await connection.sendTransaction(transaction, {
      skipPreflight: true,
      maxRetries: 3
    });
    
    console.log(`✅ Transaction sent: ${txid}`);
    console.log(`🔍 Explorer: https://explorer.solana.com/tx/${txid}?cluster=devnet`);
    
    await connection.confirmTransaction({
      signature: txid,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');
    
    console.log("✅ Airdrop registration confirmed!");
    await sleep(2000);
    
    return await isUserRegisteredInAirdrop(connection, walletKeypair.publicKey);
  } catch (error) {
    console.error("❌ Error registering in airdrop:", error.message);
    return false;
  }
}

async function prepareAirdropAccounts(connection, referrerAddress) {
  console.log("\n🪂 PREPARING AIRDROP PROGRAM ACCOUNTS...");
  
  const [programStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("program_state", "utf8")],
    VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
  );
  console.log(`  📝 Program State PDA: ${programStatePda.toString()}`);
  
  const stateAccountInfo = await connection.getAccountInfo(programStatePda);
  if (!stateAccountInfo) {
    throw new Error("Airdrop program state not found");
  }
  
  const [userAccountPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_account", "utf8"), referrerAddress.toBuffer()],
    VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
  );
  console.log(`  👤 User Account PDA: ${userAccountPda.toString()}`);
  
  let currentWeek = 1;
  if (stateAccountInfo && stateAccountInfo.data.length >= 73) {
    currentWeek = stateAccountInfo.data[72];
    console.log(`  📅 Current week: ${currentWeek}`);
  }
  
  const [currentWeekDataPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("weekly_data", "utf8"), Buffer.from([currentWeek])],
    VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
  );
  console.log(`  📊 Current Week Data PDA: ${currentWeekDataPda.toString()}`);
  
  const [nextWeekDataPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("weekly_data", "utf8"), Buffer.from([currentWeek + 1])],
    VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
  );
  console.log(`  📊 Next Week Data PDA: ${nextWeekDataPda.toString()}`);
  
  return {
    programStatePda,
    userAccountPda,
    currentWeekDataPda,
    nextWeekDataPda,
    currentWeek,
  };
}

// ============================================
// MAIN REGISTRATION FUNCTION
// ============================================

async function main() {
  console.log("\n🚀 REGISTER V11 - OPTIMIZED VERSION 🚀");
  console.log("==========================================");
  
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.error("\n❌ ERROR: Insufficient arguments!");
    console.log("\n📖 USAGE:");
    console.log("node register-v11-optimized.js <wallet> <config> <referrer> [deposit]");
    console.log("\nEXAMPLE:");
    console.log("node register-v11-optimized.js wallet.json config.json 5azaX9wJta8Z1gH3akQNPNZUKMXLGkYCmTqYK6gLpHb1 0.1");
    process.exit(1);
  }
  
  const walletPath = args[0];
  const configPath = args[1];
  const referrerAddressStr = args[2];
  const depositAmountStr = args[3] || '0.1';
  
  console.log("\n📋 CONFIGURATION:");
  console.log(`  Wallet: ${walletPath}`);
  console.log(`  Config: ${configPath}`);
  console.log(`  Referrer: ${referrerAddressStr}`);
  console.log(`  Deposit: ${depositAmountStr} SOL`);
  
  try {
    // Validate inputs
    const referrerAddress = new PublicKey(referrerAddressStr);
    const depositAmount = Math.floor(parseFloat(depositAmountStr) * 1e9);
    
    if (depositAmount <= 0) {
      throw new Error("Invalid deposit amount");
    }
    
    // Load wallet and config
    console.log(`\nLoading wallet from ${walletPath}...`);
    const walletKeypair = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, 'utf8')))
    );
    
    const idl = require('./target/idl/referral_system.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // Connect to network
    const connection = new Connection('https://weathered-quiet-theorem.solana-devnet.quiknode.pro/198997b67cb51804baeb34ed2257274aa2b2d8c0', {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: TRANSACTION_TIMEOUT,
    });
    console.log('Connected to Devnet with extended timeout (90s)');
    
    const MATRIX_PROGRAM_ID = new PublicKey(config.programId);
    const STATE_ADDRESS = new PublicKey(config.stateAddress);
    
    const anchorWallet = new Wallet(walletKeypair);
    const provider = new AnchorProvider(connection, anchorWallet, { 
      commitment: 'confirmed',
      skipPreflight: true,
    });
    const program = new Program(idl, MATRIX_PROGRAM_ID, provider);
    
    // Check balance
    console.log("\n👤 USER: " + walletKeypair.publicKey.toString());
    console.log("👥 REFERRER: " + referrerAddress.toString());
    const balance = await connection.getBalance(walletKeypair.publicKey);
    console.log("💰 BALANCE: " + balance / 1e9 + " SOL");
    
    if (balance < depositAmount + 50_000_000) {
      console.error("❌ Insufficient balance!");
      process.exit(1);
    }
    
    // Verify referrer
    console.log("\n🔍 VERIFYING REFERRER...");
    const [referrerPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_account"), referrerAddress.toBuffer()],
      MATRIX_PROGRAM_ID
    );
    
    const referrerInfo = await program.account.userAccount.fetch(referrerPDA);
    if (!referrerInfo.isRegistered) {
      console.error("❌ Referrer is not registered!");
      process.exit(1);
    }
    
    console.log("✅ Referrer verified");
    console.log("📊 Slots: " + referrerInfo.chain.filledSlots + "/3");
    
    const slotIndex = referrerInfo.chain.filledSlots;
    const isSlot3 = slotIndex === 2;
    
    console.log("\n🎯 YOU WILL FILL SLOT " + (slotIndex + 1));
    
    if (slotIndex === 0) {
      console.log("💱 Slot 1: Swap SOL → DONUT and burn 100%");
    } else if (slotIndex === 1) {
      console.log("💰 Slot 2: Reserve SOL for referrer");
    } else if (slotIndex === 2) {
      console.log("🔄 Slot 3: Pay reserved SOL and process recursion");
      
      if (!await isUserRegisteredInAirdrop(connection, referrerAddress)) {
        console.log("\n⚠️ WARNING: Referrer is not registered in airdrop program!");
        process.exit(1);
      }
    }
    
    // Check if user is already registered
    const [userPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_account"), walletKeypair.publicKey.toBuffer()],
      MATRIX_PROGRAM_ID
    );
    
    try {
      const userInfo = await program.account.userAccount.fetch(userPDA);
      if (userInfo.isRegistered) {
        console.log("⚠️ You are already registered!");
        process.exit(0);
      }
    } catch {
      console.log("✅ User not registered, proceeding...");
    }
    
    // Register in airdrop if needed
    if (!await isUserRegisteredInAirdrop(connection, walletKeypair.publicKey)) {
      const registered = await registerUserInAirdrop(connection, walletKeypair);
      if (!registered) {
        console.log("❌ Failed to register in airdrop");
        process.exit(1);
      }
    } else {
      console.log("✅ User already registered in airdrop");
    }
    
    // Derive PDAs
    console.log("\n🔧 DERIVING PDAs...");
    const [programSolVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("program_sol_vault")],
      MATRIX_PROGRAM_ID
    );
    
    const userWsolAccount = getAssociatedTokenAddress(
      VERIFIED_ADDRESSES.WSOL_MINT, 
      walletKeypair.publicKey
    );
    const userDonutAccount = getAssociatedTokenAddress(
      VERIFIED_ADDRESSES.TOKEN_MINT, 
      walletKeypair.publicKey
    );
    
    const wsolInfo = await connection.getAccountInfo(userWsolAccount);
    const donutInfo = await connection.getAccountInfo(userDonutAccount);
    
    console.log("💰 Program SOL Vault: " + programSolVault.toString());
    console.log("💵 User WSOL ATA: " + userWsolAccount.toString());
    console.log("🍩 User DONUT ATA: " + userDonutAccount.toString());
    console.log(wsolInfo ? "✅ WSOL ATA exists" : "⚠️ WSOL ATA will be created");
    console.log(donutInfo ? "✅ DONUT ATA exists" : "⚠️ DONUT ATA will be created");
    
    // Build remaining accounts
    console.log("\n🔄 BUILDING REMAINING ACCOUNTS...");
    
    // Always include Vault A accounts
    const vaultAAccounts = [
      { pubkey: VERIFIED_ADDRESSES.A_VAULT, isWritable: true, isSigner: false },
      { pubkey: VERIFIED_ADDRESSES.A_VAULT_LP, isWritable: true, isSigner: false },
      { pubkey: VERIFIED_ADDRESSES.A_VAULT_LP_MINT, isWritable: true, isSigner: false },
      { pubkey: VERIFIED_ADDRESSES.A_TOKEN_VAULT, isWritable: true, isSigner: false },
    ];
    
    // Always include Chainlink accounts
    const chainlinkAccounts = [
      { pubkey: VERIFIED_ADDRESSES.SOL_USD_FEED, isWritable: false, isSigner: false },
      { pubkey: VERIFIED_ADDRESSES.CHAINLINK_PROGRAM, isWritable: false, isSigner: false },
    ];
    
    let mainRemainingAccounts = [...vaultAAccounts, ...chainlinkAccounts];
    
    // Prepare uplines and airdrop accounts for slot 3
    let uplineAccounts = [];
    let airdropInfo = null;
    
    if (isSlot3) {
      console.log("\n🔄 SLOT 3 DETECTED - Preparing recursion...");
      
      // Check if base user
      const isBaseUser = !referrerInfo.referrer || referrerInfo.referrer.toString() === SystemProgram.programId.toString();
      console.log(`\n🔍 User type: ${isBaseUser ? 'BASE' : 'NON-BASE'}`);
      
      // Prepare uplines
      if (referrerInfo.upline?.upline?.length > 0) {
        console.log(`\n📊 Uplines found: ${referrerInfo.upline.upline.length}`);
        const uplines = referrerInfo.upline.upline.map(entry => entry.pda);
        uplineAccounts = [];
        
        for (let i = 0; i < Math.min(uplines.length, 6); i++) {
          const uplinePDA = uplines[i];
          console.log(`\n  🔍 Analyzing upline ${i + 1}: ${uplinePDA.toString()}`);
          
          try {
            const uplineInfo = await program.account.userAccount.fetch(uplinePDA);
            
            if (!uplineInfo.isRegistered) {
              console.log(`  ❌ Upline not registered! Skipping.`);
              continue;
            }
            
            if (uplineInfo.ownerWallet) {
              const uplineWallet = uplineInfo.ownerWallet;
              console.log(`  ✅ Wallet: ${uplineWallet.toString()}`);
              
              if (!await isUserRegisteredInAirdrop(connection, uplineWallet)) {
                console.log(`  ❌ Upline not registered in airdrop!`);
                continue;
              }
              
              console.log(`  ✅ Upline registered in airdrop`);
              
              uplineAccounts.push({
                pubkey: uplinePDA,
                isWritable: true,
                isSigner: false,
              });
              
              uplineAccounts.push({
                pubkey: uplineWallet,
                isWritable: true,
                isSigner: false,
              });
            }
          } catch (e) {
            console.log(`  ❌ Error analyzing upline: ${e.message}`);
          }
        }
        
        console.log(`\n✅ Total valid uplines: ${uplineAccounts.length / 2}`);
        
        if (uplineAccounts.length % 2 !== 0) {
          console.error("\n❌ CRITICAL ERROR: uplineAccounts has odd number of elements!");
          process.exit(1);
        }
      } else {
        console.log("\n📊 No uplines found in referrer");
      }
      
      // Prepare airdrop accounts
      airdropInfo = await prepareAirdropAccounts(connection, referrerAddress);
    }
    
    // Add airdrop accounts for slot 3
    if (isSlot3 && airdropInfo) {
      console.log("  ➕ Adding airdrop accounts...");
      
      const airdropAccounts = [
        { pubkey: airdropInfo.programStatePda, isWritable: true, isSigner: false },
        { pubkey: airdropInfo.userAccountPda, isWritable: true, isSigner: false },
        { pubkey: airdropInfo.currentWeekDataPda, isWritable: true, isSigner: false },
        { pubkey: airdropInfo.nextWeekDataPda, isWritable: true, isSigner: false },
        { pubkey: referrerAddress, isWritable: true, isSigner: false },
        { pubkey: VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID, isWritable: false, isSigner: false },
        { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isWritable: false, isSigner: false }
      ];
      
      mainRemainingAccounts = [...mainRemainingAccounts, ...airdropAccounts];
      
      // OPTIMIZED: NO NEED TO ADD ALL 36 WEEK PDAs!
      // Current and next week are already included in airdropAccounts
      
      // Add upline airdrop PDAs
      if (uplineAccounts.length > 0) {
        console.log("  ➕ Adding upline airdrop PDAs...");
        
        for (let i = 0; i < uplineAccounts.length; i += 2) {
          if (i + 1 < uplineAccounts.length) {
            const uplineWallet = uplineAccounts[i + 1].pubkey;
            
            const [uplineAirdropPDA] = PublicKey.findProgramAddressSync(
              [Buffer.from("user_account", "utf8"), uplineWallet.toBuffer()],
              VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
            );
            
            mainRemainingAccounts.push({
              pubkey: uplineAirdropPDA,
              isWritable: true,
              isSigner: false,
            });
            
            console.log(`    Airdrop PDA ${(i/2)+1}: ${uplineAirdropPDA.toString()}`);
          }
        }
        
        // Now add upline pairs
        console.log(`  ➕ Adding ${uplineAccounts.length} upline accounts (${uplineAccounts.length/2} pairs)...`);
        mainRemainingAccounts = [...mainRemainingAccounts, ...uplineAccounts];
      }
    }
    
    console.log(`  📊 Total remaining accounts: ${mainRemainingAccounts.length}`);
    
    // Debug structure for slot 3
    if (isSlot3) {
      console.log("\n🔍 DEBUG - Remaining Accounts Structure:");
      console.log(`  [0-3]: Vault A (4 accounts)`);
      console.log(`  [4-5]: Chainlink (2 accounts)`);
      
      if (airdropInfo) {
        console.log(`  [6-12]: Airdrop (7 accounts) - includes current & next week`);
        
        if (uplineAccounts.length > 0) {
          const uplineAirdropCount = uplineAccounts.length / 2;
          console.log(`  [13-${12 + uplineAirdropCount}]: Upline Airdrop PDAs (${uplineAirdropCount} accounts)`);
          const uplineStart = 13 + uplineAirdropCount;
          console.log(`  [${uplineStart}+]: Upline pairs (${uplineAccounts.length} accounts = ${uplineAccounts.length/2} pairs)`);
        }
      }
      
      console.log(`\n  Total: ${mainRemainingAccounts.length} accounts`);
    }
    
    // Collect ALL addresses for ALT
    const allAddresses = collectAllAddressesForALT(
      walletKeypair.publicKey,
      referrerAddress,
      referrerPDA,
      userPDA,
      programSolVault,
      userWsolAccount,
      userDonutAccount,
      STATE_ADDRESS,
      MATRIX_PROGRAM_ID,
      mainRemainingAccounts
    );
    
    // Create and populate ALT
    const { lookupTableAddress, lookupTableAccount } = await createAndPopulateLookupTable(
      connection,
      anchorWallet,
      allAddresses
    );
    
    // Prepare transaction
    console.log("\n📤 PREPARING MAIN TRANSACTION...");
    
    const instructions = [];
    
    // Compute budget
    const computeUnits = isSlot3 ? 1_400_000 : 1_000_000;
    instructions.push(ComputeBudgetProgram.setComputeUnitLimit({
      units: computeUnits
    }));
    
    instructions.push(ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 250000
    }));
    
    // Create ATAs if needed
    if (!wsolInfo) {
      console.log("  ➕ Adding instruction to create WSOL ATA");
      instructions.push(createATAInstruction(
        walletKeypair.publicKey,
        userWsolAccount,
        walletKeypair.publicKey,
        VERIFIED_ADDRESSES.WSOL_MINT
      ));
    }
    
    if (!donutInfo) {
      console.log("  ➕ Adding instruction to create DONUT ATA");
      instructions.push(createATAInstruction(
        walletKeypair.publicKey,
        userDonutAccount,
        walletKeypair.publicKey,
        VERIFIED_ADDRESSES.TOKEN_MINT
      ));
    }
    
    // Create register instruction
    const registerIx = await program.methods
      .registerWithSolDeposit(new BN(depositAmount))
      .accounts({
        state: STATE_ADDRESS,
        userWallet: walletKeypair.publicKey,
        referrer: referrerPDA,
        referrerWallet: referrerAddress,
        user: userPDA,
        userWsolAccount: userWsolAccount,
        userDonutAccount: userDonutAccount,
        wsolMint: VERIFIED_ADDRESSES.WSOL_MINT,
        pool: VERIFIED_ADDRESSES.POOL_ADDRESS,
        bVault: VERIFIED_ADDRESSES.B_VAULT,
        bTokenVault: VERIFIED_ADDRESSES.B_TOKEN_VAULT,
        bVaultLpMint: VERIFIED_ADDRESSES.B_VAULT_LP_MINT,
        bVaultLp: VERIFIED_ADDRESSES.B_VAULT_LP,
        vaultProgram: VERIFIED_ADDRESSES.METEORA_VAULT_PROGRAM,
        programSolVault: programSolVault,
        tokenMint: VERIFIED_ADDRESSES.TOKEN_MINT,
        protocolTokenFee: VERIFIED_ADDRESSES.PROTOCOL_TOKEN_B_FEE,
        ammProgram: VERIFIED_ADDRESSES.METEORA_AMM_PROGRAM,
        tokenProgram: SPL_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .remainingAccounts(mainRemainingAccounts)
      .instruction();
    
    instructions.push(registerIx);
    
    console.log(`📦 Total instructions: ${instructions.length}`);
    console.log(`🔑 ALT: ${lookupTableAddress.toString()}`);
    console.log(`📊 ALT has ${lookupTableAccount.state.addresses.length} addresses`);
    
    // Create versioned transaction with ALT
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    
    const messageV0 = new TransactionMessage({
      payerKey: walletKeypair.publicKey,
      recentBlockhash: blockhash,
      instructions
    }).compileToV0Message([lookupTableAccount]);
    
    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([walletKeypair]);
    
    console.log("✅ Transaction prepared with ALT");
    
    // Check transaction size
    const serialized = transaction.serialize();
    console.log(`📏 Transaction size: ${serialized.length} bytes (max: 1232)`);
    if (serialized.length > 1232) {
      console.error("❌ Transaction too large!");
      process.exit(1);
    }
    
    // Send transaction
    console.log("\n📤 SENDING TRANSACTION...");
    
    try {
      const signature = await connection.sendTransaction(transaction, {
        skipPreflight: true,
        maxRetries: MAX_RETRIES,
      });
      
      console.log(`✅ Transaction sent: ${signature}`);
      console.log(`🔍 Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
      
      console.log("\n⏳ Waiting for confirmation...");
      
      const startTime = Date.now();
      const timeout = TRANSACTION_TIMEOUT;
      
      while (Date.now() - startTime < timeout) {
        const status = await connection.getSignatureStatus(signature, {
          searchTransactionHistory: true,
        });
        
        if (status && status.value) {
          if (status.value.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
          }
          
          if (status.value.confirmationStatus === 'confirmed' || 
              status.value.confirmationStatus === 'finalized') {
            console.log(`✅ Transaction confirmed with status: ${status.value.confirmationStatus}`);
            break;
          }
        }
        
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`  🔍 Checking status (${elapsed}s/${timeout/1000}s)...`);
        await sleep(2000);
      }
      
      console.log("\n⏳ Waiting 5 seconds for state update...");
      await sleep(5000);
      
      console.log("\n🔍 VERIFYING RESULTS...");
      
      try {
        const userInfo = await program.account.userAccount.fetch(userPDA);
        console.log("\n📋 REGISTRATION CONFIRMED:");
        console.log("✅ Registered: " + userInfo.isRegistered);
        console.log("👥 Referrer: " + userInfo.referrer.toString());
        console.log("🔢 Depth: " + userInfo.upline.depth);
        
        const newBalance = await connection.getBalance(walletKeypair.publicKey);
        console.log("\n💼 New balance: " + newBalance / 1e9 + " SOL");
        console.log("💸 Total spent: " + (balance - newBalance) / 1e9 + " SOL");
        
        console.log("\n🎉 REGISTRATION COMPLETED SUCCESSFULLY! 🎉");
        console.log("🔑 ALT used: " + lookupTableAddress.toString());
        console.log("==========================================");
      } catch (e) {
        console.log("\n✅ Transaction confirmed!");
        console.log("📝 Transaction: " + signature);
      }
      
    } catch (error) {
      console.error("\n❌ TRANSACTION ERROR:", error.message);
      
      if (error.logs) {
        console.log("\n📋 ERROR LOGS:");
        error.logs.forEach((log, i) => console.log(`${i}: ${log}`));
      }
      
      process.exit(1);
    }
    
  } catch (error) {
    console.error("\n❌ ERROR:", error.message);
    process.exit(1);
  }
}

// Run the program
main().catch(console.error);