import { ContentScriptHandle } from '../lib/bootstrapContentScript';
import {
  DEFAULT_SUPPORTED_TIMEZONES,
  SupportedTimezone
} from '../config/supportedTimezones';

interface RowGroup {
  labelNode: Element;
  labelText: string;
  hourNodes: Element[];
  nextSibling: Element | null;
}

interface HourStrip {
  node: Element;
  hourCells: Element[];
  matrix: Element;
}

interface CloneSourceTimezone {
  label: string;
  timeZoneId?: string;
  fixedOffsetHours?: number;
}

interface DetectedHourStrip extends HourStrip {
  sourceTimezone: CloneSourceTimezone;
}

interface TimezoneCard {
  node: Element;
  sourceTimezone: CloneSourceTimezone;
}

const MARK_ATTRIBUTE = 'data-gcal-multi-timezone';
const STRIP_MARK_ATTRIBUTE = 'data-gcal-multi-timezone-strip';
const CARD_MARK_ATTRIBUTE = 'data-gcal-multi-timezone-card';
const GOOGLE_TZ_DESCRIPTION_RE = /^\(GMT[+-]/;
const TIME_LABEL_RE = /^(?:(?:1[0-2]|[1-9])(?::[0-5]\d)?\s?(?:AM|PM)|(?:[01]?\d|2[0-3]):[0-5]\d)$/i;
const GMT_LABEL_RE = /^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i;

const elementChildren = (node: Element): Element[] => Array.from(node.children);

const normalizeText = (text: string | null | undefined): string => String(text || '')
  .replace(/\s+/g, ' ')
  .trim();

const parseGmtOffsetHours = (labelText: string): number | null => {
  const match = labelText.match(GMT_LABEL_RE);
  if (!match) {
    return null;
  }

  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = match[3] ? Number(match[3]) : 0;

  return sign * (hours + (minutes / 60));
};

const findSupportedTimezone = (
  supportedTimezones: SupportedTimezone[],
  labelText: string
): SupportedTimezone | null => {
  return supportedTimezones.find((timezone) => timezone.label === labelText) || null;
};

const findCloneSourceTimezone = (
  supportedTimezones: SupportedTimezone[],
  labelText: string
): CloneSourceTimezone | null => {
  const supportedTimezone = findSupportedTimezone(supportedTimezones, labelText);
  if (supportedTimezone) {
    return supportedTimezone;
  }

  const fixedOffsetHours = parseGmtOffsetHours(labelText);
  if (fixedOffsetHours === null) {
    return null;
  }

  return {
    label: labelText,
    fixedOffsetHours
  };
};

const getTimezoneOffsetHours = (timeZoneId: string, referenceDate: Date): number => {
  const utcDate = new Date(referenceDate.toLocaleString('en-US', { timeZone: 'UTC' }));
  const timeZoneDate = new Date(referenceDate.toLocaleString('en-US', { timeZone: timeZoneId }));

  return (timeZoneDate.getTime() - utcDate.getTime()) / 3600000;
};

const getCloneSourceOffsetHours = (
  sourceTimezone: CloneSourceTimezone,
  referenceDate: Date
): number => {
  if (typeof sourceTimezone.fixedOffsetHours === 'number') {
    return sourceTimezone.fixedOffsetHours;
  }

  if (sourceTimezone.timeZoneId) {
    return getTimezoneOffsetHours(sourceTimezone.timeZoneId, referenceDate);
  }

  return 0;
};

const getOffsetHoursBetween = (
  sourceTimezone: CloneSourceTimezone,
  targetTimezone: SupportedTimezone,
  referenceDate: Date = new Date()
): number => {
  return getTimezoneOffsetHours(targetTimezone.timeZoneId, referenceDate) -
    getCloneSourceOffsetHours(sourceTimezone, referenceDate);
};

const markClone = <T extends Element>(node: T): T => {
  node.setAttribute(MARK_ATTRIBUTE, '1');
  return node;
};

const shiftTimeLabel = (label: string, offsetHours: number): string => {
  const match = label.match(/^(\d{1,2})(?::(\d{2}))?(\s*)(AM|PM)?$/i);
  if (!match || !TIME_LABEL_RE.test(label)) {
    return label;
  }

  const meridiem = match[4];
  const sourceHour = meridiem
    ? Number(match[1]) % 12 + (meridiem.toUpperCase() === 'PM' ? 12 : 0)
    : Number(match[1]);
  const minutes = ((sourceHour * 60 + Number(match[2] || 0) +
    Math.round(offsetHours * 60)) % 1440 + 1440) % 1440;
  const hour = Math.floor(minutes / 60);
  const minuteText = `0${minutes % 60}`.slice(-2);

  if (!meridiem) {
    const hourText = match[1].length === 2 ? `0${hour}`.slice(-2) : String(hour);
    return `${hourText}:${minuteText}`;
  }

  const suffix = hour < 12 ? 'AM' : 'PM';
  const formattedSuffix = meridiem === meridiem.toLowerCase() ? suffix.toLowerCase() : suffix;
  const minutePart = minutes % 60 !== 0 ? `:${minuteText}` : '';
  return `${hour % 12 || 12}${minutePart}${match[3]}${formattedSuffix}`;
};

const findLeafWithExactText = (root: Element, expectedText: string): Element | null => {
  const candidates: Element[] = [root, ...Array.from(root.querySelectorAll('div, span'))];

  return candidates.find((node) => {
    return node.children.length === 0 && normalizeText(node.textContent) === expectedText;
  }) || null;
};

const replaceFirstLeafText = (root: Element, fromText: string, toText: string): boolean => {
  const target = findLeafWithExactText(root, fromText);
  if (!target) {
    return false;
  }

  target.textContent = toText;
  return true;
};

const shiftTimeLabels = (root: Element, offsetHours: number): void => {
  for (const node of Array.from(root.querySelectorAll('div, span'))) {
    if (node.children.length === 0) {
      const label = normalizeText(node.textContent);
      const shiftedLabel = shiftTimeLabel(label, offsetHours);
      if (shiftedLabel !== label) {
        node.textContent = shiftedLabel;
      }
    }
  }
};

const getRowGroups = (container: Element): RowGroup[] => {
  const children = elementChildren(container);
  const groups: RowGroup[] = [];

  for (let index = 0; index <= children.length - 25; index += 1) {
    const labelNode = children[index];
    const hourNodes = children.slice(index + 1, index + 25);

    if (
      hourNodes.length === 24 &&
      hourNodes.every((node) => TIME_LABEL_RE.test(normalizeText(node.textContent)))
    ) {
      groups.push({
        labelNode,
        labelText: normalizeText(labelNode.textContent),
        hourNodes,
        nextSibling: children[index + 25] || null
      });

      index += 24;
    }
  }

  return groups;
};

const hasCloneSourceTimezone = (
  container: Element,
  supportedTimezones: SupportedTimezone[]
): boolean => {
  return getRowGroups(container).some((group) => {
    return Boolean(findCloneSourceTimezone(supportedTimezones, group.labelText));
  });
};

const isTimeMatrix = (node: Element, supportedTimezones: SupportedTimezone[]): boolean => {
  return hasCloneSourceTimezone(node, supportedTimezones);
};

const findHourStrips = (
  root: Document | Element,
  supportedTimezones: SupportedTimezone[]
): HourStrip[] => {
  const strips: HourStrip[] = [];
  const candidates = Array.from(root.querySelectorAll('div'));

  for (const node of candidates) {
    const children = elementChildren(node);
    if (children.length < 25) {
      continue;
    }

    const hourCells = children.slice(0, 24);
    if (!hourCells.every((child) => TIME_LABEL_RE.test(normalizeText(child.textContent)))) {
      continue;
    }

    const matrix = children.slice(24).find((child) => isTimeMatrix(child, supportedTimezones)) || null;
    if (!matrix) {
      continue;
    }

    strips.push({ node, hourCells, matrix });
  }

  return strips;
};

const detectStripBase = (
  strip: HourStrip,
  supportedTimezones: SupportedTimezone[]
) : CloneSourceTimezone | null => {
  const stripTexts = strip.hourCells.map((cell) => normalizeText(cell.textContent)).join('|');

  for (const group of getRowGroups(strip.matrix)) {
    const sourceTimezone = findCloneSourceTimezone(supportedTimezones, group.labelText);
    if (!sourceTimezone) {
      continue;
    }

    const groupTexts = group.hourNodes.map((cell) => normalizeText(cell.textContent)).join('|');
    if (groupTexts === stripTexts) {
      return sourceTimezone;
    }
  }

  return null;
};

const getPresentSupportedLabelsFromSources = (
  sources: Array<{ sourceTimezone: CloneSourceTimezone }>,
  supportedTimezones: SupportedTimezone[]
): string[] => {
  const labels: string[] = [];

  for (const source of sources) {
    const supportedTimezone = findSupportedTimezone(supportedTimezones, source.sourceTimezone.label);
    if (supportedTimezone && labels.indexOf(supportedTimezone.label) < 0) {
      labels.push(supportedTimezone.label);
    }
  }

  return labels;
};

const cloneHourStrip = (
  strip: DetectedHourStrip,
  targetTimezone: SupportedTimezone
): boolean => {
  const parent = strip.node.parentElement;
  if (!parent) {
    return false;
  }

  const existingClone = elementChildren(parent).find((child) => {
    return child.getAttribute(STRIP_MARK_ATTRIBUTE) === targetTimezone.label;
  });
  if (existingClone) {
    return false;
  }

  const clone = markClone(strip.node.cloneNode(true) as Element);
  clone.setAttribute(STRIP_MARK_ATTRIBUTE, targetTimezone.label);

  const cloneChildren = elementChildren(clone);
  const cloneHourCells = cloneChildren.slice(0, 24);
  const offsetHours = getOffsetHoursBetween(strip.sourceTimezone, targetTimezone);

  cloneHourCells.forEach((cell) => {
    const originalText = normalizeText(cell.textContent);
    replaceFirstLeafText(cell, originalText, shiftTimeLabel(originalText, offsetHours));
  });

  parent.insertBefore(clone, strip.node.nextSibling);
  return true;
};

const enhanceHourStrips = (
  root: Document | Element,
  supportedTimezones: SupportedTimezone[]
): void => {
  const stripsByParent = new Map<Element, DetectedHourStrip[]>();

  for (const strip of findHourStrips(root, supportedTimezones)) {
    if (strip.node.getAttribute(MARK_ATTRIBUTE) === '1') {
      continue;
    }

    const sourceTimezone = detectStripBase(strip, supportedTimezones);
    if (!sourceTimezone) {
      continue;
    }

    const parent = strip.node.parentElement;
    if (!parent) {
      continue;
    }

    const detectedStrip: DetectedHourStrip = { ...strip, sourceTimezone };
    const strips = stripsByParent.get(parent);
    if (strips) {
      strips.push(detectedStrip);
    } else {
      stripsByParent.set(parent, [detectedStrip]);
    }
  }

  stripsByParent.forEach((strips) => {
    const sourceStrip = strips[0];
    const presentLabels = getPresentSupportedLabelsFromSources(strips, supportedTimezones);

    for (const targetTimezone of supportedTimezones) {
      if (presentLabels.indexOf(targetTimezone.label) < 0) {
        cloneHourStrip(sourceStrip, targetTimezone);
      }
    }
  });
};

const cloneTimezoneCard = (
  card: TimezoneCard,
  targetTimezone: SupportedTimezone,
): boolean => {
  const parent = card.node.parentElement;
  if (!parent) {
    return false;
  }

  const existingClone = elementChildren(parent).find((child) => {
    return child.getAttribute(CARD_MARK_ATTRIBUTE) === targetTimezone.label;
  });
  if (existingClone) {
    return false;
  }

  const clone = markClone(card.node.cloneNode(true) as Element);
  clone.setAttribute(CARD_MARK_ATTRIBUTE, targetTimezone.label);
  shiftTimeLabels(clone, getOffsetHoursBetween(card.sourceTimezone, targetTimezone));
  if (clone.hasAttribute('data-text')) {
    clone.setAttribute('data-text', targetTimezone.label);
  }
  replaceFirstLeafText(clone, card.sourceTimezone.label, targetTimezone.label);

  const labelLeaf = findLeafWithExactText(clone, targetTimezone.label);
  if (labelLeaf && labelLeaf !== clone && labelLeaf.hasAttribute('data-text')) {
    labelLeaf.setAttribute('data-text', describeTimezone(targetTimezone));
  }

  parent.insertBefore(clone, card.node.nextSibling);
  return true;
};

const describeTimezone = (timezone: SupportedTimezone): string => {
  const offset = getTimezoneOffsetHours(timezone.timeZoneId, new Date());
  const sign = offset < 0 ? '-' : '+';
  const totalMinutes = Math.round(Math.abs(offset) * 60);
  const hours = `0${Math.floor(totalMinutes / 60)}`.slice(-2);
  const minutes = `0${totalMinutes % 60}`.slice(-2);
  return `(GMT${sign}${hours}:${minutes}) ${timezone.timeZoneId}`;
};

// The header's first child holds invisible width sizers, one per card column.
const fixHeaderWidth = (
  cardsRow: Element,
  supportedTimezones: SupportedTimezone[]
): void => {
  const placeholderParent = cardsRow.parentElement?.firstElementChild;
  if (!placeholderParent || placeholderParent === cardsRow) {
    return;
  }

  const sourcePlaceholder = elementChildren(placeholderParent).find((node) => !node.hasAttribute(MARK_ATTRIBUTE));
  if (!sourcePlaceholder) {
    return;
  }

  const existingLabel = normalizeText(sourcePlaceholder.firstElementChild?.textContent);
  const sourceTimezone = findCloneSourceTimezone(supportedTimezones, existingLabel);
  if (!sourceTimezone) {
    return;
  }

  const generatedCards = elementChildren(cardsRow).filter((card) => card.hasAttribute(CARD_MARK_ATTRIBUTE));
  const existingClones = elementChildren(placeholderParent).filter((node) => node.hasAttribute(MARK_ATTRIBUTE));
  const nativeCount = placeholderParent.children.length - existingClones.length;
  const nativeCards = cardsRow.children.length - generatedCards.length;
  if (nativeCount !== nativeCards) {
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const card of generatedCards) {
    const label = card.getAttribute(CARD_MARK_ATTRIBUTE) || '';
    if (existingClones.some((node) => node.getAttribute(CARD_MARK_ATTRIBUTE) === label)) {
      continue;
    }

    const targetTimezone = findSupportedTimezone(supportedTimezones, label);
    if (!targetTimezone) {
      continue;
    }

    const placeholder = markClone(sourcePlaceholder.cloneNode(true) as Element);
    placeholder.setAttribute(CARD_MARK_ATTRIBUTE, label);
    shiftTimeLabels(placeholder, getOffsetHoursBetween(sourceTimezone, targetTimezone));
    fragment.appendChild(placeholder);
  }
  placeholderParent.insertBefore(fragment, sourcePlaceholder);
};

const resolveHeaderCard = (
  node: Element,
  supportedTimezones: SupportedTimezone[]
): TimezoneCard | null => {
  const dataText = node.getAttribute('data-text') || '';
  const directTimezone = findCloneSourceTimezone(supportedTimezones, dataText);
  if (directTimezone) {
    return { node, sourceTimezone: directTimezone };
  }

  // Newer Calendar markup: data-text holds "(GMT+01:00) ...", the short label is the leaf's text and the card is its parent.
  if (!GOOGLE_TZ_DESCRIPTION_RE.test(dataText) || node.children.length > 0 || !node.parentElement) {
    return null;
  }

  const sourceTimezone = findCloneSourceTimezone(supportedTimezones, normalizeText(node.textContent));
  return sourceTimezone ? { node: node.parentElement, sourceTimezone } : null;
};

const enhanceHeaderCards = (
  root: Document | Element,
  supportedTimezones: SupportedTimezone[]
): void => {
  const cardsByParent = new Map<Element, TimezoneCard[]>();

  for (const node of Array.from(root.querySelectorAll('[data-text]'))) {
    const card = resolveHeaderCard(node, supportedTimezones);
    if (!card) {
      continue;
    }

    const parent = card.node.parentElement;
    if (!parent) {
      continue;
    }

    const cards = cardsByParent.get(parent);
    if (cards) {
      cards.push(card);
    } else {
      cardsByParent.set(parent, [card]);
    }
  }

  cardsByParent.forEach((cards, cardsRow) => {
    const sourceCard = cards[0];
    const presentLabels = getPresentSupportedLabelsFromSources(cards, supportedTimezones);

    for (const targetTimezone of supportedTimezones) {
      if (presentLabels.indexOf(targetTimezone.label) < 0) {
        cloneTimezoneCard(sourceCard, targetTimezone);
      }
    }

    fixHeaderWidth(cardsRow, supportedTimezones);
  });
};

const applyEnhancements = (
  root: Document | Element,
  supportedTimezones: SupportedTimezone[]
): void => {
  enhanceHeaderCards(root, supportedTimezones);
  enhanceHourStrips(root, supportedTimezones);
};

export const mountGoogleCalendarExtraTimezones = (
  supportedTimezones: SupportedTimezone[] = DEFAULT_SUPPORTED_TIMEZONES
): ContentScriptHandle => {
  let observer: MutationObserver | null = null;
  let scheduled = false;

  const scheduleApply = (): void => {
    if (scheduled) {
      return;
    }

    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyEnhancements(document, supportedTimezones);
    });
  };

  const cleanup = (): void => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    document.querySelectorAll(`[${MARK_ATTRIBUTE}="1"]`).forEach((node) => node.remove());
  };

  applyEnhancements(document, supportedTimezones);

  observer = new MutationObserver(() => {
    scheduleApply();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  return { cleanup };
};