// base-fixed.js - Versão corrigida com criação de ATAs
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  ComputeBudgetProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} = require("@solana/web3.js")
const { AnchorProvider, Program, BN } = require("@coral-xyz/anchor")
const fs = require("fs")

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
  PROTOCOL_TOKEN_B_FEE: new PublicKey("88fLv3iEY7ubFCjwCzfzA7FsPG8xSBFicSPS8T8fX4Kq"),
}

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")

function loadWallet(path) {
  const keypairData = JSON.parse(fs.readFileSync(path, "utf8"))
  return Keypair.fromSecretKey(new Uint8Array(keypairData))
}

function getAssociatedTokenAddress(mint, owner) {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )
  return address
}

// NOVA FUNÇÃO: Criar instrução de ATA (copiada do script com referenciador)
function createATAInstruction(payer, ataAddress, owner, mint) {
  return new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ataAddress, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }
    ],
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    data: Buffer.from([])
  });
}

async function main() {
  console.log("🚀 REGISTRO DE USUÁRIO BASE - COM CRIAÇÃO DE ATAs 🚀")
  console.log("====================================================")

  try {
    const walletPath = process.argv[2] || "/Users/dark/.config/solana/id.json"
    const configPath = process.argv[3] || "./matriz-config.json"

    const config = JSON.parse(fs.readFileSync(configPath, "utf8"))
    const idl = JSON.parse(fs.readFileSync("./target/idl/referral_system.json", "utf8"))

    const connection = new Connection(
      "https://weathered-quiet-theorem.solana-devnet.quiknode.pro/198997b67cb51804baeb34ed2257274aa2b2d8c0",
      "confirmed"
    )
    const treasuryWallet = loadWallet(walletPath)

    console.log(`👤 Treasury: ${treasuryWallet.publicKey.toString()}`)

    const provider = new AnchorProvider(connection, treasuryWallet, {
      commitment: "confirmed",
    })
    const programId = new PublicKey(config.programId)
    const program = new Program(idl, programId, provider)

    const [userPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_account"), treasuryWallet.publicKey.toBuffer()],
      programId
    )

    // Verificar registro
    try {
      const userAccount = await program.account.userAccount.fetch(userPda)
      if (userAccount.isRegistered) {
        console.log("❌ Usuário já está registrado!")
        return
      }
    } catch {
      console.log("✅ Usuário não registrado")
    }

    // Derivar ATAs
    const userWsolAccount = getAssociatedTokenAddress(
      VERIFIED_ADDRESSES.WSOL_MINT,
      treasuryWallet.publicKey
    )
    const userDonutAccount = getAssociatedTokenAddress(
      VERIFIED_ADDRESSES.TOKEN_MINT,
      treasuryWallet.publicKey
    )

    console.log(`\n📍 WSOL ATA: ${userWsolAccount.toString()}`)
    console.log(`📍 DONUT ATA: ${userDonutAccount.toString()}`)

    // NOVO: Verificar se ATAs existem
    console.log("\n🔍 Verificando ATAs...")
    const wsolInfo = await connection.getAccountInfo(userWsolAccount)
    const donutInfo = await connection.getAccountInfo(userDonutAccount)
    
    console.log(wsolInfo ? "✅ WSOL ATA já existe" : "⚠️ WSOL ATA será criada")
    console.log(donutInfo ? "✅ DONUT ATA já existe" : "⚠️ DONUT ATA será criada")

    console.log("\n📋 PREPARANDO REGISTRO COM ATAs...")

    const DEPOSIT_AMOUNT = new BN(100_000_000) // 0.1 SOL

    // Criar instrução principal
    const registerInstruction = await program.methods
      .registerWithoutReferrer(DEPOSIT_AMOUNT)
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
      .remainingAccounts([
        {
          pubkey: VERIFIED_ADDRESSES.A_VAULT,
          isWritable: true,
          isSigner: false,
        },
        {
          pubkey: VERIFIED_ADDRESSES.A_VAULT_LP,
          isWritable: true,
          isSigner: false,
        },
        {
          pubkey: VERIFIED_ADDRESSES.A_VAULT_LP_MINT,
          isWritable: true,
          isSigner: false,
        },
        {
          pubkey: VERIFIED_ADDRESSES.A_TOKEN_VAULT,
          isWritable: true,
          isSigner: false,
        },
      ])
      .instruction()

    // Criar transação com todas as instruções necessárias
    const transaction = new Transaction()

    // 1. Heap frame
    transaction.add(
      ComputeBudgetProgram.requestHeapFrame({
        bytes: 256 * 1024, // 256KB
      })
    )

    // 2. Compute units
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 1_400_000,
      })
    )

    // 3. NOVO: Criar WSOL ATA se necessário
    if (!wsolInfo) {
      console.log("➕ Adicionando instrução para criar WSOL ATA...")
      const createWsolATA = createATAInstruction(
        treasuryWallet.publicKey,
        userWsolAccount,
        treasuryWallet.publicKey,
        VERIFIED_ADDRESSES.WSOL_MINT
      )
      transaction.add(createWsolATA)
    }

    // 4. NOVO: Criar DONUT ATA se necessário
    if (!donutInfo) {
      console.log("➕ Adicionando instrução para criar DONUT ATA...")
      const createDonutATA = createATAInstruction(
        treasuryWallet.publicKey,
        userDonutAccount,
        treasuryWallet.publicKey,
        VERIFIED_ADDRESSES.TOKEN_MINT
      )
      transaction.add(createDonutATA)
    }

    // 5. Instrução principal de registro
    transaction.add(registerInstruction)

    console.log(`\n📦 Total de instruções: ${transaction.instructions.length}`)

    // Enviar transação
    console.log("📝 Enviando transação...")

    try {
      const txid = await sendAndConfirmTransaction(
        connection,
        transaction,
        [treasuryWallet],
        {
          skipPreflight: true,
          commitment: "confirmed",
          maxRetries: 3,
        }
      )

      console.log("\n✅ SUCESSO!")
      console.log(`📎 Transação: ${txid}`)
      console.log(`🔍 Explorer: https://explorer.solana.com/tx/${txid}?cluster=devnet`)

      // Verificar resultado
      console.log("\n🔍 Verificando registro...")
      const userInfo = await program.account.userAccount.fetch(userPda)
      console.log("✅ Registrado:", userInfo.isRegistered)
      console.log("🔢 Upline ID:", userInfo.upline.id.toString())
      console.log("🔢 Chain ID:", userInfo.chain.id.toString())

    } catch (error) {
      console.error("\n❌ Erro:", error)

      // Tentar buscar logs da transação
      if (error.signature) {
        try {
          await new Promise((resolve) => setTimeout(resolve, 2000))
          const tx = await connection.getTransaction(error.signature, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0,
          })

          if (tx?.meta?.logMessages) {
            console.log("\n📋 Logs da transação:")
            tx.meta.logMessages.forEach((log, i) => console.log(`${i}: ${log}`))
          }
        } catch {}
      }
    }
  } catch (error) {
    console.error("❌ Erro geral:", error)
  }
}

main()