import { useState, useEffect } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { formatEther, parseGwei, parseEther } from 'viem';
import bankAbi from '../abi/BankV6.json';

const CONTRACT_ADDRESS = '0x5f01cCFECe767EF5F72882F3D9F67274190eE2C7';

// Adicione isso aqui: O tradutor para ler o Token!
const erc20Abi = [
  {
    "inputs": [{ "internalType": "address", "name": "account", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
];

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
  const [amountBank, setAmountBank] = useState(''); // Para o input de Depositar/Sacar
  const [amountDex, setAmountDex] = useState('');   // Para o input de Comprar/Vender

  const [activeTab, setActiveTab] = useState('dashboard'); // Controla qual tela aparece

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

  // NOSSOS DADOS DINÂMICOS DA DEX E DO BANCO:
  const { data: withdrawFee } = useReadContract({ address: CONTRACT_ADDRESS, abi: bankAbi.abi, functionName: 'getWithdrawFee' });
  const { data: exchangeRate } = useReadContract({ address: CONTRACT_ADDRESS, abi: bankAbi.abi, functionName: 'feeExchange' });
  const { data: tokenStock } = useReadContract({ address: CONTRACT_ADDRESS, abi: bankAbi.abi, functionName: 'getStockTokens' });

  // NOSSAS DUAS NOVAS LEITURAS PARA OS COFRES:
  // 1. Pega o endereço do Token cadastrado no Banco
  const { data: tokenAddress } = useReadContract({ address: CONTRACT_ADDRESS, abi: bankAbi.abi, functionName: 'tokenExchange' });
  
  // 2. Lê quantos Tokens a pessoa tem na MetaMask dela
  const { data: userTokenBalance } = useReadContract({
      address: tokenAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address],
      query: { enabled: !!tokenAddress && !!address }
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
            gas: BigInt(500000), 
            maxPriorityFeePerGas: parseGwei('30'), 
            maxFeePerGas: parseGwei('100'),        
        });

        setTxHistory(prev => [{ id: Date.now(), action: 'Cadastro (KYC)', status: 'Aguardando Assinatura' }, ...prev]);
        
        writeContract({ 
            address: CONTRACT_ADDRESS, 
            abi: bankAbi.abi, 
            functionName: 'registerRequest', 
            args: [formData.name, BigInt(formData.age), formData.country],
            gas: BigInt(500000), 
            maxPriorityFeePerGas: parseGwei('30'), 
            maxFeePerGas: parseGwei('100'),        
           });
    } catch (error: any) {
        setTxHistory(prev => [{ id: Date.now(), action: 'Cadastro (KYC)', status: 'Erro', errorMessage: getErrorMessage(error) }, ...prev]);
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

  const handleDeposit = () => {
    if (!amountBank) return alert("Digite um valor para depositar!");
    writeContract({
        address: CONTRACT_ADDRESS, abi: bankAbi.abi,
        functionName: 'deposit',
        value: parseEther(amountBank), 
        gas: BigInt(500000), maxPriorityFeePerGas: parseGwei('30'), maxFeePerGas: parseGwei('100')
    });
    setTxHistory(prev => [{ id: Date.now(), action: `Depósito: ${amountBank} POL`, status: 'Aguardando Assinatura' }, ...prev]);
  };

  const handleWithdraw = () => {
    if (!amountBank) return alert("Digite um valor para sacar!");
    writeContract({
        address: CONTRACT_ADDRESS, abi: bankAbi.abi,
        functionName: 'withdraw',
        args: [parseEther(amountBank)], 
        gas: BigInt(500000), maxPriorityFeePerGas: parseGwei('30'), maxFeePerGas: parseGwei('100')
    });
    setTxHistory(prev => [{ id: Date.now(), action: `Saque: ${amountBank} POL`, status: 'Aguardando Assinatura' }, ...prev]);
  };

  const handleBuyTokens = () => {
    if (!amountDex) return alert("Digite um valor para comprar!");
    writeContract({
        address: CONTRACT_ADDRESS, abi: bankAbi.abi,
        functionName: 'buyToken', 
        value: parseEther(amountDex), 
        gas: BigInt(500000), maxPriorityFeePerGas: parseGwei('30'), maxFeePerGas: parseGwei('100')
    });
    setTxHistory(prev => [{ id: Date.now(), action: `Compra de TKN com ${amountDex} POL`, status: 'Aguardando Assinatura' }, ...prev]);
  };

  const handleSellTokens = () => {
    if (!amountDex) return alert("Digite a quantidade de tokens para vender!");
    writeContract({
        address: CONTRACT_ADDRESS, abi: bankAbi.abi,
        functionName: 'sellToken', 
        args: [parseEther(amountDex)], 
        gas: BigInt(500000), maxPriorityFeePerGas: parseGwei('30'), maxFeePerGas: parseGwei('100')
    });
    setTxHistory(prev => [{ id: Date.now(), action: `Venda de ${amountDex} TKN`, status: 'Aguardando Assinatura' }, ...prev]);
  };


  // =========================================================================
  // TELA 1: LANDING PAGE (Desconectado)
  // =========================================================================
  if (!isConnected) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-[#0B0E14] text-white relative overflow-hidden">
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
            <button 
                onClick={() => setActiveTab('dashboard')}
                className={`w-full flex items-center gap-4 p-4 rounded-xl font-semibold transition-all ${activeTab === 'dashboard' ? 'text-blue-400 bg-blue-500/10 border border-blue-500/20' : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'}`}
            >
                📊 <span>Dashboard</span>
            </button>
            <button 
                onClick={() => setActiveTab('cofres')}
                className={`w-full flex items-center gap-4 p-4 rounded-xl font-semibold transition-all ${activeTab === 'cofres' ? 'text-blue-400 bg-blue-500/10 border border-blue-500/20' : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'}`}
            >
                🏦 <span>Meus Cofres</span>
            </button>
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
                
                {/* LÓGICA DE ABAS (DASHBOARD VS COFRES) */}
                {activeTab === 'dashboard' ? (
                    <>
                        {/* STATUS DA CONTA (KYC) */}
                        <div className="bg-[#151A22]/80 backdrop-blur p-8 rounded-3xl shadow-xl border border-gray-800/60 relative overflow-hidden">
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

                        {/* SALDO E DEX */}
                        <div className={`grid grid-cols-1 md:grid-cols-2 gap-8 ${!isWhitelisted ? 'opacity-40 pointer-events-none grayscale' : ''}`}>
                            
                            {/* Saldo e Conta Corrente */}
                            <section className="bg-[#11151F] p-8 rounded-3xl border border-gray-800 shadow-xl flex flex-col justify-between">
                                <div>
                                    <h3 className="text-gray-400 uppercase text-xs font-bold mb-4 tracking-widest">Saldo em Caixa</h3>
                                    <p className="text-5xl font-black font-mono text-white mb-6">
                                        {bankBalance ? formatEther(bankBalance as bigint) : '0.00'} <span className="text-xl text-gray-500">POL</span>
                                    </p>
                                </div>
                                
                                <div className="space-y-4 mt-auto">
                                    <input 
                                        type="number" 
                                        placeholder="0.00 POL" 
                                        value={amountBank}
                                        onChange={(e) => setAmountBank(e.target.value)}
                                        className="w-full p-4 rounded-xl bg-[#06080C] border border-gray-700 text-white focus:border-blue-500 outline-none text-center text-xl font-mono"
                                    />
                                    <div className="flex gap-4">
                                        <button onClick={handleDeposit} disabled={isPending} className="flex-1 bg-white text-black p-4 rounded-xl font-bold hover:bg-gray-200 transition disabled:opacity-50">Depositar</button>
                                        <button onClick={handleWithdraw} disabled={isPending} className="flex-1 bg-transparent border border-gray-600 text-white p-4 rounded-xl font-bold hover:bg-gray-800 transition disabled:opacity-50">Sacar</button>
                                    </div>
                                    <div className="text-center pt-2">
                                        <span className="text-xs font-medium text-gray-500 bg-red-500/10 border border-red-500/20 px-3 py-1 rounded-full">
                                            ⚠️ Taxa de Saque: <span className="text-red-400 font-bold">
                                                {withdrawFee ? formatEther(withdrawFee as bigint) : '0.00'} POL
                                            </span>
                                        </span>
                                    </div>
                                </div>
                            </section>

                            {/* DEX (Câmbio) */}
                            <section className="bg-[#11151F] p-8 rounded-3xl border border-gray-800 shadow-xl relative flex flex-col justify-between">
                                <div>
                                    <div className="absolute top-4 right-4 bg-blue-600/20 text-blue-400 text-xs font-bold px-3 py-1 rounded-full border border-blue-500/30">DEX V6</div>
                                    <h3 className="text-gray-400 uppercase text-xs font-bold mb-4 tracking-widest">Câmbio Rápido</h3>
                                    
                                    <div className="bg-[#06080C] p-4 rounded-2xl border border-gray-800 flex flex-col gap-2 mb-6 mt-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-400 font-medium text-sm">Cotação:</span>
                                            <span className="text-blue-400 font-bold">1 POL = {exchangeRate ? String(exchangeRate) : '...'} TKN</span>
                                        </div>
                                        <div className="flex justify-between items-center border-t border-gray-800/60 pt-2">
                                            <span className="text-gray-500 font-medium text-xs">Estoque do Banco:</span>
                                            <span className="text-gray-300 font-mono text-xs">
                                                {tokenStock ? Number(formatEther(tokenStock as bigint)).toFixed(2) : '0.00'} TKN
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4 mt-auto">
                                    <input 
                                        type="number" 
                                        placeholder="Quantidade..." 
                                        value={amountDex}
                                        onChange={(e) => setAmountDex(e.target.value)}
                                        className="w-full p-4 rounded-xl bg-[#06080C] border border-gray-700 text-white focus:border-blue-500 outline-none text-center text-xl font-mono"
                                    />
                                    <div className="flex gap-4">
                                        <button onClick={handleBuyTokens} disabled={isPending} className="flex-1 bg-indigo-600/20 border border-indigo-500 text-indigo-300 p-4 rounded-xl font-bold hover:bg-indigo-600/30 transition shadow-[0_0_15px_rgba(79,70,229,0.1)] disabled:opacity-50">Comprar</button>
                                        <button onClick={handleSellTokens} disabled={isPending} className="flex-1 bg-pink-600/20 border border-pink-500 text-pink-300 p-4 rounded-xl font-bold hover:bg-pink-600/30 transition shadow-[0_0_15px_rgba(219,39,119,0.1)] disabled:opacity-50">Vender</button>
                                    </div>
                                </div>
                            </section>

                        </div>
                    </>
                ) : (
                    <div className="space-y-8 animate-fade-in">
                        <div className="bg-[#151A22]/80 backdrop-blur p-8 rounded-3xl shadow-xl border border-gray-800/60">
                            <h3 className="text-gray-400 uppercase tracking-widest text-xs font-bold mb-8 border-b border-gray-800/60 pb-4">Seus Ativos e Cofres</h3>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                
                                {/* COFRE DE POL (No Banco) */}
                                <div className="bg-[#0B0E14] p-6 rounded-2xl border border-gray-800 relative overflow-hidden group hover:border-blue-500/50 transition-colors">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
                                    <h4 className="text-gray-400 font-medium text-sm mb-2">Depositado no Banco</h4>
                                    <div className="flex items-end gap-2">
                                        <p className="text-4xl font-black font-mono text-white z-10">
                                            {bankBalance ? Number(formatEther(bankBalance as bigint)).toFixed(4) : '0.00'}
                                        </p>
                                        <span className="text-blue-500 font-bold mb-1 z-10">POL</span>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-4 z-10">Rede Polygon Amoy</p>
                                </div>

                                {/* COFRE DE TKN (Na Carteira) */}
                                <div className="bg-[#0B0E14] p-6 rounded-2xl border border-gray-800 relative overflow-hidden group hover:border-pink-500/50 transition-colors">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-pink-600/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
                                    <h4 className="text-gray-400 font-medium text-sm mb-2">Tokens na Carteira</h4>
                                    <div className="flex items-end gap-2">
                                        <p className="text-4xl font-black font-mono text-white z-10">
                                            {userTokenBalance ? Number(formatEther(userTokenBalance as bigint)).toFixed(2) : '0.00'}
                                        </p>
                                        <span className="text-pink-500 font-bold mb-1 z-10">TKN</span>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-4 text-truncate w-full block overflow-hidden text-ellipsis whitespace-nowrap z-10" title={tokenAddress ? String(tokenAddress) : ''}>
                                        Contrato: {tokenAddress ? String(tokenAddress) : 'Não carregado'}
                                    </p>
                                </div>

                            </div>
                        </div>
                    </div>
                )}
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