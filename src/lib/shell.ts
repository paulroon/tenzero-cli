/**
 * Execute shell commands with configurable stdin/stdout/stderr handling,
 * streaming callbacks, and error handling.
 */

export type CallShellOptions = {
  cwd?: string;
  stdin?: "inherit" | "ignore";
  detached?: boolean;
  /** When true, run via login shell (for env setup, e.g. editor) */
  loginShell?: boolean;
  /** Stream stdout to callback. Enables pipe mode for stdout. */
  onStdout?: (text: string) => void;
  /** Stream stderr to callback. Enables pipe mode for stderr. */
  onStderr?: (text: string) => void;
  /** When true, collect output into result. Use when no callbacks. */
  collect?: boolean;
  /** When true, pipe output but discard (avoids spamming terminal). */
  quiet?: boolean;
  /** Throw on non-zero exit. Default true when not detached. */
  throwOnNonZero?: boolean;
};

export type CallShellResult = {
  exitCode: number;
  stdout?: string;
  stderr?: string;
};

async function consumeStream(
  stream: ReadableStream<Uint8Array>,
  callbacks: {
    onData?: (text: string) => void;
    collect?: boolean;
  }
): Promise<string> {
  const decoder = new TextDecoder();
  let collected = "";
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      callbacks.onData?.(text);
      if (callbacks.collect) collected += text;
    }
  } finally {
    reader.releaseLock();
  }
  return collected;
}

/**
 * Execute a shell command string via sh -c.
 * @example callShell("make cc", { cwd: "/path/to/project" })
 */
export async function callShell(
  command: string,
  options?: CallShellOptions
): Promise<CallShellResult>;

/**
 * Execute a command with args directly (no shell).
 * @example callShell("git", ["init"], { cwd: "/path" })
 */
export async function callShell(
  cmd: string,
  args: string[],
  options?: CallShellOptions
): Promise<CallShellResult>;

export async function callShell(
  cmdOrCommand: string,
  argsOrOptions?: string[] | CallShellOptions,
  maybeOptions?: CallShellOptions
): Promise<CallShellResult> {
  const isShellCommand = !Array.isArray(argsOrOptions);
  const args = isShellCommand ? [] : (argsOrOptions as string[]);
  const options = (isShellCommand ? argsOrOptions : maybeOptions) as
    | CallShellOptions
    | undefined;

  const {
    cwd,
    stdin = "inherit",
    detached = false,
    loginShell = false,
    onStdout,
    onStderr,
    collect = false,
    quiet = false,
    throwOnNonZero = !detached,
  } = options ?? {};

  const hasStreaming = !!onStdout || !!onStderr;
  const needsPipe = hasStreaming || collect || quiet || detached;

  const proc = (() => {
    if (isShellCommand) {
      if (loginShell) {
        const shell = process.env.SHELL || "zsh";
        return Bun.spawn([shell, "-l", "-c", cmdOrCommand], {
          cwd,
          stdin: "ignore",
          stdout: detached ? "ignore" : "pipe",
          stderr: detached ? "ignore" : "pipe",
          detached,
        });
      }
      return Bun.spawn(["sh", "-c", cmdOrCommand], {
        cwd,
        stdin: detached ? "ignore" : stdin,
        stdout: needsPipe ? "pipe" : "inherit",
        stderr: needsPipe ? "pipe" : "inherit",
        detached,
      });
    }
    return Bun.spawn([cmdOrCommand, ...args], {
      cwd,
      stdin: detached ? "ignore" : stdin,
      stdout: needsPipe ? "pipe" : "inherit",
      stderr: needsPipe ? "pipe" : "inherit",
      detached,
    });
  })();

  if (detached) {
    return { exitCode: 0 };
  }

  const result: CallShellResult = { exitCode: 0 };

  const promises: Promise<void>[] = [];

  if (proc.stdout) {
    promises.push(
      consumeStream(proc.stdout, {
        onData: onStdout,
        collect: collect && !onStdout,
      }).then((out) => {
        if (collect && !onStdout) result.stdout = out;
      })
    );
  }

  if (proc.stderr) {
    promises.push(
      consumeStream(proc.stderr, {
        onData: onStderr,
        collect: collect && !onStderr,
      }).then((out) => {
        if (collect && !onStderr) result.stderr = out;
      })
    );
  }

  await Promise.all([proc.exited, ...promises]);
  result.exitCode = proc.exitCode ?? -1;

  if (throwOnNonZero && result.exitCode !== 0) {
    throw new ShellError(
      `Command exited with code ${result.exitCode}`,
      result.exitCode,
      result.stdout,
      result.stderr
    );
  }

  return result;
}

export class ShellError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number,
    public readonly stdout?: string,
    public readonly stderr?: string
  ) {
    super(message);
    this.name = "ShellError";
    Object.setPrototypeOf(this, ShellError.prototype);
  }
}
