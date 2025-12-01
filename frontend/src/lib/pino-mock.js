// Minimal browser-safe pino mock used to avoid Node-only dependencies in the frontend.

function createLogger(options = {}) {
  const level = options.level || "silent";
  const name = options.name || options.context || "pino";
  const prefix = `[${name}]`;

  const makeMethod = (method) => (...args) => {
    if (typeof console === "undefined") return;
    const fn = console[method] || console.log;
    fn(prefix, ...args);
  };

  const logger = {
    level,
    info: makeMethod("info"),
    warn: makeMethod("warn"),
    error: makeMethod("error"),
    debug: makeMethod("debug"),
    trace: makeMethod("debug"),
  };

  // pino-style child logger
  logger.child = (bindings = {}) => {
    const childName = bindings.name || bindings.context || name;
    return createLogger({ ...options, ...bindings, name: childName });
  };

  return logger;
}

export default createLogger;
export { createLogger as pino };
