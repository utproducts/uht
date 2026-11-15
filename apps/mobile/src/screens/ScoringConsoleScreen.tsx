import React, { useRef, useState, useEffect } from 'react';
import { NAVY_TAB_BAR } from '../navigation/AppNavigator';
import { View, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/theme';
import ScreenHeader from '../components/ScreenHeader';
import { getToken } from '../services/auth';

/**
 * The full scorekeeper console (PIN page + GameSheet-style scoring) rendered
 * inside the app. One codebase with the website - the page itself handles
 * PINs, sign-offs, and scoring; this screen just hosts it natively.
 *
 * Directors/admins arrive with a gameId param and no PIN: their account
 * token is injected into the page so every write authenticates as staff,
 * giving them the full sheet (goals, penalties, shots, lineups) for any
 * game - including fixing a sheet after the game went final.
 */
export default function ScoringConsoleScreen({ navigation, route }: any) {
  const gameId: string | undefined = route?.params?.gameId;
  const webref = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  // undefined = still reading SecureStore; null = no token (PIN flow only)
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    getToken().then(t => setToken(t || null)).catch(() => setToken(null));
  }, []);

  // Freeze the cache-busted URL for this mount so the WebView never reloads
  // mid-game when the minute ticks over
  const [consoleUri] = useState(() => {
    const v = Math.floor(Date.now() / 60000);
    return gameId
      ? `https://ultimatetournaments.com/scoring/game?gameId=${encodeURIComponent(gameId)}&v=${v}`
      : `https://ultimatetournaments.com/scoring?v=${v}`;
  });

  // Full-screen console: the tab bar covered the page's bottom buttons and
  // invites accidental tab taps mid-game - hide it while scoring
  useEffect(() => {
    const tabNav = navigation.getParent();
    tabNav?.setOptions({ tabBarStyle: { display: 'none' } });
    return () => tabNav?.setOptions({ tabBarStyle: NAVY_TAB_BAR });
  }, [navigation]);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={gameId ? 'Scoresheet' : 'Scoring Console'}
        showBack
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity onPress={() => webref.current?.reload()} style={{ padding: 6 }}>
            <Ionicons name="refresh" size={20} color={colors.white} />
          </TouchableOpacity>
        }
      />
      <View style={{ flex: 1, paddingBottom: insets.bottom }}>
        {token !== undefined && (
        <WebView
          ref={webref}
          // cache-bust per mount so scorekeepers always get the latest console
          source={{ uri: consoleUri }}
          cacheEnabled={false}
          style={{ flex: 1 }}
          onLoadEnd={() => setLoading(false)}
          // Staff token into the page before it boots - the console falls
          // back to Bearer auth when no PIN is in the URL
          injectedJavaScriptBeforeContentLoaded={
            token ? `try { localStorage.setItem('uht_token', ${JSON.stringify(token)}); } catch (e) {} true;` : undefined
          }
          allowsBackForwardNavigationGestures
          pullToRefreshEnabled
          domStorageEnabled
          javaScriptEnabled
          setSupportMultipleWindows={false}
        />
        )}
        {loading && (
          <View style={styles.loader} pointerEvents="none">
            <ActivityIndicator size="large" color={colors.navy} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(242,243,245,0.7)' },
});
