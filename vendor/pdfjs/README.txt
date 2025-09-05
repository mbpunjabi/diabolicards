
Place the following files from the pdfjs-dist package here:

- pdf.mjs
- pdf.worker.min.mjs

Recommended: pdfjs-dist v4.x

Ways to get them:
- npm: `npm i pdfjs-dist` then copy `node_modules/pdfjs-dist/build/pdf.mjs` and `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` into this folder.
- Or download from the official PDF.js GitHub releases.

The flipbook script at `/assets/js/flipbook.js` imports `/vendor/pdfjs/pdf.mjs` and sets `GlobalWorkerOptions.workerSrc` to `/vendor/pdfjs/pdf.worker.min.mjs`.
