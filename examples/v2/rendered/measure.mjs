/** Runs inside the real browser. Only stationary DOM text and a single top sticky chrome band are supported. */
export function measureSurface({ inventory, approvedLabels, chromeSelector }) {
  const normalize = value => value.replace(/\s+/g, ' ').trim();
  const defects = [], unavailable = [];
  const issue = (code, address, message) => defects.push({ code, address, message });
  const visible = element => {
    for (let parent = element; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0 || parent.hidden || parent.tagName === 'DETAILS' && !parent.open && !parent.querySelector('summary')?.contains(element)) return false;
    }
    return true;
  };
  const rect = value => ({ x: value.x, y: value.y + scrollY, width: value.width, height: value.height });
  const rgb = value => {
    const numbers = value.match(/[\d.]+/g)?.map(Number);
    return value.startsWith('rgb') && numbers?.length >= 3 ? { channels: numbers.slice(0, 3), alpha: numbers[3] ?? 1 } : null;
  };
  const luminance = channels => channels.map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const chrome = document.querySelector(chromeSelector);
  if (!chrome || !['sticky', 'fixed'].includes(getComputedStyle(chrome).position) || Math.abs(chrome.getBoundingClientRect().top) > 1) unavailable.push('Expected stationary top chrome is missing');
  const chromeHeight = chrome?.getBoundingClientRect().bottom ?? 0;
  const elements = [];
  const nodes = [...document.querySelectorAll('[data-qg-id]')];
  if (new Set(nodes.map(node => node.dataset.qgId)).size !== nodes.length) unavailable.push('Semantic addresses are duplicated');
  for (const node of nodes) {
    const expected = inventory.find(value => value.id === node.dataset.qgId);
    if (!expected) { unavailable.push(`Unreviewed semantic ID ${node.dataset.qgId}`); continue; }
    if (node.querySelector('[data-qg-id]')) unavailable.push(`Nested semantic inventory at ${expected.address}`);
    const rects = []; let fontPx = Infinity;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const textNode = walker.currentNode, parent = textNode.parentElement;
      if (!normalize(textNode.textContent ?? '') || !visible(parent)) continue;
      fontPx = Math.min(fontPx, parseFloat(getComputedStyle(parent).fontSize));
      const foreground = rgb(getComputedStyle(parent).color);
      let background = null;
      for (let ancestor = parent; ancestor && !background; ancestor = ancestor.parentElement) {
        const color = rgb(getComputedStyle(ancestor).backgroundColor);
        if (color?.alpha === 1) background = color;
        else if (color && color.alpha !== 0) unavailable.push(`Unsupported translucent background at ${expected.address}`);
      }
      if (!foreground || foreground.alpha !== 1 || !background) unavailable.push(`Opaque foreground/background evidence is unavailable at ${expected.address}`);
      else {
        const lights = [luminance(foreground.channels), luminance(background.channels)].sort((a, b) => a - b);
        if ((lights[1] + 0.05) / (lights[0] + 0.05) < 4.5) issue('contrast', expected.address, 'Text contrast is below the collector 4.5:1 minimum');
      }
      const range = document.createRange(); range.selectNodeContents(textNode);
      for (const value of range.getClientRects()) {
        if (!value.width || !value.height) continue;
        rects.push(rect(value));
        if (value.left < -1 || value.right > innerWidth + 1) issue('overflow', expected.address, 'Text extends beyond the horizontal viewport');
        for (let ancestor = parent; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor), bounds = ancestor.getBoundingClientRect();
          if (['fixed', 'sticky'].includes(style.position)) unavailable.push(`Unsupported moving semantic geometry at ${expected.address}`);
          if (style.transform !== 'none') unavailable.push(`Unsupported transformed semantic geometry at ${expected.address}`);
          if (Number(style.opacity) !== 1 || style.filter !== 'none' || style.mixBlendMode !== 'normal' || style.clipPath !== 'none') unavailable.push(`Unsupported opacity, filter, blend or clipping path at ${expected.address}`);
          if (['hidden', 'clip', 'scroll', 'auto'].includes(style.overflowY) && (value.top < bounds.top - 1 || value.bottom > bounds.bottom + 1) || ['hidden', 'clip', 'scroll', 'auto'].includes(style.overflowX) && (value.left < bounds.left - 1 || value.right > bounds.right + 1)) issue('clipping', expected.address, 'An ancestor clips or separately scrolls this text');
        }
        const x = Math.max(0, Math.min(innerWidth - 1, value.x + value.width / 2));
        const y = value.y + value.height / 2;
        if (y > chromeHeight && y < innerHeight) {
          const hit = document.elementFromPoint(x, y);
          if (hit && !node.contains(hit) && !hit.contains(node)) issue('occlusion', expected.address, 'Visible text is covered by another component');
        }
      }
    }
    elements.push({ id: expected.id, address: expected.address, text: normalize(node.textContent ?? ''), fontPx: Number.isFinite(fontPx) ? fontPx : 0, rects });
  }
  for (let a = 0; a < elements.length; a++) for (let b = a + 1; b < elements.length; b++) {
    if (elements[a].rects.some(left => elements[b].rects.some(right => Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x) > 1 && Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y) > 1))) issue('overlap', elements[a].address, `Text overlaps ${elements[b].address}`);
  }
  const textWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const labelsSeen = new Set();
  while (textWalker.nextNode()) {
    const node = textWalker.currentNode, parent = node.parentElement, value = normalize(node.textContent ?? '');
    if (!value || parent.closest('script,style,[data-qg-id]') || !visible(parent)) continue;
    if (!approvedLabels.includes(value) || labelsSeen.has(value)) issue('unaccounted-text', `dom/${parent.tagName.toLowerCase()}`, `Visible text is outside the reviewed inventory or repeats a nonsemantic label: ${value.slice(0, 100)}`);
    labelsSeen.add(value);
  }
  for (const element of document.querySelectorAll('body *')) {
    if (!visible(element) || element.matches('script,style')) continue;
    for (const pseudo of ['::before', '::after']) if (!['none', 'normal', '""'].includes(getComputedStyle(element, pseudo).content)) unavailable.push('CSS-generated text requires a supported explicit collector');
    if (element.matches('canvas,svg,img,iframe,video')) unavailable.push('Unreviewed non-DOM visual requires an explicit semantic/geometry collector');
    if (getComputedStyle(element).backgroundImage !== 'none') unavailable.push('Unreviewed background visual requires an explicit semantic/geometry collector');
    if (element.hasAttribute('data-qg-group')) issue('unverified-group', 'dom/group', 'Candidate-declared diagram grouping earns no semantic compression credit');
  }
  if (document.getAnimations().some(animation => animation.playState === 'running')) unavailable.push('Animation is still changing the surface');
  if (document.documentElement.scrollWidth > innerWidth + 1) issue('overflow', 'viewport', 'Document has horizontal overflow');
  const anchors = [...document.querySelectorAll('main,section,details,h1,h2')].filter(visible).map((element, index) => ({ id: element.id || `${element.tagName.toLowerCase()}/${index}`, top: Math.max(0, element.getBoundingClientRect().top + scrollY) }));
  return { elements, anchors, chromeHeight, documentHeight: Math.max(innerHeight, document.documentElement.scrollHeight), defects, unavailable: [...new Set(unavailable)] };
}
