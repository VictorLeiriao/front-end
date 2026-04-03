import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { polygonAmoy } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Bank Proxy DEX',
  projectId: 'YOUR_PROJECT_ID', // O Rainbowkit pede um ID, pode deixar esse padrão por enquanto
  chains: [polygonAmoy], // <-- Colocamos a Amoy aqui!
  ssr: true,
});