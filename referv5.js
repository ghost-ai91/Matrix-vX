// Script otimizado para registrar usuário com referenciador - TRANSAÇÃO ÚNICA COM SUPORTE AO AIRDROP
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
const depositAmount = args[4] ? parseInt(args[4]) : 100_000_000; // Opcional: valor do depósito (default: 0.1 SOL)

// Endereço do RPC QuickNode privado
const QUICKNODE_RPC_URL = "https://weathered-quiet-theorem.solana-devnet.quiknode.pro/198997b67cb51804baeb34ed2257274aa2b2d8c0";

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
  AIRDROP_PROGRAM_ID: new PublicKey("2AUXkFgK6Cf8c8H3YswbpuE97D2jAcLmjq5iZ1afNYa6"),
};

// Programas do sistema
const SPL_TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

// Função para enviar transação com retry - ABORDAGEM SIMPLIFICADA
async function sendTransactionWithRetry(
  connection,
  wallet,
  instructions,
  lookupTable,
  maxRetries = 5
) {
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      console.log(`📤 Tentativa de envio ${attempt + 1}/${maxRetries}...`);
      
      // Para cada tentativa, obter um novo blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      
      // Em vez de modificar a transação, criamos uma nova a cada tentativa
      const messageV0 = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: blockhash,
        instructions
      }).compileToV0Message([lookupTable]);
      
      const transaction = new VersionedTransaction(messageV0);
      transaction.sign([wallet]);
      
      // Enviar transação
      const signature = await connection.sendTransaction(transaction, {
        skipPreflight: true,
        maxRetries: 3,
        preflightCommitment: "confirmed"
      });
      
      console.log(`✅ Transação enviada: ${signature}`);
      console.log(`🔍 Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
      
      // Aguardar confirmação
      console.log(`\n⏳ Aguardando confirmação...`);
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
      }, "confirmed");
      
      console.log(`✅ Transação confirmada!`);
      return signature;
      
    } catch (error) {
      attempt++;
      
      console.log(`❌ Erro na tentativa ${attempt}:`);
      console.log(error.message);
      
      if (error.logs) {
        console.log(`\n📋 LOGS DE ERRO:`);
        error.logs.forEach((log, i) => console.log(`${i}: ${log}`));
      }
      
      // Se for a última tentativa, propague o erro
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Aguardar antes da próxima tentativa (tempo crescente)
      const waitTime = Math.min(1000 * Math.pow(2, attempt-1), 10000);
      console.log(`⏳ Aguardando ${waitTime/1000}s antes da próxima tentativa...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  throw new Error(`Falha após ${maxRetries} tentativas.`);
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
    [Buffer.from("program_state")],
    VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
  );
  console.log(`  📝 Program State PDA: ${programStatePda.toString()}`);
  
  // Derivar a PDA da conta do usuário
  const [userAccountPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user_account"), referrerAddress.toBuffer()],
    VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
  );
  console.log(`  👤 User Account PDA: ${userAccountPda.toString()}`);
  
  // Verificar se a conta de estado existe e obter a semana atual
  let currentWeek = 1; // Valor padrão se não conseguirmos ler
  try {
    const stateAccountInfo = await connection.getAccountInfo(programStatePda);
    
    if (stateAccountInfo) {
      console.log(`  ✅ Estado do programa existe`);
      
      // Deserializar apenas o necessário para obter a semana atual
      // O layout do estado é: 8 bytes (discriminator) + 32 bytes (admin) + 32 bytes (token_mint) + 1 byte (current_week)
      if (stateAccountInfo.data.length >= 73) {
        currentWeek = stateAccountInfo.data[72]; // O byte da current_week está na posição 72
        console.log(`  📅 Semana atual: ${currentWeek}`);
      } else {
        console.log(`  ⚠️ Formato inesperado da conta de estado, usando semana padrão 1`);
      }
    } else {
      console.log(`  ⚠️ Estado do programa não encontrado, usando semana padrão 1`);
    }
  } catch (error) {
    console.log(`  ⚠️ Erro ao ler estado do programa: ${error.message}`);
  }
  
  // Derivar as PDAs dos dados das semanas
  const [currentWeekDataPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("weekly_data"), Buffer.from([currentWeek])],
    VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
  );
  console.log(`  📊 Current Week Data PDA: ${currentWeekDataPda.toString()}`);
  
  const [nextWeekDataPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("weekly_data"), Buffer.from([currentWeek + 1])],
    VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
  );
  console.log(`  📊 Next Week Data PDA: ${nextWeekDataPda.toString()}`);
  
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
  
  // Criar array de contas para passar para o programa
  const airdropAccounts = [
    // Conta de estado do programa
    { pubkey: programStatePda, isWritable: true, isSigner: false },
    
    // Carteira do referenciador (signer)
    { pubkey: referrerAddress, isWritable: true, isSigner: true },
    
    // Conta do usuário no programa de airdrop
    { pubkey: userAccountPda, isWritable: true, isSigner: false },
    
    // Dados da semana atual
    { pubkey: currentWeekDataPda, isWritable: true, isSigner: false },
    
    // Dados da próxima semana
    { pubkey: nextWeekDataPda, isWritable: true, isSigner: false }
  ];
  
  console.log(`  ✅ Total de contas do airdrop: ${airdropAccounts.length}`);
  return airdropAccounts;
}

// Função adaptada para preparar uplines - APENAS DOIS ACCOUNTS POR UPLINE
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

