import fs from 'node:fs';
import JSZip from 'jszip';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const [docxPath,pdfPath]=process.argv.slice(2);
const aliases={AGRICULTURE:'AGRI','B/KNOWLEDGE':'B/K',BIOLOGY:'BIO',CHEMISTRY:'CHEM','CHICHEWA LANG':'CHILA','CHICHEWA LIT':'CHILT','ENGLISH LANG':'ENGLA','ENGLISH LIT':'ENGLT',GEOGRAPHY:'GEOG',HISTORY:'HIST','LIFE SKILLS':'L/SKS',MATHEMATICS:'MAT',PHYSICS:'PHYS','SOCIAL STUDIES':'SOCIAL'};
const zip=await JSZip.loadAsync(fs.readFileSync(docxPath));
const xml=await zip.file('word/document.xml').async('string');
const rows=[...xml.matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)].map(m=>[...m[0].matchAll(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g)].map(c=>[...c[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(t=>t[1]).join('').trim()));
const allocationSubjects=new Set(rows.map(r=>r[0]).filter(x=>aliases[x]).map(x=>aliases[x]));
const pdf=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(pdfPath)),disableWorker:true}).promise;
const timetableCodes=new Set();
for(let p=1;p<=pdf.numPages;p++){const content=await(await pdf.getPage(p)).getTextContent();for(const item of content.items){if('str'in item&&Object.values(aliases).includes(item.str.trim()))timetableCodes.add(item.str.trim())}}
const missing=[...timetableCodes].filter(x=>!allocationSubjects.has(x));
console.log(JSON.stringify({allocationRows:allocationSubjects.size,timetableCodes:[...timetableCodes].sort(),matched:timetableCodes.size-missing.length,missing},null,2));
if(missing.length)process.exitCode=1;
