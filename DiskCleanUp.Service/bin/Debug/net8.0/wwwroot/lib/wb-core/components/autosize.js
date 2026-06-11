import { ErrLog } from '../../../js/error-logger.js';
// Minimal autosize modifier (adjusts textarea height)
export default function autosize(el) {
    try {
        const t = el.tagName === 'TEXTAREA' ? el : el.querySelector('textarea');
        if (!t)
            return () => { };
        const resize = () => {
            t.style.height = 'auto';
            t.style.height = (t.scrollHeight) + 'px';
        };
        resize();
        t.addEventListener('input', resize);
        if (t)
            t.setAttribute('x-autosize-init', '1');
        return () => t.removeEventListener('input', resize);
    }
    catch (err) {
        try {
            if (el)
                el.setAttribute('x-error', 'autosize-failed');
            ErrLog.log('[AUTOSIZE]', err.message, err.stack, 'CAUGHT_ERROR');
        }
        catch (e) {
            ErrLog.log('[AUTOSIZE]', e.message, e.stack, 'CAUGHT_ERROR');
        }
        return () => { };
    }
}
//# sourceMappingURL=autosize.js.map