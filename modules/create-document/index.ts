import { requireNativeModule } from 'expo';

/** System create-document dialog. Resolves the document URI with a persistable grant, or null if cancelled. */
export function createDocument(name: string, mime: string): Promise<string | null> {
  // Resolved on call, not at import: the module is Android-only and importing this file must not throw elsewhere.
  return requireNativeModule('CreateDocument').createDocument(name, mime);
}
