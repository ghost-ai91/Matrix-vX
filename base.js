// registro-base-com-atas.js - Cria ATAs primeiro, depois registra
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  ComputeBudgetProgram,
  SYSVAR_RENT_PUBKEY,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");
const { AnchorProvider, Program, BN } = require("@coral-xyz/anchor");
const fs = require("fs");
const path = require("path");

// Endereços verificados
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
  
  // Programas Meteora
  METEORA_VAULT_PROGRAM: new PublicKey("24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi"),
  METEORA_AMM_PROGRAM: new PublicKey("Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB"),
  
  // Protocol Fees
  PROTOCOL_TOKEN_A_FEE: new PublicKey("2B6tLDfiQAMSPAKuHqRMvhuQ5dRKDWkYF6m7ggtzmCY5"),
  PROTOCOL_TOKEN_B_FEE: new PublicKey("88fLv3iEY7ubFCjwCzfzA7FsPG8xSBFicSPS8T8fX4Kq"),
};

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

function loadWallet(path) {
  const keypairData = JSON.parse(fs.readFileSync(path, 'utf8'));
  return Keypair.fromSecretKey(new Uint8Array(keypairData));
}

function getAssociatedTokenAddress(mint, owner) {
  const [address] = PublicKey.findProgramAddressSync(
    [
      owner.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return address;
}

// Função para criar instrução de ATA
function createATAInstruction(payer, ata, owner, mint) {
  return {
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    data: Buffer.alloc(0),
  };
}

async function main() {
  console.log("🚀 REGISTRO COM CRIAÇÃO DE ATAs PRIMEIRO 🚀");
  console.log("==========================================");

  try {
    const args = process.argv.slice(2);
    const walletPath = args[0] || "/Users/dark/.config/solana/id.json";
    const configPath = args[1] || "./matriz-config.json";
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const idl = JSON.parse(fs.readFileSync("./target/idl/referral_system.json", 'utf8'));
    
    const connection = new Connection("https://api.devnet.solana.com", 'confirmed');
    const treasuryWallet = loadWallet(walletPath);
    
    console.log(`👤 Treasury: ${treasuryWallet.publicKey.toString()}`);
    
    const MULTISIG_TREASURY = new PublicKey(config.multisigTreasury);
    if (!treasuryWallet.publicKey.equals(MULTISIG_TREASURY)) {
      console.error(`❌ Carteira incorreta!`);
      return;
    }

    // ETAPA 1: CRIAR ATAs
    console.log("\n📋 ETAPA 1: CRIANDO ATAs...");
    
    const userWsolAccount = getAssociatedTokenAddress(VERIFIED_ADDRESSES.WSOL_MINT, treasuryWallet.publicKey);
    const userDonutAccount = getAssociatedTokenAddress(VERIFIED_ADDRESSES.TOKEN_MINT, treasuryWallet.publicKey);
    
    // Verificar se ATAs existem
    let needsWsolATA = false;
    let needsDonutATA = false;
    
    try {
      const wsolInfo = await connection.getAccountInfo(userWsolAccount);
      if (!wsolInfo) needsWsolATA = true;
    } catch {
      needsWsolATA = true;
    }
    
    try {
      const donutInfo = await connection.getAccountInfo(userDonutAccount);
      if (!donutInfo) needsDonutATA = true;
    } catch {
      needsDonutATA = true;
    }
    
    if (needsWsolATA || needsDonutATA) {
      const ataTransaction = new Transaction();
      
      if (needsWsolATA) {
        console.log("📝 Criando ATA WSOL...");
        ataTransaction.add(createATAInstruction(
          treasuryWallet.publicKey,
          userWsolAccount,
          treasuryWallet.publicKey,
          VERIFIED_ADDRESSES.WSOL_MINT
        ));
      }
      
      if (needsDonutATA) {
        console.log("📝 Criando ATA DONUT...");
        ataTransaction.add(createATAInstruction(
          treasuryWallet.publicKey,
          userDonutAccount,
          treasuryWallet.publicKey,
          VERIFIED_ADDRESSES.TOKEN_MINT
        ));
      }
      
      const ataTxid = await sendAndConfirmTransaction(connection, ataTransaction, [treasuryWallet]);
      console.log(`✅ ATAs criadas: ${ataTxid}`);
      
      // Aguardar confirmação
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      console.log("✅ ATAs já existem");
    }

    // ETAPA 2: REGISTRAR COM MENOS COMPUTE
    console.log("\n📋 ETAPA 2: REGISTRANDO USUÁRIO...");
    
    const provider = new AnchorProvider(
      connection,
      {
        publicKey: treasuryWallet.publicKey,
        signTransaction: async (tx) => {
          tx.partialSign(treasuryWallet);
          return tx;
        },
        signAllTransactions: async (txs) => {
          return txs.map((tx) => {
            tx.partialSign(treasuryWallet);
            return tx;
          });
        },
      },
      { commitment: 'confirmed' }
    );

    const programId = new PublicKey(config.programId);
    const program = new Program(idl, programId, provider);
    
    const [userPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_account"), treasuryWallet.publicKey.toBuffer()],
      programId
    );

    // Verificar se já está registrado
    try {
      const userAccount = await program.account.userAccount.fetch(userPda);
      if (userAccount.isRegistered) {
        console.log("❌ Usuário já está registrado!");
        return;
      }
    } catch {
      console.log("✅ Usuário não registrado");
    }

    const DEPOSIT_AMOUNT = 100_000_000; // 0.1 SOL
    
    // Remaining accounts do Vault A
    const remainingAccounts = [
      { pubkey: VERIFIED_ADDRESSES.A_VAULT, isWritable: true, isSigner: false },
      { pubkey: VERIFIED_ADDRESSES.A_VAULT_LP, isWritable: true, isSigner: false },
      { pubkey: VERIFIED_ADDRESSES.A_VAULT_LP_MINT, isWritable: true, isSigner: false },
      { pubkey: VERIFIED_ADDRESSES.A_TOKEN_VAULT, isWritable: true, isSigner: false },
    ];

    try {
      // Usar menos compute units já que ATAs foram criadas
      const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
        units: 800_000, // Reduzido pois ATAs já existem
      });

      const registerTx = await program.methods
        .registerWithoutReferrer(new BN(DEPOSIT_AMOUNT))
        .accounts({
          state: new PublicKey(config.stateAddress),
          owner: treasuryWallet.publicKey,
          userWallet: treasuryWallet.publicKey,
          user: userPda,
          userWsolAccount: userWsolAccount,
          userDonutAccount: userDonutAccount,
          wsolMint: VERIFIED_ADDRESSES.WSOL_MINT,
          pool: VERIFIED_ADDRESSES.POOL_ADDRESS,
          bVault: VERIFIED_ADDRESSES.B_VAULT,
          bTokenVault: VERIFIED_ADDRESSES.B_TOKEN_VAULT,
          bVaultLpMint: VERIFIED_ADDRESSES.B_VAULT_LP_MINT,
          bVaultLp: VERIFIED_ADDRESSES.B_VAULT_LP,
          vaultProgram: VERIFIED_ADDRESSES.METEORA_VAULT_PROGRAM,
          tokenMint: VERIFIED_ADDRESSES.TOKEN_MINT,
          protocolTokenFee: VERIFIED_ADDRESSES.PROTOCOL_TOKEN_B_FEE,
          ammProgram: VERIFIED_ADDRESSES.METEORA_AMM_PROGRAM,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .remainingAccounts(remainingAccounts)
        .preInstructions([modifyComputeUnits])
        .rpc({
          skipPreflight: true,
          commitment: 'confirmed',
        });
      
      console.log("\n✅ REGISTRO CONCLUÍDO!");
      console.log(`📎 Transação: ${registerTx}`);
      console.log(`🔍 Explorer: https://explorer.solana.com/tx/${registerTx}?cluster=devnet`);

      // Verificar resultado
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const userAccount = await program.account.userAccount.fetch(userPda);
      console.log("\n📊 VERIFICAÇÃO:");
      console.log(`✅ Registrado: ${userAccount.isRegistered}`);
      console.log(`👤 Owner: ${userAccount.ownerWallet.toString()}`);
      console.log(`🆔 IDs: Upline ${userAccount.upline.id}, Chain ${userAccount.chain.id}`);

    } catch (error) {
      console.error("\n❌ Erro no registro:", error);
      if (error.logs) {
        console.log("\n📋 Logs:");
        error.logs.forEach((log, i) => console.log(`${i}: ${log}`));
      }
    }

  } catch (error) {
    console.error("❌ Erro:", error);
  }
}

main();