/**
 * §6.8 slice: ambient type augmentations for the File System Access API surface
 * `fsBackupStore.ts` actually calls. TypeScript's own bundled `lib.dom.d.ts` already declares
 * `FileSystemFileHandle`/`FileSystemHandle`/`FileSystemWritableFileStream` (as of TS 5.9) but is
 * missing two real pieces this project needs: the permission-query extension
 * (`queryPermission`/`requestPermission`, a still-non-standard WICG addition, Chrome/Edge only)
 * and `window.showSaveFilePicker` itself (the entry point that produces a handle in the first
 * place) -- neither exists anywhere in the bundled lib. Declaration-merged onto the existing
 * interfaces here rather than redeclared wholesale, so this doesn't fight with (or need to keep
 * in sync with) `lib.dom.d.ts`'s own real `createWritable`/`write`/`name`/`kind` members.
 */

interface FileSystemFileHandle {
  queryPermission(descriptor: { mode: 'read' | 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission(descriptor: { mode: 'read' | 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}

interface Window {
  showSaveFilePicker?(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
}
