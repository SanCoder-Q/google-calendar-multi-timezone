import {
  DEFAULT_SUPPORTED_TIMEZONES_JSON,
  parseSupportedTimezonesJson,
  stringifySupportedTimezones
} from './config/supportedTimezones';
import {
  clearSupportedTimezonesConfigText,
  loadSupportedTimezonesConfigText,
  saveSupportedTimezonesConfigText
} from './lib/timezoneConfigStorage';

const textarea = document.querySelector<HTMLTextAreaElement>('[data-role="config-input"]');
const status = document.querySelector<HTMLElement>('[data-role="status"]');
const saveButton = document.querySelector<HTMLButtonElement>('[data-role="save"]');
const resetButton = document.querySelector<HTMLButtonElement>('[data-role="reset"]');

if (!textarea || !status || !saveButton || !resetButton) {
  throw new Error('Popup UI did not initialize correctly.');
}

const setStatus = (message: string, tone: 'idle' | 'success' | 'error' = 'idle'): void => {
  status.textContent = message;
  status.dataset.tone = tone;
};

const setBusy = (isBusy: boolean): void => {
  textarea.disabled = isBusy;
  saveButton.disabled = isBusy;
  resetButton.disabled = isBusy;
};

const loadConfig = async (): Promise<void> => {
  const storedText = await loadSupportedTimezonesConfigText();
  textarea.value = storedText || DEFAULT_SUPPORTED_TIMEZONES_JSON;
  setStatus('Edit the JSON config and save to update Calendar pages.', 'idle');
};

const saveConfig = async (): Promise<void> => {
  setBusy(true);

  try {
    const supportedTimezones = parseSupportedTimezonesJson(textarea.value);
    const normalizedJson = stringifySupportedTimezones(supportedTimezones);
    await saveSupportedTimezonesConfigText(normalizedJson);
    textarea.value = normalizedJson;
    setStatus('Saved. Open Google Calendar to see the updated timezones.', 'success');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save config.';
    setStatus(message, 'error');
  } finally {
    setBusy(false);
  }
};

const resetConfig = async (): Promise<void> => {
  setBusy(true);

  try {
    await clearSupportedTimezonesConfigText();
    textarea.value = DEFAULT_SUPPORTED_TIMEZONES_JSON;
    setStatus('Reset to the built-in default config.', 'success');
  } finally {
    setBusy(false);
  }
};

saveButton.addEventListener('click', () => {
  void saveConfig();
});

resetButton.addEventListener('click', () => {
  void resetConfig();
});

void loadConfig();