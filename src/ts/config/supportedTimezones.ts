export interface SupportedTimezone {
  label: string;
  timeZoneId: string;
}

export const DEFAULT_SUPPORTED_TIMEZONES: SupportedTimezone[] = [
  { label: 'CN', timeZoneId: 'Asia/Shanghai' },
  { label: 'VN', timeZoneId: 'Asia/Ho_Chi_Minh' },
  { label: 'DE', timeZoneId: 'Europe/Berlin' },
  { label: 'UK', timeZoneId: 'Europe/London' }
];

const normalizeSupportedTimezone = (timezone: SupportedTimezone): SupportedTimezone => {
  const label = timezone.label.trim().toUpperCase();
  const timeZoneId = timezone.timeZoneId.trim();

  if (!label) {
    throw new Error('Each timezone entry must include a non-empty label.');
  }

  if (!timeZoneId) {
    throw new Error(`Timezone ${label} must include a non-empty timeZoneId.`);
  }

  try {
    Intl.DateTimeFormat('en-US', { timeZone: timeZoneId }).format(new Date());
  } catch (_error) {
    throw new Error(`Timezone ${label} has an invalid timeZoneId: ${timeZoneId}`);
  }

  return { label, timeZoneId };
};

export const normalizeSupportedTimezones = (
  supportedTimezones: SupportedTimezone[]
): SupportedTimezone[] => {
  if (!Array.isArray(supportedTimezones)) {
    throw new Error('Config must be a JSON array.');
  }

  const normalized: SupportedTimezone[] = [];
  const seenLabels = new Set<string>();

  supportedTimezones.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Entry ${index + 1} must be an object with label and timeZoneId.`);
    }

    const label = typeof entry.label === 'string' ? entry.label : '';
    const timeZoneId = typeof entry.timeZoneId === 'string' ? entry.timeZoneId : '';
    const normalizedEntry = normalizeSupportedTimezone({ label, timeZoneId });

    if (seenLabels.has(normalizedEntry.label)) {
      throw new Error(`Duplicate label found: ${normalizedEntry.label}`);
    }

    seenLabels.add(normalizedEntry.label);
    normalized.push(normalizedEntry);
  });

  return normalized;
};

export const parseSupportedTimezonesJson = (jsonText: string): SupportedTimezone[] => {
  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(jsonText);
  } catch (_error) {
    throw new Error('Config must be valid JSON.');
  }

  return normalizeSupportedTimezones(parsedValue as SupportedTimezone[]);
};

export const stringifySupportedTimezones = (supportedTimezones: SupportedTimezone[]): string => {
  return JSON.stringify(normalizeSupportedTimezones(supportedTimezones), null, 2);
};

export const DEFAULT_SUPPORTED_TIMEZONES_JSON = stringifySupportedTimezones(
  DEFAULT_SUPPORTED_TIMEZONES
);

export const parseStoredSupportedTimezonesJson = (
  jsonText: string | null | undefined,
  fallback: SupportedTimezone[] = DEFAULT_SUPPORTED_TIMEZONES
): SupportedTimezone[] => {
  if (!jsonText || jsonText.trim() === '') {
    return fallback;
  }

  try {
    return parseSupportedTimezonesJson(jsonText);
  } catch (_error) {
    return fallback;
  }
};