async function main() {
  try {
    console.log("🚀 REGISTRANDO USUÁRIO COM REFERENCIADOR - TRANSAÇÃO ÚNICA OTIMIZADA 🚀");
    console.log("=====================================================================");

    // Verificar argumentos
    if (!referrerAddressStr || !altAddress) {
      console.error("❌ ERRO: Argumentos obrigatórios faltando!");
      console.error("Uso: node register-client.js <carteira> <config> <referenciador> <ALT> [valor_deposito]");
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
    
    // Conexão - Usando RPC QuickNode privado
    console.log(`Conectando ao RPC QuickNode: ${QUICKNODE_RPC_URL}`);
    const connection = new Connection(QUICKNODE_RPC_URL, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000, // 60 segundos de timeout
    });
    console.log('Conexão estabelecida');
    
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
    
    // Mostrar valor do depósito (padrão 0.1 SOL ou personalizado)
    console.log("💸 VALOR DE DEPÓSITO: " + depositAmount / 1e9 + " SOL");
    
    if (balance < depositAmount + 10_000_000) {
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
        console.log("💱 Slot 1: Swap SOL → DONUT e burn de 100% [OTIMIZADO: Transação única]");
      } else if (slotIndex === 1) {
        console.log("💰 Slot 2: Reserva SOL para o referenciador");
      } else if (slotIndex === 2) {
        console.log("🔄 Slot 3: Paga SOL reservado, processa recursão e notifica airdrop");
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
    
    // Preparar uplines e contas de airdrop se for slot 3
    let uplineAccounts = [];
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
      const airdropAccounts = await prepareAirdropAccounts(connection, referrerAddress);
      
      // Adicionar contas do airdrop aos uplineAccounts
      uplineAccounts = [...uplineAccounts, ...airdropAccounts];
      console.log(`\n📊 Total de contas após adicionar airdrop: ${uplineAccounts.length}`);
    }
    
    // Carregar ALT
    console.log("\n🔍 CARREGANDO ALT...");
    const lookupTableAccount = await getAddressLookupTable(connection, altAddress);
    
    if (!lookupTableAccount) {
      console.error("❌ ALT não encontrada!");
      return;
    }
    
    // Preparar transação - ABORDAGEM SIMPLIFICADA
    console.log("\n📤 PREPARANDO TRANSAÇÃO...");
    try {
      // Criar array de instruções
      const instructions = [];
      
      // Instruções de compute budget - SEMPRE VÊM PRIMEIRO
      const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
        units: 1_400_000
      });
      instructions.push(modifyComputeUnits);
      
      const setPriority = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 5000
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
      
      // Remaining accounts
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
      
      const allRemainingAccounts = [...vaultAAccounts, ...chainlinkAccounts, ...uplineAccounts];
      
      console.log(`📊 Remaining accounts: ${allRemainingAccounts.length}`);
      console.log(`  - Vault A: 4 contas`);
      console.log(`  - Chainlink: 2 contas`);
      
      if (isSlot3) {
        const uplineCount = (uplineAccounts.length - 5) / 2; // Subtrai as 5 contas do airdrop
        console.log(`  - Uplines: ${uplineCount * 2} contas (${uplineCount} uplines)`);
        console.log(`  - Airdrop: 5 contas`);
      } else {
        console.log(`  - Uplines: 0 contas (não é slot 3)`);
      }
      
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
        .remainingAccounts(allRemainingAccounts)
        .instruction();
      
      // Adicionar instrução principal
      instructions.push(registerIx);
      
      console.log(`📦 Total de instruções: ${instructions.length}`);
      
      // Enviar transação usando nossa função melhorada
      console.log("\n📤 ENVIANDO TRANSAÇÃO ÚNICA...");
      const txid = await sendTransactionWithRetry(
        connection,
        walletKeypair,
        instructions,
        lookupTableAccount,
        5 // 5 tentativas
      );
      
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
      
      // Se foi slot 3, verificar recursão e airdrop
      if (isSlot3) {
        console.log("\n🔄 VERIFICANDO RECURSÃO:");
        let processedCount = 0;
        
        // Verificar uplines processados
        for (let i = 0; i < uplineAccounts.length; i += 2) {
          if (i >= uplineAccounts.length - 5) {
            // Pular as últimas 5 contas (contas do airdrop)
            break;
          }
          
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
            [Buffer.from("user_account"), referrerAddress.toBuffer()],
            VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
          );
          
          const airdropUserAccountInfo = await connection.getAccountInfo(userAccountPda);
          if (airdropUserAccountInfo && airdropUserAccountInfo.owner.equals(VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID)) {
            console.log(`  ✅ Usuário registrado com sucesso no programa de airdrop`);
            
            // Tentar decodificar dados básicos para mostrar matrizes
            if (airdropUserAccountInfo.data.length >= 8 + 32 + 8) {
              const totalMatrices = airdropUserAccountInfo.data.readBigUInt64LE(8 + 32);
              console.log(`  📊 Total de matrizes completadas: ${totalMatrices}`);
            }
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
      
      console.log("\n🎉 REGISTRO COM TRANSAÇÃO ÚNICA CONCLUÍDO COM SUCESSO! 🎉");
      console.log("=====================================================");
      
    } catch (error) {
      console.error("❌ ERRO AO REGISTRAR:", error);
      
      if (error.logs) {
        console.log("\n📋 LOGS DE ERRO:");
        error.logs.forEach((log, i) => console.log(`${i}: ${log}`));
      }
    }
    
  } catch (error) {
    console.error("❌ ERRO GERAL:", error);
  }
}

main();