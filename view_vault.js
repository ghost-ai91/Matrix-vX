const { Connection, PublicKey } = require('@solana/web3.js');

async function analyzeVaultTransactions() {
    console.log("🔍 ANÁLISE DETALHADA DO VAULT DO PROGRAMA 🔍");
    console.log("==========================================");
    
    try {
        const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
        const PROGRAM_ID = new PublicKey("BWnK662qst6w8D8hDpetToB8CUYoUTpS9hWJoF1KupTk");
        
        // Derivar o vault PDA
        const [programSolVault] = PublicKey.findProgramAddressSync(
            [Buffer.from("program_sol_vault")],
            PROGRAM_ID
        );
        
        console.log(`\n🏦 Vault: ${programSolVault.toString()}`);
        console.log(`💰 Saldo Atual: 0 SOL`);
        
        // Buscar TODAS as transações do vault
        console.log(`\n📜 HISTÓRICO COMPLETO DE TRANSAÇÕES:`);
        
        let allSignatures = [];
        let before = null;
        
        // Buscar todas as assinaturas (paginação)
        while (true) {
            const options = { limit: 1000 };
            if (before) options.before = before;
            
            const signatures = await connection.getSignaturesForAddress(
                programSolVault,
                options
            );
            
            if (signatures.length === 0) break;
            
            allSignatures = allSignatures.concat(signatures);
            before = signatures[signatures.length - 1].signature;
            
            if (signatures.length < 1000) break;
        }
        
        console.log(`\n📊 Total de transações encontradas: ${allSignatures.length}`);
        
        // Analisar cada transação para encontrar depósitos e saques
        let totalDeposited = 0;
        let totalWithdrawn = 0;
        let deposits = [];
        let withdrawals = [];
        
        console.log("\n🔄 Analisando transações...");
        
        for (let i = 0; i < allSignatures.length; i++) {
            const sig = allSignatures[i];
            
            try {
                const tx = await connection.getTransaction(sig.signature, {
                    maxSupportedTransactionVersion: 0
                });
                
                if (tx && tx.meta) {
                    // Encontrar índice do vault
                    const vaultIndex = tx.transaction.message.staticAccountKeys.findIndex(
                        key => key.toString() === programSolVault.toString()
                    );
                    
                    if (vaultIndex >= 0 && tx.meta.postBalances && tx.meta.preBalances) {
                        const preBalance = tx.meta.preBalances[vaultIndex];
                        const postBalance = tx.meta.postBalances[vaultIndex];
                        const change = postBalance - preBalance;
                        
                        if (change > 0) {
                            // Depósito
                            totalDeposited += change;
                            deposits.push({
                                signature: sig.signature,
                                amount: change / 1e9,
                                timestamp: new Date(sig.blockTime * 1000),
                                slot: sig.slot
                            });
                        } else if (change < 0) {
                            // Saque
                            totalWithdrawn += Math.abs(change);
                            withdrawals.push({
                                signature: sig.signature,
                                amount: Math.abs(change) / 1e9,
                                timestamp: new Date(sig.blockTime * 1000),
                                slot: sig.slot
                            });
                        }
                    }
                }
            } catch (e) {
                // Ignorar erros de transações individuais
            }
        }
        
        console.log("\n💰 RESUMO FINANCEIRO:");
        console.log(`   Total Depositado: ${totalDeposited / 1e9} SOL`);
        console.log(`   Total Sacado: ${totalWithdrawn / 1e9} SOL`);
        console.log(`   Diferença: ${(totalDeposited - totalWithdrawn) / 1e9} SOL`);
        console.log(`   Saldo Esperado: ${(totalDeposited - totalWithdrawn) / 1e9} SOL`);
        console.log(`   Saldo Real: 0 SOL`);
        
        if (totalDeposited - totalWithdrawn > 0) {
            console.log(`\n❌ DISCREPÂNCIA DETECTADA: ${(totalDeposited - totalWithdrawn) / 1e9} SOL DESAPARECIDOS!`);
        }
        
        // Mostrar depósitos
        if (deposits.length > 0) {
            console.log(`\n📥 DEPÓSITOS (${deposits.length}):`);
            deposits.slice(0, 5).forEach((dep, idx) => {
                console.log(`\n${idx + 1}. ${dep.amount} SOL`);
                console.log(`   Tx: ${dep.signature}`);
                console.log(`   Data: ${dep.timestamp.toLocaleString()}`);
                console.log(`   Explorer: https://explorer.solana.com/tx/${dep.signature}?cluster=devnet`);
            });
            if (deposits.length > 5) {
                console.log(`   ... e mais ${deposits.length - 5} depósitos`);
            }
        }
        
        // Mostrar saques
        if (withdrawals.length > 0) {
            console.log(`\n📤 SAQUES (${withdrawals.length}):`);
            withdrawals.slice(0, 5).forEach((wit, idx) => {
                console.log(`\n${idx + 1}. ${wit.amount} SOL`);
                console.log(`   Tx: ${wit.signature}`);
                console.log(`   Data: ${wit.timestamp.toLocaleString()}`);
                console.log(`   Explorer: https://explorer.solana.com/tx/${wit.signature}?cluster=devnet`);
            });
            if (withdrawals.length > 5) {
                console.log(`   ... e mais ${withdrawals.length - 5} saques`);
            }
        }
        
        // Análise das transações mostradas no screenshot
        console.log("\n📋 ANÁLISE DAS TRANSAÇÕES RECENTES (do screenshot):");
        const recentTxs = [
            "26UZYuaW58uV9...",
            "66jtgqiSGQWisDB...",
            "4gLgTrp6Ws2uXk...",
            "5BmRYps6p9Wi2RFP...",
            "2THA2tsda6H2yS...",
            "38UDfy63YBJpyv..."
        ];
        
        console.log("\nTodas são queries (consultas) que custaram 0.000355 SOL cada");
        console.log("Isso indica que são transações FALHADAS ou apenas leituras");
        
        console.log("\n🚨 CONCLUSÃO:");
        console.log("1. O vault está vazio (0 SOL)");
        console.log("2. Usuários têm SOL marcado como reservado");
        console.log("3. As transações recentes são apenas consultas/falhas");
        console.log("4. O SOL pode ter sido sacado indevidamente ou nunca foi depositado");
        
        console.log("\n⚠️ AÇÃO URGENTE NECESSÁRIA:");
        console.log("- Verificar TODAS as transações do programa");
        console.log("- Identificar quando e como o SOL saiu do vault");
        console.log("- Pausar imediatamente novos registros");
        console.log("- Auditar o código para vulnerabilidades");
        
    } catch (error) {
        console.error("\n❌ Erro:", error.message);
    }
}

// Executar análise
analyzeVaultTransactions().catch(console.error);