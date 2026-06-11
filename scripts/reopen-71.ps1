gh issue reopen 71
gh issue comment 71 --body 'Regression observed 2026-06-04. Scan ran 25.9s and reported "Done — 11 exact duplicate groups" in the status bar, but GROUPS: 0 ROWS: 0 and no cards rendered.

**Context at time of regression:**
- Server memory at 93% — CRITICAL banner showed "Cancelling idle scans"
- Dup Images tab was active when scan ran
- Multiple JS changes were made to section-handlers.js this session (Keep button, checkboxes, description row, issue button, onerror handler rewrite)

**Likely causes this time:**
1. `_buildImgCard` throws inside `files.forEach()` due to one of the new additions (escHtml, _explainDuplicates, or img onerror rewrite) — forEach aborts before `_set(images, rows, n)` is called
2. Memory pressure caused server to drop result messages before sending them
3. New `reasonEl`/`issueBtn` code in the result handler throws before cardsRow.appendChild runs

**Difference from original:** GROUPS is 0 (not 8 like before), suggesting ALL result messages failed, not just some.

**Next step:** Add try/catch inside the result handler around card building so a single failure does not silently drop all groups.'
