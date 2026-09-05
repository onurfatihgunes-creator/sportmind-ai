import { useCallback, useState } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useDerivedValue,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * Faithful port of the design handoff's <canvas> hero (see
 * design_handoff_sportmind_onboarding/reference.html) to react-native-svg +
 * Reanimated, per the handoff's own README guidance for RN targets without
 * react-native-skia installed. All geometry/timing constants below are
 * transcribed 1:1 from that reference; only the rendering primitive differs
 * (SVG shapes driven by useAnimatedProps instead of raw 2D canvas calls).
 * One acknowledged gap: canvas shadowBlur has no SVG equivalent here, so
 * glows are approximated with layered opacity rather than a true blur.
 */

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

const CYCLE = 11;
const CHAIN = [0, 2, 6, 5, 9, 10, 8];
const SEG_START = 2.0;
const SEG_DUR = 1.05;
const NODES_UV: [number, number][] = [
  [0.07, 0.5], [0.24, 0.16], [0.24, 0.4], [0.24, 0.62], [0.24, 0.86],
  [0.45, 0.26], [0.45, 0.5], [0.45, 0.76], [0.66, 0.2], [0.68, 0.5], [0.66, 0.8],
];
const HEAT_UV: [number, number][] = [[0.62, 0.32], [0.48, 0.62], [0.72, 0.52]];
const OPPONENTS_UV: [number, number][] = [[0.36, 0.34], [0.38, 0.68], [0.55, 0.44], [0.57, 0.72]];
const ALL_PAIRS: [number, number][] = (() => {
  const pairs: [number, number][] = [];
  for (let i = 0; i < NODES_UV.length; i++) {
    for (let j = i + 1; j < NODES_UV.length; j++) pairs.push([i, j]);
  }
  return pairs;
})();

