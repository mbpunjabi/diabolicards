
# Diabolicards — static site

A fast, accessible, grayscale-themed static website for **diabolicards.com** built with **HTML, CSS, and vanilla JS**. Ready for GitHub Pages.

## Quick start

1. Upload these files to your repo: `mbpunjabi/diabolicards` (root).
2. In **Settings → Pages**, set **Build and deployment** → **Source: GitHub Actions**.
3. Ensure DNS for `diabolicards.com` points to GitHub Pages (and keep the `CNAME` file).
4. Push to `main`. The included GitHub Actions workflow will publish the site.

> If you prefer the classic `gh-pages` branch, we can switch the workflow later.

## Replace assets

- Background image: replace `assets/images/bg-placeholder.png` and, if needed, update `--bg-image` in `assets/css/styles.css`.
- Fonts: drop your `.woff2` files in `assets/fonts/` and add `@font-face` rules in `styles.css`, then set `--font-heading` and `--font-body`.

Example `@font-face` block:
```css
@font-face{
  font-family:"YourFont";
  src: url("/assets/fonts/YourFont.woff2") format("woff2");
  font-weight: 100 900;
  font-display: swap;
}
:root{
  --font-heading: "YourFont", system-ui, -apple-system, Segoe UI, Roboto, Inter, Arial, sans-serif;
  --font-body: "YourFont", system-ui, -apple-system, Segoe UI, Roboto, Inter, Arial, sans-serif;
}
```

## Structure

- `index.html` (Home)
- `about/`, `guide/`, `faq/`, `extras/`, `review/`, `buy/`, `contact/`, `future-projects/` — each has an `index.html`
- `assets/css/styles.css` — theme & layout
- `assets/js/main.js` — nav, accessibility helpers
- `assets/js/reviews.js` — local review demo
- `assets/images/` — background + og image
- `CNAME`, `.nojekyll`, `robots.txt`, `sitemap.xml`
- `.github/workflows/deploy.yml` — GitHub Pages (Actions)

## Notes

- Links use **root-relative paths** (e.g. `/about/`), which work with the custom domain.
- Accessible by default: visible focus, skip link, semantic headings, reduced motion support.
- Performance: minimal JS, no frameworks; images are optimized placeholders.
- Forms: the **Review** page stores to `localStorage` only (demo); **Contact** uses `mailto:`.

If you want me to wire a privacy-friendly form backend, analytics, or a PWA later, I can add those without breaking the static setup.
