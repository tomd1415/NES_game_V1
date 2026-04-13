// Minimal first-run tour. Pages call:
//   runTour({ prefKey: 'tourSeenSprites', steps: [...], prefs, savePrefs })
// Each step: { selector, title, body }. The helper positions a small popover
// next to the target, dims the rest of the screen, and walks the pupil
// through Next / Skip. No dependency on any framework.
(function(global) {
  function ensureStyles() {
    if (document.getElementById('__tour_css')) return;
    const css = `
      .__tour_backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.55);
        z-index: 9998; }
      .__tour_cutout   { position: fixed; box-shadow: 0 0 0 4px #ffd866,
        0 0 0 9999px rgba(0,0,0,0.55); border-radius: 6px; z-index: 9999;
        pointer-events: none; transition: all 160ms ease; }
      .__tour_popover  { position: fixed; z-index: 10000; max-width: 320px;
        background: #1d1b2d; color: #eee; border: 1px solid #3a3358;
        border-radius: 8px; padding: 14px 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.55);
        font: 14px system-ui, sans-serif; }
      .__tour_popover h4 { margin: 0 0 6px; font-size: 15px; color: #ffd866; }
      .__tour_popover p  { margin: 0 0 10px; line-height: 1.35; }
      .__tour_popover .row { display: flex; gap: 8px; justify-content: flex-end; }
      .__tour_popover button { font: inherit; padding: 4px 10px; border-radius: 4px;
        border: 1px solid #555; background: #2a2540; color: #eee; cursor: pointer; }
      .__tour_popover button.primary { background: #ffd866; color: #000; border-color: #ffd866; }
    `;
    const style = document.createElement('style');
    style.id = '__tour_css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function positionPopover(pop, rect) {
    const margin = 12;
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = rect.right + margin;
    let top  = rect.top;
    if (left + pw > window.innerWidth - 12) {
      left = rect.left - pw - margin;
    }
    if (left < 12) left = 12;
    if (top + ph > window.innerHeight - 12) top = window.innerHeight - ph - 12;
    if (top < 12) top = 12;
    pop.style.left = left + 'px';
    pop.style.top  = top + 'px';
  }

  function runTour(opts) {
    const { prefKey, steps, prefs, savePrefs } = opts;
    if (!steps || !steps.length) return;
    if (prefs && prefs[prefKey]) return;
    ensureStyles();

    const backdrop = document.createElement('div');
    backdrop.className = '__tour_backdrop';
    const cutout = document.createElement('div');
    cutout.className = '__tour_cutout';
    const pop = document.createElement('div');
    pop.className = '__tour_popover';
    pop.innerHTML =
      '<h4></h4><p></p><div class="row">' +
      '<button class="__tour_skip">Skip</button>' +
      '<button class="__tour_next primary">Next</button>' +
      '</div>';
    document.body.appendChild(backdrop);
    document.body.appendChild(cutout);
    document.body.appendChild(pop);

    let i = 0;
    function showStep() {
      const step = steps[i];
      const el = document.querySelector(step.selector);
      if (!el) {
        // If the target is missing on this page, move on.
        i++;
        if (i >= steps.length) return finish(true);
        showStep();
        return;
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        cutout.style.left = r.left - 4 + 'px';
        cutout.style.top  = r.top - 4 + 'px';
        cutout.style.width  = r.width + 8 + 'px';
        cutout.style.height = r.height + 8 + 'px';
        pop.querySelector('h4').textContent = step.title;
        pop.querySelector('p').textContent = step.body;
        pop.querySelector('.__tour_next').textContent =
          (i === steps.length - 1) ? 'Done' : 'Next';
        positionPopover(pop, r);
      });
    }
    function finish(seen) {
      backdrop.remove();
      cutout.remove();
      pop.remove();
      if (seen && prefs && savePrefs) {
        prefs[prefKey] = true;
        try { savePrefs(prefs); } catch {}
      }
    }
    pop.querySelector('.__tour_next').addEventListener('click', () => {
      i++;
      if (i >= steps.length) finish(true);
      else showStep();
    });
    pop.querySelector('.__tour_skip').addEventListener('click', () => finish(true));
    backdrop.addEventListener('click', () => finish(true));
    showStep();
  }

  global.runTileEditorTour = runTour;
})(typeof window !== 'undefined' ? window : globalThis);
