import { requireNativeModule } from 'expo';

const native = requireNativeModule('CreateDocument');

/** System create-document dialog. Resolves the document URI with a persistable grant, or null if cancelled. */
export function createDocument(name: string, mime: string): Promise<string | null> {
  return native.createDocument(name, mime);
}
