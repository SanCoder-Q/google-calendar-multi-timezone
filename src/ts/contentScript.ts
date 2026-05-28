import {
  DEFAULT_SUPPORTED_TIMEZONES,
  parseStoredSupportedTimezonesJson
} from './config/supportedTimezones';
import { mountGoogleCalendarExtraTimezones } from './features/googleCalendarExtraTimezones';
import { bootstrapContentScript } from './lib/bootstrapContentScript';
import {
  loadSupportedTimezonesConfigText,
  onSupportedTimezonesConfigChanged
} from './lib/timezoneConfigStorage';

bootstrapContentScript('google-calendar-multi-timezone', () => {
  let disposed = false;
  let currentHandle = mountGoogleCalendarExtraTimezones(DEFAULT_SUPPORTED_TIMEZONES);

  const applyConfigText = (configText: string | null): void => {
    if (disposed) {
      return;
    }

    const supportedTimezones = parseStoredSupportedTimezonesJson(
      configText,
      DEFAULT_SUPPORTED_TIMEZONES
    );

    currentHandle.cleanup();
    currentHandle = mountGoogleCalendarExtraTimezones(supportedTimezones);
  };

  void loadSupportedTimezonesConfigText().then((configText) => {
    applyConfigText(configText);
  });

  const unsubscribe = onSupportedTimezonesConfigChanged((configText) => {
    applyConfigText(configText);
  });

  return {
    cleanup(): void {
      disposed = true;
      unsubscribe();
      currentHandle.cleanup();
    }
  };
});