# Soul Nail Salon

A simple, elegant static website for **Soul Nail Salon**, a boutique nail salon
in Altrincham. The site presents the salon's services, portfolio, and story, and
points visitors toward booking by phone or walk-in.

Plain HTML, CSS, and vanilla JavaScript — no build step, no dependencies to
install, no backend. It can be hosted on any static host (GitHub Pages, Netlify,
Cloudflare Pages, S3, etc.).

---

## Running locally

Because everything is static, you can just open `frontend/index.html` in a
browser. To exercise the page-to-page navigation and relative asset paths
exactly as they'll behave when hosted, serve the `frontend/` folder instead:

```bash
cd frontend
python3 -m http.server 8000
# then visit http://localhost:8000
```

Any static file server works equally well (e.g. `npx serve`).

---

## Project structure

```
Soul-Nail-Salon/
├── README.md
├── .gitignore
└── frontend/                     # Everything the site needs is served from here
    ├── index.html                # Homepage: hero + "Let's get started" accordion
    ├── portfolio.html            # Filterable image gallery + lightbox
    ├── about.html                # Salon story and values
    ├── privacy-policy.html       # Legal: privacy policy
    ├── terms-and-conditions.html # Legal: terms & conditions
    ├── css/
    │   └── style.css             # Single global stylesheet for all pages
    ├── js/
    │   ├── transitions.js        # Loaded everywhere: page fade + mobile nav
    │   ├── home.js               # index.html "Let's get started" accordion
    │   └── portfolio.js          # portfolio.html filtering + lightbox
    └── assets/
        ├── other/                # Logos, posters
        └── portfolio/            # Nail art photos shown in the gallery
```

Each page loads `transitions.js`; the homepage and portfolio additionally load
their own page-specific script.

---

## How it fits together

- **Shared UI** — the dismissible top banner, navigation bar, and footer are
  duplicated as plain markup at the top/bottom of every HTML page. There's no
  templating, so a change to any of them must be applied to each page.
- **Styling** — one hand-written `css/style.css` covers every page. It opens
  with a documented colour palette and a numbered table of contents; each major
  section carries a matching numbered header. Responsive rules for tablet
  (≤1024px) and mobile (≤768px) live at the bottom.
- **JavaScript** — small, dependency-free, and split by responsibility:
  - `transitions.js` — fades between internal pages and drives the mobile
    hamburger menu.
  - `home.js` — the homepage accordion (`togglePanel`).
  - `portfolio.js` — gallery category filtering and the lightbox.

  The page-specific handlers are invoked from inline `onclick`/`onkeydown`
  attributes in the markup, so those functions are intentionally global.
- **Icons & fonts** — [Boxicons](https://boxicons.com/) and the Hanken Grotesk
  Google Font are loaded from CDNs, so an internet connection is needed for them
  to render.

---

## Tech stack

| Choice     | Reason                                                         |
| ---------- | -------------------------------------------------------------- |
| HTML       | Simple, no build step, easy to hand off or host anywhere       |
| CSS        | Hand-written styles, full control, no dependencies             |
| JavaScript | Vanilla JS for interactivity (filter, lightbox, transitions)   |
| No backend | Fully static; all content is hardcoded in the HTML             |

> **Future path:** migrate to a framework (React, Next.js, Astro) if the site
> grows or the shared banner/nav/footer duplication becomes hard to maintain.

---

## Editing content

- **Services & pricing** — the services list on `index.html` (`#panel-services`).
- **Contact details, address, hours** — appear in the nav/panels/footer of every
  page; update them everywhere they occur.
- **Portfolio images** — add a `.png` to `frontend/assets/portfolio/`, then add a
  matching `.gallery-item` in `portfolio.html`. Set `data-category` to one of
  `manicure`, `nail-art`, `gel`, or `acrylic` so the filter buttons include it.
- **Booking** — currently phone/walk-in only; there is no online booking
  integration yet.
