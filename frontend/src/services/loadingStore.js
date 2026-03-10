let activeRequests = 0;
const listeners = new Set();

function emit() {
  for (const listener of listeners) {
    listener(activeRequests);
  }
}

function increment() {
  activeRequests += 1;
  emit();
}

function decrement() {
  activeRequests = Math.max(0, activeRequests - 1);
  emit();
}

function subscribe(listener) {
  listeners.add(listener);
  listener(activeRequests);
  return () => listeners.delete(listener);
}

function getActiveRequests() {
  return activeRequests;
}

export { increment, decrement, subscribe, getActiveRequests };
