# Soul-Nail-Salon

# Soul Nail Salon — Website MVP Plan

## Goal
A simple, elegant static website for a new nail salon with two core sections: a portfolio and an about page.

---

## Pages / Sections

### 1. Hero (Homepage landing)
- Salon name and tagline
- Single CTA button (e.g. "Book Now" or "See Our Work")
- Full-width background image or soft colour wash

### 2. Portfolio Section
- Grid of nail art photos (3–4 columns, responsive)
- Optional category filter (e.g. Gel, Acrylic, Nail Art)
- Lightbox or hover effect on photos
- Placeholder images until client supplies real ones

### 3. About Page / Section
- Short bio of the salon / nail tech(s)
- Photo of the stylist or salon interior
- Values or specialty callouts (e.g. "Non-toxic products", "Walk-ins welcome")

### 4. Contact / Footer
- Phone number, address, social links (Instagram is key for a salon)
- Booking link (external, e.g. Vagaro, StyleSeat, or Google)
- Simple hours of operation

---

## Tech Stack

| Choice     | Reason                                                         |
| ---------- | -------------------------------------------------------------- |
| HTML       | Simple, no build step, easy to hand off or host anywhere       |
| CSS        | Hand-written styles, full control, no dependencies             |
| JavaScript | Vanilla JS for interactivity (filter, lightbox, smooth scroll) |
| No backend | Static site, all data hardcoded for MVP                        |

> **Future path:** Migrate to a framework (React, Next.js) if the site grows in complexity or SEO becomes a priority.

---

## File Structure

```
/
├── index.html              # Homepage (Hero + Portfolio)
├── about.html              # About page
├── css/
│   ├── style.css           # Global styles and layout
│   └── portfolio.css       # Portfolio grid and lightbox styles
├── js/
│   ├── main.js             # Shared behaviour (navbar, smooth scroll)
│   └── portfolio.js        # Filter and lightbox logic
└── assets/
    ├── portfolio/           # Nail art photos
    └── about/               # Salon / stylist photos
```

---

## MVP Scope (what's in, what's out)

**In**
- Responsive layout (mobile + desktop)
- Portfolio grid with placeholder images
- About section with bio placeholder text
- Footer with contact info placeholders

**Out (post-MVP)**
- Online booking integration
- Blog or news section
- Loyalty program / promotions page
- CMS (e.g. Contentful, Sanity) for client to self-edit

---

## Open Questions for Client
1. Preferred color palette / brand colors?
2. Do they have a logo?
3. Real portfolio photos available, or need stock imagery for now?
4. Which booking platform do they use (or plan to use)?
5. Any existing social media handles to link?
