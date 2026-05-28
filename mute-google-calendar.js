(() => {
  const KEY = '__gcalExtraTimezones';
  const MARK = 'data-extra-timezone';
  const TIME_RE = /^(1[0-2]|[1-9])\s(?:AM|PM)$/i;
  const ZONES = [
    { base: 'DE', extra: 'UK', offset: -1 },
    { base: 'CN', extra: 'VN', offset: -1 }
  ];

  if (window[KEY] && typeof window[KEY].cleanup === 'function') {
    window[KEY].cleanup();
  }

  function elementChildren(node) {
    return Array.from(node.children || []);
  }

  function normalizeText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function mark(node) {
    if (node && node.nodeType === Node.ELEMENT_NODE) {
      node.setAttribute(MARK, '1');
    }
    return node;
  }

  function rotateArray(items, offsetHours) {
    const list = Array.from(items);
    const len = list.length;
    if (!len) return list;

    const rightRotation = ((-offsetHours % len) + len) % len;
    if (!rightRotation) return list;

    return list.slice(len - rightRotation).concat(list.slice(0, len - rightRotation));
  }

  function findLeafWithExactText(root, expectedText) {
    const candidates = [root];

    if (root.querySelectorAll) {
      candidates.push(...root.querySelectorAll('div, span'));
    }

    return candidates.find((node) => {
      return node.children.length === 0 && normalizeText(node.textContent) === expectedText;
    }) || null;
  }

  function replaceFirstLeafText(root, fromText, toText) {
    const target = findLeafWithExactText(root, fromText);
    if (target) {
      target.textContent = toText;
      return true;
    }
    return false;
  }

  function getRowGroups(container) {
    const children = elementChildren(container);
    const groups = [];

    for (let index = 0; index <= children.length - 25; index += 1) {
      const labelNode = children[index];
      const hourNodes = children.slice(index + 1, index + 25);

      if (
        hourNodes.length === 24 &&
        hourNodes.every((node) => TIME_RE.test(normalizeText(node.textContent)))
      ) {
        groups.push({
          startIndex: index,
          labelNode,
          labelText: normalizeText(labelNode.textContent),
          hourNodes,
          nextSibling: children[index + 25] || null
        });

        index += 24;
      }
    }

    return groups;
  }

  function findRowGroup(container, labelText) {
    return getRowGroups(container).find((group) => group.labelText === labelText) || null;
  }

  function isTimeMatrix(node) {
    const groups = getRowGroups(node);
    const labels = groups.map((group) => group.labelText);
    return labels.includes('DE') && labels.includes('CN');
  }

  function findTimeMatrices(root = document) {
    const candidates = [];

    if (root.nodeType === Node.ELEMENT_NODE && root.tagName === 'DIV') {
      candidates.push(root);
    }

    if (root.querySelectorAll) {
      candidates.push(...root.querySelectorAll('div'));
    }

    return candidates.filter(isTimeMatrix);
  }

  function insertDerivedGroup(matrix, baseLabel, extraLabel, offsetHours) {
    const groups = getRowGroups(matrix);
    if (groups.some((group) => group.labelText === extraLabel)) {
      return false;
    }

    const baseGroup = groups.find((group) => group.labelText === baseLabel);
    if (!baseGroup) {
      return false;
    }

    const fragment = document.createDocumentFragment();

    const labelClone = mark(baseGroup.labelNode.cloneNode(true));
    replaceFirstLeafText(labelClone, baseLabel, extraLabel);
    if (normalizeText(labelClone.textContent) === baseLabel) {
      labelClone.textContent = extraLabel;
    }
    fragment.appendChild(labelClone);

    rotateArray(baseGroup.hourNodes, offsetHours).forEach((hourNode) => {
      fragment.appendChild(mark(hourNode.cloneNode(true)));
    });

    matrix.insertBefore(fragment, baseGroup.nextSibling);
    return true;
  }

  function findHourStrips(root = document) {
    const strips = [];
    const candidates = root.querySelectorAll ? Array.from(root.querySelectorAll('div')) : [];

    for (const node of candidates) {
      const children = elementChildren(node);
      if (children.length < 25) continue;

      const hourCells = children.slice(0, 24);
      if (!hourCells.every((child) => TIME_RE.test(normalizeText(child.textContent)))) {
        continue;
      }

      const matrix = children.slice(24).find(isTimeMatrix);
      if (!matrix) continue;

      strips.push({ node, hourCells, matrix });
    }

    return strips;
  }

  function detectStripBase(stripInfo) {
    const stripTexts = stripInfo.hourCells.map((cell) => normalizeText(cell.textContent));

    for (const zone of ZONES) {
      const group = findRowGroup(stripInfo.matrix, zone.base);
      if (!group) continue;

      const groupTexts = group.hourNodes.map((cell) => normalizeText(cell.textContent));
      if (groupTexts.join('|') === stripTexts.join('|')) {
        return zone;
      }
    }

    return null;
  }

  function cloneHourStrip(stripInfo, zone) {
    const parent = stripInfo.node.parentElement;
    if (!parent) return false;

    const existingClone = elementChildren(parent).find((child) => {
      return child.getAttribute && child.getAttribute(`${MARK}-strip`) === zone.extra;
    });
    if (existingClone) return false;

    const clone = mark(stripInfo.node.cloneNode(true));
    clone.setAttribute(`${MARK}-strip`, zone.extra);

    const cloneChildren = elementChildren(clone);
    const cloneHourCells = cloneChildren.slice(0, 24);
    const cloneMatrix = cloneChildren.slice(24).find(isTimeMatrix) || null;

    rotateArray(cloneHourCells, zone.offset).forEach((cell) => {
      clone.insertBefore(cell, cloneMatrix);
    });

    if (cloneMatrix) {
      insertDerivedGroup(cloneMatrix, zone.base, zone.extra, zone.offset);
    }

    parent.insertBefore(clone, stripInfo.node.nextSibling);
    return true;
  }

  function enhanceHourStrips(root = document) {
    for (const stripInfo of findHourStrips(root)) {
      if (stripInfo.node.getAttribute && stripInfo.node.getAttribute(MARK) === '1') {
        continue;
      }

      const zone = detectStripBase(stripInfo);
      if (!zone) continue;

      cloneHourStrip(stripInfo, zone);
    }
  }

  function enhanceHeaderCards(root = document) {
    for (const zone of ZONES) {
      const cards = root.querySelectorAll
        ? Array.from(root.querySelectorAll(`[data-text="${zone.base}"]`))
        : [];

      for (const card of cards) {
        const parent = card.parentElement;
        if (!parent) continue;

        const existingClone = elementChildren(parent).find((child) => {
          return child.getAttribute && child.getAttribute('data-text') === zone.extra;
        });
        if (existingClone) continue;

        const clone = mark(card.cloneNode(true));
        clone.setAttribute('data-text', zone.extra);

        replaceFirstLeafText(clone, zone.base, zone.extra);

        const matrix = Array.from(clone.querySelectorAll('div')).find(isTimeMatrix) || null;
        if (matrix) {
          insertDerivedGroup(matrix, zone.base, zone.extra, zone.offset);
        }

        parent.insertBefore(clone, card.nextSibling);
      }
    }
  }

  function enhanceMatrices(root = document) {
    for (const matrix of findTimeMatrices(root)) {
      insertDerivedGroup(matrix, 'DE', 'UK', -1);
      insertDerivedGroup(matrix, 'CN', 'VN', -1);
    }
  }

  function apply(root = document) {
    enhanceMatrices(root);
    enhanceHeaderCards(root);
    enhanceHourStrips(root);
  }

  let observer = null;
  let scheduled = false;

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;

    requestAnimationFrame(() => {
      scheduled = false;
      apply(document);
    });
  }

  function cleanup() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    document.querySelectorAll(`[${MARK}="1"]`).forEach((node) => node.remove());
    delete window[KEY];
  }

  apply(document);

  observer = new MutationObserver(scheduleApply);
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  window[KEY] = {
    cleanup,
    reapply: scheduleApply
  };

  console.log(
    'Extra timezones installed: UK = DE -1h, VN = CN -1h. ' +
    'Run window.__gcalExtraTimezones.cleanup() to remove them.'
  );
})();