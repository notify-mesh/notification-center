import pino from "pino";

export const logger = pino({
  depthLimit: 10,
  safe: true,
  formatters: {
    level(label) {
      return { level: label };
    },
    bindings(bindings) {
      return { pid: bindings.pid };
    },
  },
});
