export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  data?: Record<string, unknown>;
}

export type LogHandler = (entry: LogEntry) => void;

const LEVEL_ORDER: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const DEFAULT_LEVEL: LogLevel = "WARN";

function formatTimestamp(): string {
  return new Date().toISOString();
}

function defaultHandler(entry: LogEntry): void {
  const { timestamp, level, component, message, data } = entry;
  const prefix = `[${timestamp}] [${level}] [${component}]`;
  if (data && Object.keys(data).length > 0) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

export interface Logger {
  debug(component: string, message: string, data?: Record<string, unknown>): void;
  info(component: string, message: string, data?: Record<string, unknown>): void;
  warn(component: string, message: string, data?: Record<string, unknown>): void;
  error(component: string, message: string, data?: Record<string, unknown>): void;
  setLevel(level: LogLevel): void;
  getLevel(): LogLevel;
}

function createLoggerInstance(level: LogLevel, handler?: LogHandler): Logger {
  const logHandler = handler ?? defaultHandler;
  let currentLevel = level;

  function shouldLog(entryLevel: LogLevel): boolean {
    return LEVEL_ORDER[entryLevel] >= LEVEL_ORDER[currentLevel];
  }

  function log(entryLevel: LogLevel, component: string, message: string, data?: Record<string, unknown>): void {
    if (!shouldLog(entryLevel)) {
      return;
    }
    const entry: LogEntry = {
      timestamp: formatTimestamp(),
      level: entryLevel,
      component,
      message,
      data
    };
    logHandler(entry);
  }

  return {
    debug(component: string, message: string, data?: Record<string, unknown>): void {
      log("DEBUG", component, message, data);
    },
    info(component: string, message: string, data?: Record<string, unknown>): void {
      log("INFO", component, message, data);
    },
    warn(component: string, message: string, data?: Record<string, unknown>): void {
      log("WARN", component, message, data);
    },
    error(component: string, message: string, data?: Record<string, unknown>): void {
      log("ERROR", component, message, data);
    },
    setLevel(level: LogLevel): void {
      currentLevel = level;
    },
    getLevel(): LogLevel {
      return currentLevel;
    }
  };
}

export function createLogger(level: LogLevel = DEFAULT_LEVEL, handler?: LogHandler): Logger {
  return createLoggerInstance(level, handler);
}

export const defaultLogger = createLogger();