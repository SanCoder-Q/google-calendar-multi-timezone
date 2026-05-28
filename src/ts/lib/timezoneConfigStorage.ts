const SUPPORTED_TIMEZONES_STORAGE_KEY = 'supportedTimezonesJson';

const storageArea = chrome.storage.sync;

export const loadSupportedTimezonesConfigText = async (): Promise<string | null> => {
  return new Promise((resolve) => {
    storageArea.get([SUPPORTED_TIMEZONES_STORAGE_KEY], (items) => {
      const configText = items[SUPPORTED_TIMEZONES_STORAGE_KEY];
      resolve(typeof configText === 'string' ? configText : null);
    });
  });
};

export const saveSupportedTimezonesConfigText = async (configText: string): Promise<void> => {
  return new Promise((resolve) => {
    storageArea.set({ [SUPPORTED_TIMEZONES_STORAGE_KEY]: configText }, () => {
      resolve();
    });
  });
};

export const clearSupportedTimezonesConfigText = async (): Promise<void> => {
  return new Promise((resolve) => {
    storageArea.remove(SUPPORTED_TIMEZONES_STORAGE_KEY, () => {
      resolve();
    });
  });
};

export const onSupportedTimezonesConfigChanged = (
  listener: (configText: string | null) => void
): (() => void) => {
  const handleChange = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ): void => {
    if (areaName !== 'sync' || !changes[SUPPORTED_TIMEZONES_STORAGE_KEY]) {
      return;
    }

    const nextValue = changes[SUPPORTED_TIMEZONES_STORAGE_KEY].newValue;
    listener(typeof nextValue === 'string' ? nextValue : null);
  };

  chrome.storage.onChanged.addListener(handleChange);

  return (): void => {
    chrome.storage.onChanged.removeListener(handleChange);
  };
};