import { AdSlotsProvider } from '../lib/AdSlotsContext';

export default function App({ Component, pageProps }) {
  return (
    <AdSlotsProvider>
      <Component {...pageProps} />
    </AdSlotsProvider>
  );
}
