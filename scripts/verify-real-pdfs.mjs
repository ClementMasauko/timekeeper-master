import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const normalize=v=>v.toLowerCase().replace(/[^a-z0-9]/g,' ').replace(/\s+/g,' ').trim();
const aliases={agriculture:['agri'], 'b knowledge':['b k','bk'],biology:['bio'],chemistry:['chem'],'chichewa lang':['chila','chichlan'],'chichewa lit':['chilt','chichlit'],'english lang':['engla','englang'],'english lit':['englt','englit'],geography:['geog'],history:['hist'],'life skills':['l sks'],mathematics:['mat','maths'],physics:['phys'],'social studies':['social']};
const read=async path=>{const doc=await pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(path))}).promise,tokens=[];for(let p=1;p<=doc.numPages;p++){const page=await doc.getPage(p),content=await page.getTextContent();for(const item of content.items)if('str'in item&&item.str.trim())tokens.push({text:item.str.trim(),x:Math.round(item.transform[4]),y:Math.round(item.transform[5])})}return tokens};
const allocationRows=tokens=>{const rows=new Map;for(const t of tokens){const y=[...rows.keys()].find(v=>Math.abs(v-t.y)<=2)??t.y;rows.set(y,[...(rows.get(y)||[]),t])}const out=[];for(const row of rows.values()){const ordered=row.sort((a,b)=>a.x-b.x),teachers=ordered.filter(t=>/^(mr|mrs|miss|ms)\.?\s/i.test(t.text)),subject=teachers.length&&ordered.find(t=>t.x<teachers[0].x)?.text;if(subject)teachers.forEach((t,i)=>out.push({subject,teacher:t.text,form:`Form ${i+1}`}))}return out};
const matches=(subject,full)=>{const a=normalize(subject),all=[normalize(full),...(aliases[normalize(full)]||[])];return all.some(b=>a===b||a.replaceAll(' ','')===b.replaceAll(' ','')||a.startsWith(b)||b.startsWith(a))};
const scheduleRows=tokens=>tokens.filter(t=>/^(Form) [1-4]$/i.test(t.text)).flatMap(form=>tokens.filter(t=>Math.abs(t.y-form.y)<4&&t.x>form.x+20).map(subject=>({form:form.text,subject:subject.text})));
const allocation=allocationRows(await read(process.argv[4]));
for(const path of process.argv.slice(2,4)){const rows=scheduleRows(await read(path)),matched=rows.filter(r=>allocation.some(a=>a.form===r.form&&matches(r.subject,a.subject)));console.log(`${path}: ${matched.length}/${rows.length} periods matched; ${new Set(matched.map(x=>x.form)).size} forms`)}
console.log(`Allocation: ${allocation.length} subject/form entries; ${new Set(allocation.map(x=>x.teacher)).size} teachers`);
