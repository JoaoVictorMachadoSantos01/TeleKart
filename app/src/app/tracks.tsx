import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { buildTrack, type TrackData } from '../core/track.ts';
import {
  deleteTrack,
  getActiveTrackId,
  importTrack,
  listTracks,
  setActiveTrackId,
  shareTrack,
} from '../trackStore.ts';
import { colors } from '../theme.ts';

function lengthOf(t: TrackData): string {
  try {
    return `${Math.round(buildTrack(t).lengthM)} m`;
  } catch {
    return 'incompleto';
  }
}

export default function Tracks() {
  const [tracks, setTracks] = useState<TrackData[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const reload = useCallback(() => {
    listTracks().then(setTracks).catch(() => setTracks([]));
    getActiveTrackId().then(setActiveId);
  }, []);
  useFocusEffect(reload);

  const select = (t: TrackData) => {
    setActiveTrackId(t.id);
    router.back();
  };

  const onImport = async () => {
    try {
      const t = await importTrack();
      if (t) {
        reload();
        Alert.alert('Circuito importado', `"${t.name}" foi adicionado aos seus circuitos.`);
      }
    } catch (e) {
      Alert.alert('Não foi possível importar', (e as Error).message);
    }
  };

  const onShare = async (t: TrackData) => {
    try {
      await shareTrack(t);
    } catch (e) {
      Alert.alert('Não foi possível compartilhar', (e as Error).message);
    }
  };

  const onDelete = (t: TrackData) =>
    Alert.alert(`Apagar "${t.name}"?`, 'As sessões gravadas nele continuam salvas.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: () => {
          deleteTrack(t.id);
          if (t.id === activeId) setActiveTrackId(tracks[0].id);
          reload();
        },
      },
    ]);

  return (
    <View style={styles.container}>
      <View style={styles.actions}>
        <Pressable style={[styles.button, styles.primary]} onPress={() => router.push('/track/edit')}>
          <Text style={styles.primaryText}>Novo circuito</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={onImport}>
          <Text style={styles.buttonText}>Importar arquivo</Text>
        </Pressable>
      </View>

      <FlatList
        data={tracks}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
        renderItem={({ item }) => {
          const active = item.id === activeId;
          return (
            <Pressable style={[styles.card, active && styles.cardActive]} onPress={() => select(item)}>
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                {active ? <Text style={styles.badge}>EM USO</Text> : null}
              </View>
              <Text style={styles.dim}>
                {lengthOf(item)}
                {item.builtin ? ' · vem com o app' : ''}
              </Text>
              <View style={styles.cardActions}>
                <Pressable
                  hitSlop={8}
                  onPress={() => router.push(item.builtin ? `/track/edit?copy=${item.id}` : `/track/edit?id=${item.id}`)}
                >
                  <Text style={styles.link}>{item.builtin ? 'Copiar e editar' : 'Editar'}</Text>
                </Pressable>
                <Pressable hitSlop={8} onPress={() => onShare(item)}>
                  <Text style={styles.link}>Compartilhar</Text>
                </Pressable>
                {!item.builtin ? (
                  <Pressable hitSlop={8} onPress={() => onDelete(item)}>
                    <Text style={[styles.link, { color: colors.slower }]}>Apagar</Text>
                  </Pressable>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12, backgroundColor: colors.bg },
  actions: { flexDirection: 'row', gap: 10 },
  button: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  primaryText: { color: '#000', fontSize: 16, fontWeight: '700' },
  buttonText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  card: { backgroundColor: colors.panel, borderRadius: 12, padding: 14, gap: 6, borderWidth: 1, borderColor: colors.panel },
  cardActive: { borderColor: colors.accent },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: '700', flexShrink: 1 },
  badge: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  dim: { color: colors.dim },
  cardActions: { flexDirection: 'row', gap: 20, marginTop: 6 },
  link: { color: colors.accent, fontWeight: '600' },
});
