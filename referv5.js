// Script otimizado para registrar usuário com referenciador - TRANSAÇÃO ÚNICA PARA SLOT 1
const {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
  TransactionInstruction,
  Transaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} = require("@solana/web3.js")
const {
  AnchorProvider,
  Program,
  BN,
  Wallet,
  utils,
} = require("@coral-xyz/anchor")
const fs = require("fs")
const path = require("path")

// Receber parâmetros da linha de comando
const args = process.argv.slice(2)
const walletPath = args[0] || "./carteiras/carteira1.json"
const configPath = args[1] || "./matriz-config.json"
const referrerAddressStr =
  args[2] || "QgNN4aW9hPz4ANP1LqzR2FkDPZo9MzDZxDQ4abovHYv" // Obrigatório
const altAddress =
  args[3] || "FhNUsPQsuoNtLRJQ9HQgSPF6vNDysJvDMnp5HXsr85Jw" // Obrigatório

// AIRDROP PROGRAM CONSTANTS - ADDED FOR MATRIX COMPLETION NOTIFICATION
const AIRDROP_PROGRAM_ID = new PublicKey(
  "2AUXkFgK6Cf8c8H3YswbpuE97D2jAcLmjq5iZ1afNYa6"
)

// Endereços verificados (igual ao contrato)
const VERIFIED_ADDRESSES = {
  // Pool Meteora
  POOL_ADDRESS: new PublicKey(
    "FrQ5KsAgjCe3FFg6ZENri8feDft54tgnATxyffcasuxU"
  ),

  // Vault A (DONUT)
  A_VAULT: new PublicKey(
    "4ndfcH16GKY76bzDkKfyVwHMoF8oY75KES2VaAhUYksN"
  ),
  A_VAULT_LP: new PublicKey(
    "CocstBGbeDVyTJWxbWs4docwWapVADAo1xXQSh9RfPMz"
  ),
  A_VAULT_LP_MINT: new PublicKey(
    "6f2FVX5UT5uBtgknc8fDj119Z7DQoLJeKRmBq7j1zsVi"
  ),
  A_TOKEN_VAULT: new PublicKey(
    "6m1wvYoPrwjAnbuGMqpMoodQaq4VnZXRjrzufXnPSjmj"
  ),

  // Vault B (SOL)
  B_VAULT_LP: new PublicKey(
    "HJNs8hPTzs9i6AVFkRDDMFVEkrrUoV7H7LDZHdCWvxn7"
  ),
  B_VAULT: new PublicKey(
    "FERjPVNEa7Udq8CEv68h6tPL46Tq7ieE49HrE2wea3XT"
  ),
  B_TOKEN_VAULT: new PublicKey(
    "HZeLxbZ9uHtSpwZC3LBr4Nubd14iHwz7bRSghRZf5VCG"
  ),
  B_VAULT_LP_MINT: new PublicKey(
    "BvoAjwEDhpLzs3jtu4H72j96ShKT5rvZE9RP1vgpfSM"
  ),

  // Tokens
  TOKEN_MINT: new PublicKey(
    "F1vCKXMix75KigbwZUXkVU97NiE1H2ToopttH67ydqvq"
  ),
  WSOL_MINT: new PublicKey(
    "So11111111111111111111111111111111111111112"
  ),

  // Programas Meteora
  METEORA_VAULT_PROGRAM: new PublicKey(
    "24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi"
  ),
  METEORA_AMM_PROGRAM: new PublicKey(
    "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB"
  ),

  // Protocol Fees
  PROTOCOL_TOKEN_B_FEE: new PublicKey(
    "88fLv3iEY7ubFCjwCzfzA7FsPG8xSBFicSPS8T8fX4Kq"
  ),

  // Chainlink (Devnet)
  CHAINLINK_PROGRAM: new PublicKey(
    "HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny"
  ),
  SOL_USD_FEED: new PublicKey(
    "99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR"
  ),
}

// Programas do sistema
const SPL_TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
)
const SYSTEM_PROGRAM_ID = new PublicKey(
  "11111111111111111111111111111111"
)
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
)

