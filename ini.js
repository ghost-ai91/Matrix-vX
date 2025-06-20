// inicializacao.js - CORRIGIDO
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} = require("@solana/web3.js")
const { AnchorProvider, Program } = require("@coral-xyz/anchor")
const fs = require("fs")
const path = require("path")

// Receber parâmetros da linha de comando
const args = process.argv.slice(2)
const walletPath =
  args[0] || "/Users/dark/.config/solana/id.json"
const configOutputPath = args[1] || "./matriz-config.json"

// Configurações principais - ATUALIZE COM SEU PROGRAM ID CORRETO
const PROGRAM_ID = new PublicKey(
  "273d3yYAozJkMn2qT8afudNiVSF4rpP3zUCKwfw5tJPo"
)
const TOKEN_MINT = new PublicKey(
  "F1vCKXMix75KigbwZUXkVU97NiE1H2ToopttH67ydqvq"
)
const SPL_TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
)
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
)
const SYSVAR_RENT_PUBKEY = new PublicKey(
  "SysvarRent111111111111111111111111111111111"
)

// ATUALIZADO: Novo multisig treasury
const MULTISIG_TREASURY = new PublicKey(
  "QgNN4aW9hPz4ANP1LqzR2FkDPZo9MzDZxDQ4abovHYv"
)

// Novos endereços para swap
const METEORA_AMM_PROGRAM = new PublicKey(
  "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB"
)
const METEORA_VAULT_PROGRAM = new PublicKey(
  "24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi"
)

