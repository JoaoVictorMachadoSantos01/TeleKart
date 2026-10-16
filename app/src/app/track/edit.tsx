import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { Marker, Polyline, type LatLng, type MapPressEvent, type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LatLon } from '../../core/geo.ts';
import { DEFAULT_TRACK_WIDTH_M, buildTrack, project, trackBorders, type TrackData } from '../../core/track.ts';
import { insertionIndex, reverseLoop, simplifyLoop } from '../../core/trackEdit.ts';
import { getTrack, newTrackId, saveTrack, setActiveTrackId } from '../../trackStore.ts';
import { BUILTIN_TRACKS } from '../../tracks/index.ts';
import { colors } from '../../theme.ts';

type Mode = 'add' | 'insert' | 'finish';

const MODES: { mode: Mode; label: string; hint: string }[] = [
  { mode: 'add', label: 'Traçar', hint: 'Toque no meio da pista, no sentido da corrida' },
  { mode: 'insert', label: 'Inserir', hint: 'Toque perto do traçado para inserir um ponto' },
  { mode: 'finish', label: 'Chegada', hint: 'Toque nos dois lados da pista na linha de chegada' },
];

/** Above this many points, draggable markers make the map sluggish. */
const MAX_MARKERS = 150;

const toLatLng = (p: LatLon): LatLng => ({ latitude: p.lat, longitude: p.lon });
const fromPair = ([lat, lon]: number[]): LatLon => ({ lat, lon });

function regionFor(points: LatLon[]): Region {
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(0.002, (maxLat - minLat) * 1.5),
    longitudeDelta: Math.max(0.002, (maxLon - minLon) * 1.5),
  };
}

