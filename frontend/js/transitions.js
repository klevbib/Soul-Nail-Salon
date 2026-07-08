/**
 * transitions.js — Site-wide behaviour, loaded on every page
 *
 * Two features:
 *   1. Page-transition fade — intercepts clicks on internal links, fades the
 *      body out, then navigates. External, anchor (#), tel:, and mailto: links
 *      are left alone. Pairs with the `.fade-out` / `pageSlideIn` rules in
 *      style.css.
 *   2. Mobile nav toggle — opens/closes the hamburger menu and swaps the
 *      menu/close icon. The menu auto-closes after a link is tapped.
 */
document.addEventListener('DOMContentLoaded', () => {
  // --- Page-transition fade on internal navigation ---
  document.querySelectorAll('a[href]').forEach(link => {
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('tel:') || href.startsWith('mailto:') || href.startsWith('http')) return;

    link.addEventListener('click', e => {
      e.preventDefault();
      document.body.classList.add('fade-out');
      setTimeout(() => { window.location.href = href; }, 50);
    });
  });

  // --- Mobile hamburger menu ---
  const navToggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('nav .links');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('open');
      navToggle.querySelector('i').className = isOpen ? 'bx bx-x' : 'bx bx-menu';
    });
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        navToggle.querySelector('i').className = 'bx bx-menu';
      });
    });
  }
});
