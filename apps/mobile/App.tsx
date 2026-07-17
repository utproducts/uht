import React, { useEffect } from 'react';
import { StatusBar, Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StripeProvider } from '@stripe/stripe-react-native';
import * as Updates from 'expo-updates';
import AppNavigator from './src/navigation/AppNavigator';

const STRIPE_PUBLISHABLE_KEY = 'pk_live_51JT7FXGJu05jTbyJAmm6UfNev2syS1j9F81arSoiT6Fx8JcQhmcjBUUNVxGX0Zf0amJj1H5Ylvdh7FScdopNkxfn00kBBHQuTz';
const MERCHANT_ID = 'merchant.com.ultimatetournaments.uht';

export default function App() {
  useEffect(() => {
    async function checkForUpdates() {
      if (__DEV__) return; // Skip in development mode
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
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
