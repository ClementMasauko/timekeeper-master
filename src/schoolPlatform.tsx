import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  BookOpen,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  GraduationCap,
  School,
  ShieldCheck,
  Upload,
  UserRound,
  Users,
} from "lucide-react";
import JSZip from "jszip";
import * as pdfjs from "pdfjs-dist";
import { getCloudConfig, getCloudSession } from "./cloudSync";
import {
  loadAllocations,
  loadTimetables,
  saveActiveTimetable,
  saveAllocations,
  saveTimetables,
} from "./storage";

type Role = "pending" | "teacher" | "student" | "admin";
type Profile = {
  id: string;
  role: Role;
  display_name: string;
  school_id?: string;
  teacher_name?: string;
  student_number?: string;
  class_group?: string;
};
type Assignment = {
  id: number;
  teacher_id: string;
  subject: string;
  class_group: string;
  school_id: string;
};
type Student = {
  id: string;
  user_id?: string;
  student_number: string;
  display_name: string;
  class_group: string;
};
type Assessment = {
  id: number;
  title: string;
  subject: string;
  class_group: string;
  out_of: number;
  opens_at: string;
  closes_at: string;
  reopened_until?: string;
  published: boolean;
};
type Result = {
  id: number;
  assessment_id: number;
  student_id: string;
  teacher_id: string;
  score: number;
  submitted_at?: string;
};
type Publication = {
  id: number;
  kind: string;
  title: string;
  academic_year: number;
  term: string;
  status: string;
  version: number;
  content: {
    timetables?: ReturnType<typeof loadTimetables>;
    allocations?: ReturnType<typeof loadAllocations>;
  };
  updated_at: string;
};
type Notice = {
  id: number;
  title: string;
  message: string;
  audience: string;
  created_at: string;
};
type Exam = {
  id: number;
  subject: string;
  class_group: string;
  exam_date: string;
  start_time: string;
  end_time: string;
  room: string;
  published: boolean;
};
type Duty = {
  id: number;
  exam_id: number;
  teacher_id: string;
  status: string;
  replacement_teacher_id?: string;
};
type WindowRequest = {
  id: number;
  teacher_id: string;
  subject: string;
  class_group: string;
  reason: string;
  status: string;
};
const currentYear = new Date().getFullYear();

