import assert from "node:assert/strict";
import test from "node:test";

import { createLogger, defaultLogger, LogEntry } from "../src/logger";

function collect(): { entries: LogEntry[]; handler: (entry: LogEntry) => void } {
  const entries: LogEntry[] = [];
  return { entries, handler: (entry) => entries.push(entry) };
}

test("createLogger defaults to WARN — DEBUG and INFO are suppressed", () => {
  const { entries, handler } = collect();
  const logger = createLogger(undefined, handler);

  logger.debug("test", "debug message");
  logger.info("test", "info message");

  assert.equal(entries.length, 0);
});

test("default level logs WARN and ERROR", () => {
  const { entries, handler } = collect();
  const logger = createLogger(undefined, handler);

  logger.warn("test", "warn message");
  logger.error("test", "error message");

  assert.equal(entries.length, 2);
  assert.equal(entries[0].level, "WARN");
  assert.equal(entries[1].level, "ERROR");
});

test("setLevel changes which entries pass the filter", () => {
  const { entries, handler } = collect();
  const logger = createLogger("DEBUG", handler);

  logger.debug("test", "visible at DEBUG");
  assert.equal(entries.length, 1);

  logger.setLevel("ERROR");
  logger.debug("test", "suppressed at ERROR");
  logger.warn("test", "also suppressed at ERROR");
  logger.error("test", "visible at ERROR");

  assert.equal(entries.length, 2);
  assert.equal(entries[1].message, "visible at ERROR");
});

test("getLevel reflects the current threshold", () => {
  const logger = createLogger("INFO");
  assert.equal(logger.getLevel(), "INFO");

  logger.setLevel("ERROR");
  assert.equal(logger.getLevel(), "ERROR");
});

test("each level method tags its entry with the matching LogLevel", () => {
  const { entries, handler } = collect();
  const logger = createLogger("DEBUG", handler);

  logger.debug("c", "m");
  logger.info("c", "m");
  logger.warn("c", "m");
  logger.error("c", "m");

  assert.deepEqual(
    entries.map((e) => e.level),
    ["DEBUG", "INFO", "WARN", "ERROR"]
  );
});

test("log entries carry component, message, optional data, and an ISO timestamp", () => {
  const { entries, handler } = collect();
  const logger = createLogger("DEBUG", handler);

  logger.debug("myComponent", "something happened", { foo: "bar" });

  assert.equal(entries.length, 1);
  const [entry] = entries;
  assert.equal(entry.component, "myComponent");
  assert.equal(entry.message, "something happened");
  assert.deepEqual(entry.data, { foo: "bar" });
  assert.doesNotThrow(() => new Date(entry.timestamp).toISOString());
});

test("data is omitted when the caller doesn't pass any", () => {
  const { entries, handler } = collect();
  const logger = createLogger("DEBUG", handler);

  logger.debug("c", "no data here");

  assert.equal(entries[0].data, undefined);
});

test("a custom handler receives every entry that passes the level filter", () => {
  const received: LogEntry[] = [];
  const logger = createLogger("WARN", (entry) => received.push(entry));

  logger.warn("c", "one");
  logger.error("c", "two");

  assert.equal(received.length, 2);
});

test("defaultLogger exists and defaults to WARN", () => {
  assert.equal(defaultLogger.getLevel(), "WARN");
});

test("omitting a handler falls back to the console without throwing", () => {
  const logger = createLogger("ERROR");
  assert.doesNotThrow(() => logger.error("c", "goes to console"));
});
