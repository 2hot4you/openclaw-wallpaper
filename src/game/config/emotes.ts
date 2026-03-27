/**
 * Emote bubble spritesheet configuration.
 *
 * Source: emotes_48x48.png (480×480, 10×10 grid of 48×48 frames)
 */

export const EMOTE_SHEET_KEY = "emotes";
export const EMOTE_SHEET_PATH = "/sprites/emotes_48x48.png";
export const EMOTE_FRAME_SIZE = 48;

export interface EmoteDef {
  key: string;
  frames: number[];
  frameRate: number;
  repeat: number;
}

export const EMOTE_ANIMS: EmoteDef[] = [
  // Status indicators
  { key: "emote:sleep", frames: [56, 57], frameRate: 2, repeat: -1 },
  { key: "emote:thinking", frames: [52, 53], frameRate: 2, repeat: -1 },
  { key: "emote:alert", frames: [40, 41], frameRate: 4, repeat: 3 },
  { key: "emote:fail", frames: [50, 51], frameRate: 4, repeat: 3 },
  { key: "emote:heart", frames: [54, 55], frameRate: 2, repeat: 3 },

  // Mood / activity
  { key: "emote:star", frames: [64, 65], frameRate: 3, repeat: 3 },
  { key: "emote:music", frames: [66, 67], frameRate: 3, repeat: -1 },
  { key: "emote:confused", frames: [62, 63], frameRate: 2, repeat: -1 },
  { key: "emote:wrench", frames: [74, 75], frameRate: 2, repeat: -1 },
  { key: "emote:device", frames: [58, 59], frameRate: 2, repeat: -1 },
  { key: "emote:dots", frames: [92, 93], frameRate: 2, repeat: -1 },
];

/** Map agent status → emote animation key */
export const STATUS_EMOTE_MAP: Record<string, string> = {
  working: "emote:wrench",
  idle: "emote:sleep",
  error: "emote:fail",
};
