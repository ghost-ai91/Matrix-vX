// register-airdrop-user.js - Script para registrar usuário no programa de airdrop
const { 
  Connection, 
  Keypair, 
  PublicKey, 
  TransactionMessage, 
  VersionedTransaction,
  ComputeBudgetProgram,
  SystemProgram,
  SYSVAR_RENT_PUBKEY
} = require('@solana/web3.js');
const { AnchorProvider, Program, BN, Wallet } = require('@coral-xyz/anchor');
const fs = require('fs');
const path = require('path');

// Receber parâmetros da linha de comando
const args = process.argv.slice(2);
const walletPath = args[0] || './carteiras/carteira15.jsonn';
const configPath = args[1] || './matriz-config.json';

// Função para dormir
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Função para verificar status da transação
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

async function main() {
  try {
    console.log("🚀 REGISTRO DE USUÁRIO NO PROGRAMA DE AIRDROP");
    console.log("==============================================");
    
    // Carregar carteira
    console.log(`Carregando carteira de ${walletPath}...`);
    const walletKeypair = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, 'utf8')))
    );
    
    // Carregar config
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // Endereço do programa de airdrop
    const AIRDROP_PROGRAM_ID = new PublicKey("J1Ad1njQ5snM2nADWr47pDxPJaicprCrwpqfzWmPv7DX");
    
    // Conexão com parâmetros de timeout ampliados
    const connection = new Connection('https://api.devnet.solana.com', {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000, // 60 segundos
      disableRetryOnRateLimit: false,
    });
    console.log('Conectando à Devnet com timeout estendido (60s)');
    
    // Provider e wallet
    const anchorWallet = new Wallet(walletKeypair);
    const provider = new AnchorProvider(connection, anchorWallet, { 
      commitment: 'confirmed',
      skipPreflight: true,
    });
    
    // Verificar saldo
    console.log("\n👤 USUÁRIO: " + walletKeypair.publicKey.toString());
    const balance = await connection.getBalance(walletKeypair.publicKey);
    console.log("💰 SALDO: " + balance / 1e9 + " SOL");
    
    if (balance < 10_000_000) { // 0.01 SOL
      console.error("❌ Saldo insuficiente para cobrir as taxas de transação!");
      return;
    }
    
    // Derivar PDA do estado do programa
    const [programStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("program_state", "utf8")],
      AIRDROP_PROGRAM_ID
    );
    console.log(`\n📝 Program State PDA: ${programStatePda.toString()}`);
    
    // Derivar PDA da conta do usuário
    const [userAccountPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_account", "utf8"), walletKeypair.publicKey.toBuffer()],
      AIRDROP_PROGRAM_ID
    );
    console.log(`👤 User Account PDA: ${userAccountPda.toString()}`);
    
    // Verificar se o usuário já existe
    const userExists = await connection.getAccountInfo(userAccountPda) !== null;
    if (userExists) {
      console.log("✅ Usuário já registrado no programa de airdrop!");
      return;
    }
    
    console.log("🔍 Usuário não registrado. Preparando registro...");
    
    // Carregar IDL do programa de airdrop
    console.log("\n📄 Carregando IDL do programa de airdrop...");
    let airdropIdl;
    try {
      airdropIdl = require('./target/idl/donut_airdrop.json');
      console.log("✅ IDL carregado com sucesso");
    } catch (e) {
      console.log("⚠️ IDL não encontrado, tentando buscar da rede...");
      airdropIdl = await Program.fetchIdl(AIRDROP_PROGRAM_ID, provider);
      if (!airdropIdl) {
        console.error("❌ Não foi possível carregar o IDL do programa de airdrop");
        return;
      }
    }
    
    // Criar programa
    const airdropProgram = new Program(airdropIdl, AIRDROP_PROGRAM_ID, provider);
    
    // Obter estado do programa
    console.log("\n🔍 Buscando estado do programa de airdrop...");
    let programState;
    try {
      programState = await airdropProgram.account.programState.fetch(programStatePda);
      console.log("✅ Estado do programa obtido");
      console.log(`📊 Semana atual: ${programState.currentWeek}`);
      console.log(`🏦 Token vault: ${programState.tokenVault.toString()}`);
      console.log(`🔄 Programa da matriz: ${programState.matrixProgramId.toString()}`);
    } catch (e) {
      console.error("❌ Erro ao obter estado do programa:", e);
      return;
    }
    
    // Preparar transação para registrar o usuário
    console.log("\n📝 Preparando transação de registro...");
    
    // Obter blockhash recente
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    
    // Construir transação
    const instructions = [];
    
    // Instrução de compute budget
    const computeUnits = 200_000; // 200k unidades é mais que suficiente
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: computeUnits
    });
    instructions.push(modifyComputeUnits);
    
    // Prioridade média para a transação
    const setPriority = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 50000 // 50k microlamports (preço médio)
    });
    instructions.push(setPriority);
    
    // Instrução de registro no airdrop
    try {
      const registerIx = await airdropProgram.methods
        .registerUser()
        .accounts({
          programState: programStatePda,
          userWallet: walletKeypair.publicKey,
          userAccount: userAccountPda,
          systemProgram: SystemProgram.programId,
        })
        .instruction();
      
      instructions.push(registerIx);
      
      console.log("✅ Instrução de registro criada");
    } catch (e) {
      console.error("❌ Erro ao criar instrução de registro:", e);
      return;
    }
    
    // Criar mensagem V0
    const messageV0 = new TransactionMessage({
      payerKey: walletKeypair.publicKey,
      recentBlockhash: blockhash,
      instructions
    }).compileToV0Message();
    
    // Criar e assinar transação
    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([walletKeypair]);
    
    console.log("✅ Transação criada e assinada");
    
    // Enviar transação
    console.log("\n📤 Enviando transação...");
    try {
      const txid = await connection.sendTransaction(transaction, {
        skipPreflight: true,
        maxRetries: 3
      });
      
      console.log(`✅ Transação enviada: ${txid}`);
      console.log(`🔍 Explorer: https://explorer.solana.com/tx/${txid}?cluster=devnet`);
      
      // Verificar confirmação
      console.log(`\n⏳ Aguardando confirmação da transação (timeout: 60s)...`);
      const result = await checkSignatureStatus(connection, txid, 60000);
      
      if (result.confirmed) {
        console.log(`✅ Transação confirmada com status: ${result.status}!`);
        
        // Verificar se a conta foi criada
        const userAccount = await connection.getAccountInfo(userAccountPda);
        if (userAccount) {
          console.log("\n🎉 REGISTRO CONCLUÍDO COM SUCESSO!");
          console.log(`👤 Usuário ${walletKeypair.publicKey.toString()} registrado no programa de airdrop`);
          console.log(`📝 Conta criada: ${userAccountPda.toString()}`);
          console.log("\n✅ Agora você pode usar o script register-slot3-solution.js para registrar na matriz");
        } else {
          console.log("⚠️ Transação confirmada, mas conta não encontrada. Tente novamente em alguns segundos.");
        }
      } else {
        console.log(`❌ Transação não confirmada: ${result.error}`);
      }
    } catch (error) {
      console.error("❌ Erro ao enviar transação:", error);
      
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