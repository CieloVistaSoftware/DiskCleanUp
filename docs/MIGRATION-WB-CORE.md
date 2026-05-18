---
docid: 300.9.migration-wb-core
id: migration-plan-replace-custom-uiutilities-with-wb-
title: "Migration Plan: Replace Custom UI/Utilities with wb-core"
project: DiskCleanUp
description: "Migrate all custom UI/utility components to wb-core equivalents."
status: active
tags: [migration, core, plan]
category: 300.9 — Meta
created: 2026-02-24
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: docs/MIGRATION-WB-CORE.md
---
# Migration Plan: Replace Custom UI/Utilities with wb-core

## 1. Inventory & Mapping
- List all custom UI components/utilities (error logger, event queue, column controls, ui-utils, etc.).
- For each, identify the equivalent wb-core component or utility (e.g., toast, drawer, pubsub, resizable, sortable).

## 2. Prioritization
- Start with the most redundant or high-maintenance custom code (e.g., error logger → wb-core toast/drawer).
- Tackle isolated utilities (e.g., pubsub/event queue) before deeply integrated ones.

## 3. Component-by-Component Migration
### a. Error Logger
- Replace custom toast/drawer/badge with wb-core’s toast, drawer, and badge.
- Refactor error capture to use wb-core’s notification and overlay APIs.

### b. Event Queue
- Replace or wrap custom pub/sub/event batching with wb-core’s pubsub utility.

### c. Column Controls
- Swap custom resizable/sortable logic with wb-core’s resizable and sortable table utilities.

### d. UI Utilities
- Replace formatting, navigation, and helpers with wb-core equivalents where available.

## 4. Testing & Validation
- After each migration, test affected features for parity and bugs.
- Ensure all UI/UX remains consistent and user-friendly.

## 5. Cleanup
- Remove unused custom code after successful migration.
- Update documentation and code comments to reference wb-core usage.

## 6. Documentation & Training
- Document new usage patterns for future contributors.
- Point to wb-core docs for reference.
