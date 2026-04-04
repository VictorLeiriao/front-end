import '../styles/globals.css'; 
import '@rainbow-me/rainbowkit/styles.css'; 

import type { AppProps } from 'next/app';
import Head from 'next/head'; // <-- NOSSA ARMA SECRETA
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';

import { config } from '../wagmi'; 

const client = new QueryClient();

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      {/* INJETAMOS O TAILWIND DIRETO NA VEIA DO SITE AQUI! */}
      <Head>
        <script src="https://cdn.tailwindcss.com"></script>
      </Head>

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