export default function TrackEditor() {
  const params = useLocalSearchParams<{ id?: string; copy?: string }>();
  const insets = useSafeAreaInsets();

  const [id, setId] = useState(params.id ?? newTrackId());
  const [name, setName] = useState('');
  const [widthM, setWidthM] = useState(DEFAULT_TRACK_WIDTH_M);
  const [line, setLine] = useState<LatLon[]>([]);
  const [finish, setFinish] = useState<LatLon[]>([]);
  const [mode, setMode] = useState<Mode>('add');
  const [selected, setSelected] = useState<number | null>(null);
  const [satellite, setSatellite] = useState(true);
  const [region, setRegion] = useState<Region | null>(null);

  // Load the track being edited (or copied), else center the map on the user.
  useEffect(() => {
    (async () => {
      const sourceId = params.id ?? params.copy;
      const src = sourceId ? await getTrack(sourceId) : null;
      if (src) {
        // Traces recorded every ~2 m (like the built-in ones) are simplified to
        // a few dozen editable points; the shape moves by less than 0.5 m.
        const all = src.centerline.map(fromPair);
        const pts = all.length > MAX_MARKERS ? simplifyLoop(all, 0.5) : all;
        setName(params.copy ? `${src.name} (cópia)` : src.name);
        setWidthM(src.widthM ?? DEFAULT_TRACK_WIDTH_M);
        setLine(pts);
        setFinish(src.finishLine.map(fromPair));
        if (params.copy) setId(newTrackId());
        setRegion(regionFor(pts));
        return;
      }
      setName('Meu circuito');
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos =
            (await Location.getLastKnownPositionAsync()) ??
            (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
          setRegion({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, latitudeDelta: 0.004, longitudeDelta: 0.004 });
          return;
        }
      } catch {
        // No location: fall through to the default circuit's area.
      }
      setRegion(regionFor(BUILTIN_TRACKS[0].centerline.map(fromPair)));
    })();
  }, [params.id, params.copy]);

  const data: TrackData = useMemo(
    () => ({
      id,
      name: name.trim(),
      widthM,
      centerline: line.map((p) => [p.lat, p.lon]),
      finishLine: finish.map((p) => [p.lat, p.lon]),
    }),
    [id, name, widthM, line, finish],
  );

  // Build the track live so the limits and length update while drawing.
  const preview = useMemo(() => {
    if (line.length < 3 || finish.length < 2) return { track: null, error: null };
    try {
      const track = buildTrack(data);
      const off = project(track, { x: 0, y: 0 }).offsetM;
      if (off > widthM + 15) return { track, error: 'A linha de chegada está longe do traçado.' };
      return { track, error: null };
    } catch (e) {
      return { track: null, error: (e as Error).message };
    }
  }, [data, line.length, finish.length, widthM]);

  const borders = useMemo(() => (preview.track ? trackBorders(preview.track) : null), [preview.track]);

  let status: string;
  if (line.length < 3) status = `Traçado: ${line.length} de pelo menos 3 pontos`;
  else if (finish.length < 2) status = 'Falta marcar a linha de chegada (modo Chegada)';
  else if (preview.error) status = preview.error;
  else status = `${Math.round(preview.track!.lengthM)} m · ${line.length} pontos · pronto para salvar`;
  const canSave = !!preview.track && !preview.error && data.name.length > 0;

  const onMapPress = (e: MapPressEvent) => {
    if (e.nativeEvent.action === 'marker-press') return;
    const p = { lat: e.nativeEvent.coordinate.latitude, lon: e.nativeEvent.coordinate.longitude };
    setSelected(null);
    if (mode === 'add') setLine((l) => [...l, p]);
    else if (mode === 'insert') {
      setLine((l) => {
        const i = insertionIndex(l, p);
        return [...l.slice(0, i), p, ...l.slice(i)];
      });
    } else setFinish((f) => (f.length >= 2 ? [p] : [...f, p]));
  };

  const movePoint = (i: number, c: LatLng) =>
    setLine((l) => l.map((p, k) => (k === i ? { lat: c.latitude, lon: c.longitude } : p)));
  const moveFinish = (i: number, c: LatLng) =>
    setFinish((f) => f.map((p, k) => (k === i ? { lat: c.latitude, lon: c.longitude } : p)));

  const undo = () => {
    if (mode === 'finish') setFinish((f) => f.slice(0, -1));
    else setLine((l) => l.slice(0, -1));
    setSelected(null);
  };

  const removeSelected = () => {
    if (selected === null) return;
    setLine((l) => l.filter((_, k) => k !== selected));
    setSelected(null);
  };

  const save = () => {
    if (!canSave) return;
    try {
      saveTrack(data);
      setActiveTrackId(data.id);
      router.back();
    } catch (e) {
      Alert.alert('Não foi possível salvar', (e as Error).message);
    }
  };

  const closed = line.length >= 3 ? [...line, line[0]] : line;
  const arrow =
    line.length >= 2
      ? {
          at: { lat: (line[0].lat + line[1].lat) / 2, lon: (line[0].lon + line[1].lon) / 2 },
          rotation: (Math.atan2((line[1].lon - line[0].lon) * Math.cos((line[0].lat * Math.PI) / 180), line[1].lat - line[0].lat) * 180) / Math.PI,
        }
      : null;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: params.id ? 'Editar circuito' : 'Novo circuito',
          headerRight: () => (
            <Pressable onPress={save} disabled={!canSave} hitSlop={10}>
              <Text style={[styles.saveText, !canSave && { opacity: 0.35 }]}>Salvar</Text>
            </Pressable>
          ),
        }}
      />

      <View style={styles.top}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Nome do circuito"
          placeholderTextColor={colors.dim}
          style={styles.name}
        />
        <View style={styles.modes}>
          {MODES.map((m) => (
            <Pressable
              key={m.mode}
              onPress={() => {
                setMode(m.mode);
                setSelected(null);
              }}
              style={[styles.modeBtn, mode === m.mode && styles.modeOn]}
            >
              <Text style={[styles.modeText, mode === m.mode && { color: '#000' }]}>{m.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>{MODES.find((m) => m.mode === mode)!.hint}</Text>
      </View>

      {region ? (
        <MapView
          style={styles.map}
          initialRegion={region}
          mapType={satellite ? 'satellite' : 'standard'}
          onPress={onMapPress}
          showsUserLocation
          showsMyLocationButton
          toolbarEnabled={false}
          pitchEnabled={false}
        >
          {borders ? (
            <>
              <Polyline coordinates={borders.left.map(toLatLng)} strokeColor="#ffffff" strokeWidth={2} />
              <Polyline coordinates={borders.right.map(toLatLng)} strokeColor="#ffffff" strokeWidth={2} />
            </>
          ) : null}
          {closed.length >= 2 ? (
            <Polyline coordinates={closed.map(toLatLng)} strokeColor={colors.accent} strokeWidth={2} lineDashPattern={[6, 6]} />
          ) : null}
          {finish.length === 2 ? <Polyline coordinates={finish.map(toLatLng)} strokeColor={colors.slower} strokeWidth={5} /> : null}

          {(line.length <= MAX_MARKERS ? line : line.slice(0, 1)).map((p, i) => (
            <Marker
              key={`p${i}-${selected === i}-${i === 0}`}
              coordinate={toLatLng(p)}
              anchor={{ x: 0.5, y: 0.5 }}
              draggable
              stopPropagation
              tracksViewChanges={false}
              onPress={() => setSelected(i)}
              onDragEnd={(e) => movePoint(i, e.nativeEvent.coordinate)}
            >
              <View style={[styles.dot, i === 0 && styles.dotFirst, selected === i && styles.dotSelected]} />
            </Marker>
          ))}
          {finish.map((p, i) => (
            <Marker
              key={`f${i}`}
              coordinate={toLatLng(p)}
              anchor={{ x: 0.5, y: 0.5 }}
              draggable
              stopPropagation
              tracksViewChanges={false}
              onDragEnd={(e) => moveFinish(i, e.nativeEvent.coordinate)}
            >
              <View style={styles.finishDot} />
            </Marker>
          ))}
          {arrow ? (
            <Marker
              key={`arrow-${arrow.rotation.toFixed(0)}`}
              coordinate={toLatLng(arrow.at)}
              anchor={{ x: 0.5, y: 0.5 }}
              flat
              rotation={arrow.rotation}
              tappable={false}
              tracksViewChanges={false}
            >
              <Text style={styles.arrow}>▲</Text>
            </Marker>
          ) : null}
        </MapView>
      ) : (
        <View style={[styles.map, styles.loading]}>
          <Text style={styles.hint}>Carregando mapa…</Text>
        </View>
      )}

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 8 }]}>
        <Text style={[styles.status, preview.error ? { color: colors.slower } : canSave ? { color: colors.faster } : null]}>
          {status}
        </Text>
        <View style={styles.row}>
          <Text style={styles.label}>Largura</Text>
          <Pressable style={styles.small} onPress={() => setWidthM((w) => Math.max(3, w - 1))}>
            <Text style={styles.smallText}>−</Text>
          </Pressable>
          <Text style={styles.widthValue}>{widthM} m</Text>
          <Pressable style={styles.small} onPress={() => setWidthM((w) => Math.min(30, w + 1))}>
            <Text style={styles.smallText}>+</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable style={styles.small} onPress={() => setSatellite((s) => !s)}>
            <Text style={styles.smallText}>{satellite ? 'Mapa' : 'Satélite'}</Text>
          </Pressable>
        </View>
        <View style={styles.row}>
          <Pressable style={styles.action} onPress={undo}>
            <Text style={styles.actionText}>Desfazer</Text>
          </Pressable>
          <Pressable style={styles.action} onPress={() => setLine((l) => reverseLoop(l))} disabled={line.length < 2}>
            <Text style={styles.actionText}>Inverter sentido</Text>
          </Pressable>
          <Pressable style={[styles.action, selected === null && { opacity: 0.35 }]} onPress={removeSelected} disabled={selected === null}>
            <Text style={styles.actionText}>Apagar ponto</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  top: { padding: 12, gap: 8 },
  name: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    backgroundColor: colors.panel,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modes: { flexDirection: 'row', gap: 8 },
  modeBtn: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingVertical: 10, alignItems: 'center' },
  modeOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  modeText: { color: colors.text, fontWeight: '600' },
  hint: { color: colors.dim, textAlign: 'center' },
  map: { flex: 1 },
  loading: { alignItems: 'center', justifyContent: 'center' },
  bottom: { padding: 12, gap: 10 },
  status: { color: colors.dim, textAlign: 'center', fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { color: colors.dim },
  widthValue: { color: colors.text, fontSize: 16, fontWeight: '700', minWidth: 44, textAlign: 'center' },
  small: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  smallText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  action: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  actionText: { color: colors.text, fontWeight: '600' },
  saveText: { color: colors.accent, fontSize: 17, fontWeight: '700' },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.accent, borderWidth: 2, borderColor: '#000' },
  dotFirst: { backgroundColor: colors.faster, width: 18, height: 18, borderRadius: 9 },
  dotSelected: { backgroundColor: '#fff', width: 20, height: 20, borderRadius: 10 },
  finishDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.slower, borderWidth: 2, borderColor: '#fff' },
  arrow: { color: colors.faster, fontSize: 22, fontWeight: '900' },
});
