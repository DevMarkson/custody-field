// Motion and loading states for the field app.
//
// The register here is the same as the dashboard's: this is evidence
// software, so movement explains rather than decorates. There are three
// places it earns its keep.
//
//   The progress bar, because hashing a 30GB extraction takes real time and
//   an officer standing at a scene needs to see it moving rather than wonder
//   whether the phone has frozen.
//
//   A newly sealed item, because it arrives at the top of a list the officer
//   is already looking at, and a row that appears with no transition reads as
//   the list having jumped rather than something having been added.
//
//   The pending count, because it is the one thing on the screen that says
//   work is outstanding.
//
// Everything else is still. No new dependency: React Native's Animated is
// enough, and a hackathon demo should not be carrying Reanimated for a
// handful of fades.

import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from "react-native";

/**
 * Honour the system's reduce motion setting.
 *
 * Someone who has asked their phone to stop animating things has asked for a
 * reason, and an evidence app is not the place to overrule them.
 */
export function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setReduce(!!v));
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => { alive = false; sub?.remove?.(); };
  }, []);
  return reduce;
}

/** Content settles into place instead of appearing abruptly. */
export function FadeIn({ children, delay = 0, distance = 8, style }) {
  const reduce = useReduceMotion();
  const t = useRef(new Animated.Value(reduce ? 1 : 0)).current;

  useEffect(() => {
    if (reduce) { t.setValue(1); return; }
    Animated.timing(t, {
      toValue: 1, duration: 280, delay,
      easing: Easing.bezier(0.22, 0.61, 0.36, 1),
      useNativeDriver: true,
    }).start();
  }, [reduce, delay, t]);

  return (
    <Animated.View
      style={[
        style,
        { opacity: t,
          transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * A skeleton block. Breathes rather than flashes: a slow opacity cycle is
 * calmer than a sweeping highlight and costs no gradient library.
 */
export function Skeleton({ width, height = 12, radius = 4, style }) {
  const reduce = useReduceMotion();
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    if (reduce) { pulse.setValue(0.4); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.9, duration: 780, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 780, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, pulse]);

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: "#2a2a24", opacity: pulse }, style]}
    />
  );
}

/**
 * One placeholder item card, laid out to the same shape as a sealed item so
 * the list does not jump when the real rows arrive.
 */
export function SkeletonItem({ delay = 0 }) {
  return (
    <FadeIn delay={delay} style={s.card}>
      <View style={s.rowBetween}>
        <Skeleton width={128} height={15} />
        <Skeleton width={96} height={17} radius={9} />
      </View>
      <Skeleton width="72%" height={13} style={{ marginTop: 10 }} />
      <Skeleton width="54%" height={11} style={{ marginTop: 8 }} />
      <Skeleton width={150} height={14} style={{ marginTop: 12 }} />
      <Skeleton width="46%" height={11} style={{ marginTop: 10 }} />
    </FadeIn>
  );
}

export function SkeletonList({ count = 3 }) {
  return (
    <View accessibilityLabel="Loading sealed items" accessibilityRole="progressbar">
      {Array.from({ length: count }, (_, i) => <SkeletonItem key={i} delay={i * 80} />)}
    </View>
  );
}

/**
 * The hashing progress bar.
 *
 * The fill animates towards each new value rather than snapping to it, so
 * that eight chunks do not read as eight jerks. Width cannot be driven
 * natively, but this is one thin bar and the cost is nil.
 */
export function ProgressBar({ progress, indeterminate = false }) {
  const reduce = useReduceMotion();
  const w = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (indeterminate) return;
    Animated.timing(w, {
      toValue: Math.max(0, Math.min(1, progress)),
      duration: reduce ? 0 : 320,
      easing: Easing.bezier(0.22, 0.61, 0.36, 1),
      useNativeDriver: false,
    }).start();
  }, [progress, indeterminate, reduce, w]);

  // Before the first chunk lands there is no percentage to show, so the bar
  // says "working" rather than sitting empty and looking broken.
  useEffect(() => {
    if (!indeterminate || reduce) return;
    const loop = Animated.loop(
      Animated.timing(slide, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true })
    );
    loop.start();
    return () => { loop.stop(); slide.setValue(0); };
  }, [indeterminate, reduce, slide]);

  return (
    <View style={s.track}>
      {indeterminate ? (
        <Animated.View
          style={[s.fill, { width: "35%",
            transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [-120, 320] }) }] }]}
        />
      ) : (
        <Animated.View
          style={[s.fill, { width: w.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]}
        />
      )}
    </View>
  );
}

/**
 * The pending count.
 *
 * Breathes slowly while anything is unsynced and stops the moment the queue
 * is clear. Something that pulses forever stops being a signal.
 */
export function PendingBadge({ children, style, textStyle }) {
  const reduce = useReduceMotion();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.055, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, pulse]);

  return (
    <Animated.View style={[style, { transform: [{ scale: pulse }] }]}>{children}</Animated.View>
  );
}

/** The connection dot, which grows briefly when the server becomes reachable. */
export function StatusDot({ online, style, onlineStyle, offlineStyle }) {
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const wasOnline = useRef(online);

  useEffect(() => {
    if (online && !wasOnline.current && !reduce) {
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.7, duration: 170, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }),
      ]).start();
    }
    wasOnline.current = online;
  }, [online, reduce, scale]);

  return (
    <Animated.View
      style={[style, online ? onlineStyle : offlineStyle, { transform: [{ scale }] }]}
      accessibilityLabel={online ? "Server reachable" : "No connection to the server"}
    />
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: "#1c1c17", borderRadius: 10, padding: 14, marginBottom: 12 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  track: { height: 8, backgroundColor: "#12120f", borderRadius: 4, overflow: "hidden", marginTop: 4 },
  fill: { height: 8, backgroundColor: "#4ade80", borderRadius: 4 },
});
