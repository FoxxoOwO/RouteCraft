import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface DesktopLabFile {
  filePath: string;
  fileName: string;
  content: string;
}

/**
 * Returns true if running inside the native Tauri desktop container.
 */
export function isTauriApp(): boolean {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window;
}

/**
 * Native file open dialog for .onlab and .json topologies.
 */
export async function desktopOpenLab(): Promise<DesktopLabFile | null> {
  if (!isTauriApp()) return null;
  try {
    const res = (await invoke('open_lab_dialog')) as {
      file_path: string;
      file_name: string;
      content: string;
    } | null;

    if (res) {
      return {
        filePath: res.file_path,
        fileName: res.file_name,
        content: res.content,
      };
    }
    return null;
  } catch (err) {
    console.error('desktopOpenLab error:', err);
    throw err;
  }
}

/**
 * Native file save dialog for saving the current .onlab topology.
 */
export async function desktopSaveLab(
  content: string,
  defaultName?: string
): Promise<string | null> {
  if (!isTauriApp()) return null;
  try {
    const savedPath = (await invoke('save_lab_dialog', {
      content,
      defaultName: defaultName || 'routecraft_lab.onlab',
    })) as string | null;
    return savedPath;
  } catch (err) {
    console.error('desktopSaveLab error:', err);
    throw err;
  }
}

/**
 * Directly writes content to an already existing file path (Ctrl+S quick save).
 */
export async function desktopSaveLabFile(path: string, content: string): Promise<void> {
  if (!isTauriApp()) return;
  await invoke('save_lab_file', { path, content });
}

/**
 * Checks if RouteCraft was launched with a command-line file argument (e.g. double-clicking .onlab in Windows).
 */
export async function desktopGetCliStartupFile(): Promise<DesktopLabFile | null> {
  if (!isTauriApp()) return null;
  try {
    const res = (await invoke('get_cli_startup_file')) as {
      file_path: string;
      file_name: string;
      content: string;
    } | null;

    if (res) {
      return {
        filePath: res.file_path,
        fileName: res.file_name,
        content: res.content,
      };
    }
    return null;
  } catch (err) {
    console.warn('desktopGetCliStartupFile warning:', err);
    return null;
  }
}

/**
 * Toggles fullscreen mode for the desktop window (F11).
 */
export async function desktopToggleFullscreen(): Promise<boolean> {
  if (!isTauriApp()) return false;
  try {
    return (await invoke('toggle_fullscreen')) as boolean;
  } catch (err) {
    console.error('desktopToggleFullscreen error:', err);
    return false;
  }
}

/**
 * Listens to native application menu events (Soubor -> Otevřít, Uložit, F11, etc.).
 */
export function listenDesktopMenuEvents(onMenuEvent: (menuId: string) => void): () => void {
  if (!isTauriApp()) return () => {};

  let unlistenFn: (() => void) | null = null;
  listen<string>('desktop-menu-event', (event) => {
    onMenuEvent(event.payload);
  }).then((unlisten) => {
    unlistenFn = unlisten;
  });

  return () => {
    if (unlistenFn) unlistenFn();
  };
}
