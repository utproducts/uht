import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Share,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/theme';
import { getUser } from '../services/auth';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const API = 'https://uht.chad-157.workers.dev';

// Confetti particle component
interface Particle {
  x: Animated.Value;
  y: Animated.Value;
  rotation: Animated.Value;
  opacity: Animated.Value;
  color: string;
  size: number;
}

function createParticles(count: number): Particle[] {
  const confettiColors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#FF8C00', '#00CED1', '#FF69B4'];
  return Array.from({ length: count }, () => ({
    x: new Animated.Value(SCREEN_WIDTH / 2),
    y: new Animated.Value(SCREEN_HEIGHT / 3),
    rotation: new Animated.Value(0),
    opacity: new Animated.Value(1),
    color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
    size: Math.random() * 10 + 6,
  }));
}

export default function RewardRevealScreen({ navigation }: any) {
  const [revealed, setRevealed] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [amount, setAmount] = useState(50);
  const [loading, setLoading] = useState(true);
  const [particles] = useState(() => createParticles(80));
  const giftScale = useRef(new Animated.Value(1)).current;
  const giftOpacity = useRef(new Animated.Value(1)).current;
  const codeScale = useRef(new Animated.Value(0)).current;
  const codeOpacity = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;

  // Fetch the user's reward code
  useEffect(() => {
    (async () => {
      try {
        const user = await getUser();
        if (user && user.email) {
          const res = await fetch(`${API}/api/meeting-reward/my-code?email=${encodeURIComponent(user.email)}`);
          const json = await res.json();
          if (json.success && json.data) {
            setCode(json.data.code);
            setAmount(json.data.amount);
          }
        }
      } catch (e) {
        console.error('Failed to fetch reward:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Pulsating glow animation for the gift
  useEffect(() => {
    if (!revealed) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0, duration: 1200, useNativeDriver: true }),
        ])
      ).start();
      // Gentle bounce
      Animated.loop(
        Animated.sequence([
          Animated.timing(bounceAnim, { toValue: -10, duration: 800, useNativeDriver: true }),
          Animated.timing(bounceAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [revealed]);

  const explodeConfetti = useCallback(() => {
    particles.forEach((p) => {
      const targetX = Math.random() * SCREEN_WIDTH;
      const targetY = Math.random() * SCREEN_HEIGHT;
      const delay = Math.random() * 200;

      Animated.parallel([
        Animated.timing(p.x, {
          toValue: targetX,
          duration: 1500 + Math.random() * 1000,
          delay,
          useNativeDriver: true,
        }),
        Animated.timing(p.y, {
          toValue: targetY + 200,
          duration: 1500 + Math.random() * 1000,
          delay,
          useNativeDriver: true,
        }),
        Animated.timing(p.rotation, {
          toValue: Math.random() * 10,
          duration: 2000,
          delay,
          useNativeDriver: true,
        }),
        Animated.timing(p.opacity, {
          toValue: 0,
          duration: 2500,
          delay: delay + 500,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [particles]);

  const handleReveal = useCallback(() => {
    if (revealed) return;
    if (!code) {
      // Code not loaded yet — retry fetch
      (async () => {
        try {
          const user = await getUser();
          if (user && user.email) {
            const res = await fetch(`${API}/api/meeting-reward/my-code?email=${encodeURIComponent(user.email)}`);
            const json = await res.json();
            if (json.success && json.data) {
              setCode(json.data.code);
              setAmount(json.data.amount);
            }
          }
        } catch (e) {
          console.error('Retry fetch failed:', e);
        }
      })();
      return;
    }
    setRevealed(true);

    // Shrink and fade gift box
    Animated.parallel([
      Animated.timing(giftScale, {
        toValue: 0.1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(giftOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();

    // Explode confetti
    explodeConfetti();

    // Pop in the code after a brief delay
    setTimeout(() => {
      Animated.spring(codeScale, {
        toValue: 1,
        friction: 4,
        tension: 100,
        useNativeDriver: true,
      }).start();
      Animated.timing(codeOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }, 300);
  }, [revealed, code, explodeConfetti, giftScale, giftOpacity, codeScale, codeOpacity]);

  const handleShare = async () => {
    if (!code) return;
    try {
      await Share.share({
        message: `I just got $${amount} off my next UHT tournament registration! Code: ${code} - Download the UHT app: https://apps.apple.com/app/id6786085393`,
      });
    } catch {}
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading your reward...</Text>
      </View>
    );
  }

  if (!code) {
    return (
      <SafeAreaView style={styles.container}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        <View style={styles.center}>
          <Image
            source={require('../../assets/gift-box.png')}
            style={{ width: 80, height: 80, marginBottom: 16 }}
            resizeMode="contain"
          />
          <Text style={styles.noRewardTitle}>No Reward Found</Text>
          <Text style={styles.noRewardText}>
            Make sure you RSVP'd for the Coach/Manager Meeting with the same email you used to sign up for the app.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Close button */}
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>

        {/* Confetti particles */}
        {particles.map((p, i) => (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={[
              styles.particle,
              {
                backgroundColor: p.color,
                width: p.size,
                height: p.size,
                borderRadius: Math.random() > 0.5 ? p.size / 2 : 2,
                transform: [
                  { translateX: p.x },
                  { translateY: p.y },
                  { rotate: p.rotation.interpolate({ inputRange: [0, 10], outputRange: ['0deg', '3600deg'] }) },
                ],
                opacity: p.opacity,
              },
            ]}
          />
        ))}

        <View style={styles.center}>
          {/* Pre-reveal: Gift box */}
          {!revealed && (
            <Animated.View
              style={[
                styles.giftContainer,
                {
                  transform: [
                    { scale: giftScale },
                    { translateY: bounceAnim },
                  ],
                  opacity: giftOpacity,
                },
              ]}
            >
              <TouchableOpacity onPress={handleReveal} activeOpacity={0.8} style={{ zIndex: 10 }}>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.giftGlow,
                    {
                      opacity: glowAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.2, 0.6],
                      }),
                    },
                  ]}
                />
                <Image
                  source={require('../../assets/gift-box.png')}
                  style={styles.giftImage}
                  resizeMode="contain"
                />
                <Text style={styles.tapText}>TAP TO UNWRAP</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Post-reveal: Discount code */}
          <Animated.View
            style={[
              styles.codeContainer,
              {
                transform: [{ scale: codeScale }],
                opacity: codeOpacity,
              },
            ]}
          >
            <Text style={styles.congratsText}>CONGRATULATIONS!</Text>
            <Text style={styles.rewardTitle}>You just earned</Text>

            <View style={styles.amountBadge}>
              <Text style={styles.dollarSign}>$</Text>
              <Text style={styles.amountText}>{amount}</Text>
              <Text style={styles.offText}>OFF</Text>
            </View>

            <Text style={styles.rewardSubtitle}>your next tournament registration</Text>

            <View style={styles.codeBox}>
              <Text style={styles.codeLabel}>YOUR CODE</Text>
              <Text style={styles.codeText}>{code}</Text>
            </View>

            <Text style={styles.instructionText}>
              Use this code when you register for any 2026-27 UHT tournament
            </Text>

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
                <Ionicons name="share-outline" size={20} color="#fff" />
                <Text style={styles.shareBtnText}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()}>
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>

        {!revealed && (
          <Text style={styles.footerText}>
            Thank you for attending the{'\n'}UHT Coach/Manager Meeting!
          </Text>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#001d3d',
  },
  safeArea: {
    flex: 1,
  },
  closeBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 20,
    right: 20,
    zIndex: 100,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  particle: {
    position: 'absolute',
  },
  giftContainer: {
    alignItems: 'center',
  },
  giftGlow: {
    position: 'absolute',
    width: SCREEN_WIDTH * 0.85,
    height: SCREEN_WIDTH * 0.85,
    borderRadius: SCREEN_WIDTH * 0.425,
    backgroundColor: '#FFD700',
    top: -(SCREEN_WIDTH * 0.05),
    left: -(SCREEN_WIDTH * 0.05),
  },
  giftImage: {
    width: SCREEN_WIDTH * 0.75,
    height: SCREEN_WIDTH * 0.75,
  },
  tapText: {
    color: '#FFD700',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 4,
    marginTop: 32,
    textAlign: 'center',
  },
  codeContainer: {
    alignItems: 'center',
    width: '100%',
  },
  congratsText: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 4,
    marginBottom: 8,
  },
  rewardTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 16,
  },
  amountBadge: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  dollarSign: {
    color: '#FFD700',
    fontSize: 36,
    fontWeight: '900',
    marginBottom: 4,
  },
  amountText: {
    color: '#FFD700',
    fontSize: 72,
    fontWeight: '900',
    lineHeight: 80,
  },
  offText: {
    color: '#FFD700',
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 10,
    marginLeft: 4,
  },
  rewardSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    marginBottom: 32,
    textAlign: 'center',
  },
  codeBox: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 2,
    borderColor: '#FFD700',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginBottom: 16,
    borderStyle: 'dashed',
  },
  codeLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 4,
  },
  codeText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 3,
  },
  instructionText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  shareBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  doneBtn: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  doneBtnText: {
    color: '#001d3d',
    fontSize: 16,
    fontWeight: '900',
  },
  footerText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    textAlign: 'center',
    paddingBottom: 40,
    lineHeight: 20,
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
  noRewardTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
  },
  noRewardText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
});
