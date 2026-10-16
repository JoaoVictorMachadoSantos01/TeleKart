import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { deleteSession, loadSession, type SessionSummary } from '../../storage.ts';
import { formatDate, formatDelta, formatLap } from '../../format.ts';
import { colors } from '../../theme.ts';

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<SessionSummary | null | undefined>(undefined);

  useEffect(() => {
    loadSession(id).then(setSession).catch(() => setSession(null));
  }, [id]);

  if (session === undefined) return <View style={styles.container} />;
  if (session === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.dim}>Sessão não encontrada.</Text>
      </View>
    );
  }

  const best = session.bestMs;
  const confirmDelete = () =>
    Alert.alert('Apagar sessão?', 'Isso não pode ser desfeito.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: () => {
          deleteSession(session.id);
          router.back();
        },
      },
    ]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: formatDate(session.startedAt) }} />
      <View style={styles.header}>
        <Text style={styles.title}>{session.track}</Text>
        <Text style={styles.dim}>
          {session.laps.length} voltas{session.source === 'sim' ? ' · simulação' : ''}
        </Text>
        <Text style={[styles.best, styles.mono]}>Melhor {formatLap(best)}</Text>
      </View>

      <View style={[styles.row, styles.headRow]}>
        <Text style={[styles.cell, styles.dim]}>Volta</Text>
        <Text style={[styles.cellWide, styles.dim]}>Tempo</Text>
        <Text style={[styles.cellWide, styles.dim]}>Dif.</Text>
        <Text style={[styles.cell, styles.dim]}>Máx</Text>
      </View>
      <FlatList
        data={session.laps}
        keyExtractor={(l) => String(l.number)}
        ListEmptyComponent={<Text style={styles.dim}>Nenhuma volta completa.</Text>}
        renderItem={({ item }) => {
          const isBest = item.timeMs === best;
          return (
            <View style={styles.row}>
              <Text style={[styles.cell, styles.text]}>{item.number}</Text>
              <Text style={[styles.cellWide, styles.mono, { color: isBest ? colors.best : colors.text }]}>
                {formatLap(item.timeMs)}
              </Text>
              <Text style={[styles.cellWide, styles.mono, { color: isBest ? colors.dim : colors.slower }]}>
                {isBest || best == null ? '—' : formatDelta(item.timeMs - best)}
              </Text>
              <Text style={[styles.cell, styles.text]}>
                {item.maxSpeedKmh > 0 ? `${item.maxSpeedKmh.toFixed(0)}` : '–'}
              </Text>
            </View>
          );
        }}
      />

      <Pressable onPress={confirmDelete} style={styles.delete}>
        <Text style={{ color: colors.slower }}>Apagar sessão</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: colors.bg },
  header: { backgroundColor: colors.panel, borderRadius: 12, padding: 16, gap: 4, marginBottom: 12 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  best: { color: colors.best, fontSize: 24 },
  dim: { color: colors.dim },
  text: { color: colors.text },
  mono: { fontVariant: ['tabular-nums'], fontWeight: '700', fontSize: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headRow: { paddingVertical: 6 },
  cell: { flex: 1 },
  cellWide: { flex: 2 },
  delete: { alignItems: 'center', padding: 16 },
});
