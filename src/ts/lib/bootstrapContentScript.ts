export interface ContentScriptHandle {
  cleanup(): void;
}

declare global {
  interface Window {
    __extensionContentScriptHandles__?: Record<string, ContentScriptHandle | undefined>;
  }
}

const getHandleStore = (): Record<string, ContentScriptHandle | undefined> => {
  if (!window.__extensionContentScriptHandles__) {
    window.__extensionContentScriptHandles__ = {};
  }

  return window.__extensionContentScriptHandles__;
};

export const bootstrapContentScript = (
  scriptId: string,
  mount: () => ContentScriptHandle
): void => {
  let started = false;

  const start = (): void => {
    if (started || !document.body) {
      return;
    }

    started = true;

    const handleStore = getHandleStore();
    const previousHandle = handleStore[scriptId];
    if (previousHandle) {
      previousHandle.cleanup();
    }

    handleStore[scriptId] = mount();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
    window.addEventListener('load', start, { once: true });
    return;
  }

  start();
  if (!started) {
    window.addEventListener('load', start, { once: true });
  }
};