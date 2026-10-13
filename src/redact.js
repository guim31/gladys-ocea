// Last line of defense for the logs: whatever ends up in a log line, the
// e-mail, the password and the tokens are masked. The code already avoids
// putting them in messages (see ocea/errors.js); this catches a mistake.

const MIN_SECRET_LENGTH = 4;

export function redact(text, secrets) {
  let out = String(text);
  const sorted = secrets
    .filter((secret) => typeof secret === 'string' && secret.length >= MIN_SECRET_LENGTH)
    .sort((a, b) => b.length - a.length);
  for (const secret of sorted) {
    out = out.split(secret).join('***');
  }
  return out;
}

/** A logger that masks the secrets returned by `getSecrets()` in every line. */
export function redactingLogger(logger, getSecrets) {
  const wrap =
    (level) =>
    (...args) =>
      logger[level](
        ...args.map((arg) =>
          redact(arg instanceof Error ? `${arg.name}: ${arg.message}` : arg, getSecrets()),
        ),
      );
  return { debug: wrap('debug'), info: wrap('info'), warn: wrap('warn'), error: wrap('error') };
}
