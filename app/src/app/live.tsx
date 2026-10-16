import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { buildTrack, type Track } from '../core/track.ts';
import { getActiveTrackId, getTrack } from '../trackStore.ts';
import { useLiveSession, type Source } from '../useLiveSession.ts';
import { formatDelta, formatLap } from '../format.ts';
import { colors } from '../theme.ts';

/** Current lap clock, re-rendered on its own so the rest of the screen stays still. */
function LapClock({ lapStartT, now, size }: { lapStartT: number | null; now: () => number; size: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const h = setInterval(() => tick((n) => n + 1), 50);
    return () => clearInterval(h);
  }, []);
  return (
    <Text style={[styles.mono, { fontSize: size, color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
      {lapStartT === null ? formatLap(null) : formatLap(now() - lapStartT)}
    </Text>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.mono, styles.statValue, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

export default function Live() {
  useKeepAwake();
  const params = useLocalSearchParams<{ source?: string; track?: string }>();
  const source: Source = params.source === 'sim' ? 'sim' : 'gps';
  const [track, setTrack] = useState<Track | null>(null);

  useEffect(() => {
    (async () => {
      const data = await getTrack(params.track ?? (await getActiveTrackId()));
      if (data) setTrack(buildTrack(data));
    })().catch(() => router.back());
  }, [params.track]);

  if (!track) return <View style={styles.container} />;
  return <LiveSession track={track} source={source} />;
}

function LiveSession({ track, source }: { track: Track; source: Source }) {
  const { state, now } = useLiveSession(track, source);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const landscape = width > height;
  const big = Math.min(width, height) * (landscape ? 0.32 : 0.22);

  const delta = state.deltaMs;
  const deltaBg = delta == null ? colors.panel : delta <= 0 ? colors.faster : colors.slower;
  const gpsWeak = state.accuracyM != null && state.accuracyM > 10;

  let banner: string | null = null;
  if (state.status === 'starting') banner = source === 'gps' ? 'Aguardando GPS…' : 'Iniciando simulação…';
  else if (state.status === 'denied') banner = 'Permissão de localização negada. Ative nas configurações.';
  else if (state.status === 'error') banner = `Erro de GPS: ${state.error}`;
  else if (state.lapStartT === null) banner = 'Volta de saída — cruze a linha de chegada para começar';

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8, paddingLeft: insets.left + 8, paddingRight: insets.right + 8 },
      ]}
    >
      {state.flash ? (
        <View style={[styles.flash, { backgroundColor: state.flash.isBest ? colors.best : colors.panel }]}>
          <Text style={styles.flashLabel}>
            Volta {state.flash.lap.number}
            {state.flash.isBest ? ' · MELHOR' : ''}
          </Text>
          <Text style={[styles.mono, { fontSize: big, color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
            {formatLap(state.flash.lap.timeMs)}
          </Text>
        </View>
      ) : (
        <View style={[styles.main, landscape && styles.row]}>
          <View style={[styles.deltaBox, { backgroundColor: deltaBg }]}>
            <Text style={styles.deltaLabel}>Delta vs melhor</Text>
            <Text style={[styles.mono, { fontSize: big, color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>
              {formatDelta(delta)}
            </Text>
          </View>
          <View style={styles.clockBox}>
            <Text style={styles.statLabel}>Volta {state.lapNumber || '–'}</Text>
            <LapClock lapStartT={state.lapStartT} now={now} size={big * 0.8} />
          </View>
        </View>
      )}

      {banner ? <Text style={styles.banner}>{banner}</Text> : null}

      <View style={styles.stats}>
        <Stat label="Última" value={formatLap(state.last?.timeMs)} />
        <Stat label="Melhor" value={formatLap(state.best?.timeMs)} color={colors.best} />
        <Stat label="Prevista" value={formatLap(state.predictedMs)} />
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, gpsWeak && { color: colors.slower }]}>
          GPS {state.accuracyM != null ? `±${state.accuracyM.toFixed(0)} m` : '–'} · {state.rateHz.toFixed(0)} Hz
          {source === 'sim' ? ' · simulação' : ''}
        </Text>
        <Text style={[styles.footerText, styles.mono]}>{state.speedKmh.toFixed(0)} km/h</Text>
        <Pressable
          delayLongPress={800}
          onLongPress={() => router.back()}
          style={({ pressed }) => [styles.stop, pressed && { backgroundColor: colors.slower }]}
        >
          <Text style={styles.stopText}>Segure para parar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, gap: 8 },
  mono: { fontVariant: ['tabular-nums'], fontWeight: '800' },
  main: { flex: 1, gap: 8 },
  row: { flexDirection: 'row' },
  deltaBox: { flex: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  deltaLabel: { color: colors.text, opacity: 0.8, fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 },
  clockBox: { flex: 1, borderRadius: 16, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  flash: { flex: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  flashLabel: { color: colors.text, fontSize: 20, fontWeight: '700', textTransform: 'uppercase' },
  banner: { color: colors.accent, textAlign: 'center', fontSize: 16, fontWeight: '600' },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: colors.panel, borderRadius: 12, padding: 10, alignItems: 'center' },
  statLabel: { color: colors.dim, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 },
  statValue: { color: colors.text, fontSize: 28 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  footerText: { color: colors.dim, fontSize: 14 },
  stop: { borderWidth: 1, borderColor: colors.slower, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  stopText: { color: colors.text, fontWeight: '600' },
});
