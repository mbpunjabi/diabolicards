// pdf.mjs — lightweight shim that re-exports the official PDF.js module from CDN
// Drop this file at /vendor/pdfjs/pdf.mjs
export * from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.mjs';
export { GlobalWorkerOptions } from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.mjs';