// Função para mostrar detalhes da ALT
async function getAddressLookupTable(connection, altAddress) {
  console.log("\n📋 OBTENDO ADDRESS LOOKUP TABLE:")

  try {
    const lookupTableInfo = await connection.getAddressLookupTable(
      new PublicKey(altAddress)
    )
    if (!lookupTableInfo.value) {
      console.log("❌ ALT não encontrada!")
      return null
    }

    const lookupTable = lookupTableInfo.value
    console.log(`✅ ALT encontrada: ${altAddress}`)
    console.log(
      `🔢 Total de endereços: ${lookupTable.state.addresses.length}`
    )

    console.log("\n📋 LISTA DE ENDEREÇOS NA ALT:")
    lookupTable.state.addresses.forEach((address, index) => {
      console.log(`  ${index}: ${address.toString()}`)
    })

    return lookupTable
  } catch (error) {
    console.error(`❌ Erro ao obter ALT: ${error}`)
    return null
  }
}

// Função adaptada para preparar uplines - SEM ATAs DE TOKENS
async function prepareUplinesForRecursion(
  connection,
  program,
  uplinePDAs
) {
  const remainingAccounts = []
  const triosInfo = []

  console.log(
    `\n🔄 PREPARANDO ${uplinePDAs.length} UPLINES (MAX 6) PARA RECURSIVIDADE`
  )

  // Coletar informações das uplines
  for (let i = 0; i < Math.min(uplinePDAs.length, 6); i++) {
    const uplinePDA = uplinePDAs[i]
    console.log(
      `  Analisando upline ${i + 1}: ${uplinePDA.toString()}`
    )

    try {
      const uplineInfo = await program.account.userAccount.fetch(
        uplinePDA
      )

      if (!uplineInfo.isRegistered) {
        console.log(`  ❌ Upline não está registrado! Ignorando.`)
        continue
      }

      // Determinar wallet do upline
      let uplineWallet

      // Usar o campo owner_wallet
      if (uplineInfo.ownerWallet) {
        uplineWallet = uplineInfo.ownerWallet
        console.log(`  ✅ Wallet: ${uplineWallet.toString()}`)
      } else {
        console.log(`  ⚠️ Campo owner_wallet não encontrado`)
        continue
      }

      // Armazenar informações
      triosInfo.push({
        pda: uplinePDA,
        wallet: uplineWallet,
        depth: parseInt(uplineInfo.upline.depth.toString()),
      })
    } catch (e) {
      console.log(`  ❌ Erro ao analisar upline: ${e.message}`)
    }
  }

  // Ordenar por profundidade DECRESCENTE
  triosInfo.sort((a, b) => b.depth - a.depth)

  console.log(
    `\n📊 ORDEM DE PROCESSAMENTO (Maior → Menor profundidade):`
  )
  for (let i = 0; i < triosInfo.length; i++) {
    console.log(
      `  ${i + 1}. PDA: ${triosInfo[i].pda.toString()} (Depth: ${
        triosInfo[i].depth
      })`
    )
    console.log(`    Wallet: ${triosInfo[i].wallet.toString()}`)
  }

  // Construir remainingAccounts - IMPORTANTE: O contrato espera trios mas o terceiro não é usado
  for (const trio of triosInfo) {
    // 1. PDA da conta
    remainingAccounts.push({
      pubkey: trio.pda,
      isWritable: true,
      isSigner: false,
    })

    // 2. Wallet
    remainingAccounts.push({
      pubkey: trio.wallet,
      isWritable: true,
      isSigner: false,
    })
  }

  console.log(
    `  ✅ Total de uplines: ${remainingAccounts.length / 3}`
  )
  console.log(`  ✅ Total de contas: ${remainingAccounts.length}`)

  return remainingAccounts
}

