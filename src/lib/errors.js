export class UserVisibleError extends Error {
  /**
   * @param {string} message Shown in the on-page toast. No stack, no URL dump.
   * @param {string} [code]
   */
  constructor(message, code = "user") {
    super(message);
    this.name = "UserVisibleError";
    this.code = code;
  }
}
