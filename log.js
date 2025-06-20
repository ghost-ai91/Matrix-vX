// register-v6-logs.js - Script para capturar logs completos de transações
const { 
  Connection, 
  PublicKey,
} = require('@solana/web3.js');
const fs = require('fs');

// Função para dormir
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Função para obter logs completos da transação
async function getTransactionLogs(connection, signature, maxRetries = 10) {
  console.log(`\n🔍 Buscando logs da transação: ${signature}`);
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      // Primeiro, verificar o status da transação
      const status = await connection.getSignatureStatus(signature, {
        searchTransactionHistory: true,
      });
      
      if (!status || !status.value) {
        console.log(`  ⏳ Tentativa ${i + 1}/${maxRetries}: Transação ainda não confirmada...`);
        await sleep(3000);
        continue;
      }
      
      // Se a transação foi confirmada, buscar os detalhes
      const transaction = await connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      
      if (!transaction) {
        console.log(`  ⏳ Tentativa ${i + 1}/${maxRetries}: Detalhes da transação ainda não disponíveis...`);
        await sleep(3000);
        continue;
      }
      
      // Extrair logs
      const logs = transaction.meta?.logMessages || [];
      
      if (logs.length === 0) {
        console.log(`  ⚠️ Nenhum log encontrado na transação`);
        return null;
      }
      
      return {
        signature,
        slot: transaction.slot,
        blockTime: transaction.blockTime,
        status: status.value,
        logs,
        computeUnitsConsumed: transaction.meta?.computeUnitsConsumed || 0,
        err: transaction.meta?.err || null,
      };
      
    } catch (error) {
      console.log(`  ❌ Erro na tentativa ${i + 1}: ${error.message}`);
      if (i === maxRetries - 1) {
        throw error;
      }
      await sleep(3000);
    }
  }
  
  throw new Error('Não foi possível obter os logs da transação após todas as tentativas');
}

// Função para formatar e exibir logs
function displayLogs(transactionData) {
  console.log("\n" + "=".repeat(80));
  console.log("📋 LOGS COMPLETOS DA TRANSAÇÃO");
  console.log("=".repeat(80));
  
  console.log(`\n📍 Informações da Transação:`);
  console.log(`  - Assinatura: ${transactionData.signature}`);
  console.log(`  - Slot: ${transactionData.slot}`);
  console.log(`  - Timestamp: ${new Date(transactionData.blockTime * 1000).toLocaleString()}`);
  console.log(`  - Status: ${transactionData.status.confirmationStatus}`);
  console.log(`  - Compute Units: ${transactionData.computeUnitsConsumed.toLocaleString()}`);
  
  if (transactionData.err) {
    console.log(`  - ❌ ERRO: ${JSON.stringify(transactionData.err)}`);
  }
  
  console.log(`\n📜 Logs (${transactionData.logs.length} linhas):`);
  console.log("-".repeat(80));
  
  // Exibir todos os logs com numeração
  transactionData.logs.forEach((log, index) => {
    // Adicionar cores para diferentes tipos de logs
    if (log.includes('Program log:')) {
      // Logs do programa em azul
      console.log(`${index + 1}. ${log}`);
    } else if (log.includes('failed') || log.includes('error') || log.includes('Error')) {
      // Erros em vermelho
      console.log(`${index + 1}. ❌ ${log}`);
    } else if (log.includes('success') || log.includes('Success')) {
      // Sucessos em verde
      console.log(`${index + 1}. ✅ ${log}`);
    } else {
      // Outros logs normais
      console.log(`${index + 1}. ${log}`);
    }
  });
  
  console.log("-".repeat(80));
  
  // Procurar por logs específicos do nosso programa
  console.log("\n🔍 Análise de Logs Importantes:");
  
  // Procurar onde o log foi truncado
  const truncatedIndex = transactionData.logs.findIndex(log => log.includes('Log truncated'));
  if (truncatedIndex !== -1) {
    console.log(`\n⚠️ LOG FOI TRUNCADO NA LINHA ${truncatedIndex + 1}`);
    console.log(`   Último log antes do truncamento:`);
    if (truncatedIndex > 0) {
      console.log(`   "${transactionData.logs[truncatedIndex - 1]}"`);
    }
  }
  
  // Procurar por erros específicos
  const errorLogs = transactionData.logs.filter(log => 
    log.includes('error') || 
    log.includes('Error') || 
    log.includes('failed') ||
    log.includes('❌')
  );
  
  if (errorLogs.length > 0) {
    console.log(`\n❌ Logs de Erro Encontrados (${errorLogs.length}):`);
    errorLogs.forEach(log => console.log(`  - ${log}`));
  }
  
  // Procurar logs do CPI
  const cpiLogs = transactionData.logs.filter(log => 
    log.includes('CPI') || 
    log.includes('invoke') ||
    log.includes('Invoking')
  );
  
  if (cpiLogs.length > 0) {
    console.log(`\n🔄 Logs de CPI Encontrados (${cpiLogs.length}):`);
    cpiLogs.forEach(log => console.log(`  - ${log}`));
  }
  
  // Salvar logs em arquivo
  const filename = `transaction-logs-${transactionData.signature.substring(0, 8)}.txt`;
  const logContent = transactionData.logs.join('\n');
  fs.writeFileSync(filename, logContent);
  console.log(`\n💾 Logs salvos em: ${filename}`);
}

