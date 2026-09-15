import * as FS from 'expo-file-system/legacy';
import { saveDocuments } from '@react-native-documents/picker';

/**
 * Ask the user to create `name` in their cloud storage through the system dialog, seeded with
 * `content`. Returns the document URI to remember, or null if they cancelled. Google Drive
 * supports this but not folder grants, which is why a backup is two picked files, not a folder.
 */
export async function createDocument(name: string, mime: string, content: string): Promise<string | null> {
  const seed = `${FS.cacheDirectory}${name}`;
  await FS.writeAsStringAsync(seed, content);
  const [r] = await saveDocuments({ sourceUris: [seed], fileName: name, mimeType: mime });
  return r?.uri ?? null;
}

/** Overwrite a document from createDocument in place. Throws if the URI no longer works. */
export function overwrite(uri: string, content: string): Promise<void> {
  return FS.StorageAccessFramework.writeAsStringAsync(uri, content);
}
