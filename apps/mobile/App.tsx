import React, { useEffect, useRef } from 'react';
import { StatusBar, Alert, AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StripeProvider } from '@stripe/stripe-react-native';
import * as Updates from 'expo-updates';
import AppNavigator from './src/navigation/AppNavigator';

const STRIPE_PUBLISHABLE_KEY = 'pk_live_51JT7FXGJu05jTbyJAmm6UfNev2syS1j9F81arSoiT6Fx8JcQhmcjBUUNVxGX0Zf0amJj1H5Ylvdh7FScdopNkxfn00kBBHQuTz';
const MERCHANT_ID = 'merchant.com.ultimatetournaments.uht';

export default function App() {
  const lastCheck = useRef(0);
  const prompted = useRef(false);

  useEffect(() => {
    async function checkForUpdates() {
      if (__DEV__) return; // Skip in development mode
      if (prompted.current) return; // one prompt per session is enough
      const now = Date.now();
      if (now - lastCheck.current < 2 * 60 * 1000) return; // throttle to every 2 min
      lastCheck.current = now;
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          prompted.current = true;
          Alert.alert(
            'Update Available',
            'A new version has been downloaded. Restart to apply.',
            [
              { text: 'Later', style: 'cancel' },
              { text: 'Restart', onPress: () => Updates.reloadAsync() },
            ]
          );
        }
      } catch (e) {
        // Silently fail — don't disrupt the user experience
        console.log('Update check failed:', e);
      }
    }
    checkForUpdates();
    // Cold-start-only checks left users on stale bundles for days - re-check
    // whenever the app returns to the foreground too.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkForUpdates();
    });
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <StripeProvider
        publishableKey={STRIPE_PUBLISHABLE_KEY}
        merchantIdentifier={MERCHANT_ID}
      >
        <StatusBar barStyle="dark-content" />
        <AppNavigator />
      </StripeProvider>
    </SafeAreaProvider>
  );
}
