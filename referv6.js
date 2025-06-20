// Script com transações separadas para registro e airdrop - SOLUÇÃO FINAL PARA SLOT 3
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
  SYSVAR_RENT_PUBKEY
} = require('@solana/web3.js');
const { AnchorProvider, Program, BN, Wallet, utils } = require('@coral-xyz/anchor');
const fs = require('fs');
const path = require('path');

// Receber parâmetros da linha de comando
const args = process.argv.slice(2);
const walletPath = args[0] || './carteiras/carteira1.json';
const configPath = args[1] || './matriz-config.json';
const referrerAddressStr = args[2]; // Obrigatório
const altAddress = args[3]; // Obrigatório

// Endereços verificados (igual ao contrato)
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
  
  // Chainlink (Devnet)
  CHAINLINK_PROGRAM: new PublicKey("HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny"),
  SOL_USD_FEED: new PublicKey("99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR"),
  
  // Programa de Airdrop
  AIRDROP_PROGRAM_ID: new PublicKey("J1Ad1njQ5snM2nADWr47pDxPJaicprCrwpqfzWmPv7DX"),
};

// Programas do sistema
const SPL_TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

// Discriminadores para instruções do programa de airdrop
const REGISTER_MATRIX_WITH_CREATE_DISCRIMINATOR = Buffer.from([68, 201, 129, 230, 125, 165, 234, 125]);
const REGISTER_MATRIX_EXISTING_DISCRIMINATOR = Buffer.from([250, 108, 76, 22, 238, 239, 87, 21]);

// Função para dormir
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Função para mostrar detalhes da ALT
async function getAddressLookupTable(connection, altAddress) {
  console.log("\n📋 OBTENDO ADDRESS LOOKUP TABLE:");
  
  try {
    const lookupTableInfo = await connection.getAddressLookupTable(new PublicKey(altAddress));
    if (!lookupTableInfo.value) {
      console.log("❌ ALT não encontrada!");
      return null;
    }
    
    const lookupTable = lookupTableInfo.value;
    console.log(`✅ ALT encontrada: ${altAddress}`);
    console.log(`🔢 Total de endereços: ${lookupTable.state.addresses.length}`);
    
    console.log("\n📋 LISTA DE ENDEREÇOS NA ALT:");
    lookupTable.state.addresses.forEach((address, index) => {
      console.log(`  ${index}: ${address.toString()}`);
    });
    
    return lookupTable;
  } catch (error) {
    console.error(`❌ Erro ao obter ALT: ${error}`);
    return null;
  }
}

// Função para preparar as contas do programa de airdrop para o slot 3
async function prepareAirdropAccounts(connection, referrerAddress) {
  console.log("\n🪂 PREPARANDO CONTAS DO PROGRAMA DE AIRDROP...");
  
  // Derivar a PDA do estado do programa
  const [programStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("program_state", "utf8")],
    VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
  );
  console.log(`  📝 Program State PDA: ${programStatePda.toString()}`);
  
  // Verificar se a conta de estado existe
  const stateAccountInfo = await connection.getAccountInfo(programStatePda);
  if (!stateAccountInfo) {
    console.log(`  ❌ Estado do programa não encontrado! Isso é crítico.`);
    throw new Error("Estado do programa de airdrop não encontrado");
  }
  
  // Derivar a PDA da conta do usuário
  const [userAccountPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_account", "utf8"), referrerAddress.toBuffer()],
    VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
  );
  console.log(`  👤 User Account PDA: ${userAccountPda.toString()}`);
  
  // Verificar se o usuário já existe no programa de airdrop
  let userExists = false;
  try {
    const userAccountInfo = await connection.getAccountInfo(userAccountPda);
    if (userAccountInfo && userAccountInfo.owner.equals(VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID)) {
      userExists = true;
      console.log(`  ✅ Usuário já existe no programa de airdrop`);
    } else {
      console.log(`  ℹ️ Usuário não existe no programa de airdrop, será criado`);
    }
  } catch (error) {
    console.log(`  ⚠️ Erro ao verificar conta de usuário: ${error.message}`);
  }
  
  // Obter a semana atual com segurança
  let currentWeek = 1; // Valor padrão
  if (stateAccountInfo && stateAccountInfo.data.length >= 73) {
    currentWeek = stateAccountInfo.data[72]; // O byte da current_week está na posição 72
    console.log(`  📅 Semana atual: ${currentWeek}`);
  } else {
    console.log(`  ⚠️ Formato inesperado da conta de estado, usando semana padrão 1`);
  }
  
  // Derivar as PDAs dos dados das semanas
  const [currentWeekDataPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("weekly_data", "utf8"), Buffer.from([currentWeek])],
    VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
  );
  console.log(`  📊 Current Week Data PDA: ${currentWeekDataPda.toString()}`);
  
  // Verificar se a conta da semana atual existe
  const weekDataInfo = await connection.getAccountInfo(currentWeekDataPda);
  if (!weekDataInfo) {
    console.log(`  ⚠️ Dados da semana atual não encontrados. Criando na transação.`);
  } else {
    console.log(`  ✅ Dados da semana atual encontrados`);
  }
  
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
    userExists,
    currentWeek
  };
}

