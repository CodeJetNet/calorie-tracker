import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { BackupWiring } from '../src/backup/BackupWiring';
import { DbProvider } from '../src/db/provider';

SplashScreen.preventAutoHideAsync();   // the branded splash stays up until the databases are open
/** Mounts only once DbProvider has its databases, so this is the moment the app is ready to show. */
function HideSplash() {
  useEffect(() => { SplashScreen.hide(); }, []);
  return null;
}

export default function Root() {
  return (
    <DbProvider>
      <HideSplash />
      <StatusBar style="dark" />
      <BackupWiring />
      {/* Screens draw their own header on the backdrop: src/ui/kit.tsx Screen */}
      <Stack screenOptions={{ headerShown: false }} />
    </DbProvider>
  );
}
