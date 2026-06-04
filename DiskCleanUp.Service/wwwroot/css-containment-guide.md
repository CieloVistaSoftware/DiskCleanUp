# CSS Containment & Aggregation: A Practical Guide

Modern CSS can be powerful, but without boundaries it becomes chaotic.
This guide explains how to aggregate all your CSS into one place while still keeping it contained, modular, and predictable — using principles borrowed from object-oriented programming (OOP).

---

## Why Containment Matters

CSS is global by default. Without structure, styles leak across components, override each other, and create unpredictable side effects.

OOP solved this problem decades ago with:

- **Encapsulation** — hide internals, expose only what's needed
- **Visibility control** — public, protected, private
- **Composition over inheritance** — build from small parts rather than deep chains

We can apply the same ideas to CSS.

---

## Goals

- Aggregate CSS into a single build output
- Keep styles contained and isolated
- Control what is included or excluded
- Avoid cascade and specificity problems
- Make CSS predictable and maintainable

---

## 1. Use CSS Layers to Aggregate Without Mixing

CSS `@layer` lets you gather everything into one file while keeping logical boundaries.

```css
@layer reset, base, components, utilities;

/* Reset */
@layer reset {
  /* normalize/reset rules */
}

/* Base styles */
@layer base {
  body { font-family: system-ui; }
}

/* Components */
@layer components {
  .card   { padding: 1rem; border-radius: 8px; }
  .button { padding: 0.5rem 1rem; }
}

/* Utilities */
@layer utilities {
  .flex { display: flex; }
  .mt-4 { margin-top: 1rem; }
}
```

**Benefits**

- One file
- Predictable cascade order
- Clear separation of concerns
- No accidental overrides

---

## 2. Use Modular File Structure (But Bundle Into One Output)

Organize your CSS into folders:

```text
styles/
  reset.css
  tokens.css
  components/
    card.css
    button.css
  utilities.css
main.css
```

Then aggregate them in `main.css`:

```css
@import "reset.css";
@import "tokens.css";
@import "components/card.css";
@import "components/button.css";
@import "utilities.css";
```

Your build tool (Vite, Webpack, Parcel, etc.) outputs one final stylesheet, but you work with many small, contained files.

**Benefits**

- Human-friendly structure
- Machine-friendly output
- Easy to scale

---

## 3. Use Utility Classes as a Public API

Utility classes act like the **public interface** of your design system.

```css
.flex    { display: flex; }
.grid    { display: grid; }
.mt-4    { margin-top: 1rem; }
.text-lg { font-size: 1.125rem; }
```

Compose them in HTML:

```html
<div class="flex mt-4 text-lg">
```

**Benefits**

- No new global selectors
- No cascade issues
- Highly composable
- Predictable behavior

---

## 4. Use Component-Scoped CSS for Encapsulation

Tools like CSS Modules, Shadow DOM, Vue `<style scoped>`, and Styled Components give each component its own private namespace.

**Example — CSS Modules:**

```css
/* Button.module.css */
.button {
  padding: 0.5rem 1rem;
  background: blue;
}
```

```js
import styles from './Button.module.css';
<button className={styles.button}>Click</button>
```

**Benefits**

- No leakage
- No naming collisions
- True encapsulation

---

## 5. Avoid Deep Selector Chains (CSS Inheritance Hell)

Just like deep inheritance in OOP creates fragility, deep CSS selectors create unpredictability.

**Avoid:**

```css
body.homepage #main .content .card p.description span { ... }
```

**Prefer:**

```css
.card__description { ... }
```

**Benefits**

- No specificity wars
- No accidental overrides
- Easier to reason about

---

## 6. Combine Everything Into One Final Build

Regardless of your approach, the final step is the same:

- All CSS is aggregated into one output file
- But internally, everything is contained and modular

This gives you:

- **Performance** — one HTTP request
- **Maintainability** — many small modules
- **Predictability** — controlled cascade

---

## Summary

To aggregate CSS "one time, one place" without creating a mess, apply OOP-style containment:

| OOP Concept              | CSS Equivalent                          |
|--------------------------|-----------------------------------------|
| Private members          | Scoped CSS (Modules, Shadow DOM)        |
| Protected members        | Component-level classes (BEM)           |
| Public interface         | Utility classes                         |
| Composition              | Utility-first + small components        |
| Avoid inheritance chains | Avoid deep selectors & cascade reliance |

---

## Recommended Architecture

A modern, scalable CSS architecture looks like this:

```text
styles/
  reset.css          ← @layer reset
  tokens.css         ← @layer base (design tokens)
  components/
    card.css         ← @layer components
    button.css       ← @layer components
  utilities.css      ← @layer utilities
main.css             ← bundled into one output
```

This gives you:

- **Containment** — styles stay where they belong
- **Aggregation** — one file delivered to the browser
- **Predictability** — cascade is explicit, not accidental
- **Scalability** — add components without touching others