// Função para buscar logs usando Web3.js alternativo
async function getLogsAlternative(signature) {
  console.log("\n🔄 Tentando método alternativo para obter logs...");
  
  try {
    // Usar RPC direto
    const response = await fetch('https://api.devnet.solana.com', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: [
          signature,
          {
            encoding: 'json',
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0,
          },
        ],
      }),
    });
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message);
    }
    
    if (data.result?.meta?.logMessages) {
      return {
        signature,
        logs: data.result.meta.logMessages,
        computeUnitsConsumed: data.result.meta.computeUnitsConsumed || 0,
        err: data.result.meta.err || null,
      };
    }
    
    return null;
  } catch (error) {
    console.error("❌ Erro no método alternativo:", error.message);
    return null;
  }
}

// Função principal
async function main() {
  console.log("\n🚀 REGISTER V6 - CAPTURADOR DE LOGS 🚀");
  console.log("=====================================");
  
  // Verificar argumentos
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error("\n❌ ERRO: Forneça a assinatura da transação!");
    console.log("\n📖 USO:");
    console.log("node register-v6-logs.js <assinatura-da-transacao>");
    console.log("\n📋 EXEMPLO:");
    console.log("node register-v6-logs.js 5xKFJ8k7h3X4nYZ2qPRc9mVbLWE6uT8DgN3aQhJ7xK9Z2wY3nM8pL4jR6sT9vU2B");
    process.exit(1);
  }
  
  const signature = args[0];
  
  try {
    // Conectar à rede
    const connection = new Connection('https://api.devnet.solana.com', {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 120000, // 2 minutos
    });
    
    console.log('📡 Conectado à Solana Devnet');
    
    // Tentar obter logs
    let transactionData = await getTransactionLogs(connection, signature);
    
    // Se falhar, tentar método alternativo
    if (!transactionData) {
      transactionData = await getLogsAlternative(signature);
    }
    
    if (!transactionData) {
      console.error("\n❌ Não foi possível obter os logs da transação");
      process.exit(1);
    }
    
    // Exibir logs formatados
    displayLogs(transactionData);
    
    // Análise adicional para o problema do CPI
    console.log("\n" + "=".repeat(80));
    console.log("🔍 ANÁLISE ESPECÍFICA DO PROBLEMA CPI");
    console.log("=".repeat(80));
    
    // Procurar pelo ponto exato onde parou
    const matrixLogs = transactionData.logs.filter(log => log.includes('[MATRIX]'));
    const lastMatrixLog = matrixLogs[matrixLogs.length - 1];
    
    console.log(`\n📍 Último log do programa Matrix:`);
    console.log(`   "${lastMatrixLog}"`);
    
    // Procurar logs do airdrop
    const airdropLogs = transactionData.logs.filter(log => log.includes('[AIRDROP]'));
    
    if (airdropLogs.length > 0) {
      console.log(`\n📍 Logs do programa Airdrop (${airdropLogs.length}):`);
      airdropLogs.forEach((log, i) => console.log(`   ${i + 1}. ${log}`));
    } else {
      console.log(`\n⚠️ Nenhum log do programa Airdrop encontrado`);
      console.log(`   Isso indica que o CPI não chegou a executar o programa de airdrop`);
    }
    
    // Verificar se houve erro de "missing account"
    const missingAccountError = transactionData.logs.find(log => 
      log.includes('missing') || 
      log.includes('Missing') ||
      log.includes('required by the instruction')
    );
    
    if (missingAccountError) {
      console.log(`\n❌ ERRO DE CONTA FALTANTE DETECTADO:`);
      console.log(`   "${missingAccountError}"`);
      console.log(`\n   Isso significa que o CPI está tentando acessar uma conta que não foi fornecida.`);
      console.log(`   Verifique se todas as contas necessárias estão no array account_infos.`);
    }
    
  } catch (error) {
    console.error("\n❌ ERRO:", error.message);
    
    if (error.stack) {
      console.log("\n📋 Stack trace:");
      console.log(error.stack);
    }
  }
}

// Executar script
main().catch(console.error);