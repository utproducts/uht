import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { spacing, radii, fonts } from '../constants/theme';

// ==================
// LIGHTS OUT banner - full-bleed glow-in-the-dark promo. Used atop the app's
// Find Events screen and the Three Stars tab. Cancels spacing.lg list padding
// so it runs edge to edge.
// ==================
export default function LightsOutBanner({ pitch, variant = 'hero' }: { pitch?: string; variant?: 'hero' | 'card' }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1300, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1300, useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: 1, duration: 3200, useNativeDriver: true }),
      Animated.timing(float, { toValue: 0, duration: 3200, useNativeDriver: true }),
    ])).start();
  }, [pulse, float]);

  if (variant === 'card') {
    // Compact: shaped like a regular event card, dressed in the dark glow
    return (
      <TouchableOpacity activeOpacity={0.85}
        onPress={() => Linking.openURL('https://ultimatetournaments.com/lights-out')}>
        <LinearGradient colors={['#04091a', '#0a1c3d', '#04091a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={loStyles.card}>
          <View style={[loStyles.orb, { width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(57,255,20,0.10)', top: -50, right: -40 }]} />
          <View style={loStyles.cardRow}>
            <Animated.Image
              source={{ uri: 'https://ultimatetournaments.com/lights-out-logo.png' }}
              style={[loStyles.cardLogo, { transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }] }]}
              resizeMode="contain"
            />
            <View style={loStyles.cardInfo}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={loStyles.cardName} numberOfLines={2} maxFontSizeMultiplier={1.2}>
                  <Text style={loStyles.titleGlow}>Lights Out</Text> Invitational
                </Text>
                <View style={loStyles.cardPill}>
                  <Animated.View style={[loStyles.badgeDot, { width: 5, height: 5, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }]} />
                  <Text style={loStyles.cardPillText} maxFontSizeMultiplier={1.1}>INVITE ONLY</Text>
                </View>
              </View>
              <Text style={loStyles.cardDates} maxFontSizeMultiplier={1.2}>June 11-13, 2027</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
                <Ionicons name="location-outline" size={14} color="rgba(255,255,255,0.55)" />
                <Text style={loStyles.cardLocation} maxFontSizeMultiplier={1.2}>St. Louis, MO</Text>
              </View>
              <Text style={loStyles.cardLimited} maxFontSizeMultiplier={1.2}>A $200 deposit holds your spot</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#39ff14" />
          </View>
          <LinearGradient colors={['transparent', '#39ff14', '#00ccff', 'transparent']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={loStyles.iceLine} />
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity activeOpacity={0.92}
      onPress={() => Linking.openURL('https://ultimatetournaments.com/lights-out')}>
      <LinearGradient colors={['#04091a', '#071530', '#04091a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={loStyles.banner}>
        {/* ambient glow orbs */}
        <View style={[loStyles.orb, { backgroundColor: 'rgba(57,255,20,0.10)', top: -70, right: -60 }]} />
        <View style={[loStyles.orb, { backgroundColor: 'rgba(0,204,255,0.12)', bottom: -80, left: -70 }]} />

        <Animated.Image
          source={{ uri: 'https://ultimatetournaments.com/lights-out-logo.png' }}
          style={[loStyles.logo, { transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -7] }) }] }]}
          resizeMode="contain"
        />
        <View style={loStyles.badge}>
          <Animated.View style={[loStyles.badgeDot, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }]} />
          <Text style={loStyles.badgeText} maxFontSizeMultiplier={1.2}>INVITE ONLY</Text>
        </View>
        <Text style={loStyles.title} maxFontSizeMultiplier={1.2}>
          <Text style={loStyles.titleGlow}>LIGHTS OUT</Text> INVITATIONAL
        </Text>
        <Text style={loStyles.dates} maxFontSizeMultiplier={1.2}>JUNE 11-13, 2027 · ST. LOUIS</Text>
        <Text style={loStyles.pitch} maxFontSizeMultiplier={1.2}>
          {pitch || 'The arena goes dark. The ice glows. Only Three Stars winners get in.'}
        </Text>
        <LinearGradient colors={['#39ff14', '#00ccff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={loStyles.ctaWrap}>
          <Text style={loStyles.ctaText} maxFontSizeMultiplier={1.2}>SEE THE INVITATIONAL</Text>
        </LinearGradient>
        <Text style={loStyles.limited} maxFontSizeMultiplier={1.2}>
          EXTREMELY LIMITED EVENT · A $200 DEPOSIT HOLDS YOUR SPOT
        </Text>

        {/* glowing ice line across the bottom edge */}
        <LinearGradient colors={['transparent', '#39ff14', '#00ccff', 'transparent']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={loStyles.iceLine} />
      </LinearGradient>
    </TouchableOpacity>
  );
}

const loStyles = StyleSheet.create({
  card: {
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(57,255,20,0.35)',
    overflow: 'hidden',
    shadowColor: '#39ff14',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardLogo: { width: 62, height: 62 },
  cardInfo: { flex: 1, marginLeft: spacing.md },
  cardName: { fontSize: 16, color: '#ffffff', ...fonts.bold, flexShrink: 1 },
  cardPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(57,255,20,0.45)', backgroundColor: 'rgba(57,255,20,0.08)',
  },
  cardPillText: { color: '#39ff14', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  cardDates: { color: '#7fd8ff', fontSize: 13, fontWeight: '700', marginTop: 3 },
  cardLocation: { color: 'rgba(255,255,255,0.55)', fontSize: 13 },
  cardLimited: { color: '#ffb84d', fontSize: 11, fontWeight: '700', marginTop: 4 },
  banner: {
    // cancel the list's padding so the banner runs edge to edge
    marginHorizontal: -spacing.lg,
    marginTop: -spacing.lg,
    marginBottom: spacing.lg,
    paddingTop: 22,
    paddingBottom: 26,
    paddingHorizontal: 20,
    alignItems: 'center',
    overflow: 'hidden',
  },
  orb: { position: 'absolute', width: 220, height: 220, borderRadius: 110 },
  logo: { width: 190, height: 108, marginBottom: 6 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(57,255,20,0.45)',
    backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 10,
  },
  badgeDot: {
    width: 7, height: 7, borderRadius: 4, backgroundColor: '#39ff14',
    shadowColor: '#39ff14', shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
  },
  badgeText: { color: '#39ff14', fontSize: 11, fontWeight: '800', letterSpacing: 3.5 },
  title: { color: '#ffffff', fontSize: 25, fontWeight: '900', textAlign: 'center', letterSpacing: 0.5 },
  titleGlow: {
    color: '#39ff14',
    textShadowColor: 'rgba(57,255,20,0.75)', textShadowRadius: 14, textShadowOffset: { width: 0, height: 0 },
  },
  dates: {
    color: '#7fd8ff', fontSize: 13, fontWeight: '800', letterSpacing: 2.5, marginTop: 6,
    textShadowColor: 'rgba(0,204,255,0.6)', textShadowRadius: 10, textShadowOffset: { width: 0, height: 0 },
  },
  pitch: { color: 'rgba(255,255,255,0.68)', fontSize: 13.5, lineHeight: 20, textAlign: 'center', marginTop: 9, maxWidth: 320 },
  ctaWrap: {
    marginTop: 15, borderRadius: 999, paddingHorizontal: 26, paddingVertical: 11,
    shadowColor: '#39ff14', shadowOpacity: 0.55, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 8,
  },
  ctaText: { color: '#04091a', fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  limited: {
    marginTop: 12, color: '#ffb84d', fontSize: 10.5, fontWeight: '800',
    letterSpacing: 1.2, textAlign: 'center', maxWidth: 330,
    textShadowColor: 'rgba(255,184,77,0.45)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 0 },
  },
  iceLine: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, opacity: 0.9 },
});
