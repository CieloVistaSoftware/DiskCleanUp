const SCAN_TOOLBAR_CONFIGS = [
  { section: "duplicates", tableId: "dupTable", specialty: ["delete-all-copies", "white-bg"] },
  { section: "smart-dedup", tableId: "smartTable", specialty: ["apply-all", "white-bg"] },
  { section: "stale", tableId: "staleTable", specialty: ["white-bg"] },
  { section: "large", tableId: "largeTable", specialty: ["white-bg"] },
  { section: "node-modules", tableId: "nmTable", specialty: ["white-bg"] },
  { section: "venvs", tableId: "venvTable", specialty: ["white-bg"] },
  { section: "empty", tableId: "emptyTable", specialty: ["white-bg"] },
  { section: "images", tableId: "imageTable", specialty: ["delete-all-copies", "white-bg"] },
  { section: "backups", tableId: "backupsTable", specialty: ["white-bg"] },
  { section: "tiny-files", tableId: "tinyTable", specialty: ["full-view", "white-bg"] },
  { section: "html-files", tableId: "htmlTable", specialty: ["html-utilities", "white-bg"] },
  { section: "css-files", tableId: "cssTable", specialty: ["css-merge-analyze", "white-bg"] }
];
function getToolbarConfig(section) {
  return SCAN_TOOLBAR_CONFIGS.find((c) => c.section === section) ?? null;
}
export {
  SCAN_TOOLBAR_CONFIGS,
  getToolbarConfig
};
