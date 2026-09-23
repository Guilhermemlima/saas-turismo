/** Thrown by handlers for errors that will not go away on retry (bad payload, missing row…). */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}
