import { Platform } from 'react-native';
import { createDocument, pickFolder, remove, write, writeInFolder } from '../../modules/create-document';

export type BackupDoc = { name: string; mime: string; content: string };

// iOS location: "<folder bookmark, base64>#<file name>". Base64 never contains '#'.
const SEP = '#';

/**
 * Ask the user where the backup lives and write the documents there. Returns one location per
 * document, to remember for `overwrite`, or null if they cancelled.
 * Android: one create-document dialog per file, because Google Drive has no folder grant there.
 * iOS: one folder from the Files app, whose providers do grant folders, with the files inside.
 */
export async function createDocuments(docs: BackupDoc[]): Promise<string[] | null> {
  if (Platform.OS === 'ios') {
    const folder = await pickFolder();
    if (folder === null) return null;
    const uris = docs.map(d => folder + SEP + d.name);
    for (let i = 0; i < docs.length; i++) await overwrite(uris[i], docs[i].content);
    return uris;
  }
  const uris: string[] = [];
  const discard = () => Promise.all(uris.map(u => remove(u).catch(() => {})));   // no orphans
  try {
    for (const d of docs) {
      const uri = await createDocument(d.name, d.mime);
      if (uri === null) { await discard(); return null; }
      uris.push(uri);
      await write(uri, d.content);
    }
    return uris;
  } catch (e) {   // a location that refuses the persistable grant, or a failed write
    await discard();
    throw e;
  }
}

/** Overwrite a document from createDocuments in place, truncating first. Throws if the location no longer works. */
export function overwrite(uri: string, content: string): Promise<void> {
  if (Platform.OS === 'ios') {
    const i = uri.indexOf(SEP);
    return writeInFolder(uri.slice(0, i), uri.slice(i + 1), content);
  }
  return write(uri, content);
}
