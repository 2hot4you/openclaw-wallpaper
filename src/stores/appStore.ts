import { create } from "zustand";

export type WindowMode = "wallpaper" | "window";

interface AppState {
  /** Current window mode */
  windowMode: WindowMode;
  setWindowMode: (mode: WindowMode) => void;

  /** Whether the wallpaper is attached to the desktop (Windows only) */
  isWallpaperAttached: boolean;
  setWallpaperAttached: (attached: boolean) => void;

  /** Whether OpenClaw Gateway is online */
  openclawOnline: boolean;
  setOpenclawOnline: (online: boolean) => void;

  /** Currently selected character ID (for InfoPanel + ChatPanel) */
  selectedCharacterId: string | null;
  setSelectedCharacterId: (id: string | null) => void;

  /** Whether the chat panel sidebar is open */
  chatPanelOpen: boolean;
  setChatPanelOpen: (open: boolean) => void;
  /** Session key currently displayed in chat panel */
  chatSessionKey: string | null;
  setChatSessionKey: (key: string | null) => void;

  /** Whether the settings modal is open */
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  windowMode: "window",
  setWindowMode: (mode) => set({ windowMode: mode }),

  isWallpaperAttached: false,
  setWallpaperAttached: (attached) =>
    set({ isWallpaperAttached: attached }),

  openclawOnline: false,
  setOpenclawOnline: (online) => set({ openclawOnline: online }),

  selectedCharacterId: null,
  setSelectedCharacterId: (id) => set({ selectedCharacterId: id }),

  chatPanelOpen: false,
  setChatPanelOpen: (open) => set({ chatPanelOpen: open }),
  chatSessionKey: null,
  setChatSessionKey: (key) => set({ chatSessionKey: key }),

  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),
}));
