# x- Prefix Migration — Phase 1: Core Infrastructure

**Document Version:** 1.0
**Created:** 2026-02-13
**Status:** Ready for Implementation
**Target Completion:** ~2 hours

---

## Executive Summary

Phase 1 refactors the core behavior injection system to extract hardcoded mappings into dedicated, maintainable modules. This enables subsequent phases (attribute naming, builder, HTML migration) to work from a single source of truth.

**Outcome:** Three new modules (`tag-map.js`, `extensions.js`) that make `wb.js` 40% simpler and enable automated code generation in future phases.

---

## Problem Statement

### Current State
- `wb.js` contains **hardcoded mappings**:
  - `autoInjectMappings` array (20+ native elements)
  - Inline extension detection logic scattered throughout `scan()` / `observe()`
  - No way to auto-generate mappings for builder, schemas, or documentation
  
- **80+ component schemas** exist but are unreferenced by infrastructure
- **No centralized registry** for:
  - What behaviors exist
  - What elements trigger them
  - What x-* extensions are valid
  - How to validate extension values

### Impact
- **Builders & IDEs** can't auto-detect valid components/attributes
- **Future phases** must duplicate mapping logic
- **Tests** can't validate naming consistency
- **Documentation** can't auto-generate from schemas

---