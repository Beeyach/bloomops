// Full response and actual rendered destination sections, never an early shell.
export const navigationRoutes = project => [
  { label: 'Home', path: '/', heading: 'Home', content: '.bo-home' },
  { label: 'Clients', path: '/clients', heading: 'Clients', content: 'ul[aria-label="Clients"], .bo-empty' },
  { label: 'Work', path: '/work', heading: 'Actions', content: '.bo-action-footnote' },
  { label: 'Social', path: '/social', heading: 'Social', content: '.bo-content-pagination' },
  { label: 'Systems', path: '/systems', heading: 'Systems', content: '.bo-systems' },
  { label: 'Team', path: '/team', heading: 'Team', content: '[aria-labelledby="invitations-title"]' },
  { label: 'Project detail', path: `/work/projects/${project}`, content: '[aria-labelledby="project-activity-title"]', detail: true },
];
export async function completedContent(page, route, { animationFrames = true } = {}) {
  await page.waitForURL(url => url.pathname === route.path);
  if (route.heading) await page.getByRole('heading', { name: route.heading, exact: true, level: 1 }).waitFor();
  await page.locator(`main ${route.content.split(', ').join(', main ')}`).last().waitFor({ state: 'visible' });
  if (route.detail) for (const id of ['details', 'milestones', 'actions', 'deliverables', 'files', 'activity']) {
    await page.locator(`#project-${id}-title`).waitFor({ state: 'visible' });
  }
  return page.evaluate(frames => new Promise(resolve => {
    const complete = () => resolve({ visibleAt: performance.timeOrigin + performance.now(),
      renderedRows: [...document.querySelectorAll('main li')].filter(n => n.checkVisibility()).length,
      mainHeight: document.querySelector('main').getBoundingClientRect().height });
    if (frames) requestAnimationFrame(() => requestAnimationFrame(complete));
    else complete(); // JS-disabled acceptance already awaited document load.
  }), animationFrames);
}
