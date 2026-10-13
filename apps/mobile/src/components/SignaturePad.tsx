import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, PanResponder, Keyboard, StyleSheet } from 'react-native';
import { colors, fonts } from '../constants/theme';

export type Stroke = { x: number; y: number }[];

// Finger-signature pad with no native dependencies: strokes are captured with
// PanResponder and rendered as tiny rotated line-segment Views, so it ships
// over OTA to every binary. Strokes serialize compactly for storage.
export function serializeStrokes(strokes: Stroke[], w: number, h: number): string {
  return 'strokes:' + JSON.stringify({ w: Math.round(w), h: Math.round(h), s: strokes.map(st => st.flatMap(p => [Math.round(p.x), Math.round(p.y)])) });
}

export function segmentsFor(strokes: Stroke[], scale = 1) {
  const segs: { x: number; y: number; len: number; angle: string }[] = [];
  for (const st of strokes) {
    for (let i = 1; i < st.length; i++) {
      const x1 = st[i - 1].x * scale, y1 = st[i - 1].y * scale;
      const x2 = st[i].x * scale, y2 = st[i].y * scale;
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      segs.push({ x: x1, y: y1, len, angle: `${Math.atan2(dy, dx)}rad` });
    }
  }
  return segs;
}

export function StrokeDrawing({ strokes, scale = 1, color = '#13294b', width = 2.5 }:
  { strokes: Stroke[]; scale?: number; color?: string; width?: number }) {
  return (
    <>
      {segmentsFor(strokes, scale).map((s, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={{
            position: 'absolute', left: s.x, top: s.y - width / 2,
            width: s.len, height: width, borderRadius: width / 2, backgroundColor: color,
            transform: [{ translateX: -0 }, { rotateZ: s.angle }],
            transformOrigin: 'left center' as any,
          }}
        />
      ))}
    </>
  );
}

export default function SignaturePad({ height = 140, onChange }:
  { height?: number; onChange: (strokes: Stroke[], size: { w: number; h: number }) => void }) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [size, setSize] = useState({ w: 0, h: height });
  const current = useRef<Stroke>([]);
  const strokesRef = useRef<Stroke[]>([]);
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      Keyboard.dismiss();
      const { locationX, locationY } = evt.nativeEvent;
      current.current = [{ x: locationX, y: locationY }];
      setStrokes([...strokesRef.current, current.current]);
    },
    onPanResponderMove: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      const last = current.current[current.current.length - 1];
      if (last && Math.abs(last.x - locationX) < 1.5 && Math.abs(last.y - locationY) < 1.5) return;
      current.current.push({ x: locationX, y: locationY });
      setStrokes([...strokesRef.current, [...current.current]]);
    },
    onPanResponderRelease: () => {
      strokesRef.current = [...strokesRef.current, [...current.current]];
      current.current = [];
      setStrokes(strokesRef.current);
      onChange(strokesRef.current, sizeRef.current);
    },
    onPanResponderTerminationRequest: () => false,
  })).current;

  const clear = () => {
    strokesRef.current = [];
    current.current = [];
    setStrokes([]);
    onChange([], sizeRef.current);
  };

  return (
    <View>
      <View
        style={[s.pad, { height }]}
        onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: height })}
        {...pan.panHandlers}
      >
        {strokes.length === 0 && (
          <Text style={s.hint} pointerEvents="none" maxFontSizeMultiplier={1.2}>Sign here with your finger</Text>
        )}
        <StrokeDrawing strokes={strokes} />
        <View style={s.baseline} pointerEvents="none" />
      </View>
      {strokes.length > 0 && (
        <TouchableOpacity onPress={clear} style={s.clearBtn}>
          <Text style={s.clearText} maxFontSizeMultiplier={1.2}>Clear signature</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  pad: { backgroundColor: '#fafcff', borderWidth: 1.5, borderColor: '#c9d6e4', borderRadius: 12, overflow: 'hidden' },
  hint: { position: 'absolute', alignSelf: 'center', top: '42%', color: '#9aa7ba', fontSize: 13, ...fonts.semibold },
  baseline: { position: 'absolute', left: 18, right: 18, bottom: 26, height: 1, backgroundColor: '#dfe6ee' },
  clearBtn: { alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 4 },
  clearText: { color: colors.navy, fontSize: 12, ...fonts.bold },
});
