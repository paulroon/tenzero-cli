/**
 * Holds the Ink render instance so exit handlers can call instance.clear()
 * for proper terminal cleanup. Set by cli.tsx after render().
 */
let instance: { clear: () => void } | null = null;

export function setInkInstance(i: { clear: () => void } | null): void {
  instance = i;
}

export function getInkInstance(): { clear: () => void } | null {
  return instance;
}
