export class GenerationError extends Error {
  constructor(
    message: string,
    public readonly stdout?: string,
    public readonly stderr?: string
  ) {
    super(message);
    this.name = "GenerationError";
    Object.setPrototypeOf(this, GenerationError.prototype);
  }

  get lastOutput(): { stdout?: string; stderr?: string } {
    return { stdout: this.stdout, stderr: this.stderr };
  }
}
