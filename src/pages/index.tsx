import { useState, useEffect } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { formatEther, parseGwei, parseEther } from 'viem';
import bankAbi from '../abi/BankV8.json';

const CONTRACT_ADDRESS = '0x5f01cCFECe767EF5F72882F3D9F67274190eE2C7';

/** Contrato: taxa = valorSolicitado × BPS ÷ 10_000 (100 BPS = 1%, 10_000 BPS = 100%). */
const BPS_DENOM = BigInt(10_000);

// ABI extra para o Marketplace NFT (V9), mantendo o JSON do V8 como base.
const nftMarketplaceAbi: any[] = [
  {
    inputs: [],
    name: 'nextListingId',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'listings',
    outputs: [
      { internalType: 'address', name: 'collection', type: 'address' },
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { internalType: 'uint256', name: 'price', type: 'uint256' },
      { internalType: 'bool', name: 'active', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'collection', type: 'address' },
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { internalType: 'uint256', name: 'price', type: 'uint256' },
    ],
    name: 'listNft',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'id', type: 'uint256' }],
    name: 'cancelListing',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'id', type: 'uint256' }],
    name: 'buy',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
];

const erc721Abi: any[] = [
  {
    inputs: [
      { internalType: 'address', name: 'operator', type: 'address' },
      { internalType: 'bool', name: 'approved', type: 'bool' },
    ],
    name: 'setApprovalForAll',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'address', name: 'operator', type: 'address' },
    ],
    name: 'isApprovedForAll',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
];

function formatWithdrawFeePercent(bps: bigint): string {
  const pct = Number(bps) / 100;
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 }).format(pct);
}

function parsePercentToBps(input: string): { bps: number; error?: string } {
  const n = Number(String(input).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return { bps: 0, error: 'Informe uma porcentagem válida (0 a 100).' };
  if (n > 100) return { bps: 0, error: 'A taxa não pode ser maior que 100%.' };
  const bps = Math.round(n * 100);
  if (bps > 10_000) return { bps: 0, error: 'Valor acima do máximo permitido pelo contrato (10.000 BPS).' };
  return { bps };
}

// TRADUTOR DO TOKEN ATUALIZADO COM "APPROVE" E "ALLOWANCE"
const erc20Abi = [
  {
    "inputs": [{ "internalType": "address", "name": "account", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
        { "internalType": "address", "name": "owner", "type": "address" },
        { "internalType": "address", "name": "spender", "type": "address" }
    ],
    "name": "allowance",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
        { "internalType": "address", "name": "spender", "type": "address" },
        { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
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

function AccountFlag({ address, kind, publicClient }: { address: string; kind: 'whitelist' | 'blocked'; publicClient: any }) {
  const [value, setValue] = useState<boolean | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        if (!publicClient) return;
        if (!address || !address.startsWith('0x') || address.length !== 42) return;
        const fn = kind === 'whitelist' ? 'isWhitelisted' : 'isBlocked';
        const v = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: bankAbi.abi as any,
          functionName: fn,
          args: [address],
        });
        setValue(Boolean(v));
      } catch (e) {
        console.error(e);
        setValue(null);
      }
    };
    run();
  }, [address, kind, publicClient]);

  if (value === null) return <span className="text-gray-500">—</span>;
  if (value) return <span className="text-red-400 font-bold">SIM</span>;
  return <span className="text-green-400 font-bold">NÃO</span>;
}

