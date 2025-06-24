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
    
    // Programa de Airdrop
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
    
    while (Date.now() - startTime < timeout) {
      try {
        status = await connection.getSignatureStatus(signature, {
          searchTransactionHistory: true,
        });
        
        if (status && status.value) {
          if (status.value.err) {
            return { confirmed: false, error: status.value.err };
          } else if (status.value.confirmationStatus === 'confirmed' || 
                    status.value.confirmationStatus === 'finalized') {
            return { confirmed: true, status: status.value.confirmationStatus };
          }
        }
        
        console.log(`  🔍 Verificando status (${Math.round((Date.now() - startTime)/1000)}s/${Math.round(timeout/1000)}s)...`);
        await sleep(2000);
      } catch (e) {
        console.log(`  ⚠️ Erro ao verificar status: ${e.message}, tentando novamente...`);
        await sleep(2000);
      }
    }
    
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
    
    if (await isUserRegisteredInAirdrop(connection, walletKeypair.publicKey)) {
      console.log("✅ Usuário já registrado no programa de airdrop");
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
    
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    
    const instructions = [];
    
    const computeUnits = 200_000;
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: computeUnits
    });
    instructions.push(modifyComputeUnits);
    
    const setPriority = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 50000
    });
    instructions.push(setPriority);
    
    const registerUserDiscriminator = Buffer.from([2, 241, 150, 223, 99, 214, 116, 97]);
    
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
    
    const messageV0 = new TransactionMessage({
      payerKey: walletKeypair.publicKey,
      recentBlockhash: blockhash,
      instructions
    }).compileToV0Message();
    
    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([walletKeypair]);
    
    try {
      console.log("📤 Enviando transação de registro no airdrop...");
      const txid = await connection.sendTransaction(transaction, {
        skipPreflight: true,
        maxRetries: 3
      });
      
      console.log(`✅ Transação enviada: ${txid}`);
      console.log(`🔍 Explorer: https://explorer.solana.com/tx/${txid}?cluster=devnet`);
      
      console.log(`\n⏳ Aguardando confirmação (timeout: 60s)...`);
      const result = await checkSignatureStatus(connection, txid, 60000);
      
      if (result.confirmed) {
        console.log(`✅ Registro no airdrop confirmado com status: ${result.status}!`);
        
        await sleep(2000);
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
  
  // Função para preparar contas do airdrop
  async function prepareAirdropAccounts(connection, referrerAddress) {
    console.log("\n🪂 PREPARANDO CONTAS DO PROGRAMA DE AIRDROP PARA SLOT 3...");
    
    const [programStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("program_state", "utf8")],
      VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
    );
    console.log(`  📝 Program State PDA: ${programStatePda.toString()}`);
    
    const stateAccountInfo = await connection.getAccountInfo(programStatePda);
    if (!stateAccountInfo) {
      console.log(`  ❌ Estado do programa não encontrado! Isso é crítico.`);
      throw new Error("Estado do programa de airdrop não encontrado");
    }
    
    const [userAccountPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_account", "utf8"), referrerAddress.toBuffer()],
      VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
    );
    console.log(`  👤 User Account PDA: ${userAccountPda.toString()}`);
    
    let userAccountInfo = await connection.getAccountInfo(userAccountPda);
    let userExists = userAccountInfo !== null && userAccountInfo.owner.equals(VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID);
    
    if (userExists) {
      console.log(`  ✅ Referenciador já registrado no programa de airdrop`);
    } else {
      console.log(`  ❌ ERRO: Referenciador não está registrado no programa de airdrop!`);
      throw new Error("Referenciador não registrado no airdrop. Execute register-airdrop-user.js primeiro.");
    }
    
    let currentWeek = 1;
    if (stateAccountInfo && stateAccountInfo.data.length >= 73) {
      currentWeek = stateAccountInfo.data[72];
      console.log(`  📅 Semana atual: ${currentWeek}`);
    } else {
      console.log(`  ⚠️ Formato inesperado da conta de estado, usando semana padrão 1`);
    }
    
    const [currentWeekDataPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("weekly_data", "utf8"), Buffer.from([currentWeek])],
      VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
    );
    console.log(`  📊 Current Week Data PDA: ${currentWeekDataPda.toString()}`);
    
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
      stateAccountInfo,
      userAccountInfo,
      currentWeekDataInfo,
      nextWeekDataInfo
    };
  }
  
  // Função para preparar contas do airdrop para um endereço específico
  async function prepareAirdropAccountsForWallet(connection, walletAddress) {
    const [programStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("program_state", "utf8")],
      VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
    );
    
    const stateAccountInfo = await connection.getAccountInfo(programStatePda);
    if (!stateAccountInfo) {
      throw new Error("Estado do programa de airdrop não encontrado");
    }
    
    const [userAccountPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_account", "utf8"), walletAddress.toBuffer()],
      VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
    );
    
    let currentWeek = 1;
    if (stateAccountInfo && stateAccountInfo.data.length >= 73) {
      currentWeek = stateAccountInfo.data[72];
    }
    
    const [currentWeekDataPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("weekly_data", "utf8"), Buffer.from([currentWeek])],
      VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
    );
    
    const [nextWeekDataPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("weekly_data", "utf8"), Buffer.from([currentWeek + 1])],
      VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
    );
    
    return {
      programStatePda,
      userAccountPda,
      currentWeekDataPda,
      nextWeekDataPda,
      currentWeek
    };
  }
  
  // Função auxiliar para calcular semana esperada
  function calculateExpectedWeek(stateAccountData) {
    // O start_timestamp está no offset 40 (após admin + donut_token_mint + current_week + matrix_program_id)
    const startTimestamp = Number(stateAccountData.readBigInt64LE(40));
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const elapsedSeconds = currentTimestamp - startTimestamp;
    const expectedWeek = Math.min(Math.floor(elapsedSeconds / 600) + 1, 36); // 600 = WEEK_DURATION_SECONDS
    return expectedWeek;
  }
  
  // Função principal
  async function main() {
    console.log("\n🚀 REGISTER V6 - VERSÃO COM ARGUMENTOS CLI 🚀");
    console.log("===========================================");
    
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
    const depositAmountStr = args[4] || '0.1';
    
    console.log("\n📋 CONFIGURAÇÃO:");
    console.log(`  Carteira: ${walletPath}`);
    console.log(`  Config: ${configPath}`);
    console.log(`  Referenciador: ${referrerAddressStr}`);
    console.log(`  ALT: ${altAddress}`);
    console.log(`  Depósito: ${depositAmountStr} SOL`);
    
    try {
      let referrerAddress;
      try {
        referrerAddress = new PublicKey(referrerAddressStr);
      } catch (e) {
        console.error("\n❌ ERRO: Endereço do referenciador inválido!");
        process.exit(1);
      }
      
      let depositAmount;
      try {
        depositAmount = Math.floor(parseFloat(depositAmountStr) * 1e9);
      } catch (e) {
        console.error("\n❌ ERRO: Valor do depósito inválido!");
        process.exit(1);
      }
      
      console.log(`\nCarregando carteira de ${walletPath}...`);
      const walletKeypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, 'utf8')))
      );
      
      const idl = require('./target/idl/referral_system.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      const connection = new Connection('https://api.devnet.solana.com', {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 60000,
        disableRetryOnRateLimit: false,
      });
      console.log('Conectando à Devnet com timeout estendido (60s)');
      
      const MATRIX_PROGRAM_ID = new PublicKey(config.programId);
      const STATE_ADDRESS = new PublicKey(config.stateAddress);
      
      const anchorWallet = new Wallet(walletKeypair);
      const provider = new AnchorProvider(connection, anchorWallet, { 
        commitment: 'confirmed',
        skipPreflight: true,
      });
      const program = new Program(idl, MATRIX_PROGRAM_ID, provider);
      
      console.log("\n👤 USUÁRIO: " + walletKeypair.publicKey.toString());
      console.log("👥 REFERENCIADOR: " + referrerAddress.toString());
      const balance = await connection.getBalance(walletKeypair.publicKey);
      console.log("💰 SALDO: " + balance / 1e9 + " SOL");
      
      if (balance < depositAmount + 10_000_000) {
        console.error("❌ Saldo insuficiente!");
        process.exit(1);
      }
      
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
        
        if (slotIndex === 0) {
          console.log("💱 Slot 1: Swap SOL → DONUT e burn de 100%");
        } else if (slotIndex === 1) {
          console.log("💰 Slot 2: Reserva SOL para o referenciador");
        } else if (slotIndex === 2) {
          console.log("🔄 Slot 3: Paga SOL reservado e processa recursão");
          
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
      
      if (!await isUserRegisteredInAirdrop(connection, walletKeypair.publicKey)) {
        console.log("\n⚠️ ATENÇÃO: Você não está registrado no programa de airdrop!");
        console.log("🚀 Registrando automaticamente no airdrop...");
        
        const registeredInAirdrop = await registerUserInAirdrop(connection, walletKeypair);
        if (!registeredInAirdrop) {
          console.log("\n❌ Falha ao registrar no airdrop. Execute register-airdrop-user.js manualmente.");
          process.exit(1);
        }
        
        console.log("\n✅ Registrado com sucesso no airdrop!");
      } else {
        console.log("\n✅ Usuário já registrado no programa de airdrop!");
      }
      
      console.log("\n🔧 DERIVANDO PDAs...");
      
      const [programSolVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("program_sol_vault")],
        MATRIX_PROGRAM_ID
      );
      console.log("💰 Program SOL Vault: " + programSolVault.toString());
      
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
      
      const wsolInfo = await connection.getAccountInfo(userWsolAccount);
      console.log(wsolInfo ? "✅ WSOL ATA existe" : "⚠️ WSOL ATA não existe - será criada");
      
      const donutInfo = await connection.getAccountInfo(userDonutAccount);
      console.log(donutInfo ? "✅ DONUT ATA existe" : "⚠️ DONUT ATA não existe - será criada");
      
      // Preparar uplines se for slot 3
      let uplineAccounts = [];
      let airdropAccounts = [];
      let uplinesQueCompletarao = [];
      let airdropInfo = null;
      const isSlot3 = referrerInfo.chain.filledSlots === 2;
      
      if (isSlot3) {
        console.log("\n🔄 SLOT 3 DETECTADO - Preparando recursividade...");
        
        airdropInfo = await prepareAirdropAccounts(connection, referrerAddress);
        
        airdropAccounts = [
          {
            pubkey: airdropInfo.programStatePda,
            isWritable: true,
            isSigner: false,
          },
          {
            pubkey: airdropInfo.userAccountPda,
            isWritable: true,
            isSigner: false,
          },
          {
            pubkey: airdropInfo.currentWeekDataPda,
            isWritable: true,
            isSigner: false,
          },
          {
            pubkey: airdropInfo.nextWeekDataPda,
            isWritable: true,
            isSigner: false,
          },
          {
            pubkey: referrerAddress,
            isWritable: true,
            isSigner: false,
          },
          {
            pubkey: VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID,
            isWritable: false,
            isSigner: false,
          },
          {
            pubkey: SYSVAR_INSTRUCTIONS_PUBKEY,
            isWritable: false,
            isSigner: false,
          }
        ];
        
        if (referrerInfo.upline?.upline?.length > 0) {
          console.log("\n🔄 Preparando uplines para processamento da matriz...");
          const uplines = referrerInfo.upline.upline.map(entry => entry.pda);
          
          for (let i = 0; i < Math.min(uplines.length, 6); i++) {
            const uplinePDA = uplines[i];
            console.log(`  Analisando upline ${i + 1}: ${uplinePDA.toString()}`);
            
            try {
              const uplineInfo = await program.account.userAccount.fetch(uplinePDA);
              
              if (!uplineInfo.isRegistered) {
                console.log(`  ❌ Upline não está registrado! Ignorando.`);
                continue;
              }
              
              let uplineWallet;
              
              if (uplineInfo.ownerWallet) {
                uplineWallet = uplineInfo.ownerWallet;
                console.log(`  ✅ Wallet: ${uplineWallet.toString()}`);
                console.log(`  📊 Slots preenchidos: ${uplineInfo.chain.filledSlots}/3`);
                
                if (!await isUserRegisteredInAirdrop(connection, uplineWallet)) {
                  console.log(`  ❌ Upline ${uplineWallet.toString()} não está registrado no programa de airdrop!`);
                  console.log(`     Este upline será ignorado na recursão.`);
                  continue;
                } else {
                  console.log(`  ✅ Upline registrado no airdrop`);
                }
                
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
                
                if (uplineInfo.chain.filledSlots === 2) {
                  console.log(`  🎯 Este upline COMPLETARÁ sua matriz!`);
                  uplinesQueCompletarao.push({
                    wallet: uplineWallet,
                    index: i
                  });
                }
              } else {
                console.log(`  ⚠️ Campo owner_wallet não encontrado`);
                continue;
              }
            } catch (e) {
              console.log(`  ❌ Erro ao analisar upline: ${e.message}`);
            }
          }
          
          console.log(`  ✅ Total de uplines válidos: ${uplineAccounts.length / 2}`);
          console.log(`  🎯 Uplines que completarão matriz: ${uplinesQueCompletarao.length}`);
        } else {
          console.log("ℹ️ Não há uplines para processar (usuário base)");
        }
        
        if (uplinesQueCompletarao.length > 0) {
          console.log("\n🪂 Preparando PDAs do airdrop para uplines que completarão matriz...");
          
          for (const uplineInfo of uplinesQueCompletarao) {
            try {
              const uplineAirdrop = await prepareAirdropAccountsForWallet(connection, uplineInfo.wallet);
              
              uplineInfo.airdropPDAs = [
                uplineAirdrop.userAccountPda,
                uplineAirdrop.currentWeekDataPda,
                uplineAirdrop.nextWeekDataPda
              ];
              
              console.log(`  ✅ PDAs do airdrop preparadas para upline ${uplineInfo.index + 1}`);
            } catch (e) {
              console.log(`  ❌ Erro ao preparar PDAs do airdrop: ${e.message}`);
            }
          }
        }
      }
      
      const lookupTableAccount = await getAddressLookupTable(connection, altAddress);
      
      if (!lookupTableAccount) {
        console.error("❌ ALT não encontrada!");
        process.exit(1);
      }
      
      console.log("\n📤 PREPARANDO TRANSAÇÃO PRINCIPAL...");
      
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      
      const instructions = [];
      
      const computeUnits = isSlot3 ? 1_400_000 : 1_400_000;
      const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
        units: computeUnits
      });
      instructions.push(modifyComputeUnits);
      
      const setPriority = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 250000
      });
      instructions.push(setPriority);
      
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
      
      let mainRemainingAccounts = [
        ...vaultAAccounts,
        ...chainlinkAccounts,
        ...airdropAccounts,
        ...uplineAccounts
      ];
      
      // ADICIONAR PDAs do airdrop dos uplines NO FINAL
      if (isSlot3 && uplinesQueCompletarao.length > 0) {
        console.log("\n➕ Adicionando PDAs do airdrop dos uplines no final...");
        
        for (const uplineInfo of uplinesQueCompletarao) {
          if (uplineInfo.airdropPDAs) {
            mainRemainingAccounts.push(
              {
                pubkey: uplineInfo.airdropPDAs[0],
                isWritable: true,
                isSigner: false,
              },
              {
                pubkey: uplineInfo.airdropPDAs[1],
                isWritable: true,
                isSigner: false,
              },
              {
                pubkey: uplineInfo.airdropPDAs[2],
                isWritable: true,
                isSigner: false,
              }
            );
          }
        }
      }
      
      // Adicionar PDAs de semanas necessárias de forma inteligente
      if (isSlot3 && airdropInfo) {
        console.log(`\n🔍 Analisando semanas necessárias...`);
        console.log(`  📅 Semana atual registrada: ${airdropInfo.currentWeek}`);
        
        // Calcular semana esperada
        const expectedWeek = calculateExpectedWeek(airdropInfo.stateAccountInfo.data);
        console.log(`  ⏰ Semana esperada baseada no tempo: ${expectedWeek}`);
        
        // Coletar todas as semanas necessárias
        const semanasNecessarias = new Set();
        
        // Sempre incluir a semana atual e sua próxima
        semanasNecessarias.add(airdropInfo.currentWeek);
        if (airdropInfo.currentWeek < 36) {
          semanasNecessarias.add(airdropInfo.currentWeek + 1);
        }
        
        // Se há gap, adicionar semanas intermediárias
        if (expectedWeek > airdropInfo.currentWeek) {
          console.log(`  ⚠️ Detectado atraso de ${expectedWeek - airdropInfo.currentWeek} semanas`);
          
          // Adicionar todas as semanas entre atual e esperada
          for (let week = airdropInfo.currentWeek + 1; week <= expectedWeek; week++) {
            semanasNecessarias.add(week);
            // Adicionar também a próxima de cada uma (para o next_week_data)
            if (week < 36) {
              semanasNecessarias.add(week + 1);
            }
          }
        }
        
        // Converter para array ordenado e adicionar PDAs
        const semanasOrdenadas = Array.from(semanasNecessarias).sort((a, b) => a - b);
        console.log(`\n➕ Adicionando PDAs para semanas: ${semanasOrdenadas.join(', ')}`);
        
        for (const week of semanasOrdenadas) {
          const [weekPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("weekly_data", "utf8"), Buffer.from([week])],
            VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
          );
          
          mainRemainingAccounts.push({
            pubkey: weekPda,
            isWritable: true,
            isSigner: false,
          });
        }
        
        console.log(`  ✅ Total de ${semanasOrdenadas.length} PDAs de semanas adicionadas`);
      }
      
      console.log(`\n📊 RESUMO DE CONTAS:`);
      console.log(`  - Vault A: 4 contas`);
      console.log(`  - Chainlink: 2 contas`);
      
      if (isSlot3) {
        console.log(`  - Airdrop referenciador: 7 contas`);
        console.log(`  - Uplines matriz: ${uplineAccounts.length} contas (${uplineAccounts.length / 2} uplines)`);
        if (uplinesQueCompletarao.length > 0) {
          console.log(`  - PDAs airdrop uplines: ${uplinesQueCompletarao.length * 3} contas`);
        }
      }
      
      console.log(`  📦 Total de remaining accounts: ${mainRemainingAccounts.length}`);
      
      if (isSlot3) {
        console.log(`\n📊 ESTRUTURA DETALHADA:`);
        console.log(`  [0-3]: Vault A`);
        console.log(`  [4-5]: Chainlink`);
        console.log(`  [6-12]: Airdrop referenciador`);
        let currentIdx = 13;
        console.log(`  [${currentIdx}-${currentIdx + uplineAccounts.length - 1}]: Uplines matriz`);
        currentIdx += uplineAccounts.length;
        if (uplinesQueCompletarao.length > 0) {
          console.log(`  [${currentIdx}-${currentIdx + (uplinesQueCompletarao.length * 3) - 1}]: PDAs airdrop uplines`);
          currentIdx += uplinesQueCompletarao.length * 3;
        }
        console.log(`  [${currentIdx}+]: PDAs semanas`);
      }
      
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
      
      const messageV0 = new TransactionMessage({
        payerKey: walletKeypair.publicKey,
        recentBlockhash: blockhash,
        instructions
      }).compileToV0Message([lookupTableAccount]);
      
      const mainTransaction = new VersionedTransaction(messageV0);
      mainTransaction.sign([walletKeypair]);
      
      console.log("✅ Transação principal preparada com ALT");
      
      console.log("\n📤 ENVIANDO TRANSAÇÃO PRINCIPAL...");
      
      try {
        const txid = await connection.sendTransaction(mainTransaction, {
          skipPreflight: true,
          maxRetries: 3
        });
        
        console.log(`✅ Transação principal enviada: ${txid}`);
        console.log(`🔍 Explorer: https://explorer.solana.com/tx/${txid}?cluster=devnet`);
        
        console.log(`\n⏳ Aguardando confirmação da transação principal (timeout: 60s)...`);
        const result = await checkSignatureStatus(connection, txid, 60000);
        
        if (result.confirmed) {
          console.log(`✅ Transação principal confirmada com status: ${result.status}!`);
          
          console.log("\n⏳ Aguardando 5 segundos para o estado da rede atualizar...");
          await sleep(5000);
          
          console.log("\n🔍 VERIFICANDO RESULTADOS...");
          
          const userInfo = await program.account.userAccount.fetch(userPDA);
          console.log("\n📋 REGISTRO CONFIRMADO:");
          console.log("✅ Registrado: " + userInfo.isRegistered);
          console.log("👥 Referenciador: " + userInfo.referrer.toString());
          console.log("🔢 Profundidade: " + userInfo.upline.depth);
          console.log("👤 Owner Wallet: " + userInfo.ownerWallet.toString());
          
          const newReferrerInfo = await program.account.userAccount.fetch(referrerPDA);
          console.log("\n📋 REFERENCIADOR APÓS REGISTRO:");
          console.log("📊 Slots: " + newReferrerInfo.chain.filledSlots + "/3");
          
          if (newReferrerInfo.reservedSol > 0) {
            console.log("💰 SOL Reservado: " + newReferrerInfo.reservedSol / 1e9 + " SOL");
          }
          
          if (isSlot3) {
            console.log("\n🔍 VERIFICANDO MATRIZES COMPLETADAS...");
            
            if (newReferrerInfo.chain.filledSlots === 0) {
              console.log("🎉 Matriz do referenciador direto COMPLETADA!");
            }
            
            if (referrerInfo.upline?.upline?.length > 0) {
              for (let i = 0; i < Math.min(referrerInfo.upline.upline.length, 6); i++) {
                const uplineEntry = referrerInfo.upline.upline[i];
                try {
                  const uplineInfo = await program.account.userAccount.fetch(uplineEntry.pda);
                  if (uplineInfo.chain.filledSlots === 0) {
                    console.log(`🎉 Matriz do upline ${i+1} COMPLETADA!`);
                  }
                } catch (e) {
                  // Ignorar erros
                }
              }
            }
          }
          
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