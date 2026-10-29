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

// Optional look of a folder, stored on its folder row.
export const FOLDER_COLORS = ['brand', 'bad', 'warn', 'ok', 'info'];
export const FOLDER_ICONS = ['folder', 'briefcase', 'school', 'shopping-cart', 'heart', 'home', 'device-gamepad-2', 'building-bank', 'plane'];

export function folderStyle(row) {
  return {
    color: FOLDER_COLORS.includes(row?.color) ? row.color : null,
    icon: FOLDER_ICONS.includes(row?.icon) ? row.icon : 'folder',
  };
}