export default function Home() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  
  const [activeTab, setActiveTab] = useState('dashboard'); 
  const [txHistory, setTxHistory] = useState<TxLog[]>([]);
  
  // Estados dos inputs dos usuários
  const [formData, setFormData] = useState({ name: '', age: '', country: '' });
  const [amountBank, setAmountBank] = useState(''); 
  const [amountDex, setAmountDex] = useState('');   

  // Estados dos inputs do Administrador
  const [adminForm, setAdminForm] = useState({
      feeExchange: '',
      tokenAddress: '',
      polAmount: '',
      tokenAmount: '',
      withdrawFee: '',
      userAccount: '',
      nftCollection: '',
      nftTokenId: '',
      nftPricePol: '',
      nftCancelId: '',
      newOwner: '',
      checkAccount: ''
  });

  const [nftListings, setNftListings] = useState<
    { id: bigint; collection: string; tokenId: bigint; price: bigint; active: boolean }[]
  >([]);

  const [watchlist, setWatchlist] = useState<string[]>([]);

  // =========================================================
  // 1. LEITURAS (READ)
  // =========================================================
  
  const { data: contractOwner } = useReadContract({ address: CONTRACT_ADDRESS, abi: bankAbi.abi, functionName: 'owner' });
  const isAdmin =
    isConnected &&
    Boolean(address) &&
    Boolean(contractOwner) &&
    String(contractOwner).toLowerCase() === String(address).toLowerCase();

  const { data: isWhitelisted } = useReadContract({ address: CONTRACT_ADDRESS, abi: bankAbi.abi, functionName: 'isWhitelisted', args: [address], query: { enabled: !!address } });
  const { data: isBlocked } = useReadContract({ address: CONTRACT_ADDRESS, abi: bankAbi.abi, functionName: 'isBlocked', args: [address], query: { enabled: !!address } });
  const { data: bankBalance } = useReadContract({ address: CONTRACT_ADDRESS, abi: bankAbi.abi, functionName: 'getAccountBalance', args: [address], query: { enabled: !!address } });
  const { data: withdrawFee } = useReadContract({ address: CONTRACT_ADDRESS, abi: bankAbi.abi, functionName: 'getWithdrawFee' });
  const { data: exchangeRate } = useReadContract({ address: CONTRACT_ADDRESS, abi: bankAbi.abi, functionName: 'feeExchange' });
  const { data: tokenStock } = useReadContract({ address: CONTRACT_ADDRESS, abi: bankAbi.abi, functionName: 'getStockTokens' });
  const { data: dexPolLiquidity } = useReadContract({ address: CONTRACT_ADDRESS, abi: bankAbi.abi, functionName: 'liquidityPOL' });
  const { data: tokenAddress } = useReadContract({ address: CONTRACT_ADDRESS, abi: bankAbi.abi, functionName: 'tokenExchange' });
  const { data: userTokenBalance } = useReadContract({ address: tokenAddress as `0x${string}`, abi: erc20Abi, functionName: 'balanceOf', args: [address], query: { enabled: !!tokenAddress && !!address } });

  const { data: tokenAllowance } = useReadContract({
      address: tokenAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [address, CONTRACT_ADDRESS],
      query: { enabled: !!tokenAddress && !!address }
  });

  const { data: totalFeesCollected } = useReadContract({ address: CONTRACT_ADDRESS, abi: bankAbi.abi, functionName: 'getWithdrawFeeCollected', account: address });
  const { data: isPaused } = useReadContract({ address: CONTRACT_ADDRESS, abi: bankAbi.abi, functionName: 'isPaused' });

  const { data: nextListingId } = useReadContract({ address: CONTRACT_ADDRESS, abi: nftMarketplaceAbi, functionName: 'nextListingId' });

  // =========================================================
  // 2. ESCRITAS E AUTORIZAÇÕES (WRITE) 
  // =========================================================
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  const getErrorMessage = (err: any) => {
    if (!err) return null;
    const errorName = err.cause?.data?.errorName || err.cause?.cause?.errorName || err.cause?.reason || err.data?.errorName || err.errorName;
    if (errorName) return `Regra violada: ${errorName}`;
    return err.shortMessage || "A transação falhou na simulação.";
  };

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

  const handleApproveToken = (amountStr: string, context: string) => {
    if (!amountStr || isNaN(Number(amountStr))) return alert("Digite um valor válido!");
    writeContract({
        address: tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: 'approve',
        args: [CONTRACT_ADDRESS, parseEther(amountStr)],
        gas: BigInt(500000), maxPriorityFeePerGas: parseGwei('30'), maxFeePerGas: parseGwei('100')
    });
    setTxHistory(prev => [{ id: Date.now(), action: `Aprovação de TKN (${context})`, status: 'Aguardando Assinatura' }, ...prev]);
  };

  const handleRegister = async () => {
    if (!formData.name || !formData.age || !formData.country) return alert("Preencha todos os campos!");
    try {
        await publicClient?.simulateContract({ address: CONTRACT_ADDRESS, abi: bankAbi.abi, functionName: 'registerRequest', args: [formData.name, BigInt(formData.age), formData.country], account: address, gas: BigInt(500000), maxPriorityFeePerGas: parseGwei('30'), maxFeePerGas: parseGwei('100') });
        setTxHistory(prev => [{ id: Date.now(), action: 'Cadastro (KYC)', status: 'Aguardando Assinatura' }, ...prev]);
        writeContract({ address: CONTRACT_ADDRESS, abi: bankAbi.abi, functionName: 'registerRequest', args: [formData.name, BigInt(formData.age), formData.country], gas: BigInt(500000), maxPriorityFeePerGas: parseGwei('30'), maxFeePerGas: parseGwei('100') });
    } catch (error: any) { setTxHistory(prev => [{ id: Date.now(), action: 'Cadastro (KYC)', status: 'Erro', errorMessage: getErrorMessage(error) }, ...prev]); }
  };

  const handleDeposit = () => {
    if (!amountBank || isNaN(Number(amountBank))) return alert("Digite um valor válido para depositar!");
    writeContract({ address: CONTRACT_ADDRESS, abi: bankAbi.abi, functionName: 'deposit', value: parseEther(amountBank), gas: BigInt(500000), maxPriorityFeePerGas: parseGwei('30'), maxFeePerGas: parseGwei('100') });
    setTxHistory(prev => [{ id: Date.now(), action: `Depósito: ${amountBank} POL`, status: 'Aguardando Assinatura' }, ...prev]);
  };

  const handleWithdraw = () => {
    if (!amountBank || isNaN(Number(amountBank))) return alert("Digite um valor válido para sacar!");
    writeContract({ address: CONTRACT_ADDRESS, abi: bankAbi.abi, functionName: 'withdraw', args: [parseEther(amountBank)], gas: BigInt(500000), maxPriorityFeePerGas: parseGwei('30'), maxFeePerGas: parseGwei('100') });
    setTxHistory(prev => [{ id: Date.now(), action: `Saque: ${amountBank} POL`, status: 'Aguardando Assinatura' }, ...prev]);
  };

  const handleBuyTokens = () => {
    if (!amountDex || isNaN(Number(amountDex))) return alert("Digite um valor válido para comprar!");
    writeContract({ address: CONTRACT_ADDRESS, abi: bankAbi.abi, functionName: 'buyToken', value: parseEther(amountDex), gas: BigInt(500000), maxPriorityFeePerGas: parseGwei('30'), maxFeePerGas: parseGwei('100') });
    setTxHistory(prev => [{ id: Date.now(), action: `Compra de TKN com ${amountDex} POL`, status: 'Aguardando Assinatura' }, ...prev]);
  };

  const handleSellTokens = () => {
    if (!amountDex || isNaN(Number(amountDex))) return alert("Digite uma quantidade válida de tokens para vender!");
    writeContract({ address: CONTRACT_ADDRESS, abi: bankAbi.abi, functionName: 'sellToken', args: [parseEther(amountDex)], gas: BigInt(500000), maxPriorityFeePerGas: parseGwei('30'), maxFeePerGas: parseGwei('100') });
    setTxHistory(prev => [{ id: Date.now(), action: `Venda de ${amountDex} TKN`, status: 'Aguardando Assinatura' }, ...prev]);
  };

  const handleTransferOwnership = () => {
    if (!adminForm.newOwner || !adminForm.newOwner.startsWith('0x') || adminForm.newOwner.length !== 42) {
      return alert("Informe um endereço válido (0x...).");
    }
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: bankAbi.abi,
      functionName: 'transferOwnership',
      args: [adminForm.newOwner],
      gas: BigInt(500000),
      maxPriorityFeePerGas: parseGwei('30'),
      maxFeePerGas: parseGwei('100'),
    });
    setTxHistory(prev => [{ id: Date.now(), action: `Admin: Transferir ownership`, status: 'Aguardando Assinatura' }, ...prev]);
  };

  const executeAdminTx = (actionName: string, functionName: string, args: any[] = [], value: bigint = BigInt(0)) => {
      try {
          writeContract({ address: CONTRACT_ADDRESS, abi: bankAbi.abi, functionName, args, value, gas: BigInt(500000), maxPriorityFeePerGas: parseGwei('30'), maxFeePerGas: parseGwei('100') });
          setTxHistory(prev => [{ id: Date.now(), action: `Admin: ${actionName}`, status: 'Aguardando Assinatura' }, ...prev]);
      } catch (error) { console.error(error); }
  };

  const handleBuyNft = (id: bigint, price: bigint) => {
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: nftMarketplaceAbi,
      functionName: 'buy',
      args: [id],
      value: price,
      gas: BigInt(700000),
      maxPriorityFeePerGas: parseGwei('30'),
      maxFeePerGas: parseGwei('100'),
    });
    setTxHistory(prev => [{ id: Date.now(), action: `Compra NFT (listing ${id.toString()})`, status: 'Aguardando Assinatura' }, ...prev]);
  };


  // =========================================================
  // CALCULADORAS BLINDADAS CONTRA ERROS E UX DE TAXA
  // =========================================================
  const safeAmountDex = amountDex && !isNaN(Number(amountDex)) ? parseEther(amountDex) : BigInt(0);
  const safeAdminTokenAmount = adminForm.tokenAmount && !isNaN(Number(adminForm.tokenAmount)) ? parseEther(adminForm.tokenAmount) : BigInt(0);

  const isDexApprovalNeeded = safeAmountDex > BigInt(0) && (tokenAllowance as bigint || BigInt(0)) < safeAmountDex;
  const isAdminApprovalNeeded = safeAdminTokenAmount > BigInt(0) && (tokenAllowance as bigint || BigInt(0)) < safeAdminTokenAmount;

  // Taxa de saque em BPS → exibida como % real; estimativa igual à fórmula on-chain
  const withdrawFeeBps = withdrawFee != null ? BigInt(withdrawFee as any) : null;
  const withdrawFeePercentLabel =
    withdrawFeeBps != null ? formatWithdrawFeePercent(withdrawFeeBps) : '—';
  let estimatedFeeWei: bigint | null = null;
  if (withdrawFeeBps != null && amountBank && !isNaN(Number(amountBank)) && Number(amountBank) > 0) {
    try {
      estimatedFeeWei = (parseEther(amountBank) * withdrawFeeBps) / BPS_DENOM;
    } catch {
      estimatedFeeWei = null;
    }
  }
  const estimatedFeePOL =
    estimatedFeeWei != null ? Number(formatEther(estimatedFeeWei)) : 0;

  // =========================================================
  // MARKETPLACE: carregar listagens via publicClient (evita hooks dinâmicos)
  // =========================================================
  useEffect(() => {
    const run = async () => {
      try {
        if (!publicClient) return;
        const next = (nextListingId as bigint | undefined) ?? BigInt(0);
        if (next === BigInt(0)) {
          setNftListings([]);
          return;
        }

        const items: { id: bigint; collection: string; tokenId: bigint; price: bigint; active: boolean }[] = [];
        for (let i = BigInt(0); i < next; i++) {
          const l = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: nftMarketplaceAbi as any,
            functionName: 'listings',
            args: [i],
          });
          const [collection, tokenId, price, active] = l as any;
          items.push({ id: i, collection, tokenId, price, active: Boolean(active) });
        }
        setNftListings(items);
      } catch (e) {
        console.error(e);
      }
    };
    run();
  }, [publicClient, nextListingId]);


  // =========================================================================
  // TELA 1: LANDING PAGE
  // =========================================================================
  if (!isConnected) {
      return (
        <main className="flex flex-col items-center justify-center min-h-screen bg-[#0B0E14] text-white relative overflow-hidden">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-blue-600/20 rounded-full blur-[120px]"></div>
          <div className="z-10 flex flex-col items-center text-center p-8">
              <div className="mb-6 p-4 bg-white/5 rounded-3xl border border-white/10 backdrop-blur-md shadow-2xl">
                  <h1 className="text-6xl font-black bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent tracking-tighter drop-shadow-[0_0_20px_rgba(56,189,248,0.4)] hover:scale-105 transition-transform cursor-default">
                      BANK <span className="text-white drop-shadow-none">PROXY</span>
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
  // TELA 2: INTERFACE DO APP CONECTADO
  // =========================================================================
  return (
    <div className="flex h-screen bg-[#0B0E14] text-white font-sans overflow-hidden">
      
      <aside className="w-72 bg-[#12161F] border-r border-gray-800/60 hidden lg:flex flex-col shadow-2xl z-20">
         <div className="h-24 flex items-center justify-center border-b border-gray-800/60">
            <h1 className="text-2xl font-black tracking-widest bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(56,189,248,0.3)] cursor-default">
                BANK PROXY
            </h1>
         </div>
         <nav className="flex-1 p-6 space-y-4">
            <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center gap-4 p-4 rounded-xl font-semibold transition-all ${activeTab === 'dashboard' ? 'text-blue-400 bg-blue-500/10 border border-blue-500/20' : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'}`}>
                📊 <span>Dashboard</span>
            </button>
            <button onClick={() => setActiveTab('cofres')} className={`w-full flex items-center gap-4 p-4 rounded-xl font-semibold transition-all ${activeTab === 'cofres' ? 'text-blue-400 bg-blue-500/10 border border-blue-500/20' : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'}`}>
                🏦 <span>Meus Cofres</span>
            </button>

            <button onClick={() => setActiveTab('nft')} className={`w-full flex items-center gap-4 p-4 rounded-xl font-semibold transition-all ${activeTab === 'nft' ? 'text-blue-400 bg-blue-500/10 border border-blue-500/20' : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'}`}>
                🖼️ <span>NFT MARKET PLACE</span>
            </button>
            
            {isAdmin && (
                <button onClick={() => setActiveTab('admin')} className={`w-full flex items-center gap-4 p-4 rounded-xl font-bold transition-all shadow-[0_0_15px_rgba(234,179,8,0.1)] ${activeTab === 'admin' ? 'text-yellow-400 bg-yellow-500/10 border border-yellow-500/30' : 'text-yellow-600/60 hover:text-yellow-400 hover:bg-yellow-500/5 border border-transparent'}`}>
                    ⚙️ <span>Painel Admin</span>
                </button>
            )}
         </nav>
         <div className="p-6 border-t border-gray-800/60">
            <div className="flex items-center gap-3 text-sm text-gray-500">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                Rede Polygon Amoy
            </div>
         </div>
      </aside>

      <main className="flex-1 flex flex-col h-full overflow-y-auto relative bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed">
        
        <header className="flex justify-between items-center p-6 border-b border-gray-800/60 bg-[#0B0E14]/80 backdrop-blur-lg sticky top-0 z-10 shadow-md">
            <h2 className="text-2xl font-bold tracking-tight">
                {activeTab === 'dashboard'
                  ? 'Visão Geral'
                  : activeTab === 'cofres'
                    ? 'Seus Ativos e Cofres'
                    : activeTab === 'nft'
                      ? 'NFT Market Place'
                      : 'Centro de Comando (Dono)'}
            </h2>
            <ConnectButton />
        </header>

        <div className="p-6 md:p-10 max-w-7xl mx-auto w-full grid gap-8 grid-cols-1 xl:grid-cols-3">
            <div className="xl:col-span-2 space-y-8">
                
                {/* ============================== */}
                {/* ABA 1: DASHBOARD */}
                {/* ============================== */}
                {activeTab === 'dashboard' && (
                    <div className="space-y-8 animate-fade-in">
                        
                        <div className="bg-[#151A22]/80 backdrop-blur p-8 rounded-3xl shadow-xl border border-gray-800/60 relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-transparent"></div>
                            <h3 className="text-gray-400 uppercase tracking-widest text-xs font-bold mb-6 flex items-center gap-2">🛡️ Verificação de Identidade</h3>
                            
                            {isBlocked ? (
                                <div className="flex items-center gap-5 bg-red-500/10 p-6 rounded-2xl border border-red-500/30">
                                    <div className="bg-red-500/20 p-4 rounded-full text-3xl shadow-[0_0_15px_rgba(239,68,68,0.3)]">🚫</div>
                                    <div>
                                        <p className="font-bold text-xl text-red-400 tracking-tight">Conta Suspensa</p>
                                        <p className="text-sm text-red-300 mt-1">Sua conta foi bloqueada pela administração do banco. Todas as operações estão desativadas no momento.</p>
                                    </div>
                                </div>
                            ) : isWhitelisted ? (
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
                                        <span>⚠️</span><p>Sua conta está restrita. Conclua o registro no Smart Contract para operar.</p>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <input placeholder="Nome Completo" className="w-full p-4 rounded-xl bg-[#0B0E14] border border-gray-700 outline-none focus:border-blue-500 text-white" onChange={(e) => setFormData({...formData, name: e.target.value})} />
                                        <input placeholder="Idade" type="number" className="w-full p-4 rounded-xl bg-[#0B0E14] border border-gray-700 outline-none focus:border-blue-500 text-white" onChange={(e) => setFormData({...formData, age: e.target.value})} />
                                        <input placeholder="País" className="w-full p-4 rounded-xl bg-[#0B0E14] border border-gray-700 outline-none focus:border-blue-500 text-white" onChange={(e) => setFormData({...formData, country: e.target.value})} />
                                    </div>
                                    <button onClick={handleRegister} disabled={isPending || isConfirming} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 rounded-xl disabled:opacity-50">
                                        {isPending ? "✍️ Assine na sua Carteira..." : isConfirming ? "⏳ Validando na Blockchain..." : "Enviar Registro Oficial"}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* DESATIVA A TELA SE O USUÁRIO NÃO FOR VIP OU ESTIVER BLOQUEADO */}
                        <div className={`grid grid-cols-1 md:grid-cols-2 gap-8 ${(!isWhitelisted || isBlocked) ? 'opacity-40 pointer-events-none grayscale' : ''}`}>
                            
                            {/* SALDO DO BANCO */}
                            <section className="bg-[#11151F] p-8 rounded-3xl border border-gray-800 shadow-xl flex flex-col justify-between">
                                <div>
                                    <h3 className="text-gray-400 uppercase text-xs font-bold mb-4 tracking-widest">Saldo em Caixa</h3>
                                    <p className="text-5xl font-black font-mono text-white mb-6">
                                        {bankBalance ? formatEther(bankBalance as bigint) : '0.00'} <span className="text-xl text-gray-500">POL</span>
                                    </p>
                                </div>
                                <div className="space-y-4 mt-auto">
                                    <input type="number" placeholder="0.00 POL" value={amountBank} onChange={(e) => setAmountBank(e.target.value)} className="w-full p-4 rounded-xl bg-[#06080C] border border-gray-700 text-white outline-none focus:border-blue-500 text-center text-xl font-mono" />
                                    <div className="flex gap-4">
                                        <button onClick={handleDeposit} disabled={isPending} className="flex-1 bg-white text-black p-4 rounded-xl font-bold hover:bg-gray-200 disabled:opacity-50">Depositar</button>
                                        <button onClick={handleWithdraw} disabled={isPending} className="flex-1 bg-transparent border border-gray-600 text-white p-4 rounded-xl font-bold hover:bg-gray-800 disabled:opacity-50">Sacar</button>
                                    </div>
                                    <div className="text-center pt-2">
                                        {/* AQUI ESTÁ A ATUALIZAÇÃO VISUAL DA TAXA PARA O USUÁRIO 👇 */}
                                        <span className="text-[11px] md:text-xs font-medium text-gray-500 bg-red-500/10 border border-red-500/20 px-3 py-1 rounded-full whitespace-nowrap overflow-hidden text-ellipsis block">
                                            ⚠️ Taxa de Saque:{' '}
                                            {withdrawFeeBps != null ? (
                                              <span className="text-red-400 font-bold">{withdrawFeePercentLabel}%</span>
                                            ) : (
                                              <span className="text-red-400 font-bold">—</span>
                                            )}
                                            {estimatedFeePOL > 0 && (
                                                <span className="text-gray-400 ml-1"> (Est. -{estimatedFeePOL.toFixed(4)} POL)</span>
                                            )}
                                        </span>
                                    </div>
                                </div>
                            </section>

                            {/* CÂMBIO RÁPIDO (DEX) */}
                            <section className="bg-[#11151F] p-8 rounded-3xl border border-gray-800 shadow-xl relative flex flex-col justify-between">
                                <div>
                                    <div className="absolute top-4 right-4 bg-purple-600/20 text-purple-400 text-xs font-bold px-3 py-1 rounded-full border border-purple-500/30">V7 ACTIVE</div>
                                    <h3 className="text-gray-400 uppercase text-xs font-bold mb-4 tracking-widest">Câmbio Rápido</h3>
                                    
                                    <div className="bg-[#06080C] p-4 rounded-2xl border border-gray-800 flex flex-col gap-2 mb-6 mt-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-400 font-medium text-sm">Cotação:</span>
                                            <span className="text-blue-400 font-bold">1 POL = {exchangeRate ? String(exchangeRate) : '...'} TKN</span>
                                        </div>
                                        <div className="flex justify-between items-start border-t border-gray-800/60 pt-3 mt-1">
                                            <span className="text-gray-500 font-medium text-xs mt-1">Estoque do Banco:</span>
                                            <div className="flex flex-col items-end gap-1">
                                                <span className="text-pink-400 font-mono text-sm font-bold">{tokenStock ? Number(formatEther(tokenStock as bigint)).toFixed(2) : '0.00'} TKN</span>
                                                <span className="text-blue-400 font-mono text-sm font-bold">{dexPolLiquidity ? Number(formatEther(dexPolLiquidity as bigint)).toFixed(4) : '0.00'} POL</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4 mt-auto">
                                    <div className="flex flex-col gap-2">
                                        <input 
                                            type="number" 
                                            placeholder="Quantidade..." 
                                            value={amountDex}
                                            onChange={(e) => setAmountDex(e.target.value)}
                                            className="w-full p-4 rounded-xl bg-[#06080C] border border-gray-700 text-white outline-none focus:border-blue-500 text-center text-xl font-mono" 
                                        />
                                        
                                        <div className="flex flex-col px-2 text-[11px] font-medium min-h-[32px] gap-1 mt-1">
                                            {amountDex && !isNaN(Number(amountDex)) && Number(amountDex) > 0 && exchangeRate ? (
                                                <>
                                                    <span className="text-indigo-400">
                                                        🟢 Paga <b>{amountDex} POL</b> ➔ Recebe <b>{(Number(amountDex) * Number(exchangeRate as bigint)).toLocaleString()} TKN</b>
                                                    </span>
                                                    <span className="text-pink-400">
                                                        🔴 Paga <b>{amountDex} TKN</b> ➔ Recebe <b>{(Number(amountDex) / Number(exchangeRate as bigint)).toFixed(4)} POL</b>
                                                    </span>
                                                </>
                                            ) : (
                                                <span></span> 
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex gap-4">
                                        <button onClick={handleBuyTokens} disabled={isPending} className="flex-1 bg-indigo-600/20 border border-indigo-500 text-indigo-300 p-4 rounded-xl font-bold hover:bg-indigo-600/30 disabled:opacity-50">Comprar</button>
                                        
                                        {isDexApprovalNeeded ? (
                                            <button onClick={() => handleApproveToken(amountDex, 'Vender TKN')} disabled={isPending} className="flex-1 bg-orange-600/20 border border-orange-500 text-orange-300 p-4 rounded-xl font-bold hover:bg-orange-600/30 transition disabled:opacity-50 shadow-[0_0_15px_rgba(249,115,22,0.1)]">
                                                1º Aprovar
                                            </button>
                                        ) : (
                                            <button onClick={handleSellTokens} disabled={isPending} className="flex-1 bg-pink-600/20 border border-pink-500 text-pink-300 p-4 rounded-xl font-bold hover:bg-pink-600/30 transition shadow-[0_0_15px_rgba(219,39,119,0.1)] disabled:opacity-50">
                                                Vender
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </section>
                        </div>
                    </div>
                )}

                {/* ============================== */}
                {/* ABA 2: MEUS COFRES */}
                {/* ============================== */}
                {activeTab === 'cofres' && (
                    <div className="space-y-8 animate-fade-in">
                        <div className="bg-[#151A22]/80 backdrop-blur p-8 rounded-3xl shadow-xl border border-gray-800/60">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                                <div className="bg-[#0B0E14] p-6 rounded-2xl border border-gray-800 relative overflow-hidden group hover:border-blue-500/50 transition-colors">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
                                    <h4 className="text-gray-400 font-medium text-sm mb-2">Depositado no Banco</h4>
                                    <div className="flex items-end gap-2">
                                        <p className="text-4xl font-black font-mono text-white z-10">{bankBalance ? Number(formatEther(bankBalance as bigint)).toFixed(4) : '0.00'}</p>
                                        <span className="text-blue-500 font-bold mb-1 z-10">POL</span>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-4 z-10">Rede Polygon Amoy</p>
                                </div>

                                <div className="bg-[#0B0E14] p-6 rounded-2xl border border-gray-800 relative overflow-hidden group hover:border-pink-500/50 transition-colors">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-pink-600/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
                                    <h4 className="text-gray-400 font-medium text-sm mb-2">Tokens na Carteira</h4>
                                    <div className="flex items-end gap-2">
                                        <p className="text-4xl font-black font-mono text-white z-10">{userTokenBalance ? Number(formatEther(userTokenBalance as bigint)).toFixed(2) : '0.00'}</p>
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

                {/* ============================== */}
                {/* ABA 3: NFT MARKET PLACE */}
                {/* ============================== */}
                {activeTab === 'nft' && (
                    <div className="space-y-8 animate-fade-in">
                        <div className="bg-[#151A22]/80 backdrop-blur p-8 rounded-3xl shadow-xl border border-gray-800/60 relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-transparent"></div>
                            <h3 className="text-gray-400 uppercase tracking-widest text-xs font-bold mb-3 flex items-center gap-2">🧩 Marketplace on-chain (escrow no proxy)</h3>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                Qualquer carteira conectada pode ver as listagens. <span className="text-white font-semibold">Somente contas cadastradas (KYC/Whitelist) conseguem comprar.</span>
                            </p>
                            {!isWhitelisted && (
                              <div className="mt-4 bg-yellow-500/10 p-4 rounded-xl border border-yellow-500/20 text-yellow-300 text-sm flex gap-3">
                                  <span>⚠️</span><p>Você ainda não está cadastrado. Vá na aba <b>Dashboard</b> e conclua o registro para poder comprar.</p>
                              </div>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {nftListings.filter(l => l.active).length === 0 ? (
                            <div className="bg-[#11151F] p-8 rounded-3xl border border-gray-800 shadow-xl md:col-span-2">
                              <p className="text-gray-400">Nenhuma listagem ativa no momento.</p>
                            </div>
                          ) : (
                            nftListings.filter(l => l.active).map((l) => (
                              <div key={l.id.toString()} className="bg-[#11151F] p-8 rounded-3xl border border-gray-800 shadow-xl flex flex-col gap-4">
                                <div className="flex items-center justify-between">
                                  <h4 className="font-bold tracking-tight">Listing #{l.id.toString()}</h4>
                                  <span className="text-[11px] text-purple-300 bg-purple-600/15 border border-purple-500/25 px-3 py-1 rounded-full">ATIVA</span>
                                </div>
                                <div className="space-y-1 text-sm text-gray-400">
                                  <p><span className="text-gray-500">Coleção:</span> <span className="text-white font-mono text-xs break-all">{l.collection}</span></p>
                                  <p><span className="text-gray-500">TokenId:</span> <span className="text-white font-mono">{l.tokenId.toString()}</span></p>
                                  <p><span className="text-gray-500">Preço:</span> <span className="text-white font-bold">{Number(formatEther(l.price)).toFixed(4)} POL</span></p>
                                </div>
                                <button
                                  onClick={() => handleBuyNft(l.id, l.price)}
                                  disabled={!Boolean(isWhitelisted) || isPending || isConfirming}
                                  className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-4 rounded-xl disabled:opacity-50"
                                >
                                  {!isWhitelisted ? 'Somente cadastrado pode comprar' : isPending ? '✍️ Assine na sua Carteira...' : isConfirming ? '⏳ Confirmando compra...' : 'Comprar'}
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                    </div>
                )}

                {/* ============================== */}
                {/* ABA 4: PAINEL ADMIN */}
                {/* ============================== */}
                {activeTab === 'admin' && isAdmin && (
                    <div className="space-y-6 animate-fade-in">
                        {Boolean(isPaused) && (
                            <div className="bg-red-500/20 border border-red-500 p-4 rounded-2xl flex items-center justify-between">
                                <span className="text-red-400 font-bold">⚠️ O CONTRATO ESTÁ PAUSADO! Movimentações bloqueadas.</span>
                                <button onClick={() => executeAdminTx('Despausar Contrato', 'unBreakContract')} className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg font-bold">Reativar</button>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            
                            <div className="bg-[#151A22]/90 p-6 rounded-3xl border border-gray-800 md:col-span-2">
                                <h3 className="text-yellow-500 font-bold mb-4 border-b border-gray-800 pb-2">📌 Informações atuais do Contrato</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="bg-[#06080C] p-4 rounded-2xl border border-gray-800">
                                        <span className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">Proxy (Bank) address</span>
                                        <p className="text-sm font-mono text-white break-all">{CONTRACT_ADDRESS}</p>
                                    </div>
                                    <div className="bg-[#06080C] p-4 rounded-2xl border border-gray-800">
                                        <span className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">Owner atual</span>
                                        <p className="text-sm font-mono text-white break-all">{contractOwner ? String(contractOwner) : '—'}</p>
                                    </div>
                                    <div className="bg-[#06080C] p-4 rounded-2xl border border-gray-800">
                                        <span className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">Token ERC20 atual (tokenExchange)</span>
                                        <p className="text-sm font-mono text-white break-all">{tokenAddress ? String(tokenAddress) : '—'}</p>
                                    </div>
                                    <div className="bg-[#06080C] p-4 rounded-2xl border border-gray-800">
                                        <span className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">Conversão atual (feeExchange)</span>
                                        <p className="text-sm text-white">
                                          {exchangeRate != null ? (
                                            <>
                                              <span className="font-bold text-blue-400">1 POL</span> ={' '}
                                              <span className="font-bold text-pink-400">{String(exchangeRate)}</span> TKN
                                            </>
                                          ) : '—'}
                                        </p>
                                    </div>
                                    <div className="bg-[#06080C] p-4 rounded-2xl border border-gray-800 md:col-span-2">
                                        <span className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">Taxa atual de saque (withdrawFee)</span>
                                        <p className="text-sm text-white">
                                          {withdrawFeeBps != null ? (
                                            <>
                                              <span className="font-bold text-red-400">{withdrawFeePercentLabel}%</span>{' '}
                                              <span className="text-gray-500">( {withdrawFeeBps.toString()} BPS )</span>
                                            </>
                                          ) : '—'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-[#151A22]/90 p-6 rounded-3xl border border-gray-800 md:col-span-2">
                                <h3 className="text-yellow-500 font-bold mb-4 border-b border-gray-800 pb-2">🖼️ NFT MARKET PLACE (Admin)</h3>
                                <p className="text-[11px] text-gray-500 mb-4 leading-snug">
                                    Fluxo: <b>1)</b> na coleção ERC721 execute <code className="text-gray-300">setApprovalForAll(proxy, true)</code> para o proxy <span className="font-mono text-gray-300">{CONTRACT_ADDRESS}</span>. <b>2)</b> liste abaixo (o NFT vai para escrow no contrato). <b>3)</b> compradores cadastrados pagam em POL (msg.value).
                                </p>

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                  <div className="bg-[#06080C] p-4 rounded-2xl border border-gray-800">
                                    <label className="text-xs text-gray-500">Coleção (ERC721)</label>
                                    <input
                                      placeholder="0x..."
                                      className="w-full mt-2 bg-[#0B0E14] p-3 rounded-lg border border-gray-700 outline-none focus:border-yellow-500 text-xs"
                                      onChange={(e) => setAdminForm({ ...adminForm, nftCollection: e.target.value })}
                                      value={adminForm.nftCollection}
                                    />
                                    <div className="flex gap-2 mt-3">
                                      <button
                                        onClick={() => {
                                          if (!adminForm.nftCollection) return alert('Informe a coleção.');
                                          writeContract({
                                            address: adminForm.nftCollection as `0x${string}`,
                                            abi: erc721Abi as any,
                                            functionName: 'setApprovalForAll',
                                            args: [CONTRACT_ADDRESS, true],
                                            gas: BigInt(300000),
                                            maxPriorityFeePerGas: parseGwei('30'),
                                            maxFeePerGas: parseGwei('100'),
                                          });
                                          setTxHistory(prev => [{ id: Date.now(), action: `Admin: Aprovar coleção ERC721`, status: 'Aguardando Assinatura' }, ...prev]);
                                        }}
                                        className="flex-1 bg-orange-600/20 border border-orange-500 text-orange-300 p-3 rounded-xl font-bold hover:bg-orange-600/30 disabled:opacity-50"
                                        disabled={isPending || isConfirming}
                                      >
                                        1º Aprovar (setApprovalForAll)
                                      </button>
                                    </div>
                                  </div>

                                  <div className="bg-[#06080C] p-4 rounded-2xl border border-gray-800">
                                    <label className="text-xs text-gray-500">TokenId</label>
                                    <input
                                      type="number"
                                      placeholder="Ex: 0"
                                      className="w-full mt-2 bg-[#0B0E14] p-3 rounded-lg border border-gray-700 outline-none focus:border-yellow-500"
                                      onChange={(e) => setAdminForm({ ...adminForm, nftTokenId: e.target.value })}
                                      value={adminForm.nftTokenId}
                                    />
                                    <label className="text-xs text-gray-500 mt-3 block">Preço (POL)</label>
                                    <input
                                      type="number"
                                      placeholder="Ex: 1.0"
                                      className="w-full mt-2 bg-[#0B0E14] p-3 rounded-lg border border-gray-700 outline-none focus:border-yellow-500"
                                      onChange={(e) => setAdminForm({ ...adminForm, nftPricePol: e.target.value })}
                                      value={adminForm.nftPricePol}
                                    />
                                    <button
                                      onClick={() => {
                                        if (!adminForm.nftCollection) return alert('Informe a coleção.');
                                        if (!adminForm.nftTokenId) return alert('Informe o tokenId.');
                                        if (!adminForm.nftPricePol || isNaN(Number(adminForm.nftPricePol)) || Number(adminForm.nftPricePol) <= 0) return alert('Informe um preço válido.');
                                        writeContract({
                                          address: CONTRACT_ADDRESS,
                                          abi: nftMarketplaceAbi,
                                          functionName: 'listNft',
                                          args: [adminForm.nftCollection, BigInt(adminForm.nftTokenId), parseEther(adminForm.nftPricePol)],
                                          gas: BigInt(900000),
                                          maxPriorityFeePerGas: parseGwei('30'),
                                          maxFeePerGas: parseGwei('100'),
                                        });
                                        setTxHistory(prev => [{ id: Date.now(), action: `Admin: Listar NFT (tokenId ${adminForm.nftTokenId})`, status: 'Aguardando Assinatura' }, ...prev]);
                                      }}
                                      className="w-full mt-4 bg-yellow-600/20 border border-yellow-500/30 hover:bg-yellow-600/30 text-yellow-300 p-3 rounded-xl font-bold"
                                      disabled={isPending || isConfirming}
                                    >
                                      2º Listar (escrow)
                                    </button>
                                  </div>

                                  <div className="bg-[#06080C] p-4 rounded-2xl border border-gray-800">
                                    <label className="text-xs text-gray-500">Cancelar listing (id)</label>
                                    <input
                                      type="number"
                                      placeholder="Ex: 0"
                                      className="w-full mt-2 bg-[#0B0E14] p-3 rounded-lg border border-gray-700 outline-none focus:border-yellow-500"
                                      onChange={(e) => setAdminForm({ ...adminForm, nftCancelId: e.target.value })}
                                      value={adminForm.nftCancelId}
                                    />
                                    <button
                                      onClick={() => {
                                        if (!adminForm.nftCancelId) return alert('Informe o id.');
                                        writeContract({
                                          address: CONTRACT_ADDRESS,
                                          abi: nftMarketplaceAbi,
                                          functionName: 'cancelListing',
                                          args: [BigInt(adminForm.nftCancelId)],
                                          gas: BigInt(700000),
                                          maxPriorityFeePerGas: parseGwei('30'),
                                          maxFeePerGas: parseGwei('100'),
                                        });
                                        setTxHistory(prev => [{ id: Date.now(), action: `Admin: Cancelar listing ${adminForm.nftCancelId}`, status: 'Aguardando Assinatura' }, ...prev]);
                                      }}
                                      className="w-full mt-4 bg-red-600/20 border border-red-500/30 hover:bg-red-600/30 text-red-300 p-3 rounded-xl font-bold"
                                      disabled={isPending || isConfirming}
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                </div>
                            </div>
                            
                            <div className="bg-[#151A22]/90 p-6 rounded-3xl border border-gray-800">
                                <h3 className="text-yellow-500 font-bold mb-4 border-b border-gray-800 pb-2">💱 Câmbio e Token</h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs text-gray-500">Taxa de Câmbio (multiplicador inteiro)</label>
                                        <p className="text-[10px] text-gray-500 mb-1 leading-snug">
                                            Não é porcentagem. É o fator da cotação: tokens recebidos ≈ POL enviado × este número; ao vender, POL ≈ TKN ÷ este número. Ex.: 100 ⇒ 1 POL compra 100 unidades do token (conforme decimais do ERC-20).
                                        </p>
                                        <div className="flex gap-2 mt-1">
                                            <input type="number" placeholder="Ex: 100" className="flex-1 bg-[#06080C] p-3 rounded-lg border border-gray-700 outline-none focus:border-yellow-500" onChange={e => setAdminForm({...adminForm, feeExchange: e.target.value})} />
                                            <button onClick={() => executeAdminTx('Atualizar Câmbio', 'updateFeeExchange', [BigInt(adminForm.feeExchange)])} className="bg-gray-800 hover:bg-gray-700 px-4 rounded-lg font-bold text-yellow-400">Salvar</button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500">Endereço do Token (ERC20)</label>
                                        <div className="flex gap-2 mt-1">
                                            <input placeholder="0x..." className="flex-1 bg-[#06080C] p-3 rounded-lg border border-gray-700 outline-none focus:border-yellow-500 text-xs" onChange={e => setAdminForm({...adminForm, tokenAddress: e.target.value})} />
                                            <button onClick={() => executeAdminTx('Trocar Token', 'updateTokenExchange', [adminForm.tokenAddress])} className="bg-gray-800 hover:bg-gray-700 px-4 rounded-lg font-bold text-yellow-400">Salvar</button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-[#151A22]/90 p-6 rounded-3xl border border-gray-800">
                                <h3 className="text-yellow-500 font-bold mb-4 border-b border-gray-800 pb-2">💧 Liquidez do Banco</h3>
                                <p className="text-[10px] text-gray-500 mb-3 leading-snug">
                                    No contrato: <code className="text-gray-400">liquidityPOL</code> = POL da pool DEX (paga vendas de TKN);{' '}
                                  <code className="text-gray-400">getStockTokens()</code> = estoque TKN (saldo do token no contrato).
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                                    <div className="bg-[#06080C] p-4 rounded-xl border border-blue-500/25">
                                        <span className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">POL na pool (liquidityPOL)</span>
                                        <p className="text-xl font-mono font-bold text-blue-400">
                                            {dexPolLiquidity != null ? Number(formatEther(dexPolLiquidity as bigint)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : '—'} <span className="text-sm text-gray-500 font-sans font-semibold">POL</span>
                                        </p>
                                    </div>
                                    <div className="bg-[#06080C] p-4 rounded-xl border border-pink-500/25">
                                        <span className="text-[10px] uppercase tracking-wider text-gray-500 block mb-1">TKN em estoque (getStockTokens)</span>
                                        <p className="text-xl font-mono font-bold text-pink-400">
                                            {tokenStock != null ? Number(formatEther(tokenStock as bigint)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '—'} <span className="text-sm text-gray-500 font-sans font-semibold">TKN</span>
                                        </p>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs text-gray-500">Injetar/Remover POL</label>
                                        <div className="flex gap-2 mt-1">
                                            <input type="number" placeholder="Qtd" className="w-20 bg-[#06080C] p-3 rounded-lg border border-gray-700 outline-none" onChange={e => setAdminForm({...adminForm, polAmount: e.target.value})} />
                                            <button onClick={() => executeAdminTx('Add Liq POL', 'addLiquidityPOL', [], parseEther(adminForm.polAmount || '0'))} className="flex-1 bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/40 rounded-lg font-bold text-sm">Add</button>
                                            <button onClick={() => executeAdminTx('Remove Liq POL', 'removeLiquidityPOL', [parseEther(adminForm.polAmount || '0')])} className="flex-1 bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/40 rounded-lg font-bold text-sm">Remover</button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500">Injetar/Remover Token</label>
                                        <div className="flex gap-2 mt-1">
                                            <input type="number" placeholder="Qtd" className="w-20 bg-[#06080C] p-3 rounded-lg border border-gray-700 outline-none" onChange={e => setAdminForm({...adminForm, tokenAmount: e.target.value})} />
                                            
                                            {isAdminApprovalNeeded ? (
                                                <button onClick={() => handleApproveToken(adminForm.tokenAmount, 'Injetar Liq TKN')} className="flex-1 bg-orange-600/20 text-orange-400 border border-orange-500/30 hover:bg-orange-600/40 rounded-lg font-bold text-sm">1º Aprovar</button>
                                            ) : (
                                                <button onClick={() => executeAdminTx('Add Liq TKN', 'addLiquidityToken', [parseEther(adminForm.tokenAmount || '0')])} className="flex-1 bg-pink-600/20 text-pink-400 border border-pink-500/30 hover:bg-pink-600/40 rounded-lg font-bold text-sm">Add</button>
                                            )}
                                            
                                            <button onClick={() => executeAdminTx('Remove Liq TKN', 'removeLiquidityToken', [parseEther(adminForm.tokenAmount || '0')])} className="flex-1 bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/40 rounded-lg font-bold text-sm">Remover</button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-[#151A22]/90 p-6 rounded-3xl border border-gray-800">
                                <h3 className="text-yellow-500 font-bold mb-4 border-b border-gray-800 pb-2">💰 Cofre de Lucros</h3>
                                <div className="mb-4 bg-[#06080C] p-4 rounded-xl border border-green-500/30 flex justify-between items-center">
                                    <span className="text-gray-400 text-sm">Lucro Acumulado:</span>
                                    {/* MANTIDO FORMAT ETHER AQUI PQ O LUCRO AINDA É GUARDADO EM WEI NO CONTRATO */}
                                    <p className="text-2xl font-bold text-green-400">{totalFeesCollected ? formatEther(totalFeesCollected as bigint) : '0.00'} POL</p>
                                </div>
                                <div className="space-y-4">
                                    <button onClick={() => executeAdminTx('Sacar Lucros', 'withdrawFeeAdmin')} className="w-full bg-green-600/20 border border-green-500 hover:bg-green-600/40 text-green-400 p-3 rounded-xl font-bold">Sacar Lucros para a Carteira</button>
                                    <div className="pt-2 border-t border-gray-800/60">
                                        
                                        {/* AQUI ESTÁ A LÓGICA DE CONVERSÃO PARA O ADMIN 👇 */}
                                        <label className="text-xs text-gray-500">Alterar Taxa de Saque (em % para o usuário final)</label>
                                        <p className="text-[10px] text-gray-400 mb-1 leading-snug">
                                            O contrato armazena <strong>basis points</strong> (BPS): 1% = 100 BPS, 0,5% = 50 BPS, máximo 10.000 BPS = 100%.
                                            Você digita a porcentagem humana (ex.: <code className="text-gray-300">1</code> ou <code className="text-gray-300">0,75</code>); o app envia <code className="text-gray-300">porcentagem × 100</code> arredondado (ex.: 1% → 100 BPS).
                                        </p>
                                        <div className="flex gap-2 mt-1">
                                            <input type="number" step="0.01" placeholder="Ex: 1.5" className="flex-1 bg-[#06080C] p-3 rounded-lg border border-gray-700 outline-none focus:border-yellow-500" onChange={e => setAdminForm({...adminForm, withdrawFee: e.target.value})} />
                                            <button onClick={() => {
                                                if (!adminForm.withdrawFee) return alert("Digite uma taxa válida!");
                                                const { bps, error } = parsePercentToBps(adminForm.withdrawFee);
                                                if (error) return alert(error);
                                                executeAdminTx('Atualizar Taxa', 'updateWithdrawFee', [BigInt(bps)]);
                                            }} className="bg-gray-800 hover:bg-gray-700 px-4 rounded-lg font-bold text-yellow-400">Salvar</button>
                                        </div>
                                        {adminForm.withdrawFee && (() => {
                                          const { bps, error } = parsePercentToBps(adminForm.withdrawFee);
                                          if (error) return <p className="text-[10px] text-red-400 mt-1">{error}</p>;
                                          return (
                                            <p className="text-[10px] text-gray-500 mt-1 font-mono">
                                              Prévia: envio ao contrato = {bps} BPS ({formatWithdrawFeePercent(BigInt(bps))}%)
                                            </p>
                                          );
                                        })()}

                                    </div>
                                </div>
                            </div>

                            <div className="bg-[#151A22]/90 p-6 rounded-3xl border border-gray-800 flex flex-col justify-between">
                                <div>
                                    <h3 className="text-yellow-500 font-bold mb-4 border-b border-gray-800 pb-2">🛡️ Segurança e Contas</h3>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="text-xs text-gray-500">Bloquear / Aprovar Usuário</label>
                                            <div className="flex flex-col gap-2 mt-1">
                                                <input placeholder="Endereço 0x..." className="w-full bg-[#06080C] p-3 rounded-lg border border-gray-700 outline-none text-xs" onChange={e => setAdminForm({...adminForm, userAccount: e.target.value})} />
                                                <div className="flex gap-2">
                                                    <button onClick={() => executeAdminTx('Aprovar Conta', 'approveAccount', [adminForm.userAccount])} className="flex-1 bg-green-600/20 text-green-400 border border-green-500/30 hover:bg-green-600/40 rounded-lg font-bold py-2">Aprovar</button>
                                                    <button onClick={() => executeAdminTx('Bloquear Conta', 'blockAccount', [adminForm.userAccount])} className="flex-1 bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/40 rounded-lg font-bold py-2">Bloquear</button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="pt-4 border-t border-gray-800/60">
                                            <label className="text-xs text-gray-500">Consultar status (whitelist / bloqueio) + watchlist</label>
                                            <div className="flex gap-2 mt-2">
                                                <input
                                                    placeholder="Endereço 0x..."
                                                    className="flex-1 bg-[#06080C] p-3 rounded-lg border border-gray-700 outline-none text-xs"
                                                    value={adminForm.checkAccount}
                                                    onChange={(e) => setAdminForm({ ...adminForm, checkAccount: e.target.value })}
                                                />
                                                <button
                                                    onClick={() => {
                                                        const a = adminForm.checkAccount?.trim();
                                                        if (!a || !a.startsWith('0x') || a.length !== 42) return alert('Informe um endereço válido.');
                                                        setWatchlist((prev) => (prev.includes(a) ? prev : [a, ...prev].slice(0, 12)));
                                                    }}
                                                    className="bg-gray-800 hover:bg-gray-700 px-4 rounded-lg font-bold text-yellow-400"
                                                >
                                                    Add Watch
                                                </button>
                                            </div>
                                            <p className="text-[10px] text-gray-500 mt-2">
                                                Como <code className="text-gray-300">isWhitelisted</code> e <code className="text-gray-300">isBlocked</code> são <code className="text-gray-300">mapping</code>,
                                                não dá para listar todos os endereços só pelo front. Aqui você consulta por endereço e mantém uma watchlist.
                                            </p>

                                            {watchlist.length > 0 && (
                                                <div className="mt-3 space-y-2">
                                                    {watchlist.map((a) => (
                                                        <div key={a} className="bg-[#0B0E14] p-3 rounded-xl border border-gray-800 flex items-center justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <p className="text-[11px] text-gray-500">Conta</p>
                                                                <p className="text-xs font-mono text-white break-all">{a}</p>
                                                                <div className="flex gap-3 mt-2 text-[11px]">
                                                                    <span className="text-gray-400">Whitelist:</span>
                                                                    <AccountFlag address={a} kind="whitelist" publicClient={publicClient} />
                                                                    <span className="text-gray-400 ml-2">Bloqueado:</span>
                                                                    <AccountFlag address={a} kind="blocked" publicClient={publicClient} />
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={() => setWatchlist((prev) => prev.filter((x) => x !== a))}
                                                                className="shrink-0 bg-red-600/20 border border-red-500/30 hover:bg-red-600/30 text-red-300 px-3 py-2 rounded-lg font-bold text-xs"
                                                            >
                                                                Remover
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="pt-4 mt-4">
                                    <button onClick={() => executeAdminTx('PAUSAR BANCO', 'breakContract')} className="w-full bg-red-600 hover:bg-red-700 text-white p-3 rounded-xl font-black tracking-widest shadow-lg shadow-red-900/50" disabled={Boolean(isPaused)}>
                                        🚨 BOTÃO DE PÂNICO (PAUSAR)
                                    </button>
                                </div>
                            </div>

                            <div className="bg-[#151A22]/90 p-6 rounded-3xl border border-gray-800 md:col-span-2">
                                <h3 className="text-yellow-500 font-bold mb-4 border-b border-gray-800 pb-2">👑 Transferir Dono (Ownership)</h3>
                                <p className="text-[10px] text-gray-500 mb-3 leading-snug">
                                    Isso chama <code className="text-gray-300">transferOwnership(newOwner)</code>. Após transferir, o painel admin some para quem não for mais o owner.
                                </p>
                                <div className="flex flex-col md:flex-row gap-2">
                                    <input
                                        placeholder="Novo owner (0x...)"
                                        className="flex-1 bg-[#06080C] p-3 rounded-lg border border-gray-700 outline-none text-xs"
                                        value={adminForm.newOwner}
                                        onChange={(e) => setAdminForm({ ...adminForm, newOwner: e.target.value })}
                                    />
                                    <button
                                        onClick={handleTransferOwnership}
                                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-lg font-black"
                                        disabled={isPending || isConfirming}
                                    >
                                        Transferir
                                    </button>
                                </div>
                            </div>

                        </div>
                    </div>
                )}

            </div>

            {/* ========================================================================= */}
            {/* SIDEBAR DE HISTÓRICO GERAL */}
            {/* ========================================================================= */}
            <div className="bg-[#151A22]/80 backdrop-blur p-8 rounded-3xl shadow-xl border border-gray-800/60 h-[700px] flex flex-col sticky top-28">
                <h3 className="text-gray-400 uppercase tracking-widest text-xs font-bold mb-6 flex items-center gap-2 border-b border-gray-800/60 pb-4">📡 Terminal de Rede</h3>
                <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                    {txHistory.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-600"><span className="text-4xl mb-4">📭</span><p className="text-sm font-medium">Sem transações</p></div>
                    ) : (
                        txHistory.map((tx) => (
                            <div key={tx.id} className="bg-[#0B0E14] p-5 rounded-2xl border border-gray-800 relative group transition-all hover:border-gray-600">
                                <p className="font-bold text-white mb-2 tracking-tight">{tx.action}</p>
                                <div className={`flex items-center gap-2 text-sm font-medium ${tx.status === 'Sucesso' ? 'text-green-400' : tx.status === 'Erro' ? 'text-red-400' : 'text-blue-400 animate-pulse'}`}>
                                    <div className={`w-2 h-2 rounded-full ${tx.status === 'Sucesso' ? 'bg-green-400' : tx.status === 'Erro' ? 'bg-red-400' : 'bg-blue-400'}`}></div>{tx.status}
                                </div>
                                {tx.hash && (<a href={`https://amoy.polygonscan.com/tx/${tx.hash}`} target="_blank" className="text-xs text-gray-500 hover:text-blue-400 underline mt-3 block transition-colors">Ver na Polygonscan ↗</a>)}
                                {tx.errorMessage && (<div className="mt-4 bg-red-900/20 border border-red-900/50 p-3 rounded-xl text-xs text-red-300/90 leading-relaxed font-mono">{tx.errorMessage}</div>)}
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