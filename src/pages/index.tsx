import { useState, useEffect } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { formatEther } from 'viem';
import bankAbi from '../abi/BankV6.json';

const CONTRACT_ADDRESS = '0x5f01cCFECe767EF5F72882F3D9F67274190eE2C7';

type TxLog = {
  id: number;
  hash?: string;
  action: string;
  status: 'Aguardando Assinatura' | 'Processando...' | 'Sucesso' | 'Erro';
  errorMessage?: string;
};

export default function Home() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [formData, setFormData] = useState({ name: '', age: '', country: '' });
  const [txHistory, setTxHistory] = useState<TxLog[]>([]);

  // 1. LER DADOS
  const { data: isWhitelisted } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: bankAbi.abi,
    functionName: 'isWhitelisted',
    args: [address],
    query: { enabled: !!address }
  });

  const { data: bankBalance } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: bankAbi.abi,
    functionName: 'getAccountBalance',
    args: [address],
    query: { enabled: !!address }
  });

  // 2. ESCREVER DADOS
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  const getErrorMessage = (err: any) => {
    if (!err) return null;
    const errorName = err.cause?.data?.errorName || err.cause?.cause?.errorName || err.cause?.reason || err.data?.errorName || err.errorName;
    if (errorName) return `Regra violada: ${errorName}`;
    return err.shortMessage || "A transação falhou na simulação.";
  };

  const handleRegister = async () => {
    if (!formData.name || !formData.age || !formData.country) return alert("Preencha todos os campos!");
    try {
        await publicClient?.simulateContract({
            address: CONTRACT_ADDRESS,
            abi: bankAbi.abi,
            functionName: 'registerRequest',
            args: [formData.name, BigInt(formData.age), formData.country],
            account: address,
        });
        setTxHistory(prev => [{ id: Date.now(), action: 'Cadastro (KYC)', status: 'Aguardando Assinatura' }, ...prev]);
        writeContract({
            address: CONTRACT_ADDRESS,
            abi: bankAbi.abi,
            functionName: 'registerRequest',
            args: [formData.name, BigInt(formData.age), formData.country],
        });
    } catch (error: any) {
        const mensagemErro = getErrorMessage(error);
        setTxHistory(prev => [{ id: Date.now(), action: 'Cadastro (KYC)', status: 'Erro', errorMessage: mensagemErro }, ...prev]);
    }
  };

  // 3. TRACKING
  useEffect(() => {
    if (!txHistory.length) return;
    setTxHistory(prev => {
      const newHistory = [...prev];
      const latestTx = newHistory[0];
      if (isPending) latestTx.status = 'Aguardando Assinatura';
      else if (isConfirming) { latestTx.status = 'Processando...'; latestTx.hash = hash; }
      else if (isConfirmed) latestTx.status = 'Sucesso';
      else if (writeError) { latestTx.status = 'Erro'; latestTx.errorMessage = getErrorMessage(writeError); }
      return newHistory;
    });
  }, [isPending, isConfirming, isConfirmed, writeError, hash]);


  // =========================================================================
  // TELA 1: LANDING PAGE (Desconectado)
  // =========================================================================
  if (!isConnected) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-[#0B0E14] text-white relative overflow-hidden">
        {/* Efeito de brilho de fundo */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-blue-600/20 rounded-full blur-[120px]"></div>
        
        <div className="z-10 flex flex-col items-center text-center p-8">
            <div className="mb-6 p-4 bg-white/5 rounded-3xl border border-white/10 backdrop-blur-md shadow-2xl">
                <h1 className="text-6xl font-black bg-gradient-to-br from-blue-400 to-indigo-600 bg-clip-text text-transparent tracking-tighter">
                    PROXY<span className="text-white">BANK</span>
                </h1>
            </div>
            <p className="mb-10 text-xl text-gray-400 font-light max-w-lg">
                O seu portal definitivo para o futuro de DeFi. Conecte sua carteira para acessar cofres seguros e câmbio descentralizado.
            </p>
            <div className="scale-125 hover:scale-110 transition-transform duration-300">
                <ConnectButton />
            </div>
        </div>
      </main>
    );
  }

  // =========================================================================
  // TELA 2: DASHBOARD PRINCIPAL (Conectado)
  // =========================================================================
  return (
    <div className="flex h-screen bg-[#0B0E14] text-white font-sans overflow-hidden">
      
      {/* MENU LATERAL (SIDEBAR) */}
      <aside className="w-72 bg-[#12161F] border-r border-gray-800/60 hidden lg:flex flex-col shadow-2xl z-20">
         <div className="h-24 flex items-center justify-center border-b border-gray-800/60">
            <h1 className="text-2xl font-black tracking-widest text-white">
                P<span className="text-blue-500">R</span>OXY
            </h1>
         </div>
         <nav className="flex-1 p-6 space-y-4">
            <a href="#" className="flex items-center gap-4 text-blue-400 bg-blue-500/10 p-4 rounded-xl font-semibold border border-blue-500/20 transition-all">
                📊 <span>Dashboard</span>
            </a>
            <a href="#" className="flex items-center gap-4 text-gray-400 hover:text-white hover:bg-white/5 p-4 rounded-xl font-medium transition-all cursor-not-allowed opacity-50">
                🏦 <span>Meus Cofres</span>
            </a>
            <a href="#" className="flex items-center gap-4 text-gray-400 hover:text-white hover:bg-white/5 p-4 rounded-xl font-medium transition-all cursor-not-allowed opacity-50">
                📈 <span>Gráficos DEX</span>
            </a>
         </nav>
         <div className="p-6 border-t border-gray-800/60">
            <div className="flex items-center gap-3 text-sm text-gray-500">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                Rede Polygon Amoy
            </div>
         </div>
      </aside>

      {/* ÁREA DE CONTEÚDO PRINCIPAL */}
      <main className="flex-1 flex flex-col h-full overflow-y-auto relative bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed">
        
        {/* CABEÇALHO SUPERIOR */}
        <header className="flex justify-between items-center p-6 border-b border-gray-800/60 bg-[#0B0E14]/80 backdrop-blur-lg sticky top-0 z-10 shadow-md">
            <h2 className="text-2xl font-bold tracking-tight">Visão Geral</h2>
            <ConnectButton />
        </header>

        {/* CONTEÚDO (GRID) */}
        <div className="p-6 md:p-10 max-w-7xl mx-auto w-full grid gap-8 grid-cols-1 xl:grid-cols-3">
            
            <div className="xl:col-span-2 space-y-8">
                
                {/* STATUS DA CONTA (KYC) */}
                <div className="bg-[#151A22]/80 backdrop-blur p-8 rounded-3xl shadow-xl border border-gray-800/60 relative overflow-hidden">
                    {/* Efeito de borda luminosa sutil */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-transparent"></div>
                    
                    <h3 className="text-gray-400 uppercase tracking-widest text-xs font-bold mb-6 flex items-center gap-2">
                        🛡️ Verificação de Identidade
                    </h3>
                    
                    {isWhitelisted ? (
                        <div className="flex items-center gap-5 bg-green-500/10 p-6 rounded-2xl border border-green-500/20">
                            <div className="bg-green-500/20 p-4 rounded-full text-3xl shadow-[0_0_15px_rgba(34,197,94,0.3)]">✅</div>
                            <div>
                                <p className="font-bold text-xl text-white tracking-tight">Acesso VIP Liberado</p>
                                <p className="text-sm text-green-300 mt-1">Conta aprovada. Todos os limites de cofre e DEX disponíveis.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="bg-yellow-500/10 p-4 rounded-xl border border-yellow-500/20 text-yellow-300 text-sm flex gap-3">
                                <span>⚠️</span>
                                <p>Sua conta está restrita. Conclua o registro no Smart Contract para operar.</p>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <input placeholder="Nome Completo" className="w-full p-4 rounded-xl bg-[#0B0E14] border border-gray-700 focus:outline-none focus:border-blue-500 transition-colors text-white placeholder-gray-600 font-medium" onChange={(e) => setFormData({...formData, name: e.target.value})} />
                                <input placeholder="Idade" type="number" className="w-full p-4 rounded-xl bg-[#0B0E14] border border-gray-700 focus:outline-none focus:border-blue-500 transition-colors text-white placeholder-gray-600 font-medium" onChange={(e) => setFormData({...formData, age: e.target.value})} />
                                <input placeholder="País" className="w-full p-4 rounded-xl bg-[#0B0E14] border border-gray-700 focus:outline-none focus:border-blue-500 transition-colors text-white placeholder-gray-600 font-medium" onChange={(e) => setFormData({...formData, country: e.target.value})} />
                            </div>
                            
                            <button 
                                onClick={handleRegister}
                                disabled={isPending || isConfirming}
                                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-blue-900/50 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-3 text-lg"
                            >
                                {isPending ? "✍️ Assine na sua Carteira..." : isConfirming ? "⏳ Validando na Blockchain..." : "Enviar Registro Oficial"}
                            </button>
                        </div>
                    )}
                </div>

                {/* DOIS CARDS LADO A LADO (SALDO & DEX) */}
                <div className={`grid grid-cols-1 md:grid-cols-2 gap-8 ${!isWhitelisted ? 'opacity-40 pointer-events-none grayscale transition-all' : ''}`}>
                    
                    {/* SALDO DO BANCO */}
                    <div className="bg-[#151A22]/80 backdrop-blur p-8 rounded-3xl shadow-xl border border-gray-800/60 flex flex-col justify-between hover:border-gray-600 transition-colors">
                        <div>
                            <h3 className="text-gray-400 uppercase tracking-widest text-xs font-bold mb-2">Conta Corrente</h3>
                            <p className="text-5xl font-black font-mono tracking-tighter text-white">
                                {bankBalance ? formatEther(bankBalance as bigint) : '0.00'} 
                                <span className="text-lg text-gray-500 ml-2 font-sans tracking-normal">POL</span>
                            </p>
                        </div>
                        <div className="mt-8 grid grid-cols-2 gap-3">
                            <button className="bg-white hover:bg-gray-200 text-black p-4 rounded-xl font-bold transition-colors">Depositar</button>
                            <button className="bg-transparent border border-gray-700 hover:bg-gray-800 p-4 rounded-xl font-bold transition-colors text-white">Sacar</button>
                        </div>
                    </div>

                    {/* CORRETORA (DEX) */}
                    <div className="bg-[#151A22]/80 backdrop-blur p-8 rounded-3xl shadow-xl border border-gray-800/60 relative hover:border-gray-600 transition-colors">
                        <div className="absolute -top-3 right-6 bg-blue-600 text-xs font-bold px-3 py-1 rounded-full shadow-lg shadow-blue-500/50">V6 Engine</div>
                        <h3 className="text-gray-400 uppercase tracking-widest text-xs font-bold mb-6">Câmbio Nativo</h3>
                        
                        <div className="bg-[#0B0E14] rounded-2xl p-4 mb-6 flex justify-between items-center border border-gray-800">
                            <span className="text-gray-400 font-medium">Taxa Atual</span>
                            <span className="font-bold text-blue-400">1 POL = 100 TKN</span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                            <button className="bg-indigo-600/20 border border-indigo-500 hover:bg-indigo-600/40 text-indigo-300 p-4 rounded-xl font-bold transition-all shadow-[0_0_20px_rgba(79,70,229,0.15)] hover:shadow-[0_0_20px_rgba(79,70,229,0.3)]">Comprar TKN</button>
                            <button className="bg-pink-600/20 border border-pink-500 hover:bg-pink-600/40 text-pink-300 p-4 rounded-xl font-bold transition-all shadow-[0_0_20px_rgba(219,39,119,0.15)] hover:shadow-[0_0_20px_rgba(219,39,119,0.3)]">Vender TKN</button>
                        </div>
                    </div>

                </div>
            </div>

            {/* SIDEBAR DE HISTÓRICO */}
            <div className="bg-[#151A22]/80 backdrop-blur p-8 rounded-3xl shadow-xl border border-gray-800/60 h-[700px] flex flex-col sticky top-28">
                <h3 className="text-gray-400 uppercase tracking-widest text-xs font-bold mb-6 flex items-center gap-2 border-b border-gray-800/60 pb-4">
                    📡 Terminal de Rede
                </h3>
                
                <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                    {txHistory.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-600">
                            <span className="text-4xl mb-4">📭</span>
                            <p className="text-sm font-medium">Sem transações recentes</p>
                        </div>
                    ) : (
                        txHistory.map((tx) => (
                            <div key={tx.id} className="bg-[#0B0E14] p-5 rounded-2xl border border-gray-800 relative group transition-all hover:border-gray-600">
                                <p className="font-bold text-white mb-2 tracking-tight">{tx.action}</p>
                                
                                <div className={`flex items-center gap-2 text-sm font-medium ${
                                    tx.status === 'Sucesso' ? 'text-green-400' : 
                                    tx.status === 'Erro' ? 'text-red-400' : 'text-blue-400 animate-pulse'
                                }`}>
                                    <div className={`w-2 h-2 rounded-full ${
                                        tx.status === 'Sucesso' ? 'bg-green-400' : 
                                        tx.status === 'Erro' ? 'bg-red-400' : 'bg-blue-400'
                                    }`}></div>
                                    {tx.status}
                                </div>
                                
                                {tx.hash && (
                                    <a href={`https://amoy.polygonscan.com/tx/${tx.hash}`} target="_blank" className="text-xs text-gray-500 hover:text-blue-400 underline mt-3 block transition-colors">
                                        Ver na Polygonscan ↗
                                    </a>
                                )}
                                
                                {tx.errorMessage && (
                                    <div className="mt-4 bg-red-900/20 border border-red-900/50 p-3 rounded-xl text-xs text-red-300/90 leading-relaxed font-mono">
                                        {tx.errorMessage}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>

        </div>
      </main>
    </div>
  );
}