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

  /** Currently selected character ID (for InfoPanel) */
  selectedCharacterId: string | null;
  setSelectedCharacterId: (id: string | null) => void;
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
}));