function ease(x: number) {
  'worklet';
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return 1 - Math.pow(1 - x, 3);
}
function clamp01(x: number) {
  'worklet';
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function project(u: number, v: number, cx: number, topY: number, pw: number, ph: number): [number, number] {
  'worklet';
  const vv = Math.pow(v, 1.18);
  const s = 0.58 + 0.42 * vv;
  return [cx + (u - 0.5) * pw * s, topY + vv * ph];
}
function chainReached(tt: number) {
  'worklet';
  let reached = 0;
  for (let i = 0; i < CHAIN.length - 1; i++) {
    const p = clamp01((tt - (SEG_START + i * SEG_DUR * 0.86)) / SEG_DUR);
    if (p > 0) reached = i + 1;
  }
  return reached;
}

type Geo = { nodes: [number, number][]; heat: [number, number][]; opponents: [number, number][]; pw: number };
const EMPTY_GEO: Geo = {
  nodes: NODES_UV.map(() => [0, 0]),
  heat: HEAT_UV.map(() => [0, 0]),
  opponents: OPPONENTS_UV.map(() => [0, 0]),
  pw: 1,
};

type SharedGeo = ReturnType<typeof useSharedValue<Geo>>;
type SharedNum = ReturnType<typeof useSharedValue<number>>;

function MeshLine({ i, j, geo, t, fadeOut }: { i: number; j: number; geo: SharedGeo; t: SharedNum; fadeOut: SharedNum }) {
  const animatedProps = useAnimatedProps(() => {
    const a = geo.value.nodes[i];
    const b = geo.value.nodes[j];
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const dist = Math.hypot(dx, dy);
    if (dist > geo.value.pw * 0.3) {
      return { x1: a[0], y1: a[1], x2: a[0], y2: a[1], opacity: 0 };
    }
    const fl = 0.5 + 0.5 * Math.sin(t.value * 1.4 + i * 1.7 + j);
    const nodeIn = clamp01((((t.value % CYCLE) + CYCLE) % CYCLE - 0.7) / 1.3);
    return { x1: a[0], y1: a[1], x2: b[0], y2: b[1], opacity: (0.05 + 0.07 * fl) * nodeIn * fadeOut.value };
  });
  return <AnimatedLine animatedProps={animatedProps} stroke="rgba(91,75,138,1)" strokeWidth={1} />;
}

function HeatBlob({ index, geo, t, inPitch }: { index: number; geo: SharedGeo; t: SharedNum; inPitch: SharedNum }) {
  const animatedProps = useAnimatedProps(() => {
    const [x, y] = geo.value.heat[index];
    const pr = 0.62 + 0.38 * Math.sin(t.value * 1.1 + index * 2.1);
    const r = (34 + pr * 12) * (geo.value.pw / 380);
    return { cx: x, cy: y, r, opacity: 0.16 * pr * inPitch.value };
  });
  return <AnimatedCircle animatedProps={animatedProps} fill="rgba(122,104,196,1)" />;
}

function PitchNode({ index, geo, t, fadeOut }: { index: number; geo: SharedGeo; t: SharedNum; fadeOut: SharedNum }) {
  const dotProps = useAnimatedProps(() => {
    const [x, y] = geo.value.nodes[index];
    const tt = ((t.value % CYCLE) + CYCLE) % CYCLE;
    const app = ease(clamp01((tt - 0.7 - index * 0.055) / 0.6)) * fadeOut.value;
    const chainIdx = CHAIN.indexOf(index);
    const active = chainIdx > -1 && chainIdx <= chainReached(tt);
    const r = active ? 5.4 : 4;
    return { cx: x, cy: y, r, opacity: app, fill: active ? '#5b4b8a' : 'rgba(91,75,138,0.34)' };
  });
  const haloProps = useAnimatedProps(() => {
    const [x, y] = geo.value.nodes[index];
    const tt = ((t.value % CYCLE) + CYCLE) % CYCLE;
    const app = ease(clamp01((tt - 0.7 - index * 0.055) / 0.6)) * fadeOut.value;
    const chainIdx = CHAIN.indexOf(index);
    const active = chainIdx > -1 && chainIdx <= chainReached(tt);
    const pulse = 0.5 + 0.5 * Math.sin(t.value * 2.2 + index);
    return { cx: x, cy: y, r: 8 + pulse * 7, opacity: active ? (0.35 - 0.22 * pulse) * app : 0 };
  });
  return (
    <>
      <AnimatedCircle animatedProps={haloProps} fill="none" stroke="rgba(122,104,196,1)" strokeWidth={1.2} />
      <AnimatedCircle animatedProps={dotProps} stroke="rgba(255,255,255,0.9)" strokeWidth={1.4} />
    </>
  );
}

function ChainSegment({ index, geo, t, fadeOut }: { index: number; geo: SharedGeo; t: SharedNum; fadeOut: SharedNum }) {
  const lineProps = useAnimatedProps(() => {
    const a = geo.value.nodes[CHAIN[index]];
    const b = geo.value.nodes[CHAIN[index + 1]];
    const tt = ((t.value % CYCLE) + CYCLE) % CYCLE;
    const p = clamp01((tt - (SEG_START + index * SEG_DUR * 0.86)) / SEG_DUR);
    if (p <= 0) return { x1: a[0], y1: a[1], x2: a[0], y2: a[1], opacity: 0, strokeWidth: 2.2, strokeDasharray: undefined as number[] | undefined };
    const ep = ease(p);
    const ex = a[0] + (b[0] - a[0]) * ep;
    const ey = a[1] + (b[1] - a[1]) * ep;
    return {
      x1: a[0],
      y1: a[1],
      x2: ex,
      y2: ey,
      opacity: (p < 1 ? 0.85 : 0.42) * fadeOut.value,
      strokeWidth: p < 1 ? 2.2 : 1.4,
      strokeDasharray: p < 1 ? undefined : [4, 5],
    };
  });
  const ballProps = useAnimatedProps(() => {
    const a = geo.value.nodes[CHAIN[index]];
    const b = geo.value.nodes[CHAIN[index + 1]];
    const tt = ((t.value % CYCLE) + CYCLE) % CYCLE;
    const p = clamp01((tt - (SEG_START + index * SEG_DUR * 0.86)) / SEG_DUR);
    if (p <= 0 || p >= 1) return { cx: a[0], cy: a[1], opacity: 0 };
    const ep = ease(p);
    return { cx: a[0] + (b[0] - a[0]) * ep, cy: a[1] + (b[1] - a[1]) * ep, opacity: fadeOut.value };
  });
  return (
    <>
      <AnimatedLine animatedProps={lineProps} stroke="rgba(91,75,138,1)" strokeLinecap="round" />
      <AnimatedCircle animatedProps={ballProps} r={4.6} fill="#2b2740" />
    </>
  );
}

function Opponent({ index, geo, t, fadeOut }: { index: number; geo: SharedGeo; t: SharedNum; fadeOut: SharedNum }) {
  const animatedProps = useAnimatedProps(() => {
    const [x, y] = geo.value.opponents[index];
    const tt = ((t.value % CYCLE) + CYCLE) % CYCLE;
    const app = ease(clamp01((tt - 1.2) / 0.9)) * fadeOut.value * 0.75;
    const dx = Math.sin(t.value * 0.6 + index) * 12;
    const dy = Math.cos(t.value * 0.5 + index) * 12;
    return { transform: [{ translateX: x + dx }, { translateY: y + dy }, { rotate: '45deg' }], opacity: app };
  });
  return (
    <AnimatedG animatedProps={animatedProps}>
      <Rect x={-3.4} y={-3.4} width={6.8} height={6.8} fill="rgba(43,39,64,0.16)" />
    </AnimatedG>
  );
}

export default function OnboardingHero() {
  const reduceMotion = useReducedMotion();
  const [staticPaths, setStaticPaths] = useState<null | {
    pitch: string; stripes: string[]; halfway: string; boxes: string[]; circle: string; W: number; H: number;
  }>(null);
  const geo = useSharedValue<Geo>(EMPTY_GEO);
  const t = useSharedValue(reduceMotion ? 3.4 : 0);

  useFrameCallback((frame) => {
    if (reduceMotion) return;
    t.value = (frame.timeSinceFirstFrame ?? 0) / 1000;
  }, !reduceMotion);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: W, height: H } = e.nativeEvent.layout;
    if (!W || !H) return;
    const pw = Math.min(W * 0.92, 420);
    const ph = Math.min(H * 0.52, 300);
    const cx = W * 0.5;
    const topY = H * 0.42;
    const P = (u: number, v: number) => project(u, v, cx, topY, pw, ph);

    const pitch = `M${P(0, 0).join(',')} L${P(1, 0).join(',')} L${P(1, 1).join(',')} L${P(0, 1).join(',')} Z`;
    const stripes = [0, 2, 4, 6].map((i) => {
      const a = P(i / 8, 0), b = P((i + 1) / 8, 0), c = P((i + 1) / 8, 1), d = P(i / 8, 1);
      return `M${a.join(',')} L${b.join(',')} L${c.join(',')} L${d.join(',')} Z`;
    });
    const halfway = `M${P(0.5, 0).join(',')} L${P(0.5, 1).join(',')}`;
    const boxes = [0, 1].map((u) => {
      const bw = u ? -0.11 : 0.11;
      const p1 = P(u + bw, 0.28), p2 = P(u, 0.28), p3 = P(u + bw, 0.72), p4 = P(u, 0.72);
      return `M${p1.join(',')} L${p2.join(',')} M${p1.join(',')} L${p3.join(',')} M${p3.join(',')} L${p4.join(',')}`;
    });
    let circle = '';
    for (let a = 0; a <= 64; a++) {
      const th = (a / 64) * Math.PI * 2;
      const p = P(0.5 + Math.cos(th) * 0.1, 0.5 + Math.sin(th) * 0.19);
      circle += a ? ` L${p.join(',')}` : `M${p.join(',')}`;
    }

    geo.value = {
      nodes: NODES_UV.map(([u, v]) => P(u, v)),
      heat: HEAT_UV.map(([u, v]) => P(u, v)),
      opponents: OPPONENTS_UV.map(([u, v]) => P(u, v)),
      pw,
    };
    setStaticPaths({ pitch, stripes, halfway, boxes, circle, W, H });
  }, [geo]);

  const tt = useDerivedValue(() => (((t.value % CYCLE) + CYCLE) % CYCLE));
  const fadeOut = useDerivedValue(() => 1 - ease(clamp01((tt.value - 10.2) / 0.8)));
  const inPitch = useDerivedValue(() => ease(clamp01(tt.value / 1.1)) * fadeOut.value);

  const pitchGroupProps = useAnimatedProps(() => ({ opacity: inPitch.value }));
  const scanLineProps = useAnimatedProps(() => {
    if (!staticPaths) return { x1: 0, y1: 0, x2: 0, y2: 0, opacity: 0 };
    const W = staticPaths.W, H = staticPaths.H;
    const pw = geo.value.pw;
    const ph = Math.min(H * 0.52, 300);
    const cx = W * 0.5, topY = H * 0.42;
    const sw = ((t.value % 4.4) + 4.4) % 4.4 / 4.4;
    const [lx, ly] = project(0, sw, cx, topY, pw, ph);
    const [rx] = project(1, sw, cx, topY, pw, ph);
    const gate = clamp01((inPitch.value - 0.6) / 0.4);
    const a = Math.sin(sw * Math.PI) * 0.5 * fadeOut.value * gate;
    return { x1: lx, y1: ly, x2: rx, y2: ly, opacity: a };
  });
  const scanGlowProps = useAnimatedProps(() => {
    if (!staticPaths) return { y: 0, opacity: 0 };
    const W = staticPaths.W, H = staticPaths.H;
    const pw = geo.value.pw;
    const ph = Math.min(H * 0.52, 300);
    const cx = W * 0.5, topY = H * 0.42;
    const sw = ((t.value % 4.4) + 4.4) % 4.4 / 4.4;
    const [, ly] = project(0, sw, cx, topY, pw, ph);
    const gate = clamp01((inPitch.value - 0.6) / 0.4);
    const a = Math.sin(sw * Math.PI) * 0.5 * fadeOut.value * gate;
    return { y: ly - 26, opacity: a * 0.5 };
  });

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="ambientGlow" cx="50%" cy="55%" r="65%">
            <Stop offset="0" stopColor="#9284d6" stopOpacity={0.18} />
            <Stop offset="0.7" stopColor="#9284d6" stopOpacity={0.05} />
            <Stop offset="1" stopColor="#9284d6" stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="pitchSurface" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.1} />
            <Stop offset="1" stopColor="#ffffff" stopOpacity={0.66} />
          </LinearGradient>
          <LinearGradient id="scanGlowGradient" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="rgba(122,104,196,0)" stopOpacity={0} />
            <Stop offset="1" stopColor="rgba(122,104,196,1)" stopOpacity={0.26} />
          </LinearGradient>
          {staticPaths && (
            <ClipPath id="pitchClip">
              <Path d={staticPaths.pitch} />
            </ClipPath>
          )}
        </Defs>

        <Rect x={0} y={0} width="100%" height="100%" fill="url(#ambientGlow)" />

        {staticPaths && (
          <AnimatedG animatedProps={pitchGroupProps}>
            <Path d={staticPaths.pitch} fill="url(#pitchSurface)" stroke="rgba(91,75,138,0.30)" strokeWidth={1.2} />
            <G clipPath="url(#pitchClip)">
              {staticPaths.stripes.map((d, i) => (
                <Path key={i} d={d} fill="rgba(122,104,196,0.045)" />
              ))}
            </G>
            <Path d={staticPaths.halfway} stroke="rgba(91,75,138,0.22)" strokeWidth={1} />
            {staticPaths.boxes.map((d, i) => (
              <Path key={i} d={d} stroke="rgba(91,75,138,0.22)" strokeWidth={1} fill="none" />
            ))}
            <Path d={staticPaths.circle} stroke="rgba(91,75,138,0.22)" strokeWidth={1} fill="none" />
          </AnimatedG>
        )}

        {HEAT_UV.map((_, i) => (
          <HeatBlob key={i} index={i} geo={geo} t={t} inPitch={inPitch} />
        ))}

        {staticPaths && <AnimatedRect animatedProps={scanGlowProps} x={0} width={staticPaths.W} height={26} fill="url(#scanGlowGradient)" clipPath="url(#pitchClip)" />}
        {staticPaths && <AnimatedLine animatedProps={scanLineProps} stroke="rgba(122,104,196,0.9)" strokeWidth={1.6} />}

        {ALL_PAIRS.map(([i, j], k) => (
          <MeshLine key={k} i={i} j={j} geo={geo} t={t} fadeOut={fadeOut} />
        ))}

        {CHAIN.slice(0, -1).map((_, i) => (
          <ChainSegment key={i} index={i} geo={geo} t={t} fadeOut={fadeOut} />
        ))}

        {NODES_UV.map((_, i) => (
          <PitchNode key={i} index={i} geo={geo} t={t} fadeOut={fadeOut} />
        ))}

        {OPPONENTS_UV.map((_, i) => (
          <Opponent key={i} index={i} geo={geo} t={t} fadeOut={fadeOut} />
        ))}
      </Svg>
    </View>
  );
}
