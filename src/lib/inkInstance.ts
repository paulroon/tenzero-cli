import type { Instance } from "ink";

/**
 * Holds the Ink render instance so exit handlers can call instance.clear()
 * for proper terminal cleanup, and unmount() to suspend for shell sessions.
 * Set by cli.tsx after render().
 */
let instance: Instance | null = null;

export function setInkInstance(i: Instance | null): void {
  instance = i;
}

export function getInkInstance(): Instance | null {
  return instance;
}
