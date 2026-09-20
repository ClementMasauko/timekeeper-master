import {useMemo,useState} from 'react';
import {AlertTriangle,Bell,CalendarDays,CheckCircle2,FileText,ShieldCheck,UserRound} from 'lucide-react';
import {Capacitor} from '@capacitor/core';
import {LocalNotifications} from '@capacitor/local-notifications';
import {Share} from '@capacitor/share';
import {loadActiveTimetable,loadTimetables,saveActiveTimetable,saveTimetables} from './storage';
import type {ClassItem,Settings,Timetable} from './types';

const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const key=(value:string)=>value.toLowerCase().replace(/\b(mr|mrs|miss|ms)\b/g,'').replace(/[^a-z0-9]/g,'');
const overlaps=(a:ClassItem,b:ClassItem)=>a.day===b.day&&a.start<b.end&&b.start<a.end;
const minutes=(time:string)=>{const [h,m]=time.split(':').map(Number);return h*60+m};
type Issue={kind:'teacher'|'class'|'load';title:string;detail:string};
type Snapshot={id:string;createdAt:number;tables:Timetable[]};

function audit(classes:ClassItem[]):Issue[]{
 const issues:Issue[]=[];
 for(let i=0;i<classes.length;i++)for(let j=i+1;j<classes.length;j++){
  const a=classes[i],b=classes[j];if(!overlaps(a,b))continue;
  if(a.teacher&&b.teacher&&key(a.teacher)===key(b.teacher))issues.push({kind:'teacher',title:`Teacher conflict: ${a.teacher}`,detail:`${days[a.day]} ${a.start}–${a.end}: ${a.room} and ${b.room}`});
  if(a.room&&b.room&&key(a.room)===key(b.room))issues.push({kind:'class',title:`Class conflict: ${a.room}`,detail:`${days[a.day]} ${a.start}: ${a.subject} and ${b.subject}`});
 }
 const groups=new Map<string,ClassItem[]>();
 classes.filter(c=>c.teacher).forEach(c=>{const id=`${key(c.teacher)}:${c.day}`;groups.set(id,[...(groups.get(id)||[]),c])});
 for(const list of groups.values()){
  const ordered=[...list].sort((a,b)=>a.start.localeCompare(b.start));let run:ClassItem[]=[];
  for(const item of ordered){const previous=run.at(-1);if(!previous||minutes(item.start)-minutes(previous.end)<=15)run.push(item);else run=[item];if(run.length===3)issues.push({kind:'load',title:`Three consecutive periods: ${item.teacher}`,detail:`${days[item.day]} ${run[0].start}–${item.end} • ${run.map(x=>`${x.room} ${x.subject}`).join(', ')}`})}
 }
 return issues;
}

