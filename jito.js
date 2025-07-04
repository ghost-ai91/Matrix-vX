// register-v12-jito.js - Versão com Jito Bundles
import { 
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
    Transaction,
    LAMPORTS_PER_SOL
  } from '@solana/web3.js';
  import pkg from '@coral-xyz/anchor';
  const { AnchorProvider, Program, BN, Wallet } = pkg;
  import { 
    searcherClient 
  } from 'jito-ts/dist/sdk/block-engine/searcher.js';
  import { Bundle } from 'jito-ts/dist/sdk/block-engine/types.js';
  import fs from 'fs';
  
  // CONFIGURAÇÕES JITO E RPC
  const RPC_ENDPOINT = "https://radial-compatible-sponge.solana-devnet.quiknode.pro/b99fae39b152f9e6ffc10816ce19a31e000df7d5/"; // QuickNode devnet
  const JITO_BLOCK_ENGINE_URL = "frankfurt.mainnet.block-engine.jito.wtf";
  const JITO_AUTH_KEYPAIR = Keypair.generate();
  const JITO_TIP_AMOUNT = 10000; // 0.00001 SOL de tip
  
  // Definir SYSVAR_INSTRUCTIONS_PUBKEY
  const SYSVAR_INSTRUCTIONS_PUBKEY = new PublicKey('Sysvar1nstructions1111111111111111111111111');
  
  // Constante para duração da semana
  const WEEK_DURATION_SECONDS = 900; // 15 minutos para teste
  
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
    AIRDROP_PROGRAM_ID: new PublicKey("DdFRHWKTEQQa8NArpm4iS2GEpNZhnEgjkVMcdGw9oNBf"),
    
    // Jito tip accounts (mudar para mainnet em produção)
    JITO_TIP_ACCOUNTS: [
      "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
      "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe", 
      "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
      "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
      "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
      "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
      "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
      "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT"
    ]
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
  
  // Função para criar instrução de tip do Jito
  function createJitoTipInstruction(from, to, amount) {
    return SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: to,
      lamports: amount,
    });
  }
  
  // Função para selecionar conta de tip aleatória
  function getRandomTipAccount() {
    const randomIndex = Math.floor(Math.random() * VERIFIED_ADDRESSES.JITO_TIP_ACCOUNTS.length);
    return new PublicKey(VERIFIED_ADDRESSES.JITO_TIP_ACCOUNTS[randomIndex]);
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
    
    throw new Error(`ALT não ficou pronta após ${maxAttempts} tentativas`);
  }
  
  // Função para criar e popular ALT
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
  
  // Função para coletar todos os endereços para ALT
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
  async function registerUserInAirdrop(connection, walletKeypair, jitoClient) {
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
    
    // Adicionar Jito tip
    const tipAccount = getRandomTipAccount();
    instructions.push(createJitoTipInstruction(
      walletKeypair.publicKey,
      tipAccount,
      JITO_TIP_AMOUNT
    ));
    
    try {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      
      const messageV0 = new TransactionMessage({
        payerKey: walletKeypair.publicKey,
        recentBlockhash: blockhash,
        instructions
      }).compileToV0Message();
      
      const transaction = new VersionedTransaction(messageV0);
      transaction.sign([walletKeypair]);
      
      // Tentar enviar via Jito primeiro
      if (jitoClient && RPC_ENDPOINT.includes('mainnet')) {
        try {
          console.log("📦 Criando bundle Jito para registro no airdrop...");
          const bundle = new Bundle([transaction], 1);
          const bundleId = await jitoClient.sendBundle(bundle);
          console.log(`✅ Bundle enviado: ${bundleId}`);
          
          await sleep(5000);
          const registered = await isUserRegisteredInAirdrop(connection, walletKeypair.publicKey);
          if (registered) {
            console.log("✅ Registro no airdrop confirmado via Jito!");
            return true;
          }
        } catch (jitoError) {
          console.log("⚠️ Jito falhou, usando RPC normal...");
        }
      }
      
      // Fallback para RPC normal
      console.log("📤 Enviando transação de registro no airdrop...");
      const txid = await connection.sendTransaction(transaction, {
        skipPreflight: true,
        maxRetries: 3
      });
      
      console.log(`✅ Transação enviada: ${txid}`);
      
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
    
    let currentWeek = 1;
    if (stateAccountInfo && stateAccountInfo.data.length >= 73) {
      currentWeek = stateAccountInfo.data[72];
      console.log(`  📅 Semana atual do airdrop: ${currentWeek}`);
    }
    
    const [currentWeekDataPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("weekly_data", "utf8"), Buffer.from([currentWeek])],
      VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
    );
    console.log(`  📊 Current Week Data PDA (semana ${currentWeek}): ${currentWeekDataPda.toString()}`);
    
    const nextWeek = Math.min(currentWeek + 1, 36);
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
  
  // Função principal
  async function main() {
    console.log("\n🚀 REGISTER V12 COM JITO BUNDLES 🚀");
    console.log("==============================================");
    console.log("📌 Principais recursos:");
    console.log("  ✅ Jito Bundles para transações atômicas");
    console.log("  ✅ Prioridade via tip system");
    console.log("  ✅ Fallback automático para RPC normal");
    console.log("  ✅ Otimização com ALT dinâmica");
    console.log("==============================================");
    
    const args = process.argv.slice(2);
    
    if (args.length < 3) {
      console.error("\n❌ ERRO: Argumentos insuficientes!");
      console.log("\n📖 USO:");
      console.log("node register-v12-jito.js <carteira> <config> <referenciador> [deposito]");
      console.log("\nEXEMPLO:");
      console.log("node register-v12-jito.js wallet.json config.json 5azaX9wJta8Z1gH3akQNPNZUKMXLGkYCmTqYK6gLpHb1 0.1");
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
    console.log(`  RPC: ${RPC_ENDPOINT}`);
    
    // Aviso sobre Jito e Devnet
    if (RPC_ENDPOINT.includes('devnet')) {
      console.log("\n⚠️  AVISO: Jito Bundles NÃO funciona na devnet!");
      console.log("   O código usará fallback para RPC normal.");
    }
    
    try {
      // Validações
      const referrerAddress = new PublicKey(referrerAddressStr);
      const depositAmount = Math.floor(parseFloat(depositAmountStr) * LAMPORTS_PER_SOL);
      
      if (depositAmount <= 0) {
        throw new Error("Valor de depósito inválido");
      }
      
      // Carregar carteira e configurações
      console.log(`\nCarregando carteira de ${walletPath}...`);
      const walletKeypair = Keypair.fromSecretKey(
        Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, 'utf8')))
      );
      
      const idl = JSON.parse(fs.readFileSync('./target/idl/referral_system.json', 'utf8'));
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      // Conectar
      const connection = new Connection(RPC_ENDPOINT, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 120000,
      });
      console.log('Conectando com timeout estendido (120s)');
      
      // Inicializar Jito Client
      let jitoClient = null;
      if (RPC_ENDPOINT.includes('mainnet')) {
        jitoClient = searcherClient(JITO_BLOCK_ENGINE_URL, JITO_AUTH_KEYPAIR);
        console.log('✅ Jito Client inicializado para mainnet');
      }
      
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
      console.log("💰 SALDO: " + (balance / LAMPORTS_PER_SOL).toFixed(4) + " SOL");
      
      const requiredBalance = depositAmount + (0.1 * LAMPORTS_PER_SOL);
      if (balance < requiredBalance) {
        console.error(`❌ Saldo insuficiente! Necessário: ${(requiredBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
        process.exit(1);
      }
      
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
        
        if (!await isUserRegisteredInAirdrop(connection, referrerAddress)) {
          console.log("\n⚠️ ATENÇÃO: O referenciador não está registrado no programa de airdrop!");
          console.log("❌ Não será possível completar a matriz sem registro no airdrop.");
          process.exit(1);
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
      
      // Registrar no airdrop se necessário
      if (!await isUserRegisteredInAirdrop(connection, walletKeypair.publicKey)) {
        const registered = await registerUserInAirdrop(connection, walletKeypair, jitoClient);
        if (!registered) {
          console.log("❌ Falha ao registrar no airdrop");
          process.exit(1);
        }
      } else {
        console.log("✅ Usuário já registrado no airdrop");
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
        
        const isBaseUser = !referrerInfo.referrer || referrerInfo.referrer.toString() === SystemProgram.programId.toString();
        console.log(`\n🔍 Tipo de usuário: ${isBaseUser ? 'BASE' : 'NÃO-BASE'}`);
        
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
                
                if (!await isUserRegisteredInAirdrop(connection, uplineWallet)) {
                  console.log(`  ❌ Upline não registrado no airdrop!`);
                  continue;
                }
                
                console.log(`  ✅ Upline registrado no airdrop`);
                
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
        }
        
        airdropInfo = await prepareAirdropAccounts(connection, referrerAddress);
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
      
      if (isSlot3 && airdropInfo) {
        console.log("  ➕ Adicionando contas do airdrop...");
        
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
        
        console.log(`  ✅ Usando semana atual: ${airdropInfo.currentWeek} e próxima: ${Math.min(airdropInfo.currentWeek + 1, 36)}`);
        
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
            }
          }
          
          mainRemainingAccounts = [...mainRemainingAccounts, ...uplineAirdropPDAs, ...uplineAccounts];
        }
      }
      
      console.log(`  📊 Total de remaining accounts: ${mainRemainingAccounts.length}`);
      
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
      
      // Adicionar Jito tip
      if (jitoClient && RPC_ENDPOINT.includes('mainnet')) {
        const tipAccount = getRandomTipAccount();
        instructions.push(createJitoTipInstruction(
          walletKeypair.publicKey,
          tipAccount,
          JITO_TIP_AMOUNT
        ));
        console.log(`  ➕ Adicionando Jito tip de ${JITO_TIP_AMOUNT / LAMPORTS_PER_SOL} SOL`);
      }
      
      console.log(`📦 Total de instruções: ${instructions.length}`);
      console.log(`🔑 ALT: ${lookupTableAddress.toString()}`);
      
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
      
      let signature;
      let useJito = false;
      
      // Tentar enviar via Jito se estiver na mainnet
      if (jitoClient && RPC_ENDPOINT.includes('mainnet')) {
        try {
          console.log("📦 Criando Jito Bundle...");
          const bundle = new Bundle([transaction], 1);
          const bundleId = await jitoClient.sendBundle(bundle);
          console.log(`✅ Bundle enviado para Jito! ID: ${bundleId}`);
          
          // Aguardar confirmação do bundle
          console.log("⏳ Aguardando confirmação do bundle...");
          const result = await jitoClient.confirmBundle(bundleId, {
            commitment: 'confirmed',
            timeout: 30000
          });
          
          if (result && result.status === 'landed') {
            console.log("✅ Bundle confirmado pelo Jito!");
            useJito = true;
            signature = bundleId; // Usar bundleId como referência
          } else {
            throw new Error("Bundle não foi confirmado");
          }
        } catch (jitoError) {
          console.log("⚠️ Jito falhou:", jitoError.message);
          console.log("📡 Enviando via RPC normal...");
        }
      }
      
      // Fallback para RPC normal se Jito falhar ou não estiver disponível
      if (!useJito) {
        try {
          signature = await connection.sendTransaction(transaction, {
            skipPreflight: true,
            maxRetries: 5,
          });
          
          console.log(`✅ Transação enviada: ${signature}`);
          console.log(`🔍 Explorer: https://explorer.solana.com/tx/${signature}?cluster=${RPC_ENDPOINT.includes('devnet') ? 'devnet' : 'mainnet-beta'}`);
          
          // Confirmar transação
          console.log("\n⏳ Aguardando confirmação da transação...");
          const { blockhash: confirmBlockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
          
          await connection.confirmTransaction({
            signature,
            blockhash: confirmBlockhash,
            lastValidBlockHeight
          }, 'confirmed');
          
          console.log("✅ Transação confirmada!");
        } catch (sendError) {
          console.error("❌ Erro ao enviar transação:", sendError.message);
          process.exit(1);
        }
      }
      
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
        console.log("\n💼 Novo saldo: " + (newBalance / LAMPORTS_PER_SOL).toFixed(4) + " SOL");
        console.log("💸 Gasto total: " + ((balance - newBalance) / LAMPORTS_PER_SOL).toFixed(4) + " SOL");
        
        console.log("\n🎉 REGISTRO CONCLUÍDO COM SUCESSO! 🎉");
        if (useJito) {
          console.log("🚀 Transação processada via Jito Bundles!");
        }
        console.log("🔑 ALT utilizada: " + lookupTableAddress.toString());
        console.log("==============================================");
      } catch (e) {
        console.log("\n✅ Transação confirmada!");
        if (signature) {
          console.log("📝 Transação: " + signature);
        }
        console.log("\n💡 Dica: A conta pode levar alguns segundos para ser criada.");
        console.log("Verifique o explorer para mais detalhes.");
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