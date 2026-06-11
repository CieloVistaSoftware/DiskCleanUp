// ═══════════════════════════════════════════════════════════════════════════
//  LAYOUT UTILITIES — Reusable layout primitives for unified grid system
//
//  Purpose: Provide lightweight CSS class-based layouts (flex, grid, stack)
//           without dependencies on frameworks. All layouts use vanilla CSS.
//
//  Conventions:
//    .layout-panel      — Main section container with padding/border
//    .layout-header     — Title area with optional toolbar
//    .layout-toolbar    — Horizontal button bar
//    .layout-filters    — Filter/search bar area
//    .layout-content    — Scrollable data area
//    .layout-footer     — Status/pagination area
//
//    .flex-*            — Flexbox utilities (direction, justify, align, gap)
//    .grid-*            — CSS Grid utilities
//    .stack-*           — Flex column with gap
//    .space-*           — Margin/padding utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LayoutBuilder — programmatic container creation
 * Usage:
 *   const panel = new LayoutBuilder('panel')
 *     .withHeader('🕰 Stale Files')
 *     .withToolbar(['scan', 'cancel', 'select-all'])
 *     .withFilters(['folder', 'size'])
 *     .withGrid('stale-grid')
 *     .withFooter('0 results')
 *     .build();
 */
export class LayoutBuilder {
  constructor(type = 'panel') {
    this.type = type;
    this.classList = ['layout-' + type];
    this.children = [];
    this.attrs = {};
  }

  withClass(className) {
    this.classList.push(className);
    return this;
  }

  withId(id) {
    this.attrs.id = id;
    return this;
  }

  withAttr(key, value) {
    this.attrs[key] = value;
    return this;
  }

  withHeader(title) {
    const header = document.createElement('div');
    header.className = 'layout-header';
    const h2 = document.createElement('h2');
    h2.textContent = title;
    header.appendChild(h2);
    this.children.push(header);
    return this;
  }

  withDesc(descText) {
    const desc = document.createElement('p');
    desc.className = 'layout-desc';
    desc.textContent = descText;
    this.children.push(desc);
    return this;
  }

  withStatusBar(containerId) {
    const container = document.createElement('div');
    container.id = containerId;
    container.className = 'layout-status-bar';
    this.children.push(container);
    return this;
  }

  withFilterBar(containerId) {
    const container = document.createElement('div');
    container.id = containerId;
    container.className = 'layout-filter-bar';
    this.children.push(container);
    return this;
  }

  withToolbar(containerId) {
    const container = document.createElement('div');
    container.id = containerId;
    container.className = 'layout-toolbar';
    this.children.push(container);
    return this;
  }

  withGrid(containerId) {
    const container = document.createElement('div');
    container.id = containerId;
    container.className = 'layout-grid-container';
    this.children.push(container);
    return this;
  }

  withContent(containerId) {
    const container = document.createElement('div');
    container.id = containerId;
    container.className = 'layout-content';
    this.children.push(container);
    return this;
  }

  withFooter(text) {
    const footer = document.createElement('div');
    footer.className = 'layout-footer';
    footer.textContent = text;
    this.children.push(footer);
    return this;
  }

  build() {
    const el = document.createElement('div');
    el.className = this.classList.join(' ');
    Object.entries(this.attrs).forEach(([k, v]) => {
      el.setAttribute(k, v);
    });
    this.children.forEach(child => el.appendChild(child));
    return el;
  }
}

/**
 * Flex utilities
 * @param {'row'|'column'} direction
 * @param {'start'|'center'|'end'|'between'|'around'} justify
 * @param {'start'|'center'|'end'|'stretch'} align
 * @param {number} gap — CSS gap in pixels
 */
export function flexContainer(direction = 'row', justify = 'between', align = 'center', gap = 8) {
  const el = document.createElement('div');
  el.className = `flex-${direction} flex-justify-${justify} flex-align-${align} gap-${gap}`;
  return el;
}

/**
 * Grid utilities
 * @param {string} template — CSS grid-template-columns (e.g. '1fr 100px 100px')
 * @param {number} gap — CSS gap in pixels
 */
export function gridContainer(template, gap = 8) {
  const el = document.createElement('div');
  el.style.display = 'grid';
  el.style.gridTemplateColumns = template;
  el.style.gap = gap + 'px';
  el.className = `grid-columns gap-${gap}`;
  return el;
}

/**
 * Stack utilities (flex column with gap)
 * @param {number} gap — CSS gap in pixels
 */
export function stackContainer(gap = 12) {
  const el = document.createElement('div');
  el.className = `flex-column gap-${gap}`;
  return el;
}
