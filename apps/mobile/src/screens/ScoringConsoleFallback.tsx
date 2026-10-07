import React from 'react';
import { View, Text, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import { colors, fonts, spacing } from '../constants/theme';

const SCORING_URL = 'https://ultimatetournaments.com/scoring';

// Shown on app binaries that predate the in-app WebView console (1.0.6 and
// earlier). Opens the scoring page in the browser instead.
export default function ScoringConsoleFallback({ navigation }: any) {
  return (
    <View style={s.screen}>
      <ScreenHeader title="Scoring Console" showBack onBack={() => navigation.goBack()} />
      <View style={s.body}>
        <Ionicons name="stopwatch-outline" size={44} color={colors.navy} style={{ marginBottom: 14 }} />
        <Text style={s.title}>Scoring opens in your browser</Text>
        <Text style={s.sub}>
          Update the UHT app from the App Store to score games right inside the app.
        </Text>
        <TouchableOpacity style={s.btn} onPress={() => Linking.openURL(SCORING_URL)}>
          <Ionicons name="open-outline" size={16} color={colors.white} />
          <Text style={s.btnText}>Open Scoring Page</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, paddingBottom: 80 },
  title: { fontSize: 17, color: colors.navy, ...fonts.bold, marginBottom: 8, textAlign: 'center' },
  sub: { fontSize: 13, color: '#5b6b83', ...fonts.semibold, textAlign: 'center', marginBottom: 22, lineHeight: 19 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.navy, paddingVertical: 12, paddingHorizontal: 22, borderRadius: 10 },
  btnText: { color: colors.white, fontSize: 14, ...fonts.bold },
});
