// register-v6.js - Versão Final Corrigida
const { 
  Connection, 
  Keypair, 
  PublicKey, 
  TransactionMessage, 
  VersionedTransaction,
  ComputeBudgetProgram,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY
} = require('@solana/web3.js');
const { AnchorProvider, Program, BN, Wallet, utils } = require('@coral-xyz/anchor');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Definir SYSVAR_INSTRUCTIONS_PUBKEY fora do objeto
const SYSVAR_INSTRUCTIONS_PUBKEY = new PublicKey('Sysvar1nstructions1111111111111111111111111');

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
  
  // Programa de Airdrop - CORRIGIDO
  AIRDROP_PROGRAM_ID: new PublicKey("EmojnbbXnGLsCuQfsUx1MhGQ67r8nobCvNqdDgHKjHc2"),
};

// Programas do sistema
const SPL_TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

// Discriminador correto para a nova instrução notify_matrix_completion
const NOTIFY_MATRIX_COMPLETION_DISCRIMINATOR = Buffer.from([88, 30, 2, 65, 55, 218, 137, 194]);

// Função para dormir
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
    
    return lookupTable;
  } catch (error) {
    console.error(`❌ Erro ao obter ALT: ${error}`);
    return null;
  }
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

// Função para verificar se o usuário está registrado no airdrop
async function isUserRegisteredInAirdrop(connection, userWallet) {
  const [userAccountPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_account", "utf8"), userWallet.toBuffer()],
    VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
  );
  
  try {
    const userAccountInfo = await connection.getAccountInfo(userAccountPda);
    return userAccountInfo !== null && userAccountInfo.owner.equals(VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID);
  } catch (error) {
    console.log(`⚠️ Erro ao verificar registro no airdrop: ${error.message}`);
    return false;
  }
}