export default function SchoolPlatform() {
  const session = getCloudSession(),
    config = getCloudConfig(),
    fileInput = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<Profile | null>(null),
    [profiles, setProfiles] = useState<Profile[]>([]),
    [school, setSchool] = useState<{
      id: string;
      name: string;
      join_code: string;
    } | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]),
    [students, setStudents] = useState<Student[]>([]),
    [assessments, setAssessments] = useState<Assessment[]>([]),
    [results, setResults] = useState<Result[]>([]),
    [publications, setPublications] = useState<Publication[]>([]),
    [notices, setNotices] = useState<Notice[]>(() => {
      try {
        return JSON.parse(localStorage.getItem("tk_school_notices") || "[]");
      } catch {
        return [];
      }
    }),
    [exams, setExams] = useState<Exam[]>([]),
    [duties, setDuties] = useState<Duty[]>([]),
    [requests, setRequests] = useState<WindowRequest[]>([]);
  const [status, setStatus] = useState(""),
    [loading, setLoading] = useState(Boolean(session));
  const headers = (prefer = "return=representation") => ({
    apikey: config.key,
    Authorization: `Bearer ${session?.access_token || config.key}`,
    "Content-Type": "application/json",
    Prefer: prefer,
  });
  const api = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${config.url}/rest/v1/${path}`, {
        ...options,
        headers: { ...headers(), ...(options.headers || {}) },
      }),
      text = await response.text();
    if (!response.ok) throw new Error(text || "School request failed");
    return text ? JSON.parse(text) : [];
  };
  const rpc = async (name: string, body: unknown) =>
    api(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
  const refresh = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const mine =
        (
          await api(`timekeeper_profiles?id=eq.${session.user.id}&select=*`)
        )[0] || null;
      setProfile(mine);
      if (!mine?.school_id) return;
      const [schools, pubs, ns, as, rs, es, ds, wr] = await Promise.all([
        api(`timekeeper_schools?id=eq.${mine.school_id}&select=*`),
        api("timekeeper_publications?select=*&order=updated_at.desc"),
        api("timekeeper_notifications?select=*&order=created_at.desc&limit=30"),
        api("timekeeper_assessments?select=*&order=created_at.desc"),
        api("timekeeper_results?select=*&order=updated_at.desc"),
        api("timekeeper_exams?select=*&order=exam_date,start_time"),
        api("timekeeper_invigilation?select=*"),
        api("timekeeper_window_requests?select=*&order=created_at.desc"),
      ]);
      setSchool(schools[0] || null);
      setPublications(pubs);
      setNotices(ns);
      localStorage.setItem("tk_school_notices", JSON.stringify(ns));
      setAssessments(as);
      setResults(rs);
      setExams(es);
      setDuties(ds);
      setRequests(wr);
      if (mine.role === "admin") {
        const [ps, xs, ss] = await Promise.all([
          api("timekeeper_profiles?select=*&order=created_at.desc"),
          api("timekeeper_teacher_subjects?select=*"),
          api("timekeeper_students?select=*&order=class_group,display_name"),
        ]);
        setProfiles(ps);
        setAssignments(xs);
        setStudents(ss);
      } else if (mine.role === "teacher") {
        const [xs, ss] = await Promise.all([
          api("timekeeper_teacher_subjects?select=*"),
          api("timekeeper_students?select=*&order=class_group,display_name"),
        ]);
        setAssignments(xs);
        setStudents(ss);
      }
    } catch (e) {
      setStatus(
        e instanceof Error
          ? e.message
          : "Could not load school data. Run academic-v2.sql in Supabase.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, [session?.user.id]);
  if (!session)
    return (
      <section className="settings academicLimited">
        <h3>
          <ShieldCheck /> School access
        </h3>
        <p className="helper">
          Sign in under Cloud sync. School membership, published schedules and
          grades are protected by your account.
        </p>
      </section>
    );
  if (loading)
    return (
      <section className="settings">
        <p className="helper">Loading school workspace…</p>
      </section>
    );
  if (!profile?.school_id)
    return (
      <SchoolSetup
        api={rpc}
        done={refresh}
        status={status}
        setStatus={setStatus}
      />
    );
  if (profile.role === "pending")
    return (
      <section className="settings academicLimited">
        <h3>
          <Clock3 /> Approval pending
        </h3>
        <p className="helper">
          Your school administrator must approve the requested role. Published
          private information remains locked until approval.
        </p>
      </section>
    );
  const downloadLatest = () => {
    const publication = publications.find(
      (p) => p.kind === "timetable" && p.status === "published",
    );
    if (!publication?.content.timetables?.length) {
      setStatus("No published timetable is available.");
      return;
    }
    saveTimetables(publication.content.timetables);
    saveAllocations(publication.content.allocations || []);
    saveActiveTimetable(
      publication.content.timetables.find((t) => !t.deletedAt)?.id || "",
    );
    localStorage.setItem("tk_school_publication", String(publication.id));
    location.reload();
  };
  return (
    <div className="schoolPlatform">
      <SchoolHeader school={school} profile={profile} />
      <Notices notices={notices} />
      {publications.some(
        (p) =>
          p.status === "published" &&
          String(p.id) !== localStorage.getItem("tk_school_publication"),
      ) && (
        <section className="settings publishAvailable">
          <h3>
            <Download /> School update available
          </h3>
          <p className="helper">
            Download the administrator’s latest timetable and allocations. They
            remain available offline afterward.
          </p>
          <button className="wideTool" onClick={downloadLatest}>
            Download and use latest publication
          </button>
        </section>
      )}
      {profile.role === "admin" ? (
        <AdminWorkspace
          {...{
            profile,
            profiles,
            school,
            assignments,
            students,
            assessments,
            results,
            publications,
            exams,
            duties,
            requests,
            fileInput,
            api,
            refresh,
            status,
            setStatus,
          }}
        />
      ) : profile.role === "teacher" ? (
        <TeacherWorkspace
          {...{
            profile,
            assignments,
            students,
            assessments,
            results,
            exams,
            duties,
            requests,
            api,
            refresh,
            status,
            setStatus,
          }}
        />
      ) : (
        <StudentWorkspace
          {...{ profile, students, assessments, results, exams }}
        />
      )}
    </div>
  );
}

function SchoolSetup({
  api,
  done,
  status,
  setStatus,
}: {
  api: (n: string, b: unknown) => Promise<unknown>;
  done: () => Promise<void>;
  status: string;
  setStatus: (s: string) => void;
}) {
  const [mode, setMode] = useState<"create" | "join">("join"),
    [name, setName] = useState(""),
    [code, setCode] = useState(""),
    [role, setRole] = useState<"teacher" | "student">("teacher"),
    [number, setNumber] = useState(""),
    [group, setGroup] = useState("");
  const submit = async () => {
    try {
      if (mode === "create")
        await api("timekeeper_create_school", { p_name: name });
      else
        await api("timekeeper_join_school", {
          p_code: code,
          p_name: name,
          p_role: role,
          p_student_number: number || null,
          p_class_group: group || null,
        });
      setStatus(
        mode === "create"
          ? "School created. You are its administrator."
          : "Request sent to the school administrator.",
      );
      window.dispatchEvent(new Event("timekeeper-auth"));
      await done();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Setup failed.");
    }
  };
  return (
    <section className="settings schoolSetup">
      <h3>
        <School /> Join or create a school
      </h3>
      <div className="viewToggle">
        <button
          className={mode === "join" ? "active" : ""}
          onClick={() => setMode("join")}
        >
          Join school
        </button>
        <button
          className={mode === "create" ? "active" : ""}
          onClick={() => setMode("create")}
        >
          Create school
        </button>
      </div>
      <label>
        {mode === "create" ? "School name" : "Your full name"}
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      {mode === "join" && (
        <>
          <label>
            School code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </label>
          <label>
            Role
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "teacher" | "student")}
            >
              <option value="teacher">Teacher</option>
              <option value="student">Student</option>
            </select>
          </label>
          {role === "student" && (
            <div className="suiteGrid">
              <input
                placeholder="Student number"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
              />
              <input
                placeholder="Class/Form"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
              />
            </div>
          )}
        </>
      )}
      <button
        className="wideTool"
        disabled={!name || (mode === "join" && !code)}
        onClick={submit}
      >
        {mode === "create"
          ? "Create school and become admin"
          : "Request membership"}
      </button>
      {status && <p className="toolStatus">{status}</p>}
    </section>
  );
}

function SchoolHeader({
  school,
  profile,
}: {
  school: { name: string; join_code: string } | null;
  profile: Profile;
}) {
  return (
    <section className="settings schoolIdentity">
      <h3>
        <School /> {school?.name || "School"}
      </h3>
      <div className="allocationSummary">
        <span>
          <b>{profile.role}</b>
          <small>account role</small>
        </span>
        {profile.role === "admin" && (
          <span>
            <b>{school?.join_code}</b>
            <small>join code</small>
          </span>
        )}
      </div>
    </section>
  );
}
function Notices({ notices }: { notices: Notice[] }) {
  return notices.length ? (
    <section className="settings notices">
      <h3>
        <Bell /> Notices
      </h3>
      {notices.slice(0, 5).map((n) => (
        <div className="suiteRow" key={n.id}>
          <b>{n.title}</b>
          <small>{n.message}</small>
        </div>
      ))}
    </section>
  ) : null;
}

type AdminProps = {
  profile: Profile;
  profiles: Profile[];
  school: { id: string; name: string; join_code: string } | null;
  assignments: Assignment[];
  students: Student[];
  assessments: Assessment[];
  results: Result[];
  publications: Publication[];
  exams: Exam[];
  duties: Duty[];
  requests: WindowRequest[];
  fileInput: React.RefObject<HTMLInputElement | null>;
  api: (p: string, o?: RequestInit) => Promise<any>;
  refresh: () => Promise<void>;
  status: string;
  setStatus: (s: string) => void;
};
function AdminWorkspace(p: AdminProps) {
  const [teacher, setTeacher] = useState(""),
    [subject, setSubject] = useState(""),
    [group, setGroup] = useState(""),
    [term, setTerm] = useState("Term 1"),
    [year, setYear] = useState(String(currentYear));
  const [title, setTitle] = useState(""),
    [outOf, setOutOf] = useState("100"),
    [opens, setOpens] = useState(""),
    [closes, setCloses] = useState("");
  const [noticeTitle, setNoticeTitle] = useState(""),
    [notice, setNotice] = useState(""),
    [audience, setAudience] = useState("all");
  const [exam, setExam] = useState({
      subject: "",
      class_group: "",
      exam_date: "",
      start_time: "08:00",
      end_time: "10:00",
      room: "",
    }),
    [examTeacher, setExamTeacher] = useState(""),
    [examId, setExamId] = useState("");
  const pending = p.profiles.filter((x) => x.role === "pending"),
    teachers = p.profiles.filter((x) => x.role === "teacher");
  const approve = async (x: Profile, role: "teacher" | "student") => {
    await p.api(`timekeeper_profiles?id=eq.${x.id}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
    await p.refresh();
  };
  const publish = async () => {
    const timetables = loadTimetables(),
      allocations = loadAllocations();
    if (!timetables.length) {
      p.setStatus("Import a timetable before publishing.");
      return;
    }
    await p.api("timekeeper_publications", {
      method: "POST",
      body: JSON.stringify({
        school_id: p.profile.school_id,
        kind: "timetable",
        title: `${term} ${year} timetable`,
        academic_year: +year,
        term,
        status: "published",
        version:
          Math.max(
            0,
            ...p.publications.map((publication) => publication.version || 0),
          ) + 1,
        content: { timetables, allocations },
        created_by: p.profile.id,
        published_at: new Date().toISOString(),
      }),
    });
    await sendNotice(
      "Timetable published",
      `${term} ${year} timetable is ready.`,
      "all",
    );
    p.setStatus("Published to every approved school member.");
    await p.refresh();
  };
  const allocate = async () => {
    await p.api("timekeeper_teacher_subjects", {
      method: "POST",
      body: JSON.stringify({
        school_id: p.profile.school_id,
        teacher_id: teacher,
        subject,
        class_group: group,
      }),
    });
    await p.refresh();
  };
  const createAssessment = async () => {
    await p.api("timekeeper_assessments", {
      method: "POST",
      body: JSON.stringify({
        school_id: p.profile.school_id,
        title,
        subject,
        class_group: group,
        out_of: +outOf,
        opens_at: new Date(opens).toISOString(),
        closes_at: new Date(closes).toISOString(),
        created_by: p.profile.id,
      }),
    });
    await p.refresh();
  };
  const decideRequest = async (request: WindowRequest, approve: boolean) => {
    if (approve) {
      const assessment = p.assessments.find(
        (a) =>
          a.subject.toLowerCase() === request.subject.toLowerCase() &&
          a.class_group.toLowerCase() === request.class_group.toLowerCase(),
      );
      if (assessment)
        await p.api("rpc/timekeeper_reopen_assessment", {
          method: "POST",
          body: JSON.stringify({ p_assessment_id: assessment.id, p_hours: 24 }),
        });
    }
    await p.api(`timekeeper_window_requests?id=eq.${request.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: approve ? "approved" : "rejected" }),
    });
    await p.refresh();
  };
  const sendNotice = async (t = noticeTitle, m = notice, a = audience) => {
    await p.api("timekeeper_notifications", {
      method: "POST",
      body: JSON.stringify({
        school_id: p.profile.school_id,
        title: t,
        message: m,
        audience: a,
        created_by: p.profile.id,
      }),
    });
    setNotice("");
    await p.refresh();
  };
  const importStudents = async (file?: File) => {
    if (!file) return;
    try {
      const rows = await readRoster(file),
        records = rows
          .map((r) => ({
            school_id: p.profile.school_id,
            student_number: r[0]?.trim(),
            display_name: r[1]?.trim(),
            class_group: r[2]?.trim(),
            user_id:
              p.profiles.find(
                (profile) =>
                  profile.student_number?.toLowerCase() ===
                  r[0]?.trim().toLowerCase(),
              )?.id || null,
          }))
          .filter((r) => r.student_number && r.display_name && r.class_group);
      await p.api("timekeeper_students?on_conflict=school_id,student_number", {
        method: "POST",
        headers: {
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(records),
      });
      p.setStatus(`${records.length} students imported.`);
      await p.refresh();
    } catch {
      p.setStatus(
        "Could not read the student file. Use columns: student number, name, class.",
      );
    }
  };
  const createExam = async () => {
    await p.api("timekeeper_exams", {
      method: "POST",
      body: JSON.stringify({
        ...exam,
        school_id: p.profile.school_id,
        created_by: p.profile.id,
        published: true,
      }),
    });
    await p.refresh();
  };
  const assignDuty = async () => {
    await p.api("timekeeper_invigilation", {
      method: "POST",
      body: JSON.stringify({ exam_id: +examId, teacher_id: examTeacher }),
    });
    await sendNotice(
      "Invigilation duty assigned",
      "Open TimeKeeper to view your examination duty.",
      "teachers",
    );
    await p.refresh();
  };
  return (
    <div className="adminWorkspace">
      <section className="settings adminDashboard">
        <h3>
          <ShieldCheck /> Administrator dashboard
        </h3>
        <div className="allocationSummary">
          <span>
            <b>{pending.length}</b>
            <small>pending</small>
          </span>
          <span>
            <b>{teachers.length}</b>
            <small>teachers</small>
          </span>
          <span>
            <b>{p.students.length}</b>
            <small>students</small>
          </span>
          <span>
            <b>
              {p.publications.filter((x) => x.status === "published").length}
            </b>
            <small>published</small>
          </span>
        </div>
        {pending.map((x) => (
          <div className="approvalRow" key={x.id}>
            <span>
              <b>{x.display_name}</b>
              <small>{x.teacher_name ? "Teacher" : "Student"} request</small>
            </span>
            <div>
              <button
                onClick={() =>
                  approve(x, x.teacher_name ? "teacher" : "student")
                }
              >
                Approve
              </button>
            </div>
          </div>
        ))}
      </section>
      <section className="settings spaced">
        <h3>
          <Upload /> Publish school timetable
        </h3>
        <div className="suiteGrid">
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Term"
          />
        </div>
        <button className="wideTool" onClick={publish}>
          Publish current timetables and allocations
        </button>
        <p className="helper">
          Members download the publication once and continue using it offline.
          Older publications provide rollback history.
        </p>
        {p.publications
          .filter((publication) => publication.kind === "timetable")
          .slice(0, 8)
          .map((publication) => (
            <div className="suiteRow" key={publication.id}>
              <b>{publication.title}</b>
              <small>
                Version {publication.version} • {publication.status}
              </small>
              <button
                onClick={() => {
                  if (!publication.content.timetables?.length) return;
                  saveTimetables(publication.content.timetables);
                  saveAllocations(publication.content.allocations || []);
                  saveActiveTimetable(
                    publication.content.timetables[0]?.id || "",
                  );
                  p.setStatus(
                    "Older publication restored locally. Review it, then publish a new version.",
                  );
                  location.reload();
                }}
              >
                Restore for rollback
              </button>
            </div>
          ))}
      </section>
      <section className="settings spaced">
        <h3>
          <Users /> Student roster
        </h3>
        <button
          className="wideTool"
          onClick={() => p.fileInput.current?.click()}
        >
          <Upload /> Import CSV, Excel or PDF
        </button>
        <input
          hidden
          ref={p.fileInput}
          type="file"
          accept=".csv,.txt,.xlsx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            void importStudents(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <p className="helper">
          Columns: student number, full name, class/form. Duplicate student
          numbers are updated safely.
        </p>
      </section>
      <section className="settings spaced">
        <h3>
          <BookOpen /> Teacher allocations
        </h3>
        <div className="suiteGrid">
          <select value={teacher} onChange={(e) => setTeacher(e.target.value)}>
            <option value="">Teacher</option>
            {teachers.map((x) => (
              <option value={x.id} key={x.id}>
                {x.display_name}
              </option>
            ))}
          </select>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
          />
          <input
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            placeholder="Class/Form"
          />
        </div>
        <button
          className="wideTool"
          disabled={!teacher || !subject || !group}
          onClick={allocate}
        >
          Assign subject
        </button>
      </section>
      <section className="settings spaced">
        <h3>
          <GraduationCap /> Assessments and marking window
        </h3>
        <div className="suiteGrid">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Assessment title"
          />
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
          />
          <input
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            placeholder="Class/Form"
          />
          <input
            type="number"
            value={outOf}
            onChange={(e) => setOutOf(e.target.value)}
            placeholder="Out of"
          />
          <input
            type="datetime-local"
            value={opens}
            onChange={(e) => setOpens(e.target.value)}
          />
          <input
            type="datetime-local"
            value={closes}
            onChange={(e) => setCloses(e.target.value)}
          />
        </div>
        <button
          className="wideTool"
          disabled={!title || !subject || !group || !opens || !closes}
          onClick={createAssessment}
        >
          Create assessment window
        </button>
        {p.requests
          .filter((request) => request.status === "pending")
          .map((request) => (
            <div className="approvalRow" key={request.id}>
              <span>
                <b>
                  {request.subject} • {request.class_group}
                </b>
                <small>{request.reason}</small>
              </span>
              <div>
                <button onClick={() => decideRequest(request, true)}>
                  Reopen 24h
                </button>
                <button onClick={() => decideRequest(request, false)}>
                  Reject
                </button>
              </div>
            </div>
          ))}
        {p.assessments.map((a) => (
          <div className="suiteRow" key={a.id}>
            <b>
              {a.title} • {a.subject} • {a.class_group}
            </b>
            <small>
              {new Date(a.opens_at).toLocaleString()} –{" "}
              {new Date(a.closes_at).toLocaleString()}
            </small>
            <div className="toolButtons">
              <button
                onClick={async () => {
                  await p.api("rpc/timekeeper_reopen_assessment", {
                    method: "POST",
                    body: JSON.stringify({
                      p_assessment_id: a.id,
                      p_hours: 24,
                    }),
                  });
                  await p.refresh();
                }}
              >
                Reopen 24h
              </button>
              <button
                onClick={async () => {
                  await p.api(`timekeeper_assessments?id=eq.${a.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ published: !a.published }),
                  });
                  await sendNotice(
                    "Results updated",
                    `${a.title} results are ${a.published ? "hidden" : "now available"}.`,
                    "students",
                  );
                  await p.refresh();
                }}
              >
                {a.published ? "Unpublish" : "Publish results"}
              </button>
            </div>
          </div>
        ))}
      </section>
      <section className="settings spaced">
        <h3>
          <FileText /> Results and reports
        </h3>
        <p className="helper">
          Administrators can review and publish results, but database rules
          prevent mark editing.
        </p>
        <ReportTable
          assessments={p.assessments}
          students={p.students}
          results={p.results}
        />
      </section>
      <section className="settings spaced">
        <h3>
          <Bell /> Send notification
        </h3>
        <input
          value={noticeTitle}
          onChange={(e) => setNoticeTitle(e.target.value)}
          placeholder="Title"
        />
        <textarea
          value={notice}
          onChange={(e) => setNotice(e.target.value)}
          placeholder="Message"
        />
        <select value={audience} onChange={(e) => setAudience(e.target.value)}>
          <option value="all">Everyone</option>
          <option value="teachers">Teachers</option>
          <option value="students">Students</option>
        </select>
        <button
          className="wideTool"
          disabled={!noticeTitle || !notice}
          onClick={() => sendNotice()}
        >
          Send notice
        </button>
      </section>
      <section className="settings spaced">
        <h3>
          <Clock3 /> Examinations and invigilation
        </h3>
        <div className="suiteGrid">
          <input
            value={exam.subject}
            onChange={(e) => setExam({ ...exam, subject: e.target.value })}
            placeholder="Subject"
          />
          <input
            value={exam.class_group}
            onChange={(e) => setExam({ ...exam, class_group: e.target.value })}
            placeholder="Class/Form"
          />
          <input
            type="date"
            value={exam.exam_date}
            onChange={(e) => setExam({ ...exam, exam_date: e.target.value })}
          />
          <input
            type="time"
            value={exam.start_time}
            onChange={(e) => setExam({ ...exam, start_time: e.target.value })}
          />
          <input
            type="time"
            value={exam.end_time}
            onChange={(e) => setExam({ ...exam, end_time: e.target.value })}
          />
          <input
            value={exam.room}
            onChange={(e) => setExam({ ...exam, room: e.target.value })}
            placeholder="Room"
          />
        </div>
        <button
          className="wideTool"
          disabled={!exam.subject || !exam.class_group || !exam.exam_date}
          onClick={createExam}
        >
          Publish examination
        </button>
        <div className="suiteGrid">
          <select value={examId} onChange={(e) => setExamId(e.target.value)}>
            <option value="">Examination</option>
            {p.exams.map((x) => (
              <option value={x.id} key={x.id}>
                {x.exam_date} • {x.subject} • {x.class_group}
              </option>
            ))}
          </select>
          <select
            value={examTeacher}
            onChange={(e) => setExamTeacher(e.target.value)}
          >
            <option value="">Invigilator</option>
            {teachers.map((x) => (
              <option value={x.id} key={x.id}>
                {x.display_name}
              </option>
            ))}
          </select>
        </div>
        <button
          className="wideTool"
          disabled={!examId || !examTeacher}
          onClick={assignDuty}
        >
          Assign invigilator
        </button>
        {p.duties
          .filter((duty) => duty.status === "replacement_requested")
          .map((duty) => {
            const dutyExam = p.exams.find((item) => item.id === duty.exam_id);
            const dutyTeacher = teachers.find(
              (item) => item.id === duty.teacher_id,
            );
            return (
              <div className="approvalRow" key={duty.id}>
                <span>
                  <b>
                    {dutyTeacher?.display_name || "Teacher"} needs a replacement
                  </b>
                  <small>
                    {dutyExam?.subject} • {dutyExam?.class_group} •{" "}
                    {dutyExam?.exam_date}
                  </small>
                </span>
              </div>
            );
          })}
      </section>
      {p.status && <p className="toolStatus">{p.status}</p>}
    </div>
  );
}

function TeacherWorkspace({
  profile,
  assignments,
  students,
  assessments,
  results,
  exams,
  duties,
  requests,
  api,
  refresh,
  status,
  setStatus,
}: {
  profile: Profile;
  assignments: Assignment[];
  students: Student[];
  assessments: Assessment[];
  results: Result[];
  exams: Exam[];
  duties: Duty[];
  requests: WindowRequest[];
  api: (p: string, o?: RequestInit) => Promise<any>;
  refresh: () => Promise<void>;
  status: string;
  setStatus: (s: string) => void;
}) {
  const mine = assignments.filter((x) => x.teacher_id === profile.id),
    allowed = assessments.filter((a) =>
      mine.some(
        (x) =>
          x.subject.toLowerCase() === a.subject.toLowerCase() &&
          x.class_group.toLowerCase() === a.class_group.toLowerCase(),
      ),
    ),
    [assessmentId, setAssessmentId] = useState(""),
    [scores, setScores] = useState<Record<string, string>>({}),
    [reason, setReason] = useState("");
  const selected = allowed.find((a) => a.id === +assessmentId),
    locked =
      !selected ||
      Date.now() < new Date(selected.opens_at).getTime() ||
      Date.now() >
        new Date(selected.reopened_until || selected.closes_at).getTime() ||
      results.some(
        (r) =>
          r.assessment_id === selected.id &&
          r.teacher_id === profile.id &&
          r.submitted_at,
      );
  const classStudents = students.filter(
    (s) => s.class_group.toLowerCase() === selected?.class_group.toLowerCase(),
  );
  const save = async (student: Student) => {
    if (!selected) return;
    await api("timekeeper_results?on_conflict=assessment_id,student_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        school_id: profile.school_id,
        assessment_id: selected.id,
        student_id: student.id,
        teacher_id: profile.id,
        score: +scores[student.id],
      }),
    });
    setStatus(`Saved ${student.display_name}.`);
    await refresh();
  };
  const submit = async () => {
    if (
      !selected ||
      !confirm("Submit and lock all entered marks for this assessment?")
    )
      return;
    await api("rpc/timekeeper_submit_results", {
      method: "POST",
      body: JSON.stringify({ p_assessment_id: selected.id }),
    });
    setStatus(
      "Marks submitted and locked. Ask the administrator to reopen if a correction is required.",
    );
    await refresh();
  };
  const requestReopen = async () => {
    if (!selected || !reason.trim()) return;
    await api("timekeeper_window_requests", {
      method: "POST",
      body: JSON.stringify({
        school_id: profile.school_id,
        teacher_id: profile.id,
        subject: selected.subject,
        class_group: selected.class_group,
        reason: reason.trim(),
      }),
    });
    setReason("");
    setStatus("Reopening request sent to the administrator.");
    await refresh();
  };
  const myDuties = duties
    .filter((d) => d.teacher_id === profile.id)
    .map((d) => ({ ...d, exam: exams.find((e) => e.id === d.exam_id) }));
  return (
    <>
      <section className="settings">
        <h3>
          <GraduationCap /> My marks
        </h3>
        <select
          value={assessmentId}
          onChange={(e) => setAssessmentId(e.target.value)}
        >
          <option value="">Choose allocated assessment</option>
          {allowed.map((a) => (
            <option value={a.id} key={a.id}>
              {a.title} • {a.subject} • {a.class_group}
            </option>
          ))}
        </select>
        {selected && (
          <>
            <p className="helper">
              Window closes{" "}
              {new Date(
                selected.reopened_until || selected.closes_at,
              ).toLocaleString()}
              . Maximum: {selected.out_of}
            </p>
            {classStudents.map((s) => {
              const result = results.find(
                (r) => r.assessment_id === selected.id && r.student_id === s.id,
              );
              return (
                <div className="markEntry" key={s.id}>
                  <span>
                    <b>{s.display_name}</b>
                    <small>{s.student_number}</small>
                  </span>
                  <input
                    type="number"
                    min="0"
                    max={selected.out_of}
                    disabled={locked}
                    value={scores[s.id] ?? result?.score ?? ""}
                    onChange={(e) =>
                      setScores({ ...scores, [s.id]: e.target.value })
                    }
                  />
                  <button
                    disabled={locked || scores[s.id] === undefined}
                    onClick={() => save(s)}
                  >
                    Save
                  </button>
                </div>
              );
            })}
            <button
              className="wideTool"
              disabled={locked || !classStudents.length}
              onClick={submit}
            >
              {locked ? "Marks locked" : "Submit and lock marks"}
            </button>
            {locked && (
              <div className="reopenRequest">
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain why this assessment must be reopened"
                />
                <button
                  className="wideTool"
                  disabled={!reason.trim()}
                  onClick={requestReopen}
                >
                  Request reopening
                </button>
                {requests.some(
                  (r) =>
                    r.status === "pending" &&
                    r.subject === selected.subject &&
                    r.class_group === selected.class_group,
                ) && <p className="helper">A reopening request is pending.</p>}
              </div>
            )}
          </>
        )}
      </section>
      <section className="settings spaced">
        <h3>
          <Clock3 /> My invigilation
        </h3>
        {myDuties.map((d) => (
          <div className="suiteRow" key={d.id}>
            <b>
              {d.exam?.subject} • {d.exam?.class_group}
            </b>
            <small>
              {d.exam?.exam_date} {d.exam?.start_time}–{d.exam?.end_time} •{" "}
              {d.exam?.room}
            </small>
            <button
              disabled={d.status === "replacement_requested"}
              onClick={async () => {
                await api("rpc/timekeeper_request_invigilation_replacement", {
                  method: "POST",
                  body: JSON.stringify({ p_exam_id: d.exam_id }),
                });
                setStatus("Replacement request sent to the administrator.");
                await refresh();
              }}
            >
              {d.status === "replacement_requested"
                ? "Replacement requested"
                : "Request replacement"}
            </button>
          </div>
        ))}
        {!myDuties.length && (
          <p className="none">No invigilation duties assigned.</p>
        )}
      </section>
      {status && <p className="toolStatus">{status}</p>}
    </>
  );
}

function StudentWorkspace({
  profile,
  students,
  assessments,
  results,
  exams,
}: {
  profile: Profile;
  students: Student[];
  assessments: Assessment[];
  results: Result[];
  exams: Exam[];
}) {
  const roster =
      students.find((s) => s.user_id === profile.id) ||
      students.find((s) => s.student_number === profile.student_number),
    mine = results.filter(
      (r) =>
        r.student_id === roster?.id &&
        assessments.find((a) => a.id === r.assessment_id)?.published,
    ),
    myExams = exams.filter(
      (e) =>
        e.class_group.toLowerCase() ===
        (profile.class_group || roster?.class_group || "").toLowerCase(),
    );
  return (
    <>
      <section className="settings">
        <h3>
          <GraduationCap /> My published grades
        </h3>
        <ReportTable
          assessments={assessments}
          students={students}
          results={mine}
        />
      </section>
      <section className="settings spaced">
        <h3>
          <Clock3 /> My examinations
        </h3>
        {myExams.map((e) => (
          <div className="suiteRow" key={e.id}>
            <b>{e.subject}</b>
            <small>
              {e.exam_date} • {e.start_time}–{e.end_time} • {e.room}
            </small>
          </div>
        ))}
        {!myExams.length && (
          <p className="none">No published examinations for your class.</p>
        )}
      </section>
    </>
  );
}

function ReportTable({
  assessments,
  students,
  results,
}: {
  assessments: Assessment[];
  students: Student[];
  results: Result[];
}) {
  const rows = results.map((r) => {
    const a = assessments.find((x) => x.id === r.assessment_id),
      s = students.find((x) => x.id === r.student_id),
      percent = a ? Math.round((r.score / a.out_of) * 100) : 0,
      grade =
        percent >= 80
          ? "A"
          : percent >= 70
            ? "B"
            : percent >= 60
              ? "C"
              : percent >= 50
                ? "D"
                : "F";
    return { r, a, s, percent, grade };
  });
  const csv = () => {
    const content = [
        "Student,Number,Class,Assessment,Subject,Score,Out Of,Percent,Grade",
        ...rows.map((x) =>
          [
            x.s?.display_name,
            x.s?.student_number,
            x.s?.class_group,
            x.a?.title,
            x.a?.subject,
            x.r.score,
            x.a?.out_of,
            x.percent,
            x.grade,
          ]
            .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
            .join(","),
        ),
      ].join("\n"),
      url = URL.createObjectURL(new Blob([content], { type: "text/csv" })),
      a = document.createElement("a");
    a.href = url;
    a.download = "TimeKeeper-results.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      {rows.map((x) => (
        <div className="gradeRow" key={x.r.id}>
          <span>
            <b>
              {x.s?.display_name || "Student"} • {x.a?.subject}
            </b>
            <small>
              {x.a?.title} • {x.s?.class_group} • Grade {x.grade}
            </small>
          </span>
          <strong>
            {x.r.score}/{x.a?.out_of} ({x.percent}%)
          </strong>
        </div>
      ))}
      {!rows.length && <p className="none">No published results available.</p>}
      {rows.length > 0 && (
        <div className="toolButtons reportActions">
          <button onClick={csv}>
            <Download /> CSV report
          </button>
          <button onClick={() => window.print()}>
            <FileText /> Print / PDF
          </button>
        </div>
      )}
    </>
  );
}

async function readRoster(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer()),
      sharedXml = (await zip.file("xl/sharedStrings.xml")?.async("text")) || "",
      shared = [...sharedXml.matchAll(/<t[^>]*>(.*?)<\/t>/g)].map((m) =>
        decodeXml(m[1]),
      ),
      sheet = (await zip.file("xl/worksheets/sheet1.xml")?.async("text")) || "";
    return [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)]
      .map((row) =>
        [
          ...row[1].matchAll(
            /<c[^>]*(?:t="([^"]+)")?[^>]*>[\s\S]*?<v>(.*?)<\/v>[\s\S]*?<\/c>/g,
          ),
        ].map((c) => (c[1] === "s" ? shared[+c[2]] : decodeXml(c[2]))),
      )
      .filter((r) => r.length >= 3);
  }
  if (name.endsWith(".pdf")) {
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() })
        .promise,
      rows: string[][] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent(),
        lines = new Map<number, { x: number; text: string }[]>();
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const y = Math.round(item.transform[5] / 3) * 3,
          line = lines.get(y) || [];
        line.push({ x: item.transform[4], text: item.str.trim() });
        lines.set(y, line);
      }
      for (const line of [...lines.values()]) {
        const cells = line.sort((a, b) => a.x - b.x).map((item) => item.text);
        if (cells.length >= 3 && !/student.*number/i.test(cells.join(" ")))
          rows.push(cells);
      }
    }
    return rows;
  }
  return (await file.text())
    .split(/\r?\n/)
    .map((line) =>
      line.split(/,|\t/).map((x) => x.replace(/^"|"$/g, "").trim()),
    )
    .filter((r) => r.length >= 3 && !/student.*number/i.test(r.join(" ")));
}
const decodeXml = (v: string) =>
  v
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