// Função adaptada para preparar uplines - SEM ATAs DE TOKENS
async function prepareUplinesForRecursion(connection, program, uplinePDAs) {
  const remainingAccounts = [];
  const triosInfo = [];

  console.log(`\n🔄 PREPARANDO ${uplinePDAs.length} UPLINES (MAX 6) PARA RECURSIVIDADE`);

  // Coletar informações das uplines
  for (let i = 0; i < Math.min(uplinePDAs.length, 6); i++) {
    const uplinePDA = uplinePDAs[i];
    console.log(`  Analisando upline ${i + 1}: ${uplinePDA.toString()}`);

    try {
      const uplineInfo = await program.account.userAccount.fetch(uplinePDA);

      if (!uplineInfo.isRegistered) {
        console.log(`  ❌ Upline não está registrado! Ignorando.`);
        continue;
      }

      // Determinar wallet do upline
      let uplineWallet;

      // Usar o campo owner_wallet
      if (uplineInfo.ownerWallet) {
        uplineWallet = uplineInfo.ownerWallet;
        console.log(`  ✅ Wallet: ${uplineWallet.toString()}`);
      } else {
        console.log(`  ⚠️ Campo owner_wallet não encontrado`);
        continue;
      }

      // Armazenar informações
      triosInfo.push({
        pda: uplinePDA,
        wallet: uplineWallet,
        depth: parseInt(uplineInfo.upline.depth.toString()),
      });
    } catch (e) {
      console.log(`  ❌ Erro ao analisar upline: ${e.message}`);
    }
  }

  // Ordenar por profundidade DECRESCENTE
  triosInfo.sort((a, b) => b.depth - a.depth);
  
  console.log(`\n📊 ORDEM DE PROCESSAMENTO (Maior → Menor profundidade):`);
  for (let i = 0; i < triosInfo.length; i++) {
    console.log(`  ${i + 1}. PDA: ${triosInfo[i].pda.toString()} (Depth: ${triosInfo[i].depth})`);
    console.log(`    Wallet: ${triosInfo[i].wallet.toString()}`);
  }

  // Construir remainingAccounts - IMPORTANTE: Precisamos apenas da PDA e da wallet
  for (const trio of triosInfo) {
    // 1. PDA da conta
    remainingAccounts.push({
      pubkey: trio.pda,
      isWritable: true,
      isSigner: false,
    });

    // 2. Wallet
    remainingAccounts.push({
      pubkey: trio.wallet,
      isWritable: true,
      isSigner: false,
    });
  }

  console.log(`  ✅ Total de uplines: ${remainingAccounts.length / 2}`);
  console.log(`  ✅ Total de contas: ${remainingAccounts.length}`);

  return remainingAccounts;
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
  );
  return address;
}

// Função para criar instrução de criação de ATA
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