// Função para registrar o usuário no airdrop
async function registerUserInAirdrop(connection, walletKeypair) {
  console.log("\n🪂 REGISTRANDO USUÁRIO NO PROGRAMA DE AIRDROP...");
  
  // Verificar se o usuário já está registrado
  if (await isUserRegisteredInAirdrop(connection, walletKeypair.publicKey)) {
    console.log("✅ Usuário já registrado no programa de airdrop");
    return true;
  }
  
  // Derivar PDA do estado do programa
  const [programStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("program_state", "utf8")],
    VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
  );
  
  // Derivar PDA da conta do usuário
  const [userAccountPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_account", "utf8"), walletKeypair.publicKey.toBuffer()],
    VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
  );
  
  // Obter blockhash recente
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  
  // Criar instruções
  const instructions = [];
  
  // Instrução de compute budget
  const computeUnits = 200_000; // 200k unidades é suficiente
  const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
    units: computeUnits
  });
  instructions.push(modifyComputeUnits);
  
  // Prioridade média para a transação
  const setPriority = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: 50000
  });
  instructions.push(setPriority);
  
  // Criar dados da instrução (discriminador CORRIGIDO para register_user)
  const registerUserDiscriminator = Buffer.from([2, 241, 150, 223, 99, 214, 116, 97]);
  
  // Criar a instrução de registro
  const registerInstruction = new TransactionInstruction({
    programId: VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID,
    keys: [
      { pubkey: programStatePda, isSigner: false, isWritable: true },
      { pubkey: walletKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: userAccountPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: registerUserDiscriminator
  });
  
  instructions.push(registerInstruction);
  
  // Criar mensagem de transação
  const messageV0 = new TransactionMessage({
    payerKey: walletKeypair.publicKey,
    recentBlockhash: blockhash,
    instructions
  }).compileToV0Message();
  
  // Criar e assinar transação
  const transaction = new VersionedTransaction(messageV0);
  transaction.sign([walletKeypair]);
  
  // Enviar transação
  try {
    console.log("📤 Enviando transação de registro no airdrop...");
    const txid = await connection.sendTransaction(transaction, {
      skipPreflight: true,
      maxRetries: 3
    });
    
    console.log(`✅ Transação enviada: ${txid}`);
    console.log(`🔍 Explorer: https://explorer.solana.com/tx/${txid}?cluster=devnet`);
    
    // Verificar confirmação
    console.log(`\n⏳ Aguardando confirmação (timeout: 60s)...`);
    const result = await checkSignatureStatus(connection, txid, 60000);
    
    if (result.confirmed) {
      console.log(`✅ Registro no airdrop confirmado com status: ${result.status}!`);
      
      // Verificar registro para ter certeza
      await sleep(2000); // Esperar 2 segundos para garantir que a conta foi criada
      if (await isUserRegisteredInAirdrop(connection, walletKeypair.publicKey)) {
        return true;
      } else {
        console.log("⚠️ Transação confirmada, mas conta não encontrada. Algo deu errado.");
        return false;
      }
    } else {
      console.log(`❌ Transação não confirmada: ${result.error}`);
      return false;
    }
  } catch (error) {
    console.error("❌ Erro ao registrar no airdrop:", error.message);
    if (error.logs) {
      console.log("\n📋 LOGS DE ERRO:");
      error.logs.forEach((log, i) => console.log(`${i}: ${log}`));
    }
    return false;
  }
}

// Função modificada para preparar contas do airdrop para o slot 3
async function prepareAirdropAccounts(connection, referrerAddress) {
  console.log("\n🪂 PREPARANDO CONTAS DO PROGRAMA DE AIRDROP PARA SLOT 3...");
  
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
  let userAccountInfo = await connection.getAccountInfo(userAccountPda);
  let userExists = userAccountInfo !== null && userAccountInfo.owner.equals(VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID);
  
  if (userExists) {
    console.log(`  ✅ Referenciador já registrado no programa de airdrop`);
  } else {
    console.log(`  ❌ ERRO: Referenciador não está registrado no programa de airdrop!`);
    throw new Error("Referenciador não registrado no airdrop. Execute register-airdrop-user.js primeiro.");
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
  const currentWeekDataInfo = await connection.getAccountInfo(currentWeekDataPda);
  if (!currentWeekDataInfo) {
    console.log(`  ⚠️ Dados da semana atual não encontrados. Será criado automaticamente.`);
  } else {
    console.log(`  ✅ Dados da semana atual encontrados`);
  }
  
  const [nextWeekDataPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("weekly_data", "utf8"), Buffer.from([currentWeek + 1])],
    VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
  );
  console.log(`  📊 Next Week Data PDA: ${nextWeekDataPda.toString()}`);
  
  // Verificar se a conta da próxima semana existe
  const nextWeekDataInfo = await connection.getAccountInfo(nextWeekDataPda);
  if (!nextWeekDataInfo) {
    console.log(`  ⚠️ Dados da próxima semana não encontrados. Será criado automaticamente.`);
  } else {
    console.log(`  ✅ Dados da próxima semana encontrados`);
  }
  
  return {
    programStatePda,
    userAccountPda,
    currentWeekDataPda,
    nextWeekDataPda,
    userExists,
    currentWeek,
    // Retornar as contas reais para incluir nos remaining_accounts
    stateAccountInfo,
    userAccountInfo,
    currentWeekDataInfo,
    nextWeekDataInfo
  };
}

// Função principal
async function main() {
  console.log("\n🚀 REGISTER V6 - VERSÃO COM ARGUMENTOS CLI 🚀");
  console.log("===========================================");
  
  // Processar argumentos da linha de comando
  const args = process.argv.slice(2);
  
  if (args.length < 4) {
    console.error("\n❌ ERRO: Argumentos insuficientes!");
    console.log("\n📖 USO:");
    console.log("node register-v6.js <carteira> <config> <referenciador> <alt>");
    console.log("\n📋 EXEMPLO:");
    console.log("node register-v6.js ./carteiras/carteira3.json ./matriz-config.json QgNN4aW9hPz4ANP1LqzR2FkDPZo9MzDZxDQ4abovHYv 5EzjPd9ZKqHFSZ9d4rND3X3uwXSVxT65DSkerK6jHaw2");
    console.log("\n💡 ARGUMENTOS:");
    console.log("  carteira      - Caminho para o arquivo JSON da carteira");
    console.log("  config        - Caminho para o arquivo de configuração");
    console.log("  referenciador - Endereço público do referenciador");
    console.log("  alt           - Endereço da Address Lookup Table");
    console.log("\n📌 OPCIONAL:");
    console.log("  Você pode adicionar um 5º argumento para o valor do depósito em SOL (padrão: 0.1)");
    process.exit(1);
  }
  
  const walletPath = args[0];
  const configPath = args[1];
  const referrerAddressStr = args[2];
  const altAddress = args[3];
  const depositAmountStr = args[4] || '0.1'; // Valor padrão: 0.1 SOL
  
  console.log("\n📋 CONFIGURAÇÃO:");
  console.log(`  Carteira: ${walletPath}`);
  console.log(`  Config: ${configPath}`);
  console.log(`  Referenciador: ${referrerAddressStr}`);
  console.log(`  ALT: ${altAddress}`);
  console.log(`  Depósito: ${depositAmountStr} SOL`);
  
  try {
    // Converter endereço do referenciador
    let referrerAddress;
    try {
      referrerAddress = new PublicKey(referrerAddressStr);
    } catch (e) {
      console.error("\n❌ ERRO: Endereço do referenciador inválido!");
      process.exit(1);
    }
    
    // Converter valor do depósito
    let depositAmount;
    try {
      depositAmount = Math.floor(parseFloat(depositAmountStr) * 1e9); // Converter para lamports
    } catch (e) {
      console.error("\n❌ ERRO: Valor do depósito inválido!");
      process.exit(1);
    }
    
    // Carregar carteira
    console.log(`\nCarregando carteira de ${walletPath}...`);
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
    
    if (balance < depositAmount + 10_000_000) {
      console.error("❌ Saldo insuficiente!");
      process.exit(1);
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
        process.exit(1);
      }
      
      console.log("✅ Referenciador verificado");
      console.log("📊 Slots: " + referrerInfo.chain.filledSlots + "/3");
      
      const slotIndex = referrerInfo.chain.filledSlots;
      console.log("\n🎯 VOCÊ PREENCHERÁ O SLOT " + (slotIndex + 1));
      
      // Informar lógica do slot
      if (slotIndex === 0) {
        console.log("💱 Slot 1: Swap SOL → DONUT e burn de 100%");
      } else if (slotIndex === 1) {
        console.log("💰 Slot 2: Reserva SOL para o referenciador");
      } else if (slotIndex === 2) {
        console.log("🔄 Slot 3: Paga SOL reservado e processa recursão");
        
        // NOVA VERIFICAÇÃO: Se for slot 3, verificar se o referenciador está registrado no airdrop
        if (!await isUserRegisteredInAirdrop(connection, referrerAddress)) {
          console.log("\n⚠️ ATENÇÃO: O referenciador não está registrado no programa de airdrop!");
          console.log("❌ Para preencher o slot 3, o referenciador deve estar registrado no airdrop.");
          console.log("   Execute: node register-airdrop-user.js <carteira-referenciador>");
          process.exit(1);
        }
      }
    } catch (e) {
      console.error("❌ Erro ao verificar referenciador:", e);
      process.exit(1);
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
        process.exit(0);
      }
    } catch {
      console.log("✅ Usuário não registrado, prosseguindo...");
    }
    
    // NOVA ETAPA: Verificar se o usuário está registrado no airdrop
    if (!await isUserRegisteredInAirdrop(connection, walletKeypair.publicKey)) {
      console.log("\n⚠️ ATENÇÃO: Você não está registrado no programa de airdrop!");
      console.log("🚀 Registrando automaticamente no airdrop...");
      
      // Registrar no airdrop
      const registeredInAirdrop = await registerUserInAirdrop(connection, walletKeypair);
      if (!registeredInAirdrop) {
        console.log("\n❌ Falha ao registrar no airdrop. Execute register-airdrop-user.js manualmente.");
        process.exit(1);
      }
      
      console.log("\n✅ Registrado com sucesso no airdrop!");
    } else {
      console.log("\n✅ Usuário já registrado no programa de airdrop!");
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
    
    // Verificar existência de ATAs
    const wsolInfo = await connection.getAccountInfo(userWsolAccount);
    console.log(wsolInfo ? "✅ WSOL ATA existe" : "⚠️ WSOL ATA não existe - será criada");
    
    const donutInfo = await connection.getAccountInfo(userDonutAccount);
    console.log(donutInfo ? "✅ DONUT ATA existe" : "⚠️ DONUT ATA não existe - será criada");
    
    // Preparar uplines se for slot 3
    let uplineAccounts = [];
    let airdropInfo = null;
    const isSlot3 = referrerInfo.chain.filledSlots === 2;
    
    if (isSlot3) {
      console.log("\n🔄 SLOT 3 DETECTADO - Preparando recursividade...");
      
      if (referrerInfo.upline?.upline?.length > 0) {
        const uplines = referrerInfo.upline.upline.map(entry => entry.pda);
        // Preparar uplines usando a função do programa
        uplineAccounts = [];
        
        // Coletar informações das uplines
        for (let i = 0; i < Math.min(uplines.length, 6); i++) {
          const uplinePDA = uplines[i];
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
              
              // Verificar se o upline está registrado no airdrop
              if (!await isUserRegisteredInAirdrop(connection, uplineWallet)) {
                console.log(`  ❌ Upline ${uplineWallet.toString()} não está registrado no programa de airdrop!`);
                console.log(`     Este upline será ignorado na recursão.`);
                continue;
              } else {
                console.log(`  ✅ Upline registrado no airdrop`);
              }
              
              // Adicionar contas do upline
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
            } else {
              console.log(`  ⚠️ Campo owner_wallet não encontrado`);
              continue;
            }
          } catch (e) {
            console.log(`  ❌ Erro ao analisar upline: ${e.message}`);
          }
        }
        
        console.log(`  ✅ Total de uplines válidos: ${uplineAccounts.length / 2}`);
      } else {
        console.log("ℹ️ Não há uplines para processar (usuário base)");
      }
      
      // Preparar contas do programa de airdrop para o slot 3
      airdropInfo = await prepareAirdropAccounts(connection, referrerAddress);
    }
    
    // Carregar ALT
    console.log("\n🔍 CARREGANDO ALT...");
    const lookupTableAccount = await getAddressLookupTable(connection, altAddress);
    
    if (!lookupTableAccount) {
      console.error("❌ ALT não encontrada!");
      process.exit(1);
    }
    
    // Preparar transação
    console.log("\n📤 PREPARANDO TRANSAÇÃO PRINCIPAL...");
    
    // Obter blockhash recente
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    
    // Criar array de instruções
    const instructions = [];
    
    // Instruções de compute budget
    const computeUnits = isSlot3 ? 1_000_000 : 1_400_000;
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: computeUnits
    });
    instructions.push(modifyComputeUnits);
    
    // Prioridade alta para a transação
    const setPriority = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 250000
    });
    instructions.push(setPriority);
    
    // Adicionar instruções para criar ATAs, se necessário
    if (!wsolInfo) {
      console.log("  ➕ Adicionando instrução para criar WSOL ATA");
      const createWsolATA = createATAInstruction(
        walletKeypair.publicKey,
        userWsolAccount,
        walletKeypair.publicKey,
        VERIFIED_ADDRESSES.WSOL_MINT
      );
      instructions.push(createWsolATA);
    }
    
    if (!donutInfo) {
      console.log("  ➕ Adicionando instrução para criar DONUT ATA");
      const createDonutATA = createATAInstruction(
        walletKeypair.publicKey,
        userDonutAccount,
        walletKeypair.publicKey,
        VERIFIED_ADDRESSES.TOKEN_MINT
      );
      instructions.push(createDonutATA);
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
    
    // Construir remaining_accounts que inclui contas do airdrop se for slot 3
    let mainRemainingAccounts = [...vaultAAccounts, ...chainlinkAccounts];
    
    // No arquivo register-v6.js, após preparar as contas do airdrop
    if (isSlot3 && airdropInfo) {
      console.log("\n🔄 ADICIONANDO CONTAS DO AIRDROP AOS REMAINING ACCOUNTS");
      
      // Adicionar contas do programa de airdrop
      mainRemainingAccounts.push({
        pubkey: airdropInfo.programStatePda,
        isWritable: true,
        isSigner: false,
      });
      console.log(`  ➕ Program State PDA: ${airdropInfo.programStatePda.toString()}`);
      
      mainRemainingAccounts.push({
        pubkey: airdropInfo.userAccountPda,
        isWritable: true,
        isSigner: false,
      });
      console.log(`  ➕ User Account PDA (AIRDROP): ${airdropInfo.userAccountPda.toString()}`);
      
      mainRemainingAccounts.push({
        pubkey: airdropInfo.currentWeekDataPda,
        isWritable: true,
        isSigner: false,
      });
      console.log(`  ➕ Current Week Data PDA: ${airdropInfo.currentWeekDataPda.toString()}`);
      
      mainRemainingAccounts.push({
        pubkey: airdropInfo.nextWeekDataPda,
        isWritable: true,
        isSigner: false,
      });
      console.log(`  ➕ Next Week Data PDA: ${airdropInfo.nextWeekDataPda.toString()}`);
      
      mainRemainingAccounts.push({
        pubkey: referrerAddress,
        isWritable: true,
        isSigner: false,
      });
      console.log(`  ➕ Referrer Wallet: ${referrerAddress.toString()}`);
      
    // ADICIONAR ANTES DO instructions_sysvar:
    mainRemainingAccounts.push({
      pubkey: VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID,
      isWritable: false,
      isSigner: false,
    });
    console.log(`  ➕ Airdrop Program ID: ${VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID.toString()}`);

    // Depois adicionar o instructions_sysvar
    mainRemainingAccounts.push({
      pubkey: SYSVAR_INSTRUCTIONS_PUBKEY,
      isWritable: false,
      isSigner: false,
    });
    console.log(`  ➕ Instructions Sysvar: ${SYSVAR_INSTRUCTIONS_PUBKEY.toString()}`);
      
      // Adicionar uplines
      mainRemainingAccounts = [...mainRemainingAccounts, ...uplineAccounts];
    }
    
    console.log(`\n📊 RESUMO DE CONTAS:`);
    console.log(`  - Vault A: 4 contas`);
    console.log(`  - Chainlink: 2 contas`);
    
    if (isSlot3) {
      console.log(`  - Airdrop: 6 contas (incluindo instructions sysvar)`);
      console.log(`  - Uplines: ${uplineAccounts.length} contas (${uplineAccounts.length / 2} uplines)`);
    }
    
    console.log(`  📦 Total de remaining accounts: ${mainRemainingAccounts.length}`);
    
    // Gerar instrução principal
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
    
    console.log(`📦 Total de instruções na transação principal: ${instructions.length}`);
    
    // Criar mensagem V0 com ALT
    const messageV0 = new TransactionMessage({
      payerKey: walletKeypair.publicKey,
      recentBlockhash: blockhash,
      instructions
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
        
        // Se foi slot 3, verificar matriz completada
        if (isSlot3) {
          if (newReferrerInfo.chain.filledSlots === 0) {
            console.log("\n🎉 MATRIZ DO REFERENCIADOR COMPLETADA COM SUCESSO!");
          } else {
            console.log("\n⚠️ A matriz do referenciador não foi completada. Slots: " + newReferrerInfo.chain.filledSlots + "/3");
          }
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
    }
  } catch (error) {
    console.error("❌ ERRO GERAL:", error.message);
    
    if (error.logs) {
      console.log("\n📋 LOGS DE ERRO DETALHADOS:");
      error.logs.forEach((log, i) => console.log(`${i}: ${log}`));
    }
  }
}

// Executar script
main().catch(console.error);