import '../styles/globals.css'; 
import '@rainbow-me/rainbowkit/styles.css'; 

import type { AppProps } from 'next/app';
import Script from 'next/script'; // Trocamos o Head pelo Script do Next
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';

import { config } from '../wagmi'; 

const client = new QueryClient();

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      {/* Usamos o componente Script com a estratégia 'beforeInteractive' 
        para que o Tailwind carregue o mais rápido possível sem travar o Next.js
      */}
      <Script 
        src="https://cdn.tailwindcss.com" 
        strategy="beforeInteractive" 
      />

      <WagmiProvider config={config}>
        <QueryClientProvider client={client}>
          <RainbowKitProvider theme={darkTheme()}>
            <Component {...pageProps} />
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </>
  );
}

export default MyApp;