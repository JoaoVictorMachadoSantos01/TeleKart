import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, router, useFocusEffect } from 'expo-router';
import { buildTrack, type Track } from '../core/track.ts';
import { listSessions, type SessionSummary } from '../storage.ts';
import { getActiveTrackId, getTrack } from '../trackStore.ts';
import { formatDate, formatLap } from '../format.ts';
import { colors } from '../theme.ts';

export default function Home() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [track, setTrack] = useState<Track | null>(null);

  useFocusEffect(
    useCallback(() => {
      listSessions().then(setSessions).catch(() => setSessions([]));
      getActiveTrackId()
        .then(getTrack)
        .then((t) => setTrack(t ? buildTrack(t) : null))
        .catch(() => setTrack(null));
    }, []),
  );

  return (
    <View style={styles.container}>
      <Pressable style={styles.track} onPress={() => router.push('/tracks')}>
        <View style={styles.trackHead}>
          <Text style={styles.trackName}>{track?.name ?? 'Carregando…'}</Text>
          <Text style={styles.change}>Trocar</Text>
        </View>
        {track ? (
          <Text style={styles.dim}>
            {Math.round(track.lengthM)} m · pista de {track.widthM} m · linha de chegada com {Math.round(track.gate.widthM)} m
          </Text>
        ) : null}
      </Pressable>

      <Pressable
        style={[styles.button, styles.primary, !track && { opacity: 0.4 }]}
        disabled={!track}
        onPress={() => router.push(`/live?source=gps&track=${track!.id}`)}
      >
        <Text style={styles.primaryText}>Iniciar sessão (GPS)</Text>
      </Pressable>
      <Pressable
        style={[styles.button, !track && { opacity: 0.4 }]}
        disabled={!track}
        onPress={() => router.push(`/live?source=sim&track=${track!.id}`)}
      >
        <Text style={styles.buttonText}>Simular voltas</Text>
      </Pressable>

      <Text style={styles.section}>Sessões</Text>
      <FlatList
        data={sessions}
        keyExtractor={(s) => s.id}
        ListEmptyComponent={<Text style={styles.dim}>Nenhuma sessão gravada ainda.</Text>}
        renderItem={({ item }) => (
          <Link href={`/session/${item.id}`} asChild>
            <Pressable style={styles.row}>
              <View>
                <Text style={styles.rowTitle}>
                  {formatDate(item.startedAt)}
                  {item.source === 'sim' ? '  · simulação' : ''}
                </Text>
                <Text style={styles.dim}>{item.laps.length} voltas</Text>
              </View>
              <Text style={styles.rowBest}>{formatLap(item.bestMs)}</Text>
            </Pressable>
          </Link>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12, backgroundColor: colors.bg },
  track: { backgroundColor: colors.panel, borderRadius: 12, padding: 16, gap: 4 },
  trackHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  trackName: { color: colors.text, fontSize: 20, fontWeight: '700', flexShrink: 1 },
  change: { color: colors.accent, fontWeight: '700' },
  dim: { color: colors.dim },
  button: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  primaryText: { color: '#000', fontSize: 18, fontWeight: '700' },
  buttonText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  section: { color: colors.dim, marginTop: 12, textTransform: 'uppercase', fontSize: 12, letterSpacing: 1 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowTitle: { color: colors.text, fontSize: 16 },
  rowBest: { color: colors.text, fontSize: 18, fontVariant: ['tabular-nums'], fontWeight: '600' },
});