export default function ProfessionalTools({settings,save}:{settings:Settings;save:(next:Settings)=>void}){
 const tables=loadTimetables().filter(t=>!t.deletedAt),active=tables.find(t=>t.id===loadActiveTimetable())||tables[0];
 const allClasses=useMemo(()=>tables.flatMap(t=>t.classes),[JSON.stringify(tables)]),issues=audit(allClasses);
 const [classId,setClassId]=useState(active?.classes[0]?.id||''),[changeDate,setChangeDate]=useState(new Date().toISOString().slice(0,10)),[substitute,setSubstitute]=useState(''),[exceptionDate,setExceptionDate]=useState(''),[exceptionLabel,setExceptionLabel]=useState('School holiday'),[status,setStatus]=useState('');
 const selected=active?.classes.find(c=>c.id===classId),history=(()=>{try{return JSON.parse(localStorage.getItem('tk_history')||'[]') as Snapshot[]}catch{return[]}})();
 const updateClass=(mode:'cancel'|'substitute'|'clear')=>{if(!active||!selected)return;const updated=loadTimetables().map(t=>t.id!==active.id?t:{...t,classes:t.classes.map(c=>c.id!==selected.id?c:mode==='clear'?{...c,teacher:c.originalTeacher||c.teacher,originalTeacher:undefined,substituteUntil:undefined,cancelledUntil:undefined,changeNote:undefined}:mode==='cancel'?{...c,cancelledUntil:changeDate,changeNote:`Cancelled on ${changeDate}`}:{...c,originalTeacher:c.originalTeacher||c.teacher,teacher:substitute.trim()||c.teacher,substituteUntil:changeDate,changeNote:`Substitute on ${changeDate}`})});saveTimetables(updated);setStatus('Temporary schedule change saved. Reopen the schedule to see it.');};
 const addException=()=>{if(!exceptionDate)return;save({...settings,calendarExceptions:[...(settings.calendarExceptions||[]),{id:`exception-${Date.now()}`,date:exceptionDate,label:exceptionLabel.trim()||'No classes'}]});setExceptionDate('');setStatus('Calendar exception saved.');};
 const reliability=async()=>{if(!Capacitor.isNativePlatform()){setStatus('Browser preview is ready. Install the APK to verify Android notification permission and scheduled alerts.');return}const permission=await LocalNotifications.requestPermissions(),pending=await LocalNotifications.getPending();setStatus(permission.display==='granted'?`Notifications allowed • ${pending.notifications.length} reminder(s) currently scheduled • sound: ${settings.alertSound}.`:'Notifications are blocked. Enable them in Android App settings.');};
 const restore=(snapshot:Snapshot)=>{if(!confirm(`Restore all timetables from ${new Date(snapshot.createdAt).toLocaleString()}?`))return;saveTimetables(snapshot.tables);saveActiveTimetable(snapshot.tables.find(t=>!t.deletedAt)?.id||'');location.reload()};
 const teacherSchedule=active?.classes.filter(c=>!settings.teacherName||key(c.teacher)===key(settings.teacherName))||[];
 const exportSchedule=async()=>{if(!active||!teacherSchedule.length){setStatus('Select a teacher with matched classes first.');return}const title=[settings.schoolName,settings.teacherName||'Teacher schedule',active.name].filter(Boolean).join(' • '),text=[title,...[...teacherSchedule].sort((a,b)=>a.day-b.day||a.start.localeCompare(b.start)).map(c=>`${days[c.day]} ${c.start}–${c.end} | ${c.room} | ${c.subject}${c.teacher?` | ${c.teacher}`:''}`)].join('\n');if(Capacitor.isNativePlatform())await Share.share({title,text,dialogTitle:'Share teacher schedule'});else{const win=window.open('','_blank');if(win){win.document.write(`<title>${title}</title><style>body{font:16px system-ui;padding:32px}h1{color:#174f78}pre{white-space:pre-wrap;line-height:1.8}</style><h1>${title}</h1><pre>${text}</pre>`);win.document.close();win.print()}}};
 return <>
  <section className="settings proAudit"><h3><ShieldCheck/> Timetable quality check</h3><div className="auditSummary"><span className={issues.length?'warn':'ok'}>{issues.length?<AlertTriangle/>:<CheckCircle2/>}<b>{issues.length||'No'} issue{issues.length===1?'':'s'}</b></span><small>Checks teacher clashes, class clashes and the rule that a teacher must not have three consecutive periods.</small></div>{issues.length>0&&<details className="compactDetails"><summary><span><b>Review detected issues</b><small>{issues.length} action{issues.length===1?'':'s'} recommended</small></span></summary><div className="detailsList">{issues.map((issue,i)=><div className="auditIssue" key={`${issue.title}-${i}`}><AlertTriangle/><span><b>{issue.title}</b><small>{issue.detail}</small></span></div>)}</div></details>}</section>
  <section className="settings spaced"><h3><UserRound/> Substitution and cancellation</h3><p className="helper">Record a one-day teacher replacement or cancelled lesson without losing the normal allocation.</p>{active?<><label>Lesson<select value={classId} onChange={e=>setClassId(e.target.value)}>{active.classes.map(c=><option value={c.id} key={c.id}>{days[c.day]} {c.start} • {c.room} • {c.subject}</option>)}</select></label><label>Date<input type="date" value={changeDate} onChange={e=>setChangeDate(e.target.value)}/></label><label>Substitute teacher<input value={substitute} onChange={e=>setSubstitute(e.target.value)} placeholder="Teacher name"/></label><div className="toolButtons"><button disabled={!selected||!substitute.trim()} onClick={()=>updateClass('substitute')}>Set substitute</button><button disabled={!selected} onClick={()=>updateClass('cancel')}>Cancel lesson</button><button disabled={!selected?.changeNote} onClick={()=>updateClass('clear')}>Clear change</button></div></>:<p className="none">Import a timetable first.</p>}</section>
  <section className="settings spaced"><h3><CalendarDays/> School calendar exceptions</h3><p className="helper">Add holidays, examinations, assemblies or other dates when the normal timetable changes.</p><div className="exceptionForm"><input type="date" value={exceptionDate} onChange={e=>setExceptionDate(e.target.value)}/><input value={exceptionLabel} onChange={e=>setExceptionLabel(e.target.value)} placeholder="Reason"/><button disabled={!exceptionDate} onClick={addException}>Add</button></div>{(settings.calendarExceptions||[]).map(item=><div className="exceptionRow" key={item.id}><span><b>{new Date(`${item.date}T12:00:00`).toLocaleDateString()}</b><small>{item.label}</small></span><button onClick={()=>save({...settings,calendarExceptions:settings.calendarExceptions.filter(x=>x.id!==item.id)})}>Remove</button></div>)}</section>
  <section className="settings spaced"><h3><Bell/> Reminder reliability</h3><p className="helper">Checks Android permission, scheduled alerts and the selected sound source.</p><button className="wideTool" onClick={reliability}>Run reminder health check</button></section>
  <section className="settings spaced"><h3><FileText/> Accessibility</h3><label>Text size<select value={settings.fontScale||1} onChange={e=>save({...settings,fontScale:+e.target.value})}><option value="1">Standard</option><option value="1.12">Large</option><option value="1.25">Extra large</option></select></label><label className="switchRow"><span><b>High contrast</b><small>Stronger borders and clearer colours</small></span><input type="checkbox" checked={settings.highContrast||false} onChange={e=>save({...settings,highContrast:e.target.checked})}/></label><label className="switchRow"><span><b>Reduce motion</b><small>Minimise animations and transitions</small></span><input type="checkbox" checked={settings.reduceMotion||false} onChange={e=>save({...settings,reduceMotion:e.target.checked})}/></label></section>
  <section className="settings spaced"><h3><FileText/> Version history</h3><p className="helper">The last ten timetable changes are saved automatically on this device.</p>{history.slice(0,5).map(snapshot=><div className="exceptionRow" key={snapshot.id}><span><b>{new Date(snapshot.createdAt).toLocaleString()}</b><small>{snapshot.tables.filter(t=>!t.deletedAt).length} timetable(s)</small></span><button onClick={()=>restore(snapshot)}>Restore</button></div>)}{!history.length&&<p className="none">History will appear after your next timetable change.</p>}</section>
  <section className="settings spaced"><h3><FileText/> Teacher schedule document</h3><p className="helper">Create a printable or shareable schedule with school, class, subject, day and time.</p><button className="wideTool" onClick={exportSchedule}>Print or share teacher schedule</button></section>
  {status&&<p className="toolStatus proStatus">{status}</p>}
 </>;
}
