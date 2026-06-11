/**
 * RowActions — Standardized Row Action Button Renderer
 *
 * Renders action buttons for each grid row (trash, open, folder).
 * Plugs into GridShell as column type.
 *
 * Features:
 * - Configurable icon, title, className, onClick per action
 * - Consistent .sg-actions styling
 * - Conditional actions per row (condition function)
 * - Inline variant for sub-paths (.btn-xxs)
 * - Event delegation with row/data context
 *
 * API:
 * - create(actionDefs) → action set
 * - render(cell, actionSet, data, row)
 *
 * Example:
 * const actions = RowActions.create([
 *   {
 *     icon: '🗑️',
 *     title: 'Delete',
 *     className: 'btn-danger',
 *     onClick: (data, row) => { console.log('delete', data.path); }
 *   },
 *   {
 *     icon: '📁',
 *     title: 'Open Folder',
 *     className: 'btn-secondary',
 *     onClick: (data, row) => { console.log('open folder', data.path); },
 *     condition: (data) => data.isDirectory === true
 *   }
 * ]);
 */
export const RowActions = {
    /**
     * Create an action set
     * @param {Array} actionDefs - Array of action definitions
     *   Each def: { icon, title, className, onClick, condition? }
     * @returns {Object} Action set with validated actions
     */
    create(actionDefs) {
        // Accept both array and { actions: [...] } object
        let defs = actionDefs;
        if (defs && !Array.isArray(defs) && Array.isArray(defs.actions)) {
            defs = defs.actions;
        }
        if (!Array.isArray(defs)) {
            console.warn('RowActions.create() requires array of action definitions');
            return { actions: [] };
        }
        const actions = defs.map((def, idx) => ({
            id: `action-${idx}`,
            icon: def.icon || def.label || '•',
            title: def.title || def.tooltip || 'Action',
            className: def.className || 'btn-secondary',
            onClick: typeof def.onClick === 'function' ? def.onClick : () => { },
            condition: typeof def.condition === 'function' ? def.condition : () => true
        }));
        return { actions };
    },
    /**
     * Render actions into a cell
     * @param {HTMLElement} cell - Target cell element
     * @param {Object} actionSet - Action set from create()
     * @param {Object} data - Row data object
     * @param {HTMLElement} row - Row element (optional, for context)
     */
    render(cell, actionSet, data, row) {
        if (!cell || !actionSet || !data) {
            return;
        }
        // Create actions container
        const container = document.createElement('div');
        container.className = 'sg-actions';
        // Filter and render actions based on condition
        const actions = actionSet.actions || [];
        actions.forEach((action) => {
            // Check condition
            if (!action.condition(data)) {
                return;
            }
            // Create button
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `sg-action-btn ${action.className}`;
            btn.title = action.title;
            btn.innerHTML = action.icon;
            btn.setAttribute('data-action-id', action.id);
            // Attach click handler
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                action.onClick(data, row);
            });
            container.appendChild(btn);
        });
        // Clear cell and add container
        cell.innerHTML = '';
        cell.appendChild(container);
    }
};
//# sourceMappingURL=row-actions.js.map