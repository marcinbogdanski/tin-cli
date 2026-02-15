export class TinError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number = 1) {
    super(message);
    this.name = "TinError";
    this.exitCode = exitCode;
  }
}
