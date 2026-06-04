const fs = require('fs');
const filePath = 'C:/Users/jwpmi/source/repos/DiskCleanUp/DiskCleanUp.Service/wwwroot/index.html';
let c = fs.readFileSync(filePath, 'utf8');

// Remove Root label + extSearchRootInput + Pick Folder button
c = c.replace(
  /<label for="extSearchRootInput"[^>]*>Root:<\/label>\s*\n\s*<input[^>]*id="extSearchRootInput"[^>]*>\s*\n\s*<button[^>]*id="extSearchPickFolderBtn"[^>]*>[^<]*<\/button>\s*\n/,
  '\n'
);
console.log('extSearchRootInput removed:', !c.includes('extSearchRootInput'));

// Make rootDisplay click-to-edit — add hidden input beside it
const oldSpan = '<span id="rootDisplay"></span>';
const newSpan = '<span id="rootDisplay" title="Click to change root folder" class="root-display-editable"></span><input id="rootEditInput" class="root-edit-input hidden" type="text" placeholder="New root path...">';
c = c.replace(oldSpan, newSpan);
console.log('rootEditInput added:', c.includes('rootEditInput'));

fs.writeFileSync(filePath, c, 'utf8');
console.log('Done.');
