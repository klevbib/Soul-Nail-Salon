/**
 * portfolio.js — Portfolio gallery filtering and lightbox
 *
 * Two responsibilities on portfolio.html:
 *   1. Category filter — show/hide gallery items by their `data-category`.
 *   2. Lightbox — open a clicked image full-screen, close on backdrop click,
 *      the × button, or the Escape key.
 *
 * `filterGallery`, `openLightbox`, `closeLightbox`, and `handleLightboxClick`
 * are called from inline `onclick` handlers in the markup, so they are global.
 */

/** Show only gallery items matching `category` ("all" shows everything). */
function filterGallery(category) {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === category);
  });
  document.querySelectorAll('.gallery-item').forEach(item => {
    const show = category === 'all' || item.dataset.category === category;
    item.style.display = show ? 'block' : 'none';
  });
}

/** Open the lightbox with the given image source and lock page scroll. */
function openLightbox(src) {
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox').classList.add('open');
  document.body.style.overflow = 'hidden';
}

/** Close the lightbox and restore page scroll. */
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.body.style.overflow = '';
}

/** Close the lightbox only when the backdrop (not the image) is clicked. */
function handleLightboxClick(e) {
  if (e.target === document.getElementById('lightbox')) closeLightbox();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeLightbox();
});
