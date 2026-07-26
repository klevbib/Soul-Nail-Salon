/**
 * portfolio.js — Portfolio gallery filtering and lightbox
 *
 * Two responsibilities on portfolio.html:
 *   1. Category filter — show/hide gallery items by their `data-category`.
 *   2. Lightbox — open a clicked image full-screen; step through the other
 *      images with the on-screen arrows or the ← / → keys; close on backdrop
 *      click, the × button, or Escape.
 *
 * `filterGallery`, `openLightbox`, `closeLightbox`, `navigateLightbox`, and
 * `handleLightboxClick` are called from inline handlers in the markup, so they
 * are global.
 */

// The images the arrows step through: the currently *visible* gallery items, in
// DOM order. Rebuilt each time the lightbox opens so navigation matches whatever
// category filter is active. `currentIndex` is the one on screen.
let lightboxImages = [];
let currentIndex = 0;

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

/**
 * Open the lightbox on the clicked image and lock page scroll.
 *
 * `src` is the image path from the item's inline handler; we locate the matching
 * visible gallery image so the arrows can step from it to its neighbours.
 */
function openLightbox(src) {
  lightboxImages = Array.from(document.querySelectorAll('.gallery-item'))
    .filter(item => item.style.display !== 'none')
    .map(item => {
      const img = item.querySelector('img');
      return { src: img.getAttribute('src'), alt: img.getAttribute('alt') || '' };
    });

  currentIndex = lightboxImages.findIndex(i => i.src === src);
  if (currentIndex < 0) currentIndex = 0;

  // Only offer navigation when there's more than one image to move between.
  const multiple = lightboxImages.length > 1;
  document.querySelectorAll('.lightbox-nav').forEach(btn => {
    btn.style.display = multiple ? '' : 'none';
  });

  showCurrentImage();
  document.getElementById('lightbox').classList.add('open');
  document.body.style.overflow = 'hidden';
}

/** Point the lightbox at whichever image `currentIndex` refers to. */
function showCurrentImage() {
  const current = lightboxImages[currentIndex];
  if (!current) return;
  const img = document.getElementById('lightbox-img');
  img.src = current.src;
  img.alt = current.alt;
}

/**
 * Step to the previous (`delta = -1`) or next (`delta = 1`) image, wrapping
 * around at either end. Called by the arrow buttons and the ← / → keys.
 */
function navigateLightbox(delta) {
  const n = lightboxImages.length;
  if (n === 0) return;
  currentIndex = (currentIndex + delta + n) % n;
  showCurrentImage();
}

/** Close the lightbox and restore page scroll. */
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.body.style.overflow = '';
}

/** Close the lightbox only when the backdrop (not the image or arrows) is clicked. */
function handleLightboxClick(e) {
  if (e.target === document.getElementById('lightbox')) closeLightbox();
}

document.addEventListener('keydown', e => {
  // Arrow keys only do something while the lightbox is open.
  const isOpen = document.getElementById('lightbox').classList.contains('open');
  if (e.key === 'Escape') closeLightbox();
  else if (isOpen && e.key === 'ArrowLeft') navigateLightbox(-1);
  else if (isOpen && e.key === 'ArrowRight') navigateLightbox(1);
});
