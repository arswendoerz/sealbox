// Folders are names on items. An empty folder is kept as its own vault row, { kind: 'folder',
// name }, encrypted like any item: it syncs, is in backups and is re-encrypted on key rotation.
// Such rows are never items: keep them out of lists, autofill and health checks.
export const isFolder = (plain) => plain?.kind === 'folder';

export const MAX_FOLDER_NAME = 60;

// Sorted, unique folder names from items and folder rows.
export function folderNames(items, folders) {
  return [...new Set([...items.map((i) => i.folder), ...folders.map((f) => f.name)].filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}
