import { lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Package manifests list files; removing a retired file does not always remove
// its now-empty parent directory on a Windows development workstation.
// Reject leftover files/symlinks, but do not mistake empty folders for runtime code.
export function findRetiredSourceEntries(root) {
  const entries = [];
  function visit(path) {
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (!stat) return;
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      for (const child of readdirSync(path)) visit(join(path, child));
      return;
    }
    entries.push(path);
  }
  visit(root);
  return entries;
}
