/**
 * AnimationStateMachine — Manages state transitions for agent character animations.
 *
 * States: Spawn → Idle ↔ Working ↔ Error, Any → Despawn
 * Each state has enter/exit/update callbacks.
 */

export type AnimationState = "spawn" | "idle" | "working" | "error" | "despawn";

export interface StateCallbacks {
  onEnter?: () => void;
  onExit?: () => void;
  onUpdate?: (dt: number) => void;
}

/** Valid transitions: from → allowed targets */
const TRANSITIONS: Record<AnimationState, AnimationState[]> = {
  spawn: ["idle", "despawn"],
  idle: ["working", "error", "despawn"],
  working: ["idle", "error", "despawn"],
  error: ["idle", "despawn"],
  despawn: [], // terminal
};

export class AnimationStateMachine {
  private _currentState: AnimationState;
  private stateMap: Map<AnimationState, StateCallbacks> = new Map();
  private _elapsed = 0;

  constructor(initialState: AnimationState = "spawn") {
    this._currentState = initialState;
  }

  get currentState(): AnimationState {
    return this._currentState;
  }

  get elapsed(): number {
    return this._elapsed;
  }

  /**
   * Register callbacks for a given state.
   */
  registerState(state: AnimationState, callbacks: StateCallbacks): void {
    this.stateMap.set(state, callbacks);
  }

  /**
   * Attempt to transition to a new state.
   * Returns true if the transition was valid and performed.
   */
  transitionTo(newState: AnimationState): boolean {
    const allowed = TRANSITIONS[this._currentState];
    if (!allowed.includes(newState)) {
      return false;
    }

    // Exit current state
    const currentCallbacks = this.stateMap.get(this._currentState);
    currentCallbacks?.onExit?.();

    // Enter new state
    this._currentState = newState;
    this._elapsed = 0;

    const newCallbacks = this.stateMap.get(newState);
    newCallbacks?.onEnter?.();

    return true;
  }

  /**
   * Force transition (bypasses validation). Use for despawn from any state.
   */
  forceTransition(newState: AnimationState): void {
    const currentCallbacks = this.stateMap.get(this._currentState);
    currentCallbacks?.onExit?.();

    this._currentState = newState;
    this._elapsed = 0;

    const newCallbacks = this.stateMap.get(newState);
    newCallbacks?.onEnter?.();
  }

  /**
   * Update the current state. Call every tick.
   */
  update(dt: number): void {
    this._elapsed += dt;
    const callbacks = this.stateMap.get(this._currentState);
    callbacks?.onUpdate?.(dt);
  }
}
