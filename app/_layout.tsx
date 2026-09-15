import { Stack } from 'expo-router';
import { BackupWiring } from '../src/backup/BackupWiring';
import { DbProvider } from '../src/db/provider';
export default function Root() {
  return (
    <DbProvider>
      <BackupWiring />
      <Stack screenOptions={{ headerShown: true }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </DbProvider>
  );
}
