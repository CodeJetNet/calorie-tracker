import { requireNativeModule } from 'expo';

// Resolved on call, not at import: each function is one platform's, and importing this file must not throw on the other.
const native = () => requireNativeModule('CreateDocument');

/** Android: system create-document dialog. Resolves the document URI with a persistable grant, or null if cancelled. */
export function createDocument(name: string, mime: string): Promise<string | null> {
  return native().createDocument(name, mime);
}

/** Android: overwrite a document in place, truncating first. Throws if the URI no longer works. */
export function write(uri: string, content: string): Promise<void> {
  return native().write(uri, content);
}

/** iOS: system folder dialog. Resolves a security-scoped bookmark of the folder, or null if cancelled. */
export function pickFolder(): Promise<string | null> {
  return native().pickFolder();
}

/** iOS: replace `name` inside the bookmarked folder whole. Throws if the bookmark no longer resolves. */
export function writeInFolder(bookmark: string, name: string, content: string): Promise<void> {
  return native().write(bookmark, name, content);
}
