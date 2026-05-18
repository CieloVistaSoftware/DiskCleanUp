// ═══════════════════════════════════════════════════════════════════════════
//  EXT-COLORS — deterministic color palette based on file extension
//  Same extension ALWAYS gets the same hue. Saturation/lightness tuned for
//  dark backgrounds.
// ═══════════════════════════════════════════════════════════════════════════
const _cache = new Map();
// Golden-ratio hue spread — visually distinct even for neighboring extensions
function _hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++)
        h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    return Math.abs(h);
}
/**
 * Returns an HSL color string for a file extension.
 * @param {string} ext — e.g. '.js', '.txt', '.png'
 * @returns {string} HSL color
 */
export function colorFor(ext) {
    if (!ext)
        return '';
    const key = ext.toLowerCase();
    if (_cache.has(key))
        return _cache.get(key);
    // Well-known extensions get hand-picked colors for instant recognition
    const fixed = _fixedColors[key];
    if (fixed) {
        _cache.set(key, fixed);
        return fixed;
    }
    // Everything else: deterministic hue from hash, soft pastel for readability
    const hue = (_hash(key) * 137.508) % 360; // golden angle spread
    const color = `hsl(${Math.round(hue)}, 55%, 65%)`;
    _cache.set(key, color);
    return color;
}
/**
 * Returns a subtle background tint for the extension (for row highlights).
 * @param {string} ext
 * @returns {string} HSLA background
 */
export function bgFor(ext) {
    if (!ext)
        return '';
    const c = colorFor(ext);
    // Extract hue from the color and make a very subtle bg
    const m = c.match(/hsl\((\d+)/);
    if (!m)
        return '';
    return `hsla(${m[1]}, 40%, 50%, 0.06)`;
}
/**
 * Returns a small colored dot span for inline use.
 * @param {string} ext
 * @returns {string} HTML string
 */
export function dot(ext) {
    if (!ext)
        return '';
    return `<span class="ext-dot" style="background:${colorFor(ext)}" title="${ext}"></span>`;
}
/**
 * Extract extension from a file path.
 * @param {string} path
 * @returns {string} e.g. '.js' or ''
 */
export function extOf(path) {
    if (!path)
        return '';
    const dot = path.lastIndexOf('.');
    const sep = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    if (dot < 0 || dot < sep)
        return '';
    return path.substring(dot).toLowerCase();
}
// ── Hand-picked palette for common extensions ────────────────────────────
const _fixedColors = {
    // Code
    '.js': 'hsl(50, 70%, 60%)', // yellow
    '.mjs': 'hsl(50, 70%, 60%)',
    '.cjs': 'hsl(50, 60%, 55%)',
    '.ts': 'hsl(210, 70%, 60%)', // blue
    '.tsx': 'hsl(210, 65%, 65%)',
    '.jsx': 'hsl(195, 70%, 60%)', // react cyan
    '.py': 'hsl(220, 55%, 60%)', // python blue
    '.cs': 'hsl(265, 55%, 60%)', // C# purple
    '.java': 'hsl(20, 70%, 55%)', // java orange
    '.cpp': 'hsl(200, 50%, 55%)',
    '.c': 'hsl(200, 45%, 50%)',
    '.h': 'hsl(200, 40%, 55%)',
    '.rs': 'hsl(25, 65%, 55%)', // rust orange
    '.go': 'hsl(190, 60%, 55%)', // go cyan
    '.rb': 'hsl(0, 55%, 55%)', // ruby red
    '.php': 'hsl(240, 40%, 60%)', // php indigo
    '.swift': 'hsl(15, 70%, 55%)', // swift orange
    '.ps1': 'hsl(210, 55%, 55%)', // powershell blue
    '.sh': 'hsl(120, 35%, 50%)', // shell green
    '.bat': 'hsl(30, 40%, 50%)',
    // Web
    '.html': 'hsl(15, 65%, 55%)', // HTML orange
    '.htm': 'hsl(15, 65%, 55%)',
    '.css': 'hsl(220, 65%, 60%)', // CSS blue
    '.scss': 'hsl(330, 55%, 60%)', // sass pink
    '.less': 'hsl(250, 45%, 55%)',
    '.svg': 'hsl(40, 65%, 55%)', // svg gold
    // Data
    '.json': 'hsl(45, 60%, 55%)', // json gold
    '.xml': 'hsl(30, 50%, 55%)',
    '.yaml': 'hsl(160, 40%, 50%)',
    '.yml': 'hsl(160, 40%, 50%)',
    '.csv': 'hsl(140, 45%, 50%)', // csv green
    '.sql': 'hsl(195, 50%, 55%)',
    '.db': 'hsl(195, 40%, 50%)',
    // Docs
    '.md': 'hsl(180, 40%, 55%)', // markdown teal
    '.txt': 'hsl(0, 0%, 65%)', // plain gray
    '.pdf': 'hsl(0, 60%, 55%)', // pdf red
    '.doc': 'hsl(215, 60%, 55%)', // word blue
    '.docx': 'hsl(215, 60%, 55%)',
    '.xls': 'hsl(140, 55%, 50%)', // excel green
    '.xlsx': 'hsl(140, 55%, 50%)',
    '.ppt': 'hsl(20, 65%, 55%)', // ppt orange
    '.pptx': 'hsl(20, 65%, 55%)',
    '.rtf': 'hsl(270, 35%, 55%)',
    // Images
    '.png': 'hsl(280, 50%, 60%)', // purple
    '.jpg': 'hsl(35, 60%, 55%)', // warm
    '.jpeg': 'hsl(35, 60%, 55%)',
    '.gif': 'hsl(160, 50%, 55%)', // teal
    '.webp': 'hsl(300, 40%, 55%)',
    '.bmp': 'hsl(350, 40%, 55%)',
    '.ico': 'hsl(55, 50%, 55%)',
    // Media
    '.mp3': 'hsl(320, 55%, 55%)', // pink
    '.wav': 'hsl(310, 45%, 55%)',
    '.mp4': 'hsl(350, 55%, 55%)', // red
    '.avi': 'hsl(340, 45%, 55%)',
    '.mkv': 'hsl(0, 50%, 55%)',
    '.mov': 'hsl(355, 50%, 55%)',
    // Archives
    '.zip': 'hsl(45, 55%, 50%)', // gold
    '.rar': 'hsl(275, 50%, 55%)', // purple
    '.7z': 'hsl(100, 40%, 50%)', // green
    '.tar': 'hsl(30, 45%, 50%)',
    '.gz': 'hsl(80, 40%, 50%)',
    // Config
    '.env': 'hsl(60, 40%, 50%)',
    '.gitignore': 'hsl(10, 50%, 50%)',
    '.gitattributes': 'hsl(10, 40%, 50%)',
    '.editorconfig': 'hsl(180, 35%, 50%)',
    '.eslintrc': 'hsl(260, 45%, 55%)',
    '.prettierrc': 'hsl(330, 45%, 55%)',
    '.csproj': 'hsl(265, 50%, 55%)',
    '.sln': 'hsl(265, 55%, 60%)',
    // Logs / temp
    '.log': 'hsl(0, 0%, 50%)', // gray
    '.tmp': 'hsl(0, 0%, 45%)',
    '.bak': 'hsl(30, 30%, 50%)',
    '.backup': 'hsl(30, 30%, 50%)',
};
// Expose for inline HTML
window._extColor = colorFor;
window._extBg = bgFor;
window._extDot = dot;
window._extOf = extOf;
