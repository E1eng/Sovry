// Minimal browser-safe pino mock used to avoid Node-only dependencies in the frontend.

import { logger as appLogger } from "./logger";

function createLogger(options = {}) {
  const level = options.level || "silent";
  const name = options.name || options.context || "pino";
  const prefix = `[${name}]`;

  const makeMethod = (method) => (...args) => {
    const mapped = method === "debug" || method === "trace" ? "log" : method;
    const fn = appLogger[mapped] || appLogger.log;
    if (typeof fn === "function") {
      fn(prefix, ...args);
    }
  };

  const pinoLogger = {
    level,
    info: makeMethod("info"),
    warn: makeMethod("warn"),
    error: makeMethod("error"),
    debug: makeMethod("debug"),
    trace: makeMethod("debug"),
  };

  // pino-style child logger
  pinoLogger.child = (bindings = {}) => {
    const childName = bindings.name || bindings.context || name;
    return createLogger({ ...options, ...bindings, name: childName });
  };

  return pinoLogger;
}

export default createLogger;
export { createLogger as pino };