// Função para verificar se a transação foi confirmada
async function checkSignatureStatus(connection, signature, timeout = 60000) {
  const startTime = Date.now();
  let status = null;
  
  // Loop até obter status ou timeout
  while (Date.now() - startTime < timeout) {
    try {
      status = await connection.getSignatureStatus(signature, {
        searchTransactionHistory: true,
      });
      
      if (status && status.value) {
        if (status.value.err) {
          // Transação falhou
          return { confirmed: false, error: status.value.err };
        } else if (status.value.confirmationStatus === 'confirmed' || 
                  status.value.confirmationStatus === 'finalized') {
          // Transação confirmada
          return { confirmed: true, status: status.value.confirmationStatus };
        }
      }
      
      // Esperar antes de verificar novamente
      console.log(`  🔍 Verificando status (${Math.round((Date.now() - startTime)/1000)}s/${Math.round(timeout/1000)}s)...`);
      await sleep(2000);
    } catch (e) {
      console.log(`  ⚠️ Erro ao verificar status: ${e.message}, tentando novamente...`);
      await sleep(2000);
    }
  }
  
  // Timeout
  return { confirmed: false, error: 'timeout' };
}

// Função para criar instrução de registro manual no airdrop (CPI manual)
function createAirdropRegistrationInstruction(
  referrerWallet,
  programStatePda, 
  userAccountPda, 
  currentWeekDataPda, 
  nextWeekDataPda,
  userExists,
  matrixProgramId
) {
  // Escolher o discriminador correto com base na existência da conta do usuário
  const discriminator = userExists ? 
    REGISTER_MATRIX_EXISTING_DISCRIMINATOR : 
    REGISTER_MATRIX_WITH_CREATE_DISCRIMINATOR;
  
  // Criar a lista de contas
  const accounts = [
    { pubkey: programStatePda, isSigner: false, isWritable: true },
    { pubkey: referrerWallet, isSigner: true, isWritable: true },
    { pubkey: userAccountPda, isSigner: false, isWritable: true },
    { pubkey: currentWeekDataPda, isSigner: false, isWritable: true },
    { pubkey: nextWeekDataPda, isSigner: false, isWritable: true },
    { pubkey: matrixProgramId, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  
  // Criar a instrução
  return new TransactionInstruction({
    programId: VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID,
    keys: accounts,
    data: discriminator
  });
}

async function main() {
  try {
    console.log("🚀 REGISTRANDO USUÁRIO COM REFERENCIADOR - SOLUÇÃO FINAL PARA SLOT 3 🚀");
    console.log("=====================================================================");

    // Verificar argumentos
    if (!referrerAddressStr || !altAddress) {
      console.error("❌ ERRO: Argumentos obrigatórios faltando!");
      console.error("Uso: node register-slot3-solution.js <carteira> <config> <referenciador> <ALT>");
      return;
    }
    
    // Converter endereços
    const referrerAddress = new PublicKey(referrerAddressStr);
    
    // Carregar carteira
    console.log(`Carregando carteira de ${walletPath}...`);
    const walletKeypair = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, 'utf8')))
    );
    
    // Carregar IDL e config
    const idl = require('./target/idl/referral_system.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // Conexão com parâmetros de timeout ampliados
    const connection = new Connection('https://api.devnet.solana.com', {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000, // 60 segundos
      disableRetryOnRateLimit: false,
    });
    console.log('Conectando à Devnet com timeout estendido (60s)');
    
    // Configurar endereços
    const MATRIX_PROGRAM_ID = new PublicKey(config.programId);
    const STATE_ADDRESS = new PublicKey(config.stateAddress);
    
    // Provider e programa
    const anchorWallet = new Wallet(walletKeypair);
    const provider = new AnchorProvider(connection, anchorWallet, { 
      commitment: 'confirmed',
      skipPreflight: true,
    });
    const program = new Program(idl, MATRIX_PROGRAM_ID, provider);
    
    // Verificar saldo
    console.log("\n👤 USUÁRIO: " + walletKeypair.publicKey.toString());
    console.log("👥 REFERENCIADOR: " + referrerAddress.toString());
    const balance = await connection.getBalance(walletKeypair.publicKey);
    console.log("💰 SALDO: " + balance / 1e9 + " SOL");
    
    // Valor do depósito (0.1 SOL como no script base.js)
    const DEPOSIT_AMOUNT = 100_000_000; // 0.1 SOL
    
    if (balance < DEPOSIT_AMOUNT + 10_000_000) {
      console.error("❌ Saldo insuficiente!");
      return;
    }
    
    // Verificar referenciador
    console.log("\n🔍 VERIFICANDO REFERENCIADOR...");
    const [referrerPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_account"), referrerAddress.toBuffer()],
      MATRIX_PROGRAM_ID
    );
    
    let referrerInfo;
    try {
      referrerInfo = await program.account.userAccount.fetch(referrerPDA);
      if (!referrerInfo.isRegistered) {
        console.error("❌ Referenciador não está registrado!");
        return;
      }
      
      console.log("✅ Referenciador verificado");
      console.log("📊 Slots: " + referrerInfo.chain.filledSlots + "/3");
      
      const slotIndex = referrerInfo.chain.filledSlots;
      console.log("\n🎯 VOCÊ PREENCHERÁ O SLOT " + (slotIndex + 1));
      
      // Informar lógica do slot
      if (slotIndex === 0) {
        console.log("💱 Slot 1: Swap SOL → DONUT e burn de 100% [SPLIT: Transação única]");
      } else if (slotIndex === 1) {
        console.log("💰 Slot 2: Reserva SOL para o referenciador [SPLIT: Transação única]");
      } else if (slotIndex === 2) {
        console.log("🔄 Slot 3: Paga SOL reservado e processa recursão [SPLIT: Duas transações]");
      }
    } catch (e) {
      console.error("❌ Erro ao verificar referenciador:", e);
      return;
    }
    
    // Verificar se usuário já está registrado
    const [userPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_account"), walletKeypair.publicKey.toBuffer()],
      MATRIX_PROGRAM_ID
    );
    
    try {
      const userInfo = await program.account.userAccount.fetch(userPDA);
      if (userInfo.isRegistered) {
        console.log("⚠️ Você já está registrado!");
        return;
      }
    } catch {
      console.log("✅ Usuário não registrado, prosseguindo...");
    }
    
    // Derivar PDAs necessárias
    console.log("\n🔧 DERIVANDO PDAs...");
    
    const [programSolVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("program_sol_vault")],
      MATRIX_PROGRAM_ID
    );
    console.log("💰 Program SOL Vault: " + programSolVault.toString());
    
    // ATAs necessárias
    const userWsolAccount = getAssociatedTokenAddress(
      VERIFIED_ADDRESSES.WSOL_MINT, 
      walletKeypair.publicKey
    );
    const userDonutAccount = getAssociatedTokenAddress(
      VERIFIED_ADDRESSES.TOKEN_MINT, 
      walletKeypair.publicKey
    );
    
    console.log("💵 User WSOL ATA: " + userWsolAccount.toString());
    console.log("🍩 User DONUT ATA: " + userDonutAccount.toString());
    
    // Verificar existência de ATAs - agora apenas para informação
    console.log("\n🔧 VERIFICANDO ATAs...");
    
    const wsolInfo = await connection.getAccountInfo(userWsolAccount);
    console.log(wsolInfo ? "✅ WSOL ATA existe" : "⚠️ WSOL ATA não existe - será criada na transação principal");
    
    const donutInfo = await connection.getAccountInfo(userDonutAccount);
    console.log(donutInfo ? "✅ DONUT ATA existe" : "⚠️ DONUT ATA não existe - será criada na transação principal");
    
    // Preparar uplines se for slot 3
    let uplineAccounts = [];
    let airdropInfo = null;
    const isSlot3 = referrerInfo.chain.filledSlots === 2;
    
    if (isSlot3) {
      console.log("\n🔄 SLOT 3 DETECTADO - Preparando recursividade...");
      
      if (referrerInfo.upline?.upline?.length > 0) {
        const uplines = referrerInfo.upline.upline.map(entry => entry.pda);
        uplineAccounts = await prepareUplinesForRecursion(connection, program, uplines);
      } else {
        console.log("ℹ️ Não há uplines para processar (usuário base)");
      }
      
      // NOVO: Preparar contas do programa de airdrop para o slot 3
      airdropInfo = await prepareAirdropAccounts(connection, referrerAddress);
    }
    
    // Carregar ALT
    console.log("\n🔍 CARREGANDO ALT...");
    const lookupTableAccount = await getAddressLookupTable(connection, altAddress);
    
    if (!lookupTableAccount) {
      console.error("❌ ALT não encontrada!");
      return;
    }
    
    // Preparar transação - NOVA ABORDAGEM COM DIVISÃO
    console.log("\n📤 PREPARANDO TRANSAÇÕES...");
    
    try {
      // ===== PARTE 1: REGISTRO PRINCIPAL =====
      
      // Obter blockhash recente para a primeira transação
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      
      // Criar array de instruções para a transação principal
      const mainInstructions = [];
      
      // Instruções de compute budget - SEMPRE VÊM PRIMEIRO
      // Usar valores altos para garantir que a transação seja processada rapidamente
      const computeUnits = isSlot3 ? 1_000_000 : 1_400_000; // Reduzido para slot 3 pois dividimos a lógica
      const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
        units: computeUnits
      });
      mainInstructions.push(modifyComputeUnits);
      
      // Prioridade alta para todas as transações
      const setPriority = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 250000 // Aumentado significativamente
      });
      mainInstructions.push(setPriority);
      
      // Adicionar instruções para criar ATAs, se necessário
      if (!wsolInfo) {
        console.log("  ➕ Adicionando instrução para criar WSOL ATA");
        const createWsolATA = createATAInstruction(
          walletKeypair.publicKey,
          userWsolAccount,
          walletKeypair.publicKey,
          VERIFIED_ADDRESSES.WSOL_MINT
        );
        mainInstructions.push(createWsolATA);
      }
      
      if (!donutInfo) {
        console.log("  ➕ Adicionando instrução para criar DONUT ATA");
        const createDonutATA = createATAInstruction(
          walletKeypair.publicKey,
          userDonutAccount,
          walletKeypair.publicKey,
          VERIFIED_ADDRESSES.TOKEN_MINT
        );
        mainInstructions.push(createDonutATA);
      }
      
      // Remaining accounts para a transação principal
      const vaultAAccounts = [
        { pubkey: VERIFIED_ADDRESSES.A_VAULT, isWritable: true, isSigner: false },
        { pubkey: VERIFIED_ADDRESSES.A_VAULT_LP, isWritable: true, isSigner: false },
        { pubkey: VERIFIED_ADDRESSES.A_VAULT_LP_MINT, isWritable: true, isSigner: false },
        { pubkey: VERIFIED_ADDRESSES.A_TOKEN_VAULT, isWritable: true, isSigner: false },
      ];
      
      const chainlinkAccounts = [
        { pubkey: VERIFIED_ADDRESSES.SOL_USD_FEED, isWritable: false, isSigner: false },
        { pubkey: VERIFIED_ADDRESSES.CHAINLINK_PROGRAM, isWritable: false, isSigner: false },
      ];
      
      // Para slot 3, não incluir contas do airdrop na transação principal
      const mainRemainingAccounts = [...vaultAAccounts, ...chainlinkAccounts, ...(isSlot3 ? uplineAccounts : [])];
      
      console.log(`📊 Contas da transação principal: ${mainRemainingAccounts.length + 4}`); // +4 para os fixed accounts
      console.log(`  - Vault A: 4 contas`);
      console.log(`  - Chainlink: 2 contas`);
      
      if (isSlot3) {
        const uplineCount = referrerInfo.upline?.upline?.length || 0;
        console.log(`  - Uplines: ${uplineCount * 2} contas (${uplineCount} uplines)`);
        console.log(`  - Contas de airdrop serão processadas em transação separada`);
      } else {
        console.log(`  - Uplines: 0 contas (não é slot 3)`);
      }
      
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
        .remainingAccounts(mainRemainingAccounts)
        .instruction();
      
      // Adicionar instrução principal
      mainInstructions.push(registerIx);
      
      console.log(`📦 Total de instruções na transação principal: ${mainInstructions.length}`);
      
      // Criar mensagem V0 com ALT
      const messageV0 = new TransactionMessage({
        payerKey: walletKeypair.publicKey,
        recentBlockhash: blockhash,
        instructions: mainInstructions
      }).compileToV0Message([lookupTableAccount]);
      
      // Criar e assinar transação
      const mainTransaction = new VersionedTransaction(messageV0);
      mainTransaction.sign([walletKeypair]);
      
      console.log("✅ Transação principal preparada com ALT");
      
      // Enviar a transação principal
      console.log("\n📤 ENVIANDO TRANSAÇÃO PRINCIPAL...");
      
      try {
        // Enviar transação
        const txid = await connection.sendTransaction(mainTransaction, {
          skipPreflight: true,
          maxRetries: 3
        });
        
        console.log(`✅ Transação principal enviada: ${txid}`);
        console.log(`🔍 Explorer: https://explorer.solana.com/tx/${txid}?cluster=devnet`);
        
        // Verificar confirmação
        console.log(`\n⏳ Aguardando confirmação da transação principal (timeout: 60s)...`);
        const result = await checkSignatureStatus(connection, txid, 60000);
        
        if (result.confirmed) {
          console.log(`✅ Transação principal confirmada com status: ${result.status}!`);
          
          // Aguardar um pouco para garantir que o estado da rede esteja atualizado
          console.log("\n⏳ Aguardando 5 segundos para o estado da rede atualizar...");
          await sleep(5000);
          
          // Se for slot 3, executar a transação de registro no airdrop separadamente
          if (isSlot3 && airdropInfo) {
            console.log("\n🪂 PREPARANDO TRANSAÇÃO DE AIRDROP SEPARADA...");
            
            // Obter novo blockhash para a segunda transação
            const airdropRecentBlockhash = await connection.getLatestBlockhash('confirmed');
            
            // Criar instruções para a transação de airdrop
            const airdropInstructions = [];
            
            // Adicionar instruções de compute budget
            const airdropComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
              units: 200_000 // Valor mais baixo é suficiente para esta transação simples
            });
            airdropInstructions.push(airdropComputeUnits);
            
            // Prioridade alta para garantir confirmação rápida
            const airdropPriority = ComputeBudgetProgram.setComputeUnitPrice({
              microLamports: 250000
            });
            airdropInstructions.push(airdropPriority);
            
            // Criar instrução para o registro no airdrop
            const airdropIx = createAirdropRegistrationInstruction(
              referrerAddress,
              airdropInfo.programStatePda,
              airdropInfo.userAccountPda,
              airdropInfo.currentWeekDataPda,
              airdropInfo.nextWeekDataPda,
              airdropInfo.userExists,
              MATRIX_PROGRAM_ID
            );
            
            airdropInstructions.push(airdropIx);
            
            console.log(`📦 Total de instruções na transação de airdrop: ${airdropInstructions.length}`);
            
            // Criar mensagem para transação de airdrop
            const airdropMessage = new TransactionMessage({
              payerKey: walletKeypair.publicKey,
              recentBlockhash: airdropRecentBlockhash.blockhash,
              instructions: airdropInstructions
            }).compileToV0Message();
            
            // Criar e assinar transação de airdrop
            const airdropTransaction = new VersionedTransaction(airdropMessage);
            airdropTransaction.sign([walletKeypair]);
            
            console.log("✅ Transação de airdrop preparada");
            
            // Enviar transação de airdrop
            try {
              console.log("\n📤 ENVIANDO TRANSAÇÃO DE AIRDROP...");
              
              const airdropTxId = await connection.sendTransaction(airdropTransaction, {
                skipPreflight: true,
                maxRetries: 3
              });
              
              console.log(`✅ Transação de airdrop enviada: ${airdropTxId}`);
              console.log(`🔍 Explorer: https://explorer.solana.com/tx/${airdropTxId}?cluster=devnet`);
              
              // Verificar confirmação da transação de airdrop
              console.log(`\n⏳ Aguardando confirmação da transação de airdrop (timeout: 60s)...`);
              const airdropResult = await checkSignatureStatus(connection, airdropTxId, 60000);
              
              if (airdropResult.confirmed) {
                console.log(`✅ Transação de airdrop confirmada com status: ${airdropResult.status}!`);
              } else {
                console.log(`⚠️ Transação de airdrop não confirmada: ${airdropResult.error}`);
                console.log(`⚠️ O registro principal foi concluído, mas o airdrop pode não ter sido processado.`);
              }
            } catch (airdropError) {
              console.log("⚠️ Erro na transação de airdrop, mas o registro principal foi concluído");
              console.error(airdropError);
            }
          }
          
          // Verificar resultados
          console.log("\n🔍 VERIFICANDO RESULTADOS...");
          
          const userInfo = await program.account.userAccount.fetch(userPDA);
          console.log("\n📋 REGISTRO CONFIRMADO:");
          console.log("✅ Registrado: " + userInfo.isRegistered);
          console.log("👥 Referenciador: " + userInfo.referrer.toString());
          console.log("🔢 Profundidade: " + userInfo.upline.depth);
          console.log("👤 Owner Wallet: " + userInfo.ownerWallet.toString());
          
          // Verificar referenciador após registro
          const newReferrerInfo = await program.account.userAccount.fetch(referrerPDA);
          console.log("\n📋 REFERENCIADOR APÓS REGISTRO:");
          console.log("📊 Slots: " + newReferrerInfo.chain.filledSlots + "/3");
          
          if (newReferrerInfo.reservedSol > 0) {
            console.log("💰 SOL Reservado: " + newReferrerInfo.reservedSol / 1e9 + " SOL");
          }
          
          // Se foi slot 3, verificar recursão
          if (isSlot3) {
            console.log("\n🔄 VERIFICANDO RECURSÃO:");
            let processedCount = 0;
            
            // Verificar uplines processados
            for (let i = 0; i < uplineAccounts.length; i += 2) {
              try {
                const uplinePDA = uplineAccounts[i].pubkey;
                const uplineInfo = await program.account.userAccount.fetch(uplinePDA);
                
                // Verificar se referenciador foi adicionado
                for (let j = 0; j < uplineInfo.chain.filledSlots; j++) {
                  if (uplineInfo.chain.slots[j]?.equals(referrerPDA)) {
                    console.log(`  ✅ Referenciador adicionado ao slot ${j + 1} de ${uplinePDA.toString()}`);
                    processedCount++;
                    break;
                  }
                }
              } catch (e) {
                console.log(`  ❌ Erro ao verificar upline: ${e.message}`);
              }
            }
            
            console.log(`  📊 Recursão processou ${processedCount} uplines`);
            
            // Verificar se o usuário foi registrado no programa de airdrop
            try {
              const [userAccountPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("user_account", "utf8"), referrerAddress.toBuffer()],
                VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
              );
              
              const airdropUserAccountInfo = await connection.getAccountInfo(userAccountPda);
              if (airdropUserAccountInfo && airdropUserAccountInfo.owner.equals(VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID)) {
                console.log(`  ✅ Usuário registrado com sucesso no programa de airdrop`);
              } else {
                console.log(`  ❌ Usuário NÃO foi registrado no programa de airdrop`);
              }
            } catch (error) {
              console.log(`  ❌ Erro ao verificar registro no airdrop: ${error.message}`);
            }
          }
          
          // Verificar DONUT ATA depois da transação
          const finalDonutInfo = await connection.getAccountInfo(userDonutAccount);
          if (finalDonutInfo) {
            console.log("\n🍩 ATA DONUT após transação: ✅ Existe");
          } else {
            console.log("\n🍩 ATA DONUT após transação: ❌ Não existe");
          }
          
          // Novo saldo
          const newBalance = await connection.getBalance(walletKeypair.publicKey);
          console.log("\n💼 Novo saldo: " + newBalance / 1e9 + " SOL");
          console.log("💸 Gasto total: " + (balance - newBalance) / 1e9 + " SOL");
          
          console.log("\n🎉 REGISTRO CONCLUÍDO COM SUCESSO! 🎉");
          console.log("=====================================================");
        } else {
          console.log(`❌ Transação principal não confirmada: ${result.error}`);
          throw new Error(`Transação principal não confirmada: ${result.error}`);
        }
      } catch (error) {
        console.error(`❌ ERRO NA TRANSAÇÃO PRINCIPAL: ${error.message}`);
        
        if (error.logs) {
          console.log(`\n📋 LOGS DE ERRO:`);
          error.logs.forEach((log, i) => console.log(`${i}: ${log}`));
        }
        
        throw error;
      }
    } catch (error) {
      console.error("❌ ERRO AO REGISTRAR:", error.message);
      
      if (error.logs) {
        console.log("\n📋 LOGS DE ERRO DETALHADOS:");
        error.logs.forEach((log, i) => {
          console.log(`${i}: ${log}`);
          
          // Detectar erros específicos
          if (log.includes("airdrop") || log.includes("ProgramError")) {
            console.log(`  ⚠️ LOG CRÍTICO: ${log}`);
          }
        });
      }
    }
    
  } catch (error) {
    console.error("❌ ERRO GERAL:", error.message);
  }
}

main();