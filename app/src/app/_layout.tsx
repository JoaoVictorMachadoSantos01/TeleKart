import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../theme.ts';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'TeleKart' }} />
        <Stack.Screen name="live" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="session/[id]" options={{ title: 'Sessão' }} />
        <Stack.Screen name="tracks" options={{ title: 'Circuitos' }} />
        <Stack.Screen name="track/edit" options={{ title: 'Circuito' }} />
      </Stack>
    </>
  );
}
