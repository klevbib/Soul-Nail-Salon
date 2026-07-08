/**
 * home.js — Homepage "Let's get started" accordion
 *
 * Powers the three expandable cards on index.html (Services, Book Now,
 * Contact Us). Each card has a matching panel in `.info-panels`; clicking a
 * card opens its panel and closes any other. Clicking the active card again
 * collapses it.
 *
 * The cards call `togglePanel(section)` via inline `onclick` handlers, so this
 * function is intentionally global.
 */
function togglePanel(section) {
  const allItems = document.querySelectorAll('.lets-get-started .item');
  const allPanels = document.querySelectorAll('.info-panels .panel');
  const clickedItem = document.querySelector(`.item[data-section="${section}"]`);
  const targetPanel = document.getElementById(`panel-${section}`);
  const isAlreadyActive = targetPanel.classList.contains('active');

  // Collapse everything first, then re-open the target unless it was already open.
  allPanels.forEach(p => p.classList.remove('active'));
  allItems.forEach(i => i.classList.remove('active'));

  if (!isAlreadyActive) {
    targetPanel.classList.add('active');
    clickedItem.classList.add('active');
    targetPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}
