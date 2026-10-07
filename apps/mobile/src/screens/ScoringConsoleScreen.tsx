import React, { useRef, useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/theme';
import ScreenHeader from '../components/ScreenHeader';

/**
 * The full scorekeeper console (PIN page + GameSheet-style scoring) rendered
 * inside the app. One codebase with the website - the page itself handles
 * PINs, sign-offs, and scoring; this screen just hosts it natively.
 */
export default function ScoringConsoleScreen({ navigation }: any) {
  const webref = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const insets = useSafeAreaInsets();

  // Full-screen console: the tab bar covered the page's bottom buttons and
  // invites accidental tab taps mid-game - hide it while scoring
  useEffect(() => {
    const tabNav = navigation.getParent();
    tabNav?.setOptions({ tabBarStyle: { display: 'none' } });
    return () => tabNav?.setOptions({ tabBarStyle: undefined });
  }, [navigation]);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Scoring Console"
        showBack
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity onPress={() => webref.current?.reload()} style={{ padding: 6 }}>
            <Ionicons name="refresh" size={20} color={colors.white} />
          </TouchableOpacity>
        }
      />
      <View style={{ flex: 1, paddingBottom: insets.bottom }}>
        <WebView
          ref={webref}
          source={{ uri: 'https://ultimatetournaments.com/scoring' }}
          style={{ flex: 1 }}
          onLoadEnd={() => setLoading(false)}
          allowsBackForwardNavigationGestures
          pullToRefreshEnabled
          domStorageEnabled
          javaScriptEnabled
          setSupportMultipleWindows={false}
        />
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