// Função para derivar ATA
function getAssociatedTokenAddress(mint, owner) {
  const [address] = PublicKey.findProgramAddressSync(
    [
      owner.toBuffer(),
      SPL_TOKEN_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )
  return address
}

// NEW: Function to prepare airdrop program accounts for matrix completion
async function prepareAirdropAccounts(connection, referrerWallet) {
  console.log(
    "\n🎯 PREPARING AIRDROP PROGRAM ACCOUNTS FOR MATRIX COMPLETION..."
  )

  try {
    // 1. Derive airdrop program state PDA
    const [airdropStatePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("program_state")],
      AIRDROP_PROGRAM_ID
    )
    console.log(
      `  📋 Airdrop State PDA: ${airdropStatePDA.toString()}`
    )

    // 2. Derive user account PDA in airdrop program
    const [airdropUserPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_account"), referrerWallet.toBuffer()],
      AIRDROP_PROGRAM_ID
    )
    console.log(`  👤 Airdrop User PDA: ${airdropUserPDA.toString()}`)

    // 3. Get current week from airdrop program state
    let currentWeek = 1 // Default to week 1
    try {
      const airdropStateInfo = await connection.getAccountInfo(
        airdropStatePDA
      )
      if (airdropStateInfo && airdropStateInfo.data.length > 0) {
        // Parse the current week from the state (offset after discriminator and other fields)
        // Based on AirdropProgramState structure: admin(32) + donut_token_mint(32) + current_week(1)
        const dataOffset = 8 + 32 + 32 // Skip discriminator + admin + donut_token_mint
        if (airdropStateInfo.data.length > dataOffset) {
          currentWeek = airdropStateInfo.data[dataOffset]
          console.log(`  📅 Current week from state: ${currentWeek}`)
        }
      }
    } catch (e) {
      console.log(
        `  ⚠️ Could not read current week, using default: ${currentWeek}`
      )
    }

    // 4. Derive current week data PDA
    const currentWeekBytes = Buffer.alloc(1)
    currentWeekBytes.writeUInt8(currentWeek, 0)
    const [currentWeekDataPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("weekly_data"), currentWeekBytes],
      AIRDROP_PROGRAM_ID
    )
    console.log(
      `  📊 Current Week Data PDA: ${currentWeekDataPDA.toString()}`
    )

    // 5. Derive next week data PDA
    const nextWeek = currentWeek + 1
    const nextWeekBytes = Buffer.alloc(1)
    nextWeekBytes.writeUInt8(nextWeek, 0)
    const [nextWeekDataPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("weekly_data"), nextWeekBytes],
      AIRDROP_PROGRAM_ID
    )
    console.log(
      `  📈 Next Week Data PDA: ${nextWeekDataPDA.toString()}`
    )

    // Return the accounts needed for CPI
    const airdropAccounts = [
      {
        pubkey: airdropStatePDA,
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: airdropUserPDA,
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: currentWeekDataPDA,
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: nextWeekDataPDA,
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: referrerWallet,
        isWritable: true,
        isSigner: true,
      },
    ]

    console.log(
      `  ✅ Prepared ${airdropAccounts.length} airdrop accounts`
    )
    return airdropAccounts
  } catch (error) {
    console.log(
      `  ❌ Error preparing airdrop accounts: ${error.message}`
    )
    // Return empty array if there's an error - the program will handle missing accounts
    return []
  }
}

// Função para criar instrução de criação de ATA
function createATAInstruction(payer, ataAddress, owner, mint) {
  return new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ataAddress, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      {
        pubkey: SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: SPL_TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: SYSVAR_RENT_PUBKEY,
        isSigner: false,
        isWritable: false,
      },
    ],
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    data: Buffer.from([]),
  })
}

