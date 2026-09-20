import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const path = process.argv[2];
if (!path) throw new Error('Provide a PDF path');
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(path)), disableWorker: true }).promise;
for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  console.log(`PAGE ${pageNumber}`);
  for (const item of content.items) {
    if ('str' in item && item.str.trim()) console.log(`${Math.round(item.transform[5])}\t${Math.round(item.transform[4])}\t${item.str}`);
  }
}
