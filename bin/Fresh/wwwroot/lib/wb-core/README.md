# @cielovista/wb-core

Reusable web component behaviors and utilities by Cielo Vista Software.

**Light DOM only. ES modules only. Zero framework dependencies.**

## Install (local)

```json
// In your project's package.json
"dependencies": {
  "@cielovista/wb-core": "file:../path/to/wb-core"
}
```

Then `npm install`.

## Usage

```js
// Import what you need
import { tabs, dropdown, tooltip, createToast } from '@cielovista/wb-core';

// Apply a behavior to an element
const cleanup = tabs(document.querySelector('.my-tabs'));

// Or import from specific paths
import { pubsub } from '@cielovista/wb-core/utils/pubsub.js';
```

## What's Inside

### Components (30)
tabs, dropdown, tooltip, toggle, popover, drawer, lightbox, offcanvas, sheet,
confirm, prompt, toast, badge, progress, spinner, avatar, chip, alert, skeleton,
divider, breadcrumb, collapse/accordion, darkmode, draggable, masked, progressbar,
resizable, ripple, search, slider, stepper, sticky, tags, themecontrol, validator,
password, floatinglabel, autocomplete, autosize, form, mdhtml

### Media (6)
audio, video, youtube, vimeo, image, gallery, ratio, figure

### Layouts (16)
grid, flex, stack, cluster, masonry, container, center, sidebarlayout,
switcher, cover, frame, reel, imposter, icon, drawerLayout, scrollable, fixed

### Behaviors (17)
copy, lazy, print, share, fullscreen, hotkey, clipboard, scroll, truncate,
highlight, external, countdown, clock, relativetime, offline, visible, debug

### Utilities (4)
PubSub (event bus), Config (key-value store), Theme (dark/light), ErrorLogger

## Pattern

Every behavior is a function: `(element, options?) => cleanup()`

```js
const destroy = tooltip(myButton, { content: 'Hello', position: 'top' });
// Later:
destroy(); // removes all listeners and DOM modifications
```
