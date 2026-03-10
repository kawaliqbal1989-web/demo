const appName = "abacusweb-backend";

function emit(level, message, metadata = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    app: appName,
    message,
    ...metadata
  };

  if (level === "error") {
    console.error(JSON.stringify(entry));
    return;
  }

  console.log(JSON.stringify(entry));
}

const logger = {
  info(message, metadata = {}) {
    emit("info", message, metadata);
  },
  warn(message, metadata = {}) {
    emit("warn", message, metadata);
  },
  error(message, metadata = {}) {
    emit("error", message, metadata);
  }
};

export { logger };
