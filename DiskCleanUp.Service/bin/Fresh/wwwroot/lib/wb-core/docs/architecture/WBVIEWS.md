# wb-views System

**Version:** 1.1.0
**Status:** Active
**Location:** `src/core/wb-views.js`
**Updated:** 2026-01-05

---

## Table of Contents

- Overview
- Philosophy
- Real Working Example: ONE-TIME-ONE-PLACE
- Quick Start
- Core Concepts
- Syntax Reference
- Data Binding
- Behavior Integration
- Views Registry
- Built-in Views
- IntelliSense Support
- Advanced Patterns
- API Reference
- File Structure
- Migration Example
- Prior Art and Comparison
- Summary

---

## Overview

**wb-views** is the high-level **HTML API**, a feature found in the Web Behaviors (WB) Behaviors Library. It allows for the creation of reusable UI components using only HTML. For example, defining a `<wb-user-card>` once and using it everywhere.

While **Behaviors** (`x-ripple`, `x-draggable`) allow you to add functionality to *existing* elements, **wb-views** allow you to define *new* elements (`<wb-card>`, `<wb-btn>`) with encapsulated structure, style, and behavior.

### The "Missing Link"

wb-views bridges the gap between static HTML and heavy JavaScript frameworks: