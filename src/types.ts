export type ReminderMode='sound'|'vibrate'|'both'|'silent';
export interface ClassItem {id:string;subject:string;room:string;teacher:string;day:number;start:string;end:string;color:string;enabled:boolean;originalTeacher?:string;substituteUntil?:string;cancelledUntil?:string;changeNote?:string}
export interface CalendarException {id:string;date:string;label:string}
export interface Settings {leadMinutes:number;mode:ReminderMode;weekends:boolean;theme:'system'|'dark'|'light';displayName:string;teacherName:string;classGroup:string;scheduleFilter:'mine'|'all';onboardingDone:boolean;schoolName:string;schoolLogo:string;alertSound:'timekeeper'|'device';fontScale:number;highContrast:boolean;reduceMotion:boolean;calendarExceptions:CalendarException[]}
export interface StoredFile {name:string;data:string;addedAt:number}
export interface Allocation {id:string;subject:string;teacher:string;aliases?:string[];classGroup?:string}
export interface Timetable {id:string;name:string;classes:ClassItem[];file:StoredFile|null;createdAt:number;allocations:Allocation[];teacherName:string;classGroup:string;scheduleFilter:'mine'|'all';remindersEnabled:boolean;term?:string;archived?:boolean;deletedAt?:number}
