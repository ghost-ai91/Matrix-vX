// register-v15.js - Versão final com verificação correta do airdrop
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
  
  // Definir SYSVAR_INSTRUCTIONS_PUBKEY
  const SYSVAR_INSTRUCTIONS_PUBKEY = new PublicKey('Sysvar1nstructions1111111111111111111111111');
  
  // Constante para duração da semana (mesma do contrato)
  const WEEK_DURATION_SECONDS = 900; // 15 minutos para teste (mesmo do airdrop)
  
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
    
    // Chainlink (Devnet)
    CHAINLINK_PROGRAM: new PublicKey("HEvSKofvBgfaexv23kMabbYqxasxU3mQ4ibBMEmJWHny"),
    SOL_USD_FEED: new PublicKey("99B2bTijsU6f1GCT73HmdR7HCFFjGMBcPZY6jZ96ynrR"),
    
    // Programa de Airdrop
    AIRDROP_PROGRAM_ID: new PublicKey("BQy1rRHFACsvMvccCptTiHgK7Kv8fWvMRp6g2optDHHT"),
  };
  
  // Programas do sistema
  const SPL_TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
  const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
  
  // Discriminador para register_user no airdrop
  const REGISTER_USER_DISCRIMINATOR = Buffer.from([2, 241, 150, 223, 99, 214, 116, 97]);
  
  // Função para dormir
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
  
  // NOVA FUNÇÃO: Verificar se o airdrop ainda está ativo
  async function isAirdropActive(connection) {
    console.log("\n🔍 Verificando status do airdrop...");
    
    const [programStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("program_state", "utf8")],
      VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
    );
    
    try {
      const stateAccountInfo = await connection.getAccountInfo(programStatePda);
      if (!stateAccountInfo) {
        console.log("⚠️ Estado do airdrop não encontrado - assumindo ativo");
        return true;
      }
      
      if (stateAccountInfo.data.length < 112) {
        console.log("⚠️ Dados do airdrop incompletos - assumindo ativo");
        return true;
      }
      
      // Ler current_week (offset 72)
      const currentWeek = stateAccountInfo.data[72];
      
      // Ler start_timestamp (offset 104-111)
      const startTimestamp = stateAccountInfo.data.readBigInt64LE(104);
      
      // Verificar se passou 36 semanas
      const now = Math.floor(Date.now() / 1000);
      const elapsed = now - Number(startTimestamp);
      const TOTAL_DURATION = 36 * 1800; // 36 semanas de 30 min (teste)
      
      console.log(`  📅 Semana atual do airdrop: ${currentWeek}/36`);
      console.log(`  ⏱️ Tempo decorrido: ${Math.floor(elapsed / 60)} minutos`);
      console.log(`  ⏱️ Duração total: ${Math.floor(TOTAL_DURATION / 60)} minutos`);
      
      const isActive = currentWeek < 36 && elapsed < TOTAL_DURATION;
      console.log(`  📊 Status: ${isActive ? '✅ ATIVO' : '🏁 FINALIZADO'}`);
      
      return isActive;
    } catch (error) {
      console.log("⚠️ Erro ao verificar status do airdrop:", error.message);
      console.log("⚠️ Assumindo airdrop como ativo por segurança");
      return true;
    }
  }
  
  // Função melhorada para aguardar ALT ficar pronta
  async function waitForALT(connection, lookupTableAddress, expectedCount, maxAttempts = 20) {
    console.log(`\n⏳ Aguardando ALT ficar pronta com ${expectedCount} endereços...`);
    
    let lastAddressCount = 0;
    let stableCount = 0;
    
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const lookupTableAccount = await connection.getAddressLookupTable(lookupTableAddress);
        
        if (lookupTableAccount.value) {
          const addressCount = lookupTableAccount.value.state.addresses.length;
          console.log(`  📊 Tentativa ${i + 1}/${maxAttempts}: ${addressCount}/${expectedCount} endereços`);
          
          if (addressCount === lastAddressCount) {
            stableCount++;
            if (stableCount >= 3 && addressCount > 0) {
              console.log(`  ✅ ALT estabilizada com ${addressCount} endereços`);
              return lookupTableAccount.value;
            }
          } else {
            stableCount = 0;
          }
          
          lastAddressCount = addressCount;
          
          if (addressCount >= expectedCount) {
            console.log(`  ✅ ALT está pronta!`);
            return lookupTableAccount.value;
          }
        }
      } catch (error) {
        console.log(`  ⚠️ Erro ao verificar ALT: ${error.message}`);
      }
      
      if (i < maxAttempts - 1) {
        await sleep(3000);
      }
    }
    
    try {
      const finalCheck = await connection.getAddressLookupTable(lookupTableAddress);
      if (finalCheck.value && finalCheck.value.state.addresses.length > 0) {
        console.log(`  ⚠️ Retornando ALT com ${finalCheck.value.state.addresses.length} endereços (esperados ${expectedCount})`);
        return finalCheck.value;
      }
    } catch (e) {}
    
    throw new Error(`ALT não ficou pronta após ${maxAttempts} tentativas`);
  }
  
  // Função para criar e popular ALT com retry robusto
  async function createAndPopulateLookupTable(connection, wallet, addresses) {
    console.log("\n🏗️ CRIANDO E POPULANDO ADDRESS LOOKUP TABLE...");
    console.log(`📊 Total de endereços únicos para adicionar: ${addresses.length}`);
    
    try {
      const slot = await connection.getSlot('confirmed');
      console.log(`📍 Slot atual: ${slot}`);
      
      const [createInstruction, lookupTableAddress] = AddressLookupTableProgram.createLookupTable({
        authority: wallet.publicKey,
        payer: wallet.publicKey,
        recentSlot: slot,
      });
      
      console.log(`🔑 Endereço da ALT: ${lookupTableAddress.toString()}`);
      
      const createTableTx = new Transaction().add(createInstruction);
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      createTableTx.recentBlockhash = blockhash;
      createTableTx.feePayer = wallet.publicKey;
      
      const signedCreateTx = await wallet.signTransaction(createTableTx);
      const createTxId = await connection.sendRawTransaction(signedCreateTx.serialize(), {
        skipPreflight: false,
        maxRetries: 5,
      });
      
      console.log(`✅ Transação de criação enviada: ${createTxId}`);
      console.log(`🔍 Explorer: https://explorer.solana.com/tx/${createTxId}?cluster=devnet`);
      
      console.log("⏳ Aguardando confirmação da criação...");
      await connection.confirmTransaction(createTxId, 'confirmed');
      console.log("✅ ALT criada com sucesso!");
      
      await sleep(3000);
      
      const BATCH_SIZE = 20;
      const extendTxIds = [];
      
      console.log(`\n📝 Adicionando ${addresses.length} endereços em lotes de ${BATCH_SIZE}...`);
      
      for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
        const batch = addresses.slice(i, i + BATCH_SIZE);
        const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(addresses.length / BATCH_SIZE);
        
        console.log(`\n📦 Processando lote ${batchIndex}/${totalBatches} (${batch.length} endereços)...`);
        
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
            
            console.log(`  ✅ Transação do lote ${batchIndex} enviada: ${extendTxId}`);
            extendTxIds.push(extendTxId);
            
            await connection.confirmTransaction(extendTxId, 'processed');
            break;
          } catch (error) {
            retries--;
            if (retries > 0) {
              console.log(`  ⚠️ Erro no lote ${batchIndex}, tentando novamente...`);
              await sleep(2000);
            } else {
              throw error;
            }
          }
        }
        
        if (i + BATCH_SIZE < addresses.length) {
          await sleep(2000);
        }
      }
      
      const lookupTableAccount = await waitForALT(connection, lookupTableAddress, addresses.length);
      
      console.log(`🎉 ALT criada e populada com sucesso!`);
      
      return {
        lookupTableAddress,
        lookupTableAccount,
        createTxId,
        extendTxIds,
      };
      
    } catch (error) {
      console.error("❌ Erro ao criar/popular ALT:", error);
      throw error;
    }
  }
  
  // Função para coletar TODOS os endereços necessários para ALT
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
    console.log("\n📋 COLETANDO TODOS OS ENDEREÇOS PARA ALT...");
    
    const allAddresses = new Set();
    
    console.log("  ➕ Contas principais da instrução...");
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
    
    console.log(`  ➕ Adicionando ${remainingAccounts.length} remaining accounts...`);
    remainingAccounts.forEach(acc => {
      if (acc && acc.pubkey) {
        allAddresses.add(acc.pubkey.toString());
      }
    });
    
    const uniqueAddresses = Array.from(allAddresses).map(addr => new PublicKey(addr));
    
    console.log(`  📊 Total de endereços únicos coletados: ${uniqueAddresses.length}`);
    
    return uniqueAddresses;
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
    
    const instructions = [];
    
    instructions.push(ComputeBudgetProgram.setComputeUnitLimit({
      units: 200_000
    }));
    
    instructions.push(ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 50000
    }));
    
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
      
      console.log("📤 Enviando transação de registro no airdrop...");
      const txid = await connection.sendTransaction(transaction, {
        skipPreflight: true,
        maxRetries: 3
      });
      
      console.log(`✅ Transação enviada: ${txid}`);
      console.log(`🔍 Explorer: https://explorer.solana.com/tx/${txid}?cluster=devnet`);
      
      await connection.confirmTransaction({
        signature: txid,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');
      
      console.log("✅ Registro no airdrop confirmado!");
      await sleep(2000);
      
      return await isUserRegisteredInAirdrop(connection, walletKeypair.publicKey);
    } catch (error) {
      console.error("❌ Erro ao registrar no airdrop:", error.message);
      return false;
    }
  }
  
  // Função para preparar contas do airdrop
  async function prepareAirdropAccounts(connection, referrerAddress) {
    console.log("\n🪂 PREPARANDO CONTAS DO PROGRAMA DE AIRDROP...");
    
    const [programStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("program_state", "utf8")],
      VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
    );
    console.log(`  📝 Program State PDA: ${programStatePda.toString()}`);
    
    const stateAccountInfo = await connection.getAccountInfo(programStatePda);
    if (!stateAccountInfo) {
      throw new Error("Estado do programa de airdrop não encontrado");
    }
    
    const [userAccountPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_account", "utf8"), referrerAddress.toBuffer()],
      VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
    );
    console.log(`  👤 User Account PDA: ${userAccountPda.toString()}`);
    
    // IMPORTANTE: Ler a semana atual do estado do programa
    let currentWeek = 1;
    if (stateAccountInfo && stateAccountInfo.data.length >= 73) {
      currentWeek = stateAccountInfo.data[72];
      console.log(`  📅 Semana atual do airdrop: ${currentWeek}`);
    }
    
    // Derivar PDAs das semanas atual e próxima DINAMICAMENTE
    const [currentWeekDataPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("weekly_data", "utf8"), Buffer.from([currentWeek])],
      VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
    );
    console.log(`  📊 Current Week Data PDA (semana ${currentWeek}): ${currentWeekDataPda.toString()}`);
    
    const nextWeek = Math.min(currentWeek + 1, 36); // Máximo 36 semanas
    const [nextWeekDataPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("weekly_data", "utf8"), Buffer.from([nextWeek])],
      VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
    );
    console.log(`  📊 Next Week Data PDA (semana ${nextWeek}): ${nextWeekDataPda.toString()}`);
    
    return {
      programStatePda,
      userAccountPda,
      currentWeekDataPda,
      nextWeekDataPda,
      currentWeek,
    };
  }
  
  // Função melhorada para confirmar transação
  async function confirmTransactionWithRetry(connection, signature, maxRetries = 30) {
    console.log("\n⏳ Aguardando confirmação da transação...");
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        const statuses = await connection.getSignatureStatuses([signature]);
        if (statuses && statuses.value && statuses.value[0]) {
          const status = statuses.value[0];
          
          if (status.err) {
            console.error("\n❌ Transação falhou:", status.err);
            
            try {
              const tx = await connection.getTransaction(signature, {
                maxSupportedTransactionVersion: 0
              });
              if (tx && tx.meta && tx.meta.logMessages) {
                console.log("\n📋 Logs da transação:");
                tx.meta.logMessages.forEach((log, idx) => console.log(`${idx}: ${log}`));
              }
            } catch (e) {}
            
            throw new Error(`Transação falhou: ${JSON.stringify(status.err)}`);
          }
          
          if (status.confirmationStatus === 'confirmed' || 
              status.confirmationStatus === 'finalized') {
            console.log(`✅ Transação confirmada com status: ${status.confirmationStatus}`);
            return true;
          }
        }
        
        const tx = await connection.getTransaction(signature, {
          maxSupportedTransactionVersion: 0,
          commitment: 'confirmed'
        });
        
        if (tx) {
          if (tx.meta && tx.meta.err) {
            console.error("\n❌ Transação falhou:", tx.meta.err);
            throw new Error(`Transação falhou: ${JSON.stringify(tx.meta.err)}`);
          }
          console.log("✅ Transação confirmada!");
          return true;
        }
        
      } catch (error) {
        if (error.message && error.message.includes('Transação falhou')) {
          throw error;
        }
      }
      
      console.log(`  🔍 Verificando status (${i + 1}/${maxRetries})...`);
      await sleep(3000);
    }
    
    throw new Error('Timeout na confirmação da transação');
  }
  
  // Função principal
  async function main() {
    console.log("\n🚀 REGISTER V15 - VERSÃO FINAL COM VERIFICAÇÃO DE AIRDROP 🚀");
    console.log("============================================================");
    console.log("📌 Principais recursos:");
    console.log("  ✅ Verifica se airdrop está ativo antes de registrar");
    console.log("  ✅ Sempre envia PDAs reais para manter estrutura");
    console.log("  ✅ Contrato verifica airdrop_active antes de processar");
    console.log("  ✅ Sistema continua funcionando após fim do airdrop");
    console.log("============================================================");
    
    const args = process.argv.slice(2);
    
    if (args.length < 3) {
      console.error("\n❌ ERRO: Argumentos insuficientes!");
      console.log("\n📖 USO:");
      console.log("node register-v15.js <carteira> <config> <referenciador> [deposito]");
      console.log("\nEXEMPLO:");
      console.log("node register-v15.js wallet.json config.json 5azaX9wJta8Z1gH3akQNPNZUKMXLGkYCmTqYK6gLpHb1 0.1");
      process.exit(1);
    }
    
    const walletPath = args[0];
    const configPath = args[1];
    const referrerAddressStr = args[2];
    const depositAmountStr = args[3] || '0.1';
    
    console.log("\n📋 CONFIGURAÇÃO:");
    console.log(`  Carteira: ${walletPath}`);
    console.log(`  Config: ${configPath}`);
    console.log(`  Referenciador: ${referrerAddressStr}`);
    console.log(`  Depósito: ${depositAmountStr} SOL`);
    
    try {
      // Validações
      const referrerAddress = new PublicKey(referrerAddressStr);
      const depositAmount = Math.floor(parseFloat(depositAmountStr) * 1e9);
      
      if (depositAmount <= 0) {
        throw new Error("Valor de depósito inválido");
      }
      
      // Carregar carteira e configurações
      console.log(`\nCarregando carteira de ${walletPath}...`);
      const walletKeypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, 'utf8')))
      );
      
      const idl = require('./target/idl/referral_system.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      // Conectar
      const connection = new Connection('https://api.devnet.solana.com', {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 120000,
      });
      console.log('Conectando à Devnet com timeout estendido (120s)');
      
      const MATRIX_PROGRAM_ID = new PublicKey(config.programId);
      const STATE_ADDRESS = new PublicKey(config.stateAddress);
      
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
      
      if (balance < depositAmount + 50_000_000) {
        console.error("❌ Saldo insuficiente!");
        process.exit(1);
      }
      
      // NOVA VERIFICAÇÃO: Status do airdrop
      const airdropActive = await isAirdropActive(connection);
      
      // Verificar referenciador
      console.log("\n🔍 VERIFICANDO REFERENCIADOR...");
      const [referrerPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("user_account"), referrerAddress.toBuffer()],
        MATRIX_PROGRAM_ID
      );
      
      const referrerInfo = await program.account.userAccount.fetch(referrerPDA);
      if (!referrerInfo.isRegistered) {
        console.error("❌ Referenciador não está registrado!");
        process.exit(1);
      }
      
      console.log("✅ Referenciador verificado");
      console.log("📊 Slots: " + referrerInfo.chain.filledSlots + "/3");
      
      const slotIndex = referrerInfo.chain.filledSlots;
      const isSlot3 = slotIndex === 2;
      
      console.log("\n🎯 VOCÊ PREENCHERÁ O SLOT " + (slotIndex + 1));
      
      if (slotIndex === 0) {
        console.log("💱 Slot 1: Swap SOL → DONUT e burn de 100%");
      } else if (slotIndex === 1) {
        console.log("💰 Slot 2: Reserva SOL para o referenciador");
      } else if (slotIndex === 2) {
        console.log("🔄 Slot 3: Paga SOL reservado e processa recursão");
        
        // MODIFICADO: Só verifica registro no airdrop se estiver ativo
        if (airdropActive && !await isUserRegisteredInAirdrop(connection, referrerAddress)) {
          console.log("\n⚠️ ATENÇÃO: O referenciador não está registrado no programa de airdrop!");
          console.log("❌ Não será possível completar a matriz sem registro no airdrop.");
          process.exit(1);
        } else if (!airdropActive) {
          console.log("📴 Airdrop finalizado - pulando verificação de registro do referenciador");
        }
      }
      
      // Verificar se usuário já está registrado
      const [userPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("user_account"), walletKeypair.publicKey.toBuffer()],
        MATRIX_PROGRAM_ID
      );
      
      try {
        const userInfo = await program.account.userAccount.fetch(userPDA);
        if (userInfo.isRegistered) {
          console.log("\n⚠️ VOCÊ JÁ ESTÁ REGISTRADO!");
          console.log("📋 Suas informações de registro:");
          console.log("  👥 Referenciador: " + userInfo.referrer.toString());
          console.log("  🔢 Profundidade: " + userInfo.upline.depth);
          console.log("  📊 ID da cadeia: " + userInfo.chain.id);
          console.log("  🎯 Seus slots preenchidos: " + userInfo.chain.filledSlots + "/3");
          
          if (userInfo.chain.filledSlots < 3) {
            console.log("\n💡 Você ainda pode receber " + (3 - userInfo.chain.filledSlots) + " referências!");
          } else {
            console.log("\n✅ Sua matriz está completa!");
          }
          
          process.exit(0);
        }
      } catch {
        console.log("✅ Usuário não registrado, prosseguindo...");
      }
      
      // MODIFICADO: Registrar no airdrop apenas se estiver ativo
      if (airdropActive) {
        if (!await isUserRegisteredInAirdrop(connection, walletKeypair.publicKey)) {
          const registered = await registerUserInAirdrop(connection, walletKeypair);
          if (!registered) {
            console.log("❌ Falha ao registrar no airdrop");
            process.exit(1);
          }
        } else {
          console.log("✅ Usuário já registrado no airdrop");
        }
      } else {
        console.log("📴 Airdrop finalizado - pulando registro no airdrop");
      }
      
      // Derivar PDAs
      console.log("\n🔧 DERIVANDO PDAs...");
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
      console.log(wsolInfo ? "✅ WSOL ATA existe" : "⚠️ WSOL ATA não existe - será criada");
      console.log(donutInfo ? "✅ DONUT ATA existe" : "⚠️ DONUT ATA não existe - será criada");
      
      // Preparar uplines e contas do airdrop se for slot 3
      let uplineAccounts = [];
      let airdropInfo = null;
      
      if (isSlot3) {
        console.log("\n🔄 SLOT 3 DETECTADO - Preparando recursividade...");
        
        // Verificar se é usuário base
        const isBaseUser = !referrerInfo.referrer || referrerInfo.referrer.toString() === SystemProgram.programId.toString();
        console.log(`\n🔍 Tipo de usuário: ${isBaseUser ? 'BASE' : 'NÃO-BASE'}`);
        
        // Usar uplines do referrerInfo
        if (referrerInfo.upline?.upline?.length > 0) {
          console.log(`\n📊 Uplines encontrados no referrer: ${referrerInfo.upline.upline.length}`);
          const uplines = referrerInfo.upline.upline.map(entry => entry.pda);
          uplineAccounts = [];
          
          for (let i = 0; i < Math.min(uplines.length, 6); i++) {
            const uplinePDA = uplines[i];
            console.log(`\n  🔍 Analisando upline ${i + 1}: ${uplinePDA.toString()}`);
            
            try {
              const uplineInfo = await program.account.userAccount.fetch(uplinePDA);
              
              if (!uplineInfo.isRegistered) {
                console.log(`  ❌ Upline não está registrado! Ignorando.`);
                continue;
              }
              
              if (uplineInfo.ownerWallet) {
                const uplineWallet = uplineInfo.ownerWallet;
                console.log(`  ✅ Wallet: ${uplineWallet.toString()}`);
                console.log(`  📊 Slots preenchidos: ${uplineInfo.chain.filledSlots}/3`);
                
                // MODIFICADO: Só verifica registro no airdrop se estiver ativo
                if (airdropActive && !await isUserRegisteredInAirdrop(connection, uplineWallet)) {
                  console.log(`  ❌ Upline não registrado no airdrop!`);
                  continue;
                } else if (!airdropActive) {
                  console.log(`  📴 Airdrop finalizado - pulando verificação de registro`);
                }
                
                if (airdropActive) {
                  console.log(`  ✅ Upline registrado no airdrop`);
                }
                
                // Adicionar par: PDA primeiro, wallet depois
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
              console.log(`  ❌ Erro ao analisar upline: ${e.message}`);
            }
          }
          
          console.log(`\n✅ Total de uplines válidos: ${uplineAccounts.length / 2}`);
          
          if (uplineAccounts.length % 2 !== 0) {
            console.error("\n❌ ERRO CRÍTICO: uplineAccounts tem número ímpar de elementos!");
            process.exit(1);
          }
        } else {
          console.log("\n📊 Nenhum upline encontrado no referrer");
        }
        
        // SEMPRE preparar contas do airdrop para manter estrutura
        console.log("\n🪂 Preparando contas do airdrop (obrigatório para manter estrutura)...");
        try {
          airdropInfo = await prepareAirdropAccounts(connection, referrerAddress);
        } catch (error) {
          console.log("⚠️ Erro ao preparar contas do airdrop:", error.message);
          console.log("📝 Criando estrutura mínima de fallback...");
          
          // Criar estrutura mínima se falhar
          const [programStatePda] = PublicKey.findProgramAddressSync(
            [Buffer.from("program_state", "utf8")],
            VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
          );
          
          const [userAccountPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("user_account", "utf8"), referrerAddress.toBuffer()],
            VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
          );
          
          // Usar semana 36 como padrão se não conseguir ler
          const [currentWeekDataPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("weekly_data", "utf8"), Buffer.from([36])],
            VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
          );
          
          const [nextWeekDataPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("weekly_data", "utf8"), Buffer.from([36])],
            VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
          );
          
          airdropInfo = {
            programStatePda,
            userAccountPda,
            currentWeekDataPda,
            nextWeekDataPda,
            currentWeek: 36,
          };
        }
      }
      
      // Construir remaining accounts
      console.log("\n🔄 CONSTRUINDO REMAINING ACCOUNTS...");
      
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
      
      let mainRemainingAccounts = [...vaultAAccounts, ...chainlinkAccounts];
      
      // CORREÇÃO: SEMPRE adicionar a PDA do referrer no airdrop, independente do slot
      const [referrerAirdropPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("user_account"), referrerAddress.toBuffer()],
        VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
      );
      
      console.log(`  ➕ Adicionando PDA do referrer no airdrop: ${referrerAirdropPDA.toString()}`);
      mainRemainingAccounts.push({
        pubkey: referrerAirdropPDA,
        isWritable: false,
        isSigner: false
      });
      
      // SEMPRE adicionar contas do airdrop no slot 3 para manter estrutura
      if (isSlot3 && airdropInfo) {
        console.log("  ➕ Adicionando contas do airdrop (obrigatório para estrutura)...");
        
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
        
        if (!airdropActive) {
          console.log("  📴 Airdrop finalizado - PDAs enviadas apenas para manter estrutura");
          console.log("  ℹ️ O contrato detectará airdrop_active=false e pulará notificações");
        } else {
          console.log(`  ✅ Usando semana atual: ${airdropInfo.currentWeek} e próxima: ${Math.min(airdropInfo.currentWeek + 1, 36)}`);
        }
        
        // Adicionar PDAs do airdrop dos uplines ANTES dos pares
        if (uplineAccounts.length > 0) {
          console.log("  ➕ Adicionando PDAs do airdrop dos uplines...");
          
          const uplineAirdropPDAs = [];
          for (let i = 0; i < uplineAccounts.length; i += 2) {
            if (i + 1 < uplineAccounts.length) {
              const uplineWallet = uplineAccounts[i + 1].pubkey;
              
              const [uplineAirdropPDA] = PublicKey.findProgramAddressSync(
                [Buffer.from("user_account", "utf8"), uplineWallet.toBuffer()],
                VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
              );
              
              uplineAirdropPDAs.push({
                pubkey: uplineAirdropPDA,
                isWritable: true,
                isSigner: false,
              });
              
              console.log(`    PDA Airdrop ${(i/2)+1}: ${uplineAirdropPDA.toString()}`);
            }
          }
          
          // Adicionar primeiro as PDAs do airdrop, depois os pares de uplines
          mainRemainingAccounts = [...mainRemainingAccounts, ...uplineAirdropPDAs, ...uplineAccounts];
          
          console.log(`  ➕ Adicionadas ${uplineAirdropPDAs.length} PDAs do airdrop dos uplines`);
          console.log(`  ➕ Adicionados ${uplineAccounts.length} contas de uplines (${uplineAccounts.length/2} pares)`);
        }
      }
      
      console.log(`  📊 Total de remaining accounts: ${mainRemainingAccounts.length}`);
      
      // DEBUG: Estrutura detalhada dos remaining accounts
      console.log("\n🔍 ESTRUTURA DOS REMAINING ACCOUNTS:");
      console.log(`  [0-3]: Vault A (4 contas)`);
      console.log(`  [4-5]: Chainlink (2 contas)`);
      console.log(`  [6]: PDA do referrer no airdrop - SEMPRE PRESENTE`);
      
      if (isSlot3) {
        console.log(`  [7-13]: Airdrop base (7 contas) - APENAS SLOT 3`);
        console.log(`    [7] program_state`);
        console.log(`    [8] user_account (referrer no airdrop)`);
        console.log(`    [9] current_week_data`);
        console.log(`    [10] next_week_data`);
        console.log(`    [11] referrer_wallet`);
        console.log(`    [12] airdrop_program`);
        console.log(`    [13] instructions_sysvar`);
        
        if (uplineAccounts.length > 0) {
          const uplineAirdropCount = uplineAccounts.length / 2;
          console.log(`  [14-${13 + uplineAirdropCount}]: Upline Airdrop PDAs (${uplineAirdropCount} contas)`);
          const uplineStart = 14 + uplineAirdropCount;
          console.log(`  [${uplineStart}+]: Upline pairs (${uplineAccounts.length} contas = ${uplineAccounts.length/2} pares)`);
        }
      }
      
      console.log(`\n  📊 Total: ${mainRemainingAccounts.length} contas`);
      
      // Verificar cache de ALT
      console.log("\n🔍 Verificando cache de ALT...");
      
      let lookupTableAddress;
      let lookupTableAccount;
      let altExists = false;
      
      const altCacheFile = `.alt-cache-${walletKeypair.publicKey.toString().slice(0, 8)}.json`;
      
      try {
        if (fs.existsSync(altCacheFile)) {
          const altCache = JSON.parse(fs.readFileSync(altCacheFile, 'utf8'));
          console.log(`📂 ALT em cache encontrada: ${altCache.address}`);
          
          lookupTableAddress = new PublicKey(altCache.address);
          const altAccountInfo = await connection.getAddressLookupTable(lookupTableAddress);
          
          if (altAccountInfo && altAccountInfo.value) {
            console.log(`✅ ALT existe com ${altAccountInfo.value.state.addresses.length} endereços`);
            lookupTableAccount = altAccountInfo.value;
            altExists = true;
          }
        }
      } catch (e) {
        console.log("📂 Nenhuma ALT em cache encontrada");
      }
      
      // Criar ALT apenas se necessário
      if (!altExists) {
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
        
        const { lookupTableAddress: newAltAddress, lookupTableAccount: newAltAccount } = await createAndPopulateLookupTable(
          connection,
          anchorWallet,
          allAddresses
        );
        
        lookupTableAddress = newAltAddress;
        lookupTableAccount = newAltAccount;
        
        try {
          fs.writeFileSync(altCacheFile, JSON.stringify({
            address: lookupTableAddress.toString(),
            created: new Date().toISOString(),
            addressCount: allAddresses.length
          }));
          console.log(`💾 ALT cacheada em ${altCacheFile}`);
        } catch (e) {
          console.log("⚠️ Não foi possível cachear ALT");
        }
      } else {
        console.log("🔄 Reutilizando ALT existente!");
      }
      
      console.log("\n⏳ Aguardando propagação da ALT...");
      await sleep(5000);
      
      // Preparar instruções
      console.log("\n📤 PREPARANDO TRANSAÇÃO PRINCIPAL...");
      
      const instructions = [];
      
      // Compute budget
      const computeUnits = isSlot3 ? 1_400_000 : 1_000_000;
      instructions.push(ComputeBudgetProgram.setComputeUnitLimit({
        units: computeUnits
      }));
      
      instructions.push(ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 250000
      }));
      
      // Criar ATAs se necessário
      if (!wsolInfo) {
        console.log("  ➕ Adicionando instrução para criar WSOL ATA");
        instructions.push(createATAInstruction(
          walletKeypair.publicKey,
          userWsolAccount,
          walletKeypair.publicKey,
          VERIFIED_ADDRESSES.WSOL_MINT
        ));
      }
      
      if (!donutInfo) {
        console.log("  ➕ Adicionando instrução para criar DONUT ATA");
        instructions.push(createATAInstruction(
          walletKeypair.publicKey,
          userDonutAccount,
          walletKeypair.publicKey,
          VERIFIED_ADDRESSES.TOKEN_MINT
        ));
      }
      
      // Criar instrução de registro
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
      
      console.log(`📦 Total de instruções: ${instructions.length}`);
      console.log(`🔑 ALT: ${lookupTableAddress.toString()}`);
      console.log(`📊 ALT tem ${lookupTableAccount.state.addresses.length} endereços`);
      
      // Criar mensagem V0 com ALT
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      
      const messageV0 = new TransactionMessage({
        payerKey: walletKeypair.publicKey,
        recentBlockhash: blockhash,
        instructions
      }).compileToV0Message([lookupTableAccount]);
      
      const transaction = new VersionedTransaction(messageV0);
      transaction.sign([walletKeypair]);
      
      console.log("✅ Transação preparada com ALT");
      
      // Verificar tamanho da transação
      const serializedSize = transaction.serialize().length;
      console.log(`📏 Tamanho da transação: ${serializedSize} bytes (máx: 1232)`);
      if (serializedSize > 1232) {
        console.error("❌ Transação muito grande!");
        process.exit(1);
      }
      
      // Enviar transação
      console.log("\n📤 ENVIANDO TRANSAÇÃO...");
      
      try {
        const signature = await connection.sendTransaction(transaction, {
          skipPreflight: true,
          maxRetries: 5,
        });
        
        console.log(`✅ Transação enviada: ${signature}`);
        console.log(`🔍 Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
        
        // Confirmar transação
        await confirmTransactionWithRetry(connection, signature);
        
        console.log("\n⏳ Aguardando 5 segundos para o estado atualizar...");
        await sleep(5000);
        
        console.log("\n🔍 VERIFICANDO RESULTADOS...");
        
        try {
          const userInfo = await program.account.userAccount.fetch(userPDA);
          console.log("\n📋 REGISTRO CONFIRMADO:");
          console.log("✅ Registrado: " + userInfo.isRegistered);
          console.log("👥 Referenciador: " + userInfo.referrer.toString());
          console.log("🔢 Profundidade: " + userInfo.upline.depth);
          console.log("📊 ID da cadeia: " + userInfo.chain.id);
          console.log("🎯 Slots preenchidos: " + userInfo.chain.filledSlots);
          
          const newBalance = await connection.getBalance(walletKeypair.publicKey);
          console.log("\n💼 Novo saldo: " + (newBalance / 1e9).toFixed(4) + " SOL");
          console.log("💸 Gasto total: " + ((balance - newBalance) / 1e9).toFixed(4) + " SOL");
          
          console.log("\n🎉 REGISTRO CONCLUÍDO COM SUCESSO! 🎉");
          console.log("🔑 ALT utilizada: " + lookupTableAddress.toString());
          console.log("📊 Otimização: economizadas 36 PDAs de semanas!");
          console.log("🚀 Transação ~64% menor!");
          if (airdropActive) {
            console.log("✅ Airdrop integrado corretamente!");
          } else {
            console.log("📴 Sistema funcionando sem airdrop (período finalizado)!");
          }
          console.log("============================================================");
        } catch (e) {
          console.log("\n✅ Transação confirmada!");
          console.log("📝 Transação: " + signature);
          console.log("\n💡 Dica: A conta pode levar alguns segundos para ser criada.");
          console.log("Verifique o explorer para mais detalhes.");
        }
        
      } catch (error) {
        console.error("\n❌ ERRO NA TRANSAÇÃO:", error.message);
        
        if (error.logs) {
          console.log("\n📋 LOGS DE ERRO:");
          error.logs.forEach((log, i) => console.log(`${i}: ${log}`));
        }
        
        process.exit(1);
      }
      
    } catch (error) {
      console.error("\n❌ ERRO:", error.message);
      if (error.stack) {
        console.error("\n📋 Stack trace:", error.stack);
      }
      process.exit(1);
    }
  }
  
  // Executar
  main().catch(console.error);