async function main() {
  try {
    console.log(
      "🚀 REGISTRANDO USUÁRIO COM REFERENCIADOR - TRANSAÇÃO ÚNICA OTIMIZADA 🚀"
    )
    console.log(
      "====================================================================="
    )

    // Verificar argumentos
    if (!referrerAddressStr || !altAddress) {
      console.error("❌ ERRO: Argumentos obrigatórios faltando!")
      console.error(
        "Uso: node register-optimized-client.js <carteira> <config> <referenciador> <ALT>"
      )
      return
    }

    // Converter endereços
    const referrerAddress = new PublicKey(referrerAddressStr)

    // Carregar carteira
    console.log(`Carregando carteira de ${walletPath}...`)
    const walletKeypair = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf8")))
    )

    // Carregar IDL e config
    const idl = require("./target/idl/referral_system.json")
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"))

    // Conexão
    const connection = new Connection(
      "https://weathered-quiet-theorem.solana-devnet.quiknode.pro/198997b67cb51804baeb34ed2257274aa2b2d8c0",
      "confirmed"
    )
    console.log("Conectando à Devnet")

    // Configurar endereços
    const MATRIX_PROGRAM_ID = new PublicKey(config.programId)
    const STATE_ADDRESS = new PublicKey(config.stateAddress)

    // Provider e programa
    const anchorWallet = new Wallet(walletKeypair)
    const provider = new AnchorProvider(connection, anchorWallet, {
      commitment: "confirmed",
      skipPreflight: true,
    })
    const program = new Program(idl, MATRIX_PROGRAM_ID, provider)

    // Verificar saldo
    console.log("\n👤 USUÁRIO: " + walletKeypair.publicKey.toString())
    console.log("👥 REFERENCIADOR: " + referrerAddress.toString())
    const balance = await connection.getBalance(
      walletKeypair.publicKey
    )
    console.log("💰 SALDO: " + balance / 1e9 + " SOL")

    // Valor do depósito (0.1 SOL como no script base.js)
    const DEPOSIT_AMOUNT = 100_000_000 // 0.1 SOL

    if (balance < DEPOSIT_AMOUNT + 10_000_000) {
      console.error("❌ Saldo insuficiente!")
      return
    }

    // Verificar referenciador
    console.log("\n🔍 VERIFICANDO REFERENCIADOR...")
    const [referrerPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_account"), referrerAddress.toBuffer()],
      MATRIX_PROGRAM_ID
    )

    let referrerInfo
    try {
      referrerInfo = await program.account.userAccount.fetch(
        referrerPDA
      )
      if (!referrerInfo.isRegistered) {
        console.error("❌ Referenciador não está registrado!")
        return
      }

      console.log("✅ Referenciador verificado")
      console.log(
        "📊 Slots: " + referrerInfo.chain.filledSlots + "/3"
      )

      const slotIndex = referrerInfo.chain.filledSlots
      console.log("\n🎯 VOCÊ PREENCHERÁ O SLOT " + (slotIndex + 1))

      // Informar lógica do slot
      if (slotIndex === 0) {
        console.log(
          "💱 Slot 1: Swap SOL → DONUT e burn de 100% [OTIMIZADO: Transação única]"
        )
      } else if (slotIndex === 1) {
        console.log("💰 Slot 2: Reserva SOL para o referenciador")
      } else if (slotIndex === 2) {
        console.log(
          "🔄 Slot 3: Paga SOL reservado e processa recursão"
        )
      }
    } catch (e) {
      console.error("❌ Erro ao verificar referenciador:", e)
      return
    }

    // Verificar se usuário já está registrado
    const [userPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("user_account"),
        walletKeypair.publicKey.toBuffer(),
      ],
      MATRIX_PROGRAM_ID
    )

    try {
      const userInfo = await program.account.userAccount.fetch(
        userPDA
      )
      if (userInfo.isRegistered) {
        console.log("⚠️ Você já está registrado!")
        return
      }
    } catch {
      console.log("✅ Usuário não registrado, prosseguindo...")
    }

    // Derivar PDAs necessárias
    console.log("\n🔧 DERIVANDO PDAs...")

    const [programSolVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("program_sol_vault")],
      MATRIX_PROGRAM_ID
    )
    console.log("💰 Program SOL Vault: " + programSolVault.toString())

    // ATAs necessárias
    const userWsolAccount = getAssociatedTokenAddress(
      VERIFIED_ADDRESSES.WSOL_MINT,
      walletKeypair.publicKey
    )
    const userDonutAccount = getAssociatedTokenAddress(
      VERIFIED_ADDRESSES.TOKEN_MINT,
      walletKeypair.publicKey
    )

    console.log("💵 User WSOL ATA: " + userWsolAccount.toString())
    console.log("🍩 User DONUT ATA: " + userDonutAccount.toString())

    // Verificar existência de ATAs - agora apenas para informação
    console.log("\n🔧 VERIFICANDO ATAs...")

    const wsolInfo = await connection.getAccountInfo(userWsolAccount)
    console.log(
      wsolInfo
        ? "✅ WSOL ATA existe"
        : "⚠️ WSOL ATA não existe - será criada na transação principal"
    )

    const donutInfo = await connection.getAccountInfo(
      userDonutAccount
    )
    console.log(
      donutInfo
        ? "✅ DONUT ATA existe"
        : "⚠️ DONUT ATA não existe - será criada na transação principal"
    )

    // Preparar uplines se for slot 3
    let uplineAccounts = []
    const isSlot3 = referrerInfo.chain.filledSlots === 2

    if (isSlot3 && referrerInfo.upline?.upline?.length > 0) {
      console.log(
        "\n🔄 SLOT 3 DETECTADO - Preparando recursividade..."
      )

      const uplines = referrerInfo.upline.upline.map(
        (entry) => entry.pda
      )
      uplineAccounts = await prepareUplinesForRecursion(
        connection,
        program,
        uplines
      )
    }

    // NEW: Prepare airdrop program accounts for matrix completion
    const airdropAccounts = await prepareAirdropAccounts(
      connection,
      referrerAddress
    )

    // Carregar ALT
    console.log("\n🔍 CARREGANDO ALT...")
    const lookupTableAccount = await getAddressLookupTable(
      connection,
      altAddress
    )

    if (!lookupTableAccount) {
      console.error("❌ ALT não encontrada!")
      return
    }

    // Preparar transação - NOVA ABORDAGEM OTIMIZADA
    console.log("\n📤 PREPARANDO TRANSAÇÃO ÚNICA...")

    try {
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash()

      // Criar array de instruções
      const instructions = []

      // Instruções de compute budget - SEMPRE VÊM PRIMEIRO
      const modifyComputeUnits =
        ComputeBudgetProgram.setComputeUnitLimit({
          units: 1_400_000,
        })
      instructions.push(modifyComputeUnits)

      const setPriority = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 5000,
      })
      instructions.push(setPriority)

      // Adicionar instruções para criar ATAs, se necessário
      if (!wsolInfo) {
        console.log("  ➕ Adicionando instrução para criar WSOL ATA")
        const createWsolATA = createATAInstruction(
          walletKeypair.publicKey,
          userWsolAccount,
          walletKeypair.publicKey,
          VERIFIED_ADDRESSES.WSOL_MINT
        )
        instructions.push(createWsolATA)
      }

      if (!donutInfo) {
        console.log("  ➕ Adicionando instrução para criar DONUT ATA")
        const createDonutATA = createATAInstruction(
          walletKeypair.publicKey,
          userDonutAccount,
          walletKeypair.publicKey,
          VERIFIED_ADDRESSES.TOKEN_MINT
        )
        instructions.push(createDonutATA)
      }

      // Remaining accounts - UPDATED TO INCLUDE AIRDROP ACCOUNTS
      const vaultAAccounts = [
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
      ]

      const chainlinkAccounts = [
        {
          pubkey: VERIFIED_ADDRESSES.SOL_USD_FEED,
          isWritable: false,
          isSigner: false,
        },
        {
          pubkey: VERIFIED_ADDRESSES.CHAINLINK_PROGRAM,
          isWritable: false,
          isSigner: false,
        },
      ]

      // FIXED: Build remaining accounts in the correct order
      const allRemainingAccounts = [
        ...vaultAAccounts, // [0..3] - Vault A accounts
        ...chainlinkAccounts, // [4..5] - Chainlink accounts
        ...uplineAccounts, // [6..] - Uplines for slot 3 processing
        ...airdropAccounts, // [...] - Airdrop program accounts for matrix completion
      ]

      console.log(
        `📊 Remaining accounts: ${allRemainingAccounts.length}`
      )
      console.log(`  - Vault A: 4 contas`)
      console.log(`  - Chainlink: 2 contas`)
      console.log(
        `  - Uplines: ${uplineAccounts.length} contas (${
          uplineAccounts.length / 2
        } uplines)`
      )
      console.log(`  - Airdrop: ${airdropAccounts.length} contas`)

      // Gerar instrução principal
      const registerIx = await program.methods
        .registerWithSolDeposit(new BN(DEPOSIT_AMOUNT))
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
        .remainingAccounts(allRemainingAccounts)
        .instruction()

      // Adicionar instrução principal
      instructions.push(registerIx)

      console.log(`📦 Total de instruções: ${instructions.length}`)

      // Criar mensagem V0 com ALT
      const messageV0 = new TransactionMessage({
        payerKey: walletKeypair.publicKey,
        recentBlockhash: blockhash,
        instructions: instructions,
      }).compileToV0Message([lookupTableAccount])

      // Criar e assinar transação
      const transaction = new VersionedTransaction(messageV0)
      transaction.sign([walletKeypair])

      console.log("✅ Transação única preparada com ALT")

      // Enviar transação
      console.log("\n📤 ENVIANDO TRANSAÇÃO ÚNICA...")
      const txid = await connection.sendTransaction(transaction, {
        maxRetries: 5,
        skipPreflight: true,
      })

      console.log("✅ Transação enviada: " + txid)
      console.log(
        `🔍 Explorer: https://explorer.solana.com/tx/${txid}?cluster=devnet`
      )

      // Aguardar confirmação
      console.log("\n⏳ Aguardando confirmação...")
      await connection.confirmTransaction(
        {
          signature: txid,
          blockhash: blockhash,
          lastValidBlockHeight: lastValidBlockHeight,
        },
        "confirmed"
      )

      console.log("✅ Transação confirmada!")

      // Verificar resultados
      console.log("\n🔍 VERIFICANDO RESULTADOS...")

      const userInfo = await program.account.userAccount.fetch(
        userPDA
      )
      console.log("\n📋 REGISTRO CONFIRMADO:")
      console.log("✅ Registrado: " + userInfo.isRegistered)
      console.log("👥 Referenciador: " + userInfo.referrer.toString())
      console.log("🔢 Profundidade: " + userInfo.upline.depth)
      console.log(
        "👤 Owner Wallet: " + userInfo.ownerWallet.toString()
      )

      // Verificar referenciador após registro
      const newReferrerInfo = await program.account.userAccount.fetch(
        referrerPDA
      )
      console.log("\n📋 REFERENCIADOR APÓS REGISTRO:")
      console.log(
        "📊 Slots: " + newReferrerInfo.chain.filledSlots + "/3"
      )

      if (newReferrerInfo.reservedSol > 0) {
        console.log(
          "💰 SOL Reservado: " +
            newReferrerInfo.reservedSol / 1e9 +
            " SOL"
        )
      }

      // Se foi slot 3, verificar recursão
      if (isSlot3) {
        console.log("\n🔄 VERIFICANDO RECURSÃO:")
        let processedCount = 0

        for (let i = 0; i < uplineAccounts.length; i += 3) {
          try {
            const uplinePDA = uplineAccounts[i].pubkey
            const uplineInfo =
              await program.account.userAccount.fetch(uplinePDA)

            // Verificar se referenciador foi adicionado
            for (let j = 0; j < uplineInfo.chain.filledSlots; j++) {
              if (uplineInfo.chain.slots[j]?.equals(referrerPDA)) {
                console.log(
                  `  ✅ Referenciador adicionado ao slot ${
                    j + 1
                  } de ${uplinePDA.toString()}`
                )
                processedCount++
                break
              }
            }
          } catch (e) {
            console.log(`  ❌ Erro ao verificar upline: ${e.message}`)
          }
        }

        console.log(
          `  📊 Recursão processou ${processedCount} uplines`
        )
      }

      // Verificar DONUT ATA depois da transação
      const finalDonutInfo = await connection.getAccountInfo(
        userDonutAccount
      )
      if (finalDonutInfo) {
        console.log("\n🍩 ATA DONUT após transação: ✅ Existe")
      } else {
        console.log("\n🍩 ATA DONUT após transação: ❌ Não existe")
      }

      // Novo saldo
      const newBalance = await connection.getBalance(
        walletKeypair.publicKey
      )
      console.log("\n💼 Novo saldo: " + newBalance / 1e9 + " SOL")
      console.log(
        "💸 Gasto total: " + (balance - newBalance) / 1e9 + " SOL"
      )

      console.log(
        "\n🎉 REGISTRO COM TRANSAÇÃO ÚNICA CONCLUÍDO COM SUCESSO! 🎉"
      )
      console.log(
        "====================================================="
      )
    } catch (error) {
      console.error("❌ ERRO AO REGISTRAR:", error)

      if (error.logs) {
        console.log("\n📋 LOGS DE ERRO:")
        error.logs.forEach((log, i) => console.log(`${i}: ${log}`))
      }
    }
  } catch (error) {
    console.error("❌ ERRO GERAL:", error)
  }
}

main()
