# Web Behaviors (WB) Schema Specification v3.0

**Version:** 3.1
**Created:** 2026-01-05
**Updated:** 2026-02-18
**Status:** Active

---

## Table of Contents

- Schema Types
- Page Schemas
- Golden Rule
- Schema Structure
- Properties (Model)
- $view (View)
- $methods (ViewModel)
- $cssAPI (CSS Custom Properties)
- Public vs Private Parts
- Complete Example
- Test Configuration
- Migration Guide

---

## Schema Types

Every `.schema.json` file has a `schemaType` that determines what's required:

| Type | Purpose | Required Fields |
|------|---------|----------------|
| `component` | Real components users interact with | title, description, properties, $view, $methods, behavior |
| `base` | Abstract schemas inherited by others | title, description, properties |
| `definition` | Pure reference documents | title, description |
| `page` | Page-level layout and content placement | title, description, pageRules, $layout |

Component schemas define **what a component is**. Page schemas define **how components are arranged on a page**.

---

## Page Schemas

Page schemas (`schemaType: "page"`) define layout, rules, and content placement for an entire page.

### pageRules

Page-level rules that govern generation and validation:

```json
"pageRules": {
  "showcase": false,
  "fragment": true,
  "noInlineStyles": true,
  "noPageSpecificCSS": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `showcase` | boolean | If true, all sections wrap in `wb-demo` (shows source code). False for production pages. |
| `fragment` | boolean | Page is a fragment — no DOCTYPE/html/head/body. Server shell wraps it. |
| `noInlineStyles` | boolean | No inline styles allowed on any element. |
| `noPageSpecificCSS` | boolean | No page-specific CSS file. All styling from component CSS. |

### $layout — Row-Based Layout System

Pages are built from **rows stacked vertically**. Each row is a **grid** with a defined shape.

```json
"$layout": {
  "gap": "2rem",
  "maxWidth": "1200px",
  "rows": [
    { "columns": 1, "width": "full-bleed", "content": ["hero"] },
    { "columns": 1, "width": "900px", "content": ["stats"] },
    { "columns": 3, "width": "1200px", "content": ["card1", "card2", "card3"] },
    { "columns": 2, "ratio": "60/40", "content": ["notifications", "audio"] }
  ]
}
```

#### Layout-Level Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `gap` | string | `"2rem"` | Vertical gap between rows AND horizontal gap between columns. |
| `maxWidth` | string | `"1200px"` | Default max-width for contained rows. Individual rows can override. |
| `rows` | array | — | Ordered list of layout rows. Each row stacks on top of the next. |

#### Row Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `columns` | integer | — | Number of columns: 1, 2, or 3. Collapses to 1 on mobile. |
| `rows` | integer | (auto) | Number of rows. If omitted, rows expand as content fills cells. |
| `direction` | string | `"row"` | Fill order: `"row"` = left to right then down. `"column"` = top to bottom then right. |
| `ratio` | string | (equal) | Column width ratio. Examples: `"50/50"`, `"70/30"`, `"33/33/33"`, `"25/50/25"`. |
| `width` | string | contained | `"full-bleed"` = edge to edge. A CSS value (e.g. `"900px"`) = contained with max-width. |
| `align` | string | `"stretch"` | Vertical alignment of items: `"top"`, `"center"`, `"bottom"`, `"stretch"`. |
| `gap` | string | (inherit) | Override gap for this row only. |
| `content` | array | — | Section names placed in this row. Must match `$view` or `properties` section names. |

#### Grid Shape: Fixed vs Auto

**Fixed shape** — define exact rows × columns. Content maps to cells:
```json
{ "columns": 3, "rows": 2, "content": ["a", "b", "c", "d", "e", "f"] }
```
Result (direction: row): `a b c / d e f`

**Auto-flow** — define columns only, rows expand as needed:
```json
{ "columns": 3, "content": ["a", "b", "c", "d", "e", "f", "g", "h", "i"] }
```
Result (direction: row): `a b c / d e f / g h i`

#### Fill Direction

`direction` controls how content fills the grid:

**`"row"`** (default) — fill left to right, then next row:
```
a b c
d e f
g h i
```

**`"column"`** — fill top to bottom, then next column:
```
a d g
b e h
c f i
```

#### Layout Primitives

All layouts reduce to grid configuration:

| Pattern | Grid Equivalent |
|---------|-----------------|
| Stack (vertical) | `columns: 1, direction: "column"` |
| Row (horizontal) | `columns: N, rows: 1, direction: "row"` |
| Grid (2D) | `columns: N, direction: "row"` or `"column"` |
| 2-col with ratio | `columns: 2, ratio: "60/40"` |
| Full-bleed section | `columns: 1, width: "full-bleed"` |

#### Mobile-First Behavior

All multi-column rows collapse to single column on small viewports. This is automatic — no configuration needed. The `columns` value defines the **desktop** layout. Mobile is always 1 column.

#### Example: Home Page

```json
"$layout": {
  "gap": "2rem",
  "maxWidth": "1200px",
  "rows": [
    { "columns": 1, "width": "full-bleed", "content": ["hero"] },
    { "columns": 1, "width": "900px", "content": ["stats"] },
    { "columns": 1, "width": "1200px", "content": ["features"] },
    { "columns": 2, "ratio": "60/40", "width": "1200px", "content": ["notifications", "audio"] }
  ]
}
```

### Page Test Assertions

Page schemas include test sections for layout validation:

```json
"test": {
  "site": {
    "layout": {
      "noWbDemo": true,
      "noInlineStyles": true,
      "isFragment": true,
      "sectionOrder": ["hero", "stats", "features", "notifications", "audio"]
    },
    "mobileFirst": {
      "breakpoint": 375,
      "noOverflow": true,
      "gridCollapses": true,
      "noHorizontalScroll": true
    },
    "fluent": {
      "noDashedBorders": true,
      "noBuilderBackground": true,
      "noForcedMinHeight": true,
      "minSectionGap": 16,
      "maxSectionGap": 150
    }
  }
}
```

---

## Golden Rule

Always use clear, semantic attribute names. Prefer native HTML attributes when possible, but never repurpose them for different meanings. See [Attribute Naming Standard](./ATTRIBUTE-NAMING-STANDARD.md) for full guidance.
