// register-v6.js - Versão Corrigida com Ordem Correta dos Remaining Accounts
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
  
  // Definir SYSVAR_INSTRUCTIONS_PUBKEY
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
    AIRDROP_PROGRAM_ID: new PublicKey("9T39G2WmdazRdK4sE6jif7CwvUPUBbCtMaXDkCku7b3z"),
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
  
  // Função para obter ALT
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
          console.log("⚠️ Transação confirmada, mas conta não encontrada.");
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
    console.log("\n🪂 PREPARANDO CONTAS DO PROGRAMA DE AIRDROP...");
    
    const [programStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("program_state", "utf8")],
      VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
    );
    console.log(`  📝 Program State PDA: ${programStatePda.toString()}`);
    
    const stateAccountInfo = await connection.getAccountInfo(programStatePda);
    if (!stateAccountInfo) {
      console.log(`  ❌ Estado do programa não encontrado!`);
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
      throw new Error("Referenciador não registrado no airdrop");
    }
    
    let currentWeek = 1;
    if (stateAccountInfo && stateAccountInfo.data.length >= 73) {
      currentWeek = stateAccountInfo.data[72];
      console.log(`  📅 Semana atual: ${currentWeek}`);
    }
    
    const [currentWeekDataPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("weekly_data", "utf8"), Buffer.from([currentWeek])],
      VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
    );
    console.log(`  📊 Current Week Data PDA: ${currentWeekDataPda.toString()}`);
    
    const currentWeekDataInfo = await connection.getAccountInfo(currentWeekDataPda);
    if (!currentWeekDataInfo) {
      console.log(`  ⚠️ Dados da semana atual não encontrados.`);
    }
    
    const [nextWeekDataPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("weekly_data", "utf8"), Buffer.from([currentWeek + 1])],
      VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
    );
    console.log(`  📊 Next Week Data PDA: ${nextWeekDataPda.toString()}`);
    
    const nextWeekDataInfo = await connection.getAccountInfo(nextWeekDataPda);
    if (!nextWeekDataInfo) {
      console.log(`  ⚠️ Dados da próxima semana não encontrados.`);
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
  
  // Função principal
  async function main() {
    console.log("\n🚀 REGISTER V6 - VERSÃO CORRIGIDA 🚀");
    console.log("=====================================");
    
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
          console.log("\n❌ Falha ao registrar no airdrop.");
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
      let airdropBaseAccounts = [];
      let additionalAirdropPDAs = [];
      const isSlot3 = referrerInfo.chain.filledSlots === 2;
      
      if (isSlot3) {
        console.log("\n🔄 SLOT 3 DETECTADO - Preparando recursividade...");
        
        // PRIMEIRO: Coletar TODAS as PDAs do airdrop necessárias
        console.log("\n📊 COLETANDO PDAs DO AIRDROP DOS UPLINES:");
        
        // Mapa para armazenar wallet -> PDA airdrop
        const airdropPDAMap = new Map();
        
        if (referrerInfo.upline?.upline?.length > 0) {
          const uplineEntries = referrerInfo.upline.upline;
          
          // 1. Coletar TODAS as PDAs do airdrop primeiro
          for (let i = 0; i < uplineEntries.length; i++) {
            const uplineEntry = uplineEntries[i];
            const uplineWallet = uplineEntry.wallet;
            
            const [uplineAirdropPDA] = PublicKey.findProgramAddressSync(
              [Buffer.from("user_account", "utf8"), uplineWallet.toBuffer()],
              VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID
            );
            
            console.log(`\n  Upline ${i} - ${uplineWallet}:`);
            console.log(`    PDA Airdrop: ${uplineAirdropPDA}`);
            
            // Verificar se existe
            try {
              const airdropAccountInfo = await connection.getAccountInfo(uplineAirdropPDA);
              if (airdropAccountInfo && airdropAccountInfo.owner.equals(VERIFIED_ADDRESSES.AIRDROP_PROGRAM_ID)) {
                console.log(`    ✅ Existe no airdrop`);
                airdropPDAMap.set(uplineWallet.toString(), uplineAirdropPDA);
              } else {
                console.log(`    ❌ Não existe no airdrop`);
              }
            } catch (e) {
              console.log(`    ⚠️ Erro ao verificar: ${e.message}`);
            }
          }
          
          // 2. Processar uplines para a matriz (limitado a 6)
          console.log("\n📊 PROCESSANDO UPLINES PARA MATRIZ:");
          
          for (let i = 0; i < Math.min(uplineEntries.length, 6); i++) {
            const uplineEntry = uplineEntries[i];
            const uplinePDA = uplineEntry.pda;
            const uplineWallet = uplineEntry.wallet;
            
            console.log(`\n  Upline ${i}:`);
            console.log(`    PDA Matriz: ${uplinePDA}`);
            console.log(`    Wallet: ${uplineWallet}`);
            
            try {
              const uplineInfo = await program.account.userAccount.fetch(uplinePDA);
              
              if (!uplineInfo.isRegistered) {
                console.log(`    ❌ Não registrado na matriz`);
                continue;
              }
              
              console.log(`    ✅ Registrado - slots: ${uplineInfo.chain.filledSlots}/3`);
              
              // Adicionar contas do upline para a matriz
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
              
            } catch (e) {
              console.log(`    ❌ Erro: ${e.message}`);
            }
          }
          
          console.log(`\n  ✅ Total de uplines para matriz: ${uplineAccounts.length / 2}`);
        } else {
          console.log("ℹ️ Não há uplines para processar (usuário base)");
        }
        
        // 3. Preparar contas BASE do programa de airdrop
        const airdropInfo = await prepareAirdropAccounts(connection, referrerAddress);
        
        // Montar as 7 contas base do airdrop
        airdropBaseAccounts = [
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
        
        // 4. Preparar PDAs adicionais do airdrop dos uplines
        airdropPDAMap.forEach((pda, wallet) => {
          additionalAirdropPDAs.push({
            pubkey: pda,
            isWritable: true,
            isSigner: false,
          });
        });
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
      
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      
      const instructions = [];
      
      const computeUnits = isSlot3 ? 1_000_000 : 1_400_000;
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
      
      // Construir remaining accounts NA ORDEM CORRETA
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
      
      // ORDEM CORRETA DOS REMAINING ACCOUNTS (conforme esperado pelo contrato):
      // 1. Vault A (4 contas)
      // 2. Chainlink (2 contas)
      // 3. Airdrop base (7 contas) - apenas slot 3
      // 4. Uplines da matriz (pares) - apenas slot 3
      // 5. PDAs adicionais do airdrop - apenas slot 3
      
      let mainRemainingAccounts = [...vaultAAccounts, ...chainlinkAccounts];
      
      if (isSlot3) {
        console.log("\n🔄 MONTANDO REMAINING ACCOUNTS NA ORDEM CORRETA:");
        
        // Adicionar as 7 contas base do airdrop
        mainRemainingAccounts = [...mainRemainingAccounts, ...airdropBaseAccounts];
        console.log(`  ✅ Adicionadas 7 contas base do airdrop`);
        
        // Adicionar uplines da matriz
        mainRemainingAccounts = [...mainRemainingAccounts, ...uplineAccounts];
        console.log(`  ✅ Adicionados ${uplineAccounts.length} contas de uplines (${uplineAccounts.length / 2} pares)`);
        
        // Adicionar PDAs adicionais do airdrop DEPOIS dos uplines
        mainRemainingAccounts = [...mainRemainingAccounts, ...additionalAirdropPDAs];
        console.log(`  ✅ Adicionadas ${additionalAirdropPDAs.length} PDAs adicionais do airdrop`);
        
        // Verificar se os uplines estão na posição correta
        const uplineStartIdx = vaultAAccounts.length + chainlinkAccounts.length + airdropBaseAccounts.length;
        console.log(`\n📍 VERIFICAÇÃO DA ORDEM:`);
        console.log(`  - Vault A: índices 0-3 (4 contas)`);
        console.log(`  - Chainlink: índices 4-5 (2 contas)`);
        console.log(`  - Airdrop base: índices 6-12 (7 contas)`);
        console.log(`  - Uplines matriz: índices ${uplineStartIdx}-${uplineStartIdx + uplineAccounts.length - 1} (${uplineAccounts.length} contas)`);
        console.log(`  - PDAs airdrop extras: índices ${uplineStartIdx + uplineAccounts.length}+ (${additionalAirdropPDAs.length} contas)`);
      }
      
      console.log(`\n📦 TOTAL DE REMAINING ACCOUNTS: ${mainRemainingAccounts.length}`);
      
      // Mostrar todas as contas para debug
      if (isSlot3) {
        console.log("\n📋 LISTA COMPLETA DE REMAINING ACCOUNTS:");
        mainRemainingAccounts.forEach((acc, idx) => {
          let type = "";
          if (idx < 4) type = "[Vault A]";
          else if (idx < 6) type = "[Chainlink]";
          else if (idx < 13) type = "[Airdrop Base]";
          else if (idx < 13 + uplineAccounts.length) type = "[Upline Matriz]";
          else type = "[Airdrop PDA Extra]";
          
          console.log(`  [${idx}] ${type} ${acc.pubkey.toString()}`);
        });
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
        .remainingAccounts(mainRemainingAccounts)
        .instruction();
      
      instructions.push(registerIx);
      
      console.log(`📦 Total de instruções: ${instructions.length}`);
      
      const messageV0 = new TransactionMessage({
        payerKey: walletKeypair.publicKey,
        recentBlockhash: blockhash,
        instructions
      }).compileToV0Message([lookupTableAccount]);
      
      const mainTransaction = new VersionedTransaction(messageV0);
      mainTransaction.sign([walletKeypair]);
      
      console.log("✅ Transação preparada com ALT");
      
      console.log("\n📤 ENVIANDO TRANSAÇÃO...");
      
      try {
        const txid = await connection.sendTransaction(mainTransaction, {
          skipPreflight: true,
          maxRetries: 3
        });
        
        console.log(`✅ Transação enviada: ${txid}`);
        console.log(`🔍 Explorer: https://explorer.solana.com/tx/${txid}?cluster=devnet`);
        
        console.log(`\n⏳ Aguardando confirmação (timeout: 60s)...`);
        const result = await checkSignatureStatus(connection, txid, 60000);
        
        if (result.confirmed) {
          console.log(`✅ Transação confirmada com status: ${result.status}!`);
          
          console.log("\n⏳ Aguardando 5 segundos para o estado atualizar...");
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
            if (newReferrerInfo.chain.filledSlots === 0) {
              console.log("\n🎉 MATRIZ DO REFERENCIADOR COMPLETADA!");
            } else {
              console.log("\n⚠️ Matriz do referenciador não completada. Slots: " + newReferrerInfo.chain.filledSlots + "/3");
            }
          }
          
          const newBalance = await connection.getBalance(walletKeypair.publicKey);
          console.log("\n💼 Novo saldo: " + newBalance / 1e9 + " SOL");
          console.log("💸 Gasto total: " + (balance - newBalance) / 1e9 + " SOL");
          
          console.log("\n🎉 REGISTRO CONCLUÍDO COM SUCESSO! 🎉");
          console.log("=====================================");
        } else {
          console.log(`❌ Transação não confirmada: ${result.error}`);
          throw new Error(`Transação não confirmada: ${result.error}`);
        }
      } catch (error) {
        console.error(`❌ ERRO NA TRANSAÇÃO: ${error.message}`);
        
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