import type { ConfigContext, ExpoConfig } from 'expo/config';

// The Google Maps key (Android map in the track editor) comes from the
// environment so it never lands in git: .env.local locally, EAS env vars on builds.
export default ({ config }: ConfigContext): ExpoConfig => {
  const androidGoogleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!androidGoogleMapsApiKey) {
    console.warn('GOOGLE_MAPS_API_KEY not set: the track editor map will be blank on Android.');
  }
  return {
    ...(config as ExpoConfig),
    plugins: [...(config.plugins ?? []), ['react-native-maps', { androidGoogleMapsApiKey }]],
  };
};
