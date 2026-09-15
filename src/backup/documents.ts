import { createDocument as nativeCreateDocument, write } from '../../modules/create-document';

/**
 * Ask the user to create `name` in their cloud storage through the system dialog, then write
 * `content` into it. Returns the document URI to remember, or null if they cancelled. Google Drive
 * supports this but not folder grants, which is why a backup is two picked files, not a folder.
 */
export async function createDocument(name: string, mime: string, content: string): Promise<string | null> {
  const uri = await nativeCreateDocument(name, mime);
  if (uri === null) return null;
  await overwrite(uri, content);
  return uri;
}

/** Overwrite a document from createDocument in place, truncating first. Throws if the URI no longer works. */
export function overwrite(uri: string, content: string): Promise<void> {
  return write(uri, content);
}