// Função para carregar uma carteira a partir de um arquivo
function loadWalletFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo de carteira não encontrado: ${filePath}`)
  }
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(filePath, "utf-8")))
  )
}

async function main() {
  try {
    console.log(
      "🚀 INICIALIZANDO PROGRAMA DE MATRIZ COM SWAP AND BURN 🚀"
    )
    console.log(
      "==============================================================="
    )
    console.log(`Usando arquivo de carteira: ${walletPath}`)
    console.log(`Multisig Treasury: ${MULTISIG_TREASURY.toString()}`)

    // Conectar à devnet
    const connection = new Connection(
      "https://weathered-quiet-theorem.solana-devnet.quiknode.pro/198997b67cb51804baeb34ed2257274aa2b2d8c0",
      "confirmed"
    )
    console.log("Conectando à Devnet")

    // Carregar carteira
    let walletKeypair
    try {
      walletKeypair = loadWalletFromFile(walletPath)
      console.log(
        "👤 Endereço da carteira: " +
          walletKeypair.publicKey.toString()
      )
    } catch (e) {
      console.error(`❌ Erro ao carregar carteira: ${e.message}`)
      return
    }

    // Verificar saldo da carteira
    const balance = await connection.getBalance(
      walletKeypair.publicKey
    )
    console.log(`💰 Saldo: ${balance / 1_000_000_000} SOL`)

    if (balance < 1_000_000_000) {
      console.warn(
        "⚠️ Saldo baixo! Recomendamos pelo menos 1 SOL para a inicialização."
      )
      return
    }

    // Carregar o IDL - CORRIGIDO
    console.log("\n📝 Carregando IDL...")
    let idl
    try {
      // Primeiro tenta carregar o IDL compilado
      const idlPath = path.resolve(
        "./target/idl/referral_system.json"
      )
      if (!fs.existsSync(idlPath)) {
        console.error(`❌ IDL não encontrado em: ${idlPath}`)
        console.error(
          "Execute 'anchor build' primeiro para gerar o IDL"
        )
        return
      }

      const idlString = fs.readFileSync(idlPath, "utf8")
      idl = JSON.parse(idlString)
      console.log("✅ IDL carregado com sucesso")
      console.dir(idl, { depth: null, colors: true })
      // Verificar se o IDL tem a estrutura correta
      if (!idl.name || !idl.instructions) {
        console.error("❌ IDL inválido - estrutura incorreta")
        return
      }

      console.log(`📋 Programa: ${idl.name}`)
      console.log(`📋 Versão: ${idl.version || "não especificada"}`)
      console.log(
        `📋 Total de instruções: ${idl.instructions.length}`
      )
    } catch (e) {
      console.error(`❌ Erro ao carregar IDL: ${e.message}`)
      return
    }

    // Configurar o provider com a carteira
    const provider = new AnchorProvider(
      connection,
      {
        publicKey: walletKeypair.publicKey,
        signTransaction: async (tx) => {
          tx.partialSign(walletKeypair)
          return tx
        },
        signAllTransactions: async (txs) => {
          return txs.map((tx) => {
            tx.partialSign(walletKeypair)
            return tx
          })
        },
      },
      { commitment: "confirmed" }
    )

    // Inicializar o programa - AGORA COM IDL VÁLIDO
    console.log("\n🔧 Inicializando programa...")
    const program = new Program(idl, PROGRAM_ID, provider)
    console.log("✅ Programa inicializado")

    // Gerar um novo keypair para o estado
    const stateKeypair = Keypair.generate()
    console.log(
      "🔑 Novo endereço de estado: " +
        stateKeypair.publicKey.toString()
    )

    // Inicializar o estado do programa
    console.log("\n📝 INICIALIZANDO O ESTADO DO PROGRAMA...")

    try {
      const tx = await program.methods
        .initialize()
        .accounts({
          state: stateKeypair.publicKey,
          owner: walletKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([stateKeypair])
        .rpc()

      console.log("✅ PROGRAMA INICIALIZADO COM SUCESSO: " + tx)
      console.log(
        `🔍 Link para explorador: https://explorer.solana.com/tx/${tx}?cluster=devnet`
      )

      // Verificar informações do estado
      const stateInfo = await program.account.programState.fetch(
        stateKeypair.publicKey
      )
      console.log("\n📊 INFORMAÇÕES DO ESTADO DA MATRIZ:")
      console.log("👑 Owner: " + stateInfo.owner.toString())
      console.log(
        "🏦 Multisig Treasury: " +
          stateInfo.multisigTreasury.toString()
      )
      console.log(
        "🆔 Próximo ID de upline: " +
          stateInfo.nextUplineId.toString()
      )
      console.log(
        "🆔 Próximo ID de chain: " + stateInfo.nextChainId.toString()
      )

      // Verificar PDAs necessárias para integração
      console.log("\n🔑 PDAS PARA INTEGRAÇÃO:")

      // PDA para vault de SOL
      const [programSolVault, programSolVaultBump] =
        PublicKey.findProgramAddressSync(
          [Buffer.from("program_sol_vault")],
          PROGRAM_ID
        )
      console.log(
        "💰 PDA do Vault de SOL: " +
          programSolVault.toString() +
          " (Bump: " +
          programSolVaultBump +
          ")"
      )

      // Gravar todas as informações importantes em um arquivo de configuração
      const configData = {
        programId: PROGRAM_ID.toString(),
        stateAddress: stateKeypair.publicKey.toString(),
        statePrivateKey: Array.from(stateKeypair.secretKey),
        tokenMint: TOKEN_MINT.toString(),
        programSolVault: programSolVault.toString(),
        programSolVaultBump,
        ownerWallet: walletKeypair.publicKey.toString(),
        multisigTreasury: MULTISIG_TREASURY.toString(),
        meteoraAmmProgram: METEORA_AMM_PROGRAM.toString(),
        meteoraVaultProgram: METEORA_VAULT_PROGRAM.toString(),
      }

      // Criar diretório para o arquivo de configuração se não existir
      const configDir = path.dirname(configOutputPath)
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }

      fs.writeFileSync(
        configOutputPath,
        JSON.stringify(configData, null, 2)
      )
      console.log(`\n💾 Configuração salva em ${configOutputPath}`)

      console.log(
        "\n⚠️ IMPORTANTE: GUARDE ESTES ENDEREÇOS PARA USO FUTURO!"
      )
      console.log("🔑 ENDEREÇO DO PROGRAMA: " + PROGRAM_ID.toString())
      console.log(
        "🔑 ESTADO DO PROGRAMA: " + stateKeypair.publicKey.toString()
      )
      console.log(
        "🔑 OWNER DO PROGRAMA: " + walletKeypair.publicKey.toString()
      )
      console.log(
        "🏦 MULTISIG TREASURY: " + MULTISIG_TREASURY.toString()
      )
      console.log("🔑 PDA SOL VAULT: " + programSolVault.toString())

      console.log("\n🔥 INFORMAÇÕES DO SISTEMA SWAP AND BURN:")
      console.log(
        `🔥 O sistema agora faz swap de SOL para DONUT e queima 100% dos tokens`
      )
      console.log(`🔥 Slot 1: Swap and Burn`)
      console.log(`🔥 Slot 2: Reserva SOL para o referrer`)
      console.log(
        `🔥 Slot 3: Paga SOL reservado e processa recursividade`
      )
    } catch (error) {
      console.error(
        "❌ ERRO AO INICIALIZAR O ESTADO DA MATRIZ:",
        error
      )

      if (error.logs) {
        console.log("\n📋 LOGS DE ERRO:")
        error.logs.forEach((log, i) => console.log(`${i}: ${log}`))
      }
    }
  } catch (error) {
    console.error("❌ ERRO GERAL DURANTE O PROCESSO:", error)
    console.error("Stack trace:", error.stack)
  } finally {
    process.exit(0)
  }
}

main()
