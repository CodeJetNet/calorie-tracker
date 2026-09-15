import { Stack } from 'expo-router';
import { DbProvider } from '../src/db/provider';
export default function Root() {
  return (
    <DbProvider>
      <Stack screenOptions={{ headerShown: true }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </DbProvider>
  );
}
