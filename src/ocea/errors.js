// Errors of the OCEA client. Their messages are logged and shown in Gladys:
// they are built from fixed texts and HTTP statuses only, never from a
// response body, a URL with its query, a cookie or a credential.

/** The portal refused the credentials, or the sign-in flow changed. */
export class OceaAuthError extends Error {
  constructor(message, { invalidCredentials = false } = {}) {
    super(message);
    this.name = 'OceaAuthError';
    // true only when OCEA explicitly rejected the e-mail / password: retrying
    // with the same ones would only lock the account.
    this.invalidCredentials = invalidCredentials;
  }
}

/** The resident API answered with an unexpected status or payload. */
export class OceaApiError extends Error {
  constructor(message, { status } = {}) {
    super(message);
    this.name = 'OceaApiError';
    this.status = status;
  }